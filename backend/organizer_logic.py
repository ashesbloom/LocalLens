# ==============================================================================
#  Photo Organizer - Core Backend Logic (Fully Integrated)
# ==============================================================================
#
#  This script has been meticulously refactored to serve as the core logic
#  engine for the Photo Organizer application. It integrates the advanced
#  features, safety protocols, and nuanced sorting logic from the original
#  command-line script into the clean, API-callable structure required by the
#  FastAPI backend.
#
# ==============================================================================

import os
import sys
import shutil
from datetime import datetime
import logging
import json
import pickle
import numpy as np
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
import tempfile
from multiprocessing import Pool, TimeoutError as MultiprocessingTimeoutError
import time


# --- Custom Exception Import ---
from exceptions import OperationAbortedError

# --- REVERT: REMOVE ALL MULTIPROCESSING WORKER FUNCTIONS ---

# --- Optional Imports with Graceful Fallbacks ---
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    print("HEIC/HEIF format support enabled.")
except ImportError:
    print("Warning: 'pillow-heif' not installed. HEIC/HEIF files will be ignored.")

try:
    import face_recognition
    print("Facial recognition library loaded.")
except ImportError:
    print("CRITICAL ERROR: 'face_recognition' library not installed.")
    face_recognition = None

import reverse_geocoder as rg

# RAW Image Support Logic
rawpy = None
WandImage = None

# 1. Try rawpy (Preferred for Windows, optional for others)
try:
    import rawpy
    print("Raw image format support (DNG, CR2, etc.) enabled via rawpy.")
except ImportError:
    pass

# 2. Try Wand (Preferred for macOS/Linux if rawpy is missing)
try:
    from wand.image import Image as WandImage
    print("Wand (ImageMagick) support enabled.")
except ImportError:
    pass

# 3. Log status based on platform expectations
if sys.platform == 'win32':
    if not rawpy:
        print("Warning: 'rawpy' is missing on Windows. RAW face recognition will be disabled.")
elif sys.platform == 'darwin': # macOS
    if not WandImage and not rawpy:
        print("Warning: Neither 'Wand' nor 'rawpy' found. RAW face recognition will be disabled.")
        print("  -> Install ImageMagick (`brew install imagemagick`) and reinstall requirements.")


# --- Global State for Libraries ---
face_recognition = None
# A flag to ensure initialization happens only once.
_libraries_initialized = False

def initialize_libraries(is_main_process: bool = False):
    """
    MODIFIED: One-time initialization for heavy libraries.
    Now accepts a flag to control verbose output, preventing log spam from child processes.
    """
    global face_recognition, _libraries_initialized
    if _libraries_initialized:
        return

    # --- Optional Imports with Graceful Fallbacks ---
    try:
        from pillow_heif import register_heif_opener
        register_heif_opener()
        if is_main_process:
            print("HEIC/HEIF format support enabled.")
    except ImportError:
        if is_main_process:
            print("Warning: 'pillow-heif' not installed. HEIC/HEIF files will be ignored.")

    try:
        import face_recognition as fr
        face_recognition = fr
        if is_main_process:
            print("Facial recognition library loaded.")
    except ImportError:
        if is_main_process:
            print("CRITICAL ERROR: 'face_recognition' library not installed.")
        face_recognition = None
    _libraries_initialized = True
    
import reverse_geocoder as rg

# ==============================================================================
#  Constants & Configuration (Consolidated from Best Versions)
# ==============================================================================

# REMOVE THESE LINES - They are now handled in main.py
# script_dir = os.path.dirname(os.path.abspath(__file__))
# PRESETS_FOLDER = os.path.join(script_dir, "presets")
# os.makedirs(PRESETS_FOLDER, exist_ok=True)
# PATHS_FILE_NAME = os.path.join(PRESETS_FOLDER, "paths.json")

SUPPORTED_EXTENSIONS = (
    # Standard formats
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp',
    # Apple formats
    '.heic', '.heif',
    # Raw formats
    '.dng', '.cr2', '.cr3', '.nef', '.arw', '.raf',
    # Modern formats
    '.avif',
    # Professional / HDR formats
    '.psd', '.hdr'
)

UNKNOWN_DATE_FOLDER_NAME = "Unknown_Date"
UNKNOWN_LOCATION_FOLDER_NAME = "Unknown_Location"
UNKNOWN_PEOPLE_FOLDER_NAME = "Unknown_Faces"
NO_FACES_FOLDER_NAME = "No_Faces_Found"

FACE_RECOGNITION_TOLERANCE = 0.55
RESIZE_WIDTH_FOR_PROCESSING = 800

# ==============================================================================
#  Preset & Configuration Handling
# ==============================================================================

# REMOVE THESE FUNCTIONS - Their logic is now directly in main.py's endpoints
# def load_presets(filename):
#     if not os.path.exists(filename): return {}
#     try:
#         with open(filename, 'r', encoding='utf-8') as f: return json.load(f)
#     except (json.JSONDecodeError, IOError): return {}
#
# def save_presets(filename, data):
#     try:
#         with open(filename, 'w', encoding='utf-8') as f: json.dump(data, f, indent=4)
#         return True
#     except IOError as e:
#         logging.error(f"Error saving presets to {filename}: {e}")
#         return False

