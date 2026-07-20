import { useEffect, useMemo, useState } from 'react'
import { fetchProjects } from '../lib/projects'
import { ProjectsKanban as Board, MultiFilter, DateFilter, dateMatches } from '../components/ui'

const RACI_TOOLTIPS = {
  responsible: 'Responsible (R): The person or team who actually does the work to complete the task. They are responsible for driving the work to completion.',
  accountable: 'Accountable (A): The person who has the final say and owns the ultimate success or failure of the deliverable. They approve the completed work and there must be exactly one Accountable person per task.',
  consulted:   'Consulted (C): Subject-matter experts or stakeholders whose opinions are sought before a decision is made or the work is finalized.',
  informed:    'Informed (I): People who are kept up-to-date on project progress or decisions, but are not directly involved in the execution or decision-making.',
}

const toOpts = (vals) => [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'el'))
  .map((v) => ({ value: v, label: v }))

export default function ProjectsKanbanPage() {
  const [rows, setRows] = useState([])
  const [owners, setOwners] = useState([])
  const [approvers, setApprovers] = useState([])
  const [statuses, setStatuses] = useState([])
  const [resp, setResp] = useState([])
  const [acc, setAcc] = useState([])
  const [cons, setCons] = useState([])
  const [inf, setInf] = useState([])
  const [dl, setDl] = useState(null)
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
    && anyOf(inf, r.informed)
    && dateMatches(dl, r.deadline))

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
          <DateFilter label="Deadline" value={dl} onChange={setDl} />
        </div>
        <div className="spacer" />
      </div>
      <Board rows={visible} />
    </>
  )
}
