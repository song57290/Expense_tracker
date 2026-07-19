import { useState, useRef } from 'react'

export default function SwipeItem({ children, onDelete, onEdit }) {
  const startX = useRef(null)
  const startY = useRef(null)
  const [offsetX, setOffsetX] = useState(0)
  const horiz = useRef(false)
  const mouseDown = useRef(false)

  const getClientXY = e => e.touches ? [e.touches[0].clientX, e.touches[0].clientY] : [e.clientX, e.clientY]

  const onDragStart = e => {
    const [cx, cy] = getClientXY(e)
    if (!e.touches) {
      startX.current = cx; startY.current = cy; horiz.current = true; mouseDown.current = true; setOffsetX(0); return
    }
    const wrap = e.currentTarget.closest('.page-wrap')
    const rect = wrap ? wrap.getBoundingClientRect() : { left: 0, width: window.innerWidth }
    const relX = cx - rect.left
    if (relX < 80 || relX > rect.width - 80) return
    startX.current = cx; startY.current = cy; horiz.current = false; setOffsetX(0)
  }

  const onDragMove = e => {
    if (startX.current === null) return
    const [cx, cy] = getClientXY(e)
    const dx = startX.current - cx, dy = startY.current - cy
    if (!horiz.current) {
      if (Math.abs(dy) > Math.abs(dx)) { startX.current = null; return }
      if (Math.abs(dx) > 8) horiz.current = true; else return
    }
    setOffsetX(Math.max(-110, Math.min(110, -dx)))
  }

  const onDragEnd = () => {
    mouseDown.current = false
    if (startX.current === null) return
    const cur = offsetX; startX.current = null
    if (cur < -60) { setOffsetX(0); onDelete() }
    else if (cur > 60) { setOffsetX(0); onEdit() }
    else setOffsetX(0)
  }

  const deleteWidth = Math.max(0, -offsetX)
  const editWidth = Math.max(0, offsetX)

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: deleteWidth, background: '#dc3545', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', color: 'white', fontSize: '0.82rem', fontWeight: 600, gap: 6, overflow: 'hidden' }}>
        <i className="bi bi-trash" style={{ fontSize: '1rem', flexShrink: 0 }} /><span style={{ whiteSpace: 'nowrap' }}>삭제</span>
      </div>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: editWidth, background: '#198754', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', color: 'white', fontSize: '0.82rem', fontWeight: 600, gap: 6, overflow: 'hidden' }}>
        <i className="bi bi-pencil" style={{ fontSize: '1rem', flexShrink: 0 }} /><span style={{ whiteSpace: 'nowrap' }}>수정</span>
      </div>
      <div data-item-swipe style={{ position: 'relative', zIndex: 1, background: 'var(--bg-card)', transform: `translateX(${offsetX}px)`, transition: offsetX === 0 ? 'transform 0.22s ease' : 'none', cursor: 'grab', userSelect: 'none' }}
        onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
        onMouseDown={onDragStart} onMouseMove={e => { if (mouseDown.current) onDragMove(e) }} onMouseUp={onDragEnd} onMouseLeave={onDragEnd}>
        {children}
      </div>
    </div>
  )
}
