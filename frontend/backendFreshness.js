// `tauri build` only runs vite; the backend ships as a prebuilt artifact copied
// from backend/dist. Nothing used to notice when that artifact predated the
// Python sources, so a stale backend could bundle silently — which is how a
// build shipped without templates/ and returned 500 on /setup.
import fs from 'fs';
import path from 'path';

// Build outputs and environments, not inputs — scanning them would compare the
// artifact against itself.
const SKIP = new Set(['dist', 'build', '__pycache__', 'venv', '.venv', 'node_modules', '.git']);

// Only things PyInstaller actually consumes count as sources. The backend
// directory also collects run-time and build-time debris beside the sources —
// CI writes backend-smoke.log there *after* PyInstaller runs — and counting
// those made a correct build look stale and failed the release.
const SOURCE_EXTENSIONS = new Set(['.py', '.html', '.spec']);
const SOURCE_FILENAMES = new Set(['requirements.txt']);

const isSource = (p) =>
  SOURCE_EXTENSIONS.has(path.extname(p)) || SOURCE_FILENAMES.has(path.basename(p));

/** Newest mtime (ms) across build inputs under the given files/directories. */
export const newestMtime = (targets) => {
  let newest = 0;
  const walk = (p) => {
    let st;
    try {
      st = fs.lstatSync(p);
    } catch {
      return; // vanished mid-walk, or a broken symlink
    }
    if (st.isDirectory()) {
      if (SKIP.has(path.basename(p))) return;
      for (const entry of fs.readdirSync(p)) walk(path.join(p, entry));
    } else if (isSource(p) && st.mtimeMs > newest) {
      newest = st.mtimeMs;
    }
  };
  targets.forEach(walk);
  return newest;
};

// ponytail: mtime comparison, not a content hash — a bare `touch` gives a false
// positive. Switch to hashing the sources if that becomes annoying.
/** True when any source is newer than the built artifact. Absent artifact is not stale. */
export const isStale = (builtPath, sourceTargets) => {
  let builtTime;
  try {
    builtTime = fs.statSync(builtPath).mtimeMs;
  } catch {
    return false; // nothing built yet — ensure-backend.js already handles that case
  }
  return newestMtime(sourceTargets) > builtTime;
};
