import { useState } from 'react'
import { createPortal } from 'react-dom'

const optBtnStyle = (active) => ({
  flex: 1, borderRadius: 10, padding: '7px 0', fontSize: '0.85rem', fontWeight: active ? 700 : 400,
  border: `1.5px solid ${active ? '#b088f9' : 'var(--border-light)'}`,
  background: active ? 'rgba(176,136,249,0.12)' : 'transparent',
  color: active ? '#b088f9' : 'var(--text-muted)', cursor: 'pointer',
})

const chipStyle = (active) => ({
  padding: '6px 12px', borderRadius: 20, fontSize: '0.8rem', fontWeight: active ? 700 : 400,
  border: `1.5px solid ${active ? '#b088f9' : 'var(--border-light)'}`,
  background: active ? 'rgba(176,136,249,0.12)' : 'transparent',
  color: active ? '#b088f9' : 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap',
})

const labelStyle = { fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }

export default function TxListFilter({
  sortAsc, onSortChange, showBalance, onShowBalanceChange, showTime, onShowTimeChange,
  cards = [], cardFilter, onCardFilterChange,
}) {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)

  function openSheet() {
    setOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
  }
  function closeSheet() {
    setVisible(false)
    setTimeout(() => setOpen(false), 300)
  }

  return (
    <>
      <button onClick={openSheet}
        style={{ borderRadius: 20, padding: '3px 10px', fontSize: '0.8rem', color: '#b088f9', border: '1px solid #b088f9', background: 'transparent', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', cursor: 'pointer' }}>
        <i className="bi bi-funnel" style={{ fontSize: '0.72rem' }} />
        필터
      </button>
      {open && createPortal(
        <div onClick={e => e.target === e.currentTarget && closeSheet()}
          style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.42)', zIndex: 5000, alignItems: 'center', justifyContent: 'center', padding: '0 24px', opacity: visible ? 1 : 0, transition: 'opacity 0.22s ease' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '20px', width: '100%', maxWidth: 300, maxHeight: '80vh', overflowY: 'auto', overscrollBehavior: 'contain', boxShadow: '0 12px 40px rgba(0,0,0,0.22)', transform: visible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(12px)', transition: 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <span className="fw-bold" style={{ fontSize: '1rem' }}>필터</span>
              <button onClick={closeSheet}
                style={{ background: 'var(--bg-section)', border: 'none', width: 28, height: 28, borderRadius: 14, fontSize: '1.05rem', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
            </div>
            <div style={labelStyle}>정렬</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              <button onClick={() => onSortChange(false)} style={optBtnStyle(!sortAsc)}>최신순</button>
              <button onClick={() => onSortChange(true)} style={optBtnStyle(sortAsc)}>과거순</button>
            </div>
            <div style={labelStyle}>통장 잔고</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              <button onClick={() => onShowBalanceChange(true)} style={optBtnStyle(showBalance)}>표시</button>
              <button onClick={() => onShowBalanceChange(false)} style={optBtnStyle(!showBalance)}>숨김</button>
            </div>
            <div style={labelStyle}>시간</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: cards.length > 0 ? 18 : 0 }}>
              <button onClick={() => onShowTimeChange(true)} style={optBtnStyle(showTime)}>표시</button>
              <button onClick={() => onShowTimeChange(false)} style={optBtnStyle(!showTime)}>숨김</button>
            </div>
            {cards.length > 0 && (
              <>
                <div style={labelStyle}>은행/카드</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => onCardFilterChange('all')} style={chipStyle(cardFilter === 'all')}>전체</button>
                  {cards.map(name => (
                    <button key={name} onClick={() => onCardFilterChange(name)} style={chipStyle(cardFilter === name)}>{name}</button>
                  ))}
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
