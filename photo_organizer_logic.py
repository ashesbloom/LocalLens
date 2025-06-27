# ==============================================================================
#  Photo Organizer - Backend Logic
# ==============================================================================
#
#  This script contains the core logic for a photo organization application.
#  The comments below are intended for developers creating the User Interface (UI)
#  and User Experience (UX), explaining how this backend logic can be connected
#  to visual components.
#
# ==============================================================================

# --- Core Imports ---
import os
import shutil
from datetime import datetime
import logging
import json
import pickle
import numpy as np

# --- Image Processing Imports ---
# Pillow is used for opening and reading image metadata.
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
# pillow-heif adds support for Apple's HEIC/HEIF image formats.
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    # UI: On startup, you can display a status indicator confirming HEIC support.
    print("HEIC/HEIF format support enabled.")
except ImportError:
    # UI: If this import fails, display a non-blocking warning to the user,
    # letting them know that .heic and .heif files will be skipped.
    print("Warning: 'pillow-heif' not installed. HEIC/HEIF files will be ignored.")

# --- AI & Geocoding Imports ---
# reverse_geocoder converts GPS coordinates (lat, long) into human-readable place names.
import reverse_geocoder as rg
# face_recognition is the core library for finding and identifying faces in photos.
try:
    import face_recognition
    # UI: A status indicator can show that the face recognition engine is ready.
    print("Facial recognition library loaded.")
except ImportError:
    # UI: This is a critical error. The application cannot proceed with its core
    # features. Display a prominent, blocking error message and guide the
    # user to the installation instructions. The application should exit gracefully.
    print("CRITICAL ERROR: 'face_recognition' library not installed.")
    print("Please install it with: pip install face_recognition")
    exit()

# ==============================================================================
#  Constants & Configuration
# ==============================================================================

# --- Get the absolute path of the script's directory ---
# This makes the script work correctly regardless of where it's run from.
try:
    script_dir = os.path.dirname(os.path.abspath(__file__))
except NameError:
    # Fallback for environments where __file__ is not defined (e.g., interactive shells)
    script_dir = os.getcwd()

# --- File & Folder Names ---
# MODIFICATION: Preset files are now located in a dedicated 'presets' folder.
PRESETS_FOLDER = os.path.join(script_dir, "presets")
PATHS_FILE_NAME = os.path.join(PRESETS_FOLDER, "paths.json")
FILTERS_FILE_NAME = os.path.join(PRESETS_FOLDER, "filters.json")

FACE_RECOGNITION_SUBFOLDER = os.path.join(script_dir, "facial recognition model (local)")
ENCODINGS_FILE = os.path.join(FACE_RECOGNITION_SUBFOLDER, "face_encodings.pkl")

# --- Supported File Types ---
# A tuple of file extensions that the application will process.
# UI: Display this list to the user, perhaps in a help or info section.
SUPPORTED_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.heic', '.heif')

# --- Default Folder Names for Uncategorized Items ---
# UI: These names are used when metadata is missing. They could be
# customizable in the application's settings.
UNKNOWN_DATE_FOLDER_NAME = "Unknown_Date"
UNKNOWN_LOCATION_FOLDER_NAME = "Unknown_Location"
UNKNOWN_PEOPLE_FOLDER_NAME = "Unknown_Faces"
NO_FACES_FOLDER_NAME = "No_Faces_Found"

# --- Performance & Accuracy Tuning ---
# These settings control the trade-off between speed and accuracy for AI tasks.
# UI: Expose these as sliders or dropdowns in an "Advanced Settings" panel.
# For example, "Face Recognition Tolerance" could be a slider from "Strict" to "Lenient".
FACE_RECOGNITION_TOLERANCE = 0.55
RESIZE_WIDTH_FOR_PROCESSING = 800

# ==============================================================================
#  Preset & Configuration Handling
# ==============================================================================

def load_presets(filename):
    """
    Loads saved settings (like paths or filters) from a JSON file.
    UI: This function is called on startup to populate lists of saved presets,
    allowing the user to quickly select a previous configuration.
    """
    if not os.path.exists(filename): return {}
    try:
        with open(filename, 'r', encoding='utf-8') as f: return json.load(f)
    except (json.JSONDecodeError, IOError): return {}

def save_presets(filename, data):
    """
    Saves a configuration (paths, filters) to a JSON file.
    UI: This is triggered when a user saves a new preset, for example,
    after typing a name for their source/destination path configuration.
    """
    try:
        # MODIFICATION: Automatically create the 'presets' directory if it doesn't exist.
        preset_dir = os.path.dirname(filename)
        os.makedirs(preset_dir, exist_ok=True)
        
        with open(filename, 'w', encoding='utf-8') as f: json.dump(data, f, indent=4)
        print(f"Presets saved to {filename}.")
    except IOError as e: print(f"Error saving presets to {filename}: {e}")


# ==============================================================================
#  Initial Setup Screens & Logic
# ==============================================================================

