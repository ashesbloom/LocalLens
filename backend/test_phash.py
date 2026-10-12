"""
Self-check for the perceptual hashing behind /api/find-duplicates.

Plain asserts, no framework. Run it directly:  python test_phash.py

Covers the three things that would silently break duplicate detection:
  - a re-encoded copy still hashes close enough to group,
  - an unrelated photo does not join the group,
  - an EXIF-rotated photo hashes the same as its baked-in-rotation twin
    (this is why _phash decodes via load_upright, not Image.open).
"""

import os
import tempfile

import numpy as np
from PIL import Image

from main import _phash, _group_by_hash, _keeper_rank

# Matches the default similarity_threshold of 0.95 in FindDuplicatesRequest.
MAX_DISTANCE = int(64 * (1.0 - 0.95))


def _hamming(a, b):
    return bin(int(a) ^ int(b)).count("1")


def _photo(seed, size=(640, 480)):
    """
    A deterministic, photo-like image: broad low-frequency structure with a little
    grain. The low frequencies matter — pHash keeps the top-left 8x8 DCT block, so
    a fixture built from fine detail near Nyquist genuinely changes content when
    downsampled and will not match its own resized copy. (Verified: the real
    imagehash library scores such a pair exactly as far apart as we do, so that
    would be a bad fixture rather than a broken hash.)
    """
    rng = np.random.default_rng(seed)
    w, h = size
    y, x = np.mgrid[0:h, 0:w]
    base = (np.sin(x / rng.uniform(60, 160)) + np.cos(y / rng.uniform(60, 160))) * 60 + 128
    base += rng.normal(0, 3, base.shape)
    rgb = np.stack([np.clip(base + rng.uniform(-30, 30), 0, 255) for _ in range(3)], axis=-1)
    return Image.fromarray(rgb.astype(np.uint8), "RGB")


