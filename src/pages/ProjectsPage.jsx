import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../App'
import { fetchProjects } from '../lib/projects'
import { fmtDate } from '../lib/meta'

export default function ProjectsPage() {
  const nav = useNavigate()
  const { profile, effectiveRole } = useSession()
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const me = (profile.email ?? '').toLowerCase()

  useEffect(() => {
    fetchProjects().then(setRows).catch(console.error).finally(() => setLoading(false))
  }, [])

  // Visibility: Owner sees only their projects; Supervisor sees only supervised projects;
  // Admin sees all; Implementor sees all (read-only context for their tasks).
  const scopedRows = rows.filter((p) => {
    if (effectiveRole === 'admin')     return true
    if (effectiveRole === 'requestor') return p.owner_email === me
    if (effectiveRole === 'manager')   return p.supervisor_email === me
    return true // resource: sees all as context (read-only)
  })

  const visible = scopedRows.filter((p) =>
    !q.trim() || `${p.title} ${p.owner} ${p.supervisor} ${p.status} ${p.product}`.toLowerCase().includes(q.toLowerCase()))

  // Only Owner (requestor) and Admin can create projects
  const canCreate = effectiveRole === 'requestor' || effectiveRole === 'admin'

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Projects</h1>
          <div className="sub">
            {effectiveRole === 'requestor' ? 'Your projects.'
              : effectiveRole === 'manager' ? 'Projects awaiting or under your supervision.'
              : effectiveRole === 'resource' ? 'All projects (read-only).'
              : 'All projects.'}
          </div>
        </div>
        {canCreate && (
          <button className="btn primary" onClick={() => nav('/projects/new')}>New project</button>
        )}
      </div>

      <div className="toolbar">
        <div className="spacer" />
        <input className="search" placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card">
        {loading ? <div className="empty">Loading…</div>
          : visible.length === 0 ? (
            <div className="empty">
              {effectiveRole === 'requestor' ? 'No projects yet. Create one to get started.'
                : effectiveRole === 'manager' ? 'No projects assigned to you for supervision yet.'
                : 'No projects found.'}
            </div>
          ) : (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr><th>Title</th><th>Owner</th><th>Supervisor</th><th>Status</th><th>Product</th><th>Start</th><th>Deadline</th></tr>
                </thead>
                <tbody>
                  {visible.map((p) => (
                    <tr key={p.id} onClick={() => nav(`/projects/${p.id}`)}>
                      <td><span className="ctitle" title={p.title}>{p.title}</span></td>
                      <td>{p.owner || '—'}</td>
                      <td>{p.supervisor || '—'}</td>
                      <td>{p.status || '—'}</td>
                      <td>{p.product || '—'}</td>
                      <td className="mono">{fmtDate(p.start_date)}</td>
                      <td className="mono">{fmtDate(p.deadline)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </>
  )
}
