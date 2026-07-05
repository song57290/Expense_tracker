import { useState, useEffect } from 'react'
import api from '../api.js'


function makeSvgDonut(items, colors, size = 180) {
  const total = items.reduce((s, i) => s + i[1], 0)
  if (!total) return ''
  const cx = size / 2, cy = size / 2, r = size / 2 - 14, ir = r * 0.58
  let angle = -Math.PI / 2
  const paths = items.map(([label, value], i) => {
    const sweep = Math.min(value / total * 2 * Math.PI, 2 * Math.PI - 0.001)
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle)
    const x2 = cx + r * Math.cos(angle + sweep), y2 = cy + r * Math.sin(angle + sweep)
    const x3 = cx + ir * Math.cos(angle + sweep), y3 = cy + ir * Math.sin(angle + sweep)
    const x4 = cx + ir * Math.cos(angle), y4 = cy + ir * Math.sin(angle)
    const la = sweep > Math.PI ? 1 : 0
    const c = colors[i % colors.length]
    const d = `M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${la},1 ${x2.toFixed(1)},${y2.toFixed(1)} L${x3.toFixed(1)},${y3.toFixed(1)} A${ir},${ir} 0 ${la},0 ${x4.toFixed(1)},${y4.toFixed(1)}Z`
    angle += sweep
    return `<path d="${d}" fill="${c}" stroke="#fff" stroke-width="2"/>`
  }).join('')
  const label = total >= 100000000 ? `${(total/100000000).toFixed(1)}억원` : `${Math.round(total/10000)}만원`
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}<text x="${cx}" y="${cy-7}" text-anchor="middle" font-size="13" font-weight="bold" fill="#333">${label}</text><text x="${cx}" y="${cy+11}" text-anchor="middle" font-size="10" fill="#888">총 자산</text></svg>`
}

function buildPortfolioHTML(d, sections) {
  const now = new Date()
  const dateStr = `${now.getFullYear()}년 ${String(now.getMonth()+1).padStart(2,'0')}월 ${String(now.getDate()).padStart(2,'0')}일`
  const f = n => Number(n || 0).toLocaleString()

  const css = `
    *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#222;background:#fff;padding:40px;font-size:13px;line-height:1.5}
    .hdr{margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #b088f9}
    .hdr h1{font-size:22px;font-weight:700;color:#b088f9;margin-bottom:4px}
    .hdr .meta{font-size:11px;color:#888}
    h2{font-size:14px;font-weight:700;color:#7c4fbf;background:#f0eaff;padding:12px 20px;margin:0;border-bottom:1.5px solid #e0d0fd}
    .sec{margin-bottom:20px;border:1.5px solid #e0d0fd;border-radius:14px;overflow:hidden}
    .si{padding:20px}
    .sg{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:6px}
    .sc{border:1px solid #e8e8e8;border-radius:10px;padding:14px 12px;text-align:center}
    .sc .l{font-size:10px;color:#555;margin-bottom:5px}
    .sc .v{font-size:15px;font-weight:700}
    .ci{color:#198754}.ce{color:#dc3545}.cb{color:#0d6efd}.cn{color:#333}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px}
    thead th{background:#f8f5ff;color:#555;font-weight:700;padding:8px 10px;text-align:left;border-bottom:2px solid #e8d5ff}
    tbody td{padding:8px 10px;border-bottom:1px solid #f5f5f5;vertical-align:middle}
    tbody tr:last-child td{border-bottom:none}
    .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600}
    .be{background:#ffe0e0;color:#dc3545}.bi{background:#d4edda;color:#198754}
    .by{background:#e8f4fd;color:#0d6efd}.bj{background:#f0e8fd;color:#b088f9}
    .cp{border:1px solid #e8e8e8;border-radius:12px;padding:16px;margin-bottom:10px}
    .cn2{font-size:14px;font-weight:700;margin-bottom:10px}
    .ig{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#eee;border-radius:8px;overflow:hidden;margin-bottom:12px}
    .ic{background:white;padding:8px 10px;text-align:center}
    .ic .l{font-size:10px;color:#555;margin-bottom:3px}
    .ic .v{font-size:12px;font-weight:600}
    .pb{background:#f0f0f0;border-radius:6px;height:8px;overflow:hidden}
    .pf{height:8px;border-radius:6px}
    .pl{display:flex;justify-content:space-between;font-size:10px;color:#aaa;margin-top:3px}
    .sp{border:1px solid #e8e8e8;border-radius:12px;padding:16px;margin-bottom:10px}
    .sh{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
    .sn{font-size:14px;font-weight:700}
    .dd{font-size:12px;font-weight:700;color:#b088f9}
    .sg2{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#eee;border-radius:8px;overflow:hidden;margin-bottom:10px}
    .empty{color:#aaa;text-align:center;padding:16px;font-size:12px}
    .footer{margin-top:40px;font-size:10px;color:#bbb;text-align:center;border-top:1px solid #eee;padding-top:16px}
    .pdfbtn{position:fixed;top:16px;right:16px;z-index:9999;background:linear-gradient(135deg,#b088f9,#7baff0);color:white;border:none;border-radius:14px;padding:12px 22px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(176,136,249,0.4)}
    @media print{body{padding:20px}.pdfbtn{display:none}}
    @media(max-width:600px){body{padding:16px}.sg{grid-template-columns:repeat(2,1fr)}table{font-size:11px}thead th,tbody td{padding:6px 6px}}
  `

  const sm = d.summary || {}
  const cards = d.cards || []
  const savings = d.savings || []
  const ss = d.savings_summary || {}
  const investments = d.investments || []
  const invSummary = d.investments_summary || {}
  const txs = d.transactions || []
  const COLORS = ['#b088f9','#7baff0','#4BC0C0','#FF6384','#FF9F40','#FFCE56','#9966FF']

  const dday = (endStr) => {
    const diff = Math.round((new Date(endStr) - new Date()) / 86400000)
    if (diff < 0) return `D+${Math.abs(diff)}`
    if (diff === 0) return 'D-Day'
    return `D-${diff}`
  }

  const PDF_BANK_LOGOS = [
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
  ]
  const _origin = window.location.origin
  const bankLogoTag = (name, size = 32) => {
    if (!name) return ''
    for (const [k, url] of PDF_BANK_LOGOS) {
      if (name.includes(k)) return `<img src="${_origin}${url}" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:8px" onerror="this.style.display='none'" />`
    }
    return ''
  }

  const cardsHtml = cards.length === 0 ? '<div class="empty">등록된 카드/계좌가 없습니다</div>' : cards.map(c => `
    <div class="cp">
      <div class="cn2" style="display:flex;align-items:center;gap:10px">${bankLogoTag(c.name)}<span>${c.name}</span></div>
      <div class="ig">
        <div class="ic"><div class="l">초기 잔고</div><div class="v">${f(c.initial_balance)}원</div></div>
        <div class="ic"><div class="l">이달 지출</div><div class="v ce">${f(c.spent)}원</div></div>
        <div class="ic"><div class="l">현재 잔고</div><div class="v">${f(c.balance)}원</div></div>
      </div>
      ${c.target ? `
      <div class="ig">
        <div class="ic"><div class="l">월 예산</div><div class="v">${f(c.target)}원</div></div>
        <div class="ic"><div class="l">이달 실적</div><div class="v">${f(c.spent)}원</div></div>
        <div class="ic"><div class="l">달성률</div><div class="v" style="color:#ffc107">${c.percent || 0}%</div></div>
      </div>
      <div style="margin-top:4px">
        <div class="pb"><div class="pf" style="width:${Math.min(c.percent||0,100)}%;background:#ffc107"></div></div>
        <div class="pl"><span>0원</span><span>${f(c.target)}원</span></div>
      </div>` : ''}
    </div>
  `).join('')

  const savingsHtml = savings.length === 0 ? '<div class="empty">등록된 예적금이 없습니다</div>' : savings.map(s => `
    <div class="sp">
      <div class="sh">
        <div class="sn" style="display:flex;align-items:center;gap:8px">${bankLogoTag(s.bank, 28)}<span>${s.bank}</span>&nbsp;<span class="badge ${s.stype === '예금' ? 'by' : 'bj'}">${s.stype}</span></div>
        <div class="dd">${dday(s.end_date)}</div>
      </div>
      <div class="sg2">
        <div class="ic"><div class="l">${s.stype === '예금' ? '예치금액' : '월 납입액'}</div><div class="v">${f(s.amount)}원</div></div>
        <div class="ic"><div class="l">연 이율</div><div class="v">${s.interest_rate}%</div></div>
        <div class="ic"><div class="l">기간</div><div class="v">${s.months_total}개월</div></div>
      </div>
      <div class="sg2">
        <div class="ic"><div class="l">예상 이자</div><div class="v ci">+${f(s.interest)}원</div></div>
        <div class="ic"><div class="l">만기 수령</div><div class="v ci">${f(s.maturity_amount)}원</div></div>
        <div class="ic"><div class="l">만기일</div><div class="v">${s.end_date}</div></div>
      </div>
      <div style="margin-top:4px">
        <div class="pb"><div class="pf" style="width:${s.progress}%;background:linear-gradient(90deg,#b088f9,#7baff0)"></div></div>
        <div class="pl"><span>${s.start_date}</span><span>${s.end_date}</span></div>
      </div>
    </div>
  `).join('')

  const savingsSummaryHtml = savings.length > 0 ? `
    <div class="sg" style="margin-top:12px">
      <div class="sc"><div class="l">총 예치금</div><div class="v cn">${f(ss.total_principal)}원</div></div>
      <div class="sc"><div class="l">총 예상 이자</div><div class="v ci">+${f(ss.total_interest)}원</div></div>
      <div class="sc"><div class="l">총 만기 수령</div><div class="v ci">${f(ss.total_maturity)}원</div></div>
      <div class="sc"><div class="l">상품 수</div><div class="v cn">${savings.length}개</div></div>
    </div>` : ''

  const txsHtml = txs.length === 0 ? '<div class="empty">거래 내역이 없습니다</div>' : `
    <table>
      <thead><tr><th>날짜</th><th>유형</th><th>카테고리</th><th>설명</th><th>카드/계좌</th><th style="text-align:right">금액</th></tr></thead>
      <tbody>
        ${txs.map(t => `
        <tr>
          <td>${t.date}</td>
          <td><span class="badge ${t.type === 'expense' ? 'be' : 'bi'}">${t.type === 'expense' ? '지출' : '수입'}</span></td>
          <td>${t.category || '—'}</td>
          <td>${t.description || '—'}</td>
          <td>${t.card || '—'}</td>
          <td style="text-align:right;font-weight:600;color:${t.type === 'expense' ? '#dc3545' : '#198754'}">${t.type === 'expense' ? '-' : '+'}${f(t.amount)}원</td>
        </tr>`).join('')}
      </tbody>
    </table>`

  const invHtml = investments.length === 0 ? '<div class="empty">등록된 투자 종목이 없습니다</div>' : `
    <table>
      <thead><tr><th>유형</th><th>종목</th><th style="text-align:right">수량</th><th style="text-align:right">평균단가</th><th style="text-align:right">현재가</th><th style="text-align:right">평가금액</th><th style="text-align:right">손익</th></tr></thead>
      <tbody>
        ${investments.map(i => `
        <tr>
          <td><span class="badge bj">${i.itype}</span></td>
          <td>${i.name}${i.ticker ? ` (${i.ticker})` : ''}</td>
          <td style="text-align:right">${i.quantity}주</td>
          <td style="text-align:right">${f(i.avg_price)}원</td>
          <td style="text-align:right">${f(i.current_price)}원</td>
          <td style="text-align:right;font-weight:700">${f(i.value)}원</td>
          <td style="text-align:right;color:${i.gain >= 0 ? '#dc3545' : '#0d6efd'}">${i.gain >= 0 ? '+' : ''}${f(i.gain)}원<br><span style="font-size:11px">(${i.gain >= 0 ? '+' : ''}${((i.avg_price && i.quantity) ? (i.gain / (i.avg_price * i.quantity) * 100).toFixed(1) : 0)}%)</span></td>
        </tr>`).join('')}
      </tbody>
    </table>
    ${investments.length > 0 ? `<div class="sg" style="margin-top:12px">
      <div class="sc"><div class="l">총 평가금액</div><div class="v cn">${f(invSummary.total_value)}원</div></div>
      <div class="sc"><div class="l">총 손익</div><div class="v" style="color:${invSummary.total_gain >= 0 ? '#dc3545' : '#0d6efd'}">${invSummary.total_gain >= 0 ? '+' : ''}${f(invSummary.total_gain)}원</div></div>
      <div class="sc"><div class="l">수익률</div><div class="v" style="color:${(invSummary.return_rate || 0) >= 0 ? '#dc3545' : '#0d6efd'}">${(invSummary.return_rate || 0) >= 0 ? '+' : ''}${(invSummary.return_rate || 0).toFixed(1)}%</div></div>
      <div class="sc"><div class="l">종목 수</div><div class="v cn">${invSummary.count}개</div></div>
    </div>` : ''}`

  // 자산 구성 도넛
  const netWorth = d.net_worth || 0
  const cardTotal = cards.reduce((s, c) => s + (c.balance || 0), 0)
  const depositTotal = savings.filter(s => s.stype === '예금').reduce((s, v) => s + (v.amount || 0), 0)
  const installTotal = savings.filter(s => s.stype === '적금').reduce((s, v) => s + (v.current_paid || 0), 0)
  const portfolioItems = []
  if (cardTotal > 0) portfolioItems.push(['카드잔고', cardTotal])
  if (depositTotal > 0) portfolioItems.push(['예금', depositTotal])
  if (installTotal > 0) portfolioItems.push(['적금', installTotal])
  const invByType = {}
  investments.forEach(i => { invByType[i.itype] = (invByType[i.itype] || 0) + i.value })
  Object.entries(invByType).forEach(([k, v]) => { if (v > 0) portfolioItems.push([k, v]) })
  const donutSvg = makeSvgDonut(portfolioItems, COLORS)
  const total2 = portfolioItems.reduce((s, x) => s + x[1], 0)
  const legendHtml = portfolioItems.map(([label, value], i) => {
    const pct = total2 ? (value / total2 * 100).toFixed(1) : 0
    const color = COLORS[i % COLORS.length]
    return (
      `<div style="margin-bottom:10px">` +
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">` +
      `<svg width="12" height="12" style="flex-shrink:0;vertical-align:middle"><rect width="12" height="12" rx="3" fill="${color}"/></svg>` +
      `<span style="flex:1;font-size:12px">${label}</span>` +
      `<span style="font-size:12px;font-weight:700">${f(value)}원</span>` +
      `<span style="font-size:11px;color:#aaa;width:38px;text-align:right">${pct}%</span>` +
      `</div>` +
      `<svg width="100%" height="8" style="display:block;border-radius:4px;overflow:hidden">` +
      `<rect width="100%" height="8" rx="4" fill="#f0f0f0"/>` +
      `<rect width="${pct}%" height="8" rx="4" fill="${color}"/>` +
      `</svg></div>`
    )
  }).join('')
  const assetCompositionHtml = `<div style="display:flex;flex-direction:column;align-items:center;gap:16px">${donutSvg}<div style="width:100%">${legendHtml}</div></div>`

  const sec = sections || {}

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>포트폴리오 - ${d.user?.email || ''}</title><style>${css}</style></head>
<body>
<button class="pdfbtn" onclick="window.print()">⬇ PDF 저장</button>
<div class="hdr">
  <h1>재무 포트폴리오</h1>
  <div class="meta">계정: ${d.user?.email || ''} &nbsp;|&nbsp; 추출일: ${dateStr}</div>
</div>

${sec.summary !== false ? `<div class="sec">
  <h2>순자산 요약</h2>
  <div class="si"><div class="sg">
    <div class="sc"><div class="l">순자산</div><div class="v cn">${f(netWorth)}원</div></div>
    <div class="sc"><div class="l">이달 수입</div><div class="v ci">${f(sm.income)}원</div></div>
    <div class="sc"><div class="l">이달 지출</div><div class="v ce">${f(sm.expense)}원</div></div>
    <div class="sc"><div class="l">이달 잔액</div><div class="v cb">${f(sm.balance)}원</div></div>
  </div></div>
</div>` : ''}

${sec.asset_composition !== false ? `<div class="sec"><h2>자산 구성</h2><div class="si">${assetCompositionHtml}</div></div>` : ''}

${sec.cards !== false ? `<div class="sec">
  <h2>카드 / 계좌 (${cards.length}개)</h2>
  <div class="si">${cardsHtml}</div>
</div>` : ''}

${sec.savings !== false ? `<div class="sec">
  <h2>예·적금 (${savings.length}개)</h2>
  <div class="si">${savingsHtml}${savingsSummaryHtml}</div>
</div>` : ''}

${sec.investments !== false ? `<div class="sec">
  <h2>투자 (${investments.length}개 종목)</h2>
  <div class="si">${invHtml}</div>
</div>` : ''}

${sec.transactions !== false ? `<div class="sec">
  <h2>거래 내역 (총 ${txs.length}건)</h2>
  <div class="si">${txsHtml}</div>
</div>` : ''}

<div class="footer">생성: 나의 가계부 앱 &nbsp;|&nbsp; ${d.user?.email || ''} &nbsp;|&nbsp; ${dateStr}</div>
</body>
</html>`
}

export default function Settings() {
  const [user, setUser] = useState(null)
  const [nicknameEdit, setNicknameEdit] = useState(false)
  const [nicknameVal, setNicknameVal] = useState('')
  const [nicknameSaving, setNicknameSaving] = useState(false)
  const [pwEdit, setPwEdit] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [portfolioExporting, setPortfolioExporting] = useState(false)
  const [pfSections, setPfSections] = useState({ summary: true, asset_composition: true, cards: true, savings: true, investments: true, transactions: true })
  const [pfSheetOpen, setPfSheetOpen] = useState(false)
  const [pfSheetVisible, setPfSheetVisible] = useState(false)
  const [notices, setNotices] = useState([])
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '' })
  const [noticeFormOpen, setNoticeFormOpen] = useState(false)
  const [noticeSaving, setNoticeSaving] = useState(false)
  const [expandedNotice, setExpandedNotice] = useState(null)
  const [editNotice, setEditNotice] = useState(null)
  const [editNoticeForm, setEditNoticeForm] = useState({ title: '', content: '' })

  const loadNotices = () => api.get('/api/notices').then(setNotices).catch(() => {})

  useEffect(() => {
    api.get('/api/me').then(d => { setUser(d.user); setNicknameVal(d.user?.nickname || '') }).catch(() => {})
    loadNotices()
  }, [])

  async function submitNotice(e) {
    e.preventDefault()
    setNoticeSaving(true)
    try {
      await api.post('/api/notices', noticeForm)
      setNoticeForm({ title: '', content: '' })
      setNoticeFormOpen(false)
      loadNotices()
    } finally {
      setNoticeSaving(false)
    }
  }

  async function deleteNotice(id) {
    await api.delete(`/api/notices/${id}`)
    loadNotices()
  }

  async function saveEditNotice(e) {
    e.preventDefault()
    await api.put(`/api/notices/${editNotice}`, editNoticeForm)
    setEditNotice(null)
    loadNotices()
  }

  async function savePassword() {
    setPwError('')
    if (pwForm.next !== pwForm.confirm) { setPwError('새 비밀번호가 일치하지 않습니다'); return }
    if (pwForm.next.length < 6) { setPwError('비밀번호는 6자 이상이어야 합니다'); return }
    setPwSaving(true)
    try {
      const d = await api.post('/api/change-password', { current_password: pwForm.current, new_password: pwForm.next })
      if (d.ok) { setPwEdit(false); setPwForm({ current: '', next: '', confirm: '' }) }
    } catch (err) {
      setPwError(err.message || '비밀번호 변경에 실패했습니다')
    } finally {
      setPwSaving(false)
    }
  }

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

  const [helpOpen, setHelpOpen] = useState(false)
  const [helpItem, setHelpItem] = useState(null)
  const [securityOpen, setSecurityOpen] = useState(false)
  const [logoutConfirm, setLogoutConfirm] = useState(false)

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

  function openPfSheet() {
    setPfSheetOpen(true)
    document.body.classList.add('sheet-open')
    requestAnimationFrame(() => requestAnimationFrame(() => setPfSheetVisible(true)))
  }
  function closePfSheet() {
    setPfSheetVisible(false)
    document.body.classList.remove('sheet-open')
    setTimeout(() => setPfSheetOpen(false), 300)
  }

  async function exportPortfolio() {
    setPortfolioExporting(true)
    try {
      const d = await api.get('/api/portfolio')
      const html = buildPortfolioHTML(d, pfSections)
      const w = window.open('', '_blank')
      w.document.write(html)
      w.document.close()
      w.focus()
      closePfSheet()
    } catch (e) {
      alert('포트폴리오 생성에 실패했습니다')
    } finally {
      setPortfolioExporting(false)
    }
  }

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e8e8e8', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }

  const SECTION_LIST = [
    { key: 'summary', label: '순자산 요약' },
    { key: 'asset_composition', label: '자산 구성 (도넛 차트)' },
    { key: 'cards', label: '카드 / 계좌' },
    { key: 'savings', label: '예적금' },
    { key: 'investments', label: '투자 종목' },
    { key: 'transactions', label: '거래 내역' },
  ]

  return (
    <div>
      <h5 className="fw-bold mb-3">설정</h5>

      {/* 도움말 */}
      {(() => {
        const HELP = [
          { icon: '🏠', title: '홈', desc: '수입·지출 내역을 기록하고 이번 달 내역을 관리합니다.\n\n• 이번 달 내역만 목록에 표시됩니다\n• 항목을 오른쪽으로 스와이프 → 수정 (PC에서는 마우스 드래그)\n• 항목을 왼쪽으로 스와이프 → 삭제 (PC에서는 마우스 드래그)\n• 카드/계좌를 지정하면 예산 탭 잔고에 자동 반영\n\n📥 내역 가져오기\n• 문자 붙여넣기: 카드·은행 문자를 붙여넣으면 자동 인식\n• 엑셀 업로드: 양식 다운로드 후 작성하거나 은행 내보내기 파일 바로 업로드\n  - 업로드 후 카테고리 및 카드/계좌 선택 화면으로 이동\n  - 일괄 적용: 지출/수입/카드 전체에 한 번에 지정 가능\n  - 카드 미선택 시 현금/미지정으로 저장\n  - 현금을 별도 추적하려면 예산 탭에서 현금 자산을 먼저 등록\n  - 오류 항목은 별도 표시 → 내용 확인 후 직접 수동 입력' },
          { icon: '💳', title: '예산', desc: '카드·은행·현금 잔고와 예적금·투자를 한눈에 확인합니다.\n\n• 자산 추가: 카드/은행 또는 현금 선택 후 등록\n• 초기 잔고: 앱 사용 시작 전 보유 금액 입력\n• 오른쪽 스와이프 → 수정, 왼쪽 스와이프 → 삭제 (PC에서는 마우스 드래그)\n• 수정 시 색상 구간 설정 가능: 빨강 ≤ / 노랑 ≤ / 파랑 ≤ / 초록 기준을 % 단위로 직접 조정\n• 예금·적금·청약 추가: 만기일·이율·납입액 입력 시 자동 계산 (청약은 월 2~50만원 납입)\n• 투자 추가: 종목·수량·매수가 입력, 티커로 현재가 자동 조회' },
          { icon: '📅', title: '캘린더', desc: '날짜별 수입·지출을 달력으로 확인합니다.\n\n• 날짜에 보라색 점(지출) / 초록 점(수입) 표시\n• 날짜 클릭 → 해당일 내역 팝업\n• 상단 년/월 클릭 → 원하는 달로 이동' },
          { icon: '📊', title: '통계', desc: '카테고리별 지출과 자산 흐름을 차트로 분석합니다.\n\n• 도넛 차트: 카테고리별 지출 비중 시각화\n• 월별 추이: 지출/수입 토글로 전환, 날짜 범위 자유 설정 가능\n• 총 자산 추이: 전월 대비 어느 자산이 얼마나 변화했는지 항목별로 확인\n  - 차트 탭 하여 자세히 보기 → 월별 변화액을 클릭하면 카테고리별 세부 변화 표시\n• 월 이동 버튼으로 과거 달 조회 가능' },
          { icon: '🏷️', title: '카테고리', desc: '지출·수입 카테고리를 관리합니다.\n\n• 추가 양식: 이모지·이름·지출수입·저장·취소를 한 줄로 입력\n• 이모지는 선택 사항 (비워도 저장 가능)\n• 왼쪽 핸들(⠿)을 드래그하여 순서 변경 (모바일·PC 모두 지원)\n• 드래그 중에는 수정/삭제 패널이 숨겨집니다\n• 수정 중인 항목은 앞으로 나오는 강조 효과로 표시\n• 항목을 오른쪽으로 스와이프 → 이름/이모지 수정\n• 항목을 왼쪽으로 스와이프 → 삭제\n• 지출/수입 탭 분리 관리' },
          { icon: '⚙️', title: '설정', desc: '앱 환경을 설정합니다.\n\n• 공지사항: 앱 업데이트 및 안내 확인\n• 포트폴리오: 자산 현황을 PDF로 출력\n• 🔒 보안: 닉네임·비밀번호 변경, 로그아웃, 회원 탈퇴' },
          { icon: '📄', title: '포트폴리오 PDF', desc: '나의 자산 현황을 PDF 파일로 저장합니다.\n\n• 설정 → 포트폴리오 PDF 출력 버튼 클릭\n• 포함할 항목 선택 후 PDF 출력\n• 미리보기 화면에서 ⬇ PDF 저장 버튼 클릭\n• 모바일: 공유 → 파일로 저장 / PC: 인쇄 → PDF로 저장' },
        ]
        return (
          <div className="card mb-3" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center" onClick={() => setHelpOpen(o => !o)} style={{ cursor: 'pointer' }}>
                <div className="fw-semibold" style={{ fontSize: '0.95rem' }}>❓ 도움말</div>
                <span style={{ color: '#bbb', fontSize: '0.85rem' }}>{helpOpen ? '▴' : '▾'}</span>
              </div>
              {helpOpen && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {HELP.map(h => (
                    <div key={h.title}>
                      <div onClick={() => setHelpItem(helpItem === h.title ? null : h.title)}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: helpItem === h.title ? '#f0eaff' : '#fafafa', cursor: 'pointer' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: helpItem === h.title ? '#7c4fbf' : '#333' }}>{h.icon} {h.title}</span>
                        <span style={{ color: '#bbb', fontSize: '0.75rem' }}>{helpItem === h.title ? '▴' : '▾'}</span>
                      </div>
                      {helpItem === h.title && (
                        <div style={{ padding: '10px 14px 6px', fontSize: '0.84rem', color: '#555', whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>
                          {h.desc}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* 보안 */}
      <div className="card mb-3" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body" style={{ paddingBottom: securityOpen ? 16 : undefined }}>
          <div className="d-flex justify-content-between align-items-center" onClick={() => setSecurityOpen(o => !o)} style={{ cursor: 'pointer' }}>
            <div className="fw-semibold" style={{ fontSize: '0.95rem' }}>🔒 보안</div>
            <span style={{ color: '#bbb', fontSize: '0.85rem' }}>{securityOpen ? '▴' : '▾'}</span>
          </div>
          {securityOpen && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* 닉네임 */}
              <div>
                <div className="fw-semibold mb-2" style={{ fontSize: '0.8rem', color: '#aaa' }}>닉네임</div>
                {!nicknameEdit ? (
                  <div className="d-flex justify-content-between align-items-center">
                    <span style={{ fontSize: '1rem', fontWeight: 600 }}>{user?.nickname || '(없음)'}</span>
                    <button onClick={() => { setNicknameVal(user?.nickname || ''); setNicknameEdit(true) }}
                      style={{ background: '#f0eeff', border: 'none', borderRadius: 10, padding: '7px 14px', color: '#b088f9', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>변경</button>
                  </div>
                ) : (
                  <div>
                    <input type="text" value={nicknameVal} onChange={e => setNicknameVal(e.target.value)} placeholder="닉네임 입력"
                      style={{ ...inputStyle, marginBottom: 10 }} onFocus={e => e.target.style.borderColor = '#b088f9'} onBlur={e => e.target.style.borderColor = '#e8e8e8'} autoFocus maxLength={30} />
                    <div className="d-flex gap-2">
                      <button onClick={saveNickname} disabled={nicknameSaving}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', opacity: nicknameSaving ? 0.7 : 1 }}>
                        {nicknameSaving ? '저장 중...' : '저장'}</button>
                      <button onClick={() => setNicknameEdit(false)}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: '#f2f2f7', color: '#666', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>취소</button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid #f5f5f5' }} />

              {/* 비밀번호 */}
              <div>
                <div className="fw-semibold mb-2" style={{ fontSize: '0.8rem', color: '#aaa' }}>비밀번호</div>
                {!pwEdit ? (
                  <div className="d-flex justify-content-between align-items-center">
                    <span style={{ fontSize: '1rem', fontWeight: 600, color: '#bbb', letterSpacing: 4 }}>••••••</span>
                    <button onClick={() => { setPwEdit(true); setPwError(''); setPwForm({ current: '', next: '', confirm: '' }) }}
                      style={{ background: '#f0eeff', border: 'none', borderRadius: 10, padding: '7px 14px', color: '#b088f9', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>변경</button>
                  </div>
                ) : (
                  <div>
                    <input type="password" placeholder="현재 비밀번호" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                      style={{ ...inputStyle, marginBottom: 8 }} onFocus={e => e.target.style.borderColor = '#b088f9'} onBlur={e => e.target.style.borderColor = '#e8e8e8'} />
                    <input type="password" placeholder="새 비밀번호 (6자 이상)" value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                      style={{ ...inputStyle, marginBottom: 8 }} onFocus={e => e.target.style.borderColor = '#b088f9'} onBlur={e => e.target.style.borderColor = '#e8e8e8'} />
                    <input type="password" placeholder="새 비밀번호 확인" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                      style={{ ...inputStyle, marginBottom: pwError ? 6 : 10 }} onFocus={e => e.target.style.borderColor = '#b088f9'} onBlur={e => e.target.style.borderColor = '#e8e8e8'} />
                    {pwError && <p style={{ color: '#dc3545', fontSize: '0.8rem', marginBottom: 8 }}>{pwError}</p>}
                    <div className="d-flex gap-2">
                      <button onClick={savePassword} disabled={pwSaving}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', opacity: pwSaving ? 0.7 : 1 }}>
                        {pwSaving ? '저장 중...' : '저장'}</button>
                      <button onClick={() => { setPwEdit(false); setPwError('') }}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: '#f2f2f7', color: '#666', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>취소</button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid #f5f5f5' }} />

              {/* 계정 / 로그아웃 */}
              <div>
                <div className="fw-semibold mb-2" style={{ fontSize: '0.8rem', color: '#aaa' }}>계정</div>
                <div className="text-muted mb-3" style={{ fontSize: '0.82rem' }}>{user?.email}</div>
                {!logoutConfirm ? (
                  <button onClick={() => setLogoutConfirm(true)}
                    style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: '#fff0f0', color: '#dc3545', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
                    로그아웃
                  </button>
                ) : (
                  <div>
                    <p style={{ fontSize: '0.88rem', color: '#555', marginBottom: 12, textAlign: 'center' }}>로그아웃 하시겠습니까?</p>
                    <div className="d-flex gap-2">
                      <button onClick={handleLogout}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: '#dc3545', color: 'white', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>로그아웃</button>
                      <button onClick={() => setLogoutConfirm(false)}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: '#f2f2f7', color: '#666', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>취소</button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid #f5f5f5' }} />

              {/* 회원 탈퇴 */}
              <div>
                <div className="fw-semibold mb-2" style={{ fontSize: '0.8rem', color: '#aaa' }}>개인 정보 보호</div>
                {!deleteConfirm ? (
                  <button onClick={() => setDeleteConfirm(true)}
                    style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: '1.5px solid #dc3545', background: 'white', color: '#dc3545', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
                    회원 탈퇴
                  </button>
                ) : (
                  <div>
                    <p style={{ fontSize: '0.85rem', color: '#dc3545', marginBottom: 10 }}>탈퇴하면 모든 데이터가 삭제되며 복구할 수 없습니다.<br />확인을 위해 이메일 주소를 입력하세요.</p>
                    <input type="email" value={deleteInput} onChange={e => setDeleteInput(e.target.value)} placeholder={user?.email}
                      style={{ ...inputStyle, borderColor: '#ffcdd2', marginBottom: 10 }} />
                    <div className="d-flex gap-2">
                      <button onClick={handleDeleteAccount} disabled={deleteInput !== user?.email || deleting}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: deleteInput === user?.email ? '#dc3545' : '#eee', color: deleteInput === user?.email ? 'white' : '#aaa', fontWeight: 600, fontSize: '0.9rem', cursor: deleteInput === user?.email ? 'pointer' : 'not-allowed' }}>
                        {deleting ? '처리 중...' : '탈퇴 확인'}</button>
                      <button onClick={() => { setDeleteConfirm(false); setDeleteInput('') }}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: '#f2f2f7', color: '#666', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>취소</button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>

      {/* 공지사항 */}
      <div className="card mb-3" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div className="fw-semibold" style={{ fontSize: '0.88rem', color: '#888' }}>공지사항</div>
            <div className="d-flex gap-2 align-items-center">
              {user?.email === 'song57290@gmail.com' && (
                <button onClick={() => { setNoticeFormOpen(o => !o); setNoticeForm({ title: '', content: '' }) }}
                  style={{ background: '#f0eeff', border: 'none', borderRadius: 8, padding: '5px 10px', color: '#b088f9', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
                  {noticeFormOpen ? '취소' : '+ 작성'}
                </button>
              )}
              <button onClick={() => setNoticeOpen(o => !o)}
                style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '0.85rem', cursor: 'pointer', padding: '4px 6px' }}>
                {noticeOpen ? '▴' : '▾'}
              </button>
            </div>
          </div>

          {noticeFormOpen && (
            <form onSubmit={submitNotice} style={{ marginBottom: 12 }}>
              <input type="text" placeholder="제목" value={noticeForm.title}
                onChange={e => setNoticeForm(f => ({ ...f, title: e.target.value }))} required maxLength={100}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1.5px solid #e8e8e8', fontSize: '0.9rem', marginBottom: 8, outline: 'none', boxSizing: 'border-box' }} />
              <textarea placeholder="내용" value={noticeForm.content}
                onChange={e => setNoticeForm(f => ({ ...f, content: e.target.value }))} required rows={3}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1.5px solid #e8e8e8', fontSize: '0.9rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              <button type="submit" disabled={noticeSaving}
                style={{ marginTop: 8, width: '100%', padding: '9px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', opacity: noticeSaving ? 0.7 : 1 }}>
                {noticeSaving ? '등록 중...' : '등록'}
              </button>
            </form>
          )}

          {notices.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: '#ccc', margin: 0 }}>등록된 공지사항이 없습니다</p>
          ) : (
            <div>
              {/* 최신 1개는 항상 표시 */}
              {notices.slice(0, noticeOpen ? notices.length : 1).map(n => (
                <div key={n.id} style={{ borderRadius: 10, border: '1px solid #f0f0f0', marginBottom: 8, overflow: 'hidden' }}>
                  {editNotice === n.id ? (
                    <form onSubmit={saveEditNotice} style={{ padding: '12px 14px', background: '#faf8ff' }}>
                      <input type="text" value={editNoticeForm.title}
                        onChange={e => setEditNoticeForm(f => ({ ...f, title: e.target.value }))} required maxLength={100}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1.5px solid #d0b8ff', fontSize: '0.88rem', marginBottom: 8, outline: 'none', boxSizing: 'border-box' }} />
                      <textarea value={editNoticeForm.content}
                        onChange={e => setEditNoticeForm(f => ({ ...f, content: e.target.value }))} required rows={3}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1.5px solid #d0b8ff', fontSize: '0.88rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                      <div className="d-flex gap-2 mt-2">
                        <button type="submit" style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>저장</button>
                        <button type="button" onClick={() => setEditNotice(null)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: '#f2f2f7', color: '#666', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>취소</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="d-flex justify-content-between align-items-center"
                        onClick={() => setExpandedNotice(expandedNotice === n.id ? null : n.id)}
                        style={{ padding: '10px 14px', cursor: 'pointer', background: '#fafafa' }}>
                        <div>
                          <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#333' }}>{n.title}</span>
                          <span style={{ fontSize: '0.72rem', color: '#aaa', marginLeft: 8 }}>{n.created_at}</span>
                        </div>
                        <div className="d-flex align-items-center gap-2">
                          {n.is_admin && (
                            <>
                              <button onClick={e => { e.stopPropagation(); setEditNoticeForm({ title: n.title, content: n.content }); setEditNotice(n.id); setExpandedNotice(null) }}
                                style={{ background: 'none', border: 'none', color: '#b088f9', fontSize: '0.75rem', cursor: 'pointer', padding: '2px 4px' }}>수정</button>
                              <button onClick={e => { e.stopPropagation(); deleteNotice(n.id) }}
                                style={{ background: 'none', border: 'none', color: '#dc3545', fontSize: '0.75rem', cursor: 'pointer', padding: '2px 4px' }}>삭제</button>
                            </>
                          )}
                          <span style={{ color: '#bbb', fontSize: '0.75rem' }}>{expandedNotice === n.id ? '▴' : '▾'}</span>
                        </div>
                      </div>
                      {expandedNotice === n.id && (
                        <div style={{ padding: '10px 14px', fontSize: '0.85rem', color: '#555', whiteSpace: 'pre-wrap', lineHeight: 1.6, background: 'white' }}>
                          {n.content}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
              {!noticeOpen && notices.length > 1 && (
                <button onClick={() => setNoticeOpen(true)}
                  style={{ background: 'none', border: 'none', color: '#b088f9', fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}>
                  전체 보기 ({notices.length}개) ▾
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 포트폴리오 */}
      <div className="card mb-3" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          <div className="fw-semibold mb-1" style={{ fontSize: '0.88rem', color: '#888' }}>포트폴리오</div>
          <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: 12 }}>자산 구성, 예적금, 투자 내역 등을 PDF로 출력합니다.</p>
          <button onClick={openPfSheet}
            style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
            포트폴리오 PDF 출력
          </button>
        </div>
      </div>

      <div className="d-lg-none" style={{ height: 90 }} />

      {/* 포트폴리오 섹션 선택 시트 */}
      {pfSheetOpen && (
        <>
          <div onClick={closePfSheet} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1400, opacity: pfSheetVisible ? 1 : 0, transition: 'opacity 0.3s' }} />
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1500, background: '#fff', borderRadius: '20px 20px 0 0', transform: pfSheetVisible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.3s cubic-bezier(.32,1.1,.72,1)', boxShadow: '0 -4px 32px rgba(0,0,0,0.13)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>포함할 항목 선택</span>
              <button onClick={closePfSheet} style={{ background: '#f2f2f7', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {SECTION_LIST.map(({ key, label }) => {
                const on = pfSections[key]
                return (
                  <button key={key} onClick={() => setPfSections(s => ({ ...s, [key]: !s[key] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: on ? '#f0eaff' : '#f8f8f8', border: `1.5px solid ${on ? '#b088f9' : '#e8e8e8'}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: on ? '#b088f9' : 'transparent', border: `2px solid ${on ? '#b088f9' : '#ccc'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {on && <span style={{ color: 'white', fontSize: 13, lineHeight: 1 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: '0.95rem', color: on ? '#7c4fbf' : '#666', fontWeight: on ? 600 : 400 }}>{label}</span>
                  </button>
                )
              })}
            </div>
            <div style={{ padding: '0 20px 32px' }}>
              <button onClick={exportPortfolio} disabled={portfolioExporting}
                style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', background: portfolioExporting ? '#e8e8f8' : 'linear-gradient(135deg,#b088f9,#7baff0)', color: portfolioExporting ? '#aaa' : 'white', fontWeight: 700, fontSize: '1rem', cursor: portfolioExporting ? 'not-allowed' : 'pointer' }}>
                {portfolioExporting ? '생성 중...' : 'PDF 출력'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
