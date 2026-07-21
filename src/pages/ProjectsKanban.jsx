import { ProjectsKanban as Board } from '../components/ui'

// Rows (ήδη φιλτραρισμένα) έρχονται από το ProjectsOverview — τα φίλτρα είναι κοινά για τα 3 views.
export default function ProjectsKanbanPage({ rows = [] }) {
  return <Board rows={rows} />
}
