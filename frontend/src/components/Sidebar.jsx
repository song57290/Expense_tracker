import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import api from '../api.js'

const NAV = [
  { path: '/', icon: 'bi-house', label: '홈' },
  { path: '/budget', icon: 'bi-wallet2', label: '예산' },
  { path: '/calendar', icon: 'bi-calendar3', label: '캘린더' },
  { path: '/stats', icon: 'bi-pie-chart', label: '통계' },
  { path: '/categories', icon: 'bi-grid', label: '목록' },
  { path: '/settings', icon: 'bi-gear', label: '설정' },
]

function urlB64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4)
  const b64u = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64u)
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)))
}

export default function Sidebar({ open, onClose, user, onLogout }) {
  const [active, setActive] = useState(localStorage.getItem('notifyActive') === '1')
  const [time, setTime] = useState(localStorage.getItem('notifyTime') || '21:00')

  useEffect(() => {
    const sync = () => {
      setActive(localStorage.getItem('notifyActive') === '1')
      setTime(localStorage.getItem('notifyTime') || '21:00')
    }
    window.addEventListener('notifyStateChange', sync)
    return () => window.removeEventListener('notifyStateChange', sync)
  }, [])

  async function handleToggle() {
    if (active) {
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await api.post('/api/unsubscribe', { endpoint: sub.endpoint })
          await sub.unsubscribe()
        }
      } catch (e) { console.warn(e) }
      localStorage.setItem('notifyActive', '0')
      setActive(false)
    } else {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return alert('HTTPS로 접속해주세요.')
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return alert('알림 권한이 필요합니다.')
      try {
        const parts = time.split(':')
        const resp = await api.get('/api/vapid-public-key')
        const reg = await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        if (existing) await existing.unsubscribe()
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(resp.key) })
        const subJson = sub.toJSON()
        subJson.notify_hour = parseInt(parts[0])
        subJson.notify_minute = parseInt(parts[1])
        const r = await api.post('/api/subscribe', subJson)
        if (r.ok) { localStorage.setItem('notifyActive', '1'); setActive(true) }
        else alert('서버 오류가 발생했습니다.')
      } catch (e) { alert('오류: ' + e.message) }
    }
  }

  async function handleTimeChange(val) {
    setTime(val)
    localStorage.setItem('notifyTime', val)
    if (localStorage.getItem('notifyActive') !== '1') return
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const parts = val.split(':')
        const subJson = sub.toJSON()
        subJson.notify_hour = parseInt(parts[0])
        subJson.notify_minute = parseInt(parts[1])
        await api.post('/api/subscribe', subJson)
      }
    } catch (e) { console.warn(e) }
  }

  return (
    <>
      {open && <div onClick={onClose} style={{ display: 'block', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1500 }} />}
      <div className={`pc-sidebar ${open ? 'open' : ''}`}>
        <div style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'white', fontWeight: 700, fontSize: '1.05rem' }}>{user?.nickname || '나'}의 가계부</span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <div style={{ padding: '12px 8px' }}>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px 10px', marginBottom: 4 }}>
              <span style={{ fontSize: '0.78rem', color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{user.email}</span>
              <button onClick={async () => { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); onLogout() }}
                style={{ background: '#f0eeff', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: '0.75rem', color: '#b088f9', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                로그아웃
              </button>
            </div>
          )}
          {NAV.map(({ path, icon, label }) => (
            <NavLink key={path} to={path} className={({ isActive }) => `pc-sb-link${isActive ? ' active' : ''}`} onClick={onClose} end={path === '/'}>
              <i className={`bi ${icon}`} /><span>{label}</span>
            </NavLink>
          ))}
          <hr style={{ margin: '8px 4px', borderColor: '#f0f0f0' }} />
          <div style={{ padding: '4px 8px 8px' }}>
            <div style={{ background: '#f7f7f7', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '11px 14px' }}>
                <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#b088f9,#7baff0)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="bi bi-bell-fill" style={{ fontSize: '0.78rem', color: 'white' }} />
                </div>
                <span style={{ flex: 1, marginLeft: 10, fontSize: '0.88rem', fontWeight: 500 }}>알림</span>
                <div className="ios-toggle" onClick={handleToggle}>
                  <div className={`ios-track${active ? ' on' : ''}`} />
                  <div className={`ios-dot${active ? ' on' : ''}`} />
                </div>
              </div>
              {active && (
                <div style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid #ebebeb', padding: '11px 14px' }}>
                  <div style={{ width: 28, height: 28, background: '#f0eeff', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="bi bi-clock" style={{ fontSize: '0.78rem', color: '#b088f9' }} />
                  </div>
                  <span style={{ flex: 1, marginLeft: 10, fontSize: '0.88rem' }}>알림 시간</span>
                  <input type="time" value={time} onChange={e => handleTimeChange(e.target.value)}
                    style={{ border: 'none', background: 'transparent', color: '#b088f9', fontSize: '0.88rem', fontWeight: 600, outline: 'none', cursor: 'pointer', minWidth: 90 }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
