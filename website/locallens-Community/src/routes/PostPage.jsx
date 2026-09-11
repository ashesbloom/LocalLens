import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchPost, votePost } from '../data/posts.js'
import { Entry } from './PostFeed.jsx'

// /post/:id -- one post on its own page, so a bug report can be pasted into an issue or a
// chat and still be readable by someone who has never seen the board.
export default function PostPage() {
  const { id } = useParams()
  const [post, setPost] = useState(null)
  const [state, setState] = useState('loading')
  const [problem, setProblem] = useState(null)

  useEffect(() => {
    let live = true
    setState('loading')
    fetchPost(id)
      .then((found) => {
        if (!live) return
        setPost(found)
        setState('ready')
      })
      .catch((err) => {
        if (!live) return
        setProblem(err.message)
        setState('failed')
      })
    return () => {
      live = false
    }
  }, [id])

  // Entry hands back either a full post (after an edit) or a partial one (a reply count
  // bump) -- merged rather than swapped in, or the partial update would erase everything
  // else about the post on this, its only page.
  const onReplace = useCallback((updated) => {
    setPost((current) => (current ? { ...current, ...updated } : current))
  }, [])

  const onVote = useCallback(async (postId, value) => {
    try {
      const result = await votePost(postId, value)
      setPost((current) => (current ? { ...current, ...result } : current))
    } catch (err) {
      setProblem(err.message)
    }
  }, [])

  return (
    <div className="board">
      <p className="fd-back">
        <Link to="/post">← back to the board</Link>
      </p>

      {state === 'loading' ? <p className="fd-note">reading the board…</p> : null}

      {state === 'failed' ? (
        <p className="fd-note fd-bad" role="alert">
          {problem}
        </p>
      ) : null}

      {post ? (
        <Entry
          post={post}
          standalone
          onVote={onVote}
          onReplace={onReplace}
          onRemove={() => setPost(null)}
        />
      ) : null}

      {state === 'ready' && !post ? <p className="fd-note">That post is gone.</p> : null}
    </div>
  )
}
