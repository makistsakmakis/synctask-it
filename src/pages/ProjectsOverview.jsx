import { useEffect, useMemo, useState } from 'react'
import { fetchProjects, updateProject, fetchProjectStatuses } from '../lib/projects'
import { fetchResources, fetchPendingTaskCount } from '../lib/api'
import { applyProjectStatusRules } from '../lib/projectRules'
import { MultiFilter, DateFilter, dateMatches } from '../components/ui'
import ProjectsKanbanPage from './ProjectsKanban'
import ProjectsDashboard from './ProjectsDashboard'
import ProjectsRaciPage from './ProjectsRaci'

const SUBS = {
  Kanban: 'Projects grouped by status.',
  Dashboard: 'All projects — figures live from the database.',
  RACI: 'RACI matrix — projects × resources.',
}

const RACI_TOOLTIPS = {
  responsible: 'Responsible (R): The person or team who actually does the work to complete the task. They are responsible for driving the work to completion.',
  accountable: 'Accountable (A): The person who has the final say and owns the ultimate success or failure of the deliverable. They approve the completed work and there must be exactly one Accountable person per task.',
  consulted:   'Consulted (C): Subject-matter experts or stakeholders whose opinions are sought before a decision is made or the work is finalized.',
  informed:    'Informed (I): People who are kept up-to-date on project progress or decisions, but are not directly involved in the execution or decision-making.',
}

const toOpts = (vals) => [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'el'))
  .map((v) => ({ value: v, label: v }))

