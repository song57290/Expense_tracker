import { useState, useEffect, useCallback, useRef } from 'react'
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import api from '../api.js'

function SlidingTabs({ options, value, onChange }) {
  const tabRefs = useRef([])
  const indRef = useRef(null)
  useEffect(() => {
    const idx = options.findIndex(o => o[0] === value)
    const tab = tabRefs.current[idx]
    const ind = indRef.current
    if (tab && ind) {
      ind.style.left = tab.offsetLeft + 'px'
      ind.style.width = tab.offsetWidth + 'px'
    }
  }, [value, options])
  return (
    <div style={{ display: 'inline-flex', background: 'var(--bg-accent)', borderRadius: 20, padding: 3, gap: 2, position: 'relative' }}>
      <div ref={indRef} style={{ position: 'absolute', top: 3, bottom: 3, background: 'var(--bg-card)', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.12)', zIndex: 0, pointerEvents: 'none', transition: 'left 0.28s cubic-bezier(0.25,0.46,0.45,0.94),width 0.28s cubic-bezier(0.25,0.46,0.45,0.94)' }} />
      {options.map(([val, label], i) => (
        <button key={val} ref={el => tabRefs.current[i] = el} onClick={() => onChange(val)}
          style={{ position: 'relative', zIndex: 1, borderRadius: 16, padding: '5px 20px', fontSize: '0.85rem', background: 'transparent', color: value === val ? '#b088f9' : 'var(--text-muted)', border: 'none', fontWeight: value === val ? 600 : 400, transition: 'color 0.22s', cursor: 'pointer' }}>
          {label}
        </button>
      ))}
    </div>
  )
}

function SortableItem({ cat, onEdit, onDelete, isEditing }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id })
  const sortStyle = {
    transform: CSS.Transform.toString(transform), transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : isEditing ? 10 : 'auto',
    position: 'relative',
    overflow: isDragging ? 'visible' : 'hidden',
  }

  const startX = useRef(null)
  const startY = useRef(null)
  const horiz = useRef(false)
  const offsetRef = useRef(0)
  const [offsetX, setOffsetX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const mouseDown = useRef(false)

  function onDragStart(e) {
    if (isDragging) return
    if (e.touches) {
      const t = e.touches[0]
      const wrap = e.currentTarget.closest('.page-wrap')
      const rect = wrap ? wrap.getBoundingClientRect() : { left: 0, width: window.innerWidth }
      if (t.clientX - rect.left < 80 || t.clientX - rect.left > rect.width - 80) return
      startX.current = t.clientX; startY.current = t.clientY; horiz.current = false
    } else {
      startX.current = e.clientX; startY.current = e.clientY; horiz.current = true
      mouseDown.current = true; setSwiping(true)
    }
  }

  function onDragMove(e) {
    if (startX.current === null) return
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    const cy = e.touches ? e.touches[0].clientY : e.clientY
    const dx = cx - startX.current
    const dy = cy - startY.current
    if (!horiz.current) {
      if (Math.abs(dx) < 8) { if (Math.abs(dy) > 18) { startX.current = null; return } return }
      if (Math.abs(dy) > Math.abs(dx) * 1.5) { startX.current = null; return }
      horiz.current = true; setSwiping(true)
    }
    const clamped = Math.max(-90, Math.min(90, dx))
    offsetRef.current = clamped; setOffsetX(clamped)
  }

  function onDragEnd() {
    mouseDown.current = false
    if (startX.current === null) return
    const cur = offsetRef.current
    startX.current = null; horiz.current = false; offsetRef.current = 0
    setSwiping(false); setOffsetX(0)
    if (cur < -60) onDelete(cat.id)
    else if (cur > 60) onEdit(cat)
  }

  const deleteWidth = Math.max(0, -offsetX)
  const editWidth = Math.max(0, offsetX)

  return (
    <div ref={setNodeRef} style={sortStyle} {...attributes}>
      {!isDragging && (
        <div style={{ position: 'absolute', right: 0, top: 4, bottom: 4, width: deleteWidth, background: '#ff3b30', borderRadius: '0 10px 10px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'white', fontSize: '0.75rem', gap: 2, overflow: 'hidden' }}>
          <i className="bi bi-trash" style={{ fontSize: '1.15rem', flexShrink: 0 }} /><span>삭제</span>
        </div>
      )}
      {!isDragging && (
        <div style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: editWidth, background: '#b088f9', borderRadius: '10px 0 0 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'white', fontSize: '0.75rem', gap: 2, overflow: 'hidden' }}>
          <i className="bi bi-pencil" style={{ fontSize: '1.15rem', flexShrink: 0 }} /><span>수정</span>
        </div>
      )}
      <div
        data-item-swipe
        onTouchStart={isDragging ? undefined : onDragStart}
        onTouchMove={isDragging ? undefined : onDragMove}
        onTouchEnd={isDragging ? undefined : onDragEnd}
        onMouseDown={isDragging ? undefined : onDragStart}
        onMouseMove={isDragging ? undefined : e => { if (mouseDown.current) onDragMove(e) }}
        onMouseUp={isDragging ? undefined : onDragEnd}
        onMouseLeave={isDragging ? undefined : onDragEnd}
        style={{
          background: 'var(--bg-card)',
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? 'none' : 'transform 0.2s, box-shadow 0.2s',
          display: 'flex', alignItems: 'center', padding: '12px 4px',
          userSelect: 'none', cursor: 'grab',
          borderRadius: isEditing ? 10 : 0,
          boxShadow: isEditing ? '0 6px 24px rgba(176,136,249,0.45)' : 'none',
          position: 'relative', zIndex: isEditing ? 2 : 1,
        }}
      >
        <div {...listeners} style={{ cursor: 'grab', color: 'var(--text-muted)', marginRight: 8, padding: '4px 6px', touchAction: 'none' }}>
          <i className="bi bi-grip-vertical" />
        </div>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: isEditing ? 'rgba(176,136,249,0.18)' : 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', marginRight: 12, flexShrink: 0, transition: 'background 0.2s' }}>
          {cat.icon || '📦'}
        </div>
        <span style={{ flex: 1, fontSize: '0.95rem', fontWeight: 600, color: isEditing ? '#b088f9' : 'var(--text-primary)' }}>{cat.name}</span>
        {cat.exclude_perf && <span style={{ fontSize: '0.65rem', background: 'rgba(220,53,69,0.12)', color: '#dc3545', border: '1px solid rgba(220,53,69,0.3)', borderRadius: 6, padding: '2px 7px', fontWeight: 700, marginRight: 6 }}>실적제외</span>}
        {cat.exclude_stats && <span style={{ fontSize: '0.65rem', background: 'rgba(90,127,212,0.12)', color: '#5a7fd4', border: '1px solid rgba(90,127,212,0.3)', borderRadius: 6, padding: '2px 7px', fontWeight: 700, marginRight: 6 }}>통계제외</span>}
        {isEditing && <i className="bi bi-pencil-fill" style={{ fontSize: '0.8rem', color: '#b088f9', marginRight: 4 }} />}
      </div>
    </div>
  )
}

export default function Categories() {
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('expense')
  const [editCat, setEditCat] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ name: '', icon: '', type: 'expense', exclude_perf: false, exclude_stats: false })

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } })
  )

  const load = useCallback(() => api.get('/api/categories').then(setData).catch(console.error), [])
  useEffect(() => { load() }, [load])

  if (!data) return <div className="text-center py-5"><div className="spinner-border" style={{ color: '#b088f9' }} /></div>

  const cats = tab === 'expense' ? data.expense : data.income

  async function handleDragEnd(e) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = cats.findIndex(c => c.id === active.id)
    const newIdx = cats.findIndex(c => c.id === over.id)
    const newOrder = arrayMove(cats, oldIdx, newIdx)
    if (tab === 'expense') setData(d => ({ ...d, expense: newOrder }))
    else setData(d => ({ ...d, income: newOrder }))
    await api.post('/api/categories/reorder', { ids: newOrder.map(c => c.id) })
  }

  async function handleSave() {
    if (!form.name.trim()) return
    if (editCat) await api.put(`/api/categories/${editCat.id}`, { name: form.name, icon: form.icon, exclude_perf: form.exclude_perf, exclude_stats: form.exclude_stats })
    else await api.post('/api/categories', { name: form.name, icon: form.icon, type: form.type || tab, exclude_perf: form.exclude_perf, exclude_stats: form.exclude_stats })
    setEditCat(null); setAddOpen(false); setForm({ name: '', icon: '', type: tab, exclude_perf: false, exclude_stats: false }); load()
  }

  async function handleDelete(id) {
    if (!confirm('이 카테고리를 삭제할까요?')) return
    await api.delete(`/api/categories/${id}`)
    load()
  }

  const formEl = (
    <div className="card mb-3" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
      <div className="card-body">
        <h6 className="fw-bold mb-3">{editCat ? '카테고리 수정' : '카테고리 추가'}</h6>
        <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
          <input className="form-control text-center" placeholder="🙂" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} style={{ fontSize: '1.3rem', width: 48, flexShrink: 0, padding: '0 4px', height: 38 }} />
          <input className="form-control" placeholder="카테고리 이름" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ flex: 1, height: 38 }} />
          {!editCat && (
            <select className="form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, exclude_perf: false, exclude_stats: false }))} style={{ width: 74, flexShrink: 0, height: 38, padding: '0 8px' }}>
              <option value="expense">지출</option>
              <option value="income">수입</option>
            </select>
          )}
          <button className="btn btn-sm" onClick={handleSave} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, flexShrink: 0, height: 38, width: 52 }}>저장</button>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => { setEditCat(null); setAddOpen(false); setForm({ name: '', icon: '', type: tab, exclude_perf: false, exclude_stats: false }) }} style={{ borderRadius: 10, flexShrink: 0, height: 38, width: 52 }}>취소</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border-light)' }} />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>기본 설정 · 내역 추가 시 자동 적용</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border-light)' }} />
        </div>
        {(form.type === 'expense' || (editCat && editCat.type === 'expense')) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <label style={{ flex: 1, fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: 0, cursor: 'pointer' }} onClick={() => setForm(f => ({ ...f, exclude_perf: !f.exclude_perf }))}>
              💱 카드 실적에서 제외
            </label>
            <div className="ios-toggle" onClick={() => setForm(f => ({ ...f, exclude_perf: !f.exclude_perf }))}>
              <div className={`ios-track${form.exclude_perf ? ' on' : ''}`} />
              <div className={`ios-dot${form.exclude_perf ? ' on' : ''}`} />
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <label style={{ flex: 1, fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: 0, cursor: 'pointer' }} onClick={() => setForm(f => ({ ...f, exclude_stats: !f.exclude_stats }))}>
            📊 통계에서 제외
          </label>
          <div className="ios-toggle" onClick={() => setForm(f => ({ ...f, exclude_stats: !f.exclude_stats }))}>
            <div className={`ios-track${form.exclude_stats ? ' on' : ''}`} />
            <div className={`ios-dot${form.exclude_stats ? ' on' : ''}`} />
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h5 className="mb-0 fw-bold">카테고리</h5>
          <span style={{ fontSize: '0.75rem', background: 'rgba(176,136,249,0.15)', color: '#b088f9', borderRadius: 20, padding: '2px 9px', fontWeight: 600 }}>{cats.length}</span>
        </div>
        {!addOpen && !editCat && (
          <button className="btn btn-sm px-3" onClick={() => { setAddOpen(true); setForm({ name: '', icon: '', type: tab }) }} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>
            <i className="bi bi-plus-lg me-1" />추가
          </button>
        )}
      </div>

      <div className="mb-3">
        <SlidingTabs options={[['expense', '지출'], ['income', '수입']]} value={tab} onChange={setTab} />
      </div>

      {addOpen && !editCat && formEl}

      <div className="card" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <div className="card-body">
          {cats.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>카테고리가 없습니다</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={cats.map(c => c.id)} strategy={verticalListSortingStrategy}>
                {cats.map((cat, i) => (
                  <div key={cat.id}>
                    <div style={{ borderBottom: i < cats.length - 1 && editCat?.id !== cat.id ? '1px solid var(--border-light)' : 'none' }}>
                      <SortableItem cat={cat} onEdit={c => { setEditCat(c); setAddOpen(false); setForm({ name: c.name, icon: c.icon, type: c.type, exclude_perf: c.exclude_perf || false, exclude_stats: c.exclude_stats || false }) }} onDelete={handleDelete} isEditing={editCat?.id === cat.id} />
                    </div>
                    {editCat?.id === cat.id && (
                      <div style={{ padding: '10px 0 4px' }}>
                        {formEl}
                      </div>
                    )}
                  </div>
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
    </div>
  )
}
