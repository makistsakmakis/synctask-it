import { useState } from 'react'
import ProjectsKanbanPage from './ProjectsKanban'
import ProjectsDashboard from './ProjectsDashboard'

const SUBS = {
  Kanban: 'Projects grouped by status.',
  Dashboard: 'All projects — figures live from the database.',
}

export default function ProjectsOverview() {
  const [view, setView] = useState('Kanban')
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Projects Overview</h1>
          <div className="sub">{SUBS[view]}</div>
        </div>
        <div className="chips">
          {Object.keys(SUBS).map((v) => (
            <button key={v} className={'chip' + (v === view ? ' on' : '')} onClick={() => setView(v)}>{v}</button>
          ))}
        </div>
      </div>
      {view === 'Kanban' ? <ProjectsKanbanPage /> : <ProjectsDashboard />}
    </>
  )
}
