import { useState, useEffect, useRef } from 'react'
import api from '../api.js'

function urlB64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4)
  const b64u = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64u)
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)))
}

function fmt12(t) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? '오후' : '오전'
  return `${ampm} ${h % 12 || 12}:${String(m).padStart(2, '0')}`
}

// iOS 드럼롤 피커 컬럼
function DrumPicker({ items, value, onChange }) {
  const ITEM_H = 44
  const SHOW = 5
  const PAD = Math.floor(SHOW / 2)
  const ref = useRef(null)
  const timer = useRef(null)
  const busy = useRef(false)

  // 초기 스크롤 위치 설정
  useEffect(() => {
    if (!ref.current || busy.current) return
    const idx = items.indexOf(value)
    if (idx >= 0) ref.current.scrollTop = idx * ITEM_H
  }, [value, items])

  const onScroll = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (!ref.current) return
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(ref.current.scrollTop / ITEM_H)))
      busy.current = true
      ref.current.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' })
      setTimeout(() => { busy.current = false }, 400)
      if (items[idx] !== value) onChange(items[idx])
    }, 100)
  }

  return (
    <div style={{ position: 'relative', height: ITEM_H * SHOW, flex: 1, overflow: 'hidden', userSelect: 'none' }}>
      {/* 선택 영역 하이라이트 */}
      <div style={{ position: 'absolute', top: PAD * ITEM_H, left: 6, right: 6, height: ITEM_H, background: 'rgba(176,136,249,0.12)', borderRadius: 10, borderTop: '1px solid rgba(176,136,249,0.28)', borderBottom: '1px solid rgba(176,136,249,0.28)', pointerEvents: 'none', zIndex: 2 }} />
      {/* 상단 페이드 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: PAD * ITEM_H, background: 'linear-gradient(to bottom, rgba(255,255,255,0.95) 20%, transparent)', pointerEvents: 'none', zIndex: 3 }} />
      {/* 하단 페이드 */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: PAD * ITEM_H, background: 'linear-gradient(to top, rgba(255,255,255,0.95) 20%, transparent)', pointerEvents: 'none', zIndex: 3 }} />
      {/* 스크롤 드럼 */}
      <div ref={ref} onScroll={onScroll} className="drum-scroll"
        style={{ position: 'absolute', inset: 0, overflowY: 'scroll', scrollSnapType: 'y mandatory', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
        {Array.from({ length: PAD }).map((_, i) => <div key={`t${i}`} style={{ height: ITEM_H }} />)}
        {items.map(item => (
          <div key={item} style={{ height: ITEM_H, display: 'flex', alignItems: 'center', justifyContent: 'center', scrollSnapAlign: 'center', fontSize: '1.45rem', fontWeight: item === value ? 700 : 400, color: item === value ? '#1c1c1e' : '#bbb', transition: 'all 0.15s' }}>
            {item}
          </div>
        ))}
        {Array.from({ length: PAD }).map((_, i) => <div key={`b${i}`} style={{ height: ITEM_H }} />)}
      </div>
    </div>
  )
}

