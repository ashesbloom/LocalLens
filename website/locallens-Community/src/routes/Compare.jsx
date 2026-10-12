import { Link } from 'react-router-dom'
import { DocFoot, DocHead, Ext, Section } from './Doc.jsx'

// Every competitor cell links to the competitor's own page, fetched and read on 2026-10-12.
// A cell with no source gets cut, not guessed: a comparison page is only worth citing if every
// cell in it would survive the other side reading it.
const GOOGLE_FACES = 'https://support.google.com/photos/answer/6128838'
const GOOGLE_BACKUP = 'https://support.google.com/photos/answer/6193313'
const GOOGLE_STORAGE = 'https://support.google.com/googleone/answer/9312312'
const GOOGLE_ABOUT = 'https://www.google.com/photos/about/'
const APPLE_ML = 'https://machinelearning.apple.com/research/recognizing-people-photos'
const APPLE_ICLOUD = 'https://support.apple.com/en-us/108782'
const APPLE_PHOTOS = 'https://support.apple.com/photos'
const DIGIKAM_ABOUT = 'https://www.digikam.org/about/'
const DIGIKAM_FEATURES = 'https://www.digikam.org/about/features/'
const DIGIKAM_WIKI = 'https://en.wikipedia.org/wiki/DigiKam'

const ROWS = [
  {
    what: 'Where faces are recognised',
    ll: <Link to="/privacy">On your computer</Link>,
    google: <Ext href={GOOGLE_FACES}>By Google, from face models it creates when Face Groups is on</Ext>,
    apple: <Ext href={APPLE_ML}>On the device</Ext>,
    digikam: <Ext href={DIGIKAM_FEATURES}>On your computer, with optional downloaded models</Ext>,
  },
  {
    what: 'Are photos uploaded?',
    ll: <Link to="/privacy">Never</Link>,
    google: <Ext href={GOOGLE_BACKUP}>Yes, to your Google Account when backup is on</Ext>,
    apple: <Ext href={APPLE_ICLOUD}>Yes, to iCloud when iCloud Photos is on</Ext>,
    digikam: <Ext href={DIGIKAM_ABOUT}>No, it is not a cloud application</Ext>,
  },
  {
    what: 'Runs on',
    ll: <Link to="/download">macOS (Apple Silicon), Windows</Link>,
    google: <Ext href={GOOGLE_ABOUT}>Android, iOS, desktop and tablet</Ext>,
    apple: <Ext href={APPLE_PHOTOS}>Mac, iPhone, iPad, Apple TV, iCloud.com</Ext>,
    digikam: <Ext href={DIGIKAM_ABOUT}>Linux, Windows, macOS</Ext>,
  },
  {
    what: 'Storage limit',
    ll: 'Your own disk',
    google: <Ext href={GOOGLE_STORAGE}>15 GB free, shared with Gmail and Drive</Ext>,
    apple: <Ext href={APPLE_ICLOUD}>Uses your iCloud storage when iCloud Photos is on</Ext>,
    digikam: 'Your own disk',
  },
  {
    what: 'Licence',
    ll: <Ext href="https://github.com/ashesbloom/LocalLens">AGPL-3.0, open source</Ext>,
    google: 'Proprietary',
    apple: 'Proprietary',
    digikam: <Ext href={DIGIKAM_WIKI}>GPL-2.0-or-later, open source</Ext>,
  },
]

export default function Compare() {
  return (
    <div className="doc doc-lite">
      <DocHead kicker="Compare" title="A local alternative to Google Photos, and how it compares">
        LocalLens is a local alternative to Google Photos for one job: sorting a big folder of
        photos by date, place and face without uploading any of it. Here is how it compares
        with Google Photos, Apple Photos and digiKam, with every claim about them linked to
        their own documentation.
      </DocHead>

      <Section title="Is LocalLens a good alternative to Google Photos?">
        <p>
          Yes, if what you want from Google Photos is automatic grouping by face, place and
          date, and you would rather none of your photos left your computer. It is not a
          replacement for cloud backup or sharing: LocalLens organises folders on your own
          disk and has no online library.
        </p>
        <p>
          Google Photos groups faces using{' '}
          <Ext href={GOOGLE_FACES}>face models Google creates</Ext> once Face Groups is turned
          on, and its own help page notes those models may count as biometric data in some
          places. LocalLens builds its face data on your machine and{' '}
          <Link to="/privacy">never sends it anywhere</Link>.
        </p>
      </Section>

      <Section title="How do LocalLens, Google Photos, Apple Photos and digiKam compare?">
        <p>
          All four can recognise faces. They differ in where that happens, whether your
          library has to be uploaded, and which systems they run on.
        </p>
        <div className="doc-table wrap">
          <table>
            <thead>
              <tr>
                <th />
                <th>LocalLens</th>
                <th>Google Photos</th>
                <th>Apple Photos</th>
                <th>digiKam</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.what}>
                  <td>{r.what}</td>
                  <td>{r.ll}</td>
                  <td>{r.google}</td>
                  <td>{r.apple}</td>
                  <td>{r.digikam}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="How is LocalLens different from Apple Photos?">
        <p>
          Both recognise faces on your own device:{' '}
          <Ext href={APPLE_ML}>Apple says Photos runs this processing entirely locally</Ext>.
          The difference is where the result lives: LocalLens writes ordinary folders to your
          disk that any app, backup tool or operating system can open, and it runs on Windows
          as well as Mac.
        </p>
      </Section>

      <Section title="How is LocalLens different from digiKam?">
        <p>
          digiKam is a full photo manager with importing, editing and tagging, and{' '}
          <Ext href={DIGIKAM_FEATURES}>its face recognition also runs only on your computer</Ext>.
          LocalLens does one narrower job: it turns a messy folder into sorted folders by date,
          place or person, copying by default so your originals are never touched.
        </p>
        <p>
          If you want a long-term catalogue to edit and tag in, digiKam is built for that. If
          you want the folder itself sorted and then to get on with your day, that is what
          LocalLens is for.
        </p>
      </Section>

      <Section title="When is LocalLens the wrong choice?">
        <p>
          When you need your photos backed up off your computer or shared from a phone, a cloud
          service does that and LocalLens does not. It also has no build for Intel Macs or
          Linux yet, and it does not edit photos.
        </p>
      </Section>

      <DocFoot
        next={{
          to: '/download',
          title: 'Download LocalLens',
          blurb: 'Free for macOS on Apple Silicon and 64-bit Windows.',
        }}
      />
    </div>
  )
}
