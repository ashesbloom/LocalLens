import React, { useEffect } from 'react';
import './CommunityToast.css';

const SHOW_MS = 6000;

// The in-app half of a reply notification. The region stays mounted so screen
// readers announce each new toast; only its content comes and goes. A newer
// reply replaces the one on screen rather than stacking.
export default function CommunityToast({ toast, onOpen, onDismiss }) {
    useEffect(() => {
        if (!toast) return undefined;
        const timer = setTimeout(onDismiss, SHOW_MS);
        return () => clearTimeout(timer);
    }, [toast, onDismiss]);

    return (
        <div className="cm-toast-region" role="status" aria-live="polite">
            {toast && (
                <div className="cm-toast" key={toast.at}>
                    <div className="cm-toast-text">
                        <p className="cm-toast-title">{toast.text}</p>
                        {toast.item.excerpt && <p className="cm-toast-excerpt">{toast.item.excerpt}</p>}
                    </div>
                    <button type="button" className="cm-toast-open" onClick={() => onOpen(toast.item)}>
                        Open
                    </button>
                    <button type="button" className="cm-toast-close" onClick={onDismiss} aria-label="Dismiss">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}
