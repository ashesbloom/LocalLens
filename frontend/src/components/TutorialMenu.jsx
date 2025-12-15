import React, { useState, useRef, useEffect } from 'react';
import { getGroupedSteps } from '../config/tutorialSteps';
import './TutorialMenu.css';

const TutorialMenu = ({ onStartFromStep, onStartFromScratch }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState({});
    const menuRef = useRef(null);
    const groups = getGroupedSteps();

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const toggleGroup = (groupName) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupName]: !prev[groupName]
        }));
    };

    const handleStepClick = (stepIndex) => {
        setIsOpen(false);
        onStartFromStep(stepIndex);
    };

    const handleStartFromScratch = () => {
        setIsOpen(false);
        onStartFromScratch();
    };

    // Group icons
    const groupIcons = {
        'Getting Started': (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
        ),
        'Folder Management': (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
        ),
        'Face Recognition': (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="5"></circle>
                <path d="M20 21a8 8 0 1 0-16 0"></path>
            </svg>
        ),
        'AI Settings': (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
        ),
        'Controls': (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="9" y1="21" x2="9" y2="9"></line>
            </svg>
        )
    };

    return (
        <div className="tutorial-menu-container" ref={menuRef}>
            <button 
                className={`tutorial-start-btn ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                title="Start Tutorial"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <circle cx="12" cy="17" r="0.5" fill="currentColor"></circle>
                </svg>
            </button>

            {isOpen && (
                <div className="tutorial-menu-dropdown">
                    <div className="tutorial-menu-header">
                        <span className="tutorial-menu-title">Tutorial</span>
                        <button className="tutorial-menu-close" onClick={() => setIsOpen(false)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>

                    <button className="tutorial-menu-start-fresh" onClick={handleStartFromScratch}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                        Start from Beginning
                    </button>

                    <div className="tutorial-menu-divider">
                        <span>or jump to section</span>
                    </div>

                    <div className="tutorial-menu-groups">
                        {groups.map((group) => (
                            <div key={group.name} className="tutorial-menu-group">
                                <button 
                                    className={`tutorial-menu-group-header ${expandedGroups[group.name] ? 'expanded' : ''}`}
                                    onClick={() => toggleGroup(group.name)}
                                >
                                    <span className="group-icon">
                                        {groupIcons[group.name] || groupIcons['Controls']}
                                    </span>
                                    <span className="group-name">{group.name}</span>
                                    <span className="group-count">{group.steps.length}</span>
                                    <svg className="group-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                </button>
                                
                                {expandedGroups[group.name] && (
                                    <div className="tutorial-menu-steps">
                                        {group.steps.map((step) => (
                                            <button 
                                                key={step.index}
                                                className={`tutorial-menu-step ${step.isFlagship ? 'flagship' : ''}`}
                                                onClick={() => handleStepClick(step.index)}
                                            >
                                                <span className="step-number">{step.index + 1}</span>
                                                <span className="step-title">{step.title}</span>
                                                {step.isFlagship && (
                                                    <span className="step-flagship-badge">★</span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TutorialMenu;
