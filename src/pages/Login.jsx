import { useState } from 'react'
import { signIn } from '../lib/auth'

export default function Login({ onSignedIn }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const go = async () => {
    setBusy(true); setError('')
    try { onSignedIn(await signIn()) }
    catch (e) { setError(e.message ?? 'Sign-in failed.') }
    finally { setBusy(false) }
  }

  return (
    <div className="login">
      <div className="box">
        <div className="brand">Sync<span>Task</span> IT</div>
        <p>IT implementation requests — submit, approve, assign and track work through its full lifecycle. Sign in with your Office 365 account.</p>
        {error && <div className="err">{error}</div>}
        <button className="btn primary" style={{ marginTop: 6, width: '100%' }} onClick={go} disabled={busy}>
          {busy ? 'Opening Microsoft sign-in…' : 'Sign in with Microsoft'}
        </button>
      </div>
    </div>
  )
}
