import React from 'react';

// Same markup and classes as HierarchyToggle, so it inherits that styling.
// Off by default and never remembered: skipping photos is a per-sort choice.
const SkipDuplicatesToggle = ({ skipDuplicates, setSkipDuplicates, isProcessing }) => (
    <div className="hierarchy-toggle-section">
        <div className="form-group">
            <label>Duplicates</label>
            <p className="description">"Skip" leaves out photos already in the destination, and extra copies inside the source (the best copy is sorted).</p>
        </div>
        <div className="hierarchy-control">
            <button
                type="button"
                role="switch"
                aria-checked={skipDuplicates}
                className={`hierarchy-toggle ${skipDuplicates ? 'toggled' : ''} ${isProcessing ? 'disabled' : ''}`}
                onClick={() => !isProcessing && setSkipDuplicates(!skipDuplicates)}
                disabled={isProcessing}
                title={isProcessing ? 'Disabled during processing' : skipDuplicates ? 'Sort every photo' : 'Skip duplicate photos'}
            >
                <div className="toggle-track">
                    <div className="toggle-icon-container">
                        {/* Sort everything */}
                        <svg className="icon-flat" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        {/* Skip duplicates */}
                        <svg className="icon-tree" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M8 12l3 3 5-6"></path></svg>
                    </div>
                </div>
            </button>
            <span className={`toggle-label ${skipDuplicates ? 'active' : ''}`}>{skipDuplicates ? 'Skip duplicates' : 'Sort everything'}</span>
        </div>
    </div>
);

export default SkipDuplicatesToggle;
