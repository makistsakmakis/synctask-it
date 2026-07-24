import { LISTS, listItems, getItem, createItem, updateItemFields, deleteItem, getSiteUsers, getListColumns } from './sp'
import { fetchRequests } from './api'

// app field  ->  SharePoint internal column (Projects list)
const F = {
  title: 'Title',
  owner_id: 'OwnerLookupId',     // person
  status: 'OData__Status',       // choice — READ name (Graph OData-escapes a leading underscore)
  start_date: 'Start_Date',
  end_date: 'End_Date',
  proposed_start: 'Proposed_Start',
  deadline: 'Deadline',
  product: 'Product',
  link: 'Link',
  notes: 'Notes',
}

// The status column's internal name differs between Graph READ (OData__Status)
// and WRITE (the true internal name, e.g. _Status). Resolve the write name from
// the live column list so we never guess.
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
  const ownerId = f[F.owner_id]
  return {
    id: String(item.id),
    title: f[F.title] ?? '',
    owner_id: ownerId != null ? String(ownerId) : '',
    owner: users.get(String(ownerId))?.title ?? '',
    status: f['OData__Status'] ?? f['_Status'] ?? f['OData_Status'] ?? f.Status ?? '',
    start_date: (f[F.start_date] ?? '').slice(0, 10),
    end_date: (f[F.end_date] ?? '').slice(0, 10),
    proposed_start: (f[F.proposed_start] ?? '').slice(0, 10),
    deadline: (f[F.deadline] ?? '').slice(0, 10),
    product: f[F.product] ?? '',
    link: (typeof f[F.link] === 'object' ? f[F.link]?.Url : f[F.link]) ?? '',
    notes: f[F.notes] ?? '',
    created_at: item.createdDateTime,
    modified_at: item.lastModifiedDateTime,
    created_by: item.createdBy?.user?.displayName ?? '',
    modified_by: item.lastModifiedBy?.user?.displayName ?? '',
  }
}

async function toSP(fields) {
  const out = {}
  for (const [k, col] of Object.entries(F)) {
    if (k === 'status') continue                 // handled separately (write-name differs)
    if (!(k in fields)) continue
    let v = fields[k]
    if (v === '' || v == null) { if (k !== 'title') continue; v = '' }
    if (k === 'link') {
      if (v) {
        const url = /^https?:\/\//i.test(v) ? v : `https://${v}`
        out[col] = { Url: url, Description: url }
      }
      continue
    }
    out[col] = k === 'owner_id' ? Number(v) : v
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

// 1-to-many: the tasks whose Project lookup points at this project.
export async function fetchProjectTasks(projectId) {
  const all = await fetchRequests()
  return all.filter((r) => String(r.project_id) === String(projectId))
}

// Distinct existing project statuses, so the form offers real choices.
export async function fetchProjectStatuses() {
  const projects = await fetchProjects()
  const set = [...new Set(projects.map((p) => p.status).filter(Boolean))]
  return set.length ? set : ['Not Started', 'In Progress', 'Completed', 'On Hold']
}
