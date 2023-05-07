import React from 'react'
import Github from "../../assets/github.png"
import Email from "../../assets/email.png"
import Youtube from "../../assets/youtube.png"
import Line from "../../assets/line.png"
import "./Left.css"

export const Left = () => {
  return (
    <div className="left">
          <div className="icon_container">
            <div className="github_icon">
                <img src={ Github }></img>
            </div>
            <div className="email_icon">
                <img src={ Email }></img>
            </div>
            <div className="youtube_icon">
                <img src={ Youtube }></img>
            </div>
            <div>
              <img src={ Line } className="leftLine"></img>
            </div>
            </div>
    </div>
 
  )
}
