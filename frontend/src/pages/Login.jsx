import { useState } from 'react'

export default function Login({ onLogin }) {
  const [tab, setTab] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const url = tab === 'login' ? '/api/login' : '/api/register'
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || '오류가 발생했습니다'); return }
      onLogin({ email: d.email })
    } catch {
      setError('서버에 연결할 수 없습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#b088f9 0%,#7baff0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 24, width: '100%', maxWidth: 380, padding: '32px 28px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, background: 'linear-gradient(135deg,#b088f9,#7baff0)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: '1.6rem' }}>
            💰
          </div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#1c1c1e', margin: 0 }}>나의 가계부</h1>
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', background: '#f0eeff', borderRadius: 14, padding: 4, marginBottom: 24 }}>
          {['login', 'register'].map(t => (
            <button key={t} onClick={() => { setTab(t); setError('') }}
              style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                background: tab === t ? 'white' : 'transparent',
                color: tab === t ? '#b088f9' : '#999',
                boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
              {t === 'login' ? '로그인' : '회원가입'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#888', marginBottom: 6 }}>이메일</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="example@email.com"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #e8e8e8', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box', transition: 'border 0.2s' }}
              onFocus={e => e.target.style.borderColor = '#b088f9'}
              onBlur={e => e.target.style.borderColor = '#e8e8e8'}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#888', marginBottom: 6 }}>비밀번호 {tab === 'register' && <span style={{ color: '#bbb' }}>(6자 이상)</span>}</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #e8e8e8', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box', transition: 'border 0.2s' }}
              onFocus={e => e.target.style.borderColor = '#b088f9'}
              onBlur={e => e.target.style.borderColor = '#e8e8e8'}
            />
          </div>

          {error && (
            <div style={{ background: '#fff0f0', border: '1px solid #ffcdd2', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: '#e53935' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontSize: '0.95rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s' }}>
            {loading ? '처리 중...' : (tab === 'login' ? '로그인' : '가입하기')}
          </button>
        </form>
      </div>
    </div>
  )
}
