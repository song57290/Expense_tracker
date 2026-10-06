import { useState, useEffect } from 'react'
import { ListToolbar, filterSortItems } from './ListTools.jsx'
import { createPortal } from 'react-dom'

// 증권사 목록. 로고 이미지는 static/brokers/{key}.png 에 두면 자동으로 쓰고, 없으면 아래 색 배지를 보여 준다
export const BROKERS = [
  { key: 'kiwoom', name: '키움증권', short: '키움', color: '#1f4e9c' },
  { key: 'miraeasset', name: '미래에셋증권', short: '미래', color: '#e4002b' },
  { key: 'samsung', name: '삼성증권', short: '삼성', color: '#1428a0' },
  { key: 'nhinvest', name: 'NH투자증권', short: 'NH', color: '#00a0e9' },
  { key: 'kbsec', name: 'KB증권', short: 'KB', color: '#ffbc00', fg: '#3a2a00' },
  { key: 'hantu', name: '한국투자증권', short: '한투', color: '#0a4a9a' },
  { key: 'toss', name: '토스증권', short: '토스', color: '#0064ff' },
  { key: 'shinhan', name: '신한투자증권', short: '신한', color: '#0046ff' },
  { key: 'daishin', name: '대신증권', short: '대신', color: '#ec1c24' },
  { key: 'hanasec', name: '하나증권', short: '하나', color: '#00857c' },
  { key: 'meritz', name: '메리츠증권', short: '메리츠', color: '#e60012' },
  { key: 'yuanta', name: '유안타증권', short: '유안타', color: '#c8102e' },
  { key: 'ebest', name: '이베스트투자증권', short: '이베스트', color: '#2c3e50' },
  { key: 'kakaopay', name: '카카오페이증권', short: '카카오', color: '#fee500', fg: '#3c1e1e' },
  { key: 'ktb', name: 'KTB투자증권', short: 'KTB', color: '#0b3d91' },
  { key: 'shinyoung', name: '신영증권', short: '신영', color: '#0b4f9c' },
  { key: 'eugene', name: '유진투자증권', short: '유진', color: '#1e3a8a' },
  { key: 'bookook', name: '부국증권', short: '부국', color: '#0a5c36' },
  { key: 'hyundaicar', name: '현대차증권', short: '현대차', color: '#002c5f' },
  { key: 'kyobo', name: '교보증권', short: '교보', color: '#003e99' },
  { key: 'hanwha', name: '한화투자증권', short: '한화', color: '#f37321' },
  { key: 'heungkuk', name: '흥국증권', short: '흥국', color: '#1d4f91' },
  { key: 'sk', name: 'SK증권', short: 'SK', color: '#e4002b' },
  { key: 'db', name: 'DB금융투자', short: 'DB', color: '#005bac' },
  { key: 'woori', name: '우리투자증권', short: '우리', color: '#0067ac' },
  { key: 'kdb', name: 'KDB대우증권', short: 'KDB', color: '#003087' },
  { key: 'ibk', name: 'IBK투자증권', short: 'IBK', color: '#004ea2' },
]
export const brokerOf = key => BROKERS.find(b => b.key === key) || null
// 입력한 증권사 이름이 목록과 같으면 그 키를 돌려준다 (목록에 없으면 '')
export const keyOfName = name => BROKERS.find(b => b.name === (name || '').trim())?.key || ''

// 다크모드에서 로고 색이 배경에 묻히는 증권사는 흰색 버전 파일을 쓴다
const DARK_LOGO = { kakaopay: 'kakaopay_white' }

