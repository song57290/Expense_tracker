import { useState, useEffect, useCallback } from 'react'
import {
  Chart as ChartJS, ArcElement, Tooltip,
  CategoryScale, LinearScale, BarElement,
} from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import { Doughnut, Bar } from 'react-chartjs-2'
import api from '../api.js'
import { fmt, bankLogo, fmtMonth } from '../utils.js'

ChartJS.register(ArcElement, Tooltip, CategoryScale, LinearScale, BarElement, ChartDataLabels)

const PIE_COLORS = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF']

const centerTextPlugin = {
  id: 'centerText',
  afterDraw(chart) {
    const { ctx, chartArea: { width, height, left, top } } = chart
    const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0)
    const cx = left + width / 2, cy = top + height / 2
    ctx.save()
    ctx.font = 'bold 26px sans-serif'
    ctx.fillStyle = '#333'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(total.toLocaleString() + '원', cx, cy - 12)
    ctx.font = '13px sans-serif'
    ctx.fillStyle = '#888'
    ctx.fillText('총 사용 금액', cx, cy + 16)
    ctx.restore()
  },
}

function nowYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function shiftMonth(m, delta) {
  let [y, mo] = m.split('-').map(Number)
  mo += delta
  while (mo <= 0) { mo += 12; y-- }
  while (mo > 12) { mo -= 12; y++ }
  return `${y}-${String(mo).padStart(2, '0')}`
}

