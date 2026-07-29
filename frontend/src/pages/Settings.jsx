import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'


function makeSvgDonut(items, colors, size = 180, netTotal = null) {
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
  const displayVal = netTotal !== null ? netTotal : total
  const label = Math.abs(displayVal) >= 100000000 ? `${(displayVal/100000000).toFixed(1)}억원` : `${Math.round(displayVal/10000)}만원`
  const centerLabel = netTotal !== null ? '순자산' : '총 자산'
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}<text x="${cx}" y="${cy-7}" text-anchor="middle" font-size="13" font-weight="bold" fill="#333">${label}</text><text x="${cx}" y="${cy+11}" text-anchor="middle" font-size="10" fill="#888">${centerLabel}</text></svg>`
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
    .ci{color:#198754}.ce{color:#dc3545}.cb{color:#b088f9}.cn{color:#333}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px}
    thead th{background:#f8f5ff;color:#555;font-weight:700;padding:8px 10px;text-align:left;border-bottom:2px solid #e8d5ff}
    tbody td{padding:8px 10px;border-bottom:1px solid #f5f5f5;vertical-align:middle}
    tbody tr:last-child td{border-bottom:none}
    .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600}
    .be{background:#ffe0e0;color:#dc3545}.bi{background:#d4edda;color:#198754}
    .by{background:#f0e8fd;color:#b088f9}.bj{background:#f0e8fd;color:#b088f9}
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

  const dday = (s) => {
    if (s.stype === '청약') {
      if (!s.start_date) return '-'
      const diff = Math.round((new Date() - new Date(s.start_date)) / 86400000)
      return `D+${diff}`
    }
    const diff = Math.round((new Date(s.end_date) - new Date()) / 86400000)
    if (diff < 0) return `D+${Math.abs(diff)}`
    if (diff === 0) return 'D-Day'
    return `D-${diff}`
  }
  const monthsStr = (s) => {
    if (s.stype === '청약') {
      if (!s.start_date) return '-'
      const st = new Date(s.start_date)
      const now = new Date()
      const m = (now.getFullYear() - st.getFullYear()) * 12 + (now.getMonth() - st.getMonth())
      return `${m}개월`
    }
    return `${s.months_total}개월`
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

  const normalCards = cards.filter(c => !c.is_loan)
  const loanCards = cards.filter(c => c.is_loan)
  const normalCardsHtml = normalCards.map(c => `
    <div class="cp">
      <div class="cn2" style="display:flex;align-items:center;gap:10px">${bankLogoTag(c.name)}<span>${c.name}</span></div>
      <div class="ig">
        <div class="ic"><div class="l">초기 잔고</div><div class="v">${f(c.initial_balance)}원</div></div>
        <div class="ic"><div class="l">이달 수입</div><div class="v ci">${f(c.month_income)}원</div></div>
        <div class="ic"><div class="l">이달 지출</div><div class="v ce">${f(c.spent)}원</div></div>
      </div>
      <div class="ig">
        <div class="ic"><div class="l">현재 잔고</div><div class="v ${c.balance < 0 ? 'ce' : ''}">${f(c.balance)}원</div></div>
        <div class="ic"><div class="l">목표 금액</div><div class="v">${c.target ? f(c.target) + '원' : '-'}</div></div>
        <div class="ic"><div class="l">달성률</div><div class="v" style="color:#b088f9">${c.percent || 0}%</div></div>
      </div>
      ${c.target ? `
      <div style="margin-top:4px">
        <div class="pb"><div class="pf" style="width:${Math.min(c.percent||0,100)}%;background:linear-gradient(90deg,#b088f9,#7baff0)"></div></div>
        <div class="pl"><span>0원</span><span>${f(c.target)}원</span></div>
      </div>` : ''}
    </div>
  `).join('')
  const loanCardsHtml = loanCards.map(c => {
    const repaidPct = c.balance ? Math.min(100, Math.round((c.total_repaid || 0) / Math.abs(c.balance) * 100)) : 0
    return `
    <div class="cp">
      <div class="cn2" style="display:flex;align-items:center;gap:10px">${bankLogoTag(c.name)}<span style="color:#dc3545">${c.name}</span></div>
      <div class="ig">
        <div class="ic"><div class="l">대출 잔액</div><div class="v ce">-${f(Math.abs(c.balance))}원</div></div>
        <div class="ic"><div class="l">이달 상환</div><div class="v ci">${f(c.total_repaid || 0)}원</div></div>
        <div class="ic"><div class="l">상환률</div><div class="v" style="color:#b088f9">${repaidPct}%</div></div>
      </div>
      ${c.interest_rate != null ? `<div class="ig"><div class="ic"><div class="l">연 이자율</div><div class="v ce">${c.interest_rate}%</div></div></div>` : ''}
    </div>`
  }).join('')
  const loanDivider = loanCards.length > 0 ? `
    <div style="display:flex;align-items:center;gap:10px;margin:20px 0 12px">
      <span style="font-size:0.82rem;font-weight:700;color:#dc3545;white-space:nowrap">💸 대출</span>
      <div style="flex:1;height:2px;background:#fde8e8;border-radius:1px"></div>
    </div>${loanCardsHtml}` : ''
  const cardsHtml = cards.length === 0
    ? '<div class="empty">등록된 카드/계좌가 없습니다</div>'
    : normalCardsHtml + loanDivider

  const savingsHtml = savings.length === 0 ? '<div class="empty">등록된 예적금이 없습니다</div>' : savings.map(s => `
    <div class="sp">
      <div class="sh">
        <div class="sn" style="display:flex;align-items:center;gap:8px">${bankLogoTag(s.bank, 28)}<span>${s.bank}</span>&nbsp;<span class="badge ${s.stype === '예금' ? 'by' : 'bj'}">${s.stype}</span></div>
        <div class="dd">${dday(s)}</div>
      </div>
      <div class="sg2">
        <div class="ic"><div class="l">${s.stype === '예금' ? '예치금액' : '월 납입액'}</div><div class="v">${f(s.amount)}원</div></div>
        <div class="ic"><div class="l">연 이율</div><div class="v">${s.interest_rate}%</div></div>
        <div class="ic"><div class="l">기간</div><div class="v">${monthsStr(s)}</div></div>
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

  const recentTxs = [...txs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)
  const txsHtml = recentTxs.length === 0 ? '<div class="empty">거래 내역이 없습니다</div>' : `
    <table>
      <thead><tr><th>날짜</th><th>유형</th><th>카테고리</th><th>설명</th><th>카드/계좌</th><th style="text-align:right">금액</th></tr></thead>
      <tbody>
        ${recentTxs.map(t => `
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
        ${investments.map(i => {
          const fx = i.exchange_rate || 1
          const isUsd = i.itype === '해외주식' && i.exchange_rate
          const avgKrw = isUsd ? Math.round(i.avg_price * fx) : i.avg_price
          const curKrw = isUsd ? Math.round(i.current_price * fx) : i.current_price
          const gain = i.profit || 0
          const gainPct = i.profit_pct || 0
          return `
        <tr>
          <td><span class="badge bj">${i.itype}</span></td>
          <td>${i.name}${i.ticker ? ` (${i.ticker})` : ''}</td>
          <td style="text-align:right">${i.quantity}${i.itype === '코인' ? '개' : '주'}</td>
          <td style="text-align:right">${f(avgKrw)}원${isUsd ? `<br><span style="font-size:10px;color:#aaa">$${i.avg_price.toFixed(2)}</span>` : ''}</td>
          <td style="text-align:right">${f(curKrw)}원${isUsd ? `<br><span style="font-size:10px;color:#aaa">$${i.current_price.toFixed(2)}</span>` : ''}</td>
          <td style="text-align:right;font-weight:700">${f(i.current_value)}원</td>
          <td style="text-align:right;color:${gain >= 0 ? '#dc3545' : '#0d6efd'}">${gain >= 0 ? '+' : ''}${f(gain)}원<br><span style="font-size:11px">(${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%)</span></td>
        </tr>`
        }).join('')}
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
  const isCashCard = name => name.includes('현금') || name.includes('지갑')
  const cashCards = cards.filter(c => isCashCard(c.name))
  const nonCashCards = cards.filter(c => !isCashCard(c.name))
  const cardPos = nonCashCards.filter(c => (c.balance || 0) > 0).reduce((s, c) => s + (c.balance || 0), 0)
  const loanTotal = nonCashCards.filter(c => (c.balance || 0) < 0).reduce((s, c) => s + (c.balance || 0), 0)
  const cashTotal = cashCards.filter(c => (c.balance || 0) > 0).reduce((s, c) => s + (c.balance || 0), 0)
  const depositTotal = savings.filter(s => s.stype === '예금').reduce((s, v) => s + (v.amount || 0), 0)
  const installTotal = savings.filter(s => s.stype === '적금' || s.stype === '청약').reduce((s, v) => s + (v.current_paid || 0), 0)
  const assetItems = []
  if (cashTotal > 0) assetItems.push(['현금', cashTotal])
  if (depositTotal > 0) assetItems.push(['예금', depositTotal])
  if (installTotal > 0) assetItems.push(['적금/청약', installTotal])
  const invByType = {}
  investments.forEach(i => { invByType[i.itype] = (invByType[i.itype] || 0) + (i.current_value || 0) })
  Object.entries(invByType).forEach(([k, v]) => { if (v > 0) assetItems.push([k, v]) })
  assetItems.sort((a, b) => b[1] - a[1])
  const assetTotal2 = assetItems.reduce((s, x) => s + x[1], 0)
  const donutSvg = makeSvgDonut(assetItems, COLORS, 180, netWorth)
  const legendHtml = [
    ...assetItems.map(([label, value], i) => {
      const pct = assetTotal2 ? (value / assetTotal2 * 100).toFixed(1) : 0
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
    }),
    ...(loanTotal < 0 ? [(
      `<div style="margin-bottom:10px;border-top:1px solid #f0f0f0;padding-top:10px">` +
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">` +
      `<svg width="12" height="12" style="flex-shrink:0;vertical-align:middle"><rect width="12" height="12" rx="3" fill="#ff6b6b"/></svg>` +
      `<span style="flex:1;font-size:12px;color:#e05555">대출</span>` +
      `<span style="font-size:12px;font-weight:700;color:#e05555">-${f(Math.abs(loanTotal))}원</span>` +
      `<span style="font-size:11px;color:#aaa;width:38px;text-align:right">${assetTotal2 ? (Math.abs(loanTotal) / assetTotal2 * 100).toFixed(1) : 0}%</span>` +
      `</div>` +
      `<svg width="100%" height="8" style="display:block;border-radius:4px;overflow:hidden">` +
      `<rect width="100%" height="8" rx="4" fill="#f0f0f0"/>` +
      `<rect width="${assetTotal2 ? Math.min(100, Math.abs(loanTotal) / assetTotal2 * 100).toFixed(1) : 0}%" height="8" rx="4" fill="#ff6b6b"/>` +
      `</svg></div>`
    )] : []),
  ].join('')
  const assetCompositionHtml = `<div style="display:flex;flex-direction:column;align-items:center;gap:16px">${donutSvg}<div style="width:100%">${legendHtml}</div></div>`

  const sec = sections || {}

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>포트폴리오 - ${d.user?.email || ''}</title><style>${css}</style></head>
<body>
<button class="pdfbtn" onclick="window.print()">⬇ PDF 저장</button>
<div class="hdr">
  <h1>재무 포트폴리오</h1>
  <div class="meta">계정: ${d.user?.email || ''} &nbsp;|&nbsp; 출력일: ${dateStr}</div>
