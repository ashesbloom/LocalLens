"""
Full-pipeline speed and memory (S9, gate G6). Each photo is decoded once, every model's views are cut from that one
image (SigLIP: whole photo + 3 square crops, D19; PE: whole photo), and the report says photos/s, where the time
went, peak memory and query time, as JSON. The same code runs in the test app on the testers' machines, so the
numbers are comparable. Numbers only: no paths, names or photo content are reported.

  python -m vision_core speed <folder> [--limit 200] [--out report.json]
"""
import os
import platform
import sys
import time
from multiprocessing import Pool

import numpy as np

import face_engine
from .encoder import crop_view, preprocess

_specs = None   # per worker: [(name, cfg, n_views)]


def views(img, n):
    """The whole photo, then (n > 1) the 3 square crops the `crops` option scores (encoder.crop_view)."""
    return [img] + [crop_view(img, k) for k in range(1, 4)] if n > 1 else [img]


def _init(specs):
    global _specs
    _specs = specs
    try:
        from pillow_heif import register_heif_opener
        register_heif_opener()
    except Exception:
        pass


def _decode(path):
    """path -> {model: (n_views,3,H,W) float32}, or None when nothing decodes it. Never raises (pool worker)."""
    try:
        img = face_engine.load_upright(path)
        if img is None:
            return None
        return {name: np.stack([preprocess(v, cfg) for v in views(img, n)]) for name, cfg, n in _specs}
    except Exception:
        return None


def _peak_mb():
    """Peak resident memory of this process and of its largest finished worker, in MB."""
    try:
        import resource
        k = 1 if sys.platform == "darwin" else 1024   # ru_maxrss: bytes on macOS, KB on Linux
        return {"main": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * k / 2**20),
                "largest_worker": round(resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss * k / 2**20)}
    except ImportError:   # Windows
        import ctypes
        from ctypes import wintypes

        class PMC(ctypes.Structure):
            _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD)] + \
                       [(f, ctypes.c_size_t) for f in ("PeakWorkingSetSize", "WorkingSetSize", "QuotaPeakPagedPoolUsage",
                        "QuotaPagedPoolUsage", "QuotaPeakNonPagedPoolUsage", "QuotaNonPagedPoolUsage",
                        "PagefileUsage", "PeakPagefileUsage")]
        pmc = PMC()
        pmc.cb = ctypes.sizeof(pmc)
        ctypes.windll.psapi.GetProcessMemoryInfo(ctypes.windll.kernel32.GetCurrentProcess(), ctypes.byref(pmc), pmc.cb)
        # ponytail: workers' peak is not read on Windows; add a per-worker report if the main number looks low
        return {"main": round(pmc.PeakWorkingSetSize / 2**20), "largest_worker": None}


def machine():
    """What the numbers ran on: OS, CPU, cores, RAM. Nothing that identifies the person."""
    try:
        ram = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
    except (ValueError, OSError, AttributeError):   # Windows
        import ctypes

        class MS(ctypes.Structure):
            _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong)] + \
                       [(f, ctypes.c_ulonglong) for f in ("ullTotalPhys", "ullAvailPhys", "ullTotalPageFile",
                        "ullAvailPageFile", "ullTotalVirtual", "ullAvailVirtual", "ullAvailExtendedVirtual")]
        ms = MS()
        ms.dwLength = ctypes.sizeof(ms)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(ms))
        ram = ms.ullTotalPhys
    return {"os": platform.platform(), "machine": platform.machine(), "cpu": platform.processor() or platform.machine(),
            "cores": os.cpu_count(), "ram_gb": round(ram / 2**30, 1), "python": platform.python_version()}


