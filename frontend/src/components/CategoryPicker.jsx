import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'

export default function CategoryPicker({ cats, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const [drag, setDrag] = useState(0)
  const touchStartY = useRef(null)

  function openSheet() {
    setOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
  }
  function closeSheet() {
    setVisible(false)
    setDrag(0)
    setTimeout(() => setOpen(false), 300)
  }
  function select(name) {
    onChange(name)
    closeSheet()
  }

  function onTouchStart(e) {
    if (e.currentTarget.scrollTop === 0)
      touchStartY.current = e.touches[0].clientY
  }
  function onTouchMove(e) {
    if (touchStartY.current === null) return
    const dy = e.touches[0].clientY - touchStartY.current
    if (dy > 0) setDrag(dy)
    else touchStartY.current = null
  }
  function onTouchEnd() {
    if (drag > 100) closeSheet()
    else setDrag(0)
    touchStartY.current = null
  }

  const selected = cats.find(([name]) => name === value)

  return (
    <>
      <button type="button" onClick={openSheet} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--input-bg)', border: '1px solid var(--border-input)',
        borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
        color: selected ? 'var(--text-primary)' : 'var(--text-muted)', height: 38,
      }}>
        {selected && (
          <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(176,136,249,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', flexShrink: 0 }}>
            {selected[1] || '📦'}
          </div>
        )}
        <span style={{ flex: 1, fontSize: '0.9rem', textAlign: 'left' }}>
          {selected ? selected[0] : '카테고리 선택'}
        </span>
        <i className="bi bi-chevron-down" style={{ color: 'var(--text-muted)', fontSize: '0.75rem', flexShrink: 0 }} />
      </button>

      {open && createPortal(
        <div
          onClick={e => e.target === e.currentTarget && closeSheet()}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 5000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', opacity: visible ? 1 : 0, transition: 'opacity 0.25s ease' }}
        >
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{
              background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%',
              maxHeight: '72vh', overflowY: 'auto',
              transform: visible ? `translateY(${drag}px)` : 'translateY(100%)',
              transition: drag > 0 ? 'none' : 'transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94)',
              paddingBottom: 40,
            }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px', cursor: 'grab' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-light)' }} />
            </div>
            <div style={{ padding: '6px 20px 12px', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
              카테고리 선택
            </div>
            {cats.map(([name, icon]) => {
              const isSelected = value === name
              return (
                <div key={name} onClick={() => select(name)} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '11px 20px', cursor: 'pointer',
                  background: isSelected ? 'rgba(176,136,249,0.08)' : 'transparent',
                  borderBottom: '1px solid var(--border-light)',
                  transition: 'background 0.15s',
                }}>
                  <div style={{ width: 44, height: 44, borderRadius: 13, background: isSelected ? 'rgba(176,136,249,0.18)' : 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>
                    {icon || '📦'}
                  </div>
                  <span style={{ flex: 1, fontSize: '0.95rem', fontWeight: isSelected ? 600 : 400, color: isSelected ? '#b088f9' : 'var(--text-primary)' }}>
                    {name}
                  </span>
                  {isSelected && <i className="bi bi-check-circle-fill" style={{ color: '#b088f9', fontSize: '1.1rem', flexShrink: 0 }} />}
                </div>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
