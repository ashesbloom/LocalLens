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
import shutil
from datetime import datetime
import logging
import json
import pickle
import numpy as np
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS

# --- Custom Exception Import ---
from exceptions import OperationAbortedError# --- Optional Imports with Graceful Fallbacks ---
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

# ==============================================================================
#  Constants & Configuration (Consolidated from Best Versions)
# ==============================================================================

script_dir = os.path.dirname(os.path.abspath(__file__))
PRESETS_FOLDER = os.path.join(script_dir, "presets")
os.makedirs(PRESETS_FOLDER, exist_ok=True)

PATHS_FILE_NAME = os.path.join(PRESETS_FOLDER, "paths.json")

# CONFLICT FIXED: Removed outdated, hardcoded path constants.
# The correct path will now be passed in from main.py.
# FACE_RECOGNITION_SUBFOLDER = os.path.join(script_dir, "facial recognition model (local)")
# ENCODINGS_FILE = os.path.join(FACE_RECOGNITION_SUBFOLDER, "face_encodings.pkl")

SUPPORTED_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.heic', '.heif')

UNKNOWN_DATE_FOLDER_NAME = "Unknown_Date"
UNKNOWN_LOCATION_FOLDER_NAME = "Unknown_Location"
UNKNOWN_PEOPLE_FOLDER_NAME = "Unknown_Faces"
NO_FACES_FOLDER_NAME = "No_Faces_Found"

FACE_RECOGNITION_TOLERANCE = 0.55
RESIZE_WIDTH_FOR_PROCESSING = 800

# ==============================================================================
#  Preset & Configuration Handling
# ==============================================================================

def load_presets(filename):
    if not os.path.exists(filename): return {}
    try:
        with open(filename, 'r', encoding='utf-8') as f: return json.load(f)
    except (json.JSONDecodeError, IOError): return {}

def save_presets(filename, data):
    try:
        with open(filename, 'w', encoding='utf-8') as f: json.dump(data, f, indent=4)
        return True
    except IOError as e:
        logging.error(f"Error saving presets to {filename}: {e}")
        return False

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
        
    gps_info = exif_data["GPSInfo"]
    lat_dms = gps_info.get("GPSLatitude")
    lon_dms = gps_info.get("GPSLongitude")
    lat_ref = gps_info.get("GPSLatitudeRef")
    lon_ref = gps_info.get("GPSLongitudeRef")

    if lat_dms and lon_dms and lat_ref and lon_ref:
        # It now correctly calls the helper function
        lat = get_decimal_from_dms(lat_dms, lat_ref)
        lon = get_decimal_from_dms(lon_dms, lon_ref)
        
        # Use the reverse geocoder
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

def get_metadata_overview(source_dir, ignore_list=None, encodings_path=None):
    """
    MODIFIED: Now scans for available months within each year.
    """
    locations, people = set(), set()
    date_structure = {} # Changed from a simple set of years to a dict
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
    for dirpath, dirnames, filenames in os.walk(source_dir):
        dirnames[:] = [d for d in dirnames if os.path.join(dirpath, d) not in ignore_set]
        for f in filenames:
            if f.lower().endswith(SUPPORTED_EXTENSIONS):
                files_to_scan.append(os.path.join(dirpath, f))

    if not files_to_scan:
        return [], [], sorted(list(people))

    logging.info(f"Scanning {len(files_to_scan)} files for metadata overview...")
    for file_path in files_to_scan:
        exif = get_exif_data(file_path)
        loc = get_location(exif)
        date_obj = get_date_taken(exif)
        if loc:
            locations.add(loc)
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
        return True
    except Exception as e:
        logging.error(f"Error performing '{op}' on '{os.path.basename(source_path)}': {e}")
        return False

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

