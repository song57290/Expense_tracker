import { NavLink } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import api from '../api.js'

const NAV = [
  { path: '/', icon: 'bi-house', label: '홈' },
  { path: '/budget', icon: 'bi-wallet2', label: '예산' },
  { path: '/calendar', icon: 'bi-calendar3', label: '캘린더' },
  { path: '/stats', icon: 'bi-pie-chart', label: '통계' },
  { path: '/categories', icon: 'bi-grid', label: '카테고리' },
  { path: '/settings', icon: 'bi-gear', label: '설정' },
]

function urlB64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4)
  const b64u = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64u)
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)))
}

function fmt12(t) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? '오후' : '오전'
  const hd = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${ampm} ${hd}:${String(m).padStart(2, '0')}`
}

function displayHour(h) {
  const n = parseInt(h)
  return n === 0 ? '12' : n === 12 ? '12' : String(n % 12)
}

const HOUR_ITEMS = Array.from({ length: 24 }, (_, i) => String(i))
const MIN_ITEMS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))
const ITEM_H = 40, PAD = 2

function AmPmDrum({ value, onChange }) {
  const totalH = ITEM_H * 5
  const selectedIdx = value === '오후' ? 1 : 0
  const containerTop = PAD * ITEM_H - selectedIdx * ITEM_H
  const touchStartY = useRef(null)
  const toggle = () => onChange(value === '오전' ? '오후' : '오전')

  return (
    <div
      style={{ position: 'relative', height: totalH, flex: 1, overflow: 'hidden', userSelect: 'none', cursor: 'pointer' }}
      onTouchStart={e => { touchStartY.current = e.touches[0].clientY }}
      onTouchEnd={e => { if (touchStartY.current === null) return; e.preventDefault(); toggle(); touchStartY.current = null }}
      onClick={toggle}
    >
      <div style={{ position: 'absolute', top: PAD * ITEM_H, left: 4, right: 4, height: ITEM_H, background: 'rgba(176,136,249,0.12)', borderRadius: 8, borderTop: '1px solid rgba(176,136,249,0.28)', borderBottom: '1px solid rgba(176,136,249,0.28)', pointerEvents: 'none', zIndex: 2 }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: PAD * ITEM_H, background: 'var(--drum-fade-down)', pointerEvents: 'none', zIndex: 3 }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: PAD * ITEM_H, background: 'var(--drum-fade-up)', pointerEvents: 'none', zIndex: 3 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: containerTop, transition: 'top 0.25s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
        {['오전', '오후'].map(item => (
          <div key={item} style={{ height: ITEM_H, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: item === value ? 700 : 400, color: item === value ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

function InfiniteDrum({ items, value, onChange, onWrap, renderItem }) {
  const N = items.length, COPIES = 9, MID = Math.floor(COPIES / 2)
  const ref = useRef(null), timerRef = useRef(null), busy = useRef(false), lastRawRef = useRef(null)
  const valIdx = Math.max(0, items.indexOf(value))

  useEffect(() => {
    if (!ref.current) return
    const targetPos = (MID * N + valIdx) * ITEM_H
    const currentPos = ref.current.scrollTop
    const diff = Math.abs(targetPos - currentPos)
    lastRawRef.current = MID * N + valIdx
    if (diff === 0) return
    if (diff <= ITEM_H * 3) {
      busy.current = true
      ref.current.scrollTo({ top: targetPos, behavior: 'smooth' })
      setTimeout(() => { busy.current = false }, 450)
    } else {
      busy.current = true
      ref.current.scrollTop = targetPos
      setTimeout(() => { busy.current = false }, 60)
    }
  }, [value, items])

  const onScroll = () => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (!ref.current || busy.current) return
      const rawIdx = Math.round(ref.current.scrollTop / ITEM_H)
      const clamped = Math.max(0, Math.min(COPIES * N - 1, rawIdx))
      const itemIdx = clamped % N
      const item = items[itemIdx]
      const prev = lastRawRef.current
      lastRawRef.current = clamped
      if (prev !== null && onWrap) {
        const prevItemIdx = prev % N, movedForward = clamped > prev
        if (movedForward && prevItemIdx === N - 1 && itemIdx === 0) { onWrap('forward'); return }
        if (!movedForward && prevItemIdx === 0 && itemIdx === N - 1) { onWrap('backward'); return }
      }
      if (item !== value) onChange(item)
      if (clamped < N || clamped >= (COPIES - 1) * N) {
        busy.current = true
        ref.current.scrollTop = (MID * N + itemIdx) * ITEM_H
        lastRawRef.current = MID * N + itemIdx
        setTimeout(() => { busy.current = false }, 60)
      }
    }, 150)
  }

  const allItems = []
  for (let c = 0; c < COPIES; c++)
    for (let i = 0; i < N; i++) allItems.push({ item: items[i], key: `${c}_${i}` })

  return (
    <div style={{ position: 'relative', height: ITEM_H * 5, flex: 1, overflow: 'hidden', userSelect: 'none' }}>
      <div style={{ position: 'absolute', top: PAD * ITEM_H, left: 4, right: 4, height: ITEM_H, background: 'rgba(176,136,249,0.12)', borderRadius: 8, borderTop: '1px solid rgba(176,136,249,0.28)', borderBottom: '1px solid rgba(176,136,249,0.28)', pointerEvents: 'none', zIndex: 2 }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: PAD * ITEM_H, background: 'var(--drum-fade-down)', pointerEvents: 'none', zIndex: 3 }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: PAD * ITEM_H, background: 'var(--drum-fade-up)', pointerEvents: 'none', zIndex: 3 }} />
      <div ref={ref} onScroll={onScroll} className="drum-scroll"
        style={{ position: 'absolute', inset: 0, overflowY: 'scroll', scrollSnapType: 'y mandatory', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', paddingTop: PAD * ITEM_H, paddingBottom: PAD * ITEM_H, boxSizing: 'border-box' }}>
        {allItems.map(({ item, key }) => (
          <div key={key} style={{ height: ITEM_H, display: 'flex', alignItems: 'center', justifyContent: 'center', scrollSnapAlign: 'center', fontSize: '1.1rem', fontWeight: item === value ? 700 : 400, color: item === value ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {renderItem ? renderItem(item) : item}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Sidebar({ open, onClose, user, onLogout }) {
  const [active, setActive] = useState(localStorage.getItem('notifyActive') === '1')
  const [time, setTime] = useState(localStorage.getItem('notifyTime') || '21:00')
  const [pickerOpen, setPickerOpen] = useState(false)

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
      setPickerOpen(false)
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

  async function applyTime(val) {
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

  const [h24, mn] = time.split(':').map(Number)
  const isPm = h24 >= 12
  const ampmVal = isPm ? '오후' : '오전'
  const hourVal = String(h24)
  const minVal = String(Math.round(mn / 5) * 5 % 60).padStart(2, '0')

  function onAmPm(val) {
    if ((val === '오후') === isPm) return
    const h24New = (h24 + 12) % 24
    applyTime(`${String(h24New).padStart(2, '0')}:${String(mn).padStart(2, '0')}`)
  }
  function onHour(val) {
    applyTime(`${String(parseInt(val)).padStart(2, '0')}:${String(mn).padStart(2, '0')}`)
  }
  function onHourWrap(dir) {
    applyTime(`${dir === 'forward' ? '00' : '23'}:${String(mn).padStart(2, '0')}`)
  }
  function onMin(val) {
    applyTime(`${String(h24).padStart(2, '0')}:${val}`)
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
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{user.email}</span>
              <button onClick={async () => { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); onLogout() }}
                style={{ background: 'var(--bg-accent)', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: '0.75rem', color: '#b088f9', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                로그아웃
              </button>
            </div>
          )}
          {NAV.map(({ path, icon, label }) => (
            <NavLink key={path} to={path} className={({ isActive }) => `pc-sb-link${isActive ? ' active' : ''}`} onClick={onClose} end={path === '/'}>
              <i className={`bi ${icon}`} /><span>{label}</span>
            </NavLink>
          ))}
          <hr style={{ margin: '8px 4px', borderColor: 'var(--border-light)' }} />
          <div style={{ padding: '4px 8px 8px' }}>
            <div style={{ background: 'var(--bg-section)', borderRadius: 12, overflow: 'hidden' }}>
              {/* 알림 토글 */}
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
              {/* 알림 시간 */}
              {active && (
                <>
                  <div onClick={() => setPickerOpen(p => !p)} style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid var(--border-light)', padding: '11px 14px', cursor: 'pointer' }}>
                    <div style={{ width: 28, height: 28, background: 'var(--bg-accent)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className="bi bi-clock" style={{ fontSize: '0.78rem', color: '#b088f9' }} />
                    </div>
                    <span style={{ flex: 1, marginLeft: 10, fontSize: '0.88rem', whiteSpace: 'nowrap' }}>알림 시간</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg-accent)', borderRadius: 20, padding: '4px 12px', flexShrink: 0 }}>
                      <span style={{ color: '#b088f9', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt12(time)}</span>
                      <i className="bi bi-chevron-down" style={{ color: '#b088f9', fontSize: '0.72rem', transform: pickerOpen ? 'rotate(180deg)' : '', transition: 'transform 0.25s' }} />
                    </div>
                  </div>
                  {pickerOpen && (
                    <div style={{ borderTop: '1px solid var(--border-light)', padding: '6px 12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <AmPmDrum value={ampmVal} onChange={onAmPm} />
                        <InfiniteDrum items={HOUR_ITEMS} value={hourVal} onChange={onHour} onWrap={onHourWrap} renderItem={displayHour} />
                        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>:</div>
                        <InfiniteDrum items={MIN_ITEMS} value={minVal} onChange={onMin} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
