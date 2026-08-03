import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Capacitor, registerPlugin } from '@capacitor/core'

const RingerMode = registerPlugin('RingerMode')
import { App as CapApp } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'

function BackButtonGuard() {
  const location = useLocation()
  const locationRef = useRef(location)

  useEffect(() => {
    locationRef.current = location
  }, [location])
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let handle = null

    CapApp.addListener('backButton', ({ canGoBack }) => {
      const evt = new CustomEvent('appBackButton', { cancelable: true })
      if (!window.dispatchEvent(evt)) return
      if (canGoBack) {
        window.history.back()
      } else {
        CapApp.exitApp()
      }
    }).then(h => {
      handle = h
    })
    return () => {
      handle?.remove()
    }
  }, [])
  return null
}
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import Calendar from './pages/Calendar.jsx'
import Stats from './pages/Stats.jsx'
import Budget from './pages/Budget.jsx'
import Categories from './pages/Categories.jsx'
import Routines from './pages/Routines.jsx'
import Edit from './pages/Edit.jsx'
import Login from './pages/Login.jsx'
import Settings from './pages/Settings.jsx'
import Salary from './pages/Salary.jsx'
import Search from './pages/Search.jsx'
import UpdateNoticeModal from './components/UpdateNoticeModal.jsx'

export default function App() {
  const [user, setUser] = useState(undefined)
  const [noticePopup, setNoticePopup] = useState(null)
  const [pendingRegisters, setPendingRegisters] = useState([])
  const [registerIdx, setRegisterIdx] = useState(0)
  const [cardOptions, setCardOptions] = useState([])
  const [selectedCard, setSelectedCard] = useState('')

  useEffect(() => {
    // 서버 응답이 늦어도(Fly.io 콜드 스타트) 스플래시가 무한 대기하지 않도록 폴백
    let done = false
    const fallback = Capacitor.isNativePlatform()
      ? setTimeout(() => { if (!done) SplashScreen.hide() }, 6000)
      : null
    fetch('/api/me', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(d => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => {
        done = true
        clearTimeout(fallback)
        if (Capacitor.isNativePlatform()) SplashScreen.hide()
      })
  }, [])

  useEffect(() => {
    const refresh = () => fetch('/api/me', { credentials: 'same-origin' }).then(r => r.json()).then(d => setUser(d.user)).catch(() => {})
    window.addEventListener('userUpdated', refresh)
    return () => window.removeEventListener('userUpdated', refresh)
  }, [])

  useEffect(() => {
    const prevent = (e) => {
      if (!document.body.classList.contains('sheet-open')) return
      let el = e.target
      while (el && el !== document.body) {
        const oy = window.getComputedStyle(el).overflowY
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return
        el = el.parentElement
      }
      e.preventDefault()
    }
    document.addEventListener('touchmove', prevent, { passive: false })
    return () => document.removeEventListener('touchmove', prevent)
  }, [])

  useEffect(() => {
    const open = !!noticePopup || (pendingRegisters.length > 0 && registerIdx < pendingRegisters.length)
    document.body.classList.toggle('sheet-open', open)
    return () => document.body.classList.remove('sheet-open')
  }, [noticePopup, pendingRegisters, registerIdx])

  useEffect(() => {
    let audioCtx = null
    const isRingerSoundOn = async () => {
      try {
        const result = await RingerMode.getRingerMode()
        return result.isSoundOn
      } catch {
        return true
      }
    }
    const playTap = async () => {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        if (audioCtx.state === 'suspended') await audioCtx.resume()
        const now = audioCtx.currentTime
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        osc.connect(gain)
        gain.connect(audioCtx.destination)
        osc.type = 'sine'
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.3, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
        osc.start(now)
        osc.stop(now + 0.08)
      } catch {}
    }
    const starts = new Map()
    const onStart = (e) => {
      for (const t of e.changedTouches) {
        if (t.target.closest?.('button, .bottom-nav a'))
          starts.set(t.identifier, { x: t.clientX, y: t.clientY })
      }
    }
    const onEnd = async (e) => {
      for (const t of e.changedTouches) {
        const s = starts.get(t.identifier)
        starts.delete(t.identifier)
        if (!s) continue
        const dx = t.clientX - s.x
        const dy = t.clientY - s.y
        if (Math.sqrt(dx * dx + dy * dy) > 10) continue
        if (!e.target.closest?.('button, .bottom-nav a')) continue
        if (localStorage.getItem('vibration_enabled') !== 'false') navigator.vibrate?.(8)
        if (localStorage.getItem('sound_enabled') !== 'false') {
          const soundOn = await isRingerSoundOn()
          if (soundOn) playTap()
        }
      }
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend', onEnd)
      audioCtx?.close()
    }
  }, [])

  useEffect(() => {
    if (!user) return
    const today = new Date().toISOString().slice(0, 10)
    fetch('/api/pending-registers', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(list => {
        const filtered = list.filter(item => !localStorage.getItem(`skip_register_${item.item_type}_${item.id}_${today}`))
        if (filtered.length) {
          setPendingRegisters(filtered)
          setRegisterIdx(0)
          setSelectedCard(filtered[0].tx_card || '')
        }
      })
      .catch(() => {})
    fetch('/api/cards', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(data => setCardOptions((data.cards || []).filter(c => (c.account_balance || 0) >= 0).map(c => c.name)))
      .catch(() => {})
  }, [user])

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
      <BackButtonGuard />
      {user && <UpdateNoticeModal />}
      {noticePopup && (
        <div onClick={dismissNotice} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 20, width: '100%', maxWidth: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', padding: '18px 20px 14px' }}>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.8)', marginBottom: 4 }}>📢 공지사항 · {noticePopup.created_at}</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'white' }}>{noticePopup.title}</div>
            </div>
            <div style={{ padding: '16px 20px', fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.7, maxHeight: '40vh', overflowY: 'auto', overscrollBehavior: 'contain' }}>
              {noticePopup.content}
            </div>
            <div style={{ padding: '0 20px 20px', display: 'flex', gap: 8 }}>
              <button onClick={dismissNotice} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1.5px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}>
                다시 안보기
              </button>
              <button onClick={() => setNoticePopup(null)} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingRegisters.length > 0 && registerIdx < pendingRegisters.length && (() => {
        const item = pendingRegisters[registerIdx]
        const today = new Date().toISOString().slice(0, 10)
        const dismiss = () => {
          localStorage.setItem(`skip_register_${item.item_type}_${item.id}_${today}`, '1')
          const next = registerIdx + 1
          setRegisterIdx(next)
          setSelectedCard(pendingRegisters[next]?.tx_card || '')
        }
        const confirm = () => {
          const url = item.item_type === 'savings'
            ? `/api/savings/${item.id}/auto-register`
            : `/api/salary/fixed/${item.id}/register`
          fetch(url, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ card: selectedCard || null }),
          }).finally(() => {
            const next = registerIdx + 1
            setRegisterIdx(next)
            setSelectedCard(pendingRegisters[next]?.tx_card || '')
          })
        }
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: 20, width: '100%', maxWidth: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
              <div style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', padding: '16px 20px 12px' }}>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.8)', marginBottom: 4 }}>{item.item_type === 'savings' ? '🏦 자동이체 알림' : '📅 정기 거래 알림'}</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>오늘 {item.name} {item.item_type === 'savings' ? '자동이체' : '등록'}할까요?</div>
              </div>
              <div style={{ padding: '16px 20px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>유형</span>
                  <span style={{ fontWeight: 600 }}>{item.tx_type === 'income' ? '수입' : '지출'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>금액</span>
                  <span style={{ fontWeight: 700, color: item.tx_type === 'income' ? '#198754' : '#dc3545' }}>
                    {item.tx_type === 'income' ? '+' : '-'}{Number(item.amount).toLocaleString()}원
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>카드/계좌</span>
                  <select
                    value={selectedCard}
                    onChange={e => setSelectedCard(e.target.value)}
                    style={{ border: '1.5px solid var(--border-input)', borderRadius: 8, padding: '4px 8px', fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--text-primary)', fontWeight: 600, maxWidth: 160 }}
                  >
                    <option value="">없음</option>
                    {cardOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    {selectedCard && !cardOptions.includes(selectedCard) && (
                      <option value={selectedCard}>{selectedCard}</option>
                    )}
                  </select>
                </div>
              </div>
              <div style={{ padding: '0 20px 20px', display: 'flex', gap: 8 }}>
                <button onClick={confirm} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
                  등록
                </button>
                <button onClick={dismiss} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1.5px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}>
                  건너뛰기
                </button>
              </div>
            </div>
          </div>
        )
      })()}
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login onLogin={setUser} />} />
        <Route element={user ? <Layout user={user} onLogout={() => setUser(null)} /> : <Navigate to="/login" replace />}>
          <Route path="/" element={<Home />} />
          <Route path="/cards" element={<Navigate to="/budget" replace />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/routines" element={<Routines />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/salary" element={<Salary />} />
          <Route path="/edit/:id" element={<Edit />} />
          <Route path="/search" element={<Search />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
