# ==============================================================================
#  LocalLens - Face Engine
# ==============================================================================
#
#  Single source of truth for: load -> detect -> encode -> match.
#
#  Split out of organizer_logic.py because both the sorter and the enroller need
#  identical image handling. When the two paths disagreed (enrollment loaded at
#  600px, sorting at 800px, neither applying EXIF orientation) the gallery and
#  the query encodings came from different-looking pictures, which showed up as
#  photos of enrolled people landing in Unknown_Faces.
#
#  Measured on 35 real enrollment photos before this module existed:
#    - faces detected upright: 33/35.  Same photos rotated 90 degrees: 1/35.
#      dlib's HOG detector is not rotation invariant, so any JPEG whose EXIF
#      Orientation tag was never applied was effectively invisible to it.
#    - a portrait shrunk to group-photo scale: 11/20 found at width 800 with no
#      upsampling, 19/20 at long-edge 1600 with upsample 1.
#
# ==============================================================================

import logging
import os

import numpy as np
from PIL import Image, ImageOps

# Bump when the ladder, the loader or the encoder changes: the sqlite encoding
# cache keys on this, so old rows are ignored rather than trusted.
ENGINE_VERSION = 2

# dlib's own recommendation is 0.6. 0.55 has been the value here since the first
# commit and, measured against a cleanly rebuilt gallery, it is right: 0% of
# same-person pairs exceed it. It only looked too tight against the old gallery,
# where 12.6% did. Fix the gallery, not the threshold.
FACE_RECOGNITION_TOLERANCE = 0.55

# Long edge used when encoding enrollment photos. The query ladder starts at 1024
# and escalates to 1600; encoding the gallery at 1600 keeps it inside that range
# instead of below it (the old value was a 600px width).
ENROLLMENT_LONG_EDGE = 1600

# Enrollment detects with dlib's CNN, whose memory use scales with pixel count.
# Measured on this machine: a single 1600px CNN detection held ~23% of system RAM,
# and running several of those in parallel exhausted an 8GB machine outright.
#
# So detection runs on a small copy and the box is scaled back up, leaving the
# encoding to read from the full ENROLLMENT_LONG_EDGE array. Detection only needs
# to locate the face; the chip dlib cuts is resized to 150x150 regardless, so the
# encoding quality that actually drives matching is unaffected. 800 keeps the
# footprint close to the width-600 the original code used, which shipped safely.
ENROLLMENT_DETECT_LONG_EDGE = 800

# Hard ceiling on how many CNN detections may run at once. dlib's CNN allocates
# per-image buffers proportional to pixel count and there is no way to cap that
# from Python, so the only lever is concurrency. HOG is cheap and stays unlimited.
#
# ponytail: fixed cap, not memory-aware. If accurate mode is too slow on large
# machines, the upgrade is a second narrow pool for just the CNN pass rather than
# raising this number blindly - a 64GB box and an 8GB box both land here.
MAX_CNN_WORKERS = 2

# Jitters resample the face chip and average the results. Worth it on the gallery
# side, which is encoded once over a handful of photos. Measured as actively
# harmful on the query side (it introduced a wrong-person match), so the query
# path leaves it at the default of 1.
ENROLLMENT_NUM_JITTERS = 10

RAW_EXTENSIONS = ('.dng', '.cr2', '.cr3', '.nef', '.arw', '.raf')

# Canonical list of readable formats. Lives here because both the sorter and the
# enroller need it and both import this module; organizer_logic re-exports it as
# SUPPORTED_EXTENSIONS, which is the name the rest of the app already uses.
# Enrollment used to accept only jpg/png, so HEIC selfies enrolled nothing.
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
SUPPORTED_ENROLLMENT_EXTENSIONS = SUPPORTED_EXTENSIONS

