import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import api from '../api.js'
import { fmt, fmtMonth, fmtDate, bankColor } from '../utils.js'
import TxItem from '../components/TxItem.jsx'
import SwipeItem from '../components/SwipeItem.jsx'
import CategoryPicker from '../components/CategoryPicker.jsx'
import CardPicker from '../components/CardPicker.jsx'
import TransferPicker from '../components/TransferPicker.jsx'
import DatePickerSheet from '../components/DatePickerSheet.jsx'
import YearDrum from '../components/YearDrum.jsx'

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

export default function Calendar() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(null)
  const [confirmSheet, setConfirmSheet] = useState(null)
  const [selectedVisible, setSelectedVisible] = useState(false)
  const [txFilter, setTxFilter] = useState('all')
  const [txSortAsc, setTxSortAsc] = useState(true)
  const [cardFilter, setCardFilter] = useState('all')
  const [txMenu, setTxMenu] = useState(null)
  const [txMenuVisible, setTxMenuVisible] = useState(false)
  const longPressTimer = useRef(null)
  const [yearMonth, setYearMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear())
  const [pickerMode, setPickerMode] = useState('month')
  const [pickerDecade, setPickerDecade] = useState(() => Math.floor((new Date().getFullYear() - 1) / 10) * 10 + 1)

  const [addOpen, setAddOpen] = useState(false)
  const [addVisible, setAddVisible] = useState(false)
  const [addTab, setAddTab] = useState('manual')
  const [homeData, setHomeData] = useState(null)
  const [addForm, setAddForm] = useState({ date: '', type: 'expense', category: '', amount: '', description: '', card: '', exclude_perf: false, exclude_stats: false })
  const [addAmountDisplay, setAddAmountDisplay] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addTransferFrom, setAddTransferFrom] = useState('')
  const [addTransferTo, setAddTransferTo] = useState('')

  function openAdd(date) {
    setAddOpen(true)
    setAddTab('manual')
    setAddForm(f => ({ ...f, date, type: 'expense', category: '', amount: '', description: '', card: '', exclude_perf: false, exclude_stats: false }))
    setAddAmountDisplay('')
    setAddTransferFrom('')
    setAddTransferTo('')
    if (!homeData) api.get('/api/home').then(setHomeData).catch(console.error)
    requestAnimationFrame(() => requestAnimationFrame(() => setAddVisible(true)))
  }
  function closeAdd() {
    setAddVisible(false)
    setTimeout(() => setAddOpen(false), 280)
  }
  async function handleAddSubmit(e) {
    e.preventDefault()
    const amt = parseInt(addAmountDisplay.replace(/,/g, ''))
    if (!amt || !addForm.category) return
    const isTransfer = addForm.category === '계좌 이체'
    setAddSaving(true)
    try {
      const payload = { ...addForm, amount: amt }
      if (isTransfer && addTransferFrom) payload.card = addTransferFrom
      await api.post('/api/transactions', payload)
      closeAdd()
      load(yearMonth)
    } finally {
      setAddSaving(false)
    }
  }

  useEffect(() => {
    if (!homeData || !addOpen) return
    const cats = addForm.type === 'expense' ? homeData.expense_cats : homeData.income_cats
    if (cats?.length && !cats.find(c => c[0] === addForm.category)) {
      setAddForm(f => ({ ...f, category: cats[0][0], card: '' }))
    }
  }, [addForm.type, homeData, addOpen])

  const load = useCallback((ym) => {
    api.get(`/api/calendar?month=${ym}`).then(setData).catch(console.error)
  }, [])

  useEffect(() => { load(yearMonth) }, [yearMonth, load])

  async function handleDelete(id) {
    await api.delete(`/api/transactions/${id}`)
    setConfirmSheet(null)
    load(yearMonth)
  }

  function goPrev() {
    const [y, m] = yearMonth.split('-').map(Number)
    setData(null); setTxFilter('all'); setTxSortAsc(false); setCardFilter('all')
    setYearMonth(m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`)
  }
  function goNext() {
    const [y, m] = yearMonth.split('-').map(Number)
    setData(null); setTxFilter('all'); setTxSortAsc(false); setCardFilter('all')
    setYearMonth(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`)
  }

  function openTxMenu(tx) {
    setTxMenu(tx)
    requestAnimationFrame(() => requestAnimationFrame(() => setTxMenuVisible(true)))
  }
  function closeTxMenu() {
    setTxMenuVisible(false)
    setTimeout(() => setTxMenu(null), 280)
  }
  function startLongPress(tx) {
    longPressTimer.current = setTimeout(() => openTxMenu(tx), 500)
  }
  function cancelLongPress() {
    clearTimeout(longPressTimer.current)
  }
  function openPicker() {
    setPickerYear(parseInt(yearMonth.split('-')[0]))
    setPickerMode('month')
    setPickerOpen(true)
  }

  if (!data) return <div className="text-center py-5"><div className="spinner-border" style={{ color: '#b088f9' }} /></div>

  const selDay = selected ? data.day_transactions[selected] : null
  const [curY, curM] = yearMonth.split('-').map(Number)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <div className="d-flex align-items-center gap-1">
          <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.3rem', padding: '4px 10px', cursor: 'pointer', lineHeight: 1 }} onClick={goPrev}>
            <i className="bi bi-chevron-left" />
          </button>
          <span onClick={openPicker} style={{ fontSize: '1.25rem', fontWeight: 700, cursor: 'pointer', userSelect: 'none', padding: '4px 10px' }}>
            {fmtMonth(yearMonth)}
          </span>
          <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.1rem', padding: '4px 8px', cursor: 'pointer', lineHeight: 1 }} onClick={goNext}>
            <i className="bi bi-chevron-right" />
          </button>
        </div>
      </div>

      <div className="card mb-3" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <div className="card-body p-2">
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            initialDate={yearMonth + '-01'}
            key={yearMonth}
            events={[]}
            dayCellContent={(arg) => {
              const d = arg.date
              const dow = d.getDay()
              const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
              const dayTxs = data.day_transactions[ds] || []
              const incomeCount = dayTxs.filter(t => t.type === 'income').length
              const expenseCount = dayTxs.filter(t => t.type === 'expense').length
              const totalCount = incomeCount + expenseCount
              let incDots = incomeCount, expDots = expenseCount, showPlus = false
              if (totalCount > 3) {
                showPlus = true
                if (incomeCount === 0) { incDots = 0; expDots = 2 }
                else if (expenseCount === 0) { incDots = 2; expDots = 0 }
                else if (incomeCount >= expenseCount) { incDots = 2; expDots = 1 }
                else { incDots = 1; expDots = 2 }
              }
              const numCol = dow === 0 ? 'var(--fc-sun-color)' : dow === 6 ? 'var(--fc-sat-color)' : 'var(--text-primary)'
              return (
                <>
                  <span style={{ color: numCol }}>{d.getDate()}</span>
                  {totalCount > 0 && (
                    <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, display: 'flex', gap: '2px', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
                      {Array.from({ length: incDots }, (_, i) => <span key={`i${i}`} style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#34c759', flexShrink: 0 }} />)}
                      {Array.from({ length: expDots }, (_, i) => <span key={`e${i}`} style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#ff3b30', flexShrink: 0 }} />)}
                      {showPlus && <span style={{ fontSize: 7, color: '#aaa', lineHeight: 1 }}>+</span>}
                    </div>
                  )}
                </>
              )
            }}
            dateClick={info => {
              if (info.dateStr === selected) { setSelectedVisible(false); setTimeout(() => setSelected(null), 350) }
              else { setSelected(info.dateStr); requestAnimationFrame(() => requestAnimationFrame(() => setSelectedVisible(true))) }
            }}
            headerToolbar={false}
            height="auto"
            locale="ko"
          />
        </div>
      </div>

      {/* 내역 추가 모달 */}
      {addOpen && createPortal(
        <div onClick={e => e.target === e.currentTarget && closeAdd()}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.42)', zIndex: 3500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', opacity: addVisible ? 1 : 0, transition: 'opacity 0.22s' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 540, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 40px rgba(0,0,0,0.18)', transform: addVisible ? 'translateY(0)' : 'translateY(40px)', transition: 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span className="fw-bold" style={{ fontSize: '1rem' }}>{fmtDate(addForm.date)} 내역 추가</span>
              <button onClick={closeAdd} style={{ background: 'var(--bg-section)', border: 'none', width: 28, height: 28, borderRadius: 14, fontSize: '1.05rem', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
            </div>
            {/* 탭 */}
            <div style={{ display: 'flex', gap: 4, margin: '12px 20px 0', background: 'var(--bg-accent)', borderRadius: 12, padding: 4, flexShrink: 0 }}>
              {[['manual', '✏️ 직접 입력'], ['text', '💬 문자 가져오기']].map(([t, label]) => (
                <button key={t} type="button" onClick={() => setAddTab(t)}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', fontSize: '0.83rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                    background: addTab === t ? 'var(--bg-card)' : 'transparent',
                    color: addTab === t ? '#b088f9' : 'var(--text-muted)',
                    boxShadow: addTab === t ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ overflowY: 'auto', padding: '16px 20px 32px' }}>
              {addTab === 'manual' ? (
                !homeData ? (
                  <div className="text-center py-4"><div className="spinner-border spinner-border-sm" style={{ color: '#b088f9' }} /></div>
                ) : (
                  <form onSubmit={handleAddSubmit} className="row g-2">
                    <div className="col-6">
                      <DatePickerSheet value={addForm.date} onChange={date => setAddForm(f => ({ ...f, date }))} />
                    </div>
                    <div className="col-6">
                      <div style={{ position: 'relative', display: 'flex', background: 'var(--bg-accent)', borderRadius: 10, padding: 3, height: 38 }}>
                        <div style={{ position: 'absolute', top: 3, bottom: 3, width: 'calc(50% - 3px)', borderRadius: 8,
                          background: addForm.type === 'expense' ? '#ff3b30' : '#34c759',
                          transform: addForm.type === 'expense' ? 'translateX(0)' : 'translateX(calc(100% + 2px))',
                          transition: 'transform 0.26s cubic-bezier(0.25,0.46,0.45,0.94), background 0.26s',
                          boxShadow: addForm.type === 'expense' ? '0 2px 8px rgba(255,59,48,0.45)' : '0 2px 8px rgba(52,199,89,0.45)' }} />
                        {[['expense', '지출'], ['income', '수입']].map(([val, label]) => (
                          <button key={val} type="button" onClick={() => setAddForm(f => ({ ...f, type: val, category: '', exclude_perf: false, exclude_stats: false }))}
                            style={{ flex: 1, position: 'relative', zIndex: 1, borderRadius: 8, border: 'none', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', background: 'transparent',
                              color: addForm.type === val ? 'white' : 'var(--text-muted)', transition: 'color 0.26s' }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="col-12">
                      <CategoryPicker
                        cats={addForm.type === 'expense' ? homeData.expense_cats : homeData.income_cats}
                        value={addForm.category}
                        onChange={cat => {
                          const autoExcl = addForm.type === 'expense' && (homeData.excl_cat_names || []).includes(cat)
                          const autoExclStats = (homeData.excl_stat_cat_names || []).includes(cat)
                          if (cat !== '계좌 이체') { setAddTransferFrom(''); setAddTransferTo('') }
                          setAddForm(f => ({ ...f, category: cat, exclude_perf: autoExcl, exclude_stats: autoExclStats, description: cat !== '계좌 이체' ? f.description : '' }))
                        }}
                      />
                    </div>
                    <div className="col-12" style={{ position: 'relative' }}>
                      <input className="form-control" inputMode="numeric" placeholder="금액" value={addAmountDisplay}
                        onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); setAddAmountDisplay(raw ? parseInt(raw).toLocaleString('ko-KR') : '') }}
                        required style={{ paddingRight: 36 }} />
                      <span style={{ position: 'absolute', right: 22, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
                    </div>
                    <div className="col-12">
                      {addForm.category === '계좌 이체' ? (
                        <TransferPicker
                          accounts={homeData.card_list || []}
                          from={addTransferFrom}
                          to={addTransferTo}
                          onFromChange={v => { setAddTransferFrom(v); setAddForm(f => ({ ...f, description: v && addTransferTo ? `${v} → ${addTransferTo}` : '' })) }}
                          onToChange={v => { setAddTransferTo(v); setAddForm(f => ({ ...f, description: addTransferFrom && v ? `${addTransferFrom} → ${v}` : '' })) }}
                        />
                      ) : (
                        <input className="form-control" placeholder="항목 설명" value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))} />
                      )}
                    </div>
                    {addForm.category !== '계좌 이체' && (
                      <div className="col-12">
                        <CardPicker
                          cards={(homeData.card_list || []).filter(c => !c.is_loan)}
                          value={addForm.card}
                          onChange={name => setAddForm(f => ({ ...f, card: name }))}
                        />
                      </div>
                    )}
                    {addForm.type === 'expense' && (
                      <div className="col-12">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px', cursor: 'pointer' }} onClick={() => setAddForm(f => ({ ...f, exclude_perf: !f.exclude_perf }))}>
                          <label style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 0, cursor: 'pointer' }}>💱 카드 실적에서 제외</label>
                          <div className="ios-toggle">
                            <div className={`ios-track${addForm.exclude_perf ? ' on' : ''}`} />
                            <div className={`ios-dot${addForm.exclude_perf ? ' on' : ''}`} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="col-12">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px', cursor: 'pointer' }} onClick={() => setAddForm(f => ({ ...f, exclude_stats: !f.exclude_stats }))}>
                        <label style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 0, cursor: 'pointer' }}>📊 통계에서 제외</label>
                        <div className="ios-toggle">
                          <div className={`ios-track${addForm.exclude_stats ? ' on' : ''}`} />
                          <div className={`ios-dot${addForm.exclude_stats ? ' on' : ''}`} />
                        </div>
                      </div>
                    </div>
                    <div className="col-12 mt-1">
                      <button type="submit" className="btn w-100" disabled={addSaving}
                        style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 700, borderRadius: 12, padding: '12px 0' }}>
                        {addSaving ? '저장 중...' : '추가'}
                      </button>
                    </div>
                  </form>
                )
              ) : (
                <form action="/import/text" method="post">
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>카드·은행 문자 내역을 붙여넣으세요. 한 줄에 하나씩 인식합니다.</p>
                  <textarea name="text" className="form-control mb-3" rows={7}
                    placeholder={'예) [신한카드] 일시불 50,000원 스타벅스 2026-06-17'}
                    style={{ fontSize: '0.82rem', resize: 'vertical' }} />
                  <button type="submit" className="btn w-100"
                    style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 700, borderRadius: 12, padding: '12px 0' }}>
                    분석
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 년/월 피커 */}
      {pickerOpen && createPortal(
        <div onClick={e => e.target === e.currentTarget && setPickerOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.42)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, width: '100%', maxWidth: 320, padding: '20px 16px 24px', boxShadow: '0 12px 40px rgba(0,0,0,0.22)' }}>
            {pickerMode === 'drumYear' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-secondary)' }}>연도 선택</span>
                  <button onClick={() => setPickerMode('month')} style={{ border: 'none', background: 'var(--bg-accent)', borderRadius: 8, padding: '4px 12px', fontSize: '0.82rem', color: '#b088f9', cursor: 'pointer', fontWeight: 600 }}>완료</button>
                </div>
                <YearDrum value={pickerYear} onChange={setPickerYear} />
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <button onClick={() => setPickerYear(y => y - 1)} style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px 10px' }}>
                    <i className="bi bi-chevron-left" />
                  </button>
                  <span onClick={() => setPickerMode('drumYear')} style={{ fontWeight: 700, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 8px', borderRadius: 8, background: 'var(--bg-accent)', color: '#b088f9' }}>{pickerYear}년 ▾</span>
                  <button onClick={() => setPickerYear(y => y + 1)} style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px 10px' }}>
                    <i className="bi bi-chevron-right" />
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                    const isSel = pickerYear === curY && m === curM
                    return (
                      <button key={m} onClick={() => { setData(null); setYearMonth(`${pickerYear}-${String(m).padStart(2,'0')}`); setPickerOpen(false) }}
                        style={{ padding: '10px 0', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: isSel ? 700 : 400, fontSize: '0.9rem', background: isSel ? 'linear-gradient(135deg,#b088f9,#7baff0)' : 'var(--bg-section)', color: isSel ? 'white' : 'var(--text-primary)' }}>
                        {m}월
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* 날짜 상세 팝업 */}
      {selected && createPortal(
        <div onClick={e => e.target === e.currentTarget && (setSelectedVisible(false), setTimeout(() => setSelected(null), 300))}
          style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.42)', zIndex: 3000, alignItems: 'center', justifyContent: 'center', padding: '0 20px', opacity: selectedVisible ? 1 : 0, transition: 'opacity 0.22s ease' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, width: '100%', maxWidth: 420, maxHeight: '72vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.22)', transform: selectedVisible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(12px)', transition: 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
            <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span className="fw-bold" style={{ fontSize: '1rem' }}>{fmtDate(selected)}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => { setSelectedVisible(false); setTimeout(() => { setSelected(null); openAdd(selected) }, 280) }}
                  style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', border: 'none', borderRadius: 12, padding: '3px 10px', fontSize: '0.8rem', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                  + 추가
                </button>
                <button onClick={() => { setSelectedVisible(false); setTimeout(() => setSelected(null), 300) }} style={{ background: 'var(--bg-section)', border: 'none', width: 28, height: 28, borderRadius: 14, fontSize: '1.05rem', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
              </div>
            </div>
            <div style={{ overflowY: 'auto', padding: '8px 20px 40px' }}>
              {!selDay || selDay.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>이 날 내역이 없습니다</p>
              ) : selDay.map((tx, i) => (
                <div key={tx.id}
                  style={{ padding: '10px 0', borderBottom: i < selDay.length - 1 ? '1px solid var(--border-light)' : 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
                  onTouchStart={() => startLongPress(tx)} onTouchEnd={cancelLongPress} onTouchMove={cancelLongPress}
                  onMouseDown={() => startLongPress(tx)} onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress}
                  onContextMenu={e => { e.preventDefault(); openTxMenu(tx) }}>
                  <TxItem tx={tx} emojiMap={data.emoji_map} />
                </div>
              ))}
            </div>
            {selDay && selDay.length > 0 && (
              <div style={{ padding: '10px 20px 16px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                <span>수입 <strong style={{ color: '#34c759' }}>{fmt(selDay.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0))}원</strong></span>
                <span>지출 <strong style={{ color: '#ff3b30' }}>{fmt(selDay.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0))}원</strong></span>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      <div className="card mt-3" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          <div className="d-flex justify-content-around">
            <div className="text-center">
              <div style={{ fontSize: '0.95rem', color: '#34c759', fontWeight: 600 }}>수입</div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(data.income_total)}원</div>
            </div>
            <div className="text-center">
              <div style={{ fontSize: '0.95rem', color: '#ff3b30', fontWeight: 600 }}>지출</div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(data.expense_total)}원</div>
            </div>
            <div className="text-center">
              <div style={{ fontSize: '0.95rem', color: '#007aff', fontWeight: 600 }}>총계</div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(data.income_total - data.expense_total)}원</div>
            </div>
          </div>
        </div>
      </div>

      {/* 월별 내역 목록 */}
      {(() => {
        const allTxs = Object.entries(data.day_transactions)
          .sort(([a], [b]) => b.localeCompare(a))
          .flatMap(([date, txs]) => txs.map(tx => ({ ...tx, date })))
        const allCards = [...new Set(allTxs.map(tx => tx.card).filter(Boolean))].sort()
        const filtered = allTxs.filter(tx =>
          (txFilter === 'all' || tx.type === txFilter) &&
          (cardFilter === 'all' || tx.card === cardFilter)
        )
        const byDate = filtered.reduce((acc, tx) => {
          if (!acc[tx.date]) acc[tx.date] = []
          acc[tx.date].push(tx)
          return acc
        }, {})
        const dates = Object.keys(byDate).sort((a, b) => txSortAsc ? a.localeCompare(b) : b.localeCompare(a))
        dates.forEach(d => {
          byDate[d].sort((a, b) => txSortAsc
            ? ((a.time || '').localeCompare(b.time || '') || a.id - b.id)
            : ((b.time || '').localeCompare(a.time || '') || b.id - a.id)
          )
        })
        return (
          <div style={{ marginTop: 40 }}>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h3 className="mb-0 fw-bold">내역 목록</h3>
              <div className="d-flex align-items-center gap-2">
                <button onClick={() => setTxSortAsc(a => !a)} style={{ borderRadius: 20, padding: '3px 10px', fontSize: '0.8rem', color: '#b088f9', border: '1px solid #b088f9', background: 'transparent', whiteSpace: 'nowrap' }}>
                  {txSortAsc ? '최신순' : '과거순'}
                </button>
                <SlidingTabs options={[['all', '전체'], ['expense', '지출'], ['income', '수입']]} value={txFilter} onChange={setTxFilter} />
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
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0', fontSize: '0.9rem' }}>내역이 없습니다</div>
            ) : dates.map(date => (
              <div key={date} className="mb-2">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px 4px' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)' }}>{fmtDate(date)}</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border-light)' }} />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {(() => { const s = byDate[date].reduce((a, t) => t.type === 'income' ? a + t.amount : a - t.amount, 0); return `${s >= 0 ? '+' : ''}${fmt(s)}원` })()}
                  </span>
                </div>
                <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  {byDate[date].map((tx, i) => (
                    <SwipeItem key={tx.id} onDelete={() => setConfirmSheet(tx.id)} onEdit={() => navigate(`/edit/${tx.id}`)}>
                      <div
                        style={{ padding: '12px 14px', background: 'var(--bg-card)', borderBottom: i < byDate[date].length - 1 ? '1px solid var(--border-light)' : 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
                        onTouchStart={() => startLongPress(tx)} onTouchEnd={cancelLongPress} onTouchMove={cancelLongPress}
                        onMouseDown={() => startLongPress(tx)} onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress}
                        onContextMenu={e => { e.preventDefault(); openTxMenu(tx) }}>
                        <TxItem tx={tx} emojiMap={data.emoji_map} />
                      </div>
                    </SwipeItem>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      {confirmSheet && (
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 6000, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px', width: 'min(88vw,320px)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <p className="text-center fw-semibold mb-4" style={{ fontSize: '1rem' }}>삭제하시겠습니까?</p>
            <div className="d-flex gap-2">
              <button className="btn flex-fill" onClick={() => handleDelete(confirmSheet)} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>확인</button>
              <button className="btn btn-outline-secondary flex-fill" onClick={() => setConfirmSheet(null)} style={{ borderRadius: 10 }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {txMenu && createPortal(
        <div onClick={closeTxMenu}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 7000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', opacity: txMenuVisible ? 1 : 0, transition: 'opacity 0.22s ease' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', padding: '16px 16px 40px', transform: txMenuVisible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
            <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14 }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{txMenu.date}</span>
              {txMenu.description ? ` · ${txMenu.description}` : ''} · <span style={{ color: txMenu.type === 'income' ? '#34c759' : '#ff3b30', fontWeight: 600 }}>{txMenu.type === 'income' ? '+' : '-'}{fmt(txMenu.amount)}원</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { closeTxMenu(); navigate(`/edit/${txMenu.id}`) }}
                style={{ flex: 1, padding: '14px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>
                ✏️ 수정
              </button>
              <button onClick={() => { closeTxMenu(); setConfirmSheet(txMenu.id) }}
                style={{ flex: 1, padding: '14px 0', borderRadius: 14, border: '1.5px solid #dc3545', background: 'rgba(220,53,69,0.08)', color: '#dc3545', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>
                🗑️ 삭제
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