def demo():
    with tempfile.TemporaryDirectory() as d:
        original = os.path.join(d, "original.jpg")
        exact = os.path.join(d, "exact_copy.jpg")
        resized = os.path.join(d, "resized.jpg")
        unrelated = os.path.join(d, "unrelated.jpg")

        img = _photo(seed=1)
        img.save(original, quality=95)
        img.save(exact, quality=95)
        # A resized, re-encoded copy — the near-duplicate case pHash exists for.
        # Kept to a mild re-export (90% scale, q85) on purpose: the default
        # threshold of 0.95 allows a hamming distance of only 3, and an aggressive
        # downscale (say half size at q70) genuinely exceeds that. Measured against
        # the real imagehash library, which scores such a pair identically — so a
        # harsher transform here would assert something the feature never promised.
        img.resize((576, 432), Image.Resampling.LANCZOS).save(resized, quality=85)
        _photo(seed=999).save(unrelated, quality=95)

        h_orig = _phash(original)
        assert h_orig is not None, "the original failed to decode"

        # --- stable across a re-encode, and tolerant of a resize ---
        assert _hamming(h_orig, _phash(exact)) == 0, "re-encoded copy changed the hash"
        d_resized = _hamming(h_orig, _phash(resized))
        assert d_resized <= MAX_DISTANCE, f"resized copy too far: {d_resized} > {MAX_DISTANCE}"

        # --- an unrelated photo must stay out ---
        d_unrelated = _hamming(h_orig, _phash(unrelated))
        assert d_unrelated > MAX_DISTANCE, f"unrelated photo collided: {d_unrelated}"

        # --- grouping: one group of three, keeper first, unrelated excluded ---
        paths = [original, exact, resized, unrelated]
        groups = _group_by_hash([(p, _phash(p)) for p in paths], MAX_DISTANCE)
        assert len(groups) == 1, f"expected exactly one group, got {groups}"
        assert groups[0][0] == original, "the seed file must be the keeper"
        assert set(groups[0]) == {original, exact, resized}, f"wrong members: {groups[0]}"
        assert unrelated not in groups[0]

        # --- an unreadable file yields None rather than raising ---
        broken = os.path.join(d, "broken.jpg")
        with open(broken, "wb") as f:
            f.write(b"not an image")
        assert _phash(broken) is None, "a corrupt file must return None, not a hash"

        # --- EXIF orientation: a rotated photo and its baked-in twin must match ---
        # Image.open alone would hash these differently and never group them, which
        # is exactly the phone-original vs exported-copy duplicate.
        # Lossless PNG on purpose: with no codec noise in the way, correct
        # orientation handling means the two hashes are *exactly* equal, so this
        # asserts 0 rather than a threshold and cannot pass by luck.
        upright = os.path.join(d, "upright.png")
        tagged = os.path.join(d, "tagged.png")
        portrait = _photo(seed=7, size=(480, 640))
        portrait.save(upright)
        # Store it rotated on disk with Orientation=6 ("rotate 90° CW to display"),
        # so a correct loader recovers the same picture as `upright`.
        exif = Image.Exif()
        exif[0x0112] = 6
        portrait.transpose(Image.Transpose.ROTATE_90).save(tagged, exif=exif)
        d_exif = _hamming(_phash(upright), _phash(tagged))
        assert d_exif == 0, (
            f"EXIF-rotated copy did not match its upright twin (distance {d_exif}) — "
            "is _phash still decoding via load_upright?"
        )

        # --- /api/thumbnail: serves scan results only, odd filenames included ---
        import asyncio
        import io
        import main
        from fastapi import HTTPException

        def thumb(path):
            try:
                r = asyncio.run(main.thumbnail_endpoint(path=path))
                return r.status_code, r.media_type, Image.open(io.BytesIO(r.body)).size
            except HTTPException as e:
                return e.status_code, None, None

        odd = os.path.join(d, "Goa trip #1 & café 😀.jpg")
        _photo(seed=3, size=(1600, 1200)).save(odd, quality=90)
        main.current_job_state["duplicate_groups"] = [[odd, original, broken]]
        status, mime, size = thumb(odd)
        assert status == 200 and mime == "image/jpeg", (status, mime)
        assert max(size) <= 320, f"thumbnail not downscaled: {size}"
        assert thumb(unrelated)[0] == 403, "a path outside the scan must be refused"
        assert thumb(broken)[0] == 404, "an undecodable grouped file must be a 404"
        main.current_job_state["duplicate_groups"] = []
        assert thumb(odd)[0] == 403, "a cleared scan must not keep serving files"

    # --- keeper ranking: the best copy of a group sorts first ---
    def info(w, h, size, mtime):
        return {"width": w, "height": h, "bytes": size, "mtime": mtime}

    def best(*candidates):
        return min(candidates, key=lambda c: _keeper_rank(*c))[0]

    # Resolution beats file size and age: a big re-compressed original still wins
    # over a small export that happens to be heavier and older.
    assert best(("/p/export.jpg", info(1200, 900, 9_000_000, 100)),
                ("/p/original.jpg", info(4000, 3000, 3_000_000, 200))) == "/p/original.jpg"
    # Same pixels: the larger file is the less compressed one.
    assert best(("/p/a.jpg", info(100, 100, 500, 100)),
                ("/p/b.jpg", info(100, 100, 900, 200))) == "/p/b.jpg"
    # Same pixels and bytes: a Finder/Explorer copy name loses even when older.
    assert best(("/p/IMG_1 copy.jpg", info(100, 100, 500, 1)),
                ("/p/IMG_1 (2).jpg", info(100, 100, 500, 1)),
                ("/p/IMG_1 copy 3.JPG", info(100, 100, 500, 1)),
                ("/p/IMG_1.jpg", info(100, 100, 500, 300))) == "/p/IMG_1.jpg"
    # "copy" inside a real name is not a copy marker.
    assert best(("/p/copycat.jpg", info(100, 100, 500, 1)),
                ("/p/zebra.jpg", info(100, 100, 500, 2))) == "/p/copycat.jpg"
    # Everything else equal: the older file is the original.
    assert best(("/p/x.jpg", info(100, 100, 500, 200)),
                ("/p/y.jpg", info(100, 100, 500, 100))) == "/p/y.jpg"
    # A RAW master beats its camera JPEG even when Pillow only read the RAW's tiny
    # embedded preview (NEF/DNG/ARW open as TIFF at 160x120, so pixels lie).
    assert best(("/p/IMG_2.JPG", info(6000, 4000, 8_000_000, 1)),
                ("/p/IMG_2.NEF", info(160, 120, 25_000_000, 1))) == "/p/IMG_2.NEF"

    # --- links: a symlink or hard link is the same file, never its duplicate ---
    import asyncio
    import main
    main._phash_store = lambda: None   # never touch the real fingerprint cache
    with tempfile.TemporaryDirectory() as d:
        real = os.path.join(d, "real.jpg")
        _photo(seed=5).save(real, quality=95)
        copy = os.path.join(d, "z_copy.jpg")
        _photo(seed=5).save(copy, quality=95)
        os.symlink(real, os.path.join(d, "a_link.jpg"))   # sorts first: would be kept
        os.link(real, os.path.join(d, "b_hard.jpg"))      # same inode as real.jpg
        asyncio.run(main.run_find_duplicates_task(
            {"source_folder": d, "ignore_list": [], "max_distance": MAX_DISTANCE}))
        groups = main.current_job_state["duplicate_groups"]
        assert len(groups) == 1, f"expected one group (real + copy), got {groups}"
        names = sorted(os.path.basename(p) for p in groups[0])
        assert names in (["real.jpg", "z_copy.jpg"], ["b_hard.jpg", "z_copy.jpg"]), \
            f"a link was grouped with its own target: {names}"

    # --- library compare: only card-vs-library groups, library copy first ---
    from fastapi import BackgroundTasks, HTTPException
    from metadata_store import MetadataStore
    from pathlib import Path
    with tempfile.TemporaryDirectory() as d:
        lib, card = os.path.join(d, "Library"), os.path.join(d, "Card")
        os.makedirs(lib); os.makedirs(card)
        _photo(seed=21).save(os.path.join(lib, "A.jpg"), quality=95)
        _photo(seed=21).save(os.path.join(card, "A.jpg"), quality=95)       # already in library
        _photo(seed=22).save(os.path.join(lib, "B.jpg"), quality=95)
        _photo(seed=22).save(os.path.join(lib, "B2.jpg"), quality=95)       # library-internal dupe: not reported
        _photo(seed=23).save(os.path.join(card, "C.jpg"), quality=95)       # new
        _photo(seed=24).save(os.path.join(card, "D.jpg"), quality=95)
        _photo(seed=24).save(os.path.join(card, "D2.jpg"), quality=95)      # card-internal dupe: both new
        open(os.path.join(card, "broken.jpg"), "wb").write(b"no")           # unreadable: counts as new

        store = MetadataStore.__new__(MetadataStore)
        store._db_path = Path(d) / "m.db"; store._init_db()
        main._phash_store = lambda: store
        decodes = []
        real_load = main.load_upright
        main.load_upright = lambda p: (decodes.append(p), real_load(p))[1]

        def compare():
            asyncio.run(main.run_find_duplicates_task({"source_folder": card, "ignore_list": [],
                                                       "library_folder": lib, "max_distance": MAX_DISTANCE}))
            return main.current_job_state

        s = compare()
        assert s["duplicate_groups"] == [[os.path.join(lib, "A.jpg"), os.path.join(card, "A.jpg")]], s["duplicate_groups"]
        assert s["duplicate_files"][os.path.join(lib, "A.jpg")]["in_library"] is True
        assert s["duplicate_files"][os.path.join(card, "A.jpg")]["in_library"] is False
        assert sorted(map(os.path.basename, s["new_files"])) == ["C.jpg", "D.jpg", "D2.jpg", "broken.jpg"], s["new_files"]
        assert s["library_folder"] == lib

        # Second run: every readable file comes from the cache (only broken.jpg is re-tried).
        decodes.clear(); compare()
        assert [os.path.basename(p) for p in decodes] == ["broken.jpg"], decodes
        # An edited photo is re-decoded rather than served a stale fingerprint.
        st = os.stat(os.path.join(lib, "B.jpg")); os.utime(os.path.join(lib, "B.jpg"), (st.st_atime, st.st_mtime + 5))
        decodes.clear(); compare()
        assert sorted(map(os.path.basename, decodes)) == ["B.jpg", "broken.jpg"], decodes
        main.load_upright = real_load
        main._phash_store = lambda: None

        # Overlapping folders are refused before anything is scanned.
        main.current_job_state["is_active"] = False
        for src, libf in [(card, card), (d, lib), (lib, d)]:
            try:
                asyncio.run(main.find_duplicates_endpoint(
                    main.FindDuplicatesRequest(source_folder=src, library_folder=libf), BackgroundTasks()))
                raise AssertionError(f"overlap not refused: {src} vs {libf}")
            except HTTPException as e:
                assert e.status_code == 400, e
        assert main.current_job_state["is_active"] is False, "a refused request must not claim the job slot"

    print("test_phash: all assertions passed")


if __name__ == "__main__":
    demo()
