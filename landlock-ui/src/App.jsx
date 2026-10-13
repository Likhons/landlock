import { useEffect, useState } from 'react'
import { Logo, LogoMark } from './Logo.jsx'

// Backend address: set VITE_API_URL in landlock-ui/.env (see .env.example); defaults to the local backend.
const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

const RISK_LABEL = {
  green: { bn: 'কোনো সতর্কতা পাওয়া যায়নি (Green)', en: 'No warnings found (Green)', icon: 'check' },
  yellow: { bn: 'সতর্কতা (Yellow)', en: 'Caution (Yellow)', icon: 'alert' },
  red: { bn: 'ঝুঁকিপূর্ণ (Red)', en: 'High risk (Red)', icon: 'x' },
}
const REASON_ICON = { green: 'check', yellow: 'alert', red: 'x' }

const EVENT_LABEL = {
  SALE_INITIATED: { bn: 'বিক্রয় শুরু', en: 'Sale initiated' },
  SALE_BLOCKED: { bn: 'বিক্রয় আটকানো হয়েছে', en: 'Sale blocked' },
  REGISTRATION_DONE: { bn: 'দলিল নিবন্ধিত', en: 'Deed registered' },
  MUTATION_DONE: { bn: 'নামজারি সম্পন্ন', en: 'Mutation done' },
  MUTATION_REJECTED: { bn: 'নামজারি বাতিল (বিরোধপূর্ণ)', en: 'Mutation rejected (Disputed)' },
  SALE_CANCELLED: { bn: 'বিক্রয় বাতিল', en: 'Sale cancelled' },
  MORTGAGE_CREATED: { bn: 'বন্ধক নিবন্ধিত', en: 'Mortgage registered' },
  MORTGAGE_BLOCKED: { bn: 'বন্ধক আটকানো হয়েছে', en: 'Mortgage blocked' },
  MORTGAGE_RELEASED: { bn: 'বন্ধক মুক্ত', en: 'Mortgage released' },
  GENESIS: { bn: 'শুরুর রেজিস্টার (Genesis)', en: 'Starting register (Genesis)' },
  REGISTRY_MUTATION_DONE: { bn: 'পুরনো দলিলের নামজারি সম্পন্ন', en: 'Mutation of earlier deed done' },
}
const BAD_EVENTS = ['SALE_BLOCKED', 'MORTGAGE_BLOCKED', 'MUTATION_REJECTED']

// Fallback labels until /api/roles loads. Permissions always come from the server.
const ROLE_LABEL = {
  buyer: { bn: 'ক্রেতা', en: 'Buyer' },
  sub_registrar: { bn: 'সাব-রেজিস্ট্রার', en: 'Sub-Registrar' },
  ac_land: { bn: 'এসি ল্যান্ড অফিসার', en: 'AC Land Officer' },
}

const SAMPLE_BADGE = {
  bn: 'ডেমো / নমুনা তথ্য: সরকারি খতিয়ান রেকর্ড নয়',
  en: 'DEMO / SAMPLE DATA: not verified official khatian records',
}

const EXPLAINED = ['sale', 'inheritance', 'court', 'gift']
const SOURCE_LABEL = {
  original: { bn: 'মূল রেকর্ড', en: 'Original record' },
  sale: { bn: 'দলিল (বিক্রয়)', en: 'Deed (sale)' },
  inheritance: { bn: 'উত্তরাধিকার', en: 'Inheritance' },
  court: { bn: 'আদালতের আদেশ', en: 'Court order' },
  gift: { bn: 'দান/হেবা', en: 'Gift' },
  unknown: { bn: 'প্রমাণ নেই', en: 'No proof' },
}

// Small line icons (inline SVG, no icon library needed)
const ICONS = {
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  unlock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.6-1.8" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  x: <><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
  shieldX: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9.5 9.5 5 5M14.5 9.5l-5 5" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
  bank: <path d="M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18M12 3l9 5H3z" />,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  zap: <path d="M13 2 3 14h9l-1 8 10-12h-9z" />,
  refresh: <><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" /><path d="M21 3v5h-5" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  scroll: <><path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4" /><path d="M19 17V5a2 2 0 0 0-2-2H4" /></>,
}
function Icon({ name, size = 18 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

// Display only: a Free plot whose latest Sub-Registry deed names another buyer than the khatian owner.
// The server makes the actual decision (and blocks sales) with the same rule.
const deedMismatch = (p) => Boolean(p.registry && p.status === 'Free' && p.registry.buyer !== p.current_owner)

// DEMO: the chosen role is sent as a header. The server checks it on every write,
// but a header is not authentication (anyone can send any role).
async function post(path, body, role) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(role ? { 'X-Demo-Role': role } : {}) },
    body: JSON.stringify(body || {}),
  })
  return { status: r.status, body: await r.json() }
}

const sampleBadge = (lang) => <span className="badge sample">{SAMPLE_BADGE[lang]}</span>

// Error box for 403 (permission denied), 423 (ledger integrity) and other API errors
function ErrorBox({ body, lang }) {
  const denied = body.code === 'PERMISSION_DENIED'
  const integrity = body.code === 'INTEGRITY_FAILED'
  return (
    <div className="alert error">
      {denied && <div className="alert-title"><Icon name="lock" /> {lang === 'bn' ? 'অনুমতি নেই (সার্ভার আটকেছে)' : 'Permission denied (blocked by the server)'}</div>}
      {integrity && <div className="alert-title"><Icon name="shieldX" /> {lang === 'bn' ? 'Ledger যাচাই ব্যর্থ' : 'Ledger integrity check failed'}</div>}
      {body[lang] || body.error}
    </div>
  )
}

