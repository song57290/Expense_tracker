import { useState, useEffect, useCallback } from 'react'
import {
  Chart as ChartJS, ArcElement, Tooltip,
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Filler,
} from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import { Doughnut, Bar, Line } from 'react-chartjs-2'
import api from '../api.js'
import { fmt, bankLogo, fmtMonth } from '../utils.js'

ChartJS.register(ArcElement, Tooltip, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, ChartDataLabels)

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
function defaultTrendRange() {
  const to = nowYM()
  return { from: shiftMonth(to, -5), to }
}

export default function Stats() {
  const [month, setMonth] = useState(nowYM)
  const [data, setData] = useState(null)
  const [cardFilter, setCardFilter] = useState('__all__')
  const [catOpen, setCatOpen] = useState(true)
  const [barOpen, setBarOpen] = useState(true)
  const [assetOpen, setAssetOpen] = useState(true)
  const [portfolioOpen, setPortfolioOpen] = useState(true)
  const [assetDetail, setAssetDetail] = useState(false)
  const [assetVisible, setAssetVisible] = useState(false)
  const [trendFrom, setTrendFrom] = useState(() => defaultTrendRange().from)
  const [trendTo, setTrendTo] = useState(() => defaultTrendRange().to)

  useEffect(() => {
    document.body.classList.toggle('sheet-open', assetDetail)
    return () => document.body.classList.remove('sheet-open')
  }, [assetDetail])

  function openAssetDetail() {
    setAssetDetail(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setAssetVisible(true)))
  }
  function closeAssetDetail() {
    setAssetVisible(false)
    setTimeout(() => setAssetDetail(false), 300)
  }

  const load = useCallback(() => {
    api.get(`/api/stats?month=${month}&trend_from=${trendFrom}&trend_to=${trendTo}`).then(setData).catch(console.error)
  }, [month, trendFrom, trendTo])
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
              {(() => {
                const monthly = data.monthly || []
                const nonZeroExp = monthly.filter(m => m.expense > 0)
                const nonZeroInc = monthly.filter(m => m.income > 0)
                const avgExp = nonZeroExp.length ? Math.round(nonZeroExp.reduce((s, m) => s + m.expense, 0) / nonZeroExp.length) : 0
                const avgInc = nonZeroInc.length ? Math.round(nonZeroInc.reduce((s, m) => s + m.income, 0) / nonZeroInc.length) : 0
                const avgBal = avgInc - avgExp
                return (
                  <div className="d-flex gap-2 mt-3">
                    {[
                      { label: '월 평균 수입', val: avgInc, color: '#198754', bg: '#f0faf4' },
                      { label: '월 평균 지출', val: avgExp, color: '#dc3545', bg: '#fff0f0' },
                      { label: '월 평균 잔액', val: avgBal, color: avgBal >= 0 ? '#0d6efd' : '#dc3545', bg: avgBal >= 0 ? '#f0f4ff' : '#fff0f0' },
                    ].map(({ label, val, color, bg }) => (
                      <div key={label} style={{ flex: 1, background: bg, borderRadius: 12, padding: '10px 12px' }}>
                        <div style={{ fontSize: '0.68rem', color: '#888', marginBottom: 3 }}>{label}</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color }}>{(val / 10000).toFixed(0)}만원</div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      </div>
      {/* 자산 구성 포트폴리오 */}
      {(data.portfolio_breakdown || []).length > 0 && (
        <div className="card mb-4">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setPortfolioOpen(o => !o)}>
              <h5 className="card-title mb-0">자산 구성</h5>
              <span style={{ fontSize: '1.4rem', color: '#b088f9', lineHeight: 1 }}>{portfolioOpen ? '▴' : '▾'}</span>
            </div>
            {portfolioOpen && (() => {
              const PF_COLORS = ['#b088f9', '#7baff0', '#4BC0C0', '#FF6384', '#FF9F40', '#FFCE56', '#9966FF', '#C9CBCF']
              const items = data.portfolio_breakdown || []
              const total = items.reduce((s, i) => s + i.value, 0)
              const labels = items.map(i => i.label)
              const values = items.map(i => i.value)
              const pfCenter = {
                id: 'pfCenter',
                afterDraw(chart) {
                  const { ctx, chartArea: { width, height, left, top } } = chart
                  const cx = left + width / 2, cy = top + height / 2
                  ctx.save()
                  ctx.font = 'bold 20px sans-serif'
                  ctx.fillStyle = '#333'
                  ctx.textAlign = 'center'
                  ctx.textBaseline = 'middle'
                  ctx.fillText(total >= 100000000 ? (total / 100000000).toFixed(1) + '억원' : (total / 10000).toFixed(0) + '만원', cx, cy - 10)
                  ctx.font = '12px sans-serif'
                  ctx.fillStyle = '#888'
                  ctx.fillText('총 자산', cx, cy + 14)
                  ctx.restore()
                }
              }
              return (
                <div className="mt-3">
                  <div style={{ maxWidth: 220, margin: '0 auto 16px' }}>
                    <Doughnut
                      data={{ labels, datasets: [{ data: values, backgroundColor: PF_COLORS, borderWidth: 2, hoverOffset: 6 }] }}
                      plugins={[pfCenter]}
                      options={{
                        plugins: {
                          legend: { display: false },
                          datalabels: { display: false },
                          tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmt(ctx.parsed)}원 (${(ctx.parsed / total * 100).toFixed(1)}%)` } }
                        }
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {items.map((item, i) => {
                      const pct = total ? (item.value / total * 100).toFixed(1) : 0
                      return (
                        <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 12, height: 12, borderRadius: 3, background: PF_COLORS[i % PF_COLORS.length], flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: '0.85rem', color: '#444' }}>{item.label}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#333', width: 90, textAlign: 'right' }}>{fmt(item.value)}원</span>
                              <span style={{ fontSize: '0.75rem', color: '#aaa', width: 38, textAlign: 'right' }}>{pct}%</span>
                            </div>
                          </div>
                          <div style={{ background: '#f0f0f0', borderRadius: 6, height: 10 }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: PF_COLORS[i % PF_COLORS.length], borderRadius: 6 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* 총 자산 추이 */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setAssetOpen(o => !o)}>
            <h5 className="card-title mb-0">총 자산 추이</h5>
            <span style={{ fontSize: '1.4rem', color: '#b088f9', lineHeight: 1 }}>{assetOpen ? '▴' : '▾'}</span>
          </div>
          {assetOpen && (
            <div className="d-flex align-items-center gap-2 mt-2 mb-1" onClick={e => e.stopPropagation()}>
              <input type="month" value={trendFrom} max={trendTo}
                onChange={e => {
                  const v = e.target.value; if (!v) return
                  const months = (trendTo.slice(0,4)*12 + parseInt(trendTo.slice(5))) - (v.slice(0,4)*12 + parseInt(v.slice(5)))
                  setTrendFrom(months > 5 ? shiftMonth(trendTo, -5) : v)
                }}
                style={{ flex: 1, border: '1.5px solid #e0d5ff', borderRadius: 10, padding: '6px 8px', fontSize: '0.82rem', color: '#555', outline: 'none', background: '#faf8ff' }} />
              <span style={{ color: '#bbb', fontSize: '0.85rem', flexShrink: 0 }}>~</span>
              <input type="month" value={trendTo} min={trendFrom} max={nowYM()}
                onChange={e => {
                  const v = e.target.value; if (!v) return
                  const months = (v.slice(0,4)*12 + parseInt(v.slice(5))) - (trendFrom.slice(0,4)*12 + parseInt(trendFrom.slice(5)))
                  setTrendTo(v)
                  if (months > 5) setTrendFrom(shiftMonth(v, -5))
                }}
                style={{ flex: 1, border: '1.5px solid #e0d5ff', borderRadius: 10, padding: '6px 8px', fontSize: '0.82rem', color: '#555', outline: 'none', background: '#faf8ff' }} />
              <span style={{ fontSize: '0.7rem', color: '#bbb', flexShrink: 0, whiteSpace: 'nowrap' }}>최대 6개월</span>
            </div>
          )}
          {assetOpen && (() => {
            const trend = data.asset_trend || []
            const tLabels = trend.map(t => parseInt(t.month.slice(5)) + '월')
            const tData = trend.map(t => t.assets)
            const latest = tData[tData.length - 1] || 0
            const prev = tData[tData.length - 2] || 0
            const diff = latest - prev
            function niceAssetAxis(d) {
              const mx = Math.max(...d, 0); const mn = Math.min(...d, 0)
              if (!mx && !mn) return { max: 10000000, min: 0, step: 2500000 }
              const range = mx - mn || mx || 10000000
              let step = Math.ceil(range / 4 / 1000000) * 1000000
              if (!step) step = 1000000
              return { max: Math.ceil(mx / step) * step + step, min: Math.floor(mn / step) * step, step }
            }
            const ax2 = niceAssetAxis(tData)
            const lineDataset = {
              data: tData,
              borderColor: '#b088f9',
              backgroundColor: 'rgba(176,136,249,0.12)',
              fill: true,
              tension: 0.4,
              pointBackgroundColor: '#b088f9',
              pointRadius: 5,
              pointHoverRadius: 7,
              borderWidth: 2.5,
            }
            const lineOptions = (minV, maxV, step) => ({
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                datalabels: { display: false },
                tooltip: { callbacks: { label: ctx => fmt(ctx.parsed.y) + '원' } }
              },
              scales: {
                y: {
                  min: minV, max: maxV,
                  ticks: {
                    callback: v => {
                      if (Math.abs(v) >= 100000000) return (v / 100000000).toFixed(0) + '억'
                      if (Math.abs(v) >= 10000) return (v / 10000).toFixed(0) + '만'
                      return v
                    },
                    stepSize: step,
                  },
                  grid: { color: 'rgba(0,0,0,0.05)' },
                },
              },
            })

            const maxIdx = tData.indexOf(Math.max(...tData))
            const minIdx = tData.indexOf(Math.min(...tData))

            return (
              <div className="mt-3">
                <div className="d-flex gap-3 mb-3">
                  <div style={{ flex: 1, background: '#f8f5ff', borderRadius: 12, padding: '10px 14px' }}>
                    <div style={{ fontSize: '0.72rem', color: '#888', marginBottom: 3 }}>현재 총 자산</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#b088f9' }}>{fmt(latest)}원</div>
                  </div>
                  <div style={{ flex: 1, background: diff >= 0 ? '#f0faf4' : '#fff0f0', borderRadius: 12, padding: '10px 14px' }}>
                    <div style={{ fontSize: '0.72rem', color: '#888', marginBottom: 3 }}>전월 대비</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: diff >= 0 ? '#198754' : '#dc3545' }}>
                      {diff >= 0 ? '+' : ''}{fmt(diff)}원
                    </div>
                  </div>
                </div>
                <div style={{ position: 'relative', cursor: 'pointer' }} onClick={openAssetDetail}>
                  <div style={{ height: 200 }}>
                    <Line data={{ labels: tLabels, datasets: [lineDataset] }} options={lineOptions(ax2.min, ax2.max, ax2.step)} />
                  </div>
                  <div style={{ textAlign: 'center', marginTop: 8, fontSize: '0.75rem', color: '#b088f9', opacity: 0.8 }}>
                    탭하여 자세히 보기 →
                  </div>
                </div>

                {/* 자산 상세 모달 */}
                {assetDetail && (
                  <>
                    <div onClick={closeAssetDetail}
                      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1400, transition: 'opacity 0.3s', opacity: assetVisible ? 1 : 0 }} />
                    <div style={{
                      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1500,
                      background: '#fff', borderRadius: '20px 20px 0 0',
                      maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
                      transform: assetVisible ? 'translateY(0)' : 'translateY(100%)',
                      transition: 'transform 0.3s cubic-bezier(.32,1.1,.72,1)',
                      boxShadow: '0 -4px 32px rgba(0,0,0,0.13)',
                    }}>
                      {/* 헤더 */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '1rem' }}>총 자산 추이</div>
                          <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: 1 }}>
                            {trendFrom.slice(2,4)}년 {parseInt(trendFrom.slice(5))}월 ~ {trendTo.slice(2,4)}년 {parseInt(trendTo.slice(5))}월
                          </div>
                        </div>
                        <button onClick={closeAssetDetail}
                          style={{ background: '#f2f2f7', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>✕</button>
                      </div>

                      {/* 스크롤 영역 */}
                      <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px 32px' }}>

                        {/* 요약 카드 */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
                          {[
                            { label: '현재 총 자산', val: fmt(latest) + '원', color: '#b088f9', bg: '#f8f5ff' },
                            { label: '전월 대비', val: (diff >= 0 ? '+' : '') + fmt(diff) + '원', color: diff >= 0 ? '#198754' : '#dc3545', bg: diff >= 0 ? '#f0faf4' : '#fff0f0' },
                            { label: '6개월 성장', val: (() => { const first = tData[0]; return first ? (((latest - first) / Math.abs(first)) * 100).toFixed(1) + '%' : '—' })(), color: (latest - tData[0]) >= 0 ? '#198754' : '#dc3545', bg: (latest - tData[0]) >= 0 ? '#f0faf4' : '#fff0f0' },
                          ].map(s => (
                            <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '10px 10px' }}>
                              <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: 3 }}>{s.label}</div>
                              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: s.color }}>{s.val}</div>
                            </div>
                          ))}
                        </div>

                        {/* 큰 차트 */}
                        <div style={{ height: 260, marginBottom: 24 }}>
                          <Line data={{ labels: tLabels, datasets: [{ ...lineDataset, pointRadius: 6, pointHoverRadius: 9 }] }} options={lineOptions(ax2.min, ax2.max, ax2.step)} />
                        </div>

                        {/* 월별 상세 테이블 */}
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 10, color: '#444' }}>월별 상세</div>
                        <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #f0f0f0' }}>
                          {trend.map((t, i) => {
                            const prev2 = i > 0 ? tData[i - 1] : null
                            const chg = prev2 !== null ? t.assets - prev2 : null
                            const pct = prev2 ? ((t.assets - prev2) / Math.abs(prev2) * 100).toFixed(1) : null
                            const isMax = i === maxIdx
                            const isMin = i === minIdx && tData.length > 1
                            return (
                              <div key={t.month} style={{
                                display: 'flex', alignItems: 'center', padding: '13px 16px',
                                borderBottom: i < trend.length - 1 ? '1px solid #f5f5f5' : 'none',
                                background: isMax ? '#f8f5ff' : isMin ? '#fff8f8' : '#fff',
                              }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 600, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {parseInt(t.month.slice(5))}월
                                    {isMax && <span style={{ fontSize: '0.65rem', background: '#b088f9', color: '#fff', borderRadius: 6, padding: '1px 6px' }}>최고</span>}
                                    {isMin && <span style={{ fontSize: '0.65rem', background: '#ff8fa3', color: '#fff', borderRadius: 6, padding: '1px 6px' }}>최저</span>}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: 2 }}>{t.month}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#333' }}>{fmt(t.assets)}원</div>
                                  {chg !== null && (
                                    <div style={{ fontSize: '0.72rem', color: chg >= 0 ? '#198754' : '#dc3545', marginTop: 2 }}>
                                      {chg >= 0 ? '▲' : '▼'} {fmt(Math.abs(chg))}원 ({chg >= 0 ? '+' : ''}{pct}%)
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      <div className="d-lg-none" style={{ height: 90 }} />
    </div>
  )
}
