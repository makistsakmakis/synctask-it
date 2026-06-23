import { useEffect, useMemo, useState } from 'react'
import { fetchRequests } from '../lib/api'
import { Kanban, MultiFilter } from '../components/ui'

export default function KanbanPage() {
  const [rows, setRows] = useState([])
  const [assignees, setAssignees] = useState([])
  const [tags, setTags] = useState([])
  useEffect(() => { fetchRequests().then(setRows).catch(console.error) }, [])

  const assigneeOpts = useMemo(() =>
    [...new Set(rows.map((r) => r.assigned_to).filter(Boolean))].sort()
      .map((v) => ({ value: v, label: v })), [rows])
  const tagOpts = useMemo(() =>
    [...new Set(rows.map((r) => r.tag_name).filter(Boolean))].sort()
      .map((v) => ({ value: v, label: v })), [rows])

  const visible = rows.filter((r) =>
    (assignees.length === 0 || assignees.includes(r.assigned_to)) &&
    (tags.length === 0 || tags.includes(r.tag_name)))

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>TASKS - Kanban</h1>
          <div className="sub">Visual overview by status.</div>
        </div>
      </div>
      <div className="toolbar">
        <div className="chips" style={{ gap: 8 }}>
          <MultiFilter label="Assignee" options={assigneeOpts} value={assignees} onChange={setAssignees} />
          <MultiFilter label="Tag" options={tagOpts} value={tags} onChange={setTags} />
        </div>
        <div className="spacer" />
      </div>
      <Kanban rows={visible} />
    </>
  )
}
