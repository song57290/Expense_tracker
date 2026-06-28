import { useState, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Navbar from './Navbar.jsx'
import BottomNav from './BottomNav.jsx'
import Sidebar from './Sidebar.jsx'
import NotifySheet from './NotifySheet.jsx'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [topFade, setTopFade] = useState(false)
  const [botFade, setBotFade] = useState(true)
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => {
      const scrollY = window.scrollY
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      setTopFade(scrollY > 30)
      setBotFade(maxScroll > 0 && (maxScroll - scrollY) > 30)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    onScroll()
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) }
  }, [location.pathname])

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  return (
    <>
      <div className="top-fade d-lg-none" style={{ opacity: topFade ? 1 : 0 }} />
      <div className="bot-fade d-lg-none" style={{ opacity: botFade ? 1 : 0 }} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="page-wrap">
        <Navbar onMenuClick={() => setSidebarOpen(true)} />
        <div className="container-fluid px-3 px-lg-4">
          <Outlet />
          <div className="d-lg-none" style={{ height: 90 }} />
        </div>
      </div>
      <BottomNav />
      <NotifySheet />
    </>
  )
}
