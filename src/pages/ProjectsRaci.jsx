import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchProjects } from '../lib/projects'
import { MultiFilter } from '../components/ui'

const RACI_TOOLTIPS = {
  responsible: 'Responsible (R): The person or team who actually does the work to complete the task. They are responsible for driving the work to completion.',
  accountable: 'Accountable (A): The person who has the final say and owns the ultimate success or failure of the deliverable. They approve the completed work and there must be exactly one Accountable person per task.',
  consulted:   'Consulted (C): Subject-matter experts or stakeholders whose opinions are sought before a decision is made or the work is finalized.',
  informed:    'Informed (I): People who are kept up-to-date on project progress or decisions, but are not directly involved in the execution or decision-making.',
}

const toOpts = (vals) => [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'el'))
  .map((v) => ({ value: v, label: v }))

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

export default function ProjectsRaciPage() {
  const nav = useNavigate()
  const [rows, setRows] = useState([])
  const [owners, setOwners] = useState([])
  const [approvers, setApprovers] = useState([])
  const [statuses, setStatuses] = useState([])
  const [resp, setResp] = useState([])
  const [acc, setAcc] = useState([])
  const [cons, setCons] = useState([])
  const [inf, setInf] = useState([])
  useEffect(() => { fetchProjects().then(setRows).catch(console.error) }, [])

  const ownerOpts    = useMemo(() => toOpts(rows.map((r) => r.owner)), [rows])
  const approverOpts = useMemo(() => toOpts(rows.map((r) => r.supervisor)), [rows])
  const statusOpts   = useMemo(() => toOpts(rows.map((r) => r.status)), [rows])
  const respOpts     = useMemo(() => toOpts(rows.flatMap((r) => r.responsible ?? [])), [rows])
  const accOpts      = useMemo(() => toOpts(rows.flatMap((r) => r.accountable ?? [])), [rows])
  const consOpts     = useMemo(() => toOpts(rows.flatMap((r) => r.consulted ?? [])), [rows])
  const infOpts      = useMemo(() => toOpts(rows.flatMap((r) => r.informed ?? [])), [rows])

  const anyOf = (sel, arr) => sel.length === 0 || (arr ?? []).some((n) => sel.includes(n))

  const visible = rows.filter((r) =>
    (owners.length === 0 || owners.includes(r.owner))
    && (approvers.length === 0 || approvers.includes(r.supervisor))
    && (statuses.length === 0 || statuses.includes(r.status))
    && anyOf(resp, r.responsible)
    && anyOf(acc, r.accountable)
    && anyOf(cons, r.consulted)
    && anyOf(inf, r.informed))

  // Στήλες: όλα τα resources που εμφανίζονται σε R/A/C/I των ορατών projects
  const resources = useMemo(() => [...new Set(visible.flatMap((p) => [
    ...(p.responsible ?? []), ...(p.accountable ?? []), ...(p.consulted ?? []), ...(p.informed ?? []),
  ]))].sort((a, b) => a.localeCompare(b, 'el')), [visible])

  return (
    <>
      <div className="toolbar">
        <div className="chips" style={{ gap: 8 }}>
          <MultiFilter label="Owner" options={ownerOpts} value={owners} onChange={setOwners} />
          <MultiFilter label="Approver" tooltip="Ο Supervisor που εγκρίνει το project" options={approverOpts} value={approvers} onChange={setApprovers} />
          <MultiFilter label="Status" options={statusOpts} value={statuses} onChange={setStatuses} />
          <MultiFilter label="R-esponsible" tooltip={RACI_TOOLTIPS.responsible} options={respOpts} value={resp} onChange={setResp} />
          <MultiFilter label="A-ccountable" tooltip={RACI_TOOLTIPS.accountable} options={accOpts} value={acc} onChange={setAcc} />
          <MultiFilter label="C-onsulted" tooltip={RACI_TOOLTIPS.consulted} options={consOpts} value={cons} onChange={setCons} />
          <MultiFilter label="I-nformed" tooltip={RACI_TOOLTIPS.informed} options={infOpts} value={inf} onChange={setInf} />
        </div>
        <div className="spacer" />
        <div className="raci-legend">
          {LEGEND.map(([l, name, key]) => (
            <span key={l} title={RACI_TOOLTIPS[key]}><i className={'c' + l} />{l} = {name}</span>
          ))}
        </div>
      </div>

      {visible.length === 0 || resources.length === 0 ? (
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
              {visible.map((p) => (
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
