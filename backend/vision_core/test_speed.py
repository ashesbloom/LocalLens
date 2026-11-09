"""Plain-script tests: python -m vision_core.test_speed"""
import json
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

from vision_core import speed

CFG = {"image_size": [8, 8], "resample": "bilinear", "mean": [0.5] * 3, "std": [0.5] * 3, "dim": 4}


class FakeEncoder:
    def __init__(self):
        self.cfg, self.images, self.texts = dict(CFG), 0, 0

    def embed_arrays(self, x):
        assert x.shape[1:] == (3, 8, 8), x.shape
        self.images += len(x)
        return np.ones((len(x), 4), np.float32) / 2

    def embed_texts(self, texts):
        self.texts += len(texts)
        return np.ones((len(texts), 4), np.float32) / 2


def test_one_decode_feeds_every_view():
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        for i, size in enumerate([(64, 48), (48, 64), (50, 50)]):
            Image.new("RGB", size, (i * 40, 90, 160)).save(d / f"p{i}.jpg")
        (d / "broken.jpg").write_bytes(b"not a photo")
        a, b = FakeEncoder(), FakeEncoder()
        paths = sorted(str(p) for p in d.glob("*.jpg"))
        seen = []
        r = speed.run(paths, {"a": (a, 4), "b": (b, 1)}, batch=2, workers=1, queries=["dog", "cat"],
                      progress=lambda i, n: seen.append((i, n)))
        assert seen[-1] == (4, 4) and len(seen) == 4, seen
        assert r["photos"] == 4 and r["unreadable"] == 1, r
        assert a.images == 3 * 4 and b.images == 3 * 1, (a.images, b.images)   # whole + 3 crops; whole only
        assert r["models"]["a"]["images"] == 12 and r["models"]["b"]["images"] == 3
        assert r["photos_per_s"] > 0 and r["seconds"] > 0
        assert r["peak_rss_mb"]["main"] > 0
        assert a.texts == 2 and r["query"]["gallery"] == 10_000 and r["query"]["ms_per_query"] >= 0
        json.dumps(r)   # the report is what testers send back


def test_fixed_batches_pad_and_trim():
    seen = []

    def fn(x):   # a model that only takes exactly 3 rows
        assert len(x) == 3, len(x)
        seen.append(x.copy())
        return x[:, :2] * 2
    x = np.arange(7 * 4, dtype=np.float32).reshape(7, 4)
    out = speed.fixed_batches(x, 3, fn)
    assert out.shape == (7, 2) and np.allclose(out, x[:, :2] * 2), out
    assert len(seen) == 3 and not seen[-1][1:].any(), "last batch padded with zeros"


def test_parity_cosines():
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        for i in range(2):
            Image.new("RGB", (64, 48), (i * 90, 30, 200)).save(d / f"p{i}.jpg")
        a, b = FakeEncoder(), FakeEncoder()
        r = speed.parity(sorted(str(p) for p in d.glob("*.jpg")), a, b, 4)
        assert r["images"] == 8 and abs(r["min"] - 1.0) < 1e-6 and abs(r["median"] - 1.0) < 1e-6, r


def test_machine_facts_are_read_on_every_os():
    """The memory and RAM readers differ per OS (Windows uses the Win32 API); CI runs this on Windows too."""
    m = speed.machine()
    assert m["ram_gb"] > 0 and m["cores"] and m["onnxruntime"], m
    assert speed._peak_mb()["main"] > 0


def test_views():
    img = Image.new("RGB", (60, 40))
    v = speed.views(img, 4)
    assert [x.size for x in v] == [(60, 40), (40, 40), (40, 40), (40, 40)]
    assert len(speed.views(img, 1)) == 1


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"  ok  {t.__name__}")
    print(f"{len(tests)}/{len(tests)} passed")
