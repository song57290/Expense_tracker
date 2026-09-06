import { useState } from 'react'
import { createPortal } from 'react-dom'

// Shared "필터" entry point: a single trigger button that opens a centered popup
// with one or more labeled option sections. Used anywhere a page would otherwise
// scatter several chip-button rows across the screen — keep new filter UIs on this
// component so they all get the same layout (and the 3-column grid for chip lists)
// for free instead of re-implementing a bespoke popup per page.
//
// sections: [{
//   label: string,               // section heading, e.g. '정렬', '유형/계좌'
//   type: 'row' | 'grid',        // 'row' = single-select, few equal-width options (2-3).
//                                 // 'grid' = multi-select checkboxes, laid out as a lone
//                                 // "전체" row followed by the real options in 3 columns.
//   options: [value, label, color?, bg?][],
//   value:
//     - 'row' sections:  a single selected value; options[0] is the "default/off" value.
//     - 'grid' sections: either the string 'all' (every option selected) or an array of
//       the currently-selected option values (possibly empty).
//   onChange: (value) => void,   // receives the same shape described above
//   dir?: 'asc' | 'desc',        // 'row' sections only — shows an asc/desc toggle once
//   onDirChange?: (dir) => void, // value !== options[0][0]
// }]
export default function FilterPopup({ sections, triggerStyle }) {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)

  function openSheet() {
    setOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
  }
  function closeSheet() {
    setVisible(false)
    setTimeout(() => setOpen(false), 300)
  }

  const isActive = sections.some(s => s.type === 'grid' ? s.value !== 'all' : s.value !== s.options[0][0])

  return (
    <>
      <button onClick={openSheet}
        style={triggerStyle ? triggerStyle(isActive) : defaultTriggerStyle(isActive)}>
        <i className="bi bi-funnel" style={{ fontSize: '0.72rem' }} />
        필터
      </button>
      {open && createPortal(
        <div onClick={e => e.target === e.currentTarget && closeSheet()}
          style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.42)', zIndex: 5000, alignItems: 'center', justifyContent: 'center', padding: '0 24px', opacity: visible ? 1 : 0, transition: 'opacity 0.22s ease' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '20px', width: '100%', maxWidth: 320, maxHeight: '80dvh', overflowY: 'auto', overscrollBehavior: 'contain', boxShadow: '0 12px 40px rgba(0,0,0,0.22)', transform: visible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(12px)', transition: 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <span className="fw-bold" style={{ fontSize: '1rem' }}>필터</span>
              <button onClick={closeSheet}
                style={{ background: 'var(--bg-section)', border: 'none', width: 28, height: 28, borderRadius: 14, fontSize: '1.05rem', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
            </div>
            {sections.map((sec, i) => {
              const isLast = i === sections.length - 1
              const showDir = sec.type !== 'grid' && sec.onDirChange && sec.value !== sec.options[0][0]
              return (
                <div key={sec.label}>
                  <div style={labelStyle}>{sec.label}</div>
                  {sec.type === 'grid'
                    ? <GridSection options={sec.options} value={sec.value} onChange={sec.onChange} marginBottom={isLast ? 0 : 18} />
                    : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: showDir ? 8 : (isLast ? 0 : 18) }}>
                        {sec.options.map(([val, label]) => (
                          <button key={val} onClick={() => sec.onChange(val)} style={rowBtnStyle(sec.value === val)}>{label}</button>
                        ))}
                      </div>
                    )}
                  {showDir && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: isLast ? 0 : 18 }}>
                      <SortDirToggle dir={sec.dir} onChange={sec.onDirChange} />
                    </div>
                  )}
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

// "전체" 체크박스(전체 선택/해제 토글) + 나머지 항목 3열 체크박스 그리드.
// 전체가 눌리면 모두 선택/해제되고, 개별 항목을 하나씩 눌러 전부 선택된 상태가 되면
// 다시 'all' 센티널로 접어서 "진짜 전체 선택됨"과 동일하게 취급한다.
function GridSection({ options, value, onChange, marginBottom }) {
  const isAll = value === 'all'
  const selected = isAll ? options.map(o => o[0]) : value
  const allChecked = isAll || (options.length > 0 && selected.length === options.length)

  function toggleAll() {
    onChange(allChecked ? [] : 'all')
  }
  function toggleOne(val) {
    const next = selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]
    onChange(next.length === options.length ? 'all' : next)
  }

  return (
    <div style={{ marginBottom }}>
      <button onClick={toggleAll} style={allRowStyle(allChecked)}>
        <i className={`bi ${allChecked ? 'bi-check-square-fill' : 'bi-square'}`} />
        전체
      </button>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 6 }}>
        {options.map(([val, label, color, bg]) => {
          const checked = isAll || selected.includes(val)
          return (
            <button key={val} onClick={() => toggleOne(val)} style={chipStyle(checked, color || '#b088f9', bg || 'rgba(176,136,249,0.12)')}>
              <i className={`bi ${checked ? 'bi-check-circle-fill' : 'bi-circle'}`} style={{ fontSize: '0.72rem', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function defaultTriggerStyle(active) {
  return {
    borderRadius: 20, padding: '5px 12px', fontSize: '0.8rem', fontWeight: 600,
    color: active ? 'white' : '#b088f9', border: '1px solid #b088f9', background: active ? '#b088f9' : 'transparent',
    display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', cursor: 'pointer',
  }
}

function rowBtnStyle(active) {
  return {
    borderRadius: 10, padding: '7px 0', fontSize: '0.85rem', fontWeight: active ? 700 : 400,
    border: `1.5px solid ${active ? '#b088f9' : 'var(--border-light)'}`,
    background: active ? 'rgba(176,136,249,0.12)' : 'transparent',
    color: active ? '#b088f9' : 'var(--text-muted)', cursor: 'pointer',
  }
}

function allRowStyle(active) {
  return {
    width: '100%', textAlign: 'left', borderRadius: 10, padding: '8px 12px', fontSize: '0.85rem', fontWeight: active ? 700 : 400,
    border: `1.5px solid ${active ? '#b088f9' : 'var(--border-light)'}`,
    background: active ? 'rgba(176,136,249,0.12)' : 'transparent',
    color: active ? '#b088f9' : 'var(--text-muted)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6,
  }
}

function chipStyle(active, color, bg) {
  return {
    padding: '6px 10px', borderRadius: 20, fontSize: '0.8rem', fontWeight: active ? 700 : 400,
    border: `1.5px solid ${active ? color : 'var(--border-light)'}`,
    background: active ? bg : 'transparent',
    color: active ? color : 'var(--text-muted)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
    minWidth: 0, // grid items default to min-width:auto — without this the label can't shrink/ellipsis and just gets clipped
  }
}

const labelStyle = { fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }

function SortDirToggle({ dir, onChange }) {
  return (
    <button type="button" onClick={() => onChange(dir === 'asc' ? 'desc' : 'asc')}
      style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 20, border: '2px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
      <i className={`bi bi-sort-${dir === 'asc' ? 'up' : 'down'}`} />{dir === 'asc' ? '오름차순' : '내림차순'}
    </button>
  )
}
