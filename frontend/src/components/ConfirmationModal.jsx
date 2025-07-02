import React from 'react';
import './ConfirmationModal.css';

const ConfirmationModal = ({ isVisible, title, onConfirm, onCancel, confirmText = "Confirm", children }) => {
    if (!isVisible) {
        return null;
    }

    return (
        <div className="confirm-modal-overlay" onClick={onCancel}>
            <div className="confirm-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="confirm-modal-header">
                    <div className="confirm-modal-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                            <line x1="12" y1="9" x2="12" y2="13"></line>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                    </div>
                    <h3>{title}</h3>
                </div>
                <div className="confirm-modal-body">
                    {children}
                </div>
                <div className="confirm-modal-actions">
                    <button className="btn-cancel" onClick={onCancel}>
                        Cancel
                    </button>
                    <button className="btn-confirm" onClick={onConfirm}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;