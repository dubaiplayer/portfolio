import React from 'react'
import "./Navbar.css"
import { Link } from "react-router-dom";

export const Navbar = () => {
  return (
    <div className="navbar_container">
        <div className="navbar_topleftCTA">
            Devesh Gupta
        </div>
        <div className='navbar_subcontainer'>

        <Link to="/">
            <div className="navbar_element">
                <div className='navbar_element_top'>01</div>
                <div className='navbar_element_link'>//home</div>
            </div>
        </Link>

        <Link to="/expertise">
            <div className="navbar_element">
                <div className='navbar_element_top'>02</div>
                <div className='navbar_element_link'>//expertise</div>
            </div>
        </Link>

        <Link to="/work">
            <div className="navbar_element">
                <div className='navbar_element_top'>03</div>
                <div className='navbar_element_link'>//work</div>
            </div>
        </Link>

        <Link to="/experience">
            <div className="navbar_element">
                <div className='navbar_element_top'>04</div>
                <div className='navbar_element_link'>//experience</div>
            </div>
        </Link>

        <Link to="/contact">
            <div className="navbar_element">
                <div className='navbar_element_top'>05</div>
                <div className='navbar_element_link'>//contact</div>
            </div>
        </Link>
        </div>
    </div>
  )
}
