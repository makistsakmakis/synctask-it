import { createContext, useContext, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { getAccount, signOut, CONFIGURED } from './lib/auth'
import { fetchManagers, fetchResources } from './lib/api'
import Login from './pages/Login'
import RequestsPage from './pages/RequestsPage'
import RequestDetail from './pages/RequestDetail'
import RequestForm from './pages/RequestForm'
import TasksOverview from './pages/TasksOverview'
import ProjectsOverview from './pages/ProjectsOverview'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetail from './pages/ProjectDetail'
import ProjectForm from './pages/ProjectForm'
import Diag from './pages/Diag'

const SessionCtx = createContext(null)
export const useSession = () => useContext(SessionCtx)

// Role labels:
//   requestor → Owner    (ανοίγει projects, βλέπει view-only tasks)
//   manager   → Supervisor (εγκρίνει projects, βλέπει view-only tasks)
//   resource  → Implementor (εκτελεί tasks)
//   admin     → Admin / COO (πλήρης έλεγχος)
const ROLE_LABEL = { requestor: 'Owner', manager: 'Supervisor', resource: 'Implementor', admin: 'Admin / COO' }

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)

function Shell({ children }) {
  const { profile, previewRole, setPreviewRole } = useSession()
  const role = previewRole ?? profile.role
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Sync<span>Task</span> IT</div>
        <div className="who">
          <b>{profile.name}</b>
          {profile.email}<br />{ROLE_LABEL[role]}{previewRole ? ' (preview)' : ''}
        </div>
        <nav>
          {/* Tasks Overview: admin only */}
          {role === 'admin' && <NavLink to="/overview/tasks">Tasks Overview</NavLink>}
          {/* Projects Overview: admin only (kanban/dashboard) */}
          {role === 'admin' && <NavLink to="/overview/projects">Projects Overview</NavLink>}
          {/* Tasks list: all roles — Owner/Supervisor see it read-only, Implementor sees assigned tasks */}
          <NavLink to="/requests" end>Tasks</NavLink>
          {/* Projects list: Owner, Supervisor, Admin */}
          {role !== 'resource' && <NavLink to="/projects">Projects</NavLink>}
        </nav>
        {profile.role === 'admin' && (
          <label className="f" style={{ marginTop: 14 }}>
            <span className="k" style={{ color: '#9aa1ad', fontSize: 11 }}>Role preview</span>
            <select value={previewRole ?? ''} onChange={(e) => setPreviewRole(e.target.value || null)}>
              <option value="">Admin (me)</option>
              <option value="requestor">Owner</option>
              <option value="manager">Supervisor</option>
              <option value="resource">Implementor</option>
            </select>
          </label>
        )}
        <button className="out" onClick={async () => { await signOut(); window.location.assign('/') }}>
          Sign out
        </button>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}

export default function App() {
  const [account, setAccount]     = useState(undefined)
  const [profile, setProfile]     = useState(null)
  const [loadError, setLoadError] = useState('')
  const [previewRole, setPreviewRole] = useState(null)

  useEffect(() => { getAccount().then(setAccount) }, [])

  useEffect(() => {
    if (!account) { setProfile(null); return }
    const email = (account.username ?? '').toLowerCase()
    const base = { id: account.localAccountId, email, name: account.name ?? email }
    // Role derivation:
    //   SuperUser flag or env → admin (COO)
    //   Managers list or Is_Manager flag → manager (Supervisor)
    //   Is_Implementor (or any Resources row) → resource (Implementor)
    //   else → requestor (Owner)
    Promise.all([fetchManagers(), fetchResources()])
      .then(([managers, resources]) => {
        const meMgr = managers.find((m) => m.email === email)
        const meRes = resources.find((r) => r.email === email)
        const role =
          ADMIN_EMAILS.includes(email) || meRes?.is_superuser ? 'admin'
          : meMgr || meRes?.is_manager                        ? 'manager'
          : meRes                                             ? 'resource'
          : 'requestor'
        setProfile({ ...base, role })
      })
      .catch((e) => setLoadError(e.message ?? 'Could not reach SharePoint.'))
  }, [account])

  if (!CONFIGURED) return (
    <div className="login"><div className="box">
      <div className="brand">Sync<span>Task</span> IT</div>
      <h2 style={{ fontSize: 16, margin: '10px 0' }}>Σχεδόν έτοιμο — εκκρεμεί η σύνδεση με το Office 365</h2>
      <p>Το περιβάλλον λειτουργεί. Μόλις το IT απαντήσει με τα δύο IDs του app registration
      (Application client ID και Directory tenant ID), θα οριστούν στο Netlify και η εφαρμογή
      θα ενεργοποιηθεί με κανονικό Microsoft sign-in.</p>
      <p className="mono" style={{ fontSize: 11.5 }}>Αναμένονται: VITE_ENTRA_CLIENT_ID · VITE_ENTRA_TENANT_ID</p>
    </div></div>
  )
  if (account === undefined) return null
  if (!account) return <Login onSignedIn={setAccount} />
  if (loadError) return (
    <div className="login"><div className="box">
      <div className="brand">Sync<span>Task</span> IT</div>
      <div className="err">Could not load reference lists from SharePoint: {loadError}</div>
      <p>Check the site path, list names and API permissions, then reload. The /diag page can help verify column names once connectivity works.</p>
    </div></div>
  )
  if (!profile) return <div className="empty">Connecting to SharePoint…</div>

  const ctx = { account, profile, previewRole, setPreviewRole, effectiveRole: previewRole ?? profile.role }

  return (
    <SessionCtx.Provider value={ctx}>
      <BrowserRouter>
        <Shell>
          <Routes>
            <Route path="/" element={<Navigate to={profile.role === 'admin' ? '/overview/tasks' : profile.role === 'resource' ? '/requests' : '/projects'} replace />} />
            <Route path="/overview/tasks" element={profile.role === 'admin' ? <TasksOverview /> : <Navigate to="/overview/projects" replace />} />
            <Route path="/overview/projects" element={profile.role === 'admin' ? <ProjectsOverview /> : <Navigate to="/projects" replace />} />
            <Route path="/requests" element={<RequestsPage />} />
            <Route path="/requests/new" element={<RequestForm />} />
            <Route path="/requests/:id" element={<RequestDetail />} />
            <Route path="/requests/:id/edit" element={<RequestForm />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/new" element={<ProjectForm />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/projects/:id/edit" element={<ProjectForm />} />
            {/* Legacy URLs */}
            <Route path="/dashboard" element={<Navigate to="/overview/tasks" replace />} />
            <Route path="/dashboard/projects" element={<Navigate to="/overview/projects" replace />} />
            <Route path="/kanban" element={<Navigate to="/overview/tasks" replace />} />
            <Route path="/kanban/projects" element={<Navigate to="/overview/projects" replace />} />
            <Route path="/diag" element={<Diag />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
      </BrowserRouter>
    </SessionCtx.Provider>
  )
}
