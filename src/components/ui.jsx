import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { STATUS_COLOR, STATUSES, QUICK_FILTERS, isAssigned, isOverdue, exportXLSX, fmtDateTime } from '../lib/meta'
import { getAttachments, addAttachment, deleteAttachment, getComments, addComment, deleteComment } from '../lib/sp'

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

// Έλεγχος αν μια ημερομηνία (ISO) περνά ένα date filter.
// dv: null | 'ytd' (1/1 τρέχοντος έτους → σήμερα) | αριθμός>0 (τελευταίες Χ ημέρες)
//     | αριθμός<0 (επόμενες Χ ημέρες) | { from, to }
export const dateMatches = (dv, iso) => {
  if (!dateActive(dv)) return true
  const v = String(iso ?? '').slice(0, 10)
  if (!v) return false
  let fromIso = null, toIso = null
  if (typeof dv === 'object') {
    fromIso = dv.from || null
    toIso = dv.to || null
  } else if (dv === 'ytd') {
    fromIso = `${new Date().getFullYear()}-01-01`
    toIso = new Date().toISOString().slice(0, 10)
  } else if (Number(dv) < 0) {
    const to = new Date(); to.setHours(0, 0, 0, 0); to.setDate(to.getDate() - Number(dv))
    fromIso = new Date().toISOString().slice(0, 10)
    toIso = to.toISOString().slice(0, 10)
  } else {
    const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - Number(dv))
    fromIso = from.toISOString().slice(0, 10)
    toIso = new Date().toISOString().slice(0, 10)
  }
  if (fromIso && v < fromIso) return false
  if (toIso && v > toIso) return false
  return true
}

const PAST_PRESETS = [[7, 'Τελευταία εβδομάδα'], [30, 'Τελευταίος μήνας'], [90, 'Τελευταίο τρίμηνο'],
  [180, 'Τελευταίο εξάμηνο'], [365, 'Τελευταίο έτος']]
const NEXT_PRESETS = [[-7, 'Επόμενη εβδομάδα'], [-30, 'Επόμενος μήνας'], [-90, 'Επόμενο τρίμηνο'],
  [-180, 'Επόμενο εξάμηνο'], [-365, 'Επόμενο έτος']]
const PRESET_VALS = new Set([...PAST_PRESETS, ...NEXT_PRESETS].map(([d]) => d))

