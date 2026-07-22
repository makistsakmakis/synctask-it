import { getToken, getSpToken } from './auth'

const HOST = import.meta.env.VITE_SP_HOSTNAME            // inventorac.sharepoint.com
const SITE_PATH = import.meta.env.VITE_SP_SITE_PATH      // /sites/ProjectManagement/Development
export const LISTS = {
  requests: import.meta.env.VITE_LIST_REQUESTS || 'Requests',
  managers: import.meta.env.VITE_LIST_MANAGERS || 'Managers',
  resources: import.meta.env.VITE_LIST_RESOURCES || 'Resources',
  projects: import.meta.env.VITE_LIST_PROJECTS || 'Projects',
  tags: import.meta.env.VITE_LIST_TAGS || 'Tags',
}

const GRAPH = 'https://graph.microsoft.com/v1.0'

export async function g(path, { method = 'GET', body, headers } = {}) {
  const token = await getToken()
  const res = await fetch(`${GRAPH}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error?.message ?? `Graph error ${res.status}`)
  return data
}

let siteId = null
export async function getSiteId() {
  if (siteId) return siteId
  const site = await g(`/sites/${HOST}:${SITE_PATH}`)
  siteId = site.id
  return siteId
}

const listIds = {}
export async function getListId(name) {
  if (listIds[name]) return listIds[name]
  const sid = await getSiteId()
  const res = await g(`/sites/${sid}/lists/${encodeURIComponent(name)}`)
  listIds[name] = res.id
  return res.id
}

export async function listItems(listName, { expandCreatedBy = false } = {}) {
  const sid = await getSiteId()
  const lid = await getListId(listName)
  const sel = expandCreatedBy ? '?expand=fields&$top=500' : '?expand=fields&$top=999'
  let url = `/sites/${sid}/lists/${lid}/items${sel}`
  const out = []
  while (url) {
    const page = await g(url)
    out.push(...(page.value ?? []))
    url = page['@odata.nextLink'] ? page['@odata.nextLink'].replace(GRAPH, '') : null
  }
  return out
}

export async function getItem(listName, id) {
  const sid = await getSiteId()
  const lid = await getListId(listName)
  return g(`/sites/${sid}/lists/${lid}/items/${id}?expand=fields`)
}

export async function createItem(listName, fields) {
  const sid = await getSiteId()
  const lid = await getListId(listName)
  return g(`/sites/${sid}/lists/${lid}/items`, { method: 'POST', body: { fields } })
}

export async function updateItemFields(listName, id, fields) {
  const sid = await getSiteId()
  const lid = await getListId(listName)
  return g(`/sites/${sid}/lists/${lid}/items/${id}/fields`, { method: 'PATCH', body: fields })
}

export async function deleteItem(listName, id) {
  const sid = await getSiteId()
  const lid = await getListId(listName)
  return g(`/sites/${sid}/lists/${lid}/items/${id}`, { method: 'DELETE' })
}

export async function getItemVersions(listName, id) {
  const sid = await getSiteId()
  const lid = await getListId(listName)
  const res = await g(`/sites/${sid}/lists/${lid}/items/${id}/versions?expand=fields`)
  return res.value ?? []
}

export async function getListColumns(listName) {
  const sid = await getSiteId()
  const lid = await getListId(listName)
  const res = await g(`/sites/${sid}/lists/${lid}/columns`)
  return (res.value ?? []).filter((c) => !c.readOnly || c.name === 'Title')
}

// Resolve the site's User Information List into a map: lookupId -> {title, email}.
// Person/lookup columns on items come back only as "<Col>LookupId"; this map
// turns those ids into names/emails. Defensive: returns an empty map on failure
// so the rest of the app keeps working.
let _siteUsers = null
export function getSiteUsers() {
  return (_siteUsers ??= _loadSiteUsers())
}
// Candidate site paths from most specific to the site-collection root, e.g.
// /sites/ProjectManagement/Development -> [.../Development, /sites/ProjectManagement]
function parentSitePaths(p) {
  const segs = (p || '').split('/').filter(Boolean)
  const out = []
  for (let i = segs.length; i >= 2; i--) out.push('/' + segs.slice(0, i).join('/'))
  return out.length ? out : ['/']
}

const sitePathIds = {}
async function getSiteIdForPath(path) {
  if (sitePathIds[path]) return sitePathIds[path]
  const site = await g(`/sites/${HOST}:${path === '/' ? '' : path}`)
  sitePathIds[path] = site.id
  return site.id
}

async function _loadSiteUsers() {
  const map = new Map()
  const ingest = (items) => {
    for (const it of items) {
      const f = it.fields ?? {}
      map.set(String(it.id), {
        title: f.Title ?? f.Name ?? '',
        email: (f.EMail ?? f.Email ?? '').toLowerCase(),
      })
    }
  }
  // The User Information List lives at the SITE COLLECTION ROOT, not on a
  // subsite. Climb the path until we find a list with the userInformationList
  // template (or matching name), then read its items.
  for (const path of parentSitePaths(SITE_PATH)) {
    try {
      const sid = await getSiteIdForPath(path)
      const lists = await g(`/sites/${sid}/lists?$select=id,name,displayName,list,system&$top=500`)
      const uil = (lists.value ?? []).find(
        (l) => l.list?.template === 'userInformationList'
          || l.displayName === 'User Information List' || l.name === 'users')
      if (!uil) continue
      let url = `/sites/${sid}/lists/${uil.id}/items?expand=fields&$top=999`
      while (url) {
        const page = await g(url)
        ingest(page.value ?? [])
        url = page['@odata.nextLink'] ? page['@odata.nextLink'].replace(GRAPH, '') : null
      }
      if (map.size > 0) break
    } catch { /* try next parent path */ }
  }
  return map
}

// Detailed diagnostic for the /diag page — surfaces exactly what Graph returns
// so we can see why person resolution does or doesn't work.
export async function probeSiteUsers() {
  const out = { paths: [] }
  for (const path of parentSitePaths(SITE_PATH)) {
    const step = { path }
    try {
      const sid = await getSiteIdForPath(path)
      step.siteId = sid
      const lists = await g(`/sites/${sid}/lists?$select=id,name,displayName,list,system&$top=500`)
      step.totalLists = (lists.value ?? []).length
      const uil = (lists.value ?? []).find(
        (l) => l.list?.template === 'userInformationList'
          || l.displayName === 'User Information List' || l.name === 'users')
      step.candidate = uil ? { id: uil.id, name: uil.name, displayName: uil.displayName, template: uil.list?.template } : null
      if (uil) {
        try {
          const items = await g(`/sites/${sid}/lists/${uil.id}/items?expand=fields&$top=5`)
          step.itemCount = (items.value ?? []).length
          step.itemSample = (items.value ?? []).map((it) => ({ id: it.id, title: it.fields?.Title, email: it.fields?.EMail }))
        } catch (e) { step.itemError = e.message }
      }
    } catch (e) { step.error = e.message }
    out.paths.push(step)
    if (step.candidate && step.itemCount) break
  }
  return out
}

// Dump the raw `fields` of the first item of Projects and Tasks, so we can see
// exactly which keys hold status / person values in the LIST response.
export async function probeItemFields() {
  const sid = await getSiteId()
  const out = {}
  for (const [label, list] of [['Projects', LISTS.projects], ['Tasks', LISTS.requests]]) {
    try {
      const lid = await getListId(list)
      const res = await g(`/sites/${sid}/lists/${lid}/items?expand=fields&$top=1&$orderby=lastModifiedDateTime%20desc`)
      const it = (res.value ?? [])[0]
      out[label] = it ? { keys: Object.keys(it.fields ?? {}), fields: it.fields } : { empty: true }
    } catch (e) { out[label] = { error: e.message } }
  }
  return out
}

// Directly test writing and reading back Project_Icon on the most recent project.
export async function testIconWrite() {
  const sid = await getSiteId()
  const lid = await getListId(LISTS.projects)
  const res = await g(`/sites/${sid}/lists/${lid}/items?expand=fields&$top=1&$orderby=lastModifiedDateTime%20desc`)
  const item = (res.value ?? [])[0]
  if (!item) return { error: 'No projects found' }
  const itemId = item.id
  const testVal = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk'.repeat(40)
  try {
    await g(`/sites/${sid}/lists/${lid}/items/${itemId}/fields`, { method: 'PATCH', body: { Project_Icon: testVal } })
  } catch (e) { return { itemId, writeError: e.message } }
  const check = await g(`/sites/${sid}/lists/${lid}/items/${itemId}?expand=fields`)
  const readBack = check?.fields?.Project_Icon ?? null
  return {
    itemId,
    title: item.fields?.Title,
    written_length: testVal.length,
    readBack_length: readBack?.length ?? 0,
    readBack_start: readBack?.slice(0, 40) ?? '(null)',
    match: readBack === testVal,
  }
}

// Generic id -> Title map for a lookup target list (e.g. Projects, Tags).
export async function getTitleMap(listName) {
  const items = await listItems(listName)
  const m = new Map()
  for (const it of items) m.set(String(it.id), it.fields?.Title ?? '')
  return m
}

// ── List item attachments — SharePoint REST (το Graph δεν τα εκθέτει) ─────────
async function spFetch(path, { method = 'GET', body, headers } = {}) {
  const token = await getSpToken()
  const res = await fetch(`https://${HOST}${SITE_PATH}/_api${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json;odata=nometadata', ...headers },
    body,
  })
  if (!res.ok) {
    let msg = `SharePoint error ${res.status}`
    try {
      const d = await res.json()
      msg = d?.error?.message?.value ?? d?.['odata.error']?.message?.value ?? msg
    } catch { /* keep default */ }
    throw new Error(msg)
  }
  if (res.status === 204) return null
  return res.json().catch(() => null)
}