# --- Detection ladder -------------------------------------------------------
# Each pass is (long_edge, number_of_times_to_upsample, rotation_degrees, model).
# Passes run in order and stop at the first one that finds a face, so an ordinary
# photo pays only for pass 1 and the escalation cost falls on the photos that
# would otherwise have been filed as having no face at all.
#
# Measured cost per photo: pass 1 ~0.16s, pass 2 ~0.66s. Against the old
# 'balanced' mode, which paid upsample=2 on every image unconditionally for
# ~0.97s, this averages ~0.20s at equal-or-better recall.
#
# A pass at long-edge 2000 with upsample 2 was measured and dropped: it found
# exactly what pass 2 found, for 5x the time.
_PASS_BASE = [
    (1024, 0, 0, 'hog'),    # 1. the common case
    (1600, 1, 0, 'hog'),    # 2. small / distant faces in group shots
]
_PASS_ROTATE = [
    (1024, 0, 90, 'hog'),   # 3. photos whose orientation tag is missing or wrong
    (1024, 0, -90, 'hog'),
]
_PASS_CNN = [
    # 4. Last resort. No CUDA on this machine, so it is both slow and the only
    # memory-hungry pass; 1200 rather than 1600 keeps a single detection inside a
    # sane footprint, and MAX_CNN_WORKERS caps how many run at once.
    (1200, 0, 0, 'cnn'),
]

LADDERS = {
    'fast': _PASS_BASE,
    'balanced': _PASS_BASE + _PASS_ROTATE,
    'accurate': _PASS_BASE + _PASS_ROTATE + _PASS_CNN,
}

# Result statuses. 'no_face' and 'unreadable' were indistinguishable before:
# every failure became an empty list and the photo was filed under
# No_Faces_Found with nothing written to the log.
OK = 'ok'
NO_FACE = 'no_face'
UNREADABLE = 'unreadable'
UNAVAILABLE = 'unavailable'


# --- Lazy library binding ---------------------------------------------------
# Imported on first use rather than at module import. Pool workers are spawned on
# macOS and Windows, so each one re-imports this module and binds its own handle;
# doing it lazily keeps a missing dlib from breaking the whole backend at startup.
_fr = None
_fr_tried = False
_rawpy = None
_wand_image = None
_raw_tried = False


def face_recognition_module():
    """Return the face_recognition module, or None if it is not installed."""
    global _fr, _fr_tried
    if not _fr_tried:
        _fr_tried = True
        try:
            import face_recognition
            _fr = face_recognition
        except ImportError:
            _fr = None
            logging.error("face_recognition is not installed; face features are disabled.")
    return _fr


def _raw_loaders():
    """Return (rawpy, WandImage), either of which may be None."""
    global _rawpy, _wand_image, _raw_tried
    if not _raw_tried:
        _raw_tried = True
        try:
            import rawpy
            _rawpy = rawpy
        except ImportError:
            pass
        try:
            from wand.image import Image as WandImage
            _wand_image = WandImage
        except ImportError:
            pass
    return _rawpy, _wand_image


# --- Loading ----------------------------------------------------------------

def load_upright(image_path):
    """
    Open an image as upright RGB, or return None if nothing can decode it.

    'Upright' is the whole point: ImageOps.exif_transpose applies the EXIF
    Orientation tag, which Pillow does not do on open(). Without it a portrait
    JPEG reaches the detector on its side and HOG finds nothing.

    The RAW fallback chain (rawpy, then Wand) is carried over unchanged from the
    original recognize_faces so RAW behaviour is identical.
    """
    pil_image = None
    file_ext = os.path.splitext(image_path)[1].lower()

    try:
        pil_image = Image.open(image_path)
    except Exception as e:
        if file_ext in RAW_EXTENSIONS:
            rawpy, WandImage = _raw_loaders()
            if rawpy:
                try:
                    with rawpy.imread(image_path) as raw:
                        rgb_array = raw.postprocess()
                    pil_image = Image.fromarray(rgb_array)
                    logging.info(f"Decoded Raw file '{os.path.basename(image_path)}' via rawpy.")
                except Exception as raw_e:
                    logging.warning(f"Could not process Raw file {os.path.basename(image_path)} with rawpy: {raw_e}")

            if not pil_image and WandImage:
                try:
                    with WandImage(filename=image_path) as img:
                        img_blob = img.make_blob(format='RGB')
                        pil_image = Image.frombytes('RGB', (img.width, img.height), img_blob)
                    logging.info(f"Decoded Raw file '{os.path.basename(image_path)}' via Wand.")
                except Exception as wand_e:
                    logging.warning(f"Could not process Raw file {os.path.basename(image_path)} with Wand: {wand_e}")

        if not pil_image:
            logging.warning(f"Pillow could not open {os.path.basename(image_path)}: {e}")
            return None

    try:
        # Must happen before convert('RGB'): exif_transpose reads image.info/EXIF,
        # and it is a no-op on files with no orientation tag (RAW, HEIC, PNG).
        pil_image = ImageOps.exif_transpose(pil_image)
        return pil_image.convert('RGB')
    except Exception as e:
        logging.warning(f"Could not normalise {os.path.basename(image_path)}: {e}")
        return None


