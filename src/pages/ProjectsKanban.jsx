import { useEffect, useMemo, useState } from 'react'
import { fetchProjects } from '../lib/projects'
import { ProjectsKanban as Board, MultiFilter } from '../components/ui'

export default function ProjectsKanbanPage() {
  const [rows, setRows] = useState([])
  const [owners, setOwners] = useState([])
  useEffect(() => { fetchProjects().then(setRows).catch(console.error) }, [])

  const ownerOpts = useMemo(() =>
    [...new Set(rows.map((r) => r.owner).filter(Boolean))].sort()
      .map((v) => ({ value: v, label: v })), [rows])

  const visible = rows.filter((r) => owners.length === 0 || owners.includes(r.owner))

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Projects - Kanban</h1>
          <div className="sub">Projects grouped by status.</div>
        </div>
      </div>
      <div className="toolbar">
        <div className="chips" style={{ gap: 8 }}>
          <MultiFilter label="Owner" options={ownerOpts} value={owners} onChange={setOwners} />
        </div>
        <div className="spacer" />
      </div>
      <Board rows={visible} />
    </>
  )
}
