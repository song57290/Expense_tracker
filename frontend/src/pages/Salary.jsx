import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import api from '../api.js'

const fmt = n => Number(n || 0).toLocaleString()

export default function Salary() {
  const [salary, setSalary] = useState({ amount: 0, pay_day: '' })
  const [allocations, setAllocations] = useState([])
  const [fixed, setFixed] = useState([])
  const [actual, setActual] = useState({})
  const [categories, setCategories] = useState([])

  const [salaryEdit, setSalaryEdit] = useState(false)
  const [salaryForm, setSalaryForm] = useState({ amount: '', pay_day: '' })
  const [salaryAmountDisplay, setSalaryAmountDisplay] = useState('')

  const [fixedForm, setFixedForm] = useState({ name: '', amount: '', day_of_month: '', category: '', auto_register: false, tx_type: 'expense', tx_card: '' })
  const [fixedFormOpen, setFixedFormOpen] = useState(false)
  const [editFixed, setEditFixed] = useState(null)
  const [editFixedForm, setEditFixedForm] = useState({})
  const [cards, setCards] = useState([])
  const [wonInputs, setWonInputs] = useState({})
  const [selectedCats, setSelectedCats] = useState([])
  const [catPickerOpen, setCatPickerOpen] = useState(false)

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
  const tabIdx = TAB_ORDER.indexOf(tab)
  const [compareOnlyPlanned, setCompareOnlyPlanned] = useState(false)

  useEffect(() => {
    load()
    api.get('/api/categories').then(d => setCategories(d?.expense || [])).catch(() => {})
    api.get('/api/budget').then(d => setCards(d.card_stats || [])).catch(() => {})
  }, [])

  function load() {
    api.get('/api/salary').then(d => {
      setSalary(d.salary || { amount: 0, pay_day: null })
      setFixed(d.fixed_expenses || [])
      setActual(d.actual || {})
      const allocs = d.allocations || []
      setAllocations(allocs)
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
    const withBudget = allocations.filter(a => a.percent > 0).map(a => a.category_name)
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

  function addCat(catName) {
    setSelectedCats(prev => prev.includes(catName) ? prev : [...prev, catName])
    setCatPickerOpen(false)
  }

  function removeCat(catName) {
    setSelectedCats(prev => prev.filter(n => n !== catName))
    setWonInputs(prev => { const next = { ...prev }; delete next[catName]; return next })
    setAllocations(prev => prev.map(a => a.category_name === catName ? { ...a, percent: 0 } : a))
  }

  function handleWonInput(catName, raw) {
    const digits = raw.replace(/[^0-9]/g, '')
    const won = parseInt(digits) || 0
    setWonInputs(prev => ({ ...prev, [catName]: won > 0 ? won.toLocaleString('ko-KR') : '' }))
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

  async function addFixed(e) {
    e.preventDefault()
    await api.post('/api/salary/fixed', {
      name: fixedForm.name,
      amount: Number(fixedForm.amount) || 0,
      day_of_month: Number(fixedForm.day_of_month) || null,
      category: fixedForm.category,
      auto_register: fixedForm.auto_register,
      tx_type: fixedForm.tx_type,
      tx_card: fixedForm.tx_card,
    })
    setFixedForm({ name: '', amount: '', day_of_month: '', category: '', auto_register: false, tx_type: 'expense', tx_card: '' })
    setFixedFormOpen(false)
    load()
  }

  async function deleteFixed(id) {
    await api.delete(`/api/salary/fixed/${id}`)
    load()
  }

  async function saveEditFixed() {
    await api.put(`/api/salary/fixed/${editFixed}`, {
      name: editFixedForm.name,
      amount: Number(editFixedForm.amount) || 0,
      day_of_month: Number(editFixedForm.day_of_month) || null,
      category: editFixedForm.category,
      auto_register: editFixedForm.auto_register,
      tx_type: editFixedForm.tx_type || 'expense',
      tx_card: editFixedForm.tx_card || '',
    })
    setEditFixed(null)
    load()
  }

  const now = new Date()
  const monthLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`

  const inputStyle = { padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e8e0f8', fontSize: '0.9rem', background: '#faf8ff', width: '100%' }
  const cardStyle = { background: 'white', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', padding: '18px 16px', marginBottom: 12 }

  return (
    <>
    <div style={{ padding: '16px 14px 100px', maxWidth: 540, margin: '0 auto' }}>
      <h5 className="fw-bold mb-3">월급 관리</h5>

      {/* 월급 설정 카드 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: salaryEdit ? 14 : 0 }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: 2 }}>이번 달 월급</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, background: 'linear-gradient(90deg,#b088f9,#7baff0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {fmt(salaryAmt)}원
            </div>
            {salary.pay_day && <div style={{ fontSize: '0.75rem', color: '#bbb', marginTop: 2 }}>매월 {salary.pay_day}일 지급</div>}
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
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#bbb', fontSize: '0.85rem', pointerEvents: 'none' }}>원</span>
            </div>
            <div style={{ position: 'relative' }}>
              <input type="number" placeholder="지급일 (예: 25)" value={salaryForm.pay_day}
                onChange={e => setSalaryForm(f => ({ ...f, pay_day: e.target.value }))} style={{ ...inputStyle, paddingRight: 36 }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#bbb', fontSize: '0.85rem', pointerEvents: 'none' }}>일</span>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#aaa', marginBottom: 4 }}>
              <span>고정지출 {fmt(fixedTotal)}원</span>
              <span>예산배분 {fmt(totalAllocWon)}원</span>
              <span style={{ color: remaining >= 0 ? '#34c759' : '#ff3b30', fontWeight: 700 }}>잔여 {fmt(Math.abs(remaining))}원{remaining < 0 ? ' 초과' : ''}</span>
            </div>
            <div style={{ height: 8, background: '#f0eaff', borderRadius: 8, overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${Math.min(fixedTotal / salaryAmt * 100, 100)}%`, background: '#ff9f0a', borderRadius: '8px 0 0 8px' }} />
              <div style={{ width: `${Math.min(totalAllocWon / salaryAmt * 100, 100 - fixedTotal / salaryAmt * 100)}%`, background: 'linear-gradient(90deg,#b088f9,#7baff0)' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.68rem' }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#ff9f0a', marginRight: 3 }} />고정지출</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#b088f9', marginRight: 3 }} />예산배분</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#e8e0f8', marginRight: 3 }} />미지정</span>
            </div>
          </div>
        )}
      </div>

      {/* 탭 */}
      <div style={{ position: 'relative', display: 'flex', background: '#f0eaff', borderRadius: 12, padding: 4, marginBottom: 14 }}>
        <div style={{
          position: 'absolute', top: 4, bottom: 4, left: 4,
          width: 'calc((100% - 8px) / 3)',
          background: 'white', borderRadius: 9,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          transform: `translateX(${tabIdx * 100}%)`,
          transition: 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)',
          pointerEvents: 'none',
        }} />
        {[['plan', '📊 예산 배분'], ['fixed', '📌 고정 지출'], ['compare', '📈 비교']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
              background: 'transparent',
              color: tab === key ? '#b088f9' : '#9b8ec0',
              position: 'relative', zIndex: 1 }}>
            {label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 슬라이더 */}
      <div style={{ overflowX: 'clip' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', transform: `translateX(${-tabIdx * 100}%)`, transition: 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)', willChange: 'transform' }}>

      {/* 예산 배분 탭 */}
      <div style={{ minWidth: '100%', padding: '0 8px', boxSizing: 'border-box' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>카테고리별 예산</div>
            {salaryAmt > 0 && (
              <div style={{ fontSize: '0.75rem', color: totalAllocWon > salaryAmt ? '#ff3b30' : '#aaa' }}>
                {fmt(totalAllocWon)}원 / {fmt(salaryAmt)}원
              </div>
            )}
          </div>

          {!salaryAmt && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#bbb', fontSize: '0.85rem' }}>
              먼저 상단에서 월급 금액을 입력해 주세요.
            </div>
          )}

          {salaryAmt > 0 && (
            <>
              {/* 선택된 카테고리 목록 */}
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
                              style={{ cursor: 'grab', color: '#ccc', fontSize: '1.05rem', padding: '0 4px', touchAction: 'none', userSelect: 'none', lineHeight: 1 }}>⠿</span>
                            <button onClick={() => removeCat(catName)}
                              style={{ background: 'none', border: 'none', color: '#ccc', fontSize: '1rem', lineHeight: 1, padding: '0 2px', cursor: 'pointer' }}>×</button>
                            <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{cat.icon} {cat.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {won > 0 && salaryAmt > 0 && (
                              <span style={{ fontSize: '0.75rem', color: '#b088f9', fontWeight: 600, whiteSpace: 'nowrap' }}>{pct.toFixed(1)}%</span>
                            )}
                            <div style={{ position: 'relative', width: 120 }}>
                              <input type="text" inputMode="numeric" value={wonStr} placeholder="0"
                                onChange={e => handleWonInput(catName, e.target.value)}
                                style={{ width: '100%', padding: '5px 28px 5px 10px', borderRadius: 8, border: '1.5px solid #e8e0f8', fontSize: '0.88rem', textAlign: 'right', background: '#faf8ff' }} />
                              <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.78rem', pointerEvents: 'none' }}>원</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ height: 4, background: '#f0eaff', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: pct > 100 ? '#ff3b30' : 'linear-gradient(90deg,#b088f9,#7baff0)', borderRadius: 4, transition: 'width 0.2s' }} />
                        </div>
                      </div>
                      {showLineBelow && <div style={{ height: 2, background: '#b088f9', borderRadius: 2, margin: '2px 0' }} />}
                    </div>
                  )
                })}
              </div>

              {/* 카테고리 추가 버튼 */}
              {categories.filter(c => !selectedCats.includes(c.name)).length > 0 && (
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setCatPickerOpen(o => !o)}
                    style={{ width: '100%', padding: '9px', borderRadius: 10, border: '1.5px dashed #d8c8f8', background: 'white', color: '#b088f9', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                    + 카테고리 추가
                  </button>
                  {catPickerOpen && (
                    <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: 'white', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', padding: 12, zIndex: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {categories.filter(c => !selectedCats.includes(c.name)).map(cat => (
                        <button key={cat.id} onClick={() => addCat(cat.name)}
                          style={{ padding: '6px 12px', borderRadius: 20, border: '1.5px solid #e8e0f8', background: '#faf8ff', color: '#555', fontSize: '0.85rem', cursor: 'pointer' }}>
                          {cat.icon} {cat.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedCats.length > 0 && (
                <button onClick={() => saveAllocations(allocations)}
                  style={{ width: '100%', marginTop: 14, padding: '11px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
                  저장
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 고정 지출 탭 */}
      <div style={{ minWidth: '100%', padding: '0 8px', boxSizing: 'border-box' }}>
        <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>고정 지출 <span style={{ color: '#b088f9' }}>{fmt(fixedTotal)}원</span></div>
              <button onClick={() => setFixedFormOpen(o => !o)}
                style={{ background: '#f0eaff', border: 'none', borderRadius: 10, padding: '7px 14px', color: '#b088f9', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                + 추가
              </button>
            </div>

            {fixedFormOpen && (
              <form onSubmit={addFixed} style={{ background: '#faf8ff', borderRadius: 12, padding: 14, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input placeholder="항목명 (예: 월세, 넷플릭스)" value={fixedForm.name}
                  onChange={e => setFixedForm(f => ({ ...f, name: e.target.value }))} required style={inputStyle} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" placeholder="금액" value={fixedForm.amount}
                    onChange={e => setFixedForm(f => ({ ...f, amount: e.target.value }))} required style={{ ...inputStyle, flex: 2 }} />
                  <input type="number" placeholder="결제일" value={fixedForm.day_of_month}
                    onChange={e => setFixedForm(f => ({ ...f, day_of_month: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                </div>
                <select value={fixedForm.category} onChange={e => setFixedForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                  <option value="">카테고리 선택</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#555', cursor: 'pointer' }}>
                  <input type="checkbox" checked={fixedForm.auto_register} onChange={e => setFixedForm(f => ({ ...f, auto_register: e.target.checked }))} />
                  지정일에 자동 거래 등록
                </label>
                {fixedForm.auto_register && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select value={fixedForm.tx_type} onChange={e => setFixedForm(f => ({ ...f, tx_type: e.target.value }))} style={{ ...inputStyle, flex: 1 }}>
                      <option value="expense">지출</option>
                      <option value="income">수입</option>
                    </select>
                    <select value={fixedForm.tx_card} onChange={e => setFixedForm(f => ({ ...f, tx_card: e.target.value }))} style={{ ...inputStyle, flex: 2 }}>
                      <option value="">카드/계좌 선택</option>
                      {cards.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" style={{ flex: 1, padding: '9px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>저장</button>
                  <button type="button" onClick={() => setFixedFormOpen(false)} style={{ padding: '9px 16px', borderRadius: 10, border: '1.5px solid #e8e0f8', background: 'white', color: '#aaa', fontWeight: 600, cursor: 'pointer' }}>취소</button>
                </div>
              </form>
            )}

            {fixed.length === 0 && !fixedFormOpen && (
              <div style={{ textAlign: 'center', color: '#ccc', padding: '24px 0', fontSize: '0.88rem' }}>등록된 고정 지출이 없습니다</div>
            )}

            {fixed.map(f => (
              <div key={f.id}>
                {editFixed === f.id ? (
                  <div style={{ background: '#faf8ff', borderRadius: 12, padding: 12, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input placeholder="항목명" value={editFixedForm.name}
                      onChange={e => setEditFixedForm(x => ({ ...x, name: e.target.value }))} style={inputStyle} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" placeholder="금액" value={editFixedForm.amount}
                        onChange={e => setEditFixedForm(x => ({ ...x, amount: e.target.value }))} style={{ ...inputStyle, flex: 2 }} />
                      <input type="number" placeholder="결제일" value={editFixedForm.day_of_month || ''}
                        onChange={e => setEditFixedForm(x => ({ ...x, day_of_month: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                    </div>
                    <select value={editFixedForm.category || ''} onChange={e => setEditFixedForm(x => ({ ...x, category: e.target.value }))} style={inputStyle}>
                      <option value="">카테고리 선택</option>
                      {categories.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#555', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!editFixedForm.auto_register} onChange={e => setEditFixedForm(x => ({ ...x, auto_register: e.target.checked }))} />
                      지정일에 자동 거래 등록
                    </label>
                    {editFixedForm.auto_register && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <select value={editFixedForm.tx_type || 'expense'} onChange={e => setEditFixedForm(x => ({ ...x, tx_type: e.target.value }))} style={{ ...inputStyle, flex: 1 }}>
                          <option value="expense">지출</option>
                          <option value="income">수입</option>
                        </select>
                        <select value={editFixedForm.tx_card || ''} onChange={e => setEditFixedForm(x => ({ ...x, tx_card: e.target.value }))} style={{ ...inputStyle, flex: 2 }}>
                          <option value="">카드/계좌 선택</option>
                          {cards.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={saveEditFixed} style={{ flex: 1, padding: '8px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>저장</button>
                      <button onClick={() => setEditFixed(null)} style={{ padding: '8px 14px', borderRadius: 10, border: '1.5px solid #e8e0f8', background: 'white', color: '#aaa', cursor: 'pointer' }}>취소</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid #f5f0ff' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{f.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: 2 }}>
                        {f.category && <span style={{ marginRight: 8 }}>{f.category}</span>}
                        {f.day_of_month && <span style={{ marginRight: 6 }}>매월 {f.day_of_month}일</span>}
                        {f.item_type === 'savings'
                          ? <span style={{ fontSize: '0.68rem', background: '#e8fdf0', color: '#198754', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>{f.stype} 자동이체</span>
                          : f.auto_register && <span style={{ fontSize: '0.68rem', background: '#e8f4fd', color: '#0d6efd', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>자동등록</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#333', marginRight: 8 }}>{fmt(f.amount)}원</div>
                    {f.item_type !== 'savings' && <>
                      <button onClick={() => { setEditFixed(f.id); setEditFixedForm({ name: f.name, amount: f.amount, day_of_month: f.day_of_month, category: f.category, auto_register: f.auto_register, tx_type: f.tx_type || 'expense', tx_card: f.tx_card || '' }) }}
                        style={{ background: '#f0eaff', border: 'none', borderRadius: 8, padding: '5px 10px', color: '#b088f9', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>수정</button>
                      <button onClick={() => deleteFixed(f.id)}
                        style={{ background: '#fff0f0', border: 'none', borderRadius: 8, padding: '5px 10px', color: '#ff3b30', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>삭제</button>
                    </>}
                  </div>
                )}
              </div>
            ))}
          </div>
      </div>

      {/* 실적 비교 탭 */}
      <div style={{ minWidth: '100%', padding: '0 8px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: '0.78rem', color: '#aaa' }}>{monthLabel} 실제 지출 vs 계획</div>
            <div style={{ position: 'relative', display: 'flex', background: '#f0eaff', borderRadius: 16, padding: 2 }}>
              <div style={{
                position: 'absolute', top: 2, bottom: 2, left: 2,
                width: 'calc((100% - 4px) / 2)',
                background: 'linear-gradient(135deg,#b088f9,#7baff0)',
                borderRadius: 14,
                transform: `translateX(${compareOnlyPlanned ? 100 : 0}%)`,
                transition: 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)',
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
              <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 12, color: '#555' }}>📌 고정 지출</div>
              {fixed.map(f => {
                const actualAmt = actual[f.category] || 0
                return (
                  <div key={f.id} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{f.name}</span>
                      <span style={{ fontSize: '0.75rem', color: '#aaa' }}>계획 {fmt(f.amount)}원</span>
                    </div>
                    <div style={{ height: 8, background: '#f0eaff', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                      <div style={{ position: 'absolute', height: '100%', width: '100%', background: '#e8e0f8', borderRadius: 6 }} />
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
            <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 12, color: '#555', textAlign: 'center' }}>📊 카테고리별 예산 vs 실제</div>
            {allocations.filter(a => a.percent > 0).length === 0 && Object.keys(actual).length === 0 && (
              <div style={{ textAlign: 'center', color: '#ccc', padding: '20px 0', fontSize: '0.88rem' }}>예산 배분을 먼저 설정해주세요</div>
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
                      <span style={{ color: '#aaa' }}>계획 {fmt(planned)}원</span>
                      <span style={{ fontWeight: 700, color: over ? '#ff3b30' : '#333' }}>실제 {fmt(actualAmt)}원</span>
                    </div>
                  </div>
                  <div style={{ height: 8, background: '#f0eaff', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${ratio}%`, background: over ? 'linear-gradient(90deg,#ff6b6b,#ff3b30)' : 'linear-gradient(90deg,#b088f9,#7baff0)', borderRadius: 6, transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginTop: 3, color: over ? '#ff3b30' : '#aaa' }}>
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
            <div style={{ ...cardStyle, background: 'linear-gradient(135deg,#f8f4ff,#f0f4ff)' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 12, color: '#555' }}>💰 {monthLabel} 요약</div>
              {[
                { label: '월급', value: salaryAmt, color: '#34c759' },
                { label: '고정 지출 계획', value: -fixedTotal, color: '#ff9f0a' },
                { label: '변동 지출 계획', value: -(salaryAmt * totalAllocPct / 100), color: '#b088f9' },
                { label: '실제 지출 합계', value: -Object.values(actual).reduce((s, v) => s + v, 0), color: '#ff3b30' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(176,136,249,0.1)' }}>
                  <span style={{ fontSize: '0.84rem', color: '#666' }}>{label}</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color }}>{value >= 0 ? '+' : ''}{fmt(value)}원</span>
                </div>
              ))}
            </div>
          )}
      </div>
        </div>
      </div>
    </div>

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
            <div style={{ background: 'white', borderRadius: 10, boxShadow: '0 8px 28px rgba(176,136,249,0.28)', border: '2px solid #b088f9', padding: '8px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: '#b088f9', fontSize: '1.05rem', padding: '0 4px' }}>⠿</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{cat.icon} {cat.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {won > 0 && salaryAmt > 0 && <span style={{ fontSize: '0.75rem', color: '#b088f9', fontWeight: 600 }}>{pct.toFixed(1)}%</span>}
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#333' }}>{wonStr || '0'}원</span>
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
