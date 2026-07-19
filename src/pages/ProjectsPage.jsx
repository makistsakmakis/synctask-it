import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../App'
import { fetchProjects } from '../lib/projects'
import { fetchRequests } from '../lib/api'
import { fmtDate } from '../lib/meta'
import { DataGrid, StatusBadge } from '../components/ui'

const PROJ_COLUMNS = [
  {
    key: 'title', label: 'Title',
    render: (p) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {p.icon && <img src={p.icon} alt="" className="proj-icon" />}
        <span className="ctitle" title={p.title}>{p.title}</span>
      </div>
    ),
  },
  { key: 'owner',      label: 'Owner',      render: (p) => p.owner      || '—' },
  { key: 'supervisor', label: 'Supervisor',  render: (p) => p.supervisor || '—' },
  { key: 'status',     label: 'Status',      render: (p) => <StatusBadge status={p.status} />, text: (p) => p.status ?? '' },
  { key: 'product',    label: 'Product',     render: (p) => p.product    || '—' },
  { key: 'start_date', label: 'Start',       render: (p) => <span className="mono">{fmtDate(p.start_date)}</span>, text: (p) => fmtDate(p.start_date) },
  { key: 'deadline',   label: 'Deadline',    render: (p) => <span className="mono">{fmtDate(p.deadline)}</span>,   text: (p) => fmtDate(p.deadline) },
]

export default function ProjectsPage() {
  const nav = useNavigate()
  const { profile, effectiveRole } = useSession()
  const [rows, setRows] = useState([])
  const [myProjectIds, setMyProjectIds] = useState(null)
  const [loading, setLoading] = useState(true)
  const me = (profile.email ?? '').toLowerCase()

  useEffect(() => {
    const p1 = fetchProjects().then(setRows).catch(console.error)
    const p2 = effectiveRole === 'resource'
      ? fetchRequests()
          .then((reqs) => {
            const ids = new Set(
              reqs.filter((r) => (r.assigned_to_email ?? '').toLowerCase() === me)
                  .map((r) => String(r.project_id)).filter(Boolean))
            setMyProjectIds(ids)
          })
          .catch(() => setMyProjectIds(new Set()))
      : Promise.resolve()
    Promise.all([p1, p2]).finally(() => setLoading(false))
  }, [effectiveRole, me])

  const scopedRows = useMemo(() => rows.filter((p) => {
    if (effectiveRole === 'admin')     return true
    if (effectiveRole === 'requestor') return p.owner_email === me
    if (effectiveRole === 'manager')   return p.supervisor_email === me
    if (effectiveRole === 'resource')  return myProjectIds == null ? false : myProjectIds.has(String(p.id))
    return true
  }), [rows, effectiveRole, me, myProjectIds])

  const canCreate = effectiveRole === 'requestor' || effectiveRole === 'admin'

  const emptyHint = effectiveRole === 'requestor' ? 'Δεν υπάρχουν ακόμα projects. Δημιουργήστε ένα!'
    : effectiveRole === 'manager' ? 'Δεν έχετε ανατεθεί ως Supervisor σε κανένα project.'
    : effectiveRole === 'resource' ? 'Δεν βρέθηκαν projects για τα tasks σας.'
    : 'Δεν βρέθηκαν projects.'

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Projects</h1>
          <div className="sub">
            {effectiveRole === 'requestor' ? 'Τα projects σας.'
              : effectiveRole === 'manager' ? 'Projects που εποπτεύετε.'
              : effectiveRole === 'resource' ? 'Projects που ανήκουν τα tasks σας.'
              : 'Όλα τα projects.'}
          </div>
        </div>
        {canCreate && (
          <button className="btn primary" onClick={() => nav('/projects/new')}>Νέο project</button>
        )}
      </div>

      {loading
        ? <div className="card"><div className="empty">Φόρτωση…</div></div>
        : <DataGrid
            rows={scopedRows}
            columns={PROJ_COLUMNS}
            onRowClick={(p) => nav(`/projects/${p.id}`)}
            emptyHint={emptyHint}
            filename="projects.xlsx"
          />
      }
    </>
  )
}
