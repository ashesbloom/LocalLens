"""
LocalLens — Passive Metadata Store
====================================
Collects per-photo metadata (dates, location, people) every time photos are
organized. This data feeds the Smart Album Suggestions engine.

Design Principles:
  1. No active scanning — metadata is captured passively via hook in organizer_logic.py
  2. SQLite single-file store — zero config, cross-platform
  3. WAL mode — concurrent reads during organization jobs
  4. Dedup by file_hash — same photo organized twice won't duplicate
  5. Self-optimizing — compaction, VACUUM, size cap
  6. Privacy-first — local only, user-deletable, paths purged on compaction

File Location: ~/.config/LocalLens/metadata_store.db
Permissions:   0o600 (owner read/write only)
"""

import os
import json
import logging
import sqlite3
import hashlib
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# ── Logger ──────────────────────────────────────────────────────────────────
_log = logging.getLogger("locallens.metadata_store")
if not _log.handlers:
    _h = logging.StreamHandler(sys.stderr)
    _h.setFormatter(logging.Formatter("[metadata_store] %(levelname)s: %(message)s"))
    _log.addHandler(_h)
    _log.setLevel(logging.INFO)
    _log.propagate = False

# ── Constants ─────────────────────────────────────────────────────────────
MAX_DB_SIZE_MB   = 50        # Trigger aggressive compaction above this
COMPACT_MONTHS   = 18        # Compact records older than N months (default)
AGGRESSIVE_MONTHS = 12       # Compact records older than N months (aggressive)
DB_FILENAME      = "metadata_store.db"


# ─────────────────────────────────────────────────────────────────────────────
#  Path helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_config_dir() -> Path:
    """Return the OS-appropriate LocalLens config directory."""
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home()))
    else:
        base = Path.home() / ".config"
    config_dir = base / "LocalLens"
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir


def _get_db_path() -> Path:
    return _get_config_dir() / DB_FILENAME


# ─────────────────────────────────────────────────────────────────────────────
#  Schema
# ─────────────────────────────────────────────────────────────────────────────

_SCHEMA_SQL = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Core photo metadata table ------------------------------------------------
CREATE TABLE IF NOT EXISTS photo_metadata (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    file_hash     TEXT    NOT NULL,           -- SHA-256 of first 8 KB (dedup key)
    original_path TEXT,
    dest_path     TEXT,
    date_taken    TEXT,                       -- ISO 8601
    year          INTEGER,
    month         INTEGER,
    day_of_week   INTEGER,                   -- 0=Mon … 6=Sun (Python weekday())
    time_of_day   TEXT,                      -- morning/afternoon/evening/night
    location_raw  TEXT,                      -- "IN/Uttar-Pradesh/Lucknow"
    country       TEXT,
    state         TEXT,
    city          TEXT,
    people        TEXT,                      -- JSON array: ["Mayank","Priya"]
    file_type     TEXT,
    file_size_kb  INTEGER,
    camera_model  TEXT,
    sort_type     TEXT,                      -- Date / Location / People / Hybrid
    recorded_at   TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(file_hash)                        -- Prevent duplicate entries
);

CREATE INDEX IF NOT EXISTS idx_meta_year_month ON photo_metadata(year, month);
CREATE INDEX IF NOT EXISTS idx_meta_city       ON photo_metadata(city);
CREATE INDEX IF NOT EXISTS idx_meta_people     ON photo_metadata(people);
CREATE INDEX IF NOT EXISTS idx_meta_recorded   ON photo_metadata(recorded_at);

-- Suggestion history (prevent repeats) ------------------------------------
CREATE TABLE IF NOT EXISTS suggestion_history (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    suggestion_key TEXT    NOT NULL,         -- Hash of suggestion criteria
    album_name     TEXT    NOT NULL,
    suggested_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    accepted       INTEGER DEFAULT 0        -- 1 if user created the album
);

