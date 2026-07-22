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
  on_going: 'ON_GOING', // Yes/No — projects-κουβάδες χωρίς πρακτικό deadline (admin-only edit)
}

// ── RACI columns ───────────────────────────────────────────────────────────────
// Graph API returns multi-value lookups as:
//   READ  → f['Responsible'] = [{LookupId: 4, LookupValue: "CFO"}, ...]  (base name, array of objects)
//   WRITE → { 'ResponsibleLookupId@odata.type': 'Collection(Edm.Int32)', 'ResponsibleLookupId': [4, 3] }
//
// RACI_COLS_DEFAULT stores the BASE internal column name (no 'LookupId' suffix).
// Write key = base name + 'LookupId'.
const RACI_COLS_DEFAULT = {
  responsible_ids: 'Responsible',
  accountable_ids: 'Accountable',
  consulted_ids:   'Consulted',
  informed_ids:    'Informed',
}

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
      if (hit) result[key] = hit.name  // base name only; 'LookupId' appended on write
    }
    console.log('[RACI cols detected]', result)
    return result
  }).catch(() => ({ ...RACI_COLS_DEFAULT })))
}

// Build id→{name, abbr} map from the Resources list for RACI resolution
// (abbr = 'Abbreviation' column, max 5 chars — used only by the Projects grid)
async function getResourceMap() {
  const items = await listItems(LISTS.resources)
  const m = new Map()
  for (const i of items) m.set(String(i.id), {
    name: i.fields?.Title ?? String(i.id),
    abbr: (i.fields?.Abbreviation ?? '').trim(),
  })
  return m
}

// Resolve an array of numeric IDs to display names using the resource map
function resolveIds(val, map) {
  const ids = Array.isArray(val) ? val : []
  return ids.map((id) => map.get(String(id))?.name ?? String(id)).filter(Boolean)
}

// Resolve a multi-value lookup to Abbreviations (fallback: full name)
function resolveAbbrs(val, map) {
  const arr = Array.isArray(val) ? val : []
  return arr.map((x) => {
    const r = map.get(String(x?.LookupId ?? x))
    return r?.abbr || r?.name || x?.LookupValue || ''
  }).filter(Boolean)
}