export default function NotifySheet() {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const [active, setActive] = useState(localStorage.getItem('notifyActive') === '1')
  const [time, setTime] = useState(localStorage.getItem('notifyTime') || '21:00')
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    window.openNotifySheet = () => { setOpen(true); setTimeout(() => setVisible(true), 10) }
    window.closeNotifySheet = () => { setVisible(false); setTimeout(() => setOpen(false), 320) }
  }, [])

  const close = () => { setVisible(false); setTimeout(() => { setOpen(false); setPickerOpen(false) }, 320) }

  async function handleToggle() {
    if (active) {
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (sub) { await api.post('/api/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe() }
      } catch (e) { console.warn(e) }
      localStorage.setItem('notifyActive', '0'); setActive(false); setPickerOpen(false)
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
        subJson.notify_hour = parseInt(parts[0]); subJson.notify_minute = parseInt(parts[1])
        const r = await api.post('/api/subscribe', subJson)
        if (r.ok) { localStorage.setItem('notifyActive', '1'); setActive(true) }
        else alert('서버 오류가 발생했습니다.')
      } catch (e) { alert('오류: ' + e.message) }
    }
  }

  async function applyTime(newT) {
    setTime(newT); localStorage.setItem('notifyTime', newT)
    if (localStorage.getItem('notifyActive') !== '1') return
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const [h, m] = newT.split(':').map(Number)
        const j = sub.toJSON(); j.notify_hour = h; j.notify_minute = m
        await api.post('/api/subscribe', j)
      }
    } catch (e) { console.warn(e) }
  }

  // 드럼 피커용 아이템 목록
  const ampmItems = ['오전', '오후']
  const hourItems = Array.from({ length: 12 }, (_, i) => String(i + 1))
  const minItems = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

  const [h24, mn] = time.split(':').map(Number)
  const isPm = h24 >= 12
  const h12 = h24 % 12 || 12
  const ampmVal = isPm ? '오후' : '오전'
  const hourVal = String(h12)
  const minVal = String(Math.round(mn / 5) * 5 % 60).padStart(2, '0')

  function onAmPm(val) {
    const newPm = val === '오후'
    if (newPm === isPm) return
    const h24New = newPm ? (h12 === 12 ? 12 : h12 + 12) : (h12 === 12 ? 0 : h12)
    applyTime(`${String(h24New).padStart(2, '0')}:${String(mn).padStart(2, '0')}`)
  }

  function onHour(val) {
    const h12New = parseInt(val)
    const h24New = isPm ? (h12New === 12 ? 12 : h12New + 12) : (h12New === 12 ? 0 : h12New)
    applyTime(`${String(h24New).padStart(2, '0')}:${String(mn).padStart(2, '0')}`)
  }

  function onMin(val) {
    applyTime(`${String(h24).padStart(2, '0')}:${val}`)
  }

  if (!open) return null

  return (
    <div onClick={e => e.target === e.currentTarget && close()} style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.42)', zIndex: 2000, alignItems: 'flex-end', justifyContent: 'center', opacity: visible ? 1 : 0, transition: 'opacity 0.25s ease' }}>
      <div style={{ background: 'white', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 520, transform: visible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
        <div style={{ padding: '20px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1c1c1e' }}>알림 설정</span>
            <button onClick={close} style={{ background: '#f2f2f7', border: 'none', width: 30, height: 30, borderRadius: 15, fontSize: '1.1rem', color: '#6e6e73', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
          </div>
          <div style={{ background: '#f7f7f7', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px' }}>
              <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg,#b088f9,#7baff0)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="bi bi-bell-fill" style={{ fontSize: '0.85rem', color: 'white' }} />
              </div>
              <span style={{ flex: 1, marginLeft: 12, fontSize: '0.95rem', fontWeight: 500 }}>알림</span>
              <div className="ios-toggle" onClick={handleToggle}>
                <div className={`ios-track${active ? ' on' : ''}`} />
                <div className={`ios-dot${active ? ' on' : ''}`} />
              </div>
            </div>
            {active && (
              <>
                <div onClick={() => setPickerOpen(p => !p)} style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid #ebebeb', padding: '14px 16px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                  <div style={{ width: 32, height: 32, background: '#f0eeff', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="bi bi-clock" style={{ fontSize: '0.85rem', color: '#b088f9' }} />
                  </div>
                  <span style={{ flex: 1, marginLeft: 12, fontSize: '0.95rem' }}>알림 시간</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: '#b088f9', fontSize: '0.95rem', fontWeight: 600 }}>{fmt12(time)}</span>
                    <i className="bi bi-chevron-down" style={{ color: '#b088f9', fontSize: '0.78rem', display: 'inline-block', transform: pickerOpen ? 'rotate(180deg)' : '', transition: 'transform 0.25s' }} />
                  </div>
                </div>
                {pickerOpen && (
                  <div style={{ borderTop: '1px solid #ebebeb', padding: '8px 16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <DrumPicker items={ampmItems} value={ampmVal} onChange={onAmPm} />
                      <DrumPicker items={hourItems} value={hourVal} onChange={onHour} />
                      <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#ccc', flexShrink: 0, marginBottom: 2 }}>:</div>
                      <DrumPicker items={minItems} value={minVal} onChange={onMin} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div style={{ height: 'max(20px, env(safe-area-inset-bottom, 20px))' }} />
      </div>
    </div>
  )
}
