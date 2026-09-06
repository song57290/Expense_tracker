import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'

export default function AppUpdateModal() {
  const [info, setInfo] = useState(null)
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const [skipUntilNext, setSkipUntilNext] = useState(false)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    Promise.all([
      fetch('/api/app-version', { credentials: 'same-origin' }).then(r => r.json()),
      CapApp.getInfo(),
    ]).then(([server, appInfo]) => {
      const currentCode = parseInt(appInfo.build, 10) || 0
      if (!server.version_code || server.version_code <= currentCode) return
      const skipped = localStorage.getItem('apk_update_skipped_version')
      if (skipped === String(server.version_code)) return
      setInfo(server)
      setOpen(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    }).catch(() => {})
  }, [])

  function close() {
    setVisible(false)
    setTimeout(() => setOpen(false), 300)
  }
  function skip() {
    if (info && skipUntilNext) localStorage.setItem('apk_update_skipped_version', String(info.version_code))
    close()
  }
  function update() {
    if (info?.url) {
      // version_code가 같아도 매 클릭마다 새 URL이 되도록 타임스탬프를 붙인다
      const u = new URL(info.url, window.location.origin)
      if (info.version_code) u.searchParams.set('v', info.version_code)
      u.searchParams.set('t', Date.now())
      window.location.href = u.href
    }
    close()
  }

  if (!open || !info) return null

  return createPortal(
    <div onClick={e => e.target === e.currentTarget && close()}
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.42)', zIndex: 9999, alignItems: 'center', justifyContent: 'center', padding: '0 24px', opacity: visible ? 1 : 0, transition: 'opacity 0.22s ease' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '22px 20px', width: '100%', maxWidth: 320, boxShadow: '0 12px 40px rgba(0,0,0,0.22)', transform: visible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(12px)', transition: 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>🚀</div>
        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>새 버전이 있어요</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: info.notice ? 12 : 20, lineHeight: 1.5 }}>
          {info.version_name ? `${info.version_name} 업데이트가 준비됐습니다.` : '새로운 업데이트가 준비됐습니다.'}<br />
          지금 다운로드해서 설치할까요?
        </div>
        {info.notice && (
          <div style={{ fontSize: '0.78rem', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '9px 11px', marginBottom: 20, lineHeight: 1.5, textAlign: 'left', whiteSpace: 'pre-line' }}>
            ⚠️ {info.notice}
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', userSelect: 'none', marginBottom: 14 }}>
          <input
            type="checkbox"
            checked={skipUntilNext}
            onChange={e => setSkipUntilNext(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: '#b088f9', cursor: 'pointer' }}
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>다음 업데이트까지 보지 않기</span>
        </label>
        <div className="d-flex gap-2">
          <button onClick={update}
            style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
            업데이트
          </button>
          <button onClick={skip}
            style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1.5px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
            다음에
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
