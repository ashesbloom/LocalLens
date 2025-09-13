import React from 'react';
import { Copy, ArrowRightCircle } from 'react-feather';
import './OperationModeToggle.css';

const OperationModeToggle = ({ operationMode, setOperationMode, isProcessing }) => {
    const isMove = operationMode === 'move';

    const handleToggle = () => {
        if (!isProcessing) {
            setOperationMode(isMove ? 'copy' : 'move');
        }
    };

    return (
        <div className="form-group">
            <label>File Operation</label>
            <div 
                className={`op-mode-toggle ${isMove ? 'move-active' : 'copy-active'}`}
                onClick={handleToggle}
                aria-disabled={isProcessing}
                role="switch"
                aria-checked={isMove}
                title={`Click to switch to ${isMove ? 'Copy' : 'Move'}`}
            >
                <div className="op-mode-thumb">
                    {/* Icon removed from here to prevent overlap */}
                </div>
                <div className="op-mode-label op-mode-copy">
                    <Copy size={16} />
                    <span>Copy</span>
                </div>
                <div className="op-mode-label op-mode-move">
                    <ArrowRightCircle size={16} />
                    <span>Move</span>
                </div>
            </div>
            <p className="description">
                {isMove 
                    ? "'Move' is faster on the same drive, But slower on 'external' drives." 
                    : "'Copy' creates a duplicate of your files in the destination."}
            </p>
        </div>
    );
};

export default OperationModeToggle;