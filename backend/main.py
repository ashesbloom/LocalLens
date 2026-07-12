# ==============================================================================
#  Photo Organizer - API Server & Main Entry Point (Fully Featured)
# ==============================================================================
#
#  This script launches a FastAPI web server with real-time logging via
#  Server-Sent Events (SSE) to provide a responsive user experience for
#  both sorting and face enrollment.
#
# ==============================================================================

#! CRITICAL: This MUST be at the very top before any other imports
# Required for PyInstaller to work correctly with multiprocessing on macOS/Windows
import multiprocessing
if __name__ == "__main__":
    multiprocessing.freeze_support()

try:
    import setproctitle
    setproctitle.setproctitle("LocalLens-Backend")
except ImportError:
    pass

import os
import asyncio
import json
import sys
import subprocess
import shutil
import pickle
import logging
import signal
from datetime import datetime
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, Body, Request, BackgroundTasks, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional
from starlette.responses import StreamingResponse
import asyncio
# import os
# import shutil
# import json
# import signal
import uvicorn
from asyncio import Queue, CancelledError # FIX: Import the asyncio Queue and CancelledError

# --- Custom Exception Import ---
from exceptions import OperationAbortedError

# --- Path Configuration ---

# NEW: Define the path to the frontend build directory
# This handles both development (running as script) and production (running as .exe)
if getattr(sys, 'frozen', False):
    # Path when running as a bundled executable (e.g., from PyInstaller)
    # The frontend is expected to be in a 'dist' folder relative to the executable
    application_path = os.path.dirname(sys.executable)
    # This path assumes the backend exe is in `src-tauri` and the UI is in `dist`
    # Adjust if your final build structure is different.
    FRONTEND_DIR = os.path.join(application_path, '..', 'dist') 
else:
    # Path when running as a script (`python main.py`)
    application_path = os.path.dirname(os.path.abspath(__file__))
    FRONTEND_DIR = os.path.join(application_path, '..', 'frontend', 'dist')


def get_app_data_dir():
    """Gets the application data directory, creating it if it doesn't exist."""
    if sys.platform == 'win32':
        appdata_env = os.getenv('APPDATA')
        if not appdata_env:
            raise RuntimeError("APPDATA environment variable is not set on Windows.")
        app_data_path = Path(appdata_env) / 'LocalLens'
    else: # For macOS and Linux
        app_data_path = Path.home() / '.config' / 'LocalLens'
    app_data_path.mkdir(parents=True, exist_ok=True)
    return app_data_path

# --- Centralized paths for ALL user data ---
APP_DATA_DIR = get_app_data_dir()
ENROLLMENT_FOLDER = APP_DATA_DIR / "Enrollment"
ENCODINGS_FILE = APP_DATA_DIR / "encodings.pickle"
LAST_CONFIG_FILE = APP_DATA_DIR / "last_config.json"
PATH_PRESETS_FILE = APP_DATA_DIR / "path_presets.json"


# --- Backend Logic Imports ---
# MODIFIED: Import the module itself to access its variables dynamically.
from organizer_logic import (
    process_photos, SUPPORTED_EXTENSIONS, 
    load_face_encodings, find_and_group_photos, get_metadata_overview, 
    initialize_libraries, build_folder_tree
)
import organizer_logic
from enrollment_logic import update_encodings

# --- Lifespan Context Manager ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ensure necessary directories exist and libraries are initialized on server startup."""
    import time as _time
    # Record start time so /api/stats can report accurate uptime
    app.state.start_time = _time.monotonic()
    # One-time initialization of heavy libraries with verbose output.
    initialize_libraries(is_main_process=True)
    
    # Create necessary folders on startup in the persistent location
    ENROLLMENT_FOLDER.mkdir(exist_ok=True)

    # Note: Daemon auto-start has been removed so MCP agent can explicitly launch it in a terminal.


    yield
    # Code here would run on shutdown


# ---------------------------------------------------------------------------
#  Scheduler Daemon Management
# ---------------------------------------------------------------------------
_daemon_proc = None  # Track the subprocess we launched

def _is_daemon_alive() -> bool:
    """Check if a scheduler daemon is already running via PID file."""
    pid_file = APP_DATA_DIR / "scheduler.pid"
    if not pid_file.exists():
        return False
    try:
        pid = int(pid_file.read_text().strip())
        os.kill(pid, 0)  # Check if process exists (doesn't actually kill)
        return True
    except (OSError, ValueError):
        # Process doesn't exist or PID is invalid — clean up stale file
        pid_file.unlink(missing_ok=True)
        return False

def _ensure_daemon_running():
    """Start the scheduler daemon if it's not running and there are active schedules."""
    global _daemon_proc
    if _is_daemon_alive():
        return  # Already running

    # Check if there are any active schedules
    schedules_file = APP_DATA_DIR / "schedules.json"
    if schedules_file.exists():
        try:
            with open(schedules_file, 'r') as f:
                schedules = json.load(f)
            has_active = any(s.get("status") == "active" for s in schedules.values())
            if not has_active:
                return  # No active schedules, no need to start daemon
        except Exception:
            return

    # Launch the daemon as a background subprocess
    daemon_script = Path(__file__).parent / "scheduler_daemon.py"
    if not daemon_script.exists():
        print("Warning: scheduler_daemon.py not found — auto-scheduling disabled.")
        return

    log_file = APP_DATA_DIR / "scheduler.log"
    try:
        log_handle = open(log_file, 'a')
        # Force unbuffered output so scheduler-ui can read logs in real-time
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        kwargs = {
            "stdout": log_handle,
            "stderr": subprocess.STDOUT,
            "env": env,
        }
        # Platform-independent detached process
        if sys.platform == 'win32':
            kwargs["creationflags"] = (
                subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
            )
        else:
            kwargs["start_new_session"] = True

        _daemon_proc = subprocess.Popen(
            [sys.executable, str(daemon_script), "start"],
            **kwargs
        )
        print(f"Scheduler daemon launched (PID {_daemon_proc.pid}). Logs: {log_file}")
    except Exception as e:
        print(f"Warning: Failed to start scheduler daemon: {e}")


# --- Application State ---
# A thread-safe queue for sending real-time status updates to the frontend.
log_queue: "Queue[str]" = Queue()

# NEW: Current Job Tracking for external integrations (MCP polling)
# All fields here are intentionally persisted after a job completes so that
# an LLM can still read what the last job did (e.g. after wait_for_completion).
current_job_state = {
    # --- Core status (updated live during the job) ---
    "is_active": False,
    "progress": 0,
    "message": "Idle",
    "status": "ready",
    # --- Job identity (set at job start, cleared on next job) ---
    "job_type": None,           # "sorting" | "find_group" | "enrollment"
    "operation_mode": None,     # "copy" | "move" (find_group is always copy)
    # --- Location context ---
    "source_folder": None,
    "destination_folder": None,
    # --- Sorting context (sorting jobs only) ---
    "primary_sort": None,       # "Date" | "Location" | "People" | "Hybrid"
    "face_mode": None,          # "Fast (HOG)" | "Balanced" | "Accurate (CNN)" — only when primary_sort=People
    # --- Find & Group context (find_group jobs only) ---
    "folder_name": None,        # Target subfolder name inside destination
    "filters_applied": None,    # Dict summarising active filters (years, months, locations, people)
    # --- File scope ---
    "total_files": 0,           # Total supported photo files found in source (respects ignore list)
    "ignore_list": [],          # Folders excluded from this job
}

# --- Cancellation Events for Aborting Tasks ---
# Use multiprocessing.Event, which can be safely passed to other processes.
cancellation_events = {
    "sorting": multiprocessing.Event(),
    "enrollment": multiprocessing.Event(),
    "find_group": multiprocessing.Event()
}

# --- Application Version ---
# Canonical version string — keep this in sync with frontend/package.json and tauri.conf.json.
APP_VERSION = "2.4.1"

