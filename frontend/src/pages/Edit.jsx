import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api.js'

export default function Edit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [form, setForm] = useState(null)
  const [amountDisplay, setAmountDisplay] = useState('')

  useEffect(() => {
    api.get(`/api/transactions/${id}`).then(d => {
      setData(d)
      setForm({ date: d.transaction.date, type: d.transaction.type, category: d.transaction.category, amount: d.transaction.amount, description: d.transaction.description || '', card: d.transaction.card || '', exclude_perf: d.transaction.exclude_perf || false, exclude_stats: d.transaction.exclude_stats || false })
      setAmountDisplay(Number(d.transaction.amount).toLocaleString('ko-KR'))
    }).catch(console.error)
  }, [id])

  if (!data || !form) return <div className="text-center py-5"><div className="spinner-border" style={{ color: '#b088f9' }} /></div>

  const cats = form.type === 'expense' ? data.expense_cats : data.income_cats

  async function handleSave(e) {
    e.preventDefault()
    const amt = parseInt(amountDisplay.replace(/,/g, '')) || 0
    if (!amt || !form.category) return
    await api.put(`/api/transactions/${id}`, { ...form, amount: amt })
    navigate('/')
  }

  async function handleDelete() {
    if (!confirm('이 내역을 삭제할까요?')) return
    await api.delete(`/api/transactions/${id}`)
    navigate('/')
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-secondary)', fontSize: '2.4rem', lineHeight: 1, cursor: 'pointer', transform: 'translateY(-2px)' }}>
          ‹
        </button>
        <h5 className="mb-0 fw-bold">내역 수정</h5>
      </div>

      <div className="card" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          <form onSubmit={handleSave}>
            <div className="mb-3">
              <label className="form-label fw-semibold">날짜</label>
              <input type="date" className="form-control" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
            </div>
            <div className="mb-3">
              <label className="form-label fw-semibold">유형</label>
              <select className="form-select" value={form.type} onChange={e => {
                const newType = e.target.value
                const newCats = newType === 'expense' ? data.expense_cats : data.income_cats
                setForm(f => ({ ...f, type: newType, category: newCats[0]?.[0] || '', exclude_perf: false }))
              }}>
                <option value="expense">지출</option>
                <option value="income">수입</option>
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label fw-semibold">카테고리</label>
              <select className="form-select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {cats.map(([name, icon]) => <option key={name} value={name}>{icon} {name}</option>)}
              </select>
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
              <label className="form-label fw-semibold">항목 설명</label>
              <input className="form-control" placeholder="항목 설명 (선택)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="mb-3">
              <label className="form-label fw-semibold">카드</label>
              <select className="form-select" value={form.card} onChange={e => setForm(f => ({ ...f, card: e.target.value }))}>
                <option value="">카드 없음</option>
                {data.card_list.filter(c => !c.is_loan).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            {form.type === 'expense' && (
              <div className="mb-2">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 0' }} onClick={() => setForm(f => ({ ...f, exclude_perf: !f.exclude_perf }))}>
                  <label className="form-label fw-semibold mb-0" style={{ flex: 1, cursor: 'pointer', fontSize: '0.82rem' }}>💱 카드 실적에서 제외</label>
                  <div className="ios-toggle">
                    <div className={`ios-track${form.exclude_perf ? ' on' : ''}`} />
                    <div className={`ios-dot${form.exclude_perf ? ' on' : ''}`} />
                  </div>
                </div>
              </div>
            )}
            <div className="mb-4">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 0' }} onClick={() => setForm(f => ({ ...f, exclude_stats: !f.exclude_stats }))}>
                <label className="form-label fw-semibold mb-0" style={{ flex: 1, cursor: 'pointer', fontSize: '0.82rem' }}>📊 통계에서 제외</label>
                <div className="ios-toggle">
                  <div className={`ios-track${form.exclude_stats ? ' on' : ''}`} />
                  <div className={`ios-dot${form.exclude_stats ? ' on' : ''}`} />
                </div>
              </div>
            </div>
            <div className="d-flex justify-content-between gap-2">
              <button type="button" className="btn btn-outline-danger" onClick={handleDelete}>삭제</button>
              <div className="d-flex gap-2">
                <button type="submit" className="btn px-4" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>저장</button>
                <button type="button" className="btn btn-outline-secondary" onClick={() => navigate(-1)}>취소</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