def run(paths, encoders, batch=8, workers=None, queries=("a dog on the beach",) * 10, gallery=10_000, progress=None):
    """encoders: {name: (encoder, n_views)}. Decodes in a pool, embeds in this process (onnxruntime uses the cores)."""
    specs = [(name, enc.cfg, n) for name, (enc, n) in encoders.items()]
    busy = {name: 0.0 for name in encoders}
    images = {name: 0 for name in encoders}
    pending = {name: [] for name in encoders}
    unreadable = 0

    def flush(name, force=False):
        while pending[name] and (force or sum(len(x) for x in pending[name]) >= batch):
            x = np.concatenate(pending[name])
            pending[name].clear()
            t = time.perf_counter()
            encoders[name][0].embed_arrays(x)
            busy[name] += time.perf_counter() - t
            images[name] += len(x)

    t0 = time.perf_counter()
    workers = workers or max(1, (os.cpu_count() or 2) - 1)
    with Pool(workers, initializer=_init, initargs=(specs,)) as pool:
        for i, out in enumerate(pool.imap(_decode, paths, chunksize=2), 1):
            if progress:
                progress(i, len(paths))
            if out is None:
                unreadable += 1
                continue
            for name, x in out.items():
                pending[name].append(x)
                flush(name)
        for name in encoders:
            flush(name, force=True)
    wall = time.perf_counter() - t0
    done = len(paths) - unreadable
    report = {"photos": len(paths), "unreadable": unreadable, "seconds": round(wall, 2),
              "photos_per_s": round(done / wall, 2) if wall else None,
              "decode_wait_s": round(max(0.0, wall - sum(busy.values())), 2),
              "models": {name: {"views": n, "images": images[name], "seconds": round(busy[name], 2),
                                "images_per_s": round(images[name] / busy[name], 2) if busy[name] else None}
                         for name, (_, n) in encoders.items()},
              "peak_rss_mb": _peak_mb()}
    report["query"] = _query(encoders, list(queries), gallery)
    report["peak_rss_mb_after_query"] = _peak_mb()["main"]
    report["machine"] = machine()
    return report


def _query(encoders, queries, n):
    """First search (text towers load), then the steady time per search: encode with every model + score n photos."""
    rng = np.random.default_rng(0)
    gal = {name: rng.standard_normal((n, enc.cfg["dim"])).astype(np.float16) for name, (enc, _) in encoders.items()}
    times = []
    for q in queries:
        t = time.perf_counter()
        for name, (enc, _) in encoders.items():
            v = enc.embed_texts([q])[0].astype(np.float16)
            s = gal[name] @ v
            np.argpartition(-s, 60)[:60]
        times.append(time.perf_counter() - t)
    steady = times[1:] or times
    return {"gallery": n, "first_ms": round(1000 * times[0]), "ms_per_query": round(1000 * float(np.median(steady)))}


def fixed_batches(x, b, fn):
    """Run fn on exactly b rows at a time (a Core ML package has a fixed input shape): zero-pad the last batch,
    drop the padding's outputs."""
    out = []
    for i in range(0, len(x), b):
        chunk = x[i:i + b]
        n = len(chunk)
        if n < b:
            chunk = np.concatenate([chunk, np.zeros((b - n,) + chunk.shape[1:], chunk.dtype)])
        out.append(fn(chunk)[:n])
    return np.concatenate(out)


class CoreMLImages:
    """A Core ML image tower (macOS, Neural Engine) behind the Encoder interface: preprocessing and texts come from
    the ONNX model it was converted from. Pinned to CPU_AND_NE: SigLIP's written-out head is wrong on the GPU (D28)."""
    def __init__(self, package, onnx_encoder, batch=8):
        import coremltools as ct
        self.model = ct.models.MLModel(str(package), compute_units=ct.ComputeUnit.CPU_AND_NE)
        self.cfg, self.batch, self.onnx = onnx_encoder.cfg, batch, onnx_encoder

    def embed_arrays(self, x):
        from .encoder import l2_normalize
        run = lambda c: np.asarray(list(self.model.predict({"px": c.astype(np.float32)}).values())[0], np.float32)
        return l2_normalize(fixed_batches(np.asarray(x, np.float32), self.batch, run))

    def embed_texts(self, texts):
        return self.onnx.embed_texts(texts)


def parity(paths, a, b, n_views):
    """Cosine between two encoders' vectors for the same views of the same photos (decoded once, in this process)."""
    cos = []
    for p in paths:
        img = face_engine.load_upright(p)
        if img is None:
            continue
        x = np.stack([preprocess(v, a.cfg) for v in views(img, n_views)])
        va, vb = a.embed_arrays(x), b.embed_arrays(x)
        cos.extend((va * vb).sum(1) / np.linalg.norm(va, axis=1) / np.linalg.norm(vb, axis=1))
    cos = np.asarray(cos)
    return {"images": len(cos), "min": round(float(cos.min()), 5), "p01": round(float(np.percentile(cos, 1)), 5),
            "median": round(float(np.median(cos)), 5)}


def model_mb(model_dir):
    """Disk size of an exported model directory."""
    return round(sum(f.stat().st_size for f in model_dir.rglob("*") if f.is_file()) / 2**20)
