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
