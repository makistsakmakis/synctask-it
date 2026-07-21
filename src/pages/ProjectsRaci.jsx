import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { exportXLSX } from '../lib/meta'

const RACI_TOOLTIPS = {
  responsible: 'Responsible (R): The person or team who actually does the work to complete the task. They are responsible for driving the work to completion.',
  accountable: 'Accountable (A): The person who has the final say and owns the ultimate success or failure of the deliverable. They approve the completed work and there must be exactly one Accountable person per task.',
  consulted:   'Consulted (C): Subject-matter experts or stakeholders whose opinions are sought before a decision is made or the work is finalized.',
  informed:    'Informed (I): People who are kept up-to-date on project progress or decisions, but are not directly involved in the execution or decision-making.',
}

// Προτεραιότητα γράμματος όταν ένα resource έχει πολλαπλούς ρόλους στο ίδιο project
const ROLES = [['accountable', 'A'], ['responsible', 'R'], ['consulted', 'C'], ['informed', 'I']]
const cellRole = (p, name) => {
  for (const [key, letter] of ROLES) if ((p[key] ?? []).includes(name)) return letter
  return ''
}

const LEGEND = [
  ['R', 'Responsible', 'responsible'],
  ['A', 'Accountable', 'accountable'],
  ['C', 'Consulted', 'consulted'],
  ['I', 'Informed', 'informed'],
]

// Rows (ήδη φιλτραρισμένα) έρχονται από το ProjectsOverview — τα φίλτρα είναι κοινά για τα 3 views.
export default function ProjectsRaciPage({ rows = [] }) {
  const nav = useNavigate()

  // Στήλες: όλα τα resources που εμφανίζονται σε R/A/C/I των ορατών projects
  const resources = useMemo(() => [...new Set(rows.flatMap((p) => [
    ...(p.responsible ?? []), ...(p.accountable ?? []), ...(p.consulted ?? []), ...(p.informed ?? []),
  ]))].sort((a, b) => a.localeCompare(b, 'el')), [rows])

  return (
    <>
      <div className="toolbar">
        <div className="raci-legend">
          {LEGEND.map(([l, name, key]) => (
            <span key={l} title={RACI_TOOLTIPS[key]}><i className={'c' + l} />{l} = {name}</span>
          ))}
        </div>
        <div className="spacer" />
        <button className="btn sm" onClick={() => exportXLSX(
          ['Project', ...resources],
          rows.map((p) => [p.title, ...resources.map((n) => cellRole(p, n))]),
          'raci.xlsx')}>⬇ Export Excel</button>
      </div>

      {rows.length === 0 || resources.length === 0 ? (
        <div className="card"><div className="empty">Δεν υπάρχουν projects με RACI για εμφάνιση.</div></div>
      ) : (
        <div className="card raci-wrap">
          <table className="racimx">
            <thead>
              <tr>
                <th className="corner">Project</th>
                {resources.map((name) => <th key={name} className="res"><span>{name}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} onClick={() => nav(`/projects/${p.id}`)}>
                  <td className="rowtitle" title={p.title}>{p.title}</td>
                  {resources.map((name) => {
                    const letter = cellRole(p, name)
                    return <td key={name} className={letter ? 'c' + letter : 'cempty'}>{letter || '–'}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
