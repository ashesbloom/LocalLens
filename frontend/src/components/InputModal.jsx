import React, { useState, useEffect, useRef } from 'react';
import './InputModal.css';

const InputModal = ({ 
    isVisible, 
    title, 
    placeholder = "Enter a name...",
    initialValue = "",
    onConfirm, 
    onCancel, 
    confirmText = "Save", 
    cancelText = "Cancel",
    icon = "save" // "save" or "edit"
}) => {
    const [value, setValue] = useState(initialValue);
    const inputRef = useRef(null);

    // Focus input when modal opens
    useEffect(() => {
        if (isVisible && inputRef.current) {
            setValue(initialValue);
            // Small delay to ensure the modal is rendered
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 100);
        }
    }, [isVisible, initialValue]);

    // Handle Enter key to submit
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && value.trim()) {
            onConfirm(value.trim());
        } else if (e.key === 'Escape') {
            onCancel();
        }
    };

    if (!isVisible) {
        return null;
    }

    const handleConfirm = () => {
        if (value.trim()) {
            onConfirm(value.trim());
        }
    };

    return (
        <div className="input-modal-overlay" onClick={onCancel}>
            <div className="input-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="input-modal-header">
                    <div className={`input-modal-icon ${icon}`}>
                        {icon === "save" ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                <polyline points="7 3 7 8 15 8"></polyline>
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        )}
                    </div>
                    <h3>{title}</h3>
                </div>
                <div className="input-modal-body">
                    <input
                        ref={inputRef}
                        type="text"
                        className="input-modal-field"
                        placeholder={placeholder}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                </div>
                <div className="input-modal-actions">
                    <button className="btn-cancel" onClick={onCancel}>
                        {cancelText}
                    </button>
                    <button 
                        className="btn-confirm" 
                        onClick={handleConfirm}
                        disabled={!value.trim()}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InputModal;
