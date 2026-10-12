// /faq's questions. Plain data, plain-text answers: Faq.jsx renders them and
// scripts/prerender.mjs turns the same array into the page's FAQPage JSON-LD, so what a search
// engine is told and what a reader sees cannot drift. `link` is optional, rendered after the
// answer, and never part of the structured-data text.
//
// Every answer is checked against backend/ or marketing/CLAIMS.md. Change the source first.
export const FAQ = [
  {
    q: 'Is LocalLens free?',
    a: 'Yes. The LocalLens desktop app is free and open source under AGPL-3.0, with no account, subscription or storage limit. The only paid product is LL Agent Pro, the automation tier of the separate MCP agent that lets an AI assistant run LocalLens for you.',
    link: { to: '/download', label: 'Download LocalLens' },
  },
  {
    q: 'Does LocalLens upload my photos?',
    a: 'No. Sorting, face recognition and location lookup all run on your own computer, and the backend makes no external network calls at all. The app checks GitHub for updates and, from the release after v3.1.0, asks this site for replies to your board posts; neither request carries anything about your photos.',
    link: { to: '/privacy', label: 'Every privacy claim, with how to check it' },
  },
  {
    q: 'Does LocalLens work without an internet connection?',
    a: 'Yes. Everything that touches your photos works offline, because the face models and the map used for place names ship inside the app. An internet connection is only used to check for a newer version and, from the release after v3.1.0, for new activity on the community board.',
  },
  {
    q: 'Which computers does LocalLens run on?',
    a: 'macOS on Apple Silicon (M1 and later) and 64-bit Windows. Intel Macs are not supported by the current build, and a Linux build is planned but not released yet.',
    link: { to: '/announce', label: 'What is being built next' },
  },
  {
    q: 'Which photo formats does LocalLens read?',
    a: 'Nineteen: JPG, JPEG, PNG, GIF, BMP, TIFF, TIF, WebP, HEIC and HEIF from iPhones, the RAW formats DNG, CR2, CR3, NEF, ARW and RAF, plus AVIF, PSD and HDR. A file is picked up by its extension, so anything else in the folder is left alone.',
  },
  {
    q: 'How does LocalLens sort photos by date?',
    a: 'It reads the date and time your camera wrote into the photo when the shutter fired, not the file date. The file date usually changes when a photo is copied or restored from a backup, so it is the less trustworthy of the two.',
    link: { to: '/how', label: 'What happens to your photos, step by step' },
  },
  {
    q: 'How does it sort by location without an online map?',
    a: 'It takes the GPS position your phone or camera stored in the photo and turns it into a country, state and city using an offline place-name dataset bundled with the app. No coordinates are sent to a map service.',
  },
  {
    q: 'How does face recognition work if nothing leaves my computer?',
    a: 'You show LocalLens a few clear photos of a person and give them a name, and it learns that face once using the open-source face_recognition and dlib libraries running locally. It then looks for that person across your library, and photos it has already examined are remembered so the next run is faster.',
    link: { to: '/pipeline', label: 'The face-detection ladder in detail' },
  },
  {
    q: 'Will LocalLens change or delete my original photos?',
    a: 'Not unless you ask it to. Copy is the default, so your originals stay exactly where they are, and a name clash in the destination gets a new name instead of overwriting anything. Move is available as an explicit choice, and cancelling a move halfway puts the files back.',
  },
  {
    q: 'How fast is it on a large library?',
    a: 'On the measured test set, face detection takes about 0.20 seconds per photo, down from 0.97 seconds before the current detection ladder. Already-examined photos are cached, so re-running a sort on the same library skips most of that work.',
    link: { to: '/pipeline', label: 'Where those numbers come from' },
  },
  {
    q: 'How much memory does LocalLens need?',
    a: 'At least 8 GB of RAM is recommended for collections over about a thousand photos, because face recognition is the memory-heavy part. The Accurate mode limits itself to two parallel workers for the same reason.',
  },
  {
    q: 'Why does macOS say LocalLens cannot be opened?',
    a: 'The macOS build is not signed or notarised by Apple, so Gatekeeper blocks it on first launch. Installing with Homebrew clears that automatically; with the DMG, run the Fix_Local_Lens.command file from the release or the one-line xattr command on the download page.',
    link: { to: '/download', label: 'Install steps for macOS' },
  },
  {
    q: 'Can I control LocalLens from Claude or another AI assistant?',
    a: 'Yes, through LL Agent, an MCP server that connects LocalLens to Claude Desktop and other MCP clients. What reaches the assistant is text such as counts, folder names and the person names you chose, never the image files themselves.',
  },
  {
    q: 'Is LocalLens open source?',
    a: 'The desktop app is open source under AGPL-3.0, and the full source is on GitHub. LL Agent, the separate MCP server, is source-available under BUSL-1.1 rather than open source.',
  },
  {
    q: 'Does LocalLens collect analytics or telemetry?',
    a: 'No. The app and its backend send no analytics of any kind, anonymised or otherwise. Adoption is measured only from public numbers such as GitHub release downloads.',
    link: { to: '/stats', label: 'The live numbers' },
  },
  {
    q: 'How do I report a bug or ask for a feature?',
    a: 'Post it on the community board; no account is needed. Bugs can also be filed as GitHub issues on the LocalLens repository.',
    link: { to: '/post', label: 'Open the board' },
  },
]
