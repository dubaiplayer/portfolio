import React from 'react'
import Github from "../../assets/github.png"
import Email from "../../assets/email.png"
import Youtube from "../../assets/youtube.png"
import Line from "../../assets/line.png"
import "./Left.css"
import { profile } from "../../data/profile"

export const Left = () => {
  return (
    <div className="left">
          <div className="icon_container">

          <a href={profile.links.github} target="_blank" rel="noopener noreferrer" aria-label="GitHub">
            <div className="github_icon">
                <img src={ Github } alt="" />
            </div>
          </a>

          <a href={`mailto:${profile.email}`} aria-label="Email">
            <div className="email_icon">
                <img src={ Email } alt="" />
            </div>
          </a>

            {/* Rendered as a link only once profile.links.youtube is set —
                previously this icon was decorative with nothing behind it. */}
            {profile.links.youtube ? (
              <a href={profile.links.youtube} target="_blank" rel="noopener noreferrer" aria-label="YouTube">
                <div className="youtube_icon">
                    <img src={ Youtube } alt="" />
                </div>
              </a>
            ) : null}

            <div>
              <img src={ Line } className="leftLine" alt="" />
            </div>
            </div>
    </div>

  )
}
