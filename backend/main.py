# ==============================================================================
#  Photo Organizer - API Server & Main Entry Point (Fully Featured)
# ==============================================================================
#
#  This script launches a FastAPI web server with real-time logging via
#  Server-Sent Events (SSE) to provide a responsive user experience for
#  both sorting and face enrollment.
#
# ==============================================================================

import os
import asyncio
import json
import sys
import subprocess
import shutil
import pickle
import logging
from fastapi import FastAPI, HTTPException, Body, Request, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional
from starlette.responses import StreamingResponse

# --- Path Configuration ---
# Use absolute paths to prevent issues when the script is run from different directories
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.join(BACKEND_DIR, '..')
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend", "dist") # Serve from the 'dist' folder for production builds

# Centralized paths for data files
PRESETS_DIR = os.path.join(BACKEND_DIR, "presets")
PATHS_FILE_NAME = os.path.join(PRESETS_DIR, "paths.json")
ENROLLMENT_FOLDER = os.path.join(BACKEND_DIR, "Enrollment")
ENCODINGS_FILE = os.path.join(BACKEND_DIR, "encodings.pickle")
LAST_CONFIG_FILE = os.path.join(PRESETS_DIR, "last_config.json")

# --- Backend Logic Imports ---
from organizer_logic import process_photos, load_presets, save_presets, face_recognition, SUPPORTED_EXTENSIONS, load_face_encodings, find_and_group_photos, get_metadata_overview
from enrollment_logic import update_encodings

# --- Application State ---
# A thread-safe queue for sending real-time status updates to the frontend.
log_queue = asyncio.Queue()

