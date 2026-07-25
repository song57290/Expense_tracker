import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { bankLogo } from '../utils.js'

function AccountSheet({ title, accounts, value, onChange, onClose, visible, drag, onTouchStart, onTouchMove, onTouchEnd }) {
  return createPortal(
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
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
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-light)' }} />
        </div>
        <div style={{ padding: '6px 20px 12px', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
          {title}
        </div>
        {accounts.map(acc => {
          const isSelected = value === acc.name
          const logo = bankLogo(acc.name)
          return (
            <div key={acc.id ?? acc.name} onClick={() => { onChange(acc.name); onClose() }} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '11px 20px', cursor: 'pointer',
              background: isSelected ? 'rgba(176,136,249,0.08)' : 'transparent',
              borderBottom: '1px solid var(--border-light)',
              transition: 'background 0.15s',
            }}>
              <div style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {logo
                  ? <img src={logo} style={{ width: 40, height: 40, objectFit: 'contain' }} />
                  : <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700 }}>{acc.name.slice(0, 2)}</span>}
              </div>
              <span style={{ flex: 1, fontSize: '0.95rem', fontWeight: isSelected ? 600 : 400, color: isSelected ? '#b088f9' : 'var(--text-primary)' }}>
                {acc.name}
              </span>
              {isSelected && <i className="bi bi-check-circle-fill" style={{ color: '#b088f9', fontSize: '1.1rem' }} />}
            </div>
          )
        })}
      </div>
    </div>,
    document.body
  )
}

export default function TransferPicker({ accounts, from, to, onFromChange, onToChange }) {
  const [openSheet, setOpenSheet] = useState(null) // 'from' | 'to' | null
  const [visible, setVisible] = useState(false)
  const [drag, setDrag] = useState(0)
  const touchStartY = useRef(null)

  function open(which) {
    setOpenSheet(which)
    setDrag(0)
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
  }
  function close() {
    setVisible(false)
    setDrag(0)
    setTimeout(() => setOpenSheet(null), 300)
  }

  function onTouchStart(e) {
    if (e.currentTarget.scrollTop === 0) touchStartY.current = e.touches[0].clientY
  }
  function onTouchMove(e) {
    if (touchStartY.current === null) return
    const dy = e.touches[0].clientY - touchStartY.current
    if (dy > 0) setDrag(dy)
    else touchStartY.current = null
  }
  function onTouchEnd() {
    if (drag > 100) close()
    else setDrag(0)
    touchStartY.current = null
  }

  function AccountCard({ value, which }) {
    const acc = accounts.find(a => a.name === value)
    const logo = acc ? bankLogo(acc.name) : null
    return (
      <button type="button" onClick={() => open(which)} style={{
        flex: 1, display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--bg-card)', borderRadius: 10,
        padding: '8px 12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        border: acc ? '1.5px solid rgba(176,136,249,0.35)' : '1.5px solid var(--border-light)',
        minHeight: 42, cursor: 'pointer',
      }}>
        {acc && logo && <img src={logo} style={{ width: 22, height: 22, objectFit: 'contain', flexShrink: 0 }} />}
        {acc && !logo && <span style={{ fontSize: '0.78rem', color: '#b088f9', fontWeight: 700, flexShrink: 0 }}>{acc.name.slice(0, 2)}</span>}
        <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: acc ? 600 : 400, color: acc ? 'var(--text-primary)' : 'var(--text-muted)', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {acc ? acc.name : '선택'}
        </span>
        <i className="bi bi-chevron-down" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }} />
      </button>
    )
  }

  return (
    <>
      <div style={{ background: 'var(--bg-accent)', borderRadius: 14, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ flex: 1, textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>📤 보내는 계좌</span>
          <i className="bi bi-arrow-right" style={{ color: '#b088f9', fontSize: '1.15rem', margin: '0 4px', flexShrink: 0, filter: 'drop-shadow(0 0 1px rgba(176,136,249,0.4))' }} />
          <span style={{ flex: 1, textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>📥 받는 계좌</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <AccountCard value={from} which="from" />
          <AccountCard value={to} which="to" />
        </div>
      </div>

      {openSheet && (
        <AccountSheet
          title={openSheet === 'from' ? '📤 보내는 계좌' : '📥 받는 계좌'}
          accounts={accounts}
          value={openSheet === 'from' ? from : to}
          onChange={openSheet === 'from' ? onFromChange : onToChange}
          onClose={close}
          visible={visible}
          drag={drag}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />
      )}
    </>
  )
}
