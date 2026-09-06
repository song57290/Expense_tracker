import { Capacitor, registerPlugin } from '@capacitor/core'
import api from './api.js'

const WidgetData = registerPlugin('WidgetData')

function pushToWidget(d) {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const month = `${now.getFullYear()}년 ${now.getMonth() + 1}월`
  const monthKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
  const updated = `${pad(now.getHours())}:${pad(now.getMinutes())} 업데이트`
  const income = (d.income_total ?? 0).toLocaleString()
  const expense = (d.expense_total ?? 0).toLocaleString()
  const balance = ((d.income_total ?? 0) - (d.expense_total ?? 0)).toLocaleString()
  const budget = String(d.budget_amount ?? 0)

  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const todayTxs = (d.transactions || []).filter(tx => tx.date === todayStr && tx.type === 'expense' && !tx.exclude_stats)
  const todayTotal = String(todayTxs.reduce((s, tx) => s + tx.amount, 0))
  const todayDate = `${now.getMonth() + 1}월 ${now.getDate()}일`
  const catMap = {}
  todayTxs.forEach(tx => { catMap[tx.category] = (catMap[tx.category] || 0) + tx.amount })
  const todayCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, a]) => `${n}:${a}`).join(',')

  // 이번 주(월~일) 요일별 지출 — 오늘 기준 월요일부터 하루씩 날짜 문자열을 만들어
  // d.transactions(이번 달 내역)에서 날짜가 일치하는 지출을 더한다. 주가 월 경계를
  // 넘으면(예: 이번 달 1일이 화요일이라 전달 말일이 이번 주 월요일인 경우) 그 전달
  // 쪽 날짜는 이번 달 내역에 없어 0으로 잡힌다.
  const mondayOffset = (now.getDay() + 6) % 7
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset)
  const weekDaily = []
  let weekIncome = 0
  const txs = d.transactions || []
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    const dayStr = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
    const dayTxs = txs.filter(tx => tx.date === dayStr && !tx.exclude_stats)
    weekDaily.push(dayTxs.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0))
    weekIncome += dayTxs.filter(tx => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0)
  }
  const weekTotal = weekDaily.reduce((s, v) => s + v, 0)
  const weekAvg = Math.round(weekTotal / (mondayOffset + 1))

  WidgetData.update({
    income, expense, balance, month, month_key: monthKey, updated, budget,
    today_total: todayTotal, today_date: todayDate, today_key: todayStr, today_cats: todayCats,
    week_daily: weekDaily.join(','), week_today_index: String(mondayOffset),
    week_total: String(weekTotal), week_avg: String(weekAvg), week_income: String(weekIncome),
  }).catch(e => console.error('[Widget] update failed:', e))
}

// Push the latest home totals to the native home-screen widgets. Call this after ANY
// transaction add/edit/delete, from whichever screen it happened on — not just Home.
// Pass already-fetched /api/home data to skip the extra request, or call with no args
// to fetch fresh.
export function syncWidget(homeData) {
  if (!Capacitor.isNativePlatform()) return
  if (homeData) { pushToWidget(homeData); return }
  api.get('/api/home').then(pushToWidget).catch(e => console.error('[Widget] sync fetch failed:', e))
}