# ==============================================================================
#  Image Metadata Extraction
# ==============================================================================
def get_exif_data(file_path):
    """Extracts and decodes EXIF metadata from an image file."""
    try:
        with Image.open(file_path) as image:
            # ._getexif() returns the raw EXIF data dictionary, which is more reliable.
            raw_exif = image._getexif() # type: ignore
            if not raw_exif:
                return None

            decoded_exif = {}
            for tag_id, value in raw_exif.items():
                tag = TAGS.get(tag_id, tag_id)
                if tag == "GPSInfo":
                    gps_data = {}
                    for gps_tag_id in value:
                        gps_tag = GPSTAGS.get(gps_tag_id, gps_tag_id)
                        gps_data[gps_tag] = value[gps_tag_id]
                    decoded_exif[tag] = gps_data
                else:
                    # Handle byte strings by trying to decode them, which is a common issue.
                    if isinstance(value, bytes):
                        try:
                            # Decode and remove null characters.
                            decoded_exif[tag] = value.decode('utf-8', errors='replace').strip('\x00')
                        except Exception:
                            decoded_exif[tag] = repr(value) # Fallback for non-decodable bytes
                    else:
                        decoded_exif[tag] = value
            return decoded_exif
    except Exception as e:
        logging.warning(f"Could not read EXIF data from {os.path.basename(file_path)}: {e}")
        return None
    
def get_date_taken(exif_data):
    """Parses EXIF data to find the 'Date Taken' by checking common tags."""
    if not exif_data: return None
    date_tags = ['DateTimeOriginal', 'DateTimeDigitized', 'DateTime']
    for tag in date_tags:
        if tag in exif_data and str(exif_data[tag]).strip():
            try:
                return datetime.strptime(exif_data[tag], '%Y:%m:%d %H:%M:%S')
            except (ValueError, TypeError):
                continue
    return None

def get_decimal_from_dms(dms, ref):
    """Helper function to convert GPS DMS format to decimal degrees."""
    degrees = dms[0]
    minutes = dms[1] / 60.0
    seconds = dms[2] / 3600.0
    decimal = degrees + minutes + seconds
    if ref in ['S', 'W']:
        decimal = -decimal
    return decimal

def get_location(exif_data):
    """Converts GPS coordinates from EXIF into a human-readable 'Country/State/City' path."""
    if not exif_data or "GPSInfo" not in exif_data:
        return None
    try:
        gps_info = exif_data["GPSInfo"]
        lat_dms = gps_info.get("GPSLatitude")
        lon_dms = gps_info.get("GPSLongitude")
        lat_ref = gps_info.get("GPSLatitudeRef")
        lon_ref = gps_info.get("GPSLongitudeRef")

        if lat_dms and lon_dms and lat_ref and lon_ref:
            lat = get_decimal_from_dms(lat_dms, lat_ref)
            lon = get_decimal_from_dms(lon_dms, lon_ref)
            
            # Check for non-finite values before they can cause a crash.
            if not (np.isfinite(lat) and np.isfinite(lon)):
                logging.warning(f"Invalid GPS coordinates (non-finite) found. Skipping location lookup.")
                return None

            location = rg.search((lat, lon), mode=1)
            if location:
                loc_data = location[0]
                country = loc_data.get('cc', '').replace(' ', '-')
                state = loc_data.get('admin1', '').replace(' ', '-')
                city = loc_data.get('name', '').replace(' ', '-')
                path_parts = [p for p in [country, state, city] if p]
                if path_parts:
                    return os.path.join(*path_parts)
        return None
    except Exception as e:
        # Catch any other unexpected errors during GPS data processing.
        logging.warning(f"Could not extract location due to corrupted GPS metadata: {e}")
        return None

def build_folder_tree(root_path):
    """
    NEW: Recursively builds a hierarchical tree of subdirectories.
    """
    tree = []
    try:
        # Use a dictionary to keep track of nodes by their path for easy lookup
        dir_map = {root_path: tree}
        for dirpath, dirnames, _ in os.walk(root_path, topdown=True):
            # Find the parent node in our map
            parent_list = dir_map.get(dirpath)
            if parent_list is None:
                continue # Should not happen in a top-down walk

            # Sort dirnames to ensure consistent order in the UI
            dirnames.sort(key=lambda v: v.lower())
            
            for dirname in dirnames:
                current_path = os.path.join(dirpath, dirname)
                node = {
                    "name": dirname,
                    "path": current_path,
                    "children": []
                }
                parent_list.append(node)
                # Add the new node's children list to the map for the next level
                dir_map[current_path] = node["children"]
        return tree
    except Exception as e:
        logging.error(f"Failed to build folder tree for {root_path}: {e}")
        return []

def get_metadata_overview(source_dir, ignore_list=None, encodings_path=None, scan_for_location=True):
    """
    MODIFIED: Now conditionally scans for location to avoid loading geocoder unnecessarily.
    """
    locations, people = set(), set()
    date_structure = {} # Changed from a simple set of years to a dict
    # FIX: The ignore_list contains folder names, not full paths.
    # This ensures the check later on is correct.
    ignore_set = set(ignore_list) if ignore_list else set()
    
    # Pre-load known faces if an encodings path is provided
    known_names = []
    if encodings_path and os.path.exists(encodings_path):
        try:
            # The function is already in this file, no relative import needed.
            _, known_names = load_face_encodings(encodings_path)
            people.update(known_names)
        except Exception as e:
            logging.warning(f"Could not load face encodings for metadata overview: {e}")

    files_to_scan = []
    # CORRECTED LOGIC: Walk the entire tree, then filter files based on their parent folder.
    for dirpath, dirnames, filenames in os.walk(source_dir):
        # Do not prune the walk. Instead, check each file's parent.
        if dirpath in ignore_set:
            # If the current directory is ignored, skip all files directly within it.
            continue
        
        for f in filenames:
            if f.lower().endswith(SUPPORTED_EXTENSIONS):
                files_to_scan.append(os.path.join(dirpath, f))

    if not files_to_scan:
        return [], [], sorted(list(people))

    logging.info(f"Scanning {len(files_to_scan)} files for metadata overview...")
    for file_path in files_to_scan:
        exif = get_exif_data(file_path)
        
        # --- CONDITIONAL LOCATION SCAN ---
        # Only call get_location if the operation requires it.
        if scan_for_location:
            loc = get_location(exif)
            if loc:
                locations.add(loc)

        date_obj = get_date_taken(exif)
        if date_obj:
            year_str = str(date_obj.year)
            month_str = date_obj.strftime('%m') # e.g., "07"
            if year_str not in date_structure:
                date_structure[year_str] = set()
            date_structure[year_str].add(month_str)

    # Convert month sets to sorted lists
    for year, months in date_structure.items():
        date_structure[year] = sorted(list(months))
            
    return sorted(list(locations)), date_structure, sorted(list(people))


