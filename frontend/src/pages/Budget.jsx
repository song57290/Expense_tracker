import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../api.js'
import { fmt, bankLogo } from '../utils.js'

function SwipeCard({ card, onEdit, onDelete }) {
  const startX = useRef(null)
  const startY = useRef(null)
  const [offsetX, setOffsetX] = useState(0)
  const horiz = useRef(false)

  const onTouchStart = e => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    horiz.current = false
  }
  const onTouchMove = e => {
    if (startX.current === null) return
    const dx = startX.current - e.touches[0].clientX
    const dy = startY.current - e.touches[0].clientY
    if (!horiz.current) {
      if (Math.abs(dy) > Math.abs(dx)) { startX.current = null; return }
      if (Math.abs(dx) > 8) horiz.current = true; else return
    }
    e.preventDefault()
    setOffsetX(Math.max(-110, Math.min(110, -dx)))
  }
  const onTouchEnd = () => {
    if (startX.current === null) return
    const cur = offsetX
    startX.current = null
    if (cur < -60) { setOffsetX(0); onDelete() }
    else if (cur > 60) { setOffsetX(0); onEdit() }
    else setOffsetX(0)
  }

  const tierClass = (pct, t1, t2, t3) => {
    if (pct > t3) return 'bg-success'
    if (pct > t2) return 'bg-primary'
    if (pct > t1) return 'bg-warning'
    return 'bg-danger'
  }

  const logo = bankLogo(card.name)

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 16, marginBottom: 12 }}>
      <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 80, background: '#dc3545', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'white', fontSize: '0.75rem', gap: 2 }}>
        <i className="bi bi-trash" style={{ fontSize: '1.15rem' }} />삭제
      </div>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: 80, background: '#198754', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'white', fontSize: '0.75rem', gap: 2 }}>
        <i className="bi bi-pencil" style={{ fontSize: '1.15rem' }} />수정
      </div>
      <div style={{ position: 'relative', zIndex: 1, background: 'white', borderRadius: 16, padding: 16, transform: `translateX(${offsetX}px)`, transition: offsetX === 0 ? 'transform 0.22s ease' : 'none', cursor: 'grab', userSelect: 'none' }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        {/* 카드명 + 잔고 */}
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="d-flex align-items-center gap-2">
            {logo && <img src={logo} style={{ height: 26, width: 26, objectFit: 'contain', borderRadius: 5, flexShrink: 0 }} />}
            <span className="fw-semibold">{card.name}</span>
          </div>
          <div className="text-end">
            <div className="fw-bold" style={{ fontSize: '1.15rem', color: card.balance < 0 ? '#dc3545' : '#198754' }}>
              {card.balance < 0 ? '-' : ''}{fmt(Math.abs(card.balance))}원
            </div>
            <div className="text-muted" style={{ fontSize: '0.7rem' }}>잔고</div>
          </div>
        </div>
        {/* 수입/지출/초기잔고 소계 */}
        <div className="d-flex mb-3" style={{ gap: 1 }}>
          <div className="text-center flex-fill" style={{ borderRight: '1px solid #eee' }}>
            <div className="text-muted" style={{ fontSize: '0.62rem' }}>초기</div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#555' }}>{fmt(card.initial_balance)}</div>
          </div>
          <div className="text-center flex-fill" style={{ borderRight: '1px solid #eee' }}>
            <div className="text-muted" style={{ fontSize: '0.62rem' }}>수입</div>
            <div className="text-success" style={{ fontSize: '0.72rem', fontWeight: 600 }}>{fmt(card.total_income)}</div>
          </div>
          <div className="text-center flex-fill">
            <div className="text-muted" style={{ fontSize: '0.62rem' }}>지출</div>
            <div className="text-danger" style={{ fontSize: '0.72rem', fontWeight: 600 }}>{fmt(card.total_expense)}</div>
          </div>
        </div>
        {/* 이달 실적 */}
        <div className="border-top pt-2">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>이달 실적</span>
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>{fmt(card.spent)} / {fmt(card.target)}원</span>
          </div>
          <div className="progress" style={{ height: 7, borderRadius: 4 }}>
            <div className={`progress-bar ${tierClass(card.percent, card.tier1, card.tier2, card.tier3)}`}
              style={{ width: `${card.percent}%`, borderRadius: 4 }} />
          </div>
          <div className="text-end mt-1" style={{ fontSize: '0.72rem', color: '#aaa' }}>{card.percent}%</div>
        </div>
      </div>
    </div>
  )
}

