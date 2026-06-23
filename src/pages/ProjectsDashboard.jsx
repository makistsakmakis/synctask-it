import { useEffect, useMemo, useState } from 'react'
import { fetchProjects } from '../lib/projects'

export default function ProjectsDashboard() {
  const [rows, setRows] = useState([])
  useEffect(() => { fetchProjects().then(setRows).catch(console.error) }, [])

  const today = new Date(new Date().toDateString())
  const isDone = (p) => /complete|done|closed/i.test(p.status || '')
  const k = useMemo(() => ({
    total: rows.length,
    active: rows.filter((p) => !isDone(p)).length,
    completed: rows.filter(isDone).length,
    overdue: rows.filter((p) => !isDone(p) && p.deadline && new Date(p.deadline) < today).length,
  }), [rows])

  const byStatus = useMemo(() => {
    const m = new Map()
    for (const p of rows) m.set(p.status || '—', (m.get(p.status || '—') ?? 0) + 1)
    return [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n)
  }, [rows])
  const byOwner = useMemo(() => {
    const m = new Map()
    for (const p of rows) m.set(p.owner || '—', (m.get(p.owner || '—') ?? 0) + 1)
    return [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n)
  }, [rows])
  const max = Math.max(1, ...byStatus.map((b) => b.n), ...byOwner.map((b) => b.n))

  const Bars = ({ title, items }) => (
    <div className="card" style={{ flex: 1, minWidth: 280 }}>
      <h3 style={{ padding: '14px 16px 0', fontSize: 13 }}>{title}</h3>
      <div className="bars">
        {items.length === 0 && <div className="sub" style={{ color: 'var(--ink-soft)' }}>No data yet.</div>}
        {items.map((b) => (
          <div className="bar" key={b.label}>
            <span>{b.label}</span>
            <div className="track"><div className="fill" style={{ width: `${(b.n / max) * 100}%`, background: 'var(--accent)' }} /></div>
            <span className="mono">{b.n}</span>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Projects Dashboard</h1>
          <div className="sub">All projects — figures live from the database.</div>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="n">{k.total}</div><div className="l">Total projects</div></div>
        <div className="kpi"><div className="n">{k.active}</div><div className="l">Active</div></div>
        <div className="kpi"><div className="n">{k.completed}</div><div className="l">Completed</div></div>
        <div className={'kpi' + (k.overdue ? ' hot' : '')}><div className="n">{k.overdue}</div><div className="l">Overdue</div></div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Bars title="Projects by status" items={byStatus} />
        <Bars title="Projects by owner" items={byOwner} />
      </div>
    </>
  )
}
