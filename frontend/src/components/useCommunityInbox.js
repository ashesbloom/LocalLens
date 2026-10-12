// Polls the community board for replies to your posts and new posts, while the
// app is open. A reply is a "hard" notification: a toast, an OS banner when the
// window is in the background, and a count on the dock/taskbar icon. A new post
// is "soft": it only shows in the bell. Nothing runs once the window is closed;
// `since` is kept, so the next launch catches up on what was missed.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Image } from '@tauri-apps/api/image';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { COMMUNITY_SITE } from './communitySite';
import { openExternal, pickOpener } from './openExternal';
import {
    getAppKey, loadInbox, saveInbox, mergeInbox, markSeen as markSeenIn,
    unreadCounts, communityTarget, itemKey, itemUrl, keyedLink,
} from './communityInbox';

const POLL_MS = 2 * 60 * 1000;
// Focus fires on every alt-tab; this keeps a restless user from hammering the board.
const FOCUS_GAP_MS = 30 * 1000;

const store = () => {
    try { return window.localStorage; } catch { return null; }
};
const inTauri = () => pickOpener(typeof window === 'undefined' ? null : window) === 'tauri';

async function notifyOs(title, body) {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === 'granted';
    if (granted) sendNotification({ title, body });
}

// macOS and Linux draw a number on the icon. Windows has no badge count, only
// an overlay image, so it gets a plain red dot drawn here pixel by pixel --
// no asset file and no image-decoding feature in the Rust build.
let windowsDot = null;
async function redDot() {
    if (!windowsDot) {
        const size = 16;
        const rgba = new Uint8Array(size * size * 4);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if ((x - 7.5) ** 2 + (y - 7.5) ** 2 > 7 ** 2) continue;
                rgba.set([220, 38, 38, 255], (y * size + x) * 4);
            }
        }
        windowsDot = await Image.new(rgba, size, size);
    }
    return windowsDot;
}

async function setIconBadge(count) {
    const win = getCurrentWindow();
    if (!/Windows/.test(navigator.userAgent)) return win.setBadgeCount(count || undefined);
    return win.setOverlayIcon(count ? await redDot() : undefined);
}

export function useCommunityInbox() {
    const key = useMemo(() => getAppKey(store()), []);
    const [inbox, setInbox] = useState(() => loadInbox(store()));
    const [toast, setToast] = useState(null);
    const inboxRef = useRef(inbox);
    const busyRef = useRef(false);
    const lastPollRef = useRef(0);

    const commit = useCallback((next) => {
        inboxRef.current = next;
        saveInbox(store(), next);
        setInbox(next);
    }, []);

    const poll = useCallback(async () => {
        if (busyRef.current) return;
        busyRef.current = true;
        lastPollRef.current = Date.now();
        try {
            // First run starts from now: a new install should not open on a
            // week of other people's posts.
            const since = inboxRef.current.since ?? Date.now();
            const res = await fetch(`${COMMUNITY_SITE}/api/inbox?since=${since}`, {
                headers: { 'x-app-key': key },
                signal: AbortSignal.timeout(10000),
            });
            // A 404 is a board that has not shipped the inbox yet. Quiet either way.
            if (!res.ok) return;
            const { inbox: next, fresh } = mergeInbox(inboxRef.current, await res.json());
            commit(next);

            const replies = fresh.filter((item) => item.kind === 'reply').sort((a, b) => b.created - a.created);
            if (!replies.length) return;
            const text = replies.length === 1
                ? `${replies[0].author} replied to your post`
                : `${replies.length} new replies on your posts`;
            setToast({ text, item: replies[0], at: Date.now() });
            // In front of the user the toast is enough; a banner on top of it is noise.
            if (inTauri() && !document.hasFocus()) notifyOs(text, replies[0].excerpt ?? '').catch(() => {});
        } catch {
            // Offline, or the board is down. The next tick tries again.
        } finally {
            busyRef.current = false;
        }
    }, [key, commit]);

    useEffect(() => {
        const first = setTimeout(poll, 3000);
        const every = setInterval(poll, POLL_MS);
        const onFocus = () => {
            if (Date.now() - lastPollRef.current > FOCUS_GAP_MS) poll();
        };
        window.addEventListener('focus', onFocus);
        return () => {
            clearTimeout(first);
            clearInterval(every);
            window.removeEventListener('focus', onFocus);
        };
    }, [poll]);

    const unread = useMemo(() => unreadCounts(inbox), [inbox]);
    const target = useMemo(() => communityTarget(inbox), [inbox]);

    useEffect(() => {
        if (inTauri()) setIconBadge(unread.replies).catch(() => {});
    }, [unread.replies]);

    const markSeen = useCallback((keys) => commit(markSeenIn(inboxRef.current, keys)), [commit]);

    // A reply opens on the reply; reading it there reads every unread reply on
    // that post, the same as the Community button does.
    const open = useCallback((item) => {
        openExternal(keyedLink(itemUrl(item)));
        const covers = item.kind === 'reply'
            ? inboxRef.current.items.filter((i) => i.kind === 'reply' && i.postId === item.postId).map(itemKey)
            : [itemKey(item)];
        markSeen(covers);
        setToast((t) => (t?.item.id === item.id ? null : t));
    }, [markSeen]);

    const openTarget = useCallback(() => {
        const t = communityTarget(inboxRef.current);
        openExternal(keyedLink(t.url));
        if (t.covers.length) markSeen(t.covers);
        setToast(null);
    }, [markSeen]);

    const dismissToast = useCallback(() => setToast(null), []);

    return { items: inbox.items, unread, target, markSeen, open, openTarget, toast, dismissToast };
}