def get_path_configuration():
    """
    Manages the selection of source and destination folders.
    UI/UX: This function corresponds to the first major screen of the application.
    1.  It should first check for saved presets (`paths.json`).
    2.  If presets exist, display them in a list (e.g., "Wedding Photos", "Phone Backup").
        The user can click one to load the paths.
    3.  Provide an option for "New Path Configuration".
    4.  This leads to two input fields or folder browser buttons for "Source Folder"
        and "Destination Folder".
    5.  After selecting folders, a checkbox or button "Save this configuration?"
        should appear, prompting the user for a preset name.
    """
    saved_paths = load_presets(PATHS_FILE_NAME)
    # The `while True` loop is for the command-line interface. In a GUI, this
    # would be event-driven (e.g., waiting for a button click).
    while True:
        print("\n--- Path Configuration ---")
        if saved_paths:
            print("Select a saved path preset or create a new one:")
            for i, name in enumerate(saved_paths, 1): print(f"  {i}. {name} (Source: {saved_paths[name]['source']})")
            print(f"  {len(saved_paths) + 1}. Enter new paths")
            choice = input("Enter your choice: ").strip()
            if choice.isdigit() and 1 <= int(choice) <= len(saved_paths):
                name = list(saved_paths.keys())[int(choice) - 1]
                return saved_paths[name]['source'], saved_paths[name]['destination']
        # UI: These `input()` calls map to text input fields for source and destination.
        source = input("Enter the full path to your SOURCE photo folder: ").strip()
        if not os.path.isdir(source):
            print("ERROR: Source path is not a valid directory."); continue
        destination = input("Enter the full path for your DESTINATION folder: ").strip()
        save_choice = input("Do you want to save these paths as a preset? (y/n): ").lower().strip()
        if save_choice == 'y':
            preset_name = input("Enter a name for this path preset: ").strip()
            saved_paths[preset_name] = {"source": source, "destination": destination}
            save_presets(PATHS_FILE_NAME, saved_paths)
        return source, destination

def get_metadata_overview(source_dir, ignore_list=None):
    """
    Performs a quick scan of all images to find available locations and dates.
    UI/UX: This is a data-loading step.
    1.  Before showing filter options (like filtering by location), call this function.
    2.  While it runs, display a progress bar or loading spinner, e.g.,
        "Scanning metadata (150/2400 files)...".
    3.  The returned sets (`locations`, `dates`) are then used to populate the
        dropdowns or lists in the filter creation UI, ensuring users can only
        select from locations or dates that actually exist in their photo collection.
    """
    locations, countries, dates = set(), set(), set()
    ignore_set = set(ignore_list) if ignore_list else set()
    files_to_scan = []
    for dirpath, dirnames, filenames in os.walk(source_dir):
        dirnames[:] = [d for d in dirnames if d not in ignore_set]
        for f in filenames:
            if f.lower().endswith(SUPPORTED_EXTENSIONS):
                files_to_scan.append(os.path.join(dirpath, f))
    if not files_to_scan: return set(), 0, set()
    print(f"Performing a quick scan of {len(files_to_scan)} files for metadata...")
    for i, file_path in enumerate(files_to_scan):
        # UI: This print statement is perfect for updating a progress bar's text.
        print(f"Scanning: {i+1}/{len(files_to_scan)}", end='\r')
        exif = get_exif_data(file_path)
        loc, date_obj = get_location(exif), get_date_taken(exif)
        if loc:
            locations.add(loc); countries.add(loc.split(os.path.sep)[0])
        if date_obj: dates.add((date_obj.year, date_obj.month))
    print("\nScan complete.")
    return locations, len(countries), dates


def setup_logging(log_dir):
    """
    Initializes a log file to record all operations.
    UI: After an operation is complete, provide a button or link like
    "View Detailed Log" that opens this file for the user.
    """
    log_filename = os.path.join(log_dir, 'photo_organizer.log')
    handler = logging.FileHandler(log_filename, mode='w', encoding='utf-8')
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', handlers=[handler])


# ==============================================================================
#  Image Metadata Extraction
# ==============================================================================

def get_exif_data(file_path):
    """Extracts raw EXIF metadata from an image file."""
    try:
        with Image.open(file_path) as image:
            exif_data = image._getexif()
            if exif_data:
                decoded_exif = {}
                for tag_id, value in exif_data.items():
                    tag = TAGS.get(tag_id, tag_id)
                    if tag == "GPSInfo":
                        gps_data = {}
                        for gps_tag_id in value:
                            gps_tag = GPSTAGS.get(gps_tag_id, gps_tag_id)
                            gps_data[gps_tag] = value[gps_tag_id]
                        decoded_exif[tag] = gps_data
                    else: decoded_exif[tag] = value
                return decoded_exif
    except Exception:
        # Silently pass on errors (e.g., no EXIF data). The functions
        # calling this are prepared to handle None.
        pass
    return None

def get_date_taken(exif_data):
    """
    Parses the EXIF data to find the date the photo was taken.
    It intelligently checks multiple common date tags.
    """
    if not exif_data: return None
    date_tags = ['DateTimeOriginal', 'DateTimeDigitized', 'DateTime']
    for tag in date_tags:
        if tag in exif_data and str(exif_data[tag]).strip():
            try: return datetime.strptime(exif_data[tag], '%Y:%m:%d %H:%M:%S')
            except (ValueError, TypeError): continue
    return None

def get_decimal_from_dms(dms, ref):
    """Helper function to convert GPS DMS (Degrees, Minutes, Seconds) to decimal."""
    degrees, minutes, seconds = dms[0], dms[1] / 60.0, dms[2] / 3600.0
    decimal = degrees + minutes + seconds
    if ref in ['S', 'W']: decimal = -decimal
    return decimal

