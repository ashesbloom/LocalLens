import React, { useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useTutorial } from '../context/TutorialContext';
import { spotlightPath, capsuleRadius, clampRadius, placeTooltip, tooltipOrigin } from './spotlightPath';
import './TutorialOverlay.css';

const PAD = 10;          // breathing room around the target
const TAU = 70;          // ms; how quickly the hole catches up with its target
const FIND_FOR = 1500;   // ms to wait for a target that demo mode is still rendering
const MARGIN = 16;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const fullyVisible = (r) =>
    r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;

const formatContent = (text) => text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/<danger>(.*?)<\/danger>/g, '<span class="tutorial-danger-text">$1</span>');

const FEED_VERB = { mine: ' posted', post: ' posted', reply: ' replied to your post' };

// Made-up community activity for the Community steps, worded like the bell's
// own rows. Labelled as an example so nobody mistakes it for real replies.
const DemoFeed = ({ items }) => (
    <div className="tutorial-demo-feed">
        <span className="tdf-tag">Example</span>
        <ul>
            {items.map((item, i) => (
                <li key={i} className={`tdf-row tdf-${item.kind}`} style={{ animationDelay: `${120 + i * 90}ms` }}>
                    <span className="tdf-line"><strong>{item.author}</strong>{FEED_VERB[item.kind]}</span>
                    <span className="tdf-when">{item.when}</span>
                    <span className="tdf-text">{item.text}</span>
                </li>
            ))}
        </ul>
    </div>
);

