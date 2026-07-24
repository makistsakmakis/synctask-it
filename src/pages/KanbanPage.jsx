import { useEffect, useMemo, useState } from 'react'
import { fetchRequests, updateRequest } from '../lib/api'
import { applyTaskStatusRules } from '../lib/taskRules'
import { Kanban, MultiFilter, DateFilter, dateMatches, NoticeDialog } from '../components/ui'

export default function KanbanPage() {
  const [rows, setRows] = useState([])
  const [assignees, setAssignees] = useState([])
  const [tags, setTags] = useState([])
  const [projects, setProjects] = useState([])
  const [dl, setDl] = useState(null)
  const [notice, setNotice] = useState(null) // { type: 'error'|'warn', text, onOk? }
  useEffect(() => { fetchRequests().then(setRows).catch(console.error) }, [])

  // Drag-n-drop: Task Status Rules (κοινοί με τη φόρμα — lib/taskRules.js),
  // μετά optimistic update του status + auto-συμπληρώσεις, revert σε αποτυχία.
  const moveTask = async (id, status) => {
    const task = rows.find((r) => String(r.id) === String(id))
    if (!task) return
    const { error, patch, warnings } = applyTaskStatusRules({ ...task, status })
    // ERROR: μπλοκάρει — η κάρτα δεν μετακινείται· το ΟΚ επιστρέφει στο board για διόρθωση
    if (error) { setNotice({ type: 'error', text: error }); return }

    const proceed = async () => {
      const prev = rows
      setRows((rs) => rs.map((r) => (String(r.id) === String(id) ? { ...r, status, ...patch } : r)))
      try { await updateRequest(id, { status, ...patch }) }
      catch (e) { setRows(prev); setNotice({ type: 'error', text: e.message ?? 'Η αλλαγή status απέτυχε.' }) }
    }
    // WARNING: το ΟΚ (λήψη γνώσης) επιτρέπει τη ροή να συνεχίσει
    if (warnings.length) setNotice({ type: 'warn', text: warnings.join('\n'), onOk: proceed })
    else await proceed()
  }

  const assigneeOpts = useMemo(() =>
    [...new Set(rows.map((r) => r.assigned_to).filter(Boolean))].sort()
      .map((v) => ({ value: v, label: v })), [rows])
  const tagOpts = useMemo(() =>
    [...new Set(rows.map((r) => r.tag_name).filter(Boolean))].sort()
      .map((v) => ({ value: v, label: v })), [rows])
  const projectOpts = useMemo(() =>
    [...new Set(rows.map((r) => r.project_name).filter(Boolean))].sort()
      .map((v) => ({ value: v, label: v })), [rows])

  const visible = rows.filter((r) =>
    (assignees.length === 0 || assignees.includes(r.assigned_to)) &&
    (tags.length === 0 || tags.includes(r.tag_name)) &&
    (projects.length === 0 || projects.includes(r.project_name)) &&
    dateMatches(dl, r.golive_required))

  return (
    <>
      <div className="toolbar">
        <div className="chips" style={{ gap: 8 }}>
          <MultiFilter label="Assignee" options={assigneeOpts} value={assignees} onChange={setAssignees} />
          <MultiFilter label="Tag" options={tagOpts} value={tags} onChange={setTags} />
          <MultiFilter label="Project" options={projectOpts} value={projects} onChange={setProjects} />
          <DateFilter label="Deadline" tooltip="Due date του task" value={dl} onChange={setDl} />
        </div>
        <div className="spacer" />
      </div>
      <NoticeDialog notice={notice} onClose={() => setNotice(null)} />
      <Kanban rows={visible} onDrop={moveTask} />
    </>
  )
}
