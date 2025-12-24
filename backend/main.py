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

import os
import asyncio
import json
import sys
import subprocess
import shutil
import pickle
import logging
import signal
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
    # One-time initialization of heavy libraries with verbose output.
    initialize_libraries(is_main_process=True)
    
    # Create necessary folders on startup in the persistent location
    ENROLLMENT_FOLDER.mkdir(exist_ok=True)
    yield
    # Code here would run on shutdown

# --- Application State ---
# A thread-safe queue for sending real-time status updates to the frontend.
log_queue: "Queue[str]" = Queue()

# --- Cancellation Events for Aborting Tasks ---
# Use multiprocessing.Event, which can be safely passed to other processes.
cancellation_events = {
    "sorting": multiprocessing.Event(),
    "enrollment": multiprocessing.Event(),
    "find_group": multiprocessing.Event()
}

# --- FastAPI App Initialization ---
app = FastAPI(
    title="Photo Organizer API",
    description="Backend services for the AI Photo Organizer application with SSE.",
    version="2.0.0",
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
    try:
        # Use put_nowait for thread-safe adding from background tasks
        log_queue.put_nowait(json.dumps(update_data))
    except Exception as e:
        print(f"Error adding log to queue: {e}")

async def run_organization_task(config: Dict):
    """The main processing task, wrapped to be run in the background."""
    cancellation_events["sorting"].clear() # Reset event at start
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
                "analytics": analytics or {} # Add analytics to the payload
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
    cancellation_events["find_group"].clear()
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
    source_path = request.path
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
    config = {
        "source_folder": request.source_folder,
        "destination_folder": request.destination_folder,
        "sorting_options": request.sorting_options.dict(),
        "ignore_list": request.ignore_list or [],
        "operation_mode": request.operation_mode
    }
    background_tasks.add_task(run_organization_task, config)
    return {"message": "Organization process started successfully."}


# NEW: Endpoint to start the 'Find & Group' process
@app.post("/api/start-find-group")
async def start_find_group_endpoint(request: FindGroupRequest, background_tasks: BackgroundTasks):
    """Starts the 'Find & Group' process in the background."""
    config = {
        "source_folder": request.source_folder,
        "destination_folder": request.destination_folder,
        "find_config": request.find_config.dict(),
        "ignore_list": request.ignore_list or [],
        # REMOVE: No longer passing operation_mode from here.
    }
    background_tasks.add_task(run_find_group_task, config)
    return {"message": "Find & Group process started successfully."}


@app.post("/api/metadata-overview")
async def get_metadata_overview_endpoint(request: MetadataOverviewRequest):
    """Scans the source folder to return all available filter criteria."""
    if not request.source_folder or not os.path.isdir(request.source_folder):
        raise HTTPException(status_code=400, detail="Source path is not a valid directory.")
    
    from organizer_logic import get_metadata_overview as get_metadata_logic

    try:
        locations, date_info, people = get_metadata_logic(
            request.source_folder, 
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

@app.get("/api/health")
async def health_check():
    """Simple health check endpoint to verify the server is ready to accept requests."""
    return {"status": "ok"}

@app.get("/api/check-dependencies")
async def check_dependencies():
    """Checks for the presence of optional heavy dependencies like face_recognition."""
    # MODIFIED: Access the variable through the module to get its current state.
    return {"face_recognition_installed": organizer_logic.face_recognition is not None}

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

    # Print the port for the Tauri shell to capture. This is the crucial link.
    print(f"PYTHON_BACKEND_PORT:{port}", flush=True)

    # Now run Uvicorn on the specific port we found.
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port, # Use the dynamically found free port
        reload=False,
        log_level="info"
    )