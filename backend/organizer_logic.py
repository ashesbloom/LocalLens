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

# ── Smart Album Suggestions: Passive metadata capture ─────────────────────
# Imported lazily so metadata_store failure never breaks the main organizer.
try:
    from metadata_store import metadata_store as _metadata_store
except Exception:
    _metadata_store = None  # Metadata capture disabled gracefully if store unavailable
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
import tempfile
from multiprocessing import Pool
import time


# --- Custom Exception Import ---
from exceptions import OperationAbortedError

# --- Face pipeline ---
# Shared with enrollment_logic so the gallery and the query encodings are
# produced by identical image handling.
import face_engine

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

# Defined in face_engine so the enroller can use the same list without importing
# this module. Re-exported under the name the rest of the app already imports.
SUPPORTED_EXTENSIONS = face_engine.SUPPORTED_EXTENSIONS

UNKNOWN_DATE_FOLDER_NAME = "Unknown_Date"
UNKNOWN_LOCATION_FOLDER_NAME = "Unknown_Location"
UNKNOWN_PEOPLE_FOLDER_NAME = "Unknown_Faces"
NO_FACES_FOLDER_NAME = "No_Faces_Found"

# Owned by face_engine now (the enroller needs the same value). Re-exported here
# because this module has always been the place other code looked for it.
# RESIZE_WIDTH_FOR_PROCESSING is gone: the engine scales by long edge through a
# ladder of passes instead of forcing every image to one fixed width.
FACE_RECOGNITION_TOLERANCE = face_engine.FACE_RECOGNITION_TOLERANCE

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

def _norm(p):
    """
    Canonical form for ignore-path comparison. abspath() also collapses trailing
    separators and redundant components, so '~/Photos', 'Photos/' and relative paths
    all reduce to the same string in one call.

    ponytail: normcase is a no-op on POSIX, so two paths differing only in case are
    not matched on macOS. Deliberate — forcing .lower() would ignore the WRONG folder
    on a case-sensitive APFS volume. Every real ignore_list value comes from
    build_folder_tree(), so case already matches exactly. Revisit only if paths start
    arriving from somewhere that retypes them.
    """
    return os.path.normcase(os.path.abspath(os.path.expanduser(p)))


def effective_ignore_set(source_dir, dest_dir, ignore_list):
    """
    Normalised ignore set, plus dest_dir when it nests strictly inside source_dir.

    Without that guard, sorting into a subfolder of the source makes the job ingest
    its own output on the next run. Not added when dest == source, which would
    exclude everything.

    Every enumeration that knows both paths must build its set here, so the
    total_files precount and the copy loop can never disagree on scope.
    """
    ignore_set = {_norm(p) for p in (ignore_list or [])}
    if source_dir and dest_dir:
        s, d = _norm(source_dir), _norm(dest_dir)
        try:
            if d != s and os.path.commonpath([s, d]) == s:
                ignore_set.add(d)
        except ValueError:
            pass  # Different Windows drives — cannot nest.
    return ignore_set


def _is_ignored(path, ignore_set):
    """
    True when path IS an ignored directory or lives inside one.
    `ignore_set` must already be normalised (see effective_ignore_set).

    Used by the post-move source cleanup, which deletes files — both sides of the
    comparison must be normalised there or an ignored subtree could be destroyed.
    """
    p = _norm(path)
    for ig in ignore_set:
        if p == ig:
            return True
        try:
            if os.path.commonpath([p, ig]) == ig:
                return True
        except ValueError:
            continue  # Different Windows drives — cannot be inside.
    return False


