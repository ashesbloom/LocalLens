// Diagrams for /pipeline. Same house rules as HowDiagrams.jsx: tokens only, type set in
// doc.css, per-diagram marker id prefixes, one claim per figure.
//
// These lean harder on labelled edges than the walkthrough's do — on this page the arrows
// are the argument. An unlabelled arrow only says "related somehow".

const PANEL_2 = 'rgba(53,240,138,0.05)'
const IRIS_WASH = 'rgba(232,106,36,0.10)'

function Arrow({ id, fill = 'var(--phos-mid)' }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill={fill} />
    </marker>
  )
}

// 1 — the request's actual path, including the channel that comes back. A job is fired and
// forgotten; progress returns over SSE, which is why the UI can show a live log for work it
// is not waiting on.
export function ArchitectureDiagram() {
  const deps = [
    { x: 20, cx: 140, title: 'Pillow · pillow-heif', a: 'rawpy / Wand for RAW', b: 'decodes 19 formats' },
    { x: 300, cx: 420, title: 'reverse_geocoder', a: 'bundled k-d tree', b: 'offline, no lookup' },
    { x: 580, cx: 700, title: 'face_engine → dlib', a: 'HOG + MMOD CNN', b: 'multiprocessing.Pool' },
    { x: 865, cx: 985, title: 'metadata_store', a: 'SQLite: face_cache', b: '+ photo_metadata' },
  ]
  return (
    <svg
      viewBox="0 0 1120 268"
      role="img"
      aria-label="The React UI posts a sort request to a local FastAPI server, which runs organizer_logic as a background task; organizer_logic calls the decoders, the offline geocoder, face_engine and the SQLite store in-process, and progress streams back to the UI over server-sent events."
    >
      <defs>
        <Arrow id="pl-arch-a" />
        <Arrow id="pl-arch-b" fill="var(--cool)" />
      </defs>

      <path d="M560 40 V 18 H 135 V 34" fill="none" stroke="var(--cool)" strokeWidth="1.2" markerEnd="url(#pl-arch-b)" />
      <text x="347" y="13" textAnchor="middle" fontSize="10.5" fill="var(--cool)">
        SSE /api/stream-logs — progress %, log lines, analytics
      </text>

      <rect x="20" y="40" width="230" height="62" rx="6" fill={PANEL_2} stroke="var(--line-firm)" />
      <rect x="445" y="40" width="230" height="62" rx="6" fill={PANEL_2} stroke="var(--line-firm)" />
      <rect x="870" y="40" width="230" height="62" rx="6" fill={PANEL_2} stroke="var(--phos)" />
      <text x="135" y="68" textAnchor="middle" fontSize="12.5" fill="var(--phos-soft)">React 18 · Tauri 2</text>
      <text x="560" y="68" textAnchor="middle" fontSize="12.5" fill="var(--phos-soft)">FastAPI</text>
      <text x="985" y="68" textAnchor="middle" fontSize="12.5" fill="var(--phos-soft)">organizer_logic</text>
      <text x="135" y="85" textAnchor="middle" fontSize="10" fill="var(--paper-dim)">desktop shell</text>
      <text x="560" y="85" textAnchor="middle" fontSize="10" fill="var(--paper-dim)">127.0.0.1 · X-Local-Token</text>
      <text x="985" y="85" textAnchor="middle" fontSize="10" fill="var(--paper-dim)">one job at a time</text>

      <line x1="250" y1="71" x2="437" y2="71" stroke="var(--phos-mid)" strokeWidth="1.2" markerEnd="url(#pl-arch-a)" />
      <line x1="675" y1="71" x2="862" y2="71" stroke="var(--phos-mid)" strokeWidth="1.2" markerEnd="url(#pl-arch-a)" />
      <text x="343" y="62" textAnchor="middle" fontSize="10.5" fill="var(--phos-mid)">POST /api/start-sorting</text>
      <text x="768" y="62" textAnchor="middle" fontSize="10.5" fill="var(--phos-mid)">BackgroundTasks</text>

      <path d="M985 102 V 140 M140 140 H 985" fill="none" stroke="var(--line-firm)" strokeWidth="1.2" />
      {deps.map((d) => (
        <g key={d.title}>
          <line x1={d.cx} y1="140" x2={d.cx} y2="172" stroke="var(--line-firm)" strokeWidth="1.2" />
          <rect x={d.x} y="172" width="240" height="74" rx="6" fill={PANEL_2} stroke="var(--line)" />
          <text x={d.cx} y="197" textAnchor="middle" fontSize="11.5" fill="var(--phos-soft)">{d.title}</text>
          <text x={d.cx} y="216" textAnchor="middle" fontSize="10" fill="var(--paper-dim)">{d.a}</text>
          <text x={d.cx} y="233" textAnchor="middle" fontSize="10" fill="var(--paper-dim)">{d.b}</text>
        </g>
      ))}
    </svg>
  )
}