# ==============================================================================
#  File System Operations
# ==============================================================================

def handle_file_op(op, source_path, target_folder, new_filename, date_obj):
    os.makedirs(target_folder, exist_ok=True)
    destination_path = os.path.join(target_folder, new_filename)
    counter = 1
    base, ext = os.path.splitext(new_filename)
    while os.path.exists(destination_path):
        renamed_filename = f"{base}_{counter}{ext}"
        destination_path = os.path.join(target_folder, renamed_filename)
        if counter == 1: logging.info(f"File '{new_filename}' already exists. Renaming to '{renamed_filename}'")
        counter += 1
    try:
        if op == 'copy': shutil.copy2(source_path, destination_path)
        elif op == 'move': shutil.move(source_path, destination_path)
        logging.info(f"{op.capitalize()}d '{os.path.basename(source_path)}' to '{destination_path}'")
        if date_obj:
            timestamp = date_obj.timestamp()
            os.utime(destination_path, (timestamp, timestamp))
        # FIX: Return the actual destination path on success, not a boolean.
        return destination_path
    except Exception as e:
        logging.error(f"Error performing '{op}' on '{os.path.basename(source_path)}': {e}")
        # FIX: Return None on failure.
        return None

# ==============================================================================
#  Face Recognition Core Logic
# ==============================================================================

def load_face_encodings(encodings_file):
    if not face_recognition:
        raise ImportError("Face recognition library is not installed.")
    if not os.path.exists(encodings_file):
        raise FileNotFoundError(f"Encodings file not found: {encodings_file}")
    try:
        with open(encodings_file, "rb") as f: data = pickle.load(f)
        all_encodings, all_names = data.get("encodings", []), data.get("names", [])
        valid_encodings, valid_names = [], []
        for encoding, name in zip(all_encodings, all_names):
            if np.isfinite(encoding).all():
                valid_encodings.append(encoding); valid_names.append(name)
        return valid_encodings, valid_names
    except Exception as e:
        raise IOError(f"Could not load or parse encodings file: {e}")

def _recognize_faces_in_process(image_path, known_encodings, known_names, mode):
    """
    NEW: This function is designed to be run in a separate process.
    It contains the blocking face_recognition call.
    """
    if not face_recognition: return []
    try:
        pil_image = Image.open(image_path).convert('RGB')
        if pil_image.width > RESIZE_WIDTH_FOR_PROCESSING:
            ratio = RESIZE_WIDTH_FOR_PROCESSING / float(pil_image.width)
            new_height = int(float(pil_image.height) * ratio)
            pil_image = pil_image.resize((RESIZE_WIDTH_FOR_PROCESSING, new_height), Image.Resampling.LANCZOS)
        
        image = np.array(pil_image)

        model_to_use = 'cnn' if mode == 'accurate' else 'hog'
        upsamples = 2 if mode == 'balanced' else 1

        face_locations = face_recognition.face_locations(image, model=model_to_use, number_of_times_to_upsample=upsamples)

        if not face_locations: return []
        
        face_encodings = face_recognition.face_encodings(image, face_locations)
        found_names = set()
        for face_encoding in face_encodings:
            if not np.isfinite(face_encoding).all(): continue
            matches = face_recognition.compare_faces(known_encodings, face_encoding, tolerance=FACE_RECOGNITION_TOLERANCE)
            name = "Unknown"
            if True in matches:
                face_distances = face_recognition.face_distance(known_encodings, face_encoding)
                best_match_index = np.argmin(face_distances)
                if matches[best_match_index] and face_distances[best_match_index] <= FACE_RECOGNITION_TOLERANCE:
                    name = known_names[best_match_index]
            found_names.add(name)
        return list(found_names)
    except Exception:
        # Don't log here, as it can cause issues with multiprocessing.
        # The parent process will handle the logging of the failure.
        return None