def walk_ignoring(root, ignore_set):
    """
    os.walk that prunes ignored subtrees, instead of only skipping their direct files.

    `ignore_set` holds full paths — the same values build_folder_tree() puts in each
    node's "path", which is what the UI sends back as the ignore_list.

    A bare `if dirpath in ignore_set: continue` is not enough: os.walk still descends
    into the ignored folder's children, whose dirpaths are not in the set. Sorted output
    always nests (Sorted_By_People/Mayank/...), so an ignored folder holds zero direct
    files and such a filter excludes nothing at all.
    """
    # Normalise here rather than trusting callers: a single trailing slash or '~' in
    # the incoming list would otherwise silently disable the whole filter. _norm is
    # idempotent, so an already-normalised set costs nothing.
    ignore_set = {_norm(p) for p in ignore_set}
    for dirpath, dirnames, filenames in os.walk(root):
        if _norm(dirpath) in ignore_set:
            # Only reachable when the walk root itself is ignored — ignored children are
            # pruned below before os.walk can descend into them. Stop the whole subtree.
            dirnames[:] = []
            continue
        # Slice-assign: os.walk reads back this same list object to decide where to
        # descend, so rebinding the name (dirnames = ...) would silently do nothing.
        dirnames[:] = [d for d in dirnames if _norm(os.path.join(dirpath, d)) not in ignore_set]
        # Yield the raw dirpath — callers join real filenames onto it.
        yield dirpath, dirnames, filenames


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
    # ignore_list holds full paths (see walk_ignoring / build_folder_tree).
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
    for dirpath, dirnames, filenames in walk_ignoring(source_dir, ignore_set):
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

# --- Space-sharing copies ---------------------------------------------------
# A People sort files one group photo under every person in it, so a photo with
# four enrolled faces used to be written to disk four times. In 'copy' mode the
# originals stay too, which made the sorted output a second full copy of the
# library. On a nearly-full volume that is the difference between the feature
# being usable and not.
#
# APFS can do better: clonefile(2) creates a genuinely independent file that
# shares unchanged blocks with its source. Deleting or editing either side leaves
# the other untouched - it is what Finder's "Duplicate" does - so the semantics
# are identical to a copy and only the bytes are saved.
#
# Hardlinks are deliberately NOT used. They would save the same space, but every
# link shares one inode, so the os.utime() call below (which stamps each file with
# its EXIF date) would apply to all of them at once, and a user editing one copy
# would silently change the others.
#
# Measuring this: `du` and Finder are the WRONG instruments. APFS does not expose
# per-file block sharing, so four clones of a 20 MB photo still report 80 MB
# there. Volume free space is the truth. Measured on this machine with
# os.statvfs across four 60 MB files: clones consumed 0 MB, real copies consumed
# 240 MB. Do not "fix" the counters to agree with du.

_clonefile = None
_clonefile_checked = False

# Reset per job by _core_processing_loop. Safe as module state because the app
# runs a single job at a time (there is one current_job_state in main.py).
# ponytail: module-level counter. If concurrent jobs ever land, thread these
# through handle_file_op's return value instead.
_space_stats = {'cloned': 0, 'copied': 0, 'bytes_shared': 0}


def _get_clonefile():
    """Return macOS clonefile(2) via ctypes, or None where it is unavailable."""
    global _clonefile, _clonefile_checked
    if _clonefile_checked:
        return _clonefile
    _clonefile_checked = True
    if sys.platform != 'darwin':
        return None
    try:
        import ctypes
        import ctypes.util
        libc = ctypes.CDLL(ctypes.util.find_library('c'), use_errno=True)
        fn = libc.clonefile
        fn.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint32]
        fn.restype = ctypes.c_int
        _clonefile = fn
    except Exception as e:
        logging.info(f"clonefile unavailable, copies will be full byte copies: {e}")
        _clonefile = None
    return _clonefile


def reset_space_stats():
    """Clear the per-job clone counters."""
    _space_stats.update({'cloned': 0, 'copied': 0, 'bytes_shared': 0})


def format_space_savings():
    """One clause describing what cloning saved, or '' when it saved nothing."""
    cloned = _space_stats['cloned']
    if not cloned:
        return ""
    saved = _space_stats['bytes_shared']
    if saved >= 1024 ** 3:
        size = f"{saved / 1024 ** 3:.2f} GB"
    else:
        size = f"{saved / 1024 ** 2:.0f} MB"
    return f" {cloned} shared on disk instead of duplicated, saving {size}."


