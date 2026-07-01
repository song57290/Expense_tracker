export default function Settings() {
  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
    window.location.href = '/login'
  }

  return (
    <div>
      <div className="card" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <div className="fw-semibold" style={{ fontSize: '0.95rem' }}>계정</div>
              <div className="text-muted" style={{ fontSize: '0.78rem' }}>로그아웃하면 다시 로그인이 필요합니다</div>
            </div>
            <button onClick={handleLogout}
              style={{ background: '#fff0f0', border: 'none', borderRadius: 10, padding: '8px 16px', color: '#dc3545', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}>
              로그아웃
            </button>
          </div>
        </div>
      </div>
      <div className="d-lg-none" style={{ height: 90 }} />
    </div>
  )
}
