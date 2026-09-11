import { Link } from 'react-router-dom'
import {
  ArchitectureDiagram,
  CloneDiagram,
  EnumerationDiagram,
  LadderDiagram,
  OrderingDiagram,
  WritePathDiagram,
} from './PipelineDiagrams.jsx'

// /pipeline — the engineering write-up. Same journey as /how, with the mechanism shown.
//
// Every number on this page came from a measurement recorded in the source it describes
// (backend/face_engine.py, backend/organizer_logic.py, backend/enrollment_logic.py). If a
// figure here is ever edited, change it there first — a page that quotes measurements it no
// longer matches is worse than one that quotes none.

function Figure({ children, caption, w }) {
  return (
    <figure className="doc-fig">
      <div className="doc-figbox" style={{ '--fig-w': `${w}px` }}>
        {children}
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

function Section({ idx, title, children }) {
  return (
    <section className="doc-sec">
      <div className="doc-sec-head">
        <span className="doc-idx">{idx}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  )
}

const NUMBERS = [
  {
    what: 'Same-person pairs outside tolerance',
    value: '12.6% → 0%',
    decided: 'Aligning enrolment and query onto one loader. Kept 0.55 rather than loosening the threshold.',
    where: 'face_engine.py',
  },
  {
    what: 'Faces found upright vs rotated 90°',
    value: '33/35 → 1/35',
    decided: 'exif_transpose before anything touches pixels, and rotation passes 3–4.',
    where: 'face_engine.py',
  },
  {
    what: 'Portrait shrunk to group-photo scale',
    value: '11/20 → 19/20',
    decided: 'Scaling by long edge at 1600 with upsample 1, rather than forcing width 800.',
    where: 'face_engine.py',
  },
  {
    what: 'Per-photo detection, old vs ladder',
    value: '0.97s → 0.20s',
    decided: 'Early-exit ladder instead of an unconditional upsample=2 on every image.',
    where: 'face_engine.py',
  },
  {
    what: 'Single 1600px CNN detection',
    value: '~23% of RAM',
    decided: 'Detect on an 800px copy, scale the box back up; MAX_CNN_WORKERS = 2.',
    where: 'face_engine.py',
  },
  {
    what: 'Four 60 MB clones vs four copies',
    value: '0 MB vs 240 MB',
    decided: 'clonefile(2) for the People-sort fan-out. Measured with os.statvfs, not du.',
    where: 'organizer_logic.py',
  },
  {
    what: 'A pass at 2000px / upsample 2',
    value: '5× time, 0 gain',
    decided: 'Removed. The ladder stops at five passes.',
    where: 'face_engine.py',
  },
]

const STACK = [
  ['Shell', 'Tauri 2 (Rust)', 'Ships a bundled Python backend; the signed updater is the only outbound endpoint.'],
  ['UI', 'React 18', 'Progress and logs arrive over SSE, not polling.'],
  ['API', 'FastAPI', 'Bound to loopback, per-install token header, single-job invariant.'],
  ['Imaging', 'Pillow · pillow-heif · rawpy · Wand', 'Layered decode; each optional loader degrades to a logged skip.'],
  ['Recognition', 'dlib via face_recognition', 'HOG + MMOD CNN detectors, 128-D ResNet embedding.'],
  ['Geocoding', 'reverse_geocoder', 'Offline k-d tree over a bundled city set. No network path exists.'],
  ['Persistence', 'SQLite', 'Encoding cache and passive photo metadata; startup compaction.'],
  ['Concurrency', 'multiprocessing.Pool', 'Spawn-safe: workers import a quiet module, gallery bound once per worker.'],
  ['Integration', 'MCP server', 'Exposes sort, find, enrol and scheduling as tools for an LLM client.'],
]

export default function Pipeline() {
  return (
    <div className="doc doc-dense">
      <header className="doc-head">
        <h1 className="h1">How a photo moves through the pipeline</h1>
        <p className="doc-sub">
          A desktop photo organiser that sorts by date, GPS location and recognised faces
          without a network call. Tauri and React on the front, FastAPI and dlib behind it.
          Enumeration prunes whole subtrees rather than filtering paths; face detection climbs
          a five-pass ladder and stops at the first hit; recognition finishes in parallel
          before a single file is written, so abort never has to undo anything; and copies
          share disk blocks instead of duplicating them. The rest of this page is why each of
          those is the way it is.
        </p>
        <div className="doc-specs">
          <div className="doc-spec"><b>19</b><span>image formats</span></div>
          <div className="doc-spec"><b>128-D</b><span>face encoding</span></div>
          <div className="doc-spec"><b>0.55</b><span>match tolerance</span></div>
          <div className="doc-spec"><b>~0.20s</b><span>per photo, balanced</span></div>
          <div className="doc-spec"><b>0</b><span>outbound photo bytes</span></div>
        </div>

        {/* The way back, at the top. The same link exists at the foot of the page, but a
            reader who wants the plain-English version wants it on arrival — not after
            twelve minutes of scrolling to find out this was the wrong page for them. */}
        <Link className="doc-aside" to="/how">
          <span className="lbl">New here?</span>
          <span className="doc-aside-title">Basic Understanding of LocalLens →</span>
          <span className="doc-aside-note">the same pipeline, no engineering</span>
        </Link>
      </header>

      <Section idx="01" title="Architecture">
        <div className="doc-prose">
          <p>
            A Tauri shell hosts a React UI and spawns a bundled FastAPI server bound to{' '}
            <code>127.0.0.1</code>, guarded by a per-install <code>X-Local-Token</code> header.
            The UI never touches the filesystem itself: it posts a job config and then watches
            an SSE stream for progress. Exactly one job runs at a time — a second request is
            rejected rather than queued, because both would be mutating the same tree.
          </p>
        </div>
        <Figure w={1120}
          caption={
            <>
              The bottom row is called in-process by <b>organizer_logic</b>; none of it is a
              service. The only socket the app opens to the outside world is the updater's
              version check.
            </>
          }
        >
          <ArchitectureDiagram />
        </Figure>
      </Section>

      <Section idx="02" title="Enumeration and the ignore set">
        <div className="doc-prose">
          <p>
            File discovery is <code>os.walk</code> wrapped in <code>walk_ignoring()</code>. Two
            details make it correct rather than merely working.
          </p>
          <p>
            <strong>Pruning, not filtering.</strong> Ignored subtrees are removed by
            slice-assigning <code>dirnames[:]</code>, so the walk never descends. A naive{' '}
            <code>if dirpath in ignore_set: continue</code> excludes nothing useful here —
            sorted output always nests, so an ignored folder holds zero direct files while its
            children's paths are absent from the set. Rebinding the name instead of
            slice-assigning is silently a no-op, since <code>os.walk</code> reads back that
            same list object.
          </p>
          <p>
            <strong>The self-ingest guard.</strong> <code>effective_ignore_set()</code> adds the
            destination to the ignore set whenever it nests strictly inside the source. Without
            it, sorting into a subfolder of the source makes the next run read its own output.
            It is deliberately not added when <code>dest == source</code>, which would exclude
            everything.
          </p>
        </div>
        <Figure w={1120}
          caption={
            <>
              Both halves route through one helper, so the file precount shown in the UI and
              the set the job actually processes come from the same rule.{' '}
              <b>The deletion path uses <code>os.path.commonpath</code>, not{' '}
                <code>startswith</code></b> — the latter matches <code>/Photos/Trip2</code>{' '}
              against <code>/Photos/Trip</code>, and this code path deletes.
            </>
          }
        >
          <EnumerationDiagram />
        </Figure>
      </Section>

      <Section idx="03" title="Format admission and decode">
        <div className="doc-prose">
          <p>
            Admission is a suffix test against one canonical tuple —{' '}
            <code>f.lower().endswith(SUPPORTED_EXTENSIONS)</code>, where the tuple form lets{' '}
            <code>endswith</code> test all 19 at once. It lives in <code>face_engine</code> so
            the sorter and the enroller cannot drift apart; when they did, enrolment accepted
            only JPEG and PNG, so a user enrolling HEIC selfies got an empty gallery and no
            explanation.
          </p>
          <p>
            Decode is a separate concern one rung later, and it is layered: Pillow for the
            standard formats, <code>pillow-heif</code> registered as an opener for HEIC/HEIF,
            and <code>rawpy</code> with a Wand/ImageMagick fallback for RAW. Every loader is
            imported lazily and degrades to a logged skip, so a missing optional dependency
            disables one format rather than the backend.
          </p>
        </div>
        <div className="doc-note">
          <span className="lbl">Non-obvious</span>
          <p>
            <strong>Pillow does not decide what is a photo, and it does not write the output
              file.</strong> It sits strictly in the middle: decode and EXIF read. Admission is
            string matching; the write is <code>shutil</code>.
          </p>
        </div>
        <h3>Orientation is applied before anything looks at the pixels</h3>
        <div className="doc-prose">
          <p>
            <code>Image.open()</code> does not apply the EXIF <code>Orientation</code> tag, so a
            portrait JPEG arrives at the detector on its side.{' '}
            <code>ImageOps.exif_transpose()</code> runs first, before <code>convert('RGB')</code>{' '}
            — the order matters, because transpose reads from <code>image.info</code>. Measured
            on 35 real enrolment photos:{' '}
            <strong>33 of 35 faces detected upright, 1 of 35 with the same photos rotated
              90°.</strong>
          </p>
        </div>
      </Section>

      <Section idx="04" title="Metadata extraction">
        <div className="doc-prose">
          <p>
            EXIF comes from <code>Image._getexif()</code>, with <code>PIL.ExifTags.TAGS</code>{' '}
            and <code>GPSTAGS</code> mapping numeric IDs to names. Byte-valued tags are decoded
            with <code>errors='replace'</code> and stripped of NULs rather than being allowed to
            raise.
          </p>
        </div>
        <div className="doc-table">
          <table>
            <thead>
              <tr><th>Want</th><th>Source</th><th>How</th><th>Miss</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Date taken</td>
                <td><code>DateTimeOriginal</code></td>
                <td>
                  Falls back to <code>DateTimeDigitized</code> then <code>DateTime</code>. Never
                  the filesystem mtime — a restore rewrites that.
                </td>
                <td><code>Unknown_Date/</code></td>
              </tr>
              <tr>
                <td>Location</td>
                <td><code>GPSInfo</code></td>
                <td>
                  DMS → signed decimal degrees, <code>np.isfinite</code> guard, then{' '}
                  <code>reverse_geocoder.search(mode=1)</code> — an offline k-d tree over a
                  bundled city set. Yields <code>cc/admin1/name</code>.
                </td>
                <td><code>Unknown_Location/</code></td>
              </tr>
              <tr>
                <td>Camera</td>
                <td><code>Model</code></td>
                <td>Captured passively into <code>photo_metadata</code>; never affects the sort.</td>
                <td>null</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="doc-prose">
          <p>
            Location scanning is gated behind the sort method: loading the geocoder
            unconditionally was measured taking file locks that affected unrelated sort types.
            The country segment is dropped from the output path when every photo resolves to a
            single country — <code>Uttar-Pradesh/Lucknow/</code> rather than a pointless{' '}
            <code>IN/</code> root.
          </p>
        </div>
      </Section>

      <Section idx="05" title="The detection ladder">
        <div className="doc-prose">
          <p>
            This is the piece most worth understanding. Face detection is not one operation with
            a quality dial — it is an ordered list of increasingly expensive attempts, and each
            photo <strong>exits at the first pass that returns an encoding</strong>. An ordinary
            photo pays for pass 1 only; the escalation cost falls entirely on the photos that
            would otherwise have been filed as faceless. The three modes are prefixes of the
            same list, not different algorithms.
          </p>
        </div>
        <Figure w={1180}
          caption={
            <>
              Arrays are memoised by long edge, so the two rotation passes reuse pass 1's
              decode rather than re-scaling. A sixth pass at 2000px with upsample 2 was measured
              and dropped: <b>it found exactly what pass 2 found, for five times the time.</b>
            </>
          }
        >
          <LadderDiagram />
        </Figure>
        <div className="doc-note">
          <span className="lbl">Non-obvious</span>
          <p>
            <strong>Balanced does not blend HOG and CNN, and nothing inspects the machine to
              choose a mode.</strong> Balanced is HOG-only — the fast ladder plus two rotation
            passes. The sole hardware input in the engine is <code>os.cpu_count()</code> inside{' '}
            <code>safe_worker_count()</code>; there is no RAM probe and no GPU detection.
            Against the previous design, which paid <code>upsample=2</code> unconditionally at
            ~0.97s per photo, the ladder averages <strong>~0.20s at equal or better
              recall</strong>.
          </p>
        </div>
        <h3>Where the concurrency ceiling comes from</h3>
        <pre className="doc-pre">
          <code>
            <span className="k">def</span> safe_worker_count(mode, available=<span className="k">None</span>):{'\n'}
            {'    '}<span className="k">if</span> available <span className="k">is None</span>:{'\n'}
            {'        '}available = max(<span className="s">1</span>, (os.cpu_count() <span className="k">or</span> <span className="s">2</span>) - <span className="s">1</span>){'\n'}
            {'    '}<span className="k">if</span> mode_uses_cnn(mode):{'\n'}
            {'        '}<span className="k">return</span> max(<span className="s">1</span>, min(available, MAX_CNN_WORKERS))   <span className="c"># 2</span>{'\n'}
            {'    '}<span className="k">return</span> max(<span className="s">1</span>, available)
          </code>
        </pre>
        <div className="doc-prose">
          <p>
            dlib's CNN allocates per-image buffers proportional to pixel count and offers no way
            to cap that from Python, so concurrency is the only available lever. Parallel CNN
            detections were measured exhausting an 8 GB machine, and an OOM kill loses the entire
            job — strictly worse than the job being slow. The cap is deliberately a fixed number
            rather than a memory heuristic, and is marked in the source as a known ceiling: a
            64 GB box and an 8 GB box both land on 2.
          </p>
        </div>
      </Section>

      <Section idx="06" title="dlib, and what the C++ is for">
        <div className="doc-prose">
          <p>
            <code>face_recognition</code> is a thin Python convenience layer. The work is{' '}
            <strong>dlib</strong>, a C++ computer-vision library exposed through pybind11 — which
            is why installation compiles from source when no wheel matches, and why the heavy
            paths are not bound by the GIL the way pure-Python code would be.
          </p>
          <ul>
            <li>
              <strong>HOG</strong> — Histogram of Oriented Gradients plus a linear SVM over a
              sliding window (Dalal &amp; Triggs, 2005). Gradient orientations are binned per
              cell into a descriptor robust to lighting but not to rotation. Cheap, CPU-only,
              and the reason passes 3 and 4 exist.
            </li>
            <li>
              <strong>CNN</strong> — dlib's MMOD (Max-Margin Object Detection) detector.
              Substantially better on small, angled and poorly-lit faces; expects CUDA, and its
              memory scales with input pixels.
            </li>
            <li>
              <strong>The encoding</strong> — dlib crops and aligns the detected face to a
              150×150 chip and runs a ResNet that emits <strong>128 floats</strong>. Same
              identity ⇒ small Euclidean distance. Recognition reduces to nearest-neighbour
              search in a 128-dimensional space.
            </li>
          </ul>
          <p>Matching is one vectorised operation per photo rather than per face:</p>
        </div>
        <pre className="doc-pre">
          <code>
            distances = np.linalg.norm(gallery_matrix - encoding, axis=<span className="s">1</span>){'\n'}
            best = <span className="k">int</span>(np.argmin(distances)){'\n'}
            found.add(gallery_names[best] <span className="k">if</span> distances[best] &lt;= <span className="s">0.55</span> <span className="k">else</span> <span className="s">"Unknown"</span>)
          </code>
        </pre>
        <div className="doc-prose">
          <p>
            dlib recommends 0.6. This uses <strong>0.55</strong>, and the number survived
            scrutiny for a specific reason: measured against a cleanly rebuilt gallery, 0% of
            same-person pairs exceed it. It only looked too tight against the <em>old</em>{' '}
            gallery, where 12.6% did — the fix was the gallery, not the threshold. A runner-up
            margin test and per-person distance aggregation were both implemented, measured, and
            removed as neutral-or-worse.
          </p>
        </div>
      </Section>

      <Section idx="07" title="Enrolment builds the gallery">
        <div className="doc-prose">
          <p>
            Enrolment runs once per person over a handful of photos, so it can afford the
            expensive detector. It uses CNN with an upsampled HOG fallback — 3 of the 35 measured
            enrolment photos are undetectable by HOG at any scale and would silently drop out of
            the gallery otherwise. Detection runs on an 800px copy and the box is scaled back
            into a 1600px array for encoding, with <code>num_jitters=10</code>.
          </p>
          <p>
            Three guards keep one bad sample from poisoning the gallery, because
            nearest-neighbour matching means <strong>a single wrong face is worse than a missing
              one</strong>:
          </p>
          <ul>
            <li>
              <strong>Largest face wins.</strong> The previous code took{' '}
              <code>face_encodings(...)[0]</code> — dlib's arbitrary order. On a two-person
              enrolment photo that files a stranger under the subject's name.
            </li>
            <li>
              <strong>Ambiguity is refused, not guessed.</strong> A second face at ≥60% of the
              subject's area means the folder name is unresolvable, so the photo is skipped with
              a message naming the fix.
            </li>
            <li>
              <strong>Outliers are pruned.</strong> Per person, mean pairwise distance with a{' '}
              <code>median + 2×MAD</code> threshold, floored at 0.60. Needs ≥3 samples to mean
              anything.
            </li>
          </ul>
          <p>
            Self-consistency cannot catch one person enrolled twice under two names — each name's
            photos agree with themselves perfectly — so that case is detected separately and
            reported as a warning. Which name to keep is the user's call, so nothing is deleted.
          </p>
        </div>
        <div className="doc-note">
          <span className="lbl">The bug this was all built to kill</span>
          <p>
            Enrolment loaded at 600px wide, sorting at 800px, and neither applied the orientation
            tag — so the gallery and the query encodings came from visibly different pictures.
            Aligning both paths onto one module dropped same-person pairs falling outside
            tolerance from <strong>12.6% to 0%</strong>. That percentage was photos of enrolled
            people landing in <code>Unknown_Faces/</code>.
          </p>
        </div>
      </Section>

      <Section idx="08" title="Job ordering, and why abort is cheap">
        <div className="doc-prose">
          <p>
            Recognition used to run inline, one photo at a time, on a single core — the reason a
            People sort over a large library took hours. It is also pure compute with no shared
            state, which makes it the one part of the loop that parallelises cleanly.
          </p>
          <p>
            So it was lifted into a single pass that completes{' '}
            <strong>before any file operation begins</strong>. That ordering is doing real work:
            the pool lives and dies inside one function, so an abort or an error tears the
            workers down there rather than orphaning them mid-move — and because nothing has been
            written yet, aborting during the expensive phase needs no rollback at all.
          </p>
        </div>
        <Figure w={1120}
          caption={
            <>
              File operations deliberately stayed serial and in the original order, so progress
              messages and the rollback manifest are unaffected by the parallelism.{' '}
              <b>Only the pure-compute phase was parallelised</b> — everything touching the
              filesystem still runs on one thread.
            </>
          }
        >
          <OrderingDiagram />
        </Figure>
      </Section>

      <Section idx="09" title="The encoding cache">
        <div className="doc-prose">
          <p>
            A SQLite table keyed <code>(path, engine_version)</code>, validated against{' '}
            <code>(file_size, file_mtime)</code>. Two decisions in it are worth stating.
          </p>
          <p>
            <strong>It caches encodings, not names.</strong> Names depend on who is enrolled and
            go stale the moment someone is added. Matching an encoding against the gallery is a
            single numpy operation, so it is re-run every time and stays correct for free.
          </p>
          <p>
            <strong>A cheap miss is not evidence for an expensive question.</strong> A "no face"
            result from a <code>fast</code> scan must not satisfy an <code>accurate</code>{' '}
            request. The row records <code>passes_run</code>, and reuse is gated on depth:
          </p>
        </div>
        <div className="doc-table">
          <table>
            <thead>
              <tr><th>Cached status</th><th>Reusable when</th><th>Why</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><code>ok</code></td>
                <td className="num">pass_used ≤ ladder_length(request)</td>
                <td>The pass that found the face is one this request would also have run.</td>
              </tr>
              <tr>
                <td><code>no_face</code></td>
                <td className="num">passes_run ≥ ladder_length(request)</td>
                <td>The cached scan was at least as thorough as the one being asked for.</td>
              </tr>
              <tr>
                <td>any</td>
                <td className="num">size and mtime unchanged</td>
                <td>An edited photo is always re-read.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="doc-prose">
          <p>
            That comparison is only sound because the ladders are strict prefixes of one another
            — <code>fast ⊂ balanced ⊂ accurate</code>. The bracket structure in §05 is not
            presentation; it is the invariant this rule depends on. Bumping{' '}
            <code>ENGINE_VERSION</code> invalidates every row rather than trusting encodings from
            an older recipe, and only the parent process touches the cache, so there is a single
            writer and no lock contention.
          </p>
        </div>
      </Section>

      <Section idx="10" title="Writing to disk">
        <div className="doc-prose">
          <p>
            The write is <code>shutil.copy2</code> or <code>shutil.move</code> into a path
            assembled with <code>os.path.join</code>, followed by <code>os.utime()</code>{' '}
            stamping the destination with its EXIF date so the file manager's own sort agrees
            with the folder structure. Name collisions are resolved by numbering, never by
            overwriting. Move mode branches on <code>st_dev</code>, and the two branches have
            genuinely different safety properties:
          </p>
        </div>
        <Figure w={1120}
          caption={
            <>
              The cross-drive path is transactional and fully reversible. The same-drive path
              trades that for speed and is still safe — <b>a rename either happened or it
                did not</b>, and the manifest covers the rest.
            </>
          }
        >
          <WritePathDiagram />
        </Figure>

        <h3>Space sharing on APFS</h3>
        <div className="doc-prose">
          <p>
            A People sort files one group photo under every person in it, so a photo with four
            enrolled faces is written four times — and in copy mode the originals stay too. On a
            nearly-full volume that is the difference between the feature being usable and not.
          </p>
        </div>
        <Figure w={940}
          caption={
            <>
              Called through <code>ctypes</code>; any failure — EXDEV, non-APFS, Windows, Linux —
              falls through to <code>shutil.copy2</code>, which is the previous behaviour exactly.{' '}
              <b><code>du</code> and Finder are the wrong instruments here</b>: APFS does not
              expose per-file block sharing, so four clones of a 20 MB photo still report 80 MB
              there. Volume free space is the truth.
            </>
          }
        >
          <CloneDiagram />
        </Figure>
      </Section>

      <Section idx="11" title="Measured numbers">
        <div className="doc-prose">
          <p>
            Every figure below came from a measurement on real photos, and each drove a decision
            that is still in the code.
          </p>
        </div>
        <div className="doc-table">
          <table>
            <thead>
              <tr><th>Measurement</th><th>Value</th><th>What it decided</th><th>Where it lives</th></tr>
            </thead>
            <tbody>
              {NUMBERS.map((n) => (
                <tr key={n.what}>
                  <td>{n.what}</td>
                  <td className="num">{n.value}</td>
                  <td>{n.decided}</td>
                  <td className="where">{n.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section idx="12" title="Stack">
        <div className="doc-table">
          <table>
            <thead>
              <tr><th>Layer</th><th>Choice</th><th>Note</th></tr>
            </thead>
            <tbody>
              {STACK.map(([layer, choice, note]) => (
                <tr key={layer}>
                  <td>{layer}</td>
                  <td>{choice}</td>
                  <td>{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section idx="13" title="Summary">
        <div className="doc-prose">
          <p>
            A folder scan is <code>os.walk</code> pruned by a path-prefix ignore set; files are
            admitted by extension against one canonical tuple, then decoded by Pillow, with{' '}
            <code>pillow-heif</code> for HEIC and <code>rawpy</code>/Wand for RAW. Pillow's{' '}
            <code>_getexif</code> yields the shutter date and GPS DMS, which is converted to
            decimal degrees and resolved to <code>Country/State/City</code> by an offline k-d
            tree reverse geocoder — no network. Destination paths are built with{' '}
            <code>os.path.join</code>, then <code>shutil.copy2</code>/<code>shutil.move</code>{' '}
            writes the file, <code>os.utime</code> back-dates it, and on APFS{' '}
            <code>clonefile(2)</code> via <code>ctypes</code> shares blocks so fan-out copies
            cost no extra disk.
          </p>
          <p>
            People sorting runs a separate pipeline: enrolled faces are encoded once into a
            versioned 128-D gallery, then every source photo goes through one parallel{' '}
            <code>Pool</code> pass that completes before any file is touched, so an abort
            mid-scan needs no rollback. Each photo climbs a detection ladder — HOG at 1024, HOG
            at 1600 upsampled, ±90° rotations, then dlib's MMOD CNN — and exits at the first pass
            returning an encoding; <code>fast</code>/<code>balanced</code>/<code>accurate</code>{' '}
            select ladder depth and nothing else. Matching is nearest-neighbour Euclidean
            distance under a 0.55 tolerance. Results are cached in SQLite keyed on{' '}
            <code>(path, engine_version)</code>, invalidated by <code>(size, mtime)</code>,
            storing encodings rather than names — because names go stale whenever someone is
            enrolled, and re-deriving them is one numpy operation.
          </p>
        </div>
      </Section>

      <Link className="doc-next" to="/how">
        <span className="lbl">The other side</span>
        <span className="doc-next-title">Basic Understanding of LocalLens →</span>
        <p>
          The same pipeline without the engineering — what happens to a folder of photos, in
          plain English. The page to send someone who just wants to know it is safe.
        </p>
      </Link>

      <div className="doc-foot">
        <a href="https://github.com/ashesbloom/LocalLens" target="_blank" rel="noopener noreferrer">
          read the source ↗
        </a>
        <span className="sep">·</span>
        <Link to="/">home</Link>
        <span className="sep">·</span>
        <span>
          press <kbd>←</kbd> <kbd>→</kbd> for the next section, or <kbd>?</kbd> for every key
        </span>
      </div>
    </div>
  )
}
