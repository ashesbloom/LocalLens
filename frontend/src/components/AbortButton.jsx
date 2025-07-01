import React from 'react';
import './AbortButton.css';

const AbortButton = ({ isVisible, onAbort }) => {
    if (!isVisible) {
        return null;
    }

    return (
        <button
            className="abort-button"
            onClick={onAbort}
            title="Abort the current process"
        >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            <span>Abort</span>
        </button>
    );
};

export default AbortButton;