def get_location(exif_data):
    """
    Parses GPS data from EXIF and uses a reverse geocoder to get a
    "Country/State/City" path.
    """
    if not exif_data or "GPSInfo" not in exif_data: return None
    gps_info = exif_data["GPSInfo"]
    lat_dms, lon_dms = gps_info.get("GPSLatitude"), gps_info.get("GPSLongitude")
    lat_ref, lon_ref = gps_info.get("GPSLatitudeRef"), gps_info.get("GPSLongitudeRef")
    if lat_dms and lon_dms and lat_ref and lon_ref:
        lat, lon = get_decimal_from_dms(lat_dms, lat_ref), get_decimal_from_dms(lon_dms, lon_ref)
        # Uses the external geocoding library here.
        location = rg.search((lat, lon), mode=1)
        if location:
            loc_data = location[0]
            country = loc_data.get('cc', '').replace(' ', '-')
            state = loc_data.get('admin1', '').replace(' ', '-')
            city = loc_data.get('name', '').replace(' ', '-')
            # Constructs a clean folder path like 'US/California/San-Francisco'
            # NOTE: os.path.join correctly handles this on all platforms.
            path_parts = [p for p in [country, state, city] if p]
            if path_parts: return os.path.join(*path_parts)
    return None


# ==============================================================================
#  File System Operations
# ==============================================================================

def handle_file_op(op, source_path, target_folder, new_filename, date_obj):
    """
    A robust function to copy or move a file. It handles creating destination
    directories and automatically renames files if a conflict exists.
    """
    os.makedirs(target_folder, exist_ok=True)
    destination_path = os.path.join(target_folder, new_filename)
    counter = 1
    base, ext = os.path.splitext(new_filename)
    # This loop prevents overwriting files by appending '_1', '_2', etc.
    while os.path.exists(destination_path):
        renamed_filename = f"{base}_{counter}{ext}"
        destination_path = os.path.join(target_folder, renamed_filename)
        if counter == 1: logging.info(f"File '{new_filename}' already exists. Renaming to '{renamed_filename}'")
        counter += 1
    try:
        if op == 'copy': shutil.copy2(source_path, destination_path)
        elif op == 'move': shutil.move(source_path, destination_path)
        logging.info(f"{op.capitalize()}d '{os.path.basename(source_path)}' to '{destination_path}'")
        # Set the 'Date Modified' of the new file to the 'Date Taken' from metadata.
        if date_obj:
            timestamp = date_obj.timestamp()
            os.utime(destination_path, (timestamp, timestamp))
            logging.info(f"Updated file timestamp for '{os.path.basename(destination_path)}'")
        return True
    except Exception as e:
        logging.error(f"Error performing '{op}' on '{os.path.basename(source_path)}': {e}")
        return False

# ==============================================================================
#  Face Recognition Core Logic
# ==============================================================================

def load_face_encodings(encodings_file):
    """
    Loads the pre-computed face models of known individuals.
    This file is generated by a separate script (e.g., `enroll_faces.py`).
    UI/UX:
    1.  This function is called when the user selects a sort/filter option involving people.
    2.  If the file doesn't exist, the UI must show an error message and disable
        any people-based features. It should guide the user to the "Enroll Faces"
        section of the application.
    3.  The returned `all_names` list can be used to populate UI elements, like
        the checklist of people to filter by.
    """
    print(f"Loading known face encodings from '{encodings_file}'...")
    if not os.path.exists(encodings_file):
        print(f"ERROR: Encodings file not found in '{os.path.dirname(encodings_file)}'. Please run enroll_faces.py first.")
        return None, None
    try:
        with open(encodings_file, "rb") as f: data = pickle.load(f)
        all_encodings, all_names = data.get("encodings", []), data.get("names", [])
        valid_encodings, valid_names = [], []
        # Data validation to handle potential corruption in the pickle file.
        for encoding, name in zip(all_encodings, all_names):
            if np.isfinite(encoding).all():
                valid_encodings.append(encoding); valid_names.append(name)
            else:
                print(f"Warning: Discarding a corrupted face encoding for '{name}'.")
        print(f"Successfully loaded {len(valid_encodings)} valid encodings for {len(set(valid_names))} people.")
        return valid_encodings, valid_names
    except Exception as e:
        print(f"ERROR: Could not load or parse encodings file: {e}")
        return None, None

def recognize_faces(image_path, known_encodings, known_names, mode='balanced'):
    """
    The core AI function. It takes a single image and identifies all known
    people within it.
    UI/UX:
    1.  The `mode` parameter ('fast', 'balanced', 'accurate') should be set via a
        UI dropdown or radio buttons, allowing the user to choose between
        speed and accuracy. 'Balanced' should be the default.
    2.  This is a CPU-intensive process. When a batch operation calls this
        function repeatedly, the UI must show a clear progress bar and
        potentially an estimated time remaining. The UI should remain responsive.
    """
    try:
        pil_image = Image.open(image_path).convert('RGB')
        
        # Resize image for faster processing. This is a key performance optimization.
        if pil_image.width > RESIZE_WIDTH_FOR_PROCESSING:
            ratio = RESIZE_WIDTH_FOR_PROCESSING / float(pil_image.width)
            new_height = int(float(pil_image.height) * ratio)
            pil_image = pil_image.resize((RESIZE_WIDTH_FOR_PROCESSING, new_height), Image.Resampling.LANCZOS)

        image = np.array(pil_image)
        
        # The 'model' parameter determines the face detection algorithm (CNN is more
        # accurate but much slower than HOG).
        face_locations = []
        if mode == 'fast': face_locations = face_recognition.face_locations(image, model='hog')
        elif mode == 'balanced': face_locations = face_recognition.face_locations(image, model='hog', number_of_times_to_upsample=2)
        else: face_locations = face_recognition.face_locations(image, model='cnn') # 'accurate' mode

        if not face_locations: return [] # No faces found in the image.

        # Create numerical encodings for the faces found in the current image.
        face_encodings = face_recognition.face_encodings(image, face_locations)
        
        found_names = set()
        for face_encoding in face_encodings:
            if not np.isfinite(face_encoding).all():
                logging.warning(f"Skipping a malformed face encoding in {os.path.basename(image_path)}.")
                continue
            # Compare the found faces with the library of known faces.
            matches = face_recognition.compare_faces(known_encodings, face_encoding, tolerance=FACE_RECOGNITION_TOLERANCE)
            name = "Unknown"
            if True in matches:
                # If there's a match, find the best one (closest distance).
                face_distances = face_recognition.face_distance(known_encodings, face_encoding)
                best_match_index = np.argmin(face_distances)
                if matches[best_match_index]:
                    name = known_names[best_match_index]
            found_names.add(name)
        return list(found_names)
    except Exception as e:
        logging.warning(f"Could not process faces in {os.path.basename(image_path)}: {e}")
        return None # Return None to signal an error occurred.

