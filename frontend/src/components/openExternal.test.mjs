// Run with: node src/components/openExternal.test.mjs
// Guards the failure that shipped once already: in a plain browser the Tauri
// call rejects and the link does nothing at all. Only the branch choice is
// tested here — importing openExternal itself would pull in the Tauri plugin,
// which cannot load under bare node.
import { strict as assert } from 'node:assert';
import { pickOpener } from './openExternal.js';

assert.equal(pickOpener({ __TAURI_INTERNALS__: {} }), 'tauri', 'missed Tauri v2');
assert.equal(pickOpener({ __TAURI__: {} }), 'tauri', 'missed the older global');

// The case that was broken: `npm run dev` open in a normal browser tab.
assert.equal(pickOpener({}), 'browser', 'a plain browser was treated as Tauri');
assert.equal(pickOpener(null), 'browser', 'a missing window was treated as Tauri');
assert.equal(pickOpener(undefined), 'browser', 'an undefined window was treated as Tauri');

console.log('openExternal: ok');
