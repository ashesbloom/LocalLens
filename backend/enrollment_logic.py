# ==============================================================================
#  Photo Organizer - Face Enrollment Logic
# ==============================================================================
#
#  This script handles the AI training process. It takes images of a person,
#  extracts their unique facial features (encodings), and saves them to a
#  knowledge base file for later use in sorting.
#
#  Image loading, scaling and encoding all go through face_engine, which the
#  sorter uses too. They used to differ - enrollment loaded at 600px wide,
#  sorting at 800px, and neither applied the EXIF orientation tag - so the
#  gallery and the query encodings came from different-looking pictures. Measured
#  on the 35 real enrollment photos on this machine, aligning them dropped the
#  share of same-person pairs falling outside the 0.55 match tolerance from
#  12.6% to 0%. That share was photos of enrolled people landing in
#  Unknown_Faces.
#
# ==============================================================================

import os
import pickle
import shutil
import numpy as np
from multiprocessing import Pool, cpu_count

import face_engine
from exceptions import OperationAbortedError

# --- Constants ---
# Bump when the encoding recipe changes so existing galleries are rebuilt.
GALLERY_VERSION = 2

# Enrollment accepts everything the sorter can read. It used to accept only
# jpg/png, so a user enrolling HEIC selfies got "no new images to enroll" and an
# empty gallery, with nothing explaining why.
SUPPORTED_FORMATS = face_engine.SUPPORTED_ENROLLMENT_EXTENSIONS

# An encoding this far from the rest of its own person's samples is not that
# person. Within-person distances measured on a clean gallery: mean 0.415,
# p90 0.515, max 0.542.
OUTLIER_ABSOLUTE = 0.60
OUTLIER_MAD_MULTIPLIER = 2.0


def process_image(image_path_and_name):
    """
    Processes a single image to find a face and extract its encoding.
    Returns a dictionary with status and data/message.
    """
    image_path, person_name = image_path_and_name
    base_name = os.path.basename(image_path)
    try:
        result = face_engine.encode_largest_face(image_path)

        if result['status'] == face_engine.UNREADABLE:
            return {'status': 'error', 'message': f"Could not read {base_name}. Skipping."}
        if result['status'] == face_engine.UNAVAILABLE:
            return {'status': 'error', 'message': f"Face recognition unavailable; skipped {base_name}."}
        if result['status'] != face_engine.OK or result['encoding'] is None:
            return {'status': 'error', 'message': f"No face found in {base_name}. Skipping."}

        if result['ambiguous']:
            # Two similarly sized faces: we cannot tell which one the folder name
            # refers to, and guessing files a stranger under this person's name.
            return {
                'status': 'error',
                'message': (f"Skipped {base_name}: {result['face_count']} faces of similar size, "
                            f"so it is unclear which one is {person_name}. "
                            f"Use a photo where {person_name} is clearly the main subject."),
            }

        return {
            'status': 'success',
            'data': (person_name, result['encoding'], image_path),
            'message': f"Found face in {base_name}.",
        }

    except Exception as e:
        return {'status': 'error', 'message': f"Error processing {base_name}: {e}"}


def _prune_outliers(names, encodings, paths, status_callback):
    """
    Drop encodings that do not agree with the rest of their own person's samples.

    A single wrong face in the gallery is worse than a missing one: matching uses
    the nearest enrolled neighbour, so one bad sample silently captures strangers
    into that person's folder. Needs at least 3 samples for the comparison to
    mean anything.
    """
    # load_face_encodings zips these three lists, so a gallery written by an older
    # or interrupted build can legitimately have them out of step. Work only over
    # the part where all three agree rather than indexing off the end.
    usable = min(len(names), len(encodings), len(paths))
    if usable < len(names):
        names, encodings, paths = names[:usable], encodings[:usable], paths[:usable]

    by_person = {}
    for index, name in enumerate(names):
        by_person.setdefault(name, []).append(index)

    dropped = set()
    for person, indices in by_person.items():
        if len(indices) < 3:
            continue
        vectors = np.asarray([encodings[i] for i in indices], dtype=np.float64)
        # Mean distance from each sample to the others in its group.
        pairwise = np.linalg.norm(vectors[:, None, :] - vectors[None, :, :], axis=2)
        mean_distance = (pairwise.sum(axis=1)) / max(1, len(indices) - 1)

        median = float(np.median(mean_distance))
        mad = float(np.median(np.abs(mean_distance - median)))
        threshold = max(OUTLIER_ABSOLUTE, median + OUTLIER_MAD_MULTIPLIER * mad)

        for position, index in enumerate(indices):
            if mean_distance[position] > threshold:
                dropped.add(index)
                status_callback(
                    92,
                    f"Ignoring '{os.path.basename(paths[index])}' for {person}: "
                    f"it does not match their other photos (distance "
                    f"{mean_distance[position]:.2f} vs {threshold:.2f} allowed).",
                    "warning",
                )

    if not dropped:
        return names, encodings, paths

    keep = [i for i in range(len(names)) if i not in dropped]
    return ([names[i] for i in keep],
            [encodings[i] for i in keep],
            [paths[i] for i in keep])


