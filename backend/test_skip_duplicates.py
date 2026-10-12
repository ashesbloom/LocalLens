"""
Self-check for "Skip duplicates" in a sort: photos already in the destination, and
extra copies inside the source, are left out (and left where they are); with the
switch off the sort is unchanged.

Plain asserts. Run:  python test_skip_duplicates.py
"""
import asyncio
import os
import tempfile

import numpy as np
from PIL import Image

import main


def _photo(path, seed, size=(256, 256)):
    rng = np.random.default_rng(seed)
    # Blocky noise: survives resizing, so a smaller copy still hashes the same.
    small = rng.integers(0, 255, (8, 8, 3), dtype=np.uint8)
    Image.fromarray(small).resize(size, Image.NEAREST).save(path, "JPEG", quality=95)


def _files(root):
    return sorted(os.path.relpath(os.path.join(d, f), root) for d, _, fs in os.walk(root) for f in fs if f.endswith(".jpg"))


def _sort(src, dst, skip, mode="move", on_update=None):
    updates = []
    real = main.update_status_callback

    def capture(u):
        updates.append(u)
        if on_update:
            on_update(u)
        real(u)
    main.update_status_callback = capture
    try:
        asyncio.run(main.run_organization_task({
            "source_folder": src, "destination_folder": dst, "ignore_list": [], "operation_mode": mode,
            "sorting_options": {"primary_sort": "Date", "maintain_hierarchy": False, "skip_duplicates": skip},
        }))
    finally:
        main.update_status_callback = real
    return updates[-1]


def test_plan():
    h = {"a": np.uint64(1), "d": np.uint64(1), "b": np.uint64(0xFF00), "b2": np.uint64(0xFF00), "c": np.uint64(0xF0F0F0F0)}
    info = {p: {"width": 100, "height": 100, "bytes": 10, "mtime": 0} for p in h}
    info["b"]["width"] = 50  # b2 is the bigger copy, so b2 is kept
    source = ["a", "b", "b2", "c", "unreadable"]
    hashes = [("d", h["d"])] + [(p, h[p]) for p in source if p in h]
    assert main._plan_skips(source, {"d"}, hashes, info) == ["a", "b"]
    assert main._plan_skips(["c"], set(), [("c", h["c"])], info) == []


def test_sort():
    with tempfile.TemporaryDirectory() as d:
        src, dst = os.path.join(d, "card"), os.path.join(d, "library")
        os.makedirs(src); os.makedirs(os.path.join(dst, "old"))
        _photo(os.path.join(src, "a.jpg"), 1)
        _photo(os.path.join(dst, "old", "a_lib.jpg"), 1)          # a is already in the library
        _photo(os.path.join(src, "b.jpg"), 2)
        _photo(os.path.join(src, "b copy.jpg"), 2, (128, 128))   # smaller copy of b
        _photo(os.path.join(src, "c.jpg"), 3)
        before_dst = set(_files(dst))

        final = _sort(src, dst, skip=True)
        assert final["status"] == "complete", final
        assert "2 duplicates skipped" in final["message"], final["message"]
        assert sorted(main.current_job_state["skipped_duplicates"]) == sorted(
            [os.path.join(src, "a.jpg"), os.path.join(src, "b copy.jpg")])
        assert _files(src) == ["a.jpg", "b copy.jpg"], "skipped photos stay in the source"
        new = set(_files(dst)) - before_dst
        assert len(new) == 2 and any("b" in n for n in new) and any("c" in n for n in new), new

        # Everything left is a duplicate: nothing to sort, nothing written.
        before_dst = set(_files(dst))
        final = _sort(src, dst, skip=True)
        assert final["status"] == "complete" and "Nothing to sort" in final["message"], final
        assert set(_files(dst)) == before_dst and _files(src) == ["a.jpg", "b copy.jpg"]

        # Switch off: sorted like today, duplicates and all (copy, so the source stays).
        final = _sort(src, dst, skip=False, mode="copy")
        assert final["status"] == "complete" and "skipped" not in final["message"], final
        assert main.current_job_state["skipped_duplicates"] == []
        assert len(set(_files(dst)) - before_dst) == 2

        # Abort while checking: nothing written.
        before_dst = set(_files(dst))
        _photo(os.path.join(src, "e.jpg"), 5)
        stop = lambda u: u.get("message", "").startswith("Checking for duplicates") and main.cancellation_events["sorting"].set()
        final = _sort(src, dst, skip=True, on_update=stop)
        assert final["status"] == "aborted", final
        assert set(_files(dst)) == before_dst and "e.jpg" in _files(src)


def test_source_inside_destination():
    # Sorting <library>/Inbox into <library>: Inbox photos must not match themselves.
    with tempfile.TemporaryDirectory() as dst:
        src = os.path.join(dst, "Inbox")
        os.makedirs(src)
        _photo(os.path.join(src, "x.jpg"), 7)
        final = _sort(src, dst, skip=True, mode="copy")
        assert final["status"] == "complete" and "skipped" not in final["message"], final


def test_hard_link_counts_as_already_there():
    with tempfile.TemporaryDirectory() as d:
        src, dst = os.path.join(d, "card"), os.path.join(d, "library")
        os.makedirs(src); os.makedirs(dst)
        _photo(os.path.join(dst, "y.jpg"), 8)
        os.link(os.path.join(dst, "y.jpg"), os.path.join(src, "y.jpg"))
        _photo(os.path.join(src, "z.jpg"), 9)
        final = _sort(src, dst, skip=True, mode="copy")
        assert "1 duplicate skipped" in final["message"], final


if __name__ == "__main__":
    main._phash_store = lambda: None  # never touch the real fingerprint cache
    main.current_job_state["is_active"] = False
    test_plan()
    test_sort()
    test_source_inside_destination()
    test_hard_link_counts_as_already_there()
    print("test_skip_duplicates: all assertions passed")
