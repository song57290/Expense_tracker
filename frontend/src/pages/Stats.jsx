import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Chart as ChartJS, ArcElement, Tooltip,
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Filler,
} from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import { Doughnut, Bar, Line } from 'react-chartjs-2'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'
import { fmt, bankLogo, fmtMonth } from '../utils.js'
import YearDrum from '../components/YearDrum.jsx'

ChartJS.register(ArcElement, Tooltip, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, ChartDataLabels)

const PIE_COLORS = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF']

const centerTextPlugin = {
  id: 'centerText',
  afterDraw(chart) {
    const { ctx, chartArea: { width, height, left, top } } = chart
    const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0)
    const cx = left + width / 2, cy = top + height / 2
    const isDark = document.documentElement.dataset.theme === 'dark' || window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ctx.save()
    ctx.font = 'bold 26px sans-serif'
    ctx.fillStyle = isDark ? '#f0eeff' : '#333'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(total.toLocaleString() + '원', cx, cy - 12)
    ctx.font = '13px sans-serif'
    ctx.fillStyle = isDark ? '#9590a8' : '#888'
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
  const navigate = useNavigate()
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
  const [barFrom, setBarFrom] = useState(() => defaultTrendRange().from)
  const [barTo, setBarTo] = useState(() => defaultTrendRange().to)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerTarget, setPickerTarget] = useState('')
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear())
  const [pickerMode, setPickerMode] = useState('month')
  const [pickerDecade, setPickerDecade] = useState(() => Math.floor((new Date().getFullYear() - 1) / 10) * 10 + 1)
  const [barMode, setBarMode] = useState('expense')
  const [bdOpen, setBdOpen] = useState({})

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

  function openPicker(target) {
    const cur = target === 'main' ? month : { barFrom, barTo, trendFrom, trendTo }[target]
    const y = parseInt(cur.split('-')[0])
    setPickerTarget(target)
    setPickerYear(y)
    setPickerDecade(Math.floor((y - 1) / 10) * 10 + 1)
    setPickerMode('month')
    setPickerOpen(true)
  }
  function onPickerSelect(y, m) {
    const ym = `${y}-${String(m).padStart(2, '0')}`
    const now = nowYM()
    if (pickerTarget === 'main') {
      setMonth(ym > now ? now : ym)
    } else if (pickerTarget === 'barFrom') {
      setBarFrom(ym > barTo ? barTo : ym)
    } else if (pickerTarget === 'barTo') {
      const capped = ym > now ? now : ym
      setBarTo(capped < barFrom ? barFrom : capped)
    } else if (pickerTarget === 'trendFrom') {
      const months = (parseInt(trendTo.slice(0,4))*12 + parseInt(trendTo.slice(5))) - (y*12 + m)
      setTrendFrom(months > 5 ? shiftMonth(trendTo, -5) : ym)
    } else if (pickerTarget === 'trendTo') {
      const capped = ym > now ? now : ym
      const months = (parseInt(capped.slice(0,4))*12 + parseInt(capped.slice(5))) - (parseInt(trendFrom.slice(0,4))*12 + parseInt(trendFrom.slice(5)))
      setTrendTo(capped)
      if (months > 5) setTrendFrom(shiftMonth(capped, -5))
    }
    setPickerOpen(false)
  }

  const load = useCallback(() => {
    api.get(`/api/stats?month=${month}&trend_from=${trendFrom}&trend_to=${trendTo}&bar_from=${barFrom}&bar_to=${barTo}`).then(setData).catch(console.error)
  }, [month, trendFrom, trendTo, barFrom, barTo])
  useEffect(() => { load() }, [load])

  if (!data) return <div className="text-center py-5"><div className="spinner-border" style={{ color: '#b088f9' }} /></div>

  const isCurrent = month === nowYM()
  const cats = [...(data.expense_cats || [])].sort((a, b) => b.amount - a.amount)
  const expLabels = cats.map(c => c.name)
  const expData = cats.map(c => c.amount)

  const barMonths = (data.monthly || []).map(m => m.month)
  const barLabels = barMonths.map(m => parseInt(m.slice(5)) + '월')
  const allExpData = (data.monthly || []).map(m => m.expense)
  const allIncData = (data.monthly || []).map(m => m.income)
  const allBarData = barMode === 'expense' ? allExpData : allIncData
  const barData = barMode === 'expense' && cardFilter !== '__all__'
    ? ((data.card_monthly_trend || {})[cardFilter] || allExpData)
    : allBarData
  const barColor = barMode === 'expense' ? 'rgba(176,136,249,' : 'rgba(52,199,89,'
  const bgColors = barMonths.map(m => m === month ? `${barColor}0.9)` : `${barColor}0.32)`)
  const expColors = barMonths.map(m => m === month ? 'rgba(176,136,249,0.9)' : 'rgba(176,136,249,0.32)')
  const incColors = barMonths.map(m => m === month ? 'rgba(52,199,89,0.9)' : 'rgba(52,199,89,0.32)')

  function niceAxis(d) {
    const mx = Math.max(...d, 0)
    if (!mx) return { max: 2000000, step: 500000 }
    const unit = 500000
    const step = Math.ceil(Math.ceil(mx / unit) * unit / 4 / unit) * unit || unit
    return { max: step * 4, step }
  }
  const ax = barMode === 'both' ? niceAxis([...allExpData, ...allIncData]) : niceAxis(barData)

  const pickerBtnStyle = { flex: 1, border: '1.5px solid var(--border-input)', borderRadius: 10, padding: '6px 8px', fontSize: '0.82rem', color: 'var(--text-secondary)', background: 'var(--bg-elevated)', cursor: 'pointer', textAlign: 'center', fontWeight: 500 }

  return (
    <div>
      {/* 커스텀 년/월 피커 모달 */}
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
                  <span onClick={() => setPickerMode('drumYear')}
                    style={{ fontWeight: 700, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 8px', borderRadius: 8, background: 'var(--bg-accent)', color: '#b088f9' }}>
                    {pickerYear}년 ▾
                  </span>
                  <button onClick={() => setPickerYear(y => y + 1)} style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px 10px' }}>
                    <i className="bi bi-chevron-right" />
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                    const ym = `${pickerYear}-${String(m).padStart(2,'0')}`
                    const isSel = ym === { barFrom, barTo, trendFrom, trendTo, main: month }[pickerTarget]
                    return (
                      <button key={m} onClick={() => onPickerSelect(pickerYear, m)}
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

      {/* 월 선택 */}
      <div className="d-flex align-items-center justify-content-center gap-3 mb-4" style={{ paddingBottom: '0.6rem' }}>
        <button onClick={() => setMonth(m => shiftMonth(m, -1))} className="btn btn-sm"
          style={{ background: 'rgba(176,136,249,0.15)', color: '#b088f9', border: '1.5px solid #b088f9', borderRadius: 20, padding: '2px 18px 6px', fontSize: '1.6rem', lineHeight: 1 }}>‹</button>
        <div className="text-center" style={{ position: 'relative' }}>
          <div onClick={() => openPicker('main')} className="fw-bold" style={{ fontSize: '1.1rem', whiteSpace: 'nowrap', cursor: 'pointer', color: '#b088f9', background: 'rgba(176,136,249,0.10)', borderRadius: 20, padding: '3px 16px', display: 'inline-block' }}>
            {fmtMonth(month)} ▾
          </div>
          {!isCurrent && (
            <button onClick={() => setMonth(nowYM())}
              style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'none', border: 'none', padding: 0, position: 'absolute', left: '50%', top: '100%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', marginTop: 2 }}>현재로</button>
          )}
        </div>
        <button onClick={() => !isCurrent && setMonth(m => shiftMonth(m, 1))} className="btn btn-sm"
          disabled={isCurrent}
          style={{ background: isCurrent ? 'rgba(176,136,249,0.05)' : 'rgba(176,136,249,0.15)', color: isCurrent ? '#ccc' : '#b088f9', border: `1.5px solid ${isCurrent ? '#ccc' : '#b088f9'}`, borderRadius: 20, padding: '2px 18px 6px', fontSize: '1.6rem', lineHeight: 1 }}>›</button>
      </div>

      {/* 카테고리별 지출 헤더 */}
      <div className="d-flex justify-content-between align-items-center mb-3 px-1" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setCatOpen(o => !o)}>
        <span className="fw-bold" style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{fmtMonth(month)} 카테고리별 지출</span>
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
                            display: context => {
                              const total = context.dataset.data.reduce((a, b) => a + b, 0)
                              return context.dataset.data[context.dataIndex] / total > 0.07
                            },
                            formatter: (_, ctx) => {
                              const c = cats[ctx.dataIndex]
                              return (c.icon || data.emoji_map[c.name] || '📦') + ' ' + c.name
                            },
                            color: '#fff',
                            font: { weight: 'bold', size: 12 },
                          },
                          tooltip: {
                            backgroundColor: 'rgba(30,30,30,0.92)',
                            titleColor: '#fff',
                            bodyColor: '#fff',
                            padding: 10,
                            callbacks: {
                              title: () => [],
                              label: ctx => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0)
                                return `${fmt(ctx.parsed)}원 (${(ctx.parsed / total * 100).toFixed(1)}%)`
                              }
                            }
                          },
                        },
                      }}
                    />
                  </>
                ) : (
                  <p className="text-muted text-center py-4">지출 내역이 없습니다.</p>
                )}
              </div>
            </div>
          </div>
          {/* 상세 내역 */}
          <div className="col-md-6">
            <div className="card h-100">
              <div className="card-body">
                <h5 className="card-title">상세 내역</h5>
                {cats.length === 0 ? (
                  <p className="text-muted text-center py-4">내역 없음</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {cats.map((c, i) => {
                      const total = cats.reduce((s, x) => s + x.amount, 0)
                      const pct = total ? (c.amount / total * 100).toFixed(1) : 0
                      return (
                        <div key={c.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 12, height: 12, borderRadius: 3, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{c.icon || data.emoji_map[c.name] || '📦'} {c.name}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', width: 90, textAlign: 'right' }}>{fmt(c.amount)}원</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: 38, textAlign: 'right' }}>{pct}%</span>
                            </div>
                          </div>
                          <div style={{ background: 'var(--bg-section)', borderRadius: 6, height: 10 }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: PIE_COLORS[i % PIE_COLORS.length], borderRadius: 6 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
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

      {/* 월별 지출/수입 추이 */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setBarOpen(o => !o)}>
            <div className="d-flex align-items-center gap-2">
              <h5 className="card-title mb-0">월별 추이</h5>
              <div onClick={e => e.stopPropagation()} style={{ display: 'flex', background: 'var(--bg-section)', borderRadius: 10, padding: 3, gap: 2 }}>
                {[['expense', '지출'], ['income', '수입'], ['both', '전체']].map(([mode, label]) => (
                  <button key={mode} onClick={() => setBarMode(mode)}
                    style={{ border: 'none', borderRadius: 7, padding: '3px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                      background: barMode === mode ? (mode === 'expense' ? '#b088f9' : mode === 'income' ? '#34c759' : '#5b8def') : 'transparent',
                      color: barMode === mode ? 'white' : 'var(--text-muted)', transition: 'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <span style={{ fontSize: '1.4rem', color: '#b088f9', lineHeight: 1 }}>{barOpen ? '▴' : '▾'}</span>
          </div>
          {barOpen && (
            <div className="d-flex align-items-center gap-2 mt-2 mb-1" onClick={e => e.stopPropagation()}>
              <button onClick={() => openPicker('barFrom')} style={pickerBtnStyle}>
                {barFrom.slice(0,4)}년 {parseInt(barFrom.slice(5))}월
              </button>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', flexShrink: 0 }}>~</span>
              <button onClick={() => openPicker('barTo')} style={pickerBtnStyle}>
                {barTo.slice(0,4)}년 {parseInt(barTo.slice(5))}월
              </button>
              {data.first_month && (
                <button onClick={() => { setBarFrom(data.first_month); setBarTo(nowYM()) }}
                  style={{ flexShrink: 0, border: '1.5px solid var(--border-input)', borderRadius: 10, padding: '6px 10px', fontSize: '0.78rem', color: barFrom === data.first_month && barTo === nowYM() ? '#fff' : '#b088f9', background: barFrom === data.first_month && barTo === nowYM() ? '#b088f9' : 'var(--bg-elevated)', cursor: 'pointer', fontWeight: 600 }}>
                  전체
                </button>
              )}
            </div>
          )}
          {barOpen && (
            <div>
              {barMode === 'expense' && (
                <select className="form-select form-select-sm mt-2" value={cardFilter}
                  onChange={e => setCardFilter(e.target.value)}
                  style={{ maxWidth: 200, borderRadius: 10 }}
                  onClick={e => e.stopPropagation()}>
                  <option value="__all__">전체 총합</option>
                  {(data.card_list || []).map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              )}
              <div style={{ height: 240, marginTop: 8 }}>
                <Bar
                  data={{ labels: barLabels, datasets: barMode === 'both'
                    ? [
                        { label: '수입', data: allIncData, backgroundColor: incColors, borderRadius: 6, barPercentage: 0.45, categoryPercentage: 1.0 },
                        { label: '지출', data: allExpData, backgroundColor: expColors, borderRadius: 6, barPercentage: 0.45, categoryPercentage: 1.0 },
                      ]
                    : [{ data: barData, backgroundColor: bgColors, borderRadius: 6, barPercentage: 0.75, categoryPercentage: 1.0 }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: barMode === 'both', position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                      datalabels: { display: false },
                    },
                    scales: {
                      x: { grid: { display: true, color: 'rgba(0,0,0,0.05)', drawTicks: false } },
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
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
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
              const allItems = [...(data.portfolio_breakdown || [])]
              const assetItems = allItems.filter(i => i.value >= 0).sort((a, b) => b.value - a.value)
              const debtItems = allItems.filter(i => i.value < 0)
              const assetTotal = assetItems.reduce((s, i) => s + i.value, 0)
              const debtTotal = debtItems.reduce((s, i) => s + i.value, 0)
              const netTotal = data.total_assets ?? (assetTotal + debtTotal)
              const labels = assetItems.map(i => i.label)
              const values = assetItems.map(i => i.value)
              const pfCenter = {
                id: 'pfCenter',
                afterDraw(chart) {
                  const { ctx, chartArea: { width, height, left, top } } = chart
                  const cx = left + width / 2, cy = top + height / 2
                  const isDark = document.documentElement.dataset.theme === 'dark' || window.matchMedia?.('(prefers-color-scheme: dark)').matches
                  ctx.save()
                  ctx.font = 'bold 20px sans-serif'
                  ctx.fillStyle = isDark ? '#f0eeff' : '#333'
                  ctx.textAlign = 'center'
                  ctx.textBaseline = 'middle'
                  ctx.fillText(netTotal >= 100000000 ? (netTotal / 100000000).toFixed(1) + '억원' : (netTotal / 10000).toFixed(0) + '만원', cx, cy - 10)
                  ctx.font = '12px sans-serif'
                  ctx.fillStyle = isDark ? '#9590a8' : '#888'
                  ctx.fillText('순자산', cx, cy + 14)
                  ctx.restore()
                }
              }
              return (
                <div className="mt-3">
                  <div style={{ maxWidth: 360, margin: '0 auto 16px' }}>
                    <Doughnut
                      data={{ labels, datasets: [{ data: values, backgroundColor: PF_COLORS, borderWidth: 2, hoverOffset: 6 }] }}
                      plugins={[pfCenter]}
                      options={{
                        plugins: {
                          legend: { display: false },
                          datalabels: {
                            display: context => assetTotal ? context.dataset.data[context.dataIndex] / assetTotal > 0.07 : false,
                            formatter: (_, ctx) => ctx.chart.data.labels[ctx.dataIndex],
                            color: '#fff',
                            font: { weight: 'bold', size: 12 },
                          },
                          tooltip: {
                            backgroundColor: 'rgba(30,30,30,0.92)',
                            titleColor: '#fff',
                            bodyColor: '#fff',
                            padding: 10,
                            callbacks: {
                              title: () => [],
                              label: ctx => `${fmt(ctx.parsed)}원 (${assetTotal ? (ctx.parsed / assetTotal * 100).toFixed(1) : 0}%)`
                            }
                          }
                        }
                      }}
                    />
                  </div>
                  {(() => {
                    const toSection = label => ['예금','적금','청약'].includes(label) ? 'savings' : ['국내주식','해외주식','펀드','ETF','리츠'].includes(label) ? 'investment' : 'cards'
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {assetItems.map((item, i) => {
                          const pct = assetTotal ? (item.value / assetTotal * 100).toFixed(1) : 0
                          return (
                            <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }} onClick={() => navigate(`/budget?section=${toSection(item.label)}`)}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 12, height: 12, borderRadius: 3, background: PF_COLORS[i % PF_COLORS.length], flexShrink: 0 }} />
                                <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{item.label}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', width: 90, textAlign: 'right' }}>{fmt(item.value)}원</span>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: 38, textAlign: 'right' }}>{pct}%</span>
                                </div>
                              </div>
                              <div style={{ background: 'var(--bg-section)', borderRadius: 6, height: 10 }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: PF_COLORS[i % PF_COLORS.length], borderRadius: 6 }} />
                              </div>
                            </div>
                          )
                        })}
                        {debtItems.length > 0 && (
                          <>
                            <div style={{ borderTop: '1px solid var(--border-light)', marginTop: 4 }} />
                            {debtItems.map(item => {
                              const pct = assetTotal ? (Math.abs(item.value) / assetTotal * 100).toFixed(1) : 0
                              return (
                                <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }} onClick={() => navigate('/budget?section=cards')}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 12, height: 12, borderRadius: 3, background: '#ff6b6b', flexShrink: 0 }} />
                                    <span style={{ flex: 1, fontSize: '0.85rem', color: '#e05555' }}>{item.label}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e05555', width: 90, textAlign: 'right' }}>-{fmt(Math.abs(item.value))}원</span>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: 38, textAlign: 'right' }}>{pct}%</span>
                                    </div>
                                  </div>
                                  <div style={{ background: 'var(--bg-section)', borderRadius: 6, height: 10 }}>
                                    <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: '#ff6b6b', borderRadius: 6 }} />
                                  </div>
                                </div>
                              )
                            })}
                          </>
                        )}
                      </div>
                    )
                  })()}
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
              <button onClick={() => openPicker('trendFrom')} style={pickerBtnStyle}>
                {trendFrom.slice(0,4)}년 {parseInt(trendFrom.slice(5))}월
              </button>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', flexShrink: 0 }}>~</span>
              <button onClick={() => openPicker('trendTo')} style={pickerBtnStyle}>
                {trendTo.slice(0,4)}년 {parseInt(trendTo.slice(5))}월
              </button>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>최대 6개월</span>
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
                <div className="d-flex gap-3 mb-2">
                  <div style={{ flex: 1, background: 'var(--bg-elevated)', borderRadius: 12, padding: '10px 14px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 3 }}>현재 순자산</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#b088f9' }}>{fmt(latest)}원</div>
                  </div>
                  <div style={{ flex: 1, background: diff >= 0 ? '#f0faf4' : '#fff0f0', borderRadius: 12, padding: '10px 14px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 3 }}>전월 대비</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: diff >= 0 ? '#198754' : '#dc3545' }}>
                      {diff >= 0 ? '+' : ''}{fmt(diff)}원
                    </div>
                  </div>
                </div>
                {(() => {
                  if (trend.length < 2) return null
                  const curBd = trend[trend.length - 1].breakdown || {}
                  const prevBd = trend[trend.length - 2].breakdown || {}
                  const keys = [...new Set([...Object.keys(curBd), ...Object.keys(prevBd)])]
                  const changes = keys
                    .map(k => ({ label: k, diff: (curBd[k] || 0) - (prevBd[k] || 0) }))
                    .filter(c => c.diff !== 0)
                    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
                  if (!changes.length) return null
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      {changes.map(c => (
                        <div key={c.label} style={{
                          background: c.diff > 0 ? '#f0faf4' : '#fff0f0',
                          border: `1px solid ${c.diff > 0 ? '#c3e6cb' : '#f5c6cb'}`,
                          borderRadius: 8, padding: '4px 10px',
                          fontSize: '0.74rem', fontWeight: 600,
                          color: c.diff > 0 ? '#198754' : '#dc3545',
                        }}>
                          {c.label} {c.diff > 0 ? '+' : ''}{fmt(c.diff)}원
                        </div>
                      ))}
                    </div>
                  )
                })()}
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
                      background: 'var(--bg-card)', borderRadius: '20px 20px 0 0',
                      maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
                      transform: assetVisible ? 'translateY(0)' : 'translateY(100%)',
                      transition: 'transform 0.3s cubic-bezier(.32,1.1,.72,1)',
                      boxShadow: '0 -4px 32px rgba(0,0,0,0.13)',
                    }}>
                      {/* 헤더 */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 12px', borderBottom: '1px solid var(--border-light)', flexShrink: 0 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '1rem' }}>총 자산 추이</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 1 }}>
                            {trendFrom.slice(2,4)}년 {parseInt(trendFrom.slice(5))}월 ~ {trendTo.slice(2,4)}년 {parseInt(trendTo.slice(5))}월
                          </div>
                        </div>
                        <button onClick={closeAssetDetail}
                          style={{ background: 'var(--bg-section)', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>✕</button>
                      </div>

                      {/* 스크롤 영역 */}
                      <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px 32px' }}>

                        {/* 요약 카드 */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
                          {[
                            { label: '현재 순자산', val: fmt(latest) + '원', color: '#b088f9', bg: 'var(--bg-elevated)' },
                            { label: '전월 대비', val: (diff >= 0 ? '+' : '') + fmt(diff) + '원', color: diff >= 0 ? '#198754' : '#dc3545', bg: diff >= 0 ? '#f0faf4' : '#fff0f0' },
                            { label: '6개월 성장', val: (() => { const first = tData[0]; return first ? (((latest - first) / Math.abs(first)) * 100).toFixed(1) + '%' : '—' })(), color: (latest - tData[0]) >= 0 ? '#198754' : '#dc3545', bg: (latest - tData[0]) >= 0 ? '#f0faf4' : '#fff0f0' },
                          ].map(s => (
                            <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '10px 10px' }}>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 3 }}>{s.label}</div>
                              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: s.color }}>{s.val}</div>
                            </div>
                          ))}
                        </div>

                        {/* 큰 차트 */}
                        <div style={{ height: 260, marginBottom: 24 }}>
                          <Line data={{ labels: tLabels, datasets: [{ ...lineDataset, pointRadius: 6, pointHoverRadius: 9 }] }} options={lineOptions(ax2.min, ax2.max, ax2.step)} />
                        </div>

                        {/* 월별 상세 테이블 */}
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 10, color: 'var(--text-secondary)' }}>월별 상세</div>
                        <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border-light)' }}>
                          {trend.map((t, i) => {
                            const prev2 = i > 0 ? tData[i - 1] : null
                            const chg = prev2 !== null ? t.assets - prev2 : null
                            const pct = prev2 ? ((t.assets - prev2) / Math.abs(prev2) * 100).toFixed(1) : null
                            const isMax = i === maxIdx
                            const isMin = i === minIdx && tData.length > 1
                            const bdChanges = (() => {
                              if (i === 0 || !t.breakdown) return []
                              const cur = t.breakdown
                              const prv = trend[i - 1].breakdown || {}
                              const keys = [...new Set([...Object.keys(cur), ...Object.keys(prv)])]
                              return keys
                                .map(k => ({ label: k, diff: (cur[k] || 0) - (prv[k] || 0) }))
                                .filter(c => c.diff !== 0)
                                .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
                            })()
                            return (
                              <div key={t.month} style={{
                                padding: '13px 16px',
                                borderBottom: i < trend.length - 1 ? '1px solid var(--border-light)' : 'none',
                                background: isMax ? 'var(--bg-elevated)' : isMin ? '#fff8f8' : 'var(--bg-card)',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                                      {parseInt(t.month.slice(5))}월
                                      {isMax && <span style={{ fontSize: '0.65rem', background: '#b088f9', color: '#fff', borderRadius: 6, padding: '1px 6px' }}>최고</span>}
                                      {isMin && <span style={{ fontSize: '0.65rem', background: '#ff8fa3', color: '#fff', borderRadius: 6, padding: '1px 6px' }}>최저</span>}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{t.month}</div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div>
                                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{fmt(t.assets)}원</div>
                                    </div>
                                    {chg !== null && (
                                      <div
                                        onClick={bdChanges.length > 0 ? () => setBdOpen(o => ({ ...o, [t.month]: !o[t.month] })) : undefined}
                                        style={{
                                          fontSize: '0.72rem', fontWeight: 600, marginTop: 3,
                                          color: chg >= 0 ? '#198754' : '#dc3545',
                                          textDecoration: bdChanges.length > 0 ? 'underline' : 'none',
                                          textUnderlineOffset: '2px',
                                          cursor: bdChanges.length > 0 ? 'pointer' : 'default',
                                        }}
                                      >
                                        {chg >= 0 ? '▲' : '▼'} {fmt(Math.abs(chg))}원 ({chg >= 0 ? '+' : ''}{pct}%)
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {bdOpen[t.month] && bdChanges.length > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                                    {bdChanges.map(c => (
                                      <span key={c.label} style={{
                                        fontSize: '0.68rem', fontWeight: 600,
                                        color: c.diff > 0 ? '#198754' : '#dc3545',
                                        background: c.diff > 0 ? '#f0faf4' : '#fff0f0',
                                        border: `1px solid ${c.diff > 0 ? '#c3e6cb' : '#f5c6cb'}`,
                                        borderRadius: 6, padding: '2px 7px',
                                      }}>
                                        {c.label} {c.diff > 0 ? '+' : ''}{fmt(c.diff)}원
                                      </span>
                                    ))}
                                  </div>
                                )}
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
