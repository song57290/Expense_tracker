import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api.js'
import { fmt, bankLogo, fmtMonth } from '../utils.js'

const BANKS = [
  ['신한은행', '/static/cards/sinhanbank.png', '신한은행'],
  ['KB국민은행', '/static/cards/kbbank.png', 'KB국민'],
  ['농협은행', '/static/cards/nhbank.png', '농협은행'],
  ['하나은행', '/static/cards/hanabank.png', '하나은행'],
  ['우리은행', '/static/cards/wooribank.png', '우리은행'],
  ['IBK기업은행', '/static/cards/ibkbank.png', 'IBK기업'],
  ['카카오뱅크', '/static/cards/kakaobank.png', '카카오뱅크'],
  ['토스뱅크', '/static/cards/tossbank.png', '토스뱅크'],
  ['케이뱅크', '/static/cards/kbank.png', '케이뱅크'],
  ['SC제일은행', '/static/cards/scbank.png', 'SC제일'],
  ['씨티은행', '/static/cards/citibank.png', '씨티은행'],
  ['iM뱅크', '/static/cards/imbank.png', 'iM뱅크'],
  ['수협은행', '/static/cards/suhyupbank.png', '수협은행'],
  ['KDB산업은행', '/static/cards/kdbbank.png', 'KDB산업'],
  ['BNK부산은행', '/static/cards/bnkbank.png', 'BNK부산'],
  ['우체국은행', '/static/cards/epostbank.png', '우체국'],
  ['SBI저축은행', '/static/cards/sbibank.png', 'SBI저축'],
  ['신협', '/static/cards/cubank.png', '신협'],
]
const CARD_COMPANIES = [
  ['BC카드', '/static/banks/bccard.png', 'BC카드'],
  ['현대카드', '/static/banks/hyundaicard.png', '현대카드'],
  ['롯데카드', '/static/banks/lottecard.png', '롯데카드'],
  ['삼성카드', '/static/banks/samsungcard.png', '삼성카드'],
]

function BankBtn({ bankName, logo, label, selected, onPick }) {
  const isSel = selected === bankName
  return (
    <button type="button" onClick={() => onPick(bankName)}
      className="d-flex flex-column align-items-center rounded-3 p-2 flex-shrink-0"
      style={{ border: `1.5px solid ${isSel ? '#b088f9' : '#e8d5ff'}`, background: isSel ? 'rgba(176,136,249,0.12)' : 'white', width: 72, cursor: 'pointer' }}>
      <img src={logo} style={{ width: 40, height: 40, objectFit: 'contain' }} />
      <span style={{ fontSize: 10, color: '#555', marginTop: 3, textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
    </button>
  )
}

function AddSheet({ open, visible, onClose, onSaved }) {
  const [selected, setSelected] = useState('')
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [url, setUrl] = useState('')
  const [tier1, setTier1] = useState(20)
  const [tier2, setTier2] = useState(50)
  const [tier3, setTier3] = useState(80)
  const [tierOpen, setTierOpen] = useState(false)

  function pick(cardName) { setSelected(cardName); setName(cardName) }

  async function handleSubmit(e) {
    e.preventDefault()
    const t = parseInt(target.replace(/,/g, '')) || 0
    await api.post('/api/cards', { name, target: t, url, tier1, tier2, tier3 })
    setSelected(''); setName(''); setTarget(''); setUrl('')
    setTier1(20); setTier2(50); setTier3(80); setTierOpen(false)
    onSaved(); onClose()
  }

  if (!open) return null
  return (
    <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'flex-end', justifyContent: 'center', opacity: visible ? 1 : 0, transition: 'opacity 0.28s ease' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '20px 16px 32px', transform: visible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="mb-0 fw-bold">카드 추가</h6>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#aaa', lineHeight: 1, padding: '0 4px' }}>&times;</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <form onSubmit={handleSubmit}>
            <p className="mb-1 text-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>은행</p>
            <div className="d-flex gap-2 overflow-auto pb-2 mb-2" style={{ scrollbarWidth: 'none' }}>
              {BANKS.map(([bname, logo, label]) => (
                <BankBtn key={bname} bankName={bname} logo={logo} label={label} selected={selected} onPick={pick} />
              ))}
            </div>
            <p className="mb-1 text-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>카드사</p>
            <div className="d-flex gap-2 pb-2 mb-3">
              {CARD_COMPANIES.map(([bname, logo, label]) => (
                <BankBtn key={bname} bankName={bname} logo={logo} label={label} selected={selected} onPick={pick} />
              ))}
            </div>
            <input type="text" className="form-control mb-2" placeholder="카드/은행 이름 (위 선택 시 자동 입력, 직접 수정 가능)"
              value={name} onChange={e => setName(e.target.value)} required style={{ borderRadius: 10 }} />
            <input type="text" className="form-control mb-2" placeholder="월 목표 금액" inputMode="numeric"
              value={target} onChange={e => {
                const raw = e.target.value.replace(/[^0-9]/g, '')
                setTarget(raw ? parseInt(raw).toLocaleString('ko-KR') : '')
              }} required style={{ borderRadius: 10 }} />
            <input type="url" className="form-control mb-3" placeholder="혜택 사이트 URL (선택)"
              value={url} onChange={e => setUrl(e.target.value)} style={{ borderRadius: 10 }} />
            <button type="button" style={{ fontSize: '0.8rem', color: '#b088f9', background: 'none', border: 'none', padding: 0 }}
              onClick={() => setTierOpen(o => !o)}>
              실적 구간 설정 {tierOpen ? '▴' : '▾'}
            </button>
            {tierOpen && (
              <div className="d-flex align-items-center gap-2 flex-wrap mt-2 mb-2">
                <span className="badge" style={{ background: '#dc3545' }}>빨강 ≤</span>
                <input type="number" className="form-control form-control-sm" style={{ width: 60 }} value={tier1} min={0} max={100} onChange={e => setTier1(+e.target.value)} />
                <span className="badge" style={{ background: '#ffc107', color: '#333' }}>노랑 ≤</span>
                <input type="number" className="form-control form-control-sm" style={{ width: 60 }} value={tier2} min={0} max={100} onChange={e => setTier2(+e.target.value)} />
                <span className="badge" style={{ background: '#0d6efd' }}>파랑 ≤</span>
                <input type="number" className="form-control form-control-sm" style={{ width: 60 }} value={tier3} min={0} max={100} onChange={e => setTier3(+e.target.value)} />
                <span className="badge" style={{ background: '#198754' }}>초록</span>
              </div>
            )}
            <button type="submit" className="btn w-100 mt-3" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 600 }}>추가하기</button>
          </form>
        </div>
      </div>
    </div>
  )
}

