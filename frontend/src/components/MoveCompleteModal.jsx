import React from 'react';
import './MoveCompleteModal.css';

const MoveCompleteModal = ({ isOpen, onClose, onGoToDestination }) => {
    if (!isOpen) return null;

    return (
        <div className="move-complete-modal-overlay" onClick={onClose}>
            <div className="move-complete-modal-content success" onClick={e => e.stopPropagation()}>
                <div className="modal-icon">
                    <svg width="48" height="48" fill="none" stroke="#22c55e" strokeWidth="2">
                        <circle cx="24" cy="24" r="22" stroke="#22c55e" strokeWidth="3"/>
                        <path d="M16 24l6 6 10-10" stroke="#22c55e" strokeWidth="3" fill="none"/>
                    </svg>
                </div>
                <h2>Move Complete!</h2>
                <p>
                    The move operation was successful. The source folder is now empty and will be unselected.
                </p>
                <div className="modal-actions">
                    <button className="btn btn-primary" onClick={onGoToDestination}>
                        Go to Destination
                    </button>
                    <button className="btn btn-secondary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MoveCompleteModal;