import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../App'
import { fetchProjects } from '../lib/projects'
import { fetchRequests } from '../lib/api'
import { fmtDate } from '../lib/meta'
import { StatusBadge } from '../components/ui'

export default function ProjectsPage() {
  const nav = useNavigate()
  const { profile, effectiveRole } = useSession()
  const [rows, setRows] = useState([])
  const [myProjectIds, setMyProjectIds] = useState(null) // null = not yet loaded (resource only)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const me = (profile.email ?? '').toLowerCase()

  useEffect(() => {
    const p1 = fetchProjects().then(setRows).catch(console.error)
    // For Implementors: also fetch tasks to find which projects they belong to
    const p2 = effectiveRole === 'resource'
      ? fetchRequests()
          .then((reqs) => {
            const ids = new Set(
              reqs
                .filter((r) => (r.assigned_to_email ?? '').toLowerCase() === me)
                .map((r) => String(r.project_id))
                .filter(Boolean)
            )
            setMyProjectIds(ids)
          })
          .catch(() => setMyProjectIds(new Set()))
      : Promise.resolve()
    Promise.all([p1, p2]).finally(() => setLoading(false))
  }, [effectiveRole, me])

  const scopedRows = rows.filter((p) => {
    if (effectiveRole === 'admin')     return true
    if (effectiveRole === 'requestor') return p.owner_email === me
    if (effectiveRole === 'manager')   return p.supervisor_email === me
    // resource: only projects that have at least one task assigned to them
    if (effectiveRole === 'resource')  return myProjectIds == null ? false : myProjectIds.has(String(p.id))
    return true
  })

  const visible = scopedRows.filter((p) =>
    !q.trim() || `${p.title} ${p.owner} ${p.supervisor} ${p.status} ${p.product}`.toLowerCase().includes(q.toLowerCase()))

  const canCreate = effectiveRole === 'requestor' || effectiveRole === 'admin'

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Projects</h1>
          <div className="sub">
            {effectiveRole === 'requestor' ? 'Your projects.'
              : effectiveRole === 'manager' ? 'Projects you supervise.'
              : effectiveRole === 'resource' ? 'Projects your tasks belong to.'
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
                : effectiveRole === 'manager' ? 'No projects assigned to you for supervision yet. Ask an admin to set you as Supervisor on a project.'
                : effectiveRole === 'resource' ? 'No projects found for your assigned tasks.'
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
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {p.icon && <img src={p.icon} alt="" className="proj-icon" />}
                          <span className="ctitle" title={p.title}>{p.title}</span>
                        </div>
                      </td>
                      <td>{p.owner || '—'}</td>
                      <td>{p.supervisor || '—'}</td>
                      <td><StatusBadge status={p.status} /></td>
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