def recognize_faces(image_path, known_encodings, known_names, mode='balanced'):
    """
    The core AI function. It takes a single image and identifies all known
    people within it, with selectable accuracy modes.

    MODIFIED: Now supports a wide range of formats, including Camera Raw files
    (DNG, CR2, NEF, etc.) by using the 'rawpy' library to decode them.
    """
    if not face_recognition: return []
    
    pil_image = None
    file_ext = os.path.splitext(image_path)[1].lower()
    RAW_EXTENSIONS = ('.dng', '.cr2', '.cr3', '.nef', '.arw', '.raf')

    try:
        # First, try opening with Pillow. This works for most files, including
        # JPG, PNG, WEBP, and AVIF/HEIC if the plugins are installed.
        pil_image = Image.open(image_path)
    
    except Exception as e:
        # If Pillow fails, check if it's a Raw file we can handle with rawpy or Wand.
        if file_ext in RAW_EXTENSIONS:
            # Try rawpy first (preferred)
            if rawpy:
                try:
                    with rawpy.imread(image_path) as raw:
                        # postprocess() creates a standard, viewable image array
                        rgb_array = raw.postprocess()
                    pil_image = Image.fromarray(rgb_array)
                    logging.info(f"Successfully decoded Raw file '{os.path.basename(image_path)}' via rawpy.")
                except Exception as raw_e:
                    logging.warning(f"Could not process Raw file {os.path.basename(image_path)} with rawpy: {raw_e}")

            # Try Wand if rawpy failed or is missing
            if not pil_image and WandImage:
                try:
                    with WandImage(filename=image_path) as img:
                        img_blob = img.make_blob(format='RGB')
                        pil_image = Image.frombytes('RGB', (img.width, img.height), img_blob)
                    logging.info(f"Successfully decoded Raw file '{os.path.basename(image_path)}' via Wand.")
                except Exception as wand_e:
                    logging.warning(f"Could not process Raw file {os.path.basename(image_path)} with Wand: {wand_e}")

        if not pil_image:
            # If it's not a known Raw file or neither library worked, log the original Pillow error.
            logging.warning(f"Pillow could not open {os.path.basename(image_path)}: {e}")
            return None

    if not pil_image:
         return None

    # --- The rest of the function remains the same, robust and reliable ---
    try:
        pil_image = pil_image.convert('RGB')
        if pil_image.width > RESIZE_WIDTH_FOR_PROCESSING:
            ratio = RESIZE_WIDTH_FOR_PROCESSING / float(pil_image.width)
            new_height = int(float(pil_image.height) * ratio)
            pil_image = pil_image.resize((RESIZE_WIDTH_FOR_PROCESSING, new_height), Image.Resampling.LANCZOS)
        
        image = np.array(pil_image)

        face_locations = []
        if mode == 'fast':
            face_locations = face_recognition.face_locations(image, model='hog')
        elif mode == 'accurate':
            face_locations = face_recognition.face_locations(image, model='cnn')
        else:
            face_locations = face_recognition.face_locations(image, model='hog', number_of_times_to_upsample=2)

        if not face_locations: return []
        
        face_encodings = face_recognition.face_encodings(image, face_locations)
        found_names = set()
        for face_encoding in face_encodings:
            try:
                if not np.isfinite(face_encoding).all():
                    logging.warning(f"Skipping a non-finite face encoding in {os.path.basename(image_path)}.")
                    continue
                matches = face_recognition.compare_faces(known_encodings, face_encoding, tolerance=FACE_RECOGNITION_TOLERANCE)
                name = "Unknown"
                if True in matches:
                    face_distances = face_recognition.face_distance(known_encodings, face_encoding)
                    best_match_index = np.argmin(face_distances)
                    if matches[best_match_index]: name = known_names[best_match_index]
                found_names.add(name)
            except Exception as e_inner:
                logging.warning(f"Could not compare a face in {os.path.basename(image_path)} due to an error: {e_inner}. Skipping this face.")
                continue
        return list(found_names)
    except Exception as e:
        logging.warning(f"Could not process faces in {os.path.basename(image_path)}: {e}")
        return None

# ==============================================================================
#  Main Process Orchestration - Merged and Refactored
# ==============================================================================

def get_date_path(date_obj):
    if not date_obj: return UNKNOWN_DATE_FOLDER_NAME
    return os.path.join(date_obj.strftime('%Y'), f"{date_obj.strftime('%m')}-{date_obj.strftime('%B')}")

def get_people_dest_paths(base_dir, names):
    """
    Determines the correct destination folder(s) when sorting by people.
    """
    dest_paths, known_in_photo = [], sorted([n for n in names if n != "Unknown"])
    if not known_in_photo:
        return [os.path.join(base_dir, UNKNOWN_PEOPLE_FOLDER_NAME)]
    if len(names) == 1 and len(known_in_photo) == 1:
        return [os.path.join(base_dir, known_in_photo[0])]
    for person in known_in_photo:
        dest_paths.append(os.path.join(base_dir, person, "With Others"))
    return dest_paths

