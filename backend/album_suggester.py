"""
LocalLens — Smart Album Suggestion Engine
==========================================
Generates personalized album suggestions by combining:
  1. Photo clusters from the passive metadata store
  2. The user's persona profile from the persona manager
  3. An LLM (or template fallback) for emotionally resonant naming

This is Pillar 3 of the Smart Album Suggestions architecture.

Pipeline:
  metadata_store.get_clusters() → filter against history → build LLM prompt
  → parse suggestions → record in history → return album cards

The engine is intentionally LLM-agnostic: pass any callable(prompt) → str.
If no LLM is provided, falls back to rule-based template naming.
"""

import hashlib
import json
import logging
import sys
from calendar import month_name
from typing import Any, Callable, Dict, List, Optional

# ── Logger ───────────────────────────────────────────────────────────────────
_log = logging.getLogger("locallens.album_suggester")
if not _log.handlers:
    _h = logging.StreamHandler(sys.stderr)
    _h.setFormatter(logging.Formatter("[album_suggester] %(levelname)s: %(message)s"))
    _log.addHandler(_h)
    _log.setLevel(logging.INFO)
    _log.propagate = False


# ─────────────────────────────────────────────────────────────────────────────
#  LLM Suggestion Prompt
# ─────────────────────────────────────────────────────────────────────────────

_SUGGESTION_PROMPT = """
You are a personal photo album curator.

PERSONA CONTEXT (know this person):
{persona_json}

PHOTO CLUSTERS (groups of organized photos from their library):
{clusters_json}

ALREADY SUGGESTED (do NOT repeat these album names):
{history_list}

Generate {max_suggestions} album suggestions. For each suggestion output a JSON object with:
  - album_name: A personal, emotionally resonant name (NOT just "Photos from March 2024")
  - description: 1 sentence explaining why this album matters to them personally
  - emoji: One fitting emoji (single character)
  - cluster_key: The cluster identifier (format: "year-month-city" or just what's available)
  - photo_count: Estimated photo count from the cluster data
  - why_personal: One-liner on what makes this name meaningful for this specific person

Use their interests, relationships, hometown, and life context to make names deeply personal.

BAD examples:  "January 2024 Photos", "12 photos in Lucknow"
GOOD examples: "Guitar Sessions — College Days 🎸", "Back to Lucknow — Winter Break ❄️", "Mom's Birthday Celebrations 🎂"

Output ONLY a JSON array of objects. No markdown, no code fences.
"""

# ─────────────────────────────────────────────────────────────────────────────
#  Fallback Template Engine
# ─────────────────────────────────────────────────────────────────────────────

def _season(month: Optional[int]) -> str:
    """Map month number to season name (Northern Hemisphere approximate)."""
    if month is None:
        return ""
    if month in (3, 4, 5):
        return "Spring"
    elif month in (6, 7, 8):
        return "Summer"
    elif month in (9, 10, 11):
        return "Autumn"
    else:
        return "Winter"


def _month_name_str(month: Optional[int]) -> str:
    """Return month name from number (1-12)."""
    if month and 1 <= month <= 12:
        return month_name[month]
    return ""


def _format_people(people: List[str], persona: Optional[Dict]) -> str:
    """Format people list into a friendly string."""
    if not people:
        return "Friends"
    if len(people) == 1:
        return people[0]
    if len(people) == 2:
        return f"{people[0]} & {people[1]}"
    return f"{people[0]}, {people[1]} & others"


def _matches_birthday(cluster: Dict, persona: Optional[Dict]) -> bool:
    """Check if cluster month matches a known birthday."""
    if not persona or not cluster.get("month"):
        return False
    raw = persona.get("raw_answers", {})
    special_dates_text = raw.get("special_dates", "")
    if not special_dates_text:
        return False
    # Simple heuristic: look for month name in the special dates text
    cluster_month = _month_name_str(cluster.get("month", 0))
    return cluster_month.lower() in str(special_dates_text).lower()


