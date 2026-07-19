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

// ── RACI columns ───────────────────────────────────────────────────────────────
// Default fallback keys (Graph API multi-value lookup item key = internalName + 'LookupId')
const RACI_COLS_DEFAULT = {
  responsible_ids: 'ResponsibleLookupId',
  accountable_ids: 'AccountableLookupId',
  consulted_ids:   'ConsultedLookupId',
  informed_ids:    'InformedLookupId',
}

// Auto-detect actual RACI column Graph-item keys from the SharePoint list schema.
// Falls back to defaults if detection fails.
// Search terms are tried against both the displayName and the internal name (case-insensitive).
const RACI_SEARCH = {
  responsible_ids: ['responsible'],
  accountable_ids: ['accountable'],
  consulted_ids:   ['consulted'],
  informed_ids:    ['informed'],
}

let _raciColKeysP = null
function getRaciColKeys() {
  return (_raciColKeysP ??= getListColumns(LISTS.projects).then((cols) => {
    const result = { ...RACI_COLS_DEFAULT }
    for (const [key, terms] of Object.entries(RACI_SEARCH)) {
      const hit = cols.find((c) => {
        const dn = (c.displayName ?? '').toLowerCase()
        const cn = (c.name ?? '').toLowerCase()
        return terms.some((t) => dn.includes(t) || cn.includes(t))
      })
      if (hit) result[key] = hit.name + 'LookupId'
    }
    console.log('[RACI cols detected]', result)
    return result
  }).catch(() => ({ ...RACI_COLS_DEFAULT })))
}

// Build id→name map from the Resources list for RACI name resolution
async function getResourceMap() {
  const items = await listItems(LISTS.resources)
  const m = new Map()
  for (const i of items) m.set(String(i.id), i.fields?.Title ?? String(i.id))
  return m
}

// Resolve an array of numeric IDs to display names using the resource map
function resolveIds(val, map) {
  const ids = Array.isArray(val) ? val : []
  return ids.map((id) => map.get(String(id)) ?? String(id)).filter(Boolean)
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

const fromSP = (item, users, resMap = new Map(), raciKeys = RACI_COLS_DEFAULT) => {
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
      if (!raw) return ''
      const decoded = raw.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      const m = decoded.match(/^<div[^>]*class="ExternalClass[^"]*"[^>]*>([\s\S]*)<\/div>\s*$/i)
      return m ? m[1].trim() : decoded.trim()
    })(),
    icon:    (() => {
      const raw = typeof f[F.icon] === 'string' ? f[F.icon] : ''
      const decoded = raw.replace(/<[^>]*>/g, '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).trim()
      return decoded.startsWith('data:image/') ? decoded : ''
    })(),
    // RACI — IDs (for form state) and resolved names (for display)
    responsible_ids: (f[raciKeys.responsible_ids] ?? []).map(String),
    accountable_ids: (f[raciKeys.accountable_ids] ?? []).map(String),
    consulted_ids:   (f[raciKeys.consulted_ids]   ?? []).map(String),
    informed_ids:    (f[raciKeys.informed_ids]     ?? []).map(String),
    responsible: resolveIds(f[raciKeys.responsible_ids], resMap),
    accountable: resolveIds(f[raciKeys.accountable_ids], resMap),
    consulted:   resolveIds(f[raciKeys.consulted_ids],   resMap),
    informed:    resolveIds(f[raciKeys.informed_ids],     resMap),
    created_at:  item.createdDateTime,
    modified_at: item.lastModifiedDateTime,
    created_by:  item.createdBy?.user?.displayName  ?? '',
    modified_by: item.lastModifiedBy?.user?.displayName ?? '',
  }
}

async function toSP(fields) {
  const [raciKeys] = await Promise.all([getRaciColKeys()])
  const out = {}
  for (const [k, col] of Object.entries(F)) {
    if (k === 'status') continue
    if (!(k in fields)) continue
    let v = fields[k]
    if (v === '' || v == null) { if (k !== 'title') continue; v = '' }
    out[col] = (k === 'owner_id' || k === 'supervisor_id') ? Number(v) : v
  }
  // RACI multi-value lookup fields — use auto-detected column keys
  for (const [k, col] of Object.entries(raciKeys)) {
    if (!(k in fields)) continue
    const ids = (fields[k] ?? []).map(Number).filter(Boolean)
    out[col + '@odata.type'] = 'Collection(Edm.Int32)'
    out[col] = ids
  }
  if ('status' in fields && fields.status !== '' && fields.status != null) {
    out[await statusWriteCol()] = fields.status
  }
  return out
}

export async function fetchProjects() {
  const [items, users, resMap, raciKeys] = await Promise.all([
    listItems(LISTS.projects),
    getSiteUsers().catch(() => new Map()),
    getResourceMap().catch(() => new Map()),
    getRaciColKeys(),
  ])
  return items.map((i) => fromSP(i, users, resMap, raciKeys))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
}

export async function fetchProject(id) {
  const [item, users, resMap, raciKeys] = await Promise.all([
    getItem(LISTS.projects, id),
    getSiteUsers().catch(() => new Map()),
    getResourceMap().catch(() => new Map()),
    getRaciColKeys(),
  ])
  return fromSP(item, users, resMap, raciKeys)
}

export async function createProject(fields) {
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
  const projects = await fetchProjects()
  const set = [...new Set(projects.map((p) => p.status).filter(Boolean))]
  return set.length
    ? set
    : ['Waiting Manager Approval', 'Not Started', 'In Progress', 'Completed', 'On Hold', 'Deferred', 'Waiting on someone else']
}