# --- FastAPI App Initialization ---
app = FastAPI(
    title="Photo Organizer API",
    description="Backend services for the AI Photo Organizer application with SSE.",
    version="2.0.0"
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

class LastConfig(BaseModel):
    source_folder: Optional[str] = ""
    destination_folder: Optional[str] = ""
    sort_method: Optional[str] = "Date"
    face_mode: Optional[str] = "balanced"
    maintain_hierarchy: Optional[bool] = False
    ignored_subfolders: Optional[List[str]] = []

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

class MetadataOverviewRequest(BaseModel):
    source_folder: str
    ignore_list: Optional[List[str]] = []

# --- Background Task & SSE Logic ---

def update_status_callback(update_data: dict):
    """Puts a status update dictionary into the log queue."""
    try:
        log_queue.put_nowait(json.dumps(update_data))
    except asyncio.QueueFull:
        print("Log queue is full, a message was dropped.")

def run_organization_task(config: Dict):
    """The main processing task, wrapped to be run in the background."""
    try:
        # Pass the centralized encodings file path to the logic function
        config["encodings_path"] = ENCODINGS_FILE
        
        # Create an adapter for the callback to match the expected signature
        def callback_adapter(progress: int, message: str, status: str = "running"):
            update_data = {"progress": progress, "message": message, "status": status}
            update_status_callback(update_data)

        process_photos(config, callback_adapter)
    except Exception as e:
        error_update = {"progress": 100, "message": f"An error occurred: {e}", "status": "error"}
        update_status_callback(error_update)
        print(f"BACKGROUND TASK ERROR: {e}")

# NEW: Background task runner for the find and group process.
def run_find_group_task(config: Dict):
    """The find & group task, wrapped to be run in the background."""
    try:
        config["encodings_path"] = ENCODINGS_FILE
        
        def callback_adapter(progress: int, message: str, status: str = "running"):
            update_data = {"progress": progress, "message": message, "status": status}
            update_status_callback(update_data)

        find_and_group_photos(config, callback_adapter)
    except Exception as e:
        error_update = {"progress": 100, "message": f"An error occurred: {e}", "status": "error"}
        update_status_callback(error_update)
        print(f"BACKGROUND TASK ERROR: {e}")


# NEW: Background task runner for the enrollment process.
def run_enrollment_task():
    """Wrapper to run the face enrollment process and send real-time updates."""
    try:
        def callback_adapter(progress: int, message: str, status: str = "running"):
            update_data = {"progress": progress, "message": message, "status": status}
            update_status_callback(update_data)
        
        # The logic function handles finding new images in the enrollment folder itself.
        update_encodings(ENROLLMENT_FOLDER, ENCODINGS_FILE, callback_adapter)
    except Exception as e:
        error_update = {"progress": 100, "message": f"An error occurred during enrollment: {e}", "status": "error"}
        update_status_callback(error_update)
        print(f"ENROLLMENT TASK ERROR: {e}")

async def log_streamer(request: Request):
    """Yields server-sent events from the log queue."""
    try:
        while True:
            if await request.is_disconnected():
                print("Client disconnected, closing log stream.")
                break
            log_message = await log_queue.get()
            yield f"data: {log_message}\n\n"
            log_queue.task_done()
    except asyncio.CancelledError:
        print("Log stream cancelled.")

# ==============================================================================
#  API Endpoints
# ==============================================================================

@app.on_event("startup")
async def on_startup():
    """Ensure necessary directories exist on server startup."""
    os.makedirs(PRESETS_DIR, exist_ok=True)
    os.makedirs(ENROLLMENT_FOLDER, exist_ok=True)

@app.get("/api/stream-logs")
async def stream_logs(request: Request):
    """Endpoint for the frontend to connect to for real-time log updates."""
    return StreamingResponse(log_streamer(request), media_type="text/event-stream")

@app.post("/api/list-subfolders")
async def list_subfolders(request: SubfolderRequest):
    """Lists subdirectories and counts files and folders in a given path."""
    source_path = request.path
    if not source_path or not os.path.isdir(source_path):
        raise HTTPException(status_code=404, detail="Source path is not a valid directory.")
    try:
        subfolder_names = [d for d in os.listdir(source_path) if os.path.isdir(os.path.join(source_path, d))]
        
        file_count = 0
        folder_count = 0
        
        # Walk the entire directory to count files and folders
        for _, dirnames, filenames in os.walk(source_path):
            folder_count += len(dirnames)
            file_count += len([f for f in filenames if f.lower().endswith(SUPPORTED_EXTENSIONS)])

        return {
            "subfolders": subfolder_names,
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
        "ignore_list": request.ignore_list or []
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
        "ignore_list": request.ignore_list or []
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
    Handles batch enrollment.
    1. Iterates through each person in the request.
    2. Creates a directory for them in the Enrollment folder.
    3. Copies their images into it.
    4. Starts a single background task to update the encodings model for all new people.
    """
    if not request.people_to_enroll:
        raise HTTPException(status_code=400, detail="No people provided for enrollment.")

    for person_data in request.people_to_enroll:
        person_name = person_data.person_name.strip()
        if not person_name or not person_data.image_paths:
            raise HTTPException(status_code=400, detail=f"Invalid data provided. Person name and images are required. Problem with entry for '{person_name}'.")

        person_dir = os.path.join(ENROLLMENT_FOLDER, person_name)
        os.makedirs(person_dir, exist_ok=True)

        # Copy the selected files into the person's dataset directory
        for src_path in person_data.image_paths:
            if os.path.exists(src_path):
                try:
                    shutil.copy(src_path, person_dir)
                except Exception as e:
                    raise HTTPException(status_code=500, detail=f"Failed to copy file '{os.path.basename(src_path)}' for person '{person_name}': {e}")
            else:
                raise HTTPException(status_code=404, detail=f"Source image not found: {src_path}")

    # Start the enrollment process in the background *after* all files are copied
    background_tasks.add_task(run_enrollment_task)
    
    return {"message": f"Enrollment process started for {len(request.people_to_enroll)} people."}

@app.get("/api/check-dependencies")
async def check_dependencies():
    """Checks for the presence of optional heavy dependencies like face_recognition."""
    return {"face_recognition_installed": face_recognition is not None}

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
    if not os.path.exists(LAST_CONFIG_FILE):
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
    return load_presets(PATHS_FILE_NAME)

@app.post("/api/save-preset")
async def save_preset(preset: PathPreset):
    """Saves or updates a path preset."""
    presets = load_presets(PATHS_FILE_NAME)
    presets[preset.name] = {"source": preset.source, "destination": preset.destination}
    if save_presets(PATHS_FILE_NAME, presets):
        return {"status": "success", "name": preset.name}
    else:
        raise HTTPException(status_code=500, detail="Failed to save preset file.")

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

# --- Static File Serving ---
# This should point to the build output of your frontend
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")
else:
    print(f"Warning: Frontend directory not found at '{FRONTEND_DIR}'. UI will not be served.")