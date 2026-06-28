import { useState, useEffect, useCallback } from 'react'
import { Pie, Bar } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js'
import api from '../api.js'
import { fmt } from '../utils.js'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement)

const PALETTE = ['#b088f9','#7baff0','#ff9500','#34c759','#ff3b30','#ffcc00','#5856d6','#ff2d55','#af52de','#5ac8fa']

export default function Stats() {
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('expense')
  const [yearMonth, setYearMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const load = useCallback((ym) => {
    api.get(`/api/stats?month=${ym}`).then(setData).catch(console.error)
  }, [])

  useEffect(() => { load(yearMonth) }, [yearMonth, load])

  if (!data) return <div className="text-center py-5"><div className="spinner-border" style={{ color: '#b088f9' }} /></div>

  const catData = tab === 'expense' ? data.expense_cats : data.income_cats
  const total = catData.reduce((s, c) => s + c.amount, 0)

  const pieData = {
    labels: catData.map(c => c.name),
    datasets: [{ data: catData.map(c => c.amount), backgroundColor: PALETTE.slice(0, catData.length), borderWidth: 0 }]
  }

  const barData = {
    labels: data.monthly.map(m => m.month),
    datasets: [
      { label: '지출', data: data.monthly.map(m => m.expense), backgroundColor: '#ff3b30cc', borderRadius: 6 },
      { label: '수입', data: data.monthly.map(m => m.income), backgroundColor: '#34c75988', borderRadius: 6 }
    ]
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0 fw-bold">통계</h5>
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => {
            const [y, m] = yearMonth.split('-').map(Number)
            setYearMonth(m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`)
          }}><i className="bi bi-chevron-left" /></button>
          <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{yearMonth}</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => {
            const [y, m] = yearMonth.split('-').map(Number)
            setYearMonth(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`)
          }}><i className="bi bi-chevron-right" /></button>
        </div>
      </div>

      <div className="d-flex gap-2 mb-3">
        {[['expense', '지출'], ['income', '수입']].map(([val, label]) => (
          <button key={val} onClick={() => setTab(val)} className={`pill-btn ${tab === val ? 'pill-active' : 'pill-inactive'}`}>{label}</button>
        ))}
      </div>

      <div className="card mb-3" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          <h6 className="fw-bold mb-3">카테고리별 {tab === 'expense' ? '지출' : '수입'}</h6>
          {catData.length === 0 ? (
            <p style={{ color: '#aaa', textAlign: 'center' }}>데이터가 없습니다</p>
          ) : (
            <>
              <div style={{ maxWidth: 280, margin: '0 auto 20px' }}>
                <Pie data={pieData} options={{ plugins: { legend: { display: false } }, responsive: true }} />
              </div>
              {catData.map((c, i) => (
                <div key={c.name} className="d-flex align-items-center mb-2">
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: PALETTE[i], flexShrink: 0, marginRight: 8 }} />
                  <span style={{ flex: 1, fontSize: '0.88rem' }}>{c.icon} {c.name}</span>
                  <div className="d-flex align-items-center gap-2">
                    <div style={{ width: 80, height: 5, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${total > 0 ? c.amount / total * 100 : 0}%`, height: '100%', background: PALETTE[i], borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: '0.82rem', color: '#666', minWidth: 40, textAlign: 'right' }}>{total > 0 ? Math.round(c.amount / total * 100) : 0}%</span>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: tab === 'expense' ? '#ff3b30' : '#34c759', minWidth: 80, textAlign: 'right' }}>{fmt(c.amount)}원</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          <h6 className="fw-bold mb-3">월별 현황</h6>
          {data.monthly.length === 0 ? (
            <p style={{ color: '#aaa', textAlign: 'center' }}>데이터가 없습니다</p>
          ) : (
            <Bar data={barData} options={{ responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { x: { grid: { display: false } }, y: { grid: { color: '#f0f0f0' }, ticks: { callback: v => fmt(v) } } } }} />
          )}
        </div>
      </div>
    </div>
  )
}
