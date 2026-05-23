"""
LocalLens — User Persona Manager
==================================
Manages the user's persona profile used for Smart Album Suggestions.

The persona is built from a conversational survey (5 sections, ~15 questions).
Answers are stored locally in SQLite. An LLM synthesizes a rich personality
profile to power emotionally resonant album name generation.

Survey Flow:
  1. User enables Smart Album Suggestions (first time)
  2. get_survey_questions() returns the question list for the chat UI
  3. LLM collects answers conversationally
  4. submit_survey(answers_dict) stores + synthesizes the persona
  5. get_persona() returns the full profile for the suggestion engine

Storage: SQLite user_persona table (in metadata_store.db)
         Key-value pairs: key → JSON-encoded value
"""

import json
import logging
import sys
from typing import Any, Dict, List, Optional

# ── Cloud LLM providers that send data off-device ─────────────────────────────
# Any llm_mode matching one of these values triggers the consent gate.
CLOUD_LLM_PROVIDERS = {"groq", "gemini", "openrouter", "openai", "anthropic", "claude"}

# Friendly names for UI display
_PROVIDER_NAMES = {
    "groq":       "Groq",
    "gemini":     "Google Gemini",
    "openrouter": "OpenRouter",
    "openai":     "OpenAI",
    "anthropic":  "Anthropic",
    "claude":     "Anthropic Claude",
}

# Consent key stored in SQLite — tracks whether user granted cloud consent
_CLOUD_CONSENT_KEY = "cloud_persona_consent"


# ── Logger ───────────────────────────────────────────────────────────────────
_log = logging.getLogger("locallens.persona_manager")
if not _log.handlers:
    _h = logging.StreamHandler(sys.stderr)
    _h.setFormatter(logging.Formatter("[persona_manager] %(levelname)s: %(message)s"))
    _log.addHandler(_h)
    _log.setLevel(logging.INFO)
    _log.propagate = False


# ─────────────────────────────────────────────────────────────────────────────
#  Survey definition
# ─────────────────────────────────────────────────────────────────────────────

SURVEY_SECTIONS = [
    {
        "section": 1,
        "title": "Life & Identity",
        "description": "Helps understand your life stage and where you call home.",
        "questions": [
            {
                "key": "life_stage",
                "question": "What stage of life are you in right now?",
                "hint": "e.g. Student, Working professional, Parent, Retired, etc.",
                "type": "text",
                "unlocks": "Life-stage aware suggestions (College Days, First Job)",
            },
            {
                "key": "hometown",
                "question": "Where's your hometown — the place you grew up in or consider home?",
                "hint": "City or town name is enough.",
                "type": "text",
                "unlocks": "Hometown nostalgia albums (Back to [hometown])",
            },
            {
                "key": "current_city",
                "question": "What city or area do you currently live in?",
                "hint": "This helps us tell apart daily life from trips.",
                "type": "text",
                "unlocks": "Trip detection vs daily-life separation",
            },
        ],
    },
    {
        "section": 2,
        "title": "People & Relationships",
        "description": "Helps create albums around the people who matter most to you.",
        "questions": [
            {
                "key": "important_people",
                "question": "Who are the important people in your life? (just first names, separated by commas)",
                "hint": "Family, partner, close friends — e.g. Mom, Raj, Priya",
                "type": "list",
                "unlocks": "Relationship-aware album names (Mom's Birthday, Date Night)",
            },
            {
                "key": "relationships",
                "question": "For each person above, what's their relationship to you?",
                "hint": "e.g. Mom=mother, Raj=best friend, Priya=partner",
                "type": "mapping",
                "unlocks": "Deep relationship context for album naming",
            },
            {
                "key": "pets",
                "question": "Any pets? (name and type, or skip if none)",
                "hint": "e.g. Bruno (dog), Mittens (cat)",
                "type": "text",
                "unlocks": "Pet-themed albums",
            },
        ],
    },
    {
        "section": 3,
        "title": "Interests & Hobbies",
        "description": "Helps create activity-based albums from your interests.",
        "questions": [
            {
                "key": "interests",
                "question": "What do you do for fun or what are your hobbies?",
                "hint": "e.g. music, hiking, cricket, cooking, photography, gaming, art",
                "type": "list",
                "unlocks": "Activity-based albums (Guitar Sessions, Hiking Adventures)",
            },
            {
                "key": "sports",
                "question": "Any sports you play or closely follow?",
                "hint": "e.g. cricket, football, badminton — or skip if none",
                "type": "list",
                "unlocks": "Sports event detection",
            },
            {
                "key": "instruments",
                "question": "Do you play any musical instruments?",
                "hint": "e.g. guitar, piano, tabla — or skip if none",
                "type": "list",
                "unlocks": "Music session albums",
            },
        ],
    },
    {
        "section": 4,
        "title": "Food & Lifestyle",
        "description": "Helps categorize food photos and understand your travel style.",
        "questions": [
            {
                "key": "favorite_cuisines",
                "question": "What types of food or cuisine do you love most?",
                "hint": "e.g. Italian, Indian street food, South Indian, Thai",
                "type": "list",
                "unlocks": "Food photo categorization (Italian Cooking, Street Food Adventures)",
            },
            {
                "key": "cooking_style",
                "question": "Do you mostly cook at home, eat out, or both?",
                "hint": "home_cook / eat_out / both",
                "type": "text",
                "unlocks": "Context for food photos (cooking session vs restaurant visit)",
            },
            {
                "key": "travel_style",
                "question": "How would you describe your travel style?",
                "hint": "e.g. frequent traveler, occasional trips, mostly a homebody",
                "type": "text",
                "unlocks": "Trip detection vs daily-life separation",
            },
        ],
    },
    {
        "section": 5,
        "title": "Special Dates & Traditions",
        "description": "Helps create albums around meaningful recurring events.",
        "questions": [
            {
                "key": "special_dates",
                "question": "Any important recurring dates? (birthdays, anniversaries — month is enough)",
                "hint": "e.g. Mom's Birthday in March, Anniversary in August",
                "type": "text",
                "unlocks": "Date-matched albums (Mom's Birthday 2024)",
            },
            {
                "key": "festivals",
                "question": "Which festivals or holidays do you celebrate?",
                "hint": "e.g. Diwali, Holi, Christmas, Eid, Navratri",
                "type": "list",
                "unlocks": "Festival/holiday albums (Diwali Celebrations, Christmas)",
            },
            {
                "key": "traditions",
                "question": "Any annual traditions or recurring events?",
                "hint": "e.g. Annual Goa trip in December, Sunday cooking sessions",
                "type": "list",
                "unlocks": "Recurring event detection",
            },
        ],
    },
]

