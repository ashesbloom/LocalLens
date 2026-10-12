"""
Self-check: a Move given an explicit file list (the scheduler's new-files run, the
library import) moves only those files, and never takes the cross-drive
copy-everything-then-delete-the-source path.

Plain asserts. Run:  python test_specific_files_move.py
"""
import os
import tempfile
from unittest import mock

import organizer_logic as ol


def demo():
    with tempfile.TemporaryDirectory() as src, tempfile.TemporaryDirectory() as dst:
        # Pretend source and destination are on different drives.
        real_stat = os.stat
        def fake_stat(p, *a, **k):
            st = real_stat(p, *a, **k)
            if os.path.realpath(p) == os.path.realpath(src):
                return os.stat_result((st.st_mode, st.st_ino, st.st_dev + 1) + tuple(st[3:]))
            return st
        with mock.patch.object(ol.os, "stat", fake_stat):
            # A whole-folder Move across drives still takes the safe copy path...
            assert ol._use_safe_copy_path("move", src, dst, None) is True
            # ...but with an explicit list it must not: that path rmtree()s the source.
            assert ol._use_safe_copy_path("move", src, dst, ["/x.jpg"]) is False
            assert ol._use_safe_copy_path("move", src, dst, []) is False
        assert ol._use_safe_copy_path("copy", src, dst, None) is False
        assert ol._use_safe_copy_path("move", src, dst, None) is False  # same drive

    # Cleanup after a cross-drive Move goes on past a file that won't delete,
    # and reports it (the Move then says the originals are still there).
    with tempfile.TemporaryDirectory() as src:
        os.makedirs(os.path.join(src, "locked"))
        for p in ("a.jpg", "locked/b.jpg"):
            open(os.path.join(src, p), "w").close()
        os.chmod(os.path.join(src, "locked"), 0o555)
        try:
            left, err = ol._remove_copied_source(src, set())
        finally:
            os.chmod(os.path.join(src, "locked"), 0o755)
        assert left == 1 and isinstance(err, PermissionError), (left, err)
        assert not os.path.exists(os.path.join(src, "a.jpg")), "the deletable file still goes"
        assert ol.troubleshoot.hint(err)

    # A read-only source blocks only a Move; a read-only destination blocks both.
    with tempfile.TemporaryDirectory() as ro, tempfile.TemporaryDirectory() as rw:
        with mock.patch.object(ol, "_read_only", lambda p: p == ro):
            assert "Use Copy" in ol.read_only_problem(ro, rw, "move")
            assert ol.read_only_problem(ro, rw, "copy") is None
            assert ol.read_only_problem(rw, ro, "copy").startswith("Can't write")
        assert ol.read_only_problem(rw, ro, "move") is None  # real check: both writable
    print("test_specific_files_move: all assertions passed")


if __name__ == "__main__":
    demo()
