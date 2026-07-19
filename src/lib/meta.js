// Status model = the real SharePoint "Tasks" choice values.
export const STATUSES = ['Not Started', 'In Progress', 'Waiting', 'Deferred', 'Completed']

export const STATUS_COLOR = {
  // Task statuses
  'Not Started': 'var(--st-planned)',
  'In Progress': 'var(--st-inprocess)',
  Waiting: 'var(--st-onhold)',
  Deferred: 'var(--st-cancelled)',
  Completed: 'var(--st-completed)',
  // Project statuses
  'Waiting Manager Approval': 'var(--st-onhold)',
  'Waiting on someone else': 'var(--st-onhold)',
  'On Hold': 'var(--st-cancelled)',
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

// Export visible rows to .xlsx (SheetJS). columns = DataGrid column defs.
export async function exportXLSX(headers, data, filename = 'export.xlsx') {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  XLSX.writeFile(wb, filename)
}