export default function Budget() {
  const [data, setData] = useState(null)
  const [confirmCard, setConfirmCard] = useState(null)
  const [editCard, setEditCard] = useState(null)
  const [editInitial, setEditInitial] = useState('')
  const [editTarget, setEditTarget] = useState('')
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [editSheetVisible, setEditSheetVisible] = useState(false)

  const load = useCallback(() => api.get('/api/budget').then(setData).catch(console.error), [])
  useEffect(() => { load() }, [load])

  function openEdit(card) {
    setEditCard(card)
    setEditInitial((card.initial_balance || 0).toLocaleString('ko-KR'))
    setEditTarget((card.target || 0).toLocaleString('ko-KR'))
    setEditSheetOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setEditSheetVisible(true)))
  }
  function closeEdit() {
    setEditSheetVisible(false)
    setTimeout(() => setEditSheetOpen(false), 350)
  }

  async function handleEditSave(e) {
    e.preventDefault()
    const initial = parseInt(editInitial.replace(/,/g, '')) || 0
    const target = parseInt(editTarget.replace(/,/g, '')) || 0
    await api.put(`/api/cards/${editCard.id}`, {
      name: editCard.name,
      target,
      tier1: editCard.tier1, tier2: editCard.tier2, tier3: editCard.tier3,
      account_balance: initial,
    })
    closeEdit()
    load()
  }

  async function handleDelete() {
    if (!confirmCard) return
    await api.delete(`/api/cards/${confirmCard.id}`)
    setConfirmCard(null)
    load()
  }

  function fmtInput(val, setter) {
    const raw = val.replace(/[^0-9]/g, '')
    setter(raw ? parseInt(raw).toLocaleString('ko-KR') : '')
  }

  if (!data) return <div className="text-center py-5"><div className="spinner-border" style={{ color: '#b088f9' }} /></div>

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3 px-1">
        <span className="fw-semibold" style={{ fontSize: '1rem', color: '#333' }}>{data.current_month} 카드별 잔고</span>
      </div>

      {data.card_stats.length === 0 ? (
        <div className="card mb-4 text-center">
          <div className="card-body py-5 text-muted">
            <i className="bi bi-credit-card" style={{ fontSize: '2rem' }} />
            <p className="mt-2 mb-0">등록된 카드가 없습니다</p>
            <Link to="/cards" className="btn btn-sm mt-3" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>카드 추가 →</Link>
          </div>
        </div>
      ) : (
        data.card_stats.map(card => (
          <SwipeCard key={card.id} card={card} onEdit={() => openEdit(card)} onDelete={() => setConfirmCard(card)} />
        ))
      )}

      <div className="d-lg-none" style={{ height: 90 }} />

      {/* 삭제 확인 */}
      {confirmCard && (
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 20, padding: '24px 20px', width: 'min(88vw,320px)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <p className="text-center fw-semibold mb-4" style={{ fontSize: '1rem' }}>카드를 삭제하시겠습니까?</p>
            <div className="d-flex gap-2">
              <button className="btn flex-fill" onClick={handleDelete} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>확인</button>
              <button className="btn btn-outline-secondary flex-fill" onClick={() => setConfirmCard(null)} style={{ borderRadius: 10 }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 수정 시트 */}
      {editSheetOpen && (
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'flex-end', justifyContent: 'center', opacity: editSheetVisible ? 1 : 0, transition: 'opacity 0.28s ease' }}
          onClick={e => e.target === e.currentTarget && closeEdit()}>
          <div style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', padding: '20px 16px 32px', transform: editSheetVisible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h6 className="mb-0 fw-bold">{editCard?.name} 수정</h6>
              <button onClick={closeEdit} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#aaa', lineHeight: 1, padding: '0 4px' }}>&times;</button>
            </div>
            <form onSubmit={handleEditSave}>
              <div className="mb-3">
                <label className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>초기 잔고 (앱 사용 시작 전 계좌 잔액)</label>
                <input type="text" inputMode="numeric" className="form-control" style={{ borderRadius: 10, fontSize: '1rem' }}
                  value={editInitial} onChange={e => fmtInput(e.target.value, setEditInitial)} />
              </div>
              <div className="mb-4">
                <label className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>월 실적 목표 금액</label>
                <input type="text" inputMode="numeric" className="form-control" style={{ borderRadius: 10, fontSize: '1rem' }}
                  value={editTarget} onChange={e => fmtInput(e.target.value, setEditTarget)} />
              </div>
              <div className="d-flex gap-2">
                <button type="submit" className="btn flex-fill" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>저장</button>
                <button type="button" className="btn btn-outline-secondary flex-fill" onClick={closeEdit} style={{ borderRadius: 10 }}>취소</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