// 2 — two mechanisms that share one helper. Left: the branch the walk never enters. Right:
// the edge the ignore set removes, drawn as the loop it would otherwise be.
export function EnumerationDiagram() {
  return (
    <svg
      viewBox="0 0 1120 344"
      role="img"
      aria-label="Left: the walk prunes an ignored subtree so it never descends into its children. Right: when the destination nests inside the source, the ignore set removes the edge that would feed sorted output back into the walk."
    >
      <defs>
        <Arrow id="pl-enum-a" />
        <Arrow id="pl-enum-b" fill="var(--iris)" />
      </defs>

      <text x="20" y="20" fontSize="10.5" letterSpacing="1.6" fill="var(--phos-mid)">A · SUBTREE PRUNING</text>
      <line x1="80" y1="72" x2="80" y2="222" stroke="var(--line-firm)" strokeWidth="1.2" />
      <line x1="130" y1="252" x2="130" y2="312" stroke="var(--line-firm)" strokeWidth="1.2" strokeDasharray="4 3" />
      <g stroke="var(--line-firm)" strokeWidth="1.2">
        <line x1="80" y1="122" x2="106" y2="122" />
        <line x1="80" y1="172" x2="106" y2="172" />
        <line x1="80" y1="222" x2="106" y2="222" />
      </g>
      <g stroke="var(--line-firm)" strokeWidth="1.2" strokeDasharray="4 3">
        <line x1="130" y1="272" x2="156" y2="272" />
        <line x1="130" y1="312" x2="156" y2="312" />
      </g>
      <rect x="30" y="42" width="160" height="30" rx="4" fill={PANEL_2} stroke="var(--line-firm)" />
      <rect x="106" y="107" width="160" height="30" rx="4" fill={PANEL_2} stroke="var(--line)" />
      <rect x="106" y="157" width="160" height="30" rx="4" fill={PANEL_2} stroke="var(--line)" />
      <rect x="106" y="207" width="180" height="30" rx="4" fill={IRIS_WASH} stroke="var(--iris)" />
      <rect x="156" y="257" width="160" height="30" rx="4" fill="none" stroke="var(--paper-dim)" strokeDasharray="4 3" opacity=".45" />
      <rect x="156" y="297" width="160" height="30" rx="4" fill="none" stroke="var(--paper-dim)" strokeDasharray="4 3" opacity=".45" />
      <text x="44" y="62" fontSize="11.5" fill="var(--phos-soft)">Photos/</text>
      <text x="120" y="127" fontSize="11.5" fill="var(--paper)">2023/</text>
      <text x="120" y="177" fontSize="11.5" fill="var(--paper)">2024/</text>
      <text x="120" y="227" fontSize="11.5" fill="var(--iris)">Screenshots/</text>
      <text x="170" y="277" fontSize="11.5" fill="var(--paper-dim)" opacity=".55">Work/</text>
      <text x="170" y="317" fontSize="11.5" fill="var(--paper-dim)" opacity=".55">Memes/</text>
      <g stroke="var(--iris)" strokeWidth="2.2" strokeLinecap="round">
        <line x1="123" y1="245" x2="137" y2="259" />
        <line x1="137" y1="245" x2="123" y2="259" />
      </g>
      <text x="300" y="252" fontSize="10.5" fill="var(--paper-dim)">dirnames[:] drops the branch —</text>
      <text x="300" y="269" fontSize="10.5" fill="var(--paper-dim)">os.walk never descends, so the</text>
      <text x="300" y="286" fontSize="10.5" fill="var(--paper-dim)">children are never even listed.</text>

      <line x1="580" y1="20" x2="580" y2="334" stroke="var(--line)" strokeWidth="1" />

      <text x="620" y="20" fontSize="10.5" letterSpacing="1.6" fill="var(--phos-mid)">B · THE SELF-INGEST GUARD</text>
      <rect x="620" y="42" width="200" height="42" rx="21" fill={PANEL_2} stroke="var(--phos)" />
      <text x="720" y="68" textAnchor="middle" fontSize="11.5" fill="var(--phos-soft)">walk_ignoring()</text>
      <rect x="620" y="140" width="450" height="150" rx="6" fill={PANEL_2} stroke="var(--line-firm)" />
      <text x="640" y="165" fontSize="11.5" fill="var(--phos-soft)">Photos/</text>
      <text x="706" y="165" fontSize="10.5" fill="var(--paper-dim)">← source</text>
      <rect x="850" y="185" width="196" height="70" rx="5" fill={IRIS_WASH} stroke="var(--iris)" />
      <text x="948" y="212" textAnchor="middle" fontSize="11.5" fill="var(--iris)">Sorted/</text>
      <text x="948" y="231" textAnchor="middle" fontSize="10" fill="var(--paper-dim)">← destination</text>

      <line x1="680" y1="84" x2="680" y2="132" stroke="var(--phos-mid)" strokeWidth="1.2" markerEnd="url(#pl-enum-a)" />
      <text x="690" y="112" fontSize="10.5" fill="var(--phos-mid)">reads</text>

      <path d="M948 185 V 108 H 840" fill="none" stroke="var(--iris)" strokeWidth="1.3" strokeDasharray="5 4" markerEnd="url(#pl-enum-b)" />
      <g stroke="var(--iris)" strokeWidth="2.4" strokeLinecap="round">
        <line x1="886" y1="100" x2="900" y2="116" />
        <line x1="900" y1="100" x2="886" y2="116" />
      </g>
      <text x="1064" y="96" textAnchor="end" fontSize="10.5" fill="var(--iris)">output re-read as input</text>
      <text x="620" y="315" fontSize="10.5" fill="var(--paper-dim)">effective_ignore_set() adds dest to the set when dest ⊂ source,</text>
      <text x="620" y="332" fontSize="10.5" fill="var(--paper-dim)">so the precount and the copy loop can never disagree on scope.</text>
    </svg>
  )
}