def _warn_on_duplicate_people(names, encodings, status_callback):
    """
    Warn when two enrolled names look like the same face.

    The self-consistency prune above cannot catch this: if someone is enrolled
    twice under two names, each name's own photos agree with each other perfectly.
    But matching picks the nearest enrolled neighbour, so that person's photos get
    split between both folders more or less at random - which reads as the feature
    working unreliably rather than as a naming mistake.

    Reports only; nothing is removed. Which name to keep is the user's call.
    """
    by_person = {}
    for encoding, name in zip(encodings, names):
        by_person.setdefault(name, []).append(np.asarray(encoding, dtype=np.float64))

    people = sorted(by_person)
    if len(people) < 2:
        return

    tolerance = face_engine.FACE_RECOGNITION_TOLERANCE
    for i in range(len(people)):
        for j in range(i + 1, len(people)):
            left = np.asarray(by_person[people[i]])
            right = np.asarray(by_person[people[j]])
            closest = float(np.linalg.norm(left[:, None, :] - right[None, :, :], axis=2).min())
            if closest <= tolerance:
                status_callback(
                    95,
                    f"'{people[i]}' and '{people[j]}' look like the same person "
                    f"(closest photos are {closest:.2f} apart; under {tolerance} counts as a match). "
                    f"Their photos will be split between both folders. "
                    f"Remove one of them if it is a duplicate or a test entry.",
                    "warning",
                )


def _save_gallery(encodings_file, encodings, names, paths, status_callback):
    """Atomically write the gallery. Returns True on success."""
    temp_encodings_file = str(encodings_file) + ".tmp"
    try:
        with open(temp_encodings_file, "wb") as f:
            pickle.dump({
                "encodings": encodings,
                "names": names,
                "paths": paths,
                "version": GALLERY_VERSION,
            }, f)
        shutil.move(temp_encodings_file, encodings_file)
        return True
    except (IOError, OSError, pickle.PicklingError) as e:
        status_callback(100, f"Error saving encodings file: {e}", "error")
        if os.path.exists(temp_encodings_file):
            os.remove(temp_encodings_file)
        return False


def needs_rebuild(encodings_file):
    """
    True when an existing gallery predates the current encoding recipe.

    Old galleries have no 'version' key. Their encodings were produced from
    600px-wide, possibly sideways images with the first-listed face rather than
    the largest, so they are measurably looser than what this module now writes
    and they mix badly with new entries.
    """
    if not os.path.exists(encodings_file):
        return False
    try:
        with open(encodings_file, "rb") as f:
            data = pickle.load(f)
    except Exception:
        return False
    if not data.get("encodings"):
        return False
    return data.get("version", 1) < GALLERY_VERSION


def rebuild_gallery(enrollment_folder, encodings_file, check_abort_flag, status_callback):
    """
    Re-encode every enrolled photo with the current recipe, once.

    Runs when needs_rebuild() says the gallery is stale. The original photos are
    still on disk under enrollment_folder, so this needs nothing from the user.
    The previous gallery is copied to <name>.bak first, so restoring it is a file
    rename if anything goes wrong.
    """
    if os.path.exists(encodings_file):
        backup = str(encodings_file) + ".bak"
        try:
            shutil.copy2(encodings_file, backup)
            status_callback(1, f"Backed up the existing face model to {os.path.basename(backup)}.", "info")
        except Exception as e:
            status_callback(100, f"Could not back up the existing face model: {e}. Rebuild cancelled.", "error")
            return

    tasks = _collect_tasks(enrollment_folder, processed_paths=[])
    if not tasks:
        status_callback(100, "No enrollment photos found to rebuild from. Keeping the existing model.", "complete")
        return

    status_callback(5, f"Upgrading the face model: re-reading {len(tasks)} enrolled photo(s)...", "info")
    results = _run_pool(tasks, check_abort_flag, status_callback, progress_base=5, progress_span=85)

    if not results:
        status_callback(100, "Rebuild found no usable faces. The previous model has been kept.", "error")
        return

    names, encodings, paths = (list(t) for t in zip(*results))
    before = len(names)
    names, encodings, paths = _prune_outliers(names, encodings, paths, status_callback)
    _warn_on_duplicate_people(names, encodings, status_callback)

    if _save_gallery(encodings_file, encodings, names, paths, status_callback):
        dropped = before - len(names)
        suffix = f" ({dropped} photo(s) ignored as mismatched)" if dropped else ""
        status_callback(100, f"Face model upgraded: {len(names)} face(s) from {len(set(names))} "
                             f"person/people re-encoded at higher quality{suffix}.", "complete")