# ==============================================================================
#  Main Process Orchestration
# ==============================================================================

def start_organization_process(config):
    """
    This is the main function that orchestrates the entire sorting process
    after the user has finalized their settings and clicked "Start".
    UI/UX:
    1.  When this function is called, the main UI should switch to a "Processing" view.
    2.  This view must show a progress bar, a log of recent actions, and a "Cancel" button.
    3.  It first creates a temporary copy of the source folder. This is a critical
        safety feature to prevent data loss. The UI should display a message like
        "Creating a safe temporary copy of your photos..." during this step.
    4.  After completion, it should show a summary screen with statistics like
        "Successfully organized 1,532 photos." and provide a link to the log file.
    5.  The `finally` block ensures cleanup happens even if the user cancels or an
        error occurs.
    """
    source_dir, dest_dir = config["source_folder"], config["destination_folder"]
    ignore_list = config.get("ignore_list", [])
    os.makedirs(dest_dir, exist_ok=True)
    setup_logging(dest_dir)
    print("\n" + "="*54 + f"\n=== Starting Photo Organization Session ===\n" + f"Sorting Method: {config['sorting_options'].get('primary_sort', 'Date')}\n" + "="*54)
    if ignore_list: print(f"Ignoring subfolders: {', '.join(ignore_list)}")
    if not os.path.isdir(source_dir):
        print(f"ERROR: Source folder '{source_dir}' does not exist."); return
    temp_source_path = None
    try:
        timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        temp_source_name = f"_Source_Copy_{timestamp}"
        temp_source_path = os.path.join(os.path.dirname(dest_dir), temp_source_name)
        print("Creating a temporary copy of the source folder...")
        ignore_pattern = shutil.ignore_patterns(*ignore_list) if ignore_list else None
        shutil.copytree(source_dir, temp_source_path, ignore=ignore_pattern)
        print("Successfully created copy. Starting organization...")
        # This is the call to the core recursive processing function.
        process_all_folders_recursively(temp_source_path, dest_dir, config["sorting_options"])
    except Exception as e:
        print(f"\nERROR: An unexpected error occurred: {e}")
    finally:
        if temp_source_path and os.path.exists(temp_source_path):
            print("\nCleaning up temporary files...")
            try: shutil.rmtree(temp_source_path); print("Cleanup complete.")
            except Exception as e: print(f"ERROR: Could not delete temporary folder: {temp_source_path}.")


def get_date_path(date_obj):
    """Generates a 'YYYY/MM-MonthName' path from a datetime object."""
    if not date_obj: return None
    return os.path.join(date_obj.strftime('%Y'), f"{date_obj.strftime('%m')}-{date_obj.strftime('%B')}")

def get_people_dest_paths(base_dir, names):
    """
    Determines the correct destination folder(s) when sorting by people.
    It handles complex cases like photos with multiple known people.
    - Photo with just "John" -> /John/
    - Photo with "John" and "Jane" -> creates two copies: /John/With Others/ and /Jane/With Others/
    - Photo with "Unknown" -> /Unknown_Faces/
    """
    dest_paths, known_in_photo = [], sorted([n for n in names if n != "Unknown"])
    if not known_in_photo:
        dest_paths.append(os.path.join(base_dir, UNKNOWN_PEOPLE_FOLDER_NAME))
    elif len(names) == 1 and len(known_in_photo) == 1:
        # Solo photo of a known person.
        dest_paths.append(os.path.join(base_dir, known_in_photo[0]))
    else:
        # Group photo of known people. Each person gets a copy.
        for person in known_in_photo:
            dest_paths.append(os.path.join(base_dir, person, "With Others"))
    return dest_paths

