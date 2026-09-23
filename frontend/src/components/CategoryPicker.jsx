import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'

// multi=false(기본): 탭 하나로 즉시 선택·확정되는 단일 선택 시트(거래 카테고리 등).
// multi=true: 여러 개를 고른 뒤 우측 상단 "저장"을 눌러야만 onSave로 한 번에
// 반영되는 다중 선택 시트(월급 탭 카테고리 추가 등) — 고르는 중엔 항목마다
// 테두리+체크로 표시되고 시트는 안 닫힌다.
export default function CategoryPicker({ cats, value, onChange, onSave, multi = false, placeholder = '카테고리 선택' }) {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const [drag, setDrag] = useState(0)
  const [multiSel, setMultiSel] = useState([])
  const touchStartY = useRef(null)

  function openSheet() {
    if (multi) setMultiSel([])
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
  function toggleMulti(name) {
    setMultiSel(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
  }
  function saveMulti() {
    onSave(multiSel)
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
        color: (!multi && selected) ? 'var(--text-primary)' : 'var(--text-muted)', height: 38,
      }}>
        {!multi && selected && (
          <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(176,136,249,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', flexShrink: 0 }}>
            {selected[1] || '📦'}
          </div>
        )}
        <span style={{ flex: 1, fontSize: '0.9rem', textAlign: 'left' }}>
          {!multi && selected ? selected[0] : placeholder}
        </span>
        <i className="bi bi-chevron-down" style={{ color: 'var(--text-muted)', fontSize: '0.75rem', flexShrink: 0 }} />
      </button>

      {open && createPortal(
        <div
          onClick={e => e.target === e.currentTarget && closeSheet()}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 5000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', transition: 'opacity 0.25s ease' }}
        >
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{
              background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%',
              maxHeight: '72dvh', overflowY: 'auto', overscrollBehavior: 'contain',
              transform: visible ? `translateY(${drag}px)` : 'translateY(100%)',
              transition: drag > 0 ? 'none' : 'transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94)',
              paddingBottom: 40,
            }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px', cursor: 'grab' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-light)' }} />
            </div>
            <div style={{ padding: '6px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)' }}>
              <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>카테고리 선택</span>
              {multi && (
                <button onClick={saveMulti} style={{ background: 'none', border: 'none', color: '#b088f9', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', padding: '2px 4px' }}>
                  저장{multiSel.length > 0 ? ` (${multiSel.length})` : ''}
                </button>
              )}
            </div>
            {cats.map(([name, icon]) => {
              const isSelected = multi ? multiSel.includes(name) : value === name
              return (
                <div key={name} onClick={() => multi ? toggleMulti(name) : select(name)} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '11px 20px', cursor: 'pointer',
                  background: isSelected ? 'rgba(176,136,249,0.08)' : 'transparent',
                  border: isSelected ? '1.5px solid #b088f9' : '1.5px solid transparent',
                  borderBottom: isSelected ? '1.5px solid #b088f9' : '1.5px solid var(--border-light)',
                  marginBottom: -1.5,
                  transition: 'background 0.15s, border-color 0.15s',
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