def _generate_fallback_name(cluster: Dict, persona: Optional[Dict]) -> Dict[str, str]:
    """
    Rule-based album name generation when no LLM is available.
    Returns {"album_name": ..., "description": ..., "emoji": ...}
    """
    year   = cluster.get("year")
    month  = cluster.get("month")
    city   = cluster.get("city")
    people = cluster.get("people", [])
    count  = cluster.get("photo_count", 0)

    raw_answers = (persona or {}).get("raw_answers", {})
    hometown     = raw_answers.get("hometown", "")
    current_city = raw_answers.get("current_city", "")

    month_str  = _month_name_str(month)
    season_str = _season(month)
    year_str   = str(year) if year else ""

    # ── Rule 1: Hometown visit (city matches hometown, not current city)
    if city and hometown and city.lower() == hometown.lower() and city.lower() != (current_city or "").lower():
        return {
            "album_name":  f"Back to {city} — {season_str} {year_str}".strip(),
            "description": f"{count} photos from your hometown visit in {month_str} {year_str}.",
            "emoji":       "🏡",
        }

    # ── Rule 2: Birthday match
    if _matches_birthday(cluster, persona):
        subject = _format_people(people, persona) if people else "Special"
        return {
            "album_name":  f"{subject}'s Birthday {year_str}".strip(),
            "description": f"{count} birthday photos from {month_str} {year_str}.",
            "emoji":       "🎂",
        }

    # ── Rule 3: Trip (city is known, not hometown, not current city)
    if city and city.lower() not in [(hometown or "").lower(), (current_city or "").lower()]:
        time_part = f"{month_str} {year_str}".strip()
        return {
            "album_name":  f"Trip to {city} ({time_part})" if time_part else f"Trip to {city}",
            "description": f"{count} photos from your trip to {city}.",
            "emoji":       "✈️",
        }

    # ── Rule 4: People-based
    if people:
        people_str = _format_people(people, persona)
        time_part  = f"{month_str} {year_str}".strip()
        return {
            "album_name":  f"Moments with {people_str}" + (f" — {time_part}" if time_part else ""),
            "description": f"{count} photos with {people_str}.",
            "emoji":       "👥",
        }

    # ── Rule 5: Default — seasonal + location
    parts = []
    if month_str and year_str:
        parts.append(f"{month_str} {year_str}")
    elif year_str:
        parts.append(year_str)
    if city:
        parts.append(city)

    name = " — ".join(parts) if parts else "Memories"
    return {
        "album_name":  name,
        "description": f"{count} photos from this period.",
        "emoji":       "📸",
    }


# ─────────────────────────────────────────────────────────────────────────────
#  Cluster key builder (for dedup hashing)
# ─────────────────────────────────────────────────────────────────────────────

def _cluster_key(cluster: Dict) -> str:
    """Stable string key for a cluster — used for suggestion dedup."""
    parts = [
        str(cluster.get("year", "")),
        str(cluster.get("month", "")),
        (cluster.get("city") or "").lower(),
    ]
    return "-".join(parts)


def _suggestion_hash(album_name: str) -> str:
    """Hash of album name for dedup against suggestion_history."""
    return hashlib.sha256(album_name.lower().encode()).hexdigest()[:16]


# ─────────────────────────────────────────────────────────────────────────────
#  AlbumSuggester class
# ─────────────────────────────────────────────────────────────────────────────