def process_all_folders_recursively(root_folder, dest_dir, sort_options):
    """
    The heart of the application. It iterates through every file and decides
    where it should go based on the user's selected sorting options.
    UI/UX: The progress bar in the "Processing" view should be updated
    on each iteration of the main loop in this function. The text
    `Processing: {i+1}/{total_files}` is the source for this update.
    """
    files_to_process = [os.path.join(dp, f) for dp, _, fn in os.walk(root_folder) for f in fn if f.lower().endswith(SUPPORTED_EXTENSIONS)]
    total_files = len(files_to_process)
    if total_files == 0:
        print("No supported image files found."); return
    
    known_encodings, known_names = None, None
    sort_method = sort_options.get('primary_sort', 'Date')
    face_rec_mode = sort_options.get('face_mode', 'balanced') 

    # Load face models only if needed, saving startup time.
    if sort_method == 'People' or (sort_method == 'Hybrid' and (sort_options.get('base_sort') == 'People' or sort_options.get('custom_filter', {}).get('filter_type') == 'People')):
        known_encodings, known_names = load_face_encodings(ENCODINGS_FILE)
        if not known_encodings:
            # UI: Show an error and halt the process if face models are required but missing.
            print("Cannot sort by people without loaded encodings. Aborting."); return
        print(f"Using '{face_rec_mode.capitalize()}' mode for face recognition.")

    multiple_countries_found = False
    if sort_method == 'Location' or (sort_method == 'Hybrid' and sort_options.get('base_sort') == 'Location'):
         _, country_count, _ = get_metadata_overview(root_folder)
         multiple_countries_found = country_count > 1
    
    moved_count = 0

    # The main loop that processes each file.
    for i, source_path in enumerate(files_to_process):
        # UI: Update progress bar here.
        print(f"Processing: {i+1}/{total_files} - {os.path.basename(source_path)}", end='\r')
        
        original_subfolder = os.path.relpath(os.path.dirname(source_path), root_folder) if root_folder != os.path.dirname(source_path) else ''
        exif_data = get_exif_data(source_path)
        date_obj = get_date_taken(exif_data)
        # Create a new, clean filename. e.g., "2023-10-27_153000_IMG_1234.jpg"
        new_filename = f"{date_obj.strftime('%Y-%m-%d_%H%M%S')}_{os.path.basename(source_path)}" if date_obj else os.path.basename(source_path)

        # --- Face Recognition (if needed) ---
        names = []
        if sort_method in ['People', 'Hybrid']:
            if known_encodings:
                names = recognize_faces(source_path, known_encodings, known_names, mode=face_rec_mode)
                if names is None:
                    # An error occurred in face recognition for this file.
                    print(f"\nSkipping file due to recognition error: {os.path.basename(source_path)}"); continue
        
        # --- Hybrid Sort Logic ---
        # This block checks if the photo matches the special "hybrid" filter.
        is_custom_match = False
        if sort_method == 'Hybrid':
            custom_filter = sort_options.get('custom_filter', {})
            filter_type = custom_filter.get('filter_type')
            
            photo_location = get_location(exif_data)
            photo_date = date_obj

            if filter_type == 'People':
                is_custom_match = any(person in names for person in custom_filter.get('selected_people', []))
            elif filter_type == 'Location':
                if photo_location:
                    is_custom_match = photo_location in custom_filter.get('selected_locations', [])
            elif filter_type == 'Date':
                if photo_date:
                    filter_years = custom_filter.get('years', [])
                    filter_months = custom_filter.get('months', [])
                    year_match = not filter_years or photo_date.year in filter_years
                    month_match = not filter_months or photo_date.month in filter_months
                    is_custom_match = year_match and month_match

        # --- Destination Path Calculation ---
        dest_paths = []
        if is_custom_match:
            # If it matches the special filter, it goes into the special folder.
            base_path = os.path.join(dest_dir, sort_options.get("specific_folder_name", "Filtered"))
            filter_type = sort_options.get('custom_filter').get('filter_type')

            if filter_type == 'People':
                selected_people_in_photo = [p for p in sort_options['custom_filter'].get('selected_people', []) if p in names]
                for person in selected_people_in_photo:
                    dest_paths.append(os.path.join(base_path, person, "With Others") if len(names) > 1 else os.path.join(base_path, person))
            elif filter_type == 'Location':
                if sort_options['custom_filter'].get('sub_sort_by_date') and date_obj:
                     dest_paths = [os.path.join(base_path, get_date_path(date_obj))]
                else:
                     dest_paths = [base_path]
            else:
                dest_paths = [os.path.join(base_path, get_date_path(date_obj) if date_obj else UNKNOWN_DATE_FOLDER_NAME)]
        else:
            # If it doesn't match the special filter, use the "base" sorting method.
            base_sort = sort_options.get('base_sort', sort_method)
            if base_sort == 'People':
                dest_paths = get_people_dest_paths(dest_dir, names) if names else [os.path.join(dest_dir, NO_FACES_FOLDER_NAME)]
            elif base_sort == 'Date':
                dest_paths = [os.path.join(dest_dir, get_date_path(date_obj) if date_obj else UNKNOWN_DATE_FOLDER_NAME)]
            elif base_sort == 'Location':
                location_path = get_location(exif_data)
                if location_path:
                    loc_path_to_use = location_path
                    # Simplifies path if only one country is present (e.g., `State/City` instead of `USA/State/City`).
                    if not multiple_countries_found and os.path.sep in loc_path_to_use:
                        try: loc_path_to_use = os.path.join(*location_path.split(os.path.sep)[1:])
                        except IndexError: pass
                    target_folder = os.path.join(dest_dir, loc_path_to_use)
                    if sort_options.get('sub_sort_by_date') and date_obj:
                        target_folder = os.path.join(target_folder, get_date_path(date_obj))
                    dest_paths = [target_folder]
                else:
                    dest_paths = [os.path.join(dest_dir, UNKNOWN_LOCATION_FOLDER_NAME)]

        # --- File Operation Execution ---
        for j, dest_path in enumerate(dest_paths):
            # If a photo belongs in multiple 'people' folders, copy it for all
            # but the last one, then move the original.
            op = 'copy' if j < len(dest_paths) - 1 else 'move'
            final_target = os.path.join(dest_path, original_subfolder) if sort_options.get('maintain_hierarchy') else dest_path
            if handle_file_op(op, source_path, final_target, new_filename, date_obj) and op == 'move':
                moved_count += 1
            
    print("\n\n" + "-"*54 + "\nOrganization Complete\n" + "-"*54)
    print(f"Files successfully moved or copied: {moved_count}")
    print(f"A detailed log has been saved to 'photo_organizer.log'")

# ==============================================================================
#  User Interface Flow & Choices
# ==============================================================================
#  The functions below correspond to different screens or modal dialogs in the UI
#  that gather the user's choices before starting the main process.
# ==============================================================================

