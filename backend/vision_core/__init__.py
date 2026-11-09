"""
Vision Core lab: whole-image understanding for Find (sub-project 1 of Vision Core v3.0).

Lab code on branch lab/vision-core. Nothing in the app imports it yet and preflight does
not run its tests. Spec: docs/superpowers/specs/2026-10-13-vision-core-lab-design.md.
Docs: docs/vision-core/.
"""
import os
from pathlib import Path

# Everything the lab downloads, exports or measures lives here, outside the repo.
LAB_DIR = Path(os.environ.get("LOCALLENS_LAB", "~/LocalLensLab")).expanduser()
MODELS_DIR = LAB_DIR / "models"
DATASETS_DIR = LAB_DIR / "datasets"
RUNS_DIR = LAB_DIR / "runs"
CACHE_DIR = LAB_DIR / "cache"
LAB_DB = LAB_DIR / "lab.db"

DEFAULT_MODEL = "siglip2-b16-224"
VECTORS_DIR = LAB_DIR / "vectors"            # rival models' vectors from scripts/vision_shootout.py
TRANSLATIONS_DIR = LAB_DIR / "translations"  # English versions of non-English queries (scripts/vision_translate.py)
TAU_FILE = LAB_DIR / "tau.json"              # calibrated thresholds for every system other than a plain model