</div>

${sec.summary !== false ? `<div class="sec">
  <h2>순자산 요약</h2>
  <div class="si"><div class="sg">
    <div class="sc"><div class="l">순자산</div><div class="v cn">${f(netWorth)}원</div></div>
    <div class="sc"><div class="l">이달 수입</div><div class="v ci">${f(sm.income)}원</div></div>
    <div class="sc"><div class="l">이달 지출</div><div class="v ce">${f(sm.expense)}원</div></div>
    <div class="sc"><div class="l">총계</div><div class="v cb">${f(sm.balance)}원</div></div>
  </div></div>
</div>` : ''}

${sec.asset_composition !== false ? `<div class="sec"><h2>자산 구성(잔고 제외)</h2><div class="si">${assetCompositionHtml}</div></div>` : ''}

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
  <h2>거래 내역 (최근 ${recentTxs.length}건)</h2>
  <div class="si">${txsHtml}</div>
</div>` : ''}

<div class="footer">생성: 나의 가계부 앱 &nbsp;|&nbsp; ${d.user?.email || ''} &nbsp;|&nbsp; ${dateStr}</div>
</body>
</html>`
}

export default function Settings() {
  const navigate = useNavigate()
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
  const [pfSections, setPfSections] = useState({ summary: true, asset_composition: true, cards: true, savings: true, investments: true, transactions: false })
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
  const [helpItems, setHelpItems] = useState([])
  const [editHelpId, setEditHelpId] = useState(null)
  const [editHelpForm, setEditHelpForm] = useState({ icon: '', title: '', desc: '' })

  const loadNotices = () => api.get('/api/notices').then(setNotices).catch(() => {})
  const loadHelp = () => api.get('/api/help').then(setHelpItems).catch(() => {})


  useEffect(() => {
    api.get('/api/me').then(d => { setUser(d.user); setNicknameVal(d.user?.nickname || '') }).catch(() => {})
    loadNotices()
    loadHelp()
  }, [])

  async function saveHelp(id) {
    await api.put(`/api/help/${id}`, editHelpForm)
    setEditHelpId(null)
    loadHelp()
  }


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

  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system')
  const themeTabRefs = useRef([])
  const themeIndRef = useRef(null)
  const THEME_OPTIONS = ['light', 'dark', 'system']
  useEffect(() => {
    const idx = THEME_OPTIONS.indexOf(theme)
    const tab = themeTabRefs.current[idx]
    const ind = themeIndRef.current
    if (tab && ind) {
      ind.style.left = tab.offsetLeft + 'px'
      ind.style.width = tab.offsetWidth + 'px'
    }
  }, [theme])
  const [helpOpen, setHelpOpen] = useState(false)
  const [helpItem, setHelpItem] = useState(null)
  const [securityOpen, setSecurityOpen] = useState(false)
  const [logoutConfirm, setLogoutConfirm] = useState(false)

  function applyTheme(t) {
    setTheme(t)
    localStorage.setItem('theme', t)
    document.documentElement.classList.add('theme-transitioning')
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
    else if (t === 'light') document.documentElement.setAttribute('data-theme', 'light')
    else document.documentElement.removeAttribute('data-theme')
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 400)
    const isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
      StatusBar.setBackgroundColor({ color: isDark ? '#6b44b0' : '#b088f9' })
      StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
    }).catch(() => {})
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

  // 안드로이드 뒤로가기로 포트폴리오 시트 닫기
  useEffect(() => {
    if (!pfSheetOpen) return
    const handler = (e) => { e.preventDefault(); closePfSheet() }
    window.addEventListener('appBackButton', handler)
    return () => window.removeEventListener('appBackButton', handler)
  }, [pfSheetOpen])

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

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--border-light)', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', background: 'var(--input-bg)', color: 'var(--text-primary)' }

  const SECTION_LIST = [
    { key: 'summary', label: '순자산 요약' },
    { key: 'asset_composition', label: '자산 구성' },
    { key: 'cards', label: '카드 / 계좌' },
    { key: 'savings', label: '예적금' },
    { key: 'investments', label: '투자 종목' },
    { key: 'transactions', label: '거래 내역' },
  ]

  return (
    <div style={{ animation: 'settingsFadeIn 0.28s ease' }}>
      <style>{`
        @keyframes settingsFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .s-card { transition: box-shadow 0.2s ease, transform 0.2s ease; }
        .s-card:hover { box-shadow: 0 4px 20px rgba(176,136,249,0.13) !important; }
        .s-arrow { display: inline-block; transition: transform 0.25s cubic-bezier(0.4,0,0.2,1); color: var(--text-faint); font-size: 0.85rem; line-height: 1; }
        .s-collapse { overflow: hidden; transition: max-height 0.32s cubic-bezier(0.4,0,0.2,1); }
      `}</style>
      <h5 className="fw-bold mb-3">설정</h5>

      {/* 화면 테마 */}
      <div className="card mb-3 s-card" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          <div className="fw-semibold mb-3" style={{ fontSize: '0.95rem' }}>🌙 화면 테마</div>
          <div style={{ display: 'flex', background: 'var(--bg-accent)', borderRadius: 12, padding: 3, position: 'relative' }}>
            <div ref={themeIndRef} className="theme-sel-ind" style={{
              position: 'absolute', top: 3, bottom: 3,
              background: 'var(--bg-card)', borderRadius: 9,
              boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
              transition: 'left 0.28s cubic-bezier(0.25,0.46,0.45,0.94), width 0.28s cubic-bezier(0.25,0.46,0.45,0.94)',
              pointerEvents: 'none', zIndex: 0,
            }} />
            {[['light', '☀️ 라이트'], ['dark', '🌙 다크'], ['system', '⚙️ 시스템']].map(([val, label], i) => (
              <button key={val} ref={el => themeTabRefs.current[i] = el} onClick={() => applyTheme(val)} style={{
                flex: 1, padding: '9px 4px', borderRadius: 9, border: 'none', fontSize: '0.82rem',
                fontWeight: theme === val ? 700 : 400,
                background: 'transparent',
                color: theme === val ? '#b088f9' : 'var(--text-muted)',
                cursor: 'pointer', transition: 'color 0.28s', whiteSpace: 'nowrap',
                position: 'relative', zIndex: 1,
              }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 도움말 */}
      <div className="card mb-3 s-card" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center" onClick={() => setHelpOpen(o => !o)} style={{ cursor: 'pointer' }}>
            <div className="fw-semibold" style={{ fontSize: '0.95rem' }}>❓ 도움말</div>
            <span className="s-arrow" style={{ transform: helpOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
          </div>
          <div className="s-collapse" style={{ maxHeight: helpOpen ? '1200px' : '0' }}>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {helpItems.map(h => (
                <div key={h.id}>
                  <div onClick={() => { if (editHelpId !== h.id) setHelpItem(helpItem === h.title ? null : h.title) }}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: helpItem === h.title ? 'var(--bg-accent)' : 'var(--bg-elevated)', cursor: 'pointer', transition: 'background 0.18s ease' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: helpItem === h.title ? '#7c4fbf' : 'var(--text-primary)' }}>{h.icon} {h.title}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {user?.email === 'song57290@gmail.com' && (
                        <span onClick={e => { e.stopPropagation(); setEditHelpId(editHelpId === h.id ? null : h.id); setEditHelpForm({ icon: h.icon, title: h.title, desc: h.desc }) }}
                          style={{ fontSize: '0.78rem', color: '#b088f9', padding: '2px 8px', borderRadius: 6, background: 'var(--bg-accent)', fontWeight: 600 }}>편집</span>
                      )}
                      <span className="s-arrow" style={{ transform: helpItem === h.title ? 'rotate(180deg)' : 'rotate(0deg)', fontSize: '0.75rem' }}>▼</span>
                    </div>
                  </div>
                  {/* 관리자 편집 폼 */}
                  <div className="s-collapse" style={{ maxHeight: editHelpId === h.id ? '400px' : '0' }}>
                    <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 10, margin: '4px 0' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <input value={editHelpForm.icon} onChange={e => setEditHelpForm(f => ({ ...f, icon: e.target.value }))}
                          placeholder="이모지" style={{ width: 52, padding: '6px 8px', borderRadius: 8, border: '1.5px solid var(--border-input)', fontSize: '1rem', textAlign: 'center' }} />
                        <input value={editHelpForm.title} onChange={e => setEditHelpForm(f => ({ ...f, title: e.target.value }))}
                          placeholder="탭 이름" style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border-input)', fontSize: '0.88rem' }} />
                      </div>
                      <textarea value={editHelpForm.desc} onChange={e => setEditHelpForm(f => ({ ...f, desc: e.target.value }))}
                        rows={6} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border-input)', fontSize: '0.84rem', lineHeight: 1.7, resize: 'vertical' }} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button onClick={() => saveHelp(h.id)}
                          style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>저장</button>
                        <button onClick={() => setEditHelpId(null)}
                          style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid var(--border-input)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>취소</button>
                      </div>
                    </div>
                  </div>
                  {/* 내용 */}
                  <div className="s-collapse" style={{ maxHeight: helpItem === h.title && editHelpId !== h.id ? '600px' : '0' }}>
                    <div style={{ padding: '10px 14px 6px', fontSize: '0.84rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>
                      {h.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 보안 */}
      <div className="card mb-3 s-card" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center" onClick={() => setSecurityOpen(o => !o)} style={{ cursor: 'pointer' }}>
            <div className="fw-semibold" style={{ fontSize: '0.95rem' }}>🔒 보안</div>
            <span className="s-arrow" style={{ transform: securityOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
          </div>
          <div className="s-collapse" style={{ maxHeight: securityOpen ? '1000px' : '0' }}>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* 닉네임 */}
              <div>
                <div className="fw-semibold mb-2" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>닉네임</div>
                {!nicknameEdit ? (
                  <div className="d-flex justify-content-between align-items-center">
                    <span style={{ fontSize: '1rem', fontWeight: 600 }}>{user?.nickname || '(없음)'}</span>
                    <button onClick={() => { setNicknameVal(user?.nickname || ''); setNicknameEdit(true) }}
                      style={{ background: 'var(--bg-accent)', border: 'none', borderRadius: 10, padding: '7px 14px', color: '#b088f9', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>변경</button>
                  </div>
                ) : (
                  <div>
                    <input type="text" value={nicknameVal} onChange={e => setNicknameVal(e.target.value)} placeholder="닉네임 입력"
                      style={{ ...inputStyle, marginBottom: 10 }} onFocus={e => e.target.style.borderColor = '#b088f9'} onBlur={e => e.target.style.borderColor = 'var(--border-light)'} autoFocus maxLength={30} />
                    <div className="d-flex gap-2">
                      <button onClick={saveNickname} disabled={nicknameSaving}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', opacity: nicknameSaving ? 0.7 : 1 }}>
                        {nicknameSaving ? '저장 중...' : '저장'}</button>
                      <button onClick={() => setNicknameEdit(false)}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: 'var(--bg-section)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>취소</button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--border-light)' }} />

              {/* 비밀번호 */}
              <div>
                <div className="fw-semibold mb-2" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>비밀번호</div>
                {!pwEdit ? (
                  <div className="d-flex justify-content-between align-items-center">
                    <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-faint)', letterSpacing: 4 }}>••••••</span>
                    <button onClick={() => { setPwEdit(true); setPwError(''); setPwForm({ current: '', next: '', confirm: '' }) }}
                      style={{ background: 'var(--bg-accent)', border: 'none', borderRadius: 10, padding: '7px 14px', color: '#b088f9', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>변경</button>
                  </div>
                ) : (
                  <div>
                    <input type="password" placeholder="현재 비밀번호" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                      style={{ ...inputStyle, marginBottom: 8 }} onFocus={e => e.target.style.borderColor = '#b088f9'} onBlur={e => e.target.style.borderColor = 'var(--border-light)'} />
                    <input type="password" placeholder="새 비밀번호 (6자 이상)" value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                      style={{ ...inputStyle, marginBottom: 8 }} onFocus={e => e.target.style.borderColor = '#b088f9'} onBlur={e => e.target.style.borderColor = 'var(--border-light)'} />
                    <input type="password" placeholder="새 비밀번호 확인" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                      style={{ ...inputStyle, marginBottom: pwError ? 6 : 10 }} onFocus={e => e.target.style.borderColor = '#b088f9'} onBlur={e => e.target.style.borderColor = 'var(--border-light)'} />
                    {pwError && <p style={{ color: '#dc3545', fontSize: '0.8rem', marginBottom: 8 }}>{pwError}</p>}
                    <div className="d-flex gap-2">
                      <button onClick={savePassword} disabled={pwSaving}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', opacity: pwSaving ? 0.7 : 1 }}>
                        {pwSaving ? '저장 중...' : '저장'}</button>
                      <button onClick={() => { setPwEdit(false); setPwError('') }}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: 'var(--bg-section)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>취소</button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--border-light)' }} />

              {/* 계정 / 로그아웃 */}
              <div>
                <div className="fw-semibold mb-2" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>계정</div>
                <div className="text-muted mb-3" style={{ fontSize: '0.82rem' }}>{user?.email}</div>
                {!logoutConfirm ? (
                  <button onClick={() => setLogoutConfirm(true)}
                    style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: '#fff0f0', color: '#dc3545', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
                    로그아웃
                  </button>
                ) : (
                  <div>
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: 12, textAlign: 'center' }}>로그아웃 하시겠습니까?</p>
                    <div className="d-flex gap-2">
                      <button onClick={handleLogout}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: '#dc3545', color: 'white', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>로그아웃</button>
                      <button onClick={() => setLogoutConfirm(false)}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: 'var(--bg-section)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>취소</button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--border-light)' }} />

              {/* 회원 탈퇴 */}
              <div>
                <div className="fw-semibold mb-2" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>개인 정보 보호</div>
                {!deleteConfirm ? (
                  <button onClick={() => setDeleteConfirm(true)}
                    style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: '1.5px solid #dc3545', background: 'var(--bg-card)', color: '#dc3545', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
                    회원 탈퇴
                  </button>
                ) : (
                  <div>
                    <p style={{ fontSize: '0.85rem', color: '#dc3545', marginBottom: 10 }}>탈퇴하면 모든 데이터가 삭제되며 복구할 수 없습니다.<br />확인을 위해 이메일 주소를 입력하세요.</p>
                    <input type="email" value={deleteInput} onChange={e => setDeleteInput(e.target.value)} placeholder={user?.email}
                      style={{ ...inputStyle, borderColor: '#ffcdd2', marginBottom: 10 }} />
                    <div className="d-flex gap-2">
                      <button onClick={handleDeleteAccount} disabled={deleteInput !== user?.email || deleting}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: deleteInput === user?.email ? '#dc3545' : 'var(--bg-section)', color: deleteInput === user?.email ? 'white' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.9rem', cursor: deleteInput === user?.email ? 'pointer' : 'not-allowed' }}>
                        {deleting ? '처리 중...' : '탈퇴 확인'}</button>
                      <button onClick={() => { setDeleteConfirm(false); setDeleteInput('') }}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: 'var(--bg-section)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>취소</button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* 공지사항 */}
      <div className="card mb-3 s-card" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div className="fw-semibold" style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>공지사항</div>
            <div className="d-flex gap-2 align-items-center">
              <button onClick={() => window.dispatchEvent(new Event('showUpdateNotice'))}
                style={{ background: 'var(--bg-accent)', border: 'none', borderRadius: 8, padding: '5px 10px', color: '#b088f9', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                🆕 업데이트 내역
              </button>
              {user?.email === 'song57290@gmail.com' && (
                <button onClick={() => { setNoticeFormOpen(o => !o); setNoticeForm({ title: '', content: '' }) }}
                  style={{ background: 'var(--bg-accent)', border: 'none', borderRadius: 8, padding: '5px 10px', color: '#b088f9', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
                  {noticeFormOpen ? '취소' : '+ 작성'}
                </button>
              )}
              <button onClick={() => setNoticeOpen(o => !o)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }}>
                <span className="s-arrow" style={{ transform: noticeOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
              </button>
            </div>
          </div>

          {noticeFormOpen && (
            <form onSubmit={submitNotice} style={{ marginBottom: 12 }}>
              <input type="text" placeholder="제목" value={noticeForm.title}
                onChange={e => setNoticeForm(f => ({ ...f, title: e.target.value }))} required maxLength={100}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1.5px solid var(--border-light)', fontSize: '0.9rem', marginBottom: 8, outline: 'none', boxSizing: 'border-box', background: 'var(--input-bg)', color: 'var(--text-primary)' }} />
              <textarea placeholder="내용" value={noticeForm.content}
                onChange={e => setNoticeForm(f => ({ ...f, content: e.target.value }))} required rows={3}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1.5px solid var(--border-light)', fontSize: '0.9rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: 'var(--input-bg)', color: 'var(--text-primary)' }} />
              <button type="submit" disabled={noticeSaving}
                style={{ marginTop: 8, width: '100%', padding: '9px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', opacity: noticeSaving ? 0.7 : 1 }}>
                {noticeSaving ? '등록 중...' : '등록'}
              </button>
            </form>
          )}

          {notices.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-faint)', margin: 0 }}>등록된 공지사항이 없습니다</p>
          ) : (
            <div>
              {/* 최신 1개는 항상 표시 */}
              {notices.slice(0, noticeOpen ? notices.length : 1).map(n => (
                <div key={n.id} style={{ borderRadius: 10, border: '1px solid var(--border-light)', marginBottom: 8, overflow: 'hidden' }}>
                  {editNotice === n.id ? (
                    <form onSubmit={saveEditNotice} style={{ padding: '12px 14px', background: 'var(--bg-elevated)' }}>
                      <input type="text" value={editNoticeForm.title}
                        onChange={e => setEditNoticeForm(f => ({ ...f, title: e.target.value }))} required maxLength={100}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1.5px solid var(--border-input)', fontSize: '0.88rem', marginBottom: 8, outline: 'none', boxSizing: 'border-box', background: 'var(--input-bg)', color: 'var(--text-primary)' }} />
                      <textarea value={editNoticeForm.content}
                        onChange={e => setEditNoticeForm(f => ({ ...f, content: e.target.value }))} required rows={3}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1.5px solid var(--border-input)', fontSize: '0.88rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: 'var(--input-bg)', color: 'var(--text-primary)' }} />
                      <div className="d-flex gap-2 mt-2">
                        <button type="submit" style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>저장</button>
                        <button type="button" onClick={() => setEditNotice(null)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: 'var(--bg-section)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>취소</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="d-flex justify-content-between align-items-center"
                        onClick={() => setExpandedNotice(expandedNotice === n.id ? null : n.id)}
                        style={{ padding: '10px 14px', cursor: 'pointer', background: 'var(--bg-elevated)' }}>
                        <div>
                          <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>{n.title}</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 8 }}>{n.created_at}</span>
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
                          <span className="s-arrow" style={{ transform: expandedNotice === n.id ? 'rotate(180deg)' : 'rotate(0deg)', fontSize: '0.75rem' }}>▼</span>
                        </div>
                      </div>
                      <div className="s-collapse" style={{ maxHeight: expandedNotice === n.id ? '400px' : '0' }}>
                        <div style={{ padding: '10px 14px', fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6, background: 'var(--bg-card)' }}>
                          {n.content}
                        </div>
                      </div>
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

      {/* 카테고리 + 루틴 관리 */}
      <div className="card mb-3 s-card" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          <div className="fw-semibold mb-1" style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>카테고리</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>지출·수입 카테고리를 추가하거나 삭제합니다.</p>
          <button onClick={() => navigate('/categories')}
            style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
            카테고리 관리
          </button>

          <div style={{ borderTop: '1px solid var(--border-light)', margin: '16px -16px 0', paddingTop: 16, paddingLeft: 16, paddingRight: 16 }}>
            <div className="fw-semibold mb-1" style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>루틴</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>자주 쓰는 내역 카테고리를 루틴으로 저장합니다. 홈 탭에서 빠르게 불러올 수 있습니다.</p>
            <button onClick={() => navigate('/routines')}
              style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
              루틴 관리
            </button>
          </div>
        </div>
      </div>

      {/* 포트폴리오 */}
      <div className="card mb-3 s-card" style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <div className="card-body">
          <div className="fw-semibold mb-1" style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>포트폴리오</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>자산 구성, 예적금, 투자 내역 등을 PDF로 출력합니다.</p>
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
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1500, background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', transform: pfSheetVisible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.3s cubic-bezier(.32,1.1,.72,1)', boxShadow: '0 -4px 32px rgba(0,0,0,0.13)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid var(--border-light)' }}>
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>포함할 항목 선택</span>
              <button onClick={closePfSheet} style={{ background: 'var(--bg-section)', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {SECTION_LIST.map(({ key, label }) => {
                const on = pfSections[key]
                return (
                  <button key={key} onClick={() => setPfSections(s => ({ ...s, [key]: !s[key] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: on ? 'var(--bg-accent)' : 'var(--bg-section)', border: `1.5px solid ${on ? '#b088f9' : 'var(--border-light)'}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: on ? '#b088f9' : 'transparent', border: `2px solid ${on ? '#b088f9' : 'var(--border-light)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {on && <span style={{ color: 'white', fontSize: 13, lineHeight: 1 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: '0.95rem', color: on ? '#7c4fbf' : 'var(--text-secondary)', fontWeight: on ? 600 : 400 }}>{label}</span>
                  </button>
                )
              })}
            </div>
            <div style={{ padding: '0 20px 32px' }}>
              <button onClick={exportPortfolio} disabled={portfolioExporting}
                style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', background: portfolioExporting ? 'var(--bg-section)' : 'linear-gradient(135deg,#b088f9,#7baff0)', color: portfolioExporting ? 'var(--text-muted)' : 'white', fontWeight: 700, fontSize: '1rem', cursor: portfolioExporting ? 'not-allowed' : 'pointer' }}>
                {portfolioExporting ? '생성 중...' : 'PDF 출력'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
