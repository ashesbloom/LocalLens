#!/usr/bin/env python3
"""
LocalLens Scheduler Daemon
===========================
A standalone process that monitors folders and auto-organizes photos.
Runs independently of the LocalLens backend.

Usage:
    python scheduler_daemon.py start     # Run with live terminal output
    python scheduler_daemon.py status    # Show current state and exit
    python scheduler_daemon.py stop      # Stop the running daemon

All timestamps use UTC internally. Display converts to local time.
"""
import os
import sys
import json
import signal
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
except ImportError:
    print("ERROR: Missing dependencies. Run: pip install -r requirements_pro.txt")
    sys.exit(1)

# The daemon does NOT import organizer_logic directly.
# It delegates all heavy work to the running backend via HTTP.
# This avoids duplicating library initialization (face_recognition, wand, etc.)
import urllib.request
import urllib.error
import urllib.parse

# ---------------------------------------------------------------------------
# Platform-independent paths
# ---------------------------------------------------------------------------
def get_app_data_dir() -> Path:
    if sys.platform == 'win32':
        base = os.getenv('APPDATA')
        if not base:
            raise RuntimeError("APPDATA not set")
        p = Path(base) / 'LocalLens'
    else:
        p = Path.home() / '.config' / 'LocalLens'
    p.mkdir(parents=True, exist_ok=True)
    return p

APP_DIR = get_app_data_dir()
SCHEDULES_FILE = APP_DIR / "schedules.json"
PID_FILE = APP_DIR / "scheduler.pid"
LOG_FILE = APP_DIR / "scheduler.log"
PORT_FILE = APP_DIR / "port.txt"

def _read_backend_port() -> int:
    """Read the port the backend is listening on."""
    if PORT_FILE.exists():
        try:
            return int(PORT_FILE.read_text().strip())
        except ValueError:
            pass
    return 8000  # default fallback

def _backend_url() -> str:
    return f"http://127.0.0.1:{_read_backend_port()}"

SUPPORTED_EXT = (
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp',
    '.heic', '.heif', '.dng', '.cr2', '.cr3', '.nef', '.arw',
    '.raf', '.avif', '.psd'
)

# ---------------------------------------------------------------------------
# Terminal colors (works on macOS, Linux, Windows 10+)
# ---------------------------------------------------------------------------
class C:
    G = '\033[92m'   # green
    Y = '\033[93m'   # yellow
    R = '\033[91m'   # red
    B = '\033[96m'   # cyan/blue
    W = '\033[97m'   # white
    D = '\033[90m'   # dim
    BOLD = '\033[1m'
    X = '\033[0m'    # reset

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)

def _to_local(dt: datetime) -> datetime:
    """Convert a tz-aware datetime to local time."""
    return dt.astimezone()

def _parse_ts(ts: Optional[str]) -> Optional[datetime]:
    """Parse an ISO timestamp string to a tz-aware datetime."""
    if not ts:
        return None
    dt = datetime.fromisoformat(ts)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt

def _local_str(dt: Optional[datetime]) -> str:
    if not dt:
        return "never"
    return _to_local(dt).strftime("%I:%M:%S %p")

def _countdown(target: Optional[datetime]) -> str:
    if not target:
        return "—"
    diff = target - _utcnow()
    if diff.total_seconds() <= 0:
        return "imminent"
    total = int(diff.total_seconds())
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    parts = []
    if h: parts.append(f"{h}h")
    if m: parts.append(f"{m}m")
    parts.append(f"{s}s")
    return " ".join(parts)

def _ago(dt: Optional[datetime]) -> str:
    if not dt:
        return ""
    diff = _utcnow() - dt
    total = int(diff.total_seconds())
    if total < 60:
        return f"{total}s ago"
    m, s = divmod(total, 60)
    if m < 60:
        return f"{m}m ago"
    h, m = divmod(m, 60)
    return f"{h}h {m}m ago"

