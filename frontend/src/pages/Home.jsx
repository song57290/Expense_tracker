import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api.js'
import { fmt, today, bankColor, bankLogo } from '../utils.js'

function SwipeItem({ children, onDelete }) {
  const startX = useRef(null)
  const [offset, setOffset] = useState(0)

  const onTouchStart = e => { startX.current = e.touches[0].clientX; setOffset(0) }
  const onTouchMove = e => {
    if (startX.current === null) return
    const diff = startX.current - e.touches[0].clientX
    if (diff > 0) setOffset(Math.min(diff, 80))
  }
  const onTouchEnd = () => {
    setOffset(o => o > 40 ? 80 : 0)
    startX.current = null
  }

  return (
    <div className="swipe-wrapper">
      <div className="swipe-inner" style={{ transform: `translateX(-${offset}px)` }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        {children}
      </div>
      <div className="swipe-delete" style={{ transform: `translateX(${80 - offset}px)`, transition: offset === 80 || offset === 0 ? 'transform 0.2s' : 'none' }}
        onClick={onDelete}>삭제</div>
    </div>
  )
}

function TierBar({ percent, tier1, tier2, tier3 }) {
  const color = percent >= tier3 ? '#34c759' : percent >= tier2 ? '#ff9500' : percent >= tier1 ? '#ffcc00' : '#e5e5ea'
  return (
    <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ width: `${Math.min(percent, 100)}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s' }} />
    </div>
  )
}

export default function Home() {
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('all')
  const [summaryOpen, setSummaryOpen] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [form, setForm] = useState({ date: today(), type: 'expense', category: '', amount: '', description: '', card: '' })
  const [amountDisplay, setAmountDisplay] = useState('')
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const load = useCallback(() => {
    api.get('/api/home').then(setData).catch(console.error)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (data) {
      const cats = form.type === 'expense' ? data.expense_cats : data.income_cats
      if (cats.length && !cats.find(c => c[0] === form.category)) {
        setForm(f => ({ ...f, category: cats[0][0] }))
      }
    }
  }, [form.type, data])

  if (!data) return <div className="text-center py-5"><div className="spinner-border" style={{ color: '#b088f9' }} /></div>

  const filtered = data.transactions.filter(tx => filter === 'all' || tx.type === filter)
  const cats = form.type === 'expense' ? data.expense_cats : data.income_cats

  async function handleAdd(e) {
    e.preventDefault()
    const amt = parseInt(amountDisplay.replace(/,/g, '')) || 0
    if (!amt || !form.category) return
    await api.post('/api/transactions', { ...form, amount: amt })
    setForm({ date: today(), type: form.type, category: form.category, amount: '', description: '', card: form.card })
    setAmountDisplay('')
    load()
  }

  async function handleDelete(id) {
    if (!confirm('이 내역을 삭제할까요?')) return
    await api.delete(`/api/transactions/${id}`)
    load()
  }

  const budgetPct = data.budget_amount > 0 ? Math.min(Math.round(data.expense_total / data.budget_amount * 100), 100) : 0

  return (
    <div>
      {params.get('imported') && (
        <div className="alert alert-success mb-3" style={{ borderRadius: 12 }}>
          {params.get('imported')}건 가져오기 완료{params.get('skipped') ? ` (${params.get('skipped')}건 건너뜀)` : ''}
        </div>
      )}

      {/* Monthly Summary */}
      <div className="card mb-3" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body pb-2">
          <div className="d-flex justify-content-between align-items-center mb-3" style={{ cursor: 'pointer' }} onClick={() => setSummaryOpen(o => !o)}>
            <span className="fw-semibold" style={{ color: '#1c1c1e' }}>이번 달 요약</span>
            <i className={`bi bi-caret-${summaryOpen ? 'up' : 'down'}-fill`} style={{ color: '#b088f9', fontSize: '0.8rem' }} />
          </div>
          {summaryOpen && (
            <>
              <div className="row g-2 mb-3">
                {[['수입', data.income_total, '#34c759'], ['지출', data.expense_total, '#ff3b30'], ['잔액', data.balance, '#007aff']].map(([label, val, color]) => (
                  <div key={label} className="col-4">
                    <div className="summary-card text-center">
                      <div style={{ fontSize: '0.75rem', color: color, fontWeight: 600, marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1c1c1e' }}>{fmt(val)}원</div>
                    </div>
                  </div>
                ))}
              </div>

              {data.budget_amount > 0 && (
                <div className="mb-3">
                  <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.8rem', color: '#666' }}>
                    <span>예산 {fmt(data.budget_amount)}원</span>
                    <span style={{ color: data.remaining < 0 ? '#ff3b30' : '#34c759' }}>
                      {data.remaining < 0 ? '초과 ' + fmt(Math.abs(data.remaining)) : '잔여 ' + fmt(data.remaining)}원
                    </span>
                  </div>
                  <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${budgetPct}%`, height: '100%', background: budgetPct >= 100 ? '#ff3b30' : budgetPct >= 80 ? '#ff9500' : '#34c759', borderRadius: 3, transition: 'width 0.5s' }} />
                  </div>
                </div>
              )}

              {Object.keys(data.category_totals).length > 0 && (
                <div className="mb-3">
                  {Object.entries(data.category_totals).slice(0, 5).map(([cat, amt]) => (
                    <div key={cat} className="d-flex justify-content-between align-items-center py-1" style={{ fontSize: '0.85rem' }}>
                      <span>{data.emoji_map[cat] || '📦'} {cat}</span>
                      <span style={{ color: '#ff3b30', fontWeight: 600 }}>{fmt(amt)}원</span>
                    </div>
                  ))}
                </div>
              )}

              {data.card_stats.length > 0 && (
                <div>
                  {data.card_stats.map(cs => (
                    <div key={cs.name} className="mb-2">
                      <div className="d-flex justify-content-between" style={{ fontSize: '0.8rem' }}>
                        <span style={{ color: '#555' }}>{cs.name}</span>
                        <span style={{ color: '#888' }}>{fmt(cs.spent)} / {fmt(cs.target)}원</span>
                      </div>
                      <TierBar percent={cs.percent} tier1={cs.tier1} tier2={cs.tier2} tier3={cs.tier3} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add Transaction */}
      <div className="card mb-3" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-2" style={{ cursor: 'pointer' }} onClick={() => setAddOpen(o => !o)}>
            <span className="fw-semibold" style={{ color: '#1c1c1e' }}>내역 추가</span>
            <i className={`bi bi-caret-${addOpen ? 'up' : 'down'}-fill`} style={{ color: '#b088f9', fontSize: '0.8rem' }} />
          </div>
          {addOpen && (
            <form onSubmit={handleAdd}>
              <div className="row g-2">
                <div className="col-6 col-lg-2">
                  <input type="date" className="form-control" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
                </div>
                <div className="col-6 col-lg-2">
                  <select className="form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="expense">지출</option>
                    <option value="income">수입</option>
                  </select>
                </div>
                <div className="col-6 col-lg-2">
                  <select className="form-select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {cats.map(([name, icon]) => <option key={name} value={name}>{icon} {name}</option>)}
                  </select>
                </div>
                <div className="col-6 col-lg-2">
                  <input className="form-control" inputMode="numeric" placeholder="금액" value={amountDisplay}
                    onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); setAmountDisplay(raw ? parseInt(raw).toLocaleString('ko-KR') : '') }} required />
                </div>
                <div className="col-12 col-lg-2">
                  <input className="form-control" placeholder="항목 설명" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="col-12 col-lg-2">
                  <select className="form-select" value={form.card} onChange={e => setForm(f => ({ ...f, card: e.target.value }))}>
                    <option value="">카드 선택</option>
                    {data.card_list.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="d-flex justify-content-between align-items-center mt-3">
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setImportOpen(true)}>
                  <i className="bi bi-upload" /> 가져오기
                </button>
                <button type="submit" className="btn btn-sm px-4" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>
                  추가
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="d-flex gap-2 mb-3">
        {[['all', '전체'], ['expense', '지출'], ['income', '수입']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)} className={`pill-btn ${filter === val ? 'pill-active' : 'pill-inactive'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Transaction List */}
      <div className="card" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="text-center py-5" style={{ color: '#aaa' }}>내역이 없습니다</div>
        ) : (
          filtered.map((tx, i) => {
            const isFirst = i === 0 || filtered[i - 1].date !== tx.date
            return (
              <div key={tx.id}>
                {isFirst && (
                  <div style={{ padding: '8px 16px 4px', fontSize: '0.78rem', color: '#999', background: '#fafafa', borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }}>
                    {tx.date}
                  </div>
                )}
                <SwipeItem onDelete={() => handleDelete(tx.id)}>
                  <div className="d-flex align-items-center" style={{ padding: '12px 16px', borderTop: '1px solid #f5f5f5', cursor: 'pointer', background: 'white' }}
                    onClick={() => navigate(`/edit/${tx.id}`)}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f0eeff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0, marginRight: 12 }}>
                      {data.emoji_map[tx.category] || '📦'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1c1c1e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {tx.description || tx.category}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#999' }}>{tx.category}{tx.card ? ' · ' + tx.card : ''}</div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: tx.type === 'income' ? '#34c759' : '#ff3b30', flexShrink: 0 }}>
                      {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}원
                    </div>
                  </div>
                </SwipeItem>
              </div>
            )
          })
        )}
      </div>

      {/* Import Modal */}
      {importOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 480, padding: 24 }}>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h5 className="mb-0">가져오기</h5>
              <button onClick={() => setImportOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#aaa', cursor: 'pointer' }}>&times;</button>
            </div>
            <div className="d-flex flex-column gap-3">
              <a href="/import/template" className="btn btn-outline-secondary">
                <i className="bi bi-download me-2" />엑셀 양식 다운로드
              </a>
              <form action="/import" method="post" encType="multipart/form-data">
                <label className="btn w-100" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 12 }}>
                  <i className="bi bi-file-earmark-excel me-2" />엑셀 파일 (.xlsx/.xls)
                  <input type="file" name="file" accept=".xlsx,.xls" hidden onChange={e => e.target.form.submit()} />
                </label>
              </form>
              <form action="/import/text" method="post" onSubmit={() => setImportOpen(false)}>
                <textarea name="text" className="form-control mb-2" rows={4} placeholder="문자 내용을 여기에 붙여넣으세요..." style={{ borderRadius: 12 }} />
                <button type="submit" className="btn w-100" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 12 }}>
                  <i className="bi bi-chat-text me-2" />문자 가져오기
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
