import { Fragment, Suspense, lazy, startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Logo, LogoMark } from './Logo.jsx'
import PlotMap from './PlotMap.jsx'
import SideNav from './SideNav.jsx'
import PlotSwitcher from './PlotSwitcher.jsx'
import DemoLab from './DemoLab.jsx'
import LangSwitch from './LangSwitch.jsx'
import { EVENT_LABEL, API } from './labels.js'
import { drawer, sidebarMini, useDrawerOpen } from './navStore.js'
import LedgerChain, { LedgerChecks, LedgerSeal } from './LedgerChain.jsx'


// The receipt (with its QR library) is loaded only when one is opened, to keep the first load small
const Receipt = lazy(() => import('./Receipt.jsx'))

const RISK_LABEL = {
  green: { bn: 'কোনো সতর্কতা পাওয়া যায়নি (Green)', en: 'No warnings found (Green)', icon: 'check' },
  yellow: { bn: 'সতর্কতা (Yellow)', en: 'Caution (Yellow)', icon: 'alert' },
  red: { bn: 'ঝুঁকিপূর্ণ (Red)', en: 'High risk (Red)', icon: 'x' },
}
const REASON_ICON = { green: 'check', yellow: 'alert', red: 'x' }

const BAD_EVENTS = ['SALE_BLOCKED', 'MORTGAGE_BLOCKED', 'MUTATION_REJECTED', 'AGREEMENT_BLOCKED']
const taka = (n) => `৳${Number(n).toLocaleString('en-IN')}`

// Fallback labels until /api/roles loads. Permissions always come from the server.
const ROLE_LABEL = {
  buyer: { bn: 'ক্রেতা', en: 'Buyer' },
  sub_registrar: { bn: 'সাব-রেজিস্ট্রার', en: 'Sub-Registrar' },
  ac_land: { bn: 'এসি ল্যান্ড অফিসার', en: 'AC Land Officer' },
}

