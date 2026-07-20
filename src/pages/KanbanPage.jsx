import { useEffect, useMemo, useState } from 'react'
import { fetchRequests } from '../lib/api'
import { Kanban, MultiFilter, DateFilter, dateMatches } from '../components/ui'

export default function KanbanPage() {
  const [rows, setRows] = useState([])
  const [assignees, setAssignees] = useState([])
  const [tags, setTags] = useState([])
  const [projects, setProjects] = useState([])
  const [dl, setDl] = useState(null)
  useEffect(() => { fetchRequests().then(setRows).catch(console.error) }, [])

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
      <Kanban rows={visible} />
    </>
  )
}
