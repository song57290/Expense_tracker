import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const YEARS = Array.from({ length: 201 }, (_, i) => 1900 + i) // 1900~2100
const ITEM_H = 48, PAD = 2

function parseDate(str) {
  if (!str) { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() } }
  const [y, m, d] = str.split('-').map(Number)
  return { y, m, d }
}
function toStr(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function daysInMonth(y, m) { return new Date(y, m, 0).getDate() }
function firstDow(y, m) { return new Date(y, m - 1, 1).getDay() }
function todayStr() {
  const d = new Date()
  return toStr(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

function YearDrum({ value, onChange }) {
  const ref = useRef(null)
  const timerRef = useRef(null)
  const busy = useRef(false)

  useEffect(() => {
    if (!ref.current) return
    const idx = YEARS.indexOf(value)
    if (idx < 0) return
    busy.current = true
    ref.current.scrollTop = idx * ITEM_H
    setTimeout(() => { busy.current = false }, 60)
  }, [value])

  function onScroll() {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (!ref.current || busy.current) return
      const idx = Math.round(ref.current.scrollTop / ITEM_H)
      const clamped = Math.max(0, Math.min(YEARS.length - 1, idx))
      const y = YEARS[clamped]
      busy.current = true
      ref.current.scrollTop = clamped * ITEM_H
      setTimeout(() => { busy.current = false }, 60)
      if (y !== value) onChange(y)
    }, 120)
  }

  return (
    <div style={{ position: 'relative', height: ITEM_H * 5, overflow: 'hidden' }}>
      {/* 하이라이트 바 */}
      <div style={{ position: 'absolute', top: PAD * ITEM_H, left: 16, right: 16, height: ITEM_H, background: 'rgba(176,136,249,0.12)', borderRadius: 12, borderTop: '1px solid rgba(176,136,249,0.3)', borderBottom: '1px solid rgba(176,136,249,0.3)', pointerEvents: 'none', zIndex: 2 }} />
      {/* 페이드 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: PAD * ITEM_H, background: 'var(--drum-fade-down)', pointerEvents: 'none', zIndex: 3 }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: PAD * ITEM_H, background: 'var(--drum-fade-up)', pointerEvents: 'none', zIndex: 3 }} />
      <div
        ref={ref}
        onScroll={onScroll}
        className="drum-scroll"
        style={{
          position: 'absolute', inset: 0, overflowY: 'scroll',
          scrollSnapType: 'y mandatory', scrollbarWidth: 'none',
          paddingTop: PAD * ITEM_H, paddingBottom: PAD * ITEM_H,
          boxSizing: 'border-box',
        }}
      >
        {YEARS.map(y => (
          <div key={y} style={{
            height: ITEM_H, display: 'flex', alignItems: 'center', justifyContent: 'center',
            scrollSnapAlign: 'center',
            fontSize: y === value ? '1.35rem' : '1.05rem',
            fontWeight: y === value ? 700 : 400,
            color: y === value ? 'var(--text-primary)' : 'var(--text-muted)',
            transition: 'font-size 0.15s, color 0.15s',
          }}>
            {y}년
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DatePickerSheet({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState('day') // 'day' | 'year'
  const parsed = parseDate(value)
  const [viewY, setViewY] = useState(parsed.y)
  const [viewM, setViewM] = useState(parsed.m)

  useEffect(() => {
    if (open) {
      const p = parseDate(value)
      setViewY(p.y)
      setViewM(p.m)
      setMode('day')
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    } else {
      setVisible(false)
    }
  }, [open])

  function close() {
    setVisible(false)
    setTimeout(() => setOpen(false), 280)
  }

  function prevMonth() {
    if (viewM === 1) { setViewY(y => y - 1); setViewM(12) }
    else setViewM(m => m - 1)
  }
  function nextMonth() {
    if (viewM === 12) { setViewY(y => y + 1); setViewM(1) }
    else setViewM(m => m + 1)
  }

  function selectDay(d) {
    onChange(toStr(viewY, viewM, d))
    close()
  }

  const today = todayStr()
  const sel = value || ''
  const totalDays = daysInMonth(viewY, viewM)
  const startDow = firstDow(viewY, viewM)
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const displayDate = value
    ? `${parsed.y}. ${String(parsed.m).padStart(2, '0')}. ${String(parsed.d).padStart(2, '0')}.`
    : '날짜 선택'

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{
        width: '100%', height: 38, display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--input-bg)', border: '1px solid var(--border-input)',
        borderRadius: 8, padding: '0 12px', cursor: 'pointer',
        color: value ? 'var(--text-primary)' : 'var(--text-muted)',
      }}>
        <i className="bi bi-calendar3" style={{ color: '#b088f9', fontSize: '0.85rem', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: '0.9rem', textAlign: 'left' }}>{displayDate}</span>
      </button>

      {open && createPortal(
        <div onClick={e => e.target === e.currentTarget && close()}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 6000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', opacity: visible ? 1 : 0, transition: 'opacity 0.22s' }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: 20, width: '100%', maxWidth: 340,
            boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
            transform: visible ? 'scale(1)' : 'scale(0.95)',
            transition: 'transform 0.22s cubic-bezier(0.25,0.46,0.45,0.94)',
            padding: '20px 16px 20px',
          }}>
            {/* 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              {mode === 'day' ? (
                <>
                  <button type="button" onClick={() => setMode('year')}
                    style={{ border: 'none', background: 'rgba(176,136,249,0.12)', borderRadius: 10, padding: '5px 12px', cursor: 'pointer', fontWeight: 700, fontSize: '1.05rem', color: '#b088f9' }}>
                    {viewY}년 ▾
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button type="button" onClick={prevMonth}
                      style={{ border: 'none', background: 'var(--bg-accent)', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="bi bi-chevron-left" />
                    </button>
                    <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)', minWidth: 40, textAlign: 'center' }}>{viewM}월</span>
                    <button type="button" onClick={nextMonth}
                      style={{ border: 'none', background: 'var(--bg-accent)', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="bi bi-chevron-right" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-secondary)' }}>연도 선택</span>
                  <button type="button" onClick={() => setMode('day')}
                    style={{ border: 'none', background: 'var(--bg-accent)', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', color: '#b088f9', fontWeight: 700, fontSize: '0.85rem' }}>
                    완료
                  </button>
                </>
              )}
            </div>

            {mode === 'year' ? (
              <YearDrum value={viewY} onChange={y => setViewY(y)} />
            ) : (
              <>
                {/* 요일 헤더 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 12px', marginBottom: 4 }}>
                  {DAYS.map((d, i) => (
                    <div key={d} style={{ textAlign: 'center', fontSize: '0.78rem', fontWeight: 600, padding: '4px 0',
                      color: i === 0 ? '#ff3b30' : i === 6 ? '#007aff' : 'var(--text-muted)' }}>
                      {d}
                    </div>
                  ))}
                </div>

                {/* 날짜 그리드 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 12px 8px', gap: '2px 0' }}>
                  {cells.map((d, i) => {
                    if (!d) return <div key={i} />
                    const dow = i % 7
                    const dateStr = toStr(viewY, viewM, d)
                    const isSel = dateStr === sel
                    const isToday = dateStr === today
                    return (
                      <button key={i} type="button" onClick={() => selectDay(d)} style={{
                        border: 'none', background: 'none', cursor: 'pointer',
                        padding: '3px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: isSel ? 'linear-gradient(135deg,#b088f9,#7baff0)' : isToday ? 'rgba(176,136,249,0.12)' : 'transparent',
                          fontSize: '0.9rem', fontWeight: isSel || isToday ? 700 : 400,
                          color: isSel ? 'white' : isToday ? '#b088f9' : dow === 0 ? '#ff3b30' : dow === 6 ? '#007aff' : 'var(--text-primary)',
                        }}>
                          {d}
                        </div>
                        {isToday && !isSel && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#b088f9' }} />}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
