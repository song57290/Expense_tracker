import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api.js'
import { fmt, bankLogo, fmtMonth, today } from '../utils.js'

const BANKS = [
  ['신한은행', '/static/cards/sinhanbank.png', '신한은행'],
  ['국민은행', '/static/cards/kbbank.png', 'KB국민'],
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
  const [assetType, setAssetType] = useState('card')
  const [selected, setSelected] = useState('')
  const [name, setName] = useState('')
  const [initialBalance, setInitialBalance] = useState('')
  const [target, setTarget] = useState('')
  const [url, setUrl] = useState('')
  const [tier1, setTier1] = useState(20)
  const [tier2, setTier2] = useState(50)
  const [tier3, setTier3] = useState(80)
  const [tierOpen, setTierOpen] = useState(false)

  function pick(cardName) { setSelected(cardName); setName(cardName) }

  function switchType(t) {
    setAssetType(t)
    setSelected(''); setName(t === 'cash' ? '현금' : ''); setUrl('')
    setInitialBalance(t === 'loan' ? '-' : '')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const t = parseInt(target.replace(/,/g, '')) || 0
    const ib = parseInt(initialBalance.replace(/,/g, '')) || 0
    await api.post('/api/cards', { name, target: t, url, tier1, tier2, tier3, account_balance: ib })
    setAssetType('card'); setSelected(''); setName(''); setInitialBalance(''); setTarget(''); setUrl('')
    setTier1(20); setTier2(50); setTier3(80); setTierOpen(false)
    onSaved(); onClose()
  }

  if (!open) return null
  return (
    <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'flex-end', justifyContent: 'center', opacity: visible ? 1 : 0, transition: 'opacity 0.28s ease' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '20px 16px 32px', transform: visible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="mb-0 fw-bold">자산 추가</h6>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#aaa', lineHeight: 1, padding: '0 4px' }}>&times;</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, paddingBottom: 20 }}>
          <form id="add-card-form" onSubmit={handleSubmit}>
            {/* 자산 유형 선택 */}
            <div className="d-flex gap-2 mb-3">
              {[['card', '💳 카드 / 은행'], ['cash', '💵 현금'], ['loan', '💸 대출']].map(([t, label]) => (
                <button key={t} type="button" onClick={() => switchType(t)}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: `2px solid ${assetType === t ? (t === 'loan' ? '#dc3545' : '#b088f9') : '#eee'}`, background: assetType === t ? (t === 'loan' ? 'rgba(220,53,69,0.08)' : 'rgba(176,136,249,0.1)') : 'white', color: assetType === t ? (t === 'loan' ? '#dc3545' : '#b088f9') : '#888', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>

            {(assetType === 'card' || assetType === 'loan') && (<>
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
            </>)}

            <input type="text" className="form-control mb-2"
              placeholder={assetType === 'cash' ? '이름 (예: 현금, 지갑)' : assetType === 'loan' ? '이름 (예: 전세 대출, 카드빚)' : '카드/은행 이름 (위 선택 시 자동 입력)'}
              value={name} onChange={e => setName(e.target.value)} required style={{ borderRadius: 10 }} />
            <div className="mb-2" style={{ position: 'relative' }}>
              <input type="text" className="form-control" placeholder={assetType === 'loan' ? '부채 금액 (예: -5,000,000)' : '초기 잔고 (음수 입력 시 -부터, 선택)'} inputMode="text"
                value={initialBalance} onChange={e => {
                  const neg = e.target.value.startsWith('-')
                  const raw = e.target.value.replace(/[^0-9]/g, '')
                  if (!raw) { setInitialBalance(neg ? '-' : ''); return }
                  setInitialBalance((neg ? '-' : '') + parseInt(raw).toLocaleString('ko-KR'))
                }} style={{ borderRadius: 10, paddingRight: 36 }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
            </div>
            <div className="mb-2" style={{ position: 'relative' }}>
              <input type="text" className="form-control" placeholder={assetType === 'loan' ? '월 상환 목표 (선택)' : assetType === 'cash' ? '월 지출 목표 (선택)' : '월 목표 금액 (선택)'} inputMode="numeric"
                value={target} onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, '')
                  setTarget(raw ? parseInt(raw).toLocaleString('ko-KR') : '')
                }} style={{ borderRadius: 10, paddingRight: 36 }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
            </div>
            {assetType === 'card' && (
              <input type="url" className="form-control mb-3" placeholder="혜택 사이트 URL (선택)"
                value={url} onChange={e => setUrl(e.target.value)} style={{ borderRadius: 10 }} />
            )}
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
          </form>
        </div>
        <div style={{ padding: '12px 0 48px', flexShrink: 0 }}>
          <div className="d-flex gap-2">
            <button type="submit" form="add-card-form" className="btn flex-fill" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 600 }}>추가하기</button>
            <button type="button" className="btn btn-outline-secondary flex-fill" onClick={onClose} style={{ borderRadius: 10, padding: '12px 0', fontWeight: 600 }}>취소</button>
          </div>
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
  const cardRef = useRef(null)
  const mouseDown = useRef(false)

  const onDragStart = e => {
    if (e.touches) {
      const cx = e.touches[0].clientX
      const wrap = e.currentTarget.closest('.page-wrap')
      const rect = wrap ? wrap.getBoundingClientRect() : { left: 0, width: window.innerWidth }
      if (cx - rect.left < 80 || cx - rect.left > rect.width - 80) return
      startX.current = cx; startY.current = e.touches[0].clientY; horiz.current = false
    } else {
      startX.current = e.clientX; startY.current = e.clientY; horiz.current = true
      mouseDown.current = true; setOffsetX(0)
    }
  }
  const onDragMove = e => {
    if (startX.current === null) return
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    const cy = e.touches ? e.touches[0].clientY : e.clientY
    const dx = startX.current - cx
    const dy = startY.current - cy
    if (!horiz.current) {
      if (Math.abs(dy) > Math.abs(dx)) { startX.current = null; return }
      if (Math.abs(dx) > 8) horiz.current = true; else return
    }
    if (e.touches) e.preventDefault()
    const maxSlide = cardRef.current ? Math.floor(cardRef.current.offsetWidth / 4) : 80
    setOffsetX(Math.max(-maxSlide, Math.min(maxSlide, -dx)))
  }
  const onDragEnd = () => {
    mouseDown.current = false
    if (startX.current === null) return
    const cur = offsetX
    startX.current = null
    const trigger = cardRef.current ? Math.floor(cardRef.current.offsetWidth / 8) : 40
    if (cur < -trigger) { setOffsetX(0); onDelete() }
    else if (cur > trigger) { setOffsetX(0); onEdit() }
    else setOffsetX(0)
  }
  const onTouchStart = onDragStart; const onTouchMove = onDragMove; const onTouchEnd = onDragEnd

  const tierClass = (pct, t1, t2, t3) => {
    if (pct > t3) return 'bg-success'
    if (pct > t2) return 'bg-primary'
    if (pct > t1) return 'bg-warning'
    return 'bg-danger'
  }

  const logo = bankLogo(card.name)
  const isCash = !logo && (card.name.includes('현금') || card.name.includes('지갑'))
  const isLoan = !logo && !isCash && card.initial_balance < 0
  const deleteWidth = Math.max(0, -offsetX)
  const editWidth = Math.max(0, offsetX)

  return (
    <div ref={cardRef} style={{ position: 'relative', overflow: 'hidden', borderRadius: 16, marginBottom: 12 }}>
      <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: deleteWidth, background: '#dc3545', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'white', fontSize: '0.75rem', gap: 2, overflow: 'hidden' }}>
        <i className="bi bi-trash" style={{ fontSize: '1.15rem', flexShrink: 0 }} /><span>삭제</span>
      </div>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: editWidth, background: '#198754', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'white', fontSize: '0.75rem', gap: 2, overflow: 'hidden' }}>
        <i className="bi bi-pencil" style={{ fontSize: '1.15rem', flexShrink: 0 }} /><span>수정</span>
      </div>
      <div data-item-swipe style={{ position: 'relative', zIndex: 1, background: 'white', padding: 16, transform: `translateX(${offsetX}px)`, transition: offsetX === 0 ? 'transform 0.22s ease' : 'none', cursor: 'grab', userSelect: 'none' }}
        onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
        onMouseDown={onDragStart} onMouseMove={e => { if (mouseDown.current) onDragMove(e) }} onMouseUp={onDragEnd} onMouseLeave={onDragEnd}>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="d-flex align-items-center gap-2">
            {logo && <img src={logo} style={{ height: 26, width: 26, objectFit: 'contain', borderRadius: 5, flexShrink: 0 }} />}
            {isCash && <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>💵</span>}
            {isLoan && <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>💸</span>}
            <span className="fw-semibold">{card.name}</span>
            {card.url && (
              <a href={card.url} target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', color: '#b088f9', fontSize: '0.75rem', textDecoration: 'underline', lineHeight: 1, fontWeight: 600 }}>
                🔗 혜택 사이트
              </a>
            )}
          </div>
          <div className="text-end">
            <div className="text-muted" style={{ fontSize: '0.7rem' }}>잔고</div>
            <div className="fw-bold" style={{ fontSize: '1.15rem', color: card.balance < 0 ? '#dc3545' : '#198754' }}>
              {card.balance < 0 ? '-' : ''}{fmt(Math.abs(card.balance))}원
            </div>
          </div>
        </div>
        <div className="d-flex mb-3" style={{ gap: 1 }}>
          <div className="text-center flex-fill" style={{ borderRight: '1px solid #eee' }}>
            <div className="text-muted" style={{ fontSize: '0.8rem' }}>초기</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: card.initial_balance < 0 ? '#dc3545' : '#555' }}>{fmt(card.initial_balance)}</div>
          </div>
          <div className="text-center flex-fill" style={{ borderRight: '1px solid #eee' }}>
            <div className="text-muted" style={{ fontSize: '0.8rem' }}>이달 수입</div>
            <div className="text-success" style={{ fontSize: '0.9rem', fontWeight: 600 }}>{fmt(card.total_income)}</div>
          </div>
          <div className="text-center flex-fill">
            <div className="text-muted" style={{ fontSize: '0.8rem' }}>이달 지출</div>
            <div className="text-danger" style={{ fontSize: '0.9rem', fontWeight: 600 }}>{fmt(card.total_expense)}</div>
          </div>
        </div>
        <div className="border-top pt-2">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <span className="text-muted" style={{ fontSize: '0.8rem' }}>이달 실적</span>
            <span className="text-muted" style={{ fontSize: '0.8rem' }}>{fmt(card.spent)} / {fmt(card.target)}원</span>
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

