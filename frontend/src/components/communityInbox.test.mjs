// Run with: node src/components/communityInbox.test.mjs
// Pins what the bell shows and where the Community button goes. The button's
// rules are the part a person notices when they are wrong: a reply to you that
// opens the homepage, or a stale target after you have already read it.
import { strict as assert } from 'node:assert';
import {
    getAppKey, withAppKey, itemUrl, emptyInbox, loadInbox, saveInbox, mergeInbox,
    markSeen, unreadCounts, communityTarget, bellItems, ago, updateIsStale, APP_KEY_STORE, INBOX_STORE,
} from './communityInbox.js';
import { COMMUNITY_SITE } from './communitySite.js';

const fakeStore = (seed = {}) => {
    const map = new Map(Object.entries(seed));
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), _map: map };
};
const hostile = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

// --- the app key ----------------------------------------------------------------
{
    const s = fakeStore();
    const key = getAppKey(s, () => new Uint8Array(16).fill(0xab));
    assert.equal(key, 'ab'.repeat(16), '128 bits as hex');
    assert.equal(getAppKey(s, () => new Uint8Array(16)), key, 'generated once, then kept');
    assert.match(getAppKey(fakeStore({ [APP_KEY_STORE]: 'junk' })), /^[0-9a-f]{32}$/, 'junk in storage is replaced');
    assert.match(getAppKey(hostile), /^[0-9a-f]{32}$/, 'blocked storage still yields a key');
}
assert.equal(withAppKey(`${COMMUNITY_SITE}/post/a?reply=b`, 'k'), `${COMMUNITY_SITE}/post/a?reply=b#app=k`, 'the key rides after the query');
assert.equal(withAppKey('https://x.test/post', null), 'https://x.test/post', 'no key, no fragment');

// --- merging ----------------------------------------------------------------------
const reply = (id, postId, created, author = 'Ana') => ({ id, postId, author, excerpt: 'hi', created });
const post = (id, created, author = 'Ravi') => ({ id, author, tag: 'bug', excerpt: 'x', created });

let inbox = emptyInbox();
{
    const r = mergeInbox(inbox, { now: 1000, replies: [reply('r1', 'p1', 900)], posts: [post('p9', 950)] });
    assert.equal(r.inbox.since, 1000, 'since follows the server clock');
    assert.equal(r.fresh.length, 2, 'both items are new');
    assert.deepEqual(r.inbox.items.map((i) => i.id), ['p9', 'r1'], 'newest first');
    inbox = r.inbox;

    const again = mergeInbox(inbox, { now: 2000, replies: [reply('r1', 'p1', 900)], posts: [] });
    assert.equal(again.fresh.length, 0, 'an item already held is not news twice');
    assert.equal(again.inbox.items.length, 2, 'and is not duplicated');
    assert.equal(mergeInbox(inbox, {}).inbox.since, 1000, 'a response without a clock keeps since');
}
{
    const many = { now: 5, posts: Array.from({ length: 70 }, (_, i) => post(`q${i}`, i + 1)) };
    assert.equal(mergeInbox(emptyInbox(), many).inbox.items.length, 50, 'only the newest 50 are kept');
}
assert.deepEqual(unreadCounts(inbox), { replies: 1, posts: 1 });

// --- persistence -----------------------------------------------------------------
{
    const s = fakeStore();
    saveInbox(s, inbox);
    assert.deepEqual(loadInbox(s), inbox, 'round-trips');
    assert.deepEqual(loadInbox(fakeStore({ [INBOX_STORE]: 'not json' })), emptyInbox(), 'garbage reads as empty');
    assert.deepEqual(loadInbox(hostile), emptyInbox(), 'blocked storage reads as empty');
    assert.doesNotThrow(() => saveInbox(hostile, inbox), 'and a failed save is not an exception');
}