# --- FastAPI App Initialization ---
app = FastAPI(
    title="LocalLens - Photo Organizer API",
    description="Backend services for the LocalLens AI Photo Organizer application with SSE.",
    version=APP_VERSION,
    lifespan=lifespan
)

# --- CORS Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins for local development with Tauri
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models for API Data Validation ---

# MODIFIED: This model is now flexible enough to handle Standard and Hybrid sort options.
class SortOptions(BaseModel):
    primary_sort: str
    face_mode: Optional[str] = 'balanced'
    maintain_hierarchy: Optional[bool] = True
    # --- Fields for Hybrid Sort ---
    base_sort: Optional[str] = None
    specific_folder_name: Optional[str] = None
    custom_filter: Optional[Dict] = None
    # --- Fields for Standard Location Sort ---
    sub_sort_by_date: Optional[bool] = False
    # --- Fields for Scheduler Daemon (new files only) ---
    mtime_cutoff: Optional[float] = None     # Unix timestamp — skip files older than this
    specific_files: Optional[List[str]] = None  # Process only these files


class SortRequest(BaseModel):
    source_folder: str
    destination_folder: str
    sorting_options: SortOptions
    ignore_list: Optional[List[str]] = []
    operation_mode: Optional[str] = 'move' # Add this line, default to 'move'

# NEW: Model for the 'Find & Group' feature configuration
class FindGroupConfig(BaseModel):
    folderName: str
    years: Optional[List[str]] = []
    months: Optional[List[str]] = []
    locations: Optional[List[str]] = []
    people: Optional[List[str]] = []
    face_mode: Optional[str] = "fast"

# NEW: Model for the 'Find & Group' request
class FindGroupRequest(BaseModel):
    source_folder: str
    destination_folder: str
    find_config: FindGroupConfig
    ignore_list: Optional[List[str]] = []
    # REMOVE: operation_mode is no longer needed here.
    # operation_mode: Optional[str] = 'copy'

class LastConfig(BaseModel):
    source_folder: Optional[str] = ""
    destination_folder: Optional[str] = ""
    sort_method: Optional[str] = "Date"
    face_mode: Optional[str] = "balanced"
    maintain_hierarchy: Optional[bool] = False
    ignored_subfolders: Optional[List[str]] = []
    operation_mode: Optional[str] = "standard" # This is for UI mode, not file op

# NEW: Model for a single person's data in a batch.
class PersonData(BaseModel):
    person_name: str
    image_paths: List[str]

# NEW: Model for batch enrollment request.
class BatchEnrollmentRequest(BaseModel):
    people_to_enroll: List[PersonData]

class PathPreset(BaseModel):
    name: str
    source: str
    destination: str

class OpenFolderRequest(BaseModel):
    folder_path: str

class OpenEnrolledFolderRequest(BaseModel):
    person_name: str

class SubfolderRequest(BaseModel):
    path: str
    # ADD THIS: The frontend will send the list of folders to ignore.
    ignore_list: Optional[List[str]] = []

class MetadataOverviewRequest(BaseModel):
    source_folder: str
    ignore_list: Optional[List[str]] = []

# --- Background Task & SSE Logic ---

def update_status_callback(update_data: Dict):
    """Puts a log message into the queue for the client."""
    global current_job_state
    
    # Update global state for polling logic
    current_job_state["progress"] = update_data.get("progress", 0)
    current_job_state["message"] = update_data.get("message", "processing...")
    
    # Set to true if running, else false when completing or erroring.
    st = update_data.get("status", "running")
    current_job_state["status"] = st
    current_job_state["is_active"] = st == "running"

    try:
        # Use put_nowait for thread-safe adding from background tasks
        log_queue.put_nowait(json.dumps(update_data))
    except Exception as e:
        print(f"Error adding log to queue: {e}")


def _count_source_files(source_folder: str, ignore_list: list) -> int:
    """
    Counts all supported image files inside source_folder, honouring ignore_list.
    Mirrors the exact os.walk filtering logic used by the core processing functions
    so the count matches what the job will actually process.
    """
    ignore_set = set(ignore_list or [])
    count = 0
    try:
        for dirpath, _, filenames in os.walk(source_folder):
            if dirpath in ignore_set:
                continue  # Skip files in this ignored directory
            count += sum(
                1 for f in filenames
                if f.lower().endswith(SUPPORTED_EXTENSIONS)
            )
    except Exception as e:
        print(f"Warning: could not count source files: {e}")
    return count


_FACE_MODE_LABELS = {
    "fast": "Fast (HOG)",
    "balanced": "Balanced (LL Algorithm)",
    "accurate": "Accurate (CNN)",
}

async def run_organization_task(config: Dict):
    """The main processing task, wrapped to be run in the background."""
    global current_job_state
    cancellation_events["sorting"].clear()  # Reset cancellation event

    # --- Enrich job state BEFORE spawning the thread ---
    # This allows MCP polling to immediately detect the job type and context,
    # and prevents stale terminal state from a previous job confusing the poller.
    sort_opts = config.get("sorting_options", {})
    primary_sort = sort_opts.get("primary_sort", "Date")
    raw_face_mode = sort_opts.get("face_mode", "balanced") or "balanced"
    ignore_list = config.get("ignore_list") or []
    is_hybrid = primary_sort.lower() == "hybrid"

    # --- Hybrid-specific context extraction ---
    # For Hybrid sorts, the key details live in custom_filter and specific_folder_name
    # rather than the top-level sort fields.
    custom_filter = sort_opts.get("custom_filter") or {}
    filter_type = custom_filter.get("filter_type")  # "People" | "Location" | "Date" | None

    # folder_name: used in Hybrid to name the special-match subfolder
    folder_name = sort_opts.get("specific_folder_name") if is_hybrid else None

    # filters_applied: summarise what the Hybrid custom filter is doing
    filters_applied = None
    if is_hybrid and custom_filter:
        filters_applied = {"base_sort": sort_opts.get("base_sort"), "filter_type": filter_type}
        if filter_type == "People":
            filters_applied["people"] = custom_filter.get("people", [])
        elif filter_type == "Location":
            filters_applied["locations"] = custom_filter.get("locations", [])
        elif filter_type == "Date":
            if custom_filter.get("years"):
                filters_applied["years"] = custom_filter["years"]
            if custom_filter.get("months"):
                filters_applied["months"] = custom_filter["months"]

    # face_mode is relevant for: People sort, OR Hybrid with a People custom_filter
    face_mode_active = (
        primary_sort.lower() in {"people", "faces"} or
        (is_hybrid and filter_type == "People")
    )

    current_job_state.update({
        "is_active": True,
        "status": "running",
        "progress": 0,
        "message": "Starting organization...",
        # Job identity
        "job_type": "sorting",
        "operation_mode": config.get("operation_mode", "move"),
        # Location
        "source_folder": config.get("source_folder"),
        "destination_folder": config.get("destination_folder"),
        # Sort specifics
        "primary_sort": primary_sort,
        "face_mode": _FACE_MODE_LABELS.get(raw_face_mode.lower(), raw_face_mode)
                     if face_mode_active else None,
        # Hybrid / Find & Group shared fields
        "folder_name": folder_name,
        "filters_applied": filters_applied,
        # File scope
        "ignore_list": ignore_list,
        "total_files": _count_source_files(config.get("source_folder", ""), ignore_list),
    })

    try:
        # Pass the centralized encodings file path to the logic function
        config["encodings_path"] = ENCODINGS_FILE
        config["cancellation_event"] = cancellation_events["sorting"]
        
        # Create an adapter for the callback to match the expected signature
        def callback_adapter(progress: int, message: str, status: str = "running", analytics: Optional[Dict] = None):
            update_data = {
                "progress": progress, 
                "message": message, 
                "status": status,
                "analytics": analytics or {}
            }
            update_status_callback(update_data)

        # Run the entire blocking function in a separate thread
        await asyncio.to_thread(process_photos, config, callback_adapter)
    except OperationAbortedError:
        abort_message = "Operation aborted by user. Cleaning up..."
        print(f"BACKGROUND TASK: {abort_message}")
        error_update = {"progress": 100, "message": abort_message, "status": "aborted"}
        update_status_callback(error_update)
    except Exception as e:
        error_update = {"progress": 100, "message": f"An error occurred: {e}", "status": "error"}
        update_status_callback(error_update)
        print(f"BACKGROUND TASK ERROR: {e}")