def find_and_group_photos(config, update_callback):
    """
    Orchestrates the 'Find & Group' process. This function only copies 
    files matching all specified criteria into a new folder.
    """
    source_dir = config["source_folder"]
    base_dest_dir = config["destination_folder"]
    find_config = config["find_config"]
    ignore_list = config.get("ignore_list", []) # Get the ignore list
    encodings_path = config.get("encodings_path")
    cancellation_event = config.get("cancellation_event")
    # NEW: Force operation mode to 'copy' for Find & Group, ignoring any user input
    operation_mode = "copy"

    target_folder_name = find_config.get('folderName', "Find_Results")
    target_folder = os.path.join(base_dest_dir, target_folder_name)
    os.makedirs(target_folder, exist_ok=True)
    
    # The 'Find & Group' operation no longer requires a dedicated log file.
    # The main application logger is sufficient if needed.
    logging.info(f"Starting Find & Group Session. Target folder: '{target_folder_name}'")
    logging.info(f"Filters applied: {json.dumps(find_config, indent=2)}")

    # --- NEW: Analytics setup for Find & Group ---
    # 'fast' mode is used for searching, so quality is fixed.
    initial_analytics = {"quality": "Fast", "scan_rate": "0.0", "data_flow": "0.0"}
    update_callback(0, "Preparing to search for photos...", "running", initial_analytics)

    # CORRECTED LOGIC: Filter files to process using the parent folder check.
    ignore_set = set(ignore_list)
    files_to_process = []
    for dirpath, dirnames, filenames in os.walk(source_dir):
        if dirpath in ignore_set:
            continue # Ignore files in this directory, but os.walk will still process its subdirectories.
        
        for f in filenames:
            if f.lower().endswith(SUPPORTED_EXTENSIONS):
                files_to_process.append(os.path.join(dirpath, f))

    total_files = len(files_to_process)
    if total_files == 0:
        update_callback(100, "No supported image files found in the source directory.", "complete", initial_analytics)
        return

    found_count = 0
    known_encodings, known_names = None, None
    
    # Load face models only if a people filter is active
    if find_config.get('people'):
        update_callback(5, "Initializing face recognition engine...", "running", initial_analytics)
        if not encodings_path or not os.path.exists(encodings_path):
            update_callback(100, "Cannot use People filter: Face encodings file not found.", "error", initial_analytics)
            return
        try:
            known_encodings, known_names = load_face_encodings(encodings_path)
            if not known_encodings:
                update_callback(100, "Cannot use People filter: No faces are enrolled.", "error", initial_analytics)
                return
        except Exception as e:
            update_callback(100, f"Fatal Error loading face data: {e}", "error", initial_analytics)
            return

    # --- NEW: Real-time analytics tracking ---
    start_time = time.time()
    processed_files_count = 0
    processed_size_mb = 0.0

    for i, source_path in enumerate(files_to_process):
        progress = 10 + int(((i + 1) / total_files) * 85)
        
        # --- Analytics Calculation ---
        analytics = {"quality": "Fast", "scan_rate": "0.0", "data_flow": "0.0"}
        try:
            file_size_mb = os.path.getsize(source_path) / (1024 * 1024)
            processed_files_count += 1
            processed_size_mb += file_size_mb
            
            elapsed_time = time.time() - start_time
            if elapsed_time > 0.5:
                scan_rate = processed_files_count / elapsed_time
                data_flow = processed_size_mb / elapsed_time
                analytics["scan_rate"] = f"{scan_rate:.1f}"
                analytics["data_flow"] = f"{data_flow:.1f}"
        except OSError:
            pass

        update_callback(progress, f"Searching: {os.path.basename(source_path)}", "running", analytics)
        
        if cancellation_event and cancellation_event.is_set():
            raise OperationAbortedError("Find & Group operation cancelled by user.")

        exif_data = get_exif_data(source_path)
        match = True # Assume it's a match until a filter fails

        # --- Date Filter ---
        if match and (find_config.get('years') or find_config.get('months')):
            date_obj = get_date_taken(exif_data)
            if not date_obj:
                match = False
            else:
                filter_years = find_config.get('years', [])
                filter_months = find_config.get('months', [])
                # Note: The CLI version used int for years, but the UI sends strings.
                if filter_years and str(date_obj.year) not in filter_years:
                    match = False
                # The month format from strftime is '01', '02', etc.
                if match and filter_months and date_obj.strftime('%m') not in filter_months:
                    match = False

        # --- Location Filter ---
        if match and find_config.get('locations'):
            loc = get_location(exif_data)
            # ENHANCEMENT 2.0: Implement robust, "fuzzy" matching for locations.
            # This normalizes strings by removing all spaces and making them lowercase,
            # ensuring that minor variations from the geocoder don't cause a mismatch.
            # e.g., 'IN/Uttar-Pradesh/City Name' matches 'IN/UttarPradesh/CityName'
            filter_locations_normalized = [l.replace(' ', '').lower() for l in find_config['locations']]
            
            if not loc or loc.replace(' ', '').lower() not in filter_locations_normalized:
                match = False
        
        # --- People Filter ---
        if match and find_config.get('people') and known_encodings:
            # Using 'fast' model as requested, which maps to 'hog'
            names = recognize_faces(source_path, known_encodings, known_names, mode='fast')
            if not names or not any(p in names for p in find_config['people']):
                match = False

        if match:
            date_obj = get_date_taken(exif_data)
            new_filename = f"{date_obj.strftime('%Y-%m-%d_%H%M%S')}_{os.path.basename(source_path)}" if date_obj else os.path.basename(source_path)
            if handle_file_op(operation_mode, source_path, target_folder, new_filename, date_obj):
                found_count += 1
                verb = "copied" if operation_mode == "copy" else "moved"
                logging.info(f"Found match: {verb.capitalize()} '{os.path.basename(source_path)}' to '{target_folder_name}'")

    verb = "copied" if operation_mode == "copy" else "moved"
    completion_message = f"Search complete. Found and {verb} {found_count} matching photos to '{target_folder_name}'."
    if found_count == 0:
        completion_message = "Search complete. No photos matched the specified criteria."
        
    logging.info(completion_message)
    update_callback(100, completion_message, "complete", initial_analytics)


def _get_standard_sort_paths(base_dir, sort_method, date_obj, location_path, names, multiple_countries_found, sort_options):
    """
    NEW: Determines destination paths for a single file under a standard sorting rule.
    This function isolates the logic for Standard Sort to prevent conflicts.
    """
    dest_paths = []
    if sort_method == 'Date':
        dest_paths = [os.path.join(base_dir, get_date_path(date_obj))]
    elif sort_method == 'Location':
        if location_path:
            loc_path_to_use = location_path
            if not multiple_countries_found and os.path.sep in loc_path_to_use:
                try:
                    loc_path_to_use = os.path.join(*location_path.split(os.path.sep)[1:])
                except IndexError:
                    pass
            target_folder = os.path.join(base_dir, loc_path_to_use)
            if sort_options.get('sub_sort_by_date') and date_obj:
                target_folder = os.path.join(target_folder, get_date_path(date_obj))
            dest_paths = [target_folder]
        else:
            dest_paths = [os.path.join(base_dir, UNKNOWN_LOCATION_FOLDER_NAME)]
    elif sort_method == 'People':
        dest_paths = get_people_dest_paths(base_dir, names) if names else [os.path.join(base_dir, NO_FACES_FOLDER_NAME)]
    return dest_paths