export default function ProjectsOverview() {
  const [view, setView] = useState('Kanban')
  const [rows, setRows] = useState([])
  const [resources, setResources] = useState([])
  const [statusList, setStatusList] = useState([])
  const [err, setErr] = useState('')

  // Shared filters — persist across view toggles (state lives here, views are children)
  const [owners, setOwners] = useState([])
  const [approvers, setApprovers] = useState([])
  const [statuses, setStatuses] = useState([])
  const [resFilter, setResFilter] = useState([]) // Resource: matches R/A/C/I or Supervisor/Owner (as person)
  const [resp, setResp] = useState([])
  const [acc, setAcc] = useState([])
  const [cons, setCons] = useState([])
  const [inf, setInf] = useState([])
  const [dl, setDl] = useState(null)

  useEffect(() => {
    fetchProjects().then(setRows).catch(console.error)
    fetchResources().then(setResources).catch(() => setResources([]))
    fetchProjectStatuses().then(setStatusList).catch(() => setStatusList([]))
  }, [])

  // Drag-n-drop στο Kanban: Project Status Rules (κοινοί με τη φόρμα —
  // lib/projectRules.js), μετά optimistic update + auto dates, revert σε αποτυχία.
  const moveProject = async (id, status) => {
    setErr('')
    const row = rows.find((r) => String(r.id) === String(id))
    if (!row) return
    const { error, patch, needsPendingTasksConfirm } =
      applyProjectStatusRules({ prev: row.status, next: status, project: row })
    if (error) { setErr(error); return } // μπλοκάρει — η κάρτα δεν μετακινείται
    if (needsPendingTasksConfirm) {
      try {
        const n = await fetchPendingTaskCount(id)
        if (n > 0 && !window.confirm(
          `Το project "${row.title}" έχει ${n} μη ολοκληρωμένα task(s). Να προχωρήσει το κλείσιμο σε "Completed";`)) return
      } catch { /* αν αποτύχει η μέτρηση, δεν μπλοκάρουμε */ }
    }
    const prev = rows
    setRows((rs) => rs.map((r) => (String(r.id) === String(id) ? { ...r, status, ...patch } : r)))
    try { await updateProject(id, { status, ...patch }) }
    catch (e) { setRows(prev); setErr(e.message ?? 'Η αλλαγή status απέτυχε.') }
  }

  const ownerOpts    = useMemo(() => toOpts(rows.map((r) => r.owner)), [rows])
  const approverOpts = useMemo(() => toOpts(rows.map((r) => r.supervisor)), [rows])
  const statusOpts   = useMemo(() => toOpts(rows.map((r) => r.status)), [rows])
  const respOpts     = useMemo(() => toOpts(rows.flatMap((r) => r.responsible ?? [])), [rows])
  const accOpts      = useMemo(() => toOpts(rows.flatMap((r) => r.accountable ?? [])), [rows])
  const consOpts     = useMemo(() => toOpts(rows.flatMap((r) => r.consulted ?? [])), [rows])
  const infOpts      = useMemo(() => toOpts(rows.flatMap((r) => r.informed ?? [])), [rows])
  const resourceOpts = useMemo(() => resources
    .map((r) => ({ value: r.id, label: r.name }))
    .sort((a, b) => a.label.localeCompare(b.label, 'el')), [resources])

  const anyOf = (sel, arr) => sel.length === 0 || (arr ?? []).some((n) => sel.includes(n))

  // Resource filter: το επιλεγμένο resource ταιριάζει αν εμφανίζεται σε R/A/C/I
  // (με όνομα) ή αν το πρόσωπό του (email) είναι Supervisor ή Owner του project.
  const selectedResources = useMemo(
    () => resources.filter((r) => resFilter.includes(r.id)), [resources, resFilter])
  const matchesResource = (p) => selectedResources.length === 0 || selectedResources.some((res) =>
    (res.name && ((p.responsible ?? []).includes(res.name)
      || (p.accountable ?? []).includes(res.name)
      || (p.consulted ?? []).includes(res.name)
      || (p.informed ?? []).includes(res.name)))
    || (res.email && (res.email === p.owner_email || res.email === p.supervisor_email)))

  const visible = useMemo(() => rows.filter((r) =>
    (owners.length === 0 || owners.includes(r.owner))
    && (approvers.length === 0 || approvers.includes(r.supervisor))
    && (statuses.length === 0 || statuses.includes(r.status))
    && matchesResource(r)
    && anyOf(resp, r.responsible)
    && anyOf(acc, r.accountable)
    && anyOf(cons, r.consulted)
    && anyOf(inf, r.informed)
    && dateMatches(dl, r.deadline)),
    [rows, owners, approvers, statuses, selectedResources, resp, acc, cons, inf, dl])

  const hasFilters = owners.length || approvers.length || statuses.length
    || resFilter.length || resp.length || acc.length || cons.length || inf.length || dl != null

  const clearFilters = () => {
    setOwners([]); setApprovers([]); setStatuses([]); setResFilter([])
    setResp([]); setAcc([]); setCons([]); setInf([]); setDl(null)
  }

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

      <div className="toolbar">
        <div className="chips" style={{ gap: 8 }}>
          <MultiFilter label="Owner" options={ownerOpts} value={owners} onChange={setOwners} />
          <MultiFilter label="Approver" tooltip="Ο Supervisor που εγκρίνει το project" options={approverOpts} value={approvers} onChange={setApprovers} />
          <MultiFilter label="Status" options={statusOpts} value={statuses} onChange={setStatuses} />
          <MultiFilter label="Resource" tooltip="Projects όπου το resource συμμετέχει οπουδήποτε: R, A, C, I ή είναι (ως πρόσωπο) Supervisor ή Owner" options={resourceOpts} value={resFilter} onChange={setResFilter} />
          <MultiFilter label="R-esponsible" tooltip={RACI_TOOLTIPS.responsible} options={respOpts} value={resp} onChange={setResp} />
          <MultiFilter label="A-ccountable" tooltip={RACI_TOOLTIPS.accountable} options={accOpts} value={acc} onChange={setAcc} />
          <MultiFilter label="C-onsulted" tooltip={RACI_TOOLTIPS.consulted} options={consOpts} value={cons} onChange={setCons} />
          <MultiFilter label="I-nformed" tooltip={RACI_TOOLTIPS.informed} options={infOpts} value={inf} onChange={setInf} />
          <DateFilter label="Deadline" value={dl} onChange={setDl} />
          {hasFilters ? (
            <button className="btn sm" onClick={clearFilters} title="Καθαρισμός όλων των φίλτρων">
              ✕ Αναίρεση Φίλτρων
            </button>
          ) : null}
        </div>
        <div className="spacer" />
      </div>

      {err && <div className="err">{err}</div>}

      {view === 'Kanban' ? <ProjectsKanbanPage rows={visible} onDrop={moveProject} allStatuses={statusList} />
        : view === 'RACI' ? <ProjectsRaciPage rows={visible} />
        : <ProjectsDashboard rows={visible} />}
    </>
  )
}