# NEW: Background task runner for the find and group process.
async def run_find_group_task(config: Dict):
    """The find & group task, wrapped to be run in the background."""
    global current_job_state
    cancellation_events["find_group"].clear()  # Reset cancellation event

    # --- Enrich job state BEFORE spawning the thread ---
    find_cfg = config.get("find_config", {})
    raw_face_mode = find_cfg.get("face_mode", "fast") or "fast"
    ignore_list = config.get("ignore_list") or []

    # Summarise which filters are actually active (non-empty)
    filters_applied = {
        k: v for k, v in {
            "years":     find_cfg.get("years"),
            "months":    find_cfg.get("months"),
            "locations": find_cfg.get("locations"),
            "people":    find_cfg.get("people"),
        }.items() if v  # only include filters that have values
    }

    current_job_state.update({
        "is_active": True,
        "status": "running",
        "progress": 0,
        "message": "Starting find & group...",
        # Job identity
        "job_type": "find_group",
        "operation_mode": "copy",  # find_group is always copy-only
        # Location
        "source_folder": config.get("source_folder"),
        "destination_folder": config.get("destination_folder"),
        # Find & Group specifics
        "folder_name": find_cfg.get("folderName"),
        "filters_applied": filters_applied if filters_applied else None,
        "face_mode": _FACE_MODE_LABELS.get(raw_face_mode.lower(), raw_face_mode)
                     if find_cfg.get("people") else None,
        # Sorting fields — not applicable here
        "primary_sort": None,
        # File scope
        "ignore_list": ignore_list,
        "total_files": _count_source_files(config.get("source_folder", ""), ignore_list),
    })
    target_folder = None
    try:
        config["encodings_path"] = ENCODINGS_FILE
        config["cancellation_event"] = cancellation_events["find_group"]
        
        # Determine the target folder path for potential cleanup
        target_folder_name = config.get("find_config", {}).get('folderName', "Find_Results")
        target_folder = os.path.join(config["destination_folder"], target_folder_name)

        # FIX: The callback adapter now accepts the 'analytics' dictionary.
        def callback_adapter(progress: int, message: str, status: str = "running", analytics: Optional[Dict] = None):
            update_data = {
                "progress": progress, 
                "message": message, 
                "status": status,
                "analytics": analytics or {}
            }
            update_status_callback(update_data)

        # Run the entire blocking function in a separate thread
        await asyncio.to_thread(find_and_group_photos, config, callback_adapter)
    except OperationAbortedError:
        abort_message = "Find & Group aborted by user. Cleaning up..."
        print(f"BACKGROUND TASK: {abort_message}")
        if target_folder and os.path.exists(target_folder):
            shutil.rmtree(target_folder)
            print(f"Cleaned up partially created folder: {target_folder}")
        error_update = {"progress": 100, "message": abort_message, "status": "aborted"}
        update_status_callback(error_update)
    except Exception as e:
        error_update = {"progress": 100, "message": f"An error occurred: {e}", "status": "error"}
        update_status_callback(error_update)
        print(f"BACKGROUND TASK ERROR: {e}")


# NEW: Background task runner for the enrollment process.
async def run_enrollment_task(newly_created_dirs: List[str]):
    """Wrapper to run the face enrollment process and send real-time updates."""
    cancellation_events["enrollment"].clear()
    try:
        def callback_adapter(progress: int, message: str, status: str = "running"):
            # Add a 'source' key to distinguish from sorting logs
            update_data = {"progress": progress, "message": message, "status": status, "source": "enrollment"}
            update_status_callback(update_data)
        
        # Run the entire blocking function in a separate thread
        await asyncio.to_thread(
            update_encodings, 
            ENROLLMENT_FOLDER, 
            ENCODINGS_FILE, 
            cancellation_events["enrollment"], 
            callback_adapter
        )
    except OperationAbortedError:
        abort_message = "Enrollment aborted by user. Reverting changes..."
        print(f"ENROLLMENT TASK: {abort_message}")
        # Clean up folders created in this session
        for person_dir in newly_created_dirs:
            if os.path.isdir(person_dir):
                try:
                    shutil.rmtree(person_dir)
                    print(f"Successfully removed aborted enrollment folder: {person_dir}")
                except Exception as e:
                    print(f"Error removing directory {person_dir}: {e}")
        
        # FIX: The original `error_update` was not being passed to the callback.
        # This ensures the final "aborted" status is sent to the UI.
        final_update = {"progress": 100, "message": abort_message, "status": "aborted", "source": "enrollment"}
        update_status_callback(final_update)

    except Exception as e:
        error_update = {"progress": 100, "message": f"An error occurred during enrollment: {e}", "status": "error", "source": "enrollment"}
        update_status_callback(error_update)
        print(f"ENROLLMENT TASK ERROR: {e}")

async def log_streamer(request: Request):
    """Yields server-sent events to the client."""
    # Use a local queue to buffer messages for this specific client
    # This prevents race conditions if multiple clients connect.
    client_queue: "Queue[str]" = Queue()

    # Function to copy messages from the global queue to the local one
    async def queue_copier():
        while True:
            message = await log_queue.get()
            await client_queue.put(message)
            log_queue.task_done()

    copier_task = asyncio.create_task(queue_copier())

    try:
        while True:
            # Check if the client has disconnected
            if await request.is_disconnected():
                print("Client disconnected, closing log stream.")
                break
            
            try:
                # Wait for a message from the local queue
                log_message = await asyncio.wait_for(client_queue.get(), timeout=1.0)
                yield f"data: {log_message}\n\n"
                client_queue.task_done()
            except asyncio.TimeoutError:
                # No message, just loop and check for disconnect again
                continue
    except CancelledError:
        print("Log stream cancelled.")
    finally:
        copier_task.cancel()


# ==============================================================================
#  API Endpoints
# ==============================================================================

@app.get("/")
def read_root():
    return {"message": "Welcome to the Photo Organizer API. Please refer to the documentation for available endpoints."}

@app.get("/api/stream-logs")
async def stream_logs(request: Request):
    """Endpoint for the frontend to connect to for real-time log updates."""
    return StreamingResponse(log_streamer(request), media_type="text/event-stream")