def copy_preserving_space(source_path, destination_path):
    """
    Copy a file, sharing its blocks with the original where the filesystem allows.

    Returns True when the file was cloned, False when a full byte copy was made.
    A clone failure is never an error: EXDEV (different volume), ENOTSUP (not
    APFS), Windows and Linux all fall through to shutil.copy2, which is exactly
    the previous behaviour. Only a genuine copy failure raises.

    clonefile carries timestamps, xattrs, ACLs and flags itself, so this is at
    least as faithful as copy2 - and because a clone is its own inode, the
    os.utime() stamp applied afterwards still affects only this file.
    """
    fn = _get_clonefile()
    if fn is not None:
        try:
            if fn(os.fsencode(source_path), os.fsencode(destination_path), 0) == 0:
                _space_stats['cloned'] += 1
                try:
                    _space_stats['bytes_shared'] += os.path.getsize(destination_path)
                except OSError:
                    pass
                return True
        except Exception:
            pass  # fall through to a real copy

    shutil.copy2(source_path, destination_path)
    _space_stats['copied'] += 1
    return False


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
        if op == 'copy': copy_preserving_space(source_path, destination_path)
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

def recognize_faces(image_path, known_encodings, known_names, mode='balanced'):
    """
    The core AI function. It takes a single image and identifies all known
    people within it, with selectable accuracy modes.

    The implementation now lives in face_engine, which the enroller shares so both
    sides see the same picture (upright, same scale). This wrapper keeps the old
    contract exactly: a list of names, [] when the photo has no face, None when
    the file could not be decoded.
    """
    return face_engine.recognize(image_path, known_encodings, known_names, mode)


# ==============================================================================
#  Parallel face recognition
# ==============================================================================
#
# Detection is the expensive part of a People sort (0.15-1s per photo) and it used
# to run one photo at a time, inline, on a single core. It is also pure compute
# with no shared state, which makes it the one part of the loop that parallelises
# cleanly. Everything that touches the filesystem stays in the main loop, in the
# same order as before, so the rollback manifest and progress messages are
# unaffected.