// 3 — the showpiece. Five passes, the real tuples, and the mode brackets underneath, which
// are the thing that makes "balanced is HOG-only" visible rather than merely asserted.
export function LadderDiagram() {
  const passes = [
    { x: 30, y: 250, n: 'PASS 1', spec: 'hog · 1024 · up0', note: '~0.16s · most exit here' },
    { x: 240, y: 203, n: 'PASS 2', spec: 'hog · 1600 · up1', note: '~0.66s · small / distant' },
    { x: 450, y: 156, n: 'PASS 3', spec: 'hog · 1024 · rot +90', note: 'bad orientation tag' },
    { x: 660, y: 109, n: 'PASS 4', spec: 'hog · 1024 · rot −90', note: 'bad orientation tag' },
    { x: 870, y: 62, n: 'PASS 5', spec: 'cnn · 1200 (MMOD)', note: '≤ 2 workers · memory-bound', cnn: true },
  ]
  const brackets = [
    { y: 340, to: 435, label: 'fast' },
    { y: 366, to: 855, label: 'balanced · default' },
    { y: 392, to: 1065, label: 'accurate' },
  ]
  return (
    <svg
      viewBox="0 0 1180 404"
      role="img"
      aria-label="Five detection passes as an ascending staircase. Fast runs passes one and two, Balanced adds two rotation passes, Accurate adds a CNN pass. Each photo exits at the first pass that returns an encoding."
    >
      <text x="30" y="22" fontSize="11" fill="var(--paper-dim)">
        Passes run in order. The first that returns an encoding ends the scan for that photo — the rest never execute.
      </text>
      <polyline
        points="30,316 225,316 225,269 435,269 435,222 645,222 645,175 855,175 855,128 1065,128"
        fill="none"
        stroke="var(--line-firm)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      {passes.map((p) => (
        <g key={p.n}>
          <rect
            x={p.x}
            y={p.y}
            width="195"
            height="66"
            rx="5"
            fill={p.cnn ? IRIS_WASH : PANEL_2}
            stroke={p.cnn ? 'var(--iris)' : 'var(--phos-dim)'}
          />
          <text x={p.x + 18} y={p.y + 22} fontSize="10.5" fill={p.cnn ? 'var(--iris)' : 'var(--phos)'}>{p.n}</text>
          <text x={p.x + 18} y={p.y + 40} fontSize="10.5" fill="var(--phos-soft)">{p.spec}</text>
          <text x={p.x + 18} y={p.y + 56} fontSize="9.5" fill="var(--paper-dim)">{p.note}</text>
        </g>
      ))}
      {brackets.map((b) => (
        <g key={b.label}>
          <path d={`M30 ${b.y} v8 H${b.to} v-8`} fill="none" stroke="var(--phos-dim)" strokeWidth="1.1" />
          <text x={b.to + 12} y={b.y + 12} fontSize="11" fill="var(--paper)">{b.label}</text>
        </g>
      ))}
    </svg>
  )
}

