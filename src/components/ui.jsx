import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { STATUS_COLOR, STATUSES, QUICK_FILTERS, isAssigned, isOverdue, downloadCSV } from '../lib/meta'

// Date field: masked dd/mm/yyyy text entry + calendar picker button.
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
  const hiddenRef = useRef(null)
  useEffect(() => { setText(isoToDisplay(value)) }, [value])
  const handle = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
    let out = digits
    if (digits.length >= 5) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
    else if (digits.length >= 3) out = `${digits.slice(0, 2)}/${digits.slice(2)}`
    setText(out)
    onChange(displayToIso(out))
  }
  const openPicker = () => {
    const el = hiddenRef.current
    if (!el) return
    if (el.showPicker) el.showPicker()
    else el.click()
  }
  return (
    <div className="dateinput">
      <input type="text" inputMode="numeric" placeholder="dd/mm/yyyy" maxLength={10}
        value={text} onChange={handle} disabled={disabled} />
      <button type="button" className="calbtn" onClick={openPicker} disabled={disabled}
        aria-label="Open calendar" title="Open calendar">📅</button>
      <input ref={hiddenRef} type="date" className="calhidden" tabIndex={-1} aria-hidden="true"
        value={value ? value.slice(0, 10) : ''} onChange={(e) => onChange(e.target.value)} />
    </div>
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
