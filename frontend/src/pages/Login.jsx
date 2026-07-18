import { useState } from 'react'

export default function Login({ onLogin }) {
  const [tab, setTab] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // 비밀번호 찾기
  const [resetStep, setResetStep] = useState(1)
  const [resetEmail, setResetEmail] = useState('')
  const [resetCodeInput, setResetCodeInput] = useState('')
  const [resetPassword, setResetPassword] = useState('')

  function switchTab(t) { setTab(t); setError(''); setResetStep(1); setResetEmail(''); setResetCodeInput(''); setResetPassword('') }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const url = tab === 'login' ? '/api/login' : '/api/register'
      const body = { email: email.trim().toLowerCase(), password }
      if (tab === 'register') body.nickname = nickname.trim()
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || '오류가 발생했습니다'); return }
      onLogin({ email: d.email, nickname: d.nickname })
    } catch {
      setError('서버에 연결할 수 없습니다')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetRequest(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const r = await fetch('/api/reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim().toLowerCase() }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error); return }
      setResetStep(2)
    } catch {
      setError('서버에 연결할 수 없습니다')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetConfirm(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const r = await fetch('/api/reset-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim().toLowerCase(), code: resetCodeInput, password: resetPassword }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error); return }
      setError('')
      switchTab('login')
      setEmail(resetEmail)
    } catch {
      setError('서버에 연결할 수 없습니다')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--border-light)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box', transition: 'border 0.2s', background: 'var(--input-bg)', color: 'var(--text-primary)' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(135deg,#b088f9 0%,#7baff0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 24, width: '100%', maxWidth: 380, padding: '32px 28px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, background: 'linear-gradient(135deg,#b088f9,#7baff0)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: '1.6rem' }}>
            💰
          </div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>나의 가계부</h1>
        </div>

        {/* 탭 */}
        {tab !== 'reset' && (
          <div style={{ display: 'flex', background: 'var(--bg-accent)', borderRadius: 14, padding: 4, marginBottom: 24 }}>
            {['login', 'register'].map(t => (
              <button key={t} onClick={() => switchTab(t)}
                style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                  background: tab === t ? 'var(--bg-card)' : 'transparent',
                  color: tab === t ? '#b088f9' : 'var(--text-muted)',
                  boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
                {t === 'login' ? '로그인' : '회원가입'}
              </button>
            ))}
          </div>
        )}

        {/* 비밀번호 찾기 헤더 */}
        {tab === 'reset' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <button onClick={() => switchTab('login')} style={{ background: 'none', border: 'none', fontSize: '1.6rem', color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1, padding: 0, transform: 'translateY(-1px)' }}>‹</button>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>비밀번호 찾기</span>
          </div>
        )}

        {error && (
          <div style={{ background: '#fff0f0', border: '1px solid #ffcdd2', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: '#e53935' }}>
            {error}
          </div>
        )}

        {/* 로그인 / 회원가입 */}
        {tab !== 'reset' && (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>이메일</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="example@email.com"
                style={inputStyle} onFocus={e => e.target.style.borderColor = '#b088f9'} onBlur={e => e.target.style.borderColor = '#e8e8e8'} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>비밀번호 {tab === 'register' && <span style={{ color: 'var(--text-muted)' }}>(6자 이상)</span>}</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                style={inputStyle} onFocus={e => e.target.style.borderColor = '#b088f9'} onBlur={e => e.target.style.borderColor = '#e8e8e8'} />
            </div>
            {tab === 'register' && (
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>닉네임 <span style={{ color: 'var(--text-muted)' }}>(선택)</span></label>
                <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="예: 홍길동"
                  style={inputStyle} onFocus={e => e.target.style.borderColor = '#b088f9'} onBlur={e => e.target.style.borderColor = '#e8e8e8'} />
              </div>
            )}
            {tab === 'login' && (
              <div style={{ textAlign: 'right', marginBottom: 16 }}>
                <button type="button" onClick={() => switchTab('reset')} style={{ background: 'none', border: 'none', fontSize: '0.8rem', color: '#b088f9', cursor: 'pointer', padding: 0 }}>
                  비밀번호를 잊으셨나요?
                </button>
              </div>
            )}
            {tab === 'register' && <div style={{ marginBottom: 8 }} />}
            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontSize: '0.95rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? '처리 중...' : (tab === 'login' ? '로그인' : '가입하기')}
            </button>
          </form>
        )}

        {/* 비밀번호 찾기 - 1단계 */}
        {tab === 'reset' && resetStep === 1 && (
          <form onSubmit={handleResetRequest}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16 }}>가입한 이메일로 인증번호를 발송합니다.</p>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>이메일</label>
              <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} required placeholder="example@email.com"
                style={inputStyle} onFocus={e => e.target.style.borderColor = '#b088f9'} onBlur={e => e.target.style.borderColor = '#e8e8e8'} />
            </div>
            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontSize: '0.95rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? '발송 중...' : '인증번호 발송'}
            </button>
          </form>
        )}

        {/* 비밀번호 찾기 - 2단계 */}
        {tab === 'reset' && resetStep === 2 && (
          <form onSubmit={handleResetConfirm}>
            <div style={{ background: 'var(--bg-accent)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: '#b088f9', fontWeight: 600 }}>📧 인증번호를 이메일로 발송했습니다</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{resetEmail} · 30분 이내 입력</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>인증번호 6자리</label>
              <input type="text" inputMode="numeric" value={resetCodeInput} onChange={e => setResetCodeInput(e.target.value)} required placeholder="000000" maxLength={6}
                style={{ ...inputStyle, textAlign: 'center', letterSpacing: '0.2em', fontSize: '1.1rem' }}
                onFocus={e => e.target.style.borderColor = '#b088f9'} onBlur={e => e.target.style.borderColor = '#e8e8e8'} autoFocus />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>새 비밀번호 (6자 이상)</label>
              <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} required placeholder="••••••••"
                style={inputStyle} onFocus={e => e.target.style.borderColor = '#b088f9'} onBlur={e => e.target.style.borderColor = '#e8e8e8'} />
            </div>
            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontSize: '0.95rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? '처리 중...' : '비밀번호 변경'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