def resize_long_edge(pil_image, long_edge):
    """
    Downscale so the longer side is at most long_edge, preserving aspect ratio.

    Scaling by the long edge rather than by width is deliberate: the original
    code only resized when `width > 800`, so a tall 800x3000 panorama skipped the
    resize entirely and was fed to the detector at full height.
    """
    largest = max(pil_image.size)
    if largest <= long_edge:
        return pil_image
    scale = long_edge / float(largest)
    new_size = (max(1, int(pil_image.width * scale)), max(1, int(pil_image.height * scale)))
    return pil_image.resize(new_size, Image.Resampling.LANCZOS)


# --- Detection + encoding ---------------------------------------------------

def ladder_length(mode):
    """Number of passes a mode would run. Used to reason about cached results."""
    return len(LADDERS.get((mode or 'balanced').lower(), LADDERS['balanced']))


def pass_kind(mode, pass_used):
    """
    What the pass that found a face actually was: 'first', 'rescale', 'rotation',
    'cnn', or '' when nothing was found.

    Derived from the ladder tuple rather than from the pass number. Counting by
    index got this wrong: in accurate mode pass 5 is the CNN scan, so a rule like
    `pass_used >= 3` reported deep-scan recoveries as rotated photos.
    """
    if not pass_used:
        return ''
    ladder = LADDERS.get((mode or 'balanced').lower(), LADDERS['balanced'])
    if pass_used > len(ladder):
        return ''
    _, _, rotation, model = ladder[pass_used - 1]
    if model == 'cnn':
        return 'cnn'
    if rotation:
        return 'rotation'
    return 'first' if pass_used == 1 else 'rescale'


def mode_uses_cnn(mode):
    """
    True when this mode can reach a CNN pass.

    Callers use this to cap how many workers they start. CNN memory scales with
    pixels and cannot be limited from Python, so concurrency is the only control.
    """
    ladder = LADDERS.get((mode or 'balanced').lower(), LADDERS['balanced'])
    return any(model == 'cnn' for _, _, _, model in ladder)


def safe_worker_count(mode, available=None):
    """
    How many recognition workers this mode may safely run.

    One per spare core for the HOG-only modes. Modes that can reach the CNN pass
    are capped hard: several parallel CNN detections were measured exhausting an
    8GB machine, and an out-of-memory kill loses the whole job.
    """
    if available is None:
        available = max(1, (os.cpu_count() or 2) - 1)
    if mode_uses_cnn(mode):
        return max(1, min(available, MAX_CNN_WORKERS))
    return max(1, available)


