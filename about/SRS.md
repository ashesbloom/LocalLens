# Software Requirements Specification (SRS): AI-Powered Local Photo Organizer

**Project Title:** AI-Powered Local Photo Organizer
**Version:** 1.0
**Date:** May 31, 2025

---

## 1. Introduction

### 1.1 Purpose
This document outlines the requirements for a standalone desktop AI agent designed to automatically categorize digital photos from a user-specified local folder. It will organize these photos into a structured album/folder hierarchy on the user's local machine based on parameters like date, location, and recognized faces.

### 1.2 Scope
The AI agent will operate entirely locally on the user's machine. It will leverage free and open-source libraries for all core functionalities, including metadata extraction (EXIF data) and local facial recognition. The initial target platform is Windows, with a future goal of achieving cross-platform compatibility (macOS, Linux).

### 1.3 Target User
The intended user is a student or individual seeking a free, private, and automated solution to organize a personal photo library directly on their local computer.

---

## 2. Overall Description

### 2.1 Product Perspective
This project is a standalone, Python-based application. It functions on the user's local file system without requiring any external paid cloud services for its primary operations, ensuring user privacy and data control.

### 2.2 Product Functions Summary
The AI agent will perform the following key functions:
-   Scan user-specified photo directories.
-   Extract metadata (date taken, GPS coordinates) from images.
-   Perform offline reverse geocoding to determine location names from GPS data.
-   Allow users to enroll known faces for recognition.
-   Conduct local facial detection and recognition on photos.
-   Categorize photos based on configurable rules (e.g., date, location, people).
-   Move (or optionally copy) photos to appropriately structured destination folders.
-   Provide logging of its operations and any errors encountered.
-   Optionally, monitor specified folders for new photo additions for incremental processing.

### 2.3 User Characteristics
The target user is expected to be:
-   Technically inclined enough to run Python scripts and manage basic configuration files.
-   Concerned about privacy and prefers solutions that process data locally.
-   Looking for a no-cost software solution.

### 2.4 General Constraints
-   All photo processing, including facial recognition and metadata analysis, must occur locally on the user's machine.
-   All software components (libraries, tools) utilized must be free and open-source.
-   The initial development will target the Windows operating system, but the design should facilitate future cross-platform compatibility.
-   Initial bulk processing of large photo libraries may be time-consuming; however, incremental processing of new photos should be relatively fast.

---

## 3. Specific Requirements

### 3.1 Functional Requirements

#### FR1: Source Photo Ingestion
-   **FR1.1:** The agent must allow the user to specify a root source folder containing photos to be organized.
-   **FR1.2:** The agent must recursively scan subfolders within the specified root source folder for image files (common formats like JPG, JPEG, PNG).

#### FR2: Metadata Extraction
-   **FR2.1:** The agent must extract the "date and time taken" from image EXIF data.
-   **FR2.2:** The agent must extract GPS latitude and longitude coordinates from image EXIF data if available.
-   **FR2.3:** In cases where EXIF data is missing or corrupted, the system must handle the error gracefully. It must log the affected file path and the nature of the issue (e.g., "Missing Date Taken"). For categorization purposes, it must use a fallback value (e.g., "Unknown_Date") to prevent processing failure, ensuring system robustness.

#### FR3: Location Processing
-   **FR3.1:** If GPS coordinates are available, the agent must convert these into human-readable location information (e.g., City, Country) using a free, offline reverse geocoding method.

#### FR4: Facial Detection and Recognition (Local)
-   **FR4.1:** The agent must provide a mechanism for the user to "enroll" known individuals by providing sample photos and associating them with names or identifiers.
-   **FR4.2:** Face encodings for enrolled individuals must be generated and stored locally in a user-specified or default location.
-   **FR4.3:** The agent must detect human faces present in each photo being processed.
-   **FR4.4:** For each detected face, the agent must attempt to recognize it by comparing it against the locally stored encodings of enrolled individuals.
-   **FR4.5:** The agent should correctly handle photos containing zero, one, or multiple recognized faces, as well as photos with faces that are not recognized (unknown faces).

#### FR5: Categorization and Folder Structure Logic
-   **FR5.1:** The agent must allow the user to define rules for the destination folder structure through an external configuration file.
-   **FR5.2:** Categorization parameters shall include:
    -   Date (Year, Month, Day)
    -   Location (e.g., Country, City)
    -   Recognized Person(s) (e.g., a folder for each person, or for combinations of people if specified).
-   **FR5.3:** The agent must support creating hierarchical folder structures based on combinations of these parameters (e.g., `Destination/Year/Location/Event_or_Person/`).
-   **FR5.4:** A default handling mechanism must be in place for photos that do not match any specific user-defined rules (e.g., move to `Destination/Uncategorized/YYYY-MM/` or `Destination/By_Date/YYYY/MM/`).

#### FR6: File System Operations
-   **FR6.1:** The agent must create the destination folders as per the categorization logic if they do not already exist.
-   **FR6.2:** The agent must move the original photo files from the source location to the determined destination folder. (Optional: User configurable to copy instead of move).
-   **FR6.3:** The agent must handle file naming conflicts in the destination folder. The default behavior should be to append a numerical suffix to the new file if a file with the same name exists (e.g., `image.jpg` becomes `image_1.jpg`). The user may be able to configure other behaviors (e.g., skip, overwrite – though skip/rename is preferred for data safety).

