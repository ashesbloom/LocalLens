// One place for the community site's routes, so a moved page is a one-line fix.
// VITE_COMMUNITY_SITE points a dev build at a local board (`npm run dev` in
// website/locallens-Community serves one on http://localhost:8788).
export const COMMUNITY_SITE = import.meta.env?.VITE_COMMUNITY_SITE || 'https://locallens-community.pages.dev';

export const COMMUNITY_LINKS = {
    root: `${COMMUNITY_SITE}/?ref=app`,
    forum: `${COMMUNITY_SITE}/post`,
    announce: `${COMMUNITY_SITE}/announce`,
    how: `${COMMUNITY_SITE}/how`,
    pipeline: `${COMMUNITY_SITE}/pipeline`,
};
