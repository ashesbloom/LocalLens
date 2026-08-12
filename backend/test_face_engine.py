#!/usr/bin/env python3
"""
Regression tests for the face engine.

Run: cd backend && venv/bin/python test_face_engine.py

The important one is test_exif_orientation_is_applied. Before the engine existed,
images were opened with a bare Image.open() and dlib's HOG detector saw portrait
JPEGs lying on their side. Measured over 35 real enrollment photos: 33/35 faces
found upright, 1/35 once rotated 90 degrees. Every one of those photos was filed
under No_Faces_Found.

The fixtures are synthetic (a drawn "face" of flat blobs) wherever a test only
needs to prove plumbing - which array was handed to the detector, what the cache
returned, which side of the tolerance a distance fell on. Only the orientation
test needs a real face, and it builds one out of a real photo if the machine
happens to have enrolled some; otherwise it says so and skips.
"""
import logging
import os
import pickle
import shutil
import tempfile

import numpy as np
from PIL import Image

# The fixtures deliberately include unreadable files and faceless images, both of
# which log warnings by design. The noise would bury a real assertion failure.
logging.disable(logging.WARNING)

import face_engine
from enrollment_logic import _prune_outliers, needs_rebuild, GALLERY_VERSION


# ── Fixtures ────────────────────────────────────────────────────────────────

def _gradient_image(width, height):
    """A recognisable, non-uniform image. No face in it."""
    x = np.linspace(0, 255, width, dtype=np.uint8)
    row = np.repeat(x[None, :], height, axis=0)
    return Image.fromarray(np.dstack([row, row[::-1], row]).astype(np.uint8))


def _real_face_path():
    """A real photo containing a face, or None when this machine has none enrolled."""
    enrollment = os.path.expanduser("~/.config/LocalLens/Enrollment")
    if not os.path.isdir(enrollment):
        return None
    for person in sorted(os.listdir(enrollment)):
        person_dir = os.path.join(enrollment, person)
        if not os.path.isdir(person_dir):
            continue
        for name in sorted(os.listdir(person_dir)):
            if name.lower().endswith((".jpg", ".jpeg", ".png")):
                return os.path.join(person_dir, name)
    return None


# ── Loader ──────────────────────────────────────────────────────────────────

def test_exif_orientation_is_applied(tmp):
    """
    A sideways photo tagged Orientation=6 must reach the detector upright.

    This is the regression test for the 33/35 -> 1/35 detection collapse. It
    writes a photo whose pixels are rotated and whose EXIF says "rotate back",
    which is exactly what a portrait shot off a phone or DSLR looks like, then
    asserts the loader hands back the original shape.
    """
    upright = _gradient_image(400, 600)          # portrait
    sideways = upright.transpose(Image.Transpose.ROTATE_90)   # now landscape
    assert sideways.size == (600, 400), sideways.size

    path = os.path.join(tmp, "orientation_6.jpg")
    exif = sideways.getexif()
    exif[274] = 6                                 # 274 = Orientation
    sideways.save(path, exif=exif, quality=95)

    loaded = face_engine.load_upright(path)
    assert loaded is not None, "loader returned nothing for a valid JPEG"
    assert loaded.size == (400, 600), (
        f"expected the orientation tag to be applied and give back a "
        f"400x600 portrait, got {loaded.size}. Faces in this photo would be "
        f"sideways to the detector and would not be found."
    )
    print("  ✓ EXIF Orientation=6 is applied on load")


def test_untagged_image_is_left_alone(tmp):
    """No orientation tag means no rotation. The loader must not guess."""
    path = os.path.join(tmp, "no_tag.png")
    _gradient_image(300, 200).save(path)
    loaded = face_engine.load_upright(path)
    assert loaded is not None
    assert loaded.size == (300, 200), loaded.size
    print("  ✓ images without an orientation tag are unchanged")


def test_unreadable_file_reports_rather_than_crashes(tmp):
    """A corrupt file returns None so callers can tell it from a faceless photo."""
    path = os.path.join(tmp, "broken.jpg")
    with open(path, "wb") as f:
        f.write(b"this is definitely not a jpeg")

    assert face_engine.load_upright(path) is None

    result = face_engine.detect_and_encode(path, "fast")
    assert result["status"] == face_engine.UNREADABLE, result
    assert result["encodings"] == []
    # The old code returned None here and the caller turned it into [], filing the
    # file under No_Faces_Found with nothing in the log.
    assert face_engine.recognize(path, [np.zeros(128)], ["Somebody"], "fast") is None
    print("  ✓ unreadable files are reported as unreadable, not as having no face")


