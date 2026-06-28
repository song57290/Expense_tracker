import { Link, useLocation } from 'react-router-dom'

const ITEMS = [
  { path: '/cards', icon: 'bi-credit-card', label: '카드' },
  { path: '/calendar', icon: 'bi-calendar3', label: '캘린더' },
  { path: '/stats', icon: 'bi-pie-chart', label: '통계' },
  { path: '/budget', icon: 'bi-wallet2', label: '예산' },
  { path: '/categories', icon: 'bi-grid', label: '목록' },
]

export default function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav className="bottom-nav d-lg-none">
      <div className="d-flex justify-content-around py-2">
        {ITEMS.map(({ path, icon, label }) => (
          <Link key={path} to={path} className={pathname === path ? 'active' : ''}>
            <i className={`bi ${icon} fs-5`} />
            <small style={{ fontSize: 10 }}>{label}</small>
          </Link>
        ))}
      </div>
    </nav>
  )
}