def _recognize_all(paths, mode, known_encodings, known_names,
                   update_callback, cancellation_event, analytics, cache=None,
                   abort_message="Sorting operation cancelled by user."):
    """
    Recognise faces in every photo up front, in parallel.

    Returns (names_by_path, diagnostics). names_by_path[path] is a list of names,
    [] when the photo has no face, or None when the file could not be decoded -
    the same three-way answer recognize_faces gives for a single file.

    Doing this as one pass before the file operations, rather than inline per
    photo, is what allows a Pool: the pool lives and dies inside this function, so
    an abort or an error tears the workers down here instead of leaving them
    orphaned in the middle of a move. The file operations that follow are
    untouched and still run one photo at a time, in the original order.

    Only this function touches the cache, and only from the parent process, so
    there is a single writer and no lock contention.
    """
    names_by_path = {}
    diagnostics = {
        'total': len(paths), 'with_faces': 0, 'no_face': 0, 'unreadable': 0,
        'cached': 0, 'recovered_by_rescale': 0, 'recovered_by_rotation': 0,
        'recovered_by_cnn': 0,
    }
    if not paths:
        return names_by_path, diagnostics

    matrix, gallery_names = face_engine.build_gallery(known_encodings, known_names)

    cached = {}
    if cache is not None:
        try:
            cached = cache.face_cache_get_many(
                paths, face_engine.ENGINE_VERSION, face_engine.ladder_length(mode)
            )
        except Exception as e:
            logging.warning(f"Face cache unavailable, scanning everything: {e}")
            cached = {}

    def record(path, status, names, pass_used):
        names_by_path[path] = names
        if status == face_engine.UNREADABLE:
            diagnostics['unreadable'] += 1
            logging.warning(f"Could not read '{os.path.basename(path)}' to look for faces.")
        elif status == face_engine.UNAVAILABLE:
            # dlib is missing entirely. Counted as unreadable rather than as a
            # photo with faces, so the summary does not overstate what was found.
            diagnostics['unreadable'] += 1
        elif status == face_engine.NO_FACE:
            diagnostics['no_face'] += 1
        else:
            diagnostics['with_faces'] += 1
            # Ask the ladder what the winning pass actually was. Counting by pass
            # number got this wrong: in accurate mode pass 5 is the CNN scan, so a
            # `>= 3` rule reported deep-scan finds as rotated photos.
            kind = face_engine.pass_kind(mode, pass_used)
            if kind == 'rescale':
                diagnostics['recovered_by_rescale'] += 1
            elif kind == 'rotation':
                diagnostics['recovered_by_rotation'] += 1
            elif kind == 'cnn':
                diagnostics['recovered_by_cnn'] += 1

    for path, entry in cached.items():
        names = None
        if entry['status'] == face_engine.OK and entry['encodings']:
            names = face_engine.match_names(entry['encodings'], matrix, gallery_names)
        elif entry['status'] == face_engine.NO_FACE:
            names = []
        record(path, entry['status'], names, entry['pass_used'])
        diagnostics['cached'] += 1

    pending = [p for p in paths if p not in cached]
    if cached:
        logging.info(f"Face cache: {len(cached)} of {len(paths)} photos already encoded.")
    if not pending:
        update_callback(70, f"Recognised faces from cache for all {len(paths)} photos.", "running", analytics)
        return names_by_path, diagnostics

    # One worker per spare core, except in modes that can reach the CNN pass -
    # those are capped, because parallel CNN detections were measured exhausting
    # system memory, and an out-of-memory kill loses the entire job.
    # Below a handful of photos the process startup (spawn re-imports dlib in
    # every worker) costs more than it saves.
    worker_count = face_engine.safe_worker_count(mode)
    use_pool = worker_count > 1 and len(pending) >= 4

    def consume(index, result):
        if 'error' in result:
            logging.warning(
                f"Face recognition failed for '{os.path.basename(result['path'])}': {result['error']}"
            )
        elif cache is not None and result['status'] in (face_engine.OK, face_engine.NO_FACE):
            cache.face_cache_put(result['path'], face_engine.ENGINE_VERSION, result)
        record(result['path'], result['status'], result['names'], result['pass_used'])

        # Recognition dominates a People sort, so it owns most of the progress bar.
        progress = 10 + int((index + 1) / len(pending) * 60)
        update_callback(progress, f"Looking for faces in {os.path.basename(result['path'])}",
                        "running", analytics)

    if not use_pool:
        face_engine.worker_init(mode, known_encodings, known_names)
        for index, path in enumerate(pending):
            if cancellation_event and cancellation_event.is_set():
                raise OperationAbortedError(abort_message)
            consume(index, face_engine.worker(path))
    else:
        with Pool(processes=worker_count,
                  initializer=face_engine.worker_init,
                  initargs=(mode, known_encodings, known_names)) as pool:
            results = pool.imap(face_engine.worker, pending, chunksize=1)
            for index, result in enumerate(results):
                if cancellation_event and cancellation_event.is_set():
                    pool.terminate()
                    pool.join()
                    raise OperationAbortedError(abort_message)
                consume(index, result)

    return names_by_path, diagnostics


def format_face_diagnostics(diagnostics):
    """One-line summary of what the face pass actually did, for the job log."""
    parts = [
        f"{diagnostics['total']} photos scanned",
        f"{diagnostics['with_faces']} with faces",
        f"{diagnostics['no_face']} without",
    ]
    if diagnostics['unreadable']:
        parts.append(f"{diagnostics['unreadable']} unreadable")
    if diagnostics['recovered_by_rescale']:
        parts.append(f"{diagnostics['recovered_by_rescale']} found only at higher resolution")
    if diagnostics['recovered_by_rotation']:
        parts.append(f"{diagnostics['recovered_by_rotation']} found only after rotating")
    if diagnostics.get('recovered_by_cnn'):
        parts.append(f"{diagnostics['recovered_by_cnn']} found only by the deep scan")
    if diagnostics['cached']:
        parts.append(f"{diagnostics['cached']} reused from cache")
    return "Face scan: " + ", ".join(parts) + "."

# ==============================================================================
#  Main Process Orchestration - Merged and Refactored
# ==============================================================================

def get_date_path(date_obj):
    if not date_obj: return UNKNOWN_DATE_FOLDER_NAME
    return os.path.join(date_obj.strftime('%Y'), f"{date_obj.strftime('%m')}-{date_obj.strftime('%B')}")

