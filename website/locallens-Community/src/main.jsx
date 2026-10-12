import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
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
import './styles/tokens.css'
import './styles/shell.css'
import './styles/home.css'
import './styles/announce.css'
import './styles/blog.css'
import './styles/article.css'
import './styles/doc.css'
import './styles/post.css'
import './styles/contact.css'
import './styles/keys.css'

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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
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
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
