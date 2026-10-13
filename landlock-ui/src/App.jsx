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
  SALE_CANCELLED: { bn: 'বিক্রয় বাতিল', en: 'Sale cancelled' },
  MORTGAGE_CREATED: { bn: 'বন্ধক নিবন্ধিত', en: 'Mortgage registered' },
  MORTGAGE_BLOCKED: { bn: 'বন্ধক আটকানো হয়েছে', en: 'Mortgage blocked' },
  MORTGAGE_RELEASED: { bn: 'বন্ধক মুক্ত', en: 'Mortgage released' },
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

async function post(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  return { status: r.status, body: await r.json() }
}

function SurveyTimeline({ plot, lang }) {
  const tr = (bn, en) => (lang === 'bn' ? bn : en)
  const chain = plot.survey || []
  if (chain.length === 0) return null
  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>📜 {tr('জরিপ ইতিহাস', 'Survey history')} (CS → SA → RS → BS)</h3>
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

  const tr = (bn, en) => (lang === 'bn' ? bn : en)
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

  const submitMortgage = async () => {
    const res = await post('/mortgage/create', {
      plot_id: selectedId,
      owner: mform.owner || data.plot.current_owner,
      bank: mform.bank,
      loan_ref: mform.loan_ref,
    })
    setMresult(res)
    load(selectedId)
  }

  const releaseMortgage = async () => {
    await post('/mortgage/release', { plot_id: selectedId })
    setMresult(null)
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
    const res = await post('/sale/initiate', { plot_id: selectedId, ...form })
    setResult(res)
    load(selectedId)
  }

  const action = async (type) => {
    const txId = data.active_transaction.id
    const res = await post(`/sale/${txId}/${type}`)
    if (res.status >= 400) setResult({ status: res.status, body: { error: res.body.error } })
    else setResult(null)
    const d = await load(selectedId)
    if (d) setForm((f) => ({ ...f, seller: d.plot.current_owner, deed_area: String(d.plot.area) }))
  }

  const c = data ? COLORS[data.risk.level] : null
  const tx = data && data.active_transaction
  const stepLabel = (v) => (v === 'done' ? tr('সম্পন্ন', 'Done') : tr('বাকি', 'Pending'))
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 20 }}>
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
                '✅ Ledger অক্ষত আছে: hash chain ঠিক আছে এবং প্রতিটি এন্ট্রি রেজিস্ট্রির ডিজিটাল স্বাক্ষরে সাইন করা',
                '✅ Ledger intact: hash chain is valid and every entry is signed by the registry',
              )
            : chain.kind === 'signature'
              ? tr(
                  `❌ জাল ধরা পড়েছে! Hash ঠিক দেখালেও ডিজিটাল স্বাক্ষর মিলছে না (এন্ট্রি #${chain.brokenAt})।`,
                  `❌ Forgery detected! Hashes look fine but the digital signature is invalid. ${chain.reason}`,
                )
              : tr(
                  `❌ Chain ভেঙে গেছে! এন্ট্রি #${chain.brokenAt}-এ তথ্য পরিবর্তন ধরা পড়েছে।`,
                  `❌ Chain broken! ${chain.reason}`,
                )}
        </div>
      )}
      <div>
        <button style={btn('#b45309')} onClick={tamper}>⚠️ {tr('Record tamper করুন (demo)', 'Tamper a record (demo)')}</button>
        <button style={btn('#9f1239')} onClick={smartTamper}>🕵️ {tr('Smart tamper (hash নতুন করে বানাবে)', 'Smart tamper (recomputes hashes)')}</button>
        <button style={btn('#555')} onClick={reset}>🔄 Reset (demo)</button>
      </div>

      {data && (
        <>
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>{tr('জমির তথ্য', 'Plot details')}</h3>
            <div>{tr('মৌজা', 'Mouza')}: <b>{data.plot.mouza}</b></div>
            <div>{tr('খতিয়ান নং', 'Khatian no.')}: <b>{data.plot.khatian_no}</b> | {tr('দাগ নং', 'Dag no.')}: <b>{data.plot.dag_no}</b></div>
            <div>{tr('পরিমাণ', 'Area')}: <b>{data.plot.area} {tr('শতক', 'decimal')}</b></div>
            <div>{tr('বর্তমান মালিক', 'Current owner')}: <b>{data.plot.current_owner}</b></div>
            <div>
              {tr('অবস্থা', 'Status')}:{' '}
              <b>{data.plot.status === 'Pending' ? tr('🔒 Pending (লক)', '🔒 Pending (locked)') : tr('🔓 Free (মুক্ত)', '🔓 Free')}</b>
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
                <button style={btn('#2563eb')} onClick={() => action('register')}>{tr('দলিল নিবন্ধন সম্পন্ন', 'Mark deed registered')}</button>
              )}
              {tx.reg_status === 'done' && (
                <button style={btn('#2e9d57')} onClick={() => action('mutate')}>{tr('নামজারি সম্পন্ন (মালিক পরিবর্তন)', 'Complete mutation (change owner)')}</button>
              )}
              <button style={btn('#777')} onClick={() => action('cancel')}>{tr('বিক্রয় বাতিল', 'Cancel sale')}</button>
            </div>
          )}

          {/* Sale form */}
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>{tr('নতুন বিক্রয় শুরু করুন', 'Start a new sale')}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>{tr('বিক্রেতা', 'Seller')}<input style={input} value={form.seller} onChange={setField('seller')} /></div>
              <div>{tr('ক্রেতা', 'Buyer')}<input style={input} value={form.buyer} onChange={setField('buyer')} placeholder="e.g. Karim" /></div>
              <div>{tr('দলিল নং', 'Deed no.')}<input style={input} value={form.deed_no} onChange={setField('deed_no')} placeholder="e.g. D-1001" /></div>
              <div>{tr('দলিলের পরিমাণ (শতক)', 'Deed area (decimal)')}<input style={input} value={form.deed_area} onChange={setField('deed_area')} /></div>
            </div>
            <button style={btn('#111')} onClick={submitSale}>{tr('বিক্রয় যাচাই ও শুরু করুন', 'Verify and start sale')}</button>

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
            {result && result.body.error && (
              <div style={{ background: '#fdeaea', borderRadius: 8, padding: 12, marginTop: 12 }}>{result.body.error}</div>
            )}
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
                  <button style={btn('#777')} onClick={releaseMortgage}>{tr('বন্ধক মুক্ত করুন', 'Release mortgage')}</button>
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
            <button style={btn('#0f766e')} onClick={submitMortgage}>{tr('বন্ধক যাচাই ও নিবন্ধন করুন', 'Verify and register mortgage')}</button>

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
            {mresult && mresult.body.error && (
              <div style={{ background: '#fdeaea', borderRadius: 8, padding: 12, marginTop: 12 }}>{mresult.body.error}</div>
            )}
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
                </div>
              </div>
            ))}
          </div>

          <div style={card}>
            <h3 style={{ marginTop: 0 }}>{tr('নিবন্ধিত কিন্তু নামজারি হয়নি (Gap)', 'Registered but not mutated (Gap)')}</h3>
            {gap.length === 0 && <div style={{ color: '#777' }}>{tr('কোনো ঝুঁকিপূর্ণ দলিল নেই।', 'No risky deeds.')}</div>}
            {gap.map((g) => (
              <div key={g.id} style={{ borderTop: '1px solid #eee', padding: '8px 0', fontSize: 14 }}>
                Plot {g.plot_id}: {g.seller} → {g.buyer} | {tr('দলিল', 'Deed')} {g.deed_no} | {g.days_waiting} {tr('দিন অপেক্ষায়', 'days waiting')}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}