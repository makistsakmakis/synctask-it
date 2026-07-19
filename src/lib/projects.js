import { LISTS, listItems, getItem, createItem, updateItemFields, deleteItem, getSiteUsers, getListColumns } from './sp'
import { fetchRequests } from './api'

// app field -> SharePoint internal column (Projects list)
const F = {
  title: 'Title',
  owner_id: 'OwnerLookupId',              // person — project owner (requestor / "αιτών")
  supervisor_id: 'Supervisor_IDLookupId', // person — supervisor/approver (manager who signs off)
  status: 'OData__Status',               // choice — READ name (Graph OData-escapes leading underscore)
  start_date: 'Start_Date',
  end_date: 'End_Date',
  proposed_start: 'Proposed_Start',
  deadline: 'Deadline',
  product: 'Product',
  link: 'Link',
  notes: 'Notes',
  // icon is embedded inside the Notes column — see parseNotes / serializeNotes
}

// The icon is stored at the end of the Notes field separated by this sentinel.
// Using a string that will never appear in normal user text.
const ICON_SEP = '[[[SYNCFLOW_ICON]]]'

function parseNotes(raw) {
  const s = typeof raw === 'string' ? raw : ''
  const idx = s.indexOf(ICON_SEP)
  if (idx === -1) return { notes: s, icon: '' }
  const icon = s.slice(idx + ICON_SEP.length)
  return {
    notes: s.slice(0, idx),
    icon: icon.startsWith('data:image/') ? icon : '',
  }
}

function serializeNotes(notes, icon) {
  const n = typeof notes === 'string' ? notes : ''
  const i = typeof icon === 'string' && icon.startsWith('data:image/') ? icon : ''
  return i ? n + ICON_SEP + i : n
}

// Status write-name resolver — Graph reads as OData__Status but writes need the real internal name.
let _statusWriteColP = null
function statusWriteCol() {
  return (_statusWriteColP ??= getListColumns(LISTS.projects)
    .then((cols) => {
      const hit = cols.find((c) => c.name === '_Status')
        || cols.find((c) => c.name === 'OData__Status')
        || cols.find((c) => (c.displayName || '').toLowerCase() === 'status')
      return hit?.name || '_Status'
    })
    .catch(() => '_Status'))
}

const fromSP = (item, users) => {
  const f = item.fields ?? {}
  const ownerId      = f[F.owner_id]
  const supervisorId = f[F.supervisor_id]
  const ownerUser      = users.get(String(ownerId))
  const supervisorUser = users.get(String(supervisorId))
  const { notes, icon } = parseNotes(f[F.notes])
  return {
    id: String(item.id),
    title: f[F.title] ?? '',
    // Owner
    owner_id:    ownerId      != null ? String(ownerId)      : '',
    owner:       ownerUser?.title ?? '',
    owner_email: (ownerUser?.email ?? '').toLowerCase(),
    // Supervisor (approver)
    supervisor_id:    supervisorId != null ? String(supervisorId) : '',
    supervisor:       supervisorUser?.title ?? '',
    supervisor_email: (supervisorUser?.email ?? '').toLowerCase(),
    // Status & dates
    status:         f['OData__Status'] ?? f['_Status'] ?? f['OData_Status'] ?? f.Status ?? '',
    start_date:     (f[F.start_date]    ?? '').slice(0, 10),
    end_date:       (f[F.end_date]      ?? '').slice(0, 10),
    proposed_start: (f[F.proposed_start] ?? '').slice(0, 10),
    deadline:       (f[F.deadline]      ?? '').slice(0, 10),
    product: f[F.product] ?? '',
    link:    f[F.link]    ?? '',
    notes,
    icon,
    created_at:  item.createdDateTime,
    modified_at: item.lastModifiedDateTime,
    created_by:  item.createdBy?.user?.displayName  ?? '',
    modified_by: item.lastModifiedBy?.user?.displayName ?? '',
  }
}

async function toSP(fields) {
  const out = {}
  for (const [k, col] of Object.entries(F)) {
    if (k === 'status') continue // handled separately (write-name differs)
    if (k === 'notes')  continue // handled separately (combined with icon below)
    if (!(k in fields)) continue
    let v = fields[k]
    if (v === '' || v == null) { if (k !== 'title') continue; v = '' }
    out[col] = (k === 'owner_id' || k === 'supervisor_id') ? Number(v) : v
  }
  // Notes and icon are stored together in the Notes column
  if ('notes' in fields || 'icon' in fields) {
    out[F.notes] = serializeNotes(fields.notes ?? '', fields.icon ?? '')
  }
  if ('status' in fields && fields.status !== '' && fields.status != null) {
    out[await statusWriteCol()] = fields.status
  }
  return out
}

export async function fetchProjects() {
  const [items, users] = await Promise.all([listItems(LISTS.projects), getSiteUsers().catch(() => new Map())])
  return items.map((i) => fromSP(i, users))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
}

export async function fetchProject(id) {
  const [item, users] = await Promise.all([getItem(LISTS.projects, id), getSiteUsers().catch(() => new Map())])
  return fromSP(item, users)
}

export async function createProject(fields) {
  const created = await createItem(LISTS.projects, await toSP(fields))
  return String(created.id)
}

export async function updateProject(id, fields) {
  await updateItemFields(LISTS.projects, id, await toSP(fields))
}

export async function removeProject(id) {
  await deleteItem(LISTS.projects, id)
}

// 1-to-many: tasks whose Project lookup points at this project.
export async function fetchProjectTasks(projectId) {
  const all = await fetchRequests()
  return all.filter((r) => String(r.project_id) === String(projectId))
}

// Distinct existing project statuses for the form dropdown.
export async function fetchProjectStatuses() {
  const projects = await fetchProjects()
  const set = [...new Set(projects.map((p) => p.status).filter(Boolean))]
  return set.length
    ? set
    : ['Waiting Manager Approval', 'Not Started', 'In Progress', 'Completed', 'On Hold', 'Deferred']
}
