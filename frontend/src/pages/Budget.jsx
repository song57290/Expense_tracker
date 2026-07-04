import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api.js'
import { fmt, bankLogo, fmtMonth, today } from '../utils.js'

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
              {[['card', '💳 카드 / 은행'], ['cash', '💵 현금']].map(([t, label]) => (
                <button key={t} type="button" onClick={() => switchType(t)}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: `2px solid ${assetType === t ? '#b088f9' : '#eee'}`, background: assetType === t ? 'rgba(176,136,249,0.1)' : 'white', color: assetType === t ? '#b088f9' : '#888', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>

            {assetType === 'card' && (<>
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
              placeholder={assetType === 'cash' ? '이름 (예: 현금, 지갑)' : '카드/은행 이름 (위 선택 시 자동 입력)'}
              value={name} onChange={e => setName(e.target.value)} required style={{ borderRadius: 10 }} />
            <input type="text" className="form-control mb-2" placeholder="초기 잔고 (현재 보유 금액, 선택)" inputMode="numeric"
              value={initialBalance} onChange={e => {
                const raw = e.target.value.replace(/[^0-9]/g, '')
                setInitialBalance(raw ? parseInt(raw).toLocaleString('ko-KR') : '')
              }} style={{ borderRadius: 10 }} />
            <input type="text" className="form-control mb-2" placeholder={assetType === 'cash' ? '월 지출 목표 (선택)' : '월 목표 금액 (선택)'} inputMode="numeric"
              value={target} onChange={e => {
                const raw = e.target.value.replace(/[^0-9]/g, '')
                setTarget(raw ? parseInt(raw).toLocaleString('ko-KR') : '')
              }} style={{ borderRadius: 10 }} />
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
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#555' }}>{fmt(card.initial_balance)}</div>
          </div>
          <div className="text-center flex-fill" style={{ borderRight: '1px solid #eee' }}>
            <div className="text-muted" style={{ fontSize: '0.8rem' }}>수입</div>
            <div className="text-success" style={{ fontSize: '0.9rem', fontWeight: 600 }}>{fmt(card.total_income)}</div>
          </div>
          <div className="text-center flex-fill">
            <div className="text-muted" style={{ fontSize: '0.8rem' }}>지출</div>
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

function SavingsItem({ item, onEdit, onDelete }) {
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

  const logo = bankLogo(item.bank || item.name)
  const deleteWidth = Math.max(0, -offsetX)
  const editWidth = Math.max(0, offsetX)
  const dDayText = item.d_day > 0 ? `D-${item.d_day}` : item.d_day === 0 ? 'D-Day' : `D+${Math.abs(item.d_day)}`
  const dDayColor = item.d_day < 0 ? '#198754' : item.d_day < 30 ? '#dc3545' : '#b088f9'

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
            <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: 8, background: item.stype === '예금' ? '#e8f4fd' : '#f0e8fd', color: item.stype === '예금' ? '#0d6efd' : '#b088f9' }}>{item.stype}</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: 8, background: '#f5f5f5', color: '#888' }}>{item.interest_type || '단리'}</span>
          </div>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: dDayColor }}>{dDayText}</span>
        </div>
        <div className="d-flex mb-2" style={{ gap: 1 }}>
          <div className="text-center flex-fill" style={{ borderRight: '1px solid #eee' }}>
            <div style={{ fontSize: '0.75rem', color: '#888' }}>{item.stype === '예금' ? '예치금액' : '월 납입액'}</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{fmt(item.amount)}원</div>
          </div>
          <div className="text-center flex-fill" style={{ borderRight: '1px solid #eee' }}>
            <div style={{ fontSize: '0.75rem', color: '#888' }}>연 이율</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{item.interest_rate}%</div>
          </div>
          <div className="text-center flex-fill">
            <div style={{ fontSize: '0.75rem', color: '#888' }}>만기 수령</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#198754' }}>{fmt(item.maturity_amount)}원</div>
          </div>
        </div>
        {item.stype === '적금' && (
          <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.75rem', color: '#888' }}>
            <span>납입 {fmt(item.current_paid)} / {fmt(item.total_paid)}원</span>
            <span>예상 이자 +{fmt(item.interest)}원</span>
          </div>
        )}
        {item.stype === '예금' && (
          <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.75rem', color: '#888' }}>
            <span>{item.months_total}개월</span>
            <span>예상 이자 +{fmt(item.interest)}원</span>
          </div>
        )}
        <div className="progress" style={{ height: 7, borderRadius: 4 }}>
          <div className="progress-bar" style={{ width: `${item.progress}%`, background: 'linear-gradient(90deg,#b088f9,#7baff0)', borderRadius: 4 }} />
        </div>
        <div className="d-flex justify-content-between mt-1">
          <span style={{ fontSize: '0.7rem', color: '#aaa' }}>{item.start_date}</span>
          <span style={{ fontSize: '0.7rem', color: '#aaa' }}>{item.end_date}</span>
        </div>
      </div>
    </div>
  )
}