# ---------------------------------------------------------------------------
# Watchdog handler with debounce
# ---------------------------------------------------------------------------
class _WatchHandler(FileSystemEventHandler):
    def __init__(self, sid: str, debounce: int, callback, loop):
        super().__init__()
        self.sid = sid
        self.debounce = max(debounce, 3)  # Minimum 3s — ensure file is fully written
        self.callback = callback
        self._loop = loop
        self._pending: set = set()
        self._timer = None

    def on_created(self, event):
        if not event.is_directory and event.src_path.lower().endswith(SUPPORTED_EXT):
            self._add(event.src_path)

    def on_moved(self, event):
        if not event.is_directory and event.dest_path.lower().endswith(SUPPORTED_EXT):
            self._add(event.dest_path)

    def _add(self, fp):
        self._pending.add(fp)
        if self._timer:
            self._timer.cancel()
        # Reset debounce timer on every new event — fires only after activity stops
        self._timer = self._loop.call_later(self.debounce, self._fire)

    def _fire(self):
        files = []
        for fp in list(self._pending):
            # Ensure file exists and is fully written (non-zero size)
            try:
                if os.path.exists(fp) and os.path.getsize(fp) > 0:
                    files.append(fp)
            except OSError:
                pass  # File was deleted during copy — skip it
        self._pending.clear()
        if files:
            asyncio.run_coroutine_threadsafe(
                self.callback(self.sid, files, "watcher"), self._loop
            )