def _get_hybrid_sort_paths(dest_dir, sort_options, exif_data, date_obj, names, multiple_countries_found):
    """
    REBUILT: Determines destination paths for a single file under the hybrid sorting rule,
    mirroring the detailed logic from the original script.
    """
    custom_filter = sort_options.get('custom_filter', {})
    filter_type = custom_filter.get('filter_type')
    
    is_custom_match = False
    if filter_type == 'People':
        # Checks if any of the people recognized in the photo are in the filter list.
        is_custom_match = any(person in names for person in custom_filter.get('people', []))
    elif filter_type == 'Location':
        photo_location = get_location(exif_data)
        if photo_location:
            # Checks if the photo's location is in the filter list.
            is_custom_match = photo_location in custom_filter.get('locations', [])
    elif filter_type == 'Date':
        if date_obj:
            filter_years = custom_filter.get('years', [])
            filter_months = custom_filter.get('months', [])
            # Match if no years are selected OR the photo's year is in the list
            year_match = not filter_years or str(date_obj.year) in filter_years
            # Match if no months are selected OR the photo's month is in the list
            month_match = not filter_months or date_obj.strftime('%m') in filter_months
            # Both must be true to be a custom match
            is_custom_match = year_match and month_match

    dest_paths = []
    if is_custom_match:
        # Add the special folder path
        base_path = os.path.join(dest_dir, sort_options.get("specific_folder_name", "Filtered"))

        if filter_type == 'People':
            # Create subfolders for each matched person inside the special folder.
            selected_people_in_photo = [p for p in custom_filter.get('people', []) if p in names]
            for person in selected_people_in_photo:
                # If it's a group photo, put it in a "With Others" subfolder.
                dest_paths.append(os.path.join(base_path, person, "With Others") if len(names) > 1 else os.path.join(base_path, person))
        
        elif filter_type == 'Location':
            # The UI doesn't have a "sub-sort by date" for the custom filter, so we place it in the root of the special folder.
            # This matches the original script's logic when that option is false.
            dest_paths.append(base_path)

        else: # Date
            # For a date filter, it's logical to sub-sort by date within the special folder.
            dest_paths.append(os.path.join(base_path, get_date_path(date_obj) if date_obj else UNKNOWN_DATE_FOLDER_NAME))

    # Always add the base sort destination path
    base_sort_method = sort_options.get('base_sort', 'Date')
    photo_location = get_location(exif_data)
    base_sort_paths = _get_standard_sort_paths(dest_dir, base_sort_method, date_obj, photo_location, names, multiple_countries_found, sort_options)
    dest_paths.extend(base_sort_paths)

    return dest_paths


