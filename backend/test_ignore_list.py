#!/usr/bin/env python3
"""
Regression test for the ignore_list subtree-pruning bug.

Run: cd backend && venv/bin/python test_ignore_list.py

The ignored folders here hold files ONLY in a subdirectory, with zero files sitting
directly inside them. That shape is the whole point: the old
`if dirpath in ignore_set: continue` filter skipped only direct files, so a tree with
files directly in the ignored folder would pass even with the bug present. Real sorted
output always nests (Sorted_By_People/Mayank/...), which is why the filter excluded
nothing at all in practice.
"""
import logging
import os
import shutil
import tempfile

# The fixtures are 1-byte stand-ins, not real JPEGs, so every EXIF read logs a warning.
# That path is exercised on purpose (it is how undated photos reach Unknown_Date); the
# noise would just bury a real assertion failure.
logging.disable(logging.WARNING)

from organizer_logic import (
    walk_ignoring, effective_ignore_set, _is_ignored, _core_processing_loop, _norm,
)
from main import _count_source_files


def _build_tree(root):
    """Two ignored folders, each holding photos only in nested subdirectories."""
    files = [
        "a.jpg",                                    # top level      -> counted
        "keep/b.jpg",                               # kept subfolder -> counted
        "Sorted_By_People/Mayank/c.jpg",            # ignored subtree
        "Sorted_By_People/Mayank/With Others/d.jpg",# ignored subtree, deeper
        "Sorted_By_Date/2025/e.jpg",                # ignored subtree
        "Sorted_By_Date/2025/notes.txt",            # unsupported ext, ignored anyway
    ]
    for rel in files:
        path = os.path.join(root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write("x")
    return [
        os.path.join(root, "Sorted_By_People"),
        os.path.join(root, "Sorted_By_Date"),
    ]


def test_count_source_files_prunes_ignored_subtrees(root, ignore_list):
    count = _count_source_files(root, ignore_list)
    assert count == 2, f"expected 2 (a.jpg + keep/b.jpg), got {count}"
    print("✅ _count_source_files skips nested files inside ignored folders")


def test_count_source_files_without_ignores(root):
    count = _count_source_files(root, [])
    assert count == 5, f"expected all 5 images, got {count}"
    print("✅ _count_source_files counts everything when nothing is ignored")


def test_walk_never_descends_into_ignored(root, ignore_list):
    """Covers every call site, since they all route through walk_ignoring()."""
    visited = [dirpath for dirpath, _, _ in walk_ignoring(root, set(ignore_list))]
    for ignored in ignore_list:
        assert ignored not in visited, f"yielded the ignored folder itself: {ignored}"
        leaked = [d for d in visited if d.startswith(ignored + os.sep)]
        assert not leaked, f"descended into ignored subtree: {leaked}"
    assert os.path.join(root, "keep") in visited, "pruned a folder it should have kept"
    print("✅ walk_ignoring prunes the whole subtree, not just its direct files")


def test_ignoring_the_root_yields_nothing(root):
    assert list(walk_ignoring(root, {root})) == [], "ignored root still yielded entries"
    print("✅ walk_ignoring handles the walk root itself being ignored")


def test_denormalised_paths_still_prune(root, ignore_list):
    """
    A trailing separator or a relative path used to silently disable the filter, because
    both sides were compared as raw strings. The UI happens to send exact paths; an LLM
    driving the MCP tools does not always.
    """
    def double_interior_sep(p):
        # Must not touch the LEADING separator: POSIX deliberately preserves '//foo',
        # so normpath leaves it alone and it is genuinely a different path.
        head, tail = os.path.split(p)
        return head + os.sep * 2 + tail

    cases = [
        ("trailing separator", [p + os.sep for p in ignore_list]),
        ("doubled separator",  [double_interior_sep(p) for p in ignore_list]),
        ("redundant '.'",      [os.path.join(p, ".") for p in ignore_list]),
        ("parent traversal",   [os.path.join(p, "..", os.path.basename(p)) for p in ignore_list]),
    ]

    # os.path.relpath raises on Windows when the two paths sit on different drives
    # ("path is on mount 'C:', start on mount 'D:'") — which is exactly the CI layout,
    # temp dir on C: and the checkout on D:. A cross-drive relative path is not
    # something a caller could send either, so the case is unrepresentable rather than
    # failing. Skip it there instead of faking it.
    drive = os.path.splitdrive(os.getcwd())[0]
    if all(os.path.splitdrive(p)[0] == drive for p in ignore_list):
        cases.append(("relative path", [os.path.relpath(p) for p in ignore_list]))
        relative_note = "slash / '.' / relative"
    else:
        relative_note = "slash / '.'; relative skipped, temp dir is on another drive"

    for label, mangled in cases:
        count = _count_source_files(root, mangled)
        assert count == 2, f"{label}: filter did not apply — expected 2, got {count}"
    print(f"✅ ignore paths still prune when denormalised ({relative_note})")


def test_destination_inside_source_is_auto_excluded(root):
    """Sorting into a subfolder of the source must not let the job eat its own output."""
    # Compare through _norm, the way the production callers do. effective_ignore_set
    # stores _norm()ed paths, and _norm applies normcase — a no-op on POSIX but a
    # lowercase on Windows, where "...\\Sorted" would never match "...\\sorted".
    # Asserting on the raw path passes on macOS by luck and fails on every Windows run.
    nested = os.path.join(root, "Sorted")
    assert _norm(nested) in effective_ignore_set(root, nested, []), \
        "nested destination was not auto-excluded"

    deeper = os.path.join(root, "a", "b", "Sorted")
    assert _norm(deeper) in effective_ignore_set(root, deeper, []), \
        "deeply nested destination was not auto-excluded"

    # dest == source would otherwise exclude everything and process zero files.
    assert effective_ignore_set(root, root, []) == set(), \
        "dest == source must not be excluded"

    # A sibling outside the source tree is not self-ingestion.
    sibling = os.path.join(os.path.dirname(root), "Elsewhere")
    assert effective_ignore_set(root, sibling, []) == set(), \
        "destination outside the source tree was wrongly excluded"

    # A name that merely shares a prefix is not nested: /Photos_backup vs /Photos.
    assert effective_ignore_set(root, root + "_backup", []) == set(), \
        "prefix-sharing sibling was wrongly treated as nested"
    print("✅ effective_ignore_set excludes a nested destination, and only that")


def test_is_ignored_guards_the_deletion_path(root, ignore_list):
    """
    The post-move cleanup deletes source files and uses this predicate to spare ignored
    subtrees. A false negative here is data loss, so denormalised input must still match.
    """
    ignored = ignore_list[0]                      # <root>/Sorted_By_People
    nested = os.path.join(ignored, "Mayank")
    photo = os.path.join(nested, "With Others", "d.jpg")
    normalised = effective_ignore_set(root, None, ignore_list)

    for label, path in [("the folder itself", ignored), ("a child dir", nested), ("a deep file", photo)]:
        assert _is_ignored(path, normalised), f"would have deleted {label}: {path}"

    # And it must not over-match, or the move would spare files it was asked to remove.
    assert not _is_ignored(os.path.join(root, "a.jpg"), normalised), "spared a file it should delete"
    assert not _is_ignored(os.path.join(root, "keep", "b.jpg"), normalised), "spared a kept subfolder"
    assert not _is_ignored(ignored + "_backup", normalised), "prefix-sharing sibling wrongly spared"

    # A denormalised ignore_list must protect the same files, not silently delete them.
    mangled = effective_ignore_set(root, None, [p + os.sep for p in ignore_list])
    assert _is_ignored(photo, mangled), "trailing-slash ignore path left a photo unprotected"
    print("✅ _is_ignored spares ignored subtrees exactly, including denormalised input")


def test_end_to_end_counts_agree(tmp):
    """
    The reported numbers must match what lands on disk. Date sort, so no face models
    are needed and one source photo produces exactly one write.
    """
    source = os.path.join(tmp, "Source")
    dest = os.path.join(tmp, "Dest")
    ignored = os.path.join(source, "Sorted_By_People", "Alice")

    os.makedirs(source, exist_ok=True)
    for i in range(75):
        with open(os.path.join(source, f"img_{i:03}.jpg"), "w") as f:
            f.write("x")
    os.makedirs(ignored, exist_ok=True)
    for i in range(30):
        with open(os.path.join(ignored, f"already_sorted_{i:03}.jpg"), "w") as f:
            f.write("x")

    ignore_list = [os.path.join(source, "Sorted_By_People")]
    precount = _count_source_files(source, ignore_list, dest)
    assert precount == 75, f"precount saw {precount} files, expected 75 (not 105, not 680)"

    moved, total = _core_processing_loop(
        source, dest,
        {"primary_sort": "Date", "maintain_hierarchy": False, "ignore_list": ignore_list},
        lambda *a, **k: None,
        encodings_path=None, operation_mode="copy",
    )
    assert total == 75, f"loop reported total_files={total}, expected 75"
    assert total == precount, f"precount ({precount}) and loop ({total}) disagree"

    on_disk = sum(len(files) for _, _, files in os.walk(dest))
    assert moved == 75, f"reported {moved} writes, expected 75"
    assert on_disk == moved, f"reported {moved} writes but {on_disk} files on disk"

    leaked = [f for _, _, files in os.walk(dest) for f in files if f.startswith("already_sorted")]
    assert not leaked, f"files from the ignored subtree reached the destination: {leaked[:3]}"
    print(f"✅ end-to-end: total_files=75, files_written={moved}, {on_disk} on disk, 0 leaked")


if __name__ == "__main__":
    tmp = tempfile.mkdtemp(prefix="locallens_ignore_test_")
    try:
        root = os.path.join(tmp, "Photos")
        ignore_list = _build_tree(root)

        test_count_source_files_prunes_ignored_subtrees(root, ignore_list)
        test_count_source_files_without_ignores(root)
        test_walk_never_descends_into_ignored(root, ignore_list)
        test_ignoring_the_root_yields_nothing(root)
        test_denormalised_paths_still_prune(root, ignore_list)
        test_destination_inside_source_is_auto_excluded(root)
        test_is_ignored_guards_the_deletion_path(root, ignore_list)
        test_end_to_end_counts_agree(os.path.join(tmp, "e2e"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print("\n✅ All 8 tests passed!")
