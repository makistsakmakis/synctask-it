import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useSession } from '../App'
import { fmtDateTime, sanitizeHtml, outlookDeadlineUrl } from '../lib/meta'
import { DateInput, RichTextEditor, AttachmentsPanel, CommentsPanel, NoticeDialog, MailBtn } from '../components/ui'
import { LISTS, getAttachments } from '../lib/sp'
import {
  fetchRequest, createRequest, updateRequest,
  fetchProjectOptions, fetchTagOptions, fetchUserOptions, fetchResources,
} from '../lib/api'
import { applyTaskStatusRules } from '../lib/taskRules'

// Field-level edit rights for Tasks, mapped onto the shared "Tasks" list.
// Owner (requestor) and Supervisor (manager): READ-ONLY on tasks.
// Implementor (resource): can update execution fields.
// Admin (COO): all fields.
// NOTE: approver_email has been removed — supervisor lives on the Project now.
const RIGHTS = {
  requestor: [], // view only
  manager:   [], // view only
  resource: ['status', 'expected_start', 'actual_completion', 'percent_complete',
             'estimated_manhours', 'actual_manhours', 'implementor_notes', 'project_id', 'tag_id'],
  admin: null,   // all fields
}

const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Completed', 'Deferred', 'Waiting']
const DATE_KEYS = ['golive_required', 'expected_start', 'actual_completion']

// ── ON_GOING flow ─
// Tasks σε ON_GOING projects: αρχική καταχώρηση από ΟΛΟΥΣ τους ρόλους +
// μίνι-εγκριτική ροή (SignOff προϊσταμένου). Μέχρι το SignOff, οι μη-admin
// βλέπουν/επεξεργάζονται ΜΟΝΟ αυτά τα πεδία. Μετά το SignOff το task
// αντιμετωπίζεται όπως όλα τα άλλα.
// Ο απλός χρήστης έχει επιπλέον ανοιχτό (και υποχρεωτικό) το Assigned to,
// με επιλογές ΜΟΝΟ τους managers (Resources με Is_Manager) — εκεί πάει
// και το email έγκρισης.
const ONGOING_TASK_FIELDS = ['title', 'golive_required', 'requestor_notes', 'project_id']
const ONGOING_USER_FIELDS = [...ONGOING_TASK_FIELDS, 'assigned_to_id']

const EMPTY = {
  title: '', status: '', golive_required: '', request_type: '', priority: '',
  requestor_notes: '', management_notes: '', implementor_notes: '', coo_notes: '',
  expected_start: '', actual_completion: '', estimated_manhours: '', actual_manhours: '',
  percent_complete: '', assigned_to_id: '', project_id: '', tag_id: '',
}

