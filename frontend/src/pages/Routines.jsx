import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'
import CategoryPicker from '../components/CategoryPicker.jsx'
import CardPicker from '../components/CardPicker.jsx'
import SwipeItem from '../components/SwipeItem.jsx'

export default function Routines() {
  const navigate = useNavigate()
  const [routines, setRoutines] = useState([])
  const [routineCats, setRoutineCats] = useState([])
  const [routineCards, setRoutineCards] = useState([])
  const [routineFormOpen, setRoutineFormOpen] = useState(false)
  const [routineForm, setRoutineForm] = useState({ name: '', card: '', items: [{ category: '', cat_type: 'expense' }] })
  const [routineError, setRoutineError] = useState('')
  const [editRoutineId, setEditRoutineId] = useState(null)

  const loadRoutines = () => api.get('/api/routines').then(setRoutines).catch(() => {})

  useEffect(() => {
    loadRoutines()
    api.get('/api/categories').then(d => setRoutineCats([...d.expense.map(c => ({...c, type: 'expense'})), ...d.income.map(c => ({...c, type: 'income'}))])).catch(() => {})
    api.get('/api/home').then(d => setRoutineCards(d.card_list || [])).catch(() => {})
  }, [])

  function openEditRoutine(r) {
    setEditRoutineId(r.id)
    setRoutineForm({ name: r.name, card: r.card || '', items: r.items?.length ? r.items.map(it => ({ category: it.category, cat_type: it.cat_type })) : [{ category: '', cat_type: 'expense' }] })
    setRoutineError('')
    setRoutineFormOpen(true)
  }

  async function saveRoutine() {
    if (!routineForm.name.trim()) { setRoutineError('name'); return }
    if (routineForm.items.every(it => !it.category)) { setRoutineError('category'); return }
    setRoutineError('')
    try {
      if (editRoutineId) {
        await api.put(`/api/routines/${editRoutineId}`, routineForm)
      } else {
        await api.post('/api/routines', routineForm)
      }
      setRoutineForm({ name: '', card: '', items: [{ category: '', cat_type: 'expense' }] })
      setRoutineError('')
      setEditRoutineId(null)
      setRoutineFormOpen(false)
      loadRoutines()
    } catch (e) {
      setRoutineError('server')
    }
  }

  async function deleteRoutine(id) {
    await api.delete(`/api/routines/${id}`)
    loadRoutines()
  }

  return (
    <div className="page-wrap" style={{ maxWidth: 540, margin: '0 auto', padding: '0 16px 100px' }}>
      {/* iOS 스타일 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0 12px', position: 'relative', borderBottom: '0.5px solid var(--border-light)', marginBottom: 20 }}>
        <button onClick={() => navigate('/settings')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b088f9', fontWeight: 500, padding: '4px 0', display: 'flex', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: '3rem', lineHeight: 1, display: 'flex', alignItems: 'center', transform: 'translateY(-4px)' }}>‹</span>
          <span style={{ fontSize: '0.95rem' }}>설정</span>
        </button>
        <h5 style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', margin: 0, fontWeight: 700, fontSize: '1.2rem' }}>루틴 관리</h5>
      </div>

      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
        자주 쓰는 내역 카테고리를 루틴으로 저장합니다. 홈 탭에서 칩을 탭하면 빠르게 내역을 추가할 수 있습니다.
      </p>

      {/* 루틴 목록 */}
      {routines.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {routines.map(r => (
            <SwipeItem key={r.id} onEdit={() => openEditRoutine(r)} onDelete={() => deleteRoutine(r.id)} borderRadius={12}>
              <div style={{ padding: '12px 14px', background: 'var(--bg-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.92rem', fontWeight: 600 }}>{r.name}</span>
                  {r.card && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>· {r.card}</span>}
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                  {(r.items || []).map((it, i) => {
                    const cat = routineCats.find(c => c.name === it.category)
                    return (
                      <span key={i} style={{ fontSize: '0.75rem', background: 'var(--bg-accent)', borderRadius: 6, padding: '2px 8px', color: 'var(--text-muted)' }}>
                        {cat?.icon || '📦'} {it.category}
                      </span>
                    )
                  })}
                </div>
              </div>
            </SwipeItem>
          ))}
        </div>
      )}

      {/* 추가/수정 폼 */}
      {routineFormOpen ? (
        <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
          <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: 12, color: 'var(--text-primary)' }}>
            {editRoutineId ? '루틴 수정' : '새 루틴'}
          </div>

          <input placeholder="루틴 이름 (예: 점심 루틴)" value={routineForm.name}
            onChange={e => { setRoutineForm(f => ({ ...f, name: e.target.value })); setRoutineError('') }}
            className="form-control" style={{ borderRadius: 10, fontSize: '0.88rem', marginBottom: 4, borderColor: routineError === 'name' ? '#ff3b30' : undefined }} />
          {routineError === 'name' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, margin: '2px 2px 8px', color: '#ff3b30', fontSize: '0.78rem', fontWeight: 500 }}>
              <span>⚠</span> 루틴 이름을 입력해 주세요
            </div>
          )}
          {routineError !== 'name' && <div style={{ height: 8 }} />}

          {/* 카테고리 항목들 */}
          {routineForm.items.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <div style={{ display: 'flex', background: 'var(--bg-accent)', borderRadius: 8, padding: 2, gap: 2, flexShrink: 0 }}>
                {[['expense', '지출'], ['income', '수입']].map(([val, label]) => (
                  <button key={val} type="button"
                    onClick={() => setRoutineForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, cat_type: val, category: '' } : it) }))}
                    style={{ padding: '5px 8px', borderRadius: 6, border: 'none', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.18s',
                      background: item.cat_type === val ? (val === 'expense' ? '#ff3b30' : '#34c759') : 'transparent',
                      color: item.cat_type === val ? 'white' : 'var(--text-muted)' }}>
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1 }}>
                <CategoryPicker
                  cats={routineCats.filter(c => c.type === item.cat_type).map(c => [c.name, c.icon])}
                  value={item.category}
                  onChange={cat => setRoutineForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, category: cat } : it) }))}
                />
              </div>
              {routineForm.items.length > 1 && (
                <button type="button"
                  onClick={() => setRoutineForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                  style={{ background: 'none', border: 'none', color: '#ff3b30', cursor: 'pointer', fontSize: '1.2rem', padding: '2px', flexShrink: 0, lineHeight: 1 }}>×</button>
              )}
            </div>
          ))}

          <button type="button"
            onClick={() => setRoutineForm(f => ({ ...f, items: [...f.items, { category: '', cat_type: 'expense' }] }))}
            style={{ width: '100%', padding: '7px 0', borderRadius: 10, border: '1.5px dashed rgba(176,136,249,0.5)', background: 'transparent', color: '#b088f9', fontSize: '0.82rem', cursor: 'pointer', marginBottom: 4 }}>
            + 카테고리 추가
          </button>

          {routineError === 'category' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, margin: '2px 2px 8px', color: '#ff3b30', fontSize: '0.78rem', fontWeight: 500 }}>
              <span>⚠</span> 카테고리를 하나 이상 선택해 주세요
            </div>
          )}
          {routineError === 'server' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, margin: '2px 2px 8px', color: '#ff3b30', fontSize: '0.78rem', fontWeight: 500 }}>
              <span>⚠</span> 저장에 실패했습니다. 다시 시도해 주세요
            </div>
          )}
          {!['category', 'server'].includes(routineError) && <div style={{ height: 4 }} />}

          {/* 카드 선택 */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <CardPicker
              cards={routineCards.filter(c => !c.is_loan)}
              value={routineForm.card}
              onChange={name => setRoutineForm(f => ({ ...f, card: name }))}
            />
            {routineForm.card && (
              <button type="button" onClick={() => setRoutineForm(f => ({ ...f, card: '' }))}
                style={{ position: 'absolute', right: 36, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', padding: '0 4px', zIndex: 1 }}>
                ✕
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveRoutine} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
              {editRoutineId ? '수정 완료' : '저장'}
            </button>
            <button onClick={() => { setRoutineFormOpen(false); setEditRoutineId(null); setRoutineForm({ name: '', card: '', items: [{ category: '', cat_type: 'expense' }] }); setRoutineError('') }}
              style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border-light)', background: 'none', fontSize: '0.9rem', cursor: 'pointer', color: 'var(--text-muted)' }}>취소</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setEditRoutineId(null); setRoutineForm({ name: '', card: '', items: [{ category: '', cat_type: 'expense' }] }); setRoutineError(''); setRoutineFormOpen(true) }}
          style={{ width: '100%', padding: '11px 0', borderRadius: 12, border: '1.5px dashed #b088f9', background: 'transparent', color: '#b088f9', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
          + 루틴 추가
        </button>
      )}
    </div>
  )
}
