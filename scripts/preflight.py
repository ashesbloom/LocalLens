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

`--release vX.Y.Z` adds two more stages and reorders the run to AGENTS.md's own
order — version consistency first, then the checks above, then release notes —
so a single run tells the whole story even when an early stage fails:

  0. version consistency — the four canonical version files (AGENTS.md §5) agree
                     with each other and with vX.Y.Z. Cargo.lock's LocalLens
                     crate is checked too, but only as a warning.
  3. release notes — CHANGELOG.md has a `## [X.Y.Z]` section, and the CI's own
                     awk/sed extraction (release.yml) yields non-empty text for
                     it. A handful of AGENTS.md style rules (heading names,
                     bullet count, blank line after the header, tables/fences,
                     a docs/RELEASE_NOTES_*.md) are checked too, but only as
                     warnings — the shipped baseline already violates several
                     of them, and a gate that fails on its own baseline gets
                     switched off.

Exit code: 0 iff every stage passed. Warnings never affect it.
"""

import argparse
import json
import re
import shlex
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
    warned: bool = False


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


# ---------------------------------------------------------------------------
# --release vX.Y.Z: version consistency + release-notes gate (AGENTS.md §5, §3)
# ---------------------------------------------------------------------------

# The four canonical version files (AGENTS.md §5). Cargo.lock is deliberately
# not in this dict — it's a warning-only check below, parsed differently
# because the LocalLens crate's own block has to be isolated from json-patch,
# which happens to sit at the same version in the same lockfile.
_CARGO_TOML_VERSION_RE = r'^version\s*=\s*"([^"]+)"'
_APP_VERSION_RE = r'^APP_VERSION\s*=\s*"([^"]+)"'

_ALLOWED_CHANGELOG_HEADINGS = {"Added", "Fixed", "Changed", "Removed"}
_MAX_POPUP_BULLETS = 5


def _json_version(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("version")
    except (OSError, ValueError):
        return None


def _regex_version(path: Path, pattern: str):
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    m = re.search(pattern, text, re.MULTILINE)
    return m.group(1) if m else None


def run_stage_version_consistency(repo_root: Path, version: str) -> StageResult:
    """AGENTS.md §5: the four canonical files must agree with each other and
    with the vX.Y.Z argument. Any disagreement is a hard fail (R9) — a stale
    file here is exactly how APP_VERSION got forgotten during v2.4.1."""
    print("\n== Version consistency ==")
    start = time.monotonic()
    ok = True
    warned = False

    checks = [
        ("frontend/package.json", lambda p: _json_version(p)),
        ("frontend/src-tauri/tauri.conf.json", lambda p: _json_version(p)),
        ("frontend/src-tauri/Cargo.toml", lambda p: _regex_version(p, _CARGO_TOML_VERSION_RE)),
        ("backend/main.py", lambda p: _regex_version(p, _APP_VERSION_RE)),
    ]
    for rel, extract in checks:
        found = extract(repo_root / rel)
        if found is None:
            ok = False
            print(f"  FAIL  {rel}: could not find a version")
        elif found != version:
            ok = False
            print(f"  FAIL  {rel}: {found} (expected {version})")
        else:
            print(f"  ok    {rel}: {found}")

    # Cargo.lock — warning only, per AGENTS.md leaving the lock to cargo. Parse
    # the [[package]] name = "LocalLens" block specifically: a bare version
    # grep also matches json-patch, which sits at the same version in the file.
    lock_path = repo_root / "frontend" / "src-tauri" / "Cargo.lock"
    lock_version = None
    if lock_path.exists():
        m = re.search(
            r'\[\[package\]\]\s*\nname = "LocalLens"\s*\nversion = "([^"]+)"',
            lock_path.read_text(encoding="utf-8"),
        )
        lock_version = m.group(1) if m else None
    if lock_version is None:
        warned = True
        print("  WARN  Cargo.lock: could not find the LocalLens package block")
    elif lock_version != version:
        warned = True
        print(f"  WARN  Cargo.lock: LocalLens crate at {lock_version}, target is {version} "
              "(AGENTS.md leaves Cargo.lock to cargo — not a failure)")
    else:
        print(f"  ok    Cargo.lock: {lock_version} (LocalLens crate)")

    return StageResult("version consistency", ok, time.monotonic() - start, warned=warned)


def _changelog_section_body(text: str, version: str):
    """Raw lines of the `## [version]` section, header line excluded, boundary
    at the next `## [` line or EOF — same boundary the CI awk uses, but NOT
    blank-line-stripped, so style checks (e.g. blank line after the header)
    can still see what awk's `sed '/^$/d'` would otherwise hide. Returns None
    if the header isn't found at all."""
    header = re.search(r'^## \[' + re.escape(version) + r'\].*$', text, re.MULTILINE)
    if not header:
        return None
    line_end = text.find("\n", header.end())
    body_start = line_end + 1 if line_end != -1 else len(text)
    next_header = re.search(r'^## \[', text[body_start:], re.MULTILINE)
    body_end = body_start + next_header.start() if next_header else len(text)
    return text[body_start:body_end].splitlines()


