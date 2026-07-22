import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../App'
import { fetchProjects } from '../lib/projects'
import { fetchRequests, fetchResources } from '../lib/api'
import { LISTS, getCommentsWithReplies, addReply } from '../lib/sp'
import { fmtDate, fmtDateTime } from '../lib/meta'

// ── Welcome Screen ─
// 1ο section: θέματα άμεσης προσοχής — tabs My Tasks / My Projects,
//   φίλτρα Upcoming (deadline στην τρέχουσα εβδομάδα), Overdue,
//   Completed (τελευταίες 30 ημέρες).
// 2ο section: Activity Feeds — wall με τα comments όλων των χρηστών σε
//   projects & tasks (νεότερο → παλαιότερο), με δυνατότητα reply.
//   Admin: όλα. Λοιποί: μόνο projects όπου είναι Owner/Supervisor/RACI
//   (και τα tasks αυτών των projects).

const RACI_KEYS = ['responsible_ids', 'accountable_ids', 'consulted_ids', 'informed_ids']
const RACI_LETTER = { responsible_ids: 'R', accountable_ids: 'A', consulted_ids: 'C', informed_ids: 'I' }

const trim = (s, n = 60) => ((s ?? '').length > n ? (s ?? '').slice(0, n - 1) + '…' : (s ?? ''))

// Τρέχουσα εβδομάδα: Δευτέρα 00:00 → Κυριακή 23:59
function weekRange() {
  const now = new Date()
  const start = new Date(now)
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return [start, end]
}
const today = () => new Date(new Date().toDateString())
const daysAgo = (n) => { const d = today(); d.setDate(d.getDate() - n); return d }

