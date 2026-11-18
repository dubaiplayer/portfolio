import React from 'react'
import { Link } from 'react-router-dom'
import "./Expertise.css"
import { Navbar } from '../Components/Navbar/Navbar'
import { profile } from '../data/profile'
import { evidenceFor, unclaimedTech } from '../data/expertise'

/**
 * Skills, with the receipts.
 *
 * `profile.skills` is the hand-authored source of truth (see the reasoning in
 * src/data/expertise.js) — this page only iterates it, so adding a group there
 * needs no change here. What the page adds is evidence: each skill links to the
 * projects that demonstrate it, using the same /work#project-<id> anchors the
 * chatbot cites, so a claim is always one click from proof.
 */

const GROUP_LABEL = {
  languages: 'Languages',
  frameworks: 'Frameworks',
  tools: 'Tools',
}

const label = (k) => GROUP_LABEL[k] || k.charAt(0).toUpperCase() + k.slice(1)

const SkillGroup = ({ group, items }) => {
  if (!items?.length) return null

  return (
    <section className="xp_group">
      <h2 className="xp_h2">{label(group)}</h2>
      <ul className="xp_list">
        {items.map((skill) => {
          const evidence = evidenceFor(skill)
          return (
            <li className="xp_row" key={skill}>
              <span className="xp_skill">{skill}</span>
              {evidence.length > 0 && (
                <span className="xp_evidence">
                  {evidence.map((p, i) => (
                    <React.Fragment key={p.id}>
                      {i > 0 && ', '}
                      <Link to={`/work#project-${p.id}`}>{p.title}</Link>
                    </React.Fragment>
                  ))}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export const Expertise = () => {
  const groups = Object.entries(profile.skills || {}).filter(([, v]) => v?.length)
  const hasGroups = groups.length > 0

  return (
    <div className="xp_page">
      <Navbar />

      <header className="xp_hero">
        <p className="xp_kicker">02 //expertise</p>
        <h1 className="xp_title dg_fadeIn">What I work with.</h1>
      </header>

      <main className="xp_main">
        {groups.map(([group, items]) => (
          <SkillGroup key={group} group={group} items={items} />
        ))}

        {/* Technology that ships in a project but isn't claimed above. Shown
            rather than hidden: it's demonstrable work, and omitting it is how a
            portfolio quietly understates itself. `yarn ingest:check` warns
            about every entry here so the list is meant to shrink over time. */}
        {unclaimedTech.length > 0 && (
          <section className="xp_group">
            <h2 className="xp_h2">
              {hasGroups ? 'Also used in my projects' : 'Used in my projects'}
            </h2>
            <ul className="xp_chips">
              {unclaimedTech.map(({ tech }) => (
                <li key={tech} className="dg_chip dg_chip_muted">{tech}</li>
              ))}
            </ul>
            <p className="xp_note">
              Pulled from the projects on the <Link to="/work">work page</Link>.
            </p>
          </section>
        )}
      </main>
    </div>
  )
}
