import { NavLink } from 'react-router-dom'
import { track } from '../data/analytics.js'
import { NAV_ITEMS } from './commands.js'

// Inline SVG icons, lifted stroke-for-stroke from the approved artboard (Main.dc.html).
// Decorative only — the label text beside each carries the meaning — so each is aria-hidden.
const ICONS = {
  post: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 3h10v7H6l-3 3v-3H2z" />
    </svg>
  ),
  announce: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 5.5v3h2.5L9 11.5v-9L4.5 5.5H2z" />
      <path d="M11 5.2a3 3 0 010 3.6" />
    </svg>
  ),
  blog: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 2.5h4a2 2 0 012 2v7a1.6 1.6 0 00-1.6-1.6H2z" />
      <path d="M12 2.5H8a2 2 0 00-2 2v7a1.6 1.6 0 011.6-1.6H12z" />
    </svg>
  ),
  // A folder with photos going into it — the walkthrough is "what happens to your photos".
  how: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.8 11V4h3.4l1.1 1.4h5.9V11z" />
      <circle cx="5.6" cy="8.2" r="1.05" />
      <path d="M7.4 9.9l1.5-1.7 1.4 1.6" />
    </svg>
  ),
  // Stacked stages with a line running through them — the pipeline.
  pipeline: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.6" y="2.3" width="4" height="3.1" rx="0.6" />
      <rect x="8.4" y="8.6" width="4" height="3.1" rx="0.6" />
      <path d="M5.6 3.85h3.2a1.6 1.6 0 011.6 1.6v3.15" />
      <path d="M8.4 10.15H5.2a1.6 1.6 0 01-1.6-1.6V5.4" />
    </svg>
  ),
  agent: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2.5" width="10" height="9" rx="1" />
      <path d="M4.6 6l1.6 1.4-1.6 1.4M7.6 9h2" />
    </svg>
  ),
  contact: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.8" y="3" width="10.4" height="8" rx="1" />
      <path d="M2 4l5 3.4L12 4" />
    </svg>
  ),
}

export default function Nav() {
  return (
    <nav className="nav" aria-label="Sections">
      {NAV_ITEMS.map((route) =>
        route.url ? (
          <a
            key={route.cmd}
            href={route.url}
            target="_blank"
            rel="noopener noreferrer"
            className="nav-item"
            onClick={() => track('agent_click', { from: 'nav' })}
          >
            {ICONS[route.icon]}
            <span>{route.label}</span>
          </a>
        ) : (
          <NavLink
            key={route.cmd}
            to={route.path}
            end
            className={({ isActive }) => `nav-item${isActive ? ' on' : ''}`}
          >
            {ICONS[route.icon]}
            <span>{route.label}</span>
          </NavLink>
        ),
      )}
    </nav>
  )
}
