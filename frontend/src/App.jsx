import React, { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core'; // <-- ADD THIS
import { open, message } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import FaceEnrollment from './components/FaceEnrollment';
import SortingOptions from './components/SortingOptions';
import EnrollmentProgress from './components/EnrollmentProgress';
import PathSelector from './components/PathSelector';
import PresetManager from './components/PresetManager';
import OperationModeToggle from './components/OperationModeToggle'; // <-- ADD THIS
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
import MoveCompleteModal from './components/MoveCompleteModal'; // <-- ADD THIS
import ConfirmationModal from './components/ConfirmationModal'; 
import UpdateChecker from './components/UpdateChecker'; // <-- ADD: Auto-update notification
import TutorialOverlay from './components/TutorialOverlay'; // <-- ADD THIS
import TutorialMenu from './components/TutorialMenu'; // <-- ADD THIS
import { useTutorial } from './context/TutorialContext'; // <-- ADD THIS
import { version } from '../package.json';

import './App.css';

function App() {
    const { startTutorial: startTutorialBase, isDemoMode, currentStep } = useTutorial();
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

    // Tutorial handler - ensures standard mode before starting (without saving to localStorage)
    const handleStartTutorial = () => {
        if (operationMode !== 'standard') {
            setOperationModeRaw('standard');
            // Small delay to allow mode switch animation to complete
            setTimeout(() => startTutorialBase(), 300);
        } else {
            startTutorialBase();
        }
    };

    // Check if this is the user's first time opening the app
    const checkFirstTimeUser = () => {
        const hasSeenTutorial = localStorage.getItem('has_seen_tutorial');
        if (!hasSeenTutorial) {
            // Mark as seen so it doesn't auto-start again
            localStorage.setItem('has_seen_tutorial', 'true');
            // Auto-start tutorial after a brief delay for UI to settle
            // Use handleStartTutorial to ensure standard mode is set
            setTimeout(() => {
                handleStartTutorial();
            }, 800);
            // Return true to signal that we are in a first-time tutorial session
            return true;
        }
        return false;
    };

    const [sourceFolder, setSourceFolder] = useState('');
    const [destinationFolder, setDestinationFolder] = useState('');
    const [presets, setPresets] = useState({});
    const [selectedPreset, setSelectedPreset] = useState('');
    const [sortMethod, setSortMethod] = useState('Date');
    const [faceMode, setFaceMode] = useState('balanced');
    // ADD THIS STATE FOR THE NEW TOGGLE
    const [fileOperationMode, setFileOperationMode] = useState('copy');
    // const [operationMode, setOperationModeRaw] = useState(getInitialOperationMode()); 
    // FIX: Default state for hierarchy is now 'false' (Flat Output).
    const [maintainHierarchy, setMaintainHierarchy] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressLabel, setProgressLabel] = useState('Ready for a new task !');
    // NEW: State for real-time analytics
    const [analytics, setAnalytics] = useState({ scan_rate: '0.0', data_flow: '0.0', quality: 'N/A' });
    const [logs, setLogs] = useState([]);
    const [showSaveButton, setShowSaveButton] = useState(false);
    const logConsoleRef = useRef(null);
    const eventSourceRef = useRef(null);
    const footerRef = useRef(null);
    // FIX: Ref to prevent duplicate startup calls in React's Strict Mode.
    const prevIsEnrolling = useRef(false); // NEW: Ref to track the previous state of enrollment.
    // NEW: State and ref for backend connection retry logic
    const [isBackendConnected, setIsBackendConnected] = useState(true);
    const retryTimeoutRef = useRef(null);

    // --- Backend Connection State ---
    const [backendPort, setBackendPort] = useState(null);
    const [isBackendReady, setIsBackendReady] = useState(false);
    const startupRan = useRef(false);

    // --- NEW State for Subfolders ---
    const [subfolders, setSubfolders] = useState([]);
    const [ignoredSubfolders, setIgnoredSubfolders] = useState([]);
    const [folderStats, setFolderStats] = useState(null);
    const [demoIgnoredSubfolders, setDemoIgnoredSubfolders] = useState([]);

    // --- Demo data for tutorial ---
    const demoSubfolders = [
        {
            name: 'Family Photos',
            path: '/demo/Family Photos',
            children: [
                { name: 'Summer Vacation 2024', path: '/demo/Family Photos/Summer Vacation 2024', children: [] },
                { name: 'Birthday Party', path: '/demo/Family Photos/Birthday Party', children: [] }
            ]
        },
        {
            name: 'Work Events',
            path: '/demo/Work Events',
            children: [
                { name: 'Conference 2024', path: '/demo/Work Events/Conference 2024', children: [] }
            ]
        },
        {
            name: 'Random Screenshots',
            path: '/demo/Random Screenshots',
            children: []
        }
    ];
    const demoFolderStats = { file_count: 247, folder_count: 6 };

    // Use demo data when tutorial requires it
    const showDemoSubfolders = isDemoMode && currentStep?.requiresDemoData === 'subfolders';
    const effectiveSubfolders = showDemoSubfolders ? demoSubfolders : subfolders;
    const effectiveFolderStats = showDemoSubfolders ? demoFolderStats : folderStats;
    const effectiveIgnoredSubfolders = showDemoSubfolders ? demoIgnoredSubfolders : ignoredSubfolders;
    const setEffectiveIgnoredSubfolders = showDemoSubfolders ? setDemoIgnoredSubfolders : setIgnoredSubfolders;

    // --- Demo animation for subfolder toggle ---
    useEffect(() => {
        if (!isDemoMode || currentStep?.demoAnimation !== 'subfolder-toggle') {
            // Reset demo state when not in demo animation
            if (demoIgnoredSubfolders.length > 0) {
                setDemoIgnoredSubfolders([]);
            }
            return;
        }

        // Demo sequence: Check parent -> Check child -> Uncheck parent (child stays)
        const parentPath = '/demo/Family Photos';
        const childPath = '/demo/Family Photos/Summer Vacation 2024';
        const allChildPaths = [
            '/demo/Family Photos/Summer Vacation 2024',
            '/demo/Family Photos/Birthday Party'
        ];

        let step = 0;
        const runDemoStep = () => {
            step++;
            switch (step) {
                case 1:
                    // Step 1: Check parent (this checks parent and all children)
                    setDemoIgnoredSubfolders([parentPath, ...allChildPaths]);
                    break;
                case 2:
                    // Step 2: Uncheck parent but keep one child checked
                    setDemoIgnoredSubfolders([childPath]);
                    break;
                case 3:
                    // Step 3: Uncheck everything
                    setDemoIgnoredSubfolders([]);
                    break;
                case 4:
                    // Reset and loop
                    step = 0;
                    break;
                default:
                    break;
            }
        };

        // Initial delay before starting
        const initialTimeout = setTimeout(() => {
            runDemoStep();
        }, 800);

        // Run the demo loop
        const interval = setInterval(runDemoStep, 1500);

        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
        };
    }, [isDemoMode, currentStep?.demoAnimation]);

    // --- Demo state for hierarchy toggle ---
    const [demoMaintainHierarchy, setDemoMaintainHierarchy] = useState(false);
    const showDemoHierarchy = isDemoMode && currentStep?.demoAnimation === 'hierarchy-toggle';
    const effectiveMaintainHierarchy = showDemoHierarchy ? demoMaintainHierarchy : maintainHierarchy;
    const setEffectiveMaintainHierarchy = showDemoHierarchy ? setDemoMaintainHierarchy : setMaintainHierarchy;

    // --- Demo animation for hierarchy toggle ---
    useEffect(() => {
        if (!isDemoMode || currentStep?.demoAnimation !== 'hierarchy-toggle') {
            return;
        }

        let isOn = false;
        const toggleDemo = () => {
            isOn = !isOn;
            setDemoMaintainHierarchy(isOn);
        };

        // Initial delay before starting
        const initialTimeout = setTimeout(toggleDemo, 800);

        // Toggle every 1.5 seconds
        const interval = setInterval(toggleDemo, 1500);

        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
            setDemoMaintainHierarchy(false);
        };
    }, [isDemoMode, currentStep?.demoAnimation]);

    // --- Highlight description for face-enrollment tutorial step ---
    useEffect(() => {
        if (!isDemoMode || !currentStep?.highlightDescription) {
            // Remove highlight if not in demo mode or step doesn't need it
            const el = document.querySelector('[data-tutorial-target="face-enrollment-description"]');
            if (el) el.classList.remove('tutorial-highlight');
            return;
        }

        const el = document.querySelector('[data-tutorial-target="face-enrollment-description"]');
        if (el) {
            el.classList.add('tutorial-highlight');
        }

        return () => {
            if (el) el.classList.remove('tutorial-highlight');
        };
    }, [isDemoMode, currentStep?.highlightDescription]);

    // --- Demo state for face enrollment workflow ---
    const [demoSelectedImages, setDemoSelectedImages] = useState([]);
    const [demoPersonName, setDemoPersonName] = useState('');
    const [demoEnrollmentQueue, setDemoEnrollmentQueue] = useState([]);
    const [demoIsEnrolled, setDemoIsEnrolled] = useState(false);
    const [demoEnrolledCount, setDemoEnrolledCount] = useState(0);
    const [showDemoEnrolledModal, setShowDemoEnrolledModal] = useState(false);

    // --- State for restoring config after first-time tutorial ---
    const [stashedConfig, setStashedConfig] = useState(null);
    const [isFirstTimeTutorial, setIsFirstTimeTutorial] = useState(false);

    // --- Demo state for operation terminal/footer section ---
    const showDemoFooter = isDemoMode && (
        currentStep?.requiresDemoData === 'show-footer' ||
        currentStep?.requiresDemoData === 'show-abort-btn'
    );
    const showDemoAbortBtn = isDemoMode && currentStep?.requiresDemoData === 'show-abort-btn';

    // Demo enrolled faces data
    const demoEnrolledFaces = [
        { name: 'Person A', count: 8 },
        { name: 'Person B', count: 10 },
        { name: 'Person C', count: 7 }
    ];

    // Check if we should use demo enrollment data
    const isEnrollmentDemoStep = isDemoMode && (
        currentStep?.demoAnimation === 'select-photos-demo' ||
        currentStep?.requiresDemoData === 'enrollment-name' ||
        currentStep?.demoAnimation === 'add-person-demo' ||
        currentStep?.demoAnimation === 'show-enrolled-modal' ||
        currentStep?.requiresDemoData === 'enrolled-faces-demo'
    );

    // --- Demo animation for select photos ---
    useEffect(() => {
        if (!isDemoMode || currentStep?.demoAnimation !== 'select-photos-demo') {
            setDemoSelectedImages([]);
            return;
        }

        // Simulate selecting photos
        const timeout = setTimeout(() => {
            setDemoSelectedImages([
                'photo1.jpg', 'photo2.jpg', 'photo3.jpg', 'photo4.jpg',
                'photo5.jpg', 'photo6.jpg', 'photo7.jpg', 'photo8.jpg'
            ]);
        }, 600);

        return () => {
            clearTimeout(timeout);
            setDemoSelectedImages([]);
        };
    }, [isDemoMode, currentStep?.demoAnimation]);

    // --- Demo data for person name input ---
    useEffect(() => {
        if (!isDemoMode || currentStep?.requiresDemoData !== 'enrollment-name') {
            return;
        }

        // Type out the demo name character by character
        const demoName = 'Person A';
        let index = 0;
        setDemoPersonName('');

        const typeInterval = setInterval(() => {
            if (index < demoName.length) {
                setDemoPersonName(demoName.substring(0, index + 1));
                index++;
            } else {
                clearInterval(typeInterval);
            }
        }, 100);

        return () => {
            clearInterval(typeInterval);
        };
    }, [isDemoMode, currentStep?.requiresDemoData]);

    // --- Demo animation for add person ---
    useEffect(() => {
        if (!isDemoMode || currentStep?.demoAnimation !== 'add-person-demo') {
            return;
        }

        // Show a person being added to queue
        const timeout = setTimeout(() => {
            setDemoEnrollmentQueue([
                { personName: 'Person A', imagePaths: ['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg', 'p5.jpg', 'p6.jpg', 'p7.jpg', 'p8.jpg'] }
            ]);
        }, 500);

        return () => {
            clearTimeout(timeout);
        };
    }, [isDemoMode, currentStep?.demoAnimation]);

    // --- Demo animation for showing enrolled modal ---
    useEffect(() => {
        if (!isDemoMode || currentStep?.demoAnimation !== 'show-enrolled-modal') {
            setShowDemoEnrolledModal(false);
            return;
        }

        // Open the demo modal after a delay
        const timeout = setTimeout(() => {
            setShowDemoEnrolledModal(true);
        }, 800);

        return () => {
            clearTimeout(timeout);
            setShowDemoEnrolledModal(false);
        };
    }, [isDemoMode, currentStep?.demoAnimation]);

    // --- Reset demo enrollment state when tutorial ends ---
    useEffect(() => {
        if (!isDemoMode) {
            setDemoSelectedImages([]);
            setDemoPersonName('');
            setDemoEnrollmentQueue([]);
            setDemoIsEnrolled(false);
            setDemoEnrolledCount(0);
            setShowDemoEnrolledModal(false);
        }
    }, [isDemoMode]);

    // --- Demo state for sort method and face mode ---
    const [demoSortMethod, setDemoSortMethod] = useState('Date');
    const [demoFaceMode, setDemoFaceMode] = useState('fast');

    // Check if we should use demo sort/faceMode data
    const isSortDemoStep = isDemoMode && (
        currentStep?.demoAnimation === 'select-sort-by-faces' ||
        currentStep?.requiresDemoData === 'enrolled-faces-demo'
    );
    const isFaceModeDemoStep = isDemoMode && (
        currentStep?.demoAnimation === 'show-face-mode-fast' ||
        currentStep?.demoAnimation === 'show-face-mode-balanced' ||
        currentStep?.demoAnimation === 'show-face-mode-accurate'
    );

    // Effective sort method - use demo when in sort demo steps
    const effectiveSortMethod = isSortDemoStep ? demoSortMethod : sortMethod;
    const effectiveFaceMode = isFaceModeDemoStep ? demoFaceMode : faceMode;

    // --- Demo animation for selecting Sort by Faces ---
    useEffect(() => {
        if (!isDemoMode || currentStep?.demoAnimation !== 'select-sort-by-faces') {
            return;
        }

        // Select "People" sorting method after a delay
        const timeout = setTimeout(() => {
            setDemoSortMethod('People');
        }, 500);

        return () => {
            clearTimeout(timeout);
        };
    }, [isDemoMode, currentStep?.demoAnimation]);

    // --- Demo animation for face mode dropdown ---
    useEffect(() => {
        if (!isDemoMode) {
            setDemoFaceMode('fast');
            return;
        }

        if (currentStep?.demoAnimation === 'show-face-mode-fast') {
            setDemoFaceMode('fast');
        } else if (currentStep?.demoAnimation === 'show-face-mode-balanced') {
            setDemoFaceMode('balanced');
        } else if (currentStep?.demoAnimation === 'show-face-mode-accurate') {
            setDemoFaceMode('accurate');
        }
    }, [isDemoMode, currentStep?.demoAnimation]);

    // --- Keep demo sort method as People when in enrolled-faces-demo steps ---
    useEffect(() => {
        if (isDemoMode && currentStep?.requiresDemoData === 'enrolled-faces-demo') {
            setDemoSortMethod('People');
        }
    }, [isDemoMode, currentStep?.requiresDemoData]);

    // --- Reset demo sort state and restore operation mode when tutorial ends ---
    useEffect(() => {
        if (!isDemoMode) {
            setDemoSortMethod('Date');
            setDemoFaceMode('fast');
            // Restore the user's saved operation mode from localStorage
            const savedMode = localStorage.getItem('operation_mode');
            if (savedMode && ['standard', 'hybrid', 'find'].includes(savedMode)) {
                setOperationMode(savedMode);
            }
        }
    }, [isDemoMode]);

    // --- Demo animation for selecting Hybrid/Find mode (uses Raw setter to avoid saving to localStorage) ---
    useEffect(() => {
        if (!isDemoMode) return;
        
        if (currentStep?.demoAnimation === 'select-hybrid-mode') {
            // Select Hybrid mode after a short delay for visual effect
            const timeout = setTimeout(() => {
                setOperationModeRaw('hybrid');
            }, 400);
            return () => clearTimeout(timeout);
        } else if (currentStep?.demoAnimation === 'select-find-mode') {
            // Select Find mode after a short delay for visual effect
            const timeout = setTimeout(() => {
                setOperationModeRaw('find');
            }, 400);
            return () => clearTimeout(timeout);
        } else if (operationMode === 'hybrid' || operationMode === 'find') {
            // If we moved away from an advanced mode step, reset to standard
            setOperationModeRaw('standard');
        }
    }, [isDemoMode, currentStep?.demoAnimation]);

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

    // Effective values - use demo data when in enrollment demo steps
    const effectiveSelectedImages = isEnrollmentDemoStep ? demoSelectedImages : selectedImages;
    const effectivePersonName = isEnrollmentDemoStep ? demoPersonName : personName;
    const effectiveEnrollmentQueue = isEnrollmentDemoStep ? demoEnrollmentQueue : enrollmentQueue;
    const effectiveIsEnrolled = (isDemoMode && currentStep?.requiresDemoData === 'enrolled-faces-demo') ? true : isEnrolled;
    const effectiveEnrolledCount = (isDemoMode && currentStep?.requiresDemoData === 'enrolled-faces-demo') ? 3 : enrolledCount;

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

    // --- NEW State for Invalid Preset Error Modal ---
    const [invalidPresetError, setInvalidPresetError] = useState({ show: false, presetName: '', invalidPaths: [] });

    // --- NEW State for Delete Preset Confirmation Modal ---
    const [deletePresetConfirm, setDeletePresetConfirm] = useState({ show: false, presetName: '' });

    // --- NEW State for Move Complete Modal ---
    const [showMoveCompleteModal, setShowMoveCompleteModal] = useState(false);

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

    // Effect 1: Listen for the backend port from Tauri
    useEffect(() => {
        const portSetupRef = { current: false }; // Use a ref to prevent race conditions

        const setupPort = (port) => {
            if (port && !portSetupRef.current) {
                console.log("SUCCESS: Backend port configured:", port);
                setBackendPort(port);
                setIsBackendReady(true);
                portSetupRef.current = true;
            }
        };

        // Try invoking for reloads. This is faster if the backend is already running.
        invoke('get_backend_port')
            .then(setupPort)
            .catch(e => console.error("Could not invoke get_backend_port:", e));

        // Also listen for the event for the initial launch.
        const unlistenPromise = listen('backend-ready', (event) => {
            setupPort(event.payload);
        });

        // Cleanup function
        return () => {
            unlistenPromise.then(f => f());
        };
    }, []); // Empty dependency array means this runs only once on mount.

    // Effect 2: Run startup tasks ONLY AFTER the backend is ready
    useEffect(() => {
        console.log(`STEP 3: Startup effect triggered. isBackendReady: ${isBackendReady}`);

        // We check both isBackendReady and that startup hasn't run yet.
        if (isBackendReady && !startupRan.current) {
            console.log("STEP 4: Backend is ready! Running startup checks...");
            
            const runAsyncStartup = async () => {
                runStartupChecks();
                await loadPresets();
                
                const isFirstTime = checkFirstTimeUser();
                if (isFirstTime) {
                    setIsFirstTimeTutorial(true);
                    // Stash the config but don't apply it, so we start fresh.
                    try {
                        const config = await apiCall('/api/config/load');
                        if (Object.keys(config).length > 0) {
                            setStashedConfig(config);
                            logToConsole("Stashed previous session settings for after the tutorial.", "info");
                        }
                    } catch (error) {
                        // It's okay if this fails, means no config to stash.
                        console.error("No previous config to stash:", error.message);
                    }
                } else {
                    // Not the first time, load config as normal.
                    await loadLastConfig();
                }
            };

            runAsyncStartup();
            // Mark startup as complete to prevent re-running
            startupRan.current = true;
        }
    }, [isBackendReady]); // This effect depends ONLY on isBackendReady.

    // --- NEW: Effect to restore stashed config after first-time tutorial ---
    useEffect(() => {
        const restoreConfig = async () => {
            if (!isDemoMode && isFirstTimeTutorial && stashedConfig) {
                logToConsole("Tutorial finished. Restoring previous session settings...", "info");
                await applyConfig(stashedConfig);
                // Clear the stash and flag so this doesn't run again.
                setStashedConfig(null);
                setIsFirstTimeTutorial(false);
            }
        };
        restoreConfig();
    }, [isDemoMode, isFirstTimeTutorial, stashedConfig]);

    // Effect 3: Log scrolling effect
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
                    // This initial call gets the full list of subfolders and initial stats.
                    const response = await apiCall('/api/list-subfolders', {
                        method: 'POST',
                        body: JSON.stringify({ path: sourceFolder, ignore_list: [] }),
                    });
                    setSubfolders(response.subfolders || []);
                    setFolderStats(response.stats || null);
                    setIgnoredSubfolders([]); // Reset ignored list when source changes
                } catch (error) {
                    setSubfolders([]);
                    setFolderStats(null);
                }
            } else {
                setSubfolders([]);
                setIgnoredSubfolders([]);
                setFolderStats(null);
            }
        };

        const debounceTimer = setTimeout(fetchSubfolders, 500);
        return () => clearTimeout(debounceTimer);
    }, [sourceFolder]); // This effect runs ONLY when the source folder changes.

    // ADD THIS NEW EFFECT to update stats when the ignore list changes.
    useEffect(() => {
        const updateStats = async () => {
            if (sourceFolder) {
                try {
                    // This call only fetches the new stats based on the current ignore list.
                    const response = await apiCall('/api/list-subfolders', {
                        method: 'POST',
                        body: JSON.stringify({ path: sourceFolder, ignore_list: ignoredSubfolders }),
                    });
                    // Only update the stats, not the subfolder list itself.
                    setFolderStats(response.stats || null);
                } catch (error) {
                    setFolderStats(null);
                }
            }
        };

        // No need to run on initial load, the first effect handles that.
        if (sourceFolder) {
            updateStats();
        }
    }, [ignoredSubfolders]); // This effect runs ONLY when the ignore list changes.

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
        if (!isBackendReady || !backendPort) {
            throw new Error(`API call to ${endpoint} failed: Backend is not ready.`);
        }
        const API_BASE_URL = `http://127.0.0.1:${backendPort}`;

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
                // Create an error with additional info for callers to distinguish error types
                const error = new Error(result.detail || result.message || `API call to ${endpoint} failed: ${response.statusText}`);
                error.status = response.status;
                error.isHttpError = true;
                throw error;
            }
            return result;
        } catch (error) {
            // Only mark backend as disconnected for actual network failures, not HTTP errors (4xx, 5xx)
            if (!error.isHttpError && isBackendConnected) {
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

    // Helper function to validate if a path exists on the filesystem
    const validatePath = async (path) => {
        if (!path) return false;
        try {
            await apiCall('/api/validate-path', {
                method: 'POST',
                body: JSON.stringify({ path }),
            });
            return true;
        } catch (error) {
            return false;
        }
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

        if (!isBackendReady || !backendPort) {
            logToConsole("Cannot start log stream: Backend is not connected.", "error");
            return;
        }
        const API_BASE_URL = `http://127.0.0.1:${backendPort}`;

        const es = new EventSource(`${API_BASE_URL}/api/stream-logs`);
        eventSourceRef.current = es;

        es.onopen = () => {
            logToConsole("Real-time log stream connected.", "success");
        };

        es.onmessage = (event) => {
            const data = JSON.parse(event.data);
            const isFinalStatus = data.status === 'complete' || data.status === 'aborted' || data.status === 'error';

            // Determine if the log is for the current operation
            const isEnrollmentLog = isEnrolling && data.source === 'enrollment';
            const isSortingLog = !isEnrolling && data.source !== 'enrollment'; 
            
            // If it's not a final status message and it doesn't match the current operation, log it as a system message and ignore for progress.
            if (!isFinalStatus && !isEnrollmentLog && !isSortingLog) {
                logToConsole(`[System]: ${data.message}`, data.status || 'info');
                return;
            }

            logToConsole(data.message, data.status || 'info');

            if (data.progress !== undefined) {
                setProgress(data.progress);
            }

            // NEW: Update analytics if they are in the payload
            if (data.analytics) {
                setAnalytics(data.analytics);
            }

            // Handle completion or abortion
            if (isFinalStatus) {
                // Ensure the progress bar visually hits 100% before we reset.
                setProgress(100);
                
                let completionMsg = "Operation Finished";
                if (data.status === 'aborted') {
                    completionMsg = "Operation Aborted";
                } else if (data.status === 'complete') {
                    completionMsg = isEnrolling ? "Enrollment Complete" : "Organization Complete";
                } else if (data.status === 'error') {
                    completionMsg = "Operation Failed";
                }
                setProgressLabel(completionMsg);

                // Use a timeout to allow the final progress animation to complete before resetting the UI.
                setTimeout(() => {
                    // Reset processing states
                    setIsEnrolling(false);
                    setIsProcessing(false);
                    // Reset analytics to default
                    setAnalytics({ scan_rate: '0.0', data_flow: '0.0', quality: 'N/A' });

                    // NEW: Handle UI reset after a successful move operation
                    if (data.status === 'complete' && fileOperationMode === 'move' && (operationMode === 'standard' || operationMode === 'hybrid')) {
                        setShowMoveCompleteModal(true);
                    }

                    // Handle Find & Group completion modal
                    // FIX: Ensure we don't trigger this modal if the completed operation was actually enrollment.
                    if (operationMode === 'find' && data.status === 'complete' && !isEnrolling) {
                        let foundCount = 0;
                        let folderName = findConfig.folderName || '';
                        // FIX: Regex now handles 'copied', 'moved', and the typo 'copyd' to be robust.
                        const match = data.message.match(/Found and (?:copied|moved|copyd) (\d+) matching photo/);
                        if (match) {
                            foundCount = parseInt(match[1], 10);
                        }
                        setFindGroupModal({
                            isOpen: true,
                            foundCount,
                            folderName,
                        });
                    }
                }, 800); // 800ms delay for visual confirmation

                // Close the connection
                es.close();
                eventSourceRef.current = null;
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
            await applyConfig(config);
        } catch (error) {
            console.error("Could not load previous configuration:", error.message);
            logToConsole("Could not load previous session settings.", "warning");
        }
    };

    // NEW: Helper function to apply a config object to the state
    const applyConfig = async (config) => {
        if (config && Object.keys(config).length > 0) {
            // Validate folder paths before setting them to prevent crashes
            if (config.source_folder) {
                const sourceValid = await validatePath(config.source_folder);
                if (sourceValid) {
                    setSourceFolder(config.source_folder);
                } else {
                    logToConsole(`Previous source folder no longer exists: ${config.source_folder}`, "warning");
                }
            }
            if (config.destination_folder) {
                const destValid = await validatePath(config.destination_folder);
                if (destValid) {
                    setDestinationFolder(config.destination_folder);
                } else {
                    logToConsole(`Previous destination folder no longer exists: ${config.destination_folder}`, "warning");
                }
            }
            if (config.sort_method) setSortMethod(config.sort_method);
            if (config.face_mode) setFaceMode(config.face_mode);
            if (config.file_operation_mode) setFileOperationMode(config.file_operation_mode);
            if (typeof config.maintain_hierarchy === 'boolean') setMaintainHierarchy(config.maintain_hierarchy);
            if (config.ignored_subfolders) setIgnoredSubfolders(config.ignored_subfolders);
            if (config.operation_mode) setOperationMode(config.operation_mode);
            logToConsole("Loaded session settings.", "success");
        }
    };

    const loadPresets = async () => {
        try {
            const fetchedPresets = await apiCall('/api/presets/paths');
            setPresets(fetchedPresets);
        } catch (error) { }
    };

    const saveLastConfig = async (overrides = {}) => {
        const configToSave = {
            source_folder: sourceFolder,
            destination_folder: destinationFolder,
            sort_method: sortMethod,
            face_mode: faceMode,
            file_operation_mode: fileOperationMode,
            maintain_hierarchy: maintainHierarchy,
            ignored_subfolders: ignoredSubfolders,
            operation_mode: operationMode,
            ...overrides // Merge any provided overrides
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

    const handleDeletePreset = async (presetName) => {
        try {
            await apiCall(`/api/presets/paths/${encodeURIComponent(presetName)}`, {
                method: 'DELETE',
            });
            logToConsole(`Preset '${presetName}' deleted successfully.`, 'success');
            // Clear selection if the deleted preset was selected
            if (selectedPreset === presetName) {
                setSelectedPreset('');
            }
            await loadPresets();
        } catch (error) {
            logToConsole(`Failed to delete preset '${presetName}': ${error.message}`, 'error');
        }
    };

    // Track if we're currently validating a preset to prevent multiple simultaneous validations
    const [isValidatingPreset, setIsValidatingPreset] = useState(false);
    
    const handlePresetChange = (e) => {
        const presetName = e.target.value;
        
        if (!presets[presetName]) {
            setSelectedPreset(presetName);
            return;
        }
        
        // Prevent selecting while validation is in progress
        if (isValidatingPreset) {
            return;
        }
        
        const sourcePath = presets[presetName].source;
        const destPath = presets[presetName].destination;
        
        // Set validating state to show feedback
        setIsValidatingPreset(true);
        
        // Wrap async validation in an IIFE to properly handle the promise
        (async () => {
            try {
                // Validate both paths exist before setting them
                const [sourceValid, destValid] = await Promise.all([
                    validatePath(sourcePath),
                    validatePath(destPath)
                ]);
                
                const invalidPaths = [];
                if (!sourceValid) invalidPaths.push(`Source: ${sourcePath}`);
                if (!destValid) invalidPaths.push(`Destination: ${destPath}`);
                
                if (invalidPaths.length > 0) {
                    // Show error modal using state (more reliable than message() from IIFE)
                    setInvalidPresetError({
                        show: true,
                        presetName: presetName,
                        invalidPaths: invalidPaths
                    });
                    setIsValidatingPreset(false);
                    return;
                }
                
                // Only update state if validation passes
                setSelectedPreset(presetName);
                setSourceFolder(sourcePath);
                setDestinationFolder(destPath);
                logToConsole(`Loaded preset '${presetName}' successfully.`, 'success');
            } catch (err) {
                console.error('Error validating preset paths:', err);
                // Show error modal for backend connection issues
                setInvalidPresetError({
                    show: true,
                    presetName: presetName,
                    invalidPaths: [`Backend error: ${err.message}`]
                });
            } finally {
                setIsValidatingPreset(false);
            }
        })();
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
                operation_mode: fileOperationMode, // <-- ADD THIS
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
                operation_mode: fileOperationMode, // <-- ADD THIS
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
                operation_mode: fileOperationMode, // <-- ADD THIS
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

    const handleAbortProcess = async () => {
        logToConsole("Sending abort signal to backend...", 'warning');
        try {
            await apiCall('/api/abort-process', { method: 'POST' });
            // The backend will send a final status update via SSE, which will handle UI state changes.
        } catch (error) {
            logToConsole(`Failed to send abort signal: ${error.message}`, 'error');
        }
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

    const handleOpenDestination = async (subPath = null) => {
        if (destinationFolder) {
            try {
                // FIX: Allow opening a specific subfolder if provided (e.g. for Find & Group results)
                let pathToOpen = destinationFolder;
                if (subPath && typeof subPath === 'string') {
                    // Use a simple join strategy that works for the backend
                    pathToOpen = destinationFolder.endsWith('\\') || destinationFolder.endsWith('/') 
                        ? destinationFolder + subPath 
                        : destinationFolder + '/' + subPath;
                }

                const result = await apiCall("/api/open-folder", {
                    method: 'POST',
                    body: JSON.stringify({ folder_path: pathToOpen })
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

        // NEW: Gracefully shut down the backend server
        try {
            // No need to handle errors here; if it fails, we're exiting anyway.
            await apiCall('/api/shutdown', { method: 'POST' });
        } catch (e) {
            // Ignore errors, as the backend might already be down.
        }

        // Close the application window
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
        <div id="app-container" className={themeClass}>
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

                {/* Update Checker - Top Left Notification */}
                <UpdateChecker currentVersion={version} />

                {/* Tutorial Menu - with step selection dropdown */}
                <TutorialMenu 
                    onStartFromStep={(stepIndex) => {
                        if (operationMode !== 'standard') {
                            setOperationMode('standard');
                            setTimeout(() => startTutorialBase(stepIndex), 300);
                        } else {
                            startTutorialBase(stepIndex);
                        }
                    }}
                    onStartFromScratch={handleStartTutorial}
                />

                {/* Exit Button */}
                <button onClick={handleExit} className="btn-exit" aria-label="Kill Backend" title="Kill Backend" data-tutorial-target="kill-backend-btn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                </button>

                {/* Reload Button */}
                <button
                    className="btn-reload"
                    onClick={handleReload}
                    title="Reload Application"
                    data-tutorial-target="reload-btn"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="23,4 23,10 17,10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                </button>
            </div>

            {/* Exit Confirmation Modal */}
            <ConfirmationModal
                isVisible={showExitModal}
                title="Confirm Exit"
                onCancel={handleCancelExit}
                onConfirm={handleConfirmExit}
                confirmText="Confirm Exit"
            >
                <p>
                    <strong>An operation is currently in progress.</strong>
                    <br />
                    Exiting now will:
                    <span className="consequence-list">
                        <li>Stop the current {getOperationName()} process</li>
                        <li>Release all system resources</li>
                        <li>Save your current configuration</li>
                        <li>Any incomplete work will be lost</li>
                    </span>
                    Are you sure you want to exit?
                </p>
            </ConfirmationModal>

            {/* Reload Confirmation Modal */}
            <ConfirmationModal
                isVisible={showReloadModal}
                title="Confirm Reload"
                onCancel={handleCancelReload}
                onConfirm={handleConfirmReload}
                confirmText="Confirm Reload"
            >
                <p>
                    <strong>An operation is currently in progress.</strong>
                    <br />
                    Reloading now will:
                    <span className="consequence-list">
                        <li>Stop the current {getOperationName()} process</li>
                        <li>Reset the application</li>
                        <li>Save your current configuration</li>
                        <li>Any incomplete work will be lost</li>
                    </span>
                    Are you sure you want to reload?
                </p>
            </ConfirmationModal>

            {/* Invalid Preset Error Modal */}
            <ConfirmationModal
                isVisible={invalidPresetError.show}
                title="Invalid Preset Paths"
                onCancel={() => setInvalidPresetError({ show: false, presetName: '', invalidPaths: [] })}
                onConfirm={async () => {
                    await handleDeletePreset(invalidPresetError.presetName);
                    setInvalidPresetError({ show: false, presetName: '', invalidPaths: [] });
                }}
                confirmText="Delete Preset"
                cancelText="Keep Preset"
            >
                <p>
                    <strong>The preset '{invalidPresetError.presetName}' contains folder paths that no longer exist:</strong>
                    <br /><br />
                    <span style={{ fontFamily: 'monospace', fontSize: '0.9em', wordBreak: 'break-all' }}>
                        {invalidPresetError.invalidPaths.map((path, idx) => (
                            <span key={idx}>{path}<br /></span>
                        ))}
                    </span>
                    <br />
                    Would you like to delete this preset or keep it for later?
                </p>
            </ConfirmationModal>

            {/* Delete Preset Confirmation Modal */}
            <ConfirmationModal
                isVisible={deletePresetConfirm.show}
                title="Delete Preset"
                onCancel={() => setDeletePresetConfirm({ show: false, presetName: '' })}
                onConfirm={async () => {
                    await handleDeletePreset(deletePresetConfirm.presetName);
                    setDeletePresetConfirm({ show: false, presetName: '' });
                }}
                confirmText="Delete"
                cancelText="Cancel"
            >
                <p>
                    Are you sure you want to delete the preset <strong>'{deletePresetConfirm.presetName}'</strong>?
                    <br /><br />
                    This action cannot be undone.
                </p>
            </ConfirmationModal>

            <main className="app-main">
                <div className="setup-grid">
                    <div className="setup-column">
                        <div data-tutorial-target="path-preset-group">
                            <PathSelector
                                label="Source Folder"
                                path={sourceFolder}
                                handleSelectFolder={() => handleBrowseFolder('source')}
                                data-tutorial-target="source-selector"
                            />
                            <PathSelector
                                label="Destination Folder"
                                path={destinationFolder}
                                handleSelectFolder={() => handleBrowseFolder('destination')}
                                data-tutorial-target="destination-selector"
                            />
                            <PresetManager
                                presets={presets}
                                selectedPreset={selectedPreset}
                                handleSelectPreset={handlePresetChange}
                                handleSavePreset={handleSavePreset}
                                onRequestDelete={(presetName) => setDeletePresetConfirm({ show: true, presetName })}
                                showSaveButton={showSaveButton}
                                data-tutorial-target="preset-manager"
                            />
                        </div>
                        {/* --- ADD THIS COMPONENT --- */}
                        {operationMode !== 'find' && (
                            <OperationModeToggle
                                operationMode={fileOperationMode}
                                setOperationMode={setFileOperationMode}
                                isProcessing={isProcessing || isEnrolling}
                            />
                        )}
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
                                    selectedImages={isEnrollmentDemoStep ? effectiveSelectedImages : selectedImages}
                                    personName={isEnrollmentDemoStep ? effectivePersonName : personName}
                                    handleSelectImages={handleSelectImages}
                                    setPersonName={isEnrollmentDemoStep ? setDemoPersonName : setPersonName}
                                    enrollmentQueue={isEnrollmentDemoStep ? effectiveEnrollmentQueue : enrollmentQueue}
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
                {operationMode === 'standard' && (subfolderSelectorDisplay !== 'hidden' || showDemoSubfolders) && (
                    <SubfolderSelector
                        subfolders={effectiveSubfolders}
                        ignoredSubfolders={effectiveIgnoredSubfolders}
                        setIgnoredSubfolders={setEffectiveIgnoredSubfolders}
                        isProcessing={isProcessing || isEnrolling}
                        stats={effectiveFolderStats}
                        className={showDemoSubfolders ? 'visible' : subfolderSelectorDisplay}
                        onAnimationEnd={() => {
                            if (subfolderSelectorDisplay === 'exiting') setSubfolderSelectorDisplay('hidden');
                            if (subfolderSelectorDisplay === 'entering') setSubfolderSelectorDisplay('visible');
                        }}
                        data-tutorial-target="subfolder-selector"
                    />
                )}

                {operationMode !== 'find' && (
                    <HierarchyToggle
                        maintainHierarchy={effectiveMaintainHierarchy}
                        setMaintainHierarchy={setEffectiveMaintainHierarchy}
                        isProcessing={isProcessing || isEnrolling}
                        data-tutorial-target="hierarchy-toggle"
                    />
                )}

                <hr className="divider" />

                {/* Content changes based on selected mode */}
                <div className="mode-content-wrapper">
                    {operationMode === 'standard' && (
                        <div className="mode-content">
                            <SortingOptions
                                sortMethod={isSortDemoStep ? effectiveSortMethod : sortMethod}
                                setSortMethod={isSortDemoStep ? setDemoSortMethod : setSortMethod}
                                isProcessing={isProcessing || isEnrolling}
                                isEnrolled={effectiveIsEnrolled}
                                enrolledCount={effectiveEnrolledCount}
                                faceMode={isFaceModeDemoStep ? effectiveFaceMode : faceMode}
                                setFaceMode={isFaceModeDemoStep ? setDemoFaceMode : setFaceMode}
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

            {(isProcessing || logs.length > 1 || showDemoFooter) && (
                <footer ref={footerRef} className="app-footer">
                    <ProgressTracker 
                        progress={showDemoFooter ? 45 : progress} 
                        progressLabel={showDemoFooter ? 'Processing photos...' : progressLabel} 
                        isProcessing={isProcessing || showDemoAbortBtn}
                        onAbort={handleAbortProcess}
                        analytics={showDemoFooter ? { processed: 127, total: 283, speed: '2.3 photos/sec' } : analytics}
                    />
                    <LogConsole ref={logConsoleRef} logs={showDemoFooter ? [
                        { time: '10:23:45', message: 'Starting photo organization...', type: 'info' },
                        { time: '10:23:46', message: 'Scanning source folder for images...', type: 'info' },
                        { time: '10:23:48', message: 'Found 283 photos to process', type: 'success' },
                        { time: '10:24:12', message: 'Processing: IMG_2024_0127.jpg', type: 'info' },
                        { time: '10:24:13', message: 'Moved to: 2024/January/', type: 'success' }
                    ] : logs} />
                    <div className="footer-actions">
                        {!isProcessing && <button onClick={resetUi} className="btn btn-danger">Start Over</button>}
                        <button onClick={handleOpenDestination} className="btn btn-secondary" data-tutorial-target="open-destination-btn">
                            Open "{getFolderName(destinationFolder) || 'Destination'}"
                        </button>
                    </div>
                </footer>
            )}

            {/* NEW: Enrolled Faces Modal */}
            <EnrolledFacesModal
                isVisible={showEnrolledFacesModal || showDemoEnrolledModal}
                onClose={() => {
                    setShowEnrolledFacesModal(false);
                    setShowDemoEnrolledModal(false);
                }}
                onOpenFolder={handleOpenEnrolledFolder}
                apiCall={apiCall}
                logToConsole={logToConsole}
                onFaceDeleted={handleFaceDeleted}
                demoFaces={showDemoEnrolledModal ? demoEnrolledFaces : null}
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
                onGoToDestination={() => handleOpenDestination(findGroupModal.folderName)}
            />

            <MoveCompleteModal
                isOpen={showMoveCompleteModal}
                onClose={() => {
                    setShowMoveCompleteModal(false);
                    setSourceFolder(''); // Reset source folder when modal is closed
                    saveLastConfig({ source_folder: '' }); // Save the cleared source folder
                }}
                onGoToDestination={() => {
                    setShowMoveCompleteModal(false);
                    setSourceFolder(''); // Also reset here before opening
                    saveLastConfig({ source_folder: '' }); // Save the cleared source folder
                    handleOpenDestination();
                }}
            />
            <TutorialOverlay />
        </div>
    );
}

export default App;