def recognize_faces(image_path, known_encodings, known_names, mode='balanced'):
    """
    The core AI function. It takes a single image and identifies all known
    people within it, with selectable accuracy modes.
    """
    if not face_recognition: return []
    try:
        pil_image = Image.open(image_path).convert('RGB')
        if pil_image.width > RESIZE_WIDTH_FOR_PROCESSING:
            ratio = RESIZE_WIDTH_FOR_PROCESSING / float(pil_image.width)
            new_height = int(float(pil_image.height) * ratio)
            pil_image = pil_image.resize((RESIZE_WIDTH_FOR_PROCESSING, new_height), Image.Resampling.LANCZOS)
        
        image = np.array(pil_image)

        # The 'model' parameter determines the face detection algorithm.
        # This logic directly mirrors the original script's user choice.
        face_locations = []
        if mode == 'fast':
            # ENHANCEMENT: Upsample once to improve detection of smaller faces
            # without a major performance hit of the 'balanced' mode.
            face_locations = face_recognition.face_locations(image, model='hog', number_of_times_to_upsample=1)
        elif mode == 'accurate':
            # Slower but more accurate, using a deep learning model.
            face_locations = face_recognition.face_locations(image, model='cnn')
        else: # 'balanced' is the default
            # A good compromise, upsampling the image to find more faces with the fast 'hog' model.
            face_locations = face_recognition.face_locations(image, model='hog', number_of_times_to_upsample=2)

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
                # ENHANCEMENT: Add a sanity check. If the best match is still a weak one, ignore it.
                # This prevents false positives where the closest match is still outside the tolerance.
                if matches[best_match_index] and face_distances[best_match_index] <= FACE_RECOGNITION_TOLERANCE:
                    name = known_names[best_match_index]
            found_names.add(name)
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
    encodings_path = config.get("encodings_path")
    cancellation_event = config.get("cancellation_event")

    target_folder_name = find_config.get('folderName', "Find_Results")
    target_folder = os.path.join(base_dest_dir, target_folder_name)
    os.makedirs(target_folder, exist_ok=True)
    
    # The 'Find & Group' operation no longer requires a dedicated log file.
    # The main application logger is sufficient if needed.
    logging.info(f"Starting Find & Group Session. Target folder: '{target_folder_name}'")
    logging.info(f"Filters applied: {json.dumps(find_config, indent=2)}")

    update_callback(0, "Preparing to search for photos...", "running")

    files_to_process = [os.path.join(dp, f) for dp, _, fn in os.walk(source_dir) for f in fn if f.lower().endswith(SUPPORTED_EXTENSIONS)]
    total_files = len(files_to_process)
    if total_files == 0:
        update_callback(100, "No supported image files found in the source directory.", "complete")
        return

    found_count = 0
    known_encodings, known_names = None, None
    
    # Load face models only if a people filter is active
    if find_config.get('people'):
        update_callback(5, "Initializing face recognition engine...", "running")
        if not encodings_path or not os.path.exists(encodings_path):
            update_callback(100, "Cannot use People filter: Face encodings file not found.", "error")
            return
        try:
            known_encodings, known_names = load_face_encodings(encodings_path)
            if not known_encodings:
                update_callback(100, "Cannot use People filter: No faces are enrolled.", "error")
                return
        except Exception as e:
            update_callback(100, f"Fatal Error loading face data: {e}", "error")
            return

    for i, source_path in enumerate(files_to_process):
        progress = 10 + int(((i + 1) / total_files) * 85)
        update_callback(progress, f"Searching: {os.path.basename(source_path)}", "running")
        
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
            if handle_file_op('copy', source_path, target_folder, new_filename, date_obj):
                found_count += 1
                logging.info(f"Found match: Copied '{os.path.basename(source_path)}' to '{target_folder_name}'")

    completion_message = f"Search complete. Found and copied {found_count} matching photos to '{target_folder_name}'."
    if found_count == 0:
        completion_message = "Search complete. No photos matched the specified criteria."
        
    logging.info(completion_message)
    update_callback(100, completion_message, "complete")


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