export default function RequestForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const { profile, effectiveRole } = useSession()
  const editing = Boolean(id)
  const [searchParams] = useSearchParams()
  const [userOpts, setUserOpts]     = useState([])
  const [projectOpts, setProjectOpts] = useState([])
  const [tagOpts, setTagOpts]       = useState([])
  const [form, setForm] = useState({ ...EMPTY, status: 'Not Started', priority: 'Low' })
  const [audit, setAudit] = useState(null)
  const [requestDate, setRequestDate] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError]   = useState('')
  const [notice, setNotice] = useState(null) // { type: 'error'|'warn', text, onOk? }
  const [busy, setBusy]     = useState(false)
  const [rteField, setRteField] = useState(null) // 'requestor_notes' | 'implementor_notes'

  // Το task ανήκει σε ON_GOING project;
  const isOngoingTask = Boolean(projectOpts.find((p) => p.id === String(form.project_id))?.on_going)
  // Ειδική ροή ON_GOING: νέα καταχώρηση από μη-admin, ή edit ON_GOING task πριν το SignOff
  const ongoingFlow = effectiveRole !== 'admin'
    && (!editing ? true : (isOngoingTask && !audit?.signoff))

  const isReadOnly = !ongoingFlow && RIGHTS[effectiveRole]?.length === 0

  const [resources, setResources] = useState([])
  useEffect(() => {
    fetchUserOptions().then(setUserOpts).catch(() => setUserOpts([]))
    fetchProjectOptions().then(setProjectOpts).catch(() => setProjectOpts([]))
    fetchTagOptions().then(setTagOpts).catch(() => setTagOpts([]))
    fetchResources().then(setResources).catch(() => setResources([]))
  }, [])

  // New task: prefill project (from query) and default the assignee to the current user (admin only).
  useEffect(() => {
    if (editing || userOpts.length === 0) return
    if (effectiveRole === 'admin') {
      const me = userOpts.find((u) => u.email && u.email === (profile.email ?? '').toLowerCase())
      setForm((f) => ({
        ...f,
        assigned_to_id: f.assigned_to_id || (me ? me.id : ''),
        project_id: f.project_id || (searchParams.get('project') ?? ''),
      }))
    }
  }, [userOpts, editing, effectiveRole])

  useEffect(() => {
    if (!editing) return
    fetchRequest(id).then((r) => {
      setRequestDate(r.request_date)
      setAudit({ created_by: r.created_by, created_at: r.created_at, modified_by: r.modified_by, modified_at: r.modified_at, signoff: r.signoff })
      setForm(Object.fromEntries(Object.keys(EMPTY).map((k) =>
        [k, DATE_KEYS.includes(k) ? (r[k] ?? '').slice(0, 10) : (r[k] ?? '')])))
    }).catch(() => nav('/requests'))
  }, [id])

  const allowed = useMemo(() => {
    if (ongoingFlow) {
      const list = effectiveRole === 'manager' ? ONGOING_TASK_FIELDS : ONGOING_USER_FIELDS
      return (f) => list.includes(f)
    }
    const list = RIGHTS[effectiveRole]
    return (f) => list === null || list.includes(f)
  }, [effectiveRole, ongoingFlow])

  // Μη-admin: το Project dropdown δείχνει ΜΟΝΟ ON_GOING projects
  const visibleProjectOpts = useMemo(
    () => (ongoingFlow ? projectOpts.filter((p) => p.on_going) : projectOpts),
    [projectOpts, ongoingFlow])

  // Απλός χρήστης σε ON_GOING flow: Assigned to = ΜΟΝΟ managers
  // (χρήστες που αντιστοιχούν σε Resource με Is_Manager=TRUE)
  const ongoingUserFlow = ongoingFlow && effectiveRole !== 'manager'
  const managerEmails = useMemo(
    () => new Set(resources.filter((r) => r.is_manager && r.email).map((r) => r.email)),
    [resources])
  const assigneeOpts = useMemo(
    () => (ongoingUserFlow ? userOpts.filter((u) => u.email && managerEmails.has(u.email)) : userOpts),
    [userOpts, ongoingUserFlow, managerEmails])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setDate = (k) => (iso) => setForm((f) => ({ ...f, [k]: iso }))

  const validate = () => {
    if (!form.title.trim()) return 'Title is required.'
    const start = form.expected_start, due = form.golive_required, end = form.actual_completion
    if (due && start && due < start) return 'Due date must be on or after the Actual Start Date.'
    if (end && start && end < start) return 'Actual End must be on or after the Actual Start Date.'
    if (due && end && due < end) return 'Due date must be on or after the Actual End.'
    if (form.estimated_manhours !== '' && Number(form.estimated_manhours) < 0) return 'Estimated man-hours must be ≥ 0.'
    if (form.actual_manhours    !== '' && Number(form.actual_manhours)    < 0) return 'Billed hours must be ≥ 0.'
    if (form.percent_complete   !== '' && (Number(form.percent_complete) < 0 || Number(form.percent_complete) > 100))
      return '% Complete must be between 0 and 100.'
    return ''
  }

  const NUM = new Set(['estimated_manhours', 'actual_manhours', 'percent_complete'])

  const doSave = async (merged) => {
    setBusy(true); setError('')
    const payload = {}
    for (const k of Object.keys(EMPTY)) {
      if (!allowed(k)) continue
      payload[k] = merged[k] === '' ? null : NUM.has(k) ? Number(merged[k]) : merged[k]
    }
    try {
      const target = editing ? (await updateRequest(id, payload), id)
        : await createRequest(payload, profile)
      // ── ON_GOING εγκριτική ροή: emails από το mailbox του χρήστη ─
      if (ongoingFlow) {
        const subjTitle = (merged.title ?? '').trim()
        if (effectiveRole === 'manager') {
          // Supervisor → COO (Resources με Is_SuperUser)
          const coo = (await fetchResources().catch(() => []))
            .filter((r) => r.is_superuser && r.email).map((r) => r.email).join(',')
          const taskBody = `${window.location.origin}/requests/${target}`
          window.location.href = `mailto:${coo}?subject=${encodeURIComponent(`Εγκεκριμένο Task #${target} ${subjTitle}`)}&body=${encodeURIComponent(taskBody)}`
        } else {
          // Απλός χρήστης → ο manager του πεδίου Assigned to
          const mgrEmail = userOpts.find((u) => u.id === String(merged.assigned_to_id))?.email ?? ''
          const taskBody = `${window.location.origin}/requests/${target}`
          window.location.href = `mailto:${mgrEmail}?subject=${encodeURIComponent(`Έγκριση Task #${target} ${subjTitle}`)}&body=${encodeURIComponent(taskBody)}`
        }
      }
      nav(`/requests/${target}`)
    } catch (e) {
      setError(e.message ?? 'Unexpected error occurred. Please try again.')
    } finally { setBusy(false) }
  }

  const save = async () => {
    if (isReadOnly) return // should never happen — button is hidden
    const v = validate()
    if (v) { setError(v); return }

    // ON_GOING flow: όλα τα ανοιχτά πεδία υποχρεωτικά
    if (ongoingFlow) {
      if (!form.project_id) return setError('Project is required.')
      if (!form.golive_required) return setError('Due date is required.')
      if (!(form.requestor_notes ?? '').replace(/<[^>]*>/g, '').trim()) return setError('Requestor notes is required.')
      // Απλός χρήστης: υποχρεωτικός manager στο Assigned to
      if (ongoingUserFlow && !form.assigned_to_id)
        return setError('Assigned to is required — επιλέξτε τον manager που θα εγκρίνει το task.')
    }

    // Task Status Rules (κοινοί με το Kanban — βλ. lib/taskRules.js)
    const { error: ruleErr, patch, warnings } = applyTaskStatusRules(form)
    // ERROR: το ΟΚ κλείνει το dialog και ο χρήστης μένει στη φόρμα για διόρθωση
    if (ruleErr) { setNotice({ type: 'error', text: ruleErr }); return }
    const merged = { ...form, ...patch }
    if (Object.keys(patch).length) setForm(merged)
    // ON_GOING flow (Supervisor): έλεγχος συνημμένων οδηγιών προς υλοποίηση
    const allWarnings = [...warnings]
    if (ongoingFlow && effectiveRole === 'manager' && editing) {
      const files = await getAttachments(LISTS.requests, id).catch(() => [])
      if (!files.length) allWarnings.push('Δεν έχουν επισυναφθεί σχετικές οδηγίες προς υλοποίηση.')
    }
    // WARNING: το ΟΚ (λήψη γνώσης) επιτρέπει στην αποθήκευση να προχωρήσει
    if (allWarnings.length) {
      setNotice({ type: 'warn', text: allWarnings.join('\n') + '\n\nΜε το ΟΚ η αποθήκευση θα προχωρήσει.', onOk: () => doSave(merged) })
    } else await doSave(merged)
  }

  // ── SignOff προϊσταμένου (Supervisor/Admin, μόνο όσο SignOff=NULL) ─
  const canTaskSignOff = editing && isOngoingTask
    && (effectiveRole === 'manager' || effectiveRole === 'admin')
  const doTaskSignOff = async () => {
    if (!canTaskSignOff || audit?.signoff || busy) return
    setBusy(true); setError('')
    try {
      await updateRequest(id, { signoff: new Date().toISOString() })
      const r = await fetchRequest(id)
      setAudit((a) => ({ ...a, signoff: r.signoff }))
    } catch (e) { setError(e.message ?? 'Το SignOff απέτυχε.') }
    finally { setBusy(false) }
  }

  // If read-only role opens the edit URL, redirect to detail view
  if (isReadOnly && !editing) {
    nav('/requests', { replace: true })
    return null
  }

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>
            {editing
              ? <>{isReadOnly ? 'View task' : 'Edit task'} <span style={{ color: 'var(--accent)' }}>#{id}</span></>
              : 'New task'}
          </h1>
          <div className="sub">
            {isReadOnly ? 'You can view this task but cannot edit it.'
              : editing ? "Fields outside your role's edit rights are locked."
              : 'New tasks default to status "Not Started".'}
          </div>
        </div>
        {editing && form.golive_required && (
          <button type="button" className="btn"
            title="Δημιουργεί Outlook calendar event στη DueDate 17:00 — το αποθηκεύετε εσείς"
            onClick={() => window.open(outlookDeadlineUrl({
              title: form.title,
              project: projectOpts.find((p) => p.id === String(form.project_id))?.title,
              dueISO: form.golive_required,
            }), '_blank')}>
            📅 Add Outlook
          </button>
        )}
      </div>
      {error && <div className="err">{error}</div>}
      <NoticeDialog notice={notice} onClose={() => setNotice(null)} />
      <div className="card" style={{ padding: 18 }}>
        <div className="form">
          <label className="f wide">
            <span className="k">Title {!isReadOnly && <em>*</em>}</span>
            <input value={form.title} onChange={set('title')} disabled={!allowed('title')} maxLength={140} />
          </label>
          <label className="f">
            <span className="k" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Assigned to
              {canTaskSignOff && (
                <button type="button" className="btn sm primary" style={{ marginLeft: 'auto' }}
                  disabled={Boolean(audit?.signoff) || busy}
                  title={audit?.signoff ? `Ήδη υπογεγραμμένο: ${fmtDateTime(audit.signoff)}` : 'SignOff προϊσταμένου: SignOff = τώρα'}
                  onClick={doTaskSignOff}>
                  {audit?.signoff ? '✓ Signed' : 'SignOff'}
                </button>
              )}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select value={form.assigned_to_id} onChange={set('assigned_to_id')} disabled={!allowed('assigned_to_id')} style={{ flex: 1 }}>
                <option value="">Unassigned</option>
                {assigneeOpts.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              {(() => { const u = assigneeOpts.find((u) => u.id === form.assigned_to_id); return u?.email ? <MailBtn email={u.email} name={u.name} subject={`Σχετικά με Task: #${id || 'NEW'} | ${form.title}`} link={id ? `${window.location.origin}/requests/${id}` : ''} /> : null })()}
            </div>
          </label>
          <label className="f">
            <span className="k">Status</span>
            <select value={form.status} onChange={set('status')} disabled={!allowed('status')}>
              {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="f">
            <span className="k">Project</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select value={form.project_id} onChange={set('project_id')} disabled={!allowed('project_id')} style={{ flex: 1 }}>
                <option value="">None</option>
                {visibleProjectOpts.map((p) => <option key={p.id} value={p.id}>{p.title}{p.on_going ? ' (ON-GOING)' : ''}</option>)}
              </select>
              {form.project_id && (
                <a href={`/projects/${form.project_id}`} target="_blank" rel="noopener noreferrer"
                  title="Άνοιγμα Project σε νέο tab"
                  style={{ color: 'var(--accent)', fontSize: 16, textDecoration: 'none', flexShrink: 0 }}>
                  ↗
                </a>
              )}
            </div>
          </label>
          <label className="f">
            <span className="k">Tag</span>
            <select value={form.tag_id} onChange={set('tag_id')} disabled={!allowed('tag_id')}>
              <option value="">None</option>
              {tagOpts.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </label>
          <label className="f">
            <span className="k">Actual Start Date</span>
            <DateInput value={form.expected_start} onChange={setDate('expected_start')} disabled={!allowed('expected_start')} />
          </label>
          <label className="f">
            <span className="k">Due date</span>
            <DateInput value={form.golive_required} onChange={setDate('golive_required')} disabled={!allowed('golive_required')} />
          </label>
          <label className="f">
            <span className="k">Actual End</span>
            <DateInput value={form.actual_completion} onChange={setDate('actual_completion')} disabled={!allowed('actual_completion')} />
          </label>
          <label className="f">
            <span className="k">% Complete</span>
            <input type="number" min="0" max="100" step="10" className="pctbar"
              value={form.percent_complete} onChange={set('percent_complete')}
              disabled={!allowed('percent_complete')}
              style={{ background: `linear-gradient(to right, #cfe6fa ${Math.min(100, Math.max(0, Number(form.percent_complete) || 0))}%, var(--surface) ${Math.min(100, Math.max(0, Number(form.percent_complete) || 0))}%)` }} />
          </label>
          <label className="f">
            <span className="k">Estimated man-hours</span>
            <input type="number" min="0" step="0.5" value={form.estimated_manhours} onChange={set('estimated_manhours')} disabled={!allowed('estimated_manhours')} />
          </label>
          <label className="f">
            <span className="k">Billed hours</span>
            <input type="number" min="0" step="0.5" value={form.actual_manhours} onChange={set('actual_manhours')} disabled={!allowed('actual_manhours')} />
          </label>
          <div className="f wide">
            <span className="k" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Requestor notes
              {allowed('requestor_notes') && (
                <button type="button" className="btn sm" onClick={() => setRteField('requestor_notes')}>➕ Append</button>
              )}
            </span>
            <div
              className="notes-preview"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.requestor_notes) || '<span class="notes-empty">—</span>' }}
            />
          </div>
          {(allowed('implementor_notes') || form.implementor_notes) && (
            <div className="f wide">
              <span className="k" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Implementor notes
                {allowed('implementor_notes') && (
                  <button type="button" className="btn sm" onClick={() => setRteField('implementor_notes')}>➕ Append</button>
                )}
              </span>
              <div
                className="notes-preview"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.implementor_notes) || '<span class="notes-empty">—</span>' }}
              />
            </div>
          )}
        </div>

        {editing && audit && (
          <div className="auditbox">
            <h3>Record information</h3>
            <div className="fields">
              <div className="field"><div className="k">Created by</div><div className="v">{audit.created_by || '—'}</div></div>
              <div className="field"><div className="k">Created on</div><div className="v mono">{fmtDateTime(audit.created_at)}</div></div>
              <div className="field"><div className="k">Modified by</div><div className="v">{audit.modified_by || '—'}</div></div>
              <div className="field"><div className="k">Modified on</div><div className="v mono">{fmtDateTime(audit.modified_at)}</div></div>
              <div className="field"><div className="k">Sign Off</div><div className="v mono">{audit.signoff ? fmtDateTime(audit.signoff) : '—'}</div></div>
            </div>
          </div>
        )}

        {editing && <AttachmentsPanel listName={LISTS.requests} itemId={id} canEdit={!isReadOnly} />}
        {editing && <CommentsPanel listName={LISTS.requests} itemId={id} currentEmail={profile.email} />}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn" onClick={() => nav(-1)} disabled={busy}>
            {isReadOnly ? 'Back' : 'Discard'}
          </button>
          {!isReadOnly && (
            <button className="btn primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Create task'}
            </button>
          )}
        </div>
      </div>

      {rteField && (
        <RichTextEditor
          html=""
          title={rteField === 'requestor_notes' ? 'Append to Requestor notes' : 'Append to Implementor notes'}
          onSave={(html) => {
            const text = html.replace(/<[^>]*>/g, '').trim()
            if (text) {
              const ts = new Date().toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              const header = `<p class="note-meta"><strong>Ο ${profile.name} στις ${ts}, σημείωσε:</strong></p>`
              setForm((f) => {
                const existing = f[rteField] || ''
                const sep = existing ? '<hr class="note-hr"/>' : ''
                return { ...f, [rteField]: header + html + sep + existing }
              })
            }
            setRteField(null)
          }}
          onClose={() => setRteField(null)}
        />
      )}
    </>
  )
}
