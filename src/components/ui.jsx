import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { STATUS_COLOR, STATUSES, QUICK_FILTERS, isAssigned, isOverdue, fmtDate, downloadCSV } from '../lib/meta'

// Date field rendered as dd/mm/yyyy regardless of browser locale.
// Stores/returns ISO yyyy-mm-dd ('' when empty/incomplete).
function isoToDisplay(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y ? `${d}/${m}/${y}` : ''
}
function displayToIso(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s)
  if (!m) return ''
  const [, dd, mm, yyyy] = m
  const dt = new Date(`${yyyy}-${mm}-${dd}T00:00:00`)
  if (Number.isNaN(dt.getTime()) || dt.getMonth() + 1 !== Number(mm)) return ''
  return `${yyyy}-${mm}-${dd}`
}
export function DateInput({ value, onChange, disabled }) {
  const [text, setText] = useState(isoToDisplay(value))
  useEffect(() => { setText(isoToDisplay(value)) }, [value])
  const handle = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
    let out = digits
    if (digits.length >= 5) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
    else if (digits.length >= 3) out = `${digits.slice(0, 2)}/${digits.slice(2)}`
    setText(out)
    onChange(displayToIso(out))
  }
  return (
    <input type="text" inputMode="numeric" placeholder="dd/mm/yyyy" maxLength={10}
      value={text} onChange={handle} disabled={disabled} />
  )
}

export function StatusBadge({ status }) {
  const c = STATUS_COLOR[status]
  return (
    <span className="badge" style={{ background: `color-mix(in srgb, ${c} 12%, white)`, color: c }}>
      <i style={{ background: c }} /> {status}
    </span>
  )
}

export function Flags({ r }) {
  return (
    <>
      {isAssigned(r) && <span className="flag assigned">Assigned</span>}{' '}
      {isOverdue(r) && <span className="flag overdue">Overdue</span>}
    </>
  )
}

const LC = ['Planned', 'Approved', 'In Process', 'Completed']
export function Lifecycle({ r }) {
  if (r.status === 'Cancelled')
    return (
      <div className="lifecycle">
        <div className="lc-step done">Planned</div>
        <div className="lc-step now dead">Cancelled {fmtDate(r.cancelled_date)}</div>
      </div>
    )
  const cur = r.status === 'On Hold' ? 'In Process' : r.status
  const idx = LC.indexOf(cur)
  return (
    <div className="lifecycle">
      {LC.map((s, i) => (
        <div key={s} className={'lc-step' + (i < idx ? ' done' : i === idx ? ' now' : '')}>
          {i === idx && r.status === 'On Hold' ? 'On Hold' : s}
        </div>
      ))}
    </div>
  )
}

