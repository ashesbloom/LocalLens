import React from 'react';
import AbortButton from './AbortButton'; // Import the new component

const ProgressTracker = ({ progress, progressLabel, isProcessing, onAbort }) => {
    return (
        <div className="progress-tracker-container">
            <div className="progress-header">
                <span>{progressLabel}</span>
                <AbortButton isVisible={isProcessing} onAbort={onAbort} />
            </div>
            <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${progress}%` }}></div>
            </div>
        </div>
    );
};

export default ProgressTracker;