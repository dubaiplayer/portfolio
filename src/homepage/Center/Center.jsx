import React from 'react'
import "./Center.css"

export const Center = () => {

  return (
    <div>
      <h3 id="subheading" className='fadeIn'>Hi my name is Devesh,</h3>
      <h1 id="title" className='fadeIn'>And I like to code.</h1>

      <div className="wrapper">
        <div className="box-area">
          <div className="box box-front"></div>
          <div className="box box-right"></div>
          <div className="box box-back"></div>
          <div className="box box-left"></div>
          <div className="box box-top"></div>
          <div className="box box-front"></div>
        </div>
      </div>

    </div>
  )
}
