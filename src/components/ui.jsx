import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { STATUS_COLOR, STATUSES, QUICK_FILTERS, isAssigned, isOverdue, exportXLSX } from '../lib/meta'
import { getAttachments, addAttachment, deleteAttachment } from '../lib/sp'

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

// ── RichTextEditor dialog ─────────────────────────────────────────────────────
// Opens as an overlay. html = initial HTML string. onSave(html) / onClose().
export function RichTextEditor({ html, title = 'Σημειώσεις', onSave, onClose }) {
  const editorRef = useRef(null)

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = html || ''
      editorRef.current.focus()
    }
  }, [])

  const exec = (cmd, val) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, val ?? null)
  }

  const addLink = (e) => {
    e.preventDefault()
    const url = window.prompt('URL:')
    if (url) { editorRef.current?.focus(); document.execCommand('createLink', false, url) }
  }

  const TB = [
    { label: <b>B</b>, title: 'Bold',         cmd: 'bold' },
    { label: <i>I</i>, title: 'Italic',        cmd: 'italic' },
    { label: <u>U</u>, title: 'Underline',     cmd: 'underline' },
    { label: <s>S</s>, title: 'Strikethrough', cmd: 'strikeThrough' },
  ]

  return (
    <div className="overlay" onClick={onClose}>
      <div className="rte-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="rte-header">
          <span>{title}</span>
          <button className="rte-close" onClick={onClose} title="Κλείσιμο">✕</button>
        </div>
        <div className="rte-toolbar">
          {TB.map(({ label, title: t, cmd }) => (
            <button key={cmd} className="rte-btn" title={t}
              onMouseDown={(e) => { e.preventDefault(); exec(cmd) }}>{label}</button>
          ))}
          <span className="rte-sep" />
          <button className="rte-btn" title="Επικεφαλίδα H2"
            onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'h2') }}>H2</button>
          <button className="rte-btn" title="Επικεφαλίδα H3"
            onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'h3') }}>H3</button>
          <button className="rte-btn" title="Παράγραφος"
            onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'p') }}>¶</button>
          <span className="rte-sep" />
          <button className="rte-btn" title="Λίστα με κουκκίδες"
            onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList') }}>• Λίστα</button>
          <button className="rte-btn" title="Αριθμημένη λίστα"
            onMouseDown={(e) => { e.preventDefault(); exec('insertOrderedList') }}>1. Λίστα</button>
          <span className="rte-sep" />
          <button className="rte-btn" title="Εισαγωγή link" onMouseDown={addLink}>🔗 Link</button>
          <button className="rte-btn rte-btn-danger" title="Καθαρισμός μορφοποίησης"
            onMouseDown={(e) => { e.preventDefault(); exec('removeFormat') }}>Clear</button>
        </div>
        <div ref={editorRef} className="rte-body" contentEditable suppressContentEditableWarning />
        <div className="rte-footer">
          <button className="btn" onClick={onClose}>Ακύρωση</button>
          <button className="btn primary" onClick={() => onSave(editorRef.current?.innerHTML ?? '')}>
            Αποθήκευση
          </button>
        </div>
      </div>
    </div>
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

// Ενεργό date filter: αριθμός ημερών ή range με τουλάχιστον ένα άκρο
const dateActive = (d) => Boolean(d && (typeof d !== 'object' || d.from || d.to))

