import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../App'
import { fmtDateTime } from '../lib/meta'
import { DateInput } from '../components/ui'
import { fetchProject, createProject, updateProject, fetchProjectStatuses } from '../lib/projects'
import { fetchUserOptions, fetchManagers } from '../lib/api'

// Field-level edit rights per role for Projects.
// null = all fields editable.
const PROJECT_RIGHTS = {
  // Owner (requestor): can create/edit project details but not change status or assign supervisor
  requestor: ['title', 'product', 'link', 'notes', 'proposed_start', 'deadline'],
  // Supervisor (manager): can approve (change status) and see all fields; cannot change owner
  manager: ['status', 'supervisor_id', 'start_date', 'end_date', 'notes'],
  // Implementors: read-only on projects
  resource: [],
  // COO: all fields
  admin: null,
}

const EMPTY = {
  title: '', owner_id: '', supervisor_id: '', status: '',
  start_date: '', end_date: '', proposed_start: '', deadline: '',
  product: '', link: '', notes: '',
}
const DATE_KEYS = ['start_date', 'end_date', 'proposed_start', 'deadline']
const pick = (p) => Object.fromEntries(Object.keys(EMPTY).map((k) =>
  [k, DATE_KEYS.includes(k) ? (p[k] ?? '').slice(0, 10) : (p[k] ?? '')]))

