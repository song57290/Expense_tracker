import { useState } from 'react'
import { createPortal } from 'react-dom'
import { cardLogo } from '../utils.js'
import DatePickerSheet from './DatePickerSheet.jsx'

// 여러 내역을 한 번에 바꾸는 하단 선택 바 (홈·캘린더 공용)
// onRun(action, value) 로 /api/transactions/bulk 를 호출한다
export default function BulkBar({ count, busy, cards, expenseCats, incomeCats, perfAllExcluded, statsAllExcluded, onRun, onExit }) {
  const [picker, setPicker] = useState(null) // 'card' | 'category' | 'date' | null
  const [confirm, setConfirm] = useState(false)
  const [dateValue, setDateValue] = useState('')
  const disabled = !count || busy

  const buttonStyle = { pointerEvents: 'auto', padding: '8px 0', borderRadius: 10, border: '1px solid var(--border-light)', background: 'var(--bg-accent)', color: 'var(--text-primary)', fontSize: '0.78rem', opacity: count ? 1 : 0.5 }
  const dangerStyle = { pointerEvents: 'auto', padding: '8px 0', borderRadius: 10, border: 'none', background: '#dc3545', color: 'white', fontSize: '0.78rem', fontWeight: 600, opacity: count ? 1 : 0.5 }

  return (
    <>
      {createPortal(
        <div data-bulk-bar style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 3500, background: 'var(--bg-card)', borderTop: '1px solid var(--border-light)', boxShadow: '0 -4px 16px rgba(0,0,0,0.08)', padding: '12px 12px max(32px, calc(env(safe-area-inset-bottom) + 16px))', pointerEvents: 'none' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>{count}개 선택</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <button type="button" disabled={disabled} onClick={() => setPicker('card')} style={buttonStyle}>카드 변경</button>
            <button type="button" disabled={disabled} onClick={() => setPicker('category')} style={buttonStyle}>카테고리 변경</button>
            <button type="button" disabled={disabled} onClick={() => setPicker('date')} style={buttonStyle}>날짜 변경</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
            <button type="button" disabled={disabled} onClick={() => onRun('set_exclude_perf', !perfAllExcluded)} style={buttonStyle}>{perfAllExcluded ? '실적 포함' : '실적 제외'}</button>
            <button type="button" disabled={disabled} onClick={() => onRun('set_exclude_stats', !statsAllExcluded)} style={buttonStyle}>{statsAllExcluded ? '통계 포함' : '통계 제외'}</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
            <button type="button" disabled={disabled} onClick={() => setConfirm(true)} style={dangerStyle}>삭제</button>
            <button type="button" onClick={onExit}
              style={{ pointerEvents: 'auto', padding: '8px 0', borderRadius: 10, border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.78rem' }}>취소</button>
          </div>
        </div>,
        document.body
      )}

      {picker && picker !== 'date' && createPortal(
        <div onClick={e => e.target === e.currentTarget && setPicker(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3600, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '72dvh', overflowY: 'auto', overscrollBehavior: 'contain', paddingBottom: 'max(40px, calc(env(safe-area-inset-bottom) + 24px))' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-light)' }} />
            </div>
            <div style={{ padding: '6px 20px 12px', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
              {picker === 'card' ? '카드/계좌 선택' : '카테고리 선택'}
            </div>
            {picker === 'card'
              ? cards.map(card => {
                const logo = cardLogo(card)
                return (
                  <div key={card.id ?? card.name} onClick={() => { setPicker(null); onRun('set_card', card.name) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 20px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)' }}>
                    <div style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {logo
                        ? <img src={logo} style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 8 }} />
                        : <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700 }}>{card.name.slice(0, 2)}</span>}
                    </div>
                    <span style={{ flex: 1, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{card.name}</span>
                  </div>
                )
              })
              : [...(expenseCats || []), ...(incomeCats || [])].map(([name, icon]) => (
                <div key={name} onClick={() => { setPicker(null); onRun('set_category', name) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 20px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.2rem', color: 'var(--text-muted)' }}>
                    {icon?.startsWith?.('bi-') ? <i className={`bi ${icon}`} /> : (icon || '•')}
                  </div>
                  <span style={{ flex: 1, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{name}</span>
                </div>
              ))}
          </div>
        </div>,
        document.body
      )}

      {picker === 'date' && createPortal(
        <div onClick={e => e.target === e.currentTarget && setPicker(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3600, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', padding: '16px 20px max(32px, calc(env(safe-area-inset-bottom) + 24px))' }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>선택한 {count}개 내역의 날짜</div>
            <DatePickerSheet value={dateValue} onChange={setDateValue} />
            <div className="d-flex gap-2 mt-3">
              <button className="btn btn-outline-secondary flex-fill" onClick={() => setPicker(null)} style={{ borderRadius: 10 }}>취소</button>
              <button className="btn flex-fill" disabled={!dateValue || busy}
                onClick={() => { const v = dateValue; setPicker(null); onRun('set_date', v) }}
                style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>변경</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirm && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 3700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px', width: 'min(88vw,320px)' }}>
            <p className="text-center fw-semibold mb-1">{count}개 내역을 삭제할까요?</p>
            <p className="text-center text-muted mb-3" style={{ fontSize: '0.8rem' }}>삭제하면 되돌릴 수 없어요.</p>
            <div className="d-flex gap-2">
              <button className="btn flex-fill" disabled={busy} onClick={() => { setConfirm(false); onRun('delete') }} style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: 10 }}>삭제</button>
              <button className="btn btn-outline-secondary flex-fill" onClick={() => setConfirm(false)} style={{ borderRadius: 10 }}>취소</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

// 행 왼쪽 선택 자리: 선택 모드가 되면 너비가 늘어나면서 동그라미가 스윽 밀려 들어온다 (CSS .select-slot)
export function SelectSlot({ on }) {
  return (
    <div className="select-slot">
      <div style={{ paddingLeft: 14 }}>
        <SelectCircle on={on} />
      </div>
    </div>
  )
}

// 선택 여부를 보여주는 원형 체크 (행 왼쪽, 날짜 헤더는 small)
export function SelectCircle({ on, small }) {
  const size = small ? 18 : 22
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, marginRight: small ? 0 : 10, border: `2px solid ${on ? '#b088f9' : 'var(--text-muted)'}`, background: on ? '#b088f9' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.12s ease, border-color 0.12s ease' }}>
      <i className="bi bi-check" style={{ color: 'white', fontSize: small ? '0.7rem' : '0.9rem', fontWeight: 700, opacity: on ? 1 : 0, transform: on ? 'scale(1)' : 'scale(0.6)', transition: 'opacity 0.12s ease, transform 0.12s ease' }} />
    </div>
  )
}