#### FR7: Configuration Management
-   **FR7.1:** The agent must use an external, human-readable configuration file (e.g., JSON or YAML) to manage settings such as:
    -   Path to the root source photo folder.
    -   Path to the base destination folder for organized photos.
    -   Path to store/load face enrollment data.
    -   Categorization rules and folder structure templates.
    -   File conflict resolution strategy.

#### FR8: Operational Modes
-   **FR8.1:** The agent must be runnable as a manually triggered script that processes all photos in the source directory and then exits.
-   **FR8.2:** (Optional Enhancement) The agent should ideally support an autonomous mode where it monitors the source folder (and its subfolders) for newly added photos and processes them incrementally without requiring manual re-invocation.

#### FR9: Logging
-   **FR9.1:** The agent must log its major actions, such as files processed, categories assigned, files moved, and any errors encountered.
-   **FR9.2:** Logs should be written to a local text file.

### 3.2 Non-Functional Requirements

#### NFR1: Performance
-   **NFR1.1:** The initial processing of a large photo library (e.g., 5,000+ photos) is expected to be time-consuming. Clear indication of progress should be provided if possible.
-   **NFR1.2:** Processing of newly added individual photos (in incremental mode) should ideally complete within seconds per photo (e.g., 1-20 seconds, depending on image complexity and hardware).
-   **NFR1.3:** Consideration should be given to efficient image loading. An option to resize very high-resolution images during processing (for facial recognition) may be implemented to improve speed, with user awareness.

#### NFR2: Usability
-   **NFR2.1:** The primary interface for running the script and its enrollment utility will be command-line based.
-   **NFR2.2:** Instructions for setting up the configuration file and enrolling faces must be clear, concise, and easy to follow.

#### NFR3: Platform Support
-   **NFR3.1:** The initial version of the agent must run on Windows (Windows 10 and newer).
-   **NFR3.2:** The code should be written to facilitate future cross-platform compatibility with macOS and Linux (e.g., using `pathlib` for path manipulation, avoiding platform-specific shell commands).

#### NFR4: Cost & Licensing
-   **NFR4.1:** The agent and all its dependencies (libraries, tools) must be free of charge for the end-user.
-   **NFR4.2:** All components should preferably use permissive open-source licenses (e.g., MIT, Apache 2.0).

#### NFR5: Local Execution & Privacy
-   **NFR5.1:** All photo processing, including metadata extraction and facial recognition, must occur entirely on the user's local machine.
-   **NFR5.2:** No image data, metadata, or personal information (including face encodings) should be transmitted to any external cloud services or third parties.

#### NFR6: Installation & Dependencies
-   **NFR6.1:** The agent will be distributed as a Python script or set of scripts. Users will need a Python interpreter (version specified in `requirements.txt`) installed.
-   **NFR6.2:** All Python dependencies should be manageable via `pip` and listed in a `requirements.txt` file.

#### NFR7: Maintainability
-   **NFR7.1:** Code should be modular, with distinct functions/modules for EXIF processing, face processing, file operations, configuration handling, etc.
-   **NFR7.2:** Code should be well-commented to explain logic, especially for complex sections like categorization rules and facial recognition integration. Adherence to PEP 8 guidelines is encouraged.

### 3.3 Technology Stack (Recommended)
-   **Programming Language:** Python 3.8+
-   **Core Libraries:**
    -   **EXIF Data:** `Pillow` or `exifread`
    -   **Facial Recognition:** `face_recognition` (which utilizes `dlib` and can use OpenCV for image loading)
    -   **Offline Reverse Geocoding:** `reverse_geocoder` or a similar offline library
    -   **File/Path Operations:** Python standard libraries (`os`, `shutil`, `pathlib`)
    -   **Configuration File Parsing:** `json` (standard library) or `PyYAML`
    -   **Folder Monitoring (for FR8.2):** `watchdog`
    -   **Logging:** `logging` (standard library)

---

## 4. System Evolution (Future Considerations - Not for V1.0)
-   Development of a simple cross-platform Graphical User Interface (GUI) using a framework like Tkinter, PyQt, or Kivy.
-   Implementation of more sophisticated file conflict resolution options (e.g., checksum comparison, user prompt).
-   Support for virtual albums or tagging without moving files (e.g., using a local SQLite database).
-   Integration of basic local object detection for broader categorization (e.g., "beach," "mountains," "pets"), if performant and free local models become readily available and easy to integrate.

---

## 5. Glossary
-   **Agent:** Refers to the AI-Powered Local Photo Organizer software.
-   **Enrollment:** The process of providing sample photos of individuals to the agent, allowing it to learn to recognize them.
-   **Face Encoding:** A numerical vector representation of a detected face, used for comparison and recognition.
-   **EXIF (Exchangeable Image File Format):** Metadata embedded within image files, often including details like camera settings, date/time taken, and GPS coordinates.
-   **Reverse Geocoding:** The process of converting geographic coordinates (latitude and longitude) into a human-readable address or place name.
-   **Local Processing:** All data computation and analysis performed on the user's own computer, without sending data to external servers.
