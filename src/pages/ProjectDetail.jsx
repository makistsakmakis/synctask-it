import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchProject, fetchProjectTasks, removeProject } from '../lib/projects'
import { fetchResources } from '../lib/api'
import { RequestGrid, StatusBadge, Flags, ConfirmDialog, CommentsPanel, PersonLink } from '../components/ui'
import { fmtDate, sanitizeHtml } from '../lib/meta'
import { LISTS } from '../lib/sp'
import { useSession } from '../App'

const taskCols = [
  { key: 'title', label: 'Title', ftype: 'text', render: (r) => <span className="ctitle" title={r.title}>{r.title}</span> },
  { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'priority', label: 'Priority', render: (r) => r.priority },
  { key: 'assigned_to', label: 'Assigned to', render: (r) => r.assigned_to ?? '—' },
  { key: 'golive_required', label: 'Due', ftype: 'date', render: (r) => <span className="mono">{fmtDate(r.golive_required)}</span> },
  { key: 'flags', label: '', sortKey: 'status', render: (r) => <Flags r={r} /> },
]

export default function ProjectDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { profile, effectiveRole } = useSession()
  const isAdmin = effectiveRole === 'admin'
  const [p, setP] = useState(null)
  const [tasks, setTasks] = useState([])
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resources, setResources] = useState([])

  useEffect(() => {
    fetchProject(id).then(setP).catch(() => nav('/projects'))
    fetchProjectTasks(id).then(setTasks).catch(() => setTasks([]))
    fetchResources().then(setResources).catch(() => setResources([]))
  }, [id])

  if (!p) return <div className="empty">Loading…</div>

  const del = async () => {
    setBusy(true)
    try { await removeProject(id); nav('/projects') }
    catch { setBusy(false); setConfirm(false) }
  }

  const getTeamEmails = () => {
    const byId = new Map(resources.map((r) => [String(r.id), (r.email || '').toLowerCase()]))
    const raciIds = [
      ...(p.responsible_ids ?? []), ...(p.accountable_ids ?? []),
      ...(p.consulted_ids ?? []), ...(p.informed_ids ?? []),
    ]
    return [...new Set(
      [p.owner_email, p.supervisor_email, ...raciIds.map((i) => byId.get(String(i)))]
        .map((e) => (e || '').trim()).filter(Boolean)
    )]
  }

  const mailToTeam = () => {
    const emails = getTeamEmails()
    const subject = `#${p.id} - ${p.title}`.slice(0, 70)
    window.location.href = `mailto:${emails.join(',')}?subject=${encodeURIComponent(subject)}`
  }

  const meetTheTeam = () => {
    const emails = getTeamEmails()
    const subject = encodeURIComponent(`[Meeting] #${p.id} - ${p.title}`.slice(0, 70))
    const to = encodeURIComponent(emails.join(';'))
    window.open(
      `https://outlook.office.com/calendar/action/compose?subject=${subject}&to=${to}`,
      '_blank'
    )
  }

  const F = ({ k, v, mono }) => (
    <div className="field"><div className="k">{k}</div><div className={'v' + (mono ? ' mono' : '')}>{v || '—'}</div></div>
  )

  return (
    <>
      <div className="pagehead">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {p.icon && <img src={p.icon} alt="" className="proj-icon-lg" />}
          <div>
            <h1>{p.title}</h1>
            <div className="sub">{p.status || 'No status'} · Owner: {p.owner || '—'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={mailToTeam} title="Νέο email προς όλους τους εμπλεκόμενους">✉ Mail-2-Team</button>
          <button className="btn" onClick={meetTheTeam} title="Νέο meeting request προς όλους τους εμπλεκόμενους">📅 Meet the Team</button>
          <button className="btn" onClick={() => nav(`/requests/new?project=${id}`)}>New task</button>
          <button className="btn" onClick={() => nav(`/projects/${id}/edit`)}>Edit</button>
          {isAdmin && <button className="btn danger" onClick={() => setConfirm(true)}>Delete</button>}
        </div>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div className="fields">
          <F k="Project No" v={`#${p.id}`} mono />
          <F k="Owner" v={<PersonLink name={p.owner} email={p.owner_email} subject={`Σχετικά με Project: #${p.id} | ${p.title}`} />} />
          <F k="Supervisor" v={<PersonLink name={p.supervisor} email={p.supervisor_email} subject={`Σχετικά με Project: #${p.id} | ${p.title}`} />} />
          <F k="Status" v={p.status} />
          <F k="ON_GOING" v={p.on_going ? '✓ Ναι' : '—'} />
          <F k="Product" v={p.product} />
          <F k="Start date" v={fmtDate(p.start_date)} mono />
          <F k="End date" v={fmtDate(p.end_date)} mono />
          <F k="Proposed start" v={fmtDate(p.proposed_start)} mono />
          <F k="Deadline" v={fmtDate(p.deadline)} mono />
          <F k="Link" v={p.link} />
        </div>

        {/* RACI */}
        {(() => {
          // Map from resource ID → person name and email (for hover tooltip + mail link)
          const personMap = new Map(resources.map((r) => [r.id, r.personName || r.email || '']))
          const emailMap  = new Map(resources.map((r) => [r.id, r.email || '']))
          const RaciVal = ({ ids, names }) => {
            if (!names?.length) return <span>—</span>
            return (
              <span>
                {names.map((name, i) => {
                  const rid = String(ids?.[i] ?? '')
                  const email = emailMap.get(rid) || ''
                  const personName = personMap.get(rid) || name
                  return (
                    <span key={i}>
                      <PersonLink name={name} email={email} subject={`Σχετικά με Project: #${p.id} | ${p.title}`}
                        title={email ? `Mail To: ${personName}` : undefined} />
                      {i < names.length - 1 ? ', ' : ''}
                    </span>
                  )
                })}
              </span>
            )
          }
          return (
            <div className="raci-box">
              <h3>RACI</h3>
              <div className="fields">
                <div className="field"><div className="k">Responsible (R)</div><div className="v"><RaciVal ids={p.responsible_ids} names={p.responsible} /></div></div>
                <div className="field"><div className="k">Accountable (A)</div><div className="v"><RaciVal ids={p.accountable_ids} names={p.accountable} /></div></div>
                <div className="field"><div className="k">Consulted (C)</div><div className="v"><RaciVal ids={p.consulted_ids} names={p.consulted} /></div></div>
                <div className="field"><div className="k">Informed (I)</div><div className="v"><RaciVal ids={p.informed_ids} names={p.informed} /></div></div>
              </div>
            </div>
          )
        })()}
        {p.notes && (
          <div className="notesblock" style={{ marginTop: 12 }}>
            <h3>Notes</h3>
            <p dangerouslySetInnerHTML={{ __html: sanitizeHtml(p.notes) }} />
          </div>
        )}

        <CommentsPanel listName={LISTS.projects} itemId={id} currentEmail={profile.email} />
      </div>

      <h2 style={{ fontSize: 15, margin: '6px 2px 10px' }}>Tasks in this project ({tasks.length})</h2>
      <RequestGrid rows={tasks} columns={taskCols}
        filters={['Open', 'Not Started', 'In Progress', 'Waiting', 'Deferred', 'Completed', 'All']}
        emptyHint="No tasks linked to this project yet. Use “New task” to add one." />

      {confirm && (
        <ConfirmDialog title="Delete project" busy={busy}
          body="This permanently deletes the project record. Tasks are not deleted, but they will no longer be linked to it. Continue?"
          onYes={del} onNo={() => setConfirm(false)} />
      )}
    </>
  )
}
