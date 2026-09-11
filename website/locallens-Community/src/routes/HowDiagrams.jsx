// Diagrams for /how. Hand-authored inline SVG — no chart library, no runtime, no images.
//
// House rules, so a later edit does not quietly break one of them:
//   · Colours come from the tokens, never a literal hex. --iris is reserved for the one
//     thing each figure is actually about; everything else is phosphor or paper.
//   · Type is set in doc.css (.doc-figbox svg text), one monospace family throughout —
//     predictable advance widths are what keep hand-placed labels inside their boxes.
//   · Every figure is wrapped by the page in <figure> with a real caption, and carries
//     role="img" + aria-label saying what it shows.
//   · Marker ids are prefixed per diagram: they resolve document-wide, so two figures using
//     a bare id="arrow" would silently share one marker.

const PANEL_2 = 'rgba(53,240,138,0.05)'
const IRIS_WASH = 'rgba(232,106,36,0.10)'

// 1 — the five stages, as a track. Numbered because this genuinely is a sequence: each
// station is the input to the next one.
export function JourneyDiagram() {
  const stops = [
    { x: 110, n: '1', title: 'Find them', a: 'looks inside every', b: 'subfolder you allow' },
    { x: 330, n: '2', title: 'Check the type', a: 'JPEG, HEIC, RAW', b: 'and 16 more' },
    { x: 550, n: '3', title: 'Read the notes', a: 'the date and place', b: 'your camera saved' },
    { x: 770, n: '4', title: 'Choose a home', a: 'by date, by place,', b: 'or by who is in it' },
    { x: 990, n: '5', title: 'Put it there', a: 'copies it in — your', b: 'original stays put' },
  ]
  return (
    <svg
      viewBox="0 0 1100 196"
      role="img"
      aria-label="The five stages every photo passes through: find it, check the type, read the camera's notes, choose a folder, and copy it there."
    >
      <line x1="110" y1="100" x2="990" y2="100" stroke="currentColor" strokeWidth="1.2" opacity=".3" />
      <g fill="currentColor" opacity=".45">
        {[214, 434, 654, 874].map((x) => (
          <polygon key={x} points={`${x},95 ${x + 12},100 ${x},105`} />
        ))}
      </g>
      {stops.map((s, i) => {
        const last = i === stops.length - 1
        return (
          <g key={s.n}>
            <circle
              cx={s.x}
              cy="100"
              r="15"
              fill={last ? 'var(--iris)' : 'var(--panel)'}
              stroke={last ? 'var(--iris)' : 'var(--line-firm)'}
              strokeWidth="1.4"
            />
            <text x={s.x} y="104.5" textAnchor="middle" fontSize="11.5" fill={last ? 'var(--void)' : 'var(--phos)'}>
              {s.n}
            </text>
            <text x={s.x} y="58" textAnchor="middle" fontSize="13" fill="var(--phos-soft)">
              {s.title}
            </text>
            <text x={s.x} y="143" textAnchor="middle" fontSize="10.5" fill="var(--paper-dim)">
              {s.a}
            </text>
            <text x={s.x} y="159" textAnchor="middle" fontSize="10.5" fill="var(--paper-dim)">
              {s.b}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// 2 — the cascade. The claim is that a tick applies to a subtree, so the subtree is what is
// drawn: the shaded region covers three rows, not one.
export function FolderTreeDiagram() {
  const rows = [
    { y: 44, indent: 28, name: 'Photos', on: false },
    { y: 78, indent: 56, name: '2023', on: false },
    { y: 112, indent: 84, name: 'Goa', on: false },
    { y: 146, indent: 84, name: 'Diwali', on: false },
    { y: 180, indent: 56, name: 'Screenshots', on: true },
    { y: 214, indent: 84, name: 'Work', on: true },
    { y: 248, indent: 84, name: 'Memes', on: true },
    { y: 282, indent: 56, name: '2024', on: false },
  ]
  return (
    <svg
      viewBox="0 0 660 320"
      role="img"
      aria-label="A folder tree where unticking the Screenshots folder also unticks its Work and Memes subfolders, excluding the whole branch."
    >
      <rect x="40" y="152" width="404" height="106" rx="9" fill={IRIS_WASH} stroke="var(--iris)" strokeWidth="1.2" strokeDasharray="4 4" />
      {rows.map((r) => (
        <g key={r.name}>
          <rect x={r.indent} y={r.y - 11} width="14" height="11" rx="1.5" fill={r.on ? 'var(--iris)' : 'var(--phos-dim)'} />
          <text x={r.indent + 24} y={r.y} fontSize="13" fill={r.on ? 'var(--iris)' : 'var(--paper)'}>
            {r.name}
          </text>
          {r.on ? (
            <>
              <rect x="392" y={r.y - 13} width="16" height="16" rx="3.5" fill="var(--iris)" />
              <path
                d={`M395.5 ${r.y - 4.5} l3.2 3.2 l5.8 -6`}
                fill="none"
                stroke="var(--void)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          ) : null}
        </g>
      ))}
      <path d="M444 205 H 476" fill="none" stroke="var(--iris)" strokeWidth="1.3" />
      <path d="M476 172 V 238" fill="none" stroke="var(--iris)" strokeWidth="1.3" />
      <text x="490" y="182" fontSize="11.5" fill="var(--paper)">You untick one</text>
      <text x="490" y="200" fontSize="11.5" fill="var(--paper)">folder. Everything</text>
      <text x="490" y="218" fontSize="11.5" fill="var(--paper)">inside it is left</text>
      <text x="490" y="236" fontSize="11.5" fill="var(--paper)">alone too.</text>
    </svg>
  )
}

// 3 — the outcome, not the option. Three real folder trees, with the real folder names the
// sorter writes, including the ones for photos it could not place.
export function OutcomesDiagram() {
  const panels = [
    {
      x: 0,
      tag: 'BY DATE',
      rows: [
        [0, 'Sorted/'], [1, '2024/'], [2, '07-July/'], [2, '08-August/'],
        [1, '2023/'], [2, '12-December/'], [1, 'Unknown_Date/', true],
      ],
    },
    {
      x: 385,
      tag: 'BY LOCATION',
      rows: [
        [0, 'Sorted/'], [1, 'IN/'], [2, 'Uttar-Pradesh/'], [3, 'Lucknow/'],
        [3, 'Varanasi/'], [1, 'JP/'], [1, 'Unknown_Location/', true],
      ],
    },
    {
      x: 770,
      tag: 'BY PERSON',
      rows: [
        [0, 'Sorted/'], [1, 'Mayank/'], [2, 'With Others/'], [1, 'Aditi/'],
        [2, 'With Others/'], [1, 'Unknown_Faces/', true], [1, 'No_Faces_Found/', true],
      ],
    },
  ]
  return (
    <svg
      viewBox="0 0 1100 330"
      role="img"
      aria-label="Three resulting folder structures: sorted by date into year and month folders, by location into country, state and city folders, and by person into a folder each with a With Others subfolder for group photos."
    >
      {panels.map((p) => (
        <g key={p.tag}>
          <text x={p.x} y="14" fontSize="11" letterSpacing="1.6" fill="var(--iris)">
            {p.tag}
          </text>
          <rect x={p.x} y="28" width="330" height="286" rx="6" fill={PANEL_2} stroke="var(--line)" />
          {p.rows.map(([depth, name, dim], i) => (
            <text
              key={name + i}
              x={p.x + 20 + depth * 18}
              y={64 + i * 34}
              fontSize="12.5"
              fill={dim ? 'var(--paper-dim)' : 'var(--phos-soft)'}
            >
              {name}
            </text>
          ))}
        </g>
      ))}
    </svg>
  )
}

// 3b — the three modes, as the folder shape each one leaves behind. The figure above shows
// the three sort *rules*; these are the three *modes*, which is a different question and was
// previously only a sentence of prose.
//
// Hybrid is the one worth getting right, because the intuitive version is wrong: it does not
// split the library into "the set you picked" and "everything else". _get_hybrid_sort_paths
// (backend/organizer_logic.py) appends the filtered path and then always extends with the
// full standard sort, so a matched photo is written to both places and the base sort stays
// complete. There is no Others/ folder. `Japan-Trip/` below stands in for whatever the user
// types; the default when they type nothing is `Filtered`.
export function ModesDiagram() {
  const panels = [
    {
      x: 0,
      tag: 'STANDARD',
      note: 'one rule, the whole library',
      rows: [
        [0, 'Sorted/'], [1, '2024/'], [2, '07-July/'], [1, '2023/'],
        [2, '12-December/'], [1, 'Unknown_Date/', true],
      ],
    },
    {
      x: 385,
      tag: 'HYBRID',
      note: 'matched photos land in both',
      rows: [
        [0, 'Sorted/'], [1, 'Japan-Trip/', false, true], [2, 'IMG_0421.jpg', false, true],
        [1, '2024/'], [2, '07-July/'], [1, 'Unknown_Date/', true],
      ],
    },
    {
      x: 770,
      tag: 'FIND & GROUP',
      note: 'your library is not touched',
      rows: [
        [0, 'Photos/'], [1, 'IMG_0421.jpg', true], [1, 'IMG_0455.jpg', true],
        [0, 'Japan-Only/', false, true], [1, 'IMG_0421.jpg', false, true],
        [1, 'IMG_0455.jpg', false, true],
      ],
    },
  ]
  return (
    <svg
      viewBox="0 0 1100 330"
      role="img"
      aria-label="The folder shape each mode leaves behind. Standard sorts the whole library by one rule. Hybrid writes matched photos into a folder you name and also into the full base sort, so they appear in both. Find and Group copies matches into a new folder and leaves the original library untouched."
    >
      {panels.map((p) => (
        <g key={p.tag}>
          <text x={p.x} y="14" fontSize="11" letterSpacing="1.6" fill="var(--iris)">
            {p.tag}
          </text>
          <rect x={p.x} y="28" width="330" height="286" rx="6" fill={PANEL_2} stroke="var(--line)" />
          {p.rows.map(([depth, name, dim, mark], i) => (
            <g key={name + i}>
              {/* A wash behind the rows this mode is actually about: the folder the user
                  named, and the copies written into it. */}
              {mark ? (
                <rect
                  x={p.x + 12}
                  y={48 + i * 34}
                  width="306"
                  height="26"
                  rx="3"
                  fill={IRIS_WASH}
                />
              ) : null}
              <text
                x={p.x + 20 + depth * 18}
                y={66 + i * 34}
                fontSize="12.5"
                fill={dim ? 'var(--paper-dim)' : mark ? 'var(--iris)' : 'var(--phos-soft)'}
              >
                {name}
              </text>
            </g>
          ))}
          <line
            x1={p.x + 16}
            y1="272"
            x2={p.x + 314}
            y2="272"
            stroke="var(--line)"
            strokeWidth="1"
          />
          <text x={p.x + 20} y="294" fontSize="11.5" fill="var(--paper-dim)">
            {p.note}
          </text>
        </g>
      ))}
    </svg>
  )
}

// 4 — where the 128 numbers come from and what they are for. The bars are drawn as signed
// deviations from a centre line because that is what the encoding is: signed floats, not
// magnitudes. It is the middle panel that makes the privacy claim later concrete.
const BARS = [44, 20, 60, 14, 36, 72, 24, 48, 12, 56, 30, 40, 18, 66, 26, 52, 10, 38, 62, 22, 44, 16, 32, 54]

export function FaceMatchDiagram() {
  return (
    <svg
      viewBox="0 0 1100 200"
      role="img"
      aria-label="Enrolment turns a few photos of one person into 128 numbers, which are then compared against every photo in the library to find the matches."
    >
      <defs>
        <marker id="how-fm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--phos-dim)" />
        </marker>
      </defs>

      <text x="145" y="24" textAnchor="middle" fontSize="13" fill="var(--phos-soft)">You show it a few photos</text>
      <text x="550" y="24" textAnchor="middle" fontSize="13" fill="var(--phos-soft)">It keeps 128 numbers</text>
      <text x="955" y="24" textAnchor="middle" fontSize="13" fill="var(--phos-soft)">It checks every photo</text>

      {[42, 114, 186].map((x) => (
        <g key={x}>
          <rect x={x} y="54" width="62" height="48" rx="4" fill={PANEL_2} stroke="var(--line-firm)" />
          <circle cx={x + 31} cy="72" r="9" fill="var(--phos-dim)" />
          <path d={`M${x + 14} 102 q17 -20 34 0 z`} fill="var(--phos-dim)" />
        </g>
      ))}
      <rect x="96" y="122" width="98" height="26" rx="13" fill="var(--iris)" />
      <text x="145" y="139.5" textAnchor="middle" fontSize="12" fill="var(--void)">Mayank</text>

      <line x1="290" y1="102" x2="378" y2="102" stroke="var(--phos-dim)" strokeWidth="1.2" markerEnd="url(#how-fm-arrow)" />
      <text x="334" y="92" textAnchor="middle" fontSize="10.5" fill="var(--paper-dim)">learns once</text>

      <line x1="418" y1="102" x2="682" y2="102" stroke="var(--line-firm)" strokeWidth="1" />
      {BARS.map((h, i) => (
        <rect key={i} x={420 + i * 11} y={102 - h / 2} width="6" height={h} rx="2" fill="var(--phos)" opacity=".85" />
      ))}
      <text x="550" y="152" textAnchor="middle" fontSize="10.5" fill="var(--paper-dim)">
        the same face always makes similar numbers
      </text>

      <line x1="700" y1="102" x2="788" y2="102" stroke="var(--phos-dim)" strokeWidth="1.2" markerEnd="url(#how-fm-arrow)" />
      <text x="744" y="92" textAnchor="middle" fontSize="10.5" fill="var(--paper-dim)">compares</text>

      {[0, 1, 2].map((row) =>
        [0, 1, 2, 3, 4, 5].map((col) => {
          const hit = (row === 0 && (col === 1 || col === 4)) || (row === 1 && col === 0) || (row === 2 && col === 3)
          return (
            <rect
              key={`${row}-${col}`}
              x={820 + col * 46}
              y={54 + row * 36}
              width="38"
              height="28"
              rx="3"
              fill={hit ? IRIS_WASH : PANEL_2}
              stroke={hit ? 'var(--iris)' : 'var(--line)'}
              strokeWidth={hit ? '1.8' : '1'}
            />
          )
        }),
      )}
      <text x="955" y="180" textAnchor="middle" fontSize="10.5" fill="var(--paper-dim)">
        the matches are filed under Mayank
      </text>
    </svg>
  )
}

// 5 — the escalation ladder, in plain terms. Drawn as stairs because the cost really does
// climb, and the brackets underneath are the whole explanation of what the three modes are.
export function EffortDiagram() {
  const treads = [
    { x: 20, y: 190, title: 'Quick look', note: 'most photos end here' },
    { x: 250, y: 145, title: 'Look closer', note: 'small or distant faces' },
    { x: 480, y: 100, title: 'Try it sideways', note: 'photos saved rotated' },
    { x: 710, y: 55, title: 'Deep scan', note: 'slow, and the last resort' },
  ]
  const brackets = [
    { y: 250, to: 450, label: 'Fast' },
    { y: 278, to: 680, label: 'Balanced' },
    { y: 306, to: 910, label: 'Accurate' },
  ]
  return (
    <svg
      viewBox="0 0 1000 322"
      role="img"
      aria-label="A staircase of four increasingly expensive attempts to find a face. Fast uses the first two steps, Balanced adds a sideways attempt, and Accurate adds a slow deep scan. Each photo stops at the first step that finds a face."
    >
      <text x="20" y="22" fontSize="11.5" fill="var(--paper-dim)">
        Each photo stops at the first step that finds a face — most stop at step one.
      </text>
      <polyline
        points="20,244 230,244 230,199 460,199 460,154 690,154 690,109 920,109"
        fill="none"
        stroke="var(--line-firm)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      {treads.map((t, i) => {
        const last = i === treads.length - 1
        return (
          <g key={t.title}>
            <rect
              x={t.x}
              y={t.y}
              width="210"
              height="54"
              rx="6"
              fill={last ? IRIS_WASH : PANEL_2}
              stroke={last ? 'var(--iris)' : 'var(--line-firm)'}
            />
            <text x={t.x + 18} y={t.y + 25} fontSize="13" fill={last ? 'var(--iris)' : 'var(--phos-soft)'}>
              {t.title}
            </text>
            <text x={t.x + 18} y={t.y + 42} fontSize="10.5" fill="var(--paper-dim)">
              {t.note}
            </text>
          </g>
        )
      })}
      {brackets.map((b) => (
        <g key={b.label}>
          <path d={`M20 ${b.y} v8 H${b.to} v-8`} fill="none" stroke="var(--phos-dim)" strokeWidth="1.1" />
          <text x={b.to + 12} y={b.y + 12} fontSize="11.5" fill="var(--paper)">
            {b.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

// 6 — the load-bearing one. The claim is the absence of an edge, so the missing edge is what
// is drawn: a struck-through line, and beside it the one connection that does exist.
export function PrivacyDiagram() {
  const inside = [
    { x: 48, y: 112, title: 'Your photos', note: 'never copied off the disk' },
    { x: 306, y: 112, title: 'Local Lens', note: 'runs entirely offline' },
    { x: 48, y: 188, title: 'The faces you enrolled', note: '128 numbers, not pictures' },
    { x: 306, y: 188, title: 'A world map, bundled in', note: 'GPS to city, no lookup' },
  ]
  return (
    <svg
      viewBox="0 0 1010 292"
      role="img"
      aria-label="Your photos, the app, the enrolled faces and the map data all sit inside a boundary marked your computer. Photos, names and places never cross it; the only thing that goes out is a check for a new version."
    >
      <defs>
        <marker id="how-pv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--phos)" />
        </marker>
      </defs>

      <rect x="20" y="60" width="560" height="220" rx="10" fill={PANEL_2} stroke="var(--phos-mid)" strokeWidth="1.6" />
      <text x="44" y="90" fontSize="11" letterSpacing="1.8" fill="var(--phos-mid)">YOUR COMPUTER</text>
      {inside.map((b) => (
        <g key={b.title}>
          <rect x={b.x} y={b.y} width="248" height="58" rx="5" fill="var(--panel)" stroke="var(--line-firm)" />
          <text x={b.x + 124} y={b.y + 26} textAnchor="middle" fontSize="12.5" fill="var(--phos-soft)">
            {b.title}
          </text>
          <text x={b.x + 124} y={b.y + 44} textAnchor="middle" fontSize="10.5" fill="var(--paper-dim)">
            {b.note}
          </text>
        </g>
      ))}

      <rect x="800" y="112" width="190" height="80" rx="40" fill="none" stroke="var(--paper-dim)" strokeWidth="1.3" strokeDasharray="5 5" />
      <text x="895" y="157" textAnchor="middle" fontSize="12.5" fill="var(--paper-dim)">The internet</text>

      <line x1="590" y1="150" x2="790" y2="150" stroke="var(--paper-dim)" strokeWidth="1.3" strokeDasharray="5 5" />
      <g stroke="var(--iris)" strokeWidth="2.6" strokeLinecap="round">
        <line x1="682" y1="142" x2="698" y2="158" />
        <line x1="698" y1="142" x2="682" y2="158" />
      </g>
      <text x="690" y="128" textAnchor="middle" fontSize="10.5" fill="var(--iris)">photos · names · places</text>
      <text x="690" y="176" textAnchor="middle" fontSize="10.5" fill="var(--iris)">never cross this line</text>

      <path d="M590 236 Q 700 236 791 197" fill="none" stroke="var(--phos)" strokeWidth="1.4" markerEnd="url(#how-pv-arrow)" />
      <text x="686" y="258" textAnchor="middle" fontSize="10.5" fill="var(--phos)">checks for a new version</text>
    </svg>
  )
}
