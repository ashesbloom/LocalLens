import React, { useState, useEffect, useRef, useCallback } from 'react';
import { openExternal } from './openExternal';
import { spotlightPath } from './spotlightPath';
import { INTRO_SEEN_KEY } from './communityIntroGate';
import { COMMUNITY_LINKS } from './communitySite';
import './CommunityIntro.css';

// The hole covers the button *and* the space the balls bloom into, so the
// expansion happens inside the lit area instead of behind the dim layer.
// The stack is one ball wide and ends 150px below the trigger's top edge.
const POD_WIDTH = 72;
const POD_DROP = 116;
const POD_RADIUS = POD_WIDTH / 2; // fully round sides — a stadium, like the balls
const SLAB_WIDTH = 360;

const DESTINATIONS = [
    {
        href: COMMUNITY_LINKS.forum,
        title: 'Forum',
        body: 'Report a bug, ask for a feature, or see what other people have run into.',
    },
    {
        href: COMMUNITY_LINKS.announce,
        title: 'Announcements',
        body: 'What shipped in each release, and what is being worked on next.',
    },
    {
        href: COMMUNITY_LINKS.how,
        title: 'Under the hood',
        body: 'How your photos are actually read and sorted, in plain English.',
        extra: { href: COMMUNITY_LINKS.pipeline, label: 'the pipeline in detail' },
    },
];

const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function CommunityIntro({ onExpandMenu, onClose }) {
    const reduced = prefersReducedMotion();
    const [rect, setRect] = useState(null);
    const [viewport, setViewport] = useState({
        width: window.innerWidth,
        height: window.innerHeight,
    });
    const [showSlab, setShowSlab] = useState(reduced);
    const dismissRef = useRef(null);

    // App re-renders on every backend poll and passes fresh arrow functions, so
    // depending on the prop directly would restart the sequence each time and
    // the slab would never get to 760ms. Read it through a ref instead.
    const expandRef = useRef(onExpandMenu);
    useEffect(() => { expandRef.current = onExpandMenu; }, [onExpandMenu]);

    const measure = useCallback(() => {
        const el = document.querySelector('[data-community-anchor]');
        if (!el) return;
        const r = el.getBoundingClientRect();
        setRect({ x: r.left, y: r.top, width: r.width, height: r.height });
        setViewport({ width: window.innerWidth, height: window.innerHeight });
    }, []);

    useEffect(() => {
        measure();
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [measure]);

    // The sequence. Reduced motion gets the end state immediately: the menu is
    // still opened, because the slab explains a control that has to be visible.
    useEffect(() => {
        if (reduced) {
            expandRef.current();
            return;
        }
        const openMenu = setTimeout(() => expandRef.current(), 120);
        const raiseSlab = setTimeout(() => setShowSlab(true), 760);
        return () => {
            clearTimeout(openMenu);
            clearTimeout(raiseSlab);
        };
    }, [reduced]);

    const dismiss = useCallback(() => {
        localStorage.setItem(INTRO_SEEN_KEY, 'true');
        onClose();
    }, [onClose]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') dismiss(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [dismiss]);

    useEffect(() => {
        if (showSlab) dismissRef.current?.focus();
    }, [showSlab]);

    const visit = (href) => {
        openExternal(href);
        dismiss();
    };

    if (!rect) return null;

    const centerX = rect.x + rect.width / 2;
    const hole = {
        x: centerX - POD_WIDTH / 2,
        y: rect.y - 10,
        width: POD_WIDTH,
        height: rect.height + 10 + POD_DROP,
    };

    // Keep the slab on screen, then aim the pointer at the button rather than
    // at the slab's own middle — off-centre is the whole point of a pointer.
    const slabLeft = Math.max(
        16,
        Math.min(centerX - SLAB_WIDTH / 2, viewport.width - SLAB_WIDTH - 16)
    );
    const pointerLeft = Math.max(18, Math.min(centerX - slabLeft, SLAB_WIDTH - 18));

    return (
        <div className="ci-root">
            <svg className="ci-dim" onClick={dismiss}>
                <path d={spotlightPath(hole, viewport, POD_RADIUS)} fillRule="evenodd" />
                <rect
                    className="ci-ring"
                    x={hole.x}
                    y={hole.y}
                    width={hole.width}
                    height={hole.height}
                    rx={POD_RADIUS}
                    ry={POD_RADIUS}
                />
            </svg>

            {showSlab && (
                <div
                    className="ci-slab"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="ci-title"
                    style={{ left: slabLeft, top: hole.y + hole.height + 18, width: SLAB_WIDTH }}
                >
                    <span className="ci-pointer" style={{ left: pointerLeft }} />

                    <div className="ci-eyebrow">
                        <span>New here</span>
                        <span className="ci-esc">esc</span>
                    </div>

                    <h2 id="ci-title">LocalLens has a community site</h2>
                    <p className="ci-lede">
                        The tutorial moved under these three dots. The site sits next to it.
                    </p>

                    <ul className="ci-list">
                        {DESTINATIONS.map(({ href, title, body, extra }) => (
                            <li key={href}>
                                <button className="ci-dest" onClick={() => visit(href)}>
                                    <span className="ci-dest-title">{title}</span>
                                    <span className="ci-dest-body">{body}</span>
                                </button>
                                {extra && (
                                    <button className="ci-sub" onClick={() => visit(extra.href)}>
                                        {extra.label}
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>

                    <div className="ci-actions">
                        <button
                            className="ci-btn ci-btn-primary"
                            onClick={() => visit(COMMUNITY_LINKS.root)}
                        >
                            Open the site
                        </button>
                        <button ref={dismissRef} className="ci-btn" onClick={dismiss}>
                            Got it
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CommunityIntro;
