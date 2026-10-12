#!/usr/bin/env python3
"""
Pins the "what to run when this happens" table in troubleshoot.py. The error strings
are the real ones -- the giflib one is verbatim from this machine on 2026-10-12 --
because a rule that matches a tidied-up paraphrase matches nothing in the field.

Run: cd backend && venv/bin/python test_troubleshoot.py
"""
import troubleshoot as t

GIFLIB = (
    "dlopen(/x/venv/lib/python3.11/site-packages/_dlib_pybind11.cpython-311-darwin.so, 0x0002): "
    "Library not loaded: /opt/homebrew/opt/giflib/lib/libgif.dylib\n  Referenced from: <FFD1> /x/_dlib.so"
)
NO_DAT = "Unable to open /x/face_recognition_models/models/shape_predictor_68_face_landmarks.dat for reading."
WIN_DLL = "DLL load failed while importing _dlib_pybind11: The specified module could not be found."
LINUX_SO = "libgif.so.7: cannot open shared object file: No such file or directory"
NO_MODULE = "No module named 'face_recognition'"
NO_MAGICK = "MagickWand shared library not found.\nYou probably had not installed ImageMagick library."


def runs(text, platform, frozen=False):
    return [cmd for h in t.diagnose(text, platform, frozen) for cmd in h["run"]]


# The failure that started this: all three of dlib's Homebrew libraries, not just giflib.
assert runs(GIFLIB, "darwin") == ["brew install giflib libpng jpeg-turbo"], runs(GIFLIB, "darwin")
assert t.diagnose(GIFLIB, "darwin")[0]["id"] == "brew-dylib"
# Any other Homebrew formula is named from the error itself.
assert runs("Library not loaded: /opt/homebrew/opt/openblas/lib/libopenblas.dylib", "darwin") == ["brew install openblas"]
# A macOS-only failure has nothing to say on another platform.
assert runs(GIFLIB, "win32") == []

# The model file: the same fix with each platform's venv path.
assert runs(NO_DAT, "darwin") == ["venv/bin/pip install --force-reinstall --no-deps face_recognition_models==0.3.0"]
assert runs(NO_DAT, "win32") == [r"venv\Scripts\pip install --force-reinstall --no-deps face_recognition_models==0.3.0"]

assert any("vc_redist" in c for c in runs(WIN_DLL, "win32")), "windows DLL failure names the VC++ runtime"
assert runs(LINUX_SO, "linux")[0].startswith("sudo apt install libgif7")
assert runs(NO_MODULE, "win32") == [r"cd backend; venv\Scripts\pip install -r requirements.txt"]
assert runs(NO_MODULE, "darwin") == ["cd backend && venv/bin/pip install -r requirements.txt"]
assert runs(NO_MAGICK, "darwin") == ["brew install imagemagick"]
assert runs(NO_MAGICK, "win32") == [r"venv\Scripts\pip install rawpy"]

# sys.platform spellings are normalised.
assert runs(NO_MODULE, "linux2") == runs(NO_MODULE, "linux")

# The packaged app has no venv or pip: its users are told to reinstall...
assert runs(NO_DAT, "darwin", frozen=True) == [t.REINSTALL]
# ...except where the fix is on their side of the machine anyway.
assert any("vc_redist" in c for c in runs(WIN_DLL, "win32", frozen=True))

# Unknown failures produce no invented advice.
assert t.diagnose("something nobody has seen before", "darwin") == []
assert t.diagnose(None, "darwin") == []

# record(): logged once per component and error, kept for the app, and says so when it
# has no fix rather than staying silent.
t.ISSUES.clear()
out = []
t.record("face_recognition", OSError(GIFLIB), print_fn=out.append)
t.record("face_recognition", OSError(GIFLIB), print_fn=out.append)  # the second import guard
assert out[0].startswith("[TROUBLESHOOT] face_recognition failed to load: dlopen(")
assert sum(line.startswith("[TROUBLESHOOT]") for line in out) == 1, "logged once"
assert len(t.ISSUES) == 1 and t.ISSUES[0]["error"].startswith("dlopen(") and "\n" not in t.ISSUES[0]["error"]
out.clear()
t.record("pillow_heif", RuntimeError("weird"), print_fn=out.append)
assert any("No known fix" in line for line in out)
assert [i["component"] for i in t.ISSUES] == ["face_recognition", "pillow_heif"]
# face_recognition calls quit() when its model package is missing: a bare SystemExit.
# It still gets a readable reason and the models fix, not "no known fix".
t.record("face_recognition", SystemExit(), print_fn=lambda *_: None)
assert "face_recognition_models is missing" in t.ISSUES[-1]["error"]
assert t.ISSUES[-1]["hints"][0]["id"] == "face-models"
t.ISSUES.clear()

# hint(): a file-system error from a sort or import becomes one sentence on the fix,
# from an OSError, its errno, or the message string the import keeps.
import errno
assert "read-only" in t.hint(OSError(errno.EROFS, "Read-only file system", "/Volumes/x"))
assert "read-only" in t.hint("[Errno 30] Read-only file system: '/Volumes/x'")
assert "read-only" in t.hint(errno.EROFS)
assert "full" in t.hint(OSError(errno.ENOSPC, "No space left"))
assert t.hint(ValueError("bad date")) is None
assert t.hint(None) is None

print("ok - test_troubleshoot.py")
