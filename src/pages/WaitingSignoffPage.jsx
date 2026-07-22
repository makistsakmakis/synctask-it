import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../App'
import { fetchProjects } from '../lib/projects'
import { fmtDate } from '../lib/meta'
import { DataGrid, StatusBadge } from '../components/ui'

// ── Waiting for Signoff ─
// Λίστα των ΜΗ υπογεγραμμένων projects (signed_on κενό).
// - Admin: βλέπει όλα τα ανυπόγραφα.
// - Supervisor (manager): μόνο όσα περιμένουν τη ΔΙΚΗ του υπογραφή
//   (Supervisor του project = ο τρέχων χρήστης).
// Κλικ σε γραμμή → φόρμα project σε edit mode (εκεί βρίσκεται το κουμπί Υπογραφή).

const COLUMNS = [
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

export default function WaitingSignoffPage() {
  const nav = useNavigate()
  const { profile, effectiveRole } = useSession()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const me = (profile.email ?? '').toLowerCase()

  useEffect(() => {
    fetchProjects().then(setRows).catch(console.error).finally(() => setLoading(false))
  }, [])

  const unsigned = useMemo(() => rows.filter((p) => {
    if (p.signed_on) return false
    if (effectiveRole === 'admin') return true
    // Supervisor: μόνο όσα περιμένουν τη δική του υπογραφή
    return p.supervisor_email === me
  }), [rows, effectiveRole, me])

  // Default view: όσα εκκρεμούν σε Waiting Manager Approval· διαθέσιμα και όλα τα ανυπόγραφα
  const chipDefs = useMemo(() => ({
    'Waiting Manager Approval': (p) => p.status === 'Waiting Manager Approval',
    'Όλα τα ανυπόγραφα': () => true,
  }), [])

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Waiting for Signoff</h1>
          <div className="sub">
            {effectiveRole === 'admin'
              ? 'Όλα τα projects που δεν έχουν υπογραφεί.'
              : 'Projects που περιμένουν τη δική σας υπογραφή.'}
          </div>
        </div>
      </div>

      {loading
        ? <div className="card"><div className="empty">Φόρτωση…</div></div>
        : <DataGrid
            rows={unsigned}
            columns={COLUMNS}
            onRowClick={(p) => nav(`/projects/${p.id}/edit`)}
            emptyHint="Δεν υπάρχουν projects που περιμένουν υπογραφή. 🎉"
            filename="waiting-signoff.xlsx"
            chips={chipDefs}
            defaultChip="Waiting Manager Approval"
            rowClass={(p) => {
              if (!p.deadline) return ''
              return new Date(p.deadline) < new Date(new Date().toDateString()) ? 'row-overdue' : ''
            }}
          />
      }
    </>
  )
}