// Blocked (409) result with every reason
function BlockedBox({ title, reasons, lang }) {
  return (
    <div className="alert error">
      <div className="alert-title"><Icon name="x" /> {title}</div>
      <ul>{reasons.map((r) => <li key={r.code}><Icon name="x" size={15} /> {r[lang]}</li>)}</ul>
    </div>
  )
}

// Sub-Registry deed (registration) side by side with the khatian (mutation record)
function DeedVsKhatian({ plot, lang, children }) {
  const tr = (bn, en) => (lang === 'bn' ? bn : en)
  const r = plot.registry
  if (!r) return null
  const ownerOk = r.buyer === plot.current_owner
  const areaOk = r.area === plot.area
  const mismatch = deedMismatch(plot)
  const mark = (good, warnOnly) => (good
    ? <span className="cmp-ok"><Icon name="check" size={16} /></span>
    : <span className={warnOnly ? 'cmp-warn' : 'cmp-bad'}><Icon name={warnOnly ? 'alert' : 'x'} size={16} /></span>)
  const badge = mismatch ? <span className="badge red">{tr('মালিকের অমিল', 'Owner mismatch')}</span>
    : !areaOk ? <span className="badge amber">{tr('পরিমাণের অমিল', 'Area mismatch')}</span>
      : plot.status === 'Free' ? <span className="badge green">{tr('মিলেছে', 'Records agree')}</span> : null
  return (
    <div className="card">
      <div className="card-head">
        <h3><Icon name="file" /> {tr('দলিল বনাম খতিয়ান', 'Deed vs khatian')}</h3>
        {badge}
      </div>
      <div className="compare">
        <div className="cmp-h" />
        <div className="cmp-h">{tr('সাব-রেজিস্ট্রি দলিল', 'Sub-Registry deed')}<span>{tr('নিবন্ধন', 'registration')}</span></div>
        <div className="cmp-h">{tr('খতিয়ান', 'Khatian')}<span>{tr('এসি ল্যান্ড / নামজারি', 'AC Land / mutation')}</span></div>
        <div className="cmp-h" />

        <div className="cmp-k">{tr('মালিক', 'Owner')}</div>
        <div className="cmp-v">{r.buyer}</div>
        <div className="cmp-v">{plot.current_owner}</div>
        <div className="cmp-m">{plot.status === 'Free' ? mark(ownerOk) : <span className="cmp-wait"><Icon name="clock" size={16} /></span>}</div>

        <div className="cmp-k">{tr('পরিমাণ', 'Area')}</div>
        <div className="cmp-v">{r.area} {tr('শতক', 'decimal')}</div>
        <div className="cmp-v">{plot.area} {tr('শতক', 'decimal')}</div>
        <div className="cmp-m">{mark(areaOk, true)}</div>

        <div className="cmp-k">{tr('রেকর্ড', 'Record')}</div>
        <div className="cmp-v small">{tr('দলিল', 'Deed')} {r.deed_no}{r.date ? ` · ${r.date}` : ''}</div>
        <div className="cmp-v small">{tr('খতিয়ান', 'Khatian')} {plot.khatian_no} · {tr('দাগ', 'Dag')} {plot.dag_no}</div>
        <div className="cmp-m" />
      </div>
      <div className="fineprint">
        <Icon name="info" size={14} />
        {tr(`দলিলে বিক্রেতা: ${r.seller} · ${r.office}`, `Seller in deed: ${r.seller} · ${r.office}`)}
      </div>
      {plot.status === 'Pending' && !ownerOk && (
        <div className="alert info">{tr('এই দলিলের নামজারি LandLock-এ চলছে।', 'Mutation of this deed is in progress in LandLock.')}</div>
      )}
      {children}
    </div>
  )
}

function SurveyTimeline({ plot, lang }) {
  const tr = (bn, en) => (lang === 'bn' ? bn : en)
  const chain = plot.survey || []
  if (chain.length === 0) return null
  return (
    <div className="card">
      <div className="card-head">
        <h3><Icon name="scroll" /> {tr('জরিপ ইতিহাস', 'Survey history')} <span className="muted" style={{ fontWeight: 500, fontSize: 14 }}>CS → SA → RS → BS</span></h3>
        {sampleBadge(lang)}
      </div>
      <ol className="timeline">
        {chain.map((s, i) => {
          const prev = chain[i - 1]
          const ownerChanged = prev && s.owner !== prev.owner
          const unexplained = ownerChanged && !EXPLAINED.includes(s.source)
          const areaUp = prev && s.area > prev.area
          const flagged = unexplained || areaUp
          return (
            <li key={s.survey} className={flagged ? 'flag' : ''}>
              {i > 0 && (
                <div className={`tl-change${flagged ? ' flag' : ''}`}>
                  {ownerChanged ? tr('মালিক পরিবর্তন', 'Owner changed') : tr('একই মালিক', 'Same owner')}
                  {unexplained && ` ⚠️ ${tr('প্রমাণ নেই', 'no proof')}`}
                  {areaUp && ` ⚠️ ${tr('পরিমাণ বেড়েছে', 'area increased')}`}
                </div>
              )}
              <div className="tl-box">
                <div className="tl-top">
                  <b>{s.survey} <span className="muted" style={{ fontWeight: 500 }}>({s.year})</span></b>
                  <span>{s.owner} · {s.area} {tr('শতক', 'decimal')}</span>
                </div>
                <div className="tl-sub">
                  {tr('সূত্র', 'Source')}: {(SOURCE_LABEL[s.source] || { bn: s.source, en: s.source })[lang]}
                  {s.ref ? ` (${s.ref})` : ''}
                </div>
              </div>
            </li>
          )
        })}
        <li className="now">
          <div className="tl-change">{tr('LandLock রেকর্ড (সর্বশেষ)', 'LandLock record (latest)')}</div>
          <div className="tl-box">
            <div className="tl-top">
              <b>{tr('এখন', 'Now')}</b>
              <span>{plot.current_owner} · {plot.area} {tr('শতক', 'decimal')}</span>
            </div>
          </div>
        </li>
      </ol>
    </div>
  )
}

