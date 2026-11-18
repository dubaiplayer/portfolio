import React from 'react'
import { Link } from 'react-router-dom'
// Self-import so the card can be reused outside the Work page (e.g. /experience)
// without silently rendering unstyled. Vite dedupes; Work.jsx keeps its import.
import './Work.css'

const STATUS_LABEL = {
  live: 'live',
  wip: 'in progress',
  archived: 'archived',
}

export const ProjectCard = ({ project, flash = false }) => {
  const { id, title, tagline, year, status, tech, links } = project

  return (
    <article
      className={`work_card${flash ? ' work_card_flash' : ''}`}
      id={`project-${id}`}
    >
      <header className="work_card_head">
        <h2 className="work_card_title">{title}</h2>
        <span className={`work_card_status work_card_status_${status}`}>
          {STATUS_LABEL[status] || status}
        </span>
      </header>

      <p className="work_card_meta">{year}</p>
      <p className="work_card_tagline">{tagline}</p>

      {tech?.length > 0 && (
        <ul className="work_card_tech">
          {tech.map((t) => (
            <li key={t} className="work_card_chip">{t}</li>
          ))}
        </ul>
      )}

      <footer className="work_card_links">
        {links?.page && (
          <Link to={links.page}>→ project page</Link>
        )}
        {links?.repo && (
          <a href={links.repo} target="_blank" rel="noopener noreferrer">↗ code</a>
        )}
        {links?.demo && (
          <a href={links.demo} target="_blank" rel="noopener noreferrer">↗ live</a>
        )}
        {links?.docs && (
          <a href={links.docs} target="_blank" rel="noopener noreferrer">↗ docs</a>
        )}
        {links?.writeup && (
          <a href={links.writeup} target="_blank" rel="noopener noreferrer">↗ write-up</a>
        )}
      </footer>
    </article>
  )
}
