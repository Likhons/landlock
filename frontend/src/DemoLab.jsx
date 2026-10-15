import { useState } from 'react'

// Demo forgery test bench (demo mode only). Each attack edits the stored data behind the system's
// back; the panel says which protection should catch it and, after a run, which one actually did,
// read from the real ledger check (chain.kind / chain.brokenAt).

// The protection that catches each kind of failure reported by GET /api/ledger/verify
const GUARD = {
  hash: { bn: 'Hash শিকল', en: 'Hash chain' },
  signature: { bn: 'ডিজিটাল স্বাক্ষর', en: 'Digital signature' },
  checkpoint: { bn: 'স্বাক্ষরিত checkpoint', en: 'Signed checkpoint' },
  replay: { bn: 'রেকর্ড পুনর্গঠন (replay)', en: 'Ledger replay' },
}
const GUARD_OF_KIND = {
  hash: 'hash', link: 'hash', sequence: 'hash', genesis: 'hash',
  signature: 'signature', truncation: 'checkpoint', checkpoint: 'checkpoint', state: 'replay', workflow: 'replay',
}

const ATTACKS = [
  {
    key: 'tamper', path: '/dev/tamper', guard: 'hash', needs: 'sale',
    bn: 'পুরনো এন্ট্রি বদলানো', en: 'Edit an old entry',
    whatBn: 'একটি বিক্রয়ের ক্রেতার নাম সরাসরি ডেটাবেসে বদলে দেয়।', whatEn: 'Changes a sale’s buyer straight in the database.',
  },
  {
    key: 'smart', path: '/dev/tamper-smart', guard: 'signature', needs: 'sale',
    bn: 'চতুর জালিয়াত', en: 'Smart forger',
    whatBn: 'নাম বদলায়, তারপর পরের সব hash নতুন করে বানায়, যাতে শিকল ঠিক দেখায়।', whatEn: 'Edits the buyer, then recomputes every later hash so the chain looks intact.',
  },
  {
    key: 'truncate', path: '/dev/attack', body: { type: 'truncate_tail' }, guard: 'checkpoint', needs: 'two',
    bn: 'শেষ এন্ট্রি মুছে ফেলা', en: 'Delete the newest entry',
    whatBn: 'সর্বশেষ ঘটনাটি লেজার থেকে লুকিয়ে ফেলে।', whatEn: 'Hides the latest event from the ledger.',
  },
  {
    key: 'owner', path: '/dev/attack', body: { type: 'owner_change' }, guard: 'replay',
    bn: 'মালিক সরাসরি বদলানো', en: 'Change an owner directly',
    whatBn: 'দাগ ১২৩ (P1)-এর মালিক বদলায়, কোনো দলিল বা নামজারি ছাড়া।', whatEn: 'Sets plot P1’s owner with no deed and no mutation.',
  },
]

const DIGITS_BN = '০১২৩৪৫৬৭৮৯'
const num = (n, lang) => { const s = String(n).padStart(2, '0'); return lang === 'bn' ? s.replace(/\d/g, (d) => DIGITS_BN[d]) : s }