def detect_and_encode(image_path, mode='balanced', pil_image=None):
    """
    Run the ladder until a pass finds at least one usable face encoding.

    Returns {'status', 'encodings', 'pass_used', 'passes_run'} where status is one
    of OK, NO_FACE, UNREADABLE, UNAVAILABLE. pass_used is the 1-based ladder index
    that succeeded, or 0; passes_run is how many were executed, which is what lets
    the cache tell a shallow scan from a thorough one.
    """
    fr = face_recognition_module()
    if fr is None:
        return {'status': UNAVAILABLE, 'encodings': [], 'pass_used': 0, 'passes_run': 0}

    if pil_image is None:
        pil_image = load_upright(image_path)
    if pil_image is None:
        return {'status': UNREADABLE, 'encodings': [], 'pass_used': 0, 'passes_run': 0}

    ladder = LADDERS.get((mode or 'balanced').lower(), LADDERS['balanced'])
    scaled = {}  # long_edge -> ndarray, so rotation passes reuse pass 1's array

    for index, (long_edge, upsample, rotation, model) in enumerate(ladder, start=1):
        try:
            base = scaled.get(long_edge)
            if base is None:
                base = np.asarray(resize_long_edge(pil_image, long_edge))
                scaled[long_edge] = base

            if rotation == 0:
                frame = base
            else:
                # np.rot90 returns a view; dlib needs a contiguous buffer.
                frame = np.ascontiguousarray(np.rot90(base, 1 if rotation == 90 else 3))

            boxes = fr.face_locations(frame, model=model, number_of_times_to_upsample=upsample)
            if not boxes:
                continue

            # Encode from the same frame the boxes came from - including the
            # rotated one. The chip is cut from that array, so a face found in a
            # rotated frame still encodes correctly.
            encodings = [e for e in fr.face_encodings(frame, boxes) if np.isfinite(e).all()]
            if encodings:
                return {'status': OK, 'encodings': encodings,
                        'pass_used': index, 'passes_run': index}
        except Exception as e:
            logging.warning(
                f"Face pass {index} ({model} L{long_edge} up{upsample} rot{rotation}) "
                f"failed on {os.path.basename(image_path)}: {e}"
            )
            continue

    return {'status': NO_FACE, 'encodings': [], 'pass_used': 0, 'passes_run': len(ladder)}


def encode_largest_face(image_path, num_jitters=ENROLLMENT_NUM_JITTERS,
                        long_edge=ENROLLMENT_LONG_EDGE):
    """
    Encode one face for the gallery: the largest one in the picture.

    The old enrollment code took face_encodings(...)[0] - the first box in dlib's
    arbitrary order. On a two-person enrollment photo that files a stranger's
    face under the person's name and poisons matching in both directions. The
    largest face is the subject of a portrait; anything close to it in size is
    reported as ambiguous instead of being silently guessed at.

    Detection here keeps CNN with a HOG fallback, as enrollment always has: 3 of
    the 35 measured enrollment photos are undetectable by HOG at any scale and
    would silently drop out of the gallery otherwise. Enrollment runs once over a
    few photos, so it can afford the slow detector.

    Returns {'status', 'encoding', 'ambiguous', 'face_count'}.
    """
    fr = face_recognition_module()
    if fr is None:
        return {'status': UNAVAILABLE, 'encoding': None, 'ambiguous': False, 'face_count': 0}

    pil_image = load_upright(image_path)
    if pil_image is None:
        return {'status': UNREADABLE, 'encoding': None, 'ambiguous': False, 'face_count': 0}

    encode_image = resize_long_edge(pil_image, long_edge)
    detect_image = resize_long_edge(encode_image, ENROLLMENT_DETECT_LONG_EDGE)
    detect_frame = np.asarray(detect_image)

    try:
        boxes = fr.face_locations(detect_frame, model='cnn')
    except Exception as e:
        logging.info(f"CNN detector unavailable for {os.path.basename(image_path)} ({e}); using HOG.")
        boxes = fr.face_locations(detect_frame, model='hog', number_of_times_to_upsample=1)

    if not boxes:
        # CNN found nothing; an upsampled HOG pass occasionally still does.
        boxes = fr.face_locations(detect_frame, model='hog', number_of_times_to_upsample=1)
    if not boxes:
        return {'status': NO_FACE, 'encoding': None, 'ambiguous': False, 'face_count': 0}

    def area(box):
        top, right, bottom, left = box
        return max(0, bottom - top) * max(0, right - left)

    boxes = sorted(boxes, key=area, reverse=True)
    largest = boxes[0]
    # A second face at >=60% of the subject's area means we cannot tell which
    # person the folder name refers to.
    ambiguous = len(boxes) > 1 and area(boxes[1]) >= 0.6 * area(largest)

    # Scale the box from detection coordinates into the encoding image, clamped so
    # rounding cannot push it past the edge.
    encode_frame = np.asarray(encode_image)
    scale = encode_image.width / float(detect_image.width)
    if abs(scale - 1.0) > 1e-9:
        height, width = encode_frame.shape[:2]
        top, right, bottom, left = largest
        largest = (
            max(0, min(height, int(round(top * scale)))),
            max(0, min(width, int(round(right * scale)))),
            max(0, min(height, int(round(bottom * scale)))),
            max(0, min(width, int(round(left * scale)))),
        )

    encoding = fr.face_encodings(encode_frame, [largest], num_jitters=num_jitters)[0]
    if not np.isfinite(encoding).all():
        return {'status': NO_FACE, 'encoding': None, 'ambiguous': ambiguous, 'face_count': len(boxes)}

    return {'status': OK, 'encoding': encoding, 'ambiguous': ambiguous, 'face_count': len(boxes)}