export function DataGrid({
  rows, columns, onRowClick, emptyHint,
  filename = 'export.xlsx',
  railKey,           // if set, a colored left rail is added using STATUS_COLOR[row[railKey]]
  chips,             // { label → filterFn } for quick-filter chip bar at top
  defaultChip,       // initial chip key
  rowClass,          // (row) => className string — e.g. 'row-overdue'
}) {
  const [chip, setChip] = useState(defaultChip ?? (chips ? Object.keys(chips)[0] : null))
  const [q, setQ] = useState('')
  const [colFilters, setColFilters] = useState({}) // { [colKey]: Set<string> } — empty = no filter
  const [textFilters, setTextFilters] = useState({}) // { [colKey]: substring } — columns with ftype:'text'
  const [dateFilters, setDateFilters] = useState({}) // { [colKey]: days-back } — columns with ftype:'date'
  const [customDays, setCustomDays] = useState({})   // { [colKey]: raw input for «Χ ημέρες» }
  const [sort, setSort] = useState(null)           // { key, dir: 1|-1 }
  const [openFilter, setOpenFilter] = useState(null)
  const [filterSearch, setFilterSearch] = useState('')
  const [filterPos, setFilterPos] = useState({ top: 0, left: 0 })
  const [page, setPage] = useState(0)
  const popRef = useRef(null)
  const PAGE_SIZE = 10
  const NONE = '\u0000__none__' // sentinel: «καμία τιμή επιλεγμένη» στο checkbox filter

  // Επιστροφή στην 1η σελίδα όταν αλλάζει οποιοδήποτε φίλτρο
  useEffect(() => { setPage(0) }, [q, chip, colFilters, textFilters, dateFilters])

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

  // 4. Apply column filters (checkbox + κείμενο + ημερομηνία)
  const filtered = useMemo(() => {
    let out = searchedRows
    for (const [key, sel] of Object.entries(colFilters)) {
      if (!sel || sel.size === 0) continue
      const col = columns.find((c) => c.key === key)
      if (!col) continue
      out = out.filter((r) => sel.has(colText(col, r)))
    }
    for (const [key, txt] of Object.entries(textFilters)) {
      const t = (txt ?? '').trim().toLowerCase()
      if (!t) continue
      const col = columns.find((c) => c.key === key)
      if (!col) continue
      out = out.filter((r) => colText(col, r).toLowerCase().includes(t))
    }
    for (const [key, dv] of Object.entries(dateFilters)) {
      if (!dateActive(dv)) continue
      let fromIso = null, toIso = null
      if (typeof dv === 'object') {
        fromIso = dv.from || null
        toIso = dv.to || null
      } else {
        const n = Number(dv)
        if (!n || n <= 0) continue
        const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - n)
        fromIso = from.toISOString().slice(0, 10)
        toIso = new Date().toISOString().slice(0, 10)
      }
      out = out.filter((r) => {
        const v = String(r[key] ?? '').slice(0, 10)
        if (!v) return false
        if (fromIso && v < fromIso) return false
        if (toIso && v > toIso) return false
        return true
      })
    }
    return out
  }, [searchedRows, colFilters, textFilters, dateFilters, columns])

  // 5. Sort — always on raw row[key] for correct date/number ordering
  const sorted = useMemo(() => {
    if (!sort) return filtered
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return filtered
    return [...filtered].sort((a, b) => {
      const av = String(a[col.key] ?? '')
      const bv = String(b[col.key] ?? '')
      return av.localeCompare(bv, 'el', { numeric: true }) * sort.dir
    })
  }, [filtered, sort, columns])

  // 6. Σελιδοποίηση: 10 γραμμές ανά σελίδα
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const curPage = Math.min(page, pageCount - 1)
  const visible = sorted.slice(curPage * PAGE_SIZE, curPage * PAGE_SIZE + PAGE_SIZE)

  const hasColFilters = Object.values(colFilters).some((s) => s && s.size > 0)
    || Object.values(textFilters).some((t) => t && t.trim())
    || Object.values(dateFilters).some(dateActive)

  const clearAllFilters = () => {
    setColFilters({}); setTextFilters({}); setDateFilters({}); setCustomDays({})
    setQ('')
    if (defaultChip) setChip(defaultChip)
  }

  const toggleColFilter = (colKey, val) => {
    setColFilters((prev) => {
      const allVals = uniqueVals[colKey] ?? []
      const cur = prev[colKey] ? new Set(prev[colKey]) : new Set()
      if (cur.has(NONE)) return { ...prev, [colKey]: new Set([val]) } // από «κανένα» → μόνο αυτό
      if (cur.size === 0) {
        // All shown → user unchecks one → show all EXCEPT that value
        const ns = new Set(allVals)
        ns.delete(val)
        return { ...prev, [colKey]: ns.size ? ns : new Set([NONE]) }
      }
      if (cur.has(val)) cur.delete(val)
      else cur.add(val)
      if (cur.size === 0) return { ...prev, [colKey]: new Set([NONE]) }
      // If everything is now selected, reset to no-filter
      if (allVals.length > 0 && allVals.every((v) => cur.has(v))) return { ...prev, [colKey]: new Set() }
      return { ...prev, [colKey]: new Set(cur) }
    })
  }

  const openColFilter = (colKey, e) => {
    if (openFilter === colKey) { setOpenFilter(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    const w = columns.find((c) => c.key === colKey)?.ftype === 'date' ? 324 : 248
    setFilterPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - w)) })
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
    const data = sorted.map((r) => exportCols.map((c) => colText(c, r)))
    await exportXLSX(headers, data, filename)
  }

  // Dropdown state
  const openCol = openFilter ? columns.find((c) => c.key === openFilter) : null
  const openVals = openFilter ? (uniqueVals[openFilter] ?? []) : []
  const displayedVals = filterSearch
    ? openVals.filter((v) => v.toLowerCase().includes(filterSearch.toLowerCase()))
    : openVals
  const openSel = colFilters[openFilter]
  const allChecked = !openSel || openSel.size === 0
  const isChecked = (v) => allChecked ? true : openSel.has(NONE) ? false : openSel.has(v)

  const openRange = openFilter && typeof dateFilters[openFilter] === 'object' && dateFilters[openFilter]
    ? dateFilters[openFilter] : null

  const DATE_PRESETS = [
    [7, 'Τελευταία εβδομάδα'], [30, 'Τελευταίος μήνας'], [90, 'Τελευταίο τρίμηνο'],
    [180, 'Τελευταίο εξάμηνο'], [365, 'Τελευταίο έτος'],
  ]

  return (
    <>
      {/* Γραμμή 1: slicer + αναίρεση φίλτρων + αναζήτηση */}
      <div className="toolbar">
        {chips && (
          <div className="chips">
            {Object.keys(chips).map((f) => (
              <button key={f} className={'chip' + (f === chip ? ' on' : '')} onClick={() => setChip(f)}>{f}</button>
            ))}
          </div>
        )}
        {hasColFilters && (
          <button className="btn sm" onClick={clearAllFilters}>✕ Αναίρεση φίλτρων</button>
        )}
        <div className="spacer" />
        <input className="search" placeholder="Αναζήτηση…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {/* Γραμμή 2: σελιδοποίηση αριστερά · εγγραφές + export δεξιά (ίδιο ύψος) */}
      <div className="pager">
        {sorted.length > 0 && (
          <>
            <button className="btn sm" disabled={curPage === 0} onClick={() => setPage(curPage - 1)} title="Προηγούμενη σελίδα">‹</button>
            <span>Σελίδα {curPage + 1} / {pageCount}</span>
            <button className="btn sm" disabled={curPage >= pageCount - 1} onClick={() => setPage(curPage + 1)} title="Επόμενη σελίδα">›</button>
          </>
        )}
        <div className="spacer" />
        <span className="grid-count">{sorted.length} εγγραφές</span>
        <button className="btn sm" onClick={doExport}>⬇ Export Excel</button>
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
                      || Boolean((textFilters[col.key] ?? '').trim()) || dateActive(dateFilters[col.key])
                    const sortDir = sort?.key === col.key ? sort.dir : null
                    return (
                      <th key={col.key} className={col.noSort ? '' : 'sortable'} onClick={() => clickSort(col)}>
                        <div className="th-inner" data-tooltip={col.tooltip || undefined}>
                          <span>{col.label}{sortDir ? <span className="sortarrow">{sortDir > 0 ? '↑' : '↓'}</span> : null}</span>
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
                  <tr key={r.id} className={rowClass?.(r) ?? ''} onClick={() => onRowClick?.(r)}>
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
        <div className={'filterpop' + (openCol?.ftype === 'date' ? ' date' : '')} ref={popRef} style={{ top: filterPos.top, left: filterPos.left }}>
          {openCol?.ftype === 'text' ? (
            /* Text column: φίλτρο «περιέχει» */
            <div className="filterpop-head">
              <input
                className="filterpop-search"
                placeholder="Περιέχει…"
                value={textFilters[openFilter] ?? ''}
                autoFocus
                onChange={(e) => setTextFilters((p) => ({ ...p, [openFilter]: e.target.value }))}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                className="filterpop-all"
                onClick={(e) => { e.stopPropagation(); setTextFilters((p) => ({ ...p, [openFilter]: '' })) }}
              >Καθαρισμός</button>
            </div>
          ) : openCol?.ftype === 'date' ? (
            /* Date column: έτοιμα φίλτρα περιόδου + Χ ημέρες */
            <div className="filterpop-list">
              <label className="filterpop-item" onClick={(e) => e.stopPropagation()}>
                <input type="radio" checked={!dateActive(dateFilters[openFilter])}
                  onChange={() => setDateFilters((p) => ({ ...p, [openFilter]: null }))} />
                <span>Όλες οι ημερομηνίες</span>
              </label>
              {DATE_PRESETS.map(([d, l]) => (
                <label key={d} className="filterpop-item" onClick={(e) => e.stopPropagation()}>
                  <input type="radio" checked={dateFilters[openFilter] === d}
                    onChange={() => setDateFilters((p) => ({ ...p, [openFilter]: d }))} />
                  <span>{l}</span>
                </label>
              ))}
              <label className="filterpop-item" onClick={(e) => e.stopPropagation()}>
                <input type="radio"
                  checked={Boolean(customDays[openFilter]) && dateFilters[openFilter] === Number(customDays[openFilter])}
                  onChange={() => customDays[openFilter] && setDateFilters((p) => ({ ...p, [openFilter]: Number(customDays[openFilter]) }))} />
                <span>Τελευταίες</span>
                <input type="number" min="1" className="filterpop-days"
                  value={customDays[openFilter] ?? ''}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const v = e.target.value
                    setCustomDays((p) => ({ ...p, [openFilter]: v }))
                    setDateFilters((p) => ({ ...p, [openFilter]: v ? Number(v) : null }))
                  }} />
                <span>ημέρες</span>
              </label>
              {/* Από – Έως με ημερολόγιο */}
              <div className="filterpop-range" onClick={(e) => e.stopPropagation()}>
                <label>
                  <input type="radio" checked={Boolean(openRange)}
                    onChange={() => setDateFilters((p) => ({ ...p, [openFilter]: { from: '', to: '' } }))} />
                  <span>Από – Έως</span>
                </label>
                <div className="filterpop-range-inputs">
                  <input type="date" title="Από" value={openRange?.from ?? ''}
                    onChange={(e) => setDateFilters((p) => ({ ...p, [openFilter]: { ...(openRange ?? {}), from: e.target.value } }))} />
                  <input type="date" title="Έως" value={openRange?.to ?? ''}
                    onChange={(e) => setDateFilters((p) => ({ ...p, [openFilter]: { ...(openRange ?? {}), to: e.target.value } }))} />
                </div>
              </div>
            </div>
          ) : (
            /* Choice column: checkboxes + toggle επιλογής/αποεπιλογής όλων */
            <>
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
                  onClick={(e) => { e.stopPropagation(); setColFilters((p) => ({ ...p, [openFilter]: allChecked ? new Set([NONE]) : new Set() })) }}
                >{allChecked ? 'Αποεπιλογή όλων' : 'Επιλογή όλων'}</button>
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
            </>
          )}
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
      rowClass={(r) => isOverdue(r) ? 'row-overdue' : ''}
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

