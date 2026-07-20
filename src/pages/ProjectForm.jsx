import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../App'
import { fmtDateTime, sanitizeHtml } from '../lib/meta'
import { DateInput, RichTextEditor, MultiPersonSelect } from '../components/ui'
import { fetchProject, createProject, updateProject, fetchProjectStatuses } from '../lib/projects'
import { fetchUserOptions, fetchManagers, fetchResourceOptions } from '../lib/api'


// Field-level edit rights per role for Projects.
// null = all fields editable.
const RACI_FIELDS = ['responsible_ids', 'accountable_ids', 'consulted_ids', 'informed_ids']

const PROJECT_RIGHTS = {
  // Owner (requestor): can create/edit project details but not change status or assign supervisor
  requestor: ['title', 'product', 'link', 'notes', 'proposed_start', 'deadline', 'icon'],
  // Supervisor (manager): can approve (change status), edit RACI
  manager: ['status', 'supervisor_id', 'start_date', 'end_date', 'notes', 'icon', ...RACI_FIELDS],
  // Implementors: read-only on projects
  resource: [],
  // COO: all fields
  admin: null,
}

const RACI_DEFS = [
  { key: 'responsible_ids', label: 'Responsible (R)',
    tooltip: 'The person or team who actually does the work to complete the task. They are responsible for driving the work to completion.' },
  { key: 'accountable_ids', label: 'Accountable (A)',
    tooltip: 'The person who has the final say and owns the ultimate success or failure of the deliverable. They approve the completed work and there must be exactly one Accountable person per task.' },
  { key: 'consulted_ids',   label: 'Consulted (C)',
    tooltip: 'Subject-matter experts or stakeholders whose opinions are sought before a decision is made or the work is finalized.' },
  { key: 'informed_ids',    label: 'Informed (I)',
    tooltip: 'People who are kept up-to-date on project progress or decisions, but are not directly involved in the execution or decision-making.' },
]

// Resize an image file to max dimensions and return a base64 data URL
function resizeToDataURL(file, maxPx = 96) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(maxPx / img.width, maxPx / img.height, 1)
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/png'))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

const EMPTY = {
  title: '', owner_id: '', supervisor_id: '', status: '',
  start_date: '', end_date: '', proposed_start: '', deadline: '',
  product: '', link: '', notes: '', icon: '',
  responsible_ids: [], accountable_ids: [], consulted_ids: [], informed_ids: [],
}
const DATE_KEYS = ['start_date', 'end_date', 'proposed_start', 'deadline']
const pick = (p) => Object.fromEntries(Object.keys(EMPTY).map((k) => {
  if (DATE_KEYS.includes(k)) return [k, (p[k] ?? '').slice(0, 10)]
  if (RACI_FIELDS.includes(k)) return [k, Array.isArray(p[k]) ? p[k] : []]
  return [k, p[k] ?? '']
}))

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
  const [showRte, setShowRte] = useState(false)
  const [resourceOpts, setResourceOpts] = useState([])
  const iconRef = useRef(null)

  const handleIcon = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await resizeToDataURL(file, 96)
    setForm((f) => ({ ...f, icon: dataUrl }))
    e.target.value = '' // reset so same file can be re-selected
  }

  const allowed = (f) => {
    const rights = PROJECT_RIGHTS[effectiveRole]
    return rights === null || rights.includes(f)
  }

  useEffect(() => {
    fetchUserOptions().then(setUsers).catch(() => setUsers([]))
    fetchManagers().then(setManagers).catch(() => setManagers([]))
    fetchProjectStatuses().then(setStatuses).catch(() => setStatuses([]))
    fetchResourceOptions().then(setResourceOpts).catch(() => setResourceOpts([]))
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
          <h1>{editing ? <>Edit project <span style={{ color: 'var(--accent)' }}>#{id}</span></> : 'New project'}</h1>
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
          <div className="f">
            <span className="k" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>Project icon</span>
            <div className="proj-icon-upload">
              <input ref={iconRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleIcon} />
              {form.icon
                ? <img src={form.icon} alt="icon" className="proj-icon-preview"
                    onClick={() => allowed('icon') && iconRef.current?.click()}
                    title={allowed('icon') ? 'Click to change' : undefined} />
                : allowed('icon') && (
                  <div className="proj-icon-placeholder" onClick={() => iconRef.current?.click()} title="Upload icon">＋</div>
                )}
              {form.icon && allowed('icon') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button type="button" className="btn sm" onClick={() => iconRef.current?.click()}>Change</button>
                  <button type="button" className="btn sm danger" onClick={() => setForm((f) => ({ ...f, icon: '' }))}>Remove</button>
                </div>
              )}
              {!form.icon && !allowed('icon') && <span style={{ color: '#9aa1ad', fontSize: 13 }}>—</span>}
            </div>
          </div>
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
              {managers.map((m) => <option key={m.id} value={m.person_id}>{m.name}</option>)}
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
          <div className="f wide">
            <span className="k" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Notes
              {allowed('notes') && (
                <button type="button" className="btn sm" onClick={() => setShowRte(true)}>Edit</button>
              )}
            </span>
            <div
              className="notes-preview"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.notes) || '<span class="notes-empty">Δεν υπάρχουν σημειώσεις.</span>' }}
            />
          </div>
        </div>

        {/* ── RACI ── */}
        <div style={{ borderTop: '1px solid var(--line)', marginTop: 20, paddingTop: 18 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            RACI
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12, color: 'var(--ink-soft)' }}>
              Responsible · Accountable · Consulted · Informed
            </span>
          </div>
          <div className="form">
            {RACI_DEFS.map(({ key, label, tooltip }) => (
              <div key={key} className="f">
                <span className="k" title={tooltip} style={{ cursor: 'help', textDecorationLine: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>
                  {label} ⓘ
                </span>
                <MultiPersonSelect
                  options={resourceOpts}
                  value={form[key]}
                  onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
                  disabled={!allowed(key)}
                />
              </div>
            ))}
          </div>
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

      {showRte && (
        <RichTextEditor
          html={form.notes}
          onSave={(html) => { setForm((f) => ({ ...f, notes: html })); setShowRte(false) }}
          onClose={() => setShowRte(false)}
        />
      )}
    </>
  )
}
