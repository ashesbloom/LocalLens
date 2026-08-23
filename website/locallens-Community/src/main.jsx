import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/tokens.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <div>LocalLens Community — coming soon.</div>
    </BrowserRouter>
  </StrictMode>,
)