// ── Signed On / Signed By (διαδικασία υπογραφής) ─
// Τα internal names εντοπίζονται στο runtime (π.χ. 'Signed_x0020_On',
// 'SignedOn', 'Signed_On'). Αν το Signed By είναι Person column, διαβάζεται/
// γράφεται μέσω <name>LookupId, αλλιώς ως απλό κείμενο.
const SIGNED_DEFAULT = { on: 'SignedOn', by: 'SignedBy', byIsPerson: false }
let _signedColsP = null
function getSignedCols() {
  return (_signedColsP ??= getListColumns(LISTS.projects).then((cols) => {
    const squash = (s) => (s ?? '').toLowerCase().replace(/_x0020_/g, '').replace(/[_\s]/g, '')
    const find = (term) => cols.find((c) => squash(c.displayName) === term || squash(c.name) === term)
      || cols.find((c) => squash(c.name).includes(term) || squash(c.displayName).includes(term))
    const on = find('signedon')
    const by = find('signedby')
    const r = {
      on: on?.name ?? SIGNED_DEFAULT.on,
      by: by?.name ?? SIGNED_DEFAULT.by,
      byIsPerson: Boolean(by?.personOrGroup),
    }
    console.log('[Signed cols detected]', r)
    return r
  }).catch(() => ({ ...SIGNED_DEFAULT })))
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

const fromSP = (item, users, resMap = new Map(), raciKeys = RACI_COLS_DEFAULT, signedCols = SIGNED_DEFAULT) => {
  const f = item.fields ?? {}
  const signedById = signedCols.byIsPerson ? f[signedCols.by + 'LookupId'] : null
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
    on_going: Boolean(f[F.on_going]),
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
    // RACI — multi-value lookup: [{LookupId: N, LookupValue: "Name"}, ...]
    // IDs used for form state (write), LookupValue used for display
    responsible_ids: (f[raciKeys.responsible_ids] ?? []).map((x) => String(x?.LookupId ?? x)).filter(Boolean),
    accountable_ids: (f[raciKeys.accountable_ids] ?? []).map((x) => String(x?.LookupId ?? x)).filter(Boolean),
    consulted_ids:   (f[raciKeys.consulted_ids]   ?? []).map((x) => String(x?.LookupId ?? x)).filter(Boolean),
    informed_ids:    (f[raciKeys.informed_ids]     ?? []).map((x) => String(x?.LookupId ?? x)).filter(Boolean),
    responsible: (f[raciKeys.responsible_ids] ?? []).map((x) => x?.LookupValue ?? resMap.get(String(x?.LookupId ?? x))?.name ?? '').filter(Boolean),
    accountable: (f[raciKeys.accountable_ids] ?? []).map((x) => x?.LookupValue ?? resMap.get(String(x?.LookupId ?? x))?.name ?? '').filter(Boolean),
    consulted:   (f[raciKeys.consulted_ids]   ?? []).map((x) => x?.LookupValue ?? resMap.get(String(x?.LookupId ?? x))?.name ?? '').filter(Boolean),
    informed:    (f[raciKeys.informed_ids]     ?? []).map((x) => x?.LookupValue ?? resMap.get(String(x?.LookupId ?? x))?.name ?? '').filter(Boolean),
    // RACI abbreviations (Projects grid only) — from Resources 'Abbreviation' column
    responsible_abbr: resolveAbbrs(f[raciKeys.responsible_ids], resMap),
    accountable_abbr: resolveAbbrs(f[raciKeys.accountable_ids], resMap),
    consulted_abbr:   resolveAbbrs(f[raciKeys.consulted_ids],   resMap),
    informed_abbr:    resolveAbbrs(f[raciKeys.informed_ids],     resMap),
    // Υπογραφή — signed_on κενό σημαίνει ανυπόγραφο
    signed_on: f[signedCols.on] ?? '',
    signed_by: signedCols.byIsPerson
      ? (users.get(String(signedById))?.title ?? '')
      : (f[signedCols.by] ?? ''),
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
    out[col] = (k === 'owner_id' || k === 'supervisor_id') ? Number(v)
      : k === 'on_going' ? Boolean(v) : v
  }
  // RACI multi-value lookup fields — write key = base name + 'LookupId'
  for (const [k, baseCol] of Object.entries(raciKeys)) {
    if (!(k in fields)) continue
    const ids = (fields[k] ?? []).map(Number).filter(Boolean)
    const writeCol = baseCol + 'LookupId'
    out[writeCol + '@odata.type'] = 'Collection(Edm.Int32)'
    out[writeCol] = ids
  }
  if ('status' in fields && fields.status !== '' && fields.status != null) {
    out[await statusWriteCol()] = fields.status
  }
  return out
}

export async function fetchProjects() {
  const [items, users, resMap, raciKeys, signedCols] = await Promise.all([
    listItems(LISTS.projects),
    getSiteUsers().catch(() => new Map()),
    getResourceMap().catch(() => new Map()),
    getRaciColKeys(),
    getSignedCols(),
  ])
  return items.map((i) => fromSP(i, users, resMap, raciKeys, signedCols))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
}

export async function fetchProject(id) {
  const [item, users, resMap, raciKeys, signedCols] = await Promise.all([
    getItem(LISTS.projects, id),
    getSiteUsers().catch(() => new Map()),
    getResourceMap().catch(() => new Map()),
    getRaciColKeys(),
    getSignedCols(),
  ])
  return fromSP(item, users, resMap, raciKeys, signedCols)
}

// Υπογραφή project: Signed On = τώρα, Signed By = τρέχων χρήστης,
// status = 'Not Started', συν προαιρετικά RACI defaults (extraFields).
export async function signProject(id, { userLookupId, userName = '', extraFields = {} }) {
  const sc = await getSignedCols()
  const out = await toSP({ status: 'Not Started', ...extraFields })
  out[sc.on] = new Date().toISOString()
  if (sc.byIsPerson && userLookupId) out[sc.by + 'LookupId'] = Number(userLookupId)
  else out[sc.by] = userName
  await updateItemFields(LISTS.projects, id, out)
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
