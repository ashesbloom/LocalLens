import React from 'react';

const SubfolderSelector = ({ subfolders, ignoredSubfolders, setIgnoredSubfolders, isProcessing, stats, className = '', onAnimationEnd }) => {
    if (subfolders.length === 0 && !stats) {
        return null;
    }

    const handleCheckboxChange = (folderName) => {
        setIgnoredSubfolders(prev => 
            prev.includes(folderName)
                ? prev.filter(f => f !== folderName)
                : [...prev, folderName]
        );
    };

    return (
        <div className={`subfolder-selector-section ${className}`} onAnimationEnd={onAnimationEnd}>
            <div className="subfolder-header">
                <div className="form-group">
                    <label>Source Folder Contents</label>
                    <p className="description">
                        A scan of your source folder found the following. Select subfolders to exclude them.
                    </p>
                </div>
                {stats && (
                    <div className="folder-stats">
                        <div>
                            <strong>{stats.file_count}</strong>
                            <span>supported files</span>
                        </div>
                        <div>
                            <strong>{stats.folder_count}</strong>
                            <span>subfolders</span>
                        </div>
                    </div>
                )}
            </div>

            {subfolders.length > 0 && (
                <div className="subfolder-list">
                    {subfolders.map(folder => (
                        <label key={folder} className="subfolder-item" title={folder}>
                            <input 
                                type="checkbox"
                                checked={ignoredSubfolders.includes(folder)}
                                onChange={() => handleCheckboxChange(folder)}
                                disabled={isProcessing}
                            />
                            <span className="folder-icon">📁</span>
                            <span className="folder-name">{folder}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SubfolderSelector;