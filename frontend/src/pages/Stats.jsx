import { useState, useEffect, useCallback, useRef } from 'react'
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
import { fmt, fmtMonth, useLocalStorageState } from '../utils.js'
import YearDrum from '../components/YearDrum.jsx'
import FilterPopup from '../components/FilterPopup.jsx'

ChartJS.register(ArcElement, Tooltip, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, ChartDataLabels)

// 조각을 하나 선택했을 때 나머지 조각들의 바깥 반지름을 살짝 줄여, 선택된 조각이
// (hoverOffset으로 튀어나온 것과 더불어) 상대적으로 더 도드라져 보이게 한다.
// Chart.js는 이런 "나머지 축소" 효과를 기본 제공하지 않아서, beforeDraw에서 매
// 프레임 각 조각(ArcElement)의 outerRadius를 직접 조정한다 — 선택 해제 상태일
// 때의 "원래" 반지름을 WeakMap에 기억해뒀다가, 그 값을 기준으로만 줄여서 프레임을
// 거듭해도 반지름이 계속 줄어드는(누적) 일이 없게 한다.
const _cleanOuterRadii = new WeakMap()
const shrinkInactivePlugin = {
  id: 'shrinkInactive',
  beforeDraw(chart) {
    const meta = chart.getDatasetMeta(0)
    if (!meta?.data?.length) return
    const active = chart.getActiveElements()
    if (!active.length) {
      meta.data.forEach(arc => _cleanOuterRadii.set(arc, arc.outerRadius))
      return
    }
    const activeIndex = active[0].index
    meta.data.forEach((arc, i) => {
      if (!_cleanOuterRadii.has(arc)) _cleanOuterRadii.set(arc, arc.outerRadius)
      const base = _cleanOuterRadii.get(arc)
      arc.outerRadius = i === activeIndex ? base : Math.max(arc.innerRadius + 6, base - 10)
    })
  },
}

const PIE_COLORS = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF']

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

// 탭 전환마다 이 페이지가 다시 마운트되면서 로딩 스피너가 매번 깜빡이지 않도록,
// 마지막으로 받아온 데이터를 모듈 스코프에 캐시해두고 재마운트 시 즉시 보여준다.
let _statsCache = null

