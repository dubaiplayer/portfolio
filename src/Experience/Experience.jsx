import React from 'react'
import { Link } from 'react-router-dom'
import "./Experience.css"
import { Navbar } from '../Components/Navbar/Navbar'
import { ProjectCard } from '../Work/ProjectCard'
import { profile, eduRange } from '../data/profile'
import { sortedProjects } from '../data/projects'

/**
 * The experience page for someone whose experience is not employment.
 *
 * Design rule: no padding, and no empty shells. `experience[]` is empty today,
 * so the honest structure is to say that in one sentence and then show the
 * evidence that does exist — education, shipped projects, and the FAQ. Every
 * section guards on its own data and returns null rather than rendering an
 * empty list, so this page needs no edit the day an internship lands: the work
 * section simply starts appearing.
 *
 * Everything here reads from profile.js / projects.js, which are the same
 * sources the retrieval index is built from — so the page and the chatbot
 * cannot tell a visitor two different stories.
 */

const Education = ({ items }) => {
  if (!items.length) return null
  return (
    <section className="exp_section" id="education">
      <h2 className="exp_h2">Education</h2>
      {items.map((e, i) => (
        <article className="exp_card" key={`${e.school}-${i}`}>
          <header className="exp_card_head">
            <h3 className="exp_card_title">{e.credential}</h3>
            <span className="exp_card_dates">{eduRange(e)}</span>
          </header>
          <p className="exp_card_meta">
            {e.school}{e.location ? ` — ${e.location}` : ''}
            {e.gpa ? ` · GPA ${e.gpa}` : ''}
          </p>
          {e.summary && <p className="exp_card_body">{e.summary}</p>}

          {e.coursework?.length > 0 && (
            <>
              <p className="exp_label">Relevant coursework</p>
              <ul className="exp_chips">
                {e.coursework.map((c) => (
                  <li key={c} className="dg_chip">{c}</li>
                ))}
              </ul>
            </>
          )}

          {e.highlights?.length > 0 && (
            <ul className="exp_bullets">
              {e.highlights.map((h) => <li key={h}>{h}</li>)}
            </ul>
          )}
        </article>
      ))}
    </section>
  )
}

/* Renders nothing while experience[] is empty — which is the point. */
const Work = ({ items }) => {
  if (!items.length) return null
  return (
    <section className="exp_section" id="work">
      <h2 className="exp_h2">Work</h2>
      {items.map((e, i) => (
        <article className="exp_card" key={`${e.company}-${i}`}>
          <header className="exp_card_head">
            <h3 className="exp_card_title">{e.role}</h3>
            <span className="exp_card_dates">{e.start} — {e.end || 'present'}</span>
          </header>
          <p className="exp_card_meta">{e.company}</p>
          {e.summary && <p className="exp_card_body">{e.summary}</p>}
          {e.highlights?.length > 0 && (
            <ul className="exp_bullets">
              {e.highlights.map((h) => <li key={h}>{h}</li>)}
            </ul>
          )}
        </article>
      ))}
    </section>
  )
}

const Projects = ({ items, total }) => {
  if (!items.length) return null
  return (
    <section className="exp_section" id="projects">
      <h2 className="exp_h2">Shipped projects</h2>
      <p className="exp_note">These are solo projects, not employment.</p>
      <div className="exp_grid">
        {items.map((p) => <ProjectCard key={p.id} project={p} />)}
      </div>
      {total > items.length && (
        <Link className="exp_more" to="/work">see all {total} projects →</Link>
      )}
    </section>
  )
}

const Faq = ({ items }) => {
  if (!items.length) return null
  return (
    <section className="exp_section" id="faq">
      <h2 className="exp_h2">Questions I get asked</h2>
      {items.map((f) => (
        <details className="exp_faq" key={f.q}>
          <summary className="exp_faq_q">{f.q}</summary>
          <p className="exp_faq_a">{f.a}</p>
        </details>
      ))}
    </section>
  )
}

export const Experience = () => {
  const education = profile.education || []
  const work = profile.experience || []
  const faq = profile.faq || []

  const all = sortedProjects()
  const featured = all.filter((p) => p.featured).slice(0, 3)

  const empty = !education.length && !work.length && !faq.length && !featured.length

  return (
    <div className="exp_page">
      <Navbar />

      <header className="exp_hero">
        <p className="exp_kicker">04 //experience</p>
        <h1 className="exp_title dg_fadeIn">Where I've done the work.</h1>

        {/* Stated rather than implied. An experience page that just omits the
            jobs section reads as an oversight; saying it plainly reads as
            honesty, and it is the same thing the chatbot tells visitors. */}
        {!work.length && education.length > 0 && (
          <p className="exp_lede">
            No jobs yet — I'm a student. Everything below is coursework and
            things I built and shipped myself.
          </p>
        )}

        {profile.availability && (
          <p className="exp_availability">{profile.availability}</p>
        )}
      </header>

      <main className="exp_main">
        {empty ? (
          <p className="exp_note">
            Still writing this page. In the meantime, the{' '}
            <Link to="/work">work page</Link> has what I've built, or email me at{' '}
            <a href={`mailto:${profile.email}`}>{profile.email}</a>.
          </p>
        ) : (
          <>
            <Education items={education} />
            <Work items={work} />
            <Projects items={featured} total={all.length} />
            <Faq items={faq} />
          </>
        )}
      </main>
    </div>
  )
}
