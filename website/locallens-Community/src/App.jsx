import { Routes, Route, Link, useLocation } from 'react-router-dom'
import Frame from './shell/Frame.jsx'
import Home from './routes/Home.jsx'
import Post from './routes/Post.jsx'
import PostPage from './routes/PostPage.jsx'
import Announce from './routes/Announce.jsx'
import Blog from './routes/Blog.jsx'
import HowItWorks from './routes/HowItWorks.jsx'
import Pipeline from './routes/Pipeline.jsx'
import Article from './routes/Article.jsx'
import Contact from './routes/Contact.jsx'
import Download from './routes/Download.jsx'
import Privacy from './routes/Privacy.jsx'
import Faq from './routes/Faq.jsx'
import Compare from './routes/Compare.jsx'
import Stats from './routes/Stats.jsx'

// Catch-all 404 — same command-not-found styling CommandLine uses, plus a real link home.
function NotFound() {
  const { pathname } = useLocation()
  return (
    <>
      <p>zsh: command not found: {pathname} — try 'help'</p>
      <p>
        <Link to="/">cd ~</Link>
      </p>
    </>
  )
}

// The route tree, without a router around it. main.jsx wraps it in BrowserRouter for the
// browser; prerender.jsx wraps it in StaticRouter to write each page's HTML at build time.
export default function App() {
  return (
    <Routes>
      <Route element={<Frame />}>
        <Route path="/" element={<Home />} />
        <Route path="/post" element={<Post />} />
        <Route path="/post/:id" element={<PostPage />} />
        <Route path="/announce" element={<Announce />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:id" element={<Article />} />
        <Route path="/how" element={<HowItWorks />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/download" element={<Download />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
