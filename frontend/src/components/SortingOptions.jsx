import React from 'react';

const SortingOptions = ({ sortMethod, setSortMethod, isProcessing, isEnrolled, enrolledCount, faceMode, setFaceMode }) => {
    
    const getPeopleDescription = () => {
        if (!isEnrolled || enrolledCount === 0) {
            return 'Group photos by recognized faces you have enrolled.';
        }
        if (enrolledCount === 1) {
            return 'Group photos based on the 1 person you have enrolled.';
        }
        return `Group photos based on the ${enrolledCount} people you have enrolled.`;
    };
    
    const options = [
        {
            id: 'Date',
            icon: '📅', // Using emoji for simplicity, can be replaced with <i className="icon-calendar"></i>
            title: 'Sort by Date',
            description: 'Group photos into folders like "2025-06-22".',
            disabled: false,
        },
        {
            id: 'Location',
            icon: '📍', // Using emoji for simplicity, can be replaced with <i className="icon-location"></i>
            title: 'Sort by Location',
            description: 'Group photos by city and country, like "Paris, France".',
            disabled: false,
        },
        {
            id: 'People',
            icon: '👥', // Using emoji for simplicity, can be replaced with <i className="icon-people"></i>
            title: 'Sort by People',
            description: getPeopleDescription(),
            disabled: !isEnrolled,
            tooltip: !isEnrolled ? 'You must enroll at least one person first' : 'Sort by recognized faces',
        },
    ];

    return (
        <div className="sorting-options-section">
            <div className="form-group">
                <label>Sorting Method</label>
                <p className="description">Choose the primary method for organizing your photo library.</p>
            </div>
            <div className="sorting-card-group">
                {options.map(option => (
                    <label
                        key={option.id}
                        className={`sorting-card ${sortMethod === option.id ? 'selected' : ''} ${option.disabled || isProcessing ? 'disabled' : ''}`}
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
                        <div className="sorting-card-icon">{option.icon}</div>
                        <div className="sorting-card-content">
                            <div className="sorting-card-title">{option.title}</div>
                            <p className="sorting-card-description">{option.description}</p>
                        </div>
                    </label>
                ))}
            </div>

            {/* Conditional UI for Face Recognition Mode, shown only when 'People' is selected */}
            {sortMethod === 'People' && isEnrolled && (
                <div className="face-mode-selector form-group">
                    <label htmlFor="face-mode">AI Model Accuracy</label>
                    <select
                        id="face-mode"
                        value={faceMode}
                        onChange={(e) => setFaceMode(e.target.value)}
                        disabled={isProcessing}
                        className="input-field"
                    >
                        <option value="fast">Fast (Good Quality Photos)</option>
                        <option value="balanced">Balanced (Recommended)</option>
                        <option value="accurate">Accurate (Best for Small Faces)</option>
                    </select>
                    <p className="description">
                        {faceMode === 'accurate' && "Slower, but finds small or unclear faces. Ideal for group shots."}
                        {faceMode === 'fast' && "Fastest option, but works best on clear, front-facing photos."}
                        {faceMode === 'balanced' && "A great mix of speed and accuracy for most photo collections."}
                    </p>
                </div>
            )}
        </div>
    );
};

export default SortingOptions;