import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

const FRAME_SIZE = 280
const OUTPUT_SIZE = 512
const MIN_ZOOM = 1
const MAX_ZOOM = 4

// The frame itself (not a small box inside it) is the crop area: drag anywhere
// in the photo to pan it, pinch with two fingers anywhere in the photo to zoom
// it — matches how photo/profile-picture croppers usually work.
export default function ImageCropper({ file, onCancel, onConfirm }) {
  const [imgUrl, setImgUrl] = useState(null)
  const [natural, setNatural] = useState(null) // { w, h }
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef(null) // { mode: 'pan'|'pinch', ...mode-specific fields }
  const imgRef = useRef(null)
  const frameRef = useRef(null)

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setImgUrl(url)
    setNatural(null)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    return () => URL.revokeObjectURL(url)
  }, [file])

  const baseScale = natural ? Math.max(FRAME_SIZE / natural.w, FRAME_SIZE / natural.h) : 1
  const scale = baseScale * zoom
  const dispW = natural ? natural.w * scale : FRAME_SIZE
  const dispH = natural ? natural.h * scale : FRAME_SIZE

  function clampOffset(o, dw, dh) {
    const maxX = Math.max(0, (dw - FRAME_SIZE) / 2)
    const maxY = Math.max(0, (dh - FRAME_SIZE) / 2)
    return { x: Math.max(-maxX, Math.min(maxX, o.x)), y: Math.max(-maxY, Math.min(maxY, o.y)) }
  }

  function onImgLoad(e) {
    setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })
  }

  function dist(t0, t1) { return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY) }

  function startPan(clientX, clientY) {
    dragRef.current = { mode: 'pan', startX: clientX, startY: clientY, offset: { ...offset } }
  }
  function startPinch(t0, t1) {
    dragRef.current = { mode: 'pinch', initialDist: dist(t0, t1), initialZoom: zoom, offset: { ...offset } }
  }

  useEffect(() => {
    function applyZoom(newZoom) {
      const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))
      const newScale = baseScale * clampedZoom
      const newDispW = natural ? natural.w * newScale : FRAME_SIZE
      const newDispH = natural ? natural.h * newScale : FRAME_SIZE
      setZoom(clampedZoom)
      setOffset(o => clampOffset(o, newDispW, newDispH))
    }
    function handleMouseMove(e) {
      const d = dragRef.current
      if (!d || d.mode !== 'pan') return
      const dx = e.clientX - d.startX, dy = e.clientY - d.startY
      setOffset(clampOffset({ x: d.offset.x + dx, y: d.offset.y + dy }, dispW, dispH))
    }
    function handleWheel(e) {
      e.preventDefault()
      applyZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))
    }
    function handleTouchMove(e) {
      const d = dragRef.current
      if (!d) return
      if (e.cancelable) e.preventDefault()
      if (d.mode === 'pan' && e.touches.length === 1) {
        const p = e.touches[0]
        const dx = p.clientX - d.startX, dy = p.clientY - d.startY
        setOffset(clampOffset({ x: d.offset.x + dx, y: d.offset.y + dy }, dispW, dispH))
      } else if (d.mode === 'pinch' && e.touches.length === 2) {
        const newDist = dist(e.touches[0], e.touches[1])
        applyZoom(d.initialZoom * (newDist / d.initialDist))
      }
    }
    function handleUp() { dragRef.current = null }
    const frame = frameRef.current
    if (!frame) return
    frame.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleUp)
    window.addEventListener('touchcancel', handleUp)
    return () => {
      frame.removeEventListener('wheel', handleWheel)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleUp)
      window.removeEventListener('touchcancel', handleUp)
    }
  }, [zoom, dispW, dispH, natural, baseScale])

  if (!file) return null

  function onFrameTouchStart(e) {
    if (e.touches.length === 2) startPinch(e.touches[0], e.touches[1])
    else if (e.touches.length === 1) startPan(e.touches[0].clientX, e.touches[0].clientY)
  }

  function confirm() {
    if (!natural || !imgRef.current) return
    const srcSize = FRAME_SIZE / scale
    const srcX = (dispW / 2 - FRAME_SIZE / 2 - offset.x) / scale
    const srcY = (dispH / 2 - FRAME_SIZE / 2 - offset.y) / scale
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext('2d')
    ctx.drawImage(imgRef.current, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
    canvas.toBlob(blob => {
      if (!blob) return
      onConfirm(new File([blob], 'logo.png', { type: 'image/png' }))
    }, 'image/png')
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: 20, width: '100%', maxWidth: 340, boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <span className="fw-bold" style={{ fontSize: '1rem' }}>로고 위치·크기 조정</span>
          <button onClick={onCancel} style={{ background: 'var(--bg-section)', border: 'none', width: 28, height: 28, borderRadius: 14, fontSize: '1.05rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>&times;</button>
        </div>
        <div
          ref={frameRef}
          onMouseDown={e => startPan(e.clientX, e.clientY)}
          onTouchStart={onFrameTouchStart}
          style={{ width: FRAME_SIZE, height: FRAME_SIZE, margin: '0 auto', overflow: 'hidden', position: 'relative', borderRadius: 16, background: '#111', touchAction: 'none', cursor: 'move' }}
        >
          {imgUrl && (
            <img ref={imgRef} src={imgUrl} onLoad={onImgLoad} draggable={false}
              style={{
                position: 'absolute', left: '50%', top: '50%',
                width: dispW, height: dispH,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
                userSelect: 'none', pointerEvents: 'none',
              }} />
          )}
          <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(255,255,255,0.5)', borderRadius: 16, pointerEvents: 'none' }} />
        </div>
        <p className="text-muted text-center mb-3 mt-2" style={{ fontSize: '0.75rem' }}>
          드래그로 위치 이동, 두 손가락으로 오므리거나 벌려서 확대·축소<br />(PC: 마우스 휠로 확대·축소)
        </p>
        <div className="d-flex gap-2">
          <button type="button" onClick={confirm}
            style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
            적용
          </button>
          <button type="button" onClick={onCancel}
            style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1.5px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
            취소
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
