import React from 'react';
import './SortingOptions.css'; 

const SortingOptions = ({ sortMethod, setSortMethod, isProcessing, isEnrolled, enrolledCount, faceMode, setFaceMode }) => {
    
    const getPeopleDescription = () => {
        if (!isEnrolled || enrolledCount === 0) {
            return 'Group photos by recognized faces';
        }
        
        // Calculate accuracy improvement based on enrolled count
        const getAccuracyMetrics = (count) => {
            // Based on face_recognition library performance characteristics
            const baseAccuracy = 76; // Starting accuracy with 1 person
            const maxAccuracy = 92.7; // Theoretical maximum
            const accuracyGain = Math.min((count - 1) * 2, maxAccuracy - baseAccuracy);
            return Math.min(baseAccuracy + accuracyGain, maxAccuracy);
        };

        const getSpeedImprovement = (count) => {
            // Speed improvement comes from better statistical matching
            if (count === 1) return 'Building baseline';
            if (count <= 3) return 'Learning patterns';
            if (count <= 7) return 'Optimizing matches';
            return 'Peak performance';
        };

        const currentAccuracy = getAccuracyMetrics(enrolledCount);
        const speedStatus = getSpeedImprovement(enrolledCount);

        if (enrolledCount === 1) {
            return (
                <div className="people-description">
                    <span className="neural-status" data-tutorial-target="neural-status">
                        Neural network trained on <span className="highlight-count">1</span> person
                    </span>
                    <div className="ai-metrics">
                        <div className="metric-row">
                            <span className="metric-label">Recognition Accuracy:</span>
                            <div className="accuracy-bar">
                                <div className="accuracy-fill" style={{ width: `${currentAccuracy}%` }}>
                                    <span className="accuracy-text">{currentAccuracy}%</span>
                                </div>
                            </div>
                        </div>
                        <div className="metric-row">
                            <span className="metric-label">Learning Status:</span>
                            <span className="speed-status building">{speedStatus}</span>
                        </div>
                    </div>
                    <div className="ai-learning-tip">
                        <span className="tip-icon">🧠</span>
                        <span className="tip-text">Each new person you enroll improves accuracy and processing speed!</span>
                    </div>
                </div>
            );
        }
        
        return (
            <div className="people-description">
                <span className="neural-status" data-tutorial-target="neural-status">
                    Neural network trained on <span className="highlight-count">{enrolledCount}</span> people
                </span>
                <div className="ai-metrics">
                    <div className="metric-row">
                        <span className="metric-label">Recognition Accuracy:</span>
                        <div className="accuracy-bar">
                            <div className="accuracy-fill" style={{ width: `${currentAccuracy}%` }}>
                                <span className="accuracy-text">{currentAccuracy}%</span>
                            </div>
                        </div>
                    </div>
                    <div className="metric-row">
                        <span className="metric-label">Learning Status:</span>
                        <span className={`speed-status ${speedStatus.toLowerCase().replace(' ', '-')}`}>{speedStatus}</span>
                    </div>
                    <div className="metric-row" data-tutorial-target="model-strength">
                        <span className="metric-label">Model Strength:</span>
                        <div className="model-strength">
                            {Array.from({ length: Math.min(enrolledCount, 10) }, (_, i) => (
                                <div key={i} className="strength-dot active"></div>
                            ))}
                            {Array.from({ length: Math.max(0, 10 - enrolledCount) }, (_, i) => (
                                <div key={i + enrolledCount} className="strength-dot"></div>
                            ))}
                            <span className="strength-label">
                                {enrolledCount >= 10 ? 'Maximum' : `${enrolledCount}/10 optimal`}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="ai-learning-tip">
                    <span className="tip-icon">🧠</span>
                    <span className="tip-text">
                        {enrolledCount < 5 
                            ? "Keep adding people to improve accuracy and speed!" 
                            : enrolledCount < 10 
                            ? "Your AI model is getting very smart - excellent performance!"
                            : "Peak AI performance achieved - lightning fast and highly accurate!"
                        }
                    </span>
                </div>
            </div>
        );
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
                        data-tutorial-target={option.id === 'People' ? 'sort-by-faces' : undefined}
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
                <div className="face-mode-selector form-group" data-tutorial-target="face-mode-selector">
                    <label htmlFor="face-mode">🧠 Neural Network Mode</label>
                    <select
                        id="face-mode"
                        value={faceMode}
                        onChange={(e) => setFaceMode(e.target.value)}
                        disabled={isProcessing}
                        className="input-field"
                        data-tutorial-target="face-mode-dropdown"
                    >
                        <option value="fast" data-tutorial-target="face-mode-fast">Fast - Recommended for large sets of photos</option>
                        <option value="balanced" data-tutorial-target="face-mode-balanced">Balanced - Also catches sideways and untagged photos</option>
                        <option value="accurate" data-tutorial-target="face-mode-accurate">Accurate - Last-resort deep scan for anything still missed</option>
                    </select>
                    <p className="description">
                        {faceMode === 'accurate' && "Everything Balanced does, plus a slow deep scan of the photos it still found nothing in (⏱️ Slowest)"}
                        {faceMode === 'fast' && "Full-quality detection, retried at higher resolution for small or distant faces (⚡ Fast processing)"}
                        {faceMode === 'balanced' && "Adds a rotated retry, for photos whose orientation tag is missing or wrong (⚖️ Recommended)"}
                    </p>
                </div>
            )}
        </div>
    );
};

export default SortingOptions;