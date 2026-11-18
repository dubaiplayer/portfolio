import React from 'react'
import "./Right.css"
import Line from "../../assets/line.png"
import { profile } from "../../data/profile"

export const Right = () => {
  return (
    <div className="email_container">
    <div className="email_tag">{profile.email}</div>
    <img className="line" src={ Line } alt="" />
    </div>
  )
}
