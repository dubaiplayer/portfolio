import React from 'react'
import "./Homepage.css"
import { Navbar } from '../Components/Navbar/Navbar'
import { Left } from './Left/Left'
import { Right } from "./Right/Right"
import { Center} from "./Center/Center"

export const Homepage = () => {
  return (
    <div className="Home">
      <Navbar></Navbar>
      <Left></Left>
      <Right></Right>
      <Center></Center>
    </div>
  )
}
