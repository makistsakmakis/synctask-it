import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchProjects } from '../lib/projects'
import { fmtDate } from '../lib/meta'

export default function ProjectsPage() {
  const nav = useNavigate()
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProjects().then(setRows).catch(console.error).finally(() => setLoading(false))
  }, [])

  const visible = rows.filter((p) =>
    !q.trim() || `${p.title} ${p.owner} ${p.status} ${p.product}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Projects</h1>
          <div className="sub">All projects. Open one to manage its tasks.</div>
        </div>
        <button className="btn primary" onClick={() => nav('/projects/new')}>New project</button>
      </div>

      <div className="toolbar">
        <div className="spacer" />
        <input className="search" placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card">
        {loading ? <div className="empty">Loading…</div>
          : visible.length === 0 ? <div className="empty">No projects yet. Create one to get started.</div> : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th>Title</th><th>Owner</th><th>Status</th><th>Product</th><th>Start</th><th>Deadline</th></tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id} onClick={() => nav(`/projects/${p.id}`)}>
                    <td><span className="ctitle" title={p.title}>{p.title}</span></td>
                    <td>{p.owner || '—'}</td>
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