export default function DemoLab({ chain, entries, lang, Icon, onRun, onReset }) {
  const tr = (bn, en) => (lang === 'bn' ? bn : en)
  const [last, setLast] = useState(null) // key of the attack run most recently
  const [busy, setBusy] = useState(null)
  const [errors, setErrors] = useState({}) // key -> server message (e.g. nothing to tamper with yet)

  const broken = Boolean(chain && !chain.valid)
  const caughtBy = broken ? GUARD_OF_KIND[chain.kind] : null
  const hasSale = entries.some((e) => e.event_type === 'SALE_INITIATED')
  const blockedWhy = (a) => {
    if (broken) return tr('লেজার এখন ভাঙা। আগে Reset করুন।', 'The ledger is broken right now. Reset first.')
    if (a.needs === 'sale' && !hasSale) return tr('আগে একটি বিক্রয় শুরু করুন (সাব-রেজিস্ট্রার)।', 'Start a sale first (Sub-Registrar).')
    if (a.needs === 'two' && entries.length < 2) return tr('লেজারে অন্তত ২টি এন্ট্রি লাগবে।', 'The ledger needs at least 2 entries.')
    return null
  }

  const run = async (a) => {
    setBusy(a.key)
    setErrors((x) => ({ ...x, [a.key]: null }))
    const res = await onRun(a.path, a.body)
    if (res.status >= 400) setErrors((x) => ({ ...x, [a.key]: res.body[lang] || res.body.error }))
    else setLast(a.key)
    setBusy(null)
  }
  const reset = async () => {
    setBusy('reset')
    await onReset()
    setLast(null)
    setErrors({})
    setBusy(null)
  }

  return (
    <details className={`lab${broken ? ' broken' : ''}`}>
      <summary>
        <span className="lab-ico" aria-hidden="true"><Icon name="zap" size={18} /></span>
        <span className="lab-title">
          {tr('জালিয়াতির পরীক্ষা', 'Forgery test bench')}
          <span className="lab-sub">{tr('ডেমো · কেউ সরাসরি ডেটাবেস বদলালে কী হয়', 'Demo · what happens when someone edits the database directly')}</span>
        </span>
        {chain && (
          <span className={`lab-state ${broken ? 'bad' : 'ok'}`}>
            <i aria-hidden="true" />{broken ? tr('জাল ধরা পড়েছে', 'Forgery caught') : tr('লেজার অক্ষত', 'Ledger intact')}
          </span>
        )}
        <span className="chev" aria-hidden="true"><Icon name="chevron" /></span>
      </summary>

      <div className="lab-body">
        <p className="lab-lede">
          {tr('যেকোনো একটি আক্রমণ চালান, তারপর দেখুন রেজিস্ট্রির কোন পাহারা সেটা ধরে।', 'Run any attack, then see which of the registry’s protections catches it.')}
        </p>
        <ol className="lab-list">
          {ATTACKS.map((a, i) => {
            const why = blockedWhy(a)
            const caught = broken && last === a.key
            return (
              <li key={a.key} className={`lab-row${caught ? ' caught' : ''}`}>
                <span className="lab-num" aria-hidden="true">{num(i + 1, lang)}</span>
                <div className="lab-main">
                  <b>{tr(a.bn, a.en)}</b>
                  <span className="lab-what">{tr(a.whatBn, a.whatEn)}</span>
                  <span className={`lab-guard${caught && caughtBy === a.guard ? ' hit' : ''}`}>
                    <Icon name="shield" size={13} /> {tr('ধরবে', 'Caught by')}: {GUARD[a.guard][lang]}
                  </span>
                  {caught && (
                    <span className="lab-result" role="status">
                      {tr('ধরা পড়েছে', 'Caught')}: <b>{GUARD[caughtBy] ? GUARD[caughtBy][lang] : chain.kind}</b>
                      {chain.brokenAt ? ` · ${tr('এন্ট্রি', 'entry')} #${chain.brokenAt}` : ''}
                    </span>
                  )}
                  {errors[a.key] && <span className="lab-err">{errors[a.key]}</span>}
                </div>
                <div className="lab-act">
                  {caught ? (
                    <span className="lab-stamp" aria-hidden="true">{tr('ধরা পড়েছে', 'CAUGHT')}</span>
                  ) : why ? (
                    <span className="lab-why">{why}</span>
                  ) : (
                    <button type="button" className="lab-run" onClick={() => run(a)} disabled={busy !== null}>
                      {busy === a.key ? tr('চলছে…', 'Running…') : tr('চালান', 'Run')} <Icon name="arrow" size={15} />
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
        <div className="lab-foot">
          <span className="lab-foot-note">
            {broken
              ? tr('লেজার ভাঙা থাকা পর্যন্ত সার্ভার কোনো নতুন বিক্রয় বা বন্ধক লিখবে না।', 'While the ledger is broken, the server refuses every new sale or mortgage.')
              : tr('Reset নমুনা রেকর্ড ও লেজার শুরুর অবস্থায় ফিরিয়ে দেয়।', 'Reset puts the sample records and ledger back to the start.')}
          </span>
          <button type="button" className={`lab-reset${broken ? ' urgent' : ''}`} onClick={reset} disabled={busy !== null}>
            <Icon name="refresh" size={15} /> {broken ? tr('রেকর্ড আগের মতো করুন', 'Restore the records') : 'Reset'}
          </button>
        </div>
      </div>
    </details>
  )
}
