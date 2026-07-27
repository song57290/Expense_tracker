import { Link, useLocation } from 'react-router-dom'
import { useRef, useEffect } from 'react'

const ITEMS = [
  { path: '/budget', icon: 'bi-wallet2', label: '예산' },
  { path: '/calendar', icon: 'bi-calendar3', label: '캘린더' },
  { path: '/stats', icon: 'bi-pie-chart', label: '통계' },
  { path: '/salary', icon: 'bi-cash-coin', label: '월급' },
  { path: '/settings', icon: 'bi-gear', label: '설정' },
]

export default function BottomNav() {
  const { pathname } = useLocation()
  const tabRefs = useRef([])
  const indRef = useRef(null)
  const navRef = useRef(null)
  const prevIdxRef = useRef(null)

  const currentIdx = ITEMS.findIndex(it => it.path === pathname)

  useEffect(() => {
    const ind = indRef.current
    if (!ind) return
    if (currentIdx < 0) { ind.style.opacity = '0'; return }
    const curTab = tabRefs.current[currentIdx]
    if (!curTab) return

    const prevIdx = prevIdxRef.current
    const prevTab = prevIdx != null && prevIdx >= 0 && prevIdx !== currentIdx ? tabRefs.current[prevIdx] : null

    if (prevTab) {
      ind.style.transition = 'none'
      ind.style.left = prevTab.offsetLeft + 'px'
      ind.style.width = prevTab.offsetWidth + 'px'
      ind.style.opacity = '1'
      ind.getBoundingClientRect()
      ind.style.transition = 'left 0.35s cubic-bezier(0.25,0.46,0.45,0.94),width 0.35s cubic-bezier(0.25,0.46,0.45,0.94)'
    } else {
      ind.style.transition = 'none'
      ind.style.opacity = currentIdx >= 0 ? '1' : '0'
    }
    ind.style.left = curTab.offsetLeft + 'px'
    ind.style.width = curTab.offsetWidth + 'px'
    prevIdxRef.current = currentIdx
  }, [currentIdx])

  // 키보드가 열릴 때 하단바가 올라오지 않도록 고정
  // 이전 visualViewport 방식은 레이아웃 뷰포트가 줄어드는 경우 0으로 잘못 계산됨
  // window.innerHeight 기준으로 초기 높이 대비 차이를 직접 계산
  useEffect(() => {
    const el = navRef.current
    if (!el) return

    let baseH = window.innerHeight
    let baseW = window.innerWidth

    const update = () => {
      const curW = window.innerWidth
      // 화면 회전 등으로 가로폭이 바뀌면 기준 높이 재설정
      if (Math.abs(curW - baseW) > 50) {
        baseH = window.innerHeight
        baseW = curW
        el.style.transform = ''
        return
      }
      // 키보드가 열리면 window.innerHeight가 줄어듦 → 줄어든 만큼 아래로 밀어 제자리 고정
      const keyboardH = Math.max(0, baseH - window.innerHeight)
      el.style.transform = keyboardH > 150 ? `translateY(${keyboardH}px)` : ''
    }

    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return (
    <nav ref={navRef} className="bottom-nav d-lg-none">
      <div className="d-flex justify-content-around py-2" style={{ position: 'relative' }}>
        <div ref={indRef} style={{
          position: 'absolute', top: 4, bottom: 4,
          background: 'rgba(255,255,255,0.18)', borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.55)',
          boxShadow: '0 2px 10px rgba(0,0,0,0.12),inset 0 1px 0 rgba(255,255,255,0.5)',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          pointerEvents: 'none', zIndex: 0, opacity: 0
        }} />
        {ITEMS.map(({ path, icon, label }, i) => (
          <Link key={path} to={path} ref={el => tabRefs.current[i] = el}
            style={{ color: 'white', textDecoration: 'none', padding: '4px 20px', position: 'relative', zIndex: 1 }}
            className="text-center">
            <i className={`bi ${icon} fs-5 d-block`} />
            <small style={{ fontSize: 10 }}>{label}</small>
          </Link>
        ))}
      </div>
    </nav>
  )
}
