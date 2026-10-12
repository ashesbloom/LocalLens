import { Link } from 'react-router-dom'
import Announce from './Announce.jsx'
import { AGENT } from '../data/products.js'
import { track } from '../data/analytics.js'

// /agent — LL Agent's community hub: what the MCP bridge is, how its three processes find
// each other, what leaves the machine, and what it has shipped.
//
// This was an outbound link to the agent's product site until this board became the common
// channel for both products. It is one page rather than a /how + /pipeline pair because the
// photo engine is LocalLens', not the agent's: /pipeline already documents the detection
// ladder and the write path, and restating 85KB of it here under a second name would mean
// two copies to keep true. The link at the bottom hands that over instead.
//
// Every number and path below was read out of locallens_mcp_agent's source, not its README,
// because the two have disagreed:
//   · the five Pro features, and their wording, are taken from the live pricing page at
//     www.locallens.in/pricing — that page is what Pro actually sells, and it is the thing
//     a reader can check this against. They cover nine of the ten Pro-gated tools; the
//     tenth (album suggestions) is registered but unfinished and deliberately unpromoted,
//     per locallensmcp/marketing/POSITIONING.md.
//   · 26 tools, 16 free / 10 Pro — the @mcp.tool and @require_pro decorators in
//     src/mcp_server/tools/*.py, counted by parsing them. A circulating "15 free / 11 Pro"
//     was wrong, and so was the claim that start_find_group is Pro-gated; it is not, and
//     tools/actions.py says outright that nothing in that module is.
//   · http://127.0.0.1:<port> — src/mcp_server/config.py
//   · ~/.config/LocalLens/port.txt — src/tray/status.py (PORT_FILE)
//   · 7-day re-check, 14-day offline grace, 3 machines per key — src/mcp_server/license.py
//     (_RECHECK_EVERY, _OFFLINE_GRACE); activation posts {license_key, name: <hash>},
//     the re-check {license_key, license_key_instance_id}
//   · update check: GET version.json from raw.githubusercontent.com, User-Agent only,
//     24h disk cache — src/mcp_server/updater.py, called by check_app_status and
//     locallens_help('whats_new') in tools/status.py

function Section({ kicker, title, children }) {
  return (
    <section className="doc-sec">
      <div className="doc-sec-head">
        {kicker ? <span className="doc-idx">{kicker}</span> : null}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  )
}

