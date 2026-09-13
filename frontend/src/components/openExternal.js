// Opening a link has to work in two places: the packaged Tauri app, where the
// OS browser handles it, and `npm run dev` in a plain browser, where there is
// no Tauri IPC at all and the plugin call rejects with nothing on screen.
//
// The choice is made synchronously on purpose. Falling back inside a rejected
// promise would put window.open outside the click's user-gesture window, and
// the popup blocker would eat it — the same silent nothing we are fixing.
//
// Checked with: node src/components/openExternal.test.mjs
import { openUrl } from '@tauri-apps/plugin-opener';

export const pickOpener = (win) =>
    win && ('__TAURI_INTERNALS__' in win || '__TAURI__' in win) ? 'tauri' : 'browser';

export const openExternal = (url) => {
    if (pickOpener(typeof window === 'undefined' ? null : window) === 'tauri') {
        // Still guard it: a denied scope would otherwise surface as an
        // unhandled rejection rather than a dead click.
        Promise.resolve(openUrl(url)).catch(() => {
            window.open(url, '_blank', 'noopener,noreferrer');
        });
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
};
