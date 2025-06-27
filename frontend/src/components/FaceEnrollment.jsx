import React from 'react';

// A small component for the remove icon
const RemoveIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
    </svg>
);

// A small component for the add icon
const AddIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path d="M8 1a.5.5 0 0 1 .5.5v6h6a.5.5 0 0 1 0 1h-6v6a.5.5 0 0 1-1 0v-6h-6a.5.5 0 0 1 0-1h6v-6A.5.5 0 0 1 8 1z"/>
    </svg>
);

// NEW: A small component for the warning icon
const WarningIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
);

const FaceEnrollment = ({
    isEnrolling,
    isProcessing,
    selectedImages,
    personName,
    handleSelectImages,
    setPersonName,
    enrollmentQueue,
    handleAddToQueue,
    handleRemoveFromQueue,
    handleStartBatchEnrollment,
    onViewEnrolledClick,
    isModalMode = false, // <-- Prop added
}) => {
    const canAddToQueue = personName && selectedImages.length > 0;
    const canStartEnrollment = enrollmentQueue.length > 0;

    return (
        <div className={`enrollment-section ${isModalMode ? 'modal-mode' : ''}`}>
            <div className="form-group">
                <h2 className="section-title">Face Enrollment</h2>
                <p className="description">Add multiple people for face recognition. Provide 5-10 photos per person for best results.</p>
            </div>
            
            {/* --- Form for adding a new person --- */}
            <div className="enrollment-form">
                <button 
                    onClick={handleSelectImages} 
                    disabled={isEnrolling || isProcessing} 
                    className="btn btn-secondary select-photos-btn"
                >
                    Select Photos
                </button>
                
                {selectedImages.length > 0 && (
                    <div className="enrollment-details">
                        <p className="description">{selectedImages.length} images selected.</p>
                        <div className="form-group">
                            <input 
                                type="text" 
                                value={personName}
                                onChange={(e) => setPersonName(e.target.value)}
                                placeholder="Enter person's name" 
                                className="input-field"
                                disabled={isEnrolling || isProcessing}
                            />
                        </div>
                        <button 
                            onClick={handleAddToQueue} 
                            disabled={!canAddToQueue || isEnrolling || isProcessing} 
                            className="btn btn-enroll add-person-btn"
                        >
                            <AddIcon /> Add Person
                        </button>
                    </div>
                )}
            </div>

            {/* --- Enrollment Queue Display --- */}
            {enrollmentQueue.length > 0 && (
                <div className="enrollment-queue">
                    <h4 className="queue-title">Enrollment Queue</h4>
                    
                    {/* --- NEW: Performance Warning --- */}
                    {enrollmentQueue.length > 1 && (
                        <div className="enrollment-warning">
                            <div className="warning-icon">
                                <WarningIcon />
                            </div>
                            <p>
                                <strong>Heads-up:</strong> Enrolling multiple people is resource-intensive. For best results on lower-specification systems, please close other applications to prevent instability.
                            </p>
                        </div>
                    )}

                    <ul className="queue-list">
                        {enrollmentQueue.map((person, index) => (
                            <li key={index} className="queue-item">
                                <span className="queue-person-name">{person.personName}</span>
                                <span className="queue-image-count">{person.imagePaths.length} photos</span>
                                <button 
                                    onClick={() => handleRemoveFromQueue(index)} 
                                    className="btn-remove-queue remove-person-btn"
                                    title={`Remove ${person.personName}`}
                                    disabled={isEnrolling || isProcessing}
                                >
                                    <RemoveIcon />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* --- Main action buttons --- */}
            <div className="enrollment-actions">
                <button 
                    onClick={handleStartBatchEnrollment} 
                    disabled={!canStartEnrollment || isEnrolling || isProcessing} 
                    className="btn btn-primary"
                >
                    {isEnrolling ? 'Enrolling...' : `Enroll All (${enrollmentQueue.length})`}
                </button>
                <button
                    onClick={onViewEnrolledClick}
                    disabled={isEnrolling || isProcessing}
                    className="btn btn-secondary"
                >
                    View Enrolled Faces
                </button>
            </div>
        </div>
    );
};

export default FaceEnrollment;
