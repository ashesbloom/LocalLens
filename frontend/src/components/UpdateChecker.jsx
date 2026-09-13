import React, { useState, useEffect, useRef } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { openUrl } from '@tauri-apps/plugin-opener';
import { MCP_SITE_URL } from './McpAnnounce';
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


// Matrix rain glyphs behind the bell — half-width katakana + stray digits,
// each column its own speed/offset so the fall feels organic, not looped-in-sync
const MATRIX_COLUMNS = [
    { chars: ['ﾊ', '3', 'ﾐ', '9'], left: '14%', duration: '2.6s', delay: '0s' },
    { chars: ['5', 'ｹ', 'ｻ', '1'], left: '37%', duration: '3.1s', delay: '0.6s' },
    { chars: ['ﾜ', '7', 'ﾂ', '0'], left: '60%', duration: '2.3s', delay: '1.1s' },
    { chars: ['2', 'ﾘ', 'ｵ', '8'], left: '83%', duration: '2.9s', delay: '0.3s' },
];

const MatrixRain = () => (
    <span className="matrix-rain" aria-hidden="true">
        {MATRIX_COLUMNS.map((col, i) => (
            <span
                key={i}
                className="matrix-col"
                style={{ left: col.left, animationDuration: col.duration, animationDelay: col.delay }}
            >
                {col.chars.map((ch, j) => <span key={j}>{ch}</span>)}
            </span>
        ))}
    </span>
);

// Sparkle icon for the MCP card
const SparkIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z"/>
    </svg>
);