def get_face_rec_mode():
    """
    Asks the user to select a face recognition mode.
    UI/UX: Present this as three radio buttons or a dropdown menu:
    - Fast (Good speed, might miss some faces)
    - Balanced (Recommended: Best balance of speed and accuracy) -> Default
    - High Accuracy (Slowest, most thorough)
    A tooltip for each option explaining the trade-off would be beneficial.
    """
    print("\n--- Select Face Recognition Mode ---")
    print("  1. Fast          (Good speed, might miss some side-angle faces)")
    print("  2. Balanced      (Recommended: Best balance of speed and accuracy)")
    print("  3. High Accuracy (Slowest, most thorough scan)")
    mode_choice = input("Enter mode choice (1, 2, or 3) [Default: 2]: ").strip()
    if mode_choice == '1': return 'fast'
    if mode_choice == '3': return 'accurate' # Note: 'accurate' maps to the 'cnn' model in `recognize_faces`.
    return 'balanced'

def get_custom_filter_configuration(all_locations, all_dates, saved_filters):
    """
    Handles the UI flow for creating a "Hybrid Sort" or "Find" filter.
    UI/UX: This is a multi-step modal or a dedicated page.
    1.  Ask if the user wants to use a saved filter or create a new one.
    2.  If "New", ask to filter by (Date, Location, or People).
    3.  - If "People": Load known people (`load_face_encodings`) and display them
          in a searchable multi-select list or as a grid of checkboxes.
        - If "Location": Display the pre-scanned `all_locations` in a
          multi-select list. Add a checkbox "Sub-sort by date?".
        - If "Date": Provide input fields for "Years" and "Months" (e.g., text
          inputs that accept comma-separated values, or a calendar-style range picker).
    4.  Ask for a name for the special folder (e.g., "Family Vacation 2023").
    5.  Offer to save this filter configuration as a new preset.
    """
    while True:
        print("\n--- Custom Filter Configuration ---")
        use_saved = False
        if saved_filters:
            choice = input("Do you want to (U)se a saved filter or (C)reate a new one? ").lower().strip()
            if choice == 'u': use_saved = True
        
        if use_saved:
            print("Select a saved filter preset:")
            for i, name in enumerate(saved_filters, 1):
                filter_type = saved_filters[name].get('filter_type', 'Unknown')
                print(f"  {i}. {name} (Type: {filter_type})")
            filter_choice_str = input("Enter your choice: ").strip()
            if filter_choice_str.isdigit() and 1 <= int(filter_choice_str) <= len(saved_filters):
                name = list(saved_filters.keys())[int(filter_choice_str) - 1]
                return saved_filters[name].copy() 
            else:
                print("Invalid choice. Please create a new filter.")

        filter_choice = input("Filter by (1) Date, (2) Location, or (3) People? ").strip()
        current_filter = None
        
        if filter_choice == '3':
            known_encodings, known_names = load_face_encodings(ENCODINGS_FILE)
            if not known_names:
                print("Could not load face data. Please enroll faces first or check file path."); continue
            known_people = sorted(list(set(known_names)))
            print("Select people to filter for:")
            for i, name in enumerate(known_people, 1): print(f"  {i}. {name}")
            print(f"  {len(known_people) + 1}. All Enrolled People")
            while True:
                try:
                    choices_str = input("Enter the number(s) of the people to filter for (e.g., 1, 3): ").strip()
                    if str(len(known_people) + 1) in choices_str:
                        selected_people = known_people; break
                    selected_indices = [int(c.strip()) - 1 for c in choices_str.split(',')]
                    if all(0 <= i < len(known_people) for i in selected_indices):
                        selected_people = [known_people[i] for i in selected_indices]; break
                    else: print("Invalid number entered.")
                except ValueError: print("Invalid input. Please enter numbers separated by commas.")
            current_filter = {'filter_type': 'People', 'selected_people': selected_people}
        
        elif filter_choice == '2':
            if not all_locations:
                print("No photos with location data were found. Cannot create a location filter."); continue
            sorted_locations = sorted(list(all_locations))
            print("Found the following locations:")
            for i, loc in enumerate(sorted_locations, 1): print(f"  {i}. {loc.replace(os.path.sep, '/')}")
            while True:
                try:
                    choices_str = input("Enter the number(s) of the locations to filter for (e.g., 1, 3): ").strip()
                    selected_indices = [int(c.strip()) - 1 for c in choices_str.split(',')]
                    if all(0 <= i < len(sorted_locations) for i in selected_indices):
                        selected_locations = [sorted_locations[i] for i in selected_indices]; break
                    else: print("Invalid number entered.")
                except ValueError: print("Invalid input. Please enter numbers separated by commas.")
            sub_sort_choice = input("Sub-sort by Year/Month inside the filtered location folder? (y/n): ").lower().strip()
            current_filter = {'filter_type': 'Location', 'selected_locations': selected_locations, 'sub_sort_by_date': sub_sort_choice == 'y'}
        
        elif filter_choice == '1':
            while True:
                print("\n--- Define Your Date Filter (leave blank for no filter) ---")
                try:
                    years_input = input("Enter specific years (e.g., 2022, 2024): ").strip()
                    years = [] if not years_input else [int(y.strip()) for y in years_input.split(',')]
                    
                    months_input = input("Enter specific months as numbers 1-12 (e.g., 6, 7): ").strip()
                    months = [] if not months_input else [int(m.strip()) for m in months_input.split(',')]
                    
                    if not all(1 <= m <= 12 for m in months):
                        print("Invalid month input. Please enter numbers between 1 and 12."); continue
                    
                    current_filter = {'filter_type': 'Date', 'years': years, 'months': months}
                    break
                except ValueError:
                    print("Invalid input. Please enter numbers separated by commas."); continue
        
        else:
            print("Invalid choice."); continue

        if current_filter:
            specific_name = input("Enter name for the special filtered folder: ").strip()
            current_filter['specific_folder_name'] = specific_name if specific_name else "My Custom Filter"
            
            save_choice = input("Save this new filter as a preset? (y/n): ").lower().strip()
            if save_choice == 'y':
                preset_name = input("Enter a name for this filter preset: ").strip()
                saved_filters[preset_name] = current_filter
                save_presets(FILTERS_FILE_NAME, saved_filters)
            return current_filter