// 4 — why aborting is cheap. The claim is about ordering, so the two phases are drawn as two
// bands with the "nothing written yet" line between them.
export function OrderingDiagram() {
  const lanes = [
    [[70, 86], [162, 132], [300, 72], [378, 148]],
    [[70, 128], [204, 74], [284, 160], [450, 76]],
    [[70, 70], [146, 154], [306, 96], [408, 118]],
    [[70, 142], [218, 88], [312, 118], [436, 90]],
  ]
  return (
    <svg
      viewBox="0 0 1120 284"
      role="img"
      aria-label="Phase one runs face recognition across parallel workers with nothing written to disk; phase two performs file operations serially while accumulating a rollback manifest that is replayed in reverse on abort."
    >
      <defs>
        <Arrow id="pl-ord-a" fill="var(--iris)" />
      </defs>

      <rect x="20" y="52" width="530" height="168" rx="6" fill={PANEL_2} stroke="var(--line-firm)" />
      <text x="38" y="76" fontSize="10" letterSpacing="1" fill="var(--phos)">PHASE 1 · RECOGNITION · PARALLEL</text>
      {['w1', 'w2', 'w3', 'wN'].map((w, i) => (
        <text key={w} x="38" y={107 + i * 28} fontSize="9.5" fill="var(--paper-dim)">{w}</text>
      ))}
      {lanes.map((lane, row) =>
        lane.map(([x, w], i) => (
          <rect key={`${row}-${i}`} x={x} y={96 + row * 28} width={w} height="14" rx="3" fill="var(--phos-dim)" />
        )),
      )}
      <text x="38" y="212" fontSize="9.5" fill="var(--paper-dim)">
        Pool(processes = cpu_count − 1, capped at 2 when the ladder can reach CNN)
      </text>

      <line x1="575" y1="30" x2="575" y2="244" stroke="var(--iris)" strokeWidth="1.3" strokeDasharray="5 4" />
      <text x="575" y="24" textAnchor="middle" fontSize="10.5" fill="var(--iris)">nothing on disk yet</text>
      <text x="575" y="262" textAnchor="middle" fontSize="10.5" fill="var(--iris)">abort here → no rollback needed</text>

      <rect x="600" y="52" width="490" height="168" rx="6" fill={PANEL_2} stroke="var(--line-firm)" />
      <text x="618" y="76" fontSize="10" letterSpacing="1" fill="var(--phos)">PHASE 2 · FILE OPS · SERIAL</text>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <rect key={i} x={618 + i * 58} y="96" width="52" height="16" rx="3" fill="var(--phos-mid)" />
      ))}
      <rect x="1024" y="96" width="52" height="16" rx="3" fill="none" stroke="var(--phos-dim)" strokeDasharray="3 3" />
      <text x="618" y="132" fontSize="9.5" fill="var(--paper-dim)">
        handle_file_op() — one photo at a time, original order preserved
      </text>
      <text x="618" y="162" fontSize="9.5" fill="var(--paper-dim)">manifest</text>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={682 + i * 58} y="150" width="52" height="15" rx="3" fill="none" stroke="var(--iris)" strokeWidth="1" />
      ))}
      <line x1="1024" y1="192" x2="690" y2="192" stroke="var(--iris)" strokeWidth="1.2" markerEnd="url(#pl-ord-a)" />
      <text x="857" y="185" textAnchor="middle" fontSize="9.5" fill="var(--iris)">on abort: replay in reverse</text>
    </svg>
  )
}

