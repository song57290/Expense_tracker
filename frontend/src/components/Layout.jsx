import { useState, useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import Navbar from './Navbar.jsx'
import BottomNav from './BottomNav.jsx'
import Sidebar from './Sidebar.jsx'
import NotifySheet from './NotifySheet.jsx'

const NAV_PATHS = ['/', '/budget', '/calendar', '/stats', '/categories', '/settings']

export default function Layout({ user, onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [topFade, setTopFade] = useState(false)
  const [botFade, setBotFade] = useState(true)
  const [dragX, setDragX] = useState(0)
  const [animDir, setAnimDir] = useState(null)
  const location = useLocation()
  const navigate = useNavigate()
  const pageRef = useRef(null)
  const dragXRef = useRef(0)
  const swipe = useRef({ x: null, y: null, h: false })

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

  useEffect(() => { dragXRef.current = 0; setDragX(0) }, [location.pathname])

  useEffect(() => {
    const el = pageRef.current
    if (!el) return
    const getIdx = () => { const i = NAV_PATHS.indexOf(location.pathname); return i >= 0 ? i : 0 }

    function onTS(e) {
      if (document.body.classList.contains('sheet-open')) { swipe.current = { x: null, y: null, h: false }; return }
      const cx = e.touches[0].clientX
      const rect = el.getBoundingClientRect()
      const relX = cx - rect.left
      const isEdge = relX < 80 || relX > rect.width - 80
      const isNavZone = !!(e.target.closest && e.target.closest('.swipe-nav-zone'))
      const hasItemSwipe = !!(e.target.closest && e.target.closest('[data-item-swipe]'))
      const hasScrollX = !!(e.target.closest && e.target.closest('[data-scroll-x]'))
      swipe.current = { x: cx, y: e.touches[0].clientY, h: false, edge: (isEdge || isNavZone || !hasItemSwipe) && !hasScrollX }
    }
    function onTM(e) {
      const s = swipe.current
      if (s.x === null) return
      const dx = e.touches[0].clientX - s.x
      const dy = e.touches[0].clientY - s.y
      if (!s.h) {
        if (Math.abs(dx) < 8) { if (Math.abs(dy) > 18) { s.x = null; return } return }
        if (Math.abs(dy) > Math.abs(dx) * 1.5) { s.x = null; return }
        if (!s.edge) { s.x = null; return }
        s.h = true
      }
      const idx = getIdx()
      if ((dx > 0 && idx <= 0) || (dx < 0 && idx >= NAV_PATHS.length - 1)) return
      e.preventDefault()
      const clamped = Math.max(-window.innerWidth * 0.8, Math.min(window.innerWidth * 0.8, dx))
      dragXRef.current = clamped
      setDragX(clamped)
    }
    function onTE() {
      const s = swipe.current
      if (!s.h) { s.x = null; dragXRef.current = 0; setDragX(0); return }
      const w = window.innerWidth
      const idx = getIdx()
      const dx = dragXRef.current
      const threshold = w * 0.28
      if (dx < -threshold && idx < NAV_PATHS.length - 1) {
        setAnimDir('l'); navigate(NAV_PATHS[idx + 1])
      } else if (dx > threshold && idx > 0) {
        setAnimDir('r'); navigate(NAV_PATHS[idx - 1])
      }
      dragXRef.current = 0; setDragX(0)
      s.x = null; s.h = false
    }
    el.addEventListener('touchstart', onTS, { passive: true })
    el.addEventListener('touchmove', onTM, { passive: false })
    el.addEventListener('touchend', onTE, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTS)
      el.removeEventListener('touchmove', onTM)
      el.removeEventListener('touchend', onTE)
    }
  }, [location.pathname, navigate])

  return (
    <>
      <div className="top-fade d-lg-none" style={{ opacity: topFade ? 1 : 0 }} />
      <div className="bot-fade d-lg-none" style={{ opacity: botFade ? 1 : 0 }} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={onLogout} />
      <div ref={pageRef} className="page-wrap">
        <Navbar onMenuClick={() => setSidebarOpen(true)} nickname={user?.nickname} />
        {dragX !== 0 && (
          <div style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', opacity: Math.min(Math.abs(dragX) / window.innerWidth * 0.28, 0.2) }} />
        )}
        <div
          key={location.pathname}
          className={`container-fluid px-3 px-lg-4 ${animDir ? `route-slide-${animDir}` : 'route-anim'}`}
          onAnimationEnd={() => setAnimDir(null)}
          style={{
            minHeight: 'calc(100dvh - 170px)',
            transform: dragX ? `translateX(${dragX}px)` : undefined,
            transition: dragX ? 'none' : 'transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94)',
          }}
        >
          <Outlet />
          <div className="d-lg-none swipe-nav-zone" style={{ height: 90 }} />
        </div>
      </div>
      <div className="d-lg-none" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 'calc(16px + env(safe-area-inset-bottom))', background: '#f8f9fa', zIndex: 1001 }} />
      <BottomNav />
      <NotifySheet />
    </>
  )
}