// Κοινές επιλογές date filter — χρησιμοποιείται και στα grid views και στα Overviews
export function DateFilterOptions({ value, onChange, itemClass = '' }) {
  const stop = (e) => e.stopPropagation()
  const [customPast, setCustomPast] = useState(
    typeof value === 'number' && value > 0 && !PRESET_VALS.has(value) ? String(value) : '')
  const [customNext, setCustomNext] = useState(
    typeof value === 'number' && value < 0 && !PRESET_VALS.has(value) ? String(-value) : '')
  const range = typeof value === 'object' && value ? value : null
  const active = dateActive(value)
  return (
    <>
      {/* 1. Όλες */}
      <label className={itemClass} onClick={stop}>
        <input type="radio" checked={!active} onChange={() => onChange(null)} />
        <span>Όλες οι ημερομηνίες</span>
      </label>
      {/* 2. Εφέτος: 1/1 τρέχοντος έτους έως σήμερα */}
      <label className={itemClass} onClick={stop}>
        <input type="radio" checked={value === 'ytd'} onChange={() => onChange('ytd')} />
        <span>Εφέτος</span>
      </label>
      {/* 3. Από – Έως */}
      <label className={itemClass} onClick={stop}>
        <input type="radio" checked={Boolean(range)} onChange={() => onChange({ from: '', to: '' })} />
        <span>Από – Έως</span>
      </label>
      <div className="filterpop-range-inputs" style={{ padding: '2px 8px 6px' }} onClick={stop}>
        <input type="date" title="Από" value={range?.from ?? ''}
          onChange={(e) => onChange({ ...(range ?? {}), from: e.target.value })} />
        <input type="date" title="Έως" value={range?.to ?? ''}
          onChange={(e) => onChange({ ...(range ?? {}), to: e.target.value })} />
      </div>
      {/* 4. Παρελθόν */}
      {PAST_PRESETS.map(([d, l]) => (
        <label key={d} className={itemClass} onClick={stop}>
          <input type="radio" checked={value === d} onChange={() => onChange(d)} />
          <span>{l}</span>
        </label>
      ))}
      <label className={itemClass} onClick={stop}>
        <input type="radio" checked={Boolean(customPast) && value === Number(customPast)}
          onChange={() => customPast && onChange(Number(customPast))} />
        <span>Τελευταίες</span>
        <input type="number" min="1" className="filterpop-days" value={customPast}
          onChange={(e) => { setCustomPast(e.target.value); setCustomNext(''); onChange(e.target.value ? Number(e.target.value) : null) }} />
        <span>ημέρες</span>
      </label>
      {/* 5. Μέλλον */}
      {NEXT_PRESETS.map(([d, l]) => (
        <label key={d} className={itemClass} onClick={stop}>
          <input type="radio" checked={value === d} onChange={() => onChange(d)} />
          <span>{l}</span>
        </label>
      ))}
      <label className={itemClass} onClick={stop}>
        <input type="radio" checked={Boolean(customNext) && value === -Number(customNext)}
          onChange={() => customNext && onChange(-Number(customNext))} />
        <span>Επόμενες</span>
        <input type="number" min="1" className="filterpop-days" value={customNext}
          onChange={(e) => { setCustomNext(e.target.value); setCustomPast(''); onChange(e.target.value ? -Number(e.target.value) : null) }} />
        <span>ημέρες</span>
      </label>
    </>
  )
}

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
  const [sort, setSort] = useState(null)           // { key, dir: 1|-1 }
  const [openFilter, setOpenFilter] = useState(null)
  const [filterSearch, setFilterSearch] = useState('')
  const [filterPos, setFilterPos] = useState({ top: 0, left: 0 })
  const [hdrTooltip, setHdrTooltip] = useState(null) // { text, x, y } — fixed-position tooltip για headers
  const [page, setPage] = useState(0)
  const popRef = useRef(null)
  const PAGE_SIZE = 10

  // Δυναμικό ύψος πίνακα: απλώνεται μέχρι το κάτω όριο του viewport, ώστε η
  // οριζόντια scrollbar να είναι πάντα ορατή ΧΩΡΙΣ αναξιοποίητο κενό από κάτω.
  const wrapRef = useRef(null)
  const [maxH, setMaxH] = useState(null)
  useEffect(() => {
    const update = () => {
      if (!wrapRef.current) return
      const top = wrapRef.current.getBoundingClientRect().top
      setMaxH(Math.max(240, window.innerHeight - top - 42))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  })
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
      out = out.filter((r) => dateMatches(dv, r[key]))
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
    setColFilters({}); setTextFilters({}); setDateFilters({})
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
          <div className="tablewrap" ref={wrapRef} style={maxH ? { maxHeight: maxH } : undefined}>
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
                        <div className="th-inner"
                          onMouseEnter={col.tooltip ? (e) => {
                            const r = e.currentTarget.getBoundingClientRect()
                            setHdrTooltip({ text: col.tooltip, x: r.left + r.width / 2, y: r.top - 8 })
                          } : undefined}
                          onMouseLeave={col.tooltip ? () => setHdrTooltip(null) : undefined}
                        >
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

      {/* Header tooltip — fixed-position to escape table overflow clipping */}
      {hdrTooltip && (
        <div style={{
          position: 'fixed', zIndex: 9999, pointerEvents: 'none',
          left: hdrTooltip.x, top: hdrTooltip.y, transform: 'translate(-50%, -100%)',
          background: '#1c2230', color: '#fff', padding: '8px 12px', borderRadius: 7,
          fontSize: 12, fontWeight: 400, textTransform: 'none', letterSpacing: 0,
          whiteSpace: 'normal', width: 280, lineHeight: 1.5,
          boxShadow: '0 4px 16px rgba(0,0,0,.25)',
        }}>{hdrTooltip.text}</div>
      )}

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
            /* Date column: κοινές επιλογές περιόδου (ίδιες με τα Overviews) */
            <div className="filterpop-list">
              <DateFilterOptions key={openFilter} itemClass="filterpop-item"
                value={dateFilters[openFilter] ?? null}
                onChange={(v) => setDateFilters((p) => ({ ...p, [openFilter]: v }))} />
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
export function MultiPersonSelect({ options, value, onChange, disabled, tooltipMap }) {
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

  // Build label — if tooltipMap provided, wrap each name in a span with title
  const labelNode = selected.length === 0
    ? <span style={{ color: 'var(--ink-soft)' }}>Επιλογή…</span>
    : tooltipMap
      ? <span style={{ color: 'var(--ink)' }}>
          {selected.slice(0, 3).map((o, i) => (
            <span key={o.id} title={tooltipMap.get(o.id) || ''}
              style={{ cursor: tooltipMap.get(o.id) ? 'help' : 'default' }}>
              {o.name}{i < Math.min(selected.length, 3) - 1 ? ', ' : ''}
            </span>
          ))}
          {selected.length > 3 ? ` +${selected.length - 3}` : ''}
        </span>
      : <span style={{ color: 'var(--ink)' }}>
          {selected.length <= 2
            ? selected.map((o) => o.name).join(', ')
            : `${selected.slice(0, 2).map((o) => o.name).join(', ')} +${selected.length - 2}`}
        </span>

  return (
    <div className="mpselect" ref={ref}>
      <button type="button" className="mpselect-btn" disabled={disabled}
        onClick={() => setOpen((o) => !o)}>
        {labelNode}
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

// Dropdown φίλτρου ημερομηνίας για τα Overviews — ίδια λογική με τα date filters
// των grid (presets, Χ ημέρες, Από–Έως με ημερολόγιο).
// value: null | number (ημέρες πίσω) | { from, to }
export function DateFilter({ label, value, onChange, tooltip }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const active = dateActive(value)
  return (
    <div className="mfilter" ref={ref}>
      <button className="btn" title={tooltip} onClick={() => setOpen((o) => !o)}>
        {label}{active ? ' (1)' : ''} ▾
      </button>
      {open && (
        <div className="pop" style={{ minWidth: 250, maxHeight: 'none', overflow: 'visible' }}>
          {active && <label style={{ color: 'var(--accent)' }} onClick={() => onChange(null)}>Clear</label>}
          <DateFilterOptions key={open} value={value ?? null} onChange={onChange} />
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

// ── NoticeDialog: modal μήνυμα σφάλματος/προειδοποίησης με κουμπί OK ─
// Το OK δηλώνει ότι ο χρήστης έλαβε γνώση: κλείνει το μήνυμα και
// (α) σε WARNING επιτρέπει τη ροή να συνεχίσει (μέσω onOk),
// (β) σε ERROR επιστρέφει τον χρήστη στο σημείο της διορθωτικής ενέργειας.
// notice = { type: 'error' | 'warn', text: string, onOk?: () => void }
export function NoticeDialog({ notice, onClose }) {
  if (!notice?.text) return null
  const isErr = notice.type !== 'warn'
  const ok = () => { onClose(); notice.onOk?.() }
  return (
    <div className="overlay" onClick={ok}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ color: isErr ? 'var(--danger)' : '#8a6d1a', display: 'flex', alignItems: 'center', gap: 8 }}>
          {isErr ? '⛔ Σφάλμα' : '⚠️ Προειδοποίηση'}
        </h2>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-line' }}>{notice.text}</div>
        <div className="row">
          <button className="btn primary" onClick={ok} autoFocus>OK</button>
        </div>
      </div>
    </div>
  )
}

// ── Kanban drag-n-drop (HTML5 DnD, χωρίς βιβλιοθήκη) ─
// Όταν δίνεται onDrop(id, newStatus), οι κάρτες γίνονται draggable και οι
// στήλες δέχονται drop· ο γονιός αναλαμβάνει το (optimistic) status update.
const dragStart = (id, status) => (e) => {
  e.dataTransfer.setData('text/kanban-id', String(id))
  e.dataTransfer.setData('text/kanban-status', status ?? '')
  e.dataTransfer.effectAllowed = 'move'
  e.currentTarget.classList.add('dragging')
}
const dragEnd = (e) => e.currentTarget.classList.remove('dragging')
const colDropProps = (status, onDrop, setOver) => onDrop ? {
  onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(status) },
  onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver('') },
  onDrop: (e) => {
    e.preventDefault(); setOver('')
    const id = e.dataTransfer.getData('text/kanban-id')
    const from = e.dataTransfer.getData('text/kanban-status')
    if (id && from !== status) onDrop(id, status)
  },
} : {}

export function Kanban({ rows, onDrop }) {
  const nav = useNavigate()
  const [over, setOver] = useState('')
  return (
    <div className="kanban">
      {STATUSES.map((s) => (
        <div className={'kcol' + (over === s ? ' drag-over' : '')} key={s}
          {...colDropProps(s, onDrop, setOver)}>
          <h3 style={{ color: STATUS_COLOR[s] }}>{s} · {rows.filter((r) => r.status === s).length}</h3>
          {rows.filter((r) => r.status === s).map((r) => (
            <div className="kcard" key={r.id} onClick={() => nav(`/requests/${r.id}`)}
              draggable={!!onDrop}
              onDragStart={onDrop ? dragStart(r.id, r.status) : undefined}
              onDragEnd={onDrop ? dragEnd : undefined}>
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

export function ProjectsKanban({ rows, onDrop, allStatuses = [] }) {
  const nav = useNavigate()
  const [over, setOver] = useState('')
  const sof = (p) => p.status || 'No status'
  const statuses = useMemo(() => {
    // Με DnD θέλουμε και τις κενές στήλες-στόχους, γι' αυτό ενώνουμε με τα allStatuses.
    const present = [...new Set([...rows.map(sof), ...(onDrop ? allStatuses : [])])]
    const ordered = ['Not Started', 'In Progress', 'Waiting', 'On Hold', 'Deferred', 'Completed', 'No status']
    const known = ordered.filter((s) => present.includes(s))
    const extra = present.filter((s) => !ordered.includes(s))
    const all = [...known, ...extra]
    return all.length ? all : ['No status']
  }, [rows, onDrop, allStatuses])
  return (
    <div className="kanban">
      {statuses.map((s) => (
        <div className={'kcol' + (over === s ? ' drag-over' : '')} key={s}
          {...(s === 'No status' ? {} : colDropProps(s, onDrop, setOver))}>
          <h3>{s} · {rows.filter((r) => sof(r) === s).length}</h3>
          {rows.filter((r) => sof(r) === s).map((p) => (
            <div className="kcard" key={p.id} onClick={() => nav(`/projects/${p.id}`)}
              draggable={!!onDrop}
              onDragStart={onDrop ? dragStart(p.id, p.status) : undefined}
              onDragEnd={onDrop ? dragEnd : undefined}>
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

// ── Σχόλια list item (SharePoint REST — κοινά με το SharePoint UI) ────────────
// currentEmail: email του τρέχοντος χρήστη — διαγραφή μόνο των δικών του σχολίων.
export function CommentsPanel({ listName, itemId, currentEmail = '', canComment = true }) {
  const [comments, setComments] = useState(null)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const me = (currentEmail ?? '').toLowerCase()

  const load = () => getComments(listName, itemId)
    .then((c) => { setComments(c); setErr('') })
    .catch((e) => { setComments([]); setErr(e.message ?? 'Αποτυχία φόρτωσης σχολίων.') })

  useEffect(() => { if (itemId) load() }, [itemId])

  const post = async () => {
    const t = text.trim()
    if (!t) return
    setBusy(true); setErr('')
    try { await addComment(listName, itemId, t); setText(''); await load() }
    catch (e) { setErr(e.message ?? 'Αποτυχία προσθήκης σχολίου.') }
    setBusy(false)
  }

  const del = async (commentId) => {
    setBusy(true); setErr('')
    try { await deleteComment(listName, itemId, commentId); await load() }
    catch (e) { setErr(e.message ?? 'Αποτυχία διαγραφής σχολίου.') }
    setBusy(false)
  }

  return (
    <div className="attachbox">
      <h3>Σχόλια{comments ? ` (${comments.length})` : ''}</h3>
      {err && <div className="err">{err}</div>}
      {comments == null
        ? <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Φόρτωση…</div>
        : comments.length === 0
          ? <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 10 }}>Δεν υπάρχουν σχόλια.</div>
          : (
            <div className="comments">
              {comments.map((c) => (
                <div className="comment" key={c.id}>
                  <div className="comment-head">
                    <b>{c.author || '—'}</b>
                    <span className="mono" style={{ color: 'var(--ink-soft)', fontSize: 11.5 }}>{fmtDateTime(c.created_at)}</span>
                    {me && c.author_email === me && (
                      <button type="button" className="del" title="Διαγραφή σχολίου" disabled={busy} onClick={() => del(c.id)}>✕</button>
                    )}
                  </div>
                  <div className="comment-body">{c.text}</div>
                </div>
              ))}
            </div>
          )}
      {canComment && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
          <textarea
            value={text} rows={2} maxLength={1000} placeholder="Γράψτε σχόλιο…"
            style={{ flex: 1, resize: 'vertical' }}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) post() }}
          />
          <button type="button" className="btn sm primary" disabled={busy || !text.trim()} onClick={post}>
            {busy ? 'Εργασία…' : 'Αποστολή'}
          </button>
        </div>
      )}
    </div>
  )
}