// 5 — the write path's one real branch, and why the two halves have different guarantees.
export function WritePathDiagram() {
  return (
    <svg
      viewBox="0 0 1120 254"
      role="img"
      aria-label="Move mode compares device ids: same drive performs fast per-file renames with a rollback manifest, while cross-drive does a space check, copies to a temporary workspace, sorts, and then deletes the source in an ignore-aware pass."
    >
      <defs>
        <Arrow id="pl-wp-a" />
        <Arrow id="pl-wp-b" fill="var(--iris)" />
      </defs>

      <rect x="20" y="98" width="250" height="62" rx="6" fill={PANEL_2} stroke="var(--phos)" />
      <text x="145" y="124" textAnchor="middle" fontSize="11.5" fill="var(--phos-soft)">st_dev(src) == st_dev(dst)</text>
      <text x="145" y="142" textAnchor="middle" fontSize="10" fill="var(--paper-dim)">same physical volume?</text>

      <path d="M270 118 H 320 V 58 H 352" fill="none" stroke="var(--phos-mid)" strokeWidth="1.2" markerEnd="url(#pl-wp-a)" />
      <path d="M270 140 H 320 V 198 H 352" fill="none" stroke="var(--iris)" strokeWidth="1.2" markerEnd="url(#pl-wp-b)" />
      <text x="328" y="46" fontSize="10" fill="var(--phos-mid)">yes</text>
      <text x="328" y="214" fontSize="10" fill="var(--iris)">no</text>

      <rect x="360" y="28" width="300" height="60" rx="5" fill={PANEL_2} stroke="var(--line-firm)" />
      <text x="378" y="52" fontSize="11.5" fill="var(--phos-soft)">shutil.move() per file = rename</text>
      <text x="378" y="70" fontSize="10" fill="var(--paper-dim)">instant · abort replays the manifest</text>

      <rect x="360" y="168" width="300" height="60" rx="5" fill={PANEL_2} stroke="var(--line-firm)" />
      <text x="378" y="192" fontSize="11.5" fill="var(--phos-soft)">space check → copytree to temp</text>
      <text x="378" y="210" fontSize="10" fill="var(--paper-dim)">refuses the job, never fills the volume</text>

      <line x1="660" y1="58" x2="740" y2="58" stroke="var(--phos-mid)" strokeWidth="1.2" markerEnd="url(#pl-wp-a)" />
      <rect x="748" y="28" width="352" height="60" rx="5" fill={PANEL_2} stroke="var(--line-firm)" />
      <text x="766" y="52" fontSize="11.5" fill="var(--phos-soft)">no temp copy, no source rmtree</text>
      <text x="766" y="70" fontSize="10" fill="var(--paper-dim)">not fully transactional, but cannot lose data</text>

      <line x1="660" y1="198" x2="740" y2="198" stroke="var(--iris)" strokeWidth="1.2" markerEnd="url(#pl-wp-b)" />
      <rect x="748" y="168" width="352" height="60" rx="5" fill={PANEL_2} stroke="var(--line-firm)" />
      <text x="766" y="192" fontSize="11.5" fill="var(--phos-soft)">sort → ignore-aware source delete</text>
      <text x="766" y="210" fontSize="10" fill="var(--paper-dim)">bottom-up; ignored subtrees survive</text>

      <text x="20" y="246" fontSize="9.5" fill="var(--paper-dim)">
        A blanket rmtree(source) would destroy ignored subtrees that were never copied anywhere — so the cleanup walks bottom-up.
      </text>
    </svg>
  )
}