def get_find_filter_configuration(all_locations, all_dates):
    """
    Gathers multiple filter criteria for the 'Find & Group' mode.
    UI/UX: This should be a dynamic form where the user can add multiple
    filter criteria. For example, a user could click "+ Add Filter" and
    choose "Date", then add another for "People". This allows for combined
    queries like "Find all photos of 'John' taken in 'Paris' during '2022'".
    """
    find_filters = {}
    
    # UI: Each of these `if` blocks corresponds to a section of the dynamic form.
    if input("Add a DATE filter? (y/n): ").lower().strip() == 'y':
        print("\n--- Define Your Date Filter (leave blank for no filter) ---")
        try:
            years_input = input("Enter specific years (e.g., 2022, 2024): ").strip()
            years = [] if not years_input else [int(y.strip()) for y in years_input.split(',')]
            months_input = input("Enter specific months as numbers 1-12 (e.g., 6, 7): ").strip()
            months = [] if not months_input else [int(m.strip()) for m in months_input.split(',')]
            if not all(1 <= m <= 12 for m in months):
                print("Invalid month. Skipping date filter.")
            else:
                find_filters['Date'] = {'years': years, 'months': months}
        except ValueError:
            print("Invalid input. Skipping date filter.")

    if input("\nAdd a LOCATION filter? (y/n): ").lower().strip() == 'y':
        if not all_locations: print("No location data available in source photos.")
        else:
            sorted_locations = sorted(list(all_locations))
            print("Found the following locations:")
            for i, loc in enumerate(sorted_locations, 1): print(f"  {i}. {loc.replace(os.path.sep, '/')}")
            try:
                choices_str = input("Enter the number(s) of the locations (e.g., 1, 3): ").strip()
                selected_indices = [int(c.strip()) - 1 for c in choices_str.split(',')]
                if all(0 <= i < len(sorted_locations) for i in selected_indices):
                    find_filters['Location'] = {'selected_locations': [sorted_locations[i] for i in selected_indices]}
                else: print("Invalid number. Skipping location filter.")
            except ValueError: print("Invalid input. Skipping location filter.")

    if input("\nAdd a PEOPLE filter? (y/n): ").lower().strip() == 'y':
        known_encodings, known_names = load_face_encodings(ENCODINGS_FILE)
        if known_names:
            known_people = sorted(list(set(known_names)))
            print("Select people to find:")
            for i, name in enumerate(known_people, 1): print(f"  {i}. {name}")
            try:
                choices_str = input("Enter the number(s) of the people (e.g., 1, 3): ").strip()
                selected_indices = [int(c.strip()) - 1 for c in choices_str.split(',')]
                if all(0 <= i < len(known_people) for i in selected_indices):
                    find_filters['People'] = {
                        'selected_people': [known_people[i] for i in selected_indices],
                        'known_encodings': known_encodings,
                        'known_names': known_names,
                        'face_mode': get_face_rec_mode()
                    }
                else: print("Invalid number. Skipping people filter.")
            except ValueError: print("Invalid input. Skipping people filter.")
        else:
            print("Could not load face data to create a people filter.")
            
    if not find_filters: return None

    folder_name = input("\nEnter a name for the folder to store found photos: ").strip()
    find_filters['destination_folder_name'] = folder_name if folder_name else "Find_Results"
    return find_filters

def start_find_process(config):
    """
    Orchestrates the 'Find & Group' process. Unlike the main organization,
    this function *only copies* matching files into a new folder.
    UI/UX: Similar to `start_organization_process`, this requires a
    "Processing" screen with a progress bar and a final summary screen
    showing how many matching photos were found and copied.
    """
    source_dir = config["source_folder"]
    base_dest_dir = config["destination_folder"]
    find_config = config["find_config"]
    
    target_folder = os.path.join(base_dest_dir, find_config['destination_folder_name'])
    os.makedirs(target_folder, exist_ok=True)
    setup_logging(target_folder)
    print("\n" + "="*54 + "\n=== Starting Find & Group Session ===\n" + "="*54)

    files_to_process = [os.path.join(dp, f) for dp, _, fn in os.walk(source_dir) for f in fn if f.lower().endswith(SUPPORTED_EXTENSIONS)]
    total_files = len(files_to_process)
    if total_files == 0:
        print("No supported image files found."); return
    
    found_count = 0
    people_filter = find_config.get('People')

    for i, source_path in enumerate(files_to_process):
        # UI: Update progress bar.
        print(f"Searching: {i+1}/{total_files} - {os.path.basename(source_path)}", end='\r')
        exif_data = get_exif_data(source_path)
        
        match = True
        
        # Sequentially apply all defined filters. If any filter fails,
        # the photo is not a match.
        if 'Date' in find_config:
            date_obj = get_date_taken(exif_data)
            if not date_obj or (find_config['Date']['years'] and date_obj.year not in find_config['Date']['years']) or \
               (find_config['Date']['months'] and date_obj.month not in find_config['Date']['months']):
                match = False
        
        if match and 'Location' in find_config:
            loc = get_location(exif_data)
            if not loc or loc not in find_config['Location']['selected_locations']:
                match = False
        
        if match and people_filter:
            names = recognize_faces(source_path, people_filter['known_encodings'], people_filter['known_names'], people_filter['face_mode'])
            if not names or not any(p in names for p in people_filter['selected_people']):
                match = False

        if match:
            # If all filters passed, copy the file.
            date_obj = get_date_taken(exif_data)
            new_filename = f"{date_obj.strftime('%Y-%m-%d_%H%M%S')}_{os.path.basename(source_path)}" if date_obj else os.path.basename(source_path)
            if handle_file_op('copy', source_path, target_folder, new_filename, date_obj):
                found_count += 1
    
    print("\n\n" + "-"*54 + "\nFind Complete\n" + "-"*54)
    print(f"Found and copied {found_count} matching photos to '{target_folder}'")
    print(f"A detailed log has been saved to '{os.path.join(target_folder, 'photo_organizer.log')}'")


