// Decides whether the one-time community-site introduction is owed to this
// user. Pure, so it can be checked without a browser:
// `node src/components/communityIntroGate.test.mjs`
//
// The intro is aimed at people who already use LocalLens and have never heard
// of the community site. It ships inside an update, so anyone who has used the
// app before and has not seen it yet has, by definition, just updated —
// comparing version numbers would only re-prove that.

export const INTRO_SEEN_KEY = 'community_intro_seen';

// `flags` mirrors localStorage: a string means set, null means absent.
export const shouldShowIntro = ({ introSeen, hasSeenTutorial, mcpSeen }) => {
    if (introSeen) return false;        // shown once, never again
    if (!hasSeenTutorial) return false; // fresh install: the tutorial owns the first run
    if (!mcpSeen) return false;         // the MCP announcement is still queued; it goes first
    return true;
};

// Reads the three flags straight off localStorage. Kept separate from the rule
// above so the rule stays testable.
export const shouldShowIntroFrom = (storage) =>
    shouldShowIntro({
        introSeen: storage.getItem(INTRO_SEEN_KEY),
        hasSeenTutorial: storage.getItem('has_seen_tutorial'),
        mcpSeen: storage.getItem('mcp_announce_seen'),
    });