def run_stage_release_notes(repo_root: Path, version: str) -> StageResult:
    """AGENTS.md §3: the `## [X.Y.Z]` CHANGELOG section feeds both latest.json's
    update popup and the GitHub release body via one awk/sed pipeline in
    release.yml. Hard fail (R9) only on what silently breaks that pipeline —
    a missing section, or the pipeline extracting empty text. Everything else
    (heading style, bullet count, blank line, tables, a docs/RELEASE_NOTES_*.md)
    is a warning: the shipped v3.0.1 baseline already violates several of
    these, and a gate that fails on its own baseline gets switched off."""
    print("\n== Release notes ==")
    start = time.monotonic()
    ok = True
    warned = False

    changelog_path = repo_root / "CHANGELOG.md"
    text = changelog_path.read_text(encoding="utf-8") if changelog_path.exists() else ""

    header_re = r'^## \[' + re.escape(version) + r'\]'
    if not re.search(header_re, text, re.MULTILINE):
        ok = False
        print(f"  FAIL  no '## [{version}]' section found in CHANGELOG.md")
    else:
        print(f"  ok    '## [{version}]' section found in CHANGELOG.md")

    # The exact pipeline CI runs at release.yml:436 — run it via subprocess
    # rather than reimplementing the awk logic in Python. A reimplementation
    # that disagrees with CI is worse than no check: it would pass while CI
    # still silently extracts nothing.
    script = (
        f"version={shlex.quote(version)}\n"
        f"changelog_path={shlex.quote(str(changelog_path))}\n"
        r'''notes=$(awk "/^## \[$version\]/{flag=1; next} /^## \[/{flag=0} flag" "$changelog_path" | sed '/^$/d')'''
        "\n"
        'printf "%s" "$notes"\n'
    )
    proc = subprocess.run(["bash", "-c", script], capture_output=True, text=True)
    notes = proc.stdout
    if not notes.strip():
        ok = False
        print(f"  FAIL  CI's awk/sed extraction (release.yml:436) yielded empty text for {version} "
              "— this is exactly what ships as 'Release X - See CHANGELOG.md for details' in "
              "BOTH latest.json's update popup and the GitHub release body")
    else:
        print(f"  ok    CI's awk/sed extraction yielded {len(notes.strip().splitlines())} line(s)")

    body = _changelog_section_body(text, version)
    if body is not None:
        bullets = [l for l in body if l.strip().startswith("- ")]
        if len(bullets) > _MAX_POPUP_BULLETS:
            warned = True
            print(f"  WARN  {len(bullets)} bullets in section (popup guidance: max {_MAX_POPUP_BULLETS})")

        headings = [l.strip()[4:].strip() for l in body if l.strip().startswith("### ")]
        bad_headings = [h for h in headings if h not in _ALLOWED_CHANGELOG_HEADINGS]
        if bad_headings:
            warned = True
            print(f"  WARN  heading(s) outside Added/Fixed/Changed/Removed: {', '.join(bad_headings)}")

        if body and body[0].strip() == "":
            warned = True
            print("  WARN  blank line between the header and its body (AGENTS.md: do not leave one)")

        if any("|" in l or "```" in l for l in body):
            warned = True
            print("  WARN  table or code fence in section (renders poorly in the in-app popup)")

    notes_path = repo_root / "docs" / f"RELEASE_NOTES_v{version}.md"
    if not notes_path.exists():
        warned = True
        print(f"  WARN  docs/RELEASE_NOTES_v{version}.md missing (fine for patch releases)")

    return StageResult("release notes", ok, time.monotonic() - start, warned=warned)


def _release_version(raw: str) -> str:
    """--release takes vX.Y.Z (matching a git tag); return the bare X.Y.Z, the
    same way CI derives its `version` from `github.ref_name` (release.yml
    `version="${tag#v}"`) — the canonical files and CHANGELOG headers use the
    bare form."""
    if not re.fullmatch(r"v\d+\.\d+\.\d+", raw):
        raise argparse.ArgumentTypeError(f"expected vX.Y.Z (e.g. v3.0.1), got {raw!r}")
    return raw[1:]


def main() -> int:
    parser = argparse.ArgumentParser(description="LocalLens release preflight")
    parser.add_argument("--fast", action="store_true", help="skip the API smoke stage")
    parser.add_argument("--built", metavar="PATH", help="forwarded to test_api_smoke.py --built")
    parser.add_argument("--expect-version", metavar="VERSION",
                         help="forwarded to test_api_smoke.py --expect-version")
    parser.add_argument("--release", metavar="vX.Y.Z", type=_release_version,
                         help="also run the AGENTS.md version + release-notes gate for this release")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    backend_dir = repo_root / "backend"
    python_exe = find_backend_python(repo_root)
    print(f"preflight: backend interpreter = {python_exe}")

    # AGENTS.md's own order: version consistency, then the checks, then release
    # notes — so one run reports all three even if an early one fails.
    stages = []
    if args.release:
        stages.append(run_stage_version_consistency(repo_root, args.release))

    stages.append(run_stage_unit_tests(python_exe, backend_dir))

    if args.fast:
        print("\n== Stage 2/2: api smoke ==\n  SKIP  api smoke (--fast)")
        stages.append(StageResult("api smoke", True, 0.0, skipped=True))
    else:
        stages.append(run_stage_api_smoke(python_exe, backend_dir, args.built, args.expect_version))

    if args.release:
        stages.append(run_stage_release_notes(repo_root, args.release))

    print("\n" + "=" * 60)
    print("preflight summary")
    print("=" * 60)
    for s in stages:
        label = "SKIP" if s.skipped else "ABORT" if s.aborted else "PASS" if s.passed else "FAIL"
        suffix = "  (warnings)" if s.warned else ""
        print(f"  [{label}]  {s.name:<20} {s.elapsed:6.1f}s{suffix}")

    failed = any((not s.passed) and not s.skipped for s in stages)
    print()
    print("preflight: " + ("PASSED" if not failed else "FAILED"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
