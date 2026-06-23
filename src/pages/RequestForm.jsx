import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useSession } from '../App'
import { fmtDateTime } from '../lib/meta'
import { DateInput } from '../components/ui'
import {
  fetchManagers, fetchRequest, createRequest, updateRequest,
  fetchProjectOptions, fetchTagOptions, fetchUserOptions,
} from '../lib/api'

// Field-level edit rights, mapped onto the shared "Tasks" list.
const RIGHTS = {
  requestor: ['title', 'approver_email', 'golive_required', 'requestor_notes', 'request_type', 'priority', 'project_id', 'tag_id', 'expected_start', 'assigned_to_id'],
  manager: ['title', 'status', 'approver_email', 'golive_required', 'request_type', 'priority', 'management_notes', 'project_id', 'tag_id', 'assigned_to_id', 'expected_start', 'actual_completion', 'percent_complete', 'estimated_manhours', 'actual_manhours'],
  resource: ['status', 'expected_start', 'actual_completion', 'percent_complete', 'estimated_manhours', 'actual_manhours', 'implementor_notes', 'project_id', 'tag_id'],
  admin: null, // all fields
}

const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Completed', 'Deferred', 'Waiting']
const DATE_KEYS = ['golive_required', 'expected_start', 'actual_completion']

const EMPTY = {
  title: '', status: '', approver_email: '', golive_required: '', request_type: '', priority: '',
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
  const [managers, setManagers] = useState([])
  const [userOpts, setUserOpts] = useState([])
  const [projectOpts, setProjectOpts] = useState([])
  const [tagOpts, setTagOpts] = useState([])
  const [form, setForm] = useState({ ...EMPTY, status: 'Not Started', priority: 'Low' })
  const [audit, setAudit] = useState(null)
  const [requestDate, setRequestDate] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchManagers().then(setManagers).catch(() => setManagers([]))
    fetchUserOptions().then(setUserOpts).catch(() => setUserOpts([]))
    fetchProjectOptions().then(setProjectOpts).catch(() => setProjectOpts([]))
    fetchTagOptions().then(setTagOpts).catch(() => setTagOpts([]))
  }, [])

  // New task: prefill project (from query) and default the assignee to the current user.
  useEffect(() => {
    if (editing || userOpts.length === 0) return
    const me = userOpts.find((u) => u.email && u.email === (profile.email ?? '').toLowerCase())
    setForm((f) => ({
      ...f,
      assigned_to_id: f.assigned_to_id || (me ? me.id : ''),
      project_id: f.project_id || (searchParams.get('project') ?? ''),
    }))
  }, [userOpts, editing])

  useEffect(() => {
    if (!editing) return
    fetchRequest(id).then((r) => {
      setRequestDate(r.request_date)
      setAudit({ created_by: r.created_by, created_at: r.created_at, modified_by: r.modified_by, modified_at: r.modified_at })
      setForm(Object.fromEntries(Object.keys(EMPTY).map((k) =>
        [k, DATE_KEYS.includes(k) ? (r[k] ?? '').slice(0, 10) : (r[k] ?? '')])))
    }).catch(() => nav('/requests'))
  }, [id])

  const allowed = useMemo(() => {
    const list = RIGHTS[effectiveRole]
    return (f) => list === null || list.includes(f)
  }, [effectiveRole])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setDate = (k) => (iso) => setForm((f) => ({ ...f, [k]: iso }))

  const validate = () => {
    if (!form.title.trim()) return 'Title is required.'
    const start = form.expected_start, due = form.golive_required, end = form.actual_completion
    if (due && start && due < start) return 'Due date must be on or after the Actual Start Date.'
    if (end && start && end < start) return 'Actual End must be on or after the Actual Start Date.'
    if (due && end && due < end) return 'Due date must be on or after the Actual End.'
    if (form.estimated_manhours !== '' && Number(form.estimated_manhours) < 0) return 'Estimated man-hours must be ≥ 0.'
    if (form.actual_manhours !== '' && Number(form.actual_manhours) < 0) return 'Billed hours must be ≥ 0.'
    if (form.percent_complete !== '' && (Number(form.percent_complete) < 0 || Number(form.percent_complete) > 100))
      return '% Complete must be between 0 and 100.'
    return ''
  }

  const NUM = new Set(['estimated_manhours', 'actual_manhours', 'percent_complete'])
  const save = async () => {
    const v = validate()
    if (v) { setError(v); return }
    setBusy(true); setError('')
    const payload = {}
    for (const k of Object.keys(EMPTY)) {
      if (!allowed(k)) continue
      payload[k] = form[k] === '' ? null : NUM.has(k) ? Number(form[k]) : form[k]
    }
    try {
      const target = editing ? (await updateRequest(id, payload), id)
                             : await createRequest(payload, profile)
      nav(`/requests/${target}`)
    } catch (e) {
      setError(e.message ?? 'Unexpected error occurred. Please try again.')
    } finally { setBusy(false) }
  }

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{editing ? 'Edit task' : 'New task'}</h1>
          <div className="sub">
            {editing ? 'Fields outside your role’s edit rights are locked.' : 'New tasks default to status “Not Started”.'}
          </div>
        </div>
      </div>
      {error && <div className="err">{error}</div>}
      <div className="card" style={{ padding: 18 }}>
        <div className="form">
          <label className="f wide">
            <span className="k">Title <em>*</em></span>
            <input value={form.title} onChange={set('title')} disabled={!allowed('title')} maxLength={140} />
          </label>
          <label className="f">
            <span className="k">Assigned to</span>
            <select value={form.assigned_to_id} onChange={set('assigned_to_id')} disabled={!allowed('assigned_to_id')}>
              <option value="">Unassigned</option>
              {userOpts.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="f">
            <span className="k">Approver</span>
            <select value={form.approver_email} onChange={set('approver_email')} disabled={!allowed('approver_email')}>
              <option value="">Select a manager…</option>
              {managers.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </label>
          <label className="f">
            <span className="k">Status</span>
            <select value={form.status} onChange={set('status')} disabled={!allowed('status')}>
              {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="f">
            <span className="k">Priority <em>*</em></span>
            <select value={form.priority} onChange={set('priority')} disabled={!allowed('priority')}>
              <option>Low</option><option>Medium</option><option>High</option>
            </select>
          </label>
          <label className="f">
            <span className="k">Type <em>*</em></span>
            <select value={form.request_type} onChange={set('request_type')} disabled={!allowed('request_type')}>
              <option value="">Select…</option>
              <option>Bug Fix</option><option>New Implementation</option><option>Change Request</option>
            </select>
          </label>
          <label className="f">
            <span className="k">Project</span>
            <select value={form.project_id} onChange={set('project_id')} disabled={!allowed('project_id')}>
              <option value="">None</option>
              {projectOpts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
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
            <input type="number" min="0" max="100" value={form.percent_complete} onChange={set('percent_complete')} disabled={!allowed('percent_complete')} />
          </label>
          <label className="f">
            <span className="k">Estimated man-hours</span>
            <input type="number" min="0" step="0.5" value={form.estimated_manhours} onChange={set('estimated_manhours')} disabled={!allowed('estimated_manhours')} />
          </label>
          <label className="f">
            <span className="k">Billed hours</span>
            <input type="number" min="0" step="0.5" value={form.actual_manhours} onChange={set('actual_manhours')} disabled={!allowed('actual_manhours')} />
          </label>
          <label className="f wide">
            <span className="k">Requestor notes</span>
            <textarea value={form.requestor_notes} onChange={set('requestor_notes')}
              disabled={!allowed('requestor_notes')} placeholder="Describe what is needed and why." />
          </label>
          {allowed('implementor_notes') && (
            <label className="f wide">
              <span className="k">Implementor notes</span>
              <textarea value={form.implementor_notes} onChange={set('implementor_notes')} />
            </label>
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
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn" onClick={() => nav(-1)} disabled={busy}>Discard</button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create task'}
          </button>
        </div>
      </div>
    </>
  )
}
