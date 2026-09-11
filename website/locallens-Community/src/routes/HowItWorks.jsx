import { Link } from 'react-router-dom'
import {
  EffortDiagram,
  FaceMatchDiagram,
  FolderTreeDiagram,
  JourneyDiagram,
  ModesDiagram,
  OutcomesDiagram,
  PrivacyDiagram,
} from './HowDiagrams.jsx'

// /how — the walkthrough. Written for someone deciding whether to trust LocalLens with a
// folder of family photos, not for someone who will read the source.
//
// Everything here is checked against backend/. Three claims are worth flagging to anyone
// editing this page, because the intuitive version of each is wrong:
//   · Balanced is HOG-only — the fast passes plus two rotated ones. It does not use the CNN
//     and it does not inspect the machine. (backend/face_engine.py, LADDERS)
//   · Nothing is admitted to a job by Pillow; admission is a filename suffix test. Pillow
//     decodes, and reads EXIF. It never writes the sorted file.
//   · Copies are shutil.copy2 / clonefile(2); moves are shutil.move.
// The engineering page carries the detail — link at the bottom.

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

export default function HowItWorks() {
  return (
    <div className="doc doc-lite">
      <header className="doc-head">
        {/* The name this page is called everywhere else — the home card, the link back from
            /pipeline. Someone who clicked that phrase should land on it. */}
        <span className="lbl doc-kicker">Basic Understanding of LocalLens</span>
        <h1 className="h1">What happens to your photos</h1>
        <p className="doc-sub">
          You point LocalLens at a folder with a thousand photos in it. Here is every step it
          takes, in plain English — and where your pictures go while it works.
        </p>
        <div className="doc-specs">
          <div className="doc-spec">
            <b>19</b>
            <span>photo formats read</span>
          </div>
          <div className="doc-spec">
            <b>0</b>
            <span>photos sent anywhere</span>
          </div>
          <div className="doc-spec">
            <b>Copy</b>
            <span>is the default, always</span>
          </div>
        </div>
      </header>

      <Section kicker="The short version" title="Five things happen to every photo">
        <div className="doc-prose">
          <p>
            Every picture you give it goes down the same short path. Nothing is uploaded,
            nothing is compressed, and nothing inside the image itself is changed.
          </p>
        </div>
        <Figure w={1100}
          caption={
            <>
              The same five steps run whether you hand it fifty photos or fifty thousand.{' '}
              <b>Only step 5 writes anything to disk.</b>
            </>
          }
        >
          <JourneyDiagram />
        </Figure>
      </Section>

      <Section kicker="Step one" title="You decide what it looks at">
        <div className="doc-prose">
          <p>
            Before anything happens, it shows you what is actually inside the folder you
            picked — every subfolder, nested as deeply as they go, with a count of the photos
            it found.
          </p>
          <p>
            Untick anything you want left alone. Untick a folder and{' '}
            <strong>everything inside it comes off too</strong>, so you never have to click
            through thirty subfolders to exclude one branch.
          </p>
        </div>
        <Figure w={660} caption="The count at the top updates as you tick, so the number you see is exactly the number of photos the job will touch.">
          <FolderTreeDiagram />
        </Figure>
      </Section>

      <Section kicker="Step three" title="It reads what your camera already wrote">
        <div className="doc-prose">
          <p>
            Every photo carries a small block of notes your camera filled in the moment you
            pressed the shutter: the date and time, often the GPS position, the camera model.
            LocalLens reads those notes. It does not look at the picture and guess.
          </p>
          <p>
            That matters more than it sounds.{' '}
            <strong>The file's own date is usually wrong</strong> — copying photos off your
            phone, restoring a backup, or moving them between drives all rewrite it to today.
            The shutter date does not move. That is the one LocalLens sorts by.
          </p>
          <p>
            For places, it turns the GPS coordinates into a country, state and city using{' '}
            <strong>a map that ships inside the app</strong>. No lookup service, no network
            request, no account.
          </p>
        </div>
        <div className="doc-note">
          <span className="lbl">If the notes are missing</span>
          <p>
            A photo with no shutter date goes to <code>Unknown_Date</code> rather than being
            guessed at. No GPS means <code>Unknown_Location</code>. Nothing is quietly filed
            in the wrong place to make the output look tidier than it is.
          </p>
        </div>
      </Section>

      <Section kicker="Step four" title="Three ways to sort">
        <div className="doc-prose">
          <p>You pick one rule and it builds the folders to match. This is what you end up with:</p>
        </div>
        <Figure w={1100}
          caption={
            <>
              <b>With Others</b> is where a group photo lands — it appears under every enrolled
              person in it, so both people find it in their own folder.
            </>
          }
        >
          <OutcomesDiagram />
        </Figure>
        <div className="doc-prose">
          <p>
            That is the shape of one rule applied to everything. The same machinery has two
            other shapes, and they differ in what they leave behind:
          </p>
        </div>
        <Figure w={1100}
          caption={
            <>
              Under <b>Hybrid</b>, the set you pull aside is a copy — the base sort still
              contains every photo, so a matched picture is in two places on purpose. Nothing
              is removed from the ordinary folders to make the special one.
            </>
          }
        >
          <ModesDiagram />
        </Figure>
        <div className="doc-modes">
          <div className="doc-mode">
            <span className="lbl">Standard</span>
            <h4>One rule, everything</h4>
            <p>Sort the whole folder by date, place or person. The simple case.</p>
          </div>
          <div className="doc-mode">
            <span className="lbl">Hybrid</span>
            <h4>Pull one set aside</h4>
            <p>
              Give one person or one trip a folder of its own, named by you, while everything
              else still sorts normally underneath it.
            </p>
          </div>
          <div className="doc-mode">
            <span className="lbl">Find &amp; Group</span>
            <h4>Search, don&rsquo;t reorganise</h4>
            <p>Copy only what matches into a new folder. Your library is left exactly as it was.</p>
          </div>
        </div>
      </Section>

      <Section kicker="People" title="Sorting by person works differently">
        <div className="doc-prose">
          <p>
            Dates and places are already written into the file. A face is not — so you teach
            it first, once.
          </p>
          <p>
            You show it a handful of clear photos of someone and type their name. It finds the
            face in each one and reduces it to <strong>128 numbers</strong>, a kind of
            fingerprint. The photos you enrolled are not needed again after that.
          </p>
          <p>
            When you later sort by person, it does the same thing to every photo in your
            library and compares the numbers. Close enough means it is them.
          </p>
        </div>
        <Figure w={1100}
          caption={
            <>
              Enrolment happens once per person; finding them in a new batch costs nothing
              extra afterwards. <b>The 128 numbers cannot be turned back into a picture of
                anyone's face.</b>
            </>
          }
        >
          <FaceMatchDiagram />
        </Figure>

        <h3>How hard should it look?</h3>
        <div className="doc-prose">
          <p>
            Finding a face is not one operation — it is a series of increasingly expensive
            attempts. LocalLens tries the cheap ones first and{' '}
            <strong>stops the moment it finds a face</strong>, so an ordinary, well-lit photo
            never pays for the slow methods. The three modes choose how far down the list it
            is allowed to go.
          </p>
        </div>
        <Figure w={1000}
          caption={
            <>
              <b>Balanced is the default.</b> It adds the sideways attempt, which rescues
              photos your phone saved rotated — a surprisingly common reason a face gets
              missed. Accurate adds a much slower scan for faces that are small, turned away,
              or badly lit.
            </>
          }
        >
          <EffortDiagram />
        </Figure>
      </Section>

      <Section kicker="The part people ask about first" title="Nothing leaves your computer">
        <div className="doc-prose">
          <p>
            There is no upload step, because there is nowhere to upload to. The photos are
            already on your machine, the faces you trained live on your machine, and even the
            map used to turn GPS into a place name is bundled inside the app.
          </p>
        </div>
        <Figure w={1010}
          caption={
            <>
              The one thing that does go out is a version check, so the app can tell you an
              update exists. It carries nothing about your photos.{' '}
              <b>That is the complete list.</b>
            </>
          }
        >
          <PrivacyDiagram />
        </Figure>
      </Section>

      <Section kicker="Step five" title="Built so you cannot lose a photo">
        <div className="doc-prose">
          <p>
            The last step writes to your disk, which is the only step that could ever hurt. It
            is the one with the most safeguards on it.
          </p>
          <ul>
            <li>
              <strong>Copy is the default.</strong> Your originals stay where they are. Moving
              is opt-in and has to be chosen deliberately.
            </li>
            <li>
              <strong>Nothing is overwritten.</strong> If two photos would land on the same
              name, the second is renamed rather than replacing the first.
            </li>
            <li>
              <strong>Cancel puts it back.</strong> Stop a move halfway through and every file
              already moved is returned to where it came from, in reverse order.
            </li>
            <li>
              <strong>It checks there is room.</strong> Moving between drives measures the
              photos against the free space first, and refuses the job rather than filling the
              disk.
            </li>
            <li>
              <strong>Skipped stays skipped.</strong> Folders you unticked are never read,
              never copied and never deleted — even while the rest of the source folder is
              being cleaned up.
            </li>
            <li>
              <strong>Every job writes a log</strong> of what went where, saved alongside your
              sorted photos.
            </li>
          </ul>
        </div>
      </Section>

      <Section kicker="In short" title="The whole thing, start to finish">
        <div className="doc-prose">
          <p>
            You point LocalLens at a folder. It walks everything inside, including subfolders,
            and shows you the tree — untick any folder to skip it, and its subfolders come
            along. It picks up only real photo files: JPEG, PNG, HEIC from an iPhone, RAW from
            a camera, and a dozen more.
          </p>
          <p>
            Then it reads what the camera wrote into each photo. Sorting by date uses the
            moment the shutter fired, not the file's date, which is usually wrong after a
            backup. Sorting by place turns the GPS position into a country, state and city
            using a map that ships inside the app, so nothing about your photos ever leaves
            your machine.
          </p>
          <p>
            Sorting by person works differently: you first show it a few clear photos of
            someone and give them a name. It learns that face once, then goes through your
            library looking for them. Fast checks each photo quickly, Balanced also tries
            photos that were saved sideways, and Accurate adds a slower scan for faces that
            are small, turned away or in poor light. Photos it has already examined are
            remembered, so a second run is much quicker.
          </p>
          <p>
            Finally it builds the folders and copies your photos in — copy by default, move
            only if you ask. It never overwrites: a name clash gets renamed. And if you cancel
            a move halfway through, it puts everything back.
          </p>
        </div>
      </Section>

      <Link className="doc-next" to="/pipeline">
        <span className="lbl">Go deeper</span>
        <span className="doc-next-title">Inside the Pipeline →</span>
        <p>
          The same journey with the engineering shown: the detection ladder pass by pass, the
          encoding cache, the write path, and the measured numbers behind each decision.
        </p>
      </Link>

      <div className="doc-foot">
        <Link to="/">← home</Link>
        <span className="sep">·</span>
        <span>
          press <kbd>←</kbd> <kbd>→</kbd> for the next section, or <kbd>?</kbd> for every key
        </span>
      </div>
    </div>
  )
}
