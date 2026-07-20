import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../App'
import { fetchRequest, fetchHistory } from '../lib/api'
import { StatusBadge, Flags } from '../components/ui'
import { fmtDate, fmtDateTime } from '../lib/meta'

export default function RequestDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { profile, effectiveRole } = useSession()
  const [r, setR] = useState(null)
  const [history, setHistory] = useState([])
  const [tab, setTab] = useState('General')

  const load = () => {
    fetchRequest(id).then(setR).catch(() => nav('/requests'))
    fetchHistory(id).then(setHistory).catch(() => {})
  }
  useEffect(load, [id])

  if (!r) return <div className="empty">Loading…</div>

  const me = profile.email.toLowerCase()
  const isAdmin = effectiveRole === 'admin'
  const isApprover = r.approver?.email?.toLowerCase() === me
  const isMember = (r.implementors ?? []).some((i) => i.resource?.email?.toLowerCase() === me)
  const teamNames = (r.implementors ?? []).map((i) => i.resource?.name).join(', ') || '—'
  const teamEmails = (r.implementors ?? []).map((i) => i.resource?.email).join(',')

  const canEdit = isAdmin || r.status !== 'Completed'

  const F = ({ k, v, mono }) => (
    <div className="field"><div className="k">{k}</div><div className={'v' + (mono ? ' mono' : '')}>{v ?? '—'}</div></div>
  )
  const Note = ({ t, v }) => (v ? <><h3>{t}</h3><p>{v}</p></> : null)

  return (
    <>
      <div className="pagehead">
        <div>
          <div className="mono" style={{ color: 'var(--ink-soft)' }}>{r.reference_number}</div>
          <h1>{r.title}</h1>
          <div className="sub" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <StatusBadge status={r.status} /> <Flags r={r} /> · {r.priority} priority · {r.request_type}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canEdit && <button className="btn" onClick={() => nav(`/requests/${id}/edit`)}>Edit</button>}
        </div>
      </div>


      <div className="tabs">
        {['General', 'Notes', 'History', 'Communications'].map((t) => (
          <button key={t} className={'tab' + (t === tab ? ' on' : '')} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 16 }}>
        {tab === 'General' && (
          <div className="fields">
            <F k="Requestor" v={`${r.requestor_name ?? ''} (${r.requestor_email ?? ''})`} />
            <F k="Approver" v={r.approver?.name ?? '—'} />
            <F k="Assigned to" v={r.assigned_to ?? '—'} />
            <F k="Project" v={r.project_name ?? '—'} />
            <F k="Tag" v={r.tag_name ?? '—'} />
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
              <a className="btn" href={`mailto:${r.approver?.email}?subject=${encodeURIComponent(`Regarding request No: ${r.reference_number}`)}`}>
                Message manager
              </a>
              <a className="btn" href={teamEmails
                ? `mailto:${teamEmails}?cc=${r.approver?.email}&subject=${encodeURIComponent(`Regarding request No: ${r.reference_number}`)}`
                : undefined}
                style={!teamEmails ? { opacity: .5, pointerEvents: 'none' } : undefined}>
                Message implementors
              </a>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