# Flat list of all question keys (for validation)
ALL_QUESTION_KEYS = {
    q["key"]
    for section in SURVEY_SECTIONS
    for q in section["questions"]
}


# ─────────────────────────────────────────────────────────────────────────────
#  LLM Persona Synthesis Prompt
# ─────────────────────────────────────────────────────────────────────────────

_SYNTHESIS_PROMPT_TEMPLATE = """
You are building a persona profile for a photo album suggestion system.

Given these survey answers, create a rich personality profile that will help
generate emotionally resonant, personally meaningful album suggestions.

Focus on:
- What moments in life would this person want to relive?
- What recurring patterns might appear in their photos?
- What emotional themes resonate with their life stage?
- What naming style would feel personal, not generic?

Survey answers:
{raw_answers}

Output a JSON object (no markdown, no code blocks) with EXACTLY these fields:
{{
  "identity_summary": "1-2 sentence description of this person",
  "nostalgia_triggers": ["list of themes that would evoke memories"],
  "likely_photo_patterns": ["list of recurring photo situations"],
  "naming_preferences": "style guide for album names (e.g. casual, nostalgic, emoji-friendly)",
  "seasonal_patterns": {{
    "spring": "what they likely do",
    "summer": "what they likely do",
    "autumn": "what they likely do",
    "winter": "what they likely do"
  }}
}}
"""


# ─────────────────────────────────────────────────────────────────────────────
#  PersonaManager class
# ─────────────────────────────────────────────────────────────────────────────

