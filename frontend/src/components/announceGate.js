// Decides when the MCP announcement is allowed to open, so it never lands on
// top of the first-run tutorial. Pure, and kept out of App.jsx so it can be
// checked without a test framework: `node src/components/announceGate.test.mjs`
//
// States: 'idle'    — returning user, nothing else is competing
//         'waiting' — a first-run tutorial is coming but has not started yet
//         'running' — the tutorial is on screen
//         'done'    — the tutorial has ended

export const IDLE = 'idle';
export const WAITING = 'waiting';

// Chosen at first render, before the backend is up. A user who has not seen
// the tutorial is going to get one, so start blocked — deciding this later
// would let the announcement flash on screen and then vanish.
export const initialGate = (hasSeenTutorial) => (hasSeenTutorial ? IDLE : WAITING);

// Call on every change to the tutorial's active flag.
export const advance = (gate, isTutorialActive) => {
    if (isTutorialActive) return 'running';
    if (gate === 'running') return 'done';
    return gate;
};

export const canAnnounce = (gate) => gate === IDLE || gate === 'done';
