import { useEffect, useState } from 'react'

const API = 'http://localhost:4000/api'

const COLORS = {
  green:  { bg: '#e6f6ec', border: '#2e9d57', text: '#1b6b3a', bn: 'নিরাপদ (Green)', en: 'Safe (Green)' },
  yellow: { bg: '#fff6dd', border: '#d9a400', text: '#7a5c00', bn: 'সতর্কতা (Yellow)', en: 'Caution (Yellow)' },
  red:    { bg: '#fdeaea', border: '#d93a3a', text: '#8f1f1f', bn: 'ঝুঁকিপূর্ণ (Red)', en: 'High risk (Red)' },
}

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
}

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

const card = { background: 'white', borderRadius: 12, padding: 16, marginTop: 16 }
const input = { padding: 8, borderRadius: 6, border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' }
const btn = (bg) => ({
  background: bg, color: 'white', border: 'none', borderRadius: 8,
  padding: '10px 14px', fontSize: 15, cursor: 'pointer', marginRight: 8, marginTop: 8,
})

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

const sampleBadge = (lang) => (
  <div style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: '#7a5c00', background: '#fff6dd', border: '1px dashed #d9a400', borderRadius: 6, padding: '2px 8px', margin: '4px 0 8px' }}>
    {SAMPLE_BADGE[lang]}
  </div>
)

// Error box for 403 (permission denied), 423 (ledger integrity) and other API errors
function ErrorBox({ body, lang }) {
  const denied = body.code === 'PERMISSION_DENIED'
  return (
    <div style={{ background: '#fdeaea', border: '2px solid #d93a3a', color: '#8f1f1f', borderRadius: 8, padding: 12, marginTop: 12 }}>
      {denied && <b>⛔ {lang === 'bn' ? 'অনুমতি নেই (সার্ভার আটকেছে)' : 'Permission denied (blocked by the server)'}<br /></b>}
      {body.code === 'INTEGRITY_FAILED' && <b>🛑 {lang === 'bn' ? 'Ledger যাচাই ব্যর্থ' : 'Ledger integrity check failed'}<br /></b>}
      {body[lang] || body.error}
    </div>
  )
}

function SurveyTimeline({ plot, lang }) {
  const tr = (bn, en) => (lang === 'bn' ? bn : en)
  const chain = plot.survey || []
  if (chain.length === 0) return null
  return (
    <div style={card}>
      <h3 style={{ marginTop: 0, marginBottom: 0 }}>📜 {tr('জরিপ ইতিহাস', 'Survey history')} (CS → SA → RS → BS)</h3>
      {sampleBadge(lang)}
      {chain.map((s, i) => {
        const prev = chain[i - 1]
        const ownerChanged = prev && s.owner !== prev.owner
        const unexplained = ownerChanged && !EXPLAINED.includes(s.source)
        const areaUp = prev && s.area > prev.area
        const flagged = unexplained || areaUp
        return (
          <div key={s.survey}>
            {i > 0 && (
              <div style={{ margin: '6px 0 6px 18px', fontSize: 13, color: flagged ? '#7a5c00' : '#777' }}>
                ↓ {ownerChanged ? tr('মালিক পরিবর্তন', 'Owner changed') : tr('একই মালিক', 'Same owner')}
                {unexplained && ` ⚠️ ${tr('প্রমাণ নেই', 'no proof')}`}
                {areaUp && ` ⚠️ ${tr('পরিমাণ বেড়েছে', 'area increased')}`}
              </div>
            )}
            <div
              style={{
                border: `2px solid ${flagged ? '#d9a400' : '#e2e2e2'}`,
                background: flagged ? '#fff6dd' : '#fafafa',
                borderRadius: 10, padding: 10,
              }}
            >
              <b>{s.survey} ({s.year})</b>: {s.owner} | {s.area} {tr('শতক', 'decimal')}
              <div style={{ fontSize: 13, color: '#555' }}>
                {tr('সূত্র', 'Source')}: {(SOURCE_LABEL[s.source] || { bn: s.source, en: s.source })[lang]}
                {s.ref ? ` (${s.ref})` : ''}
              </div>
            </div>
          </div>
        )
      })}
      <div style={{ margin: '6px 0 6px 18px', fontSize: 13, color: '#777' }}>
        ↓ {tr('LandLock রেকর্ড (সর্বশেষ)', 'LandLock record (latest)')}
      </div>
      <div style={{ border: '2px solid #2e9d57', background: '#e6f6ec', borderRadius: 10, padding: 10 }}>
        <b>{tr('এখন', 'Now')}</b>: {plot.current_owner} | {plot.area} {tr('শতক', 'decimal')}
      </div>
    </div>
  )
}

