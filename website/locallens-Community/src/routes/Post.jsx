import { useState } from 'react'
import PostComposer from './PostComposer.jsx'
import PostFeed from './PostFeed.jsx'

// /post -- the community board. Composer on top, feed below, filters between them.
//
// The two halves stay separate components: the composer owns what is being written and the
// feed owns what has been read, and the only thing crossing between them is a post that just
// succeeded. Handing that down rather than refetching means the feed keeps its place.
export default function Post() {
  const [pending, setPending] = useState(null)

  return (
    <div className="board">
      <header className="board-head">
        <h1 className="h1">Post</h1>
        <p className="lede">
          Report a bug, ask for a feature, or say what you are using LocalLens for. Posts go
          up straight away and there is no account to make.
        </p>
      </header>

      <PostComposer onPosted={setPending} />
      <PostFeed pending={pending} />
    </div>
  )
}
