import { useState } from 'react'
import "./App.css"
import { Navbar } from "./Components/Navbar/Navbar.jsx"
import { Left } from "./Components/Left/Left.jsx"

function App() {
 

  return (
    <div className="App">
      <Navbar></Navbar>
      <Left></Left>
    </div>
  )
}

export default App
