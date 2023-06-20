import { useState } from 'react'
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css"
import { Expertise } from "./Expertise/Expertise"
import { Homepage } from './homepage/homepage'
import { Work } from "./Work/Work"
import { Experience } from "./Experience/Experience"
import { Contact } from "./Contact/Contact"

function App() {
 
  const Routing = () => {
    return(
      <Routes>
      <Route path="/" index={true} element={<Homepage />} />
      <Route path="/expertise" index={true} element={<Expertise />} />
      <Route path="/work" index={true} element={<Work />} />
      <Route path="/experience" index={true} element={<Experience />} />
      <Route path="/contact" index={true} element={<Contact />} />
    </Routes>
    )
  }
  return (
    <BrowserRouter>
    <Routing />
    </BrowserRouter>
  )
}

export default App
