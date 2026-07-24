import { useState } from 'react'
import KanbanPage from './KanbanPage'
import Dashboard from './Dashboard'
import TasksGanttPage from './TasksGantt'

const SUBS = {
  Kanban: 'Visual overview by status.',
  Dashboard: 'System-wide operational view — all figures live from the database.',
  Gantt: 'Χρονοδιάγραμμα tasks: Start Date → Due Date.',
}

export default function TasksOverview() {
  const [view, setView] = useState('Kanban')
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Tasks Overview</h1>
          <div className="sub">{SUBS[view]}</div>
        </div>
        <div className="chips">
          {Object.keys(SUBS).map((v) => (
            <button key={v} className={'chip' + (v === view ? ' on' : '')} onClick={() => setView(v)}>{v}</button>
          ))}
        </div>
      </div>
      {view === 'Kanban' ? <KanbanPage /> : view === 'Gantt' ? <TasksGanttPage /> : <Dashboard />}
    </>
  )
}