def _collect_tasks(enrollment_folder, processed_paths):
    """(image_path, person_name) pairs for every enrolled photo not yet encoded."""
    tasks = []
    already_done = set(processed_paths)
    if not os.path.isdir(enrollment_folder):
        return tasks
    for person_name in sorted(os.listdir(enrollment_folder)):
        person_dir = os.path.join(enrollment_folder, person_name)
        if not os.path.isdir(person_dir):
            continue
        for filename in sorted(os.listdir(person_dir)):
            if filename.lower().endswith(SUPPORTED_FORMATS):
                image_path = os.path.join(person_dir, filename)
                if image_path not in already_done:
                    tasks.append((image_path, person_name))
    return tasks


def _run_pool(tasks, check_abort_flag, status_callback, progress_base, progress_span):
    """Encode tasks in parallel, reporting each result. Returns success payloads."""
    # Enrollment always detects with dlib's CNN, which allocates in proportion to
    # pixel count. Four of those at once was measured exhausting an 8GB machine, so
    # the pool is capped even though there are usually only a handful of photos to
    # encode - a crash here costs the user their whole enrollment.
    worker_count = max(1, min(face_engine.MAX_CNN_WORKERS, cpu_count() // 2))
    processed_results = []
    with Pool(processes=worker_count) as pool:
        results_iterator = pool.imap_unordered(process_image, tasks)
        for i, result in enumerate(results_iterator):
            if check_abort_flag.is_set():
                pool.terminate()
                pool.join()
                raise OperationAbortedError("Enrollment cancelled by user.")

            progress = progress_base + int((i + 1) / len(tasks) * progress_span)

            if result:
                log_level = "info" if result['status'] == 'success' else "warning"
                status_callback(progress, result['message'], log_level)
                if result['status'] == 'success':
                    processed_results.append(result['data'])
            else:
                status_callback(progress, "An unknown error occurred while processing an image.", "error")
    return processed_results


def update_encodings(enrollment_folder, encodings_file, check_abort_flag, status_callback):
    """
    Scans a dataset directory, incrementally encodes new faces using multiprocessing,
    and saves the combined encodings to a file.
    """
    # --- 0. Upgrade a stale gallery before adding to it ---
    # Mixing old 600px encodings with new ones leaves the old people harder to
    # match than the new ones, which reads as the feature working for some
    # faces and not others.
    if needs_rebuild(encodings_file):
        rebuild_gallery(enrollment_folder, encodings_file, check_abort_flag, status_callback)

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
    tasks = _collect_tasks(enrollment_folder, processed_paths)

    if not tasks:
        status_callback(100, "AI model is up to date. No new images to enroll.", "complete")
        return

    status_callback(10, f"Found {len(tasks)} new images. Starting AI enrollment...")

    # --- 3. Process Images in Parallel ---
    processed_results = _run_pool(tasks, check_abort_flag, status_callback,
                                  progress_base=10, progress_span=80)

    # --- 4. Update Encodings and Save ---
    status_callback(90, "Consolidating and saving new AI model data...")
    if processed_results:
        new_names, new_encodings, new_paths = zip(*processed_results)

        known_names = list(known_names) + list(new_names)
        known_encodings = list(known_encodings) + list(new_encodings)
        processed_paths = list(processed_paths) + list(new_paths)

        before = len(known_names)
        known_names, known_encodings, processed_paths = _prune_outliers(
            known_names, known_encodings, processed_paths, status_callback
        )
        dropped = before - len(known_names)
        _warn_on_duplicate_people(known_names, known_encodings, status_callback)

        if _save_gallery(encodings_file, known_encodings, known_names, processed_paths, status_callback):
            suffix = f" ({dropped} photo(s) ignored as mismatched)" if dropped else ""
            status_callback(100, f"Successfully enrolled {len(processed_results)} new face(s){suffix}.", "complete")
    else:
        status_callback(100, "Finished. No new valid faces were found to enroll.", "complete")
