import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api.js'
import DatePickerSheet from '../components/DatePickerSheet.jsx'
import CategoryPicker from '../components/CategoryPicker.jsx'
import CardPicker from '../components/CardPicker.jsx'
import TransferPicker from '../components/TransferPicker.jsx'

export default function Edit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [form, setForm] = useState(null)
  const [amountDisplay, setAmountDisplay] = useState('')
  const [transferFrom, setTransferFrom] = useState('')
  const [transferTo, setTransferTo] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [photoViewer, setPhotoViewer] = useState(false)
  const [typeSheet, setTypeSheet] = useState(false)
  const [typeSheetVisible, setTypeSheetVisible] = useState(false)
  const [convOpen, setConvOpen] = useState(false)
  const receiptInputRef = useRef(null)

  useEffect(() => {
    document.body.classList.toggle('sheet-open', deleteConfirm || photoViewer || typeSheet)
    return () => document.body.classList.remove('sheet-open')
  }, [deleteConfirm, photoViewer, typeSheet])

  function openTypeSheet() {
    setTypeSheet(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setTypeSheetVisible(true)))
  }
  function closeTypeSheet() {
    setTypeSheetVisible(false)
    setTimeout(() => setTypeSheet(false), 300)
  }
  function selectType(newType) {
    const newCats = newType === 'expense' ? data.expense_cats : data.income_cats
    setForm(f => ({ ...f, type: newType, category: newCats[0]?.[0] || '', exclude_perf: false }))
    closeTypeSheet()
  }

  useEffect(() => {
    api.get(`/api/transactions/${id}`).then(d => {
      setData(d)
      const desc = d.transaction.description || ''
      setForm({ date: d.transaction.date, type: d.transaction.type, category: d.transaction.category, amount: d.transaction.amount, description: desc, card: d.transaction.card || '', exclude_perf: d.transaction.exclude_perf || false, exclude_stats: d.transaction.exclude_stats || false })
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
    if (!amt || !form.category) return
    await api.put(`/api/transactions/${id}`, { ...form, amount: amt })
    navigate('/')
  }

  async function handleDelete() {
    await api.delete(`/api/transactions/${id}`)
    navigate('/')
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
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b088f9', fontWeight: 500, padding: '4px 0', display: 'flex', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: '3rem', lineHeight: 1, display: 'flex', alignItems: 'center', transform: 'translateY(-4px)' }}>‹</span>
          <span style={{ fontSize: '0.95rem' }}>뒤로</span>
        </button>
        <h5 className="mb-0 fw-bold" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', fontSize: '1.2rem' }}>내역 수정</h5>
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
                <input className="form-control" inputMode="numeric" placeholder="금액" value={amountDisplay}
                  onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); setAmountDisplay(raw ? parseInt(raw).toLocaleString('ko-KR') : '') }} required />
                <span className="input-group-text">원</span>
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label fw-semibold">{isAccountTransfer ? '계좌 선택' : '항목 설명'}</label>
              {isAccountTransfer ? (
                <TransferPicker
                  accounts={data.card_list}
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
                onChange={name => setForm(f => ({ ...f, card: name }))}
              />
            </div>

            {/* 편의 기능 — 접이식 */}
            <div className="mb-3" style={{ borderRadius: 12, border: '1.5px solid var(--border-light)', overflow: 'hidden' }}>
              <div onClick={() => setConvOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', cursor: 'pointer', background: 'var(--bg-section)', userSelect: 'none' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>⚙️ 편의 기능</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transition: 'transform 0.2s', display: 'inline-block', transform: convOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
              </div>
              {convOpen && (
                <div style={{ padding: '4px 14px 8px', borderTop: '1px solid var(--border-light)' }}>
                  {form.type === 'expense' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}
                      onClick={() => setForm(f => ({ ...f, exclude_perf: !f.exclude_perf }))}>
                      <label style={{ flex: 1, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, margin: 0, color: 'var(--text-secondary)' }}>💱 카드 실적에서 제외</label>
                      <div className="ios-toggle">
                        <div className={`ios-track${form.exclude_perf ? ' on' : ''}`} />
                        <div className={`ios-dot${form.exclude_perf ? ' on' : ''}`} />
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 0' }}
                    onClick={() => setForm(f => ({ ...f, exclude_stats: !f.exclude_stats }))}>
                    <label style={{ flex: 1, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, margin: 0, color: 'var(--text-secondary)' }}>📊 통계에서 제외</label>
                    <div className="ios-toggle">
                      <div className={`ios-track${form.exclude_stats ? ' on' : ''}`} />
                      <div className={`ios-dot${form.exclude_stats ? ' on' : ''}`} />
                    </div>
                  </div>
                </div>
              )}
            </div>

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
            style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 540, paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)', transform: typeSheetVisible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)', boxShadow: '0 -4px 32px rgba(0,0,0,0.13)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
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
              style={{ display: 'block', maxWidth: '92vw', maxHeight: '78vh', objectFit: 'contain' }} />
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
              <button onClick={handleDelete} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#ff3b30,#ff6b6b)', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>삭제</button>
              <button onClick={() => setDeleteConfirm(false)} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1.5px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