function UpdateChecker({ currentVersion, backendPort, onShowPrivacy }) {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [updateInfo, setUpdateInfo] = useState(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [error, setError] = useState(null);
    const [isChecking, setIsChecking] = useState(false);
    const panelRef = useRef(null);
    const downloadedBytesRef = useRef(0);

    // ============================================
    // DEBUG MODE - Set to true to simulate update
    // ============================================
    const DEBUG_SIMULATE_UPDATE = false;
    const SIMULATED_UPDATE = {
        version: "2.0.1",
        date: "2024-12-02T10:30:00Z",
        notes: `## What's New in v2.0.1
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
        const checkForUpdates = async (retryCount = 0) => {
            const MAX_RETRIES = 3;
            const RETRY_DELAY = 5000; // 5 seconds between retries

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

            setIsChecking(true);
            try {
                console.log(`Checking for updates... (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
                const update = await check();
                setIsChecking(false);
                
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
                    console.log('No updates available - you are on the latest version.');
                    setUpdateAvailable(false);
                }
            } catch (e) {
                console.error(`Failed to check for updates (attempt ${retryCount + 1}):`, e);
                setIsChecking(false);
                
                // Retry if we haven't exceeded max retries
                if (retryCount < MAX_RETRIES) {
                    console.log(`Retrying update check in ${RETRY_DELAY / 1000} seconds...`);
                    setTimeout(() => checkForUpdates(retryCount + 1), RETRY_DELAY);
                } else {
                    console.error('Max retries reached. Could not check for updates.');
                }
            }
        };

        // Start check almost immediately (500ms delay for initial render)
        const timer = setTimeout(() => checkForUpdates(0), 500);
        return () => clearTimeout(timer);
    }, []);

    // Every close routes through here so the panel always plays its exit
    // animation; the actual unmount happens on animationend.
    const closePanel = () => setIsClosing(true);
    const openPanel = () => { setIsClosing(false); setIsExpanded(true); };

    // Close panel when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (panelRef.current && !panelRef.current.contains(event.target)) {
                closePanel();
            }
        };

        if (isExpanded) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isExpanded]);

    // Close panel when user scrolls OUTSIDE the panel
    useEffect(() => {
        if (!isExpanded) return;

        // Opening the panel can itself cause a scroll — the browser brings the
        // bell into view on click, and momentum from a previous wheel keeps
        // firing. Both would slam the panel shut the instant it opens.
        // ponytail: fixed grace window; track the scroll source if this ever
        // proves too short on a slow machine.
        const openedAt = performance.now();

        const handleScroll = (event) => {
            if (performance.now() - openedAt < 250) return;
            // Check if the scroll happened inside the panel
            const isScrollInsidePanel = panelRef.current && panelRef.current.contains(event.target);
            if (!isScrollInsidePanel) {
                closePanel();
            }
        };

        // 'wheel' fires on intent and targets the element under the cursor, so it
        // works even when the page itself has nothing to scroll. 'scroll' stays
        // for scrollbar drags and keyboard scrolling.
        window.addEventListener('wheel', handleScroll, { capture: true, passive: true });
        window.addEventListener('scroll', handleScroll, true);
        return () => {
            window.removeEventListener('wheel', handleScroll, { capture: true });
            window.removeEventListener('scroll', handleScroll, true);
        };
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

        if (!updateInfo?._updateObject) {
            setError('Update information not available. Please try again.');
            return;
        }

        setIsDownloading(true);
        setError(null);
        setDownloadProgress(0);
        downloadedBytesRef.current = 0;

        try {
            const update = updateInfo._updateObject;
            let contentLength = 0;
            
            console.log('Starting update download and install...');
            
            // Download with progress
            await update.downloadAndInstall((event) => {
                switch (event.event) {
                    case 'Started':
                        contentLength = event.data.contentLength || 0;
                        console.log(`Download started, total size: ${contentLength} bytes`);
                        downloadedBytesRef.current = 0;
                        setDownloadProgress(0);
                        break;
                    case 'Progress':
                        // Accumulate downloaded bytes
                        downloadedBytesRef.current += event.data.chunkLength;
                        if (contentLength > 0) {
                            const progress = Math.min(
                                Math.round((downloadedBytesRef.current / contentLength) * 100),
                                99 // Cap at 99% until finished
                            );
                            setDownloadProgress(progress);
                            console.log(`Download progress: ${progress}% (${downloadedBytesRef.current}/${contentLength} bytes)`);
                        }
                        break;
                    case 'Finished':
                        console.log('Download finished, installing...');
                        setDownloadProgress(100);
                        break;
                }
            });

            console.log('Update installed successfully, relaunching...');
            // Relaunch the application
            await relaunch();
        } catch (e) {
            console.error('Failed to install update:', e);
            const errorMessage = e?.message || String(e);
            
            // Provide more specific error messages
            let userMessage = 'Failed to install update. ';
            if (errorMessage.includes('signature')) {
                userMessage += 'Update signature verification failed. ';
            } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
                userMessage += 'Network error occurred. Please check your connection. ';
            } else if (errorMessage.includes('permission') || errorMessage.includes('access')) {
                userMessage += 'Permission denied. Try running as administrator. ';
            }
            userMessage += 'Please try again or download manually from GitHub.';
            
            setError(userMessage);
            setIsDownloading(false);
            setDownloadProgress(0);
        }
    };

    // Manual check for updates
    const handleManualCheck = async () => {
        if (isChecking) return;
        
        setIsChecking(true);
        setError(null);
        
        try {
            console.log('Manual update check triggered...');
            const update = await check();
            
            if (update) {
                console.log(`Update available: ${update.version}`);
                setUpdateAvailable(true);
                setUpdateInfo({
                    version: update.version,
                    notes: update.body || 'No release notes provided.',
                    date: update.date || new Date().toISOString(),
                    _updateObject: update
                });
            } else {
                console.log('No updates available - you are on the latest version.');
                setUpdateAvailable(false);
            }
        } catch (e) {
            console.error('Failed to check for updates:', e);
            setError('Failed to check for updates. Please check your internet connection.');
        } finally {
            setIsChecking(false);
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

    // Apply inline markdown (bold, code) to any text fragment
    const applyInlineMarkdown = (text) => {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
    };

    // Parse markdown-style release notes into simple HTML
    const formatReleaseNotes = (notes) => {
        if (!notes) return '<p>No release notes available.</p>';
        
        return notes
            .split('\n')
            .map(line => {
                // Headers (h3 / h2 / h1)
                if (line.startsWith('### ')) return `<h4>${applyInlineMarkdown(line.slice(4))}</h4>`;
                if (line.startsWith('## ')) return `<h3>${applyInlineMarkdown(line.slice(3))}</h3>`;
                if (line.startsWith('# ')) return `<h2>${applyInlineMarkdown(line.slice(2))}</h2>`;
                // List items — inline markdown runs inside the bullet too
                if (line.startsWith('- ') || line.startsWith('* '))
                    return `<li>${applyInlineMarkdown(line.slice(2))}</li>`;
                // Empty lines
                if (line.trim() === '') return '<br/>';
                // Paragraph — inline markdown
                return `<p>${applyInlineMarkdown(line)}</p>`;
            })
            .join('');
    };

    // Pick a contextual panel title based on what sections the notes contain
    const getReleaseNotesTitle = (notes) => {
        if (!notes) return "What's New";
        const hasAdded   = /^###\s+(Added|New|Features)/im.test(notes);
        const hasChanged = /^###\s+(Changed|Improvements?)/im.test(notes);
        const hasFixed   = /^###\s+Fixed/im.test(notes);
        if (hasAdded || hasChanged) return "What's New";
        if (hasFixed) return "What's Fixed";
        return "Release Notes";
    };

    // Always show the icon, but style differently based on update availability
    return (
        <div className="update-checker" ref={panelRef} data-tutorial-target="notification-panel">
            {/* Notification Icon - Always visible */}
            <button 
                className={`update-icon-btn ${updateAvailable ? 'has-update' : ''} ${isExpanded ? 'active' : ''}`}
                onClick={() => (isExpanded && !isClosing ? closePanel() : openPanel())}
                title={updateAvailable ? "Update available!" : `Version ${currentVersion}`}
            >
                <MatrixRain />
                <BellIcon />
                {updateAvailable && <span className="update-badge" />}
            </button>

            {/* Expanded Panel */}
            {isExpanded && (
                <div
                    className={`update-panel${isClosing ? ' closing' : ''}`}
                    onAnimationEnd={(e) => {
                        // Ignore animationend bubbling up from children, and the
                        // slide-in animation's own event.
                        if (e.target === e.currentTarget && isClosing) {
                            setIsClosing(false);
                            setIsExpanded(false);
                        }
                    }}
                >
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
                                    onClick={() => closePanel()}
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
                                <h4 className="release-notes-title">{getReleaseNotesTitle(updateInfo?.notes)}</h4>
                                <div 
                                    className="release-notes-content"
                                    dangerouslySetInnerHTML={{ __html: formatReleaseNotes(updateInfo?.notes) }}
                                />
                            </div>

                            {/* Error message */}
                            {error && (
                                <div className="update-error">
                                    {error}
                                    <a 
                                        href="https://github.com/ashesbloom/LocalLens/releases/latest"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="update-manual-link"
                                    >
                                        Download from GitHub →
                                    </a>
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
                                            onClick={() => closePanel()}
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
                                    onClick={() => closePanel()}
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
                                
                                {/* Error message for check failures */}
                                {error && (
                                    <div className="update-error" style={{ marginTop: '12px' }}>
                                        {error}
                                    </div>
                                )}
                                
                                <button 
                                    className="btn-check-updates"
                                    onClick={handleManualCheck}
                                    disabled={isChecking}
                                >
                                    {isChecking ? (
                                        <>
                                            <LoaderIcon /> Checking...
                                        </>
                                    ) : (
                                        'Check for Updates'
                                    )}
                                </button>
                            </div>
                        </>
                    )}

                    {/* Permanent home for the MCP announcement — stays reachable
                        whether or not an update is pending. */}
                    <div className="mcp-card">
                        <div className="mcp-card-head">
                            <SparkIcon />
                            <span>Connect to Claude</span>
                        </div>
                        <p className="mcp-card-body">
                            Sort and search your library by asking. Runs on 127.0.0.1 — nothing uploads.
                        </p>
                        <div className="mcp-card-actions">
                            <button
                                className="btn-mcp-setup"
                                onClick={() => {
                                    openUrl(backendPort ? `http://127.0.0.1:${backendPort}/setup` : MCP_SITE_URL);
                                    closePanel();
                                }}
                            >
                                Set it up
                            </button>
                            {onShowPrivacy && (
                                <button
                                    className="btn-mcp-privacy"
                                    onClick={() => { closePanel(); onShowPrivacy(); }}
                                >
                                    what we store
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default UpdateChecker;
