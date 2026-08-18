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

from main import _phash, _group_by_hash

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

    print("test_phash: all assertions passed")


if __name__ == "__main__":
    demo()
