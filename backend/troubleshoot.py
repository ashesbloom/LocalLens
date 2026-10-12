"""
Turns a file-system error into one plain sentence on how to fix it, so the app
can show the user more than "[Errno 30] Read-only file system".

hint() takes an OSError, an errno number, or an error message string (the
import endpoint keeps per-file errors as strings). Returns None when there is
nothing useful to add.

Self-check:  python troubleshoot.py
"""
import errno
import re
import sys

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


def demo():
    assert "read-only" in hint(OSError(errno.EROFS, "Read-only file system", "/Volumes/x"))
    assert "read-only" in hint("[Errno 30] Read-only file system: '/Volumes/x'")
    assert "read-only" in hint(errno.EROFS)
    assert "full" in hint(OSError(errno.ENOSPC, "No space left"))
    assert hint(ValueError("bad date")) is None
    assert hint(None) is None
    print("troubleshoot: all assertions passed")


if __name__ == "__main__":
    demo()
