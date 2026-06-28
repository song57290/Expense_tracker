import { useNavigate } from 'react-router-dom'

export default function Navbar({ onMenuClick }) {
  const navigate = useNavigate()
  return (
    <div className="px-3 pt-3">
      <nav className="app-navbar d-flex align-items-center justify-content-between mb-4">
        <div className="d-flex align-items-center gap-3">
          <button onClick={onMenuClick} className="nav-icon-btn nav-icon-btn-lg d-none d-lg-flex">
            <i className="bi bi-list" />
          </button>
          <span className="fw-bold fs-5" style={{ color: 'white', textShadow: '0 0 16px rgba(255,255,255,0.7)', cursor: 'pointer' }} onClick={() => navigate('/')}>
            나의 가계부
          </span>
        </div>
        <div className="d-flex align-items-center gap-3">
          <button
            className="nav-icon-btn nav-icon-btn-sm d-lg-none"
            onClick={() => window.openNotifySheet && window.openNotifySheet()}
          >
            <i className="bi bi-bell" />
          </button>
          <button className="d-lg-none border-0 p-0" style={{ background: 'none' }} onClick={() => navigate('/')}>
            <i className="bi bi-house" style={{ fontSize: '1.6rem', color: 'white', textShadow: '0 0 12px rgba(255,255,255,0.6)' }} />
          </button>
          <button onClick={() => navigate('/')} className="nav-icon-btn nav-icon-btn-lg d-none d-lg-flex">
            <i className="bi bi-house" style={{ fontSize: '1.2rem' }} />
          </button>
        </div>
      </nav>
    </div>
  )
}