export default function Stats() {
  const [month, setMonth] = useState(nowYM)
  const [data, setData] = useState(null)
  const [cardFilter, setCardFilter] = useState('__all__')
  const [catOpen, setCatOpen] = useState(true)
  const [barOpen, setBarOpen] = useState(true)

  const load = useCallback(() => {
    api.get(`/api/stats?month=${month}`).then(setData).catch(console.error)
  }, [month])
  useEffect(() => { load() }, [load])

  if (!data) return <div className="text-center py-5"><div className="spinner-border" style={{ color: '#b088f9' }} /></div>

  const isCurrent = month === nowYM()
  const cats = data.expense_cats || []
  const expLabels = cats.map(c => c.name)
  const expData = cats.map(c => c.amount)

  const barMonths = (data.monthly || []).map(m => m.month)
  const barLabels = barMonths.map(m => parseInt(m.slice(5)) + '월')
  const allBarData = (data.monthly || []).map(m => m.expense)
  const barData = cardFilter === '__all__' ? allBarData : ((data.card_monthly_trend || {})[cardFilter] || allBarData)
  const bgColors = barMonths.map(m => m === month ? 'rgba(176,136,249,0.9)' : 'rgba(176,136,249,0.32)')

  function niceAxis(d) {
    const mx = Math.max(...d, 0)
    if (!mx) return { max: 20000, step: 5000 }
    let step = Math.ceil(mx / 4 / 5000) * 5000
    if (!step) step = 5000
    return { max: step * 4, step }
  }
  const ax = niceAxis(barData)

  return (
    <div>
      {/* 월 선택 */}
      <div className="d-flex align-items-center justify-content-center gap-3 mb-4" style={{ paddingBottom: '0.6rem' }}>
        <button onClick={() => setMonth(m => shiftMonth(m, -1))} className="btn btn-sm"
          style={{ background: 'rgba(176,136,249,0.15)', color: '#b088f9', border: '1.5px solid #b088f9', borderRadius: 20, padding: '4px 18px', fontSize: '1.6rem', lineHeight: 1 }}>‹</button>
        <div className="text-center" style={{ position: 'relative' }}>
          <div className="fw-bold" style={{ fontSize: '1.1rem', whiteSpace: 'nowrap' }}>{fmtMonth(month)}</div>
          {!isCurrent && (
            <button onClick={() => setMonth(nowYM())}
              style={{ fontSize: '0.75rem', color: '#aaa', background: 'none', border: 'none', padding: 0, position: 'absolute', left: '50%', top: '100%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', marginTop: 2 }}>현재로</button>
          )}
        </div>
        <button onClick={() => !isCurrent && setMonth(m => shiftMonth(m, 1))} className="btn btn-sm"
          disabled={isCurrent}
          style={{ background: isCurrent ? 'rgba(176,136,249,0.05)' : 'rgba(176,136,249,0.15)', color: isCurrent ? '#ccc' : '#b088f9', border: `1.5px solid ${isCurrent ? '#ccc' : '#b088f9'}`, borderRadius: 20, padding: '4px 18px', fontSize: '1.6rem', lineHeight: 1 }}>›</button>
      </div>

      {/* 카테고리별 지출 헤더 */}
      <div className="d-flex justify-content-between align-items-center mb-3 px-1" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setCatOpen(o => !o)}>
        <span className="fw-bold" style={{ fontSize: '1rem', color: '#333' }}>{fmtMonth(month)} 카테고리별 지출</span>
        <span style={{ fontSize: '1.4rem', color: '#b088f9', lineHeight: 1 }}>{catOpen ? '▴' : '▾'}</span>
      </div>
      {catOpen && (
        <div className="row mb-4 align-items-stretch">
          {/* 도넛 차트 */}
          <div className="col-md-6 mb-3 mb-md-0">
            <div className="card h-100">
              <div className="card-body d-flex flex-column align-items-center justify-content-center">
                {expData.length > 0 ? (
                  <>
                    <Doughnut
                      data={{ labels: expLabels, datasets: [{ data: expData, backgroundColor: PIE_COLORS }] }}
                      plugins={[centerTextPlugin]}
                      options={{
                        plugins: {
                          legend: { display: false },
                          datalabels: {
                            formatter: (value, ctx) => {
                              const total = ctx.dataset.data.reduce((a, b) => a + b, 0)
                              return value.toLocaleString() + '원\n(' + ((value / total) * 100).toFixed(1) + '%)'
                            },
                            color: '#fff',
                            font: { weight: 'bold', size: 12 },
                          },
                        },
                      }}
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '7px 16px', marginTop: 16, width: '100%' }}>
                      {expLabels.map((cat, i) => (
                        <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', color: '#555' }}>
                          <div style={{ width: 11, height: 11, borderRadius: 3, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                          <span>{data.emoji_map[cat] || '📦'} {cat}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-muted text-center py-4">지출 내역이 없습니다.</p>
                )}
              </div>
            </div>
          </div>
          {/* 상세 내역 테이블 */}
          <div className="col-md-6">
            <div className="card h-100">
              <div className="card-body">
                <h5 className="card-title">상세 내역</h5>
                <table className="table table-hover" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
                  <thead><tr><th>카테고리</th><th>지출 합계</th></tr></thead>
                  <tbody>
                    {cats.length === 0 ? (
                      <tr><td colSpan={2} className="text-muted text-center">내역 없음</td></tr>
                    ) : cats.map(c => (
                      <tr key={c.name}>
                        <td>{c.icon || data.emoji_map[c.name] || '📦'} {c.name}</td>
                        <td>{fmt(c.amount)}원</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 카드별 지출 */}
      {(data.card_monthly || []).length > 0 && (
        <div className="card mb-4">
          <div className="card-body">
            <h5 className="card-title">카드별 지출</h5>
            {data.card_monthly.map(c => {
              const logo = bankLogo(c.name)
              return (
                <div key={c.name} className="d-flex justify-content-between align-items-center py-2 border-bottom">
                  <span className="d-flex align-items-center gap-2">
                    {logo && <img src={logo} style={{ height: 22, width: 22, objectFit: 'contain', borderRadius: 4 }} />}
                    {c.name}
                  </span>
                  <span className="fw-semibold">{fmt(c.spent)}원</span>
                </div>
              )
            })}
            <div className="d-flex justify-content-between align-items-center pt-2">
              <span className="text-muted small">합계</span>
              <span className="fw-bold">{fmt(data.card_monthly.reduce((s, c) => s + c.spent, 0))}원</span>
            </div>
          </div>
        </div>
      )}

      {/* 월별 지출 추이 */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setBarOpen(o => !o)}>
            <h5 className="card-title mb-0">월별 지출 추이 <span className="text-muted fw-normal" style={{ fontSize: '0.8rem' }}>(최근 6개월)</span></h5>
            <span style={{ fontSize: '1.4rem', color: '#b088f9', lineHeight: 1 }}>{barOpen ? '▴' : '▾'}</span>
          </div>
          {barOpen && (
            <div>
              <select className="form-select form-select-sm mt-3" value={cardFilter}
                onChange={e => setCardFilter(e.target.value)}
                style={{ maxWidth: 200, borderRadius: 10 }}
                onClick={e => e.stopPropagation()}>
                <option value="__all__">전체 총합</option>
                {(data.card_list || []).map(name => <option key={name} value={name}>{name}</option>)}
              </select>
              <div style={{ maxHeight: 260, marginTop: 8 }}>
                <Bar
                  data={{ labels: barLabels, datasets: [{ data: barData, backgroundColor: bgColors, borderRadius: 6, barThickness: 24 }] }}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: { display: false },
                      datalabels: { display: false },
                    },
                    scales: {
                      y: {
                        min: 0, max: ax.max,
                        ticks: { callback: v => v === 0 ? '0' : (v / 10000) + '만', stepSize: ax.step },
                        grid: { color: 'rgba(0,0,0,0.06)' },
                      },
                    },
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="d-lg-none" style={{ height: 90 }} />
    </div>
  )
}
