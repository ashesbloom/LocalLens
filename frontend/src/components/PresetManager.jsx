import React from 'react';
import './PresetManager.css';

const PresetManager = ({ presets, selectedPreset, handleSelectPreset, handleSavePreset, onRequestDelete, showSaveButton }) => {
    return (
        <div className="form-group">
            <label htmlFor="presets">Configuration Preset</label>
            <div className="preset-selector">
                <div className="preset-dropdown-container">
                    <select 
                        id="presets" 
                        value={selectedPreset} 
                        onChange={handleSelectPreset} 
                        className="select-field"
                    >
                        <option value="" disabled>Choose a preset to load</option>
                        {Object.keys(presets).map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                    {selectedPreset && (
                        <button
                            onClick={() => onRequestDelete(selectedPreset)}
                            className="btn btn-delete-preset"
                            title={`Delete preset '${selectedPreset}'`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                        </button>
                    )}
                </div>
                {showSaveButton && (
                    <button 
                        onClick={handleSavePreset} 
                        className="btn btn-save"
                        title="Save current source/destination as a new preset"
                    >
                        Save
                    </button>
                )}
            </div>
        </div>
    );
};

export default PresetManager;