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
  const todayTxs = (d.transactions || []).filter(tx => tx.date === todayStr && tx.type === 'expense')
  const todayTotal = String(todayTxs.reduce((s, tx) => s + tx.amount, 0))
  const todayDate = `${now.getMonth() + 1}월 ${now.getDate()}일`
  const catMap = {}
  todayTxs.forEach(tx => { catMap[tx.category] = (catMap[tx.category] || 0) + tx.amount })
  const todayCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, a]) => `${n}:${a}`).join(',')

  WidgetData.update({
    income, expense, balance, month, month_key: monthKey, updated, budget,
    today_total: todayTotal, today_date: todayDate, today_key: todayStr, today_cats: todayCats,
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
