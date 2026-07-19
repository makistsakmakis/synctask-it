import { LISTS, listItems, getItem, createItem, updateItemFields, deleteItem, getSiteUsers, getListColumns, getSiteId, getListId, g } from './sp'
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
  icon: 'Project_Icon',                   // multi-line text — base64 data URL of project icon
}

// Ensure Project_Icon column exists in SharePoint (auto-creates if missing). Cached per session.
let _iconColP = null
async function ensureIconColumn() {
  return (_iconColP ??= (async () => {
    const cols = await getListColumns(LISTS.projects)
    if (cols.some((c) => c.name === 'Project_Icon')) return true
    try {
      const sid = await getSiteId()
      const lid = await getListId(LISTS.projects)
      await g(`/sites/${sid}/lists/${lid}/columns`, {
        method: 'POST',
        body: { name: 'Project_Icon', displayName: 'Project Icon', text: { allowMultipleLines: true, linesForEditing: 10 } },
      })
      return true
    } catch { return false }
  })())
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
    notes:   f[F.notes]   ?? '',
    icon:    typeof f[F.icon] === 'string' && f[F.icon].startsWith('data:image/') ? f[F.icon] : '',
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
    if (!(k in fields)) continue
    let v = fields[k]
    if (v === '' || v == null) { if (k !== 'title') continue; v = '' }
    out[col] = (k === 'owner_id' || k === 'supervisor_id') ? Number(v) : v
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
  // Strip icon from the initial POST — Graph silently ignores unknown fields on item creation,
  // so we save the icon via a separate PATCH after the item exists.
  const sp = await toSP(fields)
  const icon = sp.Project_Icon
  delete sp.Project_Icon
  const created = await createItem(LISTS.projects, sp)
  if (icon) {
    const ready = await ensureIconColumn()
    if (ready) {
      await updateItemFields(LISTS.projects, String(created.id), { Project_Icon: icon }).catch(() => {})
    }
  }
  return String(created.id)
}

export async function updateProject(id, fields) {
  const sp = await toSP(fields)
  if ('Project_Icon' in sp) {
    const ready = await ensureIconColumn()
    if (!ready) {
      // Column doesn't exist and couldn't be auto-created — save project without icon and warn.
      delete sp.Project_Icon
      await updateItemFields(LISTS.projects, id, sp)
      throw new Error('Project saved, but the icon could not be stored. Please add a "Multiple lines of text" column named "Project Icon" to the Projects list in SharePoint, then try again.')
    }
  }
  await updateItemFields(LISTS.projects, id, sp)
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
