import { useEffect, useState } from 'react'
import { LISTS, getListColumns, getSiteUsers, probeSiteUsers, probeItemFields, testIconWrite } from '../lib/sp'
import { REQUEST_FIELDS } from '../lib/fields'

const mapped = new Set(Object.values(REQUEST_FIELDS))

export default function Diag() {
  const [data, setData] = useState({})
  const [error, setError] = useState('')
  const [users, setUsers] = useState(null)
  const [usersErr, setUsersErr] = useState('')
  const [probe, setProbe] = useState(null)
  const [items, setItems] = useState(null)
  const [iconTest, setIconTest] = useState(null)
  const [iconTesting, setIconTesting] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const out = {}
        for (const name of Object.values(LISTS)) out[name] = await getListColumns(name)
        setData(out)
      } catch (e) { setError(e.message) }
    })()
    getSiteUsers()
      .then((m) => setUsers([...m.entries()].map(([id, v]) => ({ id, ...v }))))
      .catch((e) => setUsersErr(e.message ?? String(e)))
    probeSiteUsers().then(setProbe).catch((e) => setProbe({ fatal: e.message ?? String(e) }))
    probeItemFields().then(setItems).catch((e) => setItems({ fatal: e.message ?? String(e) }))
  }, [])

  const pre = { whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11.5, margin: 0, padding: '0 16px 14px' }

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Field mapping diagnostics</h1>
          <div className="sub">
            Live column definitions read from your SharePoint lists. Compare the internal
            names against <span className="mono">src/lib/fields.js</span> — for the Requests
            list, ✓ marks columns the app currently maps.
          </div>
        </div>
      </div>
      {error && <div className="err">{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ padding: '14px 16px 4px', fontSize: 14 }}>Site users (person resolution)</h3>
        <div style={{ padding: '0 16px 8px', fontSize: 13 }}>
          {usersErr ? <span className="err">Failed: {usersErr}</span>
            : users == null ? 'Probing…'
            : <>Resolved <b>{users.length}</b> users.{users.length > 0 &&
                <> Sample: {users.slice(0, 5).map((u) => `${u.title} <${u.email}>`).join(', ')}</>}</>}
        </div>
        <pre style={pre}>{probe ? JSON.stringify(probe, null, 2) : 'Probing…'}</pre>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ padding: '14px 16px 4px', fontSize: 14 }}>Sample item fields (Projects / Tasks)</h3>
        <pre style={pre}>{items ? JSON.stringify(items, null, 2) : 'Probing…'}</pre>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ padding: '14px 16px 4px', fontSize: 14 }}>Project_Icon write test</h3>
        <div style={{ padding: '0 16px 14px' }}>
          <button className="btn primary" disabled={iconTesting} onClick={async () => {
            setIconTesting(true); setIconTest(null)
            try { setIconTest(await testIconWrite()) } catch (e) { setIconTest({ fatal: e.message }) }
            setIconTesting(false)
          }}>{iconTesting ? 'Testing…' : 'Run test write → read back'}</button>
          {iconTest && <pre style={{ ...pre, marginTop: 10 }}>{JSON.stringify(iconTest, null, 2)}</pre>}
        </div>
      </div>

      {Object.entries(data).map(([list, cols]) => (
        <div className="card" key={list} style={{ marginBottom: 16 }}>
          <h3 style={{ padding: '14px 16px 4px', fontSize: 14 }}>{list}</h3>
          <table>
            <thead><tr><th>Display name</th><th>Internal name</th><th>Type</th><th /></tr></thead>
            <tbody>
              {cols.map((c) => (
                <tr key={c.id} style={{ cursor: 'default' }}>
                  <td>{c.displayName}</td>
                  <td className="mono">{c.name}</td>
                  <td>{c.text ? (c.text.allowMultipleLines ? 'text (multi-line ✓)' : 'text (single-line ⚠️)') : c.dateTime ? 'date' : c.number ? 'number' : c.choice ? 'choice' : c.personOrGroup ? 'person' : '—'}</td>
                  <td>{list === LISTS.requests && mapped.has(c.name) ? '✓ mapped' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  )
}
