r"""
Self-check for the path normalisation behind /api/delete-files.

Plain asserts, no framework. Run it directly:  python test_delete_paths.py

A Windows customer on a UNC share (//cube/data/photos) had every delete fail with
  [Errno 3] ...: '\\?\//cube/data/photos\Unknown_Date\file.jpg'
while dry_run=True reported success. These tests pin the four facts that fix rests on.
"""

import ntpath
import os
import posixpath
import sys
import tempfile

UNC_HYBRID = "//cube/data/photos\\Unknown_Date\\a.jpg"


def prefix_and_path(path):
    r"""
    Verbatim copy of send2trash 2.1.0 send2trash/win/legacy.py::prefix_and_path.

    Copied rather than imported because it only imports on Windows, and this is the
    exact code that runs in shipped builds: pywin32 is not in requirements.txt, so
    send2trash/win/__init__.py falls back from modern.py to legacy.py.
    """
    prefix, long_path = "\\\\?\\", path
    if not path.startswith(prefix):
        if path.startswith("\\\\"):
            prefix = "\\\\?\\UNC"
            long_path = prefix + path[1:]
        else:
            long_path = prefix + path
    elif path.startswith(prefix + "UNC\\"):
        prefix = "\\\\?\\UNC"
    return prefix, long_path


def test_ntpath_folds_hybrid_separators():
    r"""On Windows os.path IS ntpath, so this is what the fix does there."""
    assert ntpath.normpath(UNC_HYBRID) == "\\\\cube\\data\\photos\\Unknown_Date\\a.jpg"
    print("✅ ntpath.normpath folds '//server/share\\dir' to a proper UNC path")


def test_send2trash_only_handles_the_normalised_form():
    r"""The actual bug: \\?\ is the one Win32 form that rejects forward slashes."""
    raw_prefix, raw_long = prefix_and_path(UNC_HYBRID)
    assert raw_prefix == "\\\\?\\", "raw path unexpectedly took the UNC branch"
    assert raw_long.startswith("\\\\?\\//"), f"expected the broken form, got {raw_long!r}"

    ok_prefix, ok_long = prefix_and_path(ntpath.normpath(UNC_HYBRID))
    assert ok_prefix == "\\\\?\\UNC", f"normalised path missed the UNC branch: {ok_prefix!r}"
    assert ok_long == "\\\\?\\UNC\\cube\\data\\photos\\Unknown_Date\\a.jpg", ok_long
    print("✅ send2trash's legacy backend builds \\\\?\\UNC\\ only for the normalised path")


def test_posix_normpath_leaves_backslashes_alone():
    r"""Why /api/delete-files needs no sys.platform guard: backslash is a legal
    filename character on POSIX, and posixpath.normpath knows that."""
    assert posixpath.normpath("/Users/me/a\\b.jpg") == "/Users/me/a\\b.jpg"
    print("✅ posixpath.normpath preserves backslashes — no platform guard needed")


def test_dry_run_and_real_delete_resolve_the_same_path():
    """
    The customer's real complaint: dry_run=True said success, the real delete failed
    on every file. Both branches must resolve the identical string.
    """
    import asyncio
    import types

    # Stub send2trash BEFORE importing main: the endpoint imports it lazily, and we
    # want to capture the argument rather than actually trash the fixture.
    captured = []
    stub = types.ModuleType("send2trash")
    stub.send2trash = captured.append
    sys.modules["send2trash"] = stub

    from main import delete_files_endpoint, DeleteFilesRequest

    with tempfile.TemporaryDirectory() as tmp:
        fp = os.path.join(tmp, "dupe.jpg")
        with open(fp, "wb") as f:
            f.write(b"x" * 1024)
        # Denormalised on purpose — the shape the scan used to emit.
        messy = os.path.join(tmp, ".", "dupe.jpg")

        preview = asyncio.run(delete_files_endpoint(DeleteFilesRequest(file_paths=[messy], dry_run=True)))
        assert preview["failed"] == [], preview["failed"]
        assert os.path.isfile(fp), "dry run deleted the file"

        real = asyncio.run(delete_files_endpoint(DeleteFilesRequest(file_paths=[messy], dry_run=False)))
        assert real["failed"] == [], real["failed"]
        assert real["use_trash"], "stub send2trash was not used"

        assert captured == [preview["deleted"][0]], \
            f"preview promised {preview['deleted']!r} but send2trash got {captured!r}"
        assert captured == [os.path.normpath(fp)], captured
    print("✅ dry_run preview and the real delete resolve the identical path")


if __name__ == "__main__":
    test_ntpath_folds_hybrid_separators()
    test_send2trash_only_handles_the_normalised_form()
    test_posix_normpath_leaves_backslashes_alone()
    test_dry_run_and_real_delete_resolve_the_same_path()
    print("\nAll delete-path checks passed.")
