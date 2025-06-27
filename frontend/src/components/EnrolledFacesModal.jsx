import React, { useState, useEffect } from 'react';
import './EnrolledFacesModal.css';

const EnrolledFacesModal = ({ isVisible, onClose, onOpenFolder, apiCall }) => {
    const [enrolledFaces, setEnrolledFaces] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (isVisible) {
            setIsLoading(true);
            const fetchEnrolledFaces = async () => {
                try {
                    // This API endpoint needs to be created in your backend
                    const data = await apiCall('/api/enrolled-faces');
                    setEnrolledFaces(data.enrolled_faces || []);
                } catch (error) {
                    console.error("Failed to fetch enrolled faces:", error);
                    setEnrolledFaces([]); // Clear on error
                } finally {
                    setIsLoading(false);
                }
            };
            fetchEnrolledFaces();
        }
    }, [isVisible, apiCall]);

    if (!isVisible) {
        return null;
    }

    return (
        <div className="glass-modal-overlay" onClick={onClose}>
            <div className="glass-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="glass-modal-close-btn" onClick={onClose} title="Close">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
                <div className="glass-modal-header">
                    <h2>Enrolled Faces</h2>
                    <p>A list of all people recognized by the AI model.</p>
                </div>
                <div className="glass-modal-body">
                    <div className="enrollment-warning-note">
                        <div className="warning-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                        </div>
                        <p>
                            <strong>Important Note:</strong> Opening the folder location is for viewing purposes only.
                            Please <strong>do not rename, move, or delete</strong> any images or folders.
                            Tampering with these files will corrupt the AI model and require re-enrollment.
                        </p>
                    </div>

                    {isLoading ? (
                        <div className="loading-spinner">
                            <div className="spinner"></div>
                            <p>Loading Faces...</p>
                        </div>
                    ) : (
                        <ul className="enrolled-faces-list">
                            {enrolledFaces.length > 0 ? (
                                enrolledFaces.map((face, index) => (
                                    <li key={index} className="enrolled-face-item">
                                        <div className="face-info">
                                            <span className="face-name">{face.name}</span>
                                            <span className="face-count">{face.count} image(s)</span>
                                        </div>
                                        <button
                                            className="btn-open-location"
                                            onClick={() => onOpenFolder(face.name)}
                                            title={`Open folder for ${face.name}`}
                                        >
                                            Open Location
                                        </button>
                                    </li>
                                ))
                            ) : (
                                <li className="no-faces-message">
                                    No faces have been enrolled yet.
                                </li>
                            )}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EnrolledFacesModal;