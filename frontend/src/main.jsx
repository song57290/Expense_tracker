import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './index.css'
import { Capacitor, registerPlugin } from '@capacitor/core'

const WidgetData = registerPlugin('WidgetData')

function getThemeState() {
  const theme = localStorage.getItem('theme') || 'system'
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolvedTheme = theme === 'system'
    ? (systemDark ? 'dark' : 'light')
    : theme

  return {
    theme,
    resolvedTheme,
    isDark: resolvedTheme === 'dark'
  }
}

async function syncWidgetTheme() {
  if (!Capacitor.isNativePlatform()) return

  const { theme, resolvedTheme } = getThemeState()

  try {
    await WidgetData.updateTheme({
      theme,
      resolvedTheme
    })
  } catch (e) {
    console.warn('Widget theme sync failed:', e)
  }
}

function applyTheme() {
  const { theme, resolvedTheme, isDark } = getThemeState()

  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', resolvedTheme)
  }

  return isDark
}

if (Capacitor.isNativePlatform()) {
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    const isDark = applyTheme()

    StatusBar.setOverlaysWebView({ overlay: false })
    StatusBar.setBackgroundColor({
      color: isDark ? '#6b44b0' : '#b088f9'
    })
    StatusBar.setStyle({
      style: isDark ? Style.Dark : Style.Light
    })

    syncWidgetTheme()
  }).catch(() => {})
} else {
  applyTheme()
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

// 시스템 테마 변경 감지
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')

systemTheme.addEventListener('change', () => {
  const theme = localStorage.getItem('theme') || 'system'

  if (theme !== 'system') return

  applyTheme()
  syncWidgetTheme()

  if (Capacitor.isNativePlatform()) {
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
      const { isDark } = getThemeState()

      StatusBar.setBackgroundColor({
        color: isDark ? '#6b44b0' : '#b088f9'
      })

      StatusBar.setStyle({
        style: isDark ? Style.Dark : Style.Light
      })
    }).catch(() => {})
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)