def get_people_dest_paths(base_dir, names):
    """
    Determines the correct destination folder(s) when sorting by people.
    Only counts known enrolled people for "With Others" decision - unknown faces are ignored.
    """
    dest_paths, known_in_photo = [], sorted([n for n in names if n != "Unknown"])
    if not known_in_photo:
        return [os.path.join(base_dir, UNKNOWN_PEOPLE_FOLDER_NAME)]
    # FIX: Only check known_in_photo count, not names count (which includes "Unknown")
    # This ensures photos with 1 known person + unknown strangers go to PersonName/, not "With Others"
    if len(known_in_photo) == 1:
        return [os.path.join(base_dir, known_in_photo[0])]
    # Multiple known people in photo - put in "With Others" subfolder for each
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
    face_mode = (find_config.get("face_mode") or "fast").lower()
    quality_map = {"fast": "Fast", "accurate": "Accurate"}
    quality_metric = quality_map.get(face_mode, "Fast")
    initial_analytics = {"quality": quality_metric, "scan_rate": "0.0", "data_flow": "0.0"}
    update_callback(0, "Preparing to search for photos...", "running", initial_analytics)

    # Find & Group is always a copy, so it benefits from cloning too.
    reset_space_stats()

    ignore_set = effective_ignore_set(source_dir, base_dest_dir, ignore_list)
    files_to_process = []
    for dirpath, dirnames, filenames in walk_ignoring(source_dir, ignore_set):
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

    # --- Face recognition: one parallel pass, same as the sorter -------------
    # Find & Group defaults to the cheapest face mode and still ran it one photo
    # at a time, which made a People search over a large folder the slowest thing
    # in the app.
    face_names = {}
    if known_encodings:
        face_names, face_diagnostics = _recognize_all(
            files_to_process, face_mode, known_encodings, known_names,
            update_callback, cancellation_event, initial_analytics,
            cache=_metadata_store,
            abort_message="Find & Group operation cancelled by user.",
        )
        summary = format_face_diagnostics(face_diagnostics)
        logging.info(summary)
        update_callback(70, summary, "running", initial_analytics)

    search_progress_base = 70 if known_encodings else 10
    search_progress_span = 25 if known_encodings else 85

    # --- NEW: Real-time analytics tracking ---
    start_time = time.time()
    processed_files_count = 0
    processed_size_mb = 0.0

    for i, source_path in enumerate(files_to_process):
        progress = search_progress_base + int(((i + 1) / total_files) * search_progress_span)

        # --- Analytics Calculation ---
        analytics = {"quality": quality_metric, "scan_rate": "0.0", "data_flow": "0.0"}
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
            # Recognised in the parallel pass above. None (unreadable) and []
            # (no face) both fail the filter, as they did before.
            names = face_names.get(source_path)
            if not names or not any(p in names for p in find_config['people']):
                match = False

        if match:
            date_obj = get_date_taken(exif_data)
            new_filename = f"{date_obj.strftime('%Y-%m-%d_%H%M%S')}_{os.path.basename(source_path)}" if date_obj else os.path.basename(source_path)
            destination_path = handle_file_op(operation_mode, source_path, target_folder, new_filename, date_obj)
            if destination_path:
                found_count += 1
                verb = "copied" if operation_mode == "copy" else "moved"
                logging.info(f"Found match: {verb.capitalize()} '{os.path.basename(source_path)}' to '{target_folder_name}'")
                update_callback(progress, f"{verb.capitalize()} '{os.path.basename(source_path)}' to '{destination_path}'", "running", analytics)

    verb = "copied" if operation_mode == "copy" else "moved"
    completion_message = f"Search complete. Found and {verb} {found_count} matching photos to '{target_folder_name}'."
    completion_message += format_space_savings()
    if found_count == 0:
        completion_message = "Search complete. No photos matched the specified criteria."
        
    logging.info(completion_message)
    update_callback(100, completion_message, "complete", {**initial_analytics, "files_written": found_count})
    return found_count


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
    if filter_type:  # Normalize: 'people' → 'People', 'location' → 'Location', etc.
        filter_type = filter_type.title()
    
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
            # FIX: Count only known people (exclude "Unknown") for "With Others" decision
            known_in_photo = [n for n in names if n != "Unknown"]
            for person in selected_people_in_photo:
                # If there are multiple KNOWN people in photo, put in "With Others" subfolder
                if len(known_in_photo) > 1:
                    dest_paths.append(os.path.join(base_path, person, "With Others"))
                else:
                    dest_paths.append(os.path.join(base_path, person))
        
        elif filter_type == 'Location':
            # The UI doesn't have a "sub-sort by date" for the custom filter, so we place it in the root of the special folder.
            # This matches the original script's logic when that option is false.
            dest_paths.append(base_path)

        else: # Date
            # For a date filter, it's logical to sub-sort by date within the special folder.
            dest_paths.append(os.path.join(base_path, get_date_path(date_obj) if date_obj else UNKNOWN_DATE_FOLDER_NAME))

    # Always add the base sort destination path
    base_sort_method = sort_options.get('base_sort', 'Date').title()  # Normalize casing
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
    ignore_set = effective_ignore_set(work_dir, dest_dir, ignore_list)
    # Optional: only process files newer than this Unix timestamp (used by the scheduler daemon)
    mtime_cutoff = sort_options.get("mtime_cutoff", None)
    specific_files = sort_options.get("specific_files", None)
    
    files_to_process = []

    if specific_files is not None:
        # Use the specific files provided (e.g. from watchdog or daemon)
        for fp in specific_files:
            if os.path.exists(fp) and fp.lower().endswith(SUPPORTED_EXTENSIONS):
                files_to_process.append(fp)
    else:
        # NOTE: on the cross-drive 'move' path work_dir is the temp copy, whose paths are
        # not the ones in ignore_set — but copytree(ignore=...) already excluded them there.
        for dirpath, dirnames, filenames in walk_ignoring(work_dir, ignore_set):
            for f in filenames:
                if f.lower().endswith(SUPPORTED_EXTENSIONS):
                    fp = os.path.join(dirpath, f)
                    if mtime_cutoff is not None:
                        # Use max(mtime, ctime) to detect files recently placed in the folder.
                        # mtime = content modification time (preserved from original on macOS copy)
                        # ctime = metadata/inode change time (updated when file arrives in folder)
                        # Without ctime, a photo from 2019 copied into the folder TODAY would
                        # be skipped because its mtime (2019) < cutoff (today).
                        try:
                            file_time = max(os.path.getmtime(fp), os.path.getctime(fp))
                            if file_time < mtime_cutoff:
                                continue  # Skip files that arrived before last run
                        except OSError:
                            pass
                    files_to_process.append(fp)

    total_files = len(files_to_process)
    if total_files == 0:
        update_callback(100, "Scan complete. No supported image files found.", "complete")
        return 0, 0

    sort_method = sort_options.get('primary_sort', 'Date').title()  # Normalize: 'location' → 'Location'
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
            return 0, total_files

    multiple_countries_found = False
    locations = []
    if sort_method == 'Location' or (sort_method == 'Hybrid' and (sort_options.get('base_sort') == 'Location' or sort_options.get('custom_filter', {}).get('filter_type') == 'Location')):
        update_callback(7, "Scanning for location metadata...", "running")
        # Must honour ignore_set: otherwise this reads EXIF from every ignored subtree
        # and can flip multiple_countries_found off a photo the job never sorts.
        locations, _, _ = get_metadata_overview(work_dir, ignore_list=ignore_set)
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

    # --- Face recognition: one parallel pass over every photo ---------------
    # This used to happen inline, one photo at a time, on a single core, and was
    # the reason a People sort over a large folder took hours. Nothing has been
    # moved or copied yet at this point, so an abort here needs no rollback.
    face_names = {}
    face_diagnostics = None
    if known_encodings:
        face_names, face_diagnostics = _recognize_all(
            files_to_process, face_rec_mode, known_encodings, known_names,
            update_callback, cancellation_event,
            {"quality": quality_metric, "scan_rate": "0.0", "data_flow": "0.0"},
            cache=_metadata_store,
        )
        # Logged here, but shown to the user only once, at the end of the job -
        # emitting it here too put two identical lines on the same timestamp
        # whenever the file phase was quick.
        logging.info(format_face_diagnostics(face_diagnostics))

    # File operations get the rest of the bar. When there is no face pass at all
    # they get all of it, so Date and Location sorts behave exactly as before.
    op_progress_base = 70 if known_encodings else 10
    op_progress_span = 25 if known_encodings else 85

    for i, source_path in enumerate(files_to_process):
        progress = op_progress_base + int(((i + 1) / total_files) * op_progress_span)
        
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
        _verb = "Sorting" if known_encodings else "Analyzing"
        update_callback(progress, f"{_verb}: {os.path.basename(source_path)}", "running", analytics)
        
        if cancellation_event and cancellation_event.is_set():
            # Pass the manifest to the exception so the finally block can use it.
            raise OperationAbortedError("Sorting operation cancelled by user.", manifest=operation_manifest)

        original_subfolder = os.path.relpath(os.path.dirname(source_path), work_dir) if work_dir != os.path.dirname(source_path) else ''
        exif_data = get_exif_data(source_path)
        date_obj = get_date_taken(exif_data)
        new_filename = f"{date_obj.strftime('%Y-%m-%d_%H%M%S')}_{os.path.basename(source_path)}" if date_obj else os.path.basename(source_path)

        # Recognition already happened in one parallel pass above. A missing entry
        # or a None (unreadable file) becomes [], which files the photo under
        # No_Faces_Found exactly as before - but the log now says which it was.
        names = face_names.get(source_path) or [] if known_encodings else []

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
                    op_msg = "Moved" if op == 'move' else "Copied"
                    update_callback(progress, f"{op_msg} '{os.path.basename(source_path)}' to '{final_destination}'", "running", analytics)
        else:
            # --- STANDARD SORT LOGIC (Unchanged) ---
            for dest_path in dest_paths:
                final_target = os.path.join(dest_path, original_subfolder) if sort_options.get('maintain_hierarchy') else dest_path
                final_destination = handle_file_op(op, source_path, final_target, new_filename, date_obj)
                
                if final_destination:
                    if op == 'move':
                        operation_manifest.append({'source': source_path, 'destination': final_destination})
                    moved_count += 1
                    op_msg = "Moved" if op == 'move' else "Copied"
                    update_callback(progress, f"{op_msg} '{os.path.basename(source_path)}' to '{final_destination}'", "running", analytics)

                    # ── Smart Album Suggestions: Passive metadata capture ─────────
                    # Record photo metadata after a successful file operation (first dest only).
                    if _metadata_store is not None:
                        try:
                            # Resolve location string for the record (already computed above)
                            _loc_raw = get_location(exif_data) if sort_method == 'Location' else None
                            # Extract camera model from EXIF if available
                            _camera = exif_data.get('Model') if exif_data else None
                            _metadata_store.record_photo(
                                original_path=source_path,
                                destination_path=final_destination,
                                date_taken=date_obj,
                                location=_loc_raw,
                                people=[n for n in names if n != 'Unknown'] if names else [],
                                file_type=os.path.splitext(source_path)[1].lower(),
                                file_size=os.path.getsize(source_path) if os.path.exists(source_path) else None,
                                sort_type=sort_method,
                                camera_model=str(_camera).strip() if _camera else None,
                            )
                        except Exception:
                            pass  # Never let metadata capture break a sort job
                    # ──────────────────────────────────────────────────────────────

                    # If we successfully moved the file, we don't need to process it for other destinations
                    if op == 'move':
                        break

    # Repeat the face summary at the end: by now the per-file messages have
    # scrolled it out of the log console, and it is the line that tells the user
    # whether No_Faces_Found is honest.
    if face_diagnostics:
        update_callback(95, format_face_diagnostics(face_diagnostics), "running",
                        {"quality": quality_metric, "scan_rate": "0.0", "data_flow": "0.0"})

    # Two distinct quantities: moved_count counts WRITES (a People sort fans one photo
    # out to every enrolled person in it), total_files counts SOURCE photos.
    return moved_count, total_files

