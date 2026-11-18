import React from 'react'
import "./Contact.css"
import { Navbar } from '../Components/Navbar/Navbar'
import { profile } from '../data/profile'

/**
 * Every link is guarded on its own data, following the pattern in
 * homepage/Left/Left.jsx: a null in profile.links renders nothing rather than a
 * dead anchor. So filling in `linkedin` later lights this page up with no edit.
 */
export const Contact = () => {
  const { github, linkedin } = profile.links || {}

  return (
    <div className="contact_page">
      <Navbar />

      <header className="contact_hero">
        <p className="contact_kicker">05 //contact</p>
        <h1 className="contact_title dg_fadeIn">Get in touch.</h1>
        {profile.availability && (
          <p className="contact_availability">{profile.availability}</p>
        )}
      </header>

      <main className="contact_body">
        <a className="contact_primary" href={`mailto:${profile.email}`}>
          {profile.email}
        </a>

        <ul className="contact_links">
          {github && (
            <li>
              <a href={github} target="_blank" rel="noopener noreferrer">↗ GitHub</a>
            </li>
          )}
          {linkedin && (
            <li>
              <a href={linkedin} target="_blank" rel="noopener noreferrer">↗ LinkedIn</a>
            </li>
          )}
        </ul>
      </main>
    </div>
  )
}
