import React from 'react';
import './ConfirmationModal.css';

const ConfirmationModal = ({ isVisible, title, message, onConfirm, onCancel }) => {
    if (!isVisible) {
        return null;
    }

    return (
        <div className="confirm-modal-overlay">
            <div className="confirm-modal-content" onClick={(e) => e.stopPropagation()}>
                <h3>{title}</h3>
                <p>{message}</p>
                <div className="confirm-modal-actions">
                    <button className="btn-cancel" onClick={onCancel}>
                        Cancel
                    </button>
                    <button className="btn-confirm" onClick={onConfirm}>
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;