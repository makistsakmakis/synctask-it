import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../App'
import { fmtDateTime, sanitizeHtml } from '../lib/meta'
import { DateInput, RichTextEditor, MultiPersonSelect, AttachmentsPanel, CommentsPanel, NoticeDialog } from '../components/ui'
import { LISTS, getAttachments } from '../lib/sp'
import { fetchProject, createProject, updateProject, fetchProjectStatuses, signProject } from '../lib/projects'
import { fetchUserOptions, fetchResourceOptions, fetchResources, fetchPendingTaskCount } from '../lib/api'
import { applyProjectStatusRules } from '../lib/projectRules'


// Field-level edit rights per role for Projects.
// null = all fields editable.
const RACI_FIELDS = ['responsible_ids', 'accountable_ids', 'consulted_ids', 'informed_ids']

const PROJECT_RIGHTS = {
  // Owner (requestor): can create/edit project details but not change status.
  // supervisor_id: υποχρεωτικό πλέον στη δημιουργία — ο requestor επιλέγει ποιος θα υπογράψει.
  requestor: ['title', 'product', 'link', 'notes', 'proposed_start', 'deadline', 'icon', 'supervisor_id'],
  // Supervisor (manager): can approve (change status), edit RACI
  manager: ['status', 'supervisor_id', 'start_date', 'end_date', 'notes', 'icon'],
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

// ── Icon library (100px/) ─
const ICON_MODULES = import.meta.glob('/100px/*.png', { eager: true, query: '?url', import: 'default' })
const ICONS = Object.entries(ICON_MODULES)
  .map(([path, url]) => ({ name: decodeURIComponent(path.split('/').pop()).replace(/\.png$/i, ''), url }))
  .sort((a, b) => a.name.localeCompare(b.name))

function IconPicker({ onPick, onClose }) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? ICONS.filter((i) => i.name.toLowerCase().includes(t)) : ICONS
  }, [q])
  return (
    <div className="overlay" onClick={onClose}>
      <div className="iconpicker" onClick={(e) => e.stopPropagation()}>
        <div className="iconpicker-head">
          <input className="search" style={{ flex: 1 }} placeholder="Αναζήτηση εικονιδίου…"
            value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
          <span className="grid-count">{shown.length} / {ICONS.length}</span>
          <button type="button" className="rte-close" onClick={onClose} title="Κλείσιμο">✕</button>
        </div>
        <div className="iconpicker-grid">
          {shown.length === 0
            ? <div className="empty" style={{ gridColumn: '1 / -1' }}>Δεν βρέθηκαν εικονίδια.</div>
            : shown.map((i) => (
              <button key={i.name} type="button" className="iconpicker-item" title={i.name} onClick={() => onPick(i)}>
                <img src={i.url} alt="" loading="lazy" />
                <span>{i.name}</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}

const EMPTY = {
  title: '', owner_id: '', supervisor_id: '', status: '',
  start_date: '', end_date: '', proposed_start: '', deadline: '',
  product: '', link: '', notes: '', icon: '', on_going: false,
  responsible_ids: [], accountable_ids: [], consulted_ids: [], informed_ids: [],
}
// ON_GOING projects: χωρίς πρακτικό deadline — μπαίνει αυτόματα 01/01/2999
const ONGOING_DEADLINE = '2999-01-01'
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
  const [orig, setOrig] = useState(null) // το project όπως είναι αποθηκευμένο (prev status, υπογραφή, emails)
  const [users, setUsers] = useState([])
  const [statuses, setStatuses] = useState([])
  const [audit, setAudit] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null) // { type: 'error'|'warn', text, onOk? }
  const [busy, setBusy] = useState(false)
  const [showRte, setShowRte] = useState(false)
  const [resourceOpts, setResourceOpts] = useState([])
  const [showIconPicker, setShowIconPicker] = useState(false)

  const pickIcon = async (icon) => {
    try {
      const blob = await (await fetch(icon.url)).blob()
      const dataUrl = await resizeToDataURL(blob, 96)
      setForm((f) => ({ ...f, icon: dataUrl }))
    } catch { /* ignore */ }
    setShowIconPicker(false)
  }

  const allowed = (f) => {
    // ON_GOING projects: ορατά σε όλους, editable ΜΟΝΟ από admin
    if (orig?.on_going && effectiveRole !== 'admin') return false
    const rights = PROJECT_RIGHTS[effectiveRole]
    return rights === null || rights.includes(f)
  }

  useEffect(() => {
    fetchUserOptions().then(setUsers).catch(() => setUsers([]))
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
      setOrig(p)
      setAudit({ created_by: p.created_by, created_at: p.created_at, modified_by: p.modified_by, modified_at: p.modified_at })
    }).catch(() => nav('/projects'))
  }, [id])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setDate = (k) => (iso) => setForm((f) => ({ ...f, [k]: iso }))

  const save = async () => {
    // ON_GOING: deadline πάντα 01/01/2999 (χωρίς πρακτικό deadline)
    const f0 = form.on_going ? { ...form, deadline: ONGOING_DEADLINE } : form
    if (!f0.title.trim()) return setError('Title is required.')
    if (!f0.supervisor_id) return setError('Supervisor is required.')
    if (effectiveRole === 'admin' || effectiveRole === 'requestor') {
      if (!f0.deadline) return setError('Deadline is required.')
    }
    if (f0.proposed_start && f0.deadline && f0.proposed_start > f0.deadline)
      return setError('Proposed start must be on or before the Deadline.')
    if (f0.start_date && f0.end_date && f0.start_date > f0.end_date)
      return setError('Actual Start Date must be on or before the End date.')
    if (f0.end_date && f0.deadline && f0.end_date > f0.deadline)
      return setError('End date must be on or before the Deadline.')

    // ── Project Status Rules (κοινοί με το Kanban — lib/projectRules.js) ─
    const prevStatus = editing ? (orig?.status ?? '') : 'Waiting Manager Approval'
    const { error: ruleErr, patch, needsPendingTasksConfirm } = applyProjectStatusRules({
      prev: prevStatus,
      next: f0.status,
      project: { ...orig, ...f0 },
    })
    // ERROR: το ΟΚ κλείνει το dialog και ο χρήστης μένει στη φόρμα για διόρθωση
    if (ruleErr) return setNotice({ type: 'error', text: ruleErr })
    if (needsPendingTasksConfirm && editing) {
      try {
        const n = await fetchPendingTaskCount(id)
        if (n > 0 && !window.confirm(
          `Το project έχει ${n} μη ολοκληρωμένα task(s). Να προχωρήσει το κλείσιμο σε "Completed";`)) return
      } catch { /* αν αποτύχει η μέτρηση, δεν μπλοκάρουμε */ }
    }
    const merged = { ...f0, ...patch }
    if (Object.keys(patch).length || f0 !== form) setForm(merged)

    setError(''); setBusy(true)

    // Only write fields the role is allowed to edit
    const payload = {}
    for (const k of Object.keys(EMPTY)) {
      if (!allowed(k)) continue
      payload[k] = merged[k]
    }
    // Τα auto-συμπληρωμένα dates των κανόνων γράφονται πάντα
    for (const k of Object.keys(patch)) payload[k] = merged[k]
    // Always include owner on create
    if (!editing && effectiveRole === 'requestor') payload.owner_id = form.owner_id

    try {
      if (editing) { await updateProject(id, payload); nav(`/projects/${id}`) }
      else {
        const nid = await createProject({ ...merged, ...payload })
        // Rule 1: signoff email προς τον Supervisor από το mailbox του χρήστη
        if ((merged.status || 'Waiting Manager Approval') === 'Waiting Manager Approval') {
          const sup = users.find((u) => u.id === String(merged.supervisor_id))
          if (sup?.email) {
            const subject = `${merged.title.trim().slice(0, 60)} Needs your signoff`
            window.location.href = `mailto:${sup.email}?subject=${encodeURIComponent(subject)}`
          }
        }
        nav(`/projects/${nid}`)
      }
    } catch (e) { setError(e.message ?? 'Save failed.') }
    finally     { setBusy(false) }
  }

  // ── Υπογραφή (Rule 2) ─
  // Διαθέσιμη μόνο σε Admin ή στον Supervisor ΤΟΥ έργου, όσο δεν έχει υπογραφεί.
  const isSigned = Boolean(orig?.signed_on)
  const canSign = editing && !isSigned
    && orig?.status === 'Waiting Manager Approval'
    && (effectiveRole === 'admin'
        || (orig?.supervisor_email && orig.supervisor_email === (profile.email ?? '').toLowerCase()))

  const doSign = async () => {
    setBusy(true); setError('')
    try {
      // RACI defaults από τη λίστα Resources (αντιστοίχιση προσώπου μέσω email)
      const res = await fetchResources().catch(() => [])
      const resIdByEmail = (em) => (em ? res.find((r) => r.email && r.email === em)?.id : undefined)
      const extraFields = {}
      if ((orig?.accountable_ids ?? []).length === 0) {
        const rid = resIdByEmail(orig?.supervisor_email)
        if (rid) extraFields.accountable_ids = [rid]
      }
      if ((orig?.consulted_ids ?? []).length === 0) {
        const rid = resIdByEmail(orig?.owner_email)
        if (rid) extraFields.consulted_ids = [rid]
      }

      const me = users.find((u) => u.email && u.email === (profile.email ?? '').toLowerCase())
      await signProject(id, { userLookupId: me?.id, userName: me?.name ?? profile.email ?? '', extraFields })
      const p = await fetchProject(id)
      setForm(pick(p)); setOrig(p)
    } catch (e) { setError(e.message ?? 'Η υπογραφή απέτυχε.') }
    finally { setBusy(false) }
  }

  const sign = async () => {
    if (!canSign || busy) return
    // Warning (μη μπλοκαριστικό) αν δεν υπάρχει κανένα συνημμένο:
    // το ΟΚ (λήψη γνώσης) επιτρέπει στην υπογραφή να προχωρήσει
    let hasFiles = true
    try {
      const files = await getAttachments(LISTS.projects, id)
      hasFiles = Boolean(files?.length)
    } catch { /* ignore */ }
    if (!hasFiles) {
      setNotice({
        type: 'warn',
        text: 'Δεν υπάρχει κανένα συνημμένο αρχείο — το έργο δεν περιγράφεται επαρκώς.\n\nΜε το ΟΚ η υπογραφή θα προχωρήσει.',
        onOk: doSign,
      })
    } else await doSign()
  }

  const isReadOnly = PROJECT_RIGHTS[effectiveRole]?.length === 0
    || (Boolean(orig?.on_going) && effectiveRole !== 'admin')

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
        {/* Υπογραφή: μόνο Admin ή ο Supervisor του έργου, όσο εκκρεμεί έγκριση */}
        {canSign && (
          <button className="btn primary" onClick={sign} disabled={busy}>
            ✍ Υπογραφή
          </button>
        )}
      </div>

      {error && <div className="err">{error}</div>}
      <NoticeDialog notice={notice} onClose={() => setNotice(null)} />

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
              {form.icon
                ? <img src={form.icon} alt="icon" className="proj-icon-preview"
                    onClick={() => allowed('icon') && setShowIconPicker(true)}
                    title={allowed('icon') ? 'Click to change' : undefined} />
                : allowed('icon') && (
                  <div className="proj-icon-placeholder" onClick={() => setShowIconPicker(true)} title="Επιλογή εικονιδίου">＋</div>
                )}
              {form.icon && allowed('icon') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button type="button" className="btn sm" onClick={() => setShowIconPicker(true)}>Change</button>
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
            <span className="k">Supervisor <em>*</em></span>
            <select value={form.supervisor_id} onChange={set('supervisor_id')}
              disabled={!allowed('supervisor_id')}>
              <option value="">Select supervisor…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="f" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            title="Project-κουβάς για on-going εργασίες (συντήρηση κλπ) — χωρίς πρακτικό deadline, δεν κλείνει ποτέ. Μόνο ο Admin το αλλάζει.">
            <input type="checkbox" checked={Boolean(form.on_going)}
              disabled={effectiveRole !== 'admin'}
              onChange={(e) => setForm((f) => ({
                ...f,
                on_going: e.target.checked,
                deadline: e.target.checked ? ONGOING_DEADLINE : f.deadline,
              }))} />
            <span className="k" style={{ marginBottom: 0 }}>ON_GOING</span>
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
                <button type="button" className="btn sm" onClick={() => setShowRte(true)}>➕ Append</button>
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

        {editing && <AttachmentsPanel listName={LISTS.projects} itemId={id} canEdit={!isReadOnly} />}
        {editing && <CommentsPanel listName={LISTS.projects} itemId={id} currentEmail={profile.email} />}

        {/* ── Υπογραφή (Signed On / Signed By — read-only) ─ */}
        {editing && (
          <div className="auditbox">
            <h3>Υπογραφή</h3>
            <div className="fields" style={{ alignItems: 'center' }}>
              <div className="field"><div className="k">Signed On</div><div className="v mono">{orig?.signed_on ? fmtDateTime(orig.signed_on) : '—'}</div></div>
              <div className="field"><div className="k">Signed By</div><div className="v">{orig?.signed_by || '—'}</div></div>
              <div className="field">
                <button type="button" className="btn primary sm" onClick={sign}
                  disabled={!canSign || busy}
                  title={isSigned ? 'Το project είναι ήδη υπογεγραμμένο'
                    : canSign ? 'Υπογραφή: Signed On/By, status → Not Started'
                    : 'Διαθέσιμο μόνο σε Admin ή στον Supervisor του έργου (σε Waiting Manager Approval)'}>
                  {isSigned ? '✓ Υπογεγραμμένο' : '✍ Υπογραφή'}
                </button>
              </div>
            </div>
          </div>
        )}

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

      {showIconPicker && (
        <IconPicker onPick={pickIcon} onClose={() => setShowIconPicker(false)} />
      )}

      {showRte && (
        <RichTextEditor
          html=""
          title="Append note"
          onSave={(html) => {
            const text = html.replace(/<[^>]*>/g, '').trim()
            if (text) {
              const ts = new Date().toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              const header = `<p class="note-meta"><strong>Ο ${profile.name} στις ${ts}, σημείωσε:</strong></p>`
              setForm((f) => {
                const sep = f.notes ? '<hr class="note-hr"/>' : ''
                return { ...f, notes: header + html + sep + (f.notes || '') }
              })
            }
            setShowRte(false)
          }}
          onClose={() => setShowRte(false)}
        />
      )}
    </>
  )
}
