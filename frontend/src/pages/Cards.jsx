import { useState, useEffect, useCallback } from 'react'
import api from '../api.js'
import { fmt, bankLogo } from '../utils.js'

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

export default function Cards() {
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState('')
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [url, setUrl] = useState('')
  const [tier1, setTier1] = useState(20)
  const [tier2, setTier2] = useState(50)
  const [tier3, setTier3] = useState(80)
  const [tierOpen, setTierOpen] = useState(false)

  const load = useCallback(() => api.get('/api/cards').then(setData).catch(console.error), [])
  useEffect(() => { load() }, [load])

  function pickCard(cardName) {
    setSelected(cardName)
    setName(cardName)
  }

  async function handleAdd(e) {
    e.preventDefault()
    const t = parseInt(target.replace(/,/g, '')) || 0
    await api.post('/api/cards', { name, target: t, url, tier1, tier2, tier3 })
    setSelected(''); setName(''); setTarget(''); setUrl('')
    setTier1(20); setTier2(50); setTier3(80); setTierOpen(false)
    load()
  }

  function fmtTarget(val) {
    const raw = val.replace(/[^0-9]/g, '')
    setTarget(raw ? parseInt(raw).toLocaleString('ko-KR') : '')
  }

  function BankBtn({ bankName, logo, label }) {
    const isSelected = selected === bankName
    return (
      <button type="button"
        onClick={() => pickCard(bankName)}
        className="d-flex flex-column align-items-center rounded-3 p-2 flex-shrink-0"
        style={{ border: `1.5px solid ${isSelected ? '#b088f9' : '#e8d5ff'}`, background: isSelected ? 'rgba(176,136,249,0.12)' : 'white', width: 82, cursor: 'pointer' }}>
        <img src={logo} style={{ width: 48, height: 48, objectFit: 'contain' }} />
        <span style={{ fontSize: 11, color: '#555', marginTop: 4, textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
      </button>
    )
  }

  if (!data) return <div className="text-center py-5"><div className="spinner-border" style={{ color: '#b088f9' }} /></div>

  return (
    <div>
      {/* 카드 추가 */}
      <div className="card mb-4">
        <div className="card-body">
          <h5 className="card-title">카드 추가</h5>
          <form onSubmit={handleAdd} className="row g-2">
            <div className="col-12">
              <p className="mb-1 text-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>은행</p>
              <div className="d-flex gap-2 overflow-auto pb-1" data-no-page-swipe style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {BANKS.map(([bname, logo, label]) => (
                  <BankBtn key={bname} bankName={bname} logo={logo} label={label} />
                ))}
              </div>
              <p className="mb-1 mt-2 text-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>카드사</p>
              <div className="d-flex gap-2 pb-1" data-no-page-swipe>
                {CARD_COMPANIES.map(([bname, logo, label]) => (
                  <BankBtn key={bname} bankName={bname} logo={logo} label={label} />
                ))}
              </div>
            </div>
            <div className="col-12">
              <hr className="my-2" />
              <p className="mb-1 text-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                카드/은행 이름 <span className="fw-normal">(위 목록 클릭 시 자동 입력, 직접 수정 가능)</span>
              </p>
              <input type="text" className="form-control" placeholder="예: 신한 SOL카드, IBK 기업 체크카드 ..."
                value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="col-md-4">
              <input type="text" className="form-control" placeholder="월 목표 금액" inputMode="numeric"
                value={target} onChange={e => fmtTarget(e.target.value)} required />
            </div>
            <div className="col-md-6">
              <input type="url" className="form-control" placeholder="혜택 사이트 URL (선택)"
                value={url} onChange={e => setUrl(e.target.value)} />
            </div>
            <div className="col-md-2">
              <button type="submit" className="btn w-100" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>추가</button>
            </div>
            <div className="col-12">
              <button type="button" style={{ fontSize: '0.8rem', color: '#b088f9', background: 'none', border: 'none', padding: 0 }}
                onClick={() => setTierOpen(o => !o)}>
                실적 구간 설정 {tierOpen ? '▴' : '▾'}
              </button>
              {tierOpen && (
                <div className="d-flex align-items-center gap-2 flex-wrap" style={{ paddingTop: 6 }}>
                  <span className="badge" style={{ background: '#dc3545' }}>빨강 ≤</span>
                  <input type="number" className="form-control form-control-sm" style={{ width: 60 }} value={tier1} min={0} max={100} onChange={e => setTier1(+e.target.value)} />
                  <span className="badge" style={{ background: '#ffc107', color: '#333' }}>노랑 ≤</span>
                  <input type="number" className="form-control form-control-sm" style={{ width: 60 }} value={tier2} min={0} max={100} onChange={e => setTier2(+e.target.value)} />
                  <span className="badge" style={{ background: '#0d6efd' }}>파랑 ≤</span>
                  <input type="number" className="form-control form-control-sm" style={{ width: 60 }} value={tier3} min={0} max={100} onChange={e => setTier3(+e.target.value)} />
                  <span className="badge" style={{ background: '#198754' }}>초록</span>
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>%</span>
                </div>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* 카드 목록 */}
      <div className="card">
        <div className="card-body">
          <h5 className="card-title">카드 목록</h5>
          {data.cards.length === 0 ? (
            <p className="text-muted text-center py-3">등록된 카드가 없습니다.</p>
          ) : data.cards.map(card => {
            const logo = bankLogo(card.name)
            const stat = data.stats[card.id] || {}
            return (
              <div key={card.id} style={{ borderRadius: 10, marginBottom: 6, border: '1px solid #eee', background: 'white', padding: '12px 14px' }}>
                <div className="d-flex justify-content-between align-items-center">
                  <span className="d-flex align-items-center gap-2">
                    {logo && <img src={logo} style={{ height: 28, width: 28, objectFit: 'contain', borderRadius: 6 }} />}
                    <span className="fw-semibold">{card.name}</span>
                  </span>
                  <div className="text-end">
                    <div className="text-muted small">{fmt(card.target)}원/월</div>
                    {card.url && (
                      <div className="mt-1">
                        <a href={card.url} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-primary" style={{ fontSize: '0.68rem', padding: '1px 7px' }}>혜택 사이트 →</a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="d-lg-none" style={{ height: 90 }} />
    </div>
  )
}
