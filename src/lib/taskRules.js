// ============================================================
// Task Status Rules — κοινοί κανόνες για ΚΑΘΕ σημείο αλλαγής
// status (RequestForm & Tasks Kanban drag-n-drop).
// ------------------------------------------------------------
// 1. Not Started: default για νέο task (γίνεται ήδη σε form/createRequest).
// 2. In Progress (on save):
//    - unassigned            -> ERROR, μπλοκάρει την αποθήκευση
//    - Actual Start κενό     -> auto = σήμερα
//    - Estimated man-hours ή Due date κενά -> WARNING, η αποθήκευση προχωράει
// 3. Completed (on save):
//    - unassigned            -> ERROR, μπλοκάρει την αποθήκευση
//    - Actual Start κενό     -> auto = σήμερα
//    - Actual End κενό       -> auto = σήμερα
//    - Estimated man-hours ή Billed hours κενά -> WARNING, η αποθήκευση προχωράει
// 4. Deferred            -> κανόνες του 2.
// 5. Waiting (on someone else) -> κανόνες του 2.
// ============================================================

const todayISO = () => new Date().toISOString().slice(0, 10)
const isEmpty = (v) => v == null || v === ''

// Statuses που ακολουθούν τους κανόνες του "In Progress"
const inProgressLike = (s) => s === 'In Progress' || s === 'Deferred' || /^waiting/i.test(s || '')

/**
 * Εφαρμόζει τους κανόνες πάνω στο task ΟΠΩΣ θα αποθηκευτεί (με το νέο status).
 * Πεδία που διαβάζονται: status, assigned_to_id, expected_start (Actual Start),
 * actual_completion (Actual End), estimated_manhours, actual_manhours (Billed),
 * golive_required (Due date).
 * @returns {{ error: string, patch: object, warnings: string[] }}
 *  - error: αν δεν είναι κενό, η αλλαγή ΔΕΝ πρέπει να αποθηκευτεί
 *  - patch: αυτόματες συμπληρώσεις πεδίων (πρέπει να συμπεριληφθούν στο save)
 *  - warnings: μη μπλοκαρίστικες προειδοποιήσεις προς τον χρήστη
 */
export function applyTaskStatusRules(task) {
  const s = task.status || ''
  const patch = {}
  const warnings = []

  if (!inProgressLike(s) && s !== 'Completed') return { error: '', patch, warnings }

  if (isEmpty(task.assigned_to_id)) {
    return {
      error: `Το task είναι Unassigned — δεν επιτρέπεται η αλλαγή σε "${s}". Ορίστε πρώτα "Assigned to".`,
      patch, warnings,
    }
  }

  if (isEmpty(task.expected_start)) patch.expected_start = todayISO()

  if (s === 'Completed') {
    if (isEmpty(task.actual_completion)) patch.actual_completion = todayISO()
    if (isEmpty(task.estimated_manhours)) warnings.push('Τα Estimated man-hours είναι κενά.')
    if (isEmpty(task.actual_manhours)) warnings.push('Τα Billed hours είναι κενά.')
  } else {
    if (isEmpty(task.estimated_manhours)) warnings.push('Τα Estimated man-hours είναι κενά.')
    if (isEmpty(task.golive_required)) warnings.push('Το Due date είναι κενό.')
  }

  return { error: '', patch, warnings }
}
