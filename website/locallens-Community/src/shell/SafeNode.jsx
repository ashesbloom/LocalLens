// Renders the plain-object tree that postHtml.js (blog HTML) and markdown.js (post bodies)
// both produce — never dangerouslySetInnerHTML, which appears nowhere in this codebase.
//
// This component makes no trust decisions. Every tag and every attribute reaching it has
// already been decided by whichever parser built the tree: postHtml.js by allowlist,
// markdown.js by construction. Keeping that judgment out of here is deliberate — one
// renderer with no policy in it cannot disagree with itself about what is safe.
//
// It lives in shell/ rather than inside a route because two routes now draw the same trees:
// Article.jsx for blog posts and PostFeed.jsx for the community board.

// Void elements get no children prop at all — not even an empty array, which react-dom warns
// about.
const VOID_TAGS = new Set(['br', 'hr', 'img'])

export function SafeNode({ node }) {
  if (typeof node === 'string') return node
  const { tag, attrs, children } = node
  const Tag = tag
  if (VOID_TAGS.has(tag)) {
    return <Tag {...(tag === 'img' ? { loading: 'lazy', ...attrs } : attrs)} />
  }
  return (
    <Tag {...attrs}>
      {children.map((child, i) => (
        <SafeNode key={i} node={child} />
      ))}
    </Tag>
  )
}

export function SafeNodes({ nodes }) {
  return nodes.map((node, i) => <SafeNode key={i} node={node} />)
}
