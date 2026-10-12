import React, { useEffect, useState } from 'react';
import AbortButton from './AbortButton';
import './ProgressTracker.css';

const PHASE_LABELS = { faces: 'Face scan', files: 'Sorting', search: 'Searching', hashing: 'Hashing' };

const fmtEta = (s) => {
    const min = Math.round(s / 60);
    if (min < 1) return '<1 min left';
    if (min < 60) return `~${min} min left`;
    return `~${Math.floor(min / 60)} h ${min % 60} min left`;
};

const ProgressTracker = ({ progress, progressLabel, isProcessing, onAbort, analytics }) => {
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

            {/* Live job numbers: what each one means depends on the phase the backend is in */}
            {isProcessing && analytics?.phase && (() => {
                const { phase, done, total, rate, mb_per_s, eta_s, matches } = analytics;
                const mb = mb_per_s == null ? '—' : `${mb_per_s.toFixed(1)} MB/s`;
                const [secondLabel, secondValue] = {
                    faces: ['Read', mb],
                    files: ['Written', mb],
                    search: ['Matches', (matches ?? 0).toLocaleString()],
                    hashing: ['Hashed', mb],
                }[phase] || ['Data', mb];
                return (
                    <div className="progress-analytics">
                        <div className="analytics-grid">
                            <div className="metric">
                                <span className="metric-label">{PHASE_LABELS[phase] || 'Speed'} - </span>
                                <span className="metric-value">{rate == null ? '—' : `${rate.toFixed(1)} photos/s`}</span>
                            </div>
                            <div className="metric">
                                <span className="metric-label">{secondLabel} - </span>
                                <span className="metric-value">{secondValue}</span>
                            </div>
                            <div className="metric">
                                <span className="metric-label">Photos - </span>
                                <span className="metric-value">
                                    {done.toLocaleString()} / {total.toLocaleString()}
                                    {eta_s != null && ` · ${fmtEta(eta_s)}`}
                                </span>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default ProgressTracker;