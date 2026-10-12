// Community activity for the bell and the Community button, kept as plain
// functions over plain data so all of it runs under `node` in the test.
//
// The board has no accounts. What makes "replies on my posts" possible is the
// app key: a random value generated once per install, handed to the browser
// in the URL fragment of every community link (see withAppKey), and sent by
// the site with each post and reply that browser writes. The server keeps only
// its hash and answers GET /api/inbox for whoever holds the key.
//
// Checked with: node src/components/communityInbox.test.mjs
import { COMMUNITY_SITE } from './communitySite.js';

export const APP_KEY_STORE = 'locallens.community.appKey';
export const INBOX_STORE = 'locallens.community.inbox';

// Enough to fill the bell's list and work out the button's target; anything
// older has either been read or is not worth surfacing.
const KEEP = 50;
const KEY_SHAPE = /^[0-9a-f]{32}$/;

const read = (store, key) => {
    try { return store?.getItem(key) ?? null; } catch { return null; }
};
const write = (store, key, value) => {
    try { store?.setItem(key, value); } catch { /* blocked storage: forget, don't crash */ }
};

const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

export function getAppKey(store, random = randomBytes) {
    const kept = read(store, APP_KEY_STORE);
    if (kept && KEY_SHAPE.test(kept)) return kept;
    const key = [...random(16)].map((b) => b.toString(16).padStart(2, '0')).join('');
    write(store, APP_KEY_STORE, key);
    return key;
}

// A fragment, not a query parameter: it never reaches a server, a log or a
// Referer header. The site stores it and strips it from the address bar.
export const withAppKey = (url, key) => (key ? `${url}#app=${key}` : url);

const browserStore = () => {
    try { return globalThis.localStorage ?? null; } catch { return null; }
};

// What every community link the app opens goes through, so any visit from the
// app can link that browser's posts back to this install.
export const keyedLink = (url) => withAppKey(url, getAppKey(browserStore()));

export const itemKey = (item) => `${item.kind}:${item.id}`;

export const itemUrl = (item) =>
    item.kind === 'reply'
        ? `${COMMUNITY_SITE}/post/${encodeURIComponent(item.postId)}?reply=${encodeURIComponent(item.id)}`
        : `${COMMUNITY_SITE}/post/${encodeURIComponent(item.id)}`;

export const emptyInbox = () => ({ since: null, items: [] });

export function loadInbox(store) {
    try {
        const parsed = JSON.parse(read(store, INBOX_STORE));
        if (parsed && Array.isArray(parsed.items)) {
            return { since: Number.isFinite(parsed.since) ? parsed.since : null, items: parsed.items };
        }
    } catch { /* fall through */ }
    return emptyInbox();
}

export const saveInbox = (store, inbox) => write(store, INBOX_STORE, JSON.stringify(inbox));

// Folds one /api/inbox response in. Returns the new inbox and the items that
// were not there before -- the ones worth a toast or a banner.
export function mergeInbox(inbox, response) {
    const incoming = [
        ...(response?.replies ?? []).map((r) => ({ kind: 'reply', id: r.id, postId: r.postId, author: r.author, excerpt: r.excerpt, created: r.created, seen: false })),
        ...(response?.posts ?? []).map((p) => ({ kind: 'post', id: p.id, postId: p.id, author: p.author, excerpt: p.excerpt, created: p.created, seen: false })),
    ].filter((item) => item.id && item.created);

    const known = new Set(inbox.items.map(itemKey));
    const fresh = incoming.filter((item) => !known.has(itemKey(item)));
    const items = [...fresh, ...inbox.items].sort((a, b) => b.created - a.created).slice(0, KEEP);
    const since = Number.isFinite(response?.now) ? response.now : inbox.since;
    return { inbox: { since, items }, fresh: fresh.filter((item) => items.includes(item)) };
}

// No keys means everything.
export function markSeen(inbox, keys) {
    const only = keys ? new Set(keys) : null;
    return {
        ...inbox,
        items: inbox.items.map((item) => (!item.seen && (!only || only.has(itemKey(item))) ? { ...item, seen: true } : item)),
    };
}

export function unreadCounts(inbox) {
    let replies = 0;
    let posts = 0;
    for (const item of inbox.items) {
        if (item.seen) continue;
        if (item.kind === 'reply') replies++;
        else posts++;
    }
    return { replies, posts };
}

// Where the Community button goes. Replies to you beat everything, because
// they are the reason this exists; then one new post; then the forum.
export function communityTarget(inbox) {
    const unread = inbox.items.filter((item) => !item.seen);
    const replies = unread.filter((item) => item.kind === 'reply');

    if (replies.length) {
        const newest = replies.reduce((a, b) => (b.created > a.created ? b : a));
        const onPost = replies.filter((item) => item.postId === newest.postId);
        return {
            kind: 'reply',
            url: itemUrl(newest),
            label: onPost.length === 1
                ? `${newest.author} replied to your post`
                : `${onPost.length} new replies on your post`,
            covers: onPost.map(itemKey),
        };
    }

    const posts = unread.filter((item) => item.kind === 'post');
    if (posts.length === 1) {
        return { kind: 'post', url: itemUrl(posts[0]), label: `New post from ${posts[0].author}`, covers: [itemKey(posts[0])] };
    }
    if (posts.length > 1) {
        return { kind: 'posts', url: `${COMMUNITY_SITE}/post`, label: `${posts.length} new posts in the community`, covers: posts.map(itemKey) };
    }
    return { kind: 'board', url: `${COMMUNITY_SITE}/post`, label: 'Community', covers: [] };
}

// The bell's list: unread only -- replies first, then posts, newest first
// within each. Nothing unread means no list, and the bell shows no Community
// section at all. Short, because the panel also carries the update and the
// MCP card.
export function bellItems(items, limit = 6) {
    return items
        .filter((item) => !item.seen)
        .sort((a, b) => (a.kind === 'reply' ? 0 : 1) - (b.kind === 'reply' ? 0 : 1) || b.created - a.created)
        .slice(0, limit);
}

// An update the user has left uninstalled this long has become wallpaper; the
// bell stops leading with it and puts community activity first.
export const STALE_UPDATE_MS = 3 * 24 * 60 * 60 * 1000;

export function updateIsStale(releasedAt, now = Date.now()) {
    const released = new Date(releasedAt).getTime();
    return Number.isFinite(released) && now - released > STALE_UPDATE_MS;
}

export function ago(created, now = Date.now()) {
    const minutes = Math.floor((now - created) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    return `${Math.floor(hours / 24)} d ago`;
}