export default function Agent() {
  return (
    <div className="doc doc-lite">
      <header className="doc-head">
        <span className="lbl doc-kicker">LL Agent</span>
        <h1 className="h1">Sort your photos by asking</h1>
        <p className="doc-sub">
          LL Agent is a small bridge between an AI assistant and the copy of LocalLens already
          running on your computer. You type “find the photos of Mum from last Christmas” into
          Claude; the agent turns that into the same job the app would have run. Your photos
          never go anywhere — the assistant sends instructions in, not pictures out.
        </p>
        <div className="doc-specs">
          <div className="doc-spec">
            <b>26</b>
            <span>tools it can run</span>
          </div>
          <div className="doc-spec">
            <b>16</b>
            <span>of them free, 10 Pro</span>
          </div>
          <div className="doc-spec">
            <b>127.0.0.1</b>
            <span>where every photo job goes</span>
          </div>
        </div>
        <a
          className="doc-aside"
          href={AGENT.siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('agent_site_click', { from: 'agent' })}
        >
          <span className="lbl">Want to install it?</span>
          <span className="doc-aside-title">Downloads and pricing →</span>
          <span className="doc-aside-note">the agent's own site — this page is the community side</span>
        </a>
      </header>

      <Section kicker="The short version" title="Three programs, one conversation">
        <div className="doc-prose">
          <p>
            Nothing new sorts your photos here. LocalLens still does the work; the agent only
            carries the request. There are three programs involved, and each one only talks to
            the next.
          </p>
        </div>
        <pre className="doc-pre">
          <code>
            Claude Desktop <span className="c">— you type here</span>{'\n'}
            {'    │'}{'\n'}
            {'    │'}  <span className="c"># MCP over stdin/stdout, no network</span>{'\n'}
            {'    ▼'}{'\n'}
            locallens-mcp <span className="c">— the agent: 26 tools</span>{'\n'}
            {'    │'}{'\n'}
            {'    │'}  <span className="c"># http://127.0.0.1:&lt;port&gt;</span>{'\n'}
            {'    ▼'}{'\n'}
            LocalLens <span className="c">— the app that reads your folders</span>
          </code>
        </pre>
        <div className="doc-prose">
          <p>
            Claude Desktop starts the agent itself, as a child process, and the two speak down
            the pipe between them. That is worth saying plainly because it is the part people
            assume is a server: <strong>the agent does not listen on a port and nothing can
            connect to it</strong>. It exists only while your assistant is running it.
          </p>
        </div>
      </Section>

      <Section kicker="Step one" title="How it finds your copy of LocalLens">
        <div className="doc-prose">
          <p>
            LocalLens picks a free port when it starts and writes the number into a small file
            in its own config directory. The agent reads that file, and talks to the app on the
            loopback address only.
          </p>
        </div>
        <pre className="doc-pre">
          <code>
            <span className="c"># what the app wrote down</span>{'\n'}
            ~/.config/LocalLens/port.txt{'\n'}
            {'\n'}
            <span className="c"># where the agent therefore sends its requests</span>{'\n'}
            http://127.0.0.1:&lt;port&gt;
          </code>
        </pre>
        <div className="doc-prose">
          <p>
            So LocalLens has to be installed and running for any of this to do anything — the
            agent is a translator, not a second copy of the app. If the file is missing or the
            port has gone stale, the tools say so rather than guessing.
          </p>
        </div>
        <div className="doc-note">
          <span className="lbl">one-time setup</span>
          <p>
            <code>locallens-mcp --setup-claude</code> writes the agent into Claude Desktop's
            config for you, and <code>--claude-status</code> prints whether it took. After that
            you restart Claude once and the tools appear in its panel.
          </p>
        </div>
      </Section>

      <Section kicker="Step two" title="What you can actually ask for">
        <div className="doc-prose">
          <p>
            Twenty-six tools, and the split between free and Pro is not about how much you use
            it — it is about which jobs. Everything needed to look at a library and sort it is
            free, permanently. Pro covers the jobs that run repeatedly or delete things.
          </p>
        </div>
        <div className="doc-table">
          <table>
            <thead>
              <tr>
                <th>Tier</th>
                <th>How many</th>
                <th>What it covers</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Free</td>
                <td>16</td>
                <td>
                  Sorting by date, place or person; filtering a library down to one person in
                  one city in one year; folder analysis; job progress and cancelling; saved
                  paths; checking the app is healthy.
                </td>
              </tr>
              <tr>
                <td>Pro</td>
                <td>10</td>
                <td>
                  Face enrolment in batches; duplicate detection and cleanup; export reports;
                  scheduled auto-organize; folder watching.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="doc-prose">
          <p>
            Those five are what{' '}
            <a href={AGENT.pricingUrl} target="_blank" rel="noopener noreferrer">
              Pro sells
            </a>
            . Two units are in play and they are easy to confuse: the <em>tools</em> are what
            the assistant can call, and the <em>features</em> are what you buy. Nine of the ten
            Pro-gated tools make up those five features — scheduling alone is four of them — and
            the tenth is registered but not finished, so it is not advertised and not counted
            as something Pro gives you.
          </p>
          <p>
            If you installed LL Agent during the free preview, Pro stays on for you
            permanently and there is nothing to enter. The{' '}
            <a href={`${AGENT.repoUrl}#free-vs-pro`} target="_blank" rel="noopener noreferrer">
              repository's README
            </a>{' '}
            lists all twenty-six by name.
          </p>
        </div>
      </Section>

      <Section kicker="Step three" title="What leaves your machine">
        <div className="doc-prose">
          <p>
            No photo, no file path and no piece of metadata is sent anywhere. The agent uses
            the network for two things, both there to keep it working for you: checking for
            updates, and checking a Pro licence. Here is precisely what each one sends.
          </p>
          <p>
            <strong>The update check</strong> downloads one small public file,{' '}
            <code>version.json</code>, from <code>raw.githubusercontent.com</code>, so the
            assistant can tell you when a new version is out. It sends nothing about you — the
            only thing in the request is which version you are running:
          </p>
        </div>
        <pre className="doc-pre">
          <code>
            GET version.json{'\n'}
            User-Agent: locallens-mcp/&lt;version&gt;
          </code>
        </pre>
        <div className="doc-prose">
          <p>
            It happens when you ask whether LocalLens is running or what is new, at most once a
            day — the answer is cached on disk for 24 hours. If you are offline it is skipped
            silently and nothing else changes.
          </p>
          <p>
            <strong>The licence check</strong> only happens if you activate a Pro key. At
            activation it sends:
          </p>
        </div>
        <pre className="doc-pre">
          <code>
            {'{'}{'\n'}
            {'  '}<span className="k">"license_key"</span>: <span className="s">"the key you pasted"</span>,{'\n'}
            {'  '}<span className="k">"name"</span>:        <span className="s">"an anonymous hash of this computer"</span>{'\n'}
            {'}'}
          </code>
        </pre>
        <div className="doc-prose">
          <p>
            The hash exists so one key's three machines can be told apart. It is not your
            hostname and it is not reversible. A subscription then re-checks about{' '}
            <strong>once a week</strong>, sending the key and the activation id the licence
            server handed back — not the hash again — and keeps working for{' '}
            <strong>fourteen days</strong> if you are offline. A founding-user key makes{' '}
            <strong>one</strong> licence request ever, at activation, and never re-checks.
          </p>
          <p>
            Beyond those two, the free tools make no network request. Neither does sorting,
            searching or reading your folders — that is all LocalLens, on your own disk.
          </p>
        </div>
      </Section>

      <Link className="doc-next" to="/pipeline">
        <span className="lbl">The part that does the work</span>
        <span className="doc-next-title">Inside the Pipeline →</span>
        <p>
          The agent hands every job to LocalLens, so the interesting engineering is there, not
          here: the face-detection ladder pass by pass, the encoding cache, the write path, and
          the measured numbers behind each decision.
        </p>
      </Link>

      <p className="echo">
        locallens@community:~$ <b>cat ll-agent/CHANGELOG.md</b>
      </p>

      {/* The same release machinery /announce uses, pointed at the agent's own changelog.
          Its roadmap is off: roadmap.json is LocalLens' roadmap, and showing it here would
          attribute the wrong plans to the wrong product. */}
      <Announce product={AGENT} showRoadmap={false} />

      <div className="doc-foot">
        <Link to="/">← home</Link>
        <span className="sep">·</span>
        <Link to="/post">report an LL Agent bug</Link>
        <span className="sep">·</span>
        <span>
          press <kbd>←</kbd> <kbd>→</kbd> for the next section, or <kbd>?</kbd> for every key
        </span>
      </div>
    </div>
  )
}
