// ── ΠΡΟΣΩΡΙΝΗ ΣΕΛΙΔΑ IMPORT (COO_RACI_with_Deadlines.xlsx) ─────────────────────
// Admin-only. Ανοίγει από το URL /import. Κάνει preview + import των 28 projects
// στη λίστα Projects μέσω Graph (με το token του logged-in χρήστη).
// Μετά την επιτυχή εισαγωγή μπορεί να διαγραφεί (αρχείο + route στο App.jsx).
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../App'
import { LISTS, listItems } from '../lib/sp'
import { createProject, fetchProjects } from '../lib/projects'
import { fetchUserOptions } from '../lib/api'

const STATUS_ON_IMPORT = 'In Progress'

// Δεδομένα από COO_RACI_with_Deadlines.xlsx (RACI = Abbreviations ενωμένα με '+')
const ROWS = [
  { title: 'Retail division :(αντικατάσταση Παπαϊωάννου, Βιταλιώτη, κατάργηση θέσης  Καρακώστα) 90 ημέρες', owner: 'd.tsoukaneli@inventor.ac', deadline: '2026-10-31', R: 'HR', A: 'RETL', C: '', I: 'COO+CCO+CEO' },
  { title: 'B2B: division (αντικατάσταση Καραμανώλη, περίοδος χάριτος Φρίντζου) 90 ημέρες', owner: 'd.tsoukaneli@inventor.ac', deadline: '2026-10-31', R: 'HR', A: 'B2B', C: '', I: 'COO+CCO+CEO' },
  { title: 'CS : department (αντικατάσταση Καργιατλή, Καραγιοβάνη) 60 ημέρες', owner: 'd.tsoukaneli@inventor.ac', deadline: '2026-09-30', R: 'HR', A: 'RETL', C: '', I: 'COO+CCO+CEO' },
  { title: 'Logistics: ( supply chain director (new) , logistics director Πετροπούλου, αντικατάσταση ατόμων, μετακίνηση 3 ατόμων από spare parts logistics) και ενοποίηση logistics προϊόντων, ανταλλακτικών, εξαγωγών 90-120 ημέρες', owner: 'd.tsoukaneli@inventor.ac', deadline: '2026-11-30', R: 'HR+LOG+A/S', A: '', C: '', I: 'COO+CCO+CEO' },
  { title: 'Exports: σταδιακή μεταφορά αρμοδιοτήτων από την Ντάνα (κατάργηση θέσης) στη Θεοχάρη και στο Βαλεντίνο  εως 31/12', owner: 'd.tsoukaneli@inventor.ac', deadline: '2026-12-31', R: 'HR', A: 'EXP', C: '', I: 'COO+CCO+CEO' },
  { title: 'Operations : προσθήκη ενός ατόμου ως project leader/trade MKT  60-90 ημέρες', owner: 'm.flouris@inventor.ac', deadline: '2026-10-31', R: 'HR', A: '', C: 'COO', I: 'COO+CCO+CEO' },
  { title: 'Ολοκλήρωση καταχώρησης της εμπορικής πολιτικής στο ERP (60 ημέρες)', owner: 'm.flouris@inventor.ac', deadline: '2026-09-30', R: 'MANOS', A: 'COO', C: 'CS', I: 'CEO+RETL+B2B' },
  { title: 'Sales team follow up seminar στο  My inventor order process για τη σωστή καταχώρηση και την αύξηση του ποσοστού παραγγελιών (30 ημέρες). Τακτική παρακολούθηση από cs & logistics για την εξομάλυνση των προβλημάτων (διπλές καταχωρήσεις)', owner: 'm.flouris@inventor.ac', deadline: '2026-08-31', R: 'CHRIS', A: 'COO', C: 'CS', I: 'CEO+RETL+B2B' },
  { title: 'Keyvoto PIΜ: Full deployment  (related to PM’s category launches)', owner: 'm.flouris@inventor.ac', deadline: '2027-07-31', R: 'PROD+MKTG', A: 'COO', C: '', I: 'CEO+RETL+B2B' },
  { title: 'Store locator integration (60 ημέρες)', owner: 'm.flouris@inventor.ac', deadline: '2026-09-30', R: 'CHRIS', A: 'COO', C: 'CS', I: 'CEO+RETL+B2B' },
  { title: 'INVY: full adoption & optimization (90 days)', owner: 'm.flouris@inventor.ac', deadline: '2026-10-31', R: 'MKTG+PROD', A: 'COO', C: 'A/S', I: 'CEO+RETL+B2B' },
  { title: 'B2B Partner program: e value αξιολόγηση του υφιστάμενου πελατολογίου και λανσάρισμα του προγράμματος ως έχει σχεδιαστεί με τα κριτήρια και τα benefits (90 ημέρες)', owner: 'm.flouris@inventor.ac', deadline: '2026-10-31', R: 'B2B+MKTG+CHRIS', A: 'COO', C: 'COO', I: 'CEO' },
  { title: 'Loyalty program: terms & conditions review , εκπαίδευση ομάδας πωλήσεων για το λανσάρισμα και το follow up (120-150 ημέρες)', owner: 'm.flouris@inventor.ac', deadline: '2026-12-31', R: 'CHRIS+MANOS', A: 'COO', C: 'COO', I: 'CEO+RETL+B2B' },
  { title: 'ERP master data improvements  & compliance (based on self assessment essay)', owner: 'm.flouris@inventor.ac', deadline: '2027-07-31', R: 'MANOS', A: 'COO', C: 'CFO', I: 'CEO' },
  { title: '1-2-1 directors meeting with COO on project basis follow up or other operational issues', owner: 'm.flouris@inventor.ac', deadline: '2026-07-31', R: 'ALL', A: 'COO', C: '', I: 'CEO' },
  { title: 'Departmental meetings για καθορισμό διαδικασιών:', owner: 'm.flouris@inventor.ac', deadline: '2026-08-31', R: 'ALL', A: 'COO', C: 'COO', I: 'CEO' },
  { title: 'Sales /product meetings (monthly/biweekly για ενημέρωση ανταγωνισμού, παρακολούθηση budget πωλήσεων και αποθεμάτων, νέα προϊόντα, παράπονα πελατών etc.', owner: 'm.flouris@inventor.ac', deadline: '2026-07-31', R: 'PROD+B2B+RETL', A: 'PROD', C: 'COO', I: 'CEO' },
  { title: 'Product / technical monthly meeting για παρακολούθηση  βλαβών, τεχνικών θεμάτων, εκπαιδεύσεις etc.', owner: 'm.flouris@inventor.ac', deadline: '2026-07-31', R: 'PROD+A/S', A: 'PROD+A/S', C: '', I: 'COO+CEO' },
  { title: 'Roadmap προϊόντων για έλεγχο, ανάγκες ΜΚΤ, ενημέρωση logistics, εκπαιδεύσεις εταιρικές  Product department', owner: 'm.flouris@inventor.ac', deadline: '2026-09-30', R: '', A: '', C: '', I: '' },
  { title: 'Διαδικασία ελέγχου δειγμάτων, νέων προϊόντων, με prerequisite list (manuals, photos, test reports, etc.) Product –technical -MKT', owner: 'm.flouris@inventor.ac', deadline: '2026-09-30', R: 'PROD+MKTG+A/S', A: 'PROD', C: 'COO', I: 'CEO' },
  { title: 'Calendar Tech days/customers events (Pulse) Technical /MKT departments', owner: 'm.flouris@inventor.ac', deadline: '2026-08-31', R: 'B2B+MKTG+A/S', A: 'B2B', C: 'COO', I: 'CEO' },
  { title: 'Διαδικασία επιστροφών (Β διαλογής) Logistics-technical departments', owner: 'm.flouris@inventor.ac', deadline: '2026-10-31', R: 'A/S+PROD+LOG', A: 'A/S', C: 'COO', I: 'CEO+RETL+B2B' },
  { title: 'Διαδικασία απογραφής ανταλλακτικών, έλεγχος αποθεμάτων και μεταφορά  από Sarmed', owner: 'm.flouris@inventor.ac', deadline: '2026-09-30', R: 'A/S+LOG', A: 'LOG', C: 'COO', I: 'CEO' },
  { title: 'Διαδικασία εγκρίσεων εξοδολογίων  Finance department 60 ημέρες', owner: 'm.flouris@inventor.ac', deadline: '2026-09-30', R: '', A: 'CFO', C: 'COO', I: 'CEO' },
  { title: 'Departments’ Manuals completion (COO over directors ) 60 ημερες', owner: 'm.flouris@inventor.ac', deadline: '2026-09-30', R: 'ALL', A: 'COO', C: 'COO', I: 'CEO' },
  { title: 'Logistics partners finalization - 12 months', owner: 'm.flouris@inventor.ac', deadline: '2027-07-31', R: 'LOG', A: 'COO', C: 'COO', I: 'CEO' },
  { title: 'New web site  - 12 months', owner: 'm.flouris@inventor.ac', deadline: '2027-07-31', R: 'CHRIS+MKTG+PROD', A: 'MKTG', C: 'COO', I: 'CEO' },
  { title: 'IT Governance & IT improvement operating model  - 12 months', owner: 'm.flouris@inventor.ac', deadline: '2027-07-31', R: 'COO', A: 'COO', C: 'IT', I: 'CEO' },
]