export function RequestGrid({ rows, columns, filters, defaultFilter = 'Open', emptyHint }) {
  const nav = useNavigate()
  const [filter, setFilter] = useState(defaultFilter)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState(null) // {key, dir}

  const visible = useMemo(() => {
    let out = rows.filter(QUICK_FILTERS[filter] ?? (() => true))
    if (q.trim()) {
      const t = q.toLowerCase()
      out = out.filter((r) =>
        [r.reference_number, r.title, r.requestor_name, r.approver?.name, r.status,
         ...(r.implementors ?? []).map((i) => i.resource?.name)]
          .join(' ').toLowerCase().includes(t))
    }
    if (sort) {
      const { key, dir } = sort
      out = [...out].sort((a, b) => {
        const av = key === 'approver' ? a.approver?.name : a[key]
        const bv = key === 'approver' ? b.approver?.name : b[key]
        return (av > bv ? 1 : av < bv ? -1 : 0) * dir
      })
    }
    return out
  }, [rows, filter, q, sort])

  const clickSort = (key) =>
    setSort((s) => (s?.key === key ? { key, dir: -s.dir } : { key, dir: 1 }))

  return (
    <>
      <div className="toolbar">
        <div className="chips">
          {(filters ?? Object.keys(QUICK_FILTERS)).map((f) => (
            <button key={f} className={'chip' + (f === filter ? ' on' : '')} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <input className="search" placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={() => downloadCSV(visible)}>Export CSV</button>
      </div>
      <div className="card">
        {visible.length === 0 ? (
          <div className="empty">{emptyHint ?? 'No tasks match this view.'}</div>
        ) : (
          <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th />
                {columns.map((c) => (
                  <th key={c.key} className="sortable" onClick={() => clickSort(c.sortKey ?? c.key)}>
                    {c.label}{sort?.key === (c.sortKey ?? c.key) ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} onClick={() => nav(`/requests/${r.id}`)}>
                  <td className="rail"><div style={{ background: STATUS_COLOR[r.status] }} /></td>
                  {columns.map((c) => <td key={c.key}>{c.render(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </>
  )
}

export function ConfirmDialog({ title, body, onYes, onNo, busy }) {
  return (
    <div className="overlay" onClick={onNo}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p style={{ color: 'var(--ink-soft)' }}>{body ?? 'Are you sure you want to proceed?'}</p>
        <div className="row">
          <button className="btn" onClick={onNo} disabled={busy}>No</button>
          <button className="btn primary" onClick={onYes} disabled={busy}>{busy ? 'Working…' : 'Yes'}</button>
        </div>
      </div>
    </div>
  )
}

export function AssignDialog({ resources, onSubmit, onClose, busy, error }) {
  const [selected, setSelected] = useState([])
  const [priority, setPriority] = useState('')
  const [expectedStart, setExpectedStart] = useState('')
  const toggle = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const valid = selected.length > 0 && priority !== '' && Number(priority) >= 0 && expectedStart
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Assign request</h2>
        {error && <div className="err">{error}</div>}
        <div className="stack">
          <label className="f">
            <span className="k">Implementors team <em>*</em></span>
            <div className="checklist">
              {resources.map((r) => (
                <label key={r.id}>
                  <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                  {r.name} <span className="mono" style={{ color: 'var(--ink-soft)' }}>{r.email}</span>
                </label>
              ))}
            </div>
          </label>
          <label className="f">
            <span className="k">COO prioritization <em>*</em></span>
            <input type="number" min="0" value={priority} onChange={(e) => setPriority(e.target.value)} />
          </label>
          <label className="f">
            <span className="k">Expected start <em>*</em></span>
            <input type="date" value={expectedStart} onChange={(e) => setExpectedStart(e.target.value)} />
          </label>
        </div>
        <div className="row">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" disabled={!valid || busy}
            onClick={() => onSubmit(selected, Number(priority), expectedStart)}>
            {busy ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function CompleteDialog({ onSubmit, onClose, busy, error }) {
  const [when, setWhen] = useState(new Date().toISOString().slice(0, 16))
  const [hours, setHours] = useState('')
  const [summary, setSummary] = useState('')
  const valid = when && hours !== '' && Number(hours) >= 0 && summary.trim()
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Complete request</h2>
        {error && <div className="err">{error}</div>}
        <div className="stack">
          <label className="f">
            <span className="k">Actual completion <em>*</em></span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
          <label className="f">
            <span className="k">Actual man-hours <em>*</em></span>
            <input type="number" min="0" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
          </label>
          <label className="f">
            <span className="k">Resolution summary <em>*</em></span>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>
        </div>
        <div className="row">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" disabled={!valid || busy}
            onClick={() => onSubmit(new Date(when).toISOString(), Number(hours), summary.trim())}>
            {busy ? 'Completing…' : 'Complete'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function MultiFilter({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <div className="mfilter">
      <button className="btn" onClick={() => setOpen((o) => !o)}>
        {label}{value.length ? ` (${value.length})` : ''} ▾
      </button>
      {open && (
        <div className="pop" onMouseLeave={() => setOpen(false)}>
          {value.length > 0 && (
            <label onClick={() => onChange([])} style={{ color: 'var(--accent)' }}>Clear all</label>
          )}
          {options.length === 0 && <label style={{ color: 'var(--ink-soft)' }}>No options</label>}
          {options.map((o) => (
            <label key={o.value}>
              <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export function Kanban({ rows }) {
  const nav = useNavigate()
  return (
    <div className="kanban">
      {STATUSES.map((s) => (
        <div className="kcol" key={s}>
          <h3 style={{ color: STATUS_COLOR[s] }}>{s} · {rows.filter((r) => r.status === s).length}</h3>
          {rows.filter((r) => r.status === s).map((r) => (
            <div className="kcard" key={r.id} onClick={() => nav(`/requests/${r.id}`)}>
              <div className="t">{r.title}</div>
              <span className="mono" style={{ color: 'var(--ink-soft)' }}>{r.assigned_to ?? 'Unassigned'}</span>
              <Flags r={r} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function ProjectsKanban({ rows }) {
  const nav = useNavigate()
  const sof = (p) => p.status || 'No status'
  const statuses = useMemo(() => {
    const present = [...new Set(rows.map(sof))]
    const ordered = ['Not Started', 'In Progress', 'Waiting', 'On Hold', 'Deferred', 'Completed', 'No status']
    const known = ordered.filter((s) => present.includes(s))
    const extra = present.filter((s) => !ordered.includes(s))
    const all = [...known, ...extra]
    return all.length ? all : ['No status']
  }, [rows])
  return (
    <div className="kanban">
      {statuses.map((s) => (
        <div className="kcol" key={s}>
          <h3>{s} · {rows.filter((r) => sof(r) === s).length}</h3>
          {rows.filter((r) => sof(r) === s).map((p) => (
            <div className="kcard" key={p.id} onClick={() => nav(`/projects/${p.id}`)}>
              <div className="t">{p.title}</div>
              <span className="mono" style={{ color: 'var(--ink-soft)' }}>{p.owner || '—'}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
