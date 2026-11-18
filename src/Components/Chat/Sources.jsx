import React from 'react'
import { Link } from 'react-router-dom'

const LABEL = { repo: '↗ code', demo: '↗ live', docs: '↗ docs', work: '→ details' }

/**
 * Citation chips.
 *
 * `kind: 'work'` renders as an internal <Link>, which is why the widget must be
 * mounted inside <BrowserRouter>. Every cited project gets one, so a citation
 * always has a landing place on this site rather than sending all the traffic
 * straight to GitHub. The Work page's hash effect scrolls to the card and
 * flashes it.
 */
export const Sources = ({ sources, onNavigate }) => {
  if (!sources?.length) return null

  return (
    <ul className="dgchat_sources" aria-label="Sources">
      {sources.map((s) => (
        <li key={`${s.id}:${s.kind}`}>
          {s.kind === 'work' ? (
            <Link className="dgchat_source" to={s.url} onClick={onNavigate}>
              {LABEL.work} {s.title}
            </Link>
          ) : (
            <a
              className="dgchat_source"
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {LABEL[s.kind] || s.kind}
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}
