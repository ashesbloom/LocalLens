import React, { useEffect, useState } from 'react';
import './MoveCompleteModal.css';

const folderName = (p) => (p || '').split(/[\\/]/).filter(Boolean).pop() || p;

// skipped: {files, source} when a "Skip duplicates" Move left photos in the source.
const MoveCompleteModal = ({ isOpen, onClose, onGoToDestination, skipped, canReview, onTrash, onReview }) => {
    const [confirmTrash, setConfirmTrash] = useState(false);
    const [busy, setBusy] = useState(false);
    useEffect(() => { if (!isOpen) { setConfirmTrash(false); setBusy(false); } }, [isOpen]);

    if (!isOpen) return null;
    const n = skipped?.files?.length || 0;

    return (
        <div className="move-complete-modal-overlay" onClick={busy ? undefined : onClose}>
            <div className="move-complete-modal-content success" onClick={e => e.stopPropagation()}>
                <div className="modal-icon">
                    <svg width="48" height="48" fill="none" stroke="#22c55e" strokeWidth="2">
                        <circle cx="24" cy="24" r="22" stroke="#22c55e" strokeWidth="3"/>
                        <path d="M16 24l6 6 10-10" stroke="#22c55e" strokeWidth="3" fill="none"/>
                    </svg>
                </div>
                <h2>Move Complete!</h2>
                {n === 0 ? (
                    <p>
                        The move operation was successful. The source folder is now empty and will be unselected.
                    </p>
                ) : (
                    <p>
                        {n} duplicate {n === 1 ? 'photo was' : 'photos were'} skipped. {n === 1 ? "It's" : "They're"} still
                        in <strong title={skipped.source}>{folderName(skipped.source)}</strong>. What should happen to {n === 1 ? 'it' : 'them'}?
                    </p>
                )}
                <div className="modal-actions">
                    {n === 0 ? (
                        <>
                            <button className="btn btn-primary" onClick={onGoToDestination}>
                                Go to Destination
                            </button>
                            <button className="btn btn-secondary" onClick={onClose}>
                                Close
                            </button>
                        </>
                    ) : (
                        <>
                            {canReview && (
                                <button className="btn btn-primary" onClick={onReview} disabled={busy}>
                                    Review them
                                </button>
                            )}
                            <button
                                className="btn btn-secondary"
                                disabled={busy}
                                onClick={async () => {
                                    if (!confirmTrash) { setConfirmTrash(true); return; }
                                    setBusy(true);
                                    await onTrash();
                                }}
                            >
                                {busy ? 'Moving to Trash…' : confirmTrash ? `Confirm: move ${n} to Trash` : 'Move to Trash'}
                            </button>
                            <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
                                Leave them
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MoveCompleteModal;
