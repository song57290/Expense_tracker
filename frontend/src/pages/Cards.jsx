import { useState, useEffect, useCallback } from 'react'
import api from '../api.js'
import { fmt, bankColor, bankLogo } from '../utils.js'

function TierBar({ percent, tier1, tier2, tier3 }) {
  const color = percent >= tier3 ? '#34c759' : percent >= tier2 ? '#ff9500' : percent >= tier1 ? '#ffcc00' : '#e5e5ea'
  return (
    <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
      <div style={{ width: `${Math.min(percent, 100)}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s' }} />
    </div>
  )
}

export default function Cards() {
  const [data, setData] = useState(null)
  const [editCard, setEditCard] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ name: '', target: '', tier1: '', tier2: '', tier3: '' })

  const load = useCallback(() => api.get('/api/cards').then(setData).catch(console.error), [])
  useEffect(() => { load() }, [load])

  if (!data) return <div className="text-center py-5"><div className="spinner-border" style={{ color: '#b088f9' }} /></div>

  function resetForm(card) {
    setForm(card ? { name: card.name, target: card.target, tier1: card.tier1, tier2: card.tier2, tier3: card.tier3 } : { name: '', target: '', tier1: '', tier2: '', tier3: '' })
  }

  async function handleSave() {
    const payload = { name: form.name, target: parseInt(form.target) || 0, tier1: parseInt(form.tier1) || 0, tier2: parseInt(form.tier2) || 0, tier3: parseInt(form.tier3) || 0 }
    if (!payload.name) return
    if (editCard) await api.put(`/api/cards/${editCard.id}`, payload)
    else await api.post('/api/cards', payload)
    setEditCard(null); setAddOpen(false); resetForm(null); load()
  }

  async function handleDelete(id) {
    if (!confirm('이 카드를 삭제할까요?')) return
    await api.delete(`/api/cards/${id}`)
    load()
  }

  const formSection = (
    <div className="card mb-3" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
      <div className="card-body">
        <h6 className="fw-bold mb-3">{editCard ? '카드 수정' : '카드 추가'}</h6>
        <div className="row g-2">
          <div className="col-12 col-md-6">
            <input className="form-control" placeholder="카드 이름" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="col-12 col-md-6">
            <input className="form-control" inputMode="numeric" placeholder="목표 금액" value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} />
          </div>
          <div className="col-4">
            <input className="form-control" inputMode="numeric" placeholder="티어1 %" value={form.tier1} onChange={e => setForm(f => ({ ...f, tier1: e.target.value }))} />
          </div>
          <div className="col-4">
            <input className="form-control" inputMode="numeric" placeholder="티어2 %" value={form.tier2} onChange={e => setForm(f => ({ ...f, tier2: e.target.value }))} />
          </div>
          <div className="col-4">
            <input className="form-control" inputMode="numeric" placeholder="티어3 %" value={form.tier3} onChange={e => setForm(f => ({ ...f, tier3: e.target.value }))} />
          </div>
        </div>
        <div className="d-flex justify-content-end gap-2 mt-3">
          <button className="btn btn-outline-secondary btn-sm" onClick={() => { setEditCard(null); setAddOpen(false); resetForm(null) }}>취소</button>
          <button className="btn btn-sm px-4" onClick={handleSave} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>저장</button>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0 fw-bold">카드 관리</h5>
        {!addOpen && !editCard && (
          <button className="btn btn-sm px-3" onClick={() => { setAddOpen(true); resetForm(null) }} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>
            <i className="bi bi-plus-lg me-1" />추가
          </button>
        )}
      </div>

      {addOpen && !editCard && formSection}

      {data.cards.length === 0 ? (
        <div className="card text-center py-5" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', color: '#aaa' }}>
          카드를 추가해보세요
        </div>
      ) : (
        data.cards.map(card => (
          editCard?.id === card.id ? (
            <div key={card.id}>{formSection}</div>
          ) : (
            <div key={card.id} className="card mb-3" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
              <div className="card-body">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <div className="d-flex align-items-center gap-3">
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: bankColor(card.name), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '1.3rem' }}>{bankLogo(card.name)}</span>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1c1c1e' }}>{card.name}</div>
                      <div style={{ fontSize: '0.78rem', color: '#999' }}>목표 {fmt(card.target)}원</div>
                    </div>
                  </div>
                  <div className="d-flex gap-2">
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => { setEditCard(card); setAddOpen(false); resetForm(card) }}>
                      <i className="bi bi-pencil" />
                    </button>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(card.id)}>
                      <i className="bi bi-trash" />
                    </button>
                  </div>
                </div>

                {data.stats[card.id] && (
                  <div>
                    <div className="d-flex justify-content-between" style={{ fontSize: '0.82rem', color: '#666', marginBottom: 2 }}>
                      <span>이번 달 지출</span>
                      <span style={{ fontWeight: 600 }}>{fmt(data.stats[card.id].spent)}원</span>
                    </div>
                    <TierBar percent={data.stats[card.id].percent} tier1={card.tier1} tier2={card.tier2} tier3={card.tier3} />
                    <div className="d-flex justify-content-between mt-2" style={{ fontSize: '0.75rem', color: '#bbb' }}>
                      <span>{card.tier1}%</span><span>{card.tier2}%</span><span>{card.tier3}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        ))
      )}
    </div>
  )
}