def process_photos(config, update_callback):
    """Main entry point called by the API, orchestrating the entire process."""
    source_dir = config["source_folder"]
    dest_dir = config["destination_folder"]
    sort_options = config.get("sorting_options", {"primary_sort": config.get("sort_method", "Date"), "maintain_hierarchy": True})
    ignore_list = config.get("ignore_list", [])
    sort_options["ignore_list"] = ignore_list
    if "specific_files" in config:
        sort_options["specific_files"] = config["specific_files"]
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

    reset_space_stats()

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
                
                # Ignored subtrees are never copied, so they must not count toward size.
                ignore_set = effective_ignore_set(source_dir, dest_dir, ignore_list)
                files_to_process = []
                for dirpath, dirnames, filenames in walk_ignoring(source_dir, ignore_set):
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
        
        moved_count, total_files = _core_processing_loop(work_dir, dest_dir, sort_options, update_callback, encodings_path, cancellation_event, operation_mode)

        # NOTE: the "{n} files successfully" substring is regex-scraped by
        # scheduler_daemon.py as a fallback — keep that wording intact.
        # The space clause is appended after it, so the scraped substring is
        # untouched.
        completion_message = f"Process complete. {moved_count} files successfully {operation_mode}d from {total_files} source photos."
        completion_message += format_space_savings()
        logging.info(completion_message)
        # Ride the analytics dict so the count lands in job state in the SAME update that
        # flips status to "complete" — setting it after this call returns would leave a
        # window where a poller sees complete with files_written still 0.
        update_callback(100, completion_message, "complete", {**initial_analytics, "files_written": moved_count})
        operation_successful = True
        return moved_count  # Return count so callers (scheduler daemon, API) can track it

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

                # BUG FIX: A blanket shutil.rmtree(source_dir) would permanently destroy any
                # ignored subfolders that were intentionally skipped during the copy step and
                # therefore never transferred anywhere. Instead, we perform an ignore-aware
                # deletion: remove only what was actually copied, and leave ignored subtrees
                # (plus any ancestor directory that leads to one) intact.
                if not ignore_set:
                    # No ignore list — safe to remove the whole tree as before.
                    shutil.rmtree(source_dir)
                else:
                    # Determine every directory that is an ancestor of an ignored path so
                    # we can keep those directories alive even if they contain no other content.
                    # Normalised, so it can be compared against _norm()ed walked paths.
                    ancestor_dirs = set()
                    for ignored_path in ignore_set:
                        # Walk from source_dir down to the ignored path's parent.
                        rel = os.path.relpath(ignored_path, _norm(source_dir))
                        parts = rel.split(os.sep)
                        for i in range(len(parts)):
                            ancestor_dirs.add(_norm(os.path.join(source_dir, *parts[:i])))

                    # Bottom-up walk so we can safely remove empty dirs as we go.
                    for dirpath, dirnames, filenames in os.walk(source_dir, topdown=False):
                        # Never touch an ignored subtree.
                        if _is_ignored(dirpath, ignore_set):
                            continue

                        # Delete individual files that are not inside an ignored subtree.
                        for fname in filenames:
                            fpath = os.path.join(dirpath, fname)
                            if not _is_ignored(fpath, ignore_set):
                                try:
                                    os.remove(fpath)
                                except Exception as del_e:
                                    logging.error(f"Could not delete source file '{fpath}': {del_e}")

                        # Remove subdirectories that are not ignored and not ancestors of an
                        # ignored path, provided they are now empty.
                        for dname in dirnames:
                            dpath = os.path.join(dirpath, dname)
                            if _is_ignored(dpath, ignore_set):
                                continue  # Is, or is inside, an ignored subtree — leave it.
                            if _norm(dpath) not in ancestor_dirs and not os.listdir(dpath):
                                try:
                                    os.rmdir(dpath)
                                except Exception as del_e:
                                    logging.error(f"Could not remove source dir '{dpath}': {del_e}")

                    # Finally, remove the root source_dir itself only if it is now empty
                    # (it won't be if any ignored subtree lives inside it).
                    if not os.listdir(source_dir):
                        os.rmdir(source_dir)
                    else:
                        logging.info(
                            f"Original source directory kept because it still contains "
                            f"ignored sub-folders: {source_dir}"
                        )

                logging.info(f"Successfully removed copied content from original source directory: {source_dir}")
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