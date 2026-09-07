import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from './features/auth/AuthProvider'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Accounts } from './pages/Accounts'
import { Transactions } from './pages/Transactions'

function ProtectedLayout() {
  const { session, loading, signOut } = useAuth()
  const navigate = useNavigate()
  if (loading) return <div className="loading">Loading…</div>
  if (!session) return <Navigate to="/login" replace />

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="logo">Accounting</div>
      <nav>
        <NavLink to="/">Dashboard</NavLink>
        <NavLink to="/accounts">Accounts</NavLink>
        <NavLink to="/transactions">Transactions</NavLink>
      </nav>
      <div className="sidebar-bottom">
        <span className="muted">{session.user.email}</span>
        <button className="secondary" onClick={async () => { await signOut(); navigate('/login') }}>Sign out</button>
      </div>
    </aside>
    <main className="content"><Routes><Route path="/" element={<Dashboard />} /><Route path="/accounts" element={<Accounts />} /><Route path="/transactions" element={<Transactions />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></main>
  </div>
}

export function App() {
  return <Routes><Route path="/login" element={<Login />} /><Route path="/*" element={<ProtectedLayout />} /></Routes>
}