const RACI_KEYS = [['R', 'responsible_ids'], ['A', 'accountable_ids'], ['C', 'consulted_ids'], ['I', 'informed_ids']]

const norm = (s) => (s ?? '').trim().toUpperCase()

export default function ProjectImport() {
  const nav = useNavigate()
  const { effectiveRole } = useSession()
  const [users, setUsers] = useState(null)        // [{id, name, email}]
  const [resources, setResources] = useState(null) // [{id, title, abbr}]
  const [existing, setExisting] = useState(null)   // Set of existing titles (normalized)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)   // { done, total }
  const [results, setResults] = useState(null)     // [{ title, ok, id?, error? }]

  useEffect(() => {
    Promise.all([
      fetchUserOptions(),
      listItems(LISTS.resources),
      fetchProjects().catch(() => []),
    ]).then(([u, res, projs]) => {
      setUsers(u)
      setResources(res.map((i) => ({
        id: String(i.id),
        title: i.fields?.Title ?? '',
        abbr: norm(i.fields?.Abbreviation),
      })))
      setExisting(new Set(projs.map((p) => norm(p.title))))
    }).catch((e) => setError(e.message ?? 'Load failed.'))
  }, [])

  // Ανάλυση: owner email → user id, abbreviations → resource ids
  const analysis = useMemo(() => {
    if (!users || !resources || !existing) return null
    const emailMap = new Map(users.map((u) => [norm(u.email), u.id]))
    const abbrMap = new Map()
    for (const r of resources) {
      if (r.abbr) abbrMap.set(r.abbr, r.id)
      if (r.title) abbrMap.set(norm(r.title), abbrMap.get(norm(r.title)) ?? r.id) // fallback: πλήρες όνομα
    }
    return ROWS.map((row) => {
      const owner_id = emailMap.get(norm(row.owner)) ?? ''
      const unmatched = []
      const ids = {}
      for (const [xk, fk] of RACI_KEYS) {
        ids[fk] = []
        for (const tok of (row[xk] ?? '').split('+').map(norm).filter(Boolean)) {
          const rid = abbrMap.get(tok)
          if (rid) ids[fk].push(rid)
          else unmatched.push(tok)
        }
      }
      return {
        ...row, owner_id, ...ids,
        unmatched: [...new Set(unmatched)],
        ownerMissing: !owner_id,
        duplicate: existing.has(norm(row.title)),
      }
    })
  }, [users, resources, existing])

  const importable = (analysis ?? []).filter((r) => !r.duplicate)
  const allUnmatched = [...new Set((analysis ?? []).flatMap((r) => r.unmatched))]

  const runImport = async () => {
    setBusy(true); setError(''); setResults(null)
    const out = []
    setProgress({ done: 0, total: importable.length })
    for (const row of importable) {
      try {
        const nid = await createProject({
          title: row.title,
          owner_id: row.owner_id,
          deadline: row.deadline,
          status: STATUS_ON_IMPORT,
          responsible_ids: row.responsible_ids,
          accountable_ids: row.accountable_ids,
          consulted_ids: row.consulted_ids,
          informed_ids: row.informed_ids,
        })
        out.push({ title: row.title, ok: true, id: nid })
      } catch (e) {
        out.push({ title: row.title, ok: false, error: e.message ?? 'failed' })
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }))
    }
    setResults(out)
    setBusy(false)
  }

  if (effectiveRole !== 'admin') return <div className="empty">Admin only.</div>

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Import projects</h1>
          <div className="sub">COO_RACI_with_Deadlines.xlsx → Projects list · Status: «{STATUS_ON_IMPORT}» · Προσωρινή σελίδα</div>
        </div>
        <button className="btn" onClick={() => nav('/projects')}>← Projects</button>
      </div>

      {error && <div className="err">{error}</div>}
      {!analysis && !error && <div className="card"><div className="empty">Φόρτωση λιστών αναφοράς…</div></div>}

      {analysis && !results && (
        <>
          {allUnmatched.length > 0 && (
            <div className="card" style={{ padding: 14, marginBottom: 12, borderLeft: '4px solid #d97706' }}>
              <b>Abbreviations που δεν βρέθηκαν στο Resource List:</b> {allUnmatched.join(', ')}
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                Θα παραλειφθούν από τα RACI των αντίστοιχων εγγραφών (το υπόλοιπο θα εισαχθεί κανονικά).
                Αν προσθέσεις τα abbreviations στο Resource List και κάνεις reload, θα αντιστοιχιστούν.
              </div>
            </div>
          )}
          <div className="toolbar">
            <span className="grid-count">
              {importable.length} προς εισαγωγή · {analysis.length - importable.length} υπάρχουν ήδη (παραλείπονται)
            </span>
            <div className="spacer" />
            <button className="btn primary" onClick={runImport} disabled={busy || importable.length === 0}>
              {busy && progress ? `Εισαγωγή… ${progress.done}/${progress.total}` : `Import ${importable.length} projects`}
            </button>
          </div>
          <div className="card">
            <div className="tablewrap">
              <table>
                <thead>
                  <tr><th>Title</th><th>Owner</th><th>Deadline</th><th>R</th><th>A</th><th>C</th><th>I</th><th>Έλεγχος</th></tr>
                </thead>
                <tbody>
                  {analysis.map((r, i) => (
                    <tr key={i} style={r.duplicate ? { opacity: 0.45 } : undefined}>
                      <td><span className="ctitle" title={r.title}>{r.title}</span></td>
                      <td style={r.ownerMissing ? { color: '#b91c1c' } : undefined}>{r.owner}</td>
                      <td className="mono">{r.deadline}</td>
                      <td>{r.R || '—'}</td><td>{r.A || '—'}</td><td>{r.C || '—'}</td><td>{r.I || '—'}</td>
                      <td>
                        {r.duplicate ? 'Υπάρχει ήδη'
                          : r.ownerMissing ? <span style={{ color: '#b91c1c' }}>Άγνωστος owner</span>
                          : r.unmatched.length ? <span style={{ color: '#d97706' }}>χωρίς: {r.unmatched.join(', ')}</span>
                          : 'OK'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {results && (
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>
            Ολοκληρώθηκε: {results.filter((r) => r.ok).length} επιτυχή, {results.filter((r) => !r.ok).length} αποτυχίες
          </h3>
          <ul style={{ paddingLeft: 18 }}>
            {results.map((r, i) => (
              <li key={i} style={{ color: r.ok ? 'inherit' : '#b91c1c' }}>
                {r.ok ? `#${r.id} — ${r.title}` : `✗ ${r.title} — ${r.error}`}
              </li>
            ))}
          </ul>
          <button className="btn primary" onClick={() => nav('/projects')}>Μετάβαση στα Projects</button>
        </div>
      )}
    </>
  )
}
