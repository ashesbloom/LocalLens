import React from 'react';
import { X } from 'react-feather';

const FolderIcon = ({ className = "icon" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
);

// onClear (optional): an inline × beside Browse, for fields that may be left empty.
const PathSelector = ({ label, path, handleSelectFolder, onClear, clearLabel = 'Clear', placeholder, ...props }) => {
    const clearable = !!(onClear && path);
    return (
        <div className="form-group" {...props}>
            <label>{label}</label>
            <div className="input-group">
                <FolderIcon />
                <input type="text" readOnly value={path} title={path || undefined}placeholder={placeholder ?? `Path to your ${label.toLowerCase()}`} className={`input-field with-icon ${clearable ? 'with-clear' : ''}`} />
                {clearable && (
                    <button type="button" onClick={onClear} className="path-clear" title={clearLabel} aria-label={clearLabel}>
                        <X size={14} />
                    </button>
                )}
                <button onClick={handleSelectFolder} className="btn btn-browse">Browse</button>
            </div>
        </div>
    );
};

export default PathSelector;