export async function getAttachments(listName, itemId) {
  const d = await spFetch(`/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${itemId})/AttachmentFiles`)
  return (d?.value ?? []).map((f) => ({ name: f.FileName, url: `https://${HOST}${f.ServerRelativeUrl}` }))
}

export async function addAttachment(listName, itemId, file) {
  const buf = await file.arrayBuffer()
  const safe = encodeURIComponent(file.name.replace(/'/g, ''))
  return spFetch(`/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${itemId})/AttachmentFiles/add(FileName='${safe}')`, { method: 'POST', body: buf })
}

export async function deleteAttachment(listName, itemId, fileName) {
  return spFetch(`/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${itemId})/AttachmentFiles/getByFileName('${encodeURIComponent(fileName)}')`, { method: 'POST', headers: { 'X-HTTP-Method': 'DELETE' } })
}

// ── List item comments — SharePoint REST (το Graph δεν τα εκθέτει) ────────────
// Τα σχόλια είναι κοινά με το SharePoint UI: ό,τι γράφεται εδώ φαίνεται
// και εκεί, και αντίστροφα.
export async function getComments(listName, itemId) {
  const d = await spFetch(
    `/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${itemId})/Comments?$top=100`)
  return (d?.value ?? []).map((c) => ({
    id: String(c.id),
    text: c.text ?? '',
    author: c.author?.name ?? '',
    author_email: (c.author?.email ?? '').toLowerCase(),
    created_at: c.createdDate,
  }))
}

export async function addComment(listName, itemId, text) {
  return spFetch(
    `/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${itemId})/Comments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;odata=nometadata' },
      body: JSON.stringify({ text }),
    })
}

export async function deleteComment(listName, itemId, commentId) {
  return spFetch(
    `/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${itemId})/Comments(${commentId})`,
    { method: 'POST', headers: { 'X-HTTP-Method': 'DELETE' } })
}