# ---------------------------------------------------------------------------
# The Daemon
# ---------------------------------------------------------------------------
class SchedulerDaemon:
    def __init__(self):
        self.schedules: Dict[str, dict] = {}
        self.observers: Dict[str, Observer] = {}
        self.scheduler: Optional[AsyncIOScheduler] = None
        self._locks: Dict[str, asyncio.Lock] = {}
        self._pending_q: Dict[str, List[str]] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._running = True
        self._config_mtime: float = 0
        self._status_interval = 30  # print status every 30s

    # ── Logging ────────────────────────────────────────────────────────
    def _log(self, msg: str, emoji: str = "ℹ️ "):
        now = _to_local(_utcnow()).strftime("%H:%M:%S")
        terminal_line = f"  {C.D}[{now}]{C.X} {emoji} {msg}"
        print(terminal_line, flush=True)
        # Also append a clean (no ANSI) version to scheduler.log for the Web UI
        try:
            import re as _re
            clean = _re.sub(r'\x1b\[[0-9;]*m', '', terminal_line)
            with open(LOG_FILE, 'a', encoding='utf-8') as lf:
                lf.write(clean + "\n")
        except Exception:
            pass

    def _print_banner(self):
        print(f"""
{C.B}╔══════════════════════════════════════════════════════════╗
║{C.BOLD}         LocalLens Scheduler Daemon v1.0               {C.X}{C.B}║
╚══════════════════════════════════════════════════════════╝{C.X}
  {C.D}PID:  {os.getpid()}{C.X}
  {C.D}Data: {APP_DIR}{C.X}
  {C.D}Config: {SCHEDULES_FILE}{C.X}
""")

    def _print_status(self):
        if not self.schedules:
            self._log("No schedules configured.", "📭")
            return
        self._log_raw(f"\n  📊 Scheduler Status")
        for sid, s in self.schedules.items():
            status_text = {"active": "🟢 ACTIVE",
                           "paused": "⏸  PAUSED",
                           "error":  "🔴 ERROR"}.get(s.get("status"), "❓")
            last_dt = _parse_ts(s.get("last_run_at"))
            next_dt = _parse_ts(s.get("next_sweep_at"))
            total = s.get("files_organized_total", 0)
            hrs = s.get("interval_hours", 0)
            mins = s.get("interval_minutes", 0)
            mode_display = "Active Folder" if s.get("mode") == "active" else "Scheduled Sweep"
            lines = [
                f"  ┌─ {sid} ────────────────────────────────────────",
                f"  │ Mode:     {mode_display}",
                f"  │ Sort:     {s.get('primary_sort', '?')} → {s.get('destination_folder', '?')}",
                f"  │ Source:   {s.get('source_folder', '?')}",
                f"  │ Status:   {status_text}",
                f"  │ Interval: {hrs}h {mins}m",
                f"  │ Last run: {_local_str(last_dt)}  ({_ago(last_dt)})",
                f"  │ Next:     {_local_str(next_dt)}  (in {_countdown(next_dt)})",
                f"  │ Total:    {total} files organized",
            ]
            if s.get("last_error"):
                lines.append(f"  │ Error: {s['last_error']}")
            lines.append(f"  └{'─' * 50}")
            for line in lines:
                self._log_raw(line)
        self._log_raw("")

    def _log_raw(self, text: str):
        """Print a line to both terminal and log file (no timestamp prefix)."""
        print(text, flush=True)
        try:
            import re as _re
            clean = _re.sub(r'\x1b\[[0-9;]*m', '', text)
            with open(LOG_FILE, 'a', encoding='utf-8') as lf:
                lf.write(clean + "\n")
        except Exception:
            pass

    # ── Main loop ──────────────────────────────────────────────────────
    async def run(self):
        self._loop = asyncio.get_running_loop()
        self._print_banner()
        self._write_pid()

        # Setup signal handlers
        for sig in (signal.SIGINT, signal.SIGTERM):
            self._loop.add_signal_handler(sig, self._signal_stop)

        self.scheduler = AsyncIOScheduler(timezone='UTC')
        self._load_schedules()
        self._start_all_active()
        self.scheduler.start()

        self._log(f"Daemon started. Monitoring {len(self.schedules)} schedule(s).", "🚀")
        self._print_status()

        tick = 0
        while self._running:
            await asyncio.sleep(5)
            tick += 5
            self._check_config_changes()
            if tick >= self._status_interval:
                self._print_status()
                tick = 0

        # Shutdown
        self._shutdown()

    def _signal_stop(self):
        self._log("Shutdown signal received.", "🛑")
        self._running = False

    def _shutdown(self):
        self._log("Stopping all watchers…", "⏹ ")
        for obs in self.observers.values():
            obs.stop()
        for obs in self.observers.values():
            obs.join(timeout=2)
        if self.scheduler and self.scheduler.running:
            self.scheduler.shutdown(wait=False)
        self._remove_pid()
        self._log("Daemon stopped.", "👋")

    # ── Config management ──────────────────────────────────────────────
    def _load_schedules(self):
        if SCHEDULES_FILE.exists():
            try:
                with open(SCHEDULES_FILE, 'r') as f:
                    self.schedules = json.load(f)
                self._config_mtime = SCHEDULES_FILE.stat().st_mtime_ns
            except Exception as e:
                self._log(f"Failed to load config: {e}", "❌")

    def _save_schedules(self):
        try:
            with open(SCHEDULES_FILE, 'w') as f:
                json.dump(self.schedules, f, indent=4)
            self._config_mtime = SCHEDULES_FILE.stat().st_mtime_ns
        except Exception as e:
            self._log(f"Failed to save config: {e}", "❌")

    def _check_config_changes(self):
        """Hot-reload schedules.json if modified externally (e.g. by backend API)."""
        if not SCHEDULES_FILE.exists():
            return
        mtime = SCHEDULES_FILE.stat().st_mtime_ns
        if mtime <= self._config_mtime:
            return
        self._log("Config changed externally — reloading…", "🔄")
        old_ids = set(self.schedules.keys())
        self._load_schedules()
        new_ids = set(self.schedules.keys())

        # Stop removed
        for sid in old_ids - new_ids:
            self._stop_schedule(sid)
            self._log(f"Removed schedule {sid}", "🗑 ")

        # Start added
        for sid in new_ids - old_ids:
            s = self.schedules[sid]
            if s.get("status") == "active":
                self._start_schedule(sid)
                self._log(f"New schedule {sid} activated", "✨")

        # Reconcile existing
        for sid in old_ids & new_ids:
            s = self.schedules[sid]
            is_running = sid in self.observers
            should_run = s.get("status") == "active"
            if should_run and not is_running:
                self._start_schedule(sid)
                self._log(f"Resumed {sid}", "▶️ ")
            elif not should_run and is_running:
                self._stop_schedule(sid)
                self._log(f"Paused {sid}", "⏸ ")

            # Check trigger_pending flag
            if s.get("trigger_pending"):
                s["trigger_pending"] = False
                self._save_schedules()
                asyncio.create_task(self._execute_organize(sid, [], "manual"))
                self._log(f"Manual trigger for {sid}", "⚡")

        # Auto-exit when all schedules have been deleted
        if old_ids and not new_ids:
            self._log("All schedules deleted — daemon has nothing to do. Exiting.", "👋")
            self._running = False

    # ── Schedule lifecycle ─────────────────────────────────────────────
    def _start_all_active(self):
        for sid, s in self.schedules.items():
            if s.get("status") == "active":
                self._start_schedule(sid)

    def _start_schedule(self, sid: str):
        s = self.schedules.get(sid)
        if not s:
            return
        src = s["source_folder"]
        if not os.path.exists(src):
            self._log(f"Source folder not found: {src}", "⚠️ ")
            return

        self._locks[sid] = asyncio.Lock()
        self._pending_q[sid] = []

        mode = s.get("mode", "scheduled")

        # Watchdog
        if mode == "active":
            handler = _WatchHandler(sid, s.get("debounce_seconds", 5),
                                    self._execute_organize, self._loop)
            obs = Observer()
            obs.schedule(handler, src, recursive=True)
            obs.start()
            self.observers[sid] = obs

        # APScheduler interval
        hrs = s.get("interval_hours", 0)
        mins = s.get("interval_minutes", 0)
        if hrs == 0 and mins == 0:
            hrs = 24
        
        # For active mode, if no interval provided, enforce daily fallback sweep
        if mode == "active" and (hrs == 0 and mins == 0):
            hrs = 24

        job_id = f"job_{sid}"
        if self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)
        self.scheduler.add_job(
            self._sweep, 'interval',
            hours=hrs, minutes=mins,
            args=[sid], id=job_id,
            replace_existing=True,
            misfire_grace_time=None, coalesce=True
        )
        # Update next_sweep_at
        interval_td = timedelta(hours=hrs, minutes=mins)
        s["next_sweep_at"] = (_utcnow() + interval_td).isoformat()
        self._save_schedules()

        if mode == "active":
            self._log(f"Actively watching {src} (fallback sweep every {hrs}h {mins}m)", "👁 ")
        else:
            self._log(f"Scheduled sweep for {src} (every {hrs}h {mins}m)", "⏰")

        # Run an initial sweep immediately for new schedules or active folders starting up
        if not s.get("last_run_at") or mode == "active":
            self._log(f"Triggering initial/catch-up sweep for {sid}", "🚀")
            self._loop.create_task(self._sweep(sid))

    def _stop_schedule(self, sid: str):
        obs = self.observers.pop(sid, None)
        if obs:
            obs.stop()
            obs.join(timeout=2)
        job_id = f"job_{sid}"
        if self.scheduler and self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)

    # ── Sweep callback (async — runs in event loop) ────────────────────
    async def _sweep(self, sid: str):
        s = self.schedules.get(sid)
        if not s or s.get("status") != "active":
            return
        self._log(f"Sweep triggered for {sid}", "⏰")

        # Update next_sweep_at
        hrs = s.get("interval_hours", 0)
        mins = s.get("interval_minutes", 0)
        if hrs == 0 and mins == 0:
            hrs = 24
        s["next_sweep_at"] = (_utcnow() + timedelta(hours=hrs, minutes=mins)).isoformat()
        self._save_schedules()

        # Pass the cutoff timestamp to execute — organizer_logic will filter internally
        last_run = _parse_ts(s.get("last_run_at"))
        cutoff = last_run.timestamp() if last_run else 0
        await self._execute_organize(sid, [], "sweep", mtime_cutoff=cutoff)

    # ── Execute organize (delegates to backend HTTP API) ───────────────
    async def _execute_organize(self, sid: str, files: List[str], triggered_by: str, mtime_cutoff: float = 0):
        s = self.schedules.get(sid)
        if not s or s.get("status") != "active":
            return

        lock = self._locks.get(sid)
        if lock and lock.locked():
            self._pending_q[sid].extend(files)
            self._log(f"Queued {len(files)} files (job active)", "📥")
            return

        async with lock:
            all_files = list(set(files + self._pending_q.get(sid, [])))
            self._pending_q[sid] = []

            start = _utcnow()
            self._log(f"Starting organize [{triggered_by}]…", "⚙️ ")

            base = _backend_url()

            # Build payload — matches SortRequest Pydantic model exactly
            sorting_options = {
                "primary_sort": s["primary_sort"],
                "face_mode": s.get("face_mode", "balanced"),
                "maintain_hierarchy": s.get("maintain_hierarchy", True),
                # Tells _core_processing_loop to only process files newer than this
                "mtime_cutoff": mtime_cutoff if mtime_cutoff > 0 else None,
            }
            if all_files:
                sorting_options["specific_files"] = all_files

            payload = {
                "source_folder": s["source_folder"],
                "destination_folder": s["destination_folder"],
                "sorting_options": sorting_options,
                "operation_mode": s.get("operation_mode", "copy"),
                "ignore_list": s.get("ignore_list", []),
            }

            error_msg = None
            count = 0
            try:
                # Step 1: POST /api/start-sorting to kick off the job
                raw = json.dumps(payload).encode()
                req = urllib.request.Request(
                    f"{base}/api/start-sorting",
                    data=raw,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    job_start = json.loads(resp.read())

                if job_start.get("status") not in ("started", "ok", "success", "running"):
                    raise RuntimeError(f"Backend rejected job: {job_start}")

                self._log("Job started on backend. Polling…", "🔗")

                # Brief wait to let backend transition from 'ready' → 'running'
                await asyncio.sleep(1.0)

                # Step 2: Poll /api/job-status until done (max 30 min)
                last_msg = ""
                for _ in range(3600):  # 3600 × 0.5s = 30 min max
                    await asyncio.sleep(0.5)
                    try:
                        status_req = urllib.request.Request(
                            f"{base}/api/job-status",
                            method="GET",
                        )
                        with urllib.request.urlopen(status_req, timeout=5) as resp:
                            status = json.loads(resp.read())
                    except Exception:
                        await asyncio.sleep(2)
                        continue

                    state = status.get("status", "")
                    msg = status.get("message", "")

                    if state in ("complete", "error", "aborted", "warning"):
                        # Extract file count from the completion message
                        # e.g. "Process complete. 5 files successfully copied."
                        import re
                        m = re.search(r"(\d+)\s+files?\s+successfully", msg or "")
                        count = int(m.group(1)) if m else 0
                        if state == "error":
                            error_msg = msg or "Unknown error from backend"
                        self._log(
                            f"Backend finished: {count} file(s) [{state}] — {msg}",
                            "✅" if state == "complete" else "⚠️ "
                        )
                        break

                    # Log progress messages (avoid spamming duplicates)
                    if msg and msg != last_msg:
                        self._log(msg, "  ")
                        last_msg = msg

            except urllib.error.URLError as e:
                error_msg = f"Backend not reachable: {e}. Is the LocalLens backend running?"
                self._log(error_msg, "❌")
            except Exception as e:
                error_msg = str(e)
                self._log(f"Error: {e}", "❌")

            end = _utcnow()
            elapsed = (end - start).total_seconds()

            entry = {
                "triggered_by": triggered_by,
                "started_at": start.isoformat(),
                "completed_at": end.isoformat(),
                "files_processed": count,
                "status": "error" if error_msg else "complete",
                "error": error_msg
            }
            history = s.get("run_history", [])
            history.insert(0, entry)
            s["run_history"] = history[:10]

            if error_msg:
                s["consecutive_errors"] = s.get("consecutive_errors", 0) + 1
                s["last_error"] = error_msg
                if s["consecutive_errors"] >= 5:
                    s["status"] = "error"
                    s["last_error"] = f"Auto-paused after 5 failures. Last: {error_msg}"
                    self._stop_schedule(sid)
                    self._log(f"Auto-paused {sid} after 5 failures", "🔴")
            else:
                s["consecutive_errors"] = 0
                # IMPORTANT: Record the START time of this job as last_run_at, not end.
                # If we used end time, any photos added DURING the sweep (mtime between
                # start and end) would be silently skipped by the next sweep's cutoff.
                s["last_run_at"] = start.isoformat()
                s["files_organized_total"] = s.get("files_organized_total", 0) + count
                self._log(f"Done — {count} files in {elapsed:.1f}s", "✅")

            self._save_schedules()

        # Outside the lock, if files were added to the queue while we were running, process them now
        if self._pending_q.get(sid):
            self._log(f"Found {len(self._pending_q[sid])} files added during run, starting next batch...", "🔄")
            self._loop.create_task(self._execute_organize(sid, [], "queue"))

    # ── PID file ───────────────────────────────────────────────────────
    def _write_pid(self):
        PID_FILE.write_text(str(os.getpid()))

    def _remove_pid(self):
        if PID_FILE.exists():
            PID_FILE.unlink()


# ===========================================================================
#  CLI Commands
# ===========================================================================
def cmd_start():
    # Check if already running
    if PID_FILE.exists():
        pid = int(PID_FILE.read_text().strip())
        try:
            os.kill(pid, 0)  # Check if process exists
            print(f"Daemon already running (PID {pid}). Use 'stop' first.")
            sys.exit(1)
        except OSError:
            PID_FILE.unlink()  # Stale PID file

    daemon = SchedulerDaemon()
    asyncio.run(daemon.run())


def cmd_status():
    # Check PID
    if PID_FILE.exists():
        pid = int(PID_FILE.read_text().strip())
        try:
            os.kill(pid, 0)
            print(f"\n  {C.G}● Daemon is running{C.X} (PID {pid})\n")
        except OSError:
            print(f"\n  {C.R}● Daemon is NOT running{C.X} (stale PID file)\n")
    else:
        print(f"\n  {C.Y}● Daemon is NOT running{C.X}\n")

    # Show schedule info
    if SCHEDULES_FILE.exists():
        with open(SCHEDULES_FILE, 'r') as f:
            schedules = json.load(f)
        if not schedules:
            print("  No schedules configured.\n")
            return
        for sid, s in schedules.items():
            icon = {"active": f"{C.G}🟢{C.X}", "paused": f"{C.Y}⏸{C.X}",
                    "error": f"{C.R}🔴{C.X}"}.get(s.get("status"), "❓")
            mode_display = "Active Folder" if s.get("mode") == "active" else "Scheduled Sweep"
            next_dt = _parse_ts(s.get("next_sweep_at"))
            last_dt = _parse_ts(s.get("last_run_at"))
            print(f"  {icon} {sid} ({mode_display})")
            print(f"     {s.get('source_folder', '?')} → {s.get('destination_folder', '?')}")
            print(f"     Sort: {s.get('primary_sort')}  |  Interval: {s.get('interval_hours', 0)}h {s.get('interval_minutes', 0)}m")
            print(f"     Last: {_local_str(last_dt)} {C.D}({_ago(last_dt)}){C.X}")
            print(f"     Next: {_local_str(next_dt)} {C.G}(in {_countdown(next_dt)}){C.X}")
            print(f"     Total organized: {s.get('files_organized_total', 0)}")
            print()
    else:
        print("  No schedules file found.\n")


def cmd_stop():
    if not PID_FILE.exists():
        print("Daemon is not running.")
        return
    pid = int(PID_FILE.read_text().strip())
    try:
        os.kill(pid, signal.SIGTERM)
        print(f"Sent stop signal to daemon (PID {pid}).")
    except OSError:
        print("Daemon process not found. Cleaning up PID file.")
        PID_FILE.unlink()


# ===========================================================================
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scheduler_daemon.py [start|status|stop]")
        sys.exit(1)

    cmd = sys.argv[1].lower()
    if cmd == "start":
        cmd_start()
    elif cmd == "status":
        cmd_status()
    elif cmd == "stop":
        cmd_stop()
    elif cmd == "restart":
        cmd_stop()
        import time as _t; _t.sleep(1)
        cmd_start()
    else:
        print(f"Unknown command: {cmd}")
        print("Usage: python scheduler_daemon.py [start|status|stop|restart]")
        sys.exit(1)