def test_resize_uses_the_long_edge(tmp):
    """
    Scaling must key off the longer side.

    The original code resized only when `width > 800`, so a tall 800x3000
    panorama skipped the resize entirely and went to the detector at full height.
    """
    tall = _gradient_image(800, 3000)
    out = face_engine.resize_long_edge(tall, 1024)
    assert max(out.size) == 1024, out.size
    assert out.size == (273, 1024), out.size

    wide = _gradient_image(4000, 3000)
    out = face_engine.resize_long_edge(wide, 1600)
    assert out.size == (1600, 1200), out.size

    small = _gradient_image(300, 200)
    assert face_engine.resize_long_edge(small, 1024).size == (300, 200), "must not upscale"
    print("  ✓ resizing keys off the long edge and never upscales")


# ── Ladder ──────────────────────────────────────────────────────────────────

def test_ladders_are_prefixes_of_each_other():
    """
    fast ⊂ balanced ⊂ accurate.

    The encoding cache relies on this: it compares how many passes a cached scan
    ran against how many the current request would run. That comparison is only
    sound while the shorter ladder is a prefix of the longer one.
    """
    fast = face_engine.LADDERS["fast"]
    balanced = face_engine.LADDERS["balanced"]
    accurate = face_engine.LADDERS["accurate"]
    assert balanced[:len(fast)] == fast, "balanced must start with the fast passes"
    assert accurate[:len(balanced)] == balanced, "accurate must start with the balanced passes"
    assert face_engine.ladder_length("fast") == len(fast)
    assert face_engine.ladder_length("nonsense") == len(balanced), "unknown modes fall back to balanced"
    print(f"  ✓ ladders nest correctly (fast={len(fast)}, balanced={len(balanced)}, accurate={len(accurate)})")


def test_cnn_modes_cap_their_worker_count():
    """
    Modes that can reach the CNN pass must not fan out across every core.

    dlib's CNN allocates per-image buffers proportional to pixel count with no way
    to cap it from Python. A single 1600px detection was measured holding ~23% of
    system RAM; running one per core exhausted the machine and the out-of-memory
    kill took the whole job with it. Concurrency is the only available control, so
    this asserts the cap is actually applied.
    """
    assert face_engine.mode_uses_cnn("accurate") is True
    assert face_engine.mode_uses_cnn("fast") is False
    assert face_engine.mode_uses_cnn("balanced") is False

    # HOG-only modes get every spare core.
    assert face_engine.safe_worker_count("fast", available=16) == 16
    assert face_engine.safe_worker_count("balanced", available=16) == 16

    # Accurate is capped no matter how many cores are on offer.
    assert face_engine.safe_worker_count("accurate", available=16) == face_engine.MAX_CNN_WORKERS
    assert face_engine.safe_worker_count("accurate", available=64) == face_engine.MAX_CNN_WORKERS
    assert face_engine.MAX_CNN_WORKERS <= 2, "raising this cap risks an out-of-memory kill"

    # A single-core machine still gets one worker, never zero.
    assert face_engine.safe_worker_count("accurate", available=1) == 1
    assert face_engine.safe_worker_count("fast", available=1) == 1

    # The CNN ladder pass must stay below the resolution measured as unsafe.
    for long_edge, _, _, model in face_engine.LADDERS["accurate"]:
        if model == "cnn":
            assert long_edge <= 1200, f"CNN pass at {long_edge}px is above the safe ceiling"
    assert face_engine.ENROLLMENT_DETECT_LONG_EDGE <= 1000, \
        "enrollment CNN detection resolution is above the safe ceiling"
    print(f"  ✓ CNN modes are capped at {face_engine.MAX_CNN_WORKERS} workers and bounded resolution")


def test_faceless_image_stops_after_running_every_pass(tmp):
    """
    A photo with no face exhausts the ladder and says how far it got.

    passes_run is what stops a cheap 'fast' scan that found nothing from being
    cached as proof for a later 'accurate' scan.
    """
    path = os.path.join(tmp, "no_face.png")
    _gradient_image(900, 700).save(path)

    result = face_engine.detect_and_encode(path, "fast")
    assert result["status"] == face_engine.NO_FACE, result
    assert result["pass_used"] == 0
    assert result["passes_run"] == face_engine.ladder_length("fast"), result
    print("  ✓ a faceless photo runs the whole ladder and records the depth")


def test_rotated_face_is_recovered_by_a_later_pass(tmp):
    """
    A sideways photo with no orientation tag is only found by a rotation pass.

    Needs a real face, so it reports and returns when the machine has none
    enrolled rather than asserting on a synthetic blob dlib would never detect.
    """
    source = _real_face_path()
    if not source:
        print("  - skipped (no enrolled photos on this machine to build a fixture from)")
        return

    upright = face_engine.load_upright(source)
    baseline = face_engine.detect_and_encode(source, "fast")
    if baseline["status"] != face_engine.OK:
        print("  - skipped (the sample photo has no detectable face)")
        return

    path = os.path.join(tmp, "sideways_untagged.jpg")
    upright.transpose(Image.Transpose.ROTATE_90).save(path, quality=95)

    # 'fast' has no rotation pass, so it must miss this on purpose.
    assert face_engine.detect_and_encode(path, "fast")["status"] == face_engine.NO_FACE

    recovered = face_engine.detect_and_encode(path, "balanced")
    assert recovered["status"] == face_engine.OK, "the rotation pass failed to recover a sideways face"
    assert recovered["pass_used"] >= 3, f"expected a rotation pass, got pass {recovered['pass_used']}"
    print(f"  ✓ a sideways untagged face is recovered at pass {recovered['pass_used']}")


