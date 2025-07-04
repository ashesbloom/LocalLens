# ==============================================================================
#  Photo Organizer - Face Enrollment Logic (Corrected)
# ==============================================================================
#
#  This script handles the AI training process. It takes images of a person,
#  extracts their unique facial features (encodings), and saves them to a
#  knowledge base file for later use in sorting.
#
# ==============================================================================

import os
import pickle
import shutil
import numpy as np
from PIL import Image, UnidentifiedImageError
import face_recognition
from multiprocessing import Pool, cpu_count
from exceptions import OperationAbortedError

# --- Constants ---
RESIZE_WIDTH_FOR_ENROLLMENT = 600

def process_image(image_path_and_name):
    """
    Processes a single image to find a face and extract its encoding.
    Returns a dictionary with status and data/message.
    """
    image_path, person_name = image_path_and_name
    base_name = os.path.basename(image_path)
    try:
        # This print is for backend console debugging, can be removed later.
        # print(f"Processing {base_name} for {person_name}...")
        pil_image = Image.open(image_path).convert("RGB")

        # Resize for faster processing
        if pil_image.width > RESIZE_WIDTH_FOR_ENROLLMENT:
            ratio = RESIZE_WIDTH_FOR_ENROLLMENT / float(pil_image.width)
            new_height = int(float(pil_image.height) * ratio)
            pil_image = pil_image.resize((RESIZE_WIDTH_FOR_ENROLLMENT, new_height), Image.Resampling.LANCZOS)

        image = np.array(pil_image)
        
        try:
            face_locations = face_recognition.face_locations(image, model='cnn')
        except Exception as e:
            # print(f"Warning: CNN model failed for {base_name} ({e}). Falling back to HOG model.")
            face_locations = face_recognition.face_locations(image, model='hog')

        if face_locations:
            encoding = face_recognition.face_encodings(image, known_face_locations=face_locations)[0]
            if np.isfinite(encoding).all():
                # Success case
                return {'status': 'success', 'data': (person_name, encoding, image_path), 'message': f"Found face in {base_name}."}
            else:
                return {'status': 'error', 'message': f"Warning: Corrupted encoding for {base_name}. Skipping."}
        else:
            # No face found case
            return {'status': 'error', 'message': f"No face found in {base_name}. Skipping."}
            
    except UnidentifiedImageError:
        return {'status': 'error', 'message': f"Skipping non-image file: {base_name}"}
    except Exception as e:
        return {'status': 'error', 'message': f"Error processing {base_name}: {e}"}


def update_encodings(enrollment_folder, encodings_file, check_abort_flag, status_callback):
    """
    Scans a dataset directory, incrementally encodes new faces using multiprocessing,
    and saves the combined encodings to a file.
    """
    # --- 1. Load Existing Encodings or Initialize ---
    known_encodings, known_names, processed_paths = [], [], []
    if os.path.exists(encodings_file):
        status_callback(0, f"Loading existing encodings...")
        try:
            with open(encodings_file, "rb") as f:
                data = pickle.load(f)
                known_encodings = data.get("encodings", [])
                known_names = data.get("names", [])
                processed_paths = data.get("paths", [])
        except (pickle.UnpicklingError, EOFError):
             status_callback(0, "Encoding file is corrupted. Starting fresh.", "warning")
    else:
        status_callback(0, "No existing encoding file found. Creating a new one.", "info")

    # --- 2. Find New Images to Process ---
    status_callback(10, "Scanning for new people and images...")
    tasks = []
    supported_formats = ('.png', '.jpg', '.jpeg')
    for person_name in os.listdir(enrollment_folder):
        person_dir = os.path.join(enrollment_folder, person_name)
        if os.path.isdir(person_dir):
            for filename in os.listdir(person_dir):
                if filename.lower().endswith(supported_formats):
                    image_path = os.path.join(person_dir, filename)
                    if image_path not in processed_paths:
                        tasks.append((image_path, person_name))

    if not tasks:
        status_callback(100, "AI model is up to date. No new images to enroll.", "complete")
        return

    status_callback(10, f"Found {len(tasks)} new images. Starting AI enrollment...")

    # --- 3. Process Images in Parallel ---
    # Use a safe number of workers to prevent memory issues
    worker_count = max(1, min(4, cpu_count() // 2))
    processed_results = []
    with Pool(processes=worker_count) as pool:
        results_iterator = pool.imap_unordered(process_image, tasks)
        for i, result in enumerate(results_iterator):
            # FIX: Use the .is_set() method to check the event, not call it as a function.
            if check_abort_flag.is_set():
                pool.terminate()
                pool.join()
                raise OperationAbortedError("Enrollment cancelled by user.")
            
            progress = 10 + int((i + 1) / len(tasks) * 80)
            
            if result:
                # NEW: Send detailed status to the UI log
                log_level = "info" if result['status'] == 'success' else "warning"
                status_callback(progress, result['message'], log_level)

                if result['status'] == 'success':
                    processed_results.append(result['data'])
            else:
                # Fallback for unexpected errors
                status_callback(progress, "An unknown error occurred while processing an image.", "error")

    # --- 4. Update Encodings and Save ---
    status_callback(90, "Consolidating and saving new AI model data...")
    if processed_results:
        new_names, new_encodings, new_paths = zip(*processed_results)
        
        known_names.extend(new_names)
        known_encodings.extend(new_encodings)
        processed_paths.extend(new_paths)

        # Atomic Save Operation
        temp_encodings_file = str(encodings_file) + ".tmp"
        try:
            with open(temp_encodings_file, "wb") as f:
                pickle.dump({
                    "encodings": known_encodings,
                    "names": known_names,
                    "paths": processed_paths
                }, f)
            shutil.move(temp_encodings_file, encodings_file)
            status_callback(100, f"Successfully enrolled {len(processed_results)} new face(s).", "complete")
        except (IOError, pickle.PicklingError) as e:
            status_callback(100, f"Error saving encodings file: {e}", "error")
            if os.path.exists(temp_encodings_file):
                os.remove(temp_encodings_file)
    else:
        status_callback(100, "Finished. No new valid faces were found to enroll.", "complete")
