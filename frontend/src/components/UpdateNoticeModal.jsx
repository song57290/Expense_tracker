import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CURRENT_VERSION, UPDATE_DATE, UPDATES, VERSION_HISTORY } from '../config/updateNotice.js'

const TAG_STYLE = {
  new: { bg: '#ede8fb', color: '#8b5cf6', label: '신기능' },
  fix: { bg: '#fce7f3', color: '#be185d', label: '버그수정' },
  imp: { bg: '#e0f2fe', color: '#0369a1', label: '개선' },
}

const ADMIN_EMAIL = 'song57290@gmail.com'

export default function UpdateNoticeModal() {
  const [visible, setVisible] = useState(false)
  const [config, setConfig] = useState({ version: CURRENT_VERSION, date: UPDATE_DATE, updates: UPDATES })
  const [historyOpen, setHistoryOpen] = useState(false)
  const [user, setUser] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ version: '', date: '', updates: '' })
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const handler = () => setVisible(true)
    window.addEventListener('showUpdateNotice', handler)
    return () => window.removeEventListener('showUpdateNotice', handler)
  }, [])

  useEffect(() => {
    fetch('/api/update-notice-config', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(d => {
        if (d.version) {
          setConfig(d)
          const seen = localStorage.getItem('update_version_seen')
          if (seen !== d.version) setVisible(true)
        }
      })
      .catch(() => {})
    fetch('/api/me', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(d => setUser(d.user))
      .catch(() => {})
  }, [])

  function close() {
    localStorage.setItem('update_version_seen', config.version)
    setVisible(false)
    setEditOpen(false)
  }

  function openEdit() {
    setEditForm({
      version: config.version,
      date: config.date,
      updates: JSON.stringify(config.updates, null, 2),
    })
    setEditError('')
    setEditOpen(true)
  }

  async function saveEdit() {
    let parsed
    try {
      parsed = JSON.parse(editForm.updates)
    } catch {
      setEditError('UPDATES 형식이 올바르지 않습니다 (JSON 오류)')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/update-notice-config', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: editForm.version, date: editForm.date, updates: parsed }),
      })
      if (res.ok) {
        setConfig({ version: editForm.version, date: editForm.date, updates: parsed })
        setEditOpen(false)
      }
    } finally {
      setSaving(false)
    }
  }

  if (!visible) return null

  const allItems = config.updates.flatMap(s => s.items)
  const newCount = allItems.filter(i => i.tag === 'new').length
  const impCount = allItems.filter(i => i.tag === 'imp').length
  const fixCount = allItems.filter(i => i.tag === 'fix').length
  const isAdmin = user?.email === ADMIN_EMAIL

  return createPortal(
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.48)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#faf8ff',
          borderRadius: '20px 20px 0 0',
          width: '100%',
          maxWidth: 540,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}
      >
        {/* 상단 스트라이프 */}
        <div style={{ height: 4, background: 'linear-gradient(90deg,#b088f9,#7baff0)', flexShrink: 0 }} />

        {/* 헤더 */}
        <div style={{ padding: '18px 20px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0, background: '#faf8ff', borderBottom: '1px solid #ede8fb' }}>
          <div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.3px', color: '#1e1a2e', lineHeight: 1.3 }}>
              <span style={{ background: 'linear-gradient(90deg,#b088f9,#7baff0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>업데이트</span> 안내
            </div>
            <div style={{ fontSize: '0.72rem', color: '#9b90b8', marginTop: 3 }}>{config.date}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isAdmin && (
                <button onClick={openEdit}
                  style={{ background: '#f0eaff', color: '#b088f9', border: 'none', borderRadius: 8, padding: '3px 10px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}>
                  편집
                </button>
              )}
              <div style={{ background: '#f0eaff', color: '#b088f9', fontSize: '0.68rem', fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>{config.version}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { count: newCount, color: '#8b5cf6', label: '신기능' },
                { count: impCount, color: '#0369a1', label: '개선' },
                { count: fixCount, color: '#be185d', label: '수정' },
              ].map(({ count, color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.68rem' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                  <span style={{ color, fontWeight: 700 }}>{label} {count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 편집 폼 (관리자) */}
        {editOpen && (
          <div style={{ padding: '16px 14px', background: '#f4f0fd', borderBottom: '1px solid #ede8fb', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input value={editForm.version} onChange={e => setEditForm(f => ({ ...f, version: e.target.value }))}
                placeholder="버전 (예: ver 2.22)" style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e0d0fd', fontSize: '0.84rem' }} />
              <input value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                placeholder="날짜 (예: 2026년 7월 7일)" style={{ flex: 2, padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e0d0fd', fontSize: '0.84rem' }} />
            </div>
            <div style={{ fontSize: '0.72rem', color: '#9b90b8', marginBottom: 4 }}>
              UPDATES 배열 (JSON) &nbsp;
              <span style={{ background: '#ede8fb', color: '#8b5cf6', borderRadius: 4, padding: '1px 5px', fontSize: '0.68rem', fontWeight: 700 }}>new 신기능</span>
              {' '}
              <span style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: 4, padding: '1px 5px', fontSize: '0.68rem', fontWeight: 700 }}>imp 개선</span>
              {' '}
              <span style={{ background: '#fce7f3', color: '#be185d', borderRadius: 4, padding: '1px 5px', fontSize: '0.68rem', fontWeight: 700 }}>fix 버그수정</span>
            </div>
            <textarea value={editForm.updates} onChange={e => setEditForm(f => ({ ...f, updates: e.target.value }))}
              rows={8} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e0d0fd', fontSize: '0.78rem', fontFamily: 'monospace', lineHeight: 1.5, resize: 'vertical' }} />
            {editError && <div style={{ color: '#dc3545', fontSize: '0.78rem', marginTop: 4 }}>{editError}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={saveEdit} disabled={saving}
                style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
                {saving ? '저장 중...' : '저장'}
              </button>
              <button onClick={() => setEditOpen(false)}
                style={{ padding: '9px 16px', borderRadius: 8, border: '1.5px solid #e0d0fd', background: 'white', color: '#aaa', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}>취소</button>
            </div>
          </div>
        )}

        {/* 스크롤 본문 */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 14px' }}>
          {config.updates.map(sec => (
            <div key={sec.section} style={{ background: '#fff', border: '1.5px solid #ede8fb', borderRadius: 14, marginBottom: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: '#f4f0fd', borderBottom: '1px solid #ede8fb', fontSize: '0.72rem', fontWeight: 700, color: '#7a728a', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {sec.section}
              </div>
              {sec.items.map((item, i) => {
                const t = TAG_STYLE[item.tag] || TAG_STYLE.imp
                return (
                  <div key={i} style={{ padding: '11px 14px', display: 'flex', alignItems: 'flex-start', gap: 9, borderBottom: i < sec.items.length - 1 ? '1px solid #f4f0fd' : 'none' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#c8c0dc', marginTop: 6, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#1e1a2e', lineHeight: 1.4 }}>{item.title}</div>
                      <div style={{ fontSize: '0.75rem', color: '#7a728a', marginTop: 2, lineHeight: 1.5 }}>{item.desc}</div>
                    </div>
                    <div style={{ background: t.bg, color: t.color, fontSize: '0.63rem', fontWeight: 700, padding: '2px 6px', borderRadius: 5, flexShrink: 0, marginTop: 2 }}>
                      {t.label}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          {/* 이전 버전 기록 */}
          {VERSION_HISTORY.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <button
                onClick={() => setHistoryOpen(o => !o)}
                style={{ width: '100%', padding: '9px 14px', background: 'none', border: '1.5px solid #ede8fb', borderRadius: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#9b90b8', fontSize: '0.78rem', fontWeight: 600 }}
              >
                <span>이전 버전 기록</span>
                <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', transform: historyOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
              </button>
              {historyOpen && VERSION_HISTORY.map(hist => (
                <div key={hist.version} style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px', marginBottom: 8 }}>
                    <div style={{ background: '#f0eaff', color: '#b088f9', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>{hist.version}</div>
                    <div style={{ fontSize: '0.68rem', color: '#c0b8d0' }}>{hist.date}</div>
                  </div>
                  {hist.updates.map(sec => (
                    <div key={sec.section} style={{ background: '#fff', border: '1.5px solid #ede8fb', borderRadius: 14, marginBottom: 8, overflow: 'hidden', opacity: 0.85 }}>
                      <div style={{ padding: '8px 14px', background: '#f9f7fe', borderBottom: '1px solid #ede8fb', fontSize: '0.68rem', fontWeight: 700, color: '#a098c0', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                        {sec.section}
                      </div>
                      {sec.items.map((item, i) => {
                        const t = TAG_STYLE[item.tag] || TAG_STYLE.imp
                        return (
                          <div key={i} style={{ padding: '9px 14px', display: 'flex', alignItems: 'flex-start', gap: 9, borderBottom: i < sec.items.length - 1 ? '1px solid #f4f0fd' : 'none' }}>
                            <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#ddd8ee', marginTop: 6, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#3a3050', lineHeight: 1.4 }}>{item.title}</div>
                              <div style={{ fontSize: '0.72rem', color: '#9b90b8', marginTop: 2, lineHeight: 1.5 }}>{item.desc}</div>
                            </div>
                            <div style={{ background: t.bg, color: t.color, fontSize: '0.6rem', fontWeight: 700, padding: '2px 5px', borderRadius: 5, flexShrink: 0, marginTop: 2, opacity: 0.8 }}>
                              {t.label}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div style={{ padding: '12px 14px 24px', flexShrink: 0, background: '#faf8ff', borderTop: '1px solid #ede8fb' }}>
          <button
            onClick={close}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 14, border: 'none',
              background: 'linear-gradient(135deg,#b088f9,#7baff0)',
              color: 'white', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
            }}
          >
            확인
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
