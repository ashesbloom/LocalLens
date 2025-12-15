import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTutorial } from '../context/TutorialContext';
import './TutorialOverlay.css';

// Smooth interpolation for animated transitions
const lerp = (start, end, factor) => start + (end - start) * factor;

const TutorialOverlay = () => {
    const { isActive, currentStep, nextStep, prevStep, skipTutorial, currentStepIndex, totalSteps } = useTutorial();
    const [targetRect, setTargetRect] = useState(null);
    const [animatedRect, setAnimatedRect] = useState(null);
    const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0, placement: 'bottom' });
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [hasAnimated, setHasAnimated] = useState(false); // Track if enter animation has played
    const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
    const observerRef = useRef(null);
    const animationRef = useRef(null);
    const tooltipRef = useRef(null);
    const rafUpdateRef = useRef(null); // Throttle spotlight position updates

    // Update window size on resize
    useEffect(() => {
        const handleResize = () => {
            setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Calculate optimal tooltip position
    const calculateTooltipPosition = useCallback((rect) => {
        if (!rect || !tooltipRef.current) return { top: 0, left: 0, placement: 'bottom' };
        
        const tooltipEl = tooltipRef.current;
        const tooltipWidth = 340;
        const tooltipHeight = tooltipEl.offsetHeight || 180;
        const padding = 16;
        const spotlightGap = 12;

        // Available space in each direction
        const spaceTop = rect.y;
        const spaceBottom = windowSize.height - (rect.y + rect.height);
        const spaceLeft = rect.x;
        const spaceRight = windowSize.width - (rect.x + rect.width);

        let placement = 'bottom';
        let top = 0;
        let left = 0;

        // Determine best vertical placement
        if (spaceBottom >= tooltipHeight + spotlightGap + padding) {
            placement = 'bottom';
            top = rect.y + rect.height + spotlightGap;
        } else if (spaceTop >= tooltipHeight + spotlightGap + padding) {
            placement = 'top';
            top = rect.y - tooltipHeight - spotlightGap;
        } else if (spaceRight >= tooltipWidth + spotlightGap + padding) {
            placement = 'right';
            top = rect.y + (rect.height / 2) - (tooltipHeight / 2);
        } else if (spaceLeft >= tooltipWidth + spotlightGap + padding) {
            placement = 'left';
            top = rect.y + (rect.height / 2) - (tooltipHeight / 2);
        } else {
            // Fallback: position at bottom with scroll
            placement = 'bottom';
            top = rect.y + rect.height + spotlightGap;
        }

        // Calculate horizontal position
        if (placement === 'top' || placement === 'bottom') {
            left = rect.x + (rect.width / 2) - (tooltipWidth / 2);
            // Keep within viewport bounds
            left = Math.max(padding, Math.min(left, windowSize.width - tooltipWidth - padding));
        } else if (placement === 'right') {
            left = rect.x + rect.width + spotlightGap;
        } else if (placement === 'left') {
            left = rect.x - tooltipWidth - spotlightGap;
        }

        // Ensure top stays within bounds
        top = Math.max(padding, Math.min(top, windowSize.height - tooltipHeight - padding));

        return { top, left, placement };
    }, [windowSize]);

    // Animate spotlight transition
    useEffect(() => {
        if (!targetRect) return;

        if (!animatedRect) {
            setAnimatedRect(targetRect);
            return;
        }

        setIsTransitioning(true);
        const startRect = { ...animatedRect };
        const endRect = { ...targetRect };
        const duration = 320;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function (smooth ease-in-out)
            const eased = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            setAnimatedRect({
                x: lerp(startRect.x, endRect.x, eased),
                y: lerp(startRect.y, endRect.y, eased),
                width: lerp(startRect.width, endRect.width, eased),
                height: lerp(startRect.height, endRect.height, eased),
            });

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            } else {
                setIsTransitioning(false);
            }
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [targetRect]);

    // Update tooltip position when animated rect changes
    useEffect(() => {
        if (animatedRect) {
            const newPosition = calculateTooltipPosition(animatedRect);
            setTooltipPosition(newPosition);
            // Mark as ready once we have calculated a position
            if (!isReady) {
                // Small delay to ensure smooth initial render
                const timer = setTimeout(() => {
                    setIsReady(true);
                    // Mark animation as played after it completes
                    setTimeout(() => setHasAnimated(true), 400);
                }, 100);
                return () => clearTimeout(timer);
            }
        }
    }, [animatedRect, calculateTooltipPosition, isReady]);

    // Find and track target element
    useEffect(() => {
        if (!isActive || !currentStep) return;

        const updateRect = () => {
            if (rafUpdateRef.current) return;

            rafUpdateRef.current = requestAnimationFrame(() => {
                // Handle scroll to top first if needed
                if (currentStep.scrollToTop) {
                    // Use instant scroll to prevent fighting with spotlight animation
                    // This fixes the choppy/delayed effect when moving from bottom to top
                    window.scrollTo({ top: 0, behavior: 'auto' });
                }

                const element = document.querySelector(currentStep.target);
                if (element) {
                    // First scroll element into view, then get rect after scroll completes
                    if (!currentStep.scrollToTop) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    
                    // Use a longer delay for mode switch animations (UI shifts when enrollment button appears/disappears)
                    const delay = currentStep.demoAnimation?.startsWith('select-') ? 500 : 100;
                    
                    // Use a small delay to get rect after scroll animation starts
                    // This ensures the element is visible in viewport
                    setTimeout(() => {
                        const rect = element.getBoundingClientRect();
                        const padding = 10;
                        setTargetRect({
                            x: rect.left - padding,
                            y: rect.top - padding,
                            width: rect.width + (padding * 2),
                            height: rect.height + (padding * 2),
                        });
                    }, delay);
                }

                rafUpdateRef.current = null;
            });
        };

        // Slightly longer delay to allow DOM and scroll to settle
        const timeoutId = setTimeout(updateRect, 80);

        // Set up ResizeObserver for the target
        const element = document.querySelector(currentStep.target);
        if (element) {
            observerRef.current = new ResizeObserver(updateRect);
            observerRef.current.observe(element);
        }

        // Also update on scroll
        window.addEventListener('scroll', updateRect, true);

        return () => {
            clearTimeout(timeoutId);
            if (observerRef.current) observerRef.current.disconnect();
            if (rafUpdateRef.current) cancelAnimationFrame(rafUpdateRef.current);
            window.removeEventListener('scroll', updateRect, true);
        };
    }, [isActive, currentStep, windowSize]);

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

    // Reset ready state when tutorial stops
    useEffect(() => {
        if (!isActive) {
            setIsReady(false);
            setHasAnimated(false);
            setAnimatedRect(null);
            setTargetRect(null);
        }
    }, [isActive]);

    if (!isActive || !currentStep || !animatedRect) return null;

    const isFlagship = currentStep.isFlagship || false;
    const isExpandedCard = currentStep.cardStyle === 'expanded';
    const spotlightShape = currentStep.spotlightShape || 'rectangle';
    const modeTheme = currentStep.modeTheme || null;

    // Create SVG path with rounded hole (or capsule)
    const r = spotlightShape === 'capsule' ? Math.min(animatedRect.height / 2, 20) : 8;
    const { x, y, width, height } = animatedRect;
    
    const path = `
        M 0 0
        H ${windowSize.width}
        V ${windowSize.height}
        H 0
        Z
        M ${x + r} ${y}
        H ${x + width - r}
        Q ${x + width} ${y} ${x + width} ${y + r}
        V ${y + height - r}
        Q ${x + width} ${y + height} ${x + width - r} ${y + height}
        H ${x + r}
        Q ${x} ${y + height} ${x} ${y + height - r}
        V ${y + r}
        Q ${x} ${y} ${x + r} ${y}
        Z
    `;

    return (
        <div className="tutorial-overlay-container">
            {/* SVG Overlay with spotlight hole */}
            <svg className="tutorial-svg-overlay">
                <defs>
                    <filter id="spotlight-glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feFlood floodColor="var(--color-primary, #3b82f6)" floodOpacity="0.6" />
                        <feComposite in2="blur" operator="in" />
                        <feMerge>
                            <feMergeNode />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                <path
                    d={path}
                    className="tutorial-overlay-path"
                    fillRule="evenodd"
                />
                {/* Spotlight border glow */}
                <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    rx={r}
                    ry={r}
                    className={`tutorial-spotlight-border ${isFlagship ? 'flagship' : ''} ${modeTheme ? `mode-${modeTheme}` : ''}`}
                />
            </svg>

            {/* Tooltip Card - only render when position is ready */}
            {isReady && !isExpandedCard && (
                <div 
                    ref={tooltipRef}
                    className={`tutorial-tooltip tutorial-tooltip--${tooltipPosition.placement} ${isTransitioning ? 'transitioning' : ''} ${hasAnimated ? 'no-enter-animation' : ''} ${isFlagship ? 'flagship' : ''}`}
                    style={{
                        top: tooltipPosition.top,
                        left: tooltipPosition.left,
                    }}
                >
                    {/* Progress indicator */}
                    <div className="tutorial-progress">
                        <span className="tutorial-step-counter">
                            Step {currentStepIndex + 1} of {totalSteps}
                        </span>
                    </div>

                <div className="tutorial-content">
                    <span className={`tutorial-step-badge ${isFlagship ? 'flagship' : ''}`}>
                        Step {currentStepIndex + 1}
                    </span>
                    <p dangerouslySetInnerHTML={{ __html: currentStep.content
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/<danger>(.*?)<\/danger>/g, '<span class="tutorial-danger-text">$1</span>')
                    }} />
                </div>

                <div className="tutorial-controls">
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
                            {currentStepIndex === totalSteps - 1 ? (
                                'Finish'
                            ) : (
                                <kbd className="tutorial-key">→</kbd>
                            )}
                        </button>
                    </div>
                </div>
            </div>
            )}

            {/* Expanded Card - for mode explanations */}
            {isReady && isExpandedCard && (
                <div 
                    className={`tutorial-expanded-card ${modeTheme ? `theme-${modeTheme}` : ''} ${hasAnimated ? 'no-enter-animation' : ''}`}
                    style={{
                        top: animatedRect.y + animatedRect.height + 24,
                    }}
                >
                    <div className="expanded-card-inner">
                        {/* Header */}
                        <div className="expanded-card-header">
                            <div className="expanded-card-step">
                                Step {currentStepIndex + 1} of {totalSteps}
                            </div>
                            <h2 className="expanded-card-headline">
                                {currentStep.expandedContent?.headline}
                            </h2>
                            <p className="expanded-card-tagline">
                                {currentStep.expandedContent?.tagline}
                            </p>
                        </div>

                        {/* Main content */}
                        <div className="expanded-card-body">
                            <p className="expanded-card-description">
                                {currentStep.expandedContent?.description}
                            </p>

                            {/* Features grid */}
                            {currentStep.expandedContent?.features && (
                                <div className="expanded-card-features">
                                    {currentStep.expandedContent.features.map((feature, idx) => (
                                        <div key={idx} className="feature-item">
                                            <span className="feature-label">{feature.label}</span>
                                            <span className="feature-detail">{feature.detail}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Use case section */}
                            {currentStep.expandedContent?.useCase && (
                                <div className="expanded-card-usecase">
                                    <h4 className="usecase-title">
                                        {currentStep.expandedContent.useCaseTitle}
                                    </h4>
                                    <p className="usecase-text">
                                        {currentStep.expandedContent.useCase}
                                        <p>{currentStep.expandedContent.useCaseDec}</p>
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Controls */}
                        <div className="expanded-card-controls">
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
                                    {currentStepIndex === totalSteps - 1 ? (
                                        'Finish'
                                    ) : (
                                        <kbd className="tutorial-key">→</kbd>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TutorialOverlay;
