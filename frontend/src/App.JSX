import React, { useState, useEffect, useRef } from 'react';
import { open, message } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import FaceEnrollment from './components/FaceEnrollment';
import SortingOptions from './components/SortingOptions';
import EnrollmentProgress from './components/EnrollmentProgress';
import PathSelector from './components/PathSelector';
import PresetManager from './components/PresetManager';
import ProgressTracker from './components/ProgressTracker';
import LogConsole from './components/LogConsole';
import SubfolderSelector from './components/SubfolderSelector';
import HierarchyToggle from './components/HierarchyToggle';
import SortingModeSelector from './components/SortingModeSelector';
import HybridSortConfig from './components/HybridSortConfig'; 
import FindGroupConfig from './components/FindGroupConfig'; 
import EnrolledFacesModal from './components/EnrolledFacesModal';
import FaceEnrollmentModal from './components/FaceEnrollmentModal';
import FindGroupResultModal from './components/FindGroupResultModal';
// import './components/FindGroupResultModal.css';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

function App() {
    // --- State Management ---
    // Use localStorage to avoid UI flash on reload
    const getInitialOperationMode = () => {
        return localStorage.getItem('operation_mode') || 'standard';
    };
    const [operationMode, setOperationModeRaw] = useState(getInitialOperationMode());

    // Helper to always persist mode to localStorage
    const setOperationMode = (mode) => {
        setOperationModeRaw(mode);
        localStorage.setItem('operation_mode', mode);
    };

    const [sourceFolder, setSourceFolder] = useState('');
    const [destinationFolder, setDestinationFolder] = useState('');
    const [presets, setPresets] = useState({});
    const [selectedPreset, setSelectedPreset] = useState('');
    const [sortMethod, setSortMethod] = useState('Date');
    const [faceMode, setFaceMode] = useState('balanced');
    // const [operationMode, setOperationModeRaw] = useState(getInitialOperationMode()); 
    // FIX: Default state for hierarchy is now 'false' (Flat Output).
    const [maintainHierarchy, setMaintainHierarchy] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressLabel, setProgressLabel] = useState('Ready for a new task !');
    const [logs, setLogs] = useState([]);
    const [showSaveButton, setShowSaveButton] = useState(false);
    const logConsoleRef = useRef(null);
    const eventSourceRef = useRef(null);
    const footerRef = useRef(null);
    // FIX: Ref to prevent duplicate startup calls in React's Strict Mode.
    const startupRan = useRef(false);
    const prevIsEnrolling = useRef(false); // NEW: Ref to track the previous state of enrollment.
    // NEW: State and ref for backend connection retry logic
    const [isBackendConnected, setIsBackendConnected] = useState(true);
    const retryTimeoutRef = useRef(null);

    // --- NEW State for Subfolders ---
    const [subfolders, setSubfolders] = useState([]);
    const [ignoredSubfolders, setIgnoredSubfolders] = useState([]);
    const [folderStats, setFolderStats] = useState(null);

    // --- NEW: State for Hybrid & Find Modes ---
    const [metadata, setMetadata] = useState(null);
    const [isScanningMetadata, setIsScanningMetadata] = useState(false);
    const [hybridConfig, setHybridConfig] = useState({
        baseSort: 'Date',
        filterType: 'Location',
        filterValues: {},
        folderName: 'Special Folder'
    });

    // --- NEW State for Find & Group ---
    const [findConfig, setFindConfig] = useState({
        folderName: 'Found Photos',
        years: [],
        months: [],
        locations: [],
        people: []
    });

    // --- NEW State for Enrollment ---
    const [isEnrolled, setIsEnrolled] = useState(false);
    const [enrolledCount, setEnrolledCount] = useState(0);
    const [isEnrolling, setIsEnrolling] = useState(false);
    const [selectedImages, setSelectedImages] = useState([]);
    const [personName, setPersonName] = useState("");
    const [enrollmentQueue, setEnrollmentQueue] = useState([]);

    // --- NEW State for Enrollment Progress ---
    const [enrollmentProgress, setEnrollmentProgress] = useState(null);
    const [enrollmentMessage, setEnrollmentMessage] = useState('');

    // --- NEW State for Exit Confirmation Modal ---
    const [showExitModal, setShowExitModal] = useState(false);

    // --- NEW State for Enrolled Faces Modal ---
    const [showEnrolledFacesModal, setShowEnrolledFacesModal] = useState(false);
    const [showFaceEnrollmentModal, setShowFaceEnrollmentModal] = useState(false);

    // --- NEW State for Reload Confirmation Modal ---
    const [showReloadModal, setShowReloadModal] = useState(false);

    // NEW: State to manage the animation lifecycle of the FaceEnrollment component
    const [faceEnrollmentDisplay, setFaceEnrollmentDisplay] = useState(operationMode === 'standard' ? 'visible' : 'hidden');
    // NEW: State to manage the animation lifecycle of the SubfolderSelector component
    const [subfolderSelectorDisplay, setSubfolderSelectorDisplay] = useState(operationMode !== 'standard' ? 'visible' : 'hidden');

    // --- NEW State for Find Group Modal ---
    const [findGroupModal, setFindGroupModal] = useState({
        isOpen: false,
        foundCount: 0,
        folderName: '',
    });

    // --- Effects ---
    useEffect(() => {
        if (logConsoleRef.current) {
            logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight;
        }
    }, [logs]);
    // Update progress label based on processing state
    useEffect(() => {
        if (isProcessing) {
            setProgressLabel(isEnrolling ? 'Enrolling...' : 'Processing...');
        } else {
            setProgressLabel('Ready for a new task !');
        }
    }, [isProcessing, isEnrolling]);
    // NEW: Effect to manage the enter/exit animation for swapping components
    useEffect(() => {
        if (operationMode === 'standard') {
            // Animate IN FaceEnrollment, animate OUT SubfolderSelector
            if (faceEnrollmentDisplay !== 'visible' && faceEnrollmentDisplay !== 'entering') {
                setFaceEnrollmentDisplay('entering');
            }
            if (subfolderSelectorDisplay !== 'visible' && subfolderSelectorDisplay !== 'entering') {
                setSubfolderSelectorDisplay('entering');
            }
        } else { // For 'hybrid' or 'find' mode
            // Animate OUT FaceEnrollment, animate IN SubfolderSelector
            if (faceEnrollmentDisplay !== 'hidden' && faceEnrollmentDisplay !== 'exiting') {
                setFaceEnrollmentDisplay('exiting');
            }
            if (subfolderSelectorDisplay !== 'visible' && subfolderSelectorDisplay !== 'entering') {
                setSubfolderSelectorDisplay('entering');
            }
        }
    }, [operationMode]);

    // NEW: Effect to automatically refresh the AI model status after enrollment.
    useEffect(() => {
        // This effect triggers when the enrollment process completes (isEnrolling goes from true to false).
        if (prevIsEnrolling.current && !isEnrolling) {
            logToConsole("Enrollment finished. Refreshing AI model status...", 'info');
            checkEnrollmentStatus();
        }
        // Keep the ref updated with the current state for the next render.
        prevIsEnrolling.current = isEnrolling;
    }, [isEnrolling]);

    // ADD THIS NEW EFFECT FOR METADATA SCANNING
    useEffect(() => {
        const fetchMetadata = async () => {
            if (!sourceFolder) return;
            setIsScanningMetadata(true);
            setMetadata(null);
            try {
                const data = await apiCall('/api/metadata-overview', {
                    method: 'POST',
                    body: JSON.stringify({
                        source_folder: sourceFolder,
                        ignore_list: ignoredSubfolders
                    }),
                });
                setMetadata(data);
            } catch (error) {
                logToConsole(`Error scanning metadata: ${error.message}`, 'error');
                setMetadata(null);
            } finally {
                setIsScanningMetadata(false);
            }
        };

        if ((operationMode === 'hybrid' || operationMode === 'find') && sourceFolder) {
            const debounceTimer = setTimeout(() => {
                fetchMetadata();
            }, 500);
            return () => clearTimeout(debounceTimer);
        }
    }, [operationMode, sourceFolder, ignoredSubfolders]);

    useEffect(() => {
        const fetchSubfolders = async () => {
            if (sourceFolder) {
                try {
                    const response = await apiCall('/api/list-subfolders', {
                        method: 'POST',
                        body: JSON.stringify({ path: sourceFolder }),
                    });
                    setSubfolders(response.subfolders || []);
                    setFolderStats(response.stats || null);
                    setIgnoredSubfolders([]); // Reset ignored list when source changes
                } catch (error) {
                    setSubfolders([]); // Clear on error
                    setFolderStats(null);
                    // This can be noisy if the user is typing a path that doesn't exist yet
                    // console.error("Could not fetch subfolders:", error.message);
                }
            } else {
                setSubfolders([]);
                setIgnoredSubfolders([]);
                setFolderStats(null);
            }
        };

        // Debounce to avoid rapid API calls while typing/pasting a path
        const debounceTimer = setTimeout(() => {
            fetchSubfolders();
        }, 500);

        return () => clearTimeout(debounceTimer);
    }, [sourceFolder]);

    useEffect(() => {
        if (!sourceFolder || !destinationFolder) {
            setShowSaveButton(false);
            return;
        }
        const currentPathsMatchPreset = Object.values(presets).some(
            preset => preset.source === sourceFolder && preset.destination === destinationFolder
        );
        setShowSaveButton(!currentPathsMatchPreset);
    }, [sourceFolder, destinationFolder, presets]);

    useEffect(() => {
        if (footerRef.current) {
            setTimeout(() => {
                footerRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }, 100);
        }
    }, [isProcessing]);

    useEffect(() => {
        // This check prevents the startup logic from running twice in development
        // due to React's Strict Mode, which fixes the duplicate log issue.
        if (startupRan.current === false) {
            runStartupChecks();
            loadPresets();
            loadLastConfig();
            startupRan.current = true;
        }

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, []);

    

    // NEW: Effect to handle automatic reconnection attempts
    useEffect(() => {
        // If we are disconnected, start the retry mechanism
        if (!isBackendConnected) {
            // Use a ref to prevent multiple timers from being set
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
            }

            const attemptReconnect = () => {
                // Use a lightweight endpoint to check for connection
                apiCall('/api/check-dependencies')
                    .then(() => {
                        // Success is handled within apiCall, which will set isBackendConnected to true
                        // and stop the loop. We can also reload initial data here if needed.
                        logToConsole("Reconnection successful. Loading initial data...", 'success');
                        runStartupChecks();
                    })
                    .catch(() => {
                        // The apiCall will have already logged the error.
                        // Schedule the next attempt.
                        retryTimeoutRef.current = setTimeout(attemptReconnect, 5000);
                    });
            };

            // Start the first attempt after 5 seconds
            retryTimeoutRef.current = setTimeout(attemptReconnect, 5000);
        } else {
            // If we are connected, ensure no timers are running
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
        }

        // Cleanup function to clear timer on component unmount
        return () => {
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
            }
        };
    }, [isBackendConnected]);


    // --- Core API Functions ---
    const apiCall = async (endpoint, options = {}) => {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                ...options,
                headers: { 'Content-Type': 'application/json', ...options.headers },
            });

            // If we get a response, the backend is connected.
            if (!isBackendConnected) {
                setIsBackendConnected(true);
            }

            const result = await response.json();
            if (!response.ok) {
                // Refined: Check for 'detail' from FastAPI's HTTPException first.
                throw new Error(result.detail || result.message || `API call to ${endpoint} failed: ${response.statusText}`);
            }
            return result;
        } catch (error) {
            // This error is typically a network failure (e.g., "Failed to fetch")
            if (isBackendConnected) {
                setIsBackendConnected(false);
                logToConsole(`Backend connection lost. Will try to reconnect automatically.`, 'error');
            }
            console.error(error);
            // Don't log here again, just throw to notify the caller
            throw error;
        }
    };

    const logToConsole = (message, type = 'info') => {
        setLogs(prevLogs => [...prevLogs, { message, type, time: new Date().toLocaleTimeString() }]);
    };

    // --- UI Handlers & Backend Integrations ---

    const runStartupChecks = async () => {
        logToConsole("System Initialized. Connecting to backend services...");
        try {
            const status = await apiCall('/api/check-dependencies');
            logToConsole("Backend connected. Verifying component status...");
            if (status.face_recognition_installed) {
                // Let the enrollment check handle the specific logging.
                await checkEnrollmentStatus();
            } else {
                logToConsole("Face Recognition: Unavailable (library not installed). 'Sort by People' is disabled.", 'warning');
                setIsEnrolled(false);
            }
        } catch (e) {
            logToConsole("Backend connection failed. Please ensure the server is running and refresh.", 'error');
        }
    };

    const checkEnrollmentStatus = async () => {
        try {
            const status = await apiCall('/api/enrollment-status');
            setIsEnrolled(status.is_enrolled);
            setEnrolledCount(status.enrolled_count || 0);
            if (status.is_enrolled) {
                const personText = status.enrolled_count === 1 ? "person" : "people";
                logToConsole(`Face Recognition: Enabled (${status.enrolled_count} ${personText} enrolled).`, "success");
            } else {
                logToConsole("Face Recognition: Disabled (No model enrolled). Please use the enrollment section.", "info");
            }
        } catch (e) {
            logToConsole("Face Recognition: Status check failed. This feature will be disabled.", "error");
            setIsEnrolled(false);
            setEnrolledCount(0);
        }
    };

    const handleSelectImages = async () => {
        try {
            const selected = await open({
                multiple: true,
                filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'heic', 'heif', 'tiff'] }]
            });
            if (Array.isArray(selected) && selected.length > 0) {
                setSelectedImages(selected);
                logToConsole(`Selected ${selected.length} image(s) for enrollment dataset.`);
            }
        } catch (error) {
            logToConsole("Failed to open image dialog.", "error");
        }
    };

    const handleAddToQueue = () => {
        if (!personName || selectedImages.length === 0) {
            message('Please select at least one image and provide a name.', { title: 'Missing Information', kind: 'warning' });
            return;
        }
        // Prevent adding the same person twice
        if (enrollmentQueue.some(p => p.personName.toLowerCase() === personName.toLowerCase())) {
            message(`'${personName}' is already in the queue. Please choose a different name.`, { title: 'Duplicate Name', kind: 'warning' });
            return;
        }
        setEnrollmentQueue(prev => [...prev, { personName, imagePaths: selectedImages }]);
        logToConsole(`Added '${personName}' with ${selectedImages.length} image(s) to the enrollment queue.`, 'info');
        // Reset form
        setPersonName("");
        setSelectedImages([]);
    };

    const handleRemoveFromQueue = (indexToRemove) => {
        const person = enrollmentQueue[indexToRemove];
        setEnrollmentQueue(prev => prev.filter((_, index) => index !== indexToRemove));
        logToConsole(`Removed '${person.personName}' from the enrollment queue.`, 'info');
    };

    const handleStartBatchEnrollment = async () => {
        if (enrollmentQueue.length === 0) {
            await message('The enrollment queue is empty. Please add at least one person.', { title: 'Queue Empty', kind: 'warning' });
            return;
        }
        setIsEnrolling(true);
        setIsProcessing(true);
        setLogs([]); // Clear logs for the new operation
        logToConsole(`Initiating batch enrollment for ${enrollmentQueue.length} person/people...`);

        // Setup EventSource to listen for real-time updates from the backend
        setupLogStream();

        try {
            // The API now expects a specific nested structure
            const payload = {
                people_to_enroll: enrollmentQueue.map(p => ({
                    person_name: p.personName,
                    image_paths: p.imagePaths
                }))
            };
            await apiCall('/api/add-person', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            logToConsole("Enrollment request accepted by backend. Awaiting processing...");
            setEnrollmentQueue([]); // Clear queue after successful submission
        } catch (error) {
            logToConsole(`Enrollment request failed: ${error.message}`, 'error');
            setIsEnrolling(false);
            setIsProcessing(false);
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        }
    };

    const setupLogStream = () => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        const es = new EventSource(`${API_BASE_URL}/api/stream-logs`);
        eventSourceRef.current = es;

        es.onopen = () => {
            logToConsole("Real-time log stream connected.", "success");
        };

        es.onmessage = (event) => {
            const data = JSON.parse(event.data);
            logToConsole(data.message, data.status || 'info');

            if (data.progress !== undefined) {
                setProgress(data.progress);
                const currentTask = isEnrolling ? 'Enrolling' : 'Organizing';
                setProgressLabel(data.progress < 100 ? `${currentTask}: ${data.progress}%` : "Finalizing...");
            }

            if (data.status === 'complete') {
                setProgress(100);
                const completionMsg = isEnrolling ? "Enrollment Complete" : "Organization Complete";
                setProgressLabel(completionMsg);
                logToConsole(isEnrolling ? "Face enrollment finished successfully." : "Photo organization finished.", "success");

                setIsEnrolling(false);
                setIsProcessing(false);
                if (isEnrolling) {
                    setPersonName("");
                    setSelectedImages([]);
                    checkEnrollmentStatus();
                }

                es.close();
                eventSourceRef.current = null;
            } else if (data.status === 'error') {
                logToConsole(`FATAL: ${data.message}`, 'error');
                setIsEnrolling(false);
                setIsProcessing(false);
                es.close();
                eventSourceRef.current = null;
            }

            // NEW: Handle Find & Group completion
            if (operationMode === 'find' && data.status === 'complete') {
                // Try to extract found count and folder name from the message
                let foundCount = 0;
                let folderName = findConfig.folderName || '';
                const match = data.message.match(/Found and copied (\d+) matching photo/);
                if (match) foundCount = parseInt(match[1], 10);
                setFindGroupModal({
                    isOpen: true,
                    foundCount,
                    folderName,
                });
            }
        };

        es.onerror = (err) => {
            logToConsole("Log stream disconnected unexpectedly. The backend may still be running.", "error");
            console.error("EventSource failed:", err);
            es.close();
            eventSourceRef.current = null;
        };
    }

    const handleBrowseFolder = async (target) => {
        try {
            const selected = await open({ directory: true, multiple: false });
            if (selected) {
                if (target === 'source') setSourceFolder(selected);
                else setDestinationFolder(selected);
            }
        } catch (error) {
            logToConsole("Failed to open folder dialog.", "error");
        }
    };

    // UPDATE: loadLastConfig now uses setOperationMode
    const loadLastConfig = async () => {
        try {
            const config = await apiCall('/api/config/load');
            if (Object.keys(config).length > 0) {
                if (config.source_folder) setSourceFolder(config.source_folder);
                if (config.destination_folder) setDestinationFolder(config.destination_folder);
                if (config.sort_method) setSortMethod(config.sort_method);
                if (config.face_mode) setFaceMode(config.face_mode);
                if (typeof config.maintain_hierarchy === 'boolean') setMaintainHierarchy(config.maintain_hierarchy);
                if (config.ignored_subfolders) setIgnoredSubfolders(config.ignored_subfolders);
                if (config.operation_mode) setOperationMode(config.operation_mode); // Use helper
                logToConsole("Loaded previous session settings.", "success");
            }
        } catch (error) {
            console.error("Could not load previous configuration:", error.message);
            logToConsole("Could not load previous session settings.", "warning");
        }
    };

    const loadPresets = async () => {
        try {
            const fetchedPresets = await apiCall('/api/presets/paths');
            setPresets(fetchedPresets);
        } catch (error) { }
    };

    const saveLastConfig = async () => {
        const configToSave = {
            source_folder: sourceFolder,
            destination_folder: destinationFolder,
            sort_method: sortMethod,
            face_mode: faceMode,
            maintain_hierarchy: maintainHierarchy,
            ignored_subfolders: ignoredSubfolders,
            operation_mode: operationMode, 
        };
        try {
            await apiCall('/api/config/save', {
                method: 'POST',
                body: JSON.stringify(configToSave),
            });
        } catch (error) {
            // This is a background task, so we just log the error to the dev console.
            console.error("Could not save current configuration:", error.message);
        }
    };

    const handleSavePreset = async () => {
        if (!sourceFolder || !destinationFolder) {
            await message('Please select both source and destination folders before saving.', { title: 'Missing Information', kind: 'warning' });
            return;
        }
        const name = prompt('Enter a name for this preset:');
        if (name) {
            try {
                await apiCall('/api/presets/paths', {
                    method: 'POST',
                    body: JSON.stringify({ name, source: sourceFolder, destination: destinationFolder }),
                });
                logToConsole(`Preset '${name}' saved successfully.`, 'success');
                await loadPresets();
            } catch (error) { }
        }
    };

    const handlePresetChange = (e) => {
        const presetName = e.target.value;
        setSelectedPreset(presetName);
        if (presets[presetName]) {
            setSourceFolder(presets[presetName].source);
            setDestinationFolder(presets[presetName].destination);
        }
    };

    const resetUi = () => {
        setIsProcessing(false);
        setProgress(0);
        setLogs([]);
        logToConsole("Ready for a new task.");
        setProgressLabel('Processing...');
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
    }

    // THIS FUNCTION IS MODIFIED TO HANDLE ALL MODES
    const handleStartSorting = async () => {
        if (!sourceFolder || !destinationFolder) {
            await message('Please select both source and destination folders.', { title: 'Missing Information', kind: 'warning' });
            return;
        }

        await saveLastConfig();

        setLogs([]);
        setIsProcessing(true);
        logToConsole("Establishing connection to backend for real-time logging...");

        setupLogStream();

        let endpoint = '/api/start-sorting';
        let payload = {};

        if (operationMode === 'standard') {
            const sortingOptions = {
                primary_sort: sortMethod,
                face_mode: faceMode,
                maintain_hierarchy: maintainHierarchy,
            };
            payload = {
                source_folder: sourceFolder,
                destination_folder: destinationFolder,
                sorting_options: sortingOptions,
                ignore_list: ignoredSubfolders,
            };
        } else if (operationMode === 'hybrid') {
            if (!hybridConfig.folderName) {
                await message('Please provide a name for the special folder in the Hybrid Sort configuration.', { title: 'Missing Information', kind: 'warning' });
                setIsProcessing(false);
                logToConsole('Operation cancelled: Missing special folder name.', 'error');
                return;
            }
            const sortingOptions = {
                primary_sort: 'Hybrid',
                base_sort: hybridConfig.baseSort,
                face_mode: faceMode,
                maintain_hierarchy: maintainHierarchy,
                specific_folder_name: hybridConfig.folderName,
                custom_filter: {
                    filter_type: hybridConfig.filterType,
                    ...hybridConfig.filterValues,
                }
            };
            payload = {
                source_folder: sourceFolder,
                destination_folder: destinationFolder,
                sorting_options: sortingOptions,
                ignore_list: ignoredSubfolders,
            };
        } else if (operationMode === 'find') {
            if (!findConfig.folderName) {
                await message('Please provide a name for the destination folder.', { title: 'Missing Information', kind: 'warning' });
                setIsProcessing(false);
                logToConsole('Operation cancelled: Missing destination folder name.', 'error');
                return;
            }
            if (findConfig.years.length === 0 && findConfig.months.length === 0 && findConfig.locations.length === 0 && findConfig.people.length === 0) {
                await message('Please enable and select at least one filter criterion.', { title: 'No Filters Selected', kind: 'warning' });
                setIsProcessing(false);
                logToConsole('Operation cancelled: No filters were selected for the search.', 'error');
                return;
            }
            endpoint = '/api/start-find-group';
            payload = {
                source_folder: sourceFolder,
                destination_folder: destinationFolder,
                find_config: findConfig,
                ignore_list: ignoredSubfolders,
            };
        }

        apiCall(endpoint, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
            .then(() => logToConsole("Job accepted by backend. Awaiting process start..."))
            .catch(() => {
                setIsProcessing(false);
                if (eventSourceRef.current) eventSourceRef.current.close();
            });
    };

    const handleFaceDeleted = () => {
        logToConsole("Enrolled faces list refreshed after deletion.", "info");
        checkEnrollmentStatus(); // This function already fetches enrolled faces count and status
    };

    const handleOpenEnrolledFolder = async (personName) => {
        try {
            // This API endpoint needs to be created in your backend
            const result = await apiCall("/api/open-enrolled-folder", {
                method: 'POST',
                body: JSON.stringify({ person_name: personName })
            });
            if (result.status === 'success') {
                logToConsole(result.message, 'success');
            }
        } catch (error) {
            // apiCall already logs the error
        }
    };

    const handleOpenDestination = async () => {
        if (destinationFolder) {
            try {
                const result = await apiCall("/api/open-folder", {
                    method: 'POST',
                    body: JSON.stringify({ folder_path: destinationFolder })
                });
                if (result.status === 'success') {
                    logToConsole(result.message, 'success');
                }
            } catch (error) {
                // The apiCall function already logs the detailed error
            }
        } else {
            await message("Destination folder is not set.", { title: 'Missing Information', kind: 'warning' });
        }
    }

    const getFolderName = (path) => {
        if (!path) return '';
        return path.split(/[\\/]/).pop();
    }

    // --- NEW Exit Handler ---
    const handleExit = async () => {
        // Check if any operation is ongoing
        const isOperationRunning = isProcessing || isEnrolling;

        if (isOperationRunning) {
            // Show custom modal for ongoing operations
            setShowExitModal(true);
        } else {
            // For non-critical exit, show simple confirmation
            try {
                const confirmed = await message("Are you sure you want to exit the application?", {
                    title: 'Confirm Exit',
                    kind: 'warning',
                    okLabel: 'Exit',
                    cancelLabel: 'Cancel'
                });

                if (confirmed) {
                    await exitApplication();
                }
            } catch (error) {
                console.error('Error showing exit confirmation:', error);
                // Fallback to direct exit if dialog fails
                await exitApplication();
            }
        }
    };

    const handleConfirmExit = async () => {
        setShowExitModal(false);
        await exitApplication();
    };

    const handleCancelExit = () => {
        setShowExitModal(false);
    };

    const exitApplication = async () => {
        // Cleanup resources
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }

        // Save current configuration before exit
        try {
            await saveLastConfig();
        } catch (error) {
            console.log('Could not save config before exit:', error);
        }

        // Close the application
        try {
            const appWindow = getCurrentWindow();
            await appWindow.close();
        } catch (error) {
            console.error('Failed to exit application:', error);
            // Fallback to browser close
            window.close();
        }
    };

    // --- Updated Reload Handler ---
    const handleReload = async () => {
        // Check if any operation is ongoing
        const isOperationRunning = isProcessing || isEnrolling;

        if (isOperationRunning) {
            // Show custom modal for ongoing operations
            setShowReloadModal(true);
        } else {
            // For non-critical reload, show simple confirmation
            try {
                const confirmed = await message("Are you sure you want to reload the application?", {
                    title: 'Confirm Reload',
                    kind: 'warning',
                    okLabel: 'Reload',
                    cancelLabel: 'Cancel'
                });

                if (confirmed) {
                    // Cleanup resources before reload
                    if (eventSourceRef.current) {
                        eventSourceRef.current.close();
                        eventSourceRef.current = null;
                    }

                    // Save current configuration before reload
                    try {
                        await saveLastConfig();
                    } catch (error) {
                        console.log('Could not save config before reload:', error);
                    }

                    window.location.reload();
                }
            } catch (error) {
                console.error('Error showing reload confirmation:', error);
                // Fallback to direct reload if dialog fails
                window.location.reload();
            }
        }
    };

    const handleConfirmReload = async () => {
        setShowReloadModal(false);
        // Cleanup resources before reload
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }

        // Save current configuration before reload
        try {
            await saveLastConfig();
        } catch (error) {
            console.log('Could not save config before reload:', error);
        }

        window.location.reload();
    };

    const handleCancelReload = () => {
        setShowReloadModal(false);
    };

    // --- UI Rendering ---
    const themeClass = {
        standard: 'theme-standard',
        hybrid: 'theme-hybrid',
        find: 'theme-find',
    }[operationMode];

    const getOperationName = () => {
        switch (operationMode) {
            case 'hybrid': return 'Start Hybrid Sort';
            case 'find': return 'Start Find & Group';
            default: return 'Start Organizing';
        }
    };

    return (
        <div className={`app-container ${themeClass}`}>
            {!isBackendConnected && (
                <div className="connection-error-banner">
                    <p>Connection to backend lost. Attempting to reconnect...</p>
                </div>
            )}
            <div className="app-header">
                <h1>Local Lens</h1>
                <SortingModeSelector
                    operationMode={operationMode}
                    setOperationMode={setOperationMode}
                    onEnrollClick={() => setShowFaceEnrollmentModal(true)}
                />

                {/* Exit Button */}
                <button onClick={handleExit} className="btn-exit" aria-label="Exit Application" title="Exit Application">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16,17 21,12 16,7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                </button>

                {/* Reload Button */}
                <button
                    className="btn-reload"
                    onClick={handleReload}
                    title="Reload Application"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="23,4 23,10 17,10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                </button>
            </div>

            {/* Exit Confirmation Modal */}
            {showExitModal && (
                <div className="modal-overlay" onClick={handleCancelExit}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Confirm Exit</h3>
                        </div>
                        <div className="modal-body">
                            <div className="modal-icon">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="12" />
                                    <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                            </div>
                            <p>
                                <strong>An operation is currently in progress.</strong>
                                <br /><br />
                                Exiting now will:
                                <br />
                                <span className="consequence-list">
                                    • Stop the current {isEnrolling ? 'enrollment' : 'organization'} process
                                    <br />
                                    • Release all system resources
                                    <br />
                                    • Save your current configuration
                                    <br />
                                    • Any incomplete work will be lost
                                </span>
                                <br /><br />
                                Are you sure you want to exit?
                            </p>
                        </div>
                        <div className="modal-actions">
                            <button
                                className="btn btn-secondary modal-btn"
                                onClick={handleCancelExit}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-danger modal-btn"
                                onClick={handleConfirmExit}
                            >
                                Confirm Exit
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reload Confirmation Modal */}
            {showReloadModal && (
                <div className="modal-overlay" onClick={handleCancelReload}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Confirm Reload</h3>
                        </div>
                        <div className="modal-body">
                            <div className="modal-icon">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="12" />
                                    <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                            </div>
                            <p>
                                <strong>An operation is currently in progress.</strong>
                                <br /><br />
                                Reloading now will:
                                <br />
                                <span className="consequence-list">
                                    • Stop the current {isEnrolling ? 'enrollment' : 'organization'} process
                                    <br />
                                    • Reset the application to its initial state
                                    <br />
                                    • Save your current configuration
                                    <br />
                                    • Any incomplete work will be lost
                                </span>
                                <br /><br />
                                Are you sure you want to reload?
                            </p>
                        </div>
                        <div className="modal-actions">
                            <button
                                className="btn btn-secondary modal-btn"
                                onClick={handleCancelReload}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-danger modal-btn"
                                onClick={handleConfirmReload}
                            >
                                Confirm Reload
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <main className="app-main">
                <div className="setup-grid">
                    <div className="setup-column">
                        <PathSelector
                            label="Source Folder"
                            path={sourceFolder}
                            handleSelectFolder={() => handleBrowseFolder('source')}
                        />
                        <PathSelector
                            label="Destination Folder"
                            path={destinationFolder}
                            handleSelectFolder={() => handleBrowseFolder('destination')}
                        />
                        <PresetManager
                            presets={presets}
                            selectedPreset={selectedPreset}
                            handleSelectPreset={handlePresetChange}
                            handleSavePreset={handleSavePreset}
                            showSaveButton={showSaveButton}
                        />
                    </div>
                    <div className="setup-column">
                        {/* NEW: Conditional rendering with animations for component swapping */}
                        {faceEnrollmentDisplay !== 'hidden' && (
                            <div
                                className={`face-enrollment-wrapper ${faceEnrollmentDisplay}`}
                                onAnimationEnd={() => {
                                    if (faceEnrollmentDisplay === 'exiting') setFaceEnrollmentDisplay('hidden');
                                    if (faceEnrollmentDisplay === 'entering') setFaceEnrollmentDisplay('visible');
                                }}
                            >
                                <FaceEnrollment
                                    isEnrolling={isEnrolling}
                                    isProcessing={isProcessing}
                                    selectedImages={selectedImages}
                                    personName={personName}
                                    handleSelectImages={handleSelectImages}
                                    setPersonName={setPersonName}
                                    enrollmentQueue={enrollmentQueue}
                                    handleAddToQueue={handleAddToQueue}
                                    handleRemoveFromQueue={handleRemoveFromQueue}
                                    handleStartBatchEnrollment={handleStartBatchEnrollment}
                                    onViewEnrolledClick={() => setShowEnrolledFacesModal(true)}
                                />
                            </div>
                        )}

                        {operationMode === 'standard' && faceEnrollmentDisplay !== 'hidden' && (
                            <EnrollmentProgress
                                enrollmentProgress={enrollmentProgress}
                                enrollmentMessage={enrollmentMessage}
                            />
                        )}

                        {/* For hybrid/find modes, SubfolderSelector is rendered inside the grid */}
                        {operationMode !== 'standard' && subfolderSelectorDisplay !== 'hidden' && (
                            <SubfolderSelector
                                subfolders={subfolders}
                                ignoredSubfolders={ignoredSubfolders}
                                setIgnoredSubfolders={setIgnoredSubfolders}
                                isProcessing={isProcessing || isEnrolling}
                                stats={folderStats}
                                className={subfolderSelectorDisplay}
                                onAnimationEnd={() => {
                                    if (subfolderSelectorDisplay === 'exiting') setSubfolderSelectorDisplay('hidden');
                                    if (subfolderSelectorDisplay === 'entering') setSubfolderSelectorDisplay('visible');
                                }}
                            />
                        )}
                    </div>
                </div>

                {/* For standard mode, SubfolderSelector is rendered outside the grid to take full width */}
                {operationMode === 'standard' && subfolderSelectorDisplay !== 'hidden' && (
                    <SubfolderSelector
                        subfolders={subfolders}
                        ignoredSubfolders={ignoredSubfolders}
                        setIgnoredSubfolders={setIgnoredSubfolders}
                        isProcessing={isProcessing || isEnrolling}
                        stats={folderStats}
                        className={subfolderSelectorDisplay}
                        onAnimationEnd={() => {
                            if (subfolderSelectorDisplay === 'exiting') setSubfolderSelectorDisplay('hidden');
                            if (subfolderSelectorDisplay === 'entering') setSubfolderSelectorDisplay('visible');
                        }}
                    />
                )}

                <HierarchyToggle
                    maintainHierarchy={maintainHierarchy}
                    setMaintainHierarchy={setMaintainHierarchy}
                    isProcessing={isProcessing || isEnrolling}
                />

                <hr className="divider" />

                {/* Content changes based on selected mode */}
                <div className="mode-content-wrapper">
                    {operationMode === 'standard' && (
                        <div className="mode-content">
                            <SortingOptions
                                sortMethod={sortMethod}
                                setSortMethod={setSortMethod}
                                isProcessing={isProcessing || isEnrolling}
                                isEnrolled={isEnrolled}
                                enrolledCount={enrolledCount}
                                faceMode={faceMode}
                                setFaceMode={setFaceMode}
                            />
                        </div>
                    )}
                    {operationMode === 'hybrid' && (
                        <div className="mode-content">
                            <HybridSortConfig
                                metadata={metadata}
                                isScanningMetadata={isScanningMetadata}
                                hybridConfig={hybridConfig}
                                setHybridConfig={setHybridConfig}
                                isEnrolled={isEnrolled}
                                enrolledCount={enrolledCount}
                                faceMode={faceMode}
                                setFaceMode={setFaceMode}
                                isProcessing={isProcessing || isEnrolling}
                            />
                        </div>
                    )}
                    {operationMode === 'find' && (
                        <div className="mode-content">
                           <FindGroupConfig
                                metadata={metadata}
                                isScanningMetadata={isScanningMetadata}
                                findConfig={findConfig}
                                setFindConfig={setFindConfig}
                                isEnrolled={isEnrolled}
                                isProcessing={isProcessing || isEnrolling}
                           />
                        </div>
                    )}
                </div>


                <div style={{ marginTop: '1.5rem' }}>
                    <button onClick={handleStartSorting} disabled={isProcessing || isEnrolling} className="btn btn-primary">
                        {isProcessing ? (isEnrolling ? 'Enrolling...' : 'Processing...') : getOperationName()}
                    </button>
                </div>
            </main>

            {(isProcessing || logs.length > 1) && (
                <footer ref={footerRef} className="app-footer">
                    <ProgressTracker progress={progress} progressLabel={progressLabel} />
                    <LogConsole ref={logConsoleRef} logs={logs} />
                    <div className="footer-actions">
                        {!isProcessing && <button onClick={resetUi} className="btn btn-danger">Start Over</button>}
                        <button onClick={handleOpenDestination} className="btn btn-secondary">
                            Open "{getFolderName(destinationFolder) || 'Destination'}"
                        </button>
                    </div>
                </footer>
            )}

            {/* NEW: Enrolled Faces Modal */}
            <EnrolledFacesModal
                isVisible={showEnrolledFacesModal}
                onClose={() => setShowEnrolledFacesModal(false)}
                onOpenFolder={handleOpenEnrolledFolder}
                apiCall={apiCall}
                logToConsole={logToConsole}
                onFaceDeleted={handleFaceDeleted}
            />

            <FaceEnrollmentModal
                isVisible={showFaceEnrollmentModal}
                onClose={() => setShowFaceEnrollmentModal(false)}
                isEnrolling={isEnrolling}
                isProcessing={isProcessing}
                selectedImages={selectedImages}
                personName={personName}
                handleSelectImages={handleSelectImages}
                setPersonName={setPersonName}
                enrollmentQueue={enrollmentQueue}
                handleAddToQueue={handleAddToQueue}
                handleRemoveFromQueue={handleRemoveFromQueue}
                handleStartBatchEnrollment={handleStartBatchEnrollment}
                onViewEnrolledClick={() => {
                    setShowFaceEnrollmentModal(false);
                    setShowEnrolledFacesModal(true);
                }}
            />

            <FindGroupResultModal
                isOpen={findGroupModal.isOpen}
                foundCount={findGroupModal.foundCount}
                folderName={findGroupModal.folderName}
                onClose={() => setFindGroupModal(m => ({ ...m, isOpen: false }))}
                onGoToDestination={handleOpenDestination}
            />
        </div>
    );
}

export default App;