const chunks = (arr, n) => {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

export default function WelcomePage() {
  const nav = useNavigate()
  const { profile, effectiveRole } = useSession()
  const me = (profile.email ?? '').toLowerCase()
  const firstName = (profile.name ?? '').trim().split(/\s+/)[0] || profile.name

  const [tasks, setTasks] = useState([])
  const [projects, setProjects] = useState([])
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('tasks')
  const [filter, setFilter] = useState('upcoming')

  // Activity feed
  const [feed, setFeed] = useState(null) // null = φόρτωση
  const [replyTo, setReplyTo] = useState(null) // post id
  const [replyText, setReplyText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([
      fetchRequests().then(setTasks).catch(() => setTasks([])),
      fetchProjects().then(setProjects).catch(() => setProjects([])),
      fetchResources().then(setResources).catch(() => setResources([])),
    ]).finally(() => setLoading(false))
  }, [])

  const myResourceIds = useMemo(
    () => new Set(resources.filter((r) => r.email && r.email === me).map((r) => String(r.id))),
    [resources, me])

  // Ρόλοι μου σε ένα project: Owner / Supervisor / R / A / C / I
  const myProjectRoles = (p) => {
    const roles = []
    if (p.owner_email === me) roles.push('Owner')
    if (p.supervisor_email === me) roles.push('Supervisor')
    for (const k of RACI_KEYS) if ((p[k] ?? []).some((id) => myResourceIds.has(String(id)))) roles.push(RACI_LETTER[k])
    return roles
  }

  // ── My Tasks: Created By / Assigned to ─
  const myTasks = useMemo(() => tasks.filter((t) =>
    (t.requestor_email ?? '').toLowerCase() === me
    || (t.assigned_to_email ?? '').toLowerCase() === me), [tasks, me])

  // ── My Projects: Owner / Supervisor / RACI ─
  const myProjects = useMemo(
    () => projects.filter((p) => myProjectRoles(p).length > 0),
    [projects, me, myResourceIds])

  // ── Φίλτρα (κοινή λογική για tasks & projects) ─
  const [wkStart, wkEnd] = weekRange()
  const inWeek = (iso) => { if (!iso) return false; const d = new Date(iso.slice(0, 10)); return d >= wkStart && d <= wkEnd }
  const isPast = (iso) => Boolean(iso) && new Date(iso.slice(0, 10)) < today()
  const within30 = (iso) => Boolean(iso) && new Date(iso) >= daysAgo(30)

  const taskDone = (t) => t.status === 'Completed'
  const projDone = (p) => p.status === 'Completed'

  const filteredTasks = useMemo(() => myTasks.filter((t) => {
    if (filter === 'upcoming') return !taskDone(t) && inWeek(t.golive_required)
    if (filter === 'overdue') return !taskDone(t) && isPast(t.golive_required)
    return taskDone(t) && within30(t.actual_completion || t.modified_at)
  }), [myTasks, filter])

  const filteredProjects = useMemo(() => myProjects.filter((p) => {
    if (filter === 'upcoming') return !projDone(p) && inWeek(p.deadline)
    if (filter === 'overdue') return !projDone(p) && isPast(p.deadline)
    return projDone(p) && within30(p.end_date || p.modified_at)
  }), [myProjects, filter])

  const counts = useMemo(() => {
    const cnt = (rows, done, due, doneAt) => ({
      upcoming: rows.filter((r) => !done(r) && inWeek(due(r))).length,
      overdue: rows.filter((r) => !done(r) && isPast(due(r))).length,
      completed: rows.filter((r) => done(r) && within30(doneAt(r))).length,
    })
    return tab === 'tasks'
      ? cnt(myTasks, taskDone, (t) => t.golive_required, (t) => t.actual_completion || t.modified_at)
      : cnt(myProjects, projDone, (p) => p.deadline, (p) => p.end_date || p.modified_at)
  }, [tab, myTasks, myProjects])

  // ── Activity Feed ─
  useEffect(() => {
    if (loading) return
    let cancelled = false
    const load = async () => {
      const scopedProjects = effectiveRole === 'admin' ? projects : myProjects
      const pids = new Set(scopedProjects.map((p) => String(p.id)))
      const scopedTasks = effectiveRole === 'admin' ? tasks : tasks.filter((t) => pids.has(String(t.project_id)))
      const items = [
        ...scopedProjects.map((p) => ({
          list: LISTS.projects, key: `p${p.id}`, id: p.id, path: `/projects/${p.id}`,
          label: `Σχετικά με το project: ${trim(p.title)} – ${fmtDate(p.deadline)}`,
        })),
        ...scopedTasks.map((t) => ({
          list: LISTS.requests, key: `t${t.id}`, id: t.id, path: `/requests/${t.id}`,
          label: `Σχετικά με το task: ${trim(t.title)} – ${fmtDate(t.golive_required)}`,
        })),
      ]
      const posts = []
      for (const batch of chunks(items, 8)) {
        if (cancelled) return
        await Promise.all(batch.map(async (it) => {
          const cs = await getCommentsWithReplies(it.list, it.id).catch(() => [])
          for (const c of cs) posts.push({ ...c, item: it })
        }))
      }
      if (cancelled) return
      posts.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      setFeed(posts.slice(0, 50))
    }
    load()
    return () => { cancelled = true }
  }, [loading, effectiveRole, projects, tasks, myProjects])

  // Ανανέωση των posts ενός item μετά από reply
  const refreshItem = async (item) => {
    const cs = await getCommentsWithReplies(item.list, item.id).catch(() => [])
    setFeed((f) => {
      const others = (f ?? []).filter((p) => p.item.key !== item.key)
      const fresh = cs.map((c) => ({ ...c, item }))
      return [...others, ...fresh].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 50)
    })
  }

  const sendReply = async (post) => {
    const t = replyText.trim()
    if (!t) return
    setBusy(true)
    try {
      await addReply(post.item.list, post.item.id, post.id, t)
      setReplyText(''); setReplyTo(null)
      await refreshItem(post.item)
    } catch { /* σιωπηλά — το feed παραμένει */ }
    setBusy(false)
  }

  const FILTER_DEFS = [
    ['upcoming', 'Upcoming'],
    ['overdue', 'Overdue'],
    ['completed', 'Completed'],
  ]

  const rows = tab === 'tasks' ? filteredTasks : filteredProjects

  return (
    <>
      {/* ── Header ─ */}
      <div className="pagehead">
        <div>
          <div className="welcome-date">
            {new Date().toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <h1 className="welcome-hi">Καλημέρα {firstName}</h1>
        </div>
      </div>

      {/* ── Section 1: Θέματα άμεσης προσοχής ─ */}
      <div className="card" style={{ padding: '14px 18px 18px', marginBottom: 18 }}>
        <div className="tabs" style={{ marginBottom: 10 }}>
          <button className={'tab' + (tab === 'tasks' ? ' on' : '')} onClick={() => setTab('tasks')}>My Tasks</button>
          <button className={'tab' + (tab === 'projects' ? ' on' : '')} onClick={() => setTab('projects')}>My Projects</button>
        </div>
        <div className="chips" style={{ gap: 8, marginBottom: 12 }}>
          {FILTER_DEFS.map(([k, label]) => (
            <button key={k} className={'chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>
              {label}{counts[k] ? ` (${counts[k]})` : ''}
            </button>
          ))}
        </div>

        {loading
          ? <div className="empty">Φόρτωση…</div>
          : rows.length === 0
            ? <div className="empty">Δεν υπάρχουν εγγραφές για αυτό το φίλτρο.</div>
            : (
              <div className="welcome-list">
                {tab === 'tasks'
                  ? filteredTasks.map((t) => (
                    <div key={t.id} className="welcome-row" onClick={() => nav(`/requests/${t.id}/edit`)}>
                      {trim(t.title)} – {fmtDate(t.golive_required)}
                      {t.project_name ? <span className="soft"> ({t.project_name})</span> : null}
                    </div>
                  ))
                  : filteredProjects.map((p) => (
                    <div key={p.id} className="welcome-row" onClick={() => nav(`/projects/${p.id}`)}>
                      {trim(p.title)} – {fmtDate(p.deadline)}
                      <span className="soft"> ({myProjectRoles(p).join(', ')})</span>
                    </div>
                  ))}
              </div>
            )}
      </div>

      {/* ── Section 2: Activity Feeds ─ */}
      <div className="card" style={{ padding: '14px 18px 18px' }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Activity Feeds</h2>
        {feed == null
          ? <div className="empty">Φόρτωση σχολίων…</div>
          : feed.length === 0
            ? <div className="empty">Δεν υπάρχουν σχόλια ακόμα.</div>
            : (
              <div className="comments">
                {feed.map((post) => (
                  <div className="comment" key={`${post.item.key}-${post.id}`}>
                    <div className="comment-head">
                      <b>{post.author || '—'}</b>
                      <span className="mono" style={{ color: 'var(--ink-soft)', fontSize: 11.5 }}>{fmtDateTime(post.created_at)}</span>
                    </div>
                    <div className="comment-body">{post.text}</div>

                    {/* Replies */}
                    {(post.replies ?? []).length > 0 && (
                      <div className="feed-replies">
                        {[...post.replies].sort((a, b) => (a.created_at > b.created_at ? 1 : -1)).map((r) => (
                          <div className="feed-reply" key={r.id}>
                            <b>{r.author || '—'}</b> <span className="mono" style={{ color: 'var(--ink-soft)', fontSize: 11 }}>{fmtDateTime(r.created_at)}</span>
                            <div className="comment-body" style={{ marginTop: 2 }}>{r.text}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Υποσημείωση: link προς project/task (view mode) */}
                    <div className="feed-foot">
                      <a onClick={(e) => { e.preventDefault(); nav(post.item.path) }} href={post.item.path}>{post.item.label}</a>
                      <button type="button" className="linklike"
                        onClick={() => { setReplyTo(replyTo === `${post.item.key}-${post.id}` ? null : `${post.item.key}-${post.id}`); setReplyText('') }}>
                        ↩ Reply
                      </button>
                    </div>

                    {replyTo === `${post.item.key}-${post.id}` && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <input style={{ flex: 1 }} value={replyText} autoFocus maxLength={1000}
                          placeholder="Γράψτε απάντηση…"
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') sendReply(post) }} />
                        <button type="button" className="btn sm primary" disabled={busy || !replyText.trim()} onClick={() => sendReply(post)}>
                          {busy ? '…' : 'Αποστολή'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
      </div>
    </>
  )
}
