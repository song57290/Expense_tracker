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

  const onTouchStart = e => {
    const cx = e.touches[0].clientX
    const wrap = e.currentTarget.closest('.page-wrap')
    const rect = wrap ? wrap.getBoundingClientRect() : { left: 0, width: window.innerWidth }
    const relX = cx - rect.left
    if (relX < 80 || relX > rect.width - 80) return
    startX.current = cx
    startY.current = e.touches[0].clientY
    horiz.current = false
    setOffsetX(0)
  }
  const onTouchMove = e => {
    if (startX.current === null) return
    const dx = startX.current - e.touches[0].clientX
    const dy = startY.current - e.touches[0].clientY
    if (!horiz.current) {
      if (Math.abs(dy) > Math.abs(dx)) { startX.current = null; return }
      if (Math.abs(dx) > 8) horiz.current = true; else return
    }
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

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 10, marginBottom: 6, border: '1px solid #eee' }}>
      <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 80, background: '#dc3545', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'white', fontSize: '0.75rem', gap: 2 }}>
        <i className="bi bi-trash" style={{ fontSize: '1.15rem' }} />삭제
      </div>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: 80, background: '#198754', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'white', fontSize: '0.75rem', gap: 2 }}>
        <i className="bi bi-pencil" style={{ fontSize: '1.15rem' }} />수정
      </div>
      <div data-item-swipe style={{ position: 'relative', zIndex: 1, background: 'white', transform: `translateX(${offsetX}px)`, transition: offsetX === 0 ? 'transform 0.22s ease' : 'none', cursor: 'grab' }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
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
  const [confirmSheet, setConfirmSheet] = useState(null) // tx.id
  const [cardSheet, setCardSheet] = useState(null) // card name
  const [cardSheetVisible, setCardSheetVisible] = useState(false)
  const [form, setForm] = useState({ date: today(), type: 'expense', category: '', amount: '', description: '', card: '' })
  const [amountDisplay, setAmountDisplay] = useState('')
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const load = useCallback(() => api.get('/api/home').then(setData).catch(console.error), [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (data) {
      const cats = form.type === 'expense' ? data.expense_cats : data.income_cats
      if (cats.length && !cats.find(c => c[0] === form.category))
        setForm(f => ({ ...f, category: cats[0][0] }))
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
    await api.post('/api/transactions', { ...form, amount: amt })
    setForm(f => ({ ...f, amount: '', description: '' }))
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
        <span className="text-muted fw-semibold" style={{ fontSize: '0.85rem' }}>이번 달 요약</span>
        <span style={{ fontSize: '1.4rem', color: '#b088f9', lineHeight: 1 }}>{summaryOpen ? '▴' : '▾'}</span>
      </div>
      {summaryOpen && (
        <div className="row mb-4">
          {[['수입', data.income_total, 'text-success'], ['지출', data.expense_total, 'text-danger'], ['잔액', data.balance, 'text-primary']].map(([label, val, cls]) => (
            <div key={label} className="col-4">
              <div className="card text-center"><div className="card-body">
                <h6 className={`card-title ${cls}`}>{label}</h6>
                <p className="card-text fs-5">{fmt(val)}원</p>
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
            {catOpen && Object.entries(data.category_totals).map(([cat, amt]) => (
              <div key={cat} className="mb-2 mt-2">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span style={{ fontSize: '0.9rem' }}>{data.emoji_map[cat] || '📦'} {cat}</span>
                  <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                    {fmt(amt)}원&nbsp;<span style={{ fontSize: '0.72rem' }}>({catSum > 0 ? Math.round(amt / catSum * 100) : 0}%)</span>
                  </span>
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
              <div className="col-12 d-flex justify-content-between align-items-center mt-1">
                <button type="button" className="btn btn-outline-secondary" style={{ borderRadius: 10, fontSize: '0.85rem' }} onClick={() => setImportOpen(true)}>
                  <i className="bi bi-upload" /> 가져오기
                </button>
                <div className="d-flex gap-2">
                  <button type="submit" className="btn" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>저장</button>
                  <button type="reset" className="btn btn-outline-secondary" onClick={() => setAmountDisplay('')}>취소</button>
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
              <button className="btn-close" onClick={() => setImportOpen(false)} />
            </div>
            <div className="p-3">
              <ul className="nav nav-tabs mb-3">
                <li className="nav-item"><button className="nav-link active" data-bs-toggle="tab" data-bs-target="#tabText2"><i className="bi bi-chat-text text-primary" /> 문자 붙여넣기</button></li>
                <li className="nav-item"><button className="nav-link" data-bs-toggle="tab" data-bs-target="#tabExcel2"><i className="bi bi-file-earmark-excel text-success" /> 엑셀</button></li>
              </ul>
              <div className="tab-content">
                <div className="tab-pane fade show active" id="tabText2">
                  <form action="/import/text" method="post">
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>카드·은행 문자 내역을 붙여넣으세요. 한 줄에 하나씩 인식합니다.</p>
                    <textarea name="text" className="form-control mb-3" rows={7} placeholder="예) [신한카드] 일시불 50,000원 스타벅스 2026-06-17" style={{ fontSize: '0.82rem', resize: 'vertical' }} />
                    <div className="d-flex justify-content-end gap-2 pb-2">
                      <button type="submit" className="btn" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>분석</button>
                      <button type="button" className="btn btn-outline-secondary" onClick={() => setImportOpen(false)}>취소</button>
                    </div>
                  </form>
                </div>
                <div className="tab-pane fade" id="tabExcel2">
                  <form action="/import" method="post" encType="multipart/form-data">
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>양식을 다운받아 작성 후 업로드하거나, 은행 내보내기 파일을 바로 올리세요.</p>
                    <a href="/import/template" className="btn btn-sm btn-outline-success mb-3" style={{ borderRadius: 8 }}><i className="bi bi-download" /> 양식 다운로드</a>
                    <input type="file" name="file" className="form-control mb-3" accept=".xlsx,.xls" required />
                    <div className="d-flex justify-content-end gap-2 pb-2">
                      <button type="submit" className="btn" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>다음</button>
                      <button type="button" className="btn btn-outline-secondary" onClick={() => setImportOpen(false)}>취소</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
