import { useEffect, useRef, useState } from 'react'

// locallens_mcp_agent is a separate, standalone repo — not a subdirectory of this one (it is
// git-ignored here: .gitignore:238; its own README clones it as its own project). The brief's
// "canonical agent link" does not exist yet, so this — the real repo — is what we link to,
// not an invented product URL.
const REPO_URL = 'https://github.com/ashesbloom/locallens_mcp_agent'
const SETUP_URL = `${REPO_URL}/blob/main/docs/INSTRUCTIONS.md`

// Exact content of locallens_mcp_agent/claude_desktop_config.example.json, minus its
// "_comment" key (task-5-brief.md gives this exact nine-line block verbatim).
const CONFIG_JSON = `{
  "mcpServers": {
    "locallens": {
      "command": "locallens-mcp",
      "env": {
        "LOCALLENS_STORE_URL": "https://locallens.lemonsqueezy.com"
      }
    }
  }
}`

// Copies the config to the clipboard, confirms in place, and reverts after 2s. Falls back
// silently — leaving the <pre> text selectable — if the Clipboard API is unavailable or
// permission is denied. No toast system, no execCommand fallback (brief).
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  async function onClick() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API missing (insecure context, older browser) or permission denied —
      // the config text is still plain, selectable <pre> content either way.
    }
  }

  return (
    <button type="button" className="btn copy-btn" onClick={onClick}>
      {copied ? 'copied' : 'copy'}
    </button>
  )
}

export default function Agent() {
  return (
    <>
      <section className="band">
        <span className="pill up">overview</span>
        <p className="lede">
          LocalLens exposed as a standard MCP server — organise, search and clean up your photo
          library by asking Claude instead of clicking through folders. Every operation still
          runs on your machine. It works in Claude Desktop today.
        </p>
        <dl className="meta">
          <dt>protocol</dt>
          <dd>MCP (Model Context Protocol), over stdio</dd>
          <dt>works today in</dt>
          <dd>Claude Desktop</dd>
          <dt>licence</dt>
          <dd>BUSL-1.1 (agent) · AGPL-3.0 (app)</dd>
          <dt>repo</dt>
          <dd>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              github.com/ashesbloom/locallens_mcp_agent ↗
            </a>
          </dd>
        </dl>
      </section>

      <section className="band">
        <span className="pill up">install</span>
        <div className="install-block">
          <pre className="term">{CONFIG_JSON}</pre>
          <CopyButton text={CONFIG_JSON} />
        </div>
        <p className="lede">
          Drop this into your Claude Desktop config and restart Claude — LocalLens tools appear
          in the tool panel. Full walkthrough (Homebrew, manual install, running from source) in
          the{' '}
          <a href={SETUP_URL} target="_blank" rel="noopener noreferrer">
            setup guide ↗
          </a>
          .
        </p>
      </section>

      <section className="band">
        <span className="pill up">tools</span>
        <p className="lede">15 tools free, no licence required. 11 more with an active Pro licence — 26 in total.</p>
        <div className="rows">
          <div className="row">
            <span className="st">free</span>
            <div>
              <h5>15 tools — no licence required</h5>
              <p>
                status and progress (check_app_status, get_stats, get_job_progress) · folder ops
                (analyse_folder, start_sorting, abort_job, open_folder) · path presets
                (get_path_presets, remember_paths, forget_paths) · faces (get_enrolled_faces) ·
                licence (activate_pro_license, get_license_status, revoke_pro_license) · help
                (locallens_help)
              </p>
            </div>
          </div>
          <div className="row">
            <span className="st">pro</span>
            <div>
              <h5>11 tools — active Pro licence</h5>
              <p>
                face enrolment (add_face_enroll) · search (start_find_group) · duplicates
                (find_duplicates, delete_duplicates) · reporting (export_report) · automation
                (schedule_auto_organize, create_active_folder, list_schedules, manage_schedule,
                open_scheduler_dashboard) · smart albums (smart_album_suggestions)
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="band">
        <span className="pill up">verified</span>
        <div className="rows">
          <div className="row">
            <span className="st">licence</span>
            <div>
              <h5>Source-available, not open source</h5>
              <p>
                The MCP agent ships under the Business Source License 1.1 — source-available,
                not OSI open source. The LocalLens desktop app itself is AGPL-3.0.
              </p>
            </div>
          </div>
          <div className="row">
            <span className="st">network</span>
            <div>
              <h5>One call, at Pro activation</h5>
              <p>
                "Zero data leaves your machine" — except a one-time check with Lemon Squeezy when
                you activate a Pro licence. Everything else talks to LocalLens on localhost,
                nowhere else.
              </p>
            </div>
          </div>
          <div className="row">
            <span className="st">privacy</span>
            <div>
              <h5>Text, never photos</h5>
              <p>
                Counts, folder names, and the person names you enrolled — never image bytes. No
                photos are uploaded.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