// What each demo role may do (mirrors backend rbac.js; the server is what actually enforces it)
const ROLE_INFO = {
  buyer: { icon: 'buyer', bn: 'শুধু দেখা: রেকর্ড, ঝুঁকি, লেজার', en: 'View only: records, risk, ledger' },
  sub_registrar: { icon: 'deed', bn: 'বিক্রয়, দলিল নিবন্ধন, বায়নাপত্র, বন্ধক', en: 'Sales, deeds, sale agreements, mortgages' },
  ac_land: { icon: 'landpin', bn: 'নামজারি সম্পন্ন বা বাতিল', en: 'Complete or reject mutation (namjari)' },
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
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  zap: <path d="M13 2 3 14h9l-1 8 10-12h-9z" />,
  refresh: <><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" /><path d="M21 3v5h-5" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9v11h14V9" /><path d="M10 20v-6h4v6" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  map: <><path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3z" /><path d="M9 3v15M15 6v15" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  // role icons: a person with a document (buyer), a deed with a seal (Sub-Registrar), a pin over land layers (AC Land)
  buyer: <><circle cx="9" cy="7.5" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 10-5.5" /><rect x="14" y="11" width="7.5" height="10" rx="1.2" /><path d="M16.2 14.5h3.2M16.2 17.5h3.2" /></>,
  deed: <><path d="M13 21H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8l5 5v4" /><path d="M14 2v5h5M8 9h5M8 13h4" /><circle cx="17.5" cy="15.5" r="2.8" /><path d="m16 18-.8 4 2.3-1.3 2.3 1.3-.8-4" /></>,
  landpin: <><path d="M12 12.5s-4-3.6-4-6.5a4 4 0 0 1 8 0c0 2.9-4 6.5-4 6.5z" /><circle cx="12" cy="6" r="1.4" /><path d="M8.5 11.5 3 14l9 4.5 9-4.5-5.5-2.5" /><path d="m3 17.5 9 4.5 9-4.5" /></>,
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

// Menu button: its own component, so only it (not the page) re-renders when the drawer opens/closes
function MenuButton({ onClick, label }) {
  const open = useDrawerOpen()
  return (
    <button type="button" className="menu-btn" onClick={onClick} aria-label={label} aria-expanded={open || undefined}>
      <Icon name="menu" size={22} />
    </button>
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
// Card title: a filled icon disc, the title, and one plain line saying what the card is for
function CardTitle({ icon, title, sub }) {
  return (
    <div className="ct">
      <span className="ct-ico" aria-hidden="true"><Icon name={icon} size={20} /></span>
      <span className="ct-text"><h3>{title}</h3>{sub && <span className="ct-sub">{sub}</span>}</span>
    </div>
  )
}

// Empty state: a document drawing with a badge (clock = nothing yet, check = all clear) and a message
function EmptyState({ badge, title, sub }) {
  return (
    <div className="empty-state">
      <svg className="es-art" viewBox="0 0 120 100" aria-hidden="true">
        <ellipse className="es-blob" cx="60" cy="52" rx="50" ry="40" />
        <g className="es-doc">
          <path d="M40 18h28l14 14v46a4 4 0 0 1-4 4H40a4 4 0 0 1-4-4V22a4 4 0 0 1 4-4z" />
          <path className="es-fold" d="M68 18v14h14" />
          <path className="es-lines" d="M45 42h26M45 51h26M45 60h18" />
        </g>
        <g className={`es-badge ${badge}`} transform="translate(80 70)">
          <circle r="13" />
          {badge === 'clock' ? <path d="M0-6.5V0l4.5 3" /> : <path d="m-5.5 0 3.8 3.8L6-4.2" />}
        </g>
      </svg>
      <div className="es-title">{title}</div>
      {sub && <div className="es-sub">{sub}</div>}
      <svg className="es-land" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 30C60 18 120 26 190 22s140-14 210-4V40H0z" />
        <path className="far" d="M0 34c80-10 150-4 230-8s120-10 170-6V40H0z" />
      </svg>
    </div>
  )
}

// Footer drawing: fields, a village, trees and birds (decoration only)
function FooterScene() {
  return (
    <svg className="foot-scene" viewBox="0 0 1200 90" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <path className="hill far" d="M0 62C140 40 260 52 400 46s260-26 420-16 260 22 380 12V90H0z" />
      <path className="hill" d="M0 74c160-16 330-6 520-12s360-20 520-10c60 4 110 10 160 14V90H0z" />
      <g className="house" transform="translate(150 44)"><path d="M0 14 14 2l14 12v16H0z" /><path d="M10 30v-8h8v8" /></g>
      <g className="house" transform="translate(1010 40)"><path d="M0 16 16 2l16 14v18H0z" /><path d="M12 34v-9h8v9" /></g>
      {[[90, 52, 13], [118, 58, 9], [230, 50, 11], [930, 46, 14], [965, 54, 9], [1080, 48, 12]].map(([x, y, r], i) => (
        <g key={i} className="tree"><path d={`M${x} ${y + r}v${12}`} /><circle cx={x} cy={y} r={r} /></g>
      ))}
      <path className="bird" d="M300 22q5-5 10 0q5-5 10 0M330 14q4-4 8 0q4-4 8 0M880 18q5-5 10 0q5-5 10 0" />
    </svg>
  )
}

// Form field: label (with * when required), an icon inside the input, and an optional hint
function Field({ label, req, icon, hint, children }) {
  return (
    <label className="field">
      <span className="flabel">{label}{req && <span className="req" aria-hidden="true">*</span>}</span>
      <span className={`ifield${icon ? ' has-ico' : ''}`}>
        {icon && <span className="fi-ico" aria-hidden="true"><Icon name={icon} size={17} /></span>}
        {children}
      </span>
      {hint && <span className="hint"><Icon name="info" size={13} /> {hint}</span>}
    </label>
  )
}

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
        <CardTitle icon="file" title={tr('দলিল বনাম খতিয়ান', 'Deed vs khatian')} sub={tr('সাব-রেজিস্ট্রি দলিল আর এসি ল্যান্ডের খতিয়ান মিলছে কি না', 'Does the Sub-Registry deed agree with the AC Land khatian?')} />
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

// Full names of the Bangladesh land surveys (display only)
const SURVEY_NAME = {
  CS: { bn: 'ক্যাডাস্ট্রাল সার্ভে', en: 'Cadastral Survey' },
  SA: { bn: 'স্টেট অ্যাকুইজিশন', en: 'State Acquisition' },
  RS: { bn: 'রিভিশনাল সার্ভে', en: 'Revisional Survey' },
  BS: { bn: 'বাংলাদেশ সার্ভে', en: 'Bangladesh Survey' },
}

function SurveyTimeline({ plot, lang }) {
  const tr = (bn, en) => (lang === 'bn' ? bn : en)
  const chain = plot.survey || []
  if (chain.length === 0) return null
  return (
    <div className="card" id="survey">
      <div className="card-head">
        <CardTitle icon="scroll" title={tr('জরিপ ইতিহাস', 'Survey history')} sub={tr('CS → SA → RS → BS: কোন জরিপে কে মালিক ছিলেন', 'CS → SA → RS → BS: who owned it in each survey')} />
        {sampleBadge(lang)}
      </div>
      <ol className="survey">
        {chain.map((s, i) => {
          const prev = chain[i - 1]
          const ownerChanged = prev && s.owner !== prev.owner
          const unexplained = ownerChanged && !EXPLAINED.includes(s.source)
          const areaUp = prev && s.area > prev.area
          const flagged = unexplained || areaUp
          return (
            <li key={s.survey} className={`sv sv-${String(s.survey).toLowerCase()}${flagged ? ' flag' : ''}`}>
              {i > 0 && (
                <div className={`sv-change${flagged ? ' flag' : ''}`}>
                  {ownerChanged ? tr('মালিক পরিবর্তন', 'Owner changed') : tr('একই মালিক', 'Same owner')}
                  {unexplained && ` · ${tr('প্রমাণ নেই', 'no proof')}`}
                  {areaUp && ` · ${tr('পরিমাণ বেড়েছে', 'area increased')}`}
                </div>
              )}
              <div className="sv-row">
                <span className="sv-ico" aria-hidden="true">{s.survey}</span>
                <span className="sv-main">
                  <b>{s.survey} <span className="sv-year">({s.year})</span>
                    {SURVEY_NAME[s.survey] && <span className="sv-name">{SURVEY_NAME[s.survey][lang]}</span>}
                  </b>
                  <span className="sv-src">
                    {tr('সূত্র', 'Source')}: {(SOURCE_LABEL[s.source] || { bn: s.source, en: s.source })[lang]}
                    {s.ref ? ` (${s.ref})` : ''}
                  </span>
                </span>
                <span className="sv-pill"><Icon name="user" size={14} /> {s.owner} · {s.area} {tr('শতক', 'decimal')}</span>
              </div>
            </li>
          )
        })}
        <li className="sv sv-now">
          <div className="sv-change">{tr('LandLock রেকর্ড (সর্বশেষ)', 'LandLock record (latest)')}</div>
          <div className="sv-row">
            <span className="sv-ico" aria-hidden="true"><Icon name="check" size={18} /></span>
            <span className="sv-main">
              <b>{tr('এখন', 'Now')}</b>
              <span className="sv-src">{tr('স্বাক্ষরিত লেজারে রাখা বর্তমান রেকর্ড', 'current record, kept in the signed ledger')}</span>
            </span>
            <span className="sv-pill"><Icon name="user" size={14} /> {plot.current_owner} · {plot.area} {tr('শতক', 'decimal')}</span>
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
  const [form, setForm] = useState({ seller: '', seller_father: '', seller_nid: '', buyer: '', buyer_father: '', buyer_nid: '', deed_no: '', deed_area: '' })
  const [result, setResult] = useState(null)
  const [chain, setChain] = useState(null)
  const [entries, setEntries] = useState([]) // full ledger, only for drawing the block chain
  // clock for "5 minutes ago" labels, ticking every 30 s (display only)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  const [gap, setGap] = useState([])
  const [mform, setMform] = useState({ owner: '', owner_father: '', owner_nid: '', bank: '', loan_ref: '' })
  const [mresult, setMresult] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [releaseRef, setReleaseRef] = useState('')
  const [recResult, setRecResult] = useState(null)
  const [aform, setAform] = useState({ seller_father: '', seller_nid: '', buyer: '', buyer_father: '', buyer_nid: '', agreement_no: '', advance: '' })
  // signed receipt being shown (ledger entry hash), or null
  const [receiptHash, setReceiptHash] = useState(null)
  // New-deed desk: which deed type is being written (sale deed, sale agreement, mortgage deed)
  const [deedTab, setDeedTab] = useState('sale')
  const [aresult, setAresult] = useState(null)
  const [acancel, setAcancel] = useState({ agreement_no: '', reason: '' })
  // DEMO ROLE SWITCH: always starts as the least-privileged Buyer (not saved between visits)
  const [role, setRole] = useState('buyer')
  const [roles, setRoles] = useState(null)
  const [showBlocked, setShowBlocked] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  // UI only: the floating plot switcher watches this map and appears once it has scrolled out of view
  const mapRef = useRef(null)
  // UI only: sidebar. Wide screens: icons-only or full (sidebarMini); smaller screens: a drawer.
  // Both states live in navStore, not here, so neither ever re-renders this whole page; SideNav also
  // tracks the section on screen itself. On collapse/expand the `nav-mini` class is switched directly,
  // the page margin changes in one step, and the page slides from its old place with a transform
  // (no per-frame layout), in step with the sidebar's width transition (0.3s, same easing as CSS).
  const appRef = useRef(null)
  const pageRef = useRef(null)
  useLayoutEffect(() => sidebarMini.subscribe(() => {
    const mini = sidebarMini.get()
    if (appRef.current) appRef.current.classList.toggle('nav-mini', mini)
    const el = pageRef.current
    if (!el || !el.animate || !window.matchMedia('(min-width: 1200px)').matches
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const shift = mini ? 160 : -160 // collapsing: the page was 160px further right
    el.animate([{ transform: `translateX(${shift}px)` }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' })
  }), [])
  // Scroll reveal ("ink settling on paper"): sections and cards fade and rise in once, the first time
  // they come into view; cards in one row follow each other (big screens; phones draw only the lines). A data attribute (not a class) marks
  // them, so React re-rendering a className never hides an element again. Removed when done, so each
  // element's own hover transitions work as before. Off with reduced motion.
  useEffect(() => {
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    // Phones only draw the section lines: revealing whole cards while scrolling cost frames there
    const phone = window.matchMedia('(max-width: 760px), (hover: none)').matches
    const SEL = phone ? '.sec-label'
      : '.sec-label, .row-top > *, .row-evidence > *, .bottom > *, .flow-head, .row-actions > .desk, .integrity, .lab, .footer'
    const seen = new WeakSet()
    const io = new IntersectionObserver((list) => {
      for (const e of list) {
        if (!e.isIntersecting) continue
        const el = e.target
        io.unobserve(el)
        el.dataset.rv = 'in'
        setTimeout(() => { delete el.dataset.rv; el.style.removeProperty('--rv-i') }, 1300)
      }
    }, { rootMargin: '0px 0px -6% 0px' })
    let raf = 0
    const scan = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        document.querySelectorAll(SEL).forEach((el) => {
          if (seen.has(el)) return
          seen.add(el)
          el.style.setProperty('--rv-i', Math.min([...el.parentElement.children].indexOf(el), 3))
          el.dataset.rv = ''
          io.observe(el)
        })
      })
    }
    scan()
    // the hero's drifting light pauses while the hero is off screen
    const hero = document.querySelector('.hero')
    const heroIo = new IntersectionObserver(([e]) => { if (e.isIntersecting) delete hero.dataset.still; else hero.dataset.still = '' })
    if (hero) heroIo.observe(hero)
    const mo = new MutationObserver(scan)
    mo.observe(document.getElementById('root'), { childList: true, subtree: true })
    return () => { io.disconnect(); heroIo.disconnect(); mo.disconnect(); cancelAnimationFrame(raf) }
  }, [])
  const toggleNav = () => {
    if (window.matchMedia('(min-width: 1200px)').matches) sidebarMini.toggle()
    else drawer.toggle()
  }

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
  // Switch the demo role (same as clicking a role card), clearing the previous messages
  const switchRole = (r) => { setRole(r); setResult(null); setMresult(null); setRecResult(null); setAresult(null) }
  // Deed desk: when the chosen role cannot sign this deed, say who can and offer to switch to them
  const roleGate = (perm) => {
    if (can(perm) || !roles) return null
    const r = Object.keys(roles.roles).find((k) => roles.roles[k].permissions.includes(perm))
    return (
      <div className="desk-gate">
        <Icon name="shield" size={20} />
        <span>
          {tr(<>শুধু {whoCan(perm)}। আপনি এখন <b>{roleLabel(role)}</b></>, <>{whoCan(perm)} only. You are <b>{roleLabel(role)}</b></>)}
        </span>
        {r && <button type="button" onClick={() => switchRole(r)}><Icon name="user" size={15} /> {tr(`${roleLabel(r)} হিসেবে চালান`, `Act as ${roleLabel(r)}`)}</button>}
      </div>
    )
  }
  // The whole page re-renders in the new language as a transition, so the switch itself (its own
  // state) responds at once and the heavy re-render never blocks that first paint
  const changeLang = (l) => {
    startTransition(() => setLang(l))
    try { localStorage.setItem('landlock_lang', l) } catch { /* ignore */ }
  }

  const connectError = () => setError('CONNECT')

  const loadExtras = () => {
    fetch(`${API}/ledger/verify`).then((r) => r.json()).then(setChain).catch(() => {})
    fetch(`${API}/ledger`).then((r) => r.json()).then(setEntries).catch(() => {})
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

  // Pre-fills the recorded owner (name, father's name, NID) as the seller / mortgagor of every deed form.
  // Editable on purpose: change the NID to show LandLock catching someone with the same name.
  const fillOwner = (plot, extra = {}) => {
    const father = plot.owner_father || ''
    const nid = plot.owner_nid || ''
    setForm((f) => ({ ...f, seller: plot.current_owner, seller_father: father, seller_nid: nid, deed_area: String(plot.area), ...extra }))
    setMform((m) => ({ ...m, owner: plot.current_owner, owner_father: father, owner_nid: nid }))
    setAform((a) => ({ ...a, seller_father: father, seller_nid: nid }))
  }

  // when a plot is selected: load it and pre-fill the seller + area
  useEffect(() => {
    fetch(`${API}/plots/${selectedId}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setError('')
        fillOwner(d.plot)
      })
      .catch(() => setError('CONNECT'))
    fetch(`${API}/ledger/verify`).then((r) => r.json()).then(setChain).catch(() => {})
    fetch(`${API}/ledger`).then((r) => r.json()).then(setEntries).catch(() => {})
    fetch(`${API}/gap`).then((r) => r.json()).then(setGap).catch(() => {})
  }, [selectedId])

  // Switching plot clears the previous plot's sale / mortgage messages
  const selectPlot = (id) => {
    setResult(null)
    setMresult(null)
    setRecResult(null)
    setAresult(null)
    setSelectedId(id)
  }

  // UI only: on phones/tablets the record sits below the map, so after choosing a plot on the map
  // gently scroll to it (instantly when the user prefers reduced motion)
  const openPlot = (id) => {
    selectPlot(id)
    const el = document.getElementById('record')
    if (!el || window.innerWidth > 960) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  const setField = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  // Demo attacker simulations (demo mode only); DemoLab shows the outcome
  const runAttack = async (path, body) => {
    const res = await post(path, body)
    await load(selectedId)
    return res
  }

  const submitMortgage = async () => {
    const res = await post('/mortgage/create', {
      plot_id: selectedId,
      owner: mform.owner || data.plot.current_owner,
      owner_father: mform.owner_father,
      owner_nid: mform.owner_nid,
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
    if (d) fillOwner(d.plot)
  }

  const releaseMortgage = async () => {
    const res = await post('/mortgage/release', { plot_id: selectedId, loan_ref: releaseRef }, role)
    setMresult(res.status >= 400 ? res : null)
    if (res.status < 400) setReleaseRef('')
    load(selectedId)
  }

  // Sale agreement (bainapatra): the seller is always the recorded owner shown on the page
  const submitAgreement = async () => {
    const res = await post('/agreement/create', { plot_id: selectedId, seller: data.plot.current_owner, ...aform }, role)
    setAresult(res)
    if (res.status === 201) setAform((a) => ({ ...a, buyer: '', buyer_father: '', buyer_nid: '', agreement_no: '', advance: '' }))
    load(selectedId)
  }

  const cancelAgreement = async () => {
    const res = await post('/agreement/cancel', { plot_id: selectedId, ...acancel }, role)
    setAresult(res.status >= 400 ? res : null)
    if (res.status < 400) setAcancel({ agreement_no: '', reason: '' })
    load(selectedId)
  }

  const reset = async () => {
    await post('/dev/reset')
    setResult(null)
    setMresult(null)
    setAresult(null)
    const d = await load(selectedId)
    if (d) fillOwner(d.plot, { buyer: '', buyer_father: '', buyer_nid: '', deed_no: '' })
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
    if (d) fillOwner(d.plot)
  }

  const tx = data && data.active_transaction
  const disputed = data && data.disputed_transaction
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  // "5 minutes ago" in the chosen language (display only)
  const ago = (ts) => {
    const sec = (new Date(ts).getTime() - now) / 1000
    if (!Number.isFinite(sec)) return ''
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    for (const [unit, s] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
      if (Math.abs(sec) >= s) return rtf.format(Math.round(sec / s), unit)
    }
    return rtf.format(0, 'second')
  }
  const statusText = (s) => (s === 'Pending' ? tr('Pending (লক)', 'Pending (locked)')
    : s === 'Disputed' ? tr('Disputed (বিরোধপূর্ণ, লক)', 'Disputed (locked)') : tr('Free (মুক্ত)', 'Free'))
  const statusBadge = (s) => (s === 'Pending' ? 'amber' : s === 'Disputed' ? 'red' : 'green')
  // Map colour per plot: the server's status, plus a deed/khatian owner mismatch shown as an alert
  const mapStatus = (p) => (p.status === 'Pending' ? 'pending' : p.status === 'Disputed' || deedMismatch(p) ? 'alert' : 'free')
  const mapStatusLabel = (p) => (deedMismatch(p) ? tr('দলিল ও খতিয়ানে অমিল', 'Deed and khatian disagree') : statusText(p.status))
  const countOf = (st) => plots.filter((p) => mapStatus(p) === st).length
  // Rubber stamp on the map, from the same statuses as the map colours
  const stampOf = (p) => (p.status === 'Pending' ? { kind: 'pending', text: tr('লক', 'LOCKED') }
    : p.status === 'Disputed' ? { kind: 'alert', text: tr('বিরোধ', 'DISPUTED') }
      : deedMismatch(p) ? { kind: 'alert', text: tr('অমিল', 'MISMATCH') } : null)

  return (
    <div ref={appRef} className={`app${sidebarMini.get() ? ' nav-mini' : ''}`}>
      <header className="topbar">
        <div className="topbar-inner">
          <MenuButton onClick={toggleNav} label={tr('মেনু', 'Menu')} />
          <div className="brand">
            <LogoMark size={40} title="LandLock" />
            <span className="brand-text">
              <span className="wordmark">LandLock</span>
              <span className="tagline">{tr('জমির তথ্য, সবার জন্য নিরাপদ', 'Land records you can trust')}</span>
            </span>
          </div>
          <div className="top-actions">
            {chain && (
              <span className={`status-pill${chain.valid ? '' : ' bad'}`}>
                <Icon name={chain.valid ? 'shield' : 'shieldX'} size={16} />
                <span className="sp-text">
                  {chain.valid ? tr('Ledger যাচাইকৃত', 'Ledger verified') : tr('Ledger ভাঙা!', 'Ledger broken!')}
                  {entries.length > 0 && (
                    <span className="sp-sub">{tr('সর্বশেষ এন্ট্রি', 'latest entry')} {ago(entries[entries.length - 1].timestamp)}</span>
                  )}
                </span>
              </span>
            )}
            <LangSwitch lang={lang} onChange={changeLang} />
          </div>
        </div>
      </header>

      {data && (
        <PlotSwitcher
          watchRef={mapRef}
          plots={plots}
          selectedId={selectedId}
          onSelect={selectPlot}
          onMap={() => mapRef.current && mapRef.current.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })}
          risk={data.risk.level}
          statusOf={mapStatus}
          lang={lang}
          Icon={Icon}
        />
      )}

      <div className="shell">
      <SideNav lang={lang} Icon={Icon} Logo={LogoMark} />
      <main className="page" ref={pageRef}>
        <section className="hero" id="top">
          <div className="hero-copy">
            <svg className="hero-compass" viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="30" /><circle cx="50" cy="50" r="22" />
              <path d="M50 8 56 44 50 50 44 44zM50 92 44 56 50 50 56 56zM8 50 44 44 50 50 44 56zM92 50 56 56 50 50 56 44z" />
              <text x="50" y="6">N</text>
            </svg>
            {/* words rise in one after another (on load and when the language changes) */}
            <h1 key={lang} aria-label={tr('কেনার আগে জমি যাচাই করুন', 'Check the land before you buy')}>
              {tr('কেনার আগে জমি যাচাই করুন', 'Check the land before you buy').split(' ').map((w, i) => (
                <span key={i} className={`hw${/যাচাই|Check/.test(w) ? ' hw-mark' : ''}`} aria-hidden="true" style={{ animationDelay: `${120 + i * 85}ms` }}>{w}</span>
              ))}
            </h1>
            <p className="lede">
              {tr('এক জমি, এক মালিক। বিক্রি শুরু হলেই দাগ লক।', 'One land, one owner. A sale locks the plot.')}
            </p>

            {/* DEMO ROLE SWITCH: not a login. The server enforces permissions on every write. */}
            <div className="role-panel">
              <div className="role-head">
                <LogoMark size={44} />
                <span className="role-title">{tr('ডেমো রোল সুইচ', 'Demo role switch')}</span>
              </div>
              <div className="roles" role="radiogroup" aria-label={tr('ডেমো রোল', 'Demo role')}>
                {Object.keys(ROLE_LABEL).map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={role === r}
                    className={`role-card r-${r}${role === r ? ' on' : ''}`}
                    onClick={() => switchRole(r)}
                  >
                    <span className="ri"><Icon name={ROLE_INFO[r].icon} size={22} /></span>
                    <span className="rt">
                      {/* each word stays whole, so "সাব-রেজিস্ট্রার" never breaks at its hyphen */}
                      <span className="rn">{roleLabel(r).split(' ').map((w, i) => <Fragment key={i}>{i > 0 && ' '}<span className="nw">{w}</span></Fragment>)}</span>
                    </span>
                    {role === r && <span className="rcheck"><Icon name="check" size={14} /></span>}
                  </button>
                ))}
              </div>
              <label className="switch">
                <input type="checkbox" role="switch" checked={showBlocked} onChange={(e) => setShowBlocked(e.target.checked)} />
                <span>{tr('নিষিদ্ধ বোতামও চালু রাখুন', 'Show blocked buttons')}</span>
              </label>
              <div className="note">
                <Icon name="info" size={14} />
                <span>{tr('ডেমো, আসল লগইন নয়', 'Demo only, not a real login')}</span>
              </div>
            </div>
          </div>

          <div className="map-sheet" id="map" ref={mapRef}>
            <div className="map-head">
              <h2>{tr('নমুনা মৌজা নকশা', 'Sample mouza map')} <span className="map-count">{tr(`মোট দাগ: ${plots.length}টি`, `${plots.length} plots`)}</span></h2>
            </div>
            <PlotMap plots={plots} selectedId={selectedId} onSelect={openPlot} statusOf={mapStatus} statusLabel={mapStatusLabel} stampOf={stampOf} lang={lang} />
            <div className="legend">
              <span><i className="sw sw-free" /> {tr('মুক্ত', 'Free')} ({countOf('free')})</span>
              <span><i className="sw sw-pending" /> {tr('লক', 'Locked')} ({countOf('pending')})</span>
              <span><i className="sw sw-alert" /> {tr('অমিল / বিরোধ', 'Mismatch / dispute')} ({countOf('alert')})</span>
            </div>
          </div>

          {/* recent ledger activity: the real last entries of the signed ledger (read-only) */}
          <aside className="feed" aria-label={tr('সাম্প্রতিক লেজার কার্যক্রম', 'Recent ledger activity')}>
            <div className="feed-head">
              <span className="feed-ico" aria-hidden="true"><Icon name="history" size={22} /></span>
              <span>
                <h2>{tr('সাম্প্রতিক লেজার কার্যক্রম', 'Recent ledger activity')}</h2>
                {chain && (
                  <span className={`feed-live${chain.valid ? '' : ' bad'}`}>
                    <i /> {chain.valid ? tr('অক্ষত', 'intact') : tr('যাচাই ব্যর্থ', 'check failed')}
                    {entries.length > 0 && ` · ${tr('সর্বশেষ আপডেট', 'last update')} ${ago(entries[entries.length - 1].timestamp)}`}
                  </span>
                )}
              </span>
            </div>
            {entries.length === 0 && <div className="empty">{tr('এখনও কোনো এন্ট্রি নেই।', 'No entries yet.')}</div>}
            <ol className="feed-list">
              {entries.slice(-5).reverse().map((e) => {
                const pl = plots.find((q) => q.id === e.plot_id)
                return (
                <li key={`${e.id}-${e.hash}`} className={BAD_EVENTS.includes(e.event_type) ? 'bad' : e.event_type === 'GENESIS' ? 'gen' : ''}>
                  <span className="fd-dot" aria-hidden="true">
                    <Icon name={BAD_EVENTS.includes(e.event_type) ? 'x' : 'check'} size={13} />
                  </span>
                  <span className="fd-body">
                    <b>{(EVENT_LABEL[e.event_type] || { bn: e.event_type, en: e.event_type })[lang]} <span className="fd-id">#{e.id}</span></b>
                    {pl ? (
                      <button type="button" className="fd-plot" onClick={() => openPlot(pl.id)} title={tr('এই জমির রেকর্ড খুলুন', 'Open this plot’s record')}>
                        {tr('দাগ', 'Dag')} {pl.dag_no} ({pl.mouza})
                      </button>
                    ) : (
                      <span className="fd-plot static">{e.plot_id || tr('পুরো রেজিস্টার', 'whole register')}</span>
                    )}
                    <span className="fd-meta">
                      {ago(e.timestamp)}
                      {e.data && e.data.by_role ? ` · ${roleLabel(e.data.by_role)}` : ''}
                    </span>
                  </span>
                </li>
                )
              })}
            </ol>
            <a className="feed-all" href="#ledger">{tr('পুরো লেজার শিকল দেখুন', 'See the whole ledger chain')} <Icon name="arrow" size={15} /></a>
          </aside>
        </section>

        {error && (
          <div className="error-banner">
            <Icon name="alert" />
            {tr('ব্যাকএন্ডের সাথে সংযোগ হচ্ছে না। npm start চালু আছে কিনা দেখুন।', 'Cannot connect to the backend. Is npm start running?')}
          </div>
        )}

        {chain && (
          <section id="ledger" key={chain.valid ? 'ok' : `bad-${chain.kind}-${chain.brokenAt}`} className={`integrity ${chain.valid ? 'ok' : 'bad'}`}>
            <div className="integrity-row">
              <LedgerSeal ok={chain.valid} />
              <div className="integrity-main">
                <div className="integrity-top">
                  <div className="t">
                  {chain.valid ? tr('Ledger অক্ষত', 'Ledger intact')
                    : chain.kind === 'signature' ? tr('জাল ধরা পড়েছে!', 'Forgery detected!') : tr('Ledger যাচাই ব্যর্থ', 'Ledger check failed')}
                  </div>
                  {entries.length > 0 && (
                    <div className="lmeta">
                      <span><b>{entries.length}</b> {tr('টি ব্লক', entries.length === 1 ? 'block' : 'blocks')}</span>
                      <span>{tr('সর্বশেষ hash', 'latest hash')} <code>{entries[entries.length - 1].hash.slice(0, 10)}</code></span>
                    </div>
                  )}
                </div>
                <LedgerChecks chain={chain} lang={lang} />
                {!chain.valid && (
                <div className="d">
                  {chain.kind === 'signature'
                      ? tr(
                          `Hash ঠিক দেখালেও ডিজিটাল স্বাক্ষর মিলছে না (এন্ট্রি #${chain.brokenAt})।`,
                          `Hashes look fine but the digital signature is invalid. ${chain.reason}`,
                        )
                      : tr(
                          `(${chain.kind})${chain.brokenAt ? ` এন্ট্রি #${chain.brokenAt}` : ''}: ${chain.bn}`,
                          `(${chain.kind}) ${chain.reason}`,
                        )}
                </div>
                )}
              </div>
            </div>
            <LedgerChain entries={entries} chain={chain} lang={lang} eventLabel={EVENT_LABEL} />
          </section>
        )}

        {/* Demo tools exist only when the backend runs in demo mode (npm run demo); the server enforces it */}
        {demoMode ? (
          <DemoLab chain={chain} entries={entries} lang={lang} Icon={Icon} onRun={runAttack} onReset={reset} />
        ) : (
          <div className="demo-off">
            <Icon name="info" size={15} />
            {tr(
              'ডেমো টুল (tamper / reset) বন্ধ আছে। স্থানীয় ডেমোর জন্য backend "npm run demo" দিয়ে চালু করুন।',
              'Demo tools (tamper / reset) are off. For a local demo, start the backend with "npm run demo".',
            )}
          </div>
        )}

        {data && (
          <div id="record" className="record" key={data.plot.id}>
            <h2 className="sec-label"><span className="sec-n">1</span> {tr('রেকর্ড ও ঝুঁকি', 'Record and risk')}</h2>
            <div className="row row-top">
                <div className="card">
                  <div className="card-head">
                    <CardTitle icon="pin" title={tr(`খতিয়ান: দাগ ${data.plot.dag_no}`, `Khatian: dag ${data.plot.dag_no}`)} sub={tr('জমির রেকর্ডে এখন যা লেখা আছে', 'What the land record says now')} />
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
                    {data.plot.owner_nid && (
                      <div className="fact wide">
                        <div className="k">{tr('মালিকের পরিচয়', "Owner's identity")}</div>
                        <div className="v">{tr('পিতা', 'Father')} {data.plot.owner_father} <span className="muted" style={{ fontWeight: 500 }}>· NID ••••{data.plot.owner_nid.slice(-4)}</span></div>
                      </div>
                    )}
                    {data.plot.mortgage && (
                      <div className="fact wide">
                        <div className="k">{tr('বন্ধক', 'Mortgage')}</div>
                        <div className="v"><Icon name="bank" size={16} /> {data.plot.mortgage.bank} <span className="muted" style={{ fontWeight: 500 }}>({tr('ঋণ নং', 'Loan no.')} {data.plot.mortgage.loan_ref})</span></div>
                      </div>
                    )}
                    {data.plot.agreement && (
                      <div className="fact wide">
                        <div className="k">{tr('বায়নাপত্র', 'Sale agreement')}</div>
                        <div className="v"><Icon name="file" size={16} /> {data.plot.agreement.seller} → {data.plot.agreement.buyer} <span className="muted" style={{ fontWeight: 500 }}>({tr('নং', 'No.')} {data.plot.agreement.agreement_no}, {tr('অগ্রিম', 'advance')} {taka(data.plot.agreement.advance)})</span></div>
                      </div>
                    )}
                  </div>
                </div>

                <div key={data.risk.level} className={`verdict ${data.risk.level}`}>
                  <div className="verdict-title">
                    <span className="ring"><Icon name={RISK_LABEL[data.risk.level].icon} size={24} /></span>
                    {RISK_LABEL[data.risk.level][lang]}
                  </div>
                  <ul className="reasons">
                    {data.risk.reasons.filter((r) => r.code !== 'CLEAR').map((r) => (
                      <li key={r.code} className={r.level}><Icon name={REASON_ICON[r.level]} size={17} /> <span>{r[lang]}</span></li>
                    ))}
                  </ul>
                </div>
            </div>

            {(() => {
              // where this plot's sale stands, read from the transaction already loaded (display only)
              const regDone = tx && tx.reg_status === 'done'
              const steps = [
                { k: 'info', bn: 'জমির তথ্য', en: 'Land info', st: 'done' },
                { k: 'sale', bn: 'বিক্রয় শুরু', en: 'Sale started', st: tx || disputed ? 'done' : 'current' },
                { k: 'reg', bn: 'দলিল নিবন্ধন', en: 'Deed registered', st: disputed || regDone ? 'done' : tx ? 'current' : 'todo' },
                { k: 'mut', bn: 'নামজারি', en: 'Mutation', st: disputed ? 'rejected' : regDone ? 'current' : 'todo' },
              ]
              return (
                <div className="flow-head">
                  <div className="flow-main">
                    <h2 className="sec-label flow-label"><span className="sec-n">2</span> {tr('পদক্ষেপ', 'Actions')}</h2>
                    <ol className="flow" aria-label={tr('বিক্রয়ের অগ্রগতি', 'Sale progress')}>
                      {steps.map((st, i) => (
                        <li key={st.k} className={`fs ${st.st}`} aria-current={st.st === 'current' ? 'step' : undefined}>
                          <span className="fs-dot" aria-hidden="true">
                            {st.st === 'done' ? <Icon name="check" size={13} /> : st.st === 'rejected' ? <Icon name="x" size={13} /> : i + 1}
                          </span>
                          <span className="fs-label">{st[lang]}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="flow-sum">
                    <span className="fsum-ico" aria-hidden="true"><Icon name="pin" size={22} /></span>
                    <span className="fsum-main"><b>{tr('দাগ', 'Dag')} {data.plot.dag_no}</b><span>{data.plot.mouza}</span></span>
                    <span className="fsum-k">{tr('মোট জমি', 'Total area')}<b>{data.plot.area} {tr('শতক', 'decimal')}</b></span>
                    <span className="fsum-k">{tr('অবস্থা', 'Status')}<b>{statusText(data.plot.status)}</b></span>
                  </div>
                </div>
              )
            })()}
            <div className="row row-actions">
                {tx && (
                  <div className="card">
                    <div className="card-head">
                      <CardTitle icon="file" title={tr('চলমান বিক্রয়', 'Sale in progress')} sub={tr('জমিটি লক; নিবন্ধন ও নামজারি এখানে হয়', 'The plot is locked; registration and mutation happen here')} />
                      <span className="badge amber"><Icon name="lock" size={13} /> {tr('জমি লক', 'Plot locked')}</span>
                    </div>
                    <div className="party">{tx.seller} <span className="arrow"><Icon name="arrow" /></span> {tx.buyer}</div>
                    <div className="meta">{tr('দলিল নং', 'Deed no.')}: {tx.deed_no} · {tx.deed_area} {tr('শতক', 'decimal')}</div>
                    <Stepper tx={tx} lang={lang} />
                    <div className="actions" style={{ marginTop: 0 }}>
                      {tx.reg_status !== 'done' && (
                        <button className="btn primary" {...gated('sale.register')} onClick={() => action('register')}>
                          <Icon name="file" size={16} /> {tr('দলিল নিবন্ধন সম্পন্ন', 'Mark deed registered')} <span className="btn-arr"><Icon name="arrow" size={16} /></span>
                        </button>
                      )}
                      {tx.reg_status === 'done' && (
                        <button className="btn primary" {...gated('sale.mutate')} onClick={() => action('mutate')}>
                          <Icon name="check" size={16} /> {tr('নামজারি সম্পন্ন (মালিক পরিবর্তন)', 'Complete mutation (change owner)')} <span className="btn-arr"><Icon name="arrow" size={16} /></span>
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
                          <button className="btn danger" {...gated('sale.reject_mutation')} onClick={() => action('reject-mutation', { reason: rejectReason })}>
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

                {/* New-deed desk: the three deeds the Sub-Registry office writes for a plot, as one
                    stamp-paper sheet with a tab per deed type: parties, then the schedule of the
                    land (tofsil, from the khatian), then the deed's own details. */}
                {(() => {
                  const plot = data.plot
                  const DEEDS = [
                    { id: 'sale', icon: 'file', bn: 'সাফ কবলা', en: 'Sale deed', subBn: 'বিক্রয় দলিল', subEn: 'Saf kabala', flag: tx ? tr('চলছে', 'in progress') : null },
                    { id: 'agreement', icon: 'deed', bn: 'বায়নাপত্র', en: 'Sale agreement', subBn: 'অগ্রিম নিয়ে চুক্তি', subEn: 'Bainapatra', flag: plot.agreement ? tr('চুক্তি আছে', 'active') : null },
                    { id: 'mortgage', icon: 'bank', bn: 'বন্ধকী দলিল', en: 'Mortgage deed', subBn: 'ব্যাংক ঋণ', subEn: 'Bank loan', flag: plot.mortgage ? tr('বন্ধক আছে', 'mortgaged') : null },
                  ]
                  const d = DEEDS.find((x) => x.id === deedTab) || DEEDS[0]
                  // a party: name, then father's name + NID (validity: the seller's must match the khatian)
                  const party = (labelBn, labelEn, control, id) => (
                    <div className="dk-party">
                      <span className="dk-plabel">{tr(labelBn, labelEn)}</span>
                      {control}
                      {id && (
                        <div className="dk-id">
                          <label><span>{tr('পিতার নাম', "Father's name")}<i aria-hidden="true">*</i></span>
                            <input className="input" value={id.father} onChange={id.onFather} placeholder={tr('যেমন: Abdul Malek', 'e.g. Abdul Malek')} />
                          </label>
                          <label><span>NID<i aria-hidden="true">*</i></span>
                            <input className="input" value={id.nid} onChange={id.onNid} inputMode="numeric" placeholder={tr('১০, ১৩ বা ১৭ অঙ্ক', '10, 13 or 17 digits')} />
                          </label>
                        </div>
                      )}
                    </div>
                  )
                  const idOf = (state, set, prefix) => ({
                    father: state[`${prefix}_father`], nid: state[`${prefix}_nid`],
                    onFather: (e) => set({ ...state, [`${prefix}_father`]: e.target.value }),
                    onNid: (e) => set({ ...state, [`${prefix}_nid`]: e.target.value }),
                  })
                  const parties = (from, to) => (
                    <div className="dk-parties">
                      {from}
                      <span className="dk-arrow" aria-hidden="true"><Icon name="arrow" size={18} /></span>
                      {to}
                    </div>
                  )
                  const input = (value, onChange, placeholder, extra) => (
                    <input className="input" value={value} onChange={onChange} placeholder={placeholder} {...extra} />
                  )
                  return (
                    <div className={`card desk deed-${d.id}`}>
                      <div className="dk-tabs" role="tablist" aria-label={tr('দলিলের ধরন', 'Deed type')}>
                        {DEEDS.map((x) => (
                          <button key={x.id} type="button" role="tab" aria-selected={x.id === d.id} className={`dk-tab t-${x.id}${x.id === d.id ? ' on' : ''}`} onClick={() => setDeedTab(x.id)}>
                            <span className="dk-tab-ico"><Icon name={x.icon} size={18} /></span>
                            <span className="dk-tab-tx"><b>{tr(x.bn, x.en)}</b><span>{tr(x.subBn, x.subEn)}</span></span>
                            {x.flag && <span className="dk-flag">{x.flag}</span>}
                          </button>
                        ))}
                      </div>

                      <div className="dk-sheet" role="tabpanel">
                        <div className="dk-head">
                          <div>
                            <h3 className="dk-title">{tr(d.bn, d.en)}</h3>
                          </div>
                          <div className="dk-head-r">
                            {/* a draft reference only: the deed has no number until it is registered */}
                            <span className="dk-ref">{tr('খসড়া', 'Draft')}: SR-{new Date().getFullYear()}-{String(entries.length + 1).padStart(4, '0')}</span>
                            <span className="dk-seal" aria-hidden="true"><span><Icon name={d.icon} size={22} /></span></span>
                          </div>
                        </div>

                        <div className="dk-tofsil" aria-label={tr('তফসিল (জমির বিবরণ)', 'Schedule of the land')}>
                          <span className="dk-tofsil-h"><Icon name="landpin" size={22} /> {tr('তফসিল', 'Schedule')}</span>
                          <span className="dk-tf"><i>{tr('মৌজা', 'Mouza')}</i><b>{plot.mouza}</b></span>
                          <span className="dk-tf"><i>{tr('খতিয়ান', 'Khatian')}</i><b>{plot.khatian_no}</b></span>
                          <span className="dk-tf"><i>{tr('দাগ', 'Dag')}</i><b>{plot.dag_no}</b></span>
                          <span className="dk-tf"><i>{tr('পরিমাণ', 'Area')}</i><b>{plot.area} {tr('শতক', 'decimal')}</b></span>
                        </div>

                        {d.id === 'sale' && (
                          <>
                            {tx && <div className="dk-note"><Icon name="lock" size={15} /> {tr(`এই জমিতে একটি বিক্রয় চলছে (${tx.seller} → ${tx.buyer})। নতুন বিক্রয় চেষ্টা করলে LandLock আটকাবে।`, `A sale is already in progress here (${tx.seller} → ${tx.buyer}). A new sale will be blocked by LandLock.`)}</div>}
                            <div className="dk-sec"><Icon name="users" size={17} /><span>{tr('পক্ষগণ', 'Parties')}</span></div>
                            {parties(
                              party('দাতা (বিক্রেতা)', 'Seller', input(form.seller, setField('seller')), idOf(form, setForm, 'seller')),
                              party('গ্রহীতা (ক্রেতা)', 'Buyer', input(form.buyer, setField('buyer'), tr('যেমন: Karim', 'e.g. Karim')), idOf(form, setForm, 'buyer')),
                            )}
                            <div className="dk-sec"><Icon name="file" size={17} /><span>{tr('দলিলের তথ্য', 'Deed details')}</span></div>
                            <div className="grid2">
                              <Field label={tr('দলিল নং', 'Deed no.')} req icon="file">{input(form.deed_no, setField('deed_no'), tr('যেমন: D-1001', 'e.g. D-1001'))}</Field>
                              <Field label={tr('দলিলের পরিমাণ (শতক)', 'Deed area (decimal)')} req icon="grid" hint={tr(`পুরো জমি: ${plot.area} শতক`, `Whole plot: ${plot.area} decimal`)}>
                                {input(form.deed_area, setField('deed_area'), '', { inputMode: 'decimal' })}
                              </Field>
                            </div>
                            {roleGate('sale.initiate')}
                            <div className="dk-foot">
                              <button className="btn primary dk-go" {...gated('sale.initiate')} onClick={submitSale}>
                                <Icon name="shield" size={16} /> {tr('যাচাই করে বিক্রয় শুরু করুন', 'Verify and start the sale')} <span className="btn-arr"><Icon name="arrow" size={16} /></span>
                              </button>
                            </div>
                            {result && result.body.blocked && (
                              <BlockedBox title={tr('বিক্রয় আটকানো হয়েছে (Blocked)', 'Sale blocked')} reasons={result.body.reasons} lang={lang} />
                            )}
                            {result && result.body.blocked === false && (
                              <div className="alert success">
                                <div className="alert-title"><Icon name="check" /> {tr('বিক্রয় গৃহীত হয়েছে। জমিটি এখন Pending (লক) অবস্থায় আছে।', 'Sale accepted. The plot is now Pending (locked).')}</div>
                                {result.body.receipt && <button type="button" className="rc-open" onClick={() => setReceiptHash(result.body.receipt.hash)}><Icon name="file" size={15} /> {tr('স্বাক্ষরিত রসিদ ও QR দেখুন', 'View the signed receipt and QR')}</button>}
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
                            {result && result.body.error && result.src !== 'tx' && <ErrorBox body={result.body} lang={lang} />}
                          </>
                        )}

                        {d.id === 'agreement' && (plot.agreement ? (
                          <>
                            <div className="dk-standing">
                              <div className="dk-sec"><Icon name="lock" size={17} /><span>{tr('চলমান বায়নাপত্র', 'Agreement in force')}</span></div>
                              <div className="party">{plot.agreement.seller} <span className="arrow"><Icon name="arrow" /></span> {plot.agreement.buyer}</div>
                              <div className="meta">{tr('নং', 'No.')} {plot.agreement.agreement_no} · {tr('অগ্রিম', 'Advance')} {taka(plot.agreement.advance)} · {plot.agreement.date}</div>
                              <div className="dk-note"><Icon name="info" size={15} /> {tr(`শুধু ${plot.agreement.buyer}-এর কাছে বিক্রয় করা যাবে; অন্য কাউকে বিক্রয়, দ্বিতীয় বায়না বা বন্ধক আটকানো। নামজারি হলে চুক্তি পূরণ হবে।`, `Only ${plot.agreement.buyer} can buy this plot; a sale to anyone else, a second advance and a mortgage are blocked. The mutation fulfils it.`)}</div>
                            </div>
                            <div className="dk-sec"><Icon name="x" size={17} /><span>{tr('চুক্তি বাতিল', 'Cancel the agreement')}</span></div>
                            <div className="grid2">
                              <Field label={tr('বায়নাপত্র নং', 'Agreement no.')} req icon="file">{input(acancel.agreement_no, (e) => setAcancel({ ...acancel, agreement_no: e.target.value }), tr('যেমন: B-501/2026', 'e.g. B-501/2026'))}</Field>
                              <Field label={tr('বাতিলের কারণ', 'Reason for cancelling')} req icon="info">{input(acancel.reason, (e) => setAcancel({ ...acancel, reason: e.target.value }), tr('যেমন: অগ্রিম ফেরত দেওয়া হয়েছে', 'e.g. advance returned'))}</Field>
                            </div>
                            {roleGate('agreement.cancel')}
                            <div className="dk-foot">
                              <button className="btn ghost" {...gated('agreement.cancel')} onClick={cancelAgreement}>{tr('বায়নাপত্র বাতিল করুন', 'Cancel agreement')}</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="dk-sec"><Icon name="users" size={17} /><span>{tr('পক্ষগণ', 'Parties')}</span></div>
                            {parties(
                              party('বিক্রেতা (মালিক)', 'Seller (owner)', <div className="dk-fixed"><Icon name="user" size={16} /> {plot.current_owner}</div>, idOf(aform, setAform, 'seller')),
                              party('ক্রেতা (অগ্রিম দিচ্ছেন)', 'Buyer (paying the advance)', input(aform.buyer, (e) => setAform({ ...aform, buyer: e.target.value }), tr('যেমন: Tania', 'e.g. Tania')), idOf(aform, setAform, 'buyer')),
                            )}
                            <div className="dk-sec"><Icon name="deed" size={17} /><span>{tr('চুক্তির তথ্য', 'Agreement details')}</span></div>
                            <div className="grid2">
                              <Field label={tr('বায়নাপত্র নং', 'Agreement no.')} req icon="file">{input(aform.agreement_no, (e) => setAform({ ...aform, agreement_no: e.target.value }), tr('যেমন: B-501/2026', 'e.g. B-501/2026'))}</Field>
                              <Field label={tr('অগ্রিম (টাকা)', 'Advance (taka)')} req icon="bank" hint={Number(aform.advance) > 0 ? `= ${taka(aform.advance)}` : undefined}>
                                {input(aform.advance, (e) => setAform({ ...aform, advance: e.target.value }), '500000', { inputMode: 'decimal' })}
                              </Field>
                            </div>
                            {roleGate('agreement.create')}
                            <div className="dk-foot">
                              <button className="btn primary dk-go" {...gated('agreement.create')} onClick={submitAgreement}>
                                <Icon name="shield" size={16} /> {tr('যাচাই করে বায়নাপত্র নিবন্ধন', 'Verify and register the agreement')} <span className="btn-arr"><Icon name="arrow" size={16} /></span>
                              </button>
                            </div>
                          </>
                        ))}
                        {d.id === 'agreement' && aresult && aresult.body.blocked && (
                          <BlockedBox title={tr('বায়নাপত্র আটকানো হয়েছে (Blocked)', 'Sale agreement blocked')} reasons={aresult.body.reasons} lang={lang} />
                        )}
                        {d.id === 'agreement' && aresult && aresult.body.blocked === false && (
                          <div className="alert success"><div className="alert-title"><Icon name="check" /> {tr('বায়নাপত্র নিবন্ধিত হয়েছে। এখন অন্য কারো কাছে বিক্রয় বা বন্ধক আটকানো থাকবে।', 'Sale agreement registered. Sale to anyone else and mortgage are now blocked.')}</div>
                            {aresult.body.receipt && <button type="button" className="rc-open" onClick={() => setReceiptHash(aresult.body.receipt.hash)}><Icon name="file" size={15} /> {tr('স্বাক্ষরিত রসিদ ও QR দেখুন', 'View the signed receipt and QR')}</button>}</div>
                        )}
                        {d.id === 'agreement' && aresult && aresult.body.error && <ErrorBox body={aresult.body} lang={lang} />}

                        {d.id === 'mortgage' && (
                          <>
                            {plot.mortgage && (
                              <div className="dk-standing">
                                <div className="dk-sec"><Icon name="lock" size={17} /><span>{tr('চলমান বন্ধক', 'Mortgage in force')}</span></div>
                                <div className="party"><Icon name="bank" /> {plot.mortgage.bank}</div>
                                <div className="meta">{tr('ঋণ নং', 'Loan no.')} {plot.mortgage.loan_ref}</div>
                                <div className="dk-release">
                                  <Field label={tr('যে ঋণ মুক্ত হবে তার নং', 'Loan no. being released')} icon="file">{input(releaseRef, (e) => setReleaseRef(e.target.value), tr('যেমন: LN-101', 'e.g. LN-101'))}</Field>
                                  <button className="btn ghost" {...gated('mortgage.release')} onClick={releaseMortgage}>{tr('বন্ধক মুক্ত করুন', 'Release mortgage')}</button>
                                </div>
                              </div>
                            )}
                            <div className="dk-sec"><Icon name="users" size={17} /><span>{tr('পক্ষগণ', 'Parties')}</span></div>
                            {parties(
                              party('বন্ধকদাতা (মালিক)', 'Mortgagor (owner)', input(mform.owner, (e) => setMform({ ...mform, owner: e.target.value }), plot.current_owner), idOf(mform, setMform, 'owner')),
                              party('বন্ধকগ্রহীতা (ব্যাংক)', 'Mortgagee (bank)', input(mform.bank, (e) => setMform({ ...mform, bank: e.target.value }), tr('যেমন: Sonali Bank', 'e.g. Sonali Bank'))),
                            )}
                            <div className="dk-sec"><Icon name="bank" size={17} /><span>{tr('ঋণের তথ্য', 'Loan details')}</span></div>
                            <div className="grid2">
                              <Field label={tr('ঋণ নং', 'Loan no.')} req icon="file">{input(mform.loan_ref, (e) => setMform({ ...mform, loan_ref: e.target.value }), tr('যেমন: LN-101', 'e.g. LN-101'))}</Field>
                            </div>
                            {roleGate('mortgage.create')}
                            <div className="dk-foot">
                              <button className="btn primary dk-go" {...gated('mortgage.create')} onClick={submitMortgage}>
                                <Icon name="bank" size={16} /> {tr('যাচাই করে বন্ধক নিবন্ধন', 'Verify and register the mortgage')} <span className="btn-arr"><Icon name="arrow" size={16} /></span>
                              </button>
                            </div>
                            {mresult && mresult.body.blocked && (
                              <BlockedBox title={tr('বন্ধক আটকানো হয়েছে (Blocked)', 'Mortgage blocked')} reasons={mresult.body.reasons} lang={lang} />
                            )}
                            {mresult && mresult.body.blocked === false && (
                              <div className="alert success"><div className="alert-title"><Icon name="check" /> {tr('বন্ধক নিবন্ধিত হয়েছে।', 'Mortgage registered.')}</div>
                                {mresult.body.receipt && <button type="button" className="rc-open" onClick={() => setReceiptHash(mresult.body.receipt.hash)}><Icon name="file" size={15} /> {tr('স্বাক্ষরিত রসিদ ও QR দেখুন', 'View the signed receipt and QR')}</button>}</div>
                            )}
                            {mresult && mresult.body.error && <ErrorBox body={mresult.body} lang={lang} />}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })()}
            </div>

            <h2 className="sec-label"><span className="sec-n">3</span> {tr('প্রমাণ', 'Evidence')}</h2>
            <div className="row row-evidence">
                <DeedVsKhatian plot={data.plot} lang={lang}>
                  {deedMismatch(data.plot) && (
                    <>
                      <div className="actions">
                        <button className="btn primary" {...gated('sale.mutate')} onClick={reconcile}>
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

            <h2 className="sec-label"><span className="sec-n">4</span> {tr('লেজার ও নামজারি বাকি', 'Ledger and pending mutations')}</h2>
            <div className="bottom">
              <div className="card">
                <div className="card-head">
                  <CardTitle icon="history" title={tr('ইতিহাস (Ledger)', 'History (Ledger)')} sub={tr('এই জমির প্রতিটি স্বাক্ষরিত ঘটনা, নতুনটি আগে', 'Every signed event for this plot, newest first')} />
                  <span className="badge">{data.plot.id}</span>
                </div>
                {data.history.length === 0 && (
                  <EmptyState badge="clock" title={tr('এখনও কোনো লেনদেন নেই', 'No transactions yet')} sub={tr('বিক্রয় বা বন্ধক হলে তা এখানে স্বাক্ষরসহ দেখা যাবে', 'A sale or mortgage will appear here, signed')} />
                )}
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
                            <button type="button" className="tl-receipt" onClick={() => setReceiptHash(h.hash)}><Icon name="file" size={13} /> {tr('রসিদ', 'Receipt')}</button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="card">
                <div className="card-head" id="gap">
                  <CardTitle icon="clock" title={tr('নিবন্ধিত কিন্তু নামজারি হয়নি (Gap)', 'Registered but not mutated (Gap)')} sub={tr('দলিল হয়েছে, কিন্তু খতিয়ানে এখনও পুরনো মালিক', 'Deed done, but the khatian still shows the old owner')} />
                </div>
                {gap.length === 0 && (
                  <EmptyState badge="ok" title={tr('কোনো ঝুঁকিপূর্ণ দলিল নেই', 'No risky deeds')} sub={tr('সব নিবন্ধিত দলিলের নামজারি হয়ে গেছে', 'Every registered deed has been mutated')} />
                )}
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
          </div>
        )}

        <footer className="footer">
          <div className="foot-logo"><Logo size={34} light={false} /></div>
          <div className="footer-tag">{tr('নিরাপদ জমি · নিশ্চিন্ত মালিকানা', 'Safe land · certain ownership')}</div>
          <div className="foot-note">{tr('প্রোটোটাইপ, শুধু নমুনা তথ্য। আইনগত মালিকানার নিশ্চয়তা নয়।', 'Prototype with sample data only. Not a legal guarantee of ownership.')}</div>
          <FooterScene />
        </footer>
      </main>
      </div>
      {receiptHash && <Suspense fallback={null}><Receipt hash={receiptHash} lang={lang} onClose={() => setReceiptHash(null)} /></Suspense>}
    </div>
  )
}
