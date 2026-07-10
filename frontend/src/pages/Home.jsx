import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api.js'
import { fmt, today, bankColor, bankLogo } from '../utils.js'

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
    <div style={{ display: 'flex', background: '#f0eeff', borderRadius: 20, padding: 3, gap: 2, position: 'relative' }}>
      <div ref={indRef} style={{ position: 'absolute', top: 3, bottom: 3, background: 'white', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.12)', zIndex: 0, pointerEvents: 'none', transition: 'left 0.28s cubic-bezier(0.25,0.46,0.45,0.94),width 0.28s cubic-bezier(0.25,0.46,0.45,0.94)' }} />
      {options.map(([val, label], i) => (
        <button key={val} ref={el => tabRefs.current[i] = el} onClick={() => onChange(val)}
          style={{ position: 'relative', zIndex: 1, borderRadius: 16, padding: '3px 12px', fontSize: '0.8rem', background: 'transparent', color: value === val ? '#b088f9' : '#888', border: 'none', fontWeight: value === val ? 600 : 400, transition: 'color 0.22s' }}>
          {label}
        </button>
      ))}
    </div>
  )
}

// 스와이프 아이템 (좌=삭제, 우=수정)
function SwipeItem({ children, onDelete, onEdit }) {
  const startX = useRef(null)
  const startY = useRef(null)
  const [offsetX, setOffsetX] = useState(0)
  const horiz = useRef(false)
  const mouseDown = useRef(false)

  const getClientXY = e => e.touches ? [e.touches[0].clientX, e.touches[0].clientY] : [e.clientX, e.clientY]

  const onDragStart = e => {
    const [cx, cy] = getClientXY(e)
    if (!e.touches) {
      // PC: 엣지 제한 없이 드래그 허용
      startX.current = cx
      startY.current = cy
      horiz.current = true
      mouseDown.current = true
      setOffsetX(0)
      return
    }
    const wrap = e.currentTarget.closest('.page-wrap')
    const rect = wrap ? wrap.getBoundingClientRect() : { left: 0, width: window.innerWidth }
    const relX = cx - rect.left
    if (relX < 80 || relX > rect.width - 80) return
    startX.current = cx
    startY.current = cy
    horiz.current = false
    setOffsetX(0)
  }

  const onDragMove = e => {
    if (startX.current === null) return
    const [cx, cy] = getClientXY(e)
    const dx = startX.current - cx
    const dy = startY.current - cy
    if (!horiz.current) {
      if (Math.abs(dy) > Math.abs(dx)) { startX.current = null; return }
      if (Math.abs(dx) > 8) horiz.current = true; else return
    }
    setOffsetX(Math.max(-110, Math.min(110, -dx)))
  }

  const onDragEnd = () => {
    mouseDown.current = false
    if (startX.current === null) return
    const cur = offsetX
    startX.current = null
    if (cur < -60) { setOffsetX(0); onDelete() }
    else if (cur > 60) { setOffsetX(0); onEdit() }
    else setOffsetX(0)
  }

  const deleteWidth = Math.max(0, -offsetX)
  const editWidth = Math.max(0, offsetX)

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 10, marginBottom: 6, border: '1px solid #eee' }}>
      <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: deleteWidth, background: '#dc3545', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', textAlign: 'center', color: 'white', fontSize: '0.75rem', gap: 2, overflow: 'hidden' }}>
        <i className="bi bi-trash" style={{ fontSize: '1.15rem', display: 'block', flexShrink: 0 }} /><span>삭제</span>
      </div>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: editWidth, background: '#198754', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', textAlign: 'center', color: 'white', fontSize: '0.75rem', gap: 2, overflow: 'hidden' }}>
        <i className="bi bi-pencil" style={{ fontSize: '1.15rem', display: 'block', flexShrink: 0 }} /><span>수정</span>
      </div>
      <div data-item-swipe style={{ position: 'relative', zIndex: 1, background: 'white', transform: `translateX(${offsetX}px)`, transition: offsetX === 0 ? 'transform 0.22s ease' : 'none', cursor: 'grab', userSelect: 'none' }}
        onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
        onMouseDown={onDragStart} onMouseMove={e => { if (mouseDown.current) onDragMove(e) }} onMouseUp={onDragEnd} onMouseLeave={onDragEnd}>
        {children}
      </div>
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
  const [cardSheet, setCardSheet] = useState(null) // card name
  const [cardSheetVisible, setCardSheetVisible] = useState(false)
  const [form, setForm] = useState({ date: today(), type: 'expense', category: '', amount: '', description: '', card: '', exclude_perf: false })
  const [amountDisplay, setAmountDisplay] = useState('')
  const [cardError, setCardError] = useState(false)
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const load = useCallback(() => api.get('/api/home').then(setData).catch(console.error), [])
  useEffect(() => { load() }, [load])

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
        setForm(f => ({ ...f, category: defaultCat, exclude_perf: autoExcl }))
      }
    }
  }, [form.type, data])

  if (!data) return <div className="text-center py-5"><div className="spinner-border" style={{ color: '#b088f9' }} /></div>

  const cats = form.type === 'expense' ? data.expense_cats : data.income_cats

  let filtered = data.transactions.filter(tx => filter === 'all' || tx.type === filter)
  filtered = [...filtered].sort((a, b) => sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date))

  const catSum = Object.values(data.category_totals).reduce((s, v) => s + v, 0)
  const budgetPct = data.budget_amount > 0 ? Math.min(Math.round(data.expense_total / data.budget_amount * 100), 100) : 0

  async function handleAdd(e) {
    e.preventDefault()
    const amt = parseInt(amountDisplay.replace(/,/g, '')) || 0
    if (!amt || !form.category) return
    if (data.card_list.length === 0) { navigate('/budget'); return }
    if (!form.card) { setCardError(true); return }
    setCardError(false)
    await api.post('/api/transactions', { ...form, amount: amt })
    setForm(f => ({ ...f, amount: '', description: '', card: '' }))
    setAmountDisplay('')
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
    requestAnimationFrame(() => requestAnimationFrame(() => setCardSheetVisible(true)))
  }
  function closeCardSheet() {
    setCardSheetVisible(false)
    setTimeout(() => setCardSheet(null), 350)
  }

  const cardSheetTxs = cardSheet ? filtered.filter(tx => tx.card === cardSheet) : []

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
        <div className="row mb-4">
          {[['수입', data.income_total, 'text-success'], ['지출', data.expense_total, 'text-danger'], ['총계', data.balance, 'text-primary']].map(([label, val, cls]) => (
            <div key={label} className="col-4">
              <div className="card text-center"><div className="card-body">
                <h6 className={`card-title ${cls}`}>{label}</h6>
                <p className="card-text" style={{ fontSize: '1rem' }}>{fmt(val)}원</p>
              </div></div>
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
            {cardStatOpen && data.card_stats.map(cs => {
              const logo = bankLogo(cs.name)
              return (
                <div key={cs.name} className="mb-3 mt-2">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="d-flex align-items-center gap-2">
                      {logo && <img src={logo} style={{ height: 28, width: 28, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />}
                      {cs.name}
                    </span>
                    <span className="text-nowrap">{fmt(cs.spent)}원 / {fmt(cs.target)}원</span>
                  </div>
                  <div className="progress" style={{ cursor: 'pointer', position: 'relative', height: 22 }} onClick={() => openCardSheet(cs.name)}>
                    <div className={`progress-bar ${tierColor(cs.percent, cs.tier1, cs.tier2, cs.tier3)}`} style={{ width: `${cs.percent}%` }} />
                    <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', fontSize: '0.72rem', fontWeight: 700, color: '#333', whiteSpace: 'nowrap', textShadow: '0 0 4px rgba(255,255,255,0.9)' }}>{cs.percent}%</span>
                  </div>
                </div>
              )
            })}
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
            {catOpen && Object.entries(data.category_totals).sort(([, a], [, b]) => b - a).map(([cat, amt]) => (
              <div key={cat} className="mb-2 mt-2">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span style={{ fontSize: '0.9rem' }}>{data.emoji_map[cat] || '📦'} {cat}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span className="text-muted" style={{ fontSize: '0.8rem', textAlign: 'right', minWidth: 60 }}>{fmt(amt)}원</span>
                    <span style={{ fontSize: '0.72rem', color: '#aaa', textAlign: 'right', minWidth: 34 }}>({catSum > 0 ? Math.round(amt / catSum * 100) : 0}%)</span>
                  </div>
                </div>
                <div className="progress" style={{ height: 5 }}>
                  <div className="progress-bar" style={{ width: `${catSum > 0 ? Math.round(amt / catSum * 100) : 0}%`, background: 'linear-gradient(90deg,#b088f9,#7baff0)', borderRadius: 4 }} />
                </div>
              </div>
            ))}
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
                <input type="date" className="form-control" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </div>
              <div className="col-6 col-lg-2">
                <select className="form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, exclude_perf: false }))}>
                  <option value="expense">지출</option>
                  <option value="income">수입</option>
                </select>
              </div>
              <div className="col-6 col-lg-2">
                <select className="form-select" value={form.category} onChange={e => {
                  const cat = e.target.value
                  const autoExcl = form.type === 'expense' && (data.excl_cat_names || []).includes(cat)
                  setForm(f => ({ ...f, category: cat, exclude_perf: autoExcl }))
                }}>
                  {cats.map(([name, icon]) => <option key={name} value={name}>{icon} {name}</option>)}
                </select>
              </div>
              <div className="col-6 col-lg-2">
                <div style={{ position: 'relative' }}>
                  <input className="form-control" inputMode="numeric" placeholder="금액" value={amountDisplay}
                    onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); setAmountDisplay(raw ? parseInt(raw).toLocaleString('ko-KR') : '') }} required style={{ paddingRight: 36 }} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
                </div>
              </div>
              <div className="col-12 col-lg-2">
                <input className="form-control" placeholder="항목 설명" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="col-12 col-lg-2">
                {data.card_list.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: '#aaa', padding: '9px 4px' }}>
                    카드 없음 —{' '}
                    <button type="button" onClick={() => navigate('/budget')}
                      style={{ background: 'none', border: 'none', padding: 0, color: '#b088f9', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', textDecoration: 'underline' }}>
                      예산 탭에서 추가
                    </button>
                  </div>
                ) : (
                  <>
                    <select className="form-select" value={form.card}
                      style={cardError ? { borderColor: '#dc3545' } : {}}
                      onChange={e => { setForm(f => ({ ...f, card: e.target.value })); setCardError(false) }}>
                      <option value="">카드 선택</option>
                      {data.card_list.filter(c => !c.is_loan).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    {cardError && <div style={{ color: '#dc3545', fontSize: '0.78rem', marginTop: 3 }}>카드를 선택해 주세요</div>}
                  </>
                )}
              </div>
              {form.type === 'expense' && (
                <div className="col-12">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px', cursor: 'pointer' }} onClick={() => setForm(f => ({ ...f, exclude_perf: !f.exclude_perf }))}>
                    <label style={{ flex: 1, fontSize: '0.85rem', color: '#555', marginBottom: 0, cursor: 'pointer' }}>💱 카드 실적에서 제외</label>
                    <div className="ios-toggle">
                      <div className={`ios-track${form.exclude_perf ? ' on' : ''}`} />
                      <div className={`ios-dot${form.exclude_perf ? ' on' : ''}`} />
                    </div>
                  </div>
                </div>
              )}
              <div className="col-12 d-flex justify-content-between align-items-center mt-1">
                <button type="button" className="btn btn-outline-secondary" style={{ borderRadius: 10, fontSize: '0.85rem' }} onClick={() => setImportOpen(true)}>
                  <i className="bi bi-upload" /> 가져오기
                </button>
                <div className="d-flex gap-2">
                  <button type="submit" className="btn"
                  style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>저장</button>
                  <button type="reset" className="btn btn-outline-secondary" onClick={() => { setAmountDisplay(''); setForm(f => ({ ...f, exclude_perf: false })) }}>취소</button>
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
              <h5 className="card-title mb-0">내역 목록</h5>
              <span style={{ fontSize: '1.4rem', color: '#b088f9', lineHeight: 1 }}>{txOpen ? '▴' : '▾'}</span>
            </div>
            <div className="d-flex align-items-center gap-2">
              <button className="btn btn-sm" onClick={() => setSortAsc(a => !a)} style={{ borderRadius: 20, padding: '3px 10px', fontSize: '0.8rem', color: '#b088f9', border: '1px solid #b088f9', background: 'transparent' }}>
                {sortAsc ? '과거순' : '최신순'}
              </button>
              <SlidingTabs options={[['all', '전체'], ['expense', '지출'], ['income', '수입']]} value={filter} onChange={setFilter} />
            </div>
          </div>
          {txOpen && (
            filtered.length === 0 ? (
              <p className="text-muted text-center py-3">내역이 없습니다.</p>
            ) : (
              filtered.map(tx => (
                <SwipeItem key={tx.id} onDelete={() => setConfirmSheet(tx.id)} onEdit={() => navigate(`/edit/${tx.id}`)}>
                  <div style={{ padding: '16px 14px' }}>
                    <div className="d-flex justify-content-between align-items-start">
                      <div className="me-2" style={{ minWidth: 0 }}>
                        <span className="text-muted" style={{ fontSize: '0.78rem' }}>{tx.date}</span>
                        <span className="ms-1 text-muted" style={{ fontSize: '0.7rem', opacity: 0.35, verticalAlign: 'middle' }}>|</span>
                        {tx.card && (() => { const bc = bankColor(tx.card); return <span className="ms-1 badge" style={{ fontSize: '0.65rem', background: bc.background, color: bc.color }}>{tx.card}</span> })()}
                        <span className={`ms-1 badge ${tx.type === 'income' ? 'bg-success' : 'bg-danger'}`} style={{ fontSize: '0.68rem' }}>{tx.type === 'income' ? '수입' : '지출'}</span>
                        {tx.exclude_perf && <span className="ms-1 badge" style={{ fontSize: '0.62rem', background: '#fff0f0', color: '#dc3545', border: '1px solid #fcc' }}>실적제외</span>}
                        <span className="ms-1 text-muted" style={{ fontSize: '0.7rem', opacity: 0.35, verticalAlign: 'middle' }}>|</span>
                        <span className="ms-1" style={{ fontSize: '0.85rem' }}>{tx.category}</span>
                        {tx.description && <>
                          <span className="ms-1 text-muted" style={{ fontSize: '0.7rem', opacity: 0.35, verticalAlign: 'middle' }}>|</span>
                          <span className="ms-1 text-muted" style={{ fontSize: '0.82rem' }}>{tx.description}</span>
                        </>}
                      </div>
                      <div className="text-end flex-shrink-0">
                        <div className={`fw-bold ${tx.type === 'income' ? 'text-success' : 'text-danger'}`} style={{ fontSize: '0.95rem' }}>
                          {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}원
                        </div>
                      </div>
                    </div>
                  </div>
                </SwipeItem>
              ))
            )
          )}
        </div>
      </div>
      <div className="d-lg-none" style={{ height: 90 }} />

      {/* 삭제 확인 */}
      {confirmSheet && (
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 20, padding: '24px 20px', width: 'min(88vw,320px)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <p className="text-center fw-semibold mb-4" style={{ fontSize: '1rem' }}>삭제하시겠습니까?</p>
            <div className="d-flex gap-2">
              <button className="btn flex-fill" onClick={() => handleDelete(confirmSheet)} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>확인</button>
              <button className="btn btn-outline-secondary flex-fill" onClick={() => setConfirmSheet(null)} style={{ borderRadius: 10 }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 카드 내역 시트 */}
      {cardSheet && createPortal(
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 3000, alignItems: 'flex-end', justifyContent: 'center', opacity: cardSheetVisible ? 1 : 0, transition: 'opacity 0.28s ease' }}
          onClick={e => e.target === e.currentTarget && closeCardSheet()}>
          <div style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '72vh', overflowY: 'auto', padding: '20px 16px 40px', transform: cardSheetVisible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="mb-0 fw-bold">{cardSheet} 내역</h6>
              <button onClick={closeCardSheet} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#aaa', lineHeight: 1, padding: '0 4px' }}>&times;</button>
            </div>
            {cardSheetTxs.length === 0 ? (
              <p className="text-muted text-center py-3">내역이 없습니다.</p>
            ) : cardSheetTxs.map(tx => (
              <div key={tx.id} style={{ borderBottom: '1px solid #f0f0f0', padding: '10px 2px' }}>
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <span className="text-muted" style={{ fontSize: '0.78rem' }}>{tx.date}</span>
                    <span className="ms-1 text-muted" style={{ fontSize: '0.7rem', opacity: 0.35 }}>|</span>
                    <span className="ms-1" style={{ fontSize: '0.85rem' }}>{tx.category}</span>
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
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header p-3">
              <h5 className="modal-title mb-0">내역 가져오기</h5>
              <button className="btn-close" onClick={() => { setImportOpen(false); setImportTab('text'); setImportFileName('') }} />
            </div>
            <div className="p-3">
              <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f0eeff', borderRadius: 12, padding: 4 }}>
                {[['text', '💬 문자 붙여넣기'], ['excel', '📊 엑셀']].map(([t, label]) => (
                  <button key={t} type="button" onClick={() => setImportTab(t)}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                      background: importTab === t ? 'white' : 'transparent',
                      color: importTab === t ? '#b088f9' : '#999',
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
                    <a href="/import/template" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, background: '#e8e8e8', color: '#1c1c1e', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none' }}>
                      <i className="bi bi-download" /> 양식 다운로드
                    </a>
                  </div>
                  <input type="file" name="file" className="form-control mb-3 file-input-green" accept=".xlsx,.xls" required
                    style={{ border: '1.5px solid #4caf50', background: 'white', color: '#1c1c1e' }} />
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
