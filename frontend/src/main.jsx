import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './index.css'
import { Capacitor } from '@capacitor/core'

if (Capacitor.isNativePlatform()) {
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setOverlaysWebView({ overlay: false })
    const savedTheme = localStorage.getItem('theme') || 'system'
    const isDark = savedTheme === 'dark' || (savedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    StatusBar.setBackgroundColor({ color: isDark ? '#6b44b0' : '#b088f9' })
    StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
  }).catch(() => {})
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

;(function () {
  const t = localStorage.getItem('theme') || 'system'
  if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  else if (t === 'light') document.documentElement.setAttribute('data-theme', 'light')
})()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