class PersonaManager:
    """
    Manages the user's persona profile stored in the metadata_store SQLite DB.

    Depends on the shared metadata_store singleton for database access.
    Does NOT import metadata_store at module level to avoid circular imports.
    Instead, uses _get_store() which lazily imports it.
    """

    def _get_store(self):
        """Lazily import metadata_store to avoid circular imports."""
        from metadata_store import metadata_store
        return metadata_store

    # ── DB helpers ────────────────────────────────────────────────────────────

    def _get_conn(self):
        store = self._get_store()
        return store._connect()

    def _set_key(self, key: str, value: Any) -> None:
        """Store a key-value pair (value JSON-encoded) in user_persona table."""
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO user_persona (key, value, updated_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = excluded.updated_at
                """,
                (key, json.dumps(value)),
            )
            conn.commit()

    def _get_key(self, key: str, default=None) -> Any:
        """Retrieve and JSON-decode a value from user_persona table."""
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT value FROM user_persona WHERE key=?", (key,)
            ).fetchone()
        if row:
            try:
                return json.loads(row["value"])
            except (json.JSONDecodeError, TypeError):
                return row["value"]
        return default

    # ── Survey API ────────────────────────────────────────────────────────────

    def get_survey_questions(self) -> Dict[str, Any]:
        """
        Return the full survey structure for the chat UI to present.
        Also includes a flag indicating if a persona already exists.
        """
        has_persona = self._get_key("synthesized_persona") is not None
        raw_answers = self._get_key("raw_answers", {})
        return {
            "sections":       SURVEY_SECTIONS,
            "total_sections": len(SURVEY_SECTIONS),
            "total_questions": len(ALL_QUESTION_KEYS),
            "has_existing_persona": has_persona,
            "existing_answers": raw_answers,
            "privacy_note": (
                "🔒 Your answers are stored only on your computer at "
                "~/.config/LocalLens/metadata_store.db. "
                "They never leave your machine (unless you opt into cloud AI)."
            ),
        }

    def submit_survey(
        self,
        answers: Dict[str, Any],
        llm_synthesize: bool = False,
        llm_client=None,
        llm_mode: str = "ollama",
        consent_confirmed: bool = False,
    ) -> Dict[str, Any]:
        """
        Store survey answers and optionally synthesize a persona via LLM.

        Args:
            answers:           Dict of {question_key: answer_value}
            llm_synthesize:    If True, attempt LLM-based synthesis
            llm_client:        Callable(prompt: str) -> str for LLM call
            llm_mode:          Which LLM backend is active ("ollama", "groq", "gemini", etc.)
            consent_confirmed: Set True when user has explicitly agreed to send
                               their survey data to a cloud provider

        Privacy Rule:
            If llm_mode is a cloud provider (Groq, Gemini, etc.) AND consent_confirmed
            is False, this method returns a requires_consent block instead of
            synthesizing. No data is sent until the user explicitly agrees.
            Ollama (local) never requires consent.

        Returns:
            On success:  {"status": "saved", "persona_synthesized": bool, "profile": {...}}
            On consent:  {"status": "requires_consent", "consent_message": str, ...}
        """
        # ── Step 1: Cloud consent gate ────────────────────────────────────────
        normalized_mode = llm_mode.lower().strip()
        is_cloud = normalized_mode in CLOUD_LLM_PROVIDERS

        if llm_synthesize and is_cloud and not consent_confirmed:
            provider_name = _PROVIDER_NAMES.get(normalized_mode, llm_mode.capitalize())
            _log.info(
                f"Cloud LLM consent required for persona synthesis via {provider_name}. "
                "Returning consent gate — no data sent."
            )
            return {
                "status": "requires_consent",
                "provider": provider_name,
                "consent_message": (
                    f"⚠️ You're using {provider_name} (a cloud AI provider).\n\n"
                    "To personalise your album suggestions, your survey answers "
                    "(interests, important people's names, hometown) would be sent "
                    f"to {provider_name}'s servers.\n\n"
                    "📸 Your photos and file paths are NEVER sent — only your text answers.\n\n"
                    "Choose:\n"
                    "  ✅  Allow once — Send survey data to cloud AI for richer suggestions\n"
                    "  🔒  Keep local — Use offline template suggestions (still great!)\n"
                    "  🤖  Switch to Ollama — Use a local AI model (best of both worlds)"
                ),
                "how_to_proceed": (
                    "To allow: resubmit with consent_confirmed=true. "
                    "To stay local: resubmit with llm_synthesize=false."
                ),
            }

        # ── Step 2: Save answers (always, regardless of LLM choice) ──────────
        # Validate and sanitize — only keep known survey keys
        clean_answers = {k: v for k, v in answers.items() if k in ALL_QUESTION_KEYS}

        # Merge with existing answers (update, don't overwrite)
        existing = self._get_key("raw_answers", {})
        existing.update(clean_answers)
        self._set_key("raw_answers", existing)

        # ── Step 3: Synthesize persona ────────────────────────────────────────
        synthesized = False
        profile = None

        if llm_synthesize and llm_client and existing:
            # Cloud with consent OR local (Ollama) — proceed with LLM synthesis
            if is_cloud and consent_confirmed:
                _log.info(f"User consented to cloud persona synthesis via {provider_name}.")
                # Record that consent was given (avoids asking every time)
                self._set_key(_CLOUD_CONSENT_KEY, {"provider": normalized_mode, "consented": True})
            profile = self._synthesize_persona(existing, llm_client)
            if profile:
                self._set_key("synthesized_persona", profile)
                synthesized = True

        if not synthesized and existing:
            # Template fallback: always works offline, no consent needed
            profile = self._build_template_persona(existing)
            self._set_key("synthesized_persona", profile)
            synthesized = True

        _log.info(f"Survey submitted: {len(clean_answers)} answers, synthesized={synthesized}, mode={llm_mode}")
        return {
            "status":              "saved",
            "answers_saved":       len(existing),
            "persona_synthesized": synthesized,
            "synthesized_via":     llm_mode if (llm_synthesize and synthesized) else "template",
            "profile":             profile,
        }

    # ── Persona retrieval ─────────────────────────────────────────────────────

    def get_persona(self) -> Optional[Dict[str, Any]]:
        """
        Return the full persona profile (synthesized + raw answers).
        Returns None if no survey has been taken yet.
        """
        synthesized = self._get_key("synthesized_persona")
        raw         = self._get_key("raw_answers", {})
        if not synthesized and not raw:
            return None
        return {
            "synthesized": synthesized or {},
            "raw_answers": raw,
            "is_complete": bool(synthesized),
        }

    def has_persona(self) -> bool:
        """Quick check: has the user submitted the survey at least partially?"""
        raw = self._get_key("raw_answers", {})
        return bool(raw)

    # ── LLM synthesis ─────────────────────────────────────────────────────────

    def _synthesize_persona(
        self,
        raw_answers: Dict[str, Any],
        llm_client,
    ) -> Optional[Dict[str, Any]]:
        """
        Call the LLM with survey answers to synthesize a rich persona profile.

        llm_client is a callable: llm_client(prompt: str) -> str
        (The caller wires up Ollama/Groq/Gemini and passes the function.)
        """
        prompt = _SYNTHESIS_PROMPT_TEMPLATE.format(
            raw_answers=json.dumps(raw_answers, indent=2, ensure_ascii=False)
        )
        try:
            response_text = llm_client(prompt)
            # Parse the JSON response
            # Strip markdown code fences if the model adds them
            cleaned = response_text.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("```")[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
                cleaned = cleaned.strip()
            profile = json.loads(cleaned)
            _log.info("LLM persona synthesis successful")
            return profile
        except Exception as e:
            _log.warning(f"LLM persona synthesis failed: {e}")
            return None

    def _build_template_persona(self, raw_answers: Dict[str, Any]) -> Dict[str, Any]:
        """
        Build a basic persona profile from raw answers without an LLM.
        Used as fallback when no LLM is configured.
        """
        life_stage   = raw_answers.get("life_stage", "")
        hometown     = raw_answers.get("hometown", "")
        current_city = raw_answers.get("current_city", "")
        interests    = raw_answers.get("interests", [])
        festivals    = raw_answers.get("festivals", [])

        if isinstance(interests, str):
            interests = [i.strip() for i in interests.split(",")]
        if isinstance(festivals, str):
            festivals = [f.strip() for f in festivals.split(",")]

        # Build identity summary
        parts = []
        if life_stage:
            parts.append(life_stage)
        if current_city:
            parts.append(f"based in {current_city}")
        if hometown and hometown != current_city:
            parts.append(f"originally from {hometown}")
        identity = f"A {', '.join(parts)}." if parts else "A photo enthusiast."

        # Nostalgia triggers
        triggers = []
        if hometown and hometown != current_city:
            triggers.append(f"Trips back to {hometown}")
        if interests:
            triggers.extend([f"{i.capitalize()} sessions" for i in interests[:3]])
        if festivals:
            triggers.extend([f"{f} celebrations" for f in festivals[:2]])

        return {
            "identity_summary":     identity,
            "nostalgia_triggers":   triggers or ["Family gatherings", "Special trips"],
            "likely_photo_patterns": [
                "Photos with close friends and family",
                "Travel and trip documentation",
                "Everyday moments and daily life",
            ],
            "naming_preferences": "Personal and warm, with occasional emoji. Avoid generic date-only names.",
            "seasonal_patterns": {
                "spring": "Family outings and festivals",
                "summer": "Trips and outdoor activities",
                "autumn": "Festive seasons and celebrations",
                "winter": "Holiday gatherings and end-of-year trips",
            },
        }

    # ── Privacy ───────────────────────────────────────────────────────────────

    def get_cloud_consent_status(self) -> Dict[str, Any]:
        """Return whether cloud persona synthesis consent was previously granted."""
        consent = self._get_key(_CLOUD_CONSENT_KEY)
        if not consent:
            return {"consented": False, "provider": None}
        return consent

    def revoke_cloud_consent(self) -> Dict[str, Any]:
        """Revoke previously granted cloud persona synthesis consent."""
        self._set_key(_CLOUD_CONSENT_KEY, {"provider": None, "consented": False})
        _log.info("Cloud persona synthesis consent revoked.")
        return {"status": "revoked", "message": "Cloud consent revoked. Future synthesis will require re-confirmation."}

    def reset_persona(self) -> Dict[str, Any]:
        """Wipe all persona data (survey answers + synthesized profile + cloud consent)."""
        return self._get_store().purge_persona()


# ─────────────────────────────────────────────────────────────────────────────
#  Module-level singleton
# ─────────────────────────────────────────────────────────────────────────────

persona_manager = PersonaManager()
