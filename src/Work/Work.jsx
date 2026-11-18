import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import "./Work.css"
import { Navbar } from '../Components/Navbar/Navbar'
import { ProjectCard } from './ProjectCard'
import { sortedProjects } from '../data/projects'

export const Work = () => {
  const { hash } = useLocation()
  const [flashed, setFlashed] = useState(null)
  const items = sortedProjects()

  /* The chatbot cites projects as /work#project-<id>. Without this the visitor
     lands at the top of the page and has to hunt for the card that was cited. */
  useEffect(() => {
    const match = /^#project-(.+)$/.exec(hash || '')
    if (!match) return

    const id = match[1]
    const el = document.getElementById(`project-${id}`)
    if (!el) return

    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setFlashed(id)
    const t = setTimeout(() => setFlashed(null), 1200)
    return () => clearTimeout(t)
  }, [hash])

  return (
    <div className="work_page">
      <Navbar />

      <header className="work_hero">
        <p className="work_kicker">03 //work</p>
        <h1 className="work_title work_fadeIn">Things I've built.</h1>
      </header>

      <main className="work_grid">
        {items.map((p) => (
          <ProjectCard key={p.id} project={p} flash={flashed === p.id} />
        ))}
      </main>
    </div>
  )
}