// The spotlight is driven by one requestAnimationFrame loop that writes the
// hole, the ring and the card position straight to the DOM. React only
// renders when the step changes. Each frame the loop reads the target's live
// rect and eases toward it, so smooth scrolling, demo-mode layout shifts and
// window resizes are all followed without timers or listeners.
const TutorialOverlay = () => {
    const { isActive, currentStep, nextStep, prevStep, skipTutorial, currentStepIndex, totalSteps, tourLabel } = useTutorial();
    const pathRef = useRef(null);
    const ringRef = useRef(null);
    const glowRef = useRef(null);
    const cardRef = useRef(null);
    const cardSize = useRef({ width: 340, height: 180 });
    const holeRef = useRef(null); // where the hole is right now; survives step changes
    const resizeObs = useRef(null);

    // The card element changes between the tooltip and the expanded card, so
    // its size is watched through a callback ref instead of read every frame.
    const setCard = useCallback((node) => {
        cardRef.current = node;
        resizeObs.current?.disconnect();
        if (!node) return;
        resizeObs.current = new ResizeObserver(() => {
            cardSize.current = { width: node.offsetWidth, height: node.offsetHeight };
        });
        resizeObs.current.observe(node);
    }, []);

    useLayoutEffect(() => {
        if (!isActive || !currentStep) {
            holeRef.current = null;
            return undefined;
        }
        const step = currentStep;
        const reduce = reducedMotion();
        const expanded = step.cardStyle === 'expanded';
        const started = performance.now();
        let last = started;
        let el = null;
        let scrolled = false;
        let placement = null;
        let lastWritten = '';
        let raf = 0;

        if (step.scrollToTop) window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });

        const frame = (now) => {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            // First open: the hole starts as the whole window and irises in.
            if (!holeRef.current) holeRef.current = { x: 0, y: 0, width: vw, height: vh };
            const hole = holeRef.current;

            if (!el || !el.isConnected) el = document.querySelector(step.target);
            const r = el?.getBoundingClientRect();
            const found = r && (r.width > 0 || r.height > 0);
            let target;
            if (found) {
                if (!scrolled) {
                    scrolled = true;
                    if (!step.scrollToTop && !fullyVisible(r)) {
                        el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
                    }
                }
                target = { x: r.left - PAD, y: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
            } else if (now - started > FIND_FOR) {
                // Never appeared: close the hole to a point and centre the card.
                target = { x: vw / 2, y: vh / 2, width: 0, height: 0 };
            } else {
                raf = requestAnimationFrame(frame); // still rendering; hold position
                last = now;
                return;
            }

            const dt = Math.min(now - last, 64);
            last = now;
            const k = reduce ? 1 : 1 - Math.exp(-dt / TAU);
            for (const key of ['x', 'y', 'width', 'height']) {
                const d = target[key] - hole[key];
                hole[key] = Math.abs(d) < 0.25 ? target[key] : hole[key] + d * k;
            }

            const tip = cardSize.current;
            const card = cardRef.current;
            let left;
            let top;
            if (!found) {
                left = (vw - tip.width) / 2;
                top = (vh - tip.height) / 2;
            } else if (expanded) {
                left = Math.max(MARGIN, Math.min(hole.x + hole.width / 2 - tip.width / 2, vw - tip.width - MARGIN));
                top = Math.max(MARGIN, Math.min(hole.y + hole.height + 24, vh - tip.height - MARGIN));
            } else {
                // Side picked from the settled target, position from the moving hole.
                placement = placeTooltip(target, tip, { width: vw, height: vh }, placement);
                ({ left, top } = tooltipOrigin(placement, hole, tip, { width: vw, height: vh }));
            }

            // Nothing moved: skip the writes so a settled step costs one rect read.
            const key = `${hole.x|0},${hole.y|0},${hole.width|0},${hole.height|0},${vw},${vh},${left|0},${top|0},${found}`;
            if (key !== lastWritten) {
                lastWritten = key;
                const radius = clampRadius(
                    step.spotlightShape === 'capsule' ? capsuleRadius(hole.height) : 8,
                    hole.width,
                    hole.height
                );
                pathRef.current?.setAttribute('d', spotlightPath(hole, { width: vw, height: vh }, radius));
                for (const ring of [ringRef.current, glowRef.current]) {
                    if (!ring) continue;
                    ring.setAttribute('x', hole.x);
                    ring.setAttribute('y', hole.y);
                    ring.setAttribute('width', Math.max(0, hole.width));
                    ring.setAttribute('height', Math.max(0, hole.height));
                    ring.setAttribute('rx', radius);
                    ring.setAttribute('ry', radius);
                    ring.style.opacity = found ? '' : '0';
                }
                if (card) {
                    card.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
                    card.dataset.ready = '';
                    if (placement) card.dataset.placement = placement;
                }
            }
            raf = requestAnimationFrame(frame);
        };

        frame(performance.now()); // place everything before the first paint
        return () => cancelAnimationFrame(raf);
    }, [isActive, currentStep]);

    useEffect(() => () => resizeObs.current?.disconnect(), []);

    // Keyboard navigation
    useEffect(() => {
        if (!isActive) return;

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') skipTutorial();
            if (e.key === 'ArrowRight' || e.key === 'Enter') nextStep();
            if (e.key === 'ArrowLeft' && currentStepIndex > 0) prevStep();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isActive, nextStep, prevStep, skipTutorial, currentStepIndex]);

    if (!isActive || !currentStep) return null;

    const isFlagship = currentStep.isFlagship || false;
    const isExpandedCard = currentStep.cardStyle === 'expanded';
    const modeTheme = currentStep.modeTheme || null;
    const isLast = currentStepIndex === totalSteps - 1;
    const counter = tourLabel
        ? `${tourLabel} · ${currentStepIndex + 1} of ${totalSteps}`
        : `Step ${currentStepIndex + 1} of ${totalSteps}`;

    const controls = (
        <>
            <button onClick={skipTutorial} className="tutorial-btn tutorial-btn--skip" aria-label="Skip tutorial (Escape)">
                <kbd className="tutorial-key">Esc</kbd>
            </button>
            <div className="tutorial-nav">
                <button
                    onClick={prevStep}
                    disabled={currentStepIndex === 0}
                    className="tutorial-btn tutorial-btn--secondary"
                    aria-label="Previous step (Left Arrow)"
                >
                    <kbd className="tutorial-key">←</kbd>
                </button>
                <button onClick={nextStep} className="tutorial-btn tutorial-btn--primary" aria-label="Next step (Right Arrow)">
                    {isLast ? 'Finish' : <kbd className="tutorial-key">→</kbd>}
                </button>
            </div>
        </>
    );

    const ex = currentStep.expandedContent;

    return (
        <div className="tutorial-overlay-container">
            <svg className="tutorial-svg-overlay">
                <path ref={pathRef} className="tutorial-overlay-path" fillRule="evenodd" />
                {/* A wide faint stroke under the crisp one stands in for a
                    glow; a CSS drop-shadow here repainted the screen every frame. */}
                <rect ref={glowRef} className={`tutorial-spotlight-glow ${isFlagship ? 'flagship' : ''} ${modeTheme ? `mode-${modeTheme}` : ''}`} />
                <rect ref={ringRef} className={`tutorial-spotlight-border ${isFlagship ? 'flagship' : ''} ${modeTheme ? `mode-${modeTheme}` : ''}`} />
            </svg>

            {!isExpandedCard ? (
                <div
                    ref={setCard}
                    className={`tutorial-tooltip ${isFlagship ? 'flagship' : ''}`}
                    role="dialog"
                    aria-live="polite"
                >
                    <div className="tutorial-step-fade" key={currentStepIndex}>
                        <div className="tutorial-progress">
                            <span className="tutorial-step-counter">{counter}</span>
                        </div>
                        <div className="tutorial-content">
                            <span className={`tutorial-step-badge ${isFlagship ? 'flagship' : ''}`}>
                                {currentStep.title || `Step ${currentStepIndex + 1}`}
                            </span>
                            <p dangerouslySetInnerHTML={{ __html: formatContent(currentStep.content) }} />
                            {currentStep.demoFeed && <DemoFeed items={currentStep.demoFeed} />}
                        </div>
                    </div>
                    <div className="tutorial-controls">{controls}</div>
                </div>
            ) : (
                <div
                    ref={setCard}
                    className={`tutorial-expanded-card ${modeTheme ? `theme-${modeTheme}` : ''}`}
                    role="dialog"
                    aria-live="polite"
                >
                    <div className="expanded-card-inner">
                        <div className="tutorial-step-fade" key={currentStepIndex}>
                            <div className="expanded-card-header">
                                <div className="expanded-card-step">{counter}</div>
                                <h2 className="expanded-card-headline">{ex?.headline}</h2>
                                <p className="expanded-card-tagline">{ex?.tagline}</p>
                            </div>

                            <div className="expanded-card-body">
                                <p className="expanded-card-description">{ex?.description}</p>

                                {ex?.features && (
                                    <div className="expanded-card-features">
                                        {ex.features.map((feature, idx) => (
                                            <div key={idx} className="feature-item">
                                                <span className="feature-label">{feature.label}</span>
                                                <span className="feature-detail">{feature.detail}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {ex?.useCase && (
                                    <div className="expanded-card-usecase">
                                        <h4 className="usecase-title">{ex.useCaseTitle}</h4>
                                        <p className="usecase-text">{ex.useCase}</p>
                                        {ex.useCaseDec && <p className="usecase-text">{ex.useCaseDec}</p>}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="expanded-card-controls">{controls}</div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TutorialOverlay;