// 6 — what a People sort costs on disk, and what clonefile does about it.
export function CloneDiagram() {
  const dests = ['Mayank/With Others/', 'Aditi/With Others/', 'Rhea/With Others/', 'Kabir/With Others/']
  return (
    <svg
      viewBox="0 0 940 216"
      role="img"
      aria-label="One group photo containing four enrolled people fans out to four independent destination files that share the same disk blocks through clonefile, consuming the space of a single copy."
    >
      <defs>
        <Arrow id="pl-cl-a" />
        <Arrow id="pl-cl-b" fill="var(--iris)" />
      </defs>

      <rect x="20" y="72" width="180" height="66" rx="5" fill={PANEL_2} stroke="var(--line-firm)" />
      <text x="110" y="98" textAnchor="middle" fontSize="11.5" fill="var(--phos-soft)">IMG_8842.jpg</text>
      <text x="110" y="116" textAnchor="middle" fontSize="10" fill="var(--paper-dim)">20 MB · 4 enrolled faces</text>

      <line x1="200" y1="105" x2="244" y2="105" stroke="var(--phos-mid)" strokeWidth="1.2" markerEnd="url(#pl-cl-a)" />
      <text x="225" y="96" textAnchor="middle" fontSize="9.5" fill="var(--phos-mid)">people sort</text>

      {dests.map((d, i) => (
        <g key={d}>
          <rect x="262" y={22 + i * 44} width="230" height="34" rx="4" fill={PANEL_2} stroke="var(--line)" />
          <text x="278" y={44 + i * 44} fontSize="10.5" fill="var(--phos-soft)">{d}</text>
          <text x="480" y={44 + i * 44} textAnchor="end" fontSize="10" fill="var(--phos)">20 MB</text>
        </g>
      ))}

      <path d="M500 39 H 530 M500 83 H 530 M500 127 H 530 M500 171 H 530 M530 39 V 171" stroke="var(--line-firm)" strokeWidth="1" fill="none" />
      <line x1="530" y1="105" x2="590" y2="105" stroke="var(--iris)" strokeWidth="1.3" markerEnd="url(#pl-cl-b)" />

      <rect x="598" y="72" width="322" height="66" rx="5" fill={IRIS_WASH} stroke="var(--iris)" />
      <text x="759" y="98" textAnchor="middle" fontSize="11.5" fill="var(--iris)">20 MB consumed on the volume</text>
      <text x="759" y="116" textAnchor="middle" fontSize="10" fill="var(--paper-dim)">clonefile(2) — independent files, shared blocks</text>

      <text x="20" y="206" fontSize="9.5" fill="var(--paper-dim)">
        Hardlinks were rejected: one shared inode means the os.utime() EXIF stamp would apply to every copy at once.
      </text>
    </svg>
  )
}
