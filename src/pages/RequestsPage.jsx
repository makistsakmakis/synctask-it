import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../App'
import { fetchRequests } from '../lib/api'
import { RequestGrid, StatusBadge, Flags } from '../components/ui'
import { fmtDate } from '../lib/meta'

const title = { key: 'title', label: 'Title', render: (r) => <span className="ctitle" title={r.title}>{r.title}</span> }
const status = { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> }
const priority = { key: 'priority', label: 'Priority', render: (r) => r.priority }
const requestor = { key: 'requestor_name', label: 'Requestor', render: (r) => r.requestor_name }
const approver = { key: 'approver', label: 'Approver', sortKey: 'approver', render: (r) => r.approver?.name }
const assigned = { key: 'assigned_to', label: 'Assigned to', render: (r) => r.assigned_to ?? '—' }
const golive = { key: 'golive_required', label: 'Due',
  render: (r) => <span className="mono">{fmtDate(r.golive_required)}</span> }
const expStart = { key: 'expected_start', label: 'Start',
  render: (r) => <span className="mono">{fmtDate(r.expected_start)}</span> }
const flags = { key: 'flags', label: '', sortKey: 'status', render: (r) => <Flags r={r} /> }

const FILTERS = ['Open', 'Not Started', 'In Progress', 'Waiting', 'Deferred', 'Completed', 'Overdue', 'All']

const VIEWS = {
  requestor: {
    title: 'My tasks', sub: 'Tasks you have submitted.',
    filters: FILTERS,
    columns: [title, status, approver, assigned, priority, golive, expStart, flags],
  },
  manager: {
    title: 'My tasks & approvals', sub: 'Tasks you submitted or that need your approval.',
    filters: FILTERS,
    columns: [title, requestor, status, approver, assigned, priority, golive, flags],
  },
  resource: {
    title: 'Assigned to me', sub: 'Tasks assigned to you.',
    filters: FILTERS,
    columns: [title, status, priority, expStart, requestor, approver, flags],
  },
  admin: {
    title: 'Tasks', sub: 'Full operational list of tasks.',
    filters: FILTERS,
    columns: [title, requestor, approver, assigned, status, priority, golive, expStart, flags],
  },
}

export default function RequestsPage() {
  const { profile, effectiveRole } = useSession()
  const nav = useNavigate()
  const [rows, setRows] = useState([])
  const view = VIEWS[effectiveRole] ?? VIEWS.requestor

  useEffect(() => { fetchRequests().then(setRows).catch(console.error) }, [])

  // RLS already scopes rows server-side. Role preview narrows the admin's
  // full dataset client-side to simulate each screen (§15, UI simulation only).
  const scoped = useMemo(() => {
    if (profile.role !== 'admin' || effectiveRole === 'admin') return rows
    const me = profile.email.toLowerCase()
    if (effectiveRole === 'requestor') return rows.filter((r) => r.requestor_email?.toLowerCase() === me)
    if (effectiveRole === 'manager')
      return rows.filter((r) => r.requestor_email?.toLowerCase() === me
        || r.approver?.email?.toLowerCase() === me)
    return rows.filter((r) => (r.implementors ?? []).some((i) => i.resource?.email?.toLowerCase() === me))
  }, [rows, profile, effectiveRole])

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{view.title}</h1>
          <div className="sub">{view.sub}</div>
        </div>
        <button className="btn primary" onClick={() => nav('/requests/new')}>New task</button>
      </div>
      <RequestGrid rows={scoped} columns={view.columns} filters={view.filters}
        emptyHint="No requests in this view yet. Create one to get started." />
    </>
  )
}