export default function App() {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('landlock_lang') || 'bn' } catch (e) { return 'bn' }
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
  // DEMO ROLE SWITCH: always starts as the least-privileged Buyer (not saved between visits)
  const [role, setRole] = useState('buyer')
  const [roles, setRoles] = useState(null)
  const [showBlocked, setShowBlocked] = useState(false)

  const tr = (bn, en) => (lang === 'bn' ? bn : en)
  const roleLabel = (r) => ((roles && roles.roles[r]) || ROLE_LABEL[r])[lang]
  const can = (perm) => Boolean(roles && roles.roles[role] && roles.roles[role].permissions.includes(perm))
  // Who may do `perm` (for the "requires ..." hint)
  const whoCan = (perm) => (roles ? Object.keys(roles.roles).filter((r) => roles.roles[r].permissions.includes(perm)).map(roleLabel).join(' / ') : '')
  // Buttons for actions this role can't do are disabled, unless "show blocked actions" is on
  // (then the click goes to the server, which refuses it with 403).
  const gated = (perm, style) => {
    const off = !can(perm) && !showBlocked
    return {
      disabled: off,
      title: can(perm) ? undefined : tr(`প্রয়োজন: ${whoCan(perm)}`, `Requires: ${whoCan(perm)}`),
      style: off ? { ...style, opacity: 0.4, cursor: 'not-allowed' } : style,
    }
  }
  const needs = (perm) => !can(perm) && (
    <div style={{ fontSize: 13, color: '#8f1f1f', marginTop: 6 }}>
      🔒 {tr(`${roleLabel(role)} এটি করতে পারবেন না। প্রয়োজন: ${whoCan(perm)}`, `${roleLabel(role)} cannot do this. Requires: ${whoCan(perm)}`)}
    </div>
  )
  const changeLang = (l) => {
    setLang(l)
    try { localStorage.setItem('landlock_lang', l) } catch (e) { /* ignore */ }
  }

  const connectError = () => setError('CONNECT')

  const loadExtras = () => {
    fetch(`${API}/ledger/verify`).then((r) => r.json()).then(setChain).catch(() => {})
    fetch(`${API}/gap`).then((r) => r.json()).then(setGap).catch(() => {})
  }

  const load = (id) =>
    fetch(`${API}/plots/${id}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setError(''); loadExtras(); return d })
      .catch(connectError)

  useEffect(() => {
    fetch(`${API}/plots`).then((r) => r.json()).then(setPlots).catch(connectError)
    fetch(`${API}/roles`).then((r) => r.json()).then(setRoles).catch(() => {})
  }, [])

  // when a plot is selected: load it and pre-fill the seller + area
  useEffect(() => {
    setResult(null)
    setMresult(null)
    load(selectedId).then((d) => {
      if (d) setForm((f) => ({ ...f, seller: d.plot.current_owner, deed_area: String(d.plot.area) }))
    })
  }, [selectedId])

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

  const releaseMortgage = async () => {
    const res = await post('/mortgage/release', { plot_id: selectedId }, role)
    setMresult(res.status >= 400 ? res : null)
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

  const c = data ? COLORS[data.risk.level] : null
  const tx = data && data.active_transaction
  const stepLabel = (v) => (v === 'done' ? tr('সম্পন্ন', 'Done') : tr('বাকি', 'Pending'))
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 20 }}>
      {/* DEMO ROLE SWITCH: not a login. The server enforces permissions on every write. */}
      <div style={{ border: '2px dashed #7c3aed', background: '#f5f0ff', borderRadius: 10, padding: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <b style={{ color: '#5b21b6' }}>🎭 DEMO ROLE SWITCH</b>
          <select value={role} onChange={(e) => { setRole(e.target.value); setResult(null); setMresult(null) }}>
            {Object.keys(ROLE_LABEL).map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={showBlocked} onChange={(e) => setShowBlocked(e.target.checked)} />{' '}
            {tr('নিষিদ্ধ কাজের বোতামও চালু রাখুন (সার্ভারের বাধা দেখতে)', 'Enable blocked buttons (to see the server refuse them)')}
          </label>
        </div>
        <div style={{ fontSize: 12, color: '#555', marginTop: 6 }}>
          {tr(
            'এটি আসল লগইন নয়। শুধু ডেমোর জন্য। বাস্তবে প্রয়োজন: আসল লগইন, নিরাপদ সেশন এবং যাচাই করা পরিচয়ের ভিত্তিতে সার্ভারে অনুমতি যাচাই।',
            'This is NOT real authentication, only a demo. Production needs real login, secure sessions and server-side authorization based on verified identities.',
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ marginBottom: 0 }}>🔒 LandLock</h1>
        <div>
          <button
            style={{ ...btn(lang === 'bn' ? '#111' : '#999'), marginTop: 0, marginRight: 4, padding: '6px 12px' }}
            onClick={() => changeLang('bn')}
          >
            বাংলা
          </button>
          <button
            style={{ ...btn(lang === 'en' ? '#111' : '#999'), marginTop: 0, marginRight: 0, padding: '6px 12px' }}
            onClick={() => changeLang('en')}
          >
            English
          </button>
        </div>
      </div>
      <p style={{ marginTop: 4, color: '#555' }}>
        {tr('এক জমি, এক মালিক। কেনার আগে জমি যাচাই করুন।', 'One Land. One Owner. Verify before you buy.')}
      </p>

      {error && (
        <div style={{ background: '#fdeaea', padding: 12, borderRadius: 8 }}>
          {tr('ব্যাকএন্ডের সাথে সংযোগ হচ্ছে না। npm start চালু আছে কিনা দেখুন।', 'Cannot connect to the backend. Is npm start running?')}
        </div>
      )}

      <label>
        {tr('জমি নির্বাচন করুন', 'Select plot')}:{' '}
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          {plots.map((p) => (
            <option key={p.id} value={p.id}>{p.id} - {p.mouza}, {tr('দাগ', 'Dag')} {p.dag_no}</option>
          ))}
        </select>
      </label>

      {chain && (
        <div
          style={{
            marginTop: 12, padding: 10, borderRadius: 8, fontWeight: 600,
            background: chain.valid ? '#e6f6ec' : '#fdeaea',
            color: chain.valid ? '#1b6b3a' : '#8f1f1f',
          }}
        >
          {chain.valid
            ? tr(
                '✅ Ledger অক্ষত আছে: hash chain ঠিক আছে, প্রতিটি এন্ট্রি রেজিস্ট্রির ডিজিটাল স্বাক্ষরে সাইন করা, trusted checkpoint মিলেছে এবং জমির রেকর্ড Ledger-এর সাথে মিলছে',
                '✅ Ledger intact: hash chain is valid, every entry is signed by the registry, it matches the trusted checkpoint, and the land records match the ledger',
              )
            : chain.kind === 'signature'
              ? tr(
                  `❌ জাল ধরা পড়েছে! Hash ঠিক দেখালেও ডিজিটাল স্বাক্ষর মিলছে না (এন্ট্রি #${chain.brokenAt})।`,
                  `❌ Forgery detected! Hashes look fine but the digital signature is invalid. ${chain.reason}`,
                )
              : tr(
                  `❌ Ledger যাচাই ব্যর্থ (${chain.kind})${chain.brokenAt ? `, এন্ট্রি #${chain.brokenAt}` : ''}: ${chain.bn}`,
                  `❌ Ledger check failed (${chain.kind}): ${chain.reason}`,
                )}
        </div>
      )}
      <div>
        <button style={btn('#b45309')} onClick={tamper}>⚠️ {tr('Record tamper করুন (demo)', 'Tamper a record (demo)')}</button>
        <button style={btn('#9f1239')} onClick={smartTamper}>🕵️ {tr('Smart tamper (hash নতুন করে বানাবে)', 'Smart tamper (recomputes hashes)')}</button>
        <button style={btn('#7f1d1d')} onClick={() => attack('truncate_tail')}>✂️ {tr('শেষ এন্ট্রি মুছুন (demo)', 'Delete last entry (demo)')}</button>
        <button style={btn('#7f1d1d')} onClick={() => attack('owner_change')}>👤 {tr('P1-এর মালিক সরাসরি বদলান (demo)', 'Change P1 owner directly (demo)')}</button>
        <button style={btn('#555')} onClick={reset}>🔄 Reset (demo)</button>
      </div>

      {data && (
        <>
          <div style={card}>
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>{tr('জমির তথ্য', 'Plot details')}</h3>
            {sampleBadge(lang)}
            <div>{tr('মৌজা', 'Mouza')}: <b>{data.plot.mouza}</b></div>
            <div>{tr('খতিয়ান নং', 'Khatian no.')}: <b>{data.plot.khatian_no}</b> | {tr('দাগ নং', 'Dag no.')}: <b>{data.plot.dag_no}</b></div>
            <div>{tr('পরিমাণ', 'Area')}: <b>{data.plot.area} {tr('শতক', 'decimal')}</b></div>
            <div>{tr('বর্তমান মালিক', 'Current owner')}: <b>{data.plot.current_owner}</b></div>
            <div>
              {tr('অবস্থা', 'Status')}:{' '}
              <b>
                {data.plot.status === 'Pending' ? tr('🔒 Pending (লক)', '🔒 Pending (locked)')
                  : data.plot.status === 'Disputed' ? tr('⛔ Disputed (বিরোধপূর্ণ, লক)', '⛔ Disputed (locked)')
                    : tr('🔓 Free (মুক্ত)', '🔓 Free')}
              </b>
            </div>
            {data.plot.mortgage && (
              <div>
                {tr('বন্ধক', 'Mortgage')}: <b>🏦 {data.plot.mortgage.bank}</b> ({tr('ঋণ নং', 'Loan no.')} {data.plot.mortgage.loan_ref})
              </div>
            )}
          </div>

          <div style={{ background: c.bg, border: `2px solid ${c.border}`, color: c.text, borderRadius: 12, padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{c[lang]}</div>
            {data.risk.reasons.map((r) => (
              <div key={r.code} style={{ marginTop: 8, fontSize: 17 }}>{r[lang]}</div>
            ))}
          </div>

          <SurveyTimeline plot={data.plot} lang={lang} />

          {/* Active sale: action buttons */}
          {tx && (
            <div style={card}>
              <h3 style={{ marginTop: 0 }}>{tr('চলমান বিক্রয়', 'Sale in progress')}: {tx.seller} → {tx.buyer}</h3>
              <div>
                {tr('দলিল নং', 'Deed no.')}: {tx.deed_no} | {tr('নিবন্ধন', 'Registration')}: <b>{stepLabel(tx.reg_status)}</b> | {tr('নামজারি', 'Mutation')}: <b>{stepLabel(tx.mutation_status)}</b>
              </div>
              {tx.reg_status !== 'done' && (
                <button {...gated('sale.register', btn('#2563eb'))} onClick={() => action('register')}>{tr('দলিল নিবন্ধন সম্পন্ন', 'Mark deed registered')}</button>
              )}
              {tx.reg_status === 'done' && (
                <>
                  <button {...gated('sale.mutate', btn('#2e9d57'))} onClick={() => action('mutate')}>{tr('নামজারি সম্পন্ন (মালিক পরিবর্তন)', 'Complete mutation (change owner)')}</button>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 4 }}>
                    <div style={{ flex: 1 }}>
                      {tr('নামজারি বাতিলের কারণ', 'Reason for rejecting mutation')}
                      <input style={input} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder={tr('যেমন: বিক্রেতার স্বাক্ষর নিয়ে আপত্তি', 'e.g. seller signature disputed')} />
                    </div>
                    <button {...gated('sale.reject_mutation', btn('#b91c1c'))} onClick={() => action('reject-mutation', { reason: rejectReason })}>
                      ⛔ {tr('নামজারি বাতিল (বিরোধপূর্ণ)', 'Reject mutation (Disputed)')}
                    </button>
                  </div>
                  <div style={{ fontSize: 13, color: '#555', marginTop: 6 }}>
                    ℹ️ {tr(
                      'দলিল নিবন্ধিত হয়েছে, তাই এখন আর সাধারণভাবে বাতিল করা যাবে না। শুধু এসি ল্যান্ড অফিসার নামজারি সম্পন্ন বা বাতিল করতে পারবেন।',
                      'The deed is registered, so the sale can no longer be cancelled. Only the AC Land Officer can complete or reject the mutation.',
                    )}
                  </div>
                </>
              )}
              {/* After registration Cancel is hidden; with "Enable blocked buttons" it stays visible so the server's refusal can be shown */}
              {(tx.reg_status !== 'done' || showBlocked) && (
                <button {...gated('sale.cancel', btn('#777'))} onClick={() => action('cancel')}>{tr('বিক্রয় বাতিল', 'Cancel sale')}</button>
              )}
              {needs(tx.reg_status === 'done' ? 'sale.mutate' : 'sale.register')}
              {result && result.src === 'tx' && <ErrorBox body={result.body} lang={lang} />}
            </div>
          )}

          {/* Disputed: mutation rejected, plot stays locked */}
          {data.disputed_transaction && (
            <div style={{ ...card, border: '2px solid #d93a3a', background: '#fdeaea', color: '#8f1f1f' }}>
              <h3 style={{ marginTop: 0 }}>⛔ {tr('বিরোধপূর্ণ লেনদেন (নামজারি বাতিল)', 'Disputed transaction (mutation rejected)')}</h3>
              <div>
                {data.disputed_transaction.seller} → {data.disputed_transaction.buyer} | {tr('দলিল নং', 'Deed no.')}: {data.disputed_transaction.deed_no} | {tr('নিবন্ধন', 'Registration')}: <b>{stepLabel('done')}</b> | {tr('নামজারি', 'Mutation')}: <b>{tr('বাতিল', 'Rejected')}</b>
              </div>
              <div style={{ marginTop: 6 }}>{tr('কারণ', 'Reason')}: <b>{data.disputed_transaction.dispute_reason}</b></div>
              <div style={{ fontSize: 13, marginTop: 6 }}>
                {tr(
                  'জমিটি লক থাকবে। বিরোধ নিষ্পত্তি (যেমন আদালতের আদেশ) এই প্রোটোটাইপের বাইরে।',
                  'The plot stays locked. Resolving the dispute (e.g. a court order) is outside this prototype.',
                )}
              </div>
            </div>
          )}

          {/* Sale form */}
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>{tr('নতুন বিক্রয় শুরু করুন', 'Start a new sale')}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>{tr('বিক্রেতা', 'Seller')}<input style={input} value={form.seller} onChange={setField('seller')} /></div>
              <div>{tr('ক্রেতা', 'Buyer')}<input style={input} value={form.buyer} onChange={setField('buyer')} placeholder="e.g. Karim" /></div>
              <div>{tr('দলিল নং', 'Deed no.')}<input style={input} value={form.deed_no} onChange={setField('deed_no')} placeholder="e.g. D-1001" /></div>
              <div>
                {tr('দলিলের পরিমাণ (শতক)', 'Deed area (decimal)')}<input style={input} value={form.deed_area} onChange={setField('deed_area')} />
                <div style={{ fontSize: 12, color: '#777' }}>
                  {tr(`শুধু পুরো জমি (${data.plot.area} শতক) বিক্রয় করা যাবে (প্রোটোটাইপ)`, `Full plot only (${data.plot.area} decimal) in this prototype`)}
                </div>
              </div>
            </div>
            <button {...gated('sale.initiate', btn('#111'))} onClick={submitSale}>{tr('বিক্রয় যাচাই ও শুরু করুন', 'Verify and start sale')}</button>
            {needs('sale.initiate')}

            {result && result.body.blocked && (
              <div style={{ background: '#fdeaea', border: '2px solid #d93a3a', color: '#8f1f1f', borderRadius: 8, padding: 12, marginTop: 12 }}>
                <b>❌ {tr('বিক্রয় আটকানো হয়েছে (Blocked)', 'Sale blocked')}</b>
                {result.body.reasons.map((r) => (
                  <div key={r.code} style={{ marginTop: 6 }}>{r[lang]}</div>
                ))}
              </div>
            )}
            {result && result.body.blocked === false && (
              <div style={{ background: '#e6f6ec', border: '2px solid #2e9d57', color: '#1b6b3a', borderRadius: 8, padding: 12, marginTop: 12 }}>
                ✅ {tr('যাচাই সফল। জমিটি এখন Pending (লক) অবস্থায় আছে।', 'Checks passed. The plot is now Pending (locked).')}
              </div>
            )}
            {result && result.body.error && result.src !== 'tx' && <ErrorBox body={result.body} lang={lang} />}
          </div>

          {/* Bank mortgage */}
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>🏦 {tr('ব্যাংক বন্ধক', 'Bank mortgage')}</h3>
            {data.plot.mortgage ? (
              <div>
                {tr(
                  <>এই জমি <b>{data.plot.mortgage.bank}</b>-এ বন্ধক আছে।</>,
                  <>This plot is mortgaged to <b>{data.plot.mortgage.bank}</b>.</>,
                )}
                <div>
                  <button {...gated('mortgage.release', btn('#777'))} onClick={releaseMortgage}>{tr('বন্ধক মুক্ত করুন', 'Release mortgage')}</button>
                </div>
              </div>
            ) : (
              <div style={{ color: '#777' }}>{tr('কোনো বন্ধক নেই।', 'No mortgage.')}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
              <div>{tr('বন্ধকদাতা', 'Mortgagor')}<input style={input} value={mform.owner} onChange={(e) => setMform({ ...mform, owner: e.target.value })} placeholder={data.plot.current_owner} /></div>
              <div>{tr('ব্যাংক', 'Bank')}<input style={input} value={mform.bank} onChange={(e) => setMform({ ...mform, bank: e.target.value })} placeholder="e.g. Sonali Bank" /></div>
              <div>{tr('ঋণ নং', 'Loan no.')}<input style={input} value={mform.loan_ref} onChange={(e) => setMform({ ...mform, loan_ref: e.target.value })} placeholder="e.g. LN-101" /></div>
            </div>
            <button {...gated('mortgage.create', btn('#0f766e'))} onClick={submitMortgage}>{tr('বন্ধক যাচাই ও নিবন্ধন করুন', 'Verify and register mortgage')}</button>
            {needs('mortgage.create')}

            {mresult && mresult.body.blocked && (
              <div style={{ background: '#fdeaea', border: '2px solid #d93a3a', color: '#8f1f1f', borderRadius: 8, padding: 12, marginTop: 12 }}>
                <b>❌ {tr('বন্ধক আটকানো হয়েছে (Blocked)', 'Mortgage blocked')}</b>
                {mresult.body.reasons.map((r) => (
                  <div key={r.code} style={{ marginTop: 6 }}>{r[lang]}</div>
                ))}
              </div>
            )}
            {mresult && mresult.body.blocked === false && (
              <div style={{ background: '#e6f6ec', border: '2px solid #2e9d57', color: '#1b6b3a', borderRadius: 8, padding: 12, marginTop: 12 }}>
                ✅ {tr('বন্ধক নিবন্ধিত হয়েছে।', 'Mortgage registered.')}
              </div>
            )}
            {mresult && mresult.body.error && <ErrorBox body={mresult.body} lang={lang} />}
          </div>

          <div style={card}>
            <h3 style={{ marginTop: 0 }}>{tr('ইতিহাস (Ledger)', 'History (Ledger)')}</h3>
            {data.history.length === 0 && <div style={{ color: '#777' }}>{tr('এখনও কোনো লেনদেন নেই।', 'No transactions yet.')}</div>}
            {data.history.map((h) => (
              <div key={h.id} style={{ borderTop: '1px solid #eee', padding: '8px 0', fontSize: 14 }}>
                <b>#{h.id} {(EVENT_LABEL[h.event_type] || { bn: h.event_type, en: h.event_type })[lang]}</b>
                <div style={{ color: '#777' }}>
                  {new Date(h.timestamp).toLocaleString(locale)} | hash: {h.hash.slice(0, 12)}...
                  {h.signature && <> | 🔏 sig: {h.signature.slice(0, 10)}...</>}
                  {h.data && h.data.by_role && <> | 👤 {roleLabel(h.data.by_role)}</>}
                </div>
              </div>
            ))}
          </div>

          <div style={card}>
            <h3 style={{ marginTop: 0 }}>{tr('নিবন্ধিত কিন্তু নামজারি হয়নি (Gap)', 'Registered but not mutated (Gap)')}</h3>
            {gap.length === 0 && <div style={{ color: '#777' }}>{tr('কোনো ঝুঁকিপূর্ণ দলিল নেই।', 'No risky deeds.')}</div>}
            {gap.map((g) => (
              <div key={g.id} style={{ borderTop: '1px solid #eee', padding: '8px 0', fontSize: 14 }}>
                {g.state === 'disputed' && <b style={{ color: '#8f1f1f' }}>⛔ {tr('বিরোধপূর্ণ', 'Disputed')} | </b>}
                Plot {g.plot_id}: {g.seller} → {g.buyer} | {tr('দলিল', 'Deed')} {g.deed_no} | {g.days_waiting} {tr('দিন অপেক্ষায়', 'days waiting')}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}