class AlbumSuggester:
    """
    Generates personalized Smart Album Suggestions.

    Usage:
        from album_suggester import album_suggester
        result = album_suggester.generate_suggestions(
            max_suggestions=8,
            time_range_months=24,
            include_persona_context=True,
            llm_client=None,   # pass callable(prompt)->str for LLM mode
        )
    """

    def _get_store(self):
        from metadata_store import metadata_store
        return metadata_store

    def _get_persona_manager(self):
        from persona_manager import persona_manager
        return persona_manager

    # ── Main entry point ──────────────────────────────────────────────────────

    def generate_suggestions(
        self,
        max_suggestions: int = 8,
        time_range_months: int = 24,
        include_persona_context: bool = True,
        llm_client: Optional[Callable[[str], str]] = None,
    ) -> Dict[str, Any]:
        """
        Generate personalized album suggestions.

        Args:
            max_suggestions: Max number of album ideas to return (default: 8)
            time_range_months: How far back to look in photo history (default: 24)
            include_persona_context: Use persona for personalization (default: True)
            llm_client: Optional callable(prompt: str) -> str for LLM naming

        Returns:
            {
                "suggestions": [...album cards...],
                "total_clusters_found": N,
                "persona_available": bool,
                "mode": "llm" | "template",
                "needs_survey": bool,
                "needs_more_photos": bool,
            }
        """
        store          = self._get_store()
        persona_mgr    = self._get_persona_manager()

        # ── 1. Get photo clusters from metadata store
        clusters = store.get_clusters(
            time_range_months=time_range_months,
            min_cluster_size=3,
            limit=50,
        )

        if not clusters:
            return {
                "suggestions":           [],
                "total_clusters_found":  0,
                "persona_available":     False,
                "mode":                  "none",
                "needs_more_photos":     True,
                "needs_survey":          not persona_mgr.has_persona(),
                "message": (
                    "Not enough photo history yet. Organize some photos first — "
                    "the suggestion engine learns from your organized library automatically."
                ),
            }

        # ── 2. Load persona
        persona = None
        has_persona = False
        if include_persona_context:
            persona = persona_mgr.get_persona()
            has_persona = persona is not None

        # ── 3. Load suggestion history for dedup
        history = store.get_suggestion_history(limit=200)
        already_suggested_names = {h["album_name"].lower() for h in history}
        already_suggested_keys  = {h["suggestion_key"] for h in history}

        # ── 4. Filter clusters not already suggested
        new_clusters = [
            c for c in clusters
            if _suggestion_hash(_generate_fallback_name(c, persona)["album_name"])
            not in already_suggested_keys
        ]

        # If all clusters were already suggested, reset and suggest again
        if not new_clusters:
            new_clusters = clusters
            _log.info("All clusters already suggested — resetting suggestion pool")

        # ── 5. Generate suggestions
        suggestions = []
        mode = "template"

        if llm_client and has_persona:
            # LLM mode: send persona + clusters to the model
            suggestions = self._generate_llm_suggestions(
                clusters=new_clusters[:20],  # limit context window
                persona=persona,
                history_names=list(already_suggested_names)[:30],
                max_suggestions=max_suggestions,
                llm_client=llm_client,
            )
            if suggestions:
                mode = "llm"

        # Fallback to template if LLM failed or wasn't provided
        if not suggestions:
            suggestions = self._generate_template_suggestions(
                clusters=new_clusters,
                persona=persona,
                already_suggested_keys=already_suggested_keys,
                max_suggestions=max_suggestions,
            )
            mode = "template"

        # ── 6. Record suggestions in history
        for suggestion in suggestions:
            key = _suggestion_hash(suggestion["album_name"])
            store.record_suggestion(key, suggestion["album_name"])
            suggestion["suggestion_key"] = key

        _log.info(f"Generated {len(suggestions)} suggestions (mode={mode})")

        return {
            "suggestions":          suggestions,
            "total_clusters_found": len(clusters),
            "persona_available":    has_persona,
            "mode":                 mode,
            "needs_survey":         not has_persona,
            "needs_more_photos":    False,
            "survey_prompt": (
                "💡 Take the persona survey for more personalized album names! "
                "Use the /api/persona/survey endpoint to get started."
            ) if not has_persona else None,
        }

    # ── LLM suggestion generation ─────────────────────────────────────────────

    def _generate_llm_suggestions(
        self,
        clusters: List[Dict],
        persona: Dict,
        history_names: List[str],
        max_suggestions: int,
        llm_client: Callable[[str], str],
    ) -> List[Dict[str, Any]]:
        """Call the LLM to generate suggestions. Returns [] on any failure."""
        try:
            prompt = _SUGGESTION_PROMPT.format(
                persona_json=json.dumps(persona, indent=2, ensure_ascii=False),
                clusters_json=json.dumps(clusters, indent=2, ensure_ascii=False),
                history_list=json.dumps(history_names, ensure_ascii=False),
                max_suggestions=max_suggestions,
            )

            response_text = llm_client(prompt)

            # Strip markdown code fences if the model adds them
            cleaned = response_text.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("```")[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
                cleaned = cleaned.strip()

            raw_suggestions = json.loads(cleaned)

            # Normalize and validate each suggestion
            validated = []
            for s in raw_suggestions[:max_suggestions]:
                if not isinstance(s, dict) or not s.get("album_name"):
                    continue
                validated.append({
                    "album_name":    str(s.get("album_name", "")).strip(),
                    "description":   str(s.get("description", "")).strip(),
                    "emoji":         str(s.get("emoji", "📸")).strip()[:2],
                    "cluster_key":   str(s.get("cluster_key", "")),
                    "photo_count":   int(s.get("photo_count", 0)),
                    "why_personal":  str(s.get("why_personal", "")).strip(),
                    "generated_by":  "llm",
                })
            return validated

        except Exception as e:
            _log.warning(f"LLM suggestion generation failed: {e}")
            return []

    # ── Template suggestion generation ────────────────────────────────────────

    def _generate_template_suggestions(
        self,
        clusters: List[Dict],
        persona: Optional[Dict],
        already_suggested_keys: set,
        max_suggestions: int,
    ) -> List[Dict[str, Any]]:
        """Generate album suggestions using rule-based templates."""
        suggestions = []

        for cluster in clusters:
            if len(suggestions) >= max_suggestions:
                break

            named = _generate_fallback_name(cluster, persona)
            key   = _suggestion_hash(named["album_name"])

            # Skip if already suggested
            if key in already_suggested_keys:
                continue

            suggestions.append({
                "album_name":   named["album_name"],
                "description":  named["description"],
                "emoji":        named["emoji"],
                "cluster_key":  _cluster_key(cluster),
                "photo_count":  cluster.get("photo_count", 0),
                "why_personal": "",
                "generated_by": "template",
                # Include cluster data for the create-album API
                "cluster_criteria": {
                    "year":   cluster.get("year"),
                    "month":  cluster.get("month"),
                    "city":   cluster.get("city"),
                    "people": cluster.get("people", []),
                },
            })

        return suggestions

    # ── Accept album (user created it) ────────────────────────────────────────

    def mark_accepted(self, suggestion_key: str) -> Dict[str, Any]:
        """Mark that the user actually created an album from this suggestion."""
        self._get_store().mark_suggestion_accepted(suggestion_key)
        return {"status": "accepted", "suggestion_key": suggestion_key}

    # ── Needs-survey check ────────────────────────────────────────────────────

    def needs_survey(self) -> bool:
        """Returns True if the user hasn't taken the persona survey yet."""
        return not self._get_persona_manager().has_persona()


# ─────────────────────────────────────────────────────────────────────────────
#  Module-level singleton
# ─────────────────────────────────────────────────────────────────────────────

album_suggester = AlbumSuggester()