# ── Matcher ─────────────────────────────────────────────────────────────────

def test_match_respects_the_tolerance_boundary():
    """Nearest neighbour inside the tolerance wins; outside it, nobody does."""
    anchor = np.zeros(128)
    gallery = [anchor.copy(), np.full(128, 1.0)]
    names = ["Near", "Far"]
    matrix, gallery_names = face_engine.build_gallery(gallery, names)

    tol = face_engine.FACE_RECOGNITION_TOLERANCE

    # Distance is the L2 norm over 128 dims, so per-component offset d gives
    # sqrt(128)*d. Place probes just inside and just outside the tolerance.
    inside = np.full(128, (tol * 0.9) / np.sqrt(128))
    outside = np.full(128, (tol * 1.1) / np.sqrt(128))

    assert np.linalg.norm(inside - anchor) < tol
    assert np.linalg.norm(outside - anchor) > tol

    assert face_engine.match_names([inside], matrix, gallery_names) == ["Near"]
    assert face_engine.match_names([outside], matrix, gallery_names) == ["Unknown"]
    print(f"  ✓ the {tol} tolerance boundary decides Near vs Unknown")


def test_match_with_an_empty_gallery_is_unknown():
    """No enrolled faces means Unknown, never a crash and never a wrong name."""
    matrix, names = face_engine.build_gallery([], [])
    assert matrix is None and names == []
    assert face_engine.match_names([np.zeros(128)], matrix, names) == ["Unknown"]
    print("  ✓ an empty gallery yields Unknown")


def test_match_reproduces_compare_faces():
    """
    The vectorised matcher must decide exactly what the old code decided.

    The original used face_recognition.compare_faces followed by argmin. This is
    the same rule written as one numpy op, so the two must agree on every probe.
    """
    rng = np.random.default_rng(0)
    gallery = [rng.normal(0, 0.12, 128) for _ in range(12)]
    names = [f"P{i % 4}" for i in range(12)]
    matrix, gallery_names = face_engine.build_gallery(gallery, names)
    tol = face_engine.FACE_RECOGNITION_TOLERANCE

    for _ in range(200):
        probe = rng.normal(0, 0.12, 128)
        distances = np.array([np.linalg.norm(np.asarray(g) - probe) for g in gallery])
        best = int(np.argmin(distances))
        expected = names[best] if distances[best] <= tol else "Unknown"
        assert face_engine.match_names([probe], matrix, gallery_names) == [expected]
    print("  ✓ the vectorised matcher agrees with the original rule over 200 probes")


def test_build_gallery_memo_tracks_its_source():
    """The one-entry memo must not hand back another list's matrix."""
    a = [np.zeros(128), np.ones(128)]
    b = [np.full(128, 0.5)]
    matrix_a, _ = face_engine.build_gallery(a, ["x", "y"])
    matrix_b, _ = face_engine.build_gallery(b, ["z"])
    assert matrix_a.shape == (2, 128)
    assert matrix_b.shape == (1, 128)
    again, _ = face_engine.build_gallery(a, ["x", "y"])
    assert again.shape == (2, 128), "the memo returned a stale matrix"
    print("  ✓ the gallery memo re-derives when the source list changes")


# ── Enrollment ──────────────────────────────────────────────────────────────

