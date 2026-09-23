import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import api from '../api.js'
import CategoryPicker from '../components/CategoryPicker.jsx'
import CardPicker from '../components/CardPicker.jsx'
import { restoreCaretAfterFormat, useLocalStorageState } from '../utils.js'

const fmt = n => Number(n || 0).toLocaleString()

// 다른 탭들과 같은 이유로 — 탭을 나갔다 다시 들어올 때마다 0원·빈 목록으로
// 렌더링됐다가 API 응답이 오면 실제 값으로 훅 뒤바뀌어서 유독 끊기는 느낌을
// 줬다. 마지막으로 받은 값을 모듈 스코프에 캐시해두고 재마운트 시 바로 보여준다.
let _salaryCache = null

const sheetInputStyle = { padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--border-input)', fontSize: '0.9rem', background: 'var(--bg-elevated)', width: '100%', color: 'var(--text-primary)' }

// 예전엔 "+ 추가"/"수정" 버튼을 누르면 페이지 안에 폼이 인라인으로 펼쳐지는
// 방식이었는데, 그러면 키보드가 떠도 화면 하단에 고정되는 장치가 전혀 없어
// 저장 버튼이 화면 위쪽 아무 데나 있을 수 있었다 — 캘린더·예산 탭 시트처럼
// createPortal + dvh 바텀시트로 바꿔서 항상 키보드 바로 위에 붙게 한다.
function FixedExpenseSheet({ open, visible, onClose, onSaved, editItem, categories, cards }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [dayOfMonth, setDayOfMonth] = useState('')
  const [category, setCategory] = useState('')
  const [autoRegister, setAutoRegister] = useState(false)
  const [autoSilent, setAutoSilent] = useState(false)
  const [txType, setTxType] = useState('expense')
  const [txCard, setTxCard] = useState('')

  useEffect(() => {
    if (!open) return
    if (editItem) {
      setName(editItem.name || '')
      setAmount(editItem.amount ?? '')
      setDayOfMonth(editItem.day_of_month ?? '')
      setCategory(editItem.category || '')
      setAutoRegister(editItem.auto_register || false)
      setAutoSilent(editItem.auto_silent || false)
      setTxType(editItem.tx_type || 'expense')
      setTxCard(editItem.tx_card || '')
    } else {
      setName(''); setAmount(''); setDayOfMonth(''); setCategory('')
      setAutoRegister(false); setAutoSilent(false); setTxType('expense'); setTxCard('')
    }
  }, [editItem, open])

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      name, amount: Number(amount) || 0, day_of_month: Number(dayOfMonth) || null,
      category, auto_register: autoRegister, auto_silent: autoSilent, tx_type: txType, tx_card: txCard,
    }
    if (editItem) await api.put(`/api/salary/fixed/${editItem.id}`, payload)
    else await api.post('/api/salary/fixed', payload)
    onSaved(); onClose()
  }

  if (!open) return null
  return createPortal(
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.42)', zIndex: 3000, alignItems: 'center', justifyContent: 'center', padding: '0 20px', opacity: visible ? 1 : 0, transition: 'opacity 0.22s ease' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 20, width: '100%', maxWidth: 420, maxHeight: '80dvh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.22)', padding: '20px 16px 0', transform: visible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(12px)', transition: 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94), max-height 0.2s ease' }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="mb-0 fw-bold">{editItem ? '고정 지출 수정' : '고정 지출 추가'}</h6>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0 4px' }}>&times;</button>
        </div>
        <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', flex: 1, paddingBottom: 20 }}>
          <form id="fixed-expense-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input placeholder="항목명 (예: 월세, 넷플릭스)" value={name}
              onChange={e => setName(e.target.value)} required style={sheetInputStyle} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" placeholder="금액" value={amount}
                onChange={e => setAmount(e.target.value)} required style={{ ...sheetInputStyle, flex: 2 }} />
              <input type="number" placeholder="결제일" value={dayOfMonth}
                onChange={e => setDayOfMonth(e.target.value)} style={{ ...sheetInputStyle, flex: 1 }} />
            </div>
            <CategoryPicker
              cats={categories.map(c => [c.name, c.icon])}
              value={category}
              onChange={setCategory}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={autoRegister} onChange={e => { setAutoRegister(e.target.checked); if (!e.target.checked) setAutoSilent(false) }} />
              지정일에 자동 거래 등록
            </label>
            {autoRegister && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: 9, padding: 2, gap: 2 }}>
                  {[['expense', '지출'], ['income', '수입']].map(([val, label]) => (
                    <button key={val} type="button"
                      onClick={() => setTxType(val)}
                      style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', fontSize: '0.82rem', fontWeight: txType === val ? 700 : 500, cursor: 'pointer', background: txType === val ? 'var(--bg-card)' : 'transparent', color: txType === val ? '#b088f9' : 'var(--text-muted)', boxShadow: txType === val ? '0 1px 4px rgba(0,0,0,0.12)' : 'none', transition: 'all 0.18s' }}>
                      {label}
                    </button>
                  ))}
                </div>
                <CardPicker
                  cards={cards}
                  value={txCard}
                  onChange={setTxCard}
                  placeholder="카드/계좌 선택"
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.83rem', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px 10px', borderRadius: 9, background: autoSilent ? 'rgba(176,136,249,0.1)' : 'var(--bg-elevated)', border: `1.5px solid ${autoSilent ? '#b088f9' : 'var(--border-light)'}` }}>
                  <input type="checkbox" checked={autoSilent} onChange={e => setAutoSilent(e.target.checked)} />
                  <div>
                    <div style={{ fontWeight: 600, color: autoSilent ? '#b088f9' : 'var(--text-primary)' }}>확인 없이 자동 등록</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>팝업 없이 지정일에 자동으로 등록</div>
                  </div>
                </label>
              </div>
            )}
          </form>
        </div>
        <div style={{ padding: '12px 0 16px', flexShrink: 0 }}>
          <div className="d-flex gap-2">
            <button type="submit" form="fixed-expense-form" className="btn flex-fill" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 600 }}>{editItem ? '수정하기' : '추가하기'}</button>
            <button type="button" className="btn btn-outline-secondary flex-fill" onClick={onClose} style={{ borderRadius: 10, padding: '12px 0', fontWeight: 600 }}>취소</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function Salary() {
  const [salary, setSalary] = useState(() => _salaryCache?.salary ?? { amount: 0, pay_day: '' })
  const [allocations, setAllocations] = useState(() => _salaryCache?.allocations ?? [])
  const [fixed, setFixed] = useState(() => _salaryCache?.fixed ?? [])
  const [actual, setActual] = useState(() => _salaryCache?.actual ?? {})
  const [categories, setCategories] = useState(() => _salaryCache?.categories ?? [])
  const [loaded, setLoaded] = useState(!!_salaryCache)
  const [hideAmounts, setHideAmounts] = useLocalStorageState('hide_amounts_salary', false)

  const [salaryEdit, setSalaryEdit] = useState(false)
  const [salaryForm, setSalaryForm] = useState({ amount: '', pay_day: '' })
  const [salaryAmountDisplay, setSalaryAmountDisplay] = useState('')

  const [limitInputs, setLimitInputs] = useState({})
  const [summaryHelpOpen, setSummaryHelpOpen] = useState(null)
  const [fixedSheetOpen, setFixedSheetOpen] = useState(false)
  const [fixedSheetVisible, setFixedSheetVisible] = useState(false)
  const [editFixedItem, setEditFixedItem] = useState(null)
  function openFixedAdd() {
    setEditFixedItem(null)
    setFixedSheetOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setFixedSheetVisible(true)))
  }
  function openFixedEdit(item) {
    setEditFixedItem(item)
    setFixedSheetOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setFixedSheetVisible(true)))
  }
  function closeFixedSheet() {
    setFixedSheetVisible(false)
    setTimeout(() => setFixedSheetOpen(false), 300)
  }
  const [cards, setCards] = useState(() => _salaryCache?.cards ?? [])
  const [wonInputs, setWonInputs] = useState({})
  const [selectedCats, setSelectedCats] = useState([])

  const [dragIdx, setDragIdx] = useState(-1)
  const [dragOverIdx, setDragOverIdx] = useState(-1)
  const [dragY, setDragY] = useState(0)
  const dragActive = useRef(false)
  const dragFrom = useRef(-1)
  const dragOffset = useRef(0)
  const dragContainerRect = useRef(null)
  const catListRef = useRef(null)

  function handleDragStart(e, idx) {
    e.preventDefault()
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const rows = catListRef.current?.querySelectorAll('[data-drag-row]')
    if (rows?.[idx]) dragOffset.current = clientY - rows[idx].getBoundingClientRect().top
    if (catListRef.current) dragContainerRect.current = catListRef.current.getBoundingClientRect()
    dragActive.current = true
    dragFrom.current = idx
    setDragIdx(idx)
    setDragOverIdx(idx)
    setDragY(clientY)
  }

  function handleDragMove(e) {
    if (!dragActive.current) return
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    setDragY(clientY)
    const rows = catListRef.current?.querySelectorAll('[data-drag-row]')
    if (!rows) return
    let toIdx = rows.length - 1
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) { toIdx = i; break }
    }
    setDragOverIdx(toIdx)
  }

  function handleDragEnd() {
    if (!dragActive.current) return
    dragActive.current = false
    const from = dragFrom.current
    const to = dragOverIdx
    if (from >= 0 && to >= 0 && from !== to) {
      setSelectedCats(prev => {
        const next = [...prev]
        const [item] = next.splice(from, 1)
        next.splice(to, 0, item)
        return next
      })
    }
    setDragIdx(-1)
    setDragOverIdx(-1)
    dragFrom.current = -1
  }

  const TAB_ORDER = ['plan', 'fixed', 'compare']
  const [tab, setTab] = useState('plan') // 'plan' | 'fixed' | 'compare'
  const [planEditOpen, setPlanEditOpen] = useState(false)
  const [planEditVisible, setPlanEditVisible] = useState(false)
  function openPlanEdit() {
    setPlanEditOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setPlanEditVisible(true)))
  }
  function closePlanEdit() {
    setPlanEditVisible(false)
    setTimeout(() => setPlanEditOpen(false), 300)
  }
  const tabIdx = TAB_ORDER.indexOf(tab)
  const [compareOnlyPlanned, setCompareOnlyPlanned] = useState(false)

  // 3개 탭을 translateX로 슬라이드하는 구조라 셋 다 같은 flex 행에 나란히 놓여있어,
  // 컨테이너 높이가 가장 긴 탭(주로 "비교") 기준으로 고정돼 짧은 탭을 볼 때 아래에
  // 빈 공간이 크게 남았다 — 지금 보이는 탭의 실제 높이를 재서 컨테이너에 적용한다.
  const planTabRef = useRef(null)
  const fixedTabRef = useRef(null)
  const compareTabRef = useRef(null)
  const [sliderHeight, setSliderHeight] = useState(null)
  useEffect(() => {
    const refs = { plan: planTabRef, fixed: fixedTabRef, compare: compareTabRef }
    const el = refs[tab]?.current
    if (!el) return
    const ro = new ResizeObserver(() => setSliderHeight(el.offsetHeight))
    ro.observe(el)
    setSliderHeight(el.offsetHeight)
    return () => ro.disconnect()
  }, [tab])

  useEffect(() => {
    load()
    api.get('/api/categories').then(d => {
      const expense = d?.expense || []
      setCategories(expense)
      _salaryCache = { ..._salaryCache, categories: expense }
    }).catch(() => {})
    api.get('/api/budget').then(d => {
      const cardStats = d.card_stats || []
      setCards(cardStats)
      _salaryCache = { ..._salaryCache, cards: cardStats }
    }).catch(() => {})
  }, [])

  function load() {
    api.get('/api/salary').then(d => {
      const salaryVal = d.salary || { amount: 0, pay_day: null }
      const fixedVal = d.fixed_expenses || []
      const actualVal = d.actual || {}
      const allocs = d.allocations || []
      setSalary(salaryVal)
      setFixed(fixedVal)
      setActual(actualVal)
      setAllocations(allocs)
      const limits = {}
      allocs.forEach(a => { if (a.monthly_limit) limits[a.category_name] = String(a.monthly_limit) })
      setLimitInputs(prev => ({ ...limits, ...prev }))
      _salaryCache = { ..._salaryCache, salary: salaryVal, fixed: fixedVal, actual: actualVal, allocations: allocs }
      setLoaded(true)
    }).catch(() => {})
  }

  async function saveSalary() {
    await api.put('/api/salary', { amount: Number(salaryForm.amount) || 0, pay_day: Number(salaryForm.pay_day) || null })
    setSalaryEdit(false)
    load()
  }

  async function saveAllocations(newAllocs) {
    await api.put('/api/salary/allocations', newAllocs)
    load()
  }

  function setAllocPercent(catName, val) {
    const pct = Math.max(0, Math.min(100, Number(val) || 0))
    setAllocations(prev => {
      const exists = prev.find(a => a.category_name === catName)
      if (exists) return prev.map(a => a.category_name === catName ? { ...a, percent: pct } : a)
      return [...prev, { category_name: catName, percent: pct }]
    })
  }

  function getAllocPercent(catName) {
    return allocations.find(a => a.category_name === catName)?.percent || 0
  }

  const salaryAmt = salary.amount || 0

  // wonInputs + selectedCats 초기화: allocations가 API에서 로드될 때 한 번만 세팅
  useEffect(() => {
    if (!allocations.length) return
    // percent>0인 것만 "선택됨"으로 치면, 금액을 아직 안 넣은(percent=0) 채로
    // 추가만 해둔 카테고리가 새로고침·탭 이동 후 목록에서 사라져 보였다 — 서버가
    // 갖고 있는 배분 행 자체가 "선택돼 있다"는 뜻이므로 percent 상관없이 포함한다.
    const withBudget = allocations.map(a => a.category_name)
    setSelectedCats(prev => {
      const merged = [...new Set([...prev, ...withBudget])]
      return merged
    })
    setWonInputs(prev => {
      const next = { ...prev }
      allocations.forEach(a => {
        if (next[a.category_name] === undefined) {
          const won = salaryAmt > 0 ? Math.round(salaryAmt * a.percent / 100) : 0
          next[a.category_name] = won > 0 ? won.toLocaleString('ko-KR') : ''
        }
      })
      return next
    })
  }, [allocations]) // eslint-disable-line

  function addCats(catNames) {
    const newNames = catNames.filter(n => !selectedCats.includes(n))
    setSelectedCats(prev => [...prev, ...newNames])
    // 배분 금액을 아직 안 넣은 채로 저장해도 사라지지 않도록, 추가되는 즉시
    // percent 0짜리 배분 행을 만들어둔다(저장 시 이 이름이 payload에 포함돼야
    // 서버가 실제로 카테고리를 계속 "선택된" 상태로 취급한다).
    setAllocations(prev => {
      const existingNames = new Set(prev.map(a => a.category_name))
      const additions = newNames.filter(n => !existingNames.has(n)).map(n => ({ category_name: n, percent: 0 }))
      return [...prev, ...additions]
    })
  }

  async function removeCat(catName) {
    setSelectedCats(prev => prev.filter(n => n !== catName))
    setWonInputs(prev => { const next = { ...prev }; delete next[catName]; return next })
    setLimitInputs(prev => { const next = { ...prev }; delete next[catName]; return next })
    // percent만 0으로 내리면 로컬 allocations엔 행이 그대로 남아있어서, 한도
    // 초과 배너(allocations 기준으로 계산)가 저장·재방문 전까진 안 사라졌다 —
    // 아예 목록에서 빼서 배너가 바로 갱신되게 한다.
    setAllocations(prev => prev.filter(a => a.category_name !== catName))
    // 월 한도는 별도 저장 버튼(saveLimits)에서만 반영되므로, 카테고리 삭제
    // 시점에는 즉시 서버에도 지워서 저장을 안 눌러도 한도가 같이 사라지게 한다.
    await api.post('/api/salary/allocations/limits', { limits: { [catName]: 0 } })
  }

  function handleWonInput(catName, raw, inputEl) {
    const digits = raw.replace(/[^0-9]/g, '')
    const won = parseInt(digits) || 0
    const formatted = won > 0 ? won.toLocaleString('ko-KR') : ''
    restoreCaretAfterFormat(inputEl, formatted)
    setWonInputs(prev => ({ ...prev, [catName]: formatted }))
    const pct = salaryAmt > 0 ? (won / salaryAmt * 100) : 0
    setAllocations(prev => {
      const exists = prev.find(a => a.category_name === catName)
      if (exists) return prev.map(a => a.category_name === catName ? { ...a, percent: pct } : a)
      return [...prev, { category_name: catName, percent: pct }]
    })
  }

  const totalAllocWon = categories.reduce((s, cat) => {
    const raw = wonInputs[cat.name] || ''
    return s + (parseInt(raw.replace(/,/g, '')) || 0)
  }, 0)
  const totalAllocPct = allocations.reduce((s, a) => s + (a.percent || 0), 0)
  const fixedTotal = fixed.reduce((s, f) => s + f.amount, 0)
  const remaining = salaryAmt - fixedTotal - totalAllocWon

  async function saveLimits() {
    const limits = {}
    Object.entries(limitInputs).forEach(([cat, val]) => {
      const n = parseInt((val || '').replace(/,/g, '')) || 0
      if (n > 0) limits[cat] = n
    })
    await api.post('/api/salary/allocations/limits', { limits })
    load()
  }

  async function deleteFixed(id) {
    await api.delete(`/api/salary/fixed/${id}`)
    load()
  }

  const now = new Date()
  const monthLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`

  // 카테고리별 월 한도의 80% 이상 지출된 항목 — 근접/초과 배너용
  const catIconMap = Object.fromEntries((categories || []).map(c => [c[0], c[1]]))
  const nearLimitCats = allocations
    .filter(a => a.monthly_limit)
    .map(a => {
      const spent = actual[a.category_name] || 0
      const ratio = spent / a.monthly_limit
      return { name: a.category_name, spent, limit: a.monthly_limit, ratio }
    })
    .filter(c => c.ratio >= 0.8)
    .sort((a, b) => b.ratio - a.ratio)

  const inputStyle = { padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--border-input)', fontSize: '0.9rem', background: 'var(--bg-elevated)', width: '100%', color: 'var(--text-primary)' }
  const cardStyle = { background: 'var(--bg-card)', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', padding: '18px 16px', marginBottom: 12 }

  if (!loaded) return null

  return (
    <>
    <div style={{ padding: '16px 14px 16px', maxWidth: 540, margin: '0 auto', animation: 'fadeIn 0.25s ease' }}>
      <h5 className="fw-bold mb-3">월급 관리</h5>

      {/* 한도 근접/초과 배너 */}
      {nearLimitCats.length > 0 && (
        <div style={{ ...cardStyle, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {nearLimitCats.map(c => {
            const isOver = c.ratio >= 1
            return (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 10, background: isOver ? 'rgba(255,59,48,0.1)' : 'rgba(255,159,10,0.1)' }}>
                <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{isOver ? '🚨' : '⚠️'}</span>
                <span style={{ fontSize: '0.85rem', color: isOver ? '#dc3545' : '#c07a00', flex: 1 }}>
                  <strong>{catIconMap[c.name] ? `${catIconMap[c.name]} ` : ''}{c.name}</strong>
                  {isOver ? ' 한도를 초과했어요' : ' 한도에 임박했어요'} ({Math.round(c.ratio * 100)}%) — 아껴 써주세요!
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* 월급 설정 카드 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: salaryEdit ? 14 : 0 }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              이번 달 월급
              <i className={`bi ${hideAmounts ? 'bi-eye-slash' : 'bi-eye'}`}
                onClick={() => setHideAmounts(v => !v)}
                style={{ fontSize: '0.95rem', cursor: 'pointer' }} />
            </div>
            <div className={`amt-mask${hideAmounts ? ' amt-hidden' : ''}`} style={{ fontSize: '1.5rem', fontWeight: 800, background: 'linear-gradient(90deg,#b088f9,#7baff0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {fmt(salaryAmt)}원
            </div>
            {salary.pay_day && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>매월 {salary.pay_day}일 지급</div>}
          </div>
          <button onClick={() => { setSalaryForm({ amount: salaryAmt, pay_day: salary.pay_day || '' }); setSalaryAmountDisplay(salaryAmt ? Number(salaryAmt).toLocaleString() : ''); setSalaryEdit(o => !o) }}
            style={{ background: '#f0eaff', border: 'none', borderRadius: 10, padding: '7px 14px', color: '#b088f9', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
            {salaryEdit ? '취소' : '변경'}
          </button>
        </div>
        {salaryEdit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <input type="text" inputMode="numeric" placeholder="월급 금액" value={salaryAmountDisplay}
                onChange={e => {
                  const raw = e.target.value.replace(/,/g, '')
                  if (!/^\d*$/.test(raw)) return
                  setSalaryAmountDisplay(raw ? Number(raw).toLocaleString() : '')
                  setSalaryForm(f => ({ ...f, amount: raw }))
                }} style={{ ...inputStyle, paddingRight: 36 }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85rem', pointerEvents: 'none' }}>원</span>
            </div>
            <div style={{ position: 'relative' }}>
              <input type="number" placeholder="지급일 (예: 25)" value={salaryForm.pay_day}
                onChange={e => setSalaryForm(f => ({ ...f, pay_day: e.target.value }))} style={{ ...inputStyle, paddingRight: 36 }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85rem', pointerEvents: 'none' }}>일</span>
            </div>
            <button onClick={saveSalary}
              style={{ padding: '10px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
              저장
            </button>
          </div>
        )}
        {/* 요약 바 */}
        {salaryAmt > 0 && !salaryEdit && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>고정지출 {fmt(fixedTotal)}원</span>
              <span>예산배분 {fmt(totalAllocWon)}원</span>
              <span style={{ color: remaining >= 0 ? '#34c759' : '#ff3b30', fontWeight: 700 }}>잔여 {fmt(Math.abs(remaining))}원{remaining < 0 ? ' 초과' : ''}</span>
            </div>
            <div style={{ height: 8, background: 'var(--bg-accent)', borderRadius: 8, overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${Math.min(fixedTotal / salaryAmt * 100, 100)}%`, background: '#ff9f0a', borderRadius: '8px 0 0 8px' }} />
              <div style={{ width: `${Math.min(totalAllocWon / salaryAmt * 100, 100 - fixedTotal / salaryAmt * 100)}%`, background: 'linear-gradient(90deg,#b088f9,#7baff0)' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.68rem' }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#ff9f0a', marginRight: 3 }} />고정지출</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#b088f9', marginRight: 3 }} />예산배분</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--border-input)', marginRight: 3 }} />미지정</span>
            </div>
          </div>
        )}
      </div>

      {/* 탭 */}
      <div style={{ position: 'relative', display: 'flex', background: 'var(--bg-accent)', borderRadius: 12, padding: 4, marginBottom: 14 }}>
        <div style={{
          position: 'absolute', top: 4, bottom: 4, left: 4,
          width: 'calc((100% - 8px) / 3)',
          background: 'var(--bg-card)', borderRadius: 9,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          transform: `translateX(${tabIdx * 100}%)`,
          transition: 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94), max-height 0.2s ease',
          pointerEvents: 'none',
        }} />
        {[['plan', '📊 예산 배분'], ['fixed', '📌 고정 지출'], ['compare', '📈 비교']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
              background: 'transparent',
              color: tab === key ? '#b088f9' : 'var(--text-muted)',
              position: 'relative', zIndex: 1 }}>
            {label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 슬라이더 */}
      <div style={{ overflowX: 'clip', height: sliderHeight ? sliderHeight + 'px' : 'auto', transition: 'height 0.28s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', transform: `translateX(${-tabIdx * 100}%)`, transition: 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94), max-height 0.2s ease', willChange: 'transform' }}>

      {/* 예산 배분 탭 */}
      <div ref={planTabRef} style={{ minWidth: '100%', padding: '0 8px', boxSizing: 'border-box' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>카테고리별 예산</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {salaryAmt > 0 && (
                <div style={{ fontSize: '0.75rem', color: totalAllocWon > salaryAmt ? '#ff3b30' : 'var(--text-muted)' }}>
                  {fmt(totalAllocWon)}원 / {fmt(salaryAmt)}원
                </div>
              )}
              {salaryAmt > 0 && (
                <button onClick={openPlanEdit}
                  style={{ background: '#f0eaff', border: 'none', borderRadius: 10, padding: '5px 12px', color: '#b088f9', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                  편집
                </button>
              )}
            </div>
          </div>

          {!salaryAmt && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-faint)', fontSize: '0.85rem' }}>
              먼저 상단에서 월급 금액을 입력해 주세요.
            </div>
          )}

          {salaryAmt > 0 && (
            selectedCats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-faint)', fontSize: '0.85rem' }}>
                편집을 눌러 카테고리를 추가해 주세요.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedCats.map(catName => {
                  const cat = categories.find(c => c.name === catName)
                  if (!cat) return null
                  const wonStr = wonInputs[catName] || ''
                  const won = parseInt((wonStr || '').replace(/,/g, '')) || 0
                  const pct = salaryAmt > 0 ? won / salaryAmt * 100 : 0
                  return (
                    <div key={catName}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{cat.icon} {cat.name}</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(won)}원</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--bg-accent)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: pct > 100 ? '#ff3b30' : 'linear-gradient(90deg,#b088f9,#7baff0)', borderRadius: 4 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>
      </div>

      {/* 고정 지출 탭 */}
      <div ref={fixedTabRef} style={{ minWidth: '100%', padding: '0 8px', boxSizing: 'border-box' }}>
        <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>고정 지출 <span style={{ color: '#b088f9' }}>{fmt(fixedTotal)}원</span></div>
              <button onClick={openFixedAdd}
                style={{ background: '#f0eaff', border: 'none', borderRadius: 10, padding: '7px 14px', color: '#b088f9', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                + 추가
              </button>
            </div>

            {fixed.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '24px 0', fontSize: '0.88rem' }}>등록된 고정 지출이 없습니다</div>
            )}

            {fixed.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{f.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {f.category && <span style={{ marginRight: 8 }}>{f.category}</span>}
                    {f.day_of_month && <span style={{ marginRight: 6 }}>매월 {f.day_of_month}일</span>}
                    {f.item_type === 'savings'
                      ? <span style={{ fontSize: '0.68rem', background: '#e8fdf0', color: '#198754', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>{f.stype} 자동이체</span>
                      : f.auto_register && (
                        <>
                          <span style={{ fontSize: '0.68rem', background: '#e8f4fd', color: '#0d6efd', borderRadius: 6, padding: '1px 6px', fontWeight: 700, marginRight: 4 }}>자동등록</span>
                          {f.auto_silent && <span style={{ fontSize: '0.68rem', background: 'rgba(176,136,249,0.12)', color: '#b088f9', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>자동</span>}
                        </>
                      )}
                  </div>
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginRight: 8 }}>{fmt(f.amount)}원</div>
                {f.item_type !== 'savings' && <>
                  <button onClick={() => openFixedEdit(f)}
                    style={{ background: '#f0eaff', border: 'none', borderRadius: 8, padding: '5px 10px', color: '#b088f9', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>수정</button>
                  <button onClick={() => deleteFixed(f.id)}
                    style={{ background: '#fff0f0', border: 'none', borderRadius: 8, padding: '5px 10px', color: '#ff3b30', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>삭제</button>
                </>}
              </div>
            ))}
          </div>
      </div>

      {/* 실적 비교 탭 */}
      <div ref={compareTabRef} style={{ minWidth: '100%', padding: '0 8px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{monthLabel} 실제 지출 vs 계획</div>
            <div style={{ position: 'relative', display: 'flex', background: '#f0eaff', borderRadius: 16, padding: 2 }}>
              <div style={{
                position: 'absolute', top: 2, bottom: 2, left: 2,
                width: 'calc((100% - 4px) / 2)',
                background: 'linear-gradient(135deg,#b088f9,#7baff0)',
                borderRadius: 14,
                transform: `translateX(${compareOnlyPlanned ? 100 : 0}%)`,
                transition: 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94), max-height 0.2s ease',
                pointerEvents: 'none',
              }} />
              {[['전체', false], ['계획만', true]].map(([label, val]) => (
                <button key={label} onClick={() => setCompareOnlyPlanned(val)}
                  style={{
                    padding: '4px 10px', borderRadius: 14, border: 'none', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
                    background: 'transparent',
                    color: compareOnlyPlanned === val ? 'white' : '#b088f9',
                    position: 'relative', zIndex: 1,
                    transition: 'color 0.28s',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 고정 지출 비교 */}
          {fixed.length > 0 && (
            <div style={cardStyle}>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 12, color: 'var(--text-secondary)' }}>📌 고정 지출</div>
              {fixed.map(f => {
                const actualAmt = actual[f.category] || 0
                return (
                  <div key={f.id} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{f.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>계획 {fmt(f.amount)}원</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--bg-accent)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                      <div style={{ position: 'absolute', height: '100%', width: '100%', background: 'var(--border-input)', borderRadius: 6 }} />
                      <div style={{ position: 'absolute', height: '100%', width: `${Math.min(f.amount > 0 ? f.amount / f.amount * 100 : 0, 100)}%`, background: 'linear-gradient(90deg,#b088f9,#7baff0)', borderRadius: 6 }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.72rem', marginTop: 3, color: '#b088f9' }}>계획: {fmt(f.amount)}원</div>
                  </div>
                )
              })}
            </div>
          )}

          {/* 카테고리별 비교 */}
          <div style={cardStyle}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 12, color: 'var(--text-secondary)', textAlign: 'center' }}>📊 카테고리별 예산 vs 실제</div>
            {allocations.filter(a => a.percent > 0).length === 0 && Object.keys(actual).length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '20px 0', fontSize: '0.88rem' }}>예산 배분을 먼저 설정해주세요</div>
            )}
            {categories.filter(cat => compareOnlyPlanned
                ? selectedCats.includes(cat.name)
                : getAllocPercent(cat.name) > 0 || actual[cat.name] > 0
              ).map(cat => {
              const pct = getAllocPercent(cat.name)
              const planned = salaryAmt ? Math.round(salaryAmt * pct / 100) : 0
              const actualAmt = actual[cat.name] || 0
              const ratio = planned > 0 ? Math.min(actualAmt / planned * 100, 100) : 0
              const over = actualAmt > planned && planned > 0
              return (
                <div key={cat.id} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{cat.icon} {cat.name}</span>
                    <div style={{ display: 'flex', gap: 8, fontSize: '0.75rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>계획 {fmt(planned)}원</span>
                      <span style={{ fontWeight: 700, color: over ? '#ff3b30' : 'var(--text-primary)' }}>실제 {fmt(actualAmt)}원</span>
                    </div>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-accent)', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${ratio}%`, background: over ? 'linear-gradient(90deg,#ff6b6b,#ff3b30)' : 'linear-gradient(90deg,#b088f9,#7baff0)', borderRadius: 6, transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginTop: 3, color: over ? '#ff3b30' : 'var(--text-muted)' }}>
                    <span>{ratio.toFixed(0)}% 사용</span>
                    {over && <span>⚠ {fmt(actualAmt - planned)}원 초과</span>}
                    {!over && planned > 0 && <span>{fmt(planned - actualAmt)}원 남음</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 전체 요약 */}
          {salaryAmt > 0 && (
            <div style={{ ...cardStyle, background: 'var(--bg-elevated)' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 12, color: 'var(--text-secondary)' }}>💰 {monthLabel} 요약</div>
              {(() => {
                const plannedFixed = fixedTotal
                const plannedVariable = salaryAmt * totalAllocPct / 100
                const actualTx = Object.values(actual).reduce((s, v) => s + v, 0)
                return [
                  { label: '월급', value: salaryAmt, color: '#34c759' },
                  { label: '고정 지출 계획', value: -plannedFixed, color: '#ff9f0a' },
                  { label: '변동 지출 계획', value: -plannedVariable, color: '#b088f9' },
                  {
                    label: '실제 지출 합계', value: -(actualTx + plannedFixed + plannedVariable), color: '#ff3b30',
                    help: `이번 달 실제 거래액(${fmt(actualTx)}원) + 고정 지출 계획(${fmt(plannedFixed)}원) + 변동 지출 계획(${fmt(plannedVariable)}원)을 더한 값이에요.`,
                  },
                ]
              })().map(({ label, value, color, help }) => (
                <div key={label} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(176,136,249,0.1)' }}>
                  <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {label}
                    {help && (
                      <span onClick={() => setSummaryHelpOpen(o => o === label ? null : label)}
                        style={{ width: 15, height: 15, borderRadius: '50%', background: 'var(--bg-section)', color: 'var(--text-muted)', fontSize: '0.62rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                        ?
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color }}>{value >= 0 ? '+' : ''}{fmt(value)}원</span>
                  {help && summaryHelpOpen === label && (
                    // 이 항목이 목록 맨 아래라 밑으로 펼치면 화면 밖(하단 탭바 등)으로
                    // 밀려나가 글자가 잘려 보였다 — 위로 펼치도록 변경
                    <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4, background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '10px 12px', fontSize: '0.75rem', lineHeight: 1.5, color: 'var(--text-secondary)', boxShadow: '0 6px 20px rgba(0,0,0,0.15)', zIndex: 5 }}>
                      {help}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
      </div>
        </div>
      </div>
    </div>

    <FixedExpenseSheet open={fixedSheetOpen} visible={fixedSheetVisible} onClose={closeFixedSheet}
      onSaved={load} editItem={editFixedItem} categories={categories} cards={cards} />

    {planEditOpen && createPortal(
      <div onClick={e => e.target === e.currentTarget && closePlanEdit()}
        style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.42)', zIndex: 3000, alignItems: 'center', justifyContent: 'center', padding: '0 20px', opacity: planEditVisible ? 1 : 0, transition: 'opacity 0.22s ease' }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: 20, width: '100%', maxWidth: 420, maxHeight: '80dvh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.22)', transform: planEditVisible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(12px)', transition: 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94), max-height 0.2s ease' }}>
          <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span className="fw-bold" style={{ fontSize: '1rem' }}>카테고리별 예산 편집</span>
            <button onClick={closePlanEdit} style={{ background: 'var(--bg-section)', border: 'none', width: 28, height: 28, borderRadius: 14, fontSize: '1.05rem', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
          </div>
          <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '16px 20px', flex: 1 }}>
            <div
              ref={catListRef}
              onMouseMove={handleDragMove} onMouseUp={handleDragEnd} onMouseLeave={handleDragEnd}
              onTouchMove={handleDragMove} onTouchEnd={handleDragEnd}
              style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: selectedCats.length ? 14 : 0 }}
            >
              {selectedCats.map((catName, i) => {
                const cat = categories.find(c => c.name === catName)
                if (!cat) return null
                const wonStr = wonInputs[catName] || ''
                const won = parseInt((wonStr || '').replace(/,/g, '')) || 0
                const pct = salaryAmt > 0 ? won / salaryAmt * 100 : 0
                const isDragging = dragIdx === i
                const showLineAbove = dragIdx >= 0 && dragOverIdx === i && dragFrom.current > i
                const showLineBelow = dragIdx >= 0 && dragOverIdx === i && dragFrom.current < i
                return (
                  <div key={catName}>
                    {showLineAbove && <div style={{ height: 2, background: '#b088f9', borderRadius: 2, margin: '2px 0' }} />}
                    <div data-drag-row style={{ opacity: isDragging ? 0 : 1, transition: 'opacity 0.1s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span
                            onMouseDown={e => handleDragStart(e, i)}
                            onTouchStart={e => handleDragStart(e, i)}
                            style={{ cursor: 'grab', color: 'var(--text-faint)', fontSize: '1.05rem', padding: '0 4px', touchAction: 'none', userSelect: 'none', lineHeight: 1 }}>⠿</span>
                          <button onClick={() => removeCat(catName)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: '1rem', lineHeight: 1, padding: '0 2px', cursor: 'pointer' }}>×</button>
                          <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{cat.icon} {cat.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {won > 0 && salaryAmt > 0 && (
                            <span style={{ fontSize: '0.75rem', color: '#b088f9', fontWeight: 600, whiteSpace: 'nowrap' }}>{pct.toFixed(1)}%</span>
                          )}
                          <div style={{ position: 'relative', width: 120 }}>
                            <input type="text" inputMode="numeric" value={wonStr} placeholder="0"
                              onChange={e => handleWonInput(catName, e.target.value, e.target)}
                              style={{ width: '100%', padding: '5px 28px 5px 10px', borderRadius: 8, border: '1.5px solid var(--border-input)', fontSize: '0.88rem', textAlign: 'right', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }} />
                            <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', fontSize: '0.78rem', pointerEvents: 'none' }}>원</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ height: 4, background: 'var(--bg-accent)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: pct > 100 ? '#ff3b30' : 'linear-gradient(90deg,#b088f9,#7baff0)', borderRadius: 4, transition: 'width 0.2s' }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>월 한도</span>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input type="text" inputMode="numeric"
                            value={limitInputs[catName] ? Number(limitInputs[catName]).toLocaleString('ko-KR') : ''}
                            placeholder="없음"
                            onChange={e => {
                              const digits = e.target.value.replace(/[^0-9]/g, '')
                              restoreCaretAfterFormat(e.target, digits ? Number(digits).toLocaleString('ko-KR') : '')
                              setLimitInputs(prev => ({ ...prev, [catName]: digits }))
                            }}
                            style={{ width: '100%', padding: '3px 26px 3px 8px', borderRadius: 7, border: '1.5px solid var(--border-light)', fontSize: '0.78rem', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }} />
                          <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', fontSize: '0.68rem', pointerEvents: 'none' }}>원</span>
                        </div>
                      </div>
                    </div>
                    {showLineBelow && <div style={{ height: 2, background: '#b088f9', borderRadius: 2, margin: '2px 0' }} />}
                  </div>
                )
              })}
            </div>

            {categories.filter(c => !selectedCats.includes(c.name)).length > 0 && (
              <CategoryPicker
                cats={categories.filter(c => !selectedCats.includes(c.name)).map(c => [c.name, c.icon])}
                multi
                onSave={addCats}
                placeholder="+ 카테고리 추가"
              />
            )}
          </div>
          <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--border-light)', flexShrink: 0 }}>
            <button onClick={async () => { await saveAllocations(allocations); await saveLimits(); closePlanEdit() }}
              style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
              저장
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {dragIdx >= 0 && dragContainerRect.current && createPortal(
      <div style={{ position: 'fixed', top: dragY - dragOffset.current, left: dragContainerRect.current.left, width: dragContainerRect.current.width, zIndex: 9999, pointerEvents: 'none', padding: '0 2px' }}>
        {(() => {
          const catName = selectedCats[dragIdx]
          const cat = categories.find(c => c.name === catName)
          if (!cat) return null
          const wonStr = wonInputs[catName] || ''
          const won = parseInt((wonStr || '').replace(/,/g, '')) || 0
          const pct = salaryAmt > 0 ? won / salaryAmt * 100 : 0
          return (
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, boxShadow: '0 8px 28px rgba(176,136,249,0.28)', border: '2px solid #b088f9', padding: '8px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: '#b088f9', fontSize: '1.05rem', padding: '0 4px' }}>⠿</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{cat.icon} {cat.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {won > 0 && salaryAmt > 0 && <span style={{ fontSize: '0.75rem', color: '#b088f9', fontWeight: 600 }}>{pct.toFixed(1)}%</span>}
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{wonStr || '0'}원</span>
                </div>
              </div>
              <div style={{ height: 4, background: '#f0eaff', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: 'linear-gradient(90deg,#b088f9,#7baff0)', borderRadius: 4 }} />
              </div>
            </div>
          )
        })()}
      </div>,
      document.body
    )}
    </>
  )
}
