import React from 'react';

const FolderSelector = ({
    sourceFolder,
    setSourceFolder,
    destinationFolder,
    setDestinationFolder,
    isProcessing,
    setShowSaveButton,
}) => {
    const handlePathChange = (e, setter) => {
        setter(e.target.value);
        setShowSaveButton(true); // Show save preset button on manual change
    };

    return (
        <div className="card-section">
            <h3 className="section-title">Folder Selection</h3>
            <div className="folder-input-group">
                <label htmlFor="source-folder">Source Folder</label>
                <input
                    id="source-folder"
                    type="text"
                    value={sourceFolder}
                    onChange={(e) => handlePathChange(e, setSourceFolder)}
                    placeholder="Paste the full path to your source folder here"
                    disabled={isProcessing}
                    className="folder-path-input"
                />
                <p className="tooltip">The folder containing the images you want to organize.</p>
            </div>
            <div className="folder-input-group">
                <label htmlFor="destination-folder">Destination Folder</label>
                <input
                    id="destination-folder"
                    type="text"
                    value={destinationFolder}
                    onChange={(e) => handlePathChange(e, setDestinationFolder)}
                    placeholder="Paste the full path for the organized photos"
                    disabled={isProcessing}
                    className="folder-path-input"
                />
                <p className="tooltip">The folder where the organized photos will be saved.</p>
            </div>
        </div>
    );
};

export default FolderSelector;