function SavingsSheet({ open, visible, onClose, onSaved, editItem }) {
  const [stype, setStype] = useState('예금')
  const [itype, setItype] = useState('단리')
  const [selected, setSelected] = useState('')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [rate, setRate] = useState('')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    if (!open) return
    if (editItem) {
      setStype(editItem.stype || '예금')
      setItype(editItem.interest_type || '단리')
      setSelected(editItem.bank || '')
      setName(editItem.name || '')
      setAmount((editItem.amount || 0).toLocaleString('ko-KR'))
      setRate(String(editItem.interest_rate ?? ''))
      setStartDate(editItem.start_date || today())
      setEndDate(editItem.end_date || '')
    } else {
      setStype('예금'); setItype('단리'); setSelected(''); setName(''); setAmount(''); setRate(''); setStartDate(today()); setEndDate('')
    }
  }, [open, editItem])

  function pickBank(bankName) { setSelected(bankName); setName(bankName) }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = { stype, interest_type: itype, bank: selected, name: name.trim(), amount: parseInt(amount.replace(/,/g, '')) || 0, interest_rate: parseFloat(rate) || 0, start_date: startDate, end_date: endDate }
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
              {['예금', '적금'].map(t => (
                <button key={t} type="button" onClick={() => setStype(t)}
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
            <input type="text" className="form-control mb-2" placeholder={stype === '예금' ? '예치금액 (원)' : '월 납입액 (원)'} inputMode="numeric"
              value={amount} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); setAmount(raw ? parseInt(raw).toLocaleString('ko-KR') : '') }} required style={{ borderRadius: 10 }} />
            <div className="d-flex gap-2 mb-3">
              <input type="number" className="form-control" placeholder="연 이율 (%)" step="0.01" min="0" max="100"
                value={rate} onChange={e => setRate(e.target.value)} required style={{ borderRadius: 10 }} />
              {['단리', '복리'].map(t => (
                <button key={t} type="button" onClick={() => setItype(t)}
                  style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 10, border: `2px solid ${itype === t ? '#b088f9' : '#eee'}`, background: itype === t ? 'rgba(176,136,249,0.1)' : 'white', color: itype === t ? '#b088f9' : '#888', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
                  {t}
                </button>
              ))}
            </div>
            <div className="d-flex gap-2 mb-2">
              <div className="flex-fill">
                <label className="text-muted mb-1 d-block" style={{ fontSize: '0.75rem' }}>시작일</label>
                <input type="date" className="form-control" value={startDate} onChange={e => setStartDate(e.target.value)} required style={{ borderRadius: 10 }} />
              </div>
              <div className="flex-fill">
                <label className="text-muted mb-1 d-block" style={{ fontSize: '0.75rem' }}>만기일</label>
                <input type="date" className="form-control" value={endDate} onChange={e => setEndDate(e.target.value)} required style={{ borderRadius: 10 }} />
              </div>
            </div>
            <div className="d-flex gap-2 mb-3">
              {[['6개월', 6], ['1년', 12], ['2년', 24], ['3년', 36]].map(([label, months]) => (
                <button key={label} type="button" onClick={() => applyDuration(months)}
                  style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: '1.5px solid #e8d5ff', background: 'white', color: '#b088f9', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
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
  '코인': { bg: '#fffbe8', color: '#c9960a' },
  'ETF': { bg: '#e8f4ff', color: '#0d6efd' },
  '기타': { bg: '#f2f2f7', color: '#666' },
}
const ITYPE_ICONS = { '국내주식': '🇰🇷', '해외주식': '🌎', '코인': '₿', 'ETF': '📊', '기타': '📦' }

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
          </div>
          <span style={{ fontSize: '0.8rem', color: '#aaa' }}>{item.ticker || ''}</span>
        </div>
        <div className="d-flex mb-2" style={{ gap: 1 }}>
          <div className="text-center flex-fill" style={{ borderRight: '1px solid #eee' }}>
            <div style={{ fontSize: '0.72rem', color: '#888' }}>평가금액</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{fmt(item.current_value)}원</div>
          </div>
          <div className="text-center flex-fill" style={{ borderRight: '1px solid #eee' }}>
            <div style={{ fontSize: '0.72rem', color: '#888' }}>매수금액</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#555' }}>{fmt(item.purchase_value)}원</div>
          </div>
          <div className="text-center flex-fill">
            <div style={{ fontSize: '0.72rem', color: '#888' }}>수익</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: isProfit ? '#198754' : '#dc3545' }}>
              {isProfit ? '+' : ''}{fmt(item.profit)}원
            </div>
          </div>
        </div>
        <div className="d-flex justify-content-between" style={{ fontSize: '0.72rem', color: '#aaa' }}>
          <span>수량 {item.quantity}</span>
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
  const [name, setName] = useState('')
  const [ticker, setTicker] = useState('')
  const [quantity, setQuantity] = useState('')
  const [avgPrice, setAvgPrice] = useState('')
  const [currentPrice, setCurrentPrice] = useState('')
  const [memo, setMemo] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchResult, setFetchResult] = useState(null)

  useEffect(() => {
    if (!open) return
    if (editItem) {
      setItype(editItem.itype || '국내주식')
      setName(editItem.name || '')
      setTicker(editItem.ticker || '')
      setQuantity(String(editItem.quantity ?? ''))
      setAvgPrice(editItem.avg_price ? Math.round(editItem.avg_price).toLocaleString('ko-KR') : '')
      setCurrentPrice(editItem.current_price != null ? Math.round(editItem.current_price).toLocaleString('ko-KR') : '')
      setMemo(editItem.memo || '')
    } else {
      setItype('국내주식'); setName(''); setTicker(''); setQuantity(''); setAvgPrice(''); setCurrentPrice(''); setMemo('')
    }
    setFetchResult(null)
  }, [open, editItem])

  const ITYPES = ['국내주식', '해외주식', '코인', 'ETF', '기타']
  const tickerHints = { '국내주식': '예) 005930 (삼성전자)', '해외주식': '예) AAPL, TSLA', '코인': '예) KRW-BTC, KRW-ETH', 'ETF': '예) 069500 (KODEX200), QQQ', '기타': '' }

  async function fetchPrice() {
    if (!ticker.trim()) return
    setFetching(true); setFetchResult(null)
    try {
      const res = await api.get(`/api/investments/price?ticker=${encodeURIComponent(ticker.trim())}&itype=${encodeURIComponent(itype)}`)
      if (res.ok) {
        const krw = Math.round(res.price_krw)
        setCurrentPrice(krw.toLocaleString('ko-KR'))
        setFetchResult({ currency: res.currency, price: res.price, price_krw: res.price_krw })
      } else {
        setFetchResult({ error: res.error || '조회 실패' })
      }
    } catch { setFetchResult({ error: '네트워크 오류' }) }
    finally { setFetching(false) }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      itype, name: name.trim(), ticker: ticker.trim(),
      quantity: parseFloat(quantity) || 0,
      avg_price: parseFloat(avgPrice.replace(/,/g, '')) || 0,
      current_price: currentPrice ? parseFloat(currentPrice.replace(/,/g, '')) : null,
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
            <div data-scroll-x className="d-flex gap-2 overflow-auto pb-2 mb-3" style={{ scrollbarWidth: 'none' }}>
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

            <input type="text" placeholder="수량 (소수 가능, 예: 0.5)" value={quantity} onChange={e => setQuantity(e.target.value)} required
              inputMode="decimal" style={{ ...inp, marginBottom: 10 }} />
            <input type="text" placeholder="평균 매수가 (원)" value={avgPrice} inputMode="numeric"
              onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); setAvgPrice(r ? parseInt(r).toLocaleString('ko-KR') : '') }}
              required style={{ ...inp, marginBottom: 10 }} />
            <input type="text" placeholder="현재가 (원, 선택사항)" value={currentPrice} inputMode="numeric"
              onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); setCurrentPrice(r ? parseInt(r).toLocaleString('ko-KR') : '') }}
              style={{ ...inp, marginBottom: 10 }} />
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

  function fmtInput(val, setter) {
    const raw = val.replace(/[^0-9]/g, '')
    setter(raw ? parseInt(raw).toLocaleString('ko-KR') : '')
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
            onDelete={() => setConfirmSavings(item)} />
        ))
      )}

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
                  <input type="text" inputMode="numeric" className="form-control" style={{ borderRadius: 10, fontSize: '1rem' }}
                    value={editInitial} onChange={e => fmtInput(e.target.value, setEditInitial)} />
                </div>
                <div className="mb-3">
                  <label className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>월 실적 목표 금액</label>
                  <input type="text" inputMode="numeric" className="form-control" style={{ borderRadius: 10, fontSize: '1rem' }}
                    value={editTarget} onChange={e => fmtInput(e.target.value, setEditTarget)} />
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
