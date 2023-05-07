import { useState } from 'react'
import "./App.css"
import { Navbar } from "./Components/Navbar/Navbar.jsx"
import { Left } from "./Components/Left/Left.jsx"
import { Right } from "./Components/Right/Right.jsx"
import { Center} from "./Components/Center/Center.jsx"

function App() {
 

  return (
    <div className="App">
      <Navbar></Navbar>
      <Left></Left>
      <Right></Right>
      <Center></Center>
    </div>
  )
}

export default App
