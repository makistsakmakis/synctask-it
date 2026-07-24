import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../App'
import { fetchRequests } from '../lib/api'
import { fetchProjects } from '../lib/projects'
import { RequestGrid, StatusBadge, Flags } from '../components/ui'
import { fmtDate } from '../lib/meta'

const taskId   = { key: 'id', label: '#', tooltip: 'Task ID (autonumber)',
  render: (r) => <span className="mono">#{r.id}</span>, text: (r) => `#${r.id}` }
const title    = { key: 'title',    label: 'Title',    ftype: 'text', render: (r) => <span className="ctitle" title={r.title}>{r.title}</span> }
const status   = { key: 'status',   label: 'Status',   render: (r) => <StatusBadge status={r.status} />, text: (r) => r.status ?? '' }
const priority = { key: 'priority', label: 'Priority', render: (r) => r.priority ?? '—' }
const requestor = { key: 'requestor_name', label: 'Requestor', render: (r) => r.requestor_name ?? '—' }
const assigned = { key: 'assigned_to', label: 'Assigned to', render: (r) => r.assigned_to ?? '—' }
const project  = { key: 'project_name', label: 'Project', render: (r) => r.project_name ?? '—' }
const tag      = { key: 'tag_name', label: 'Tag',
  render: (r) => r.tag_name
    ? <span className="badge" style={{ background: r.tag_color || '#6b7280', color: '#fff' }}>{r.tag_name}</span>
    : '—',
  text: (r) => r.tag_name ?? '' }
const golive   = { key: 'golive_required', label: 'Due', ftype: 'date',
  render: (r) => <span className="mono">{fmtDate(r.golive_required)}</span>,
  text: (r) => fmtDate(r.golive_required) }
const expStart = { key: 'expected_start', label: 'Start', ftype: 'date',
  render: (r) => <span className="mono">{fmtDate(r.expected_start)}</span>,
  text: (r) => fmtDate(r.expected_start) }
const signoff  = { key: 'signoff', label: 'Sign Off', ftype: 'date',
  render: (r) => <span className="mono">{fmtDate(r.signoff)}</span>,
  text: (r) => fmtDate(r.signoff) }
const flags    = { key: 'flags', label: '', noFilter: true, noSort: true, render: (r) => <Flags r={r} /> }

const FILTERS = ['Open', 'Not Started', 'In Progress', 'Waiting', 'Deferred', 'Completed', 'Overdue', 'All']

const VIEWS = {
  requestor: {
    title: 'My project tasks', sub: 'Tasks under your projects (view only).',
    filters: FILTERS,
    columns: [taskId, title, project, tag, status, assigned, priority, golive, expStart, signoff, flags],
  },
  manager: {
    title: 'Supervised project tasks', sub: 'Tasks under projects you supervise (view only).',
    filters: FILTERS,
    columns: [taskId, title, project, tag, requestor, status, assigned, priority, golive, signoff, flags],
  },
  resource: {
    title: 'Assigned to me', sub: 'Tasks assigned to you.',
    filters: FILTERS,
    columns: [taskId, title, project, tag, status, priority, expStart, requestor, signoff, flags],
  },
  admin: {
    title: 'Tasks', sub: 'Full operational list of tasks.',
    filters: FILTERS,
    columns: [taskId, title, requestor, assigned, project, tag, status, priority, golive, expStart, signoff, flags],
  },
}

export default function RequestsPage() {
  const { profile, effectiveRole } = useSession()
  const nav = useNavigate()
  const [rows, setRows]         = useState([])
  const [projects, setProjects] = useState([])
  const view = VIEWS[effectiveRole] ?? VIEWS.requestor
  const me = (profile.email ?? '').toLowerCase()

  useEffect(() => {
    fetchRequests().then(setRows).catch(console.error)
    // Owner and Supervisor need the project list to scope tasks
    if (effectiveRole === 'requestor' || effectiveRole === 'manager') {
      fetchProjects().then(setProjects).catch(console.error)
    }
  }, [effectiveRole])

  const scoped = useMemo(() => {
    // Admin: all tasks
    if (effectiveRole === 'admin') return rows

    // Owner (requestor): only tasks under their own projects
    if (effectiveRole === 'requestor') {
      const myProjectIds = new Set(
        projects.filter((p) => p.owner_email === me).map((p) => p.id)
      )
      return rows.filter((r) => myProjectIds.has(String(r.project_id)))
    }

    // Supervisor (manager): only tasks under supervised projects
    if (effectiveRole === 'manager') {
      const myProjectIds = new Set(
        projects.filter((p) => p.supervisor_email === me).map((p) => p.id)
      )
      return rows.filter((r) => myProjectIds.has(String(r.project_id)))
    }

    // Implementor (resource): only tasks assigned to them
    if (effectiveRole === 'resource') {
      return rows.filter((r) =>
        (r.implementors ?? []).some((i) => i.resource?.email?.toLowerCase() === me)
      )
    }

    return rows
  }, [rows, projects, effectiveRole, me])

  // Role preview simulation for admin
  const previewScoped = useMemo(() => {
    if (profile.role !== 'admin' || effectiveRole === 'admin') return scoped
    return scoped // Already filtered above via effectiveRole
  }, [scoped, profile, effectiveRole])

  // Όλοι μπορούν να δημιουργούν tasks — οι μη-admin ΜΟΝΟ σε ON_GOING projects
  // (επιβάλλεται στη φόρμα, όπου το Project dropdown περιορίζεται αναλόγως)
  const canCreate = true

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{view.title}</h1>
          <div className="sub">{view.sub}</div>
        </div>
        {canCreate && (
          <button className="btn primary" onClick={() => nav('/requests/new')}>New task</button>
        )}
      </div>
      <RequestGrid rows={previewScoped} columns={view.columns} filters={view.filters}
        emptyHint={
          effectiveRole === 'requestor' ? 'No tasks under your projects yet.'
          : effectiveRole === 'manager'  ? 'No tasks under your supervised projects yet.'
          : effectiveRole === 'resource' ? 'No tasks assigned to you yet.'
          : 'No tasks yet.'
        } />
    </>
  )
}
