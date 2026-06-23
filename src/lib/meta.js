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
