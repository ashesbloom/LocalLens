import React, { useEffect, useState } from 'react';
import AbortButton from './AbortButton';
import './ProgressTracker.css';

const ProgressTracker = ({ progress, progressLabel, isProcessing, onAbort }) => {
    const [scannerPosition, setScannerPosition] = useState(0);
    const [isScanning, setIsScanning] = useState(false);
    const [particleKey, setParticleKey] = useState(0);

    // Update scanner position based on progress
    useEffect(() => {
        if (isProcessing && progress > 0) {
            setIsScanning(true);
            setScannerPosition(progress);
            // Trigger particle refresh for dynamic effect
            setParticleKey(prev => prev + 1);
        } else if (!isProcessing) {
            setIsScanning(false);
            setScannerPosition(0);
        }
    }, [progress, isProcessing]);

    // Generate dynamic CSS custom properties
    const containerStyle = {
        '--scanner-position': `${scannerPosition}%`,
        '--scan-intensity': isScanning ? '1' : '0',
        '--progress-width': `${progress}%`
    };

    // Dynamic class based on progress state
    const getProgressClass = () => {
        if (progress === 0) return 'progress-idle';
        if (progress === 100) return 'progress-complete';
        if (isScanning) return 'progress-scanning';
        return 'progress-active';
    };

    return (
        <div className="progress-tracker-container" style={containerStyle}>
            {/* Enhanced Header with Status Indicator */}
            <div className="progress-header">
                <div className="progress-label-group">
                    <div className={`status-indicator ${getProgressClass()}`}></div>
                    <span className="progress-label">{progressLabel}</span>
                    {progress > 0 && progress < 100 && (
                        <span className="progress-percentage">{Math.round(progress)}%</span>
                    )}
                </div>
                <AbortButton isVisible={isProcessing} onAbort={onAbort} />
            </div>

            {/* Enhanced Scanner Housing */}
            <div className={`progress-bar-container ${getProgressClass()}`}>
                {/* Scanning Grid Background */}
                <div className="scanner-grid"></div>
                
                {/* Progress Fill with Scanner Effects */}
                <div 
                    className={`progress-bar ${getProgressClass()}`} 
                    style={{ width: `${progress}%` }}
                >
                    {/* Data Particles Effect */}
                    {isScanning && (
                        <div key={particleKey} className="data-particles">
                            {Array.from({ length: 8 }, (_, i) => (
                                <div 
                                    key={i} 
                                    className="particle" 
                                    style={{ 
                                        '--delay': `${i * 0.2}s`,
                                        '--offset': `${i * 12}%` 
                                    }}
                                ></div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Scanner Beam Assembly */}
                {progress > 0 && (
                    <>
                        {/* Pre-scanner Sweep */}
                        <div className="pre-scanner"></div>
                        {/* Main Scanner Beam */}
                        <div className="scanner-beam-main"></div>
                        {/* Secondary Scanner Beam */}
                        <div className="scanner-beam-secondary"></div>
                    </>
                )}

                {/* Scanner Housing Reflections */}
                <div className="housing-reflection top"></div>
                <div className="housing-reflection bottom"></div>
            </div>

            {/* Progress Analytics Display */}
            {isProcessing && progress > 5 && (
                <div className="progress-analytics">
                    <div className="analytics-grid">
                        <div className="metric">
                            <span className="metric-label">Scan Rate</span>
                            <span className="metric-value">{(progress * 1.3).toFixed(1)}Hz</span>
                        </div>
                        <div className="metric">
                            <span className="metric-label">Data Flow</span>
                            <span className="metric-value">{Math.round(progress * 2.7)}MB/s</span>
                        </div>
                        <div className="metric">
                            <span className="metric-label">Quality</span>
                            <span className="metric-value">{Math.min(100, Math.round(progress * 1.1))}%</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProgressTracker;