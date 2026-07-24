import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../App'
import { fetchRequest, fetchHistory, removeRequest } from '../lib/api'
import { StatusBadge, Flags, CommentsPanel, ConfirmDialog, PersonLink } from '../components/ui'
import { fmtDate, fmtDateTime, outlookDeadlineUrl } from '../lib/meta'
import { LISTS } from '../lib/sp'

export default function RequestDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { profile, effectiveRole } = useSession()
  const [r, setR] = useState(null)
  const [history, setHistory] = useState([])
  const [tab, setTab] = useState('General')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = () => {
    fetchRequest(id).then(setR).catch(() => nav('/requests'))
    fetchHistory(id).then(setHistory).catch(() => {})
  }
  useEffect(load, [id])

  if (!r) return <div className="empty">Loading…</div>

  const isAdmin = effectiveRole === 'admin'
  const teamNames = (r.implementors ?? []).map((i) => i.resource?.name).join(', ') || '—'
  const teamEmails = (r.implementors ?? []).map((i) => i.resource?.email).join(',')

  const canEdit = isAdmin || r.status !== 'Completed'

  // ── Task delete rules ─
  // Πριν το SignOff: ο Created By ή ο Admin.
  // Μετά το SignOff με Status=Not Started: ο Modified By ή ο Admin.
  // Αν το status έχει προχωρήσει: ΜΟΝΟ ο Admin.
  const me = (profile.email ?? '').toLowerCase()
  const canDelete = isAdmin || (
    r.status === 'Not Started' && (
      !r.signoff
        ? (r.requestor_email ?? '').toLowerCase() === me
        : (r.modified_by_email ?? '') === me
    ))

  const del = async () => {
    setBusy(true)
    try { await removeRequest(id); nav('/requests') }
    catch { setBusy(false); setConfirm(false) }
  }

  const F = ({ k, v, mono }) => (
    <div className="field"><div className="k">{k}</div><div className={'v' + (mono ? ' mono' : '')}>{v ?? '—'}</div></div>
  )
  const Note = ({ t, v }) => (v ? <><h3>{t}</h3><p>{v}</p></> : null)

  return (
    <>
      <div className="pagehead">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/task-icon.svg" alt="" className="task-icon" />
          <div>
            <div className="mono" style={{ color: 'var(--ink-soft)' }}>{r.reference_number ?? `#${r.id}`}</div>
            <h1><span style={{ color: 'var(--accent)' }}>#{r.id}</span> {r.title}</h1>
            <div className="sub" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <StatusBadge status={r.status} /> <Flags r={r} /> · {r.priority} priority · {r.request_type}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn"
            title={r.assigned_to_email
              ? `Ανοίγει email έγκρισης προς τον manager του πεδίου Assigned to (${r.assigned_to_email})`
              : 'Ανοίγει email έγκρισης — το task είναι Unassigned, συμπληρώστε τον παραλήπτη'}
            onClick={() => { window.location.href = `mailto:${r.assigned_to_email ?? ''}?subject=${encodeURIComponent(`Έγκριση Task #${r.id} ${r.title}`)}&body=${encodeURIComponent(`${window.location.origin}/requests/${r.id}`)}` }}>
            ✉ Έγκριση Προϊσταμένου
          </button>
          {r.golive_required && (
            <button className="btn" title="Δημιουργεί Outlook calendar event στη DueDate 17:00 — το αποθηκεύετε εσείς"
              onClick={() => window.open(outlookDeadlineUrl({ title: r.title, project: r.project_name, dueISO: r.golive_required }), '_blank')}>
              📅 Add Outlook
            </button>
          )}
          {canEdit && <button className="btn" onClick={() => nav(`/requests/${id}/edit`)}>Edit</button>}
          {canDelete && <button className="btn danger" onClick={() => setConfirm(true)}>Delete</button>}
        </div>
      </div>


      <div className="tabs">
        {['General', 'Notes', 'Comments', 'History', 'Communications'].map((t) => (
          <button key={t} className={'tab' + (t === tab ? ' on' : '')} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 16 }}>
        {tab === 'General' && (
          <div className="fields">
            <F k="Created By" v={<PersonLink name={r.created_by ?? r.requestor_name ?? ''} email={r.requestor_email} subject={`Σχετικά με Task: #${r.id} | ${r.title}`} link={`${window.location.origin}/requests/${r.id}`} />} />
            <F k="Assigned to" v={<PersonLink name={r.assigned_to} email={r.assigned_to_email} subject={`Σχετικά με Task: #${r.id} | ${r.title}`} link={`${window.location.origin}/requests/${r.id}`} />} />
            <F k="Project" v={r.project_id
              ? <a href={`/projects/${r.project_id}`} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--accent)', textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>
                  {r.project_name ?? `#${r.project_id}`}
                </a>
              : '—'} />
            <F k="Tag" v={r.tag_name
              ? <span className="badge" style={{ background: r.tag_color || '#6b7280', color: '#fff' }}>{r.tag_name}</span>
              : '—'} />
            <F k="Status" v={r.status} />
            <F k="Priority" v={r.priority} />
            <F k="Type" v={r.request_type} />
            <F k="Request date" v={fmtDate(r.request_date)} mono />
            <F k="Due date" v={fmtDate(r.golive_required)} mono />
            <F k="Actual Start Date" v={fmtDate(r.expected_start)} mono />
            <F k="Actual end" v={fmtDate(r.actual_completion)} mono />
            <F k="% complete" v={r.percent_complete != null ? `${r.percent_complete}%` : '—'} mono />
            <F k="Estimated man-hours" v={r.estimated_manhours ?? '—'} mono />
            <F k="Actual man-hours" v={r.actual_manhours ?? '—'} mono />
            <F k="Product" v={r.product ?? '—'} />
          </div>
        )}
        {tab === 'Notes' && (
          <div className="notesblock">
            <Note t="Requestor notes" v={r.requestor_notes} />
            <Note t="Management notes" v={r.management_notes} />
            <Note t="Implementor notes" v={r.implementor_notes} />
            <Note t="COO notes" v={r.coo_notes} />
            <Note t="Resolution summary" v={r.resolution_summary} />
          </div>
        )}
        {tab === 'Comments' && (
          <CommentsPanel listName={LISTS.requests} itemId={id} currentEmail={profile.email} />
        )}
        {tab === 'History' && (
          <ul className="history">
            {history.length === 0 && <li>No history yet.</li>}
            {history.map((h) => (
              <li key={h.id}>
                <b>{h.action_type}</b> — {h.detail}
                <div className="when mono">{fmtDateTime(h.created_at)} · {h.changed_by}</div>
              </li>
            ))}
          </ul>
        )}
        {tab === 'Communications' && (
          <div className="notesblock">
            <p style={{ marginBottom: 12 }}>Manual communication opens a draft in your mail client; workflow events are emailed automatically.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a className="btn" href={teamEmails
                ? `mailto:${teamEmails}?subject=${encodeURIComponent(`Regarding request No: ${r.reference_number ?? `#${r.id}`}`)}&body=${encodeURIComponent(`${window.location.origin}/requests/${r.id}`)}`
                : undefined}
                style={!teamEmails ? { opacity: .5, pointerEvents: 'none' } : undefined}>
                Message implementors
              </a>
            </div>
          </div>
        )}
      </div>

      {confirm && (
        <ConfirmDialog title="Delete task" busy={busy}
          body={`Θα διαγραφεί οριστικά το task #${r.id} "${r.title}" (μαζί με συνημμένα και σχόλια). Συνέχεια;`}
          onYes={del} onNo={() => setConfirm(false)} />
      )}
    </>
  )
}
