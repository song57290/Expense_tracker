import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import api from '../api.js'
import { restoreCaretAfterFormat } from '../utils.js'

const headerLabelY = Capacitor.isNativePlatform() ? -1.5 : 1
import DatePickerSheet from '../components/DatePickerSheet.jsx'
import CategoryPicker from '../components/CategoryPicker.jsx'
import CardPicker from '../components/CardPicker.jsx'
import TransferPicker from '../components/TransferPicker.jsx'
import { syncWidget } from '../widgetSync.js'

export default function Edit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [data, setData] = useState(null)
  const [form, setForm] = useState(null)
  const [amountDisplay, setAmountDisplay] = useState('')
  const [amountError, setAmountError] = useState(false)
  const [cardError, setCardError] = useState(false)
  const [transferFrom, setTransferFrom] = useState('')
  const [transferTo, setTransferTo] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [photoViewer, setPhotoViewer] = useState(false)
  const [typeSheet, setTypeSheet] = useState(false)
  const [typeSheetVisible, setTypeSheetVisible] = useState(false)
  const [typeSheetDrag, setTypeSheetDrag] = useState(0)
  const typeSheetTouchStartY = useRef(null)
  const receiptInputRef = useRef(null)
  const [pointOverspend, setPointOverspend] = useState(null) // { card, amount, available, payload }
  const [overspendStep, setOverspendStep] = useState('warn') // 'warn' | 'pick'
  const [overspendCardChoice, setOverspendCardChoice] = useState('')
  const [carryoverError, setCarryoverError] = useState(null)

  useEffect(() => {
    document.body.classList.toggle('sheet-open', deleteConfirm || photoViewer || typeSheet || !!pointOverspend)
    return () => document.body.classList.remove('sheet-open')
  }, [deleteConfirm, photoViewer, typeSheet, pointOverspend])

  function openTypeSheet() {
    setTypeSheet(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setTypeSheetVisible(true)))
  }
  function closeTypeSheet() {
    setTypeSheetVisible(false)
    setTypeSheetDrag(0)
    setTimeout(() => setTypeSheet(false), 300)
  }
  function typeSheetTouchStart(e) {
    typeSheetTouchStartY.current = e.touches[0].clientY
  }
  function typeSheetTouchMove(e) {
    if (typeSheetTouchStartY.current === null) return
    const dy = e.touches[0].clientY - typeSheetTouchStartY.current
    if (dy > 0) setTypeSheetDrag(dy)
  }
  function typeSheetTouchEnd() {
    if (typeSheetDrag > 100) closeTypeSheet()
    else setTypeSheetDrag(0)
    typeSheetTouchStartY.current = null
  }
  function selectType(newType) {
    const newCats = newType === 'expense' ? data.expense_cats : data.income_cats
    setForm(f => ({ ...f, type: newType, category: newCats[0]?.[0] || '', exclude_perf: false, exclude_cashback: false, cashback_manual: false, cashback_amount: '', point_pool: '' }))
    closeTypeSheet()
  }

  useEffect(() => {
    api.get(`/api/transactions/${id}`).then(d => {
      setData(d)
      const desc = d.transaction.description || ''
      setForm({ date: d.transaction.date, type: d.transaction.type, category: d.transaction.category, amount: d.transaction.amount, description: desc, card: d.transaction.card || '', exclude_perf: d.transaction.exclude_perf || false, exclude_stats: d.transaction.exclude_stats || false, exclude_cashback: d.transaction.exclude_cashback || false, cashback_manual: d.transaction.cashback_manual || false, cashback_amount: d.transaction.cashback_manual ? Number(d.transaction.cashback).toLocaleString('ko-KR') : '', point_pool: d.transaction.point_pool || '' })
      setAmountDisplay(Number(d.transaction.amount).toLocaleString('ko-KR'))
      if (d.transaction.category === '계좌 이체' && desc.includes(' → ')) {
        const [from, to] = desc.split(' → ')
        setTransferFrom(from || '')
        setTransferTo(to || '')
      }
      if (d.transaction.has_receipt) {
        setReceiptUrl(`/api/transactions/${id}/receipt`)
      }
    }).catch(console.error)
  }, [id])

  if (!data || !form) return <div className="text-center py-5"><div className="spinner-border" style={{ color: '#b088f9' }} /></div>

  const cats = form.type === 'expense' ? data.expense_cats : data.income_cats
  const isAccountTransfer = form.category === '계좌 이체'

  function handleCategoryChange(cat) {
    const autoExcl = form.type === 'expense' && (data.excl_cat_names || []).includes(cat)
    const autoExclStats = (data.excl_stat_cat_names || []).includes(cat)
    if (cat !== '계좌 이체') { setTransferFrom(''); setTransferTo('') }
    setForm(f => ({ ...f, category: cat, exclude_perf: autoExcl, exclude_stats: autoExclStats, description: cat !== '계좌 이체' ? (cat === f.category ? f.description : '') : f.description }))
  }

  async function handleSave(e) {
    e.preventDefault()
    const amt = parseInt(amountDisplay.replace(/,/g, '')) || 0
    const cardOk = isAccountTransfer || !!form.card
    setAmountError(!amt)
    setCardError(!cardOk)
    if (!amt || !cardOk) return
    if (!form.category) return
    const payload = { ...form, amount: amt, cashback_amount: parseInt(form.cashback_amount.replace(/,/g, '')) || 0 }

    // 포인트는 마이너스가 될 수 없다 — 남은 포인트보다 많이 쓰게 고치려고 하면 경고부터.
    // 이 거래가 이미 같은 포인트 카드 지출이었다면, 화면에 보이는 잔고는 그 원래
    // 금액만큼 이미 빠진 상태이므로 원래 금액만큼 다시 더해서 "이 수정에 실제로
    // 쓸 수 있는 금액"을 구해야 한다.
    if (form.type === 'expense' && !isAccountTransfer) {
      const selectedCard = data.card_list.find(c => c.name === form.card)
      if (selectedCard?.point_reset_day && form.point_pool === 'carryover') {
        // 전환 포인트에서 쓰는 지출은 전환 포인트 한도로만 제한 (이 거래가 원래 같은 카드·전환 지출이었으면 그 금액은 되돌려서 계산)
        const sameCarry = data.transaction.card === form.card && data.transaction.type === 'expense' && data.transaction.point_pool === 'carryover'
        const carryAvail = (selectedCard.point_carryover || 0) + (sameCarry ? data.transaction.amount : 0)
        if (amt > carryAvail) { const sameRegular = data.transaction.card === form.card && data.transaction.type === 'expense' && data.transaction.point_pool !== 'carryover'; setCarryoverError({ card: selectedCard, amount: amt, available: carryAvail, payload, canSplit: amt - carryAvail <= (selectedCard.balance || 0) + (sameRegular ? data.transaction.amount : 0) }); return }
      } else if (selectedCard?.point_reset_day && selectedCard.balance != null) {
        const sameCard = data.transaction.card === form.card && data.transaction.type === 'expense'
        const available = selectedCard.balance + (sameCard ? data.transaction.amount : 0)
        if (amt > available) {
          setPointOverspend({ card: selectedCard, amount: amt, available, payload })
          setOverspendStep('warn')
          setOverspendCardChoice('')
          return
        }
      }
    }
    setCarryoverError(null)

    await api.put(`/api/transactions/${id}`, payload)
    syncWidget()
    // 캘린더에서 들어온 경우 날짜를 다른 달로 바꿨다면 돌아갔을 때 그 달을 보여준다
    if (location.state?.from === 'calendar' && payload.date) sessionStorage.setItem('calendar_focus_month', payload.date.slice(0, 7))
    navigate(-1)
  }

  async function confirmCarrySplit() {
    const e = carryoverError
    if (!e) return
    if (e.available > 0) {
      await api.put(`/api/transactions/${id}`, { ...e.payload, amount: e.available, point_pool: 'carryover' })
    } else {
      await api.delete(`/api/transactions/${id}`)
    }
    await api.post('/api/transactions', { ...e.payload, amount: e.amount - e.available, point_pool: '', ...(e.available > 0 ? { cashback_manual: false, cashback_amount: 0 } : {}) })
    syncWidget()
    navigate(-1)
  }

  async function confirmOverspendWithLinkedCard() {
    if (!pointOverspend || !overspendCardChoice) return
    const { payload, amount, available } = pointOverspend
    const overage = amount - available
    if (available > 0) {
      await api.put(`/api/transactions/${id}`, { ...payload, amount: available })
    } else {
      await api.delete(`/api/transactions/${id}`)
    }
    await api.post('/api/transactions', { ...payload, amount: overage, card: overspendCardChoice, point_pool: '', ...(available > 0 ? { cashback_manual: false, cashback_amount: 0 } : {}) })
    syncWidget()
    navigate(-1)
  }

  async function handleDelete() {
    await api.delete(`/api/transactions/${id}`)
    syncWidget()
    navigate(-1)
  }

  async function handleReceiptUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setReceiptLoading(true)
    try {
      const fd = new FormData()
      fd.append('receipt', file)
      const res = await fetch(`/api/transactions/${id}/receipt`, { method: 'POST', credentials: 'include', body: fd })
      if (res.ok) {
        setReceiptUrl(`/api/transactions/${id}/receipt?t=${Date.now()}`)
      } else {
        const body = await res.json().catch(() => ({}))
        alert('업로드 실패: ' + (body.error || res.status))
      }
    } catch (err) {
      alert('업로드 오류: ' + err.message)
    } finally {
      setReceiptLoading(false)
      e.target.value = ''
    }
  }

  async function handleReceiptDelete() {
    if (!window.confirm('사진을 삭제할까요?')) return
    await fetch(`/api/transactions/${id}/receipt`, { method: 'DELETE', credentials: 'include' })
    setReceiptUrl(null)
  }

  const typeLabel = form.type === 'expense' ? '지출' : '수입'
  const typeColor = form.type === 'expense' ? '#FF6B6B' : '#34C759'

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: 'calc(env(safe-area-inset-top) + 8px) 0 12px', position: 'relative', borderBottom: '0.5px solid var(--border-light)', marginBottom: '1.5rem' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b088f9', fontWeight: 700, padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
          <i className="bi bi-chevron-left" style={{ fontSize: '1.3rem' }} />
          <span style={{ fontSize: '1.05rem', transform: `translateY(${headerLabelY}px)` }}>뒤로</span>
        </button>
        <h5 className="mb-0 fw-bold" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', fontSize: '1.3rem' }}>내역 수정</h5>
      </div>

      <div className="card" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          <form onSubmit={handleSave}>
            <div className="mb-3">
              <label className="form-label fw-semibold">날짜</label>
              <DatePickerSheet value={form.date} onChange={date => setForm(f => ({ ...f, date }))} />
            </div>

            {/* 유형 — 커스텀 버튼 */}
            <div className="mb-3">
              <label className="form-label fw-semibold">유형</label>
              <button type="button" onClick={openTypeSheet}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--border-light)', background: 'var(--bg-card)', cursor: 'pointer' }}>
                <span style={{ fontWeight: 600, color: typeColor, fontSize: '0.95rem' }}>{typeLabel}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>▼</span>
              </button>
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold">카테고리</label>
              <CategoryPicker cats={cats} value={form.category} onChange={handleCategoryChange} />
            </div>
            <div className="mb-3">
              <label className="form-label fw-semibold">금액</label>
              <div className="input-group">
                <input className={`form-control${amountError ? ' field-invalid' : ''}`} inputMode="numeric" placeholder="금액" value={amountDisplay}
                  onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); const v = raw ? parseInt(raw).toLocaleString('ko-KR') : ''; restoreCaretAfterFormat(e.target, v); setAmountDisplay(v); setAmountError(false) }} />
                <span className="input-group-text">원</span>
              </div>
              {amountError && <div style={{ color: '#dc3545', fontSize: '0.78rem', marginTop: 3 }}>금액을 입력해 주세요</div>}
            </div>
            <div className="mb-3">
              <label className="form-label fw-semibold">{isAccountTransfer ? '계좌 선택' : '항목 설명'}</label>
              {isAccountTransfer ? (
                <TransferPicker
                  accounts={data.card_list}
                  investAccounts={data.invest_accounts || []}
                  from={transferFrom}
                  to={transferTo}
                  onFromChange={v => { setTransferFrom(v); setForm(f => ({ ...f, description: v && transferTo ? `${v} → ${transferTo}` : '' })) }}
                  onToChange={v => { setTransferTo(v); setForm(f => ({ ...f, description: transferFrom && v ? `${transferFrom} → ${v}` : '' })) }}
                />
              ) : (
                <input className="form-control" placeholder="항목 설명 (선택)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              )}
            </div>
            <div className="mb-3">
              <label className="form-label fw-semibold">카드</label>
              <CardPicker
                cards={data.card_list.filter(c => !c.is_loan)}
                value={form.card}
                onChange={name => { setForm(f => ({ ...f, card: name, point_pool: '' })); setCardError(false) }}
                error={cardError}
              />
              {cardError && <div style={{ color: '#dc3545', fontSize: '0.78rem', marginTop: 3 }}>카드/계좌를 선택해 주세요</div>}
            </div>

            {form.type === 'expense' && (
              <div className="mb-3" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 0' }}
                onClick={() => setForm(f => ({ ...f, exclude_perf: !f.exclude_perf }))}>
                <label style={{ flex: 1, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, margin: 0, color: 'var(--text-secondary)' }}>💱 카드 실적에서 제외</label>
                <div className="ios-toggle">
                  <div className={`ios-track${form.exclude_perf ? ' on' : ''}`} />
                  <div className={`ios-dot${form.exclude_perf ? ' on' : ''}`} />
                </div>
              </div>
            )}
            <div className="mb-3" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 0' }}
              onClick={() => setForm(f => ({ ...f, exclude_stats: !f.exclude_stats }))}>
              <label style={{ flex: 1, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, margin: 0, color: 'var(--text-secondary)' }}>📊 통계에서 제외</label>
              <div className="ios-toggle">
                <div className={`ios-track${form.exclude_stats ? ' on' : ''}`} />
                <div className={`ios-dot${form.exclude_stats ? ' on' : ''}`} />
              </div>
            </div>
            {(() => {
              const selectedCard = data.card_list.find(c => c.name === form.card)
              const cashbackMatch = selectedCard && (
                (form.type === 'expense' && selectedCard.cashback_type === 'payment') ||
                (form.type === 'income' && selectedCard.cashback_type === 'charge')
              )
              return cashbackMatch && (
                <div className="mb-3" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 0' }}
                  onClick={() => setForm(f => ({ ...f, exclude_cashback: !f.exclude_cashback }))}>
                  <label style={{ flex: 1, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, margin: 0, color: 'var(--text-secondary)' }}>🎁 캐시백 제외</label>
                  <div className="ios-toggle">
                    <div className={`ios-track${form.exclude_cashback ? ' on' : ''}`} />
                    <div className={`ios-dot${form.exclude_cashback ? ' on' : ''}`} />
                  </div>
                </div>
              )
            })()}
            {form.card && (form.type === 'expense' || form.type === 'income') && (
              <div className="mb-3">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 0' }}
                  onClick={() => setForm(f => ({ ...f, cashback_manual: !f.cashback_manual }))}>
                  <label style={{ flex: 1, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, margin: 0, color: 'var(--text-secondary)' }}>✏️ 캐시백 금액 직접 입력</label>
                  <div className="ios-toggle">
                    <div className={`ios-track${form.cashback_manual ? ' on' : ''}`} />
                    <div className={`ios-dot${form.cashback_manual ? ' on' : ''}`} />
                  </div>
                </div>
                {form.cashback_manual && (
                  <div style={{ position: 'relative' }}>
                    <input type="text" inputMode="numeric" className="form-control" placeholder="캐시백 금액" style={{ borderRadius: 10, paddingRight: 36 }}
                      value={form.cashback_amount} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); const v = raw ? parseInt(raw).toLocaleString('ko-KR') : ''; setForm(f => ({ ...f, cashback_amount: v })) }} />
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
                  </div>
                )}
              </div>
            )}
            {(() => {
              const selectedCard = data.card_list.find(c => c.name === form.card)
              const isPointWithCarryover = form.type === 'expense' && selectedCard?.point_reset_day && selectedCard.point_carryover > 0
              return isPointWithCarryover && (
                <div className="mb-3" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 12px', borderRadius: 12, background: 'rgba(176,136,249,0.08)', border: '1px solid rgba(176,136,249,0.18)' }}
                  onClick={() => setForm(f => ({ ...f, point_pool: f.point_pool === 'carryover' ? '' : 'carryover' }))}>
                  <span style={{ fontSize: '1.2rem', lineHeight: 1, flexShrink: 0 }}>🎁</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>전환된 포인트에서 차감</div>
                    <div style={{ fontSize: '0.72rem', color: '#b088f9', fontWeight: 600, marginTop: 2 }}>전환 가능 {Number(selectedCard.point_carryover).toLocaleString('ko-KR')}원</div>
                  </div>
                  <div className="ios-toggle">
                    <div className={`ios-track${form.point_pool === 'carryover' ? ' on' : ''}`} />
                    <div className={`ios-dot${form.point_pool === 'carryover' ? ' on' : ''}`} />
                  </div>
                {carryoverError && <div style={{ color: '#dc3545', fontSize: '0.78rem', marginTop: 8, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><span>전환 포인트({Number(selectedCard.point_carryover).toLocaleString('ko-KR')}원)보다 많이 쓸 수 없어요</span>{carryoverError.canSplit && <button type="button" onClick={confirmCarrySplit} style={{ background: 'rgba(176,136,249,0.12)', color: '#b088f9', border: '1px solid rgba(176,136,249,0.4)', borderRadius: 8, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>충전 포인트에서 나머지 {Number(carryoverError.amount - carryoverError.available).toLocaleString('ko-KR')}원 차감</button>}<button type="button" onClick={() => { setPointOverspend(carryoverError); setOverspendStep('pick'); setOverspendCardChoice('') }} style={{ background: 'rgba(220,53,69,0.1)', color: '#dc3545', border: '1px solid rgba(220,53,69,0.35)', borderRadius: 8, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>연결 카드로 결제</button></div>}
                </div>
              )
            })()}

            {/* 사진 */}
            <div className="mb-4">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span className="form-label fw-semibold mb-0" style={{ fontSize: '0.82rem' }}>🧾 사진</span>
                <label htmlFor="receipt-file-input" style={{ padding: '5px 12px', borderRadius: 8, border: '1.5px solid var(--border-light)', background: 'var(--bg-card)', color: receiptLoading ? 'var(--text-muted)' : '#b088f9', fontWeight: 600, fontSize: '0.78rem', cursor: receiptLoading ? 'default' : 'pointer', pointerEvents: receiptLoading ? 'none' : 'auto' }}>
                  {receiptLoading ? '업로드 중...' : receiptUrl ? '변경' : '+ 추가'}
                </label>
                <input type="file" id="receipt-file-input" accept="image/*" ref={receiptInputRef} onChange={handleReceiptUpload} style={{ display: 'none' }} />
              </div>
              {receiptUrl && (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={receiptUrl} alt="사진" onClick={() => setPhotoViewer(true)}
                    style={{ width: '100%', maxWidth: 260, borderRadius: 12, border: '1.5px solid var(--border-light)', display: 'block', cursor: 'zoom-in' }} />
                  <button type="button" onClick={handleReceiptDelete}
                    style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: 26, height: 26, color: 'white', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
              )}
            </div>

            <div className="d-flex justify-content-between gap-2">
              <button type="button" className="btn btn-outline-danger" onClick={() => setDeleteConfirm(true)}>삭제</button>
              <div className="d-flex gap-2">
                <button type="submit" className="btn px-4" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>저장</button>
                <button type="button" className="btn btn-outline-secondary" onClick={() => navigate(-1)}>취소</button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* 유형 선택 시트 */}
      {typeSheet && (
        <div onClick={closeTypeSheet}
          style={{ position: 'fixed', inset: 0, background: `rgba(0,0,0,${typeSheetVisible ? 0.45 : 0})`, zIndex: 5000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', transition: 'background 0.3s ease' }}>
          <div onClick={e => e.stopPropagation()}
            onTouchStart={typeSheetTouchStart} onTouchMove={typeSheetTouchMove} onTouchEnd={typeSheetTouchEnd}
            style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 540, paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)', transform: typeSheetVisible ? `translateY(${typeSheetDrag}px)` : 'translateY(100%)', transition: typeSheetDrag > 0 ? 'none' : 'transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)', boxShadow: '0 -4px 32px rgba(0,0,0,0.13)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', cursor: 'grab' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-light)' }} />
            </div>
            <div style={{ padding: '8px 20px 4px', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>유형 선택</div>
            {[['expense', '지출', '#FF6B6B'], ['income', '수입', '#34C759']].map(([val, label, color]) => (
              <div key={val} onClick={() => selectType(val)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', cursor: 'pointer', borderTop: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '1rem', fontWeight: 600, color: form.type === val ? color : 'var(--text-primary)' }}>{label}</span>
                {form.type === val && (
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: 'white', fontSize: '0.75rem', fontWeight: 700 }}>✓</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {photoViewer && (
        <div onClick={() => setPhotoViewer(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ position: 'relative', background: 'var(--bg-card)', borderRadius: 16, overflow: 'hidden', maxWidth: '100%', boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
            <button onClick={() => setPhotoViewer(false)}
              style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.45)', border: 'none', borderRadius: '50%', width: 30, height: 30, color: 'white', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>✕</button>
            <img src={receiptUrl} alt="사진 보기"
              style={{ display: 'block', maxWidth: '92vw', maxHeight: '78dvh', objectFit: 'contain' }} />
          </div>
        </div>
      )}

      {pointOverspend && overspendStep === 'warn' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, width: '100%', maxWidth: 320, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)', textAlign: 'center' }}>포인트는 마이너스가 될 수 없어요</div>
            </div>
            <div style={{ padding: '16px 20px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {pointOverspend.card.name}에 남은 포인트는 {pointOverspend.available.toLocaleString('ko-KR')}원인데 {pointOverspend.amount.toLocaleString('ko-KR')}원을 쓰려고 하고 있어요.
              </div>
            </div>
            <div style={{ padding: '0 16px 18px', display: 'flex', gap: 8 }}>
              <button autoFocus onClick={() => setOverspendStep('pick')} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>그래도 추가</button>
              <button onClick={() => setPointOverspend(null)} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1.5px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}>취소하고 다시 작성</button>
            </div>
          </div>
        </div>
      )}

      {pointOverspend && overspendStep === 'pick' && (
        // CardPicker가 자기 바텀시트를 zIndex 5000으로 띄우므로, 그 위에 이 모달이
        // 덮어버리지 않도록 이 단계만 그보다 낮게 둔다 (경고 단계는 CardPicker가
        // 없으니 그대로 10000 유지).
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 4800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, width: '100%', maxWidth: 320, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)', textAlign: 'center' }}>차액을 낼 카드/계좌</div>
            </div>
            <div style={{ padding: '16px 20px 10px' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: 12 }}>
                부족한 {(pointOverspend.amount - pointOverspend.available).toLocaleString('ko-KR')}원을 결제할 카드·계좌를 골라주세요.
              </div>
              <CardPicker cards={data.card_list.filter(c => c.name !== pointOverspend.card.name)}
                value={overspendCardChoice} onChange={setOverspendCardChoice} placeholder="카드/계좌 선택" />
            </div>
            <div style={{ padding: '18px 16px 18px', display: 'flex', gap: 8 }}>
              <button disabled={!overspendCardChoice} onClick={confirmOverspendWithLinkedCard} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', opacity: overspendCardChoice ? 1 : 0.5 }}>확인</button>
              <button onClick={() => setPointOverspend(null)} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1.5px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div onClick={() => setDeleteConfirm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 20, width: '100%', maxWidth: 320, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--text-primary)', textAlign: 'center' }}>내역 삭제</div>
            </div>
            <div style={{ padding: '16px 20px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '1rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>이 내역을 삭제할까요?</div>
            </div>
            <div style={{ padding: '0 16px 18px', display: 'flex', gap: 8 }}>
              <button autoFocus onClick={handleDelete} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#ff3b30,#ff6b6b)', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>삭제</button>
              <button onClick={() => setDeleteConfirm(false)} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1.5px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
