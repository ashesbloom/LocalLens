import { NavLink } from 'react-router-dom'
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
      {NAV_ITEMS.map((route) => (
        <NavLink
          key={route.cmd}
          to={route.path}
          end
          className={({ isActive }) => `nav-item${isActive ? ' on' : ''}`}
        >
          {ICONS[route.icon]}
          <span>{route.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