// Initiated -> Registered -> Mutation, as a progress bar
function Stepper({ tx, lang, rejected }) {
  const tr = (bn, en) => (lang === 'bn' ? bn : en)
  const regDone = tx.reg_status === 'done'
  const steps = [
    { label: tr('বিক্রয় শুরু', 'Sale started'), state: 'done' },
    { label: tr('দলিল নিবন্ধন', 'Deed registration'), state: regDone ? 'done' : 'current' },
    rejected
      ? { label: tr('নামজারি বাতিল', 'Mutation rejected'), state: 'rejected' }
      : { label: tr('নামজারি', 'Mutation'), state: regDone ? 'current' : '' },
  ]
  return (
    <div className="stepper">
      {steps.map((s, i) => (
        <div key={i} className={`step ${s.state}`}>
          <div className="bubble">{s.state === 'done' ? <Icon name="check" size={16} /> : s.state === 'rejected' ? <Icon name="x" size={16} /> : i + 1}</div>
          {s.label}
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('landlock_lang') || 'bn' } catch { return 'bn' }
  })
  const [plots, setPlots] = useState([])
  const [selectedId, setSelectedId] = useState('P1')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ seller: '', buyer: '', deed_no: '', deed_area: '' })
  const [result, setResult] = useState(null)
  const [chain, setChain] = useState(null)
  const [gap, setGap] = useState([])
  const [mform, setMform] = useState({ owner: '', bank: '', loan_ref: '' })
  const [mresult, setMresult] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [releaseRef, setReleaseRef] = useState('')
  const [recResult, setRecResult] = useState(null)
  // DEMO ROLE SWITCH: always starts as the least-privileged Buyer (not saved between visits)
  const [role, setRole] = useState('buyer')
  const [roles, setRoles] = useState(null)
  const [showBlocked, setShowBlocked] = useState(false)
  const [demoMode, setDemoMode] = useState(false)

  const tr = (bn, en) => (lang === 'bn' ? bn : en)
  const roleLabel = (r) => ((roles && roles.roles[r]) || ROLE_LABEL[r])[lang]
  const can = (perm) => Boolean(roles && roles.roles[role] && roles.roles[role].permissions.includes(perm))
  // Who may do `perm` (for the "requires ..." hint)
  const whoCan = (perm) => (roles ? Object.keys(roles.roles).filter((r) => roles.roles[r].permissions.includes(perm)).map(roleLabel).join(' / ') : '')
  // Buttons for actions this role can't do are disabled, unless "show blocked actions" is on
  // (then the click goes to the server, which refuses it with 403).
  const gated = (perm) => ({
    disabled: !can(perm) && !showBlocked,
    title: can(perm) ? undefined : tr(`প্রয়োজন: ${whoCan(perm)}`, `Requires: ${whoCan(perm)}`),
  })
  const needs = (perm) => !can(perm) && (
    <div className="lock-hint">
      <Icon name="lock" size={15} />
      {tr(`${roleLabel(role)} এটি করতে পারবেন না। প্রয়োজন: ${whoCan(perm)}`, `${roleLabel(role)} cannot do this. Requires: ${whoCan(perm)}`)}
    </div>
  )
  const changeLang = (l) => {
    setLang(l)
    try { localStorage.setItem('landlock_lang', l) } catch { /* ignore */ }
  }

  const connectError = () => setError('CONNECT')

  const loadExtras = () => {
    fetch(`${API}/ledger/verify`).then((r) => r.json()).then(setChain).catch(() => {})
    fetch(`${API}/gap`).then((r) => r.json()).then(setGap).catch(() => {})
    fetch(`${API}/plots`).then((r) => r.json()).then(setPlots).catch(() => {})
  }

  const load = (id) =>
    fetch(`${API}/plots/${id}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setError(''); loadExtras(); return d })
      .catch(connectError)

  useEffect(() => {
    fetch(`${API}/plots`).then((r) => r.json()).then(setPlots).catch(() => setError('CONNECT'))
    fetch(`${API}/roles`).then((r) => r.json()).then(setRoles).catch(() => {})
    fetch(`${API}/config`).then((r) => r.json()).then((c) => setDemoMode(c.demo_mode === true)).catch(() => {})
  }, [])

  // when a plot is selected: load it and pre-fill the seller + area
  useEffect(() => {
    fetch(`${API}/plots/${selectedId}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setError('')
        setForm((f) => ({ ...f, seller: d.plot.current_owner, deed_area: String(d.plot.area) }))
      })
      .catch(() => setError('CONNECT'))
    fetch(`${API}/ledger/verify`).then((r) => r.json()).then(setChain).catch(() => {})
    fetch(`${API}/gap`).then((r) => r.json()).then(setGap).catch(() => {})
  }, [selectedId])

  // Switching plot clears the previous plot's sale / mortgage messages
  const selectPlot = (id) => {
    setResult(null)
    setMresult(null)
    setRecResult(null)
    setSelectedId(id)
  }

  const setField = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const tamper = async () => {
    const res = await post('/dev/tamper')
    if (res.status >= 400) setResult({ status: res.status, body: { error: res.body.error } })
    await load(selectedId)
  }

  const smartTamper = async () => {
    const res = await post('/dev/tamper-smart')
    if (res.status >= 400) setResult({ status: res.status, body: { error: res.body.error } })
    await load(selectedId)
  }

  // More attacker simulations (delete tail, change owner directly, ...)
  const attack = async (type) => {
    const res = await post('/dev/attack', { type })
    if (res.status >= 400) setResult({ status: res.status, body: { error: res.body.error } })
    await load(selectedId)
  }

  const submitMortgage = async () => {
    const res = await post('/mortgage/create', {
      plot_id: selectedId,
      owner: mform.owner || data.plot.current_owner,
      bank: mform.bank,
      loan_ref: mform.loan_ref,
    }, role)
    setMresult(res)
    load(selectedId)
  }

  // AC Land completes the mutation of an earlier deed registered at the Sub-Registry office
  const reconcile = async () => {
    const res = await post(`/plots/${selectedId}/reconcile`, {}, role)
    setRecResult(res.status >= 400 ? res : null)
    const d = await load(selectedId)
    if (d) setForm((f) => ({ ...f, seller: d.plot.current_owner }))
  }

  const releaseMortgage = async () => {
    const res = await post('/mortgage/release', { plot_id: selectedId, loan_ref: releaseRef }, role)
    setMresult(res.status >= 400 ? res : null)
    if (res.status < 400) setReleaseRef('')
    load(selectedId)
  }

  const reset = async () => {
    await post('/dev/reset')
    setResult(null)
    setMresult(null)
    const d = await load(selectedId)
    if (d) setForm({ seller: d.plot.current_owner, buyer: '', deed_no: '', deed_area: String(d.plot.area) })
  }

  const submitSale = async () => {
    const res = await post('/sale/initiate', { plot_id: selectedId, ...form }, role)
    setResult(res)
    load(selectedId)
  }

  const action = async (type, body) => {
    const txId = data.active_transaction.id
    const res = await post(`/sale/${txId}/${type}`, body || {}, role)
    if (res.status >= 400) setResult({ status: res.status, body: res.body, src: 'tx' })
    else { setResult(null); setRejectReason('') }
    const d = await load(selectedId)
    if (d) setForm((f) => ({ ...f, seller: d.plot.current_owner, deed_area: String(d.plot.area) }))
  }

  const tx = data && data.active_transaction
  const disputed = data && data.disputed_transaction
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const statusText = (s) => (s === 'Pending' ? tr('Pending (লক)', 'Pending (locked)')
    : s === 'Disputed' ? tr('Disputed (বিরোধপূর্ণ, লক)', 'Disputed (locked)') : tr('Free (মুক্ত)', 'Free'))
  const statusBadge = (s) => (s === 'Pending' ? 'amber' : s === 'Disputed' ? 'red' : 'green')
  const lockedCount = plots.filter((p) => p.status !== 'Free').length

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <LogoMark size={50} title="LandLock" />
            <div>
              <h1>Land<span>Lock</span></h1>
              <p>{tr('এক জমি, এক মালিক। কেনার আগে জমি যাচাই করুন।', 'One Land. One Owner. Verify before you buy.')}</p>
            </div>
          </div>
          <div className="top-actions">
            {chain && (
              <span className={`status-pill${chain.valid ? '' : ' bad'}`}>
                <Icon name={chain.valid ? 'shield' : 'shieldX'} size={16} />
                {chain.valid ? tr('Ledger যাচাইকৃত', 'Ledger verified') : tr('Ledger ভাঙা!', 'Ledger broken!')}
              </span>
            )}
            <div className="seg">
              <button className={lang === 'bn' ? 'on' : ''} onClick={() => changeLang('bn')}>বাংলা</button>
              <button className={lang === 'en' ? 'on' : ''} onClick={() => changeLang('en')} aria-label="English">
                <span className="long">English</span><span className="short">EN</span>
              </button>
            </div>
          </div>
        </div>
        {/* Short "what is this" strip for first-time viewers / judges */}
        <div className="hero">
          <h2>{tr('বিক্রির আগেই প্রতারণা ও দ্বৈত বিক্রয় ধরুন', 'Catch fraud and double-selling before the sale')}</h2>
          <p>
            {tr(
              'প্লট লক, মালিকানা ও বন্ধক যাচাই, এবং ডিজিটাল স্বাক্ষরযুক্ত লেজার, যেখানে রেকর্ডে কারসাজি ধরা পড়ে।',
              'Plot lock, ownership and mortgage checks, and a digitally signed ledger where tampering with records is detected.',
            )}
          </p>
          <div className="hero-pills">
            <span><Icon name="lock" size={15} /> {tr('প্লট লক', 'Plot lock')}</span>
            <span><Icon name="x" size={15} /> {tr('দ্বৈত বিক্রয় বন্ধ', 'Double-sell blocked')}</span>
            <span><Icon name="link" size={15} /> {tr('স্বাক্ষরিত লেজার', 'Signed ledger')}</span>
            <span><Icon name="bank" size={15} /> {tr('বন্ধক যাচাই', 'Mortgage check')}</span>
          </div>
        </div>
      </header>

      <main className="page">
        {/* DEMO ROLE SWITCH: not a login. The server enforces permissions on every write. */}
        <div className="role-bar">
          <span className="tag">🎭 DEMO ROLE SWITCH</span>
          <div className="role-seg">
            {Object.keys(ROLE_LABEL).map((r) => (
              <button key={r} className={role === r ? 'on' : ''} onClick={() => { setRole(r); setResult(null); setMresult(null); setRecResult(null) }}>
                {roleLabel(r)}
              </button>
            ))}
          </div>
          <label>
            <input type="checkbox" checked={showBlocked} onChange={(e) => setShowBlocked(e.target.checked)} />
            {tr('নিষিদ্ধ কাজের বোতামও চালু রাখুন (সার্ভারের বাধা দেখতে)', 'Enable blocked buttons (to see the server refuse them)')}
          </label>
          <div className="note">
            {tr(
              'এটি আসল লগইন নয়। শুধু ডেমোর জন্য। বাস্তবে প্রয়োজন: আসল লগইন, নিরাপদ সেশন এবং যাচাই করা পরিচয়ের ভিত্তিতে সার্ভারে অনুমতি যাচাই।',
              'This is NOT real authentication, only a demo. Production needs real login, secure sessions and server-side authorization based on verified identities.',
            )}
          </div>
        </div>

        {error && (
          <div className="error-banner">
            <Icon name="alert" />
            {tr('ব্যাকএন্ডের সাথে সংযোগ হচ্ছে না। npm start চালু আছে কিনা দেখুন।', 'Cannot connect to the backend. Is npm start running?')}
          </div>
        )}

        <div className="stats">
          <div className="stat"><div className="ico"><Icon name="grid" /></div><div><div className="num">{plots.length}</div><div className="lbl">{tr('মোট জমি (নমুনা)', 'Plots (sample)')}</div></div></div>
          <div className="stat"><div className="ico amber"><Icon name="lock" /></div><div><div className="num">{lockedCount}</div><div className="lbl">{tr('লক করা জমি', 'Locked plots')}</div></div></div>
          <div className="stat"><div className="ico amber"><Icon name="clock" /></div><div><div className="num">{gap.length}</div><div className="lbl">{tr('নামজারি বাকি', 'Awaiting mutation')}</div></div></div>
          <div className="stat">
            <div className={`ico${chain && !chain.valid ? ' red' : ''}`}><Icon name="link" /></div>
            <div><div className="num">{chain ? (chain.valid ? chain.length : '!') : '–'}</div><div className="lbl">{tr('Ledger এন্ট্রি', 'Ledger entries')}</div></div>
          </div>
        </div>

        {chain && (
          <div className={`integrity ${chain.valid ? 'ok' : 'bad'}`}>
            <Icon name={chain.valid ? 'shield' : 'shieldX'} size={22} />
            <div>
              <div className="t">
                {chain.valid ? tr('Ledger অক্ষত', 'Ledger intact')
                  : chain.kind === 'signature' ? tr('জাল ধরা পড়েছে!', 'Forgery detected!') : tr('Ledger যাচাই ব্যর্থ', 'Ledger check failed')}
              </div>
              <div className="d">
                {chain.valid
                  ? tr(
                      'hash chain ঠিক আছে, প্রতিটি এন্ট্রি রেজিস্ট্রির ডিজিটাল স্বাক্ষরে সাইন করা, trusted checkpoint মিলেছে এবং জমির রেকর্ড Ledger-এর সাথে মিলছে',
                      'Hash chain is valid, every entry is signed by the registry, it matches the trusted checkpoint, and the land records match the ledger',
                    )
                  : chain.kind === 'signature'
                    ? tr(
                        `Hash ঠিক দেখালেও ডিজিটাল স্বাক্ষর মিলছে না (এন্ট্রি #${chain.brokenAt})।`,
                        `Hashes look fine but the digital signature is invalid. ${chain.reason}`,
                      )
                    : tr(
                        `(${chain.kind})${chain.brokenAt ? ` এন্ট্রি #${chain.brokenAt}` : ''}: ${chain.bn}`,
                        `(${chain.kind}) ${chain.reason}`,
                      )}
              </div>
            </div>
          </div>
        )}

        {/* Demo tools exist only when the backend runs in demo mode (npm run demo); the server enforces it */}
        {demoMode ? (
          <details className="demo">
            <summary>
              <Icon name="zap" /> {tr('ডেমো অ্যাটাকার প্যানেল', 'Demo attacker panel')}
              <span className="badge" style={{ marginLeft: 6 }}>demo</span>
              <span className="chev"><Icon name="chevron" /></span>
            </summary>
            <div className="body">
              <p>{tr('কেউ সরাসরি ডেটাবেস বদলালে LandLock কীভাবে ধরে, তা দেখুন। Reset সব আগের মতো করে দেয়।', 'See how LandLock catches someone editing the database directly. Reset restores everything.')}</p>
              <div className="actions" style={{ marginTop: 0 }}>
                <button className="btn amber sm" onClick={tamper}>⚠️ {tr('Record tamper করুন (demo)', 'Tamper a record (demo)')}</button>
                <button className="btn wine sm" onClick={smartTamper}>🕵️ {tr('Smart tamper (hash নতুন করে বানাবে)', 'Smart tamper (recomputes hashes)')}</button>
                <button className="btn red sm" onClick={() => attack('truncate_tail')}>✂️ {tr('শেষ এন্ট্রি মুছুন (demo)', 'Delete last entry (demo)')}</button>
                <button className="btn red sm" onClick={() => attack('owner_change')}>👤 {tr('P1-এর মালিক সরাসরি বদলান (demo)', 'Change P1 owner directly (demo)')}</button>
                <button className="btn ghost sm" onClick={reset}><Icon name="refresh" size={15} /> Reset (demo)</button>
              </div>
              {result && result.body.error && !result.body.code && result.src !== 'tx' && <ErrorBox body={result.body} lang={lang} />}
            </div>
          </details>
        ) : (
          <div className="demo-off">
            <Icon name="info" size={15} />
            {tr(
              'ডেমো টুল (tamper / reset) বন্ধ আছে। স্থানীয় ডেমোর জন্য backend "npm run demo" দিয়ে চালু করুন।',
              'Demo tools (tamper / reset) are off. For a local demo, start the backend with "npm run demo".',
            )}
          </div>
        )}

        <div className="section-label">{tr('জমি নির্বাচন করুন', 'Select plot')}</div>
        <div className="plots">
          {plots.map((p) => (
            <button key={p.id} className={`plot-chip${p.id === selectedId ? ' on' : ''}`} onClick={() => selectPlot(p.id)}>
              <div className="row1">
                <span>{p.id} · {p.mouza}</span>
                <span className={`dot ${deedMismatch(p) ? 'Disputed' : p.status}`} title={deedMismatch(p) ? tr('দলিল ও খতিয়ানে অমিল', 'Deed and khatian disagree') : statusText(p.status)} />
              </div>
              <div className="row2">
                {tr('খতিয়ান', 'Khatian')} {p.khatian_no}<br />
                {tr('দাগ', 'Dag')} {p.dag_no}{p.mortgage ? ' · 🏦' : ''}
              </div>
            </button>
          ))}
        </div>

        {data && (
          <>
            <div className="layout">
              {/* Left: what the record says */}
              <div className="col">
                <div className="card">
                  <div className="card-head">
                    <h3><Icon name="pin" /> {tr('জমির তথ্য', 'Plot details')}</h3>
                    {sampleBadge(lang)}
                  </div>
                  <div className="facts">
                    <div className="fact"><div className="k">{tr('মৌজা', 'Mouza')}</div><div className="v">{data.plot.mouza}</div></div>
                    <div className="fact"><div className="k">{tr('পরিমাণ', 'Area')}</div><div className="v">{data.plot.area} {tr('শতক', 'decimal')}</div></div>
                    <div className="fact"><div className="k">{tr('খতিয়ান নং', 'Khatian no.')}</div><div className="v">{data.plot.khatian_no}</div></div>
                    <div className="fact"><div className="k">{tr('দাগ নং', 'Dag no.')}</div><div className="v">{data.plot.dag_no}</div></div>
                    <div className="fact"><div className="k">{tr('বর্তমান মালিক', 'Current owner')}</div><div className="v"><Icon name="user" size={16} /> {data.plot.current_owner}</div></div>
                    <div className="fact">
                      <div className="k">{tr('অবস্থা', 'Status')}</div>
                      <div className="v">
                        <span className={`badge ${statusBadge(data.plot.status)}`}>
                          <Icon name={data.plot.status === 'Free' ? 'unlock' : 'lock'} size={14} /> {statusText(data.plot.status)}
                        </span>
                      </div>
                    </div>
                    {data.plot.mortgage && (
                      <div className="fact wide">
                        <div className="k">{tr('বন্ধক', 'Mortgage')}</div>
                        <div className="v"><Icon name="bank" size={16} /> {data.plot.mortgage.bank} <span className="muted" style={{ fontWeight: 500 }}>({tr('ঋণ নং', 'Loan no.')} {data.plot.mortgage.loan_ref})</span></div>
                      </div>
                    )}
                  </div>
                </div>

                <div className={`verdict ${data.risk.level}`}>
                  <div className="verdict-title">
                    <span className="ring"><Icon name={RISK_LABEL[data.risk.level].icon} size={24} /></span>
                    {RISK_LABEL[data.risk.level][lang]}
                  </div>
                  <ul className="reasons">
                    {data.risk.reasons.map((r) => (
                      <li key={r.code} className={r.level}><Icon name={REASON_ICON[r.level]} size={17} /> <span>{r[lang]}</span></li>
                    ))}
                  </ul>
                  {data.risk.notice && <div className="fineprint"><Icon name="info" size={14} /> {data.risk.notice[lang]}</div>}
                </div>

                <DeedVsKhatian plot={data.plot} lang={lang}>
                  {deedMismatch(data.plot) && (
                    <>
                      <div className="actions">
                        <button className="btn" {...gated('sale.mutate')} onClick={reconcile}>
                          <Icon name="check" size={16} />
                          {tr(`দলিল ${data.plot.registry.deed_no}-এর নামজারি সম্পন্ন করুন (মালিক: ${data.plot.registry.buyer})`,
                            `Complete mutation for deed ${data.plot.registry.deed_no} (owner: ${data.plot.registry.buyer})`)}
                        </button>
                      </div>
                      {needs('sale.mutate')}
                    </>
                  )}
                  {recResult && <ErrorBox body={recResult.body} lang={lang} />}
                </DeedVsKhatian>

                <SurveyTimeline plot={data.plot} lang={lang} />
              </div>

              {/* Right: what can be done */}
              <div className="col">
                {tx && (
                  <div className="card">
                    <div className="card-head">
                      <h3><Icon name="file" /> {tr('চলমান বিক্রয়', 'Sale in progress')}</h3>
                      <span className="badge amber"><Icon name="lock" size={13} /> {tr('জমি লক', 'Plot locked')}</span>
                    </div>
                    <div className="party">{tx.seller} <span className="arrow"><Icon name="arrow" /></span> {tx.buyer}</div>
                    <div className="meta">{tr('দলিল নং', 'Deed no.')}: {tx.deed_no} · {tx.deed_area} {tr('শতক', 'decimal')}</div>
                    <Stepper tx={tx} lang={lang} />
                    <div className="actions" style={{ marginTop: 0 }}>
                      {tx.reg_status !== 'done' && (
                        <button className="btn blue" {...gated('sale.register')} onClick={() => action('register')}>
                          <Icon name="file" size={16} /> {tr('দলিল নিবন্ধন সম্পন্ন', 'Mark deed registered')}
                        </button>
                      )}
                      {tx.reg_status === 'done' && (
                        <button className="btn" {...gated('sale.mutate')} onClick={() => action('mutate')}>
                          <Icon name="check" size={16} /> {tr('নামজারি সম্পন্ন (মালিক পরিবর্তন)', 'Complete mutation (change owner)')}
                        </button>
                      )}
                      {/* After registration Cancel is hidden; with "Enable blocked buttons" it stays visible so the server's refusal can be shown */}
                      {(tx.reg_status !== 'done' || showBlocked) && (
                        <button className="btn ghost" {...gated('sale.cancel')} onClick={() => action('cancel')}>{tr('বিক্রয় বাতিল', 'Cancel sale')}</button>
                      )}
                    </div>
                    {tx.reg_status === 'done' && (
                      <>
                        <div className="inline">
                          <label className="field">
                            {tr('নামজারি বাতিলের কারণ', 'Reason for rejecting mutation')}
                            <input className="input" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder={tr('যেমন: বিক্রেতার স্বাক্ষর নিয়ে আপত্তি', 'e.g. seller signature disputed')} />
                          </label>
                          <button className="btn red" {...gated('sale.reject_mutation')} onClick={() => action('reject-mutation', { reason: rejectReason })}>
                            ⛔ {tr('নামজারি বাতিল (বিরোধপূর্ণ)', 'Reject mutation (Disputed)')}
                          </button>
                        </div>
                        <div className="alert info">
                          <Icon name="info" size={15} />{' '}
                          {tr(
                            'দলিল নিবন্ধিত হয়েছে, তাই এখন আর সাধারণভাবে বাতিল করা যাবে না। শুধু এসি ল্যান্ড অফিসার নামজারি সম্পন্ন বা বাতিল করতে পারবেন।',
                            'The deed is registered, so the sale can no longer be cancelled. Only the AC Land Officer can complete or reject the mutation.',
                          )}
                        </div>
                      </>
                    )}
                    {needs(tx.reg_status === 'done' ? 'sale.mutate' : 'sale.register')}
                    {result && result.src === 'tx' && <ErrorBox body={result.body} lang={lang} />}
                  </div>
                )}

                {/* Disputed: mutation rejected, plot stays locked */}
                {disputed && (
                  <div className="card danger">
                    <div className="card-head">
                      <h3><Icon name="x" /> {tr('বিরোধপূর্ণ লেনদেন (নামজারি বাতিল)', 'Disputed transaction (mutation rejected)')}</h3>
                    </div>
                    <div className="party">{disputed.seller} <span className="arrow"><Icon name="arrow" /></span> {disputed.buyer}</div>
                    <div className="meta">{tr('দলিল নং', 'Deed no.')}: {disputed.deed_no}</div>
                    <Stepper tx={disputed} lang={lang} rejected />
                    <div>{tr('কারণ', 'Reason')}: <b>{disputed.dispute_reason}</b></div>
                    <div className="fineprint">
                      <Icon name="info" size={14} />
                      {tr(
                        'জমিটি লক থাকবে। বিরোধ নিষ্পত্তি (যেমন আদালতের আদেশ) এই প্রোটোটাইপের বাইরে।',
                        'The plot stays locked. Resolving the dispute (e.g. a court order) is outside this prototype.',
                      )}
                    </div>
                  </div>
                )}

                {/* Sale form */}
                <div className="card">
                  <div className="card-head"><h3><Icon name="shield" /> {tr('নতুন বিক্রয় শুরু করুন', 'Start a new sale')}</h3></div>
                  <div className="grid2">
                    <label className="field">{tr('বিক্রেতা', 'Seller')}<input className="input" value={form.seller} onChange={setField('seller')} /></label>
                    <label className="field">{tr('ক্রেতা', 'Buyer')}<input className="input" value={form.buyer} onChange={setField('buyer')} placeholder="e.g. Karim" /></label>
                    <label className="field">{tr('দলিল নং', 'Deed no.')}<input className="input" value={form.deed_no} onChange={setField('deed_no')} placeholder="e.g. D-1001" /></label>
                    <label className="field">
                      {tr('দলিলের পরিমাণ (শতক)', 'Deed area (decimal)')}
                      <input className="input" value={form.deed_area} onChange={setField('deed_area')} />
                      <span className="hint">{tr(`শুধু পুরো জমি (${data.plot.area} শতক) বিক্রয় করা যাবে (প্রোটোটাইপ)`, `Full plot only (${data.plot.area} decimal) in this prototype`)}</span>
                    </label>
                  </div>
                  <div className="actions">
                    <button className="btn dark" {...gated('sale.initiate')} onClick={submitSale}>
                      <Icon name="shield" size={16} /> {tr('বিক্রয় যাচাই ও শুরু করুন', 'Verify and start sale')}
                    </button>
                  </div>
                  {needs('sale.initiate')}

                  {result && result.body.blocked && (
                    <BlockedBox title={tr('বিক্রয় আটকানো হয়েছে (Blocked)', 'Sale blocked')} reasons={result.body.reasons} lang={lang} />
                  )}
                  {result && result.body.blocked === false && (
                    <div className="alert success">
                      <div className="alert-title"><Icon name="check" /> {tr('বিক্রয় গৃহীত হয়েছে। জমিটি এখন Pending (লক) অবস্থায় আছে।', 'Sale accepted. The plot is now Pending (locked).')}</div>
                      {result.body.checks && (
                        <>
                          <div style={{ marginTop: 6 }}>{tr('যে যাচাইগুলো সফল হয়েছে:', 'Checks that passed:')}</div>
                          <ul>{result.body.checks.map((ch) => <li key={ch.code}><Icon name="check" size={15} /> {ch[lang]}</li>)}</ul>
                        </>
                      )}
                      {result.body.not_checked && (
                        <div className="sub">
                          {tr('এই প্রোটোটাইপ যা যাচাই করে না:', 'Not checked by this prototype:')}
                          <ul>{result.body.not_checked.map((n) => <li key={n.code}><Icon name="info" size={14} /> {n[lang]}</li>)}</ul>
                        </div>
                      )}
                    </div>
                  )}
                  {result && result.body.error && result.src !== 'tx' && (result.body.code || !demoMode) && <ErrorBox body={result.body} lang={lang} />}
                </div>

                {/* Bank mortgage */}
                <div className="card">
                  <div className="card-head">
                    <h3><Icon name="bank" /> {tr('ব্যাংক বন্ধক', 'Bank mortgage')}</h3>
                    {data.plot.mortgage
                      ? <span className="badge amber">{tr('বন্ধক আছে', 'Mortgaged')}</span>
                      : <span className="badge green">{tr('বন্ধক নেই', 'No mortgage')}</span>}
                  </div>
                  {data.plot.mortgage && (
                    <>
                      <div>
                        {tr(
                          <>এই জমি <b>{data.plot.mortgage.bank}</b>-এ বন্ধক আছে।</>,
                          <>This plot is mortgaged to <b>{data.plot.mortgage.bank}</b>.</>,
                        )}
                      </div>
                      <div className="inline">
                        <label className="field">
                          {tr('যে ঋণ মুক্ত হবে তার নং', 'Loan no. being released')}
                          <input className="input" value={releaseRef} onChange={(e) => setReleaseRef(e.target.value)} placeholder="e.g. LN-101" />
                        </label>
                        <button className="btn ghost" {...gated('mortgage.release')} onClick={releaseMortgage}>{tr('বন্ধক মুক্ত করুন', 'Release mortgage')}</button>
                      </div>
                    </>
                  )}
                  <div className="grid3" style={{ marginTop: data.plot.mortgage ? 14 : 0 }}>
                    <label className="field">{tr('বন্ধকদাতা', 'Mortgagor')}<input className="input" value={mform.owner} onChange={(e) => setMform({ ...mform, owner: e.target.value })} placeholder={data.plot.current_owner} /></label>
                    <label className="field">{tr('ব্যাংক', 'Bank')}<input className="input" value={mform.bank} onChange={(e) => setMform({ ...mform, bank: e.target.value })} placeholder="e.g. Sonali Bank" /></label>
                    <label className="field">{tr('ঋণ নং', 'Loan no.')}<input className="input" value={mform.loan_ref} onChange={(e) => setMform({ ...mform, loan_ref: e.target.value })} placeholder="e.g. LN-101" /></label>
                  </div>
                  <div className="actions">
                    <button className="btn teal" {...gated('mortgage.create')} onClick={submitMortgage}>
                      <Icon name="bank" size={16} /> {tr('বন্ধক যাচাই ও নিবন্ধন করুন', 'Verify and register mortgage')}
                    </button>
                  </div>
                  {needs('mortgage.create')}

                  {mresult && mresult.body.blocked && (
                    <BlockedBox title={tr('বন্ধক আটকানো হয়েছে (Blocked)', 'Mortgage blocked')} reasons={mresult.body.reasons} lang={lang} />
                  )}
                  {mresult && mresult.body.blocked === false && (
                    <div className="alert success"><div className="alert-title"><Icon name="check" /> {tr('বন্ধক নিবন্ধিত হয়েছে।', 'Mortgage registered.')}</div></div>
                  )}
                  {mresult && mresult.body.error && <ErrorBox body={mresult.body} lang={lang} />}
                </div>
              </div>
            </div>

            <div className="bottom">
              <div className="card">
                <div className="card-head">
                  <h3><Icon name="history" /> {tr('ইতিহাস (Ledger)', 'History (Ledger)')}</h3>
                  <span className="badge">{data.plot.id}</span>
                </div>
                {data.history.length === 0 && <div className="empty">{tr('এখনও কোনো লেনদেন নেই।', 'No transactions yet.')}</div>}
                <div className="scroll">
                  <ol className="timeline">
                    {[...data.history].reverse().map((h) => (
                      <li key={h.id} className={BAD_EVENTS.includes(h.event_type) ? 'bad' : ''}>
                        <div className="tl-box">
                          <div className="tl-top">
                            <b>#{h.id} {(EVENT_LABEL[h.event_type] || { bn: h.event_type, en: h.event_type })[lang]}</b>
                            <span className="tl-sub">{new Date(h.timestamp).toLocaleString(locale)}</span>
                          </div>
                          <div className="tl-sub" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, alignItems: 'center' }}>
                            <span className="hash">hash {h.hash.slice(0, 12)}…</span>
                            {h.signature && <span className="hash">🔏 sig {h.signature.slice(0, 10)}…</span>}
                            {h.data && h.data.by_role && <span className="badge blue"><Icon name="user" size={12} /> {roleLabel(h.data.by_role)}</span>}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="card">
                <div className="card-head"><h3><Icon name="clock" /> {tr('নিবন্ধিত কিন্তু নামজারি হয়নি (Gap)', 'Registered but not mutated (Gap)')}</h3></div>
                {gap.length === 0 && <div className="empty">{tr('কোনো ঝুঁকিপূর্ণ দলিল নেই।', 'No risky deeds.')}</div>}
                {gap.map((g) => (
                  <div key={g.id} className="gap-row">
                    <span className={`dot ${g.state === 'active' ? 'Pending' : 'Disputed'}`} style={{ marginTop: 7 }} />
                    <div>
                      <div><b>Plot {g.plot_id}</b>: {g.seller} → {g.buyer}</div>
                      <div className="tl-sub">
                        {tr('দলিল', 'Deed')} {g.deed_no}
                        {g.state === 'disputed' && <> · <b style={{ color: 'var(--red-tx)' }}>⛔ {tr('বিরোধপূর্ণ', 'Disputed')}</b></>}
                        {g.source === 'sub_registry' && <> · <b style={{ color: 'var(--red-tx)' }}>{tr('সাব-রেজিস্ট্রি দলিল, নামজারি হয়নি', 'Sub-Registry deed, never mutated')}</b></>}
                      </div>
                    </div>
                    <div className="days"><b>{g.days_waiting}</b><div className="tl-sub">{tr('দিন অপেক্ষায়', 'days waiting')}</div></div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <footer className="footer">
          <Logo size={30} light={false} />
          <div>{tr('প্রোটোটাইপ, শুধু নমুনা তথ্য। আইনগত মালিকানার নিশ্চয়তা নয়।', 'Prototype with sample data only. Not a legal guarantee of ownership.')}</div>
        </footer>
      </main>
    </>
  )
}
