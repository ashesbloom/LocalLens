import React from 'react';
import FaceEnrollment from './FaceEnrollment';
import './FaceEnrollmentModal.css';

const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);

const FaceEnrollmentModal = ({ isVisible, onClose, ...props }) => {
    if (!isVisible) {
        return null;
    }

    // The FaceEnrollment component is passed `isModalMode` to adjust its styling
    // All other necessary props for FaceEnrollment are passed via {...props}
    return (
        <div className="glass-modal-overlay" onClick={onClose}>
            <div className="glass-modal-content enrollment-modal" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className="glass-modal-close-btn" aria-label="Close">
                    <CloseIcon />
                </button>
                
                <div className="glass-modal-header">
                    <h2>Face Enrollment</h2>
                    <p>Add people to the recognition model for sorting.</p>
                </div>

                <div className="glass-modal-body">
                    <FaceEnrollment {...props} isModalMode={true} />
                </div>
            </div>
        </div>
    );
};

export default FaceEnrollmentModal;