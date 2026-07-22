import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../App'
import { fetchProjects } from '../lib/projects'
import { fetchRequests } from '../lib/api'
import { fmtDate } from '../lib/meta'
import { DataGrid, StatusBadge, Flags } from '../components/ui'

// ── Waiting for Signoff ─
// Δύο οριζόντια τμήματα:
// 1. Projects για υπογραφή — ΜΗ υπογεγραμμένα projects (Signed On κενό).
//    Admin: όλα · Supervisor: μόνο όσα περιμένουν τη ΔΙΚΗ του υπογραφή.
//    Κλικ → φόρμα project σε edit mode (εκεί είναι το κουμπί Υπογραφή).
// 2. Tasks για υπογραφή — tasks με Assigned To = τρέχων χρήστης ΚΑΙ SignOff
//    κενό. Toggle: μόνο όσα ανήκουν σε ON_GOING projects ή όλα.
//    Κλικ → task σε view mode.

const PROJECT_COLUMNS = [
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
  { key: 'supervisor', label: 'Supervisor', render: (p) => p.supervisor || '—' },
  { key: 'status',     label: 'Status',     render: (p) => <StatusBadge status={p.status} />, text: (p) => p.status ?? '' },
  { key: 'proposed_start', label: 'Proposed start', ftype: 'date',
    render: (p) => <span className="mono">{fmtDate(p.proposed_start)}</span>, text: (p) => fmtDate(p.proposed_start) },
  { key: 'deadline', label: 'Deadline', ftype: 'date',
    render: (p) => <span className="mono">{fmtDate(p.deadline)}</span>, text: (p) => fmtDate(p.deadline) },
  { key: 'created_at', label: 'Created', ftype: 'date',
    render: (p) => <span className="mono">{fmtDate(p.created_at)}</span>, text: (p) => fmtDate(p.created_at) },
]

const TASK_COLUMNS = [
  { key: 'id', label: '#', tooltip: 'Task ID (autonumber)',
    render: (t) => <span className="mono">#{t.id}</span>, text: (t) => `#${t.id}` },
  { key: 'title', label: 'Title', ftype: 'text',
    render: (t) => <span className="ctitle" title={t.title}>{t.title}</span> },
  { key: 'project_name', label: 'Project', render: (t) => t.project_name ?? '—' },
  { key: 'requestor_name', label: 'Requestor', render: (t) => t.requestor_name ?? '—' },
  { key: 'status', label: 'Status', render: (t) => <StatusBadge status={t.status} />, text: (t) => t.status ?? '' },
  { key: 'golive_required', label: 'Due', ftype: 'date',
    render: (t) => <span className="mono">{fmtDate(t.golive_required)}</span>, text: (t) => fmtDate(t.golive_required) },
  { key: 'flags', label: '', noFilter: true, noSort: true, render: (t) => <Flags r={t} /> },
]

export default function WaitingSignoffPage() {
  const nav = useNavigate()
  const { profile, effectiveRole } = useSession()
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const me = (profile.email ?? '').toLowerCase()

  useEffect(() => {
    Promise.all([
      fetchProjects().then(setProjects).catch(console.error),
      fetchRequests().then(setTasks).catch(console.error),
    ]).finally(() => setLoading(false))
  }, [])

  // ── 1. Projects για υπογραφή ─
  const unsignedProjects = useMemo(() => projects.filter((p) => {
    if (p.signed_on) return false
    if (effectiveRole === 'admin') return true
    return p.supervisor_email === me
  }), [projects, effectiveRole, me])

  const projectChips = useMemo(() => ({
    'Waiting Manager Approval': (p) => p.status === 'Waiting Manager Approval',
    'Όλα τα ανυπόγραφα': () => true,
  }), [])

  // ── 2. Tasks για υπογραφή ─
  const ongoingProjectIds = useMemo(
    () => new Set(projects.filter((p) => p.on_going).map((p) => String(p.id))),
    [projects])

  const unsignedTasks = useMemo(() => tasks.filter((t) =>
    !t.signoff && (t.assigned_to_email ?? '').toLowerCase() === me), [tasks, me])

  const taskChips = useMemo(() => ({
    'ON_GOING projects': (t) => ongoingProjectIds.has(String(t.project_id)),
    'Όλα': () => true,
  }), [ongoingProjectIds])

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Waiting for Signoff</h1>
          <div className="sub">
            {effectiveRole === 'admin'
              ? 'Projects χωρίς υπογραφή και tasks που περιμένουν το SignOff σας.'
              : 'Projects και tasks που περιμένουν τη δική σας υπογραφή.'}
          </div>
        </div>
      </div>

      {loading
        ? <div className="card"><div className="empty">Φόρτωση…</div></div>
        : (
          <>
            {/* ── 1. Projects για υπογραφή ─ */}
            <h2 style={{ fontSize: 15, margin: '6px 2px 10px' }}>Projects για υπογραφή ({unsignedProjects.length})</h2>
            <DataGrid
              rows={unsignedProjects}
              columns={PROJECT_COLUMNS}
              onRowClick={(p) => nav(`/projects/${p.id}/edit`)}
              emptyHint="Δεν υπάρχουν projects που περιμένουν υπογραφή. 🎉"
              filename="waiting-signoff-projects.xlsx"
              chips={projectChips}
              defaultChip="Waiting Manager Approval"
              rowClass={(p) => {
                if (!p.deadline) return ''
                return new Date(p.deadline) < new Date(new Date().toDateString()) ? 'row-overdue' : ''
              }}
            />

            {/* ── 2. Tasks για υπογραφή ─ */}
            <h2 style={{ fontSize: 15, margin: '20px 2px 10px' }}>Tasks για υπογραφή ({unsignedTasks.length})</h2>
            <DataGrid
              rows={unsignedTasks}
              columns={TASK_COLUMNS}
              onRowClick={(t) => nav(`/requests/${t.id}`)}
              emptyHint="Δεν υπάρχουν tasks που περιμένουν το SignOff σας. 🎉"
              filename="waiting-signoff-tasks.xlsx"
              chips={taskChips}
              defaultChip="ON_GOING projects"
              rowClass={(t) => {
                if (!t.golive_required || t.status === 'Completed') return ''
                return new Date(t.golive_required) < new Date(new Date().toDateString()) ? 'row-overdue' : ''
              }}
            />
          </>
        )}
    </>
  )
}
