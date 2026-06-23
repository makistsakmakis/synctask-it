// ============================================================
// SharePoint column mapping — app field  ->  real internal name
// ------------------------------------------------------------
// Target list: "Tasks" (shared with the PowerApps app
// "Inventor Project Tasks Lite v4"). Column internal names below
// were read from the PowerApps export schema. Choice columns
// (Status, Priority, Task_Type) come back from Graph as plain
// strings. Person/lookup columns (AssignedTo, Project, Tag) need
// special handling and are wired in a later pass — verify their
// exact Graph names at /diag first.
// ============================================================

export const REQUEST_FIELDS = {
  // --- confident, plain columns ---
  title: 'Title',                  // text  (display: "Task Name")
  status: 'Status',                // choice -> string
  priority: 'Priority',            // choice -> string
  request_type: 'Task_Type',       // choice -> string
  expected_start: 'StartDate',     // date
  golive_required: 'DueDate',      // date  (nearest "required by")
  actual_completion: 'Actual_x0020_End', // date
  estimated_manhours: 'Budget_Hours',    // number
  actual_manhours: 'Billed_Hours',       // number
  percent_complete: 'PercentComplete',   // number
  product: 'Product',              // text
  requestor_notes: 'Body',         // text  (display: "Description")
  implementor_notes: 'Notes',      // html
  approver_email: 'Supervisor_ID', // text column reused to store approver (manager name)

  // --- person / lookup: resolved in Phase 2 (names confirmed at /diag) ---
  assigned_to_id: 'AssignedToLookupId',  // person  (verify)
  project_id: 'ProjectLookupId',         // lookup  (verify)
  tag_id: 'TagLookupId',                 // lookup  (verify)

  // --- SyncTask concepts with NO column in Tasks yet ---
  // Kept so the UI never references an undefined key; they read as
  // null until/unless matching SharePoint columns are added.
  reference_number: '__none_reference_number',
  implementors: '__none_implementors',
  manager_approval_date: '__none_manager_approval_date',
  assigned_date: '__none_assigned_date',
  actual_start: '__none_actual_start',
  expected_completion: '__none_expected_completion',
  cancelled_date: '__none_cancelled_date',
  onhold_date: '__none_onhold_date',
  coo_prioritization: '__none_coo_prioritization',
  management_notes: '__none_management_notes',
  coo_notes: '__none_coo_notes',
  resolution_summary: '__none_resolution_summary',
}

// Managers list: Title + Manager(person). Resources list: Title +
// Resource(person) + Is_Manager / Is_Implementor / Is_SuperUser flags.
// Person-field email resolution is Phase 2.
export const MANAGER_FIELDS = { name: 'Title', person_id: 'ManagerLookupId' }
export const RESOURCE_FIELDS = {
  name: 'Title',
  person_id: 'ResourceLookupId',
  is_manager: 'Is_Manager',
  is_implementor: 'Is_Implementor',
  is_superuser: 'Is_SuperUser',
}

export const DATE_FIELDS = new Set([
  'golive_required', 'manager_approval_date', 'assigned_date', 'expected_start',
  'actual_start', 'expected_completion', 'actual_completion', 'cancelled_date', 'onhold_date',
])
export const NUMBER_FIELDS = new Set([
  'estimated_manhours', 'actual_manhours', 'coo_prioritization', 'percent_complete',
])

export const toSP = (appFields) => {
  const out = {}
  for (const [k, v] of Object.entries(appFields)) {
    const col = REQUEST_FIELDS[k]
    if (!col || col.startsWith('__none_')) continue  // never write phantom columns
    if (col.endsWith('LookupId')) {
      out[col] = v === '' || v == null ? null : Number(v)
    } else {
      out[col] = v === '' ? null : v
    }
  }
  return out
}

export const fromSP = (item) => {
  const f = item.fields ?? {}
  const r = { id: String(item.id) }
  for (const [k, col] of Object.entries(REQUEST_FIELDS)) {
    r[k] = col.startsWith('__none_') ? null : (f[col] ?? null)
  }
  if (r.coo_prioritization == null) r.coo_prioritization = 99999999
  r.requestor_name = item.createdBy?.user?.displayName ?? ''
  r.requestor_email = item.createdBy?.user?.email ?? ''
  r.created_by = item.createdBy?.user?.displayName ?? ''
  r.modified_by = item.lastModifiedBy?.user?.displayName ?? ''
  r.request_date = (item.createdDateTime ?? '').slice(0, 10)
  r.created_at = item.createdDateTime
  r.modified_at = item.lastModifiedDateTime
  return r
}
