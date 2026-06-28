import { useState, useEffect, useCallback } from 'react'
import api from '../api.js'
import { fmt } from '../utils.js'

export default function Budget() {
  const [data, setData] = useState(null)
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState('')
  const [display, setDisplay] = useState('')

  const load = useCallback(() => api.get('/api/budget').then(d => {
    setData(d)
    setAmount(d.budget_amount || '')
    setDisplay(d.budget_amount ? Number(d.budget_amount).toLocaleString('ko-KR') : '')
  }).catch(console.error), [])

  useEffect(() => { load() }, [load])

  if (!data) return <div className="text-center py-5"><div className="spinner-border" style={{ color: '#b088f9' }} /></div>

  async function handleSave() {
    await api.post('/api/budget', { amount: parseInt(amount) || 0 })
    setEditing(false); load()
  }

  async function handleDelete() {
    if (!confirm('예산을 삭제할까요?')) return
    await api.post('/api/budget', { amount: 0 })
    setEditing(false); load()
  }

  const spent = data.expense_total
  const budget = data.budget_amount || 0
  const remaining = budget - spent
  const pct = budget > 0 ? Math.min(Math.round(spent / budget * 100), 100) : 0
  const barColor = pct >= 100 ? '#ff3b30' : pct >= 80 ? '#ff9500' : '#34c759'

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0 fw-bold">예산 설정</h5>
        {!editing && (
          <button className="btn btn-sm px-3" onClick={() => setEditing(true)} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>
            <i className="bi bi-pencil me-1" />수정
          </button>
        )}
      </div>

      <div className="card mb-3" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          {editing ? (
            <>
              <h6 className="fw-bold mb-3">월 예산</h6>
              <div className="d-flex gap-2">
                <input className="form-control" inputMode="numeric" placeholder="예산 금액" value={display}
                  onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); setAmount(raw); setDisplay(raw ? parseInt(raw).toLocaleString('ko-KR') : '') }} />
                <span className="d-flex align-items-center fw-bold" style={{ color: '#666' }}>원</span>
              </div>
              <div className="d-flex justify-content-between mt-3">
                {budget > 0 && (
                  <button className="btn btn-sm btn-outline-danger" onClick={handleDelete}>삭제</button>
                )}
                <div className="d-flex gap-2 ms-auto">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => { setEditing(false); setDisplay(budget ? budget.toLocaleString('ko-KR') : '') }}>취소</button>
                  <button className="btn btn-sm px-4" onClick={handleSave} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>저장</button>
                </div>
              </div>
            </>
          ) : (
            <>
              <h6 className="fw-bold mb-3">이번 달 예산 현황</h6>
              {budget === 0 ? (
                <p style={{ color: '#aaa', textAlign: 'center', padding: '20px 0' }}>예산을 설정해보세요</p>
              ) : (
                <>
                  <div className="d-flex justify-content-between mb-2" style={{ fontSize: '0.9rem' }}>
                    <span style={{ color: '#666' }}>월 예산</span>
                    <span style={{ fontWeight: 700 }}>{fmt(budget)}원</span>
                  </div>
                  <div className="d-flex justify-content-between mb-3" style={{ fontSize: '0.9rem' }}>
                    <span style={{ color: '#666' }}>지출</span>
                    <span style={{ fontWeight: 700, color: '#ff3b30' }}>{fmt(spent)}원</span>
                  </div>
                  <div style={{ height: 10, background: '#f0f0f0', borderRadius: 5, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 5, transition: 'width 0.5s' }} />
                  </div>
                  <div className="d-flex justify-content-between" style={{ fontSize: '0.82rem', color: '#999' }}>
                    <span>{pct}% 사용</span>
                    <span style={{ color: remaining < 0 ? '#ff3b30' : '#34c759', fontWeight: 600 }}>
                      {remaining < 0 ? '초과 ' + fmt(Math.abs(remaining)) : '잔여 ' + fmt(remaining)}원
                    </span>
                  </div>
                  <div className="row g-3 mt-2">
                    <div className="col-4">
                      <div className="text-center p-3" style={{ background: '#f7f7f7', borderRadius: 12 }}>
                        <div style={{ fontSize: '0.75rem', color: '#ff3b30', fontWeight: 600 }}>지출</div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: 4 }}>{fmt(spent)}원</div>
                      </div>
                    </div>
                    <div className="col-4">
                      <div className="text-center p-3" style={{ background: '#f7f7f7', borderRadius: 12 }}>
                        <div style={{ fontSize: '0.75rem', color: remaining < 0 ? '#ff3b30' : '#34c759', fontWeight: 600 }}>{remaining < 0 ? '초과' : '잔여'}</div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: 4 }}>{fmt(Math.abs(remaining))}원</div>
                      </div>
                    </div>
                    <div className="col-4">
                      <div className="text-center p-3" style={{ background: '#f7f7f7', borderRadius: 12 }}>
                        <div style={{ fontSize: '0.75rem', color: '#007aff', fontWeight: 600 }}>달성률</div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: 4 }}>{pct}%</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
