import { useState, useEffect, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import api from '../api.js'
import { fmt } from '../utils.js'

export default function Calendar() {
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(null)
  const [yearMonth, setYearMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const load = useCallback((ym) => {
    api.get(`/api/calendar?month=${ym}`).then(setData).catch(console.error)
  }, [])

  useEffect(() => { load(yearMonth) }, [yearMonth, load])

  if (!data) return <div className="text-center py-5"><div className="spinner-border" style={{ color: '#b088f9' }} /></div>

  const events = Object.entries(data.day_totals).flatMap(([date, totals]) => {
    const result = []
    if (totals.expense) result.push({ title: `-${fmt(totals.expense)}`, date, color: '#ff3b30', textColor: 'white' })
    if (totals.income) result.push({ title: `+${fmt(totals.income)}`, date, color: '#34c759', textColor: 'white' })
    return result
  })

  const selDay = selected ? data.day_transactions[selected] : null

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0 fw-bold">캘린더</h5>
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => {
            const [y, m] = yearMonth.split('-').map(Number)
            const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
            setYearMonth(prev)
          }}><i className="bi bi-chevron-left" /></button>
          <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{yearMonth}</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => {
            const [y, m] = yearMonth.split('-').map(Number)
            const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
            setYearMonth(next)
          }}><i className="bi bi-chevron-right" /></button>
        </div>
      </div>

      <div className="card mb-3" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <div className="card-body p-2">
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            initialDate={yearMonth + '-01'}
            key={yearMonth}
            events={events}
            dateClick={info => setSelected(info.dateStr === selected ? null : info.dateStr)}
            headerToolbar={false}
            dayMaxEventRows={2}
            height="auto"
            locale="ko"
          />
        </div>
      </div>

      {selected && (
        <div className="card" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="mb-0 fw-bold">{selected}</h6>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.2rem', cursor: 'pointer' }}>&times;</button>
            </div>
            {!selDay || selDay.length === 0 ? (
              <p style={{ color: '#aaa', textAlign: 'center' }}>이 날 내역이 없습니다</p>
            ) : (
              selDay.map(tx => (
                <div key={tx.id} className="d-flex align-items-center py-2" style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1c1c1e' }}>{tx.description || tx.category}</div>
                    <div style={{ fontSize: '0.75rem', color: '#999' }}>{tx.category}{tx.card ? ' · ' + tx.card : ''}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: tx.type === 'income' ? '#34c759' : '#ff3b30' }}>
                    {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}원
                  </div>
                </div>
              ))
            )}
            {selDay && selDay.length > 0 && (
              <div className="d-flex justify-content-between pt-2" style={{ fontSize: '0.85rem', color: '#666' }}>
                <span>수입 <strong style={{ color: '#34c759' }}>{fmt(selDay.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0))}원</strong></span>
                <span>지출 <strong style={{ color: '#ff3b30' }}>{fmt(selDay.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0))}원</strong></span>
              </div>
            )}
          </div>
        </div>
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
              <div style={{ fontSize: '0.78rem', color: '#007aff', fontWeight: 600 }}>잔액</div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(data.income_total - data.expense_total)}원</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
