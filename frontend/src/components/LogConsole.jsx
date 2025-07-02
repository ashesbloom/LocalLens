import React, { useEffect, useState } from 'react';
import './LogConsole.css'; // Import the CSS file for styling

const LogConsole = React.forwardRef(({ logs }, ref) => {
    const [isActive, setIsActive] = useState(false);
    const [lastLogCount, setLastLogCount] = useState(0);

    // Detect when new logs are added for visual feedback
    useEffect(() => {
        if (logs.length > lastLogCount) {
            setIsActive(true);
            const timer = setTimeout(() => setIsActive(false), 2000);
            setLastLogCount(logs.length);
            return () => clearTimeout(timer);
        }
    }, [logs.length, lastLogCount]);

    // Get connection status based on recent logs
    const getConnectionStatus = () => {
        if (logs.length === 0) return 'idle';
        const recentLogs = logs.slice(-3);
        const hasError = recentLogs.some(log => log.type === 'error');
        const hasSuccess = recentLogs.some(log => log.type === 'success');
        
        if (hasError) return 'error';
        if (hasSuccess) return 'connected';
        return 'processing';
    };

    const connectionStatus = getConnectionStatus();

    // Format timestamp for better readability
    const formatTime = (timeString) => {
        try {
            // If it's already in HH:MM:SS format, return as is
            if (/^\d{1,2}:\d{2}:\d{2}/.test(timeString)) {
                return timeString;
            }
            // Otherwise, try to parse and format
            const date = new Date(timeString);
            return date.toLocaleTimeString('en-US', { 
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch {
            return timeString; // Fallback to original
        }
    };

    // Enhanced log rendering with animations
    const renderLogEntry = (log, index) => {
        const isLatest = index === logs.length - 1;
        const entryStyle = {
            animationDelay: `${Math.min(index * 0.05, 1)}s`
        };

        return (
            <div 
                key={`${index}-${log.time}`} 
                className={`log-entry log-${log.type} ${isLatest ? 'latest-entry' : ''}`}
                style={entryStyle}
            >
                <span className="log-time">{formatTime(log.time)}</span>
                <span className="log-prompt">&gt;</span>
                <span className="log-message">{log.message}</span>
                {isLatest && logs.length > 0 && (
                    <span className="cursor-indicator"></span>
                )}
            </div>
        );
    };

    return (
        <div className="log-console-container">
            {/* Enhanced Header */}
            <div className="terminal-header">
                <div className="terminal-title">
                    <div className={`terminal-status status-${connectionStatus}`}></div>
                    <span>Real-time Log</span>
                    <span className="log-count">({logs.length})</span>
                </div>
                <div className="terminal-controls">
                    <div className="terminal-control control-close"></div>
                    <div className="terminal-control control-minimize"></div>
                    <div className="terminal-control control-maximize"></div>
                </div>
            </div>

            {/* Enhanced Console */}
            <div 
                ref={ref} 
                className={`log-console ${isActive ? 'console-active' : ''} status-${connectionStatus}`}
            >
                {logs.length === 0 ? (
                    <div className="console-placeholder">
                        <span className="placeholder-text">Waiting for system initialization...</span>
                        <span className="cursor-indicator active"></span>
                    </div>
                ) : (
                    logs.map(renderLogEntry)
                )}
            </div>

            {/* Console Footer with Metrics */}
            {logs.length > 0 && (
                <div className="console-footer">
                    <div className="console-metrics">
                        <span className="metric">
                            <span className="metric-icon">⚡</span>
                            <span className="metric-value">{logs.length} entries</span>
                        </span>
                        <span className="metric">
                            <span className="metric-icon">📊</span>
                            <span className="metric-value">
                                {logs.filter(l => l.type === 'success').length} success
                            </span>
                        </span>
                        {logs.some(l => l.type === 'error') && (
                            <span className="metric error">
                                <span className="metric-icon">⚠</span>
                                <span className="metric-value">
                                    {logs.filter(l => l.type === 'error').length} errors
                                </span>
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});

LogConsole.displayName = 'LogConsole';

export default LogConsole;
