import React, { useState, useEffect, useRef } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { start, step, visible, done } from './typewriter';
import './McpAnnounce.css';

export const MCP_SITE_URL = 'https://locallensmcp.vercel.app/?ref=app';

const SEEN_KEY = 'mcp_announce_seen';

// The third scene resolves to a Pro tool — free during the preview, so the
// chip is informational, not an upsell.
const SCENES = [
    {
        prompt: 'sort my camera roll by who’s in it',
        pro: false,
        rows: [
            ['Camera Roll/', ''],
            ['├── Mara/', '1,204 photos'],
            ['├── Jonas/', '863 photos'],
            ['└── Unsorted/', '91 photos'],
        ],
    },
    {
        prompt: 'find every photo from the Algarve in 2024',
        pro: false,
        rows: [
            ['Algarve 2024/', ''],
            ['├── PT/Algarve/Lagos/', '318 photos'],
            ['├── PT/Algarve/Sagres/', '204 photos'],
            ['└── PT/Algarve/Albufeira/', '77 photos'],
        ],
    },
    {
        prompt: 'watch this folder and sort new photos as they land',
        pro: true,
        rows: [
            ['Watching Camera Roll/', ''],
            ['├── trigger', 'on arrival'],
            ['├── sort by', 'date → people'],
            ['└── status', 'active'],
        ],
    },
];

const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The signature: a prompt types itself, then resolves into a folder tree. */
function Transcript({ backendPort }) {
    const reduced = prefersReducedMotion();
    const [scene, setScene] = useState(0);
    const [typed, setTyped] = useState(reduced ? SCENES[0].prompt : '');
    const [showOut, setShowOut] = useState(reduced);
    const timers = useRef([]);

    useEffect(() => {
        if (reduced) return; // render the final frame, skip the cycle

        const wait = (ms) => new Promise((r) => timers.current.push(setTimeout(r, ms)));
        let cancelled = false;

        (async () => {
            let s = start(SCENES[scene].prompt);
            setTyped('');
            setShowOut(false);
            while (!done(s)) {
                s = step(s);
                if (cancelled) return;
                setTyped(visible(s));
                await wait(26 + Math.random() * 34);
            }
            await wait(320);
            if (cancelled) return;
            setShowOut(true);
            await wait(3400);
            if (cancelled) return;
            setScene((n) => (n + 1) % SCENES.length);
        })();

        return () => {
            cancelled = true;
            timers.current.forEach(clearTimeout);
            timers.current = [];
        };
    }, [scene, reduced]);

    const current = SCENES[scene];

    return (
        <div className="mcpa-term">
            <div className="mcpa-term-body">
                <div className="mcpa-line">
                    <span className="mcpa-caret">&rsaquo;</span>
                    <span className="mcpa-typed">{typed}</span>
                    {!reduced && <span className="mcpa-cursor" aria-hidden="true" />}
                    {showOut && current.pro && <span className="mcpa-chip">pro &middot; free for now</span>}
                </div>

                <div className="mcpa-out" aria-live="polite">
                    {showOut &&
                        current.rows.map(([name, num], i) => (
                            <div
                                key={name}
                                className={`mcpa-row${i === 0 ? ' head' : ''}`}
                                style={reduced ? undefined : { animationDelay: `${i * 90}ms` }}
                            >
                                <span className="mcpa-name">{name}</span>
                                <span className="mcpa-num">{num}</span>
                            </div>
                        ))}
                </div>
            </div>

            {/* The privacy claim as ambient furniture, not a pitch. */}
            <div className="mcpa-status">
                <span>&#9205; locallens</span>
                <span className="mcpa-sep">&middot;</span>
                {backendPort ? (
                    <span className="mcpa-on">127.0.0.1:{backendPort}</span>
                ) : (
                    <span className="mcpa-off">not running</span>
                )}
                <span className="mcpa-sep">&middot;</span>
                <span>0 B out</span>
            </div>
        </div>
    );
}

function McpAnnounce({ backendPort, onShowPrivacy }) {
    const [isOpen, setIsOpen] = useState(() => !localStorage.getItem(SEEN_KEY));
    const primaryRef = useRef(null);

    const dismiss = () => {
        localStorage.setItem(SEEN_KEY, 'true');
        setIsOpen(false);
    };

    const openSetup = () => {
        // Falls back to the guide on the site if the backend isn't up yet.
        openUrl(backendPort ? `http://127.0.0.1:${backendPort}/setup` : MCP_SITE_URL);
        dismiss();
    };

    useEffect(() => {
        if (!isOpen) return;
        primaryRef.current?.focus();
        const onKey = (e) => {
            if (e.key === 'Escape') dismiss();
            if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') openSetup();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, backendPort]);

    if (!isOpen) return null;

    return (
        <div className="mcpa-overlay" onClick={dismiss}>
            <div
                className="mcpa-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="mcpa-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mcpa-eyebrow">
                    <span><span className="mcpa-mark">&#10022;</span> new in 3.0</span>
                    <span className="mcpa-esc">esc</span>
                </div>

                <h2 id="mcpa-title">The correct way to organize your photos?</h2>

                <Transcript backendPort={backendPort} />

                <p className="mcpa-lede">
                    Ask for it in plain words. Nothing uploads &mdash; not even a filename.
                </p>

                <div className="mcpa-actions">
                    <button ref={primaryRef} className="mcpa-btn mcpa-btn-primary" onClick={openSetup}>
                        Set it up
                    </button>
                    <button className="mcpa-btn" onClick={dismiss}>
                        Not now
                    </button>
                    {onShowPrivacy && (
                        <button
                            className="mcpa-link"
                            onClick={() => { dismiss(); onShowPrivacy(); }}
                        >
                            what we store
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default McpAnnounce;