# --- Matching ---------------------------------------------------------------

# One-entry memo so a job does not rebuild the gallery matrix for every photo.
# The source list is held in the cache, which keeps its id() from being recycled
# onto a different object.
_gallery_memo = {'source': None, 'matrix': None, 'names': None}


def build_gallery(known_encodings, known_names):
    """Stack the enrolled encodings into one (N,128) matrix for vectorised search."""
    if known_encodings is None or len(known_encodings) == 0:
        return None, []

    memo = _gallery_memo
    if memo['source'] is known_encodings and memo['matrix'] is not None \
            and len(memo['names']) == len(known_names):
        return memo['matrix'], memo['names']

    matrix = np.asarray(known_encodings, dtype=np.float64)
    names = list(known_names)
    _gallery_memo.update({'source': known_encodings, 'matrix': matrix, 'names': names})
    return matrix, names


def match_names(encodings, gallery_matrix, gallery_names,
                tolerance=FACE_RECOGNITION_TOLERANCE):
    """
    Name each encoding by nearest enrolled neighbour, or 'Unknown'.

    Same decision rule as the original compare_faces + argmin, in one numpy op
    per face instead of rebuilding Python lists per face per photo. Deliberately
    plain: a runner-up margin test and per-person distance aggregation were both
    measured on this gallery and were neutral or worse.
    """
    found = set()
    for encoding in encodings:
        if gallery_matrix is None or not len(gallery_names):
            found.add("Unknown")
            continue
        distances = np.linalg.norm(gallery_matrix - encoding, axis=1)
        best = int(np.argmin(distances))
        found.add(gallery_names[best] if distances[best] <= tolerance else "Unknown")
    return list(found)


# --- Pool worker ------------------------------------------------------------
# These live here rather than in organizer_logic on purpose. A spawned worker
# imports the module its target function belongs to, and organizer_logic prints a
# library banner at import time - eight workers would put eight copies of it in
# the user's log on every People sort. This module imports quietly.

_worker_state = {}


def worker_init(mode, known_encodings, known_names):
    """Bind per-worker state once, instead of pickling the gallery with every task."""
    _worker_state['mode'] = mode
    _worker_state['gallery'] = build_gallery(known_encodings, known_names)


def worker(image_path):
    """
    Detect, encode and name the faces in one photo. Must never raise.

    Returns the same three-way answer as recognize(), as a dict: names is a list,
    [] for a faceless photo, None when the file could not be read. A failure comes
    back as data because a worker process cannot log safely.
    """
    try:
        result = detect_and_encode(image_path, _worker_state['mode'])
        names = None
        if result['status'] == OK and result['encodings']:
            matrix, gallery_names = _worker_state['gallery']
            names = match_names(result['encodings'], matrix, gallery_names)
        elif result['status'] == NO_FACE:
            names = []
        return {
            'path': image_path,
            'names': names,
            'status': result['status'],
            'pass_used': result['pass_used'],
            'passes_run': result['passes_run'],
            'encodings': result['encodings'],
        }
    except Exception as e:
        return {'path': image_path, 'names': None, 'status': UNREADABLE,
                'pass_used': 0, 'passes_run': 0, 'encodings': [], 'error': repr(e)}


def recognize(image_path, known_encodings, known_names, mode='balanced'):
    """
    Names of enrolled people in one photo.

    Returns a list of names (possibly empty when the photo genuinely has no
    face), or None when the file could not be decoded at all. Callers rely on
    that None to tell a broken file from a face-free one.
    """
    result = detect_and_encode(image_path, mode)
    if result['status'] in (UNREADABLE, UNAVAILABLE):
        return None
    if not result['encodings']:
        return []
    matrix, names = build_gallery(known_encodings, known_names)
    return match_names(result['encodings'], matrix, names)
