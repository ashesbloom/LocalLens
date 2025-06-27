import React from 'react';

const ActionButtons = ({
    isProcessing,
    handleStartSorting,
    handleOpenDestination,
    destinationFolder,
}) => {
    return (
        <div className="action-buttons-container">
            <button
                className="button primary-button start-button"
                onClick={handleStartSorting}
                disabled={isProcessing}
            >
                <i className="icon-play"></i>
                {isProcessing ? 'Processing...' : 'Start Organizing'}
            </button>
            <button
                className="button secondary-button"
                onClick={handleOpenDestination}
                disabled={isProcessing || !destinationFolder}
                title={!destinationFolder ? "Set a destination folder first" : "Open destination folder"}
            >
                <i className="icon-folder"></i> Open Destination
            </button>
        </div>
    );
};

export default ActionButtons;