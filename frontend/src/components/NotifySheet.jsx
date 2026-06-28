import { useState, useEffect, useRef, useCallback } from 'react'
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

  function adjustHour(d) {
    const [h, m] = time.split(':').map(Number)
    const pm = h >= 12; let h12 = h % 12 || 12
    h12 += d; if (h12 > 12) h12 = 1; if (h12 < 1) h12 = 12
    const h24 = pm ? (h12 === 12 ? 12 : h12 + 12) : (h12 === 12 ? 0 : h12)
    applyTime(`${String(h24).padStart(2,'0')}:${String(m).padStart(2,'0')}`)
  }

  function adjustMinute(d) {
    const [h, m] = time.split(':').map(Number)
    const newM = ((Math.round(m / 5) * 5 + d) % 60 + 60) % 60
    applyTime(`${String(h).padStart(2,'0')}:${String(newM).padStart(2,'0')}`)
  }

  function setAmPm(pm) {
    const [h, m] = time.split(':').map(Number)
    const isPm = h >= 12
    if (pm === isPm) return
    const h24 = pm ? h + 12 : h - 12
    applyTime(`${String(h24).padStart(2,'0')}:${String(m).padStart(2,'0')}`)
  }

  // 드래그 피커 컬럼 컴포넌트
  function DragCol({ value, display, onDelta }) {
    const startY = useRef(null)
    const lastStep = useRef(0)
    const STEP_PX = 28

    const onPointerDown = e => {
      e.currentTarget.setPointerCapture(e.pointerId)
      startY.current = e.clientY
      lastStep.current = 0
    }
    const onPointerMove = e => {
      if (startY.current === null) return
      const dy = startY.current - e.clientY // 위로 드래그 = 양수 = 증가
      const step = Math.round(dy / STEP_PX)
      const diff = step - lastStep.current
      if (diff !== 0) { lastStep.current = step; onDelta(diff) }
    }
    const onPointerUp = () => { startY.current = null; lastStep.current = 0 }

    const ARR = (dir) => (
      <svg width="20" height="12" viewBox="0 0 20 12" fill="none" style={{ opacity: 0.35, display:'block' }}>
        {dir === 'up'
          ? <path d="M2 10L10 2L18 10" stroke="#b088f9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          : <path d="M2 2L10 10L18 2" stroke="#b088f9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        }
      </svg>
    )

    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flex:1, cursor:'ns-resize', userSelect:'none', WebkitUserSelect:'none', touchAction:'none' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <div style={{ padding:'8px 28px' }}>{ARR('up')}</div>
        <div style={{ fontSize:'3rem', fontWeight:700, color:'#1c1c1e', minWidth:72, textAlign:'center', lineHeight:1 }}>{display}</div>
        <div style={{ padding:'8px 28px' }}>{ARR('down')}</div>
      </div>
    )
  }

  if (!open) return null

  const [h24, mn] = time.split(':').map(Number)
  const isPm = h24 >= 12
  const h12 = h24 % 12 || 12

  return (
    <div onClick={e => e.target === e.currentTarget && close()} style={{ display:'flex', position:'fixed', inset:0, background:'rgba(0,0,0,0.42)', zIndex:2000, alignItems:'flex-end', justifyContent:'center', opacity: visible ? 1 : 0, transition:'opacity 0.25s ease' }}>
      <div style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:520, transform: visible ? 'translateY(0)' : 'translateY(100%)', transition:'transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
        <div style={{ padding:'20px 20px 0' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <span style={{ fontWeight:700, fontSize:'1.05rem', color:'#1c1c1e' }}>알림 설정</span>
            <button onClick={close} style={{ background:'#f2f2f7', border:'none', width:30, height:30, borderRadius:15, fontSize:'1.1rem', color:'#6e6e73', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>&times;</button>
          </div>
          <div style={{ background:'#f7f7f7', borderRadius:14, overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', padding:'14px 16px' }}>
              <div style={{ width:32, height:32, background:'linear-gradient(135deg,#b088f9,#7baff0)', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <i className="bi bi-bell-fill" style={{ fontSize:'0.85rem', color:'white' }} />
              </div>
              <span style={{ flex:1, marginLeft:12, fontSize:'0.95rem', fontWeight:500 }}>알림</span>
              <div className="ios-toggle" onClick={handleToggle}>
                <div className={`ios-track${active ? ' on' : ''}`} />
                <div className={`ios-dot${active ? ' on' : ''}`} />
              </div>
            </div>
            {active && (
              <>
                <div onClick={() => setPickerOpen(p => !p)} style={{ display:'flex', alignItems:'center', borderTop:'1px solid #ebebeb', padding:'14px 16px', cursor:'pointer', WebkitTapHighlightColor:'transparent' }}>
                  <div style={{ width:32, height:32, background:'#f0eeff', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <i className="bi bi-clock" style={{ fontSize:'0.85rem', color:'#b088f9' }} />
                  </div>
                  <span style={{ flex:1, marginLeft:12, fontSize:'0.95rem' }}>알림 시간</span>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <span style={{ color:'#b088f9', fontSize:'0.95rem', fontWeight:600 }}>{fmt12(time)}</span>
                    <i className="bi bi-chevron-down" style={{ color:'#b088f9', fontSize:'0.78rem', display:'inline-block', transform: pickerOpen ? 'rotate(180deg)' : '', transition:'transform 0.25s' }} />
                  </div>
                </div>
                {pickerOpen && (
                  <div style={{ borderTop:'1px solid #ebebeb', padding:'20px 24px 24px' }}>
                    <div style={{ display:'flex', gap:8, marginBottom:24 }}>
                      {[['오전', false], ['오후', true]].map(([label, pm]) => (
                        <button key={label} onClick={() => setAmPm(pm)} style={{ flex:1, height:40, border:'none', borderRadius:20, fontSize:'0.9rem', fontWeight:600, cursor:'pointer', transition:'all 0.2s', background: isPm === pm ? 'linear-gradient(135deg,#b088f9,#7baff0)' : '#efefef', color: isPm === pm ? 'white' : '#888', boxShadow: isPm === pm ? '0 2px 10px rgba(176,136,249,0.35)' : 'none' }}>{label}</button>
                      ))}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <DragCol value={h12} display={h12} onDelta={d => adjustHour(d)} />
                      <div style={{ fontSize:'2.6rem', fontWeight:700, color:'#d0d0d0', padding:'0 4px', flexShrink:0, marginTop:2 }}>:</div>
                      <DragCol value={mn} display={String(mn).padStart(2,'0')} onDelta={d => adjustMinute(d * 5)} />
                    </div>
                    <p style={{ textAlign:'center', fontSize:'0.75rem', color:'#aaa', marginTop:12, marginBottom:0 }}>위아래로 드래그해서 시간을 조절하세요</p>
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
