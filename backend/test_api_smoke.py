#!/usr/bin/env python3
r"""
Feature-level smoke test for the LocalLens backend API.

Boots a real backend (the dev venv, or a PyInstaller build via --built), sandboxes
it into a throwaway HOME/APPDATA so it never touches the real install, and exercises
the endpoints a real user session hits against a handful of fixture photos. Prints
one line per check and keeps going after a failure, so a single run reports every
broken feature instead of stopping at the first one.

Run:
  cd backend && venv/bin/python test_api_smoke.py
  cd backend && venv/bin/python test_api_smoke.py --built dist/backend_server/backend_server
  cd backend && venv/bin/python test_api_smoke.py --expect-version 3.0.1

Exit code is 0 iff every check passed.

Deliberately not covered: the real (non-dry-run) delete. send2trash needs a real
Trash on a headless runner, so a failure there would be an environment artifact,
not a product bug. Preview/real path parity is already pinned in-process, with
send2trash stubbed, by test_dry_run_and_real_delete_resolve_the_same_path in
test_delete_paths.py.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

BACKEND_DIR = Path(__file__).resolve().parent
STARTUP_TIMEOUT_S = 120   # frozen builds load face-recognition models and extract on first boot
JOB_TIMEOUT_S = 120

# 3 distinct top-level images + 1 nested + 1 byte-identical copy of one of them.
FIXTURE_COUNT = 5


# ==============================================================================
#  HTTP helpers (no httpx in the backend venv — stdlib only)
# ==============================================================================

def _request(base_url, method, path, obj=None):
    data = json.dumps(obj).encode("utf-8") if obj is not None else None
    headers = {"Content-Type": "application/json"} if data is not None else {}
    req = urllib.request.Request(base_url + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} -> HTTP {e.code}: {body}") from None


def get(base_url, path):
    return _request(base_url, "GET", path)


def post(base_url, path, obj=None):
    return _request(base_url, "POST", path, obj)


def wait_for_job(base_url, timeout=JOB_TIMEOUT_S):
    """Poll /api/job-status until it leaves the running state."""
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        last = get(base_url, "/api/job-status")
        if last.get("status") in ("complete", "error", "aborted"):
            return last
        time.sleep(0.3)
    raise AssertionError(f"job did not reach a terminal state within {timeout}s; last={last!r}")


# ==============================================================================
#  Fixtures — a handful of throwaway JPEGs, one subfolder, one exact duplicate
# ==============================================================================

def _make_image(path, seed):
    """A per-seed gradient (not a solid fill) so the pHash's low-frequency DCT
    terms actually differ between fixtures instead of being noise around zero."""
    y, x = np.mgrid[0:64, 0:64]
    r = (seed[0] + x * 3) % 256
    g = (seed[1] + y * 3) % 256
    b = (seed[2] + (x + y) * 2) % 256
    arr = np.stack([r, g, b], axis=-1).astype(np.uint8)
    Image.fromarray(arr, "RGB").save(path, "JPEG", quality=90)


def make_fixtures(root):
    """Layout: Source/{img_0,img_1,img_2,img_2_copy}.jpg + Source/Sub/img_3.jpg."""
    source = root / "Source"
    sub = source / "Sub"
    sub.mkdir(parents=True)

    seeds = [(255, 0, 0), (0, 255, 0), (0, 0, 255)]
    top_level = []
    for i, seed in enumerate(seeds):
        p = source / f"img_{i}.jpg"
        _make_image(p, seed)
        top_level.append(p)

    nested = sub / "img_3.jpg"
    _make_image(nested, (255, 255, 0))

    original = top_level[2]                    # img_2.jpg
    duplicate = source / "img_2_copy.jpg"
    shutil.copy(original, duplicate)            # byte-identical, not just visually similar

    assert len(list(source.rglob("*.jpg"))) == FIXTURE_COUNT
    return source, original, duplicate


# ==============================================================================
#  Backend process harness
# ==============================================================================

def _drain_stdout(pipe, lines, lock):
    for line in iter(pipe.readline, ""):
        with lock:
            lines.append(line)
    pipe.close()


def start_backend(built_path, sandbox_home):
    """Launch the backend as a subprocess sandboxed into sandbox_home, and return
    (proc, base_url, port, lines, lock) once it has printed its port line."""
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    if sys.platform == "win32":
        env["APPDATA"] = str(sandbox_home)
    else:
        env["HOME"] = str(sandbox_home)

    if built_path:
        exe = Path(built_path).resolve()
        cmd = [str(exe)]
        cwd = str(exe.parent)
    else:
        cmd = [sys.executable, "main.py"]
        cwd = str(BACKEND_DIR)

    proc = subprocess.Popen(
        cmd, cwd=cwd, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
    )

    lines = []
    lock = threading.Lock()
    threading.Thread(target=_drain_stdout, args=(proc.stdout, lines, lock), daemon=True).start()

    port = None
    deadline = time.monotonic() + STARTUP_TIMEOUT_S
    while time.monotonic() < deadline:
        with lock:
            for line in lines:
                if "PYTHON_BACKEND_PORT:" in line:
                    port = int(line.strip().rsplit("PYTHON_BACKEND_PORT:", 1)[1])
                    break
        if port is not None:
            break
        if proc.poll() is not None:
            break  # process died before printing its port
        time.sleep(0.2)

    if port is None:
        proc.terminate()
        with lock:
            captured = "".join(lines)
        raise RuntimeError(
            f"backend never printed PYTHON_BACKEND_PORT within {STARTUP_TIMEOUT_S}s "
            f"(exit code: {proc.poll()})\n--- captured stdout/stderr ---\n{captured}"
        )

    base_url = f"http://127.0.0.1:{port}"
    return proc, base_url, port, lines, lock


def verify_sandbox(sandbox_home, port):
    """The whole point of overriding HOME/APPDATA is that the backend never touches
    the real install. Confirm it actually landed in the sandbox rather than assuming."""
    data_dir = (sandbox_home / "LocalLens") if sys.platform == "win32" else (sandbox_home / ".config" / "LocalLens")
    port_file = data_dir / "port.txt"
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline and not port_file.exists():
        time.sleep(0.1)
    if not port_file.exists():
        raise RuntimeError(f"sandbox override did not take effect — {port_file} was never created")
    on_disk = int(port_file.read_text().strip())
    if on_disk != port:
        raise RuntimeError(f"{port_file} says port {on_disk}, but the backend printed {port}")


def wait_for_health(base_url, deadline):
    """Wait for the HTTP server to accept connections — NOT for check 1's assertion.
    Gating on the response body here would make a broken /api/health hang for the
    full startup budget instead of failing fast as a normal ❌ check."""
    last_err = None
    while time.monotonic() < deadline:
        try:
            get(base_url, "/api/health")
            return
        except Exception as e:
            last_err = e
        time.sleep(0.3)
    raise RuntimeError(f"backend never answered /api/health within the startup budget: {last_err}")


def stop_backend(proc, base_url):
    """Ask nicely first, then terminate() as a backstop."""
    if proc is None:
        return
    try:
        post(base_url, "/api/shutdown")
    except Exception:
        pass
    try:
        proc.wait(timeout=10)
        return
    except Exception:
        pass
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except Exception:
        proc.kill()


# ==============================================================================
#  Checks — one per row of the brief's table. Each does its own asserts and
#  returns a short human-readable detail string for the ✅ line.
# ==============================================================================

def check_health(base_url):
    r = get(base_url, "/api/health")
    assert r.get("status") == "ok", f"expected status='ok', got {r!r}"
    return "status=ok"


def check_stats(base_url, expect_version):
    r = get(base_url, "/api/stats")
    assert r.get("face_recognition_active") is True, \
        f"face_recognition_active={r.get('face_recognition_active')!r}"
    detail = "face_recognition_active=True"
    if expect_version:
        assert r.get("app_version") == expect_version, \
            f"app_version={r.get('app_version')!r}, expected {expect_version!r}"
        detail += f", app_version={expect_version}"
    return detail


def check_dependencies(base_url):
    r = get(base_url, "/api/check-dependencies")
    assert r.get("face_recognition_installed") is True, \
        f"face_recognition_installed={r.get('face_recognition_installed')!r}"
    return "face_recognition_installed=True"


def check_list_subfolders(base_url, source):
    r = post(base_url, "/api/list-subfolders", {"path": str(source), "ignore_list": []})
    file_count = r.get("stats", {}).get("file_count")
    assert file_count == FIXTURE_COUNT, f"file_count={file_count}, expected {FIXTURE_COUNT}"
    names = [node.get("name") for node in r.get("subfolders", [])]
    assert "Sub" in names, f"'Sub' not in subfolder tree: {names}"
    return f"file_count={FIXTURE_COUNT}, 'Sub' present"


def check_find_duplicates(base_url, source, original, duplicate):
    r = post(base_url, "/api/find-duplicates", {"source_folder": str(source)})
    assert r.get("status") == "started", f"expected status='started', got {r!r}"

    result = wait_for_job(base_url)
    assert result.get("status") == "complete", \
        f"job ended with status={result.get('status')!r}: {result.get('message')!r}"

    groups = result.get("duplicate_groups", [])
    # Exact-count assertion, verified by actually running this fixture (R3): the
    # fixture has exactly one byte-identical pair and three visually distinct
    # gradient images, so exactly one group is the correct expectation here, not
    # a guess — this and check 6 are the reason this script exists (the v3.0.1 bug).
    assert len(groups) == 1, f"expected exactly 1 duplicate group, got {len(groups)}: {groups}"
    group = groups[0]
    assert str(original) in group and str(duplicate) in group, \
        f"byte-identical pair not both present in the group: {group}"
    return group, f"complete, 1 group containing the byte-identical pair"


def check_delete_files_dry_run(base_url, group):
    keeper, *dupes = group
    assert dupes, f"group had no non-keeper entries to delete: {group}"
    r = post(base_url, "/api/delete-files", {"file_paths": dupes, "dry_run": True})
    assert r.get("failed") == [], f"failed={r.get('failed')!r}"
    deleted = r.get("deleted", [])
    for d in dupes:
        assert d in deleted, f"{d} not listed in deleted={deleted!r}"
        assert os.path.isfile(d), f"dry_run removed the file from disk: {d}"
    return f"{len(dupes)} file(s) listed in deleted, failed=[], still on disk"


def check_start_sorting(base_url, source, dest):
    r = post(base_url, "/api/start-sorting", {
        "source_folder": str(source),
        "destination_folder": str(dest),
        "sorting_options": {"primary_sort": "Date", "maintain_hierarchy": True},
        "ignore_list": [],
        "operation_mode": "copy",
    })
    assert r.get("status") == "started", f"expected status='started', got {r!r}"

    result = wait_for_job(base_url)
    assert result.get("status") == "complete", \
        f"job ended with status={result.get('status')!r}: {result.get('message')!r}"

    files_written = result.get("files_written")
    # Exact-count assertion, verified by actually running this fixture (R3): a Date
    # sort writes one destination file per source file (no fan-out, unlike People
    # sort), so files_written == FIXTURE_COUNT is the real observed behaviour, not
    # a guess — the byte-identical duplicate does not get deduplicated by sorting.
    assert files_written == FIXTURE_COUNT, f"files_written={files_written}, expected {FIXTURE_COUNT}"

    on_disk = sum(len(files) for _, _, files in os.walk(dest))
    assert on_disk > 0, "destination directory is empty after the sort"
    return f"complete, files_written={FIXTURE_COUNT}, {on_disk} file(s) on disk"


def check_export_report(base_url, source):
    r = post(base_url, "/api/export-report", {"source_folder": str(source)})
    saved_to = r.get("saved_to")
    assert saved_to, f"no 'saved_to' in response: {r!r}"
    assert os.path.isfile(saved_to), f"PDF not found at {saved_to}"
    size = os.path.getsize(saved_to)
    assert size > 0, f"PDF at {saved_to} is empty"
    return f"PDF created at {os.path.basename(saved_to)} ({size} bytes)"


def check_metadata_overview(base_url, source):
    r = post(base_url, "/api/metadata-overview", {"source_folder": str(source), "ignore_list": []})
    missing = [k for k in ("locations", "dates", "people") if k not in r]
    assert not missing, f"missing key(s) {missing} in response: {sorted(r.keys())}"
    return "locations/dates/people present"


# ==============================================================================
#  Runner
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--built", metavar="PATH",
                         help="launch this PyInstaller backend executable instead of `python main.py`")
    parser.add_argument("--expect-version", metavar="VERSION",
                         help="also assert /api/stats reports this app_version")
    args = parser.parse_args()

    results = []  # list of bool, in check order

    def step(label, fn):
        try:
            detail = fn()
            print(f"✅ {label} — {detail}" if detail else f"✅ {label}")
            results.append(True)
        except AssertionError as e:
            print(f"❌ {label} — {e}")
            results.append(False)
        except Exception as e:
            print(f"❌ {label} — unexpected {type(e).__name__}: {e}")
            results.append(False)

    workspace = Path(tempfile.mkdtemp(prefix="locallens_smoke_"))
    sandbox_home = workspace / "sandbox_home"
    sandbox_home.mkdir()
    fixtures_root = workspace / "fixtures"
    fixtures_root.mkdir()
    dest_root = workspace / "dest"
    dest_root.mkdir()

    proc = None
    base_url = None
    try:
        source, original, duplicate = make_fixtures(fixtures_root)

        proc, base_url, port, lines, lock = start_backend(args.built, sandbox_home)
        verify_sandbox(sandbox_home, port)
        wait_for_health(base_url, time.monotonic() + STARTUP_TIMEOUT_S)
        print(f"backend up on port {port}, sandboxed into {sandbox_home}")

        step("[1] GET /api/health", lambda: check_health(base_url))
        step("[2] GET /api/stats", lambda: check_stats(base_url, args.expect_version))
        step("[3] GET /api/check-dependencies", lambda: check_dependencies(base_url))
        step("[4] POST /api/list-subfolders", lambda: check_list_subfolders(base_url, source))

        dup_group = {}

        def _check5():
            group, detail = check_find_duplicates(base_url, source, original, duplicate)
            dup_group["group"] = group
            return detail
        step("[5] POST /api/find-duplicates -> GET /api/job-status", _check5)

        def _check6():
            if "group" not in dup_group:
                raise AssertionError("skipped — check 5 did not produce a duplicate group")
            return check_delete_files_dry_run(base_url, dup_group["group"])
        step("[6] POST /api/delete-files dry_run=True", _check6)

        step("[7] POST /api/start-sorting -> GET /api/job-status",
             lambda: check_start_sorting(base_url, source, dest_root))
        step("[8] POST /api/export-report", lambda: check_export_report(base_url, source))
        step("[9] POST /api/metadata-overview", lambda: check_metadata_overview(base_url, source))

    finally:
        stop_backend(proc, base_url)
        shutil.rmtree(workspace, ignore_errors=True)

    passed = sum(results)
    total = len(results)
    print(f"\n{passed}/{total} checks passed.")
    return 0 if passed == total and total > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
