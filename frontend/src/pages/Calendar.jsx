import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import api from '../api.js'
import { fmt, fmtMonth, fmtDate } from '../utils.js'

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

export default function Calendar() {
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(null)
  const [selectedVisible, setSelectedVisible] = useState(false)
  const [txFilter, setTxFilter] = useState('all')
  const [txSortAsc, setTxSortAsc] = useState(false)
  const [yearMonth, setYearMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear())
  const [pickerMode, setPickerMode] = useState('month')
  const [pickerDecade, setPickerDecade] = useState(() => Math.floor((new Date().getFullYear() - 1) / 10) * 10 + 1)

  const load = useCallback((ym) => {
    api.get(`/api/calendar?month=${ym}`).then(setData).catch(console.error)
  }, [])

  useEffect(() => { load(yearMonth) }, [yearMonth, load])

  function goPrev() {
    const [y, m] = yearMonth.split('-').map(Number)
    setData(null); setTxFilter('all'); setTxSortAsc(false)
    setYearMonth(m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`)
  }
  function goNext() {
    const [y, m] = yearMonth.split('-').map(Number)
    setData(null); setTxFilter('all'); setTxSortAsc(false)
    setYearMonth(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`)
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
          <button style={{ background: 'none', border: 'none', color: '#555', fontSize: '1.3rem', padding: '4px 10px', cursor: 'pointer', lineHeight: 1 }} onClick={goPrev}>
            <i className="bi bi-chevron-left" />
          </button>
          <span onClick={openPicker} style={{ fontSize: '1.25rem', fontWeight: 700, cursor: 'pointer', userSelect: 'none', padding: '4px 10px' }}>
            {fmtMonth(yearMonth)}
          </span>
          <button style={{ background: 'none', border: 'none', color: '#555', fontSize: '1.1rem', padding: '4px 8px', cursor: 'pointer', lineHeight: 1 }} onClick={goNext}>
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
              const numCol = dow === 0 ? '#ff3b30' : dow === 6 ? '#007aff' : '#1c1c1e'
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

      {/* 년/월 피커 */}
      {pickerOpen && createPortal(
        <div onClick={e => e.target === e.currentTarget && setPickerOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.42)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 320, padding: '20px 16px 24px', boxShadow: '0 12px 40px rgba(0,0,0,0.22)' }}>
            {pickerMode === 'month' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <button onClick={() => setPickerYear(y => y - 1)} style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#555', padding: '4px 10px' }}>
                  <i className="bi bi-chevron-left" />
                </button>
                <span onClick={() => { setPickerDecade(Math.floor((pickerYear - 1) / 10) * 10 + 1); setPickerMode('decade') }} style={{ fontWeight: 700, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 8px', borderRadius: 8, background: '#f0eeff', color: '#b088f9' }}>{pickerYear}년 ▾</span>
                <button onClick={() => setPickerYear(y => y + 1)} style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#555', padding: '4px 10px' }}>
                  <i className="bi bi-chevron-right" />
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                  const isSel = pickerYear === curY && m === curM
                  return (
                    <button key={m} onClick={() => { setData(null); setYearMonth(`${pickerYear}-${String(m).padStart(2,'0')}`); setPickerOpen(false) }}
                      style={{ padding: '10px 0', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: isSel ? 700 : 400, fontSize: '0.9rem', background: isSel ? 'linear-gradient(135deg,#b088f9,#7baff0)' : '#f5f5f5', color: isSel ? 'white' : '#333' }}>
                      {m}월
                    </button>
                  )
                })}
              </div>
            </>
          ) : pickerMode === 'decade' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontWeight: 700, fontSize: '1rem', color: '#555' }}>연도 선택</span>
                <button onClick={() => setPickerMode('month')} style={{ border: 'none', background: '#f0eeff', borderRadius: 8, padding: '4px 10px', fontSize: '0.82rem', color: '#b088f9', cursor: 'pointer', fontWeight: 600 }}>닫기</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {[2001, 2011, 2021, 2031].map(start => {
                  const end = start + 9
                  const isCur = pickerYear >= start && pickerYear <= end
                  return (
                    <button key={start} onClick={() => { setPickerDecade(start); setPickerMode('year') }}
                      style={{ padding: '14px 0', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: isCur ? 700 : 400, fontSize: '0.9rem', background: isCur ? 'linear-gradient(135deg,#b088f9,#7baff0)' : '#f5f5f5', color: isCur ? 'white' : '#333' }}>
                      {start} ~ {end}
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontWeight: 700, fontSize: '1rem', color: '#555' }}>{pickerDecade} ~ {pickerDecade + 9}</span>
                <button onClick={() => setPickerMode('decade')} style={{ border: 'none', background: '#f0eeff', borderRadius: 8, padding: '4px 10px', fontSize: '0.82rem', color: '#b088f9', cursor: 'pointer', fontWeight: 600 }}>뒤로</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {Array.from({ length: 10 }, (_, i) => pickerDecade + i).map(y => {
                  const isSel = y === pickerYear
                  return (
                    <button key={y} onClick={() => { setPickerYear(y); setPickerMode('month') }}
                      style={{ padding: '10px 0', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: isSel ? 700 : 400, fontSize: '0.88rem', background: isSel ? 'linear-gradient(135deg,#b088f9,#7baff0)' : '#f5f5f5', color: isSel ? 'white' : '#333' }}>
                      {y}
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
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 420, maxHeight: '72vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.22)', transform: selectedVisible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(12px)', transition: 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
            <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span className="fw-bold" style={{ fontSize: '1rem' }}>{fmtDate(selected)}</span>
              <button onClick={() => { setSelectedVisible(false); setTimeout(() => setSelected(null), 300) }} style={{ background: '#f2f2f7', border: 'none', width: 28, height: 28, borderRadius: 14, fontSize: '1.05rem', color: '#6e6e73', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '8px 20px 40px' }}>
              {!selDay || selDay.length === 0 ? (
                <p style={{ color: '#aaa', textAlign: 'center', padding: '24px 0' }}>이 날 내역이 없습니다</p>
              ) : selDay.map(tx => (
                <div key={tx.id} className="d-flex align-items-center py-2" style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1c1c1e' }}>{tx.category}</div>
                    {(tx.description || tx.card) && (
                      <div style={{ fontSize: '0.75rem', color: '#999' }}>{[tx.description, tx.card].filter(Boolean).join(' · ')}</div>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, color: tx.type === 'income' ? '#34c759' : '#ff3b30', flexShrink: 0 }}>
                    {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}원
                  </div>
                </div>
              ))}
            </div>
            {selDay && selDay.length > 0 && (
              <div style={{ padding: '10px 20px 16px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#666', flexShrink: 0 }}>
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
              <div style={{ fontSize: '0.78rem', color: '#34c759', fontWeight: 600 }}>수입</div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(data.income_total)}원</div>
            </div>
            <div className="text-center">
              <div style={{ fontSize: '0.78rem', color: '#ff3b30', fontWeight: 600 }}>지출</div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(data.expense_total)}원</div>
            </div>
            <div className="text-center">
              <div style={{ fontSize: '0.78rem', color: '#007aff', fontWeight: 600 }}>총계</div>
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
        const filtered = allTxs.filter(tx => txFilter === 'all' || tx.type === txFilter)
        const byDate = filtered.reduce((acc, tx) => {
          if (!acc[tx.date]) acc[tx.date] = []
          acc[tx.date].push(tx)
          return acc
        }, {})
        const dates = Object.keys(byDate).sort((a, b) => txSortAsc ? a.localeCompare(b) : b.localeCompare(a))
        return (
          <div className="mt-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div className="d-flex align-items-center gap-2">
                <h5 className="mb-0 fw-bold">내역 목록</h5>
                <button onClick={() => setTxSortAsc(a => !a)} style={{ borderRadius: 20, padding: '3px 10px', fontSize: '0.8rem', color: '#b088f9', border: '1px solid #b088f9', background: 'transparent' }}>
                  {txSortAsc ? '과거순' : '최신순'}
                </button>
              </div>
              <SlidingTabs options={[['all', '전체'], ['expense', '지출'], ['income', '수입']]} value={txFilter} onChange={setTxFilter} />
            </div>
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#bbb', padding: '32px 0', fontSize: '0.9rem' }}>내역이 없습니다</div>
            ) : dates.map(date => (
              <div key={date} className="mb-2">
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#aaa', padding: '4px 0 2px' }}>
                  {fmtDate(date)}
                </div>
                <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  {byDate[date].map((tx, i) => (
                    <div key={tx.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: i < byDate[date].length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1c1c1e', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                          <span style={{ marginRight: 2 }}>{data.emoji_map[tx.category] || ''}</span>
                          <span>{tx.category}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#999', marginTop: 1, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                          {tx.card && <span style={{ fontSize: '0.72rem', background: '#f0eeff', color: '#b088f9', border: '1px solid #e0d0ff', borderRadius: 4, padding: '0 4px', fontWeight: 600 }}>{tx.card}</span>}
                          {tx.card && tx.description && <span style={{ opacity: 0.35 }}>|</span>}
                          {tx.description && <span>{tx.description}</span>}
                          {tx.exclude_perf && <><span style={{ opacity: 0.35 }}>|</span><span style={{ fontSize: '0.72rem', background: '#fff0f0', color: '#dc3545', border: '1px solid #fcc', borderRadius: 4, padding: '0 4px' }}>실적제외</span></>}
                          {tx.exclude_stats && <><span style={{ opacity: 0.35 }}>|</span><span style={{ fontSize: '0.72rem', background: '#f0f4ff', color: '#5a7fd4', border: '1px solid #c5d5f5', borderRadius: 4, padding: '0 4px' }}>통계제외</span></>}
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: tx.type === 'income' ? '#34c759' : '#ff3b30', flexShrink: 0, marginLeft: 8 }}>
                        {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}원
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )
}
