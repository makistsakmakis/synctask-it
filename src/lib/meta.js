// Status model = the real SharePoint "Tasks" choice values.
export const STATUSES = ['Not Started', 'In Progress', 'Waiting', 'Deferred', 'Completed']

export const STATUS_COLOR = {
  'Not Started': 'var(--st-planned)',
  'In Progress': 'var(--st-inprocess)',
  Waiting: 'var(--st-onhold)',
  Deferred: 'var(--st-cancelled)',
  Completed: 'var(--st-completed)',
}

// "Open" = anything not finished. Overdue/Assigned use real Tasks columns:
// DueDate (mapped to golive_required) and AssignedTo (mapped to assigned_to_id).
export const isOpen = (r) => r.status !== 'Completed'
export const isAssigned = (r) => isOpen(r) && r.assigned_to_id != null
export const isOverdue = (r) =>
  isOpen(r) && r.golive_required && new Date(r.golive_required) < new Date(new Date().toDateString())

export const QUICK_FILTERS = {
  Open: isOpen,
  'Not Started': (r) => r.status === 'Not Started',
  'In Progress': (r) => r.status === 'In Progress',
  Waiting: (r) => r.status === 'Waiting',
  Deferred: (r) => r.status === 'Deferred',
  Completed: (r) => r.status === 'Completed',
  Overdue: isOverdue,
  All: () => true,
}

// Minimal HTML sanitizer for SharePoint rich-text fields (Notes): strips
// script-capable elements, event handlers and javascript: URLs before render.
const BAD_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'LINK', 'META', 'BASE'])
export function sanitizeHtml(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const el of [...doc.body.querySelectorAll('*')]) {
    if (BAD_TAGS.has(el.tagName)) { el.remove(); continue }
    for (const a of [...el.attributes]) {
      const name = a.name.toLowerCase()
      if (name.startsWith('on') || ((name === 'href' || name === 'src')
        && a.value.trim().toLowerCase().startsWith('javascript:'))) el.removeAttribute(a.name)
    }
  }
  return doc.body.innerHTML
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : '—')
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB') : '—')

export function toCSV(rows) {
  const cols = ['title', 'status', 'priority', 'request_type', 'requestor_name',
    'golive_required', 'expected_start', 'actual_completion',
    'estimated_manhours', 'actual_manhours', 'percent_complete', 'product']
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`
  const lines = [cols.join(',')]
  for (const r of rows) {
    lines.push(cols.map((c) => esc(r[c])).join(','))
  }
  return lines.join('\n')
}

export function downloadCSV(rows, name = 'requests.csv') {
  const blob = new Blob([toCSV(rows)], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
