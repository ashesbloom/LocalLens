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
    print("test_specific_files_move: all assertions passed")


if __name__ == "__main__":
    demo()
