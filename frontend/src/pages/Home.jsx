import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api.js'
import { fmt, today, bankColor, bankLogo, fmtDate } from '../utils.js'
import TxItem from '../components/TxItem.jsx'
import CategoryPicker from '../components/CategoryPicker.jsx'
import CardPicker from '../components/CardPicker.jsx'
import TransferPicker from '../components/TransferPicker.jsx'
import SwipeItem from '../components/SwipeItem.jsx'
import DatePickerSheet from '../components/DatePickerSheet.jsx'

// 슬라이딩 탭 인디케이터
function SlidingTabs({ options, value, onChange }) {
  const tabRefs = useRef([])
  const indRef = useRef(null)
  useEffect(() => {
    const idx = options.findIndex(o => o[0] === value)
    const tab = tabRefs.current[idx]
    const ind = indRef.current
    if (tab && ind) {
      ind.style.left = tab.offsetLeft + 'px'
      ind.style.width = tab.offsetWidth + 'px'
    }
  }, [value, options])
  return (
    <div style={{ display: 'flex', background: 'var(--bg-accent)', borderRadius: 20, padding: 3, gap: 2, position: 'relative' }}>
      <div ref={indRef} style={{ position: 'absolute', top: 3, bottom: 3, background: 'var(--bg-card)', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.12)', zIndex: 0, pointerEvents: 'none', transition: 'left 0.28s cubic-bezier(0.25,0.46,0.45,0.94),width 0.28s cubic-bezier(0.25,0.46,0.45,0.94)' }} />
      {options.map(([val, label], i) => (
        <button key={val} ref={el => tabRefs.current[i] = el} onClick={() => onChange(val)}
          style={{ position: 'relative', zIndex: 1, borderRadius: 16, padding: '3px 12px', fontSize: '0.8rem', background: 'transparent', color: value === val ? '#b088f9' : 'var(--text-muted)', border: 'none', fontWeight: value === val ? 600 : 400, transition: 'color 0.22s' }}>
          {label}
        </button>
      ))}
    </div>
  )
}


export default function Home() {
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('all')
  const [sortAsc, setSortAsc] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(true)
  const [cardStatOpen, setCardStatOpen] = useState(true)
  const [catOpen, setCatOpen] = useState(true)
  const [addOpen, setAddOpen] = useState(true)
  const [txOpen, setTxOpen] = useState(true)
  const [importOpen, setImportOpen] = useState(false)
  const [importTab, setImportTab] = useState('text')
  const [confirmSheet, setConfirmSheet] = useState(null) // tx.id
  const [cardFilter, setCardFilter] = useState('all')
  const [cardSheet, setCardSheet] = useState(null) // card name
  const [cardSheetVisible, setCardSheetVisible] = useState(false)
  const [cardSheetSortAsc, setCardSheetSortAsc] = useState(false)
  const [hiddenCards, setHiddenCards] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('hidden_card_stats') || '[]')) }
    catch { return new Set() }
  })
  const [hideCardConfirm, setHideCardConfirm] = useState(null)
  const [hideCardVisible, setHideCardVisible] = useState(false)
  const cardLongPressTimer = useRef(null)
  const wasLongPress = useRef(false)
  const [form, setForm] = useState({ date: today(), type: 'expense', category: '', amount: '', description: '', card: '', exclude_perf: false, exclude_stats: false })
  const [amountDisplay, setAmountDisplay] = useState('')
  const [cardError, setCardError] = useState(false)
  const [transferFrom, setTransferFrom] = useState('')
  const [transferTo, setTransferTo] = useState('')
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const load = useCallback(() => api.get('/api/home').then(setData).catch(console.error), [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    const d = params.get('date')
    if (d) setForm(f => ({ ...f, date: d }))
  }, [params])

  useEffect(() => {
    const open = !!confirmSheet || !!cardSheet || importOpen
    document.body.classList.toggle('sheet-open', open)
    return () => document.body.classList.remove('sheet-open')
  }, [confirmSheet, cardSheet, importOpen])

  useEffect(() => {
    if (data) {
      const cats = form.type === 'expense' ? data.expense_cats : data.income_cats
      if (cats.length && !cats.find(c => c[0] === form.category)) {
        const defaultCat = cats[0][0]
        const autoExcl = form.type === 'expense' && (data.excl_cat_names || []).includes(defaultCat)
        const autoExclStats = (data.excl_stat_cat_names || []).includes(defaultCat)
        setForm(f => ({ ...f, category: defaultCat, exclude_perf: autoExcl, exclude_stats: autoExclStats }))
      }
    }
  }, [form.type, data])

  if (!data) return <div className="text-center py-5"><div className="spinner-border" style={{ color: '#b088f9' }} /></div>

  const cats = form.type === 'expense' ? data.expense_cats : data.income_cats

  let filtered = data.transactions.filter(tx =>
    (filter === 'all' || tx.type === filter) &&
    (cardFilter === 'all' || tx.card === cardFilter)
  )
  filtered = [...filtered].sort((a, b) => sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date))
  const allCards = [...new Set(data.transactions.map(tx => tx.card).filter(Boolean))].sort()

  const catSum = Object.values(data.category_totals).reduce((s, v) => s + v, 0)
  const budgetPct = data.budget_amount > 0 ? Math.min(Math.round(data.expense_total / data.budget_amount * 100), 100) : 0

  async function handleAdd(e) {
    e.preventDefault()
    const amt = parseInt(amountDisplay.replace(/,/g, '')) || 0
    if (!amt || !form.category) return
    if (data.card_list.length === 0) { navigate('/budget'); return }
    const isTransfer = form.category === '계좌 이체'
    if (!isTransfer && !form.card) { setCardError(true); return }
    setCardError(false)
    const payload = { ...form, amount: amt }
    if (isTransfer && transferFrom) payload.card = transferFrom
    await api.post('/api/transactions', payload)
    setForm(f => ({ ...f, amount: '', description: '', card: '', exclude_perf: false, exclude_stats: false }))
    setAmountDisplay('')
    setTransferFrom('')
    setTransferTo('')
    load()
  }

  async function handleDelete(id) {
    await api.delete(`/api/transactions/${id}`)
    setConfirmSheet(null)
    load()
  }

  function tierColor(pct, t1, t2, t3) {
    if (pct > t3) return 'bg-success'
    if (pct > t2) return 'bg-primary'
    if (pct > t1) return 'bg-warning'
    return 'bg-danger'
  }

  function openCardSheet(name) {
    setCardSheet(name)
    setCardSheetSortAsc(false)
    requestAnimationFrame(() => requestAnimationFrame(() => setCardSheetVisible(true)))
  }
  function closeCardSheet() {
    setCardSheetVisible(false)
    setTimeout(() => setCardSheet(null), 350)
  }
  function startCardLongPress(name) {
    wasLongPress.current = false
    cardLongPressTimer.current = setTimeout(() => {
      wasLongPress.current = true
      setHideCardConfirm(name)
      requestAnimationFrame(() => requestAnimationFrame(() => setHideCardVisible(true)))
    }, 500)
  }
  function cancelCardLongPress() {
    clearTimeout(cardLongPressTimer.current)
  }
  function closeHideCard() {
    setHideCardVisible(false)
    setTimeout(() => setHideCardConfirm(null), 260)
  }
  function hideCard(name) {
    const next = new Set(hiddenCards)
    next.add(name)
    setHiddenCards(next)
    localStorage.setItem('hidden_card_stats', JSON.stringify([...next]))
    closeHideCard()
  }
  function showCard(name) {
    const next = new Set(hiddenCards)
    next.delete(name)
    setHiddenCards(next)
    localStorage.setItem('hidden_card_stats', JSON.stringify([...next]))
  }

  const cardSheetTxs = cardSheet
    ? filtered.filter(tx => tx.card === cardSheet).sort((a, b) =>
        cardSheetSortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date))
    : []

  return (
    <div>
      {params.get('imported') && (
        <div className="alert alert-success alert-dismissible mb-3">
          {params.get('imported')}건 가져오기 완료{params.get('skipped') > 0 ? ` (오류 ${params.get('skipped')}건 제외)` : ''}
          <button className="btn-close" onClick={() => window.history.replaceState(null, '', '/')} />
        </div>
      )}

      {/* 이번 달 요약 */}
      <div className="d-flex justify-content-between align-items-center mb-2 px-1" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setSummaryOpen(o => !o)}>
        <span className="text-muted fw-semibold" style={{ fontSize: '1rem' }}>이번 달 요약</span>
        <span style={{ fontSize: '1.4rem', color: '#b088f9', lineHeight: 1 }}>{summaryOpen ? '▴' : '▾'}</span>
      </div>
      {summaryOpen && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 24 }}>
          {[
            { label: '수입', color: '#34c759', amt: `+${fmt(data.income_total)}원` },
            { label: '지출', color: '#ff3b30', amt: `-${fmt(data.expense_total)}원` },
            { label: '총계', color: data.balance >= 0 ? '#409cff' : '#ff3b30', amt: `${data.balance >= 0 ? '+' : ''}${fmt(data.balance)}원` },
          ].map(({ label, color, amt }) => (
            <div key={label} style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '14px 8px 12px', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>{label}</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color, wordBreak: 'break-all', lineHeight: 1.3 }}>{amt}</div>
            </div>
          ))}
        </div>
      )}

      {/* 카드 실적 */}
      {data.card_stats.length > 0 && (
        <div className="card mb-4">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setCardStatOpen(o => !o)}>
              <h5 className="card-title mb-0">카드 실적</h5>
              <span style={{ fontSize: '1.4rem', color: '#b088f9', lineHeight: 1 }}>{cardStatOpen ? '▴' : '▾'}</span>
            </div>
            {cardStatOpen && (() => {
              const visibleStats = data.card_stats.filter(cs => !cs.is_loan && !hiddenCards.has(cs.name))
              const hiddenStats = data.card_stats.filter(cs => !cs.is_loan && hiddenCards.has(cs.name))
              return (
                <>
                  {visibleStats.map(cs => {
                    const logo = bankLogo(cs.name)
                    return (
                      <div key={cs.name} className="mb-3 mt-2"
                        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                        onTouchStart={() => startCardLongPress(cs.name)} onTouchEnd={cancelCardLongPress} onTouchMove={cancelCardLongPress}
                        onMouseDown={() => startCardLongPress(cs.name)} onMouseUp={cancelCardLongPress} onMouseLeave={cancelCardLongPress}
                        onContextMenu={e => { e.preventDefault(); wasLongPress.current = true; setHideCardConfirm(cs.name); requestAnimationFrame(() => requestAnimationFrame(() => setHideCardVisible(true))) }}>
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="d-flex align-items-center gap-2">
                            {logo && <img src={logo} style={{ height: 28, width: 28, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />}
                            {cs.name}
                          </span>
                          <span className="text-nowrap">{fmt(cs.spent)}원 / {fmt(cs.target)}원</span>
                        </div>
                        <div className="progress" style={{ cursor: 'pointer', position: 'relative', height: 22 }}
                          onClick={() => { if (!wasLongPress.current) openCardSheet(cs.name); wasLongPress.current = false }}>
                          <div className={`progress-bar ${tierColor(cs.percent, cs.tier1, cs.tier2, cs.tier3)}`} style={{ width: `${cs.percent}%` }} />
                          <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', textShadow: '0 0 4px rgba(0,0,0,0.3)' }}>{cs.percent}%</span>
                        </div>
                      </div>
                    )
                  })}
                  {hiddenStats.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <button onClick={() => hiddenStats.forEach(cs => showCard(cs.name))}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', padding: '4px 0', cursor: 'pointer', textDecoration: 'underline' }}>
                        숨겨진 카드 {hiddenStats.length}개 표시
                      </button>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* 카테고리별 지출 */}
      {Object.keys(data.category_totals).length > 0 && (
        <div className="card mb-4">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setCatOpen(o => !o)}>
              <h5 className="card-title mb-0">카테고리별 지출 <span className="text-muted fw-normal" style={{ fontSize: '0.78rem' }}></span></h5>
              <span style={{ fontSize: '1.4rem', color: '#b088f9', lineHeight: 1 }}>{catOpen ? '▴' : '▾'}</span>
            </div>
            {catOpen && (() => {
              const catEntries = Object.entries(data.category_totals).sort(([, a], [, b]) => b - a)
              const maxAmt = catEntries[0]?.[1] || 1
              return catEntries.map(([cat, amt]) => (
                <div key={cat} className="mb-2 mt-2">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span style={{ fontSize: '0.9rem' }}>{data.emoji_map[cat] || '📦'} {cat}</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span className="text-muted" style={{ fontSize: '0.8rem', textAlign: 'right', minWidth: 60 }}>{fmt(amt)}원</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'right', minWidth: 34 }}>({catSum > 0 ? Math.round(amt / catSum * 100) : 0}%)</span>
                    </div>
                  </div>
                  <div className="progress" style={{ height: 5 }}>
                    <div className="progress-bar" style={{ width: `${(amt / maxAmt * 80).toFixed(1)}%`, background: 'linear-gradient(90deg,#b088f9,#7baff0)', borderRadius: 4 }} />
                  </div>
                </div>
              ))
            })()}
          </div>
        </div>
      )}

      {/* 내역 추가 */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setAddOpen(o => !o)}>
            <h5 className="card-title mb-0">내역 추가</h5>
            <span style={{ fontSize: '1.4rem', color: '#b088f9', lineHeight: 1 }}>{addOpen ? '▴' : '▾'}</span>
          </div>
          {addOpen && (
            <form onSubmit={handleAdd} className="row g-2 mt-1">
              <div className="col-6 col-lg-2">
                <DatePickerSheet value={form.date} onChange={date => setForm(f => ({ ...f, date }))} />
              </div>
              <div className="col-6 col-lg-2">
                <div style={{ position: 'relative', display: 'flex', background: 'var(--bg-accent)', borderRadius: 10, padding: 3, height: 38 }}>
                  <div style={{ position: 'absolute', top: 3, bottom: 3, width: 'calc(50% - 3px)', borderRadius: 8,
                    background: form.type === 'expense' ? '#ff3b30' : '#34c759',
                    transform: form.type === 'expense' ? 'translateX(0)' : 'translateX(calc(100% + 2px))',
                    transition: 'transform 0.26s cubic-bezier(0.25,0.46,0.45,0.94), background 0.26s',
                    boxShadow: form.type === 'expense' ? '0 2px 8px rgba(255,59,48,0.45)' : '0 2px 8px rgba(52,199,89,0.45)' }} />
                  {[['expense', '지출'], ['income', '수입']].map(([val, label]) => (
                    <button key={val} type="button" onClick={() => setForm(f => ({ ...f, type: val, exclude_perf: false, exclude_stats: false }))}
                      style={{ flex: 1, position: 'relative', zIndex: 1, borderRadius: 8, border: 'none', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', background: 'transparent',
                        color: form.type === val ? 'white' : 'var(--text-muted)', transition: 'color 0.26s' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-6 col-lg-2">
                <CategoryPicker cats={cats} value={form.category} onChange={cat => {
                  const autoExcl = form.type === 'expense' && (data.excl_cat_names || []).includes(cat)
                  const autoExclStats = (data.excl_stat_cat_names || []).includes(cat)
                  if (cat !== '계좌 이체') { setTransferFrom(''); setTransferTo('') }
                  setForm(f => ({ ...f, category: cat, exclude_perf: autoExcl, exclude_stats: autoExclStats, description: cat !== '계좌 이체' ? f.description : '' }))
                }} />
              </div>
              <div className="col-6 col-lg-2">
                <div style={{ position: 'relative' }}>
                  <input className="form-control" inputMode="numeric" placeholder="금액" value={amountDisplay}
                    onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); setAmountDisplay(raw ? parseInt(raw).toLocaleString('ko-KR') : '') }} required style={{ paddingRight: 36 }} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
                </div>
              </div>
              <div className="col-12 col-lg-2">
                {form.category === '계좌 이체' ? (
                  <TransferPicker
                    accounts={data.card_list}
                    from={transferFrom}
                    to={transferTo}
                    onFromChange={v => { setTransferFrom(v); setForm(f => ({ ...f, description: v && transferTo ? `${v} → ${transferTo}` : '' })) }}
                    onToChange={v => { setTransferTo(v); setForm(f => ({ ...f, description: transferFrom && v ? `${transferFrom} → ${v}` : '' })) }}
                  />
                ) : (
                  <input className="form-control" placeholder="항목 설명" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                )}
              </div>
              <div className="col-12 col-lg-2">
                {data.card_list.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '9px 4px' }}>
                    카드 없음 —{' '}
                    <button type="button" onClick={() => navigate('/budget')}
                      style={{ background: 'none', border: 'none', padding: 0, color: '#b088f9', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', textDecoration: 'underline' }}>
                      예산 탭에서 추가
                    </button>
                  </div>
                ) : (
                  <>
                    {form.category !== '계좌 이체' && (
                      <>
                        <CardPicker
                          cards={data.card_list.filter(c => !c.is_loan)}
                          value={form.card}
                          onChange={name => { setForm(f => ({ ...f, card: name })); setCardError(false) }}
                          error={cardError}
                        />
                        {cardError && <div style={{ color: '#dc3545', fontSize: '0.78rem', marginTop: 3 }}>카드를 선택해 주세요</div>}
                      </>
                    )}
                  </>
                )}
              </div>
              {form.type === 'expense' && (
                <div className="col-12">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px', cursor: 'pointer' }} onClick={() => setForm(f => ({ ...f, exclude_perf: !f.exclude_perf }))}>
                    <label style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 0, cursor: 'pointer' }}>💱 카드 실적에서 제외</label>
                    <div className="ios-toggle">
                      <div className={`ios-track${form.exclude_perf ? ' on' : ''}`} />
                      <div className={`ios-dot${form.exclude_perf ? ' on' : ''}`} />
                    </div>
                  </div>
                </div>
              )}
              <div className="col-12">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px', cursor: 'pointer' }} onClick={() => setForm(f => ({ ...f, exclude_stats: !f.exclude_stats }))}>
                  <label style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 0, cursor: 'pointer' }}>📊 통계에서 제외</label>
                  <div className="ios-toggle">
                    <div className={`ios-track${form.exclude_stats ? ' on' : ''}`} />
                    <div className={`ios-dot${form.exclude_stats ? ' on' : ''}`} />
                  </div>
                </div>
              </div>
              <div className="col-12 d-flex justify-content-between align-items-center mt-1">
                <button type="button" className="btn btn-outline-secondary" style={{ borderRadius: 10, fontSize: '0.85rem' }} onClick={() => setImportOpen(true)}>
                  <i className="bi bi-upload" /> 가져오기
                </button>
                <div className="d-flex gap-2">
                  <button type="submit" className="btn"
                  style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>저장</button>
                  <button type="reset" className="btn btn-outline-secondary" onClick={() => { setAmountDisplay(''); setForm(f => ({ ...f, exclude_perf: false, exclude_stats: false })) }}>취소</button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* 내역 목록 */}
      <div className="card">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div className="d-flex align-items-center gap-2" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setTxOpen(o => !o)}>
              <h3 className="card-title mb-0">내역 목록</h3>
              <span style={{ fontSize: '1.4rem', color: '#b088f9', lineHeight: 1 }}>{txOpen ? '▴' : '▾'}</span>
            </div>
            <div className="d-flex align-items-center gap-2">
              <button className="btn btn-sm" onClick={() => setSortAsc(a => !a)} style={{ borderRadius: 20, padding: '3px 10px', fontSize: '0.8rem', color: '#b088f9', border: '1px solid #b088f9', background: 'transparent' }}>
                {sortAsc ? '과거순' : '최신순'}
              </button>
              <SlidingTabs options={[['all', '전체'], ['expense', '지출'], ['income', '수입']]} value={filter} onChange={setFilter} />
            </div>
          </div>
          {allCards.length > 0 && (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 10 }}>
              {[['all', '전체'], ...allCards.map(c => [c, c])].map(([val, label]) => (
                <button key={val} onClick={() => setCardFilter(val)}
                  style={{ flexShrink: 0, padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: cardFilter === val ? 700 : 400, border: `1.5px solid ${cardFilter === val ? '#b088f9' : 'var(--border-light)'}`, background: cardFilter === val ? 'rgba(176,136,249,0.12)' : 'var(--bg-card)', color: cardFilter === val ? '#b088f9' : 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {txOpen && (
            filtered.length === 0 ? (
              <p className="text-muted text-center py-3">내역이 없습니다.</p>
            ) : (() => {
              const byDate = filtered.reduce((acc, tx) => {
                if (!acc[tx.date]) acc[tx.date] = []
                acc[tx.date].push(tx)
                return acc
              }, {})
              const dates = Object.keys(byDate).sort((a, b) => sortAsc ? a.localeCompare(b) : b.localeCompare(a))
              return dates.map(date => (
                <div key={date} className="mb-2">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px 4px' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)' }}>{fmtDate(date)}</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border-light)' }} />
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {byDate[date].reduce((s,t) => t.type==='income' ? s+t.amount : s-t.amount, 0) >= 0
                        ? `+${fmt(byDate[date].reduce((s,t) => t.type==='income' ? s+t.amount : s-t.amount, 0))}원`
                        : `${fmt(byDate[date].reduce((s,t) => t.type==='income' ? s+t.amount : s-t.amount, 0))}원`}
                    </span>
                  </div>
                  <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    {byDate[date].map((tx, i) => (
                      <SwipeItem key={tx.id} onDelete={() => setConfirmSheet(tx.id)} onEdit={() => navigate(`/edit/${tx.id}`)}>
                        <div style={{ padding: '12px 14px', background: 'var(--bg-card)', borderBottom: i < byDate[date].length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                          <TxItem tx={tx} emojiMap={data.emoji_map} />
                        </div>
                      </SwipeItem>
                    ))}
                  </div>
                </div>
              ))
            })()
          )}
        </div>
      </div>
      <div className="d-lg-none" style={{ height: 90 }} />

      {/* 삭제 확인 */}
      {confirmSheet && (
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px', width: 'min(88vw,320px)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <p className="text-center fw-semibold mb-4" style={{ fontSize: '1rem' }}>삭제하시겠습니까?</p>
            <div className="d-flex gap-2">
              <button className="btn flex-fill" onClick={() => handleDelete(confirmSheet)} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>확인</button>
              <button className="btn btn-outline-secondary flex-fill" onClick={() => setConfirmSheet(null)} style={{ borderRadius: 10 }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {hideCardConfirm && (
        <div onClick={closeHideCard}
          style={{ display: 'flex', position: 'fixed', inset: 0, zIndex: 2000, alignItems: 'center', justifyContent: 'center',
            background: `rgba(0,0,0,${hideCardVisible ? 0.35 : 0})`, transition: 'background 0.22s ease' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px', width: 'min(88vw,320px)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              opacity: hideCardVisible ? 1 : 0, transform: hideCardVisible ? 'scale(1) translateY(0)' : 'scale(0.88) translateY(14px)',
              transition: 'opacity 0.24s ease, transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
            <p className="text-center fw-semibold mb-1" style={{ fontSize: '1rem' }}>{hideCardConfirm}</p>
            <p className="text-center text-muted mb-4" style={{ fontSize: '0.85rem' }}>이 카드를 실적 목록에서 숨기겠습니까?</p>
            <div className="d-flex gap-2">
              <button className="btn flex-fill" onClick={() => hideCard(hideCardConfirm)} style={{ background: 'var(--bg-accent)', color: 'var(--text-primary)', border: 'none', borderRadius: 10 }}>숨기기</button>
              <button className="btn flex-fill" onClick={closeHideCard} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 카드 내역 시트 */}
      {cardSheet && createPortal(
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 3000, alignItems: 'flex-end', justifyContent: 'center', opacity: cardSheetVisible ? 1 : 0, transition: 'opacity 0.28s ease' }}
          onClick={e => e.target === e.currentTarget && closeCardSheet()}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '72vh', overflowY: 'auto', padding: '20px 16px 40px', transform: cardSheetVisible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="mb-0 fw-bold">{cardSheet} 내역</h6>
              <div className="d-flex align-items-center gap-2">
                <button onClick={() => setCardSheetSortAsc(a => !a)}
                  style={{ borderRadius: 20, padding: '3px 10px', fontSize: '0.78rem', color: '#b088f9', border: '1px solid #b088f9', background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {cardSheetSortAsc ? '과거순' : '최신순'}
                </button>
                <button onClick={closeCardSheet} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0 4px' }}>&times;</button>
              </div>
            </div>
            {cardSheetTxs.length === 0 ? (
              <p className="text-muted text-center py-3">내역이 없습니다.</p>
            ) : cardSheetTxs.map(tx => (
              <div key={tx.id} style={{ borderBottom: '1px solid var(--border-light)', padding: '10px 2px' }}>
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <span className="text-muted" style={{ fontSize: '0.78rem' }}>{tx.date}</span>
                    <span className="ms-1 text-muted" style={{ fontSize: '0.7rem', opacity: 0.35 }}>|</span>
                    <span className="ms-1" style={{ fontSize: '0.85rem' }}>{data.emoji_map?.[tx.category] ? `${data.emoji_map[tx.category]} ` : ''}{tx.category}</span>
                    {tx.description && <span className="ms-1 text-muted" style={{ fontSize: '0.82rem' }}> {tx.description}</span>}
                  </div>
                  <div className={`fw-bold ${tx.type === 'income' ? 'text-success' : 'text-danger'}`} style={{ fontSize: '0.95rem' }}>
                    {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}원
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* 가져오기 모달 */}
      {importOpen && (
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header p-3">
              <h5 className="modal-title mb-0">내역 가져오기</h5>
              <button className="btn-close" onClick={() => { setImportOpen(false); setImportTab('text'); setImportFileName('') }} />
            </div>
            <div className="p-3">
              <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--bg-accent)', borderRadius: 12, padding: 4 }}>
                {[['text', '💬 문자 붙여넣기'], ['excel', '📊 엑셀']].map(([t, label]) => (
                  <button key={t} type="button" onClick={() => setImportTab(t)}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                      background: importTab === t ? 'var(--bg-card)' : 'transparent',
                      color: importTab === t ? '#b088f9' : 'var(--text-muted)',
                      boxShadow: importTab === t ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
                    {label}
                  </button>
                ))}
              </div>
              {importTab === 'text' && (
                <form action="/import/text" method="post">
                  <p className="text-muted" style={{ fontSize: '0.85rem' }}>카드·은행 문자 내역을 붙여넣으세요. 한 줄에 하나씩 인식합니다.</p>
                  <textarea name="text" className="form-control mb-3" rows={7} placeholder="예) [신한카드] 일시불 50,000원 스타벅스 2026-06-17" style={{ fontSize: '0.82rem', resize: 'vertical' }} />
                  <div className="d-flex justify-content-end gap-2 pb-2">
                    <button type="submit" className="btn" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>분석</button>
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setImportOpen(false)}>취소</button>
                  </div>
                </form>
              )}
              {importTab === 'excel' && (
                <form action="/import" method="post" encType="multipart/form-data">
                  <p className="text-muted" style={{ fontSize: '0.85rem' }}>양식을 다운받아 작성 후 업로드하거나, 은행 내보내기 파일을 바로 올리세요.</p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <a href="/import/template" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, background: 'var(--bg-section)', color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none' }}>
                      <i className="bi bi-download" /> 양식 다운로드
                    </a>
                  </div>
                  <input type="file" name="file" className="form-control mb-3 file-input-green" accept=".xlsx,.xls" required
                    style={{ border: '1.5px solid #4caf50', background: 'var(--input-bg)', color: 'var(--text-primary)' }} />
                  <div className="d-flex justify-content-end gap-2 pb-2">
                    <button type="submit" className="btn" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>다음</button>
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setImportOpen(false)}>취소</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
