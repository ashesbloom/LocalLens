// The spotlight is one SVG path: a full-viewport rectangle with a rounded
// rectangle punched out of it, rendered with fill-rule="evenodd" so the inner
// shape becomes a hole. Shared by the tutorial overlay and the community intro.
//
// Checked with: node src/components/spotlightPath.test.mjs

// A radius wider than half the box turns the arcs inside out, so clamp it.
// Callers pass a fixed 8 or a capsule radius derived from height; a narrow
// target (a 12px icon) would otherwise render as a bow tie.
export const clampRadius = (radius, width, height) =>
    Math.max(0, Math.min(radius, width / 2, height / 2));

export const spotlightPath = (rect, viewport, radius = 8) => {
    const { x, y, width, height } = rect;
    const r = clampRadius(radius, width, height);

    return `
        M 0 0
        H ${viewport.width}
        V ${viewport.height}
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
};

// The capsule radius the tutorial uses for pill-shaped targets.
export const capsuleRadius = (height) => Math.min(height / 2, 20);

// Where the tutorial card goes: below the target if it fits, then above,
// right, left. `prefer` is the side already in use; it is kept while it still
// fits, so the card does not flip sides while the target scrolls into view.
// Falls back to below (clamped on screen by tooltipOrigin) when nothing fits.
export const placeTooltip = (rect, tip, viewport, prefer = null, gap = 12, margin = 16) => {
    const fits = {
        bottom: viewport.height - (rect.y + rect.height) >= tip.height + gap + margin,
        top: rect.y >= tip.height + gap + margin,
        right: viewport.width - (rect.x + rect.width) >= tip.width + gap + margin,
        left: rect.x >= tip.width + gap + margin,
    };
    if (prefer && fits[prefer]) return prefer;
    return ['bottom', 'top', 'right', 'left'].find((side) => fits[side]) ?? 'bottom';
};

// The card's top-left for a placement, given the hole as it is this frame.
export const tooltipOrigin = (placement, rect, tip, viewport, gap = 12, margin = 16) => {
    let left;
    let top;
    if (placement === 'top' || placement === 'bottom') {
        left = rect.x + rect.width / 2 - tip.width / 2;
        top = placement === 'bottom' ? rect.y + rect.height + gap : rect.y - tip.height - gap;
    } else {
        left = placement === 'right' ? rect.x + rect.width + gap : rect.x - tip.width - gap;
        top = rect.y + rect.height / 2 - tip.height / 2;
    }
    const clamp = (v, max) => Math.max(margin, Math.min(v, max - margin));
    return { left: clamp(left, viewport.width - tip.width), top: clamp(top, viewport.height - tip.height) };
};
