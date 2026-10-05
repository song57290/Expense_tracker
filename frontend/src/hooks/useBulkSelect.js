import { useEffect, useRef, useState, useCallback } from 'react'

// 내역 목록 길게 누르기 선택 (홈·캘린더 공용)
// - 목록 영역은 data-manual-scroll 속성을 가지며 touch-action: none으로 두어, 브라우저 기본 스크롤이
//   처음부터 시작되지 않게 한다. 스크롤은 아래 touchmove에서 직접 처리한다.
//   data-manual-scroll="el" 이면 그 요소를, 그 외에는 window를 스크롤한다.
// - 길게 누르면 선택 모드에 들어가고, 손을 떼지 않은 채 끌면 지나가는 내역이 선택된다.
//   화면 가장자리에 손가락이 있으면 자동으로 스크롤된다.
export default function useBulkSelect() {
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const suppressRef = useRef(false)
  const pressRef = useRef({
    timer: null, active: false, x: 0, y: 0, startX: 0, startY: 0, lastId: null, frame: 0, tick: null, lastTick: null, order: [], anchorId: null, base: [],
    manual: false, scrollEl: null, lastTouchY: 0, lastTouchT: 0, velocity: 0, inertia: 0, startTX: 0, startTY: 0, axis: null,
  })

  useEffect(() => {
    const p = pressRef.current

    // behavior를 instant로 강제한다 — 부트스트랩 reboot이 :root에 scroll-behavior: smooth를 걸어서
    // 기본 scrollBy는 매 요청의 이동량을 줄여버린다 (예산 탭 자동 스크롤과 같은 이유)
    function scrollBy(dy) {
      const opt = { top: dy, behavior: 'instant' }
      if (p.scrollEl) p.scrollEl.scrollBy(opt)
      else window.scrollBy(opt)
    }

    // 드래그 중 프레임마다 가장자리 확인 → 자동 스크롤 → 손가락 아래 내역 선택
    const EDGE_ZONE = 120 // 가장자리 안쪽 폭(px). 안으로 깊이 들어갈수록 빨라진다
    const MAX_SPEED = 900 // px/초, 가장자리 끝에서의 최대 속도
    // 손가락 아래의 모든 요소를 훑어서 내역 행을 찾는다 — 선택 바의 버튼이 위에 떠 있어도 그 아래 행을 잡는다
    function rowAt(x, y) {
      for (const el of document.elementsFromPoint(x, y)) {
        const row = el.closest?.('[data-tx-id]')
        if (row) return row
      }
      return null
    }
    const tick = () => {
      if (!p.active) { p.frame = 0; p.lastTick = null; return }
      const now = performance.now()
      const dt = p.lastTick ? Math.min((now - p.lastTick) / 1000, 0.1) : 0
      p.lastTick = now
      const el = p.scrollEl
      const bar = document.querySelector('[data-bulk-bar]')
      const top = el ? el.getBoundingClientRect().top : 0
      // 아래쪽 기준선은 하단 선택 바의 윗부분 (바가 없으면 화면 아래)
      const bottom = el ? el.getBoundingClientRect().bottom : (bar ? bar.getBoundingClientRect().top : window.innerHeight)
      const topEdge = top + (el ? 50 : 0)
      const bottomEdge = bottom - (el ? 50 : 40)
      let dy = 0
      if (dt > 0 && p.y > bottomEdge) dy = MAX_SPEED * Math.min(1, (p.y - bottomEdge) / EDGE_ZONE) * dt
      else if (dt > 0 && p.y < topEdge + EDGE_ZONE) dy = -MAX_SPEED * Math.min(1, (topEdge + EDGE_ZONE - p.y) / EDGE_ZONE) * dt
      if (dy) scrollBy(dy)
      const row = rowAt(p.x, p.y)
      if (row) {
        const id = Number(row.dataset.txId)
        if (id !== p.lastId) {
          // 빠르게 끌면 프레임 사이에 내역을 건너뛰므로, 마지막 선택 내역과 현재 내역 사이를 모두 채운다
          const from = p.order.indexOf(p.anchorId)
          const to = p.order.indexOf(id)
          const range = from >= 0 && to >= 0 ? p.order.slice(Math.min(from, to), Math.max(from, to) + 1) : [id]
          p.lastId = id
          // 드래그 전에 선택돼 있던 내역은 유지하고, 그 위에 앵커~현재 구간을 얹는다
          setSelectedIds([...p.base, ...range.filter(x => !p.base.includes(x))])
        }
      }
      p.frame = requestAnimationFrame(tick)
    }
    p.tick = tick

    const onTouchStart = e => {
      const t = e.touches[0]
      cancelAnimationFrame(p.inertia)
      const box = e.target?.closest?.('[data-manual-scroll]')
      p.manual = !!box
      p.scrollEl = box && box.dataset.manualScroll === 'el' ? box : null
      p.velocity = 0
      p.axis = null
      if (t) {
        p.startTX = t.clientX
        p.startTY = t.clientY
        p.lastTouchY = t.clientY
        p.lastTouchT = performance.now()
      }
    }

    const onTouchMove = e => {
      const t = e.touches[0]
      if (!t) return
      if (p.active) { if (e.cancelable) e.preventDefault(); return }
      if (p.timer && Math.hypot(t.clientX - p.startX, t.clientY - p.startY) > 10) {
        clearTimeout(p.timer)
        p.timer = null
      }
      if (!p.manual) return
      // 가로로 미는 동작은 스와이프 삭제/수정에 양보한다
      if (!p.axis) {
        const adx = Math.abs(t.clientX - p.startTX)
        const ady = Math.abs(t.clientY - p.startTY)
        if (adx > 8 || ady > 8) p.axis = adx > ady ? 'x' : 'y'
      }
      if (p.axis === 'x') return
      if (e.cancelable) e.preventDefault()
      // 롱프레스 대기 중(10px 이내)에는 스크롤하지 않는다
      if (p.timer) return
      const dy = p.lastTouchY - t.clientY
      scrollBy(dy)
      const now = performance.now()
      const frames = Math.max(1, (now - p.lastTouchT) / 16)
      p.velocity = dy / frames
      p.lastTouchY = t.clientY
      p.lastTouchT = now
    }

    // 손을 떼는 순간 속도가 남아 있으면 조금 더 미끄러지게 한다 (관성)
    const onTouchEnd = () => {
      if (!p.manual || p.active || Math.abs(p.velocity) < 1) return
      const step = () => {
        if (Math.abs(p.velocity) < 0.3) return
        scrollBy(p.velocity)
        p.velocity *= 0.95
        p.inertia = requestAnimationFrame(step)
      }
      p.inertia = requestAnimationFrame(step)
    }

    const onMove = e => {
      if (!p.active) return
      p.x = e.clientX
      p.y = e.clientY
    }
    const onEnd = () => {
      clearTimeout(p.timer)
      p.timer = null
      p.active = false
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    return () => {
      cancelAnimationFrame(p.frame)
      cancelAnimationFrame(p.inertia)
      clearTimeout(p.timer)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
  }, [])

  const toggle = useCallback(id => {
    setSelectedIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]))
  }, [])

  const exit = useCallback(() => {
    const p = pressRef.current
    clearTimeout(p.timer)
    p.timer = null
    p.active = false
    setSelectMode(false)
    setSelectedIds([])
  }, [])

  // ids 전부를 선택한 상태로 선택 모드에 들어간다
  const selectAll = useCallback(ids => {
    setSelectMode(true)
    setSelectedIds(ids)
  }, [])

  // 행에 붙이는 props. onTap은 선택 모드가 아닐 때 탭 동작
  function rowProps(id, { onTap } = {}) {
    return {
      'data-tx-id': id,
      onPointerDown: e => {
        const p = pressRef.current
        clearTimeout(p.timer)
        p.x = e.clientX
        p.y = e.clientY
        p.startX = e.clientX
        p.startY = e.clientY
        p.timer = setTimeout(() => {
          p.timer = null
          p.active = true
          p.lastId = id
          p.lastTick = null
          // 화면에 보이는 내역 순서(위→아래)를 저장해 두고, 그 순서대로 구간을 채운다
          p.order = Array.from(document.querySelectorAll('[data-tx-id]'), el => Number(el.dataset.txId))
          suppressRef.current = true
          setSelectMode(true)
          setSelectedIds(ids => {
            p.base = ids
            p.anchorId = id
            return ids.includes(id) ? ids : [...ids, id]
          })
          if (!p.frame) p.frame = requestAnimationFrame(p.tick)
        }, 500)
      },
      onClick: () => {
        if (suppressRef.current) { suppressRef.current = false; return }
        if (selectMode) toggle(id)
        else onTap?.()
      },
      onContextMenu: e => e.preventDefault(),
    }
  }

  return { selectMode, selectedIds, setSelectedIds, rowProps, toggle, exit, selectAll }
}
