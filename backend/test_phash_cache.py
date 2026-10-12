"""Self-check for the pHash cache. Plain asserts. Run: python test_phash_cache.py"""
import os
import tempfile
from pathlib import Path

from metadata_store import MetadataStore


def store_at(d):
    s = MetadataStore.__new__(MetadataStore)   # skip the real ~/.config DB
    s._db_path = Path(d) / "m.db"
    s._init_db()
    return s


def demo():
    with tempfile.TemporaryDirectory() as d:
        s = store_at(d)
        f = os.path.join(d, "a.jpg")
        open(f, "wb").write(b"x" * 10)
        st = os.stat(f)
        big = (1 << 64) - 1                       # top bit set: must survive SQLite's signed INTEGER
        s.phash_cache_put_many([(f, st.st_size, st.st_mtime, big, 4000, 3000)])
        assert s.phash_cache_get_many([f]) == {f: {"phash": big, "width": 4000, "height": 3000}}

        os.utime(f, (st.st_atime, st.st_mtime + 5))  # edited photo: stale row is ignored
        assert s.phash_cache_get_many([f]) == {}
        assert s.phash_cache_get_many([os.path.join(d, "missing.jpg")]) == {}

        st = os.stat(f)
        s.phash_cache_put_many([(f, st.st_size, st.st_mtime, 7, 1, 1)])
        s.purge_all()
        assert s.phash_cache_get_many([f]) == {}, "privacy purge must clear the cache"
    print("test_phash_cache: all assertions passed")


if __name__ == "__main__":
    demo()
