import React from 'react'
import Github from "../../assets/github.png"
import Email from "../../assets/email.png"
import Youtube from "../../assets/youtube.png"
import "./Left.css"

export const Left = () => {
  return (
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
      <div className="line">
        
      </div>
    </div>
 
  )
}