function SavingsItem({ item, onEdit, onDelete, onDepositChange }) {
  const startX = useRef(null)
  const startY = useRef(null)
  const [offsetX, setOffsetX] = useState(0)
  const horiz = useRef(false)
  const cardRef = useRef(null)
  const mouseDown = useRef(false)
  const [depositOpen, setDepositOpen] = useState(false)
  const [deposits, setDeposits] = useState([])
  const [depForm, setDepForm] = useState({ amount: '', date: today(), memo: '' })
  const [depLoading, setDepLoading] = useState(false)

  async function loadDeposits() {
    const res = await api.get(`/api/savings/${item.id}/deposits`)
    setDeposits(res || [])
  }

  function toggleDeposit() {
    if (!depositOpen) loadDeposits()
    setDepositOpen(o => !o)
  }

  async function addDeposit(e) {
    e.preventDefault()
    setDepLoading(true)
    await api.post(`/api/savings/${item.id}/deposits`, { amount: Number(depForm.amount) || 0, date: depForm.date, memo: depForm.memo })
    setDepForm({ amount: '', date: today(), memo: '' })
    await loadDeposits()
    setDepLoading(false)
    if (onDepositChange) onDepositChange()
  }

  async function deleteDeposit(did) {
    await api.delete(`/api/savings/deposits/${did}`)
    await loadDeposits()
    if (onDepositChange) onDepositChange()
  }

  const onDragStart = e => {
    if (e.touches) {
      const cx = e.touches[0].clientX
      const wrap = e.currentTarget.closest('.page-wrap')
      const rect = wrap ? wrap.getBoundingClientRect() : { left: 0, width: window.innerWidth }
      if (cx - rect.left < 80 || cx - rect.left > rect.width - 80) return
      startX.current = cx; startY.current = e.touches[0].clientY; horiz.current = false
    } else {
      startX.current = e.clientX; startY.current = e.clientY; horiz.current = true
      mouseDown.current = true; setOffsetX(0)
    }
  }
  const onDragMove = e => {
    if (startX.current === null) return
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    const cy = e.touches ? e.touches[0].clientY : e.clientY
    const dx = startX.current - cx; const dy = startY.current - cy
    if (!horiz.current) {
      if (Math.abs(dy) > Math.abs(dx)) { startX.current = null; return }
      if (Math.abs(dx) > 8) horiz.current = true; else return
    }
    if (e.touches) e.preventDefault()
    const maxSlide = cardRef.current ? Math.floor(cardRef.current.offsetWidth / 4) : 80
    setOffsetX(Math.max(-maxSlide, Math.min(maxSlide, -dx)))
  }
  const onDragEnd = () => {
    mouseDown.current = false
    if (startX.current === null) return
    const cur = offsetX; startX.current = null
    const trigger = cardRef.current ? Math.floor(cardRef.current.offsetWidth / 8) : 40
    if (cur < -trigger) { setOffsetX(0); onDelete() }
    else if (cur > trigger) { setOffsetX(0); onEdit() }
    else setOffsetX(0)
  }

  const logo = bankLogo(item.bank || item.name)
  const deleteWidth = Math.max(0, -offsetX)
  const editWidth = Math.max(0, offsetX)
  const isCheongYak = item.stype === '청약'
  const dDayText = isCheongYak ? `납입 ${item.months_elapsed}회` : item.d_day > 0 ? `D-${item.d_day}` : item.d_day === 0 ? 'D-Day' : `D+${Math.abs(item.d_day)}`
  const dDayColor = isCheongYak ? '#198754' : item.d_day < 0 ? '#198754' : item.d_day < 30 ? '#dc3545' : '#b088f9'

  return (
    <div ref={cardRef} style={{ position: 'relative', overflow: 'hidden', borderRadius: 16, marginBottom: 12 }}>
      <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: deleteWidth, background: '#dc3545', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'white', fontSize: '0.75rem', gap: 2, overflow: 'hidden' }}>
        <i className="bi bi-trash" style={{ fontSize: '1.15rem', flexShrink: 0 }} /><span>삭제</span>
      </div>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: editWidth, background: '#198754', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'white', fontSize: '0.75rem', gap: 2, overflow: 'hidden' }}>
        <i className="bi bi-pencil" style={{ fontSize: '1.15rem', flexShrink: 0 }} /><span>수정</span>
      </div>
      <div data-item-swipe style={{ position: 'relative', zIndex: 1, background: 'white', padding: 16, transform: `translateX(${offsetX}px)`, transition: offsetX === 0 ? 'transform 0.22s ease' : 'none', cursor: 'grab', userSelect: 'none' }}
        onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
        onMouseDown={onDragStart} onMouseMove={e => { if (mouseDown.current) onDragMove(e) }} onMouseUp={onDragEnd} onMouseLeave={onDragEnd}>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="d-flex align-items-center gap-2">
            {logo && <img src={logo} style={{ height: 26, width: 26, objectFit: 'contain', borderRadius: 5, flexShrink: 0 }} />}
            <span className="fw-semibold">{item.name}</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: 8, background: item.stype === '예금' ? '#e8f4fd' : item.stype === '청약' ? '#e8fdf0' : '#f0e8fd', color: item.stype === '예금' ? '#0d6efd' : item.stype === '청약' ? '#198754' : '#b088f9' }}>{item.stype}</span>
            {!isCheongYak && <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: 8, background: '#f5f5f5', color: '#888' }}>{item.interest_type || '단리'}</span>}
            {isCheongYak && item.notify_day && <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: 8, background: '#fff3cd', color: '#856404' }}>🔔 {item.notify_day}일</span>}
          </div>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: dDayColor }}>{dDayText}</span>
        </div>
        <div className="d-flex mb-2" style={{ gap: 1 }}>
          <div className="text-center flex-fill" style={{ borderRight: '1px solid #eee' }}>
            <div style={{ fontSize: '0.75rem', color: '#888' }}>{item.stype === '예금' ? '예치금액' : '월 납입액'}</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{fmt(item.amount)}원</div>
          </div>
          <div className="text-center flex-fill" style={{ borderRight: '1px solid #eee' }}>
            <div style={{ fontSize: '0.75rem', color: '#888' }}>{isCheongYak ? '납입 회차' : '연 이율'}</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{isCheongYak ? `${item.months_elapsed}회` : `${item.interest_rate}%`}</div>
          </div>
          <div className="text-center flex-fill">
            {isCheongYak
              ? (<><div style={{ fontSize: '0.75rem', color: '#888' }}>총 납입액</div><div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#198754' }}>{fmt(item.current_paid)}원</div></>)
              : (<><div style={{ fontSize: '0.75rem', color: '#888' }}>만기 수령 <span style={{ fontSize: '0.65rem', color: '#b088f9' }}>(세후)</span></div><div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#198754' }}>{fmt(item.maturity_after_tax)}원</div></>)
            }
          </div>
        </div>
        {item.stype === '적금' && (
          <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.75rem', color: '#888' }}>
            <span>납입 {fmt(item.current_paid)} / {fmt(item.total_paid)}원</span>
            <span>세후 이자 +{fmt(item.interest_after_tax)}원</span>
          </div>
        )}
        {isCheongYak && (
          <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.75rem', color: '#888' }}>
            <span>{item.months_elapsed}회차 납입 중</span>
            <span>납입액 {fmt(item.current_paid)}원</span>
          </div>
        )}
        {item.stype === '예금' && (
          <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.75rem', color: '#888' }}>
            <span>{item.months_total}개월 · {item.tax_type}</span>
            <span>세후 이자 +{fmt(item.interest_after_tax)}원</span>
          </div>
        )}
        {!isCheongYak && (
          <>
            <div className="progress" style={{ height: 7, borderRadius: 4 }}>
              <div className="progress-bar" style={{ width: `${item.progress}%`, background: 'linear-gradient(90deg,#b088f9,#7baff0)', borderRadius: 4 }} />
            </div>
            <div className="d-flex justify-content-between mt-1">
              <span style={{ fontSize: '0.7rem', color: '#aaa' }}>{item.start_date}</span>
              <span style={{ fontSize: '0.7rem', color: '#b088f9', fontWeight: 600 }}>{item.progress}%</span>
              <span style={{ fontSize: '0.7rem', color: '#aaa' }}>{item.end_date}</span>
            </div>
          </>
        )}
        {isCheongYak && (
          <div className="mt-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#aaa' }}>시작일 {item.start_date}</span>
            <button onClick={e => { e.stopPropagation(); toggleDeposit() }}
              style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 8, border: 'none', background: '#e8fdf0', color: '#198754', fontWeight: 700, cursor: 'pointer' }}>
              {depositOpen ? '닫기' : '+ 추가 입금'}
            </button>
          </div>
        )}
        {isCheongYak && depositOpen && (
          <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 10 }} onClick={e => e.stopPropagation()}>
            <form onSubmit={addDeposit} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input type="number" placeholder="금액" value={depForm.amount}
                onChange={e => setDepForm(f => ({ ...f, amount: e.target.value }))} required
                style={{ flex: 2, padding: '6px 10px', borderRadius: 8, border: '1.5px solid #c3f0d0', fontSize: '0.82rem' }} />
              <input type="date" value={depForm.date}
                onChange={e => setDepForm(f => ({ ...f, date: e.target.value }))}
                style={{ flex: 2, padding: '6px 8px', borderRadius: 8, border: '1.5px solid #c3f0d0', fontSize: '0.82rem' }} />
              <button type="submit" disabled={depLoading}
                style={{ flex: 1, borderRadius: 8, border: 'none', background: '#198754', color: 'white', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                등록
              </button>
            </form>
            {deposits.length === 0
              ? <div style={{ fontSize: '0.78rem', color: '#ccc', textAlign: 'center', padding: '6px 0' }}>추가 입금 내역 없음</div>
              : deposits.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ fontSize: '0.78rem', color: '#888' }}>{d.date}</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#198754' }}>+{fmt(d.amount)}원</span>
                  {d.memo && <span style={{ fontSize: '0.75rem', color: '#bbb' }}>{d.memo}</span>}
                  <button onClick={() => deleteDeposit(d.id)}
                    style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 6, border: 'none', background: '#fff0f0', color: '#dc3545', cursor: 'pointer' }}>삭제</button>
                </div>
              ))
            }
            {item.extra_deposit > 0 && (
              <div style={{ fontSize: '0.78rem', color: '#198754', fontWeight: 600, marginTop: 6 }}>
                추가 입금 합계: +{fmt(item.extra_deposit)}원
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SavingsSheet({ open, visible, onClose, onSaved, editItem }) {
  const [stype, setStype] = useState('예금')
  const [itype, setItype] = useState('단리')
  const [taxType, setTaxType] = useState('일반과세')
  const [selected, setSelected] = useState('')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [rate, setRate] = useState('')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState('')
  const [notifyDay, setNotifyDay] = useState('')
  const [autoTx, setAutoTx] = useState(false)
  const [autoTxDay, setAutoTxDay] = useState('')
  const [autoTxCard, setAutoTxCard] = useState('')
  const [cards, setCards] = useState([])

  useEffect(() => {
    if (!open) return
    api.get('/api/budget').then(d => setCards(d.card_stats || [])).catch(() => {})
    if (editItem) {
      setStype(editItem.stype || '예금')
      setItype(editItem.interest_type || '단리')
      const _tt = editItem.tax_type || '일반과세'
      setTaxType(['ISA', 'ISA(신탁형)', 'ISA(중개형)', 'ISA(일임형)'].includes(_tt) ? 'ISA(일반형)' : _tt)
      setSelected(editItem.bank || '')
      setName(editItem.name || '')
      setAmount((editItem.amount || 0).toLocaleString('ko-KR'))
      setRate(String(editItem.interest_rate ?? ''))
      setStartDate(editItem.start_date || today())
      setEndDate(editItem.end_date || '')
      setNotifyDay(editItem.notify_day ? String(editItem.notify_day) : '')
      setAutoTx(!!editItem.auto_tx)
      setAutoTxDay(editItem.auto_tx_day ? String(editItem.auto_tx_day) : '')
      setAutoTxCard(editItem.auto_tx_card || '')
    } else {
      setStype('예금'); setItype('단리'); setTaxType('일반과세'); setSelected(''); setName(''); setAmount(''); setRate(''); setStartDate(today()); setEndDate(''); setNotifyDay(''); setAutoTx(false); setAutoTxDay(''); setAutoTxCard('')
    }
  }, [open, editItem])

  function pickBank(bankName) { setSelected(bankName); setName(bankName) }

  async function handleSubmit(e) {
    e.preventDefault()
    const isCheongYak = stype === '청약'
    const payload = {
      stype,
      interest_type: itype,
      tax_type: taxType,
      bank: selected,
      name: name.trim(),
      amount: parseInt(amount.replace(/,/g, '')) || 0,
      interest_rate: parseFloat(rate) || 0,
      start_date: startDate,
      end_date: isCheongYak ? '' : endDate,
      notify_day: isCheongYak && notifyDay ? parseInt(notifyDay) : null,
      auto_tx: (isCheongYak || stype === '적금') ? autoTx : false,
      auto_tx_day: autoTx && autoTxDay ? parseInt(autoTxDay) : null,
      auto_tx_card: autoTx ? autoTxCard : '',
    }
    if (editItem) await api.put(`/api/savings/${editItem.id}`, payload)
    else await api.post('/api/savings', payload)
    onSaved(); onClose()
  }

  function applyDuration(months) {
    if (!startDate) return
    const d = new Date(startDate)
    d.setMonth(d.getMonth() + months)
    setEndDate(d.toISOString().slice(0, 10))
  }

  if (!open) return null
  return (
    <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'flex-end', justifyContent: 'center', opacity: visible ? 1 : 0, transition: 'opacity 0.28s ease' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '20px 16px 0', transform: visible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="mb-0 fw-bold">{editItem ? '예적금 수정' : '예적금 추가'}</h6>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#aaa', lineHeight: 1, padding: '0 4px' }}>&times;</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <form id="savings-form" onSubmit={handleSubmit}>
            <div className="d-flex gap-2 mb-3">
              {['예금', '적금', '청약'].map(t => (
                <button key={t} type="button" onClick={() => { setStype(t); if (t === '청약') setTaxType('비과세') }}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: `2px solid ${stype === t ? '#b088f9' : '#eee'}`, background: stype === t ? 'rgba(176,136,249,0.1)' : 'white', color: stype === t ? '#b088f9' : '#888', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
                  {t}
                </button>
              ))}
            </div>
            <p className="mb-1 text-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>은행</p>
            <div data-scroll-x className="d-flex gap-2 overflow-auto pb-2 mb-3" style={{ scrollbarWidth: 'none' }}>
              {BANKS.map(([bname, logo, label]) => (
                <BankBtn key={bname} bankName={bname} logo={logo} label={label} selected={selected} onPick={pickBank} />
              ))}
            </div>
            <input type="text" className="form-control mb-2" placeholder="이름 (위 선택 시 자동 입력, 수정 가능)"
              value={name} onChange={e => setName(e.target.value)} required style={{ borderRadius: 10 }} />
            <div className="mb-2" style={{ position: 'relative' }}>
              <input type="text" className="form-control" placeholder={stype === '예금' ? '예치금액' : stype === '청약' ? '월 납입액 (2~50만원)' : '월 납입액'} inputMode="numeric"
                value={amount} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); setAmount(raw ? parseInt(raw).toLocaleString('ko-KR') : '') }} required style={{ borderRadius: 10, paddingRight: 36 }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
            </div>
            <div className="d-flex gap-2 mb-2">
              <div style={{ position: 'relative', flex: 1 }}>
                <input type="text" inputMode="decimal" className="form-control" placeholder="연 이율 (없으면 0)"
                  value={rate} onChange={e => { const v = e.target.value; if (/^\d*\.?\d*$/.test(v)) setRate(v) }}
                  style={{ borderRadius: 10, paddingRight: 28 }} />
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#aaa', fontSize: '0.85rem', pointerEvents: 'none' }}>%</span>
              </div>
              {['단리', '복리'].map(t => (
                <button key={t} type="button" onClick={() => setItype(t)}
                  style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 10, border: `2px solid ${itype === t ? '#b088f9' : '#eee'}`, background: itype === t ? 'rgba(176,136,249,0.1)' : 'white', color: itype === t ? '#b088f9' : '#888', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
                  {t}
                </button>
              ))}
            </div>
            <div className="d-flex gap-2 mb-2">
              {[['일반과세', '15.4%'], ['세금우대', '9.9%'], ['ISA', '9.9%'], ['비과세', '0%']].map(([t, label]) => {
                const isISA = t === 'ISA'
                const active = isISA ? taxType.startsWith('ISA') : taxType === t
                return (
                  <button key={t} type="button" onClick={() => setTaxType(isISA ? (taxType.startsWith('ISA') ? taxType : 'ISA(신탁형)') : t)}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 10, border: `2px solid ${active ? '#7baff0' : '#eee'}`, background: active ? 'rgba(123,175,240,0.1)' : 'white', color: active ? '#5a9fd4' : '#888', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
                    {t}<br /><span style={{ fontSize: '0.68rem', fontWeight: 400 }}>{label}</span>
                  </button>
                )
              })}
            </div>
            {taxType.startsWith('ISA') && (
              <div className="mb-3">
                <div className="d-flex gap-2 mb-2">
                  {[['일반형', '비과세 200만원'], ['서민형', '비과세 400만원']].map(([sub, desc]) => (
                    <button key={sub} type="button" onClick={() => setTaxType(`ISA(${sub})`)}
                      style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: `2px solid ${taxType === `ISA(${sub})` ? '#7baff0' : '#eee'}`, background: taxType === `ISA(${sub})` ? 'rgba(123,175,240,0.1)' : 'white', color: taxType === `ISA(${sub})` ? '#5a9fd4' : '#aaa', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
                      {sub}<br /><span style={{ fontSize: '0.66rem', fontWeight: 400 }}>{desc}</span>
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#888', lineHeight: 1.6, padding: '8px 10px', background: '#f8f8ff', borderRadius: 8 }}>
                  <span style={{ fontWeight: 600, color: '#5a9fd4' }}>ISA 계좌 내 예금·적금</span>은 <span style={{ fontWeight: 600 }}>신탁형 ISA</span>에서만 가입 가능<br />
                  (중개형·일임형은 주식·ETF·펀드만 가능, 예금·적금 불가)<br />
                  비과세 한도 초과분에만 9.9% 분리과세 적용
                </div>
              </div>
            )}
            <div className="d-flex gap-2 mb-2">
              <div className="flex-fill">
                <label className="text-muted mb-1 d-block" style={{ fontSize: '0.75rem' }}>시작일</label>
                <input type="date" className="form-control" value={startDate} onChange={e => setStartDate(e.target.value)} required style={{ borderRadius: 10 }} />
              </div>
              {stype !== '청약' && (
                <div className="flex-fill">
                  <label className="text-muted mb-1 d-block" style={{ fontSize: '0.75rem' }}>만기일</label>
                  <input type="date" className="form-control" value={endDate} onChange={e => setEndDate(e.target.value)} required style={{ borderRadius: 10 }} />
                </div>
              )}
            </div>
            {stype !== '청약' && (
              <div className="d-flex gap-2 mb-3">
                {[['6개월', 6], ['1년', 12], ['2년', 24], ['3년', 36]].map(([label, months]) => (
                  <button key={label} type="button" onClick={() => applyDuration(months)}
                    style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: '1.5px solid #e8d5ff', background: 'white', color: '#b088f9', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {stype === '청약' && (
              <div className="mb-3">
                <label className="text-muted mb-1 d-block" style={{ fontSize: '0.75rem' }}>🔔 납입일 알림</label>
                <div style={{ position: 'relative' }}>
                  <input type="number" className="form-control" placeholder="알림 없음" min="1" max="31"
                    value={notifyDay} onChange={e => setNotifyDay(e.target.value)} style={{ borderRadius: 10, paddingRight: 36 }} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>일</span>
                </div>
                <p className="text-muted mt-1 mb-0" style={{ fontSize: '0.72rem' }}>입력 시 해당 날짜 오전 9시에 납입 알림을 받습니다. 알림을 받으려면 설정에서 알림을 켜주세요.</p>
              </div>
            )}
            {(stype === '적금' || stype === '청약') && (
              <div className="mb-3" style={{ background: '#faf8ff', borderRadius: 12, padding: '12px 14px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', fontWeight: 600, color: '#555', cursor: 'pointer', marginBottom: autoTx ? 10 : 0 }}>
                  <input type="checkbox" checked={autoTx} onChange={e => setAutoTx(e.target.checked)} />
                  🔄 자동이체 등록
                </label>
                {autoTx && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ position: 'relative' }}>
                      <input type="number" className="form-control" placeholder="이체일 (몇 일)" min="1" max="31"
                        value={autoTxDay} onChange={e => setAutoTxDay(e.target.value)}
                        style={{ borderRadius: 10, paddingRight: 36, fontSize: '0.88rem' }} />
                      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>일</span>
                    </div>
                    <select className="form-select" value={autoTxCard} onChange={e => setAutoTxCard(e.target.value)}
                      style={{ borderRadius: 10, fontSize: '0.88rem' }}>
                      <option value="">카드/계좌 선택 (선택사항)</option>
                      {cards.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
          </form>
        </div>
        <div style={{ padding: '12px 0 48px', flexShrink: 0 }}>
          <button type="submit" form="savings-form" className="btn w-100" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 600 }}>
            {editItem ? '수정하기' : '추가하기'}
          </button>
        </div>
      </div>
    </div>
  )
}

const ITYPE_COLORS = {
  '국내주식': { bg: '#fff0f4', color: '#e84393' },
  '해외주식': { bg: '#fff4e8', color: '#e87000' },
  '펀드': { bg: '#e8f8f0', color: '#1a7a4a' },
  '코인': { bg: '#fffbe8', color: '#c9960a' },
  'ETF': { bg: '#e8f4ff', color: '#0d6efd' },
  '기타': { bg: '#f2f2f7', color: '#666' },
}
const ITYPE_ICONS = { '국내주식': '🇰🇷', '해외주식': '🌎', '펀드': '💼', '코인': '₿', 'ETF': '📊', '기타': '📦' }
const ITYPE_UNITS = { '국내주식': '주', '해외주식': '주', '펀드': '좌', '코인': '개', 'ETF': '주', '기타': '' }

function InvestmentItem({ item, onEdit, onDelete }) {
  const startX = useRef(null)
  const startY = useRef(null)
  const [offsetX, setOffsetX] = useState(0)
  const horiz = useRef(false)
  const cardRef = useRef(null)
  const mouseDown = useRef(false)

  const onDragStart = e => {
    if (e.touches) {
      const cx = e.touches[0].clientX
      const wrap = e.currentTarget.closest('.page-wrap')
      const rect = wrap ? wrap.getBoundingClientRect() : { left: 0, width: window.innerWidth }
      if (cx - rect.left < 80 || cx - rect.left > rect.width - 80) return
      startX.current = cx; startY.current = e.touches[0].clientY; horiz.current = false
    } else {
      startX.current = e.clientX; startY.current = e.clientY; horiz.current = true
      mouseDown.current = true; setOffsetX(0)
    }
  }
  const onDragMove = e => {
    if (startX.current === null) return
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    const cy = e.touches ? e.touches[0].clientY : e.clientY
    const dx = startX.current - cx; const dy = startY.current - cy
    if (!horiz.current) {
      if (Math.abs(dy) > Math.abs(dx)) { startX.current = null; return }
      if (Math.abs(dx) > 8) horiz.current = true; else return
    }
    if (e.touches) e.preventDefault()
    const maxSlide = cardRef.current ? Math.floor(cardRef.current.offsetWidth / 4) : 80
    setOffsetX(Math.max(-maxSlide, Math.min(maxSlide, -dx)))
  }
  const onDragEnd = () => {
    mouseDown.current = false
    if (startX.current === null) return
    const cur = offsetX; startX.current = null
    const trigger = cardRef.current ? Math.floor(cardRef.current.offsetWidth / 8) : 40
    if (cur < -trigger) { setOffsetX(0); onDelete() }
    else if (cur > trigger) { setOffsetX(0); onEdit() }
    else setOffsetX(0)
  }

  const tc = ITYPE_COLORS[item.itype] || ITYPE_COLORS['기타']
  const icon = ITYPE_ICONS[item.itype] || '📦'
  const isProfit = item.profit >= 0
  const deleteWidth = Math.max(0, -offsetX)
  const editWidth = Math.max(0, offsetX)

  return (
    <div ref={cardRef} style={{ position: 'relative', overflow: 'hidden', borderRadius: 16, marginBottom: 12 }}>
      <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: deleteWidth, background: '#dc3545', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'white', fontSize: '0.75rem', gap: 2, overflow: 'hidden' }}>
        <i className="bi bi-trash" style={{ fontSize: '1.15rem' }} /><span>삭제</span>
      </div>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: editWidth, background: '#198754', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'white', fontSize: '0.75rem', gap: 2, overflow: 'hidden' }}>
        <i className="bi bi-pencil" style={{ fontSize: '1.15rem' }} /><span>수정</span>
      </div>
      <div data-item-swipe style={{ position: 'relative', zIndex: 1, background: 'white', padding: 16, transform: `translateX(${offsetX}px)`, transition: offsetX === 0 ? 'transform 0.22s ease' : 'none', cursor: 'grab', userSelect: 'none' }}
        onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
        onMouseDown={onDragStart} onMouseMove={e => { if (mouseDown.current) onDragMove(e) }} onMouseUp={onDragEnd} onMouseLeave={onDragEnd}>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="d-flex align-items-center gap-2">
            <span style={{ fontSize: '1.1rem' }}>{icon}</span>
            <span className="fw-semibold" style={{ fontSize: '0.95rem' }}>{item.name}</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: tc.bg, color: tc.color }}>{item.itype}</span>
            {item.account_type && item.account_type !== '일반' && (() => {
              const atColor = { ISA: '#5a9fd4', '연금저축': '#8b5cf6', IRP: '#e87000' }[item.account_type] || '#888'
              return <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: `${atColor}18`, color: atColor }}>{item.account_type}</span>
            })()}
            <span style={{ fontSize: '0.72rem', color: '#aaa' }}>(수량 {item.quantity})</span>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#aaa' }}>{item.ticker || ''}</span>
        </div>
        <div className="d-flex mb-2" style={{ gap: 1 }}>
          <div className="text-center flex-fill" style={{ borderRight: '1px solid #eee' }}>
            <div style={{ fontSize: '0.72rem', color: '#888' }}>매수금액</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#555' }}>{fmt(item.purchase_value)}원</div>
            {item.itype === '해외주식' && item.exchange_rate && (
              <div style={{ fontSize: '0.68rem', color: '#aaa' }}>(${(item.avg_price * item.quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</div>
            )}
          </div>
          <div className="text-center flex-fill" style={{ borderRight: '1px solid #eee' }}>
            <div style={{ fontSize: '0.72rem', color: '#888' }}>평가금액</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{fmt(item.current_value)}원</div>
            {item.itype === '해외주식' && item.exchange_rate && (
              <div style={{ fontSize: '0.68rem', color: '#aaa' }}>(${(item.current_price * item.quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</div>
            )}
          </div>
          <div className="text-center flex-fill">
            <div style={{ fontSize: '0.72rem', color: '#888' }}>수익</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: isProfit ? '#198754' : '#dc3545' }}>
              {isProfit ? '+' : ''}{fmt(item.profit)}원
            </div>
            {item.itype === '해외주식' && item.exchange_rate && (
              <div style={{ fontSize: '0.68rem', color: '#aaa' }}>({isProfit ? '+' : ''}${((item.current_price - item.avg_price) * item.quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</div>
            )}
          </div>
        </div>
        <div className="d-flex justify-content-between" style={{ fontSize: '0.72rem', color: '#aaa' }}>
          <span>
            {item.itype === '해외주식'
              ? item.current_price
                ? `평단가 $${item.avg_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · 현재가 $${item.current_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : `평단가 $${item.avg_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : item.current_price
                ? `평단가 ${fmt(item.avg_price)}원 · 현재가 ${fmt(item.current_price)}원`
                : item.avg_price ? `평단가 ${fmt(item.avg_price)}원` : ''
            }
          </span>
          <span style={{ color: isProfit ? '#198754' : '#dc3545', fontWeight: 600 }}>
            {isProfit ? '▲' : '▼'} {Math.abs(item.profit_pct).toFixed(2)}%
          </span>
        </div>
        <div className="d-flex justify-content-between mt-1" style={{ fontSize: '0.68rem', color: '#ccc' }}>
          {item.memo ? <span>{item.memo}</span> : <span />}
          {item.price_updated_at
            ? <span>🕒 {item.price_updated_at} 기준</span>
            : <span style={{ color: '#ffb347' }}>현재가 미입력</span>}
        </div>
      </div>
    </div>
  )
}

function InvestmentSheet({ open, visible, onClose, onSaved, editItem }) {
  const [itype, setItype] = useState('국내주식')
  const [accountType, setAccountType] = useState('일반')
  const [name, setName] = useState('')
  const [ticker, setTicker] = useState('')
  const [quantity, setQuantity] = useState('')
  const [avgPrice, setAvgPrice] = useState('')
  const [currentPrice, setCurrentPrice] = useState('')
  const [memo, setMemo] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchResult, setFetchResult] = useState(null)
  const [exchangeRate, setExchangeRate] = useState(null)
  const [usdAvgPrice, setUsdAvgPrice] = useState('')
  const [usdCurrentPrice, setUsdCurrentPrice] = useState('')

  useEffect(() => {
    if (!open) return
    if (editItem) {
      setItype(editItem.itype || '국내주식')
      setAccountType(editItem.account_type || '일반')
      setName(editItem.name || '')
      setTicker(editItem.ticker || '')
      setQuantity(String(editItem.quantity ?? ''))
      setAvgPrice(editItem.avg_price ? Math.round(editItem.avg_price).toLocaleString('ko-KR') : '')
      setCurrentPrice(editItem.current_price != null ? Math.round(editItem.current_price).toLocaleString('ko-KR') : '')
      setMemo(editItem.memo || '')
    } else {
      setItype('국내주식'); setAccountType('일반'); setName(''); setTicker(''); setQuantity(''); setAvgPrice(''); setCurrentPrice(''); setMemo('')
    }
    setUsdAvgPrice(''); setUsdCurrentPrice(''); setExchangeRate(null)
    setFetchResult(null)
  }, [open, editItem])

  // 환율 자동 조회 (해외주식 선택 시)
  useEffect(() => {
    if (itype !== '해외주식') return
    api.get('/api/usd-rate').then(res => {
      if (res.ok) {
        setExchangeRate(res.rate)
      }
    }).catch(() => {})
  }, [itype])

  // 환율 로드 후 수정 항목 USD 가격 초기화
  useEffect(() => {
    if (!editItem || itype !== '해외주식' || !exchangeRate) return
    if (!usdAvgPrice && editItem.avg_price) {
      // exchange_rate가 저장된 항목은 avg_price가 이미 USD, 아니면 KRW → USD 변환
      setUsdAvgPrice(editItem.exchange_rate
        ? editItem.avg_price.toFixed(4)
        : (editItem.avg_price / exchangeRate).toFixed(2))
    }
    if (!usdCurrentPrice && editItem.current_price) {
      setUsdCurrentPrice(editItem.exchange_rate
        ? editItem.current_price.toFixed(2)
        : (editItem.current_price / exchangeRate).toFixed(2))
    }
  }, [exchangeRate, editItem, itype])

  const ITYPES = ['국내주식', '해외주식', '펀드', '코인', 'ETF', '기타']
  const tickerHints = { '국내주식': '예) 005930 (삼성전자)', '해외주식': '예) AAPL, TSLA', '펀드': '펀드코드 (선택)', '코인': '예) KRW-BTC, KRW-ETH', 'ETF': '예) 069500 (KODEX200), QQQ', '기타': '' }

  async function fetchPrice() {
    if (!ticker.trim()) return
    setFetching(true); setFetchResult(null)
    try {
      const res = await api.get(`/api/investments/price?ticker=${encodeURIComponent(ticker.trim())}&itype=${encodeURIComponent(itype)}`)
      if (res.ok) {
        const krw = Math.round(res.price_krw)
        setCurrentPrice(krw.toLocaleString('ko-KR'))
        setFetchResult({ currency: res.currency, price: res.price, price_krw: res.price_krw })
        if (res.currency === 'USD' && res.price > 0) {
          const rate = Math.round(res.price_krw / res.price)
          setExchangeRate(rate)
          setUsdCurrentPrice(res.price.toFixed(2))
        }
      } else {
        setFetchResult({ error: res.error || '조회 실패' })
      }
    } catch { setFetchResult({ error: '네트워크 오류' }) }
    finally { setFetching(false) }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const isUsd = itype === '해외주식'
    const payload = {
      itype, account_type: accountType, name: name.trim(), ticker: ticker.trim(),
      quantity: parseFloat(quantity) || 0,
      avg_price: isUsd ? (parseFloat(usdAvgPrice) || 0) : (parseFloat(avgPrice.replace(/,/g, '')) || 0),
      current_price: isUsd
        ? (usdCurrentPrice ? (parseFloat(usdCurrentPrice) || null) : null)
        : (currentPrice ? parseFloat(currentPrice.replace(/,/g, '')) : null),
      exchange_rate: isUsd ? (exchangeRate || null) : null,
      memo: memo.trim(),
    }
    if (editItem) await api.put(`/api/investments/${editItem.id}`, payload)
    else await api.post('/api/investments', payload)
    onSaved(); onClose()
  }

  const inp = { borderRadius: 10, border: '1.5px solid #e8e8e8', padding: '9px 12px', fontSize: '0.9rem', width: '100%', outline: 'none' }
  if (!open) return null

  return (
    <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'flex-end', justifyContent: 'center', opacity: visible ? 1 : 0, transition: 'opacity 0.28s ease' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '20px 16px 0', transform: visible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="mb-0 fw-bold">{editItem ? '투자 수정' : '투자 추가'}</h6>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#aaa', lineHeight: 1 }}>&times;</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <form id="investment-form" onSubmit={handleSubmit}>
            {/* 유형 선택 */}
            <div data-scroll-x className="d-flex gap-2 overflow-auto pb-2 mb-2" style={{ scrollbarWidth: 'none' }}>
              {ITYPES.map(t => {
                const tc = ITYPE_COLORS[t] || ITYPE_COLORS['기타']
                return (
                  <button key={t} type="button" onClick={() => setItype(t)}
                    style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 20, border: `2px solid ${itype === t ? tc.color : '#eee'}`, background: itype === t ? tc.bg : 'white', color: itype === t ? tc.color : '#888', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {ITYPE_ICONS[t]} {t}
                  </button>
                )
              })}
            </div>
            {/* 계좌 종류 */}
            <div className="d-flex gap-2 mb-3">
              {[['일반', null], ['ISA', '#5a9fd4'], ['연금저축', '#8b5cf6'], ['IRP', '#e87000']].map(([at, color]) => (
                <button key={at} type="button" onClick={() => setAccountType(at)}
                  style={{ flex: 1, padding: '5px 0', borderRadius: 10, border: `2px solid ${accountType === at ? (color || '#888') : '#eee'}`, background: accountType === at ? `${color || '#888'}18` : 'white', color: accountType === at ? (color || '#555') : '#aaa', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>
                  {at}
                </button>
              ))}
            </div>

            <input type="text" placeholder="종목명" value={name} onChange={e => setName(e.target.value)} required style={{ ...inp, marginBottom: 10 }} />

            {/* 티커 + 현재가 불러오기 */}
            <div className="d-flex gap-2 mb-1">
              <input type="text" placeholder={tickerHints[itype] || '티커/심볼'} value={ticker} onChange={e => setTicker(e.target.value)}
                style={{ ...inp, flex: 1 }} />
              <button type="button" onClick={fetchPrice} disabled={!ticker.trim() || fetching}
                style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 10, border: 'none', background: ticker.trim() ? 'linear-gradient(135deg,#b088f9,#7baff0)' : '#eee', color: ticker.trim() ? 'white' : '#aaa', fontWeight: 600, fontSize: '0.82rem', cursor: ticker.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
                {fetching ? '조회중...' : '현재가 불러오기'}
              </button>
            </div>
            {fetchResult && (
              <div style={{ fontSize: '0.75rem', marginBottom: 8, padding: '5px 10px', borderRadius: 8, background: fetchResult.error ? '#fff0f0' : '#f0faf4', color: fetchResult.error ? '#dc3545' : '#198754' }}>
                {fetchResult.error ? `오류: ${fetchResult.error}` : `현재가: ${fetchResult.currency === 'USD' ? `$${fetchResult.price.toLocaleString()} ≈ ` : ''}${Math.round(fetchResult.price_krw).toLocaleString()}원 (자동 입력됨)`}
              </div>
            )}

            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input type="text" placeholder="수량 (소수 가능, 예: 0.5)" value={quantity} onChange={e => setQuantity(e.target.value)} required
                inputMode="decimal" style={{ ...inp, paddingRight: ITYPE_UNITS[itype] ? 36 : undefined }} />
              {ITYPE_UNITS[itype] && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>{ITYPE_UNITS[itype]}</span>}
            </div>
            {itype === '해외주식' ? (<>
              <div style={{ fontSize: '0.72rem', color: '#b08040', background: '#fffbf0', border: '1px solid #ffe8a0', borderRadius: 8, padding: '6px 10px', marginBottom: 10 }}>
                ⚠️ 환율은 실시간이 아닐 수 있어 실제 금액과 차이가 있을 수 있습니다{exchangeRate ? ` (현재 적용 환율: $1 ≈ ${exchangeRate.toLocaleString()}원)` : ''}
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ position: 'relative' }}>
                  <input type="text" placeholder="평균 매수가" value={usdAvgPrice} inputMode="decimal"
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9.]/g, '')
                      setUsdAvgPrice(val)
                      const krw = exchangeRate ? Math.round((parseFloat(val) || 0) * exchangeRate) : 0
                      setAvgPrice(krw ? krw.toLocaleString('ko-KR') : '')
                    }}
                    required style={{ ...inp, paddingRight: 46 }} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>달러</span>
                </div>
                {exchangeRate && usdAvgPrice && <div style={{ fontSize: '0.72rem', color: '#aaa', marginTop: 3, paddingLeft: 4 }}>({Math.round((parseFloat(usdAvgPrice) || 0) * exchangeRate).toLocaleString()}원)</div>}
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ position: 'relative' }}>
                  <input type="text" placeholder="현재가 (선택사항)" value={usdCurrentPrice} inputMode="decimal"
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9.]/g, '')
                      setUsdCurrentPrice(val)
                      const krw = exchangeRate ? Math.round((parseFloat(val) || 0) * exchangeRate) : 0
                      setCurrentPrice(krw ? krw.toLocaleString('ko-KR') : '')
                    }}
                    style={{ ...inp, paddingRight: 46 }} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>달러</span>
                </div>
                {exchangeRate && usdCurrentPrice && <div style={{ fontSize: '0.72rem', color: '#aaa', marginTop: 3, paddingLeft: 4 }}>({Math.round((parseFloat(usdCurrentPrice) || 0) * exchangeRate).toLocaleString()}원)</div>}
              </div>
            </>) : (<>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <input type="text" placeholder="평균 매수가" value={avgPrice} inputMode="numeric"
                  onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); setAvgPrice(r ? parseInt(r).toLocaleString('ko-KR') : '') }}
                  required style={{ ...inp, paddingRight: 36 }} />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
              </div>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <input type="text" placeholder="현재가 (선택사항)" value={currentPrice} inputMode="numeric"
                  onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); setCurrentPrice(r ? parseInt(r).toLocaleString('ko-KR') : '') }}
                  style={{ ...inp, paddingRight: 36 }} />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
              </div>
            </>)}
            <input type="text" placeholder="메모 (선택)" value={memo} onChange={e => setMemo(e.target.value)}
              style={{ ...inp, marginBottom: 10 }} />
          </form>
        </div>
        <div style={{ padding: '12px 0 48px', flexShrink: 0 }}>
          <button type="submit" form="investment-form" className="btn w-100" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 600 }}>
            {editItem ? '수정하기' : '추가하기'}
          </button>
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
  const [editUrl, setEditUrl] = useState('')
  const [editTier1, setEditTier1] = useState(20)
  const [editTier2, setEditTier2] = useState(50)
  const [editTier3, setEditTier3] = useState(80)
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [editSheetVisible, setEditSheetVisible] = useState(false)
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [addSheetVisible, setAddSheetVisible] = useState(false)
  const [savingsSheetOpen, setSavingsSheetOpen] = useState(false)
  const [savingsSheetVisible, setSavingsSheetVisible] = useState(false)
  const [editSavings, setEditSavings] = useState(null)
  const [confirmSavings, setConfirmSavings] = useState(null)
  const [invSheetOpen, setInvSheetOpen] = useState(false)
  const [invSheetVisible, setInvSheetVisible] = useState(false)
  const [editInv, setEditInv] = useState(null)
  const [confirmInv, setConfirmInv] = useState(null)

  const load = useCallback(() => api.get('/api/budget').then(setData).catch(console.error), [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    const open = addSheetOpen || editSheetOpen || savingsSheetOpen || invSheetOpen || !!confirmCard || !!confirmSavings || !!confirmInv
    document.body.classList.toggle('sheet-open', open)
    return () => document.body.classList.remove('sheet-open')
  }, [addSheetOpen, editSheetOpen, savingsSheetOpen, invSheetOpen, confirmCard, confirmSavings, confirmInv])

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
    setEditUrl(card.url || '')
    setEditTier1(card.tier1 || 20)
    setEditTier2(card.tier2 || 50)
    setEditTier3(card.tier3 || 80)
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
      tier1: editTier1, tier2: editTier2, tier3: editTier3,
      account_balance: initial, url: editUrl,
    })
    closeEdit(); load()
  }

  async function handleDelete() {
    if (!confirmCard) return
    await api.delete(`/api/cards/${confirmCard.id}`)
    setConfirmCard(null); load()
  }

  function openSavingsAdd() {
    setEditSavings(null)
    setSavingsSheetOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setSavingsSheetVisible(true)))
  }
  function openSavingsEdit(item) {
    setEditSavings(item)
    setSavingsSheetOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setSavingsSheetVisible(true)))
  }
  function closeSavingsSheet() {
    setSavingsSheetVisible(false)
    setTimeout(() => { setSavingsSheetOpen(false); setEditSavings(null) }, 350)
  }
  async function handleDeleteSavings() {
    if (!confirmSavings) return
    await api.delete(`/api/savings/${confirmSavings.id}`)
    setConfirmSavings(null); load()
  }

  function openInvAdd() {
    setEditInv(null); setInvSheetOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setInvSheetVisible(true)))
  }
  function openInvEdit(item) {
    setEditInv(item); setInvSheetOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setInvSheetVisible(true)))
  }
  function closeInvSheet() {
    setInvSheetVisible(false)
    setTimeout(() => { setInvSheetOpen(false); setEditInv(null) }, 350)
  }
  async function handleDeleteInv() {
    if (!confirmInv) return
    await api.delete(`/api/investments/${confirmInv.id}`)
    setConfirmInv(null); load()
  }

  function fmtInput(val, setter, allowNeg = false) {
    const neg = allowNeg && val.startsWith('-')
    const raw = val.replace(/[^0-9]/g, '')
    if (!raw) { setter(neg ? '-' : ''); return }
    setter((neg ? '-' : '') + parseInt(raw).toLocaleString('ko-KR'))
  }

  if (!data) return <div className="text-center py-5"><div className="spinner-border" style={{ color: '#b088f9' }} /></div>

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3 px-1">
        <span className="fw-semibold" style={{ fontSize: '1rem', color: '#333' }}>자산별 잔고</span>
        <button onClick={openAdd} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '6px 14px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
          <i className="bi bi-plus-lg me-1" />자산 추가
        </button>
      </div>

      {data.card_stats.length === 0 ? (
        <div className="card mb-4 text-center">
          <div className="card-body py-5 text-muted">
            <i className="bi bi-credit-card" style={{ fontSize: '2rem' }} />
            <p className="mt-2 mb-0">등록된 자산이 없습니다</p>
            <button onClick={openAdd} className="btn btn-sm mt-3" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>자산 추가 →</button>
          </div>
        </div>
      ) : (
        data.card_stats.map(card => (
          <SwipeCard key={card.id} card={card} onEdit={() => openEdit(card)} onDelete={() => setConfirmCard(card)} />
        ))
      )}

      {/* 자산별 잔고 종합 */}
      {data.card_stats.length > 0 && (() => {
        const totalBalance = data.card_stats.reduce((s, c) => s + c.balance, 0)
        const totalSpent = data.card_stats.reduce((s, c) => s + c.spent, 0)
        const totalTarget = data.card_stats.reduce((s, c) => s + c.target, 0)
        return (
          <div className="card mb-4" style={{ borderRadius: 14, border: '1.5px solid #f0e8fd' }}>
            <div className="card-body py-3">
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b088f9', marginBottom: 10 }}>자산별 잔고 종합</div>
              <div className="d-flex gap-2">
                {[
                  { label: '총 잔고', val: totalBalance, color: totalBalance >= 0 ? '#198754' : '#dc3545' },
                  { label: '이번달 지출', val: totalSpent, color: '#dc3545' },
                  { label: '이번달 한도', val: totalTarget, color: '#555' },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ flex: 1, background: '#faf8ff', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.66rem', color: '#aaa', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color }}>{fmt(val)}원</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* 예적금 섹션 */}
      <div className="d-flex align-items-center justify-content-between mb-3 px-1 mt-2">
        <span className="fw-semibold" style={{ fontSize: '1rem', color: '#333' }}>예적금</span>
        <button onClick={openSavingsAdd} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '6px 14px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
          <i className="bi bi-plus-lg me-1" />예적금 추가
        </button>
      </div>
      {(data.savings || []).length === 0 ? (
        <div className="card mb-4 text-center">
          <div className="card-body py-4 text-muted">
            <i className="bi bi-piggy-bank" style={{ fontSize: '2rem' }} />
            <p className="mt-2 mb-0">등록된 예적금이 없습니다</p>
            <button onClick={openSavingsAdd} className="btn btn-sm mt-3" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>예적금 추가 →</button>
          </div>
        </div>
      ) : (
        (data.savings || []).map(item => (
          <SavingsItem key={item.id} item={item}
            onEdit={() => openSavingsEdit(item)}
            onDelete={() => setConfirmSavings(item)}
            onDepositChange={load} />
        ))
      )}

      {/* 예적금 종합 */}
      {(data.savings || []).length > 0 && (() => {
        const savings = data.savings || []
        const depositTotal = savings.filter(s => s.stype === '예금').reduce((s, i) => s + i.current_paid, 0)
        const installTotal = savings.filter(s => s.stype !== '예금').reduce((s, i) => s + i.current_paid, 0)
        const maturityTotal = savings.reduce((s, i) => s + i.maturity_after_tax, 0)
        const interestTotal = savings.reduce((s, i) => s + i.interest_after_tax, 0)
        return (
          <div className="card mb-4" style={{ borderRadius: 14, border: '1.5px solid #f0e8fd' }}>
            <div className="card-body py-3">
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b088f9', marginBottom: 10 }}>예적금 종합</div>
              <div className="d-flex gap-2 mb-2">
                <div style={{ flex: 1, background: '#faf8ff', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.66rem', color: '#aaa', marginBottom: 3 }}>예금 원금</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#555' }}>{fmt(depositTotal)}원</div>
                </div>
                <div style={{ flex: 1, background: '#faf8ff', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.66rem', color: '#aaa', marginBottom: 3 }}>적금/청약 월 납입액</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#555' }}>{fmt(installTotal)}원</div>
                </div>
              </div>
              <div className="d-flex gap-2">
                <div style={{ flex: 1, background: '#f0faf4', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.66rem', color: '#aaa', marginBottom: 3 }}>예상이자 (세후)</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#198754' }}>+{fmt(interestTotal)}원</div>
                </div>
                <div style={{ flex: 1, background: '#f0faf4', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.66rem', color: '#aaa', marginBottom: 3 }}>예상만기금액 (세후)</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#198754' }}>{fmt(maturityTotal)}원</div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* 투자 섹션 */}
      <div className="d-flex align-items-center justify-content-between mb-3 px-1 mt-2">
        <span className="fw-semibold" style={{ fontSize: '1rem', color: '#333' }}>투자</span>
        <button onClick={openInvAdd} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '6px 14px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
          <i className="bi bi-plus-lg me-1" />투자 추가
        </button>
      </div>
      {(data.investments || []).length === 0 ? (
        <div className="card mb-4 text-center">
          <div className="card-body py-4 text-muted">
            <i className="bi bi-graph-up-arrow" style={{ fontSize: '2rem' }} />
            <p className="mt-2 mb-0">등록된 투자가 없습니다</p>
            <button onClick={openInvAdd} className="btn btn-sm mt-3" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>투자 추가 →</button>
          </div>
        </div>
      ) : (
        <>
          {(data.investments || []).map(item => (
            <InvestmentItem key={item.id} item={item}
              onEdit={() => openInvEdit(item)}
              onDelete={() => setConfirmInv(item)} />
          ))}
          <div className="card mb-4" style={{ borderRadius: 14, border: '1.5px solid #f0e8fd' }}>
            <div className="card-body py-3">
              <div className="d-flex justify-content-between align-items-center">
                <span style={{ fontSize: '0.85rem', color: '#888' }}>총 평가금액</span>
                <span style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt((data.investments || []).reduce((s, i) => s + i.current_value, 0))}원</span>
              </div>
              {(() => {
                const totalPurch = (data.investments || []).reduce((s, i) => s + i.purchase_value, 0)
                const totalCur = (data.investments || []).reduce((s, i) => s + i.current_value, 0)
                const profit = totalCur - totalPurch
                const pct = totalPurch ? (profit / totalPurch * 100).toFixed(2) : 0
                return (
                  <div className="d-flex justify-content-between align-items-center mt-1">
                    <span style={{ fontSize: '0.85rem', color: '#888' }}>총 수익</span>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: profit >= 0 ? '#198754' : '#dc3545' }}>
                      {profit >= 0 ? '+' : ''}{fmt(profit)}원 ({profit >= 0 ? '+' : ''}{pct}%)
                    </span>
                  </div>
                )
              })()}
            </div>
          </div>
        </>
      )}

      <div className="d-lg-none" style={{ height: 90 }} />

      <AddSheet open={addSheetOpen} visible={addSheetVisible} onClose={closeAdd} onSaved={load} />

      <SavingsSheet open={savingsSheetOpen} visible={savingsSheetVisible} onClose={closeSavingsSheet} onSaved={load} editItem={editSavings} />

      <InvestmentSheet open={invSheetOpen} visible={invSheetVisible} onClose={closeInvSheet} onSaved={load} editItem={editInv} />

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

      {confirmSavings && (
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 20, padding: '24px 20px', width: 'min(88vw,320px)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <p className="text-center fw-semibold mb-4" style={{ fontSize: '1rem' }}>예적금을 삭제하시겠습니까?</p>
            <div className="d-flex gap-2">
              <button className="btn flex-fill" onClick={handleDeleteSavings} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>확인</button>
              <button className="btn btn-outline-secondary flex-fill" onClick={() => setConfirmSavings(null)} style={{ borderRadius: 10 }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {confirmInv && (
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 20, padding: '24px 20px', width: 'min(88vw,320px)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <p className="text-center fw-semibold mb-4" style={{ fontSize: '1rem' }}>투자 항목을 삭제하시겠습니까?</p>
            <div className="d-flex gap-2">
              <button className="btn flex-fill" onClick={handleDeleteInv} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>확인</button>
              <button className="btn btn-outline-secondary flex-fill" onClick={() => setConfirmInv(null)} style={{ borderRadius: 10 }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {editSheetOpen && (
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'flex-end', justifyContent: 'center', opacity: editSheetVisible ? 1 : 0, transition: 'opacity 0.28s ease' }}
          onClick={e => e.target === e.currentTarget && closeEdit()}>
          <div style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '20px 16px 0', transform: editSheetVisible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h6 className="mb-0 fw-bold">{editCard?.name} 수정</h6>
              <button onClick={closeEdit} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#aaa', lineHeight: 1, padding: '0 4px' }}>&times;</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, paddingBottom: 20 }}>
              <form id="edit-card-form" onSubmit={handleEditSave}>
                <div className="mb-3">
                  <label className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>초기 잔고 (앱 사용 시작 전 계좌 잔액)</label>
                  <div style={{ position: 'relative' }}>
                    <input type="text" inputMode="text" className="form-control" style={{ borderRadius: 10, fontSize: '1rem', paddingRight: 36 }}
                      value={editInitial} onChange={e => fmtInput(e.target.value, setEditInitial, true)} />
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>월 실적 목표 금액</label>
                  <div style={{ position: 'relative' }}>
                    <input type="text" inputMode="numeric" className="form-control" style={{ borderRadius: 10, fontSize: '1rem', paddingRight: 36 }}
                      value={editTarget} onChange={e => fmtInput(e.target.value, setEditTarget)} />
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>색상 구간 설정 (%)</label>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <span className="badge" style={{ background: '#dc3545' }}>빨강 ≤</span>
                    <input type="number" className="form-control form-control-sm" style={{ width: 60, borderRadius: 8 }} value={editTier1} min={0} max={100} onChange={e => setEditTier1(+e.target.value)} />
                    <span className="badge" style={{ background: '#ffc107', color: '#333' }}>노랑 ≤</span>
                    <input type="number" className="form-control form-control-sm" style={{ width: 60, borderRadius: 8 }} value={editTier2} min={0} max={100} onChange={e => setEditTier2(+e.target.value)} />
                    <span className="badge" style={{ background: '#0d6efd' }}>파랑 ≤</span>
                    <input type="number" className="form-control form-control-sm" style={{ width: 60, borderRadius: 8 }} value={editTier3} min={0} max={100} onChange={e => setEditTier3(+e.target.value)} />
                    <span className="badge" style={{ background: '#198754' }}>초록</span>
                  </div>
                </div>
                <div className="mb-2">
                  <label className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>혜택 사이트 URL (선택)</label>
                  <input type="url" className="form-control" style={{ borderRadius: 10, fontSize: '1rem' }} placeholder="https://..."
                    value={editUrl} onChange={e => setEditUrl(e.target.value)} />
                </div>
                {editUrl && (
                  <a href={editUrl} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-block', fontSize: '0.82rem', color: '#b088f9', textDecoration: 'none', marginBottom: 8 }}>
                    🔗 혜택 사이트 바로가기
                  </a>
                )}
              </form>
            </div>
            <div style={{ padding: '12px 0 48px', flexShrink: 0 }}>
              <div className="d-flex gap-2">
                <button type="submit" form="edit-card-form" className="btn flex-fill" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 600 }}>저장</button>
                <button type="button" className="btn btn-outline-secondary flex-fill" onClick={closeEdit} style={{ borderRadius: 10, padding: '12px 0', fontWeight: 600 }}>취소</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