export default function ProjectForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const { profile, effectiveRole } = useSession()
  const editing = Boolean(id)
  const [form, setForm] = useState({ ...EMPTY, status: 'Waiting Manager Approval' })
  const [users, setUsers] = useState([])
  const [managers, setManagers] = useState([])
  const [statuses, setStatuses] = useState([])
  const [audit, setAudit] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const allowed = (f) => {
    const rights = PROJECT_RIGHTS[effectiveRole]
    return rights === null || rights.includes(f)
  }

  useEffect(() => {
    fetchUserOptions().then(setUsers).catch(() => setUsers([]))
    fetchManagers().then(setManagers).catch(() => setManagers([]))
    fetchProjectStatuses().then(setStatuses).catch(() => setStatuses([]))
  }, [])

  // New project: default the owner to the current user.
  useEffect(() => {
    if (editing || users.length === 0) return
    const me = users.find((u) => u.email && u.email === (profile.email ?? '').toLowerCase())
    if (me) setForm((f) => ({ ...f, owner_id: f.owner_id || me.id }))
  }, [users, editing])

  useEffect(() => {
    if (editing) fetchProject(id).then((p) => {
      setForm(pick(p))
      setAudit({ created_by: p.created_by, created_at: p.created_at, modified_by: p.modified_by, modified_at: p.modified_at })
    }).catch(() => nav('/projects'))
  }, [id])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setDate = (k) => (iso) => setForm((f) => ({ ...f, [k]: iso }))

  const save = async () => {
    if (!form.title.trim()) return setError('Title is required.')
    if (effectiveRole === 'admin' || effectiveRole === 'requestor') {
      if (!form.deadline) return setError('Deadline is required.')
    }
    if (form.proposed_start && form.deadline && form.proposed_start > form.deadline)
      return setError('Proposed start must be on or before the Deadline.')
    if (form.start_date && form.end_date && form.start_date > form.end_date)
      return setError('Actual Start Date must be on or before the End date.')
    if (form.end_date && form.deadline && form.end_date > form.deadline)
      return setError('End date must be on or before the Deadline.')
    setError(''); setBusy(true)

    // Only write fields the role is allowed to edit
    const payload = {}
    for (const k of Object.keys(EMPTY)) {
      if (!allowed(k)) continue
      payload[k] = form[k]
    }
    // Always include owner on create
    if (!editing && effectiveRole === 'requestor') payload.owner_id = form.owner_id

    try {
      if (editing) { await updateProject(id, payload); nav(`/projects/${id}`) }
      else         { const nid = await createProject({ ...form, ...payload }); nav(`/projects/${nid}`) }
    } catch (e) { setError(e.message ?? 'Save failed.') }
    finally     { setBusy(false) }
  }

  // Supervisor approval shortcut: one-click approve
  const approve = async () => {
    if (!id) return
    setBusy(true); setError('')
    try {
      await updateProject(id, { status: 'Not Started' })
      nav(`/projects/${id}`)
    } catch (e) { setError(e.message ?? 'Approval failed.') }
    finally { setBusy(false) }
  }

  const isReadOnly = PROJECT_RIGHTS[effectiveRole]?.length === 0

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{editing ? 'Edit project' : 'New project'}</h1>
          <div className="sub">
            {isReadOnly ? 'Read-only view.'
              : editing ? 'Update project details.'
              : 'Create a project to group related tasks.'}
          </div>
        </div>
        {/* Supervisor: one-click Approve button when project is awaiting approval */}
        {editing && effectiveRole === 'manager' && form.status === 'Waiting Manager Approval' && (
          <button className="btn primary" onClick={approve} disabled={busy}>
            ✓ Approve project
          </button>
        )}
      </div>

      {error && <div className="err">{error}</div>}

      <div className="card" style={{ padding: 18 }}>
        <div className="form">
          <label className="f">
            <span className="k">Title {(effectiveRole === 'admin' || effectiveRole === 'requestor') && <em>*</em>}</span>
            <input value={form.title} onChange={set('title')} placeholder="Project name"
              disabled={!allowed('title')} />
          </label>
          <label className="f">
            <span className="k">Owner {effectiveRole === 'admin' && <em>*</em>}</span>
            <select value={form.owner_id} onChange={set('owner_id')}
              disabled={!allowed('owner_id')}>
              <option value="">Select…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="f">
            <span className="k">Supervisor</span>
            <select value={form.supervisor_id} onChange={set('supervisor_id')}
              disabled={!allowed('supervisor_id')}>
              <option value="">Select supervisor…</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="f">
            <span className="k">Status</span>
            <select value={form.status} onChange={set('status')}
              disabled={!allowed('status')}>
              {!statuses.includes('Waiting Manager Approval') && <option>Waiting Manager Approval</option>}
              {!statuses.includes('Not Started') && <option>Not Started</option>}
              {statuses.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="f">
            <span className="k">Product</span>
            <input value={form.product} onChange={set('product')}
              disabled={!allowed('product')} />
          </label>
          <label className="f">
            <span className="k">Actual Start Date</span>
            <DateInput value={form.start_date} onChange={setDate('start_date')}
              disabled={!allowed('start_date')} />
          </label>
          <label className="f">
            <span className="k">End date</span>
            <DateInput value={form.end_date} onChange={setDate('end_date')}
              disabled={!allowed('end_date')} />
          </label>
          <label className="f">
            <span className="k">Proposed start</span>
            <DateInput value={form.proposed_start} onChange={setDate('proposed_start')}
              disabled={!allowed('proposed_start')} />
          </label>
          <label className="f">
            <span className="k">Deadline {(effectiveRole === 'admin' || effectiveRole === 'requestor') && <em>*</em>}</span>
            <DateInput value={form.deadline} onChange={setDate('deadline')}
              disabled={!allowed('deadline')} />
          </label>
          <label className="f wide">
            <span className="k">Link</span>
            <input value={form.link} onChange={set('link')} placeholder="https://…"
              disabled={!allowed('link')} />
          </label>
          <label className="f wide">
            <span className="k">Notes</span>
            <textarea value={form.notes} onChange={set('notes')}
              disabled={!allowed('notes')} />
          </label>
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

        {!isReadOnly && (
          <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => nav(editing ? `/projects/${id}` : '/projects')} disabled={busy}>Discard</button>
            <button className="btn primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Create project'}
            </button>
          </div>
        )}
        {isReadOnly && (
          <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => nav('/projects')}>Back</button>
          </div>
        )}
      </div>
    </>
  )
}
