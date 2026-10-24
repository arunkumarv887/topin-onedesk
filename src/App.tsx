import { useState, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import { Login } from './components/Login'
import { IncidentPortal } from './pages/IncidentPortal'
import { ResetPassword } from './components/ResetPassword'
import './App.css'

function App() {
  const { user, loading } = useAuth() as any
  const [showDashboard, setShowDashboard] = useState(false)
  const [resetMode, setResetMode] = useState<{ oobCode: string } | null>(null)

  useEffect(() => {
    setShowDashboard(Boolean(user))
  }, [user])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const mode = params.get('mode')
      const oobCode = params.get('oobCode')

      if (mode === 'resetPassword' && oobCode) {
        setResetMode({ oobCode })
      } else {
        setResetMode(null)
      }
    }
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p>Loading...</p>
      </div>
    )
  }

  if (resetMode) {
    return <ResetPassword oobCode={resetMode.oobCode} />
  }

  return (
    <>
      {showDashboard && user ? (
        <IncidentPortal />
      ) : (
        <Login onLoginSuccess={() => {
          setShowDashboard(true)
        }} />
      )}
    </>
  )
}

export default App