export default function Stats() {
  const navigate = useNavigate()
  const [month, setMonth] = useState(nowYM)
  const [data, setData] = useState(() => _statsCache)
  const [cardFilter, setCardFilter] = useState('__all__')
  // 접기/펼치기 상태도 탭 이동·앱 재실행 후에 유지되도록 로컬 저장
  const [catOpen, setCatOpen] = useLocalStorageState('stats_cat_open', true)
  const [barOpen, setBarOpen] = useLocalStorageState('stats_bar_open', true)
  const [assetOpen, setAssetOpen] = useLocalStorageState('stats_asset_open', true)
  const [portfolioOpen, setPortfolioOpen] = useLocalStorageState('stats_portfolio_open', true)
  const [cmpOpen, setCmpOpen] = useLocalStorageState('stats_cmp_open', true)
  // 접기 애니메이션이 실제 내용 높이 대신 고정 3000px까지 움직이면 대부분의 시간을
  // 눈에 안 보이는 구간에서 흘려보내다 뒤늦게 움직여 느리게 느껴진다 — 실제 높이를
  // ref로 재서 애니메이션 전 구간이 항상 보이게 한다.
  const catCollapseRef = useRef(null)
  const barCollapseRef = useRef(null)
  const portfolioCollapseRef = useRef(null)
  const assetCollapseRef = useRef(null)
  const cmpCollapseRef = useRef(null)
  const [cmpHelpOpen, setCmpHelpOpen] = useState(false)
  // Chart.js 내장 캔버스 툴팁은 위치·정렬·그리기 순서를 전부 내부적으로 계산해서
  // 우리가 캔버스에 직접 그리는 가운데 텍스트와 계속 충돌했다(z-order, 정렬 등
  // 여러 방식으로 고쳐봐도 근본적으로 안 잡힘) — 아예 내장 툴팁을 끄고, 탭한
  // 좌표를 직접 받아 일반 DOM(div)으로 툴팁을 그린다. DOM은 캔버스 위에 항상
  // 정상적으로 얹히므로 겹침 문제 자체가 구조적으로 발생하지 않는다.
  const [catTip, setCatTip] = useState(null)
  const [pfTip, setPfTip] = useState(null)
  // 필터 팝업과 같은 방식으로 가릴 항목을 고를 수 있게 다중 선택으로 저장
  const [hiddenPartsRaw, setHiddenParts] = useLocalStorageState('hide_amounts_stats', [])
  // 예전 버전엔 이 키에 단순 boolean을 저장했다 — 남아있어도 안 죽게 보정
  const hiddenParts = hiddenPartsRaw === 'all' ? 'all' : Array.isArray(hiddenPartsRaw) ? hiddenPartsRaw : (hiddenPartsRaw ? 'all' : [])
  const hideCat = hiddenParts === 'all' || hiddenParts.includes('cat')
  const hideBar = hiddenParts === 'all' || hiddenParts.includes('bar')
  const hideAsset = hiddenParts === 'all' || hiddenParts.includes('asset')
  const hidePortfolio = hiddenParts === 'all' || hiddenParts.includes('portfolio')
  const hideCmp = hiddenParts === 'all' || hiddenParts.includes('cmp')
  // 카테고리별 지출 도넛 가운데 "총 사용 금액"은 캔버스에 직접 그려서 CSS 마스킹
  // 클래스를 못 쓴다 — 자산 구성 도넛(pfCenter)과 같은 방식으로 hideCat일 때
  // 숫자 대신 ●●●●●●을 그리도록 컴포넌트 안에서 다시 정의한다.
  const catCenter = {
    id: 'catCenter',
    // 로컬(plugins prop) 플러그인은 전역 등록된 Tooltip보다 나중에 그려져(=화면상
    // 위에 얹힘) 가운데 텍스트가 툴팁 박스를 덮어써 버리고 있었다 — z를 Tooltip
    // 기본값(0)보다 낮춰서 항상 툴팁보다 먼저(아래에) 그려지도록 강제한다.
    z: -1,
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
      ctx.fillText(hideCat ? '●●●●●●' : total.toLocaleString() + '원', cx, cy - 12)
      ctx.font = '13px sans-serif'
      ctx.fillStyle = isDark ? '#9590a8' : '#888'
      ctx.fillText('총 사용 금액', cx, cy + 16)
      ctx.restore()
    },
  }
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
  const [barMode, setBarMode] = useState('both')
  const [bdOpen, setBdOpen] = useState({})
  const [cmpSelected, setCmpSelected] = useState(() => {
    try {
      const saved = localStorage.getItem('stats_cmp_filter')
      return saved ? new Set(JSON.parse(saved)) : null
    } catch { return null }
  })
  useEffect(() => {
    // 탭 이동·앱 재실행 후에도 골라둔 필터가 유지되도록 로컬에 저장 — 서버로는
    // 아무것도 보내지 않으므로 서버 사용량과는 무관하다.
    try {
      if (cmpSelected === null) localStorage.removeItem('stats_cmp_filter')
      else localStorage.setItem('stats_cmp_filter', JSON.stringify(Array.from(cmpSelected)))
    } catch {}
  }, [cmpSelected])

  useEffect(() => {
    document.body.classList.toggle('sheet-open', assetDetail || pickerOpen)
    return () => document.body.classList.remove('sheet-open')
  }, [assetDetail, pickerOpen])

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
    api.get(`/api/stats?month=${month}&trend_from=${trendFrom}&trend_to=${trendTo}&bar_from=${barFrom}&bar_to=${barTo}`).then(d => { _statsCache = d; setData(d) }).catch(console.error)
  }, [month, trendFrom, trendTo, barFrom, barTo])
  useEffect(() => { load() }, [load])

  // 안드로이드 뒤로가기로 열린 시트 닫기
  useEffect(() => {
    if (!assetDetail && !pickerOpen) return
    const handler = (e) => {
      e.preventDefault()
      if (assetDetail) { closeAssetDetail(); return }
      if (pickerOpen) { setPickerOpen(false); return }
    }
    window.addEventListener('appBackButton', handler)
    return () => window.removeEventListener('appBackButton', handler)
  }, [assetDetail, pickerOpen])

  if (!data) return null

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
    <div style={{ animation: 'fadeIn 0.25s ease' }}>
      <style>{`
        .s-arrow { display: inline-block; transition: transform 0.25s cubic-bezier(0.4,0,0.2,1); color: var(--text-faint); font-size: 0.85rem; line-height: 1; }
        .s-collapse { overflow: hidden; transition: max-height 0.32s cubic-bezier(0.4,0,0.2,1); }
      `}</style>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span onClick={e => e.stopPropagation()}>
            <FilterPopup title="금액 가리기"
              trigger={open => (
                <i className={`bi ${hiddenParts === 'all' || hiddenParts.length > 0 ? 'bi-eye-slash' : 'bi-eye'}`}
                  onClick={open}
                  style={{ fontSize: '1.05rem', color: 'var(--text-muted)', cursor: 'pointer' }} />
              )}
              sections={[{
                label: '가릴 항목', type: 'grid',
                options: [['cat', '카테고리별 지출'], ['bar', '월별 추이'], ['asset', '자산 구성'], ['portfolio', '총 자산 추이'], ['cmp', '전월 대비 카테고리']],
                value: hiddenParts, onChange: setHiddenParts,
              }]} />
          </span>
          <span className="s-arrow" style={{ transform: catOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
      </div>
      <div ref={catCollapseRef} className="s-collapse" style={{ maxHeight: catOpen ? (catCollapseRef.current?.scrollHeight || 3000) + 'px' : '0' }}>
        <div className="row mb-4 align-items-stretch">
          {/* 도넛 차트 */}
          <div className="col-md-6 mb-3 mb-md-0">
            <div className="card h-100">
              <div className="card-body d-flex flex-column align-items-center justify-content-center">
                {expData.length > 0 ? (
                  <div style={{ width: '100%' }}>
                    {/* react-chartjs-2는 plugins 배열이 매 렌더마다 새 객체여도 캔버스를
                        다시 그려주지 않는다 — hideCat이 바뀌어도 예전에 그려둔 ●●●●●●
                        가 그대로 남아있던 원인. key를 hideCat에 묶어 토글될 때마다
                        차트를 통째로 다시 만들도록 강제한다. */}
                    <Doughnut
                      key={`cat-${hideCat}`}
                      data={{ labels: expLabels, datasets: [{ data: expData, backgroundColor: PIE_COLORS, hoverOffset: 8 }] }}
                      plugins={[catCenter, shrinkInactivePlugin]}
                      options={{
                        // hoverOffset만큼 조각이 바깥으로 튀어나올 자리를 미리 확보해두지
                        // 않으면, 캔버스가 원래 원 크기에 딱 맞춰져 있어 튀어나온 부분이
                        // 오른쪽/아래쪽 캔버스 경계에서 잘려 보인다.
                        layout: { padding: 10 },
                        // <Doughnut>의 top-level onClick/onHover prop은 react-chartjs-2가
                        // 인식하는 prop이 아니라서 그냥 무시된다 — Chart.js 옵션 안에 직접
                        // 넣어야(onHover) 실제로 호출된다. 이게 이전에 금액 툴팁이 아예
                        // 안 뜨던 진짜 원인이었음(튀어나오기·진하게 표시는 이 옵션과 무관한
                        // Chart.js 내부 처리라 그것만 멀쩡했던 것).
                        // 탭한 위치 근처에 뜨는 방식은 카드/접기 영역 경계에서 계속 잘려서,
                        // 아예 차트 아래 고정된 자리에 표시하는 방식으로 바꿨다 — 어떤
                        // 조각을 눌러도 항상 같은 곳에 뜨니 잘릴 일이 없다.
                        onHover: (event, elements) => {
                          if (!elements.length) { setCatTip(null); return }
                          const idx = elements[0].index
                          const total = expData.reduce((a, b) => a + b, 0)
                          const c = cats[idx]
                          setCatTip({
                            icon: c?.icon || data.emoji_map[expLabels[idx]] || '📦',
                            label: expLabels[idx],
                            color: PIE_COLORS[idx % PIE_COLORS.length],
                            amount: `${fmt(expData[idx])}원 (${(expData[idx] / total * 100).toFixed(1)}%)`,
                          })
                        },
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
                          // 내장 캔버스 툴팁은 우리 가운데 텍스트와 그리기 순서·위치가 계속
                          // 충돌해서(z-order, 정렬 등 여러 방식으로도 근본적으로 안 잡힘)
                          // 아예 끄고, 아래 고정 위치 표시줄로 대신한다.
                          tooltip: { enabled: false },
                        },
                      }}
                    />
                    <div style={{
                      marginTop: 12, minHeight: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '6px 12px', borderRadius: 8, background: catTip ? 'var(--bg-accent)' : 'transparent',
                    }}>
                      {catTip ? (
                        <>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: catTip.color, flexShrink: 0 }} />
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{catTip.icon} {catTip.label}</span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{catTip.amount}</span>
                        </>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-faint)' }}>조각을 탭하면 금액을 확인할 수 있어요</span>
                      )}
                    </div>
                  </div>
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
                              <span className={`amt-mask${hideCat ? ' amt-hidden' : ''}`} style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', width: 90, textAlign: 'right' }}>{fmt(c.amount)}원</span>
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
      </div>

      {/* 월별 지출/수입 추이 */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setBarOpen(o => !o)}>
            <div className="d-flex align-items-center gap-2">
              <h5 className="card-title mb-0">월별 추이</h5>
              {/* 조건부 마운트로 즉시 사라지면 아래 본문의 max-height 트랜지션과
                  타이밍이 어긋나 버튼만 먼저 끊기듯 사라져 보였다 — 항상 렌더링해
                  두고 폭+투명도로 같은 속도(0.32s)에 맞춰 부드럽게 접히게 한다. */}
              <div onClick={e => e.stopPropagation()} style={{ display: 'flex', background: 'var(--bg-section)', borderRadius: 10, padding: barOpen ? 3 : 0, gap: 2, maxWidth: barOpen ? 260 : 0, opacity: barOpen ? 1 : 0, overflow: 'hidden', whiteSpace: 'nowrap', transition: 'max-width 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease, padding 0.32s cubic-bezier(0.4,0,0.2,1)' }}>
                {[['both', '전체'], ['income', '수입'], ['expense', '지출']].map(([mode, label]) => (
                  <button key={mode} onClick={() => setBarMode(mode)}
                    style={{ border: 'none', borderRadius: 7, padding: '3px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                      background: barMode === mode ? (mode === 'expense' ? '#b088f9' : mode === 'income' ? '#34c759' : '#5b8def') : 'transparent',
                      color: barMode === mode ? 'white' : 'var(--text-muted)', transition: 'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <span className="s-arrow" style={{ transform: barOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
          </div>
          <div ref={barCollapseRef} className="s-collapse" style={{ maxHeight: barOpen ? (barCollapseRef.current?.scrollHeight || 3000) + 'px' : '0' }}>
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
            <div>
              {barMode === 'expense' && (
                <select value={cardFilter}
                  onChange={e => setCardFilter(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  style={{ marginTop: 8, maxWidth: 200, width: '100%', padding: '6px 32px 6px 10px', borderRadius: 10, border: `1.5px solid ${cardFilter !== '__all__' ? '#b088f9' : 'var(--border-input)'}`, fontSize: '0.85rem', background: 'var(--input-bg)', color: cardFilter !== '__all__' ? '#b088f9' : 'var(--text-primary)', fontWeight: cardFilter !== '__all__' ? 600 : 400, outline: 'none', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23b088f9' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', boxSizing: 'border-box' }}>
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
                        <div className={`amt-mask${hideBar ? ' amt-hidden' : ''}`} style={{ fontSize: '0.88rem', fontWeight: 700, color }}>{(val / 10000).toFixed(0)}만원</div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      </div>
      {/* 자산 구성 포트폴리오 */}
      {(data.portfolio_breakdown || []).length > 0 && (
        <div className="card mb-4">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setPortfolioOpen(o => !o)}>
              <h5 className="card-title mb-0">자산 구성</h5>
              <span className="s-arrow" style={{ transform: portfolioOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
            </div>
            <div ref={portfolioCollapseRef} className="s-collapse" style={{ maxHeight: portfolioOpen ? (portfolioCollapseRef.current?.scrollHeight || 3000) + 'px' : '0' }}>
            {(() => {
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
                z: -1,
                afterDraw(chart) {
                  const { ctx, chartArea: { width, height, left, top } } = chart
                  const cx = left + width / 2, cy = top + height / 2
                  const isDark = document.documentElement.dataset.theme === 'dark' || window.matchMedia?.('(prefers-color-scheme: dark)').matches
                  ctx.save()
                  ctx.fillStyle = isDark ? '#f0eeff' : '#333'
                  ctx.textAlign = 'center'
                  ctx.textBaseline = 'middle'
                  const netLabel = hidePortfolio ? '●●●●●●' : fmt(netTotal) + '원'
                  // 천단위 콤마로 풀어 쓰면 억/만원 축약 표기보다 훨씬 길어져 도넛
                  // 구멍 밖으로 넘칠 수 있다 — 구멍 크기 대비 실측 너비를 재서
                  // 넘치면 폰트를 줄여 항상 안에 들어오게 맞춘다.
                  let netFontSize = 20
                  ctx.font = `bold ${netFontSize}px sans-serif`
                  const netMaxW = Math.min(width, height) * 0.42
                  const netTextW = ctx.measureText(netLabel).width
                  if (netTextW > netMaxW) {
                    netFontSize = Math.max(11, Math.floor(netFontSize * netMaxW / netTextW))
                    ctx.font = `bold ${netFontSize}px sans-serif`
                  }
                  ctx.fillText(netLabel, cx, cy - 10)
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
                      key={`pf-${hidePortfolio}`}
                      data={{ labels, datasets: [{ data: values, backgroundColor: PF_COLORS, borderWidth: 2, hoverOffset: 8 }] }}
                      plugins={[pfCenter, shrinkInactivePlugin]}
                      options={{
                        layout: { padding: 10 },
                        // <Doughnut>의 top-level onHover prop은 react-chartjs-2가 인식하는
                        // prop이 아니라서 무시된다 — Chart.js 옵션 안에 넣어야 실제로 호출됨.
                        onHover: (event, elements) => {
                          if (!elements.length) { setPfTip(null); return }
                          const idx = elements[0].index
                          setPfTip({
                            label: labels[idx],
                            color: PF_COLORS[idx % PF_COLORS.length],
                            amount: `${fmt(values[idx])}원 (${assetTotal ? (values[idx] / assetTotal * 100).toFixed(1) : 0}%)`,
                          })
                        },
                        plugins: {
                          legend: { display: false },
                          datalabels: {
                            display: context => assetTotal ? context.dataset.data[context.dataIndex] / assetTotal > 0.07 : false,
                            formatter: (_, ctx) => ctx.chart.data.labels[ctx.dataIndex],
                            color: '#fff',
                            font: { weight: 'bold', size: 12 },
                          },
                          // 카테고리별 지출 도넛과 같은 이유로 내장 툴팁은 끄고 아래 고정
                          // 위치 표시줄로 대신한다(탭 위치 근처에 띄우면 카드/접기 영역
                          // 경계에서 계속 잘렸음).
                          tooltip: { enabled: false },
                        }
                      }}
                    />
                    <div style={{
                      marginTop: 12, minHeight: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '6px 12px', borderRadius: 8, background: pfTip ? 'var(--bg-accent)' : 'transparent',
                    }}>
                      {pfTip ? (
                        <>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: pfTip.color, flexShrink: 0 }} />
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{pfTip.label}</span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{pfTip.amount}</span>
                        </>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-faint)' }}>조각을 탭하면 금액을 확인할 수 있어요</span>
                      )}
                    </div>
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
                                  <span className={`amt-mask${hidePortfolio ? ' amt-hidden' : ''}`} style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', width: 90, textAlign: 'right' }}>{fmt(item.value)}원</span>
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
                                      <span className={`amt-mask${hidePortfolio ? ' amt-hidden' : ''}`} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e05555', width: 90, textAlign: 'right' }}>-{fmt(Math.abs(item.value))}원</span>
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
        </div>
      )}

      {/* 총 자산 추이 */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setAssetOpen(o => !o)}>
            <h5 className="card-title mb-0">총 자산 추이</h5>
            <span className="s-arrow" style={{ transform: assetOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
          </div>
          <div ref={assetCollapseRef} className="s-collapse" style={{ maxHeight: assetOpen ? (assetCollapseRef.current?.scrollHeight || 3000) + 'px' : '0' }}>
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
            {(() => {
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
                    <div className={`amt-mask${hideAsset ? ' amt-hidden' : ''}`} style={{ fontSize: '1.1rem', fontWeight: 700, color: '#b088f9' }}>{fmt(latest)}원</div>
                  </div>
                  <div style={{ flex: 1, background: diff >= 0 ? '#f0faf4' : '#fff0f0', borderRadius: 12, padding: '10px 14px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 3 }}>전월 대비</div>
                    <div className={`amt-mask${hideAsset ? ' amt-hidden' : ''}`} style={{ fontSize: '1.1rem', fontWeight: 700, color: diff >= 0 ? '#198754' : '#dc3545' }}>
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
                        }} className={`amt-mask${hideAsset ? ' amt-hidden' : ''}`}>
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
                      <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', flex: 1, padding: '16px 20px 32px' }}>

                        {/* 요약 카드 */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
                          {[
                            { label: '현재 순자산', val: fmt(latest) + '원', color: '#b088f9', bg: 'var(--bg-elevated)' },
                            { label: '전월 대비', val: (diff >= 0 ? '+' : '') + fmt(diff) + '원', color: diff >= 0 ? '#198754' : '#dc3545', bg: diff >= 0 ? '#f0faf4' : '#fff0f0' },
                            { label: '6개월 성장', val: (() => { const first = tData[0]; return first ? (((latest - first) / Math.abs(first)) * 100).toFixed(1) + '%' : '—' })(), color: (latest - tData[0]) >= 0 ? '#198754' : '#dc3545', bg: (latest - tData[0]) >= 0 ? '#f0faf4' : '#fff0f0' },
                          ].map(s => (
                            <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '10px 10px' }}>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 3 }}>{s.label}</div>
                              <div className={`amt-mask${hideAsset ? ' amt-hidden' : ''}`} style={{ fontSize: '0.88rem', fontWeight: 700, color: s.color }}>{s.val}</div>
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
                                      <div className={`amt-mask${hideAsset ? ' amt-hidden' : ''}`} style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{fmt(t.assets)}원</div>
                                    </div>
                                    {chg !== null && (
                                      <div
                                        onClick={bdChanges.length > 0 ? () => setBdOpen(o => ({ ...o, [t.month]: !o[t.month] })) : undefined}
                                        className={`amt-mask${hideAsset ? ' amt-hidden' : ''}`}
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
                                      <span key={c.label} className={`amt-mask${hideAsset ? ' amt-hidden' : ''}`} style={{
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
      </div>

      {/* 전월 대비 카테고리 비교 */}
      {(data.category_compare || []).length > 0 && (() => {
        const allItems = data.category_compare || []
        const selected = cmpSelected ?? new Set(allItems.map(x => x.name))
        const filtered = allItems.filter(x => selected.has(x.name))
        const maxVal = Math.max(...filtered.map(x => Math.max(x.previous, x.current)), 1)
        return (
          <div className="card mb-4">
            <div className="card-body">
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, cursor: 'pointer', userSelect: 'none' }} onClick={() => setCmpOpen(o => !o)}>
                <h5 className="card-title mb-0" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  전월 대비 카테고리
                  <span onClick={e => { e.stopPropagation(); setCmpHelpOpen(o => !o) }}
                    style={{ width: 15, height: 15, borderRadius: '50%', background: 'var(--bg-section)', color: 'var(--text-muted)', fontSize: '0.62rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    ?
                  </span>
                </h5>
                {cmpHelpOpen && (
                  <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '10px 12px', fontSize: '0.75rem', lineHeight: 1.5, color: 'var(--text-secondary)', boxShadow: '0 6px 20px rgba(0,0,0,0.15)', zIndex: 5 }}>
                    카테고리별로 저번 달과 이번 달의 지출(계좌 이체 등 통계 제외 거래는 뺀)을 비교한 값이에요.<br />
                    이번 달 지출에서 저번 달 지출을 뺀 값이 증감(▲/▼)으로 표시돼요.
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
                  <FilterPopup sections={[{
                    label: '카테고리', type: 'grid',
                    options: allItems.map(item => [item.name, `${item.icon} ${item.name}`]),
                    value: cmpSelected === null ? 'all' : Array.from(cmpSelected),
                    onChange: next => setCmpSelected(next === 'all' ? null : new Set(next)),
                  }]} />
                  <span className="s-arrow" onClick={() => setCmpOpen(o => !o)} style={{ transform: cmpOpen ? 'rotate(180deg)' : 'rotate(0deg)', cursor: 'pointer' }}>▼</span>
                </div>
              </div>
              <div ref={cmpCollapseRef} className="s-collapse" style={{ maxHeight: cmpOpen ? (cmpCollapseRef.current?.scrollHeight || 3000) + 'px' : '0' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                {data.prev_month ? `${parseInt(data.prev_month.slice(5))}월 → ${parseInt(month.slice(5))}월 지출 변화` : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {filtered.map(item => {
                  const diff = item.diff
                  const absDiff = Math.abs(diff)
                  const isUp = diff > 0
                  return (
                    <div key={item.name}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{item.icon} {item.name}</span>
                        <span className={`amt-mask${hideCmp ? ' amt-hidden' : ''}`} style={{ fontSize: '0.78rem', fontWeight: 700, color: isUp ? '#dc3545' : '#34c759' }}>
                          {isUp ? '▲' : '▼'} {fmt(absDiff)}원
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 36, fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>전월</span>
                          <div style={{ flex: 1, height: 8, background: 'var(--bg-section)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${(item.previous / maxVal * 100).toFixed(1)}%`, height: '100%', background: 'rgba(176,136,249,0.45)', borderRadius: 4, transition: 'width 0.3s' }} />
                          </div>
                          <span className={`amt-mask${hideCmp ? ' amt-hidden' : ''}`} style={{ width: 64, fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>{fmt(item.previous)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 36, fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>이번</span>
                          <div style={{ flex: 1, height: 8, background: 'var(--bg-section)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${(item.current / maxVal * 100).toFixed(1)}%`, height: '100%', background: isUp ? 'rgba(255,59,48,0.55)' : 'rgba(52,199,89,0.55)', borderRadius: 4, transition: 'width 0.3s' }} />
                          </div>
                          <span className={`amt-mask${hideCmp ? ' amt-hidden' : ''}`} style={{ width: 64, fontSize: '0.72rem', fontWeight: 700, color: isUp ? '#dc3545' : '#34c759', textAlign: 'right', flexShrink: 0 }}>{fmt(item.current)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {filtered.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    카테고리를 선택해 주세요
                  </div>
                )}
              </div>
              </div>
            </div>
          </div>
        )
      })()}

      <div className="d-lg-none" style={{ height: 90 }} />
    </div>
  )
}