def _core_processing_loop(work_dir, dest_dir, sort_options, update_callback, encodings_path, cancellation_event=None, operation_mode='move'):
    """
    REFACTORED: This function is now a high-level orchestrator that calls dedicated
    functions for each sorting mode, preventing logic conflicts.
    """
    # Get the full-path ignore list from the options.
    ignore_list = sort_options.get("ignore_list", [])
    ignore_set = set(ignore_list)
    
    files_to_process = []
    # CORRECTED LOGIC: Walk the entire tree, then filter files based on their parent folder.
    for dirpath, dirnames, filenames in os.walk(work_dir):
        # If the current directory is in the ignore set, skip its direct files.
        # os.walk will continue to traverse into subdirectories like 'B' inside 'A'.
        if dirpath in ignore_set:
            continue

        for f in filenames:
            if f.lower().endswith(SUPPORTED_EXTENSIONS):
                files_to_process.append(os.path.join(dirpath, f))

    total_files = len(files_to_process)
    if total_files == 0:
        update_callback(100, "Scan complete. No supported image files found.", "complete")
        return 0

    sort_method = sort_options.get('primary_sort', 'Date')
    face_rec_mode = sort_options.get('face_mode', 'balanced')
    known_encodings, known_names = None, None

    # Load face models only if needed for any part of the sort
    if sort_method == 'People' or (sort_method == 'Hybrid' and (sort_options.get('base_sort') == 'People' or sort_options.get('custom_filter', {}).get('filter_type') == 'People')):
        update_callback(7, "Initializing face recognition engine...", "running")
        try:
            known_encodings, known_names = load_face_encodings(encodings_path)
            update_callback(8, f"Face detection mode set to '{face_rec_mode.capitalize()}'.", "running")
        except (FileNotFoundError, ImportError, IOError) as e:
            update_callback(100, f"Fatal Error: Cannot sort by People. Reason: {e}", "error")
            return 0

    multiple_countries_found = False
    locations = []
    if sort_method == 'Location' or (sort_method == 'Hybrid' and (sort_options.get('base_sort') == 'Location' or sort_options.get('custom_filter', {}).get('filter_type') == 'Location')):
        update_callback(7, "Scanning for location metadata...", "running")
        locations, _, _ = get_metadata_overview(work_dir)
        # CORRECTED: This now properly determines if photos span multiple countries.
        if locations:
            # Extract the first part of each path (the country code) and count the unique ones.
            countries = set(loc.split(os.path.sep)[0] for loc in locations if os.path.sep in loc)
            multiple_countries_found = len(countries) > 1

    # --- NEW: Real-time analytics tracking ---
    start_time = time.time()
    processed_files_count = 0
    processed_size_mb = 0.0
    # Map face_mode to a user-friendly quality string
    quality_map = {"fast": "Fast", "balanced": "Balanced", "accurate": "Accurate"}
    quality_metric = quality_map.get(face_rec_mode, "N/A")


    moved_count = 0
    # ADD THIS: A manifest to track file operations for rollback on abort.
    operation_manifest = []

    for i, source_path in enumerate(files_to_process):
        progress = 10 + int(((i + 1) / total_files) * 85)
        
        # --- Analytics Calculation ---
        analytics = {"quality": quality_metric, "scan_rate": "0.0", "data_flow": "0.0"}
        try:
            # Get file size for data flow calculation
            file_size_mb = os.path.getsize(source_path) / (1024 * 1024)
            processed_files_count += 1
            processed_size_mb += file_size_mb
            
            elapsed_time = time.time() - start_time
            if elapsed_time > 0.5: # Update analytics every half second to avoid noisy data
                scan_rate = processed_files_count / elapsed_time
                data_flow = processed_size_mb / elapsed_time
                analytics["scan_rate"] = f"{scan_rate:.1f}"
                analytics["data_flow"] = f"{data_flow:.1f}"
        except OSError:
            pass # Ignore if file is inaccessible

        # Pass analytics with the update
        update_callback(progress, f"Analyzing: {os.path.basename(source_path)}", "running", analytics)
        
        if cancellation_event and cancellation_event.is_set():
            # Pass the manifest to the exception so the finally block can use it.
            raise OperationAbortedError("Sorting operation cancelled by user.", manifest=operation_manifest)

        original_subfolder = os.path.relpath(os.path.dirname(source_path), work_dir) if work_dir != os.path.dirname(source_path) else ''
        exif_data = get_exif_data(source_path)
        date_obj = get_date_taken(exif_data)
        new_filename = f"{date_obj.strftime('%Y-%m-%d_%H%M%S')}_{os.path.basename(source_path)}" if date_obj else os.path.basename(source_path)

        names = []
        if known_encodings:
            try:
                # This function call is now protected. If it fails for any reason,
                # the except block will catch it and prevent the main loop from crashing.
                recognized_names = recognize_faces(source_path, known_encodings, known_names, mode=face_rec_mode)
                if recognized_names is not None:
                    names = recognized_names
            except Exception as e:
                # If recognize_faces fails catastrophically on one file, log it and move on.
                logging.error(f"CRITICAL: Face recognition failed for file '{os.path.basename(source_path)}'. Error: {e}. This file will be treated as having no faces.")
                # We explicitly ensure 'names' is an empty list so the file can be sorted
                # into 'No_Faces_Found' and the overall process can continue.
                names = []

        # --- Destination Path Calculation ---
        dest_paths = []
        if sort_method == 'Hybrid':
            dest_paths = _get_hybrid_sort_paths(dest_dir, sort_options, exif_data, date_obj, names, multiple_countries_found)
        else: # Standard Sort
            # --- DEFINITIVE FIX ---
            # Only call get_location if the sort method actually requires it.
            # This prevents the geocoder from loading and causing file locks on other sort types.
            location_path = None
            if sort_method == 'Location':
                logging.info("DEBUG: Location sort in progress, calling get_location().")
                location_path = get_location(exif_data)
            
            dest_paths = _get_standard_sort_paths(dest_dir, sort_method, date_obj, location_path, names, multiple_countries_found, sort_options)

        # --- File Operation Execution ---
        special_folder_path = None
        # The primary operation is now passed in
        op = operation_mode

        # --- CORRECTED HYBRID MOVE LOGIC ---
        # In Hybrid mode, we separate the 'special' copies from the final 'base' move.
        if sort_method == 'Hybrid':
            # The last path in the list from _get_hybrid_sort_paths is always the base sort path.
            base_sort_path = dest_paths.pop() if dest_paths else None
            
            # Any remaining paths are for special folders. These are always 'copy' operations.
            for special_dest_path in dest_paths:
                final_target = os.path.join(special_dest_path, original_subfolder) if sort_options.get('maintain_hierarchy') else special_dest_path
                handle_file_op('copy', source_path, final_target, new_filename, date_obj)

            # Now, perform the primary operation ('move' or 'copy') for the base sort path.
            if base_sort_path:
                final_target = os.path.join(base_sort_path, original_subfolder) if sort_options.get('maintain_hierarchy') else base_sort_path
                final_destination = handle_file_op(op, source_path, final_target, new_filename, date_obj)
                if final_destination:
                    if op == 'move':
                        operation_manifest.append({'source': source_path, 'destination': final_destination})
                    moved_count += 1
        else:
            # --- STANDARD SORT LOGIC (Unchanged) ---
            for dest_path in dest_paths:
                final_target = os.path.join(dest_path, original_subfolder) if sort_options.get('maintain_hierarchy') else dest_path
                final_destination = handle_file_op(op, source_path, final_target, new_filename, date_obj)
                
                if final_destination:
                    if op == 'move':
                        operation_manifest.append({'source': source_path, 'destination': final_destination})
                    moved_count += 1
                    # If we successfully moved the file, we don't need to process it for other destinations
                    if op == 'move':
                        break

    return moved_count