def _core_processing_loop(work_dir, dest_dir, sort_options, update_callback, encodings_path, cancellation_event=None):
    """
    REFACTORED: This function is now a high-level orchestrator that calls dedicated
    functions for each sorting mode, preventing logic conflicts.
    """
    files_to_process = [os.path.join(dp, f) for dp, _, fn in os.walk(work_dir) for f in fn if f.lower().endswith(SUPPORTED_EXTENSIONS)]
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

    moved_count = 0
    for i, source_path in enumerate(files_to_process):
        progress = 10 + int(((i + 1) / total_files) * 85)
        update_callback(progress, f"Analyzing: {os.path.basename(source_path)}", "running")
        
        if cancellation_event and cancellation_event.is_set():
            raise OperationAbortedError("Sorting operation cancelled by user.")

        original_subfolder = os.path.relpath(os.path.dirname(source_path), work_dir) if work_dir != os.path.dirname(source_path) else ''
        exif_data = get_exif_data(source_path)
        date_obj = get_date_taken(exif_data)
        new_filename = f"{date_obj.strftime('%Y-%m-%d_%H%M%S')}_{os.path.basename(source_path)}" if date_obj else os.path.basename(source_path)

        names = []
        if known_encodings:
            recognized_names = recognize_faces(source_path, known_encodings, known_names, mode=face_rec_mode)
            if recognized_names is not None:
                names = recognized_names

        # --- Destination Path Calculation ---
        dest_paths = []
        if sort_method == 'Hybrid':
            dest_paths = _get_hybrid_sort_paths(dest_dir, sort_options, exif_data, date_obj, names, multiple_countries_found)
        else: # Standard Sort
            location_path = get_location(exif_data)
            dest_paths = _get_standard_sort_paths(dest_dir, sort_method, date_obj, location_path, names, multiple_countries_found, sort_options)

        # --- File Operation Execution ---
        special_folder_path = None
        for j, dest_path in enumerate(dest_paths):
            if sort_method == 'Hybrid' and j == 0:
                # Copy to the special folder
                special_folder_path = dest_path
                op = 'copy'
            else:
                # Move to the base sort destination
                op = 'move'
            
            final_target = os.path.join(dest_path, original_subfolder) if sort_options.get('maintain_hierarchy') else dest_path
            if handle_file_op(op, source_path, final_target, new_filename, date_obj) and op == 'move':
                moved_count += 1

        # Ensure the photo is moved to the base sort destination even if it was copied to the special folder
        if special_folder_path and len(dest_paths) > 1:
            base_sort_path = dest_paths[1]
            final_target = os.path.join(base_sort_path, original_subfolder) if sort_options.get('maintain_hierarchy') else base_sort_path
            handle_file_op('move', source_path, final_target, new_filename, date_obj)

    return moved_count

def process_photos(config, update_callback):
    """Main entry point called by the API, orchestrating the entire process."""
    source_dir = config["source_folder"]
    dest_dir = config["destination_folder"]
    sort_options = config.get("sorting_options", {"primary_sort": config.get("sort_method", "Date"), "maintain_hierarchy": True})
    ignore_list = config.get("ignore_list", [])
    # CONFLICT FIXED: Get the correct encodings path from the config dictionary
    encodings_path = config.get("encodings_path")
    cancellation_event = config.get("cancellation_event")

    log_dir = os.path.join(dest_dir, "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_filename = os.path.join(log_dir, f"organization_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")
    
    log_handler = logging.FileHandler(log_filename, mode='w', encoding='utf-8')
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    log_handler.setFormatter(formatter)
    
    # Add handler to the root logger, clearing any old ones first.
    root_logger = logging.getLogger()
    if root_logger.hasHandlers():
        root_logger.handlers.clear()
    root_logger.addHandler(log_handler)
    root_logger.setLevel(logging.INFO)
    
    update_callback(0, "System prepared. Initiating organization process.", "running")

    temp_source_path = None
    try:
        update_callback(1, "Creating secure temporary workspace...", "running")
        timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        temp_source_name = f"_Source_Copy_{timestamp}"
        temp_source_path = os.path.join(os.path.dirname(dest_dir), temp_source_name)
        ignore_pattern = shutil.ignore_patterns(*ignore_list) if ignore_list else None
        shutil.copytree(source_dir, temp_source_path, ignore=ignore_pattern, copy_function=shutil.copy2)
        update_callback(5, "Workspace secured. Commencing file processing...", "running")
        
        # CONFLICT FIXED: Pass the correct path to the core processing loop
        moved_count = _core_processing_loop(temp_source_path, dest_dir, sort_options, update_callback, encodings_path, cancellation_event)

        completion_message = f"Process complete. {moved_count} files successfully organized."
        logging.info(completion_message)
        update_callback(100, completion_message, "complete")

    finally:
        if temp_source_path and os.path.exists(temp_source_path):
            update_callback(99, "Finalizing operation: Cleaning up temporary workspace...", "running")
            shutil.rmtree(temp_source_path)
            logging.info("Temporary folder cleanup complete.")
        
        if log_handler:
            root_logger.removeHandler(log_handler)
            log_handler.close()