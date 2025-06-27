# ==============================================================================
#  Photo Organizer - Face Enrollment Logic
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
from PIL import Image
import face_recognition
from multiprocessing import Pool, cpu_count

# --- Constants ---
RESIZE_WIDTH_FOR_ENROLLMENT = 600

# Define BACKEND_DIR and PRESETS_DIR before using them
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PRESETS_DIR = os.path.join(BACKEND_DIR, "presets")

ENROLLMENT_FOLDER = os.path.join(BACKEND_DIR, "Enrollment")
ENCODINGS_FILE = os.path.join(BACKEND_DIR, "encodings.pickle")
LAST_CONFIG_FILE = os.path.join(PRESETS_DIR, "last_config.json")

def process_image(image_path_and_name):
    """
    Processes a single image to find a face and extract its encoding.
    This function is designed to be run in a separate process by a multiprocessing pool.
    """
    image_path, person_name = image_path_and_name
    try:
        print(f"Processing {os.path.basename(image_path)} for {person_name}...")
        pil_image = Image.open(image_path).convert("RGB")

        # Resize for faster processing, similar to the sorting logic
        if pil_image.width > RESIZE_WIDTH_FOR_ENROLLMENT:
            ratio = RESIZE_WIDTH_FOR_ENROLLMENT / float(pil_image.width)
            new_height = int(float(pil_image.height) * ratio)
            pil_image = pil_image.resize((RESIZE_WIDTH_FOR_ENROLLMENT, new_height), Image.Resampling.LANCZOS)

        image = np.array(pil_image)
        
        # We expect one clear face per enrollment photo
        face_locations = face_recognition.face_locations(image, model='cnn')

        if face_locations:
            # Encode the first face found
            face_encoding = face_recognition.face_encodings(image, face_locations)[0]
            
            # Sanity check for valid encoding data
            if np.isfinite(face_encoding).all():
                return (image_path, person_name, face_encoding)
            else:
                print(f"\nWarning: Corrupted encoding for {os.path.basename(image_path)}. Skipping.")
    except Exception as e:
        print(f"\nError processing {os.path.basename(image_path)}: {e}")
    return None

def update_encodings(dataset_path, encodings_file, status_callback=None):
    """
    Scans a dataset directory, incrementally encodes new faces using multiprocessing,
    and saves the combined encodings to a file.
    """
    if status_callback is None:
        def default_status_callback(progress, message, status='info'):
            print(f"[{status.upper()}] {message}")
        status_callback = default_status_callback

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
    all_image_paths = []
    for person_name in os.listdir(dataset_path):
        person_dir = os.path.join(dataset_path, person_name)
        if os.path.isdir(person_dir):
            for filename in os.listdir(person_dir):
                if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                    all_image_paths.append((os.path.join(person_dir, filename), person_name))

    new_images_to_process = [
        (path, name) for path, name in all_image_paths if path not in processed_paths
    ]

    if not new_images_to_process:
        status_callback(100, "No new images to enroll. AI model is up to date.", "complete")
        return

    # --- 3. Process New Images in Parallel ---
    status_callback(25, f"Found {len(new_images_to_process)} new images. Starting AI enrollment...")
    
    # Use a pool of worker processes for CPU-bound encoding task
    with Pool(processes=max(1, cpu_count() - 1)) as pool:
        results = pool.map(process_image, new_images_to_process)

    # --- 4. Consolidate and Save Results ---
    newly_processed_count = 0
    for result in results:
        if result:
            image_path, person_name, encoding = result
            known_encodings.append(encoding)
            known_names.append(person_name)
            processed_paths.append(image_path)
            newly_processed_count += 1
    
    status_callback(90, "Consolidating and saving new AI model data...")
    
    if newly_processed_count > 0:
        # --- Atomic Save Operation ---
        # By writing to a temporary file first and then moving it, we prevent
        # the main encodings file from becoming corrupted if the process is
        # interrupted during the save.
        temp_encodings_file = encodings_file + ".tmp"
        try:
            with open(temp_encodings_file, "wb") as f:
                pickle.dump({
                    "encodings": known_encodings,
                    "names": known_names,
                    "paths": processed_paths
                }, f)
            
            # Atomically replace the old file with the new one.
            shutil.move(temp_encodings_file, encodings_file)
            
            status_callback(100, f"Successfully enrolled {newly_processed_count} new face(s).", "complete")
        except (IOError, pickle.PicklingError) as e:
            status_callback(100, f"Error saving encodings file: {e}", "error")
            # Clean up the temporary file if it exists on failure
            if os.path.exists(temp_encodings_file):
                os.remove(temp_encodings_file)
    else:
        status_callback(100, "Finished. No new valid faces were found to enroll.", "complete")
