import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../App'
import { fmtDateTime } from '../lib/meta'
import { DateInput } from '../components/ui'
import { fetchProject, createProject, updateProject, fetchProjectStatuses } from '../lib/projects'
import { fetchUserOptions } from '../lib/api'

const EMPTY = {
  title: '', owner_id: '', status: '', start_date: '', end_date: '',
  proposed_start: '', deadline: '', product: '', link: '', notes: '',
}
const DATE_KEYS = ['start_date', 'end_date', 'proposed_start', 'deadline']
const pick = (p) => Object.fromEntries(Object.keys(EMPTY).map((k) =>
  [k, DATE_KEYS.includes(k) ? (p[k] ?? '').slice(0, 10) : (p[k] ?? '')]))

export default function ProjectForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const { profile } = useSession()
  const editing = Boolean(id)
  const [form, setForm] = useState({ ...EMPTY, status: 'Not Started' })
  const [users, setUsers] = useState([])
  const [statuses, setStatuses] = useState([])
  const [audit, setAudit] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchUserOptions().then(setUsers).catch(() => setUsers([]))
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
    if (!form.owner_id) return setError('Owner is required.')
    if (!form.deadline) return setError('Deadline is required.')
    if (form.proposed_start && form.deadline && form.proposed_start > form.deadline)
      return setError('Proposed start must be on or before the Deadline.')
    if (form.start_date && form.end_date && form.start_date > form.end_date)
      return setError('Actual Start Date must be on or before the End date.')
    if (form.end_date && form.deadline && form.end_date > form.deadline)
      return setError('End date must be on or before the Deadline.')
    setError(''); setBusy(true)
    try {
      if (editing) { await updateProject(id, form); nav(`/projects/${id}`) }
      else { const nid = await createProject(form); nav(`/projects/${nid}`) }
    } catch (e) { setError(e.message ?? 'Save failed.') }
    finally { setBusy(false) }
  }

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{editing ? 'Edit project' : 'New project'}</h1>
          <div className="sub">{editing ? 'Update project details.' : 'Create a project to group related tasks.'}</div>
        </div>
      </div>

      {error && <div className="err">{error}</div>}

      <div className="card" style={{ padding: 18 }}>
        <div className="form">
          <label className="f">
            <span className="k">Title <em>*</em></span>
            <input value={form.title} onChange={set('title')} placeholder="Project name" />
          </label>
          <label className="f">
            <span className="k">Owner <em>*</em></span>
            <select value={form.owner_id} onChange={set('owner_id')}>
              <option value="">Select…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="f">
            <span className="k">Status</span>
            <select value={form.status} onChange={set('status')}>
              {!statuses.includes('Not Started') && <option>Not Started</option>}
              {statuses.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="f">
            <span className="k">Product</span>
            <input value={form.product} onChange={set('product')} />
          </label>
          <label className="f">
            <span className="k">Actual Start Date</span>
            <DateInput value={form.start_date} onChange={setDate('start_date')} />
          </label>
          <label className="f">
            <span className="k">End date</span>
            <DateInput value={form.end_date} onChange={setDate('end_date')} />
          </label>
          <label className="f">
            <span className="k">Proposed start</span>
            <DateInput value={form.proposed_start} onChange={setDate('proposed_start')} />
          </label>
          <label className="f">
            <span className="k">Deadline <em>*</em></span>
            <DateInput value={form.deadline} onChange={setDate('deadline')} />
          </label>
          <label className="f wide">
            <span className="k">Link</span>
            <input value={form.link} onChange={set('link')} placeholder="https://…" />
          </label>
          <label className="f wide">
            <span className="k">Notes</span>
            <textarea value={form.notes} onChange={set('notes')} />
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

        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => nav(editing ? `/projects/${id}` : '/projects')} disabled={busy}>Discard</button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create project'}
          </button>
        </div>
      </div>
    </>
  )
}