def main():
    """
    The main entry point that drives the user through the application's flow.
    UI/UX: This function defines the primary navigation of the app.
    1.  Welcome Screen -> `get_path_configuration()`
    2.  Folder Options (Ignore list, hierarchy) -> Displayed after path selection.
    3.  Main Menu -> Present the three main modes as large, clear cards or buttons:
        - "Standard Sort"
        - "Hybrid Sort"
        - "Find & Group"
    4.  Based on the choice, it calls the appropriate configuration function
        before finally starting the corresponding process.
    """
    print("--- AI-Powered Local Photo Organizer ---")
    source, dest = get_path_configuration()

    # UI: After selecting a source folder, list its subdirectories in a
    # checklist, allowing the user to ignore specific ones.
    ignore_list = []
    try:
        subfolders = [d for d in os.listdir(source) if os.path.isdir(os.path.join(source, d))]
        if subfolders:
            print("\nFound the following subfolders:")
            for folder in subfolders: print(f"  - {folder}")
            ignore_input = input("Enter any subfolder names to ignore, separated by commas (or press Enter to skip): ").strip()
            if ignore_input:
                ignore_list = [name.strip() for name in ignore_input.split(',')]
    except FileNotFoundError:
        print(f"Error: Source directory '{source}' not found. Exiting.")
        return


    # UI: A simple toggle switch or checkbox: "Maintain original subfolder structure".
    hierarchy_choice = input("\nMaintain original subfolder structure in destination? (y/n): ").lower().strip()
    maintain_hierarchy = hierarchy_choice == 'y'

    should_run_organization = False

    while True:
        print("\n--- Main Menu ---")
        print("  1. Standard Sort (Organize all photos)")
        print("  2. Hybrid Sort (Create a special folder for some, sort the rest)")
        print("  3. Find & Group Photos (Copy photos matching multiple criteria)")
        choice = input("Enter your choice (1, 2, or 3): ").strip()
        
        sort_options = {}

        if choice in ['2', '3']:
            # For more complex modes, a metadata scan is needed first.
            # UI: Show a loading indicator: "Preparing filters by scanning metadata..."
            print("\n--- Preparing Filters: Scanning metadata... ---")
            all_locations, _, all_dates = get_metadata_overview(source, ignore_list)
            
            if choice == '2':
                print("\n--- Hybrid Sort Setup ---")
                # UI: A set of radio buttons for the "rest of the photos".
                base_choice = input("How should the REST of the photos be sorted? (1) By Date, (2) By Location, (3) By People: ").strip()
                if base_choice not in ['1', '2', '3']: print("Invalid choice."); continue
                
                base_sort_map = {'1': 'Date', '2': 'Location', '3': 'People'}
                base_sort = base_sort_map[base_choice]
                
                saved_filters = load_presets(FILTERS_FILE_NAME)
                custom_filter = get_custom_filter_configuration(all_locations, all_dates, saved_filters)
                
                if custom_filter:
                    sort_options = {
                        'primary_sort': 'Hybrid', 'base_sort': base_sort,
                        'custom_filter': custom_filter,
                        'specific_folder_name': custom_filter.get("specific_folder_name")
                    }
                    if base_sort == 'People' or custom_filter.get('filter_type') == 'People':
                        sort_options['face_mode'] = get_face_rec_mode()
                    
                    should_run_organization = True
                    break

            elif choice == '3':
                print("\n--- Find & Group Setup ---")
                find_config = get_find_filter_configuration(all_locations, all_dates)
                if find_config:
                    config = {
                        "source_folder": source, 
                        "destination_folder": dest,
                        "find_config": find_config
                    }
                    start_find_process(config)
                else:
                    print("No filters selected. Returning to main menu.")
                
                should_run_organization = False
                break

        elif choice == '1':
            print("\n--- Standard Sort Options ---")
            std_choice = input("Sort all photos by (1) Date, (2) Location, or (3) People? ").strip()
            if std_choice == '1': 
                sort_options = {'primary_sort': 'Date'}
            elif std_choice == '2':
                sub_sort = input("Sub-sort by Year/Month inside location folders? (y/n): ").lower().strip()
                sort_options = {'primary_sort': 'Location', 'sub_sort_by_date': sub_sort == 'y'}
            elif std_choice == '3': 
                sort_options = {'primary_sort': 'People', 'face_mode': get_face_rec_mode()}
            else:
                print("Invalid choice."); continue

            should_run_organization = True
            break
        
        else:
            print("Invalid choice.")
    
    if should_run_organization:
        sort_options['maintain_hierarchy'] = maintain_hierarchy
        config = {"source_folder": source, "destination_folder": dest, "sorting_options": sort_options, "ignore_list": ignore_list}
        start_organization_process(config)

if __name__ == "__main__":
    main()