import { APP_VERSION } from '../data/version.js'
import { DocFoot, DocHead, Ext, RELEASES, Section, SRC } from './Doc.jsx'

const FORMATS = ['JPG', 'JPEG', 'PNG', 'GIF', 'BMP', 'TIFF', 'TIF', 'WebP', 'HEIC', 'HEIF', 'DNG', 'CR2', 'CR3', 'NEF', 'ARW', 'RAF', 'AVIF', 'PSD', 'HDR']

export default function Download() {
  return (
    <div className="doc doc-lite">
      <DocHead
        kicker="Install"
        title="Download LocalLens, the offline photo organizer"
        specs={[
          [`v${APP_VERSION}`, 'latest release'],
          ['Free', 'AGPL-3.0, no account'],
          [String(FORMATS.length), 'photo formats read'],
        ]}
      >
        LocalLens is a free, offline photo organizer for macOS on Apple Silicon and 64-bit
        Windows. Download it from the{' '}
        <Ext href={RELEASES}>latest GitHub release</Ext>; below is how to install it on each
        system, what it needs, and the one extra step macOS asks for.
      </DocHead>

      <Section title="How do I install LocalLens on a Mac?">
        <p>
          Download the <code>.dmg</code> from the <Ext href={RELEASES}>latest release</Ext>,
          drag Local Lens into Applications, then clear macOS's Gatekeeper block once. That
          step is needed because <strong>the app is not signed or notarised by Apple</strong>,
          so macOS refuses to open it until you tell it to.
        </p>
        <p>Any one of these clears the block:</p>
        <ul>
          <li>
            Double-click <code>Fix_Local_Lens.command</code> from the same release. If macOS
            blocks that too, run <code>bash ~/Downloads/Fix_Local_Lens.command</code>.
          </li>
          <li>Right-click Local Lens in Applications, choose Open, then Open again.</li>
          <li>Or paste this into Terminal:</li>
        </ul>
        <pre className="doc-pre">
          <code>xattr -cr "/Applications/Local Lens.app" &amp;&amp; codesign --force --deep --sign - "/Applications/Local Lens.app"</code>
        </pre>
        <p>
          Homebrew does the Gatekeeper step for you:{' '}
          <code>brew install ashesbloom/locallens/local-lens</code>. The Homebrew cask can trail
          the newest release by a few versions, so check the version it installs; the DMG on the
          release page is always the current one.
        </p>
      </Section>

      <Section title="How do I install LocalLens on Windows?">
        <p>
          Download <code>Local.Lens_{APP_VERSION}_x64-setup.exe</code> (or the <code>.msi</code>)
          from the <Ext href={RELEASES}>latest release</Ext> and run it. If the app reports a
          missing runtime on first launch, install the{' '}
          <Ext href="https://aka.ms/vs/17/release/vc_redist.x64.exe">
            Microsoft Visual C++ Redistributable (x64)
          </Ext>{' '}
          and open LocalLens again.
        </p>
      </Section>

      <Section title="Will LocalLens run on my computer?">
        <p>
          It runs on Macs with Apple Silicon (M1 and later) and on 64-bit Windows. Intel Macs
          and Linux have no build today; Linux is on the roadmap.
        </p>
        <div className="doc-table">
          <table>
            <thead>
              <tr>
                <th>System</th>
                <th>Supported</th>
                <th>Install with</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>macOS, Apple Silicon</td>
                <td>Yes</td>
                <td><code>.dmg</code> or Homebrew</td>
              </tr>
              <tr>
                <td>Windows, 64-bit</td>
                <td>Yes</td>
                <td><code>-setup.exe</code> or <code>.msi</code></td>
              </tr>
              <tr>
                <td>macOS, Intel</td>
                <td>No</td>
                <td>The macOS build is arm64 only</td>
              </tr>
              <tr>
                <td>Linux</td>
                <td>Not yet</td>
                <td>Planned; the backend already runs there</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          For libraries over about a thousand photos, 8 GB of RAM or more is recommended: face
          recognition is the memory-heavy part. Sorting by date or place alone needs far less.
        </p>
      </Section>

      <Section title="Which photo formats does LocalLens read?">
        <p>
          It reads {FORMATS.length} formats, including iPhone HEIC and camera RAW. A file is
          picked up by its extension, so videos and documents in the same folder are left
          alone.
        </p>
        <p>
          <code>{FORMATS.map((f) => f.toLowerCase()).join('  ')}</code>
        </p>
        <p>
          The list lives in{' '}
          <Ext href={`${SRC}/backend/face_engine.py#L75`}>backend/face_engine.py</Ext>.
        </p>
      </Section>

      <Section title="How do I update LocalLens?">
        <p>
          LocalLens checks GitHub for a newer release and offers to install it from inside the
          app. That check, and from the release after v3.1.0 a check for replies on the
          community board, are the only connections the app makes on its own; neither sends
          anything about your photos.
        </p>
      </Section>

      <DocFoot
        next={{
          to: '/how',
          title: 'What happens to your photos',
          blurb: 'Installed? Here is every step LocalLens takes with a folder, in plain English.',
        }}
      />
    </div>
  )
}
