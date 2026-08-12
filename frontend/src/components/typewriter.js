// Pure typewriter state machine, kept out of the component so it can be
// checked without a test framework: `node src/components/typewriter.test.mjs`

export const start = (text) => ({ text, i: 0 });

export const step = ({ text, i }) => ({ text, i: Math.min(i + 1, text.length) });

export const visible = ({ text, i }) => text.slice(0, i);

export const done = ({ text, i }) => i >= text.length;
