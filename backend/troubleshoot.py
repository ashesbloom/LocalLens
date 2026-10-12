"""
Known failures, and what to run when they happen.

A failed optional import used to be logged as "library not installed" whatever the
real reason was -- a missing Homebrew dylib under dlib read exactly like a missing
pip package, and the fix for one is useless for the other. Every guard now hands the
actual exception to record(), which matches it against RULES and prints the fix for
the platform it is running on. The same hints reach the app's log console through
/api/check-dependencies and the job log stream.

It also turns a file-system error from a sort or import into one plain sentence on
how to fix it (hint()), so the app can show more than "[Errno 30] Read-only file
system".

Checked with: venv/bin/python test_troubleshoot.py
"""

import errno
import multiprocessing
import re
import sys

RELEASES_URL = "https://github.com/ashesbloom/LocalLens/releases/latest"
REINSTALL = f"Reinstall LocalLens from the latest release: {RELEASES_URL}"

# The dev venv's pip, per platform. Commands assume the shell is in backend/.
_PIP = {"darwin": "venv/bin/pip", "linux": "venv/bin/pip", "win32": r"venv\Scripts\pip"}

# The three Homebrew libraries dlib is linked against. `brew autoremove` strips them
# because Homebrew only ever saw them as build dependencies.
_DLIB_BREW = ("giflib", "libpng", "jpeg-turbo")


def _brew_fix(m):
    formula = m.group("formula")
    if formula in _DLIB_BREW:
        return [f"brew install {' '.join(_DLIB_BREW)}"]
    return [f"brew install {formula}"]


# Each rule: `match` is searched in the error text; `fix` maps a platform to a list of
# commands (or a callable taking the match); `app_fix` is what someone running the
# packaged app should do instead, since they have no venv, pip or build tools.
RULES = [
    {
        "id": "brew-dylib",
        "when": "a Homebrew library that dlib links against is missing (often removed by `brew autoremove`)",
        "match": r"Library not loaded: /opt/homebrew/opt/(?P<formula>[\w@.+-]+)/",
        "fix": {"darwin": _brew_fix},
        "app_fix": [REINSTALL],
    },
    {
        "id": "dll-load",
        "when": "Windows could not load dlib's DLL, usually because the Visual C++ runtime is missing",
        "match": r"DLL load failed while importing _?dlib",
        "fix": {"win32": [
            "Install the Microsoft Visual C++ Redistributable (x64): https://aka.ms/vs/17/release/vc_redist.x64.exe",
            r"venv\Scripts\pip install --force-reinstall dlib",
        ]},
        "app_fix": ["Install the Microsoft Visual C++ Redistributable (x64): https://aka.ms/vs/17/release/vc_redist.x64.exe",
                    REINSTALL],
    },
    {
        "id": "so-missing",
        "when": "a system image library that dlib links against is missing",
        "match": r"lib(gif|png16|jpeg)[\w.]*: cannot open shared object file",
        "fix": {"linux": ["sudo apt install libgif7 libpng16-16 libjpeg-turbo8   # Debian/Ubuntu"]},
        "app_fix": ["sudo apt install libgif7 libpng16-16 libjpeg-turbo8   # Debian/Ubuntu"],
    },
    {
        "id": "face-models",
        "when": "the face-recognition model files are missing or damaged",
        "match": r"shape_predictor_68|face_recognition_models|Unable to open .*\.dat",
        "fix": {p: [f"{pip} install --force-reinstall --no-deps face_recognition_models==0.3.0"] for p, pip in _PIP.items()},
        "app_fix": [REINSTALL],
    },
    {
        "id": "module-missing",
        "when": "a Python package the backend needs is not installed in the venv",
        "match": r"No module named '(?P<module>face_recognition|dlib|pillow_heif|rawpy|wand)",
        "fix": {
            "darwin": ["cd backend && venv/bin/pip install -r requirements.txt"],
            "linux": ["cd backend && venv/bin/pip install -r requirements.txt"],
            "win32": [r"cd backend; venv\Scripts\pip install -r requirements.txt"],
        },
        "app_fix": [REINSTALL],
    },
    {
        "id": "imagemagick",
        "when": "ImageMagick is not installed, so RAW photos cannot be read for face recognition",
        "match": r"MagickWand shared library not found",
        "fix": {
            "darwin": ["brew install imagemagick"],
            "linux": ["sudo apt install libmagickwand-dev   # Debian/Ubuntu"],
            "win32": [r"venv\Scripts\pip install rawpy"],
        },
        "app_fix": [REINSTALL],
    },
]


