import { LISTS, listItems, getItem, createItem, updateItemFields, getItemVersions, getSiteUsers, getTitleMap } from './sp'
import { REQUEST_FIELDS, MANAGER_FIELDS, RESOURCE_FIELDS, toSP, fromSP } from './fields'

// Lookup-target lists for join resolution (display names in the site).
const PROJECTS_LIST = 'Projects'
const TAGS_LIST = 'Tags'

// ---------- reference lists ----------
let _usersP = null
function users() { return (_usersP ??= getSiteUsers().catch(() => new Map())) }
const emailOf = (u, personId) => (u.get(String(personId))?.email ?? '')

let _projectsP = null
function projectMap() { return (_projectsP ??= getTitleMap(PROJECTS_LIST).catch(() => new Map())) }
let _tagsP = null
function tagMap() { return (_tagsP ??= getTitleMap(TAGS_LIST).catch(() => new Map())) }

// Option lists for editable dropdowns (Owner/AssignedTo, Project, Tag).
export async function fetchUserOptions() {
  const u = await users()
  return [...u.entries()]
    .map(([id, v]) => ({ id: String(id), name: v.title, email: v.email }))
    .filter((o) => o.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}
export async function fetchProjectOptions() {
  const m = await projectMap()
  return [...m.entries()].map(([id, title]) => ({ id: String(id), title }))
    .filter((o) => o.title).sort((a, b) => a.title.localeCompare(b.title))
}
export async function fetchTagOptions() {
  const m = await tagMap()
  return [...m.entries()].map(([id, title]) => ({ id: String(id), title }))
    .filter((o) => o.title).sort((a, b) => a.title.localeCompare(b.title))
}

let _managersP = null
export function fetchManagers() {
  return (_managersP ??= Promise.all([listItems(LISTS.managers), users()]).then(([items, u]) =>
    items.map((i) => ({
      id: String(i.id),
      person_id: String(i.fields?.[MANAGER_FIELDS.person_id] ?? ''), // site user ID of the manager person
      name: i.fields?.[MANAGER_FIELDS.name] ?? '',                   // role title e.g. "COO"
      email: emailOf(u, i.fields?.[MANAGER_FIELDS.person_id]),
    }))))
}

let _resourcesP = null
export function fetchResources() {
  return (_resourcesP ??= Promise.all([listItems(LISTS.resources), users()]).then(([items, u]) =>
    items.map((i) => ({
      id: String(i.id),
      name: i.fields?.[RESOURCE_FIELDS.name] ?? '',
      email: emailOf(u, i.fields?.[RESOURCE_FIELDS.person_id]),
      is_manager: Number(i.fields?.[RESOURCE_FIELDS.is_manager]) === 1,
      is_implementor: Number(i.fields?.[RESOURCE_FIELDS.is_implementor]) === 1,
      is_superuser: Number(i.fields?.[RESOURCE_FIELDS.is_superuser]) === 1,
    }))))
}

// ---------- shaping ----------
async function shape(item) {
  const [, , u, projects, tags] =
    await Promise.all([fetchManagers(), fetchResources(), users(), projectMap(), tagMap()])
  const r = fromSP(item)

  // Supervisor (approver) now lives on the Project, not the Task.
  // approver_email is __none_ in REQUEST_FIELDS so r.approver_email === null.
  r.approver = null

  // AssignedTo (person) → name/email via the site users map.
  const who = u.get(String(r.assigned_to_id))
  r.assigned_to       = who?.title ?? null
  r.assigned_to_email = who?.email ?? ''
  // Keep the implementors shape the rest of the UI expects (single assignee).
  r.implementors = r.assigned_to_email
    ? [{ resource: { name: r.assigned_to, email: r.assigned_to_email, id: String(r.assigned_to_id) } }]
    : []

  r.project_name = projects.get(String(r.project_id)) ?? null
  r.tag_name     = tags.get(String(r.tag_id))         ?? null
  return r
}

export async function fetchRequests() {
  const items = await listItems(LISTS.requests)
  const rows = await Promise.all(items.map(shape))
  return rows.sort((a, b) =>
    (a.coo_prioritization - b.coo_prioritization) || (a.created_at < b.created_at ? 1 : -1))
}

export async function fetchRequest(id) {
  return shape(await getItem(LISTS.requests, id))
}

// History tab = SharePoint built-in versioning (spec §10): one entry per version.
export async function fetchHistory(id) {
  const versions = await getItemVersions(LISTS.requests, id)
  const statusCol = REQUEST_FIELDS.status
  return versions
    .sort((a, b) => Number(b.id) - Number(a.id))
    .map((v, idx, arr) => {
      const prev = arr[idx + 1]
      const statusChanged = prev && v.fields?.[statusCol] !== prev.fields?.[statusCol]
      return {
        id: v.id,
        action_type: idx === arr.length - 1 ? 'Create' : statusChanged ? v.fields?.[statusCol] : 'Update',
        detail: statusChanged
          ? `Status: ${prev.fields?.[statusCol] ?? '—'} → ${v.fields?.[statusCol]}`
          : idx === arr.length - 1 ? 'Request created' : `Version ${v.id}`,
        changed_by: v.lastModifiedBy?.user?.displayName ?? v.lastModifiedBy?.user?.email ?? '',
        created_at: v.lastModifiedDateTime,
      }
    })
}

// ---------- create / edit ----------
export async function createRequest(fields, profile) {
  const created = await createItem(LISTS.requests, toSP({
    ...fields,
    status: fields.status || 'Not Started',
  }))
  const refCol = REQUEST_FIELDS.reference_number
  if (refCol && !refCol.startsWith('__none_')) {
    const ref = `ITR-${new Date().toISOString().slice(0, 10)}-${String(created.id).padStart(6, '0')}`
    await updateItemFields(LISTS.requests, created.id, { [refCol]: ref })
  }
  return String(created.id)
}

export async function updateRequest(id, fields) {
  await updateItemFields(LISTS.requests, id, toSP(fields))
}
