import { useEffect, useMemo, useState } from 'react'
import { fetchRequests } from '../lib/api'
import { isOpen, isAssigned, isOverdue, STATUS_COLOR, STATUSES } from '../lib/meta'

const days = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000)
const avg = (xs) => (xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1) : '—')

export default function Dashboard() {
  const [rows, setRows] = useState([])
  useEffect(() => { fetchRequests().then(setRows).catch(console.error) }, [])

  const k = useMemo(() => {
    const now = new Date()
    const completed = rows.filter((r) => r.status === 'Completed')
    return {
      open: rows.filter(isOpen).length,
      notStarted: rows.filter((r) => r.status === 'Not Started').length,
      inProgress: rows.filter((r) => r.status === 'In Progress').length,
      waiting: rows.filter((r) => r.status === 'Waiting').length,
      deferred: rows.filter((r) => r.status === 'Deferred').length,
      completed: completed.length,
      overdue: rows.filter(isOverdue).length,
      completedThisMonth: completed.filter((r) => {
        const d = new Date(r.actual_completion)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      }).length,
      avgLead: avg(completed.filter((r) => r.actual_completion)
        .map((r) => days(r.actual_completion, r.request_date))),
    }
  }, [rows])

  const byStatus = STATUSES.map((s) => ({ label: s, n: rows.filter((r) => r.status === s).length, color: STATUS_COLOR[s] }))
  const byImplementor = useMemo(() => {
    const m = new Map()
    for (const r of rows.filter(isOpen))
      for (const i of r.implementors ?? [])
        m.set(i.resource?.name, (m.get(i.resource?.name) ?? 0) + 1)
    return [...m.entries()].map(([label, n]) => ({ label, n, color: 'var(--accent)' }))
      .sort((a, b) => b.n - a.n)
  }, [rows])
  const max = Math.max(1, ...byStatus.map((b) => b.n), ...byImplementor.map((b) => b.n))

  const Bars = ({ title, items }) => (
    <div className="card" style={{ flex: 1, minWidth: 280 }}>
      <h3 style={{ padding: '14px 16px 0', fontSize: 13 }}>{title}</h3>
      <div className="bars">
        {items.length === 0 && <div className="sub" style={{ color: 'var(--ink-soft)' }}>No data yet.</div>}
        {items.map((b) => (
          <div className="bar" key={b.label}>
            <span>{b.label}</span>
            <div className="track"><div className="fill" style={{ width: `${(b.n / max) * 100}%`, background: b.color }} /></div>
            <span className="mono">{b.n}</span>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="n">{k.open}</div><div className="l">Total open</div></div>
        <div className="kpi"><div className="n">{k.notStarted}</div><div className="l">Not started</div></div>
        <div className="kpi"><div className="n">{k.inProgress}</div><div className="l">In progress</div></div>
        <div className="kpi"><div className="n">{k.waiting}</div><div className="l">Waiting</div></div>
        <div className="kpi"><div className="n">{k.deferred}</div><div className="l">Deferred</div></div>
        <div className={'kpi' + (k.overdue ? ' hot' : '')}><div className="n">{k.overdue}</div><div className="l">Overdue</div></div>
        <div className="kpi"><div className="n">{k.completed}</div><div className="l">Completed (total)</div></div>
        <div className="kpi"><div className="n">{k.completedThisMonth}</div><div className="l">Completed this month</div></div>
        <div className="kpi"><div className="n">{k.avgLead}</div><div className="l">Avg lead time (days)</div></div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Bars title="Tasks by status" items={byStatus} />
        <Bars title="Open tasks by assignee" items={byImplementor} />
      </div>
    </>
  )
}
