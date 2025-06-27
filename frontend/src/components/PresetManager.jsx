import React from 'react';

const PresetManager = ({ presets, selectedPreset, handleSelectPreset, handleSavePreset, showSaveButton }) => (
    <div className="form-group">
        <label htmlFor="presets">Configuration Preset</label>
        <div className="preset-selector">
            <select 
                id="presets" 
                value={selectedPreset} 
                onChange={handleSelectPreset} 
                className="select-field"
            >
                <option value="" disabled>Choose a preset to load</option>
                {Object.keys(presets).map(name => (<option key={name} value={name}>{name}</option>))}
            </select>
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

export default PresetManager;