def test_largest_face_is_chosen_and_ties_are_flagged(tmp):
    """
    Enrollment must take the biggest face, and refuse to guess when two compete.

    The old code took face_encodings(...)[0] - dlib's first box, in no meaningful
    order - so a two-person enrollment photo could file a stranger under the
    person's name and poison matching in both directions.
    """
    source = _real_face_path()
    if not source:
        print("  - skipped (no enrolled photos on this machine to build a fixture from)")
        return

    face = face_engine.load_upright(source)
    single = face_engine.encode_largest_face(source, num_jitters=1)
    if single["status"] != face_engine.OK:
        print("  - skipped (the sample photo has no detectable face)")
        return
    assert single["ambiguous"] is False, "a single-subject portrait is not ambiguous"

    # Two copies of the same face at clearly different sizes: the big one wins and
    # the pair is not flagged, because 25% area is well under the 60% threshold.
    big = face_engine.resize_long_edge(face, 1000)
    small = big.resize((big.width // 2, big.height // 2), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (big.width + small.width + 60, big.height + 40), (240, 240, 240))
    canvas.paste(big, (10, 10))
    canvas.paste(small, (big.width + 40, 10))
    two_sizes = os.path.join(tmp, "big_and_small.jpg")
    canvas.save(two_sizes, quality=95)

    result = face_engine.encode_largest_face(two_sizes, num_jitters=1)
    if result["status"] == face_engine.OK and result["face_count"] >= 2:
        assert result["ambiguous"] is False, "a clearly larger subject should not be ambiguous"
        # The chosen encoding must be the big face, i.e. close to the solo encoding.
        distance = np.linalg.norm(result["encoding"] - single["encoding"])
        assert distance < face_engine.FACE_RECOGNITION_TOLERANCE, (
            f"picked a different face than the largest one (distance {distance:.3f})"
        )
        print(f"  ✓ the largest of {result['face_count']} faces is the one encoded")
    else:
        print("  - partially skipped (the composite did not yield two detections)")

    # Two equal-sized faces: unresolvable, so it must say so instead of guessing.
    twin = Image.new("RGB", (big.width * 2 + 60, big.height + 40), (240, 240, 240))
    twin.paste(big, (10, 10))
    twin.paste(big, (big.width + 40, 10))
    equal_path = os.path.join(tmp, "twins.jpg")
    twin.save(equal_path, quality=95)

    equal = face_engine.encode_largest_face(equal_path, num_jitters=1)
    if equal["status"] == face_engine.OK and equal["face_count"] >= 2:
        assert equal["ambiguous"] is True, "two equally sized faces must be flagged as ambiguous"
        print("  ✓ two equally sized faces are flagged rather than guessed at")
    else:
        print("  - partially skipped (the twin composite did not yield two detections)")


def test_outlier_pruning_drops_the_odd_one_out():
    """
    One wrong face in a person's samples must be dropped.

    Matching uses the nearest enrolled neighbour, so a single mislabelled sample
    silently captures strangers into that person's folder. Needs 3+ samples for
    the comparison to mean anything.
    """
    messages = []

    def callback(progress, message, level="info"):
        messages.append(message)

    rng = np.random.default_rng(7)
    tight = [rng.normal(0, 0.02, 128) for _ in range(4)]      # same person
    intruder = np.full(128, 0.5)                              # nothing like them
    encodings = tight + [intruder]
    paths = [f"ana_{i}.jpg" for i in range(4)] + ["stranger.jpg"]
    names = ["Ana"] * 5

    kept_names, kept_encodings, kept_paths = _prune_outliers(names, encodings, paths, callback)

    assert "stranger.jpg" not in kept_paths, "the mislabelled sample survived pruning"
    assert len(kept_paths) == 4, kept_paths
    assert any("stranger.jpg" in m for m in messages), "the drop was not reported to the user"
    print("  ✓ a mismatched enrollment photo is dropped and reported")


def test_pruning_keeps_small_and_consistent_sets():
    """Fewer than 3 samples, or a consistent set, must come through untouched."""
    rng = np.random.default_rng(11)

    pair = [rng.normal(0, 0.02, 128) for _ in range(2)]
    names, encodings, paths = _prune_outliers(
        ["Bo", "Bo"], pair, ["a.jpg", "b.jpg"], lambda *a, **k: None
    )
    assert len(paths) == 2, "two samples are too few to judge; both must be kept"

    consistent = [rng.normal(0, 0.02, 128) for _ in range(5)]
    names, encodings, paths = _prune_outliers(
        ["Cy"] * 5, consistent, [f"c{i}.jpg" for i in range(5)], lambda *a, **k: None
    )
    assert len(paths) == 5, "a consistent set must not be pruned"
    print("  ✓ small and consistent sets are left alone")


def test_duplicate_person_is_reported(tmp):
    """
    The same face enrolled under two names must be reported.

    A real run filed photos into a folder named 'p' alongside properly named
    people. The prune cannot catch that: 'p' had six mutually consistent
    encodings, because it was a real face - just under a junk name. Matching takes
    the nearest neighbour, so that person's photos get split between both folders.
    """
    from enrollment_logic import _warn_on_duplicate_people

    warnings = []

    def callback(progress, message, level="info"):
        if level == "warning":
            warnings.append(message)

    rng = np.random.default_rng(3)
    ana = [rng.normal(0, 0.02, 128) for _ in range(3)]
    # 'p' is the same face as Ana, enrolled again under a junk name.
    p = [vector + rng.normal(0, 0.01, 128) for vector in ana]
    # Someone genuinely different.
    bo = [np.full(128, 0.4) + rng.normal(0, 0.02, 128) for _ in range(3)]

    _warn_on_duplicate_people(
        ["Ana"] * 3 + ["p"] * 3 + ["Bo"] * 3, ana + p + bo, callback
    )

    assert len(warnings) == 1, f"expected exactly one duplicate pair, got {warnings}"
    assert "'Ana' and 'p'" in warnings[0], warnings[0]
    assert "Bo" not in warnings[0], "a genuinely different person was flagged as a duplicate"

    # Distinct people only: silence.
    warnings.clear()
    _warn_on_duplicate_people(["Ana"] * 3 + ["Bo"] * 3, ana + bo, callback)
    assert warnings == [], f"flagged distinct people: {warnings}"

    # A single person cannot collide with anyone.
    _warn_on_duplicate_people(["Ana"] * 3, ana, callback)
    assert warnings == []
    print("  ✓ the same face under two names is reported; distinct people are not")


def test_stale_gallery_is_detected(tmp):
    """A gallery written before the current recipe must be flagged for rebuild."""
    old = os.path.join(tmp, "old.pickle")
    with open(old, "wb") as f:
        pickle.dump({"encodings": [np.zeros(128)], "names": ["A"], "paths": ["a.jpg"]}, f)
    assert needs_rebuild(old) is True, "a version-less gallery is stale"

    current = os.path.join(tmp, "current.pickle")
    with open(current, "wb") as f:
        pickle.dump({"encodings": [np.zeros(128)], "names": ["A"],
                     "paths": ["a.jpg"], "version": GALLERY_VERSION}, f)
    assert needs_rebuild(current) is False, "a current gallery must not be rebuilt"

    empty = os.path.join(tmp, "empty.pickle")
    with open(empty, "wb") as f:
        pickle.dump({"encodings": [], "names": [], "paths": []}, f)
    assert needs_rebuild(empty) is False, "nothing to rebuild from an empty gallery"

    assert needs_rebuild(os.path.join(tmp, "absent.pickle")) is False
    print("  ✓ stale galleries are detected, current and empty ones are left alone")


# ── Cache ───────────────────────────────────────────────────────────────────

def test_cache_round_trip_and_invalidation(tmp):
    """
    A cached result comes back, and stops coming back once the file changes.

    Also checks the depth rule: a shallow scan that found nothing must not answer
    for a deeper one, or 'fast' would permanently mask what 'accurate' can find.
    """
    from metadata_store import MetadataStore

    db_dir = os.path.join(tmp, "cache_home")
    os.makedirs(db_dir, exist_ok=True)
    store = MetadataStore.__new__(MetadataStore)          # bypass startup compaction
    store._db_path = os.path.join(db_dir, "test_cache.db")
    store._init_db()

    path = os.path.join(tmp, "cached.png")
    _gradient_image(500, 400).save(path)
    version = face_engine.ENGINE_VERSION

    encoding = np.arange(128, dtype=np.float64) / 128.0
    store.face_cache_put(path, version, {
        "status": face_engine.OK, "encodings": [encoding],
        "pass_used": 1, "passes_run": 1,
    })

    hit = store.face_cache_get_many([path], version, ladder_length=2)
    assert path in hit, "a fresh row was not returned"
    assert np.allclose(hit[path]["encodings"][0], encoding), "the encoding did not survive the round trip"

    # A success from pass 1 is valid for any ladder that runs pass 1.
    assert path in store.face_cache_get_many([path], version, ladder_length=5)

    # Engine changes invalidate everything.
    assert store.face_cache_get_many([path], version + 1, ladder_length=2) == {}

    # Editing the file invalidates its row.
    _gradient_image(500, 401).save(path)
    assert store.face_cache_get_many([path], version, ladder_length=2) == {}, \
        "a modified file must be re-read, not served from cache"

    # Depth rule: 'no face' after 2 passes cannot answer a 4-pass request.
    store.face_cache_put(path, version, {
        "status": face_engine.NO_FACE, "encodings": [], "pass_used": 0, "passes_run": 2,
    })
    assert path in store.face_cache_get_many([path], version, ladder_length=2)
    assert store.face_cache_get_many([path], version, ladder_length=4) == {}, \
        "a shallow 'no face' must not satisfy a deeper scan"

    # A success found by pass 3 must not answer a request that only runs 2.
    store.face_cache_put(path, version, {
        "status": face_engine.OK, "encodings": [encoding], "pass_used": 3, "passes_run": 3,
    })
    assert store.face_cache_get_many([path], version, ladder_length=2) == {}, \
        "a result from a pass this mode does not run must not be reused"
    assert path in store.face_cache_get_many([path], version, ladder_length=4)

    assert store.face_cache_clear() >= 1
    assert store.face_cache_get_many([path], version, ladder_length=4) == {}
    print("  ✓ the cache round-trips, invalidates on edit, and respects scan depth")


def test_cache_ignores_missing_files(tmp):
    """Paths that no longer exist are simply absent, not an error."""
    from metadata_store import MetadataStore
    store = MetadataStore.__new__(MetadataStore)
    store._db_path = os.path.join(tmp, "missing.db")
    store._init_db()

    ghost = os.path.join(tmp, "never_existed.jpg")
    assert store.face_cache_get_many([ghost], face_engine.ENGINE_VERSION, 2) == {}
    store.face_cache_put(ghost, face_engine.ENGINE_VERSION,
                         {"status": face_engine.OK, "encodings": [], "pass_used": 1, "passes_run": 1})
    assert store.face_cache_get_many([], face_engine.ENGINE_VERSION, 2) == {}
    print("  ✓ missing files are skipped without raising")


# ── Space-sharing copies ────────────────────────────────────────────────────

def test_clone_is_independent_not_a_hardlink(tmp):
    """
    A cloned copy must be its own file, sharing only its blocks.

    This is the property that makes cloning safe to use for every copy: the
    destination is independent, so deleting or editing either side leaves the
    other alone, and the os.utime() stamp applied per destination still works.
    A hardlink would also save the space but fails all three - which is why
    hardlinks are not used.
    """
    import organizer_logic

    source = os.path.join(tmp, "clone_source.bin")
    payload = b"LocalLens clone test " * 4096          # ~86 KB, spans blocks
    with open(source, "wb") as f:
        f.write(payload)

    destination = os.path.join(tmp, "clone_dest.bin")
    cloned = organizer_logic.copy_preserving_space(source, destination)

    with open(destination, "rb") as f:
        assert f.read() == payload, "the copy does not match the original"

    source_stat = os.stat(source)
    dest_stat = os.stat(destination)
    assert dest_stat.st_ino != source_stat.st_ino, \
        "destination shares an inode with the source - that is a hardlink, not a clone"
    assert dest_stat.st_size == source_stat.st_size

    # Editing the copy must not touch the original, and vice versa.
    with open(destination, "wb") as f:
        f.write(b"overwritten")
    with open(source, "rb") as f:
        assert f.read() == payload, "editing the copy changed the original"

    # Deleting the original must leave the copy readable.
    second = os.path.join(tmp, "clone_dest2.bin")
    organizer_logic.copy_preserving_space(source, second)
    os.remove(source)
    with open(second, "rb") as f:
        assert f.read() == payload, "deleting the original damaged the copy"

    note = "cloned" if cloned else "fell back to a byte copy (not APFS)"
    print(f"  ✓ copies are independent files, not hardlinks ({note})")


def test_copy_falls_back_when_cloning_is_unavailable(tmp):
    """
    With clonefile unavailable the copy must still happen, byte for byte.

    This is the Windows / non-APFS / cross-volume path. A clone failure is never
    allowed to become a copy failure, because that would lose the user's photo.
    """
    import organizer_logic

    source = os.path.join(tmp, "fallback_source.bin")
    payload = b"fallback payload " * 512
    with open(source, "wb") as f:
        f.write(payload)

    destination = os.path.join(tmp, "fallback_dest.bin")
    saved_fn, saved_checked = organizer_logic._clonefile, organizer_logic._clonefile_checked
    try:
        organizer_logic._clonefile = None
        organizer_logic._clonefile_checked = True     # pretend the platform has none
        cloned = organizer_logic.copy_preserving_space(source, destination)
    finally:
        organizer_logic._clonefile, organizer_logic._clonefile_checked = saved_fn, saved_checked

    assert cloned is False, "reported a clone when cloning was disabled"
    with open(destination, "rb") as f:
        assert f.read() == payload, "the fallback copy is not identical"
    assert os.stat(destination).st_mtime == os.stat(source).st_mtime, \
        "the fallback must preserve metadata, as shutil.copy2 did before"
    print("  ✓ with cloning unavailable the copy still succeeds byte for byte")


def test_space_savings_are_reported_only_when_real(tmp):
    """The completion line must not claim a saving that did not happen."""
    import organizer_logic

    organizer_logic.reset_space_stats()
    assert organizer_logic.format_space_savings() == "", \
        "reported a saving before anything was copied"

    source = os.path.join(tmp, "stats_source.bin")
    with open(source, "wb") as f:
        f.write(b"x" * (3 * 1024 * 1024))            # 3 MB

    for index in range(2):
        organizer_logic.copy_preserving_space(source, os.path.join(tmp, f"stats_{index}.bin"))

    message = organizer_logic.format_space_savings()
    if organizer_logic._get_clonefile() is not None:
        assert "2 shared on disk" in message, message
        assert "MB" in message or "GB" in message, message
    else:
        assert message == "", "claimed a saving on a filesystem that cannot clone"

    organizer_logic.reset_space_stats()
    assert organizer_logic.format_space_savings() == "", "reset did not clear the counters"
    print("  ✓ space savings are reported only when cloning actually happened")


# ── Contract with the rest of the app ───────────────────────────────────────

def test_recognize_faces_contract_is_unchanged(tmp):
    """
    organizer_logic.recognize_faces must still answer in three ways.

    _core_processing_loop, find_and_group_photos, the scheduler daemon and the MCP
    tools all depend on this exact contract: a list of names, [] for a faceless
    photo, None for a file that could not be read.
    """
    import organizer_logic

    gallery = [np.zeros(128)]
    names = ["Somebody"]

    faceless = os.path.join(tmp, "contract_no_face.png")
    _gradient_image(600, 400).save(faceless)
    assert organizer_logic.recognize_faces(faceless, gallery, names, mode="fast") == []

    broken = os.path.join(tmp, "contract_broken.jpg")
    with open(broken, "wb") as f:
        f.write(b"nope")
    assert organizer_logic.recognize_faces(broken, gallery, names, mode="fast") is None

    # Constants the app still reads off this module.
    assert organizer_logic.FACE_RECOGNITION_TOLERANCE == face_engine.FACE_RECOGNITION_TOLERANCE
    assert ".heic" in organizer_logic.SUPPORTED_EXTENSIONS
    assert organizer_logic.UNKNOWN_PEOPLE_FOLDER_NAME == "Unknown_Faces"
    assert organizer_logic.NO_FACES_FOLDER_NAME == "No_Faces_Found"
    print("  ✓ recognize_faces keeps its three-way contract and the constants hold")


def test_enrollment_accepts_the_formats_the_sorter_reads():
    """
    Enrollment used to accept only jpg/png.

    A user enrolling HEIC selfies got "no new images to enroll" and an empty
    gallery, with nothing explaining why.
    """
    import enrollment_logic
    import organizer_logic

    assert enrollment_logic.SUPPORTED_FORMATS == organizer_logic.SUPPORTED_EXTENSIONS
    for ext in (".heic", ".heif", ".webp", ".dng", ".avif"):
        assert ext in enrollment_logic.SUPPORTED_FORMATS, ext
    print("  ✓ enrollment accepts every format the sorter can read")


def test_pass_kind_labels_by_pass_not_by_index():
    """
    Recovery labels must come from the ladder, not from the pass number.

    The first version counted `pass_used >= 3` as "rotating". In accurate mode
    pass 5 is the CNN scan, so a real 75-photo run reported 12 photos as "found
    only after rotating" when most of them were deep-scan finds. 12 sideways
    photos out of 75 was never plausible for a phone library.
    """
    # Accurate: 1 = L1024 HOG, 2 = L1600 HOG, 3 = +90, 4 = -90, 5 = CNN.
    assert face_engine.pass_kind("accurate", 1) == "first"
    assert face_engine.pass_kind("accurate", 2) == "rescale"
    assert face_engine.pass_kind("accurate", 3) == "rotation"
    assert face_engine.pass_kind("accurate", 4) == "rotation"
    assert face_engine.pass_kind("accurate", 5) == "cnn", "pass 5 is CNN, not a rotation"

    assert face_engine.pass_kind("fast", 1) == "first"
    assert face_engine.pass_kind("fast", 2) == "rescale"
    assert face_engine.pass_kind("balanced", 3) == "rotation"

    # 0 means nothing was found; out-of-range must not raise.
    assert face_engine.pass_kind("accurate", 0) == ""
    assert face_engine.pass_kind("fast", 99) == ""

    # Every pass in every ladder must have a label, or a recovery goes uncounted.
    for mode, ladder in face_engine.LADDERS.items():
        for index in range(1, len(ladder) + 1):
            assert face_engine.pass_kind(mode, index) in {"first", "rescale", "rotation", "cnn"}, \
                f"{mode} pass {index} has no label"
    print("  ✓ pass labels come from the ladder, so CNN is not reported as rotation")


def test_diagnostics_summary_reports_recoveries():
    """The end-of-job line must name the recoveries, or the fix is unverifiable."""
    import organizer_logic

    summary = organizer_logic.format_face_diagnostics({
        "total": 1240, "with_faces": 1180, "no_face": 42, "unreadable": 18,
        "cached": 300, "recovered_by_rescale": 31, "recovered_by_rotation": 12,
        "recovered_by_cnn": 7,
    })
    for fragment in ("1240 photos", "1180 with faces", "42 without",
                     "18 unreadable", "31 found only at higher resolution",
                     "12 found only after rotating", "7 found only by the deep scan",
                     "300 reused from cache"):
        assert fragment in summary, f"missing '{fragment}' in: {summary}"

    quiet = organizer_logic.format_face_diagnostics({
        "total": 10, "with_faces": 10, "no_face": 0, "unreadable": 0,
        "cached": 0, "recovered_by_rescale": 0, "recovered_by_rotation": 0,
        "recovered_by_cnn": 0,
    })
    assert "unreadable" not in quiet, quiet
    assert "cache" not in quiet, quiet
    assert "deep scan" not in quiet, quiet
    print("  ✓ the job summary reports recoveries and stays quiet when there are none")


def test_recoveries_are_counted_into_the_right_buckets(tmp):
    """
    A real recovery must land in the bucket its pass belongs to.

    Checks the whole path - _recognize_all's counting, not just pass_kind - using
    a sideways untagged photo, which only a rotation pass can find.
    """
    import organizer_logic

    source = _real_face_path()
    if not source:
        print("  - skipped (no enrolled photos on this machine to build a fixture from)")
        return

    upright = face_engine.load_upright(source)
    if face_engine.detect_and_encode(source, "fast")["status"] != face_engine.OK:
        print("  - skipped (the sample photo has no detectable face)")
        return

    sideways = os.path.join(tmp, "bucket_sideways.jpg")
    upright.transpose(Image.Transpose.ROTATE_90).save(sideways, quality=95)

    gallery = [np.zeros(128)]
    names = ["Somebody"]
    counted = organizer_logic._recognize_all(
        [sideways], "balanced", gallery, names,
        update_callback=lambda *a, **k: None, cancellation_event=None,
        analytics={}, cache=None,
    )[1]

    assert counted["with_faces"] == 1, counted
    assert counted["recovered_by_rotation"] == 1, \
        f"a sideways photo should count as a rotation recovery, got {counted}"
    assert counted["recovered_by_rescale"] == 0, counted
    assert counted["recovered_by_cnn"] == 0, "balanced mode has no CNN pass"
    print("  ✓ a sideways photo is counted as a rotation recovery, not a rescale or deep scan")


def test_recognize_all_matches_single_file_results(tmp):
    """
    The parallel pass must produce what per-file recognition produced.

    This is the safety net on the change from an inline call per photo to one
    batched pass: if the two ever disagree, photos land in different folders.
    """
    import organizer_logic

    paths = []
    for i in range(6):
        path = os.path.join(tmp, f"batch_{i}.png")
        _gradient_image(400 + i * 10, 300).save(path)
        paths.append(path)
    broken = os.path.join(tmp, "batch_broken.jpg")
    with open(broken, "wb") as f:
        f.write(b"not an image")
    paths.append(broken)

    gallery = [np.zeros(128)]
    names = ["Somebody"]

    face_names, diagnostics = organizer_logic._recognize_all(
        paths, "fast", gallery, names,
        update_callback=lambda *a, **k: None,
        cancellation_event=None,
        analytics={},
        cache=None,
    )

    assert diagnostics["total"] == len(paths)
    assert diagnostics["unreadable"] == 1, diagnostics
    assert diagnostics["no_face"] == 6, diagnostics

    for path in paths:
        expected = organizer_logic.recognize_faces(path, gallery, names, mode="fast")
        assert face_names.get(path) == expected, (
            f"batched and per-file results disagree for {os.path.basename(path)}: "
            f"{face_names.get(path)!r} vs {expected!r}"
        )
    print(f"  ✓ the parallel pass agrees with per-file recognition over {len(paths)} files")


# ── Runner ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    tmp = tempfile.mkdtemp(prefix="locallens_face_test_")
    tests = [
        ("loader", [
            test_exif_orientation_is_applied,
            test_untagged_image_is_left_alone,
            test_unreadable_file_reports_rather_than_crashes,
            test_resize_uses_the_long_edge,
        ]),
        ("ladder", [
            test_ladders_are_prefixes_of_each_other,
            test_cnn_modes_cap_their_worker_count,
            test_pass_kind_labels_by_pass_not_by_index,
            test_faceless_image_stops_after_running_every_pass,
            test_rotated_face_is_recovered_by_a_later_pass,
        ]),
        ("matcher", [
            test_match_respects_the_tolerance_boundary,
            test_match_with_an_empty_gallery_is_unknown,
            test_match_reproduces_compare_faces,
            test_build_gallery_memo_tracks_its_source,
        ]),
        ("enrollment", [
            test_largest_face_is_chosen_and_ties_are_flagged,
            test_outlier_pruning_drops_the_odd_one_out,
            test_pruning_keeps_small_and_consistent_sets,
            test_duplicate_person_is_reported,
            test_stale_gallery_is_detected,
        ]),
        ("cache", [
            test_cache_round_trip_and_invalidation,
            test_cache_ignores_missing_files,
        ]),
        ("storage", [
            test_clone_is_independent_not_a_hardlink,
            test_copy_falls_back_when_cloning_is_unavailable,
            test_space_savings_are_reported_only_when_real,
        ]),
        ("contracts", [
            test_recognize_faces_contract_is_unchanged,
            test_enrollment_accepts_the_formats_the_sorter_reads,
            test_diagnostics_summary_reports_recoveries,
            test_recoveries_are_counted_into_the_right_buckets,
            test_recognize_all_matches_single_file_results,
        ]),
    ]

    count = 0
    try:
        for group, functions in tests:
            print(f"\n{group}:")
            for function in functions:
                if function.__code__.co_argcount:
                    function(tmp)
                else:
                    function()
                count += 1
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print(f"\n✅ All {count} tests passed!")