function isDarkMode() {
  const theme = document.documentElement.dataset.theme
  if (theme) return theme === 'dark'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

export function BrokerBadge({ brokerKey, size = 26, customSrc = null, label = '' }) {
  // static/brokers/{key}.svg 를 먼저 찾고, 없으면 .png, 그것도 없으면 이름 배지
  const [stage, setStage] = useState(0)
  const [customFailed, setCustomFailed] = useState(false)
  // 테마가 바뀌면(설정 화면의 다크/라이트, 기기 설정) 창을 다시 열지 않아도 바로 로고가 바뀌도록 감시한다
  const [dark, setDark] = useState(isDarkMode)
  useEffect(() => {
    const update = () => setDark(isDarkMode())
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    media?.addEventListener?.('change', update)
    return () => {
      observer.disconnect()
      media?.removeEventListener?.('change', update)
    }
  }, [])
  const b = brokerOf(brokerKey) || { short: (label || '증권').slice(0, 2), color: '#888888' }
  // 사용자가 직접 올린 로고가 있으면 그것을 먼저 쓰고, 실패하면 증권사 로고 흐름으로 넘어간다
  if (customSrc && !customFailed) {
    return <img src={customSrc} alt="" onError={() => setCustomFailed(true)}
      style={{ width: size, height: size, borderRadius: 8, objectFit: 'contain', flexShrink: 0 }} />
  }
  if (brokerKey && stage < 2) {
    const ext = stage === 0 ? 'svg' : 'png'
    const file = (dark && DARK_LOGO[brokerKey]) || brokerKey
    return <img src={`/static/brokers/${file}.${ext}`} alt="" onError={() => setStage(stage + 1)}
      style={{ width: size, height: size, borderRadius: 8, objectFit: 'contain', flexShrink: 0 }} />
  }
  return (
    <span style={{ width: size, height: size, borderRadius: 8, background: b.color, color: b.fg || 'white', fontSize: size >= 30 ? '0.72rem' : '0.6rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>
      {b.short}
    </span>
  )
}

export function BrokerPicker({ value, onChange, allowNone = false, placeholder = '증권사 선택' }) {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const [query, setQuery] = useState('')
  const [dir, setDir] = useState(null)
  const sel = brokerOf(value)

  function openSheet() {
    setQuery('')
    setOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
  }
  function closeSheet() {
    setVisible(false)
    setTimeout(() => setOpen(false), 300)
  }
  function pick(key) {
    onChange(key)
    closeSheet()
  }

  return (
    <>
      <button type="button" onClick={openSheet} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--input-bg)', border: '1px solid var(--border-input)',
        borderRadius: 10, padding: '8px 12px', cursor: 'pointer', minHeight: 40,
        color: sel ? 'var(--text-primary)' : 'var(--text-muted)',
      }}>
        {sel && <BrokerBadge brokerKey={sel.key} size={24} />}
        <span style={{ flex: 1, fontSize: '0.9rem', textAlign: 'left' }}>{sel ? sel.name : placeholder}</span>
        <i className="bi bi-chevron-down" style={{ color: 'var(--text-muted)', fontSize: '0.75rem', flexShrink: 0 }} />
      </button>

      {open && createPortal(
        <div onClick={e => e.target === e.currentTarget && closeSheet()}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', opacity: visible ? 1 : 0, transition: 'opacity 0.25s ease' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '72dvh', overflowY: 'auto', overscrollBehavior: 'contain', transform: visible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94)', paddingBottom: 'max(40px, calc(env(safe-area-inset-bottom) + 24px))' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-light)' }} />
            </div>
            <div style={{ padding: '6px 20px 12px', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
              증권사 선택
            </div>
            <ListToolbar query={query} onQuery={setQuery} dir={dir} onDir={setDir} placeholder="증권사 이름 검색" />
            {allowNone && (
              <div onClick={() => pick('')} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 20px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ width: 34, height: 34, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '0.95rem', color: 'var(--text-muted)' }}>선택 안 함</span>
              </div>
            )}
            {filterSortItems(BROKERS, query, dir, b => b.name).map(b => {
              const on = b.key === value
              return (
                <div key={b.key} onClick={() => pick(b.key)} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '11px 20px', cursor: 'pointer',
                  background: on ? 'rgba(176,136,249,0.08)' : 'transparent', borderBottom: '1px solid var(--border-light)',
                }}>
                  <div style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <BrokerBadge brokerKey={b.key} size={34} />
                  </div>
                  <span style={{ flex: 1, fontSize: '0.95rem', fontWeight: on ? 600 : 400, color: on ? '#b088f9' : 'var(--text-primary)' }}>{b.name}</span>
                  {on && <i className="bi bi-check-circle-fill" style={{ color: '#b088f9', fontSize: '1.1rem', flexShrink: 0 }} />}
                </div>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

// 입력한 글자로 증권사 목록을 걸러 보여주는 입력칸. 목록을 누르면 그 이름이 들어가고, 목록에 없으면 직접 입력한 이름이 쓰인다
export function BrokerSearch({ value, onChange, placeholder = '증권사 검색 또는 직접 입력', error = false }) {
  const items = filterSortItems(BROKERS, value, null, b => b.name)
  return (
    <div>
      <input type="text" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', borderRadius: 10, padding: '9px 12px', border: `1.5px solid ${error ? '#dc3545' : 'var(--border-light)'}`, background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem' }} />
      <div style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto', borderRadius: 12, border: '1px solid var(--border-light)' }}>
        {items.length === 0 && (
          <div style={{ padding: '10px 14px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>목록에 없어요 — 입력한 이름으로 추가돼요</div>
        )}
        {items.map(b => {
          const on = b.name === value
          return (
            <div key={b.key} onClick={() => onChange(b.name)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', background: on ? 'rgba(176,136,249,0.08)' : 'transparent', borderBottom: '1px solid var(--border-light)' }}>
              <BrokerBadge brokerKey={b.key} size={26} />
              <span style={{ flex: 1, fontSize: '0.9rem', color: on ? '#b088f9' : 'var(--text-primary)', fontWeight: on ? 600 : 400 }}>{b.name}</span>
              {on && <i className="bi bi-check-circle-fill" style={{ color: '#b088f9', fontSize: '1rem' }} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
