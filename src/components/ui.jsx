import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { STATUS_COLOR, STATUSES, QUICK_FILTERS, isAssigned, isOverdue, exportXLSX } from '../lib/meta'

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
  if (!status) return <span className="mono" style={{ color: 'var(--text-muted)' }}>—</span>
  const c = STATUS_COLOR[status] ?? 'var(--text-muted)'
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

// ── DataGrid ──────────────────────────────────────────────────────────────────
// Excel-like column filtering (dropdown checkboxes), sorting, clear-filters,
// and Export to Excel. Column spec: { key, label, render, text?, noFilter?, noSort? }
//   text(row)  → plain string used for filter dropdown values and Excel export
//               (defaults to String(row[key] ?? ''))
//   noFilter   → hide the ▾ filter button on this column
//   noSort     → clicking header doesn't sort

function colText(col, row) {
  if (col.text) return col.text(row)
  const v = row[col.key]
  return v == null ? '' : String(v)
}

export function DataGrid({
  rows, columns, onRowClick, emptyHint,
  filename = 'export.xlsx',
  railKey,           // if set, a colored left rail is added using STATUS_COLOR[row[railKey]]
  chips,             // { label → filterFn } for quick-filter chip bar at top
  defaultChip,       // initial chip key
}) {
  const [chip, setChip] = useState(defaultChip ?? (chips ? Object.keys(chips)[0] : null))
  const [q, setQ] = useState('')
  const [colFilters, setColFilters] = useState({}) // { [colKey]: Set<string> } — empty = no filter
  const [sort, setSort] = useState(null)           // { key, dir: 1|-1 }
  const [openFilter, setOpenFilter] = useState(null)
  const [filterSearch, setFilterSearch] = useState('')
  const [filterPos, setFilterPos] = useState({ top: 0, left: 0 })
  const popRef = useRef(null)

  // Close popup on outside click
  useEffect(() => {
    if (!openFilter) return
    const h = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setOpenFilter(null) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [openFilter])

  // 1. Quick-filter chip
  const chipRows = useMemo(() => {
    if (!chip || !chips?.[chip]) return rows
    return rows.filter(chips[chip])
  }, [rows, chip, chips])

  // 2. Global text search across all non-excluded columns
  const searchedRows = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return chipRows
    return chipRows.filter((r) =>
      columns.filter((c) => !c.noFilter).some((c) => colText(c, r).toLowerCase().includes(t)))
  }, [chipRows, q, columns])

  // 3. Unique values per column for the filter dropdown (cascading: each col sees rows filtered by all OTHER cols)
  const uniqueVals = useMemo(() => {
    const out = {}
    const filterableCols = columns.filter((c) => !c.noFilter && c.label)
    for (const col of filterableCols) {
      const base = searchedRows.filter((r) => {
        for (const [k, sel] of Object.entries(colFilters)) {
          if (k === col.key || !sel || sel.size === 0) continue
          const c = columns.find((c) => c.key === k)
          if (c && !sel.has(colText(c, r))) return false
        }
        return true
      })
      out[col.key] = [...new Set(base.map((r) => colText(col, r)))].sort((a, b) => a.localeCompare(b, 'el'))
    }
    return out
  }, [searchedRows, columns, colFilters])

  // 4. Apply column filters
  const filtered = useMemo(() => {
    let out = searchedRows
    for (const [key, sel] of Object.entries(colFilters)) {
      if (!sel || sel.size === 0) continue
      const col = columns.find((c) => c.key === key)
      if (!col) continue
      out = out.filter((r) => sel.has(colText(col, r)))
    }
    return out
  }, [searchedRows, colFilters, columns])

  // 5. Sort — always on raw row[key] for correct date/number ordering
  const visible = useMemo(() => {
    if (!sort) return filtered
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return filtered
    return [...filtered].sort((a, b) => {
      const av = String(a[col.key] ?? '')
      const bv = String(b[col.key] ?? '')
      return av.localeCompare(bv, 'el', { numeric: true }) * sort.dir
    })
  }, [filtered, sort, columns])

  const hasColFilters = Object.values(colFilters).some((s) => s && s.size > 0)

  const clearAllFilters = () => {
    setColFilters({})
    setQ('')
    if (defaultChip) setChip(defaultChip)
  }

  const toggleColFilter = (colKey, val) => {
    setColFilters((prev) => {
      const allVals = uniqueVals[colKey] ?? []
      const cur = prev[colKey] ? new Set(prev[colKey]) : new Set()
      if (cur.size === 0) {
        // All shown → user unchecks one → show all EXCEPT that value
        const ns = new Set(allVals)
        ns.delete(val)
        return { ...prev, [colKey]: ns }
      }
      if (cur.has(val)) cur.delete(val)
      else cur.add(val)
      // If everything is now selected, reset to no-filter
      if (allVals.length > 0 && allVals.every((v) => cur.has(v))) return { ...prev, [colKey]: new Set() }
      return { ...prev, [colKey]: new Set(cur) }
    })
  }

  const openColFilter = (colKey, e) => {
    if (openFilter === colKey) { setOpenFilter(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    setFilterPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 248) })
    setOpenFilter(colKey)
    setFilterSearch('')
  }

  const clickSort = (col) => {
    if (col.noSort) return
    setSort((s) => s?.key === col.key ? { key: col.key, dir: -s.dir } : { key: col.key, dir: 1 })
  }

  const doExport = async () => {
    const exportCols = columns.filter((c) => c.label && !c.noFilter)
    const headers = exportCols.map((c) => c.label)
    const data = visible.map((r) => exportCols.map((c) => colText(c, r)))
    await exportXLSX(headers, data, filename)
  }

  // Dropdown state
  const openVals = openFilter ? (uniqueVals[openFilter] ?? []) : []
  const displayedVals = filterSearch
    ? openVals.filter((v) => v.toLowerCase().includes(filterSearch.toLowerCase()))
    : openVals
  const openSel = colFilters[openFilter]
  const isChecked = (v) => !openSel || openSel.size === 0 || openSel.has(v)

  return (
    <>
      {chips && (
        <div className="toolbar">
          <div className="chips">
            {Object.keys(chips).map((f) => (
              <button key={f} className={'chip' + (f === chip ? ' on' : '')} onClick={() => setChip(f)}>{f}</button>
            ))}
          </div>
          <div className="spacer" />
          <input className="search" placeholder="Αναζήτηση…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      <div className="toolbar">
        {!chips && <input className="search" placeholder="Αναζήτηση…" value={q} onChange={(e) => setQ(e.target.value)} />}
        {hasColFilters && (
          <button className="btn" onClick={clearAllFilters}>✕ Αναίρεση φίλτρων</button>
        )}
        <div className="spacer" />
        <span className="grid-count">{visible.length} εγγραφές</span>
        <button className="btn" onClick={doExport}>⬇ Export Excel</button>
      </div>
      <div className="card">
        {visible.length === 0 ? (
          <div className="empty">{emptyHint ?? 'Δεν βρέθηκαν αποτελέσματα.'}</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  {railKey && <th style={{ width: 4, padding: 0 }} />}
                  {columns.map((col) => {
                    const filterActive = (colFilters[col.key]?.size ?? 0) > 0
                    const sortDir = sort?.key === col.key ? sort.dir : null
                    return (
                      <th key={col.key} className={col.noSort ? '' : 'sortable'} onClick={() => clickSort(col)}>
                        <div className="th-inner">
                          <span>{col.label}{sortDir ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}</span>
                          {!col.noFilter && col.label && (
                            <button
                              className={'filterbtn' + (filterActive ? ' active' : '')}
                              title="Φίλτρο"
                              onClick={(e) => { e.stopPropagation(); openColFilter(col.key, e) }}
                            >▾</button>
                          )}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} onClick={() => onRowClick?.(r)}>
                    {railKey && <td className="rail"><div style={{ background: STATUS_COLOR[r[railKey]] }} /></td>}
                    {columns.map((col) => <td key={col.key}>{col.render(r)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Filter dropdown — fixed-position to escape table overflow clipping */}
      {openFilter && (
        <div className="filterpop" ref={popRef} style={{ top: filterPos.top, left: filterPos.left }}>
          <div className="filterpop-head">
            <input
              className="filterpop-search"
              placeholder="Αναζήτηση τιμών…"
              value={filterSearch}
              autoFocus
              onChange={(e) => setFilterSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className="filterpop-all"
              onClick={(e) => { e.stopPropagation(); setColFilters((p) => ({ ...p, [openFilter]: new Set() })) }}
            >Επιλογή όλων</button>
          </div>
          <div className="filterpop-list">
            {displayedVals.length === 0
              ? <div className="filterpop-empty">Δεν βρέθηκαν τιμές</div>
              : displayedVals.map((v) => (
                <label key={v} className="filterpop-item" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={isChecked(v)} onChange={() => toggleColFilter(openFilter, v)} />
                  <span>{v || '(κενό)'}</span>
                </label>
              ))
            }
          </div>
        </div>
      )}
    </>
  )
}

// ── RequestGrid — thin wrapper around DataGrid for the Tasks list ─────────────
export function RequestGrid({ rows, columns, filters, defaultFilter = 'Open', emptyHint }) {
  const nav = useNavigate()
  const chipDefs = useMemo(
    () => Object.fromEntries((filters ?? Object.keys(QUICK_FILTERS)).map((f) => [f, QUICK_FILTERS[f] ?? (() => true)])),
    [filters]
  )
  const cols = useMemo(
    () => columns.map((c) => (c.key === 'flags' || !c.label) ? { ...c, noFilter: true, noSort: true } : c),
    [columns]
  )
  return (
    <DataGrid
      rows={rows}
      columns={cols}
      onRowClick={(r) => nav(`/requests/${r.id}`)}
      emptyHint={emptyHint ?? 'Δεν βρέθηκαν tasks.'}
      filename="tasks.xlsx"
      railKey="status"
      chips={chipDefs}
      defaultChip={defaultFilter}
    />
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
