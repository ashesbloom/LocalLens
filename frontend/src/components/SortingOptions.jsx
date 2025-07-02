import React from 'react';
import './SortingOptions.css'; 

const SortingOptions = ({ sortMethod, setSortMethod, isProcessing, isEnrolled, enrolledCount, faceMode, setFaceMode }) => {
    
    const getPeopleDescription = () => {
        if (!isEnrolled || enrolledCount === 0) {
            return 'Group photos by recognized faces';
        }
        if (enrolledCount === 1) {
            return `Neural network trained on 1 person`;
        }
        return `Neural network trained on ${enrolledCount} people`;
    };
    
    const options = [
        {
            id: 'Date',
            icon: '📅',
            title: 'Sort by Date',
            description: 'Organize photos by when they were taken',
            disabled: false,
        },
        {
            id: 'Location',
            icon: '🌍',
            title: 'Sort by Location',
            description: 'Group photos by GPS coordinates',
            disabled: false,
        },
        {
            id: 'People',
            icon: '🤖',
            title: 'Sort by Faces',
            description: getPeopleDescription(),
            disabled: !isEnrolled,
            tooltip: !isEnrolled ? 'You need to enroll faces first' : 'AI-powered face recognition',
        },
    ];

    return (
        <div className="sorting-options-section">
            <div className="form-group">
                <label>AI Sorting Method</label>
                <p className="description">Choose how you want to organize your photos with AI.</p>
            </div>
            <div className="sorting-card-group">
                {options.map(option => (
                    <label
                        key={option.id}
                        className={`sorting-card ${sortMethod === option.id ? 'selected' : ''} ${option.disabled || isProcessing ? 'disabled' : ''}`}
                        data-type={option.id}
                        title={option.tooltip || option.title}
                    >
                        <input
                            type="radio"
                            name="sortMethod"
                            value={option.id}
                            checked={sortMethod === option.id}
                            onChange={(e) => setSortMethod(e.target.value)}
                            disabled={option.disabled || isProcessing}
                        />
                        <div className="sorting-card-content">
                            <div className="sorting-card-icon">{option.icon}</div>
                            <div className="sorting-card-text">
                                <div className="sorting-card-title">{option.title}</div>
                                <p className="sorting-card-description">{option.description}</p>
                            </div>
                        </div>
                    </label>
                ))}
            </div>

            {/* Neural Network Settings */}
            {sortMethod === 'People' && isEnrolled && (
                <div className="face-mode-selector form-group">
                    <label htmlFor="face-mode">🧠 Neural Network Mode</label>
                    <select
                        id="face-mode"
                        value={faceMode}
                        onChange={(e) => setFaceMode(e.target.value)}
                        disabled={isProcessing}
                        className="input-field"
                    >
                        <option value="fast">Fast - Clear photos only</option>
                        <option value="balanced">Balanced - Recommended</option>
                        <option value="accurate">Accurate - Small faces & groups</option>
                    </select>
                    <p className="description">
                        {faceMode === 'accurate' && "Best for finding small or distant faces in group photos"}
                        {faceMode === 'fast' && "Works great with clear, close-up face photos"}
                        {faceMode === 'balanced' && "Perfect balance of speed and accuracy for most photos"}
                    </p>
                </div>
            )}
        </div>
    );
};

export default SortingOptions;