import { LISTS, listItems, getItem, createItem, updateItemFields, deleteItem, getSiteUsers, getListColumns } from './sp'
import { fetchRequests } from './api'

// app field -> SharePoint internal column (Projects list)
const F = {
  title: 'Title',
  owner_id: 'OwnerLookupId',
  supervisor_id: 'Supervisor_IDLookupId',
  status: 'OData__Status',
  start_date: 'Start_Date',
  end_date: 'End_Date',
  proposed_start: 'Proposed_Start',
  deadline: 'Deadline',
  product: 'Product',
  link: 'Link',
  notes: 'Notes',
  icon: 'Project_Icon',
}

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
    owner_id:    ownerId      != null ? String(ownerId)      : '',
    owner:       ownerUser?.title ?? '',
    owner_email: (ownerUser?.email ?? '').toLowerCase(),
    supervisor_id:    supervisorId != null ? String(supervisorId) : '',
    supervisor:       supervisorUser?.title ?? '',
    supervisor_email: (supervisorUser?.email ?? '').toLowerCase(),
    status:         f['OData__Status'] ?? f['_Status'] ?? f['OData_Status'] ?? f.Status ?? '',
    start_date:     (f[F.start_date]    ?? '').slice(0, 10),
    end_date:       (f[F.end_date]      ?? '').slice(0, 10),
    proposed_start: (f[F.proposed_start] ?? '').slice(0, 10),
    deadline:       (f[F.deadline]      ?? '').slice(0, 10),
    product: f[F.product] ?? '',
    link:    f[F.link]    ?? '',
    notes:   (() => {
      const raw = typeof f[F.notes] === 'string' ? f[F.notes] : ''
      return raw.replace(/<[^>]*>/g, '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).trim()
    })(),
    icon:    (() => {
      const raw = typeof f[F.icon] === 'string' ? f[F.icon] : ''
      const decoded = raw.replace(/<[^>]*>/g, '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).trim()
      return decoded.startsWith('data:image/') ? decoded : ''
    })(),
    created_at:  item.createdDateTime,
    modified_at: item.lastModifiedDateTime,
    created_by:  item.createdBy?.user?.displayName  ?? '',
    modified_by: item.lastModifiedBy?.user?.displayName ?? '',
  }
}

async function toSP(fields) {
  const out = {}
  for (const [k, col] of Object.entries(F)) {
    if (k === 'status') continue
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
  // Create without icon first (Graph POST may ignore unknown/new fields),
  // then PATCH the icon separately to guarantee it's written.
  const sp = await toSP(fields)
  const icon = sp[F.icon]
  delete sp[F.icon]
  const created = await createItem(LISTS.projects, sp)
  if (icon) {
    await updateItemFields(LISTS.projects, String(created.id), { [F.icon]: icon })
  }
  return String(created.id)
}

export async function updateProject(id, fields) {
  await updateItemFields(LISTS.projects, id, await toSP(fields))
}

export async function removeProject(id) {
  await deleteItem(LISTS.projects, id)
}

export async function fetchProjectTasks(projectId) {
  const all = await fetchRequests()
  return all.filter((r) => String(r.project_id) === String(projectId))
}

export async function fetchProjectStatuses() {
  try {
    const cols = await getListColumns(LISTS.projects)
    const statusCol = cols.find((c) => c.name === '_Status' || c.name === 'OData__Status')
    if (statusCol?.choice?.choices?.length) return statusCol.choice.choices
  } catch {}
  // fallback: derive from existing project data
  const projects = await fetchProjects()
  const set = [...new Set(projects.map((p) => p.status).filter(Boolean))]
  return set.length
    ? set
    : ['Waiting Manager Approval', 'Not Started', 'In Progress', 'Completed', 'On Hold', 'Deferred', 'Waiting on someone else']
}
