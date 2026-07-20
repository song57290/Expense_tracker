import { useRef, useEffect } from 'react'

const YEARS = Array.from({ length: 201 }, (_, i) => 1900 + i)
const ITEM_H = 48, PAD = 2

export default function YearDrum({ value, onChange }) {
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
      <div style={{ position: 'absolute', top: PAD * ITEM_H, left: 16, right: 16, height: ITEM_H, background: 'rgba(176,136,249,0.12)', borderRadius: 12, borderTop: '1px solid rgba(176,136,249,0.3)', borderBottom: '1px solid rgba(176,136,249,0.3)', pointerEvents: 'none', zIndex: 2 }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: PAD * ITEM_H, background: 'var(--drum-fade-down)', pointerEvents: 'none', zIndex: 3 }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: PAD * ITEM_H, background: 'var(--drum-fade-up)', pointerEvents: 'none', zIndex: 3 }} />
      <div ref={ref} onScroll={onScroll} className="drum-scroll"
        style={{ position: 'absolute', inset: 0, overflowY: 'scroll', scrollSnapType: 'y mandatory', scrollbarWidth: 'none', paddingTop: PAD * ITEM_H, paddingBottom: PAD * ITEM_H, boxSizing: 'border-box' }}>
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
