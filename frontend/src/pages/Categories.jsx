import { useState, useEffect, useCallback } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import api from '../api.js'

function SortableItem({ cat, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 999 : 'auto' }

  return (
    <div ref={setNodeRef} style={style} className="d-flex align-items-center py-3 px-1" {...attributes}>
      <div {...listeners} style={{ cursor: 'grab', color: '#ccc', marginRight: 12, padding: '4px 8px', touchAction: 'none' }}>
        <i className="bi bi-grip-vertical" />
      </div>
      <span style={{ fontSize: '1.4rem', marginRight: 10 }}>{cat.icon}</span>
      <span style={{ flex: 1, fontSize: '0.95rem', fontWeight: 600 }}>{cat.name}</span>
      <div className="d-flex gap-2">
        <button className="btn btn-sm btn-outline-secondary" onClick={() => onEdit(cat)}><i className="bi bi-pencil" /></button>
        <button className="btn btn-sm btn-outline-danger" onClick={() => onDelete(cat.id)}><i className="bi bi-trash" /></button>
      </div>
    </div>
  )
}

export default function Categories() {
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('expense')
  const [editCat, setEditCat] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ name: '', icon: '📦', type: 'expense' })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 300, tolerance: 8 } }))

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
    if (editCat) await api.put(`/api/categories/${editCat.id}`, { name: form.name, icon: form.icon })
    else await api.post('/api/categories', { name: form.name, icon: form.icon, type: form.type || tab })
    setEditCat(null); setAddOpen(false); setForm({ name: '', icon: '📦', type: tab }); load()
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
        <div className="row g-2">
          <div className="col-3">
            <input className="form-control text-center" placeholder="아이콘" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} style={{ fontSize: '1.3rem' }} />
          </div>
          <div className="col-9">
            <input className="form-control" placeholder="카테고리 이름" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          {!editCat && (
            <div className="col-12">
              <select className="form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="expense">지출</option>
                <option value="income">수입</option>
              </select>
            </div>
          )}
        </div>
        <div className="d-flex justify-content-end gap-2 mt-3">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => { setEditCat(null); setAddOpen(false); setForm({ name: '', icon: '📦', type: tab }) }}>취소</button>
          <button className="btn btn-sm px-4" onClick={handleSave} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>저장</button>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0 fw-bold">카테고리</h5>
        {!addOpen && !editCat && (
          <button className="btn btn-sm px-3" onClick={() => { setAddOpen(true); setForm({ name: '', icon: '📦', type: tab }) }} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>
            <i className="bi bi-plus-lg me-1" />추가
          </button>
        )}
      </div>

      <div className="d-flex gap-2 mb-3">
        {[['expense', '지출'], ['income', '수입']].map(([val, label]) => (
          <button key={val} onClick={() => setTab(val)} className={`pill-btn ${tab === val ? 'pill-active' : 'pill-inactive'}`}>{label}</button>
        ))}
      </div>

      {addOpen && !editCat && formEl}
      {editCat && formEl}

      <div className="card" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <div className="card-body">
          {cats.length === 0 ? (
            <p style={{ color: '#aaa', textAlign: 'center' }}>카테고리가 없습니다</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={cats.map(c => c.id)} strategy={verticalListSortingStrategy}>
                {cats.map((cat, i) => (
                  <div key={cat.id} style={{ borderBottom: i < cats.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                    <SortableItem cat={cat} onEdit={c => { setEditCat(c); setAddOpen(false); setForm({ name: c.name, icon: c.icon, type: c.type }) }} onDelete={handleDelete} />
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
