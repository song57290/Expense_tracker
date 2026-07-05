import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import Calendar from './pages/Calendar.jsx'
import Stats from './pages/Stats.jsx'
import Budget from './pages/Budget.jsx'
import Categories from './pages/Categories.jsx'
import Edit from './pages/Edit.jsx'
import Login from './pages/Login.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  const [user, setUser] = useState(undefined)
  const [noticePopup, setNoticePopup] = useState(null)

  useEffect(() => {
    fetch('/api/me', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(d => setUser(d.user))
      .catch(() => setUser(null))
  }, [])

  useEffect(() => {
    const refresh = () => fetch('/api/me', { credentials: 'same-origin' }).then(r => r.json()).then(d => setUser(d.user)).catch(() => {})
    window.addEventListener('userUpdated', refresh)
    return () => window.removeEventListener('userUpdated', refresh)
  }, [])

  useEffect(() => {
    if (!user) return
    fetch('/api/notices', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(notices => {
        if (!notices.length) return
        const latest = notices[0]
        const seen = localStorage.getItem('notice_seen')
        if (String(latest.id) !== seen) setNoticePopup(latest)
      })
      .catch(() => {})
  }, [user])

  function dismissNotice() {
    if (noticePopup) localStorage.setItem('notice_seen', String(noticePopup.id))
    setNoticePopup(null)
  }

  if (user === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#b088f9,#7baff0)' }}>
        <div className="spinner-border" style={{ color: 'white', width: '2.5rem', height: '2.5rem' }} />
      </div>
    )
  }

  return (
    <BrowserRouter>
      {noticePopup && (
        <div onClick={dismissNotice} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', padding: '18px 20px 14px' }}>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.8)', marginBottom: 4 }}>📢 공지사항 · {noticePopup.created_at}</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'white' }}>{noticePopup.title}</div>
            </div>
            <div style={{ padding: '16px 20px', fontSize: '0.9rem', color: '#444', whiteSpace: 'pre-wrap', lineHeight: 1.7, maxHeight: '40vh', overflowY: 'auto' }}>
              {noticePopup.content}
            </div>
            <div style={{ padding: '0 20px 20px', display: 'flex', gap: 8 }}>
              <button onClick={dismissNotice} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1.5px solid #e8e8e8', background: 'white', color: '#aaa', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}>
                다시 안보기
              </button>
              <button onClick={() => setNoticePopup(null)} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login onLogin={setUser} />} />
        <Route element={user ? <Layout user={user} onLogout={() => setUser(null)} /> : <Navigate to="/login" replace />}>
          <Route path="/" element={<Home />} />
          <Route path="/cards" element={<Navigate to="/budget" replace />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/edit/:id" element={<Edit />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
