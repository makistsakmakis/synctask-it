import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../App'
import { fetchProjects } from '../lib/projects'
import { fetchRequests } from '../lib/api'
import { fmtDate } from '../lib/meta'
import { DataGrid, StatusBadge } from '../components/ui'

const raciNames = (arr) => (arr ?? []).join(', ') || '—'

const RACI_TOOLTIPS = {
  responsible: 'Responsible (R): The person or team who actually does the work to complete the task. They are responsible for driving the work to completion.',
  accountable: 'Accountable (A): The person who has the final say and owns the ultimate success or failure of the deliverable. They approve the completed work and there must be exactly one Accountable person per task.',
  consulted:   'Consulted (C): Subject-matter experts or stakeholders whose opinions are sought before a decision is made or the work is finalized.',
  informed:    'Informed (I): People who are kept up-to-date on project progress or decisions, but are not directly involved in the execution or decision-making.',
}

const PROJ_COLUMNS = [
  { key: 'id', label: '#', tooltip: 'Project Number (autonumber)',
    render: (p) => <span className="mono">{p.id}</span>,
    text: (p) => p.id },
  {
    key: 'title', label: 'Title', ftype: 'text',
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
  { key: 'start_date', label: 'Start', ftype: 'date',       render: (p) => <span className="mono">{fmtDate(p.start_date)}</span>, text: (p) => fmtDate(p.start_date) },
  { key: 'deadline',   label: 'Deadline', ftype: 'date',    render: (p) => <span className="mono">{fmtDate(p.deadline)}</span>,   text: (p) => fmtDate(p.deadline) },
  { key: 'responsible', label: 'R-esponsible', tooltip: RACI_TOOLTIPS.responsible,
    render: (p) => <span className="raci-names">{raciNames(p.responsible_abbr)}</span>,
    text: (p) => raciNames(p.responsible_abbr) },
  { key: 'accountable', label: 'A-ccountable', tooltip: RACI_TOOLTIPS.accountable,
    render: (p) => <span className="raci-names">{raciNames(p.accountable_abbr)}</span>,
    text: (p) => raciNames(p.accountable_abbr) },
  { key: 'consulted',   label: 'C-onsulted', tooltip: RACI_TOOLTIPS.consulted,
    render: (p) => <span className="raci-names">{raciNames(p.consulted_abbr)}</span>,
    text: (p) => raciNames(p.consulted_abbr) },
  { key: 'informed',    label: 'I-nformed', tooltip: RACI_TOOLTIPS.informed,
    render: (p) => <span className="raci-names">{raciNames(p.informed_abbr)}</span>,
    text: (p) => raciNames(p.informed_abbr) },
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

  // Slicer by status (όπως στα tasks) — δυναμικά από τα διαθέσιμα statuses
  const chipDefs = useMemo(() => {
    const ORDER = ['Waiting Manager Approval', 'Not Started', 'In Progress', 'Waiting', 'On Hold', 'Deferred', 'Completed']
    const present = [...new Set(scopedRows.map((p) => p.status).filter(Boolean))]
    const ordered = [...ORDER.filter((st) => present.includes(st)), ...present.filter((st) => !ORDER.includes(st))]
    return { All: () => true, ...Object.fromEntries(ordered.map((st) => [st, (p) => p.status === st])) }
  }, [scopedRows])

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
            chips={chipDefs}
            defaultChip="All"
            rowClass={(p) => {
              if (!p.deadline || p.status === 'Completed') return ''
              return new Date(p.deadline) < new Date(new Date().toDateString()) ? 'row-overdue' : ''
            }}
          />
      }
    </>
  )
}
