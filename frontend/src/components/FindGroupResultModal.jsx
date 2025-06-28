import React from 'react';
import './FindGroupResultModal.css';

const FindGroupResultModal = ({ isOpen, foundCount, folderName, onClose, onGoToDestination }) => {
    if (!isOpen) return null;

    const found = foundCount > 0;
    return (
        <div className="find-group-modal-overlay" onClick={onClose}>
            <div className={`find-group-modal-content ${found ? 'success' : 'empty'}`} onClick={e => e.stopPropagation()}>
                <div className="modal-icon">
                    {found ? (
                        <svg width="48" height="48" fill="none" stroke="#22c55e" strokeWidth="2"><circle cx="24" cy="24" r="22" stroke="#22c55e" strokeWidth="3"/><path d="M16 24l6 6 10-10" stroke="#22c55e" strokeWidth="3" fill="none"/></svg>
                    ) : (
                        <svg width="48" height="48" fill="none" stroke="#f59e42" strokeWidth="2"><circle cx="24" cy="24" r="22" stroke="#f59e42" strokeWidth="3"/><line x1="24" y1="16" x2="24" y2="28" stroke="#f59e42" strokeWidth="3"/><circle cx="24" cy="34" r="2" fill="#f59e42"/></svg>
                    )}
                </div>
                <h2>{found ? 'Photos Found!' : 'No Matches Found'}</h2>
                <p>
                    {found
                        ? `Found and copied ${foundCount} matching photo${foundCount > 1 ? 's' : ''} to "${folderName}".`
                        : `No photos matched your criteria. Try adjusting your filters.`}
                </p>
                <div className="modal-actions">
                    <button className="btn btn-primary" onClick={onGoToDestination} disabled={!found}>
                        Go to Destination
                    </button>
                    <button className="btn btn-secondary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FindGroupResultModal;