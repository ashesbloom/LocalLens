import React from 'react';

const ProgressTracker = ({ progress, progressLabel }) => {
    return (
        <div>
             <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem'}}>
                <span>{progressLabel}</span>
                <span>{Math.round(progress)}%</span>
            </div>
            <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${progress}%` }}></div>
            </div>
        </div>
    );
};

export default ProgressTracker;