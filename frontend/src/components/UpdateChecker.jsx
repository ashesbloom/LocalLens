import React, { useState, useEffect, useRef } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import './UpdateChecker.css';

// Bell icon SVG
const BellIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
    </svg>
);

// Download icon SVG
const DownloadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
);

// Close icon SVG
const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
);

// Loader/Spinner icon
const LoaderIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
);


function UpdateChecker({ currentVersion }) {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [updateInfo, setUpdateInfo] = useState(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [error, setError] = useState(null);
    const panelRef = useRef(null);

    // ============================================
    // DEBUG MODE - Set to true to simulate update
    // ============================================
    const DEBUG_SIMULATE_UPDATE = false;
    const SIMULATED_UPDATE = {
        version: "1.3.0",
        date: "2024-12-02T10:30:00Z",
        notes: `## 🚀 What's New in v1.3.0

### ✨ New Features
- <b>Auto-Update System</b>: Get notified when new versions are available
- <b>One-Click Updates</b>: Install updates without leaving the app
- <b>Release Notes</b>: See what's new before updating

### 🐛 Bug Fixes
- Fixed "Find & Group" showing wrong folder path
- Fixed enrollment modal triggering incorrectly
- Improved backend connection stability

### 🔧 Improvements
- Better error handling for face recognition
- Faster metadata scanning
- Reduced memory usage during batch operations

### 📝 Notes
- This update requires a restart to apply
- Your settings and enrolled faces are preserved
`
    };

    // Check for updates on mount
    useEffect(() => {
        const checkForUpdates = async () => {
            // ============================================
            // DEBUG: Simulate update available
            // ============================================
            if (DEBUG_SIMULATE_UPDATE) {
                console.log('DEBUG: Simulating update available');
                setUpdateAvailable(true);
                setUpdateInfo({
                    version: SIMULATED_UPDATE.version,
                    notes: SIMULATED_UPDATE.notes,
                    date: SIMULATED_UPDATE.date,
                    _updateObject: null // No real update object in simulation
                });
                return;
            }

            try {
                const update = await check();
                if (update) {
                    console.log(`Update available: ${update.version}`);
                    setUpdateAvailable(true);
                    setUpdateInfo({
                        version: update.version,
                        notes: update.body || 'No release notes provided.',
                        date: update.date || new Date().toISOString(),
                        // Store the update object for later use
                        _updateObject: update
                    });
                } else {
                    console.log('No updates available.');
                }
            } catch (e) {
                console.error('Failed to check for updates:', e);
                // Don't show error to user for check failures, just log it
            }
        };

        // Delay check slightly to not block initial render
        const timer = setTimeout(checkForUpdates, 3000);
        return () => clearTimeout(timer);
    }, []);

    // Close panel when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (panelRef.current && !panelRef.current.contains(event.target)) {
                setIsExpanded(false);
            }
        };

        if (isExpanded) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isExpanded]);

    // Close panel when user scrolls OUTSIDE the panel
    useEffect(() => {
        const handleScroll = (event) => {
            if (isExpanded) {
                // Check if the scroll happened inside the panel
                const isScrollInsidePanel = panelRef.current && panelRef.current.contains(event.target);
                if (!isScrollInsidePanel) {
                    setIsExpanded(false);
                }
            }
        };

        if (isExpanded) {
            // Listen to scroll on window and any scrollable container
            window.addEventListener('scroll', handleScroll, true);
        }
        return () => window.removeEventListener('scroll', handleScroll, true);
    }, [isExpanded]);

    const handleInstallUpdate = async () => {
        // ============================================
        // DEBUG: Simulate download progress
        // ============================================
        if (DEBUG_SIMULATE_UPDATE) {
            setIsDownloading(true);
            setError(null);
            
            // Simulate download progress
            for (let i = 0; i <= 100; i += 5) {
                await new Promise(resolve => setTimeout(resolve, 150));
                setDownloadProgress(i);
            }
            
            // Simulate completion message
            setError('DEBUG MODE: Update simulation complete! In production, the app would restart now.');
            setIsDownloading(false);
            return;
        }

        if (!updateInfo?._updateObject) return;

        setIsDownloading(true);
        setError(null);

        try {
            const update = updateInfo._updateObject;
            
            // Download with progress
            await update.downloadAndInstall((event) => {
                switch (event.event) {
                    case 'Started':
                        console.log(`Download started, size: ${event.data.contentLength}`);
                        setDownloadProgress(0);
                        break;
                    case 'Progress':
                        const progress = Math.round((event.data.chunkLength / event.data.contentLength) * 100);
                        setDownloadProgress(progress);
                        break;
                    case 'Finished':
                        console.log('Download finished');
                        setDownloadProgress(100);
                        break;
                }
            });

            // Relaunch the application
            await relaunch();
        } catch (e) {
            console.error('Failed to install update:', e);
            setError('Failed to install update. Please try again or download manually.');
            setIsDownloading(false);
        }
    };

    const formatDate = (dateString) => {
        try {
            return new Date(dateString).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return 'Unknown date';
        }
    };

    // Parse markdown-style release notes into simple HTML
    const formatReleaseNotes = (notes) => {
        if (!notes) return '<p>No release notes available.</p>';
        
        // Simple markdown parsing
        return notes
            .split('\n')
            .map(line => {
                // Headers
                if (line.startsWith('### ')) return `<h4>${line.slice(4)}</h4>`;
                if (line.startsWith('## ')) return `<h3>${line.slice(3)}</h3>`;
                if (line.startsWith('# ')) return `<h2>${line.slice(2)}</h2>`;
                // List items
                if (line.startsWith('- ') || line.startsWith('* ')) return `<li>${line.slice(2)}</li>`;
                // Bold
                line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                // Code
                line = line.replace(/`(.*?)`/g, '<code>$1</code>');
                // Empty lines
                if (line.trim() === '') return '<br/>';
                return `<p>${line}</p>`;
            })
            .join('');
    };

    // Always show the icon, but style differently based on update availability
    return (
        <div className="update-checker" ref={panelRef}>
            {/* Notification Icon - Always visible */}
            <button 
                className={`update-icon-btn ${updateAvailable ? 'has-update' : ''} ${isExpanded ? 'active' : ''}`}
                onClick={() => setIsExpanded(!isExpanded)}
                title={updateAvailable ? "Update available!" : `Version ${currentVersion}`}
            >
                <BellIcon />
                {updateAvailable && <span className="update-badge" />}
            </button>

            {/* Expanded Panel */}
            {isExpanded && (
                <div className="update-panel">
                    {/* Triangle pointer */}
                    <div className="update-panel-arrow" />
                    
                    {updateAvailable ? (
                        <>
                            {/* Header */}
                            <div className="update-panel-header">
                                <div className="update-panel-title">
                                    <span className="update-new-badge">NEW</span>
                                    <span>Version {updateInfo?.version}</span>
                                </div>
                                <button 
                                    className="update-panel-close"
                                    onClick={() => setIsExpanded(false)}
                                >
                                    <CloseIcon />
                                </button>
                            </div>

                            {/* Meta info */}
                            <div className="update-panel-meta">
                                <span>Released {formatDate(updateInfo?.date)}</span>
                                <span className="update-current">Current: v{currentVersion}</span>
                            </div>

                            {/* Release Notes */}
                            <div className="update-panel-body">
                                <h4 className="release-notes-title">What's New</h4>
                                <div 
                                    className="release-notes-content"
                                    dangerouslySetInnerHTML={{ __html: formatReleaseNotes(updateInfo?.notes) }}
                                />
                            </div>

                            {/* Error message */}
                            {error && (
                                <div className="update-error">
                                    {error}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="update-panel-actions">
                                {isDownloading ? (
                                    <div className="update-progress-container">
                                        <div className="update-progress-bar">
                                            <div 
                                                className="update-progress-fill"
                                                style={{ width: `${downloadProgress}%` }}
                                            />
                                        </div>
                                        <span className="update-progress-text">
                                            <LoaderIcon /> Installing... {downloadProgress}%
                                        </span>
                                    </div>
                                ) : (
                                    <>
                                        <button 
                                            className="btn-update-later"
                                            onClick={() => setIsExpanded(false)}
                                        >
                                            Later
                                        </button>
                                        <button 
                                            className="btn-update-install"
                                            onClick={handleInstallUpdate}
                                        >
                                            <DownloadIcon />
                                            Install & Restart
                                        </button>
                                    </>
                                )}
                            </div>
                        </>
                    ) : (
                        /* No update available - show "up to date" message */
                        <>
                            <div className="update-panel-header">
                                <div className="update-panel-title">
                                    <span>Version {currentVersion}</span>
                                </div>
                                <button 
                                    className="update-panel-close"
                                    onClick={() => setIsExpanded(false)}
                                >
                                    <CloseIcon />
                                </button>
                            </div>
                            <div className="update-panel-body update-uptodate">
                                <div className="uptodate-icon">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                        <polyline points="22 4 12 14.01 9 11.01"/>
                                    </svg>
                                </div>
                                <p className="uptodate-text">You're up to date!</p>
                                <p className="uptodate-subtext">Local Lens v{currentVersion} is the latest version.</p>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default UpdateChecker;