// --- where the Community button goes ------------------------------------------------
{
    // Nothing unread: the forum, no longer the homepage.
    const t = communityTarget(emptyInbox());
    assert.equal(t.kind, 'board');
    assert.equal(t.url, `${COMMUNITY_SITE}/post`);
    assert.equal(t.label, 'Community');
    assert.deepEqual(t.covers, []);
}
{
    // One new post: that post.
    const { inbox: one } = mergeInbox(emptyInbox(), { now: 1, posts: [post('p1', 10, 'Ravi')] });
    const t = communityTarget(one);
    assert.equal(t.kind, 'post');
    assert.equal(t.url, `${COMMUNITY_SITE}/post/p1`);
    assert.equal(t.label, 'New post from Ravi');
    assert.deepEqual(t.covers, ['post:p1']);
}
{
    // Several new posts: the forum, and opening it covers all of them.
    const { inbox: few } = mergeInbox(emptyInbox(), { now: 1, posts: [post('p1', 10), post('p2', 20), post('p3', 30)] });
    const t = communityTarget(few);
    assert.equal(t.kind, 'posts');
    assert.equal(t.url, `${COMMUNITY_SITE}/post`);
    assert.equal(t.label, '3 new posts in the community');
    assert.equal(t.covers.length, 3);
}
{
    // A reply beats any number of posts, and lands on the reply itself.
    const { inbox: mixed } = mergeInbox(emptyInbox(), {
        now: 1,
        posts: [post('p8', 99), post('p9', 98)],
        replies: [reply('r1', 'mine', 10, 'Ana')],
    });
    const t = communityTarget(mixed);
    assert.equal(t.kind, 'reply');
    assert.equal(t.url, `${COMMUNITY_SITE}/post/mine?reply=r1`);
    assert.equal(t.label, 'Ana replied to your post');
    assert.deepEqual(t.covers, ['reply:r1'], 'opening it reads that reply, not the posts');

    // Reading it hands the button to the next thing.
    const after = markSeen(mixed, t.covers);
    assert.equal(communityTarget(after).kind, 'posts');
    assert.deepEqual(unreadCounts(after), { replies: 0, posts: 2 });
}
{
    // Replies on two of your posts: the newest one's post, covering every
    // unread reply on it and leaving the other post's replies unread.
    const { inbox: two } = mergeInbox(emptyInbox(), {
        now: 1,
        replies: [reply('a1', 'A', 10), reply('a2', 'A', 30, 'Lee'), reply('b1', 'B', 20)],
    });
    const t = communityTarget(two);
    assert.equal(t.url, `${COMMUNITY_SITE}/post/A?reply=a2`, 'the newest reply is the landing spot');
    assert.equal(t.label, '2 new replies on your post');
    assert.deepEqual(t.covers.sort(), ['reply:a1', 'reply:a2']);
    const next = communityTarget(markSeen(two, t.covers));
    assert.equal(next.url, `${COMMUNITY_SITE}/post/B?reply=b1`, 'then the other post');
}
assert.equal(itemUrl({ kind: 'reply', id: 'r 1', postId: 'p/1' }), `${COMMUNITY_SITE}/post/p%2F1?reply=r%201`, 'ids are encoded');
assert.deepEqual(unreadCounts(markSeen(inbox)), { replies: 0, posts: 0 }, 'markSeen with no keys reads everything');

// --- the bell's list ----------------------------------------------------------------
{
    const items = [
        { kind: 'post', id: 'p1', created: 50, seen: false },
        { kind: 'reply', id: 'r1', created: 10, seen: false },
        { kind: 'reply', id: 'r0', created: 99, seen: true },
        { kind: 'reply', id: 'r2', created: 20, seen: false },
    ];
    assert.deepEqual(bellItems(items).map((i) => i.id), ['r2', 'r1', 'p1'], 'unread replies, then unread posts; read ones drop out');
    assert.equal(bellItems(items, 2).length, 2, 'and capped');
    assert.deepEqual(bellItems(items.map((i) => ({ ...i, seen: true }))), [], 'nothing unread, nothing to show');
}
{
    const day = 24 * 60 * 60 * 1000;
    const now = Date.parse('2026-10-12T12:00:00Z');
    assert.ok(!updateIsStale('2026-10-10T12:00:00Z', now), 'two days old is still news');
    assert.ok(updateIsStale(new Date(now - 3 * day - 1).toISOString(), now), 'past three days it is stale');
    assert.ok(!updateIsStale(undefined, now) && !updateIsStale('not a date', now), 'no usable date is never stale');
}
assert.equal(ago(1000, 1000 + 30e3), 'just now');
assert.equal(ago(0, 4 * 60e3), '4 min ago');
assert.equal(ago(0, 3 * 3600e3), '3 h ago');
assert.equal(ago(0, 50 * 3600e3), '2 d ago');

console.log('ok - communityInbox.test.mjs');
