import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import Cards from './pages/Cards.jsx'
import Calendar from './pages/Calendar.jsx'
import Stats from './pages/Stats.jsx'
import Budget from './pages/Budget.jsx'
import Categories from './pages/Categories.jsx'
import Edit from './pages/Edit.jsx'
import Login from './pages/Login.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  const [user, setUser] = useState(undefined) // undefined=loading, null=guest, {...}=logged in

  useEffect(() => {
    fetch('/api/me', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(d => setUser(d.user))
      .catch(() => setUser(null))
  }, [])

  useEffect(() => {
    const refresh = () => fetch('/api/me', { credentials: 'same-origin' }).then(r => r.json()).then(d => setUser(d.user)).catch(() => {})
    window.addEventListener('userUpdated', refresh)
    return () => window.removeEventListener('userUpdated', refresh)
  }, [])

  if (user === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#b088f9,#7baff0)' }}>
        <div className="spinner-border" style={{ color: 'white', width: '2.5rem', height: '2.5rem' }} />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login onLogin={setUser} />} />
        <Route element={user ? <Layout user={user} onLogout={() => setUser(null)} /> : <Navigate to="/login" replace />}>
          <Route path="/" element={<Home />} />
          <Route path="/cards" element={<Cards />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/cards" element={<Navigate to="/budget" replace />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/edit/:id" element={<Edit />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
