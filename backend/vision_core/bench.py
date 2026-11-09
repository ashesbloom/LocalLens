"""
LocalLens Vision Core test app (S9, gate G6): a tester runs it on their own machine (8 GB Windows laptop, M1, Intel Mac)
and sends back one JSON file. It measures, on up to 200 of the tester's own photos (they never leave the machine; the
report holds numbers and machine facts only, no paths, names or photo content):
  full     the default index: SigLIP photo + 3 crops, PE photo (int8 ONNX, CPU)
  stage2   photo + PE only, the first pass a CPU machine would run (D72)
  search   a fresh process that loads only the two text models, as a search would (D71)
  search_low  the same with SigLIP's text model only: the low-memory mode for small machines (SHIPPING.md)

  frozen:  LocalLensBench [--photos <folder>] [--limit 200] [--models <folder>] [--out <report.json>]
  lab:     cd backend && venv/bin/python -m vision_core.bench --photos <folder>
"""
import argparse
import json
import multiprocessing
import os
import subprocess
import sys
import time
from pathlib import Path

VERSION = "0.3 (2026-11-09)"
MODELS = {"siglip2-b16-224-int8": 4, "pe-core-b16-224-int8": 1}   # name: views (D19, D62)
EXTS = (".jpg", ".jpeg", ".heic", ".heif", ".png")


def here():
    """The folder the app (or the repo's lab data) lives in: where `models/` is looked for."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    from . import MODELS_DIR
    return MODELS_DIR.parent


def find_models(app_dir, depth=3, budget=5000):
    """The folder holding both models, wherever a tester unzipped them: inside the app's folder, beside it, or beside
    the folder the app's zip made (Windows "Extract All" puts both zips' folders side by side in Downloads), up to
    `depth` levels down (e.g. LocalLens-VisionCore-models-int8-…/models). None when not found."""
    def ok(d):
        return all((d / n / "model.json").is_file() for n in MODELS)
    seen = 0
    app_dir = Path(app_dir)
    for base in (app_dir, app_dir.parent, app_dir.parent.parent):
        level = [base]
        for _ in range(depth + 1):
            for d in level:
                if ok(d):
                    return d
            nxt = []
            for d in level:
                try:
                    kids = sorted(k for k in d.iterdir() if k.is_dir() and not k.name.startswith("."))
                except OSError:
                    continue
                seen += len(kids)
                nxt += kids
            if seen > budget:   # ponytail: a huge Downloads folder stops the search; --models <folder> still works
                break
            level = nxt
    return None


def dropped_path(text):
    """A folder dragged into the window: Mac Terminal escapes spaces ("My\\ Photos"), Windows adds quotes."""
    import shlex
    t = text.strip()
    if t.startswith(("/", "'/", '"/', "~")):
        try:
            return os.path.expanduser(shlex.split(t)[0])
        except ValueError:
            pass
    return t.strip("'\"")


def find_photos(folder, limit):
    found = []
    for dp, dirs, files in os.walk(folder):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        found += [os.path.join(dp, f) for f in sorted(files) if f.lower().endswith(EXTS) and not f.startswith(".")]
        if len(found) >= limit:
            break
    return found[:limit]


def search_only(models, names=tuple(MODELS)):
    """Run in its own process: memory and time of a search with only these text models loaded."""
    from .encoder import Encoder
    from .speed import _peak_mb
    t = time.perf_counter()
    encs = [Encoder(models / n) for n in names]
    for e in encs:
        e.embed_texts(["a dog on the beach"])
    first = time.perf_counter() - t
    times = []
    for q in ("two people on a bench", "birthday cake at home", "mountains at sunset"):
        t = time.perf_counter()
        for e in encs:
            e.embed_texts([q])
        times.append(time.perf_counter() - t)
    return {"first_ms": round(1000 * first), "ms_per_search": round(1000 * sorted(times)[1]), "peak_rss_mb": _peak_mb()["main"]}


def main(argv=None):
    ap = argparse.ArgumentParser(prog="LocalLensBench")
    ap.add_argument("--photos")
    ap.add_argument("--limit", type=int, default=200)
    ap.add_argument("--models")
    ap.add_argument("--out")
    ap.add_argument("--search-only", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--low", action="store_true", help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    interactive = not a.photos and sys.stdin.isatty()

    def done(code):   # a double-clicked window would close before anyone reads the result
        if interactive:
            input("\nPress Enter to close this window.")
        return code
    models = Path(a.models) if a.models else (find_models(here()) or here() / "models")
    if a.search_only:
        print(json.dumps(search_only(models, list(MODELS)[:1] if a.low else tuple(MODELS))))
        return 0
    missing = [n for n in MODELS if not (models / n / "model.json").exists()]
    if missing:
        print("The models were not found. Unzip the models zip and put its 'models' folder inside this app's folder:\n"
              f"  {here()}\n(or start the app with --models <the folder that holds {' and '.join(MODELS)}>)")
        return done(2)
    from .encoder import Encoder
    from .speed import machine, model_mb, run
    folder = a.photos or dropped_path(input("Drag a folder of your photos into this window, then press Enter: "))
    paths = find_photos(folder, a.limit)
    if len(paths) < 20:
        print(f"Found {len(paths)} photos in that folder; please choose one with at least 20.")
        return done(2)
    print(f"LocalLens test app {VERSION}: {len(paths)} photos. Nothing leaves this computer.", flush=True)

    def bar(label):
        def show(i, n):
            if i == n or i % 10 == 0:
                print(f"\r  {label}: {i}/{n} photos", end="" if i < n else "\n", flush=True)
        return show
    encs = {n: Encoder(models / n) for n in MODELS}
    report = {"app": VERSION, "photos": len(paths), "machine": machine(), "model_mb": {n: model_mb(models / n) for n in MODELS}}
    report["full"] = run(paths, {n: (e, v) for (n, v), e in zip(MODELS.items(), encs.values())}, progress=bar("full index"))
    report["stage2"] = run(paths[:100], {n: (e, 1) for n, e in encs.items()}, progress=bar("quick index"))
    me = [sys.executable] if getattr(sys, "frozen", False) else [sys.executable, "-m", "vision_core.bench"]
    print("  search: measuring...", flush=True)
    for key, extra in (("search", []), ("search_low", ["--low"])):
        r = subprocess.run(me + ["--search-only", "--models", str(models)] + extra, capture_output=True, text=True)
        lines = [l for l in r.stdout.splitlines() if l.startswith("{")]
        report[key] = json.loads(lines[-1]) if lines else {"error": (r.stderr or "no output")[-500:]}
    desk = Path.home() / "Desktop"
    out = Path(a.out) if a.out else (desk if desk.is_dir() else Path.home()) / "locallens-bench-report.json"
    out.write_text(json.dumps(report, indent=1))
    f = report["full"]
    print(f"\nDone: {f['photos_per_s']} photos/s, peak memory {f['peak_rss_mb']['main']} MB.\n"
          f"Please send this file back: {out}")
    return done(0)


if __name__ == "__main__":
    multiprocessing.freeze_support()   # the frozen app's decode workers start through this entry point
    sys.exit(main())
