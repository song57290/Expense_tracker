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

export function fmt(n) {
  return Number(n).toLocaleString('ko-KR')
}

export function today() {
  return new Date().toISOString().slice(0, 10)
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