// Multi-select person picker for RACI fields.
// options: [{ id, name }], value: string[] of IDs
export function MultiPersonSelect({ options, value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  const selected = options.filter((o) => value.includes(o.id))
  const label = selected.length === 0 ? 'Επιλογή…'
    : selected.length <= 2 ? selected.map((o) => o.name).join(', ')
    : `${selected.slice(0, 2).map((o) => o.name).join(', ')} +${selected.length - 2}`

  return (
    <div className="mpselect" ref={ref}>
      <button type="button" className="mpselect-btn" disabled={disabled}
        onClick={() => setOpen((o) => !o)}>
        <span style={{ color: selected.length ? 'var(--ink)' : 'var(--ink-soft)' }}>{label}</span>
        {!disabled && <span style={{ opacity: 0.5 }}>▾</span>}
      </button>
      {open && !disabled && (
        <div className="mfilter pop" style={{ minWidth: '100%' }}>
          {selected.length > 0 && (
            <label style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => onChange([])}>
              Αναίρεση επιλογής
            </label>
          )}
          {options.length === 0 && <label style={{ color: 'var(--ink-soft)' }}>Δεν βρέθηκαν</label>}
          {options.map((o) => (
            <label key={o.id}>
              <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} />
              {o.name}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export function MultiFilter({ label, options, value, onChange, tooltip }) {
  const [open, setOpen] = useState(false)
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <div className="mfilter">
      <button className="btn" title={tooltip} onClick={() => setOpen((o) => !o)}>
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

// ── Συνημμένα list item (SharePoint REST — το Graph δεν εκθέτει attachments) ──
export function AttachmentsPanel({ listName, itemId, canEdit = true }) {
  const [files, setFiles] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const load = () => getAttachments(listName, itemId)
    .then((f) => { setFiles(f); setErr('') })
    .catch((e) => { setFiles([]); setErr(e.message ?? 'Αποτυχία φόρτωσης συνημμένων.') })

  useEffect(() => { if (itemId) load() }, [itemId])

  const upload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setErr('')
    try { await addAttachment(listName, itemId, file); await load() }
    catch (er) { setErr(er.message ?? 'Αποτυχία μεταφόρτωσης.') }
    setBusy(false)
    e.target.value = ''
  }

  const del = async (name) => {
    setBusy(true); setErr('')
    try { await deleteAttachment(listName, itemId, name); await load() }
    catch (er) { setErr(er.message ?? 'Αποτυχία διαγραφής.') }
    setBusy(false)
  }

  return (
    <div className="attachbox">
      <h3>Συνημμένα{files ? ` (${files.length})` : ''}</h3>
      {err && <div className="err">{err}</div>}
      {files == null
        ? <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Φόρτωση…</div>
        : files.length === 0
          ? <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 10 }}>Δεν υπάρχουν συνημμένα.</div>
          : (
            <ul>
              {files.map((f) => (
                <li key={f.name}>
                  <a href={f.url} target="_blank" rel="noreferrer">📎 {f.name}</a>
                  {canEdit && <button type="button" className="del" title="Διαγραφή" disabled={busy} onClick={() => del(f.name)}>✕</button>}
                </li>
              ))}
            </ul>
          )}
      {canEdit && (
        <>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={upload} />
          <button type="button" className="btn sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Εργασία…' : '+ Προσθήκη αρχείου'}
          </button>
        </>
      )}
    </div>
  )
}
