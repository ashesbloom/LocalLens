import React, { useState, useEffect } from 'react';
import './EnrolledFacesModal.css';
import ConfirmationModal from './ConfirmationModal'; // Import the new component

const EnrolledFacesModal = ({ isVisible, onClose, onOpenFolder, apiCall, logToConsole, onFaceDeleted }) => {
    const [enrolledFaces, setEnrolledFaces] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [personToDelete, setPersonToDelete] = useState(null); // State to manage which person to delete

    useEffect(() => {
        if (isVisible) {
            setIsLoading(true);
            const fetchEnrolledFaces = async () => {
                try {
                    const data = await apiCall('/api/enrolled-faces');
                    setEnrolledFaces(data.enrolled_faces || []);
                } catch (error) {
                    console.error("Failed to fetch enrolled faces:", error);
                    setEnrolledFaces([]);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchEnrolledFaces();
        }
    }, [isVisible, apiCall]);

    const initiateDelete = (personName) => {
        setPersonToDelete(personName); // Set the person to be deleted, which shows the modal
    };

    const executeDelete = async () => {
        if (!personToDelete) return;

        try {
            const response = await apiCall('/api/delete-enrolled-face', {
                method: 'POST',
                body: JSON.stringify({ person_name: personToDelete }),
            });
            if (logToConsole) {
                logToConsole(response.message, 'success');
            }
            setEnrolledFaces(enrolledFaces.filter(face => face.name !== personToDelete));
            if (onFaceDeleted) {
                onFaceDeleted(); // Trigger the refresh in App.jsx
            }
        } catch (error) {
            const errorMsg = error.detail || `An error occurred while trying to delete '${personToDelete}'.`;
            console.error(`Failed to delete '${personToDelete}':`, error);
            if (logToConsole) {
                logToConsole(errorMsg, 'error');
            }
        } finally {
            setPersonToDelete(null); // Hide the confirmation modal
        }
    };

    const cancelDelete = () => {
        setPersonToDelete(null); // Hide the confirmation modal
    };

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
                                        <div className="face-actions">
                                            <button
                                                className="btn-open-location"
                                                onClick={() => onOpenFolder(face.name)}
                                                title={`Open folder for ${face.name}`}
                                            >
                                                Open Location
                                            </button>
                                            <button
                                                className="btn-delete-face"
                                                onClick={() => initiateDelete(face.name)}
                                                title={`Delete '${face.name}'`}
                                            >
                                                Delete Face
                                            </button>
                                        </div>
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
            <ConfirmationModal
                isVisible={!!personToDelete}
                title="Confirm Deletion"
                message={`Are you sure you want to delete '${personToDelete}'? This action cannot be undone.`}
                onConfirm={executeDelete}
                onCancel={cancelDelete}
            />
        </div>
    );
};

export default EnrolledFacesModal;