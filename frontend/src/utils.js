import { useState, useEffect } from 'react'

const BANK_COLORS = [
  ['신한', '#0046A0', 'white'], ['KB', '#FFB800', '#333'], ['국민', '#FFB800', '#333'],
  ['농협', '#009900', 'white'], ['NH', '#009900', 'white'], ['하나', '#009A8C', 'white'],
  ['우리', '#0069C8', 'white'], ['기업', '#005BB5', 'white'], ['IBK', '#005BB5', 'white'],
  ['카카오', '#FAE100', '#333'], ['토스', '#0064FF', 'white'], ['케이뱅크', '#00B4B4', 'white'],
  ['K뱅크', '#00B4B4', 'white'], ['SC', '#1B5DA0', 'white'], ['제일', '#1B5DA0', 'white'],
  ['씨티', '#003087', 'white'], ['iM', '#E8182C', 'white'], ['IM', '#E8182C', 'white'],
  ['수협', '#009ABF', 'white'], ['KDB', '#003087', 'white'], ['산업', '#003087', 'white'],
  ['BNK', '#0057A8', 'white'], ['부산', '#0057A8', 'white'], ['우체국', '#D40511', 'white'],
  ['SBI', '#E8391D', 'white'], ['신협', '#005BAB', 'white'], ['BC', '#D60B2F', 'white'],
  ['현대', '#1A1A1A', 'white'], ['롯데', '#CC0000', 'white'], ['삼성', '#005BAB', 'white'],
]

const BANK_LOGOS = [
  ['신한', '/static/cards/sinhanbank.png'], ['KB', '/static/cards/kbbank.png'],
  ['국민', '/static/cards/kbbank.png'], ['농협', '/static/cards/nhbank.png'],
  ['NH', '/static/cards/nhbank.png'], ['하나', '/static/cards/hanabank.png'],
  ['우리', '/static/cards/wooribank.png'], ['기업', '/static/cards/ibkbank.png'],
  ['IBK', '/static/cards/ibkbank.png'], ['카카오', '/static/cards/kakaobank.png'],
  ['토스', '/static/cards/tossbank.png'], ['케이뱅크', '/static/cards/kbank.png'],
  ['K뱅크', '/static/cards/kbank.png'], ['SC', '/static/cards/scbank.png'],
  ['제일', '/static/cards/scbank.png'], ['씨티', '/static/cards/citibank.png'],
  ['iM', '/static/cards/imbank.png'], ['IM', '/static/cards/imbank.png'],
  ['수협', '/static/cards/suhyupbank.png'], ['KDB', '/static/cards/kdbbank.png'],
  ['산업', '/static/cards/kdbbank.png'], ['BNK', '/static/cards/bnkbank.png'],
  ['부산', '/static/cards/bnkbank.png'], ['우체국', '/static/cards/epostbank.png'],
  ['SBI', '/static/cards/sbibank.png'], ['신협', '/static/cards/cubank.png'],
  ['BC', '/static/banks/bccard.png'], ['현대', '/static/banks/hyundaicard.png'],
  ['롯데', '/static/banks/lottecard.png'], ['삼성', '/static/banks/samsungcard.png'],
]

export function bankColor(name) {
  if (!name) return { background: '#6c757d', color: 'white' }
  for (const [k, bg, fg] of BANK_COLORS) {
    if (name.includes(k)) return { background: bg, color: fg }
  }
  return { background: '#6c757d', color: 'white' }
}

export function bankLogo(name) {
  if (!name) return null
  for (const [k, path] of BANK_LOGOS) {
    if (name.includes(k)) return path
  }
  return null
}

// Prefer a user-uploaded logo (for banks/point companies not in the preset list,
// e.g. PAYCO) over the built-in name-matched one.
export function cardLogo(card) {
  if (!card) return null
  if (card.has_custom_icon && card.id) return `/api/cards/${card.id}/icon`
  return bankLogo(card.name)
}

const _customIconColorCache = new Map()

// For a user-uploaded logo (no built-in bankColor entry), sample a small block near the
// top-left corner (not a single pixel — a lone corner pixel is too likely to land on
// anti-aliased edge/padding and give a near-white or near-black false read) and average
// it. Also rejects the result if it's too light or too dark to be readable as text on a
// light chip background — resolves to null in that case (and on load/transparent-corner
// failures), so the caller falls back to bankColor's gray default instead of producing
// an invisible (e.g. white-on-white) badge.
export function getCustomIconColor(cardId) {
  if (!cardId) return Promise.resolve(null)
  if (_customIconColorCache.has(cardId)) return _customIconColorCache.get(cardId)
  const promise = new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      try {
        const SAMPLE = 8
        const canvas = document.createElement('canvas')
        canvas.width = SAMPLE
        canvas.height = SAMPLE
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE)
        const data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data
        let r = 0, g = 0, b = 0, n = 0
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 10) continue // skip transparent pixels
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
        }
        if (n === 0) { resolve(null); return }
        r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n)
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        if (luminance > 0.85 || luminance < 0.15) { resolve(null); return }
        const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
        resolve(hex)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = `/api/cards/${cardId}/icon`
  })
  _customIconColorCache.set(cardId, promise)
  return promise
}

// Resolves each custom-icon card's color once and hands back a bankColor()-shaped
// lookup by name — for lists that render many transaction rows sharing a handful of
// distinct cards (TxItem badges), so the color isn't re-derived (or missed) per row.
export function useCardColorMap(cards) {
  const [colors, setColors] = useState({})
  useEffect(() => {
    (cards || []).forEach(c => {
      if (c.has_custom_icon && c.id && !(c.name in colors)) {
        getCustomIconColor(c.id).then(hex => {
          setColors(prev => (prev[c.name] !== undefined ? prev : { ...prev, [c.name]: hex }))
        })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards])
  return function cardBadgeColor(name) {
    const custom = colors[name]
    return custom ? { background: custom, color: 'white' } : bankColor(name)
  }
}

export function fmt(n) {
  return Number(n).toLocaleString('ko-KR')
}

// 금액 입력창은 콤마(,)가 매 입력마다 자동으로 붙었다 떨어졌다 하는데, 이때 React가
// value를 새로 세팅하면 커서가 항상 맨 끝으로 밀려서 중간 자리를 고치기 어려웠다.
// 커서 직전에 있던 "숫자 개수"를 기준으로, 새로 포맷된 문자열에서 같은 개수만큼의
// 숫자 뒤 위치를 다시 찾아 커서를 되돌린다.
export function restoreCaretAfterFormat(inputEl, formattedValue) {
  if (!inputEl) return
  const prevPos = inputEl.selectionStart ?? inputEl.value.length
  const digitsBefore = inputEl.value.slice(0, prevPos).replace(/[^0-9]/g, '').length
  requestAnimationFrame(() => {
    let count = 0, pos = formattedValue.length
    for (let i = 0; i < formattedValue.length; i++) {
      if (/[0-9]/.test(formattedValue[i])) {
        count++
        if (count === digitsBefore) { pos = i + 1; break }
      }
    }
    try { inputEl.setSelectionRange(pos, pos) } catch {}
  })
}

export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function fmtMonth(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  return `${y}년 ${m}월`
}

export function fmtDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${y}년 ${parseInt(m)}월 ${parseInt(day)}일`
}