@app.post("/api/list-subfolders")
async def list_subfolders(request: SubfolderRequest):
    """
    MODIFIED: Lists subdirectories as a hierarchical tree and dynamically counts 
    files and folders, respecting an ignore list of full paths.
    """
    source_path = os.path.expanduser(request.path) if request.path else ""
    # The ignore list now contains full paths.
    ignore_set = set(request.ignore_list or [])

    if not source_path or not os.path.isdir(source_path):
        raise HTTPException(status_code=404, detail="Source path is not a valid directory.")
    try:
        # Build the hierarchical tree structure for the UI.
        folder_tree = build_folder_tree(source_path)
        
        file_count = 0
        folder_count = 0
        
        # CORRECTED LOGIC: Walk the entire directory tree to accurately count items.
        # This now matches the behavior of the core processing logic.
        for dirpath, dirnames, filenames in os.walk(source_path):
            # Count folders that are NOT in the ignore list.
            # We check this by iterating through the children of the current dirpath.
            for d in dirnames:
                if os.path.join(dirpath, d) not in ignore_set:
                    folder_count += 1

            # If the current directory itself is ignored, skip counting its files,
            # but allow os.walk to continue into its subdirectories (like 'B' inside 'A').
            if dirpath in ignore_set:
                continue
            
            # If the directory is not ignored, count its supported files.
            file_count += len([f for f in filenames if f.lower().endswith(SUPPORTED_EXTENSIONS)])

        return {
            "subfolders": folder_tree, # Return the tree structure
            "stats": {
                "folder_count": folder_count,
                "file_count": file_count
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read directory contents: {str(e)}")

@app.post("/api/start-sorting")
async def start_sorting_endpoint(request: SortRequest, background_tasks: BackgroundTasks):
    """Starts the photo organization process in the background."""
    sort_opts = request.sorting_options.dict()
    config = {
        "source_folder": os.path.expanduser(request.source_folder),
        "destination_folder": os.path.expanduser(request.destination_folder),
        "sorting_options": sort_opts,
        "ignore_list": request.ignore_list or [],
        "operation_mode": request.operation_mode
    }
    # Forward specific_files and mtime_cutoff if provided (used by scheduler daemon)
    if sort_opts.get("specific_files"):
        config["specific_files"] = sort_opts["specific_files"]
    if sort_opts.get("mtime_cutoff") is not None:
        config["sorting_options"]["mtime_cutoff"] = sort_opts["mtime_cutoff"]
    background_tasks.add_task(run_organization_task, config)
    return {"status": "started", "message": "Organization process started successfully."}


# NEW: Endpoint to start the 'Find & Group' process
@app.post("/api/start-find-group")
async def start_find_group_endpoint(request: FindGroupRequest, background_tasks: BackgroundTasks):
    """Starts the 'Find & Group' process in the background."""
    config = {
        "source_folder": os.path.expanduser(request.source_folder),
        "destination_folder": os.path.expanduser(request.destination_folder),
        "find_config": request.find_config.dict(),
        "ignore_list": request.ignore_list or [],
        # REMOVE: No longer passing operation_mode from here.
    }
    background_tasks.add_task(run_find_group_task, config)
    return {"message": "Find & Group process started successfully."}


@app.post("/api/metadata-overview")
async def get_metadata_overview_endpoint(request: MetadataOverviewRequest):
    """Scans the source folder to return all available filter criteria."""
    source_folder = os.path.expanduser(request.source_folder) if request.source_folder else ""
    if not source_folder or not os.path.isdir(source_folder):
        raise HTTPException(status_code=400, detail="Source path is not a valid directory.")
    
    from organizer_logic import get_metadata_overview as get_metadata_logic

    try:
        locations, date_info, people = get_metadata_logic(
            source_folder, 
            request.ignore_list,
            ENCODINGS_FILE
        )
        
        return {
            "locations": locations,
            "dates": date_info, # MODIFIED: from "years" to "dates"
            "people": people
        }
    except Exception as e:
        logging.error(f"Error during metadata scan: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during metadata scan: {str(e)}")


# UPDATED: Endpoint now handles batch enrollment of multiple people.
@app.post("/api/add-person")
async def add_person_endpoint(request: BatchEnrollmentRequest, background_tasks: BackgroundTasks):
    """
    Accepts a batch of people and their images, copies them to the
    enrollment directory, and then triggers the background enrollment task.
    """
    from enrollment_logic import update_encodings
    newly_created_dirs = []
    try:
        for person_data in request.people_to_enroll:
            person_name = person_data.person_name
            # Sanitize person_name to create a valid directory name
            sanitized_name = "".join(c for c in person_name if c.isalnum() or c in (' ', '_', '-')).rstrip()
            if not sanitized_name:
                raise HTTPException(status_code=400, detail=f"Invalid person name provided: {person_name}")

            person_dir = os.path.join(ENROLLMENT_FOLDER, sanitized_name)
            os.makedirs(person_dir, exist_ok=True)
            newly_created_dirs.append(person_dir)

            for image_path in person_data.image_paths:
                if os.path.exists(image_path):
                    shutil.copy(image_path, person_dir)
                else:
                    # Log a warning but don't stop the whole batch
                    print(f"Warning: Image path not found, skipping: {image_path}")

        # Start the background task, passing the list of directories to be cleaned up on abort.
        background_tasks.add_task(run_enrollment_task, newly_created_dirs)

        return {"message": "Batch enrollment process started successfully."}
    except Exception as e:
        # If setup fails, clean up any directories that were created
        for d in newly_created_dirs:
            if os.path.isdir(d):
                shutil.rmtree(d)
        raise HTTPException(status_code=500, detail=f"Failed to prepare for enrollment: {e}")


@app.post("/api/abort-process")
async def abort_process():
    """Sets all cancellation events and sends an immediate confirmation to the UI."""
    global current_job_state
    if not current_job_state.get("is_active"):
        print("ABORT REQUEST RECEIVED: But no active process is running.")
        return {"status": "ignored", "message": "No active processes to abort."}

    print("ABORT REQUEST RECEIVED: Setting cancellation events.")
    for event in cancellation_events.values():
        event.set()
    
    # Immediately send a confirmation back to the UI via the log stream
    # This provides instant feedback that the signal was received.
    update_status_callback({
        "progress": 100, 
        "message": "Abort signal received by backend. Awaiting task termination...", 
        "status": "warning",
        "source": "system" # Use a neutral source
    })
    return {"status": "success", "message": "Abort signal sent to all running tasks."}


# ==============================================================================
#  NEW: Pro MCP Agent Endpoints
# ==============================================================================

class FindDuplicatesRequest(BaseModel):
    source_folder: str
    ignore_list: Optional[List[str]] = []
    similarity_threshold: Optional[float] = 0.95

@app.post("/api/find-duplicates")
async def find_duplicates_endpoint(request: FindDuplicatesRequest):
    """
    Scans a source folder for duplicate or near-duplicate images using
    perceptual hashing (pHash). Groups visually similar files together.
    """
    source_folder = os.path.expanduser(request.source_folder) if request.source_folder else ""
    if not source_folder or not os.path.isdir(source_folder):
        raise HTTPException(status_code=400, detail="Source path is not a valid directory.")

    try:
        from PIL import Image as PILImage
        import imagehash
    except ImportError:
        # imagehash is an optional dependency — graceful degradation
        raise HTTPException(
            status_code=501,
            detail="The 'imagehash' library is not installed. Run: pip install imagehash"
        )

    ignore_set = set(request.ignore_list or [])
    threshold = max(0.0, min(1.0, request.similarity_threshold or 0.95))
    # Convert similarity 0-1 to hamming distance threshold.
    # pHash produces 64-bit hashes; max hamming distance is 64.
    # A similarity of 0.95 means max_distance = 64 * (1 - 0.95) = 3.2 → 3
    max_distance = int(64 * (1.0 - threshold))

    # --- Collect all supported image files ---
    image_files = []
    for dirpath, _, filenames in os.walk(source_folder):
        if dirpath in ignore_set:
            continue
        for f in filenames:
            if f.lower().endswith(SUPPORTED_EXTENSIONS):
                image_files.append(os.path.join(dirpath, f))

    if not image_files:
        return {"status": "ok", "duplicate_groups": [], "total_scanned": 0, "total_duplicates": 0}

    # --- Compute perceptual hashes ---
    file_hashes = []
    skipped = 0
    for fp in image_files:
        try:
            with PILImage.open(fp) as img:
                h = imagehash.phash(img)
            file_hashes.append((fp, h))
        except Exception:
            skipped += 1  # Corrupt or unreadable image
            continue

    # --- Group by similarity ---
    # Simple O(n²) comparison — acceptable for typical photo libraries (<50k files)
    used = set()
    groups = []
    for i, (path_a, hash_a) in enumerate(file_hashes):
        if i in used:
            continue
        group = [path_a]
        for j in range(i + 1, len(file_hashes)):
            if j in used:
                continue
            path_b, hash_b = file_hashes[j]
            if hash_a - hash_b <= max_distance:
                group.append(path_b)
                used.add(j)
        if len(group) > 1:
            groups.append(group)
            used.add(i)

    total_dupes = sum(len(g) for g in groups)
    return {
        "status": "ok",
        "duplicate_groups": groups,
        "total_scanned": len(file_hashes),
        "total_duplicates": total_dupes,
        "skipped_files": skipped,
        "similarity_threshold": threshold,
    }


class ExportReportRequest(BaseModel):
    source_folder: str
    ignore_list: Optional[List[str]] = []
    output_path: Optional[str] = None
    include_metadata: Optional[bool] = True
    include_face_summary: Optional[bool] = True

@app.post("/api/export-report")
async def export_report_endpoint(request: ExportReportRequest):
    """
    Generates a comprehensive, branded PDF report about a photo folder.
    Delegates rendering to report_pdf.generate_report_pdf().
    """
    source_folder = os.path.expanduser(request.source_folder) if request.source_folder else ""
    if not source_folder or not os.path.isdir(source_folder):
        raise HTTPException(status_code=400, detail="Source path is not a valid directory.")

    from organizer_logic import get_metadata_overview as get_metadata_logic
    from report_pdf import generate_report_pdf

    ignore_set = set(request.ignore_list or [])
    folder_name = os.path.basename(os.path.normpath(source_folder))

    # --- File statistics ---
    file_count = 0
    total_size_bytes = 0
    extension_counts: Dict[str, int] = {}
    subfolder_count = 0
    subfolder_list = []

    for dirpath, dirnames, filenames in os.walk(source_folder):
        if dirpath in ignore_set:
            continue
        if dirpath != source_folder:
            subfolder_count += 1
            subfolder_list.append(os.path.relpath(dirpath, source_folder))
        for f in filenames:
            if f.lower().endswith(SUPPORTED_EXTENSIONS):
                file_count += 1
                fp = os.path.join(dirpath, f)
                try:
                    total_size_bytes += os.path.getsize(fp)
                except OSError:
                    pass
                ext = os.path.splitext(f)[1].lower()
                extension_counts[ext] = extension_counts.get(ext, 0) + 1

    # --- Metadata overview (reuses existing logic) ---
    locations = []
    date_info = {}
    people = []
    if request.include_metadata:
        try:
            locations, date_info, people = get_metadata_logic(
                source_folder,
                request.ignore_list,
                ENCODINGS_FILE if request.include_face_summary else None
            )
        except Exception as e:
            logging.error(f"Metadata scan failed during report export: {e}")

    # --- Determine output path ---
    pdf_filename = f"{folder_name}_Report.pdf"
    output_path = request.output_path
    if not output_path:
        output_path = os.path.join(source_folder, pdf_filename)
    else:
        output_path = os.path.expanduser(output_path)
        if os.path.isdir(output_path):
            output_path = os.path.join(output_path, pdf_filename)
        elif not output_path.lower().endswith(".pdf"):
            output_path = os.path.splitext(output_path)[0] + ".pdf"

    # --- Resolve logo path ---
    script_dir = os.path.dirname(os.path.abspath(__file__))
    logo_path = os.path.join(script_dir, "..", "frontend", "src-tauri", "icons", "32x32.png")
    if not os.path.isfile(logo_path):
        logo_path = None

    # --- Generate PDF ---
    try:
        generate_report_pdf(
            output_path=output_path,
            source_folder=source_folder,
            folder_name=folder_name,
            app_version=APP_VERSION,
            file_count=file_count,
            total_size_bytes=total_size_bytes,
            extension_counts=extension_counts,
            subfolder_count=subfolder_count,
            subfolder_list=subfolder_list,
            ignore_set=ignore_set,
            locations=locations,
            date_info=date_info,
            people=people,
            logo_path=logo_path,
        )
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="The 'reportlab' library is not installed. Run: pip install reportlab"
        )
    except Exception as e:
        logging.error(f"PDF generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF report: {e}")

    return {
        "report_version": "1.0",
        "format": "pdf",
        "generated_at": datetime.now().isoformat(),
        "app_version": APP_VERSION,
        "source_folder": source_folder,
        "saved_to": output_path,
        "summary": {
            "total_supported_files": file_count,
            "total_size_mb": round(total_size_bytes / (1024 * 1024), 2),
            "subfolder_count": subfolder_count,
            "format_breakdown": dict(sorted(extension_counts.items(), key=lambda x: -x[1])),
            "locations_found": len(locations),
            "years_covered": len(date_info),
            "people_enrolled": len(people),
        },
    }







@app.get("/api/health")
async def health_check():
    """Simple health check endpoint to verify the server is ready to accept requests."""
    return {"status": "ok"}

@app.get("/api/stats")
async def get_stats():
    """
    Provides high-level aggregate numbers for MCP or external consumption.
    Designed to give an LLM a full picture of the LocalLens installation state.
    """
    import platform
    import time as _time

    # --- Enrolled Faces Count ---
    # FIX: load_face_encodings() returns a TUPLE (encodings_list, names_list),
    # NOT a dict. The previous code checked "names" in a tuple (always False),
    # causing this to always return 0 even with enrolled faces.
    enrolled_count = 0
    if os.path.exists(ENCODINGS_FILE) and os.path.getsize(ENCODINGS_FILE) > 0:
        try:
            _encodings, _names = load_face_encodings(str(ENCODINGS_FILE))
            enrolled_count = len(set(_names))
        except Exception as e:
            print(f"Error loading encodings for stats: {e}")

    # --- Path Presets Count ---
    presets_count = 0
    if os.path.exists(PATH_PRESETS_FILE):
        try:
            with open(PATH_PRESETS_FILE, 'r') as f:
                presets = json.load(f)
                presets_count = len(presets.keys())
        except Exception:
            pass

    # --- Server Uptime ---
    # app.state.start_time is set at startup via lifespan (see below)
    uptime_seconds = round(_time.monotonic() - getattr(app.state, "start_time", _time.monotonic()), 1)

    return {
        "status": "ok",
        # App identity
        "app_version": app.version,                         # e.g. "2.0.0"
        "api_title": app.title,
        # System state
        "platform": platform.system(),                      # "Darwin", "Windows", "Linux"
        "python_version": platform.python_version(),        # e.g. "3.11.9"
        "backend_uptime_seconds": uptime_seconds,
        # Capabilities
        "face_recognition_active": organizer_logic.face_recognition is not None,
        # Number of DISTINCT image file format types LocalLens can process
        # (e.g. .jpg, .jpeg, .png, .heic, .cr2, .dng, .avif... — currently 19 formats)
        # NOTE: This is NOT a count of photos in any folder.
        #       Use get_metadata_overview(source_folder) to count actual files in a folder.
        "image_format_types_supported": len(SUPPORTED_EXTENSIONS),
        # User data
        "enrolled_faces_count": enrolled_count,             # Number of distinct enrolled people
        "presets_count": presets_count,                     # Number of saved path presets
        "data_dir": str(APP_DATA_DIR),                      # Where LocalLens stores its data
    }


@app.get("/api/check-dependencies")
async def check_dependencies():
    """Checks for the presence of optional heavy dependencies like face_recognition."""
    # MODIFIED: Access the variable through the module to get its current state.
    return {"face_recognition_installed": organizer_logic.face_recognition is not None}

@app.get("/api/job-status")
async def get_job_status():
    """Returns the current processing status state. Useful for external polling."""
    return current_job_state

@app.get("/api/enrollment-status")
async def get_enrollment_status():
    """Checks if a face encodings file exists and returns the number of enrolled people."""
    if os.path.exists(ENCODINGS_FILE) and os.path.getsize(ENCODINGS_FILE) > 0:
        try:
            _, known_names = load_face_encodings(ENCODINGS_FILE)
            enrolled_count = len(set(known_names))
            return {"is_enrolled": enrolled_count > 0, "enrolled_count": enrolled_count}
        except Exception as e:
            # If file is corrupt or invalid
            print(f"Error reading encodings file: {e}")
            return {"is_enrolled": False, "enrolled_count": 0}
    return {"is_enrolled": False, "enrolled_count": 0}

@app.get("/api/enrolled-faces")
async def get_enrolled_faces():
    """
    Scans the enrollment directory and returns a list of enrolled people
    with the count of their images.
    """
    enrolled_data = []
    if not os.path.isdir(ENROLLMENT_FOLDER):
        return {"enrolled_faces": []}

    try:
        for person_name in os.listdir(ENROLLMENT_FOLDER):
            person_dir = os.path.join(ENROLLMENT_FOLDER, person_name)
            if os.path.isdir(person_dir):
                # Count only files, ignore potential subdirectories
                image_count = len([
                    f for f in os.listdir(person_dir)
                    if os.path.isfile(os.path.join(person_dir, f))
                ])
                enrolled_data.append({"name": person_name, "count": image_count})
        
        # Sort by name for a consistent order in the UI
        enrolled_data.sort(key=lambda x: x['name'].lower())
        return {"enrolled_faces": enrolled_data}
    except Exception as e:
        print(f"Error scanning enrollment folder: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve enrolled faces.")


@app.post("/api/validate-path")
async def validate_path(path: str = Body(..., embed=True)):
    """Validates if a given path is an accessible directory."""
    if not path or not os.path.isdir(path):
        raise HTTPException(status_code=404, detail=f"Path not found or is not a directory: {path}")
    return {"status": "ok", "path": path}

@app.get("/api/config/load")
async def load_last_config():
    """Loads the last used configuration from a file."""
    if not LAST_CONFIG_FILE.exists():
        return {} # Return empty dict if no config saved yet
    try:
        with open(LAST_CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error loading last config: {e}")
        raise HTTPException(status_code=500, detail="Failed to load last configuration.")

@app.post("/api/config/save")
async def save_last_config(config: LastConfig):
    """Saves the current configuration to a file."""
    try:
        with open(LAST_CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config.dict(), f, indent=4)
        return {"status": "success", "message": "Configuration saved."}
    except IOError as e:
        print(f"Error saving last config: {e}")
        raise HTTPException(status_code=500, detail="Failed to save configuration.")

@app.get("/api/presets/paths")
async def get_path_presets():
    """Loads and returns saved source/destination path configurations."""
    if not PATH_PRESETS_FILE.exists():
        return {}
    try:
        with open(PATH_PRESETS_FILE, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}

# FIX: Renamed from /api/save-preset and updated logic
@app.post("/api/presets/paths")
async def save_path_preset(preset: PathPreset):
    """Saves or updates a path preset."""
    try:
        presets = await get_path_presets()
        presets[preset.name] = {"source": preset.source, "destination": preset.destination}
        with open(PATH_PRESETS_FILE, 'w') as f:
            json.dump(presets, f, indent=4)
        return {"status": "success", "name": preset.name}
    except IOError:
        raise HTTPException(status_code=500, detail="Failed to save preset file.")

@app.delete("/api/presets/paths/{preset_name}")
async def delete_path_preset(preset_name: str):
    """Deletes a path preset by name."""
    try:
        presets = await get_path_presets()
        if preset_name not in presets:
            raise HTTPException(status_code=404, detail=f"Preset '{preset_name}' not found.")
        del presets[preset_name]
        with open(PATH_PRESETS_FILE, 'w') as f:
            json.dump(presets, f, indent=4)
        return {"status": "success", "message": f"Preset '{preset_name}' deleted."}
    except IOError:
        raise HTTPException(status_code=500, detail="Failed to delete preset.")

@app.post("/api/open-enrolled-folder")
async def open_enrolled_folder(request: OpenEnrolledFolderRequest):
    """Opens the folder for a specific enrolled person."""
    person_name = request.person_name
    
    # Security check to prevent path traversal attacks
    target_dir = os.path.join(ENROLLMENT_FOLDER, person_name)
    if not os.path.abspath(target_dir).startswith(os.path.abspath(ENROLLMENT_FOLDER)):
        raise HTTPException(status_code=403, detail="Access to this folder is forbidden.")

    if not os.path.isdir(target_dir):
        raise HTTPException(status_code=404, detail=f"Directory for '{person_name}' not found.")
    
    try:
        folder_path = os.path.realpath(target_dir)
        if sys.platform == "win32":
            subprocess.run(['explorer', folder_path])
        elif sys.platform == "darwin":
            subprocess.run(["open", folder_path], check=True)
        else:
            subprocess.run(["xdg-open", folder_path], check=True)
        return {"status": "success", "message": f"Opened folder for '{person_name}'."}
    except Exception as e:
        print(f"Error opening enrolled folder: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to open folder: {str(e)}")

@app.post("/api/open-folder")
async def open_folder(request: OpenFolderRequest):
    """Opens a given folder path in the system's file explorer."""
    folder_path = os.path.realpath(request.folder_path)
    if not os.path.isdir(folder_path):
        raise HTTPException(status_code=404, detail=f"Directory not found: {folder_path}")
    try:
        if sys.platform == "win32":
            # FIX: Removed check=True as explorer.exe can return 1 on success.
            subprocess.run(['explorer', folder_path])
        elif sys.platform == "darwin":
            subprocess.run(["open", folder_path], check=True)
        else:
            subprocess.run(["xdg-open", folder_path], check=True)
        return {"status": "success", "message": f"Opened '{os.path.basename(folder_path)}' in file explorer."}
    except Exception as e:
        print(f"Error opening folder: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to open folder via OS command: {str(e)}")

@app.post("/api/delete-enrolled-face")
async def delete_enrolled_face(request: OpenEnrolledFolderRequest):
    """
    Deletes the encoding and folder for a specific enrolled person.
    """
    person_name = request.person_name

    # Security check to prevent path traversal attacks
    target_dir = os.path.join(ENROLLMENT_FOLDER, person_name)
    if not os.path.abspath(target_dir).startswith(os.path.abspath(ENROLLMENT_FOLDER)):
        raise HTTPException(status_code=403, detail="Access to this folder is forbidden.")

    if not os.path.isdir(target_dir):
        raise HTTPException(status_code=404, detail=f"Directory for '{person_name}' not found.")

    try:
        # Remove the person's folder
        shutil.rmtree(target_dir)

        # Update the encodings file
        if os.path.exists(ENCODINGS_FILE):
            with open(ENCODINGS_FILE, "rb") as f:
                data = pickle.load(f)

            encodings = data.get("encodings", [])
            names = data.get("names", [])
            paths = data.get("paths", [])

            # Filter out the person's data
            updated_encodings = [e for e, n in zip(encodings, names) if n != person_name]
            updated_names = [n for n in names if n != person_name]
            updated_paths = [p for p, n in zip(paths, names) if n != person_name]

            # Save the updated encodings file
            with open(ENCODINGS_FILE, "wb") as f:
                pickle.dump({
                    "encodings": updated_encodings,
                    "names": updated_names,
                    "paths": updated_paths
                }, f)

        return {"status": "success", "message": f"Successfully deleted '{person_name}'."}  
    except Exception as e:
        print(f"Error deleting enrolled face: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete '{person_name}': {str(e)}")

# ==============================================================================
#  PRO FEATURES: Scheduler API Endpoints
# ==============================================================================

class ScheduleCreateRequest(BaseModel):
    mode: str = "scheduled"
    source_folder: str
    destination_folder: str
    primary_sort: str = "Date"
    face_mode: str = "balanced"
    maintain_hierarchy: bool = True
    operation_mode: str = "copy"
    ignore_list: Optional[List[str]] = []
    interval_hours: int = 24
    interval_minutes: int = 0
    debounce_seconds: int = 5

@app.post("/api/scheduler/create")
async def create_schedule(config: ScheduleCreateRequest):
    try:
        if config.interval_hours == 0 and config.interval_minutes == 0:
            raise HTTPException(status_code=400, detail="Interval must be at least 1 minute. Set interval_hours or interval_minutes to a positive value.")
        from scheduler_service import scheduler_service
        sched = scheduler_service.create_schedule(config.model_dump())
        # Note: daemon is launched by the MCP agent (via _launch_daemon_terminal) or
        # auto-started on backend boot. We do NOT launch it here to avoid hidden
        # duplicate processes that steal the PID file from the visible terminal.
        return {"status": "success", "schedule_id": sched["schedule_id"], "next_sweep_at": sched["next_sweep_at"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/scheduler/list")
async def list_schedules():
    try:
        from scheduler_service import scheduler_service
        alive = _is_daemon_alive()
        pid = None
        if alive:
            try:
                pid = int((APP_DATA_DIR / "scheduler.pid").read_text().strip())
            except Exception:
                pass
        return {
            "daemon_running": alive,
            "daemon_pid": pid,
            "schedules": scheduler_service.list_schedules()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/scheduler/daemon-status")
async def scheduler_daemon_status():
    """Check if the scheduler daemon is running + return log tail."""
    try:
        alive = _is_daemon_alive()
        pid = None
        if alive:
            try:
                pid = int((APP_DATA_DIR / "scheduler.pid").read_text().strip())
            except Exception:
                pass
        return {
            "daemon_running": alive,
            "daemon_pid": pid,
            "log_file": str(APP_DATA_DIR / "scheduler.log"),
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/scheduler/logs")
async def scheduler_logs(lines: int = 50):
    """Return the last N lines of the scheduler log file."""
    try:
        log_file = APP_DATA_DIR / "scheduler.log"
        if not log_file.exists():
            return {"logs": [], "message": "No log file yet. The daemon hasn't run."}
        try:
            # Safely handle encoding errors
            all_lines = log_file.read_text(encoding="utf-8", errors="replace").splitlines()
            return {"logs": all_lines[-lines:]}
        except Exception as e:
            return {"logs": [f"Error reading logs: {e}"]}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class DaemonCommandRequest(BaseModel):
    command: str

@app.post("/api/scheduler/daemon-command")
async def daemon_command(request: DaemonCommandRequest):
    """Run a daemon CLI command (start, stop, status)."""
    if request.command not in ("start", "stop", "status", "restart"):
        raise HTTPException(status_code=400, detail="Invalid command")
    try:
        import subprocess
        import sys
        # Use the same python executable as the backend
        python = sys.executable
        # We use Popen instead of run for 'start' so it runs in background
        if request.command in ("start", "restart"):
            # Launch without hanging the API response
            subprocess.Popen(
                [python, "scheduler_daemon.py", request.command],
                cwd=os.path.dirname(os.path.abspath(__file__))
            )
            return {"status": f"Command '{request.command}' dispatched."}
        else:
            result = subprocess.run(
                [python, "scheduler_daemon.py", request.command],
                cwd=os.path.dirname(os.path.abspath(__file__)),
                capture_output=True, text=True
            )
            return {"status": "success", "output": result.stdout + result.stderr}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/scheduler/{schedule_id}")
async def get_schedule(schedule_id: str):
    try:
        from scheduler_service import scheduler_service
        sched = scheduler_service.get_schedule(schedule_id)
        if not sched:
            raise HTTPException(status_code=404, detail="Schedule not found")
        return sched
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/scheduler/{schedule_id}/pause")
async def pause_schedule(schedule_id: str):
    try:
        from scheduler_service import scheduler_service
        sched = scheduler_service.pause_schedule(schedule_id)
        if not sched:
            raise HTTPException(status_code=404, detail="Schedule not found")
        return {"status": "paused"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/scheduler/{schedule_id}/resume")
async def resume_schedule(schedule_id: str):
    try:
        from scheduler_service import scheduler_service
        sched = scheduler_service.resume_schedule(schedule_id)
        if not sched:
            raise HTTPException(status_code=404, detail="Schedule not found")
        return {"status": "active", "next_sweep_at": sched["next_sweep_at"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/scheduler/{schedule_id}/trigger")
async def trigger_schedule(schedule_id: str):
    try:
        from scheduler_service import scheduler_service
        return scheduler_service.trigger_now(schedule_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/scheduler/{schedule_id}")
async def delete_schedule(schedule_id: str):
    try:
        from scheduler_service import scheduler_service
        if scheduler_service.delete_schedule(schedule_id):
            return {"status": "deleted"}
        raise HTTPException(status_code=404, detail="Schedule not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# (Endpoints moved up to fix routing precedence)
# pyrefly: ignore [missing-import]
from fastapi.responses import HTMLResponse

@app.get("/scheduler-ui", response_class=HTMLResponse)
async def scheduler_ui():
    """Serve the Scheduler Dashboard UI from templates/scheduler_ui.html."""
    template = Path(__file__).parent / "templates" / "scheduler_ui.html"
    return HTMLResponse(content=template.read_text(encoding="utf-8"))


# ==============================================================================
#  PRO FEATURES: Smart Album Suggestions API
# ==============================================================================

class SmartAlbumSuggestRequest(BaseModel):
    max_suggestions: int = 8
    time_range_months: int = 24
    include_persona_context: bool = True

class PersonaSubmitRequest(BaseModel):
    answers: Dict[str, str]
    synthesize: bool = False           # True = call LLM for synthesis
    llm_mode: str = "ollama"           # Which LLM backend ("ollama", "groq", "gemini", etc.)
    consent_confirmed: bool = False    # True = user explicitly allowed cloud data send

class SuggestionAcceptRequest(BaseModel):
    suggestion_key: str


@app.post("/api/smart-albums/suggest")
async def smart_album_suggest(request: SmartAlbumSuggestRequest):
    """
    Generate personalized Smart Album Suggestions.
    Uses passively collected photo metadata + user persona to suggest
    emotionally resonant album names.

    ⚡ PRO FEATURE — gating is enforced at the MCP layer (pro_tools.py),
    not here. This endpoint is called by the MCP tool only.
    """
    try:
        from album_suggester import album_suggester
        result = album_suggester.generate_suggestions(
            max_suggestions=request.max_suggestions,
            time_range_months=request.time_range_months,
            include_persona_context=request.include_persona_context,
            llm_client=None,  # LLM connection is handled by the MCP agent layer
        )
        return result
    except Exception as e:
        logging.error(f"Smart album suggestion failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/smart-albums/accept")
async def smart_album_accept(request: SuggestionAcceptRequest):
    """Mark that the user accepted (created) an album from a suggestion."""
    try:
        from album_suggester import album_suggester
        return album_suggester.mark_accepted(request.suggestion_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/persona/survey")
async def get_persona_survey():
    """Return the Smart Album persona survey questions for the chat UI."""
    try:
        from persona_manager import persona_manager
        return persona_manager.get_survey_questions()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/persona/submit")
async def submit_persona_survey(request: PersonaSubmitRequest):
    """
    Submit survey answers to build/update the user persona.

    Privacy Rules:
    - If llm_mode is a cloud provider (groq/gemini/etc) AND consent_confirmed is False,
      returns a 'requires_consent' block. No data is sent.
    - If consent_confirmed is True, data is sent to the cloud provider.
    - Ollama (local) never requires consent.
    - Template synthesis (no LLM) always works offline.
    """
    try:
        from persona_manager import persona_manager
        result = persona_manager.submit_survey(
            answers=request.answers,
            llm_synthesize=request.synthesize,
            llm_mode=request.llm_mode,
            consent_confirmed=request.consent_confirmed,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/persona/profile")
async def get_persona_profile():
    """Get the current user persona profile (synthesized + raw answers)."""
    try:
        from persona_manager import persona_manager
        profile = persona_manager.get_persona()
        if not profile:
            return {
                "has_persona": False,
                "message": "No persona profile yet. Take the survey at /api/persona/survey",
            }
        return {"has_persona": True, **profile}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/persona/profile")
async def reset_persona_profile():
    """Wipe the persona profile and survey answers (privacy reset)."""
    try:
        from persona_manager import persona_manager
        return persona_manager.reset_persona()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/persona/consent/revoke")
async def revoke_cloud_persona_consent():
    """Revoke previously granted consent to send persona data to a cloud LLM provider."""
    try:
        from persona_manager import persona_manager
        return persona_manager.revoke_cloud_consent()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/persona/consent")
async def get_cloud_persona_consent():
    """Check whether cloud persona synthesis consent is currently granted."""
    try:
        from persona_manager import persona_manager
        return persona_manager.get_cloud_consent_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/metadata-store/stats")
async def metadata_store_stats():
    """Return metadata store health: photo count, DB size, last compaction."""
    try:
        from metadata_store import metadata_store
        return metadata_store.get_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/metadata-store/purge")
async def metadata_store_purge():
    """
    Privacy: Wipe ALL data from the metadata store (photo metadata,
    suggestion history, compaction logs). Persona data is kept unless
    you also call DELETE /api/persona/profile.
    """
    try:
        from metadata_store import metadata_store
        return metadata_store.purge_all()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/privacy/summary")
async def privacy_summary():
    """
    Returns a complete, human-readable summary of all data LocalLens stores
    locally. Used by the Settings › Privacy & Data UI panel.

    Response includes:
    - Exact file paths for all stored data
    - Sizes and row counts
    - Current AI mode
    - Active schedule count
    - Compaction status
    - Available purge actions
    """
    import platform
    from pathlib import Path as _Path

    def _size_label(path_str: str) -> str:
        """Return human-readable size for a file, or 'not created yet' if missing."""
        p = _Path(path_str)
        if not p.exists():
            return "not created yet"
        size = p.stat().st_size
        if size < 1024:
            return f"{size} B"
        elif size < 1024 * 1024:
            return f"{size / 1024:.1f} KB"
        else:
            return f"{size / (1024 * 1024):.2f} MB"

    # ── Config directory ──────────────────────────────────────────────────────
    if sys.platform == "win32":
        config_dir = str(_Path(os.environ.get("APPDATA", str(_Path.home()))) / "LocalLens")
    else:
        config_dir = str(_Path.home() / ".config" / "LocalLens")

    db_path         = os.path.join(config_dir, "metadata_store.db")
    schedules_path  = os.path.join(config_dir, "schedules.json")
    license_path    = os.path.join(config_dir, "mcp_license.json")
    presets_path    = str(PATH_PRESETS_FILE)
    encodings_path  = str(ENCODINGS_FILE)

    # ── Metadata store stats ───────────────────────────────────────────────────
    store_stats = {"photo_count": 0, "suggestion_count": 0, "db_size_mb": 0, "last_compaction": None}
    try:
        from metadata_store import metadata_store
        store_stats = metadata_store.get_stats()
    except Exception:
        pass

    # ── Persona status ────────────────────────────────────────────────────────────
    persona_active = False
    cloud_consent  = {"consented": False, "provider": None}
    try:
        from persona_manager import persona_manager
        persona_active = persona_manager.has_persona()
        cloud_consent  = persona_manager.get_cloud_consent_status()
    except Exception:
        pass

    # ── Schedules count ───────────────────────────────────────────────────────────
    schedules_count  = 0
    schedules_active = 0
    try:
        from scheduler_service import scheduler_service
        all_scheds = scheduler_service.list_schedules()
        schedules_count  = len(all_scheds)
        schedules_active = len([s for s in all_scheds if s.get("status") == "active"])
    except Exception:
        pass

    # ── Build response ────────────────────────────────────────────────────────────
    return {
        "platform": platform.system(),
        "config_dir": config_dir,

        # Per-file breakdown
        "data_files": {
            "metadata_store": {
                "path":             db_path,
                "size":             _size_label(db_path),
                "photo_records":    store_stats.get("photo_count", 0),
                "suggestion_records": store_stats.get("suggestion_count", 0),
                "last_compaction":  store_stats.get("last_compaction"),
                "can_purge":        True,
                "purge_endpoint":   "DELETE /api/metadata-store/purge",
            },
            "schedules": {
                "path":             schedules_path,
                "size":             _size_label(schedules_path),
                "total_schedules":  schedules_count,
                "active_schedules": schedules_active,
                "can_purge":        False,
                "purge_note":       "Delete individual schedules via DELETE /api/scheduler/{id}",
            },
            "face_encodings": {
                "path":             encodings_path,
                "size":             _size_label(encodings_path),
                "can_purge":        True,
                "purge_endpoint":   "POST /api/delete-enrolled-face",
            },
            "license_cache": {
                "path":             license_path,
                "size":             _size_label(license_path),
                "can_purge":        False,
                "purge_note":       "License cache is re-created on next Pro activation.",
            },
            "path_presets": {
                "path":             presets_path,
                "size":             _size_label(presets_path),
                "can_purge":        False,
                "purge_note":       "Delete individual presets via DELETE /api/presets/paths/{name}",
            },
        },

        # Persona & AI
        "ai": {
            "persona_active":          persona_active,
            "persona_can_reset":       True,
            "persona_reset_endpoint": "DELETE /api/persona/profile",
            "cloud_consent_granted":   cloud_consent.get("consented", False),
            "cloud_consent_provider":  cloud_consent.get("provider"),
            "consent_revoke_endpoint": "POST /api/persona/consent/revoke",
        },

        # What leaves the machine
        "data_leaving_machine": {
            "photos":        "Never",
            "file_paths":    "Never",
            "face_data":     "Never",
            "survey_answers": (
                f"Only with explicit consent (to {cloud_consent['provider']})"
                if cloud_consent.get("consented") and cloud_consent.get("provider")
                else "Never"
            ),
            "license_key":   "Only once during Pro activation (to license server)",
        },

        # Auto-maintenance
        "auto_compaction": {
            "enabled":             True,
            "threshold_months":    18,
            "what_is_compacted":   "File paths older than 18 months replaced with 'compacted'",
            "clustering_data_kept": True,
        },
    }





# NEW: Endpoint to gracefully shut down the server
@app.post("/api/shutdown")
async def shutdown_server():
    """
    A dedicated endpoint to gracefully shut down the Uvicorn server.
    This is called by the Tauri frontend just before exiting.
    """
    print("Shutdown signal received. Server is terminating.")
    # A small delay can help ensure the HTTP response is sent before shutdown.
    await asyncio.sleep(0.1) 
    
    # This is a common way to stop the server from within an endpoint.
    # It might cause a clean exit or raise an exception that the runner handles.
    os.kill(os.getpid(), signal.SIGTERM)
    return {"status": "shutting down"}


# --- Static File Serving ---
# This should point to the build output of your frontend
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")

# ==============================================================================
#  Main Execution Block
# ==============================================================================
if __name__ == "__main__":
    # This is CRITICAL for PyInstaller on Windows to prevent infinite subprocesses.
    multiprocessing.freeze_support()

    # FIX: Re-implement the port discovery logic for Tauri.
    # We need to run the server in a way that we can get the port number.
    
    if getattr(sys, 'frozen', False):
        # Production: Use a socket to get a free port from the OS.
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('', 0))
            _, port = s.getsockname()
    else:
        # Development: Use fixed port 8000 to match frontend config
        port = 8000

    # Write port to APP_DATA_DIR / 'port.txt' for the MCP Agent to discover
    port_file = APP_DATA_DIR / "port.txt"
    try:
        port_file.write_text(str(port))
    except Exception as e:
        print(f"Warning: Could not write port.txt file: {e}")

    # Print the port for the Tauri shell to capture. This is the crucial link.
    print(f"PYTHON_BACKEND_PORT:{port}", flush=True)

    # Suppress Uvicorn access logs for the heavily polled UI endpoints
    import logging
    class PollingEndpointFilter(logging.Filter):
        def filter(self, record: logging.LogRecord) -> bool:
            msg = record.getMessage()
            return "/api/scheduler/logs" not in msg and "/api/scheduler/daemon-status" not in msg
            
    logging.getLogger("uvicorn.access").addFilter(PollingEndpointFilter())

    # Now run Uvicorn on the specific port we found.
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port, # Use the dynamically found free port
        reload=False,
        log_level="info"
    )