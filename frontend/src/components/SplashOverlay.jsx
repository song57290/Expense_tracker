import { useEffect, useState } from 'react'
import splashIcon from '../assets/splash_icon.png'
import './SplashOverlay.css'

export default function SplashOverlay({ onFinish }) {
  const [hide, setHide] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => {
      setHide(true)
    }, 900)

    const t2 = setTimeout(() => {
      onFinish?.()
    }, 1250)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [onFinish])

    return (
    <div className={`splash ${hide ? 'hide' : ''}`}>
        <div
        style={{
            width: 190,
            height: 190,
            background: 'red'
        }}
        />
    </div>
    )
}