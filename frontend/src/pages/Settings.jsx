import { useState, useEffect } from 'react'
import api from '../api.js'

export default function Settings() {
  const [user, setUser] = useState(null)
  const [nicknameEdit, setNicknameEdit] = useState(false)
  const [nicknameVal, setNicknameVal] = useState('')
  const [nicknameSaving, setNicknameSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    api.get('/api/me').then(d => { setUser(d.user); setNicknameVal(d.user?.nickname || '') }).catch(() => {})
  }, [])

  async function saveNickname() {
    setNicknameSaving(true)
    try {
      const d = await api.post('/api/update-nickname', { nickname: nicknameVal.trim() })
      if (d.ok) {
        setUser(u => ({ ...u, nickname: d.nickname }))
        setNicknameEdit(false)
        window.dispatchEvent(new CustomEvent('userUpdated'))
      }
    } finally {
      setNicknameSaving(false)
    }
  }

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
    window.location.href = '/login'
  }

  async function handleDeleteAccount() {
    if (deleteInput !== user?.email) return
    setDeleting(true)
    try {
      await api.post('/api/delete-account', {})
      window.location.href = '/login'
    } finally {
      setDeleting(false)
    }
  }

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e8e8e8', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }

  return (
    <div>
      <h5 className="fw-bold mb-3">설정</h5>

      {/* 닉네임 변경 */}
      <div className="card mb-3" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          <div className="fw-semibold mb-1" style={{ fontSize: '0.88rem', color: '#888' }}>닉네임</div>
          {!nicknameEdit ? (
            <div className="d-flex justify-content-between align-items-center">
              <span style={{ fontSize: '1rem', fontWeight: 600 }}>{user?.nickname || '(없음)'}</span>
              <button onClick={() => { setNicknameVal(user?.nickname || ''); setNicknameEdit(true) }}
                style={{ background: '#f0eeff', border: 'none', borderRadius: 10, padding: '7px 14px', color: '#b088f9', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                변경
              </button>
            </div>
          ) : (
            <div>
              <input
                type="text"
                value={nicknameVal}
                onChange={e => setNicknameVal(e.target.value)}
                placeholder="닉네임 입력"
                style={{ ...inputStyle, marginBottom: 10 }}
                onFocus={e => e.target.style.borderColor = '#b088f9'}
                onBlur={e => e.target.style.borderColor = '#e8e8e8'}
                autoFocus
                maxLength={30}
              />
              <div className="d-flex gap-2">
                <button onClick={saveNickname} disabled={nicknameSaving}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', opacity: nicknameSaving ? 0.7 : 1 }}>
                  {nicknameSaving ? '저장 중...' : '저장'}
                </button>
                <button onClick={() => setNicknameEdit(false)}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: '#f2f2f7', color: '#666', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 계정 */}
      <div className="card mb-3" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          <div className="fw-semibold mb-1" style={{ fontSize: '0.88rem', color: '#888' }}>계정</div>
          <div className="text-muted mb-3" style={{ fontSize: '0.82rem' }}>{user?.email}</div>
          <button onClick={handleLogout}
            style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: '#fff0f0', color: '#dc3545', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
            로그아웃
          </button>
        </div>
      </div>

      {/* 회원 탈퇴 */}
      <div className="card mb-3" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          <div className="fw-semibold mb-1" style={{ fontSize: '0.88rem', color: '#888' }}>위험 구역</div>
          {!deleteConfirm ? (
            <button onClick={() => setDeleteConfirm(true)}
              style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: '1.5px solid #dc3545', background: 'white', color: '#dc3545', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
              회원 탈퇴
            </button>
          ) : (
            <div>
              <p style={{ fontSize: '0.85rem', color: '#dc3545', marginBottom: 10 }}>
                탈퇴하면 모든 데이터가 삭제되며 복구할 수 없습니다.<br />
                확인을 위해 이메일 주소를 입력하세요.
              </p>
              <input
                type="email"
                value={deleteInput}
                onChange={e => setDeleteInput(e.target.value)}
                placeholder={user?.email}
                style={{ ...inputStyle, borderColor: '#ffcdd2', marginBottom: 10 }}
              />
              <div className="d-flex gap-2">
                <button onClick={handleDeleteAccount}
                  disabled={deleteInput !== user?.email || deleting}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: deleteInput === user?.email ? '#dc3545' : '#eee', color: deleteInput === user?.email ? 'white' : '#aaa', fontWeight: 600, fontSize: '0.9rem', cursor: deleteInput === user?.email ? 'pointer' : 'not-allowed' }}>
                  {deleting ? '처리 중...' : '탈퇴 확인'}
                </button>
                <button onClick={() => { setDeleteConfirm(false); setDeleteInput('') }}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: '#f2f2f7', color: '#666', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="d-lg-none" style={{ height: 90 }} />
    </div>
  )
}
