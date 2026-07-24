import { useEffect, useState } from 'react'

/* ─────────────────────────────────────────────────────────────
   Animated performance gauges (meter style, πράσινο → κόκκινο)

   <TaskGauges r={request} /> εμφανίζει 2 συμμετρικά gauges:
   1. Χρονοδιάγραμμα — % ολοκλήρωσης vs αναμενόμενο βάσει
      ημερολογιακού χρόνου (Actual Start → Due date).
   2. Ώρες εργασίας — % ολοκλήρωσης vs % καταναλωμένων ωρών
      (actual/estimated man-hours).
   Η βελόνα δείχνει την απόκλιση σε ποσοστιαίες μονάδες:
   αριστερά (κόκκινο) = εκτός/πίσω · δεξιά (πράσινο) = εντός/μπροστά.
   ───────────────────────────────────────────────────────────── */

const clamp = (v, a, b) => Math.min(Math.max(v, a), b)

// green → amber → red
const STOPS = [[21, 128, 61], [234, 179, 8], [220, 38, 38]]
function zoneColor(v) {
  const t = (clamp(v, 0, 100) / 100) * (STOPS.length - 1)
  const i = Math.min(Math.floor(t), STOPS.length - 2)
  const f = t - i
  const c = STOPS[i].map((a, k) => Math.round(a + (STOPS[i + 1][k] - a) * f))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function useCountUp(target, dur = 1400) {
  const [n, setN] = useState(0)
  useEffect(() => {
    let raf
    const t0 = performance.now()
    const step = (t) => {
      const p = Math.min((t - t0) / dur, 1)
      const e = 1 - Math.pow(1 - p, 3) // ease-out cubic
      setN(Math.round(target * e))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, dur])
  return n
}

/* Γεωμετρία: ημικύκλιο, κέντρο (150,160), ακτίνα τόξου 120.
   value 0..100 → γωνία βελόνας -90°..+90° (αριστερά → δεξιά). */
const CX = 150, CY = 160, R = 120

function polar(v, r) {
  const deg = 180 - v * 1.8
  const rad = (deg * Math.PI) / 180
  return [CX + r * Math.cos(rad), CY - r * Math.sin(rad)]
}

export function Gauge({ title, subtitle, value, num, label, detail, noData }) {
  const target = noData ? 0 : clamp(value, 0, 100)
  const [v, setV] = useState(100)
  useEffect(() => {
    const t = setTimeout(() => setV(target), 80)
    return () => clearTimeout(t)
  }, [target])
  const shown = useCountUp(noData ? 0 : num)
  const color = noData ? '#9ca3af' : zoneColor(target)
  const gid = 'gg-' + title.replace(/\W/g, '')

  const ticks = []
  for (let t = 0; t <= 100; t += 10) {
    const major = t % 50 === 0
    const [x1, y1] = polar(t, major ? 92 : 97)
    const [x2, y2] = polar(t, 104)
    ticks.push(<line key={t} x1={x1} y1={y1} x2={x2} y2={y2}
      stroke="var(--ink-soft)" strokeOpacity=".45" strokeWidth={major ? 2.5 : 1.5} />)
  }

  return (
    <div className="gauge-card card">
      <div className="gauge-title">{title}</div>
      <div className="gauge-sub">{subtitle}</div>
      <svg viewBox="0 0 300 178" className="gauge-svg" role="img" aria-label={`${title}: ${noData ?? label}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#dc2626" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>
          <filter id={gid + '-glow'} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* τροχιά + χρωματική κλίμακα */}
        <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none" stroke="var(--line)" strokeWidth="26" strokeLinecap="round" />
        <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none" stroke={noData ? '#d1d5db' : `url(#${gid})`}
          strokeWidth="18" strokeLinecap="round" opacity={noData ? 0.6 : 1} />
        {ticks}

        {/* άκρα κλίμακας */}
        <text x={CX - R} y={CY + 16} textAnchor="middle" className="gauge-end" fill="#dc2626">ΕΚΤΟΣ</text>
        <text x={CX + R} y={CY + 16} textAnchor="middle" className="gauge-end" fill="#15803d">ΕΝΤΟΣ</text>

        {/* βελόνα */}
        <g style={{
          transform: `rotate(${-90 + (100 - v) * 1.8}deg)`,
          transformOrigin: `${CX}px ${CY}px`,
          transition: 'transform 1.5s cubic-bezier(.22,1.35,.4,1)',
        }} filter={noData ? undefined : `url(#${gid}-glow)`}>
          <polygon points={`${CX},${CY - 96} ${CX - 5.5},${CY} ${CX + 5.5},${CY}`}
            fill={color} />
        </g>
        <circle cx={CX} cy={CY} r="11" fill="var(--ink)" />
        <circle cx={CX} cy={CY} r="4.5" fill={color} />
      </svg>

      {noData ? (
        <>
          <div className="gauge-big" style={{ color: 'var(--ink-soft)' }}>Χωρίς δεδομένα</div>
          <div className="gauge-detail">{noData}</div>
        </>
      ) : (
        <>
          <div className="gauge-big" style={{ color }}>{label.replace('%n', String(shown))}</div>
          <div className="gauge-detail mono">{detail}</div>
        </>
      )}
    </div>
  )
}

/* ── Υπολογισμοί ανά task ── */

function statusLabel(dev) {
  if (dev < 0) return 'Μπροστά κατά %n μον.'
  if (dev === 0) return 'Ακριβώς εντός στόχου'
  if (dev <= 10) return 'Οριακά πίσω (%n μον.)'
  return 'Πίσω κατά %n μον.'
}

export function TaskGauges({ r }) {
  const pct = r.percent_complete ?? 0

  // 1. Ημερολογιακό: αναμενόμενη πρόοδος βάσει elapsed / (start → due)
  let g1
  const start = r.expected_start ?? r.request_date
  const due = r.golive_required
  if (!start || !due || !(new Date(due) > new Date(start))) {
    g1 = { noData: 'Απαιτούνται ημερομηνία έναρξης και προθεσμία (Due date)' }
  } else {
    const end = r.actual_completion ? new Date(r.actual_completion) : new Date()
    const expected = Math.round(clamp((end - new Date(start)) / (new Date(due) - new Date(start)), 0, 1) * 100)
    const dev = expected - pct
    g1 = {
      value: clamp(dev, 0, 100),
      num: Math.abs(dev),
      label: statusLabel(dev),
      detail: `Πραγματικό ${pct}% · Αναμενόμενο ${expected}%`,
    }
  }

  // 2. Ώρες: πρόοδος vs καταναλωμένες ώρες / εκτίμηση
  let g2
  const est = Number(r.estimated_manhours)
  const act = Number(r.actual_manhours ?? 0)
  if (!est || est <= 0) {
    g2 = { noData: 'Απαιτείται εκτίμηση ωρών (Estimated man-hours)' }
  } else {
    const consumed = Math.round((act / est) * 100)
    const dev = consumed - pct
    g2 = {
      value: clamp(dev, 0, 100),
      num: Math.abs(dev),
      label: statusLabel(dev),
      detail: `Ολοκλήρωση ${pct}% · Ώρες ${act}/${est} (${consumed}%)`,
    }
  }

  return (
    <div className="gauges-row">
      <Gauge title="Χρονοδιάγραμμα" subtitle="Πρόοδος έναντι ημερολογιακού χρόνου έως την προθεσμία" {...g1} />
      <Gauge title="Ώρες εργασίας" subtitle="Πρόοδος έναντι καταναλωμένων ωρών επί της εκτίμησης" {...g2} />
    </div>
  )
}
