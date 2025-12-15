import React from 'react';

const HierarchyToggle = ({ maintainHierarchy, setMaintainHierarchy, isProcessing, ...props }) => {
    const toggleState = () => {
        if (!isProcessing) {
            setMaintainHierarchy(!maintainHierarchy);
        }
    };

    const currentModeText = maintainHierarchy ? "Recreate Structure" : "Flat Output";

    return (
        <div className="hierarchy-toggle-section" {...props}>
            <div className="form-group">
                <label>Output Folder Structure</label>
                <p className="description">"Recreate" keeps original subfolders. "Flat" places all photos at the top level.</p>
            </div>
            <div className="hierarchy-control">
                <button
                    type="button"
                    role="switch"
                    aria-checked={maintainHierarchy}
                    className={`hierarchy-toggle ${maintainHierarchy ? 'toggled' : ''} ${isProcessing ? 'disabled' : ''}`}
                    onClick={toggleState}
                    disabled={isProcessing}
                    title={isProcessing ? 'Disabled during processing' : `Switch to ${maintainHierarchy ? 'a flat structure' : 'recreating original structure'}`}
                >
                    <div className="toggle-track">
                        <div className="toggle-icon-container">
                            {/* Icon for Flat Structure */}
                            <svg className="icon-flat" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2Z"></path></svg>
                            {/* Icon for Tree Structure */}
                            <svg className="icon-tree" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 10v4"></path><path d="M12 17v.01"></path><path d="M12 7v.01"></path><path d="M12 3a2 2 0 0 0-2 2v1"></path><path d="m14 5-2-2-2 2"></path><path d="M19 12a2 2 0 0 1-2 2h-1"></path><path d="m17 12 2 2-2 2"></path><path d="M5 12a2 2 0 0 0 2 2h1"></path><path d="m7 12-2 2 2 2"></path></svg>
                        </div>
                    </div>
                </button>
                <span className={`toggle-label ${maintainHierarchy ? 'active' : ''}`}>{currentModeText}</span>
            </div>
        </div>
    );
};

export default HierarchyToggle;