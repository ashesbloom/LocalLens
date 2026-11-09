"""Entry point of the LocalLens Vision Core test app (vision_core/bench.py), frozen by vision_bench.spec."""
import multiprocessing
import sys
import warnings

warnings.filterwarnings("ignore")   # testers see progress and the result, not library warnings (e.g. EXIF parsing)

from vision_core.bench import main

if __name__ == "__main__":
    multiprocessing.freeze_support()   # decode workers re-enter the frozen app through here
    sys.exit(main())
