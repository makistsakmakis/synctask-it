import { ProjectsKanban as Board } from '../components/ui'

// Rows (ήδη φιλτραρισμένα) έρχονται από το ProjectsOverview — τα φίλτρα είναι κοινά για τα 3 views.
export default function ProjectsKanbanPage({ rows = [], onDrop, allStatuses }) {
  return <Board rows={rows} onDrop={onDrop} allStatuses={allStatuses} />
}
