import React from 'react';

const FolderIcon = ({ className = "icon" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
);

const PathSelector = ({ label, path, handleSelectFolder }) => (
    <div className="form-group">
        <label>{label}</label>
        <div className="input-group">
            <FolderIcon />
            <input type="text" readOnly value={path} placeholder={`Path to your ${label.toLowerCase()}`} className="input-field with-icon" />
            <button onClick={handleSelectFolder} className="btn btn-browse">Browse</button>
        </div>
    </div>
);

export default PathSelector;