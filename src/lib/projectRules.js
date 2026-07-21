// ============================================================
// Project Status Rules — κοινοί κανόνες για ΚΑΘΕ σημείο αλλαγής
// status (ProjectForm & Projects Kanban drag-n-drop).
// ------------------------------------------------------------
// 1. Waiting Manager Approval: default για νέο project. Supervisor
//    υποχρεωτικός. Με το save δημιουργείται mailto στον Supervisor
//    (γίνεται στη φόρμα).
// 2. Not Started: μπαίνει ΜΟΝΟ μέσω της διαδικασίας υπογραφής
//    (signProject). Χωρίς υπογραφή, save σε Not Started = ERROR.
// 3. In Progress: μόνο από Not Started / Deferred / Waiting on someone
//    else. Όλα τα RACI συμπληρωμένα (RACI = admin-only). Actual Start
//    κενό -> auto σήμερα.
// 4. Completed: μόνο από In Progress / Deferred / Waiting on someone
//    else. Αν υπάρχουν pending tasks -> επιβεβαίωση χρήστη (async,
//    γίνεται από τον caller μέσω needsPendingTasksConfirm). End Date
//    κενό -> auto σήμερα.
// 5. Deferred: μόνο από In Progress / Waiting on someone else.
// 6. Waiting on someone else: μόνο από In Progress / Deferred.
// ============================================================

const todayISO = () => new Date().toISOString().slice(0, 10)
const norm = (s) => (s || '').trim()
// "Waiting on someone else" (ή σκέτο "Waiting") — ΟΧΙ το "Waiting Manager Approval"
const isWaitingSomeone = (s) => /^waiting/i.test(norm(s)) && !/approval/i.test(norm(s))
const RACI_KEYS = ['responsible_ids', 'accountable_ids', 'consulted_ids', 'informed_ids']

const block = (prev, next, allowedFrom) => ({
  error: `Δεν επιτρέπεται η μετάβαση από "${prev || '—'}" σε "${next}". Επιτρεπτή προηγούμενη κατάσταση: ${allowedFrom}.`,
  patch: {}, warnings: [], needsPendingTasksConfirm: false,
})

/**
 * @param prev    η αποθηκευμένη (προηγούμενη) κατάσταση
 * @param next    η νέα κατάσταση
 * @param project το project όπως θα αποθηκευτεί: signed_on, responsible_ids,
 *                accountable_ids, consulted_ids, informed_ids, start_date, end_date
 * @returns {{ error, patch, warnings, needsPendingTasksConfirm }}
 *  - error: αν δεν είναι κενό, η αλλαγή ΔΕΝ αποθηκεύεται
 *  - patch: αυτόματες συμπληρώσεις (πρέπει να μπουν στο save)
 *  - needsPendingTasksConfirm: για Completed, ο caller πρέπει να μετρήσει τα
 *    pending tasks και να ζητήσει επιβεβαίωση πριν την αποθήκευση
 */
export function applyProjectStatusRules({ prev, next, project }) {
  const ok = { error: '', patch: {}, warnings: [], needsPendingTasksConfirm: false }
  const p = norm(prev), n = norm(next)
  if (!n || p === n) return ok

  if (n === 'Not Started') {
    if (!project.signed_on) return {
      ...ok,
      error: 'Το project δεν έχει υπογραφεί. Το status "Not Started" μπαίνει μόνο μέσω του κουμπιού "Υπογραφή" (Admin ή Supervisor του έργου).',
    }
    return ok
  }

  if (n === 'In Progress') {
    if (!(p === 'Not Started' || p === 'Deferred' || isWaitingSomeone(p)))
      return block(prev, next, 'Not Started, Deferred ή Waiting on someone else')
    if (!RACI_KEYS.every((k) => (project[k] ?? []).length > 0)) return {
      ...ok,
      error: 'Συμπληρώστε όλα τα πεδία RACI (Responsible, Accountable, Consulted, Informed) πριν την αλλαγή σε "In Progress". Τα RACI επεξεργάζεται μόνο ο Admin.',
    }
    if (!project.start_date) return { ...ok, patch: { start_date: todayISO() } }
    return ok
  }

  if (n === 'Completed') {
    if (!(p === 'In Progress' || p === 'Deferred' || isWaitingSomeone(p)))
      return block(prev, next, 'In Progress, Deferred ή Waiting on someone else')
    return {
      ...ok,
      patch: project.end_date ? {} : { end_date: todayISO() },
      needsPendingTasksConfirm: true,
    }
  }

  if (n === 'Deferred') {
    if (!(p === 'In Progress' || isWaitingSomeone(p)))
      return block(prev, next, 'In Progress ή Waiting on someone else')
    return ok
  }

  if (isWaitingSomeone(n)) {
    if (!(p === 'In Progress' || p === 'Deferred'))
      return block(prev, next, 'In Progress ή Deferred')
    return ok
  }

  return ok
}
