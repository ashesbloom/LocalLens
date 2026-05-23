"""
LocalLens — Scheduler Config Manager
======================================
CRUD operations for schedule configs in schedules.json.
Does NOT run any scheduling logic — that's the daemon's job.

The backend API endpoints use this to create/list/pause/delete schedules.
The scheduler_daemon.py reads schedules.json and does the actual work.

All timestamps are stored as UTC ISO-8601 strings.
"""
import os
import sys
import json
import uuid
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, List

logger = logging.getLogger(__name__)

def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()

def get_app_data_dir() -> Path:
    if sys.platform == 'win32':
        appdata_env = os.getenv('APPDATA')
        if not appdata_env:
            raise RuntimeError("APPDATA environment variable is not set on Windows.")
        app_data_path = Path(appdata_env) / 'LocalLens'
    else:
        app_data_path = Path.home() / '.config' / 'LocalLens'
    app_data_path.mkdir(parents=True, exist_ok=True)
    return app_data_path

SCHEDULES_FILE = get_app_data_dir() / "schedules.json"


class SchedulerConfigManager:
    """Manages schedule configurations. No runtime scheduling."""

    def __init__(self):
        self.schedules: Dict[str, dict] = {}
        self._load()

    # ── CRUD ───────────────────────────────────────────────────────────

    def create_schedule(self, config: dict) -> dict:
        """Create a new schedule config. The daemon will pick it up."""
        schedule_id = f"sched_{uuid.uuid4().hex[:8]}"

        mode = config.get("mode", "scheduled")
        if mode not in ("active", "scheduled"):
            mode = "scheduled"

        hours = config.get("interval_hours", 24)
        minutes = config.get("interval_minutes", 0)
        interval_td = timedelta(hours=hours, minutes=minutes)
        if interval_td.total_seconds() <= 0:
            hours, minutes = 24, 0
            interval_td = timedelta(hours=24)

        schedule = {
            "schedule_id": schedule_id,
            "mode": mode,
            "source_folder": config.get("source_folder"),
            "destination_folder": config.get("destination_folder"),
            "primary_sort": config.get("primary_sort", "Date"),
            "face_mode": config.get("face_mode", "balanced"),
            "maintain_hierarchy": config.get("maintain_hierarchy", True),
            "operation_mode": config.get("operation_mode", "copy"),
            "ignore_list": config.get("ignore_list", []),
            "interval_hours": hours,
            "interval_minutes": minutes,
            "debounce_seconds": config.get("debounce_seconds", 5),
            "status": "active",
            "created_at": _utcnow(),
            "last_run_at": None,
            "next_sweep_at": (datetime.now(timezone.utc) + interval_td).isoformat(),
            "files_organized_total": 0,
            "last_error": None,
            "consecutive_errors": 0,
            "run_history": []
        }

        self.schedules[schedule_id] = schedule
        self._save()
        return schedule

    def list_schedules(self) -> list:
        self._load()  # Re-read to get daemon's updates
        return list(self.schedules.values())

    def get_schedule(self, schedule_id: str) -> Optional[dict]:
        self._load()
        return self.schedules.get(schedule_id)

    def pause_schedule(self, schedule_id: str) -> Optional[dict]:
        self._load()
        sched = self.schedules.get(schedule_id)
        if not sched:
            return None
        sched["status"] = "paused"
        self._save()
        return sched

    def resume_schedule(self, schedule_id: str) -> Optional[dict]:
        self._load()
        sched = self.schedules.get(schedule_id)
        if not sched:
            return None
        sched["status"] = "active"
        sched["consecutive_errors"] = 0
        hours = sched.get("interval_hours", 24)
        minutes = sched.get("interval_minutes", 0)
        interval_td = timedelta(hours=hours, minutes=minutes)
        if interval_td.total_seconds() <= 0:
            interval_td = timedelta(hours=24)
        sched["next_sweep_at"] = (datetime.now(timezone.utc) + interval_td).isoformat()
        self._save()
        return sched

    def delete_schedule(self, schedule_id: str) -> bool:
        self._load()
        if schedule_id in self.schedules:
            del self.schedules[schedule_id]
            self._save()
            return True
        return False

    def trigger_now(self, schedule_id: str) -> dict:
        """Set a trigger flag — the daemon will pick it up."""
        self._load()
        sched = self.schedules.get(schedule_id)
        if not sched:
            raise ValueError(f"Schedule {schedule_id} not found")
        sched["trigger_pending"] = True
        self._save()
        return {"status": "trigger_queued", "message": "The daemon will execute this shortly."}

    # ── Persistence ────────────────────────────────────────────────────

    def _load(self):
        if SCHEDULES_FILE.exists():
            try:
                with open(SCHEDULES_FILE, 'r') as f:
                    self.schedules = json.load(f)
            except Exception as e:
                logger.error(f"Failed to load schedules: {e}")
                self.schedules = {}

    def _save(self):
        try:
            with open(SCHEDULES_FILE, 'w') as f:
                json.dump(self.schedules, f, indent=4)
        except Exception as e:
            logger.error(f"Failed to save schedules: {e}")


# Global singleton for API endpoints
scheduler_service = SchedulerConfigManager()
