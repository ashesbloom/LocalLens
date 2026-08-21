#!/usr/bin/env python3
"""LocalLens release preflight — the one command that runs the pre-release checks.

Usage:
    python scripts/preflight.py [--fast] [--built PATH] [--expect-version X.Y.Z]

Stdlib only. This file must run under a bare `python3` with no venv activated —
it never imports anything backend-specific itself, it only shells out to the
backend venv's Python for the checks that need it.

Stages (run in order; a failure in one does not stop the next from running and
reporting its own result):

  1. unit tests   — every backend/test_*.py except test_api_smoke.py (that one
                     is Task 1's script, driven separately in stage 2), each run
                     as its own subprocess under the backend venv's Python.
                     Also runs one extra, cheap check in this same stage: import
                     backend/main.py's FastAPI `app` and fail on any duplicate
                     (method, path) registered in app.routes — a second
                     @app.<verb>(...) on a path already registered is dead code,
                     since FastAPI/Starlette always dispatches to the first
                     match.
  2. api smoke    — backend/test_api_smoke.py (Task 1). Skipped under --fast.
                     --built and --expect-version are forwarded to it unchanged.

Exit code: 0 iff every stage passed. Non-zero otherwise.

Extending with a third stage (Task 3: `--release vX.Y.Z` version + release-notes
gate): add a `run_stage_...()` function following the same shape used below,
call it in main() where marked, and append its StageResult to `stages`.
"""

import argparse
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass
class StageResult:
    name: str
    passed: bool
    elapsed: float
    skipped: bool = False
    aborted: bool = False


def find_backend_python(repo_root: Path) -> Path:
    """The backend venv's interpreter, so subprocesses see the same deps main.py does."""
    backend = repo_root / "backend"
    for candidate in (
        backend / "venv" / "bin" / "python",          # macOS / Linux
        backend / "venv" / "Scripts" / "python.exe",   # Windows
    ):
        if candidate.exists():
            return candidate
    return Path(sys.executable)


# Runs *inside* the backend venv (via `python -c`), cwd=backend/, so `import main`
# resolves. Importing main.py loads face-recognition models (~3-5s) — that cost is
# unavoidable here since it's the only way to inspect the real, live `app.routes`.
_ROUTE_CHECK_SNIPPET = """
import sys
import main as _main

seen = set()
dupes = []
for route in _main.app.routes:
    methods = getattr(route, "methods", None)
    path = getattr(route, "path", None)
    if not methods or path is None:
        continue
    for method in sorted(methods):
        key = (method, path)
        if key in seen:
            dupes.append(key)
        else:
            seen.add(key)

if dupes:
    for method, path in dupes:
        print(f"DUPLICATE {method} {path}")
    sys.exit(1)
print("no duplicate routes")
"""


def run_stage_unit_tests(python_exe: Path, backend_dir: Path) -> StageResult:
    print("\n== Stage 1/2: unit tests ==")
    start = time.monotonic()
    ok = True

    test_files = sorted(p for p in backend_dir.glob("test_*.py") if p.name != "test_api_smoke.py")
    if not test_files:
        print("  (no backend/test_*.py files found)")

    for f in test_files:
        t0 = time.monotonic()
        proc = subprocess.run(
            [str(python_exe), str(f)], cwd=str(backend_dir), capture_output=True, text=True
        )
        dt = time.monotonic() - t0
        if proc.returncode == 0:
            print(f"  ok    {f.name} ({dt:.1f}s)")
        else:
            ok = False
            print(f"  FAIL  {f.name} ({dt:.1f}s)")
            for line in (proc.stdout + proc.stderr).strip().splitlines()[-20:]:
                print(f"        {line}")

    t0 = time.monotonic()
    proc = subprocess.run(
        [str(python_exe), "-c", _ROUTE_CHECK_SNIPPET],
        cwd=str(backend_dir), capture_output=True, text=True,
    )
    dt = time.monotonic() - t0
    if proc.returncode == 0:
        print(f"  ok    duplicate-route check ({dt:.1f}s)")
    else:
        ok = False
        print(f"  FAIL  duplicate-route check ({dt:.1f}s)")
        for line in (proc.stdout + proc.stderr).strip().splitlines():
            print(f"        {line}")

    return StageResult("unit tests", ok, time.monotonic() - start)


_SMOKE_SUMMARY_RE = re.compile(r"^\d+/\d+ checks passed\.$")


def run_stage_api_smoke(python_exe: Path, backend_dir: Path, built, expect_version) -> StageResult:
    print("\n== Stage 2/2: api smoke ==")
    start = time.monotonic()
    cmd = [str(python_exe), "test_api_smoke.py"]
    if built:
        cmd += ["--built", built]
    if expect_version:
        cmd += ["--expect-version", expect_version]

    proc = subprocess.run(cmd, cwd=str(backend_dir), capture_output=True, text=True)
    dt = time.monotonic() - start
    output_lines = (proc.stdout + proc.stderr).strip().splitlines()
    for line in output_lines:
        print(f"  {line}")

    # test_api_smoke.py prints "N/9 checks passed." only if the harness actually
    # got the backend up and ran the checks. No such line means a harness-level
    # abort (backend never came up) — report that distinctly from an ordinary
    # check failure, per Task 1's report.
    if not any(_SMOKE_SUMMARY_RE.match(line) for line in output_lines):
        print(f"  ABORT api smoke ({dt:.1f}s) — harness never reached a checks-passed "
              "summary (backend likely never came up)")
        return StageResult("api smoke", False, dt, aborted=True)

    ok = proc.returncode == 0
    print(f"  {'ok  ' if ok else 'FAIL'}  api smoke ({dt:.1f}s)")
    return StageResult("api smoke", ok, dt)


def main() -> int:
    parser = argparse.ArgumentParser(description="LocalLens release preflight")
    parser.add_argument("--fast", action="store_true", help="skip the API smoke stage")
    parser.add_argument("--built", metavar="PATH", help="forwarded to test_api_smoke.py --built")
    parser.add_argument("--expect-version", metavar="VERSION",
                         help="forwarded to test_api_smoke.py --expect-version")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    backend_dir = repo_root / "backend"
    python_exe = find_backend_python(repo_root)
    print(f"preflight: backend interpreter = {python_exe}")

    stages = [run_stage_unit_tests(python_exe, backend_dir)]

    if args.fast:
        print("\n== Stage 2/2: api smoke ==\n  SKIP  api smoke (--fast)")
        stages.append(StageResult("api smoke", True, 0.0, skipped=True))
    else:
        stages.append(run_stage_api_smoke(python_exe, backend_dir, args.built, args.expect_version))

    # Task 3 extends here: append a release-gate StageResult (version +
    # release-notes check, driven by a new --release vX.Y.Z flag) to `stages`.

    print("\n" + "=" * 60)
    print("preflight summary")
    print("=" * 60)
    for s in stages:
        label = "SKIP" if s.skipped else "ABORT" if s.aborted else "PASS" if s.passed else "FAIL"
        print(f"  [{label}]  {s.name:<20} {s.elapsed:6.1f}s")

    failed = any((not s.passed) and not s.skipped for s in stages)
    print()
    print("preflight: " + ("PASSED" if not failed else "FAILED"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
