import { useEffect, useState } from 'react'
import splashIcon from '../assets/splash_icon.png'
import './SplashOverlay.css'

export default function SplashOverlay({ onFinish, onReady, loading = false }) {
  const [hide, setHide] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      onReady?.()
    }, 50)

    return () => clearTimeout(t)
  }, [onReady])

  useEffect(() => {
    if (loading) return

    const t1 = setTimeout(() => setHide(true), 1800)
    const t2 = setTimeout(() => onFinish?.(), 2200)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [loading, onFinish])

  return (
    <div className={`splash ${hide ? 'hide' : ''}`}>
      <img src={splashIcon} alt="" className="splash-icon" />
    </div>
  )
}