def _platform_key(platform):
    if platform.startswith("win"):
        return "win32"
    if platform.startswith("darwin"):
        return "darwin"
    return "linux"


def diagnose(text, platform=None, frozen=None):
    """Hints for an error message on a platform: [{id, when, run: [...]}]. Unknown -> []."""
    platform = _platform_key(platform or sys.platform)
    frozen = getattr(sys, "frozen", False) if frozen is None else frozen
    hints = []
    for rule in RULES:
        m = re.search(rule["match"], str(text or ""))
        if not m:
            continue
        if frozen and rule.get("app_fix"):
            run = rule["app_fix"]
        else:
            run = rule["fix"].get(platform)
            if callable(run):
                run = run(m)
        if run:
            hints.append({"id": rule["id"], "when": rule["when"], "run": list(run)})
    return hints


# Everything that failed this run, for /api/check-dependencies. One entry per
# component: the module-level import and initialize_libraries() both try the same
# import, and the log should say it once.
ISSUES = []


def first_line(exc):
    return _text(exc).splitlines()[0]


def _text(exc):
    # face_recognition calls quit() when face_recognition_models is missing: a
    # SystemExit with no message. Only that guard catches SystemExit, so name it.
    if isinstance(exc, SystemExit) and not str(exc).strip():
        return "face_recognition exited during import: face_recognition_models is missing"
    return str(exc).strip() or type(exc).__name__


def record(component, exc, print_fn=None):
    """Log a component failure with its fix, and keep it for the app to show."""
    # Worker processes re-import the same modules; one copy of the advice is enough.
    if print_fn is None:
        print_fn = print if multiprocessing.parent_process() is None else (lambda *_: None)
    headline = first_line(exc)
    if any(i["component"] == component and i["error"] == headline for i in ISSUES):
        return ISSUES
    ISSUES[:] = [i for i in ISSUES if i["component"] != component]
    # Matched against the whole text: the useful part is not always on line one.
    hints = diagnose(_text(exc))
    ISSUES.append({"component": component, "error": headline, "hints": hints})

    print_fn(f"[TROUBLESHOOT] {component} failed to load: {headline}")
    for hint in hints:
        print_fn(f"  When: {hint['when']}")
        for cmd in hint["run"]:
            print_fn(f"  Run:  {cmd}")
    if not hints:
        print_fn("  No known fix for this one. Please report it with the line above:")
        print_fn("  https://github.com/ashesbloom/LocalLens/issues")
    return ISSUES


# --- File-system errors during a sort or import ---
# hint() takes an OSError, an errno number, or an error message string (import keeps
# per-file errors as strings). Returns None when there is nothing useful to add.

_MAC = sys.platform == "darwin"

# Appended after "its drive is read-only." The NTFS case is by far the common one.
READ_ONLY_WHY = " macOS can read Windows (NTFS) drives but can't change them." if _MAC else ""


def _for_errno(code):
    if code == errno.EROFS:
        if _MAC:
            return ("This drive is read-only. macOS can read Windows (NTFS) drives but can't change them. "
                    "Use Copy to bring photos off it, or reformat the drive as exFAT to write to it.")
        return "This drive is read-only. Check the drive's write protection, or pick a folder on another drive."
    if code in (errno.EPERM, errno.EACCES):
        if _MAC:
            return ("macOS blocked access. Allow Local Lens in System Settings › Privacy & Security › "
                    "Files and Folders (or Full Disk Access), then try again.")
        return "You don't have permission to change this folder. Pick another folder or check its permissions."
    if code == errno.ENOSPC:
        return "The destination drive is full. Free up space or pick another destination."
    if code in (errno.ENOENT, errno.EIO, errno.ENXIO):
        return "The folder or drive disappeared. Check that the drive is still connected, then try again."
    return None


def hint(err):
    if isinstance(err, int):
        return _for_errno(err)
    code = getattr(err, "errno", None)
    if code is None:
        text = str(err or "")
        m = re.search(r"\[Errno (\d+)\]", text)
        if m:
            code = int(m.group(1))
        elif "read-only file system" in text.lower():
            code = errno.EROFS
    return _for_errno(code) if code is not None else None
