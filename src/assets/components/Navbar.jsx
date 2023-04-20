import React from 'react'
import "./Navbar.css"

export const Navbar = () => {
  return (
    <div className="navbar_container">
        <div className="navbar_topleftCTA">
            Devesh Gupta
        </div>
        <div className='navbar_subcontainer'>
            <a href='' className="navbar_element">
                <div className='navbar_element_top'>01</div>
                <div className='navbar_element_link'>//home</div>
            </a>
            <a href='' className="navbar_element">
                <div className='navbar_element_top'>02</div>
                <div className='navbar_element_link'>//expertise</div>
            </a>
            <a href='' className="navbar_element">
                <div className='navbar_element_top'>03</div>
                <div className='navbar_element_link'>//work</div>
            </a>
            <a href='' className="navbar_element">
                <div className='navbar_element_top'>04</div>
                <div className='navbar_element_link'>//experience</div>
            </a>
            <a href='' className="navbar_element">
                <div className='navbar_element_top'>05</div>
                <div className='navbar_element_link'>//contact</div>
            </a>
        </div>
    </div>
  )
}