-- User persona storage (survey answers + synthesized profile) --------------
CREATE TABLE IF NOT EXISTS user_persona (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,               -- JSON-encoded value
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Compaction audit log -----------------------------------------------------
CREATE TABLE IF NOT EXISTS compaction_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ran_at       TEXT NOT NULL DEFAULT (datetime('now')),
    rows_deleted INTEGER,
    threshold_months INTEGER
);
"""


# ─────────────────────────────────────────────────────────────────────────────
#  Utility helpers
# ─────────────────────────────────────────────────────────────────────────────

def _hash_file(path: str, read_bytes: int = 8192) -> str:
    """SHA-256 of the first `read_bytes` of a file. Fast enough for millions of photos."""
    h = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            h.update(f.read(read_bytes))
    except OSError:
        # Fall back to path-based hash if file can't be read
        h.update(path.encode())
    return h.hexdigest()


def _classify_time_of_day(hour: int) -> str:
    if 5 <= hour < 12:
        return "morning"
    elif 12 <= hour < 17:
        return "afternoon"
    elif 17 <= hour < 21:
        return "evening"
    else:
        return "night"


def _parse_location(location_raw: Optional[str]):
    """Split 'IN/Uttar-Pradesh/Lucknow' → (country, state, city). Returns Nones on failure."""
    if not location_raw:
        return None, None, None
    parts = location_raw.replace("-", " ").split("/")
    country = parts[0] if len(parts) > 0 else None
    state   = parts[1] if len(parts) > 1 else None
    city    = parts[2] if len(parts) > 2 else None
    return country, state, city


# ─────────────────────────────────────────────────────────────────────────────
#  MetadataStore class
# ─────────────────────────────────────────────────────────────────────────────

class MetadataStore:
    """
    Thread-safe SQLite-backed store for photo metadata.

    Usage (in organizer_logic.py):
        from metadata_store import metadata_store
        metadata_store.record_photo(
            original_path=src,
            destination_path=dst,
            date_taken=date_obj,
            location="IN/Uttar-Pradesh/Lucknow",
            people=["Mayank"],
            file_type=".jpg",
            file_size=os.path.getsize(src),
            sort_type="Date",
            camera_model="iPhone 14",
        )
    """

    def __init__(self):
        self._db_path = _get_db_path()
        self._init_db()
        self._maybe_compact_on_startup()

    # ── Initialization ──────────────────────────────────────────────────────

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path), timeout=10)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """Create tables, indexes, and set file permissions."""
        try:
            with self._connect() as conn:
                conn.executescript(_SCHEMA_SQL)
                conn.commit()
            # Owner-only permissions
            os.chmod(self._db_path, 0o600)
        except Exception as e:
            _log.error(f"Failed to initialize metadata store: {e}")

    def _maybe_compact_on_startup(self):
        """Run compaction check on startup (size cap or last-compaction > 30 days)."""
        try:
            db_size_mb = self._db_path.stat().st_size / (1024 * 1024)
            if db_size_mb > MAX_DB_SIZE_MB:
                _log.info(f"DB size {db_size_mb:.1f} MB exceeds cap — triggering aggressive compaction")
                self.compact_old_records(months_threshold=AGGRESSIVE_MONTHS)
                return

            # Check if compaction is due (> 30 days since last run)
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT ran_at FROM compaction_log ORDER BY id DESC LIMIT 1"
                ).fetchone()
            if row:
                last_ran = datetime.fromisoformat(row["ran_at"])
                days_since = (datetime.now(timezone.utc) - last_ran.replace(tzinfo=timezone.utc)).days
                if days_since >= 30:
                    _log.info(f"Compaction due ({days_since} days since last run) — running now")
                    self.compact_old_records(months_threshold=COMPACT_MONTHS)
        except Exception as e:
            _log.warning(f"Startup compaction check skipped: {e}")

    # ── Core: Record a photo ────────────────────────────────────────────────

    def record_photo(
        self,
        original_path: str,
        destination_path: str,
        date_taken: Optional[datetime] = None,
        location: Optional[str] = None,      # "IN/Uttar-Pradesh/Lucknow"
        people: Optional[List[str]] = None,  # ["Mayank", "Priya"]
        file_type: Optional[str] = None,     # ".jpg"
        file_size: Optional[int] = None,     # bytes
        sort_type: Optional[str] = None,     # "Date", "Location", etc.
        camera_model: Optional[str] = None,
        file_hash: Optional[str] = None,     # Pre-computed hash (optional)
    ) -> bool:
        """
        Record metadata for one organized photo.
        Returns True if inserted, False if already exists (dedup).
        """
        try:
            fhash = file_hash or _hash_file(original_path)
            country, state, city = _parse_location(location)

            year = month = day_of_week = time_of_day = date_iso = None
            if date_taken:
                year        = date_taken.year
                month       = date_taken.month
                day_of_week = date_taken.weekday()
                time_of_day = _classify_time_of_day(date_taken.hour)
                date_iso    = date_taken.isoformat()

            people_json = json.dumps(people or [])
            size_kb     = (file_size // 1024) if file_size else None

            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO photo_metadata
                        (file_hash, original_path, dest_path, date_taken,
                         year, month, day_of_week, time_of_day,
                         location_raw, country, state, city,
                         people, file_type, file_size_kb, camera_model, sort_type)
                    VALUES
                        (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    (fhash, original_path, destination_path, date_iso,
                     year, month, day_of_week, time_of_day,
                     location, country, state, city,
                     people_json, file_type, size_kb, camera_model, sort_type),
                )
                inserted = conn.execute("SELECT changes()").fetchone()[0]
                conn.commit()
            return inserted > 0
        except Exception as e:
            _log.error(f"record_photo failed for {original_path}: {e}")
            return False

    # ── Clustering query (for suggestion engine) ────────────────────────────

    def get_clusters(
        self,
        time_range_months: int = 24,
        min_cluster_size: int = 3,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Return natural photo clusters grouped by (year, month, city).
        Each cluster represents a potential album.
        """
        try:
            with self._connect() as conn:
                rows = conn.execute(
                    """
                    SELECT
                        year, month, city, country, state,
                        COUNT(*)                          AS photo_count,
                        MIN(date_taken)                   AS first_photo,
                        MAX(date_taken)                   AS last_photo,
                        GROUP_CONCAT(DISTINCT people)     AS all_people_json,
                        GROUP_CONCAT(DISTINCT sort_type)  AS sort_types
                    FROM photo_metadata
                    WHERE recorded_at > datetime('now', ?)
                      AND (year IS NOT NULL OR city IS NOT NULL)
                    GROUP BY year, month, city
                    HAVING photo_count >= ?
                    ORDER BY photo_count DESC
                    LIMIT ?
                    """,
                    (f"-{time_range_months} months", min_cluster_size, limit),
                ).fetchall()

            clusters = []
            for row in rows:
                # Merge all people arrays from concatenated JSON strings
                people_set = set()
                if row["all_people_json"]:
                    for chunk in row["all_people_json"].split(","):
                        chunk = chunk.strip()
                        try:
                            people_set.update(json.loads(chunk))
                        except (json.JSONDecodeError, ValueError):
                            pass

                clusters.append({
                    "year":        row["year"],
                    "month":       row["month"],
                    "city":        row["city"],
                    "country":     row["country"],
                    "state":       row["state"],
                    "photo_count": row["photo_count"],
                    "first_photo": row["first_photo"],
                    "last_photo":  row["last_photo"],
                    "people":      sorted(people_set),
                    "sort_types":  row["sort_types"],
                })
            return clusters
        except Exception as e:
            _log.error(f"get_clusters failed: {e}")
            return []

    # ── Suggestion history ──────────────────────────────────────────────────

    def record_suggestion(self, suggestion_key: str, album_name: str) -> None:
        """Log a suggestion to prevent future repeats."""
        try:
            with self._connect() as conn:
                conn.execute(
                    "INSERT OR IGNORE INTO suggestion_history (suggestion_key, album_name) VALUES (?,?)",
                    (suggestion_key, album_name),
                )
                conn.commit()
        except Exception as e:
            _log.error(f"record_suggestion failed: {e}")

    def mark_suggestion_accepted(self, suggestion_key: str) -> None:
        """Mark that the user actually created this album."""
        try:
            with self._connect() as conn:
                conn.execute(
                    "UPDATE suggestion_history SET accepted=1 WHERE suggestion_key=?",
                    (suggestion_key,),
                )
                conn.commit()
        except Exception as e:
            _log.error(f"mark_suggestion_accepted failed: {e}")

    def get_suggestion_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Return recent suggestion history for dedup filtering."""
        try:
            with self._connect() as conn:
                rows = conn.execute(
                    "SELECT suggestion_key, album_name, suggested_at, accepted "
                    "FROM suggestion_history ORDER BY suggested_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return [dict(row) for row in rows]
        except Exception as e:
            _log.error(f"get_suggestion_history failed: {e}")
            return []

    # ── Statistics ──────────────────────────────────────────────────────────

    def get_stats(self) -> Dict[str, Any]:
        """Return store health stats: row count, DB size, last compaction."""
        try:
            db_path = _get_db_path()
            size_mb = db_path.stat().st_size / (1024 * 1024) if db_path.exists() else 0

            with self._connect() as conn:
                photo_count = conn.execute(
                    "SELECT COUNT(*) FROM photo_metadata"
                ).fetchone()[0]
                suggestion_count = conn.execute(
                    "SELECT COUNT(*) FROM suggestion_history"
                ).fetchone()[0]
                last_compaction_row = conn.execute(
                    "SELECT ran_at, rows_deleted FROM compaction_log ORDER BY id DESC LIMIT 1"
                ).fetchone()

            return {
                "photo_count":      photo_count,
                "suggestion_count": suggestion_count,
                "db_size_mb":       round(size_mb, 2),
                "db_path":          str(db_path),
                "last_compaction":  dict(last_compaction_row) if last_compaction_row else None,
            }
        except Exception as e:
            _log.error(f"get_stats failed: {e}")
            return {"error": str(e)}

    # ── Self-optimization: Compaction ───────────────────────────────────────

    def compact_old_records(self, months_threshold: int = COMPACT_MONTHS) -> Dict[str, Any]:
        """
        Compact records older than `months_threshold` months.
        - Replaces original_path / dest_path with 'compacted' (PII removal)
        - Deletes rows where date/location/people are all NULL (useless for clustering)
        - Runs VACUUM to reclaim disk space
        - Logs the operation
        """
        try:
            with self._connect() as conn:
                # Step 1: Anonymize paths in old records (keep clustering data)
                conn.execute(
                    """
                    UPDATE photo_metadata
                    SET original_path = 'compacted',
                        dest_path     = 'compacted'
                    WHERE recorded_at < datetime('now', ?)
                      AND original_path != 'compacted'
                    """,
                    (f"-{months_threshold} months",),
                )

                # Step 2: Delete entirely useless old rows (no clustering value)
                result = conn.execute(
                    """
                    DELETE FROM photo_metadata
                    WHERE recorded_at < datetime('now', ?)
                      AND year   IS NULL
                      AND city   IS NULL
                      AND people = '[]'
                    """,
                    (f"-{months_threshold} months",),
                )
                rows_deleted = result.rowcount

                # Step 3: Log the compaction
                conn.execute(
                    "INSERT INTO compaction_log (rows_deleted, threshold_months) VALUES (?,?)",
                    (rows_deleted, months_threshold),
                )
                conn.commit()

            # Step 4: VACUUM outside transaction to reclaim space
            with self._connect() as conn:
                conn.execute("VACUUM")

            _log.info(f"Compaction complete: {rows_deleted} rows deleted (threshold: {months_threshold} months)")
            return {
                "status":           "compacted",
                "rows_deleted":     rows_deleted,
                "threshold_months": months_threshold,
            }
        except Exception as e:
            _log.error(f"compact_old_records failed: {e}")
            return {"error": str(e)}

    # ── Privacy: Full purge ─────────────────────────────────────────────────

    def purge_all(self) -> Dict[str, Any]:
        """
        Wipe ALL data from the store. Called from privacy settings.
        Deletes rows in all tables. Does NOT delete the DB file itself
        (to preserve WAL mode settings).
        """
        try:
            with self._connect() as conn:
                photo_count = conn.execute(
                    "SELECT COUNT(*) FROM photo_metadata"
                ).fetchone()[0]
                conn.execute("DELETE FROM photo_metadata")
                conn.execute("DELETE FROM suggestion_history")
                conn.execute("DELETE FROM compaction_log")
                conn.commit()

            with self._connect() as conn:
                conn.execute("VACUUM")

            _log.info(f"Privacy purge complete: {photo_count} photo records deleted")
            return {
                "status":         "purged",
                "records_deleted": photo_count,
                "message":        "All photo metadata, suggestion history, and compaction logs have been deleted.",
            }
        except Exception as e:
            _log.error(f"purge_all failed: {e}")
            return {"error": str(e)}

    def purge_persona(self) -> Dict[str, Any]:
        """Wipe ONLY the persona/survey data."""
        try:
            with self._connect() as conn:
                count = conn.execute("SELECT COUNT(*) FROM user_persona").fetchone()[0]
                conn.execute("DELETE FROM user_persona")
                conn.commit()
            return {"status": "persona_reset", "records_deleted": count}
        except Exception as e:
            _log.error(f"purge_persona failed: {e}")
            return {"error": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
#  Module-level singleton
# ─────────────────────────────────────────────────────────────────────────────

metadata_store = MetadataStore()