function SwipeCard({ card, onEdit, onDelete }) {
  const startX = useRef(null)
  const startY = useRef(null)
  const [offsetX, setOffsetX] = useState(0)
  const horiz = useRef(false)

  const onTouchStart = e => {
    const cx = e.touches[0].clientX
    if (cx < 50 || cx > window.innerWidth - 50) return
    startX.current = cx
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
      <div data-item-swipe style={{ position: 'relative', zIndex: 1, background: 'white', borderRadius: 16, padding: 16, transform: `translateX(${offsetX}px)`, transition: offsetX === 0 ? 'transform 0.22s ease' : 'none', cursor: 'grab', userSelect: 'none' }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
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
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [addSheetVisible, setAddSheetVisible] = useState(false)

  const load = useCallback(() => api.get('/api/budget').then(setData).catch(console.error), [])
  useEffect(() => { load() }, [load])

  function openAdd() {
    setAddSheetOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setAddSheetVisible(true)))
  }
  function closeAdd() {
    setAddSheetVisible(false)
    setTimeout(() => setAddSheetOpen(false), 350)
  }

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
      name: editCard.name, target,
      tier1: editCard.tier1, tier2: editCard.tier2, tier3: editCard.tier3,
      account_balance: initial,
    })
    closeEdit(); load()
  }

  async function handleDelete() {
    if (!confirmCard) return
    await api.delete(`/api/cards/${confirmCard.id}`)
    setConfirmCard(null); load()
  }

  function fmtInput(val, setter) {
    const raw = val.replace(/[^0-9]/g, '')
    setter(raw ? parseInt(raw).toLocaleString('ko-KR') : '')
  }

  if (!data) return <div className="text-center py-5"><div className="spinner-border" style={{ color: '#b088f9' }} /></div>

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3 px-1">
        <span className="fw-semibold" style={{ fontSize: '1rem', color: '#333' }}>{fmtMonth(data.current_month)} 카드별 잔고</span>
        <button onClick={openAdd} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '6px 14px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
          <i className="bi bi-plus-lg me-1" />카드 추가
        </button>
      </div>

      {data.card_stats.length === 0 ? (
        <div className="card mb-4 text-center">
          <div className="card-body py-5 text-muted">
            <i className="bi bi-credit-card" style={{ fontSize: '2rem' }} />
            <p className="mt-2 mb-0">등록된 카드가 없습니다</p>
            <button onClick={openAdd} className="btn btn-sm mt-3" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>카드 추가 →</button>
          </div>
        </div>
      ) : (
        data.card_stats.map(card => (
          <SwipeCard key={card.id} card={card} onEdit={() => openEdit(card)} onDelete={() => setConfirmCard(card)} />
        ))
      )}

      <div className="d-lg-none" style={{ height: 90 }} />

      <AddSheet open={addSheetOpen} visible={addSheetVisible} onClose={closeAdd} onSaved={load} />

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
