// Run with: node src/components/typewriter.test.mjs
// The failure this guards against is a loop that never terminates on screen.
import { strict as assert } from 'node:assert';
import { start, step, visible, done } from './typewriter.js';

for (const text of ['', 'a', "sort my camera roll by who's in it"]) {
    let s = start(text);
    let steps = 0;
    while (!done(s)) {
        s = step(s);
        assert.ok(++steps <= text.length, `did not terminate on ${JSON.stringify(text)}`);
    }
    assert.equal(visible(s), text, 'did not produce the full string');
    assert.equal(steps, text.length, 'took the wrong number of steps');
}

// step() past the end is a no-op rather than an overrun
assert.equal(visible(step(step({ text: 'ab', i: 2 }))), 'ab');

console.log('typewriter: ok');
