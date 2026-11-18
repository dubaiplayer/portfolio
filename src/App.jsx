import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css"
import { Expertise } from "./Expertise/Expertise"
import { Homepage } from './homepage/Homepage'
import { Work } from "./Work/Work"
import { Experience } from "./Experience/Experience"
import { Contact } from "./Contact/Contact"
import { PhishingNet } from "./PhishingNet/PhishingNet"
import { ChatWidget } from "./Components/Chat/ChatWidget"

function App() {
 
  const Routing = () => {
    return(
      <Routes>
      <Route path="/" index={true} element={<Homepage />} />
      <Route path="/expertise" index={true} element={<Expertise />} />
      <Route path="/work" index={true} element={<Work />} />
      <Route path="/experience" index={true} element={<Experience />} />
      <Route path="/contact" index={true} element={<Contact />} />
      <Route path="/phishingnet" element={<PhishingNet />} />
    </Routes>
    )
  }
  return (
    <BrowserRouter>
    <Routing />
    {/* Outside <Routes> so the widget never unmounts on navigation — the
        conversation survives route changes with no extra persistence code.
        Inside <BrowserRouter> so citation chips can use <Link>. */}
    <ChatWidget />
    </BrowserRouter>
  )
}

export default App