def process_photos(config, update_callback):
    """Main entry point called by the API, orchestrating the entire process."""
    source_dir = config["source_folder"]
    dest_dir = config["destination_folder"]
    sort_options = config.get("sorting_options", {"primary_sort": config.get("sort_method", "Date"), "maintain_hierarchy": True})
    ignore_list = config.get("ignore_list", [])
    # FIX: Add ignore_list to sort_options so it can be passed to _core_processing_loop
    sort_options["ignore_list"] = ignore_list
    operation_mode = config.get("operation_mode", "move")
    encodings_path = config.get("encodings_path")
    cancellation_event = config.get("cancellation_event")

    log_file_handle, temp_log_path = tempfile.mkstemp(suffix=".log", text=True)
    os.close(log_file_handle)

    log_handler = logging.FileHandler(temp_log_path, mode='w', encoding='utf-8')
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    log_handler.setFormatter(formatter)
    
    root_logger = logging.getLogger()
    if root_logger.hasHandlers():
        root_logger.handlers.clear()
    root_logger.addHandler(log_handler)
    root_logger.setLevel(logging.INFO)
    
    face_rec_mode = sort_options.get('face_mode', 'balanced')
    quality_map = {"fast": "Fast", "balanced": "Balanced", "accurate": "High"}
    quality_metric = quality_map.get(face_rec_mode, "N/A")
    initial_analytics = {"quality": quality_metric, "scan_rate": "0.0", "data_flow": "0.0"}
    update_callback(0, f"System prepared. Initiating '{operation_mode.capitalize()}' operation.", "running", initial_analytics)

    work_dir = source_dir
    temp_source_path = None
    operation_successful = False # Add a flag to track success
    # FIX: A new flag to determine if the original source should be deleted.
    delete_original_source_on_success = False
    
    # ADD THIS: To hold the manifest if an abort occurs
    rollback_manifest = None

    try:
        if operation_mode == 'move':
            source_dev = os.stat(source_dir).st_dev
            dest_dev = os.stat(dest_dir).st_dev

            if source_dev != dest_dev:
                # --- SAFE PATH: Different drives ---
                # This path is transactional and fully reversible on abort.
                logging.warning("Source and destination are on different drives. Using safe copy-then-delete method.")
                update_callback(1, "Verifying required disk space...", "running", initial_analytics)
                
                # CORRECTED LOGIC: Filter files based on their parent folder for size calculation.
                ignore_set = set(ignore_list)
                files_to_process = []
                for dirpath, dirnames, filenames in os.walk(source_dir):
                    if dirpath in ignore_set:
                        continue # Ignore files in this directory for size calculation.
                    
                    for f in filenames:
                        if f.lower().endswith(SUPPORTED_EXTENSIONS):
                            files_to_process.append(os.path.join(dirpath, f))

                total_size = sum(os.path.getsize(f) for f in files_to_process)
                free_space = shutil.disk_usage(dest_dir).free

                if total_size > free_space:
                    required_gb = total_size / (1024**3)
                    available_gb = free_space / (1024**3)
                    error_msg = f"Insufficient space on destination drive. You need {required_gb:.2f} GB but only have {available_gb:.2f} GB available. Operation cancelled."
                    logging.error(error_msg)
                    raise Exception(error_msg)
                
                update_callback(2, "Space check passed. Creating secure temporary workspace...", "running", initial_analytics)
                timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
                temp_source_name = f"_Source_Copy_{timestamp}"
                temp_source_path = os.path.join(os.path.dirname(dest_dir), temp_source_name)
                
                # CORRECTED: shutil.ignore_patterns does not work with full paths.
                # We must define a custom ignore function for copytree.
                def ignore_func(directory, contents):
                    ignored_items = []
                    for item in contents:
                        full_path = os.path.join(directory, item)
                        if full_path in ignore_set:
                            ignored_items.append(item)
                    return ignored_items

                shutil.copytree(source_dir, temp_source_path, ignore=ignore_func, copy_function=shutil.copy2)
                work_dir = temp_source_path
                # Set the flag to delete the original source only if this safe method completes.
                delete_original_source_on_success = True
            else:
                # --- FAST PATH: Same drive ---
                # Work directly on the source folder. `shutil.move` will be a fast rename.
                # Aborting here is not fully transactional, but it is safe (no data loss).
                logging.info("Source and destination are on the same drive. Performing a fast and efficient move.")
                update_callback(2, "Performing fast move on the same drive.", "running", initial_analytics)
                work_dir = source_dir
                # Do NOT set the delete flag. The files are moved one by one.
                delete_original_source_on_success = False
        
        # For 'copy' operation, work_dir remains source_dir.

        update_callback(5, "Workspace secured. Commencing file processing...", "running", initial_analytics)
        
        moved_count = _core_processing_loop(work_dir, dest_dir, sort_options, update_callback, encodings_path, cancellation_event, operation_mode)

        completion_message = f"Process complete. {moved_count} files successfully {operation_mode}d."
        logging.info(completion_message)
        update_callback(100, completion_message, "complete", initial_analytics)
        operation_successful = True # Mark as successful

    except OperationAbortedError as e:
        # Catch the abort error to get the manifest
        rollback_manifest = e.manifest
        # Re-raise the exception so the main error handling catches it
        raise e

    finally:
        # --- ABORT ROLLBACK LOGIC ---
        if rollback_manifest:
            update_callback(99, "Aborted. Rolling back moved files...", "running", initial_analytics)
            logging.info(f"Rollback initiated for {len(rollback_manifest)} files.")
            for op in reversed(rollback_manifest):
                try:
                    # Move the file from its new destination back to its original source directory
                    original_folder = os.path.dirname(op['source'])
                    os.makedirs(original_folder, exist_ok=True)
                    shutil.move(op['destination'], op['source'])
                except Exception as rollback_e:
                    logging.error(f"CRITICAL: Rollback failed for '{op['destination']}'. Please move it manually to '{op['source']}'. Error: {rollback_e}")
            logging.info("Rollback complete.")

        # This block runs on success, failure, or abort.
        # FIX: Only delete the original source if the 'safe move' path was taken and was successful.
        if delete_original_source_on_success and operation_successful:
            try:
                update_callback(99, "Finalizing move: Removing original source directory...", "running", initial_analytics)
                shutil.rmtree(source_dir)
                logging.info(f"Successfully removed original source directory: {source_dir}")
            except Exception as e:
                logging.error(f"CRITICAL: Failed to remove original source directory after move: {e}")
                update_callback(100, f"Error: Could not remove original source folder. Please remove it manually: {source_dir}", "warning", initial_analytics)

        if temp_source_path and os.path.exists(temp_source_path):
            # This cleanup is for the 'safe move' path, especially on abort.
            update_callback(99, "Finalizing operation: Cleaning up temporary workspace...", "running", initial_analytics)
            shutil.rmtree(temp_source_path)
            logging.info("Temporary folder cleanup complete.")
        
        if log_handler:
            root_logger.removeHandler(log_handler)
            log_handler.close()
            
            try:
                final_log_dir = os.path.join(dest_dir, "logs")
                os.makedirs(final_log_dir, exist_ok=True)
                final_log_name = f"organization_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
                final_log_path = os.path.join(final_log_dir, final_log_name)
                shutil.move(temp_log_path, final_log_path)
                print(f"Log file moved to {final_log_path}")
            except Exception as e:
                print(f"Error moving log file to destination: {e}")
                if os.path.exists(temp_log_path):
                    os.remove(temp_log_path)