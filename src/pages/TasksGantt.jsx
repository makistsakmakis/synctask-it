import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchRequests } from '../lib/api'
import { MultiFilter, DateFilter, dateMatches } from '../components/ui'
import { STATUS_COLOR, fmtDate } from '../lib/meta'

const iso = (d) => (d ?? '').slice(0, 10)
const parse = (d) => new Date(iso(d) + 'T00:00:00')

export default function TasksGanttPage() {
  const nav = useNavigate()
  const [rows, setRows] = useState([])
  const [assignees, setAssignees] = useState([])
  const [tags, setTags] = useState([])
  const [projects, setProjects] = useState([])
  const [dl, setDl] = useState(null)
  useEffect(() => { fetchRequests().then(setRows).catch(console.error) }, [])

  const assigneeOpts = useMemo(() =>
    [...new Set(rows.map((r) => r.assigned_to).filter(Boolean))].sort()
      .map((v) => ({ value: v, label: v })), [rows])
  const tagOpts = useMemo(() =>
    [...new Set(rows.map((r) => r.tag_name).filter(Boolean))].sort()
      .map((v) => ({ value: v, label: v })), [rows])
  const projectOpts = useMemo(() =>
    [...new Set(rows.map((r) => r.project_name).filter(Boolean))].sort()
      .map((v) => ({ value: v, label: v })), [rows])

  const visible = rows.filter((r) =>
    (assignees.length === 0 || assignees.includes(r.assigned_to)) &&
    (tags.length === 0 || tags.includes(r.tag_name)) &&
    (projects.length === 0 || projects.includes(r.project_name)) &&
    dateMatches(dl, r.golive_required))

  // Μπάρα: Start Date (expected_start) → Due Date (golive_required).
  // Task χωρίς καμία ημερομηνία δεν σχεδιάζεται· με μία μόνο, γίνεται σημείο.
  const tasks = useMemo(() => visible
    .map((r) => {
      const s = iso(r.expected_start) || iso(r.golive_required)
      const e = iso(r.golive_required) || iso(r.expected_start)
      if (!s || !e) return null
      return { ...r, gs: s <= e ? s : e, ge: s <= e ? e : s }
    })
    .filter(Boolean)
    .sort((a, b) => a.gs.localeCompare(b.gs) || a.ge.localeCompare(b.ge)), [visible])

  const frame = useMemo(() => {
    if (tasks.length === 0) return null
    const all = tasks.flatMap((t) => [t.gs, t.ge])
    const today = new Date().toISOString().slice(0, 10)
    all.push(today)
    const minD = parse(all.reduce((a, b) => (a < b ? a : b)))
    const maxD = parse(all.reduce((a, b) => (a > b ? a : b)))
    const t0 = new Date(minD.getFullYear(), minD.getMonth(), 1)
    const t1 = new Date(maxD.getFullYear(), maxD.getMonth() + 1, 1)
    const span = t1 - t0
    const months = []
    for (let d = new Date(t0); d < t1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      months.push({
        key: d.getTime(),
        label: d.toLocaleDateString('el-GR', { month: 'short', year: '2-digit' }),
        left: ((d - t0) / span) * 100,
        width: ((next - d) / span) * 100,
      })
    }
    const pct = (dstr) => Math.min(100, Math.max(0, ((parse(dstr) - t0) / span) * 100))
    return { months, pct, todayLeft: pct(today) }
  }, [tasks])

  return (
    <>
      <div className="toolbar">
        <div className="chips" style={{ gap: 8 }}>
          <MultiFilter label="Assignee" options={assigneeOpts} value={assignees} onChange={setAssignees} />
          <MultiFilter label="Tag" options={tagOpts} value={tags} onChange={setTags} />
          <MultiFilter label="Project" options={projectOpts} value={projects} onChange={setProjects} />
          <DateFilter label="Deadline" tooltip="Due date του task" value={dl} onChange={setDl} />
        </div>
        <div className="spacer" />
        <span className="grid-count">{tasks.length} tasks</span>
      </div>

      {!frame ? (
        <div className="card"><div className="empty">Δεν υπάρχουν tasks με ημερομηνίες για το χρονοδιάγραμμα.</div></div>
      ) : (
        <div className="card gantt-wrap">
          <div className="gantt-header">
            <div className="gantt-side">Task</div>
            <div className="gantt-time">
              {frame.months.map((m) => (
                <div key={m.key} className="gantt-month" style={{ left: `${m.left}%`, width: `${m.width}%` }}>{m.label}</div>
              ))}
            </div>
          </div>
          <div className="gantt-body">
            <div className="gantt-gridlines">
              {frame.months.map((m) => <div key={m.key} className="gantt-line" style={{ left: `${m.left}%` }} />)}
              <div className="gantt-today" style={{ left: `${frame.todayLeft}%` }} title="Σήμερα" />
            </div>
            {tasks.map((r) => {
              const left = frame.pct(r.gs)
              const width = Math.max(0.6, frame.pct(r.ge) - left)
              return (
                <div className="gantt-row" key={r.id}>
                  <div className="gantt-side" title={r.title} onClick={() => nav(`/requests/${r.id}`)}>{r.title}</div>
                  <div className="gantt-track">
                    <div className="gantt-bar"
                      style={{ left: `${left}%`, width: `${width}%`, background: STATUS_COLOR[r.status] ?? 'var(--accent)' }}
                      title={`${r.title}\n${fmtDate(r.gs)} → ${fmtDate(r.ge)} · ${r.status ?? '—'}`} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
