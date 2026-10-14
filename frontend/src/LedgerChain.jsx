import { useEffect, useId, useRef, useState } from 'react'

// The four things the server verifies, in the order it verifies them. Each failure kind from
// /api/ledger/verify belongs to exactly one of them; checks after a failure were not reached.
const CHECKS = [
  { kinds: ['genesis', 'sequence', 'link', 'hash'], bn: 'হ্যাশ শিকল', en: 'Hash chain', sub: { bn: 'প্রতিটি এন্ট্রি আগেরটির সাথে বাঁধা', en: 'each entry tied to the one before' } },
  { kinds: ['signature'], bn: 'ডিজিটাল স্বাক্ষর', en: 'Digital signatures', sub: { bn: 'রেজিস্ট্রির কী দিয়ে সাইন করা', en: 'signed with the registry key' } },
  { kinds: ['truncation', 'checkpoint'], bn: 'বিশ্বস্ত চেকপয়েন্ট', en: 'Trusted checkpoint', sub: { bn: 'কোনো এন্ট্রি মোছা হয়নি', en: 'no entry was deleted' } },
  { kinds: ['state', 'workflow'], bn: 'রেকর্ড ও লেজার মিল', en: 'Records match ledger', sub: { bn: 'জমির রেকর্ড লেজারের সাথে মেলে', en: 'land records agree with the ledger' } },
]

// Verification as a scan along a track: the server runs these four checks in this order, so the
// track lights up step by step and stops, red, at the step that failed (later steps were not reached).
export function LedgerChecks({ chain, lang }) {
  const failAt = chain.valid ? -1 : CHECKS.findIndex((c) => c.kinds.includes(chain.kind))
  const state = (i) => (chain.valid || failAt === -1 || i < failAt ? 'pass' : i === failAt ? 'fail' : 'skip')
  const mark = { pass: '✓', fail: '✕', skip: '' }
  const hint = { pass: { bn: 'ঠিক আছে', en: 'passed' }, fail: { bn: 'ব্যর্থ', en: 'failed' }, skip: { bn: 'যাচাই হয়নি', en: 'not reached' } }
  return (
    <ol className="vtrack" aria-label={lang === 'bn' ? 'যাচাইয়ের ধাপ' : 'Verification steps'}>
      {CHECKS.map((c, i) => (
        <li key={c.en} className={`vt ${state(i)}`} style={{ '--d': `${0.25 + i * 0.32}s` }} title={hint[state(i)][lang]}>
          <span className="vt-node" aria-hidden="true"><span className="vt-n">{i + 1}</span><span className="vt-m">{mark[state(i)]}</span></span>
          <span className="vt-text">
            <span className="vt-label">{c[lang]}</span>
            <span className="vt-sub">{c.sub[lang]}</span>
          </span>
          <span className="sr-only">: {hint[state(i)][lang]}</span>
        </li>
      ))}
    </ol>
  )
}

// A wax seal, like the seal on a registered deed: green and whole when verified, red and cracked when not.
export function LedgerSeal({ ok }) {
  const id = useId()
  const ring = ok ? 'LANDLOCK • LEDGER VERIFIED • ' : 'LANDLOCK • LEDGER BROKEN • '
  // scalloped wax edge: 16 soft bumps around the circle
  const edge = Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2
    const r = i % 2 ? 46 : 49
    return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`
  }).join(' ')
  return (
    <svg className={`seal ${ok ? 'ok' : 'bad'}`} viewBox="0 0 100 100" width="96" height="96" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-wax`} cx="38%" cy="32%" r="75%">
          <stop offset="0" className="wax-hi" />
          <stop offset="1" className="wax-lo" />
        </radialGradient>
        <path id={`${id}-ring`} d="M50 50 m-34 0 a34 34 0 1 1 68 0 a34 34 0 1 1 -68 0" />
      </defs>
      <polygon className="seal-wax" points={edge} fill={`url(#${id}-wax)`} strokeLinejoin="round" />
      <circle className="seal-gold" cx="50" cy="50" r="43.5" />
      <circle className="seal-groove" cx="50" cy="50" r="40" />
      <circle className="seal-groove" cx="50" cy="50" r="26" />
      {/* written once and spread evenly round the whole ring (circumference of r=34) */}
      <g className="seal-ring"><text><textPath href={`#${id}-ring`} textLength={(2 * Math.PI * 34).toFixed(1)} lengthAdjust="spacing">{ring}</textPath></text></g>
      <path className="seal-mark" d="M50 36l11 4v8.5c0 7.5-5 12.6-11 15-6-2.4-11-7.5-11-15V40z" />
      {ok
        ? <path className="seal-tick" d="M45 50l3.8 3.8 7.2-7.6" />
        : <path className="seal-crack" d="M30 22l9 14-5 8 12 9-4 9 9 14" />}
    </svg>
  )
}

// The ledger drawn as a chain of signed blocks. Display only: which block breaks comes straight from
// the server's verification result (chain.kind / chain.brokenAt); nothing is re-checked here.
export default function LedgerChain({ entries, chain, lang, eventLabel }) {
  const ref = useRef(null)
  const tr = (bn, en) => (lang === 'bn' ? bn : en)
  const [pickId, setPickId] = useState(null) // which block the proof panel shows (null = newest)
  const [copied, setCopied] = useState(false)
  const kind = chain && !chain.valid ? chain.kind : null
  const at = chain && chain.brokenAt

  // keep the newest block in view when the chain grows or breaks
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: el.scrollWidth, behavior: reduce ? 'auto' : 'smooth' })
  }, [entries.length, kind, at])

  const stateOf = (e) => {
    if (!kind || !at) return 'ok'
    if (kind === 'link' || kind === 'sequence') return e.id >= at ? 'bad' : 'ok'
    if (['hash', 'signature', 'genesis', 'workflow'].includes(kind)) return e.id === at ? 'bad' : 'ok'
    return 'ok'
  }
  const cutBefore = (e) => (kind === 'link' || kind === 'sequence') && e.id === at

  if (!entries.length) return null
  // default: the broken block when verification failed, otherwise the newest block
  const shown = entries.find((e) => e.id === pickId) || (at && entries.find((e) => e.id === at)) || entries[entries.length - 1]
  const shownBad = stateOf(shown) === 'bad'
  const label = (e) => (eventLabel[e.event_type] || { bn: e.event_type, en: e.event_type })[lang]
  const copy = () => {
    if (!navigator.clipboard) return
    navigator.clipboard.writeText(shown.hash).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400) }, () => {})
  }
  const onKey = (ev, e) => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setPickId(e.id) }
  }
  return (
    <div className="vault-body">
    <div className="chain-wrap" ref={ref}>
      <ol className="chain" aria-label={tr('লেজার ব্লকের শিকল', 'Ledger block chain')}>
        {entries.map((e) => (
          <li
            key={`${e.id}-${e.hash}`}
            className={`blk ${stateOf(e)}${cutBefore(e) ? ' cut' : ''}${e.id === shown.id ? ' picked' : ''}`}
            title={`hash ${e.hash}`}
            role="button"
            tabIndex={0}
            aria-pressed={e.id === shown.id}
            onClick={() => setPickId(e.id)}
            onKeyDown={(ev) => onKey(ev, e)}
          >
            <span className="blk-id">#{e.id}</span>
            <span className="blk-ev">{label(e)}</span>
            <span className="blk-plot">{e.plot_id || tr('রেজিস্টার', 'register')}</span>
            <span className="blk-hash">{e.hash.slice(0, 8)}</span>
          </li>
        ))}
        {!kind && (
          <li className="blk next" aria-hidden="true">
            <span className="blk-id">+</span>
            <span className="blk-ev">{tr('পরের ঘটনা', 'Next event')}</span>
            <span className="blk-plot">{tr('এখানে শিকলে যুক্ত হবে', 'will be chained here')}</span>
          </li>
        )}
        {kind === 'truncation' && (
          <li className="blk ghost cut">
            <span className="blk-id">?</span>
            <span className="blk-ev">{tr('মুছে ফেলা', 'Deleted')}</span>
            <span className="blk-plot">{tr('চেকপয়েন্টে ছিল', 'in checkpoint')}</span>
          </li>
        )}
      </ol>
    </div>

    {/* the proof for one block, straight from the ledger entry (click a block to see it) */}
    <aside key={shown.id} className={`proof${shownBad ? ' bad' : ''}`} aria-live="polite">
      <div className="proof-head">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        {tr('ক্রিপ্টোগ্রাফিক প্রমাণ', 'Cryptographic proof')}
      </div>
      <dl className="proof-list">
        <div><dt>{tr('ব্লক', 'Block')}</dt><dd><b>#{shown.id}</b> {label(shown)}</dd></div>
        <div><dt>{tr('জমি', 'Plot')}</dt><dd>{shown.plot_id || tr('রেজিস্টার', 'register')}</dd></div>
        <div><dt>{tr('সময়', 'Time')}</dt><dd>{new Date(shown.timestamp).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB')}</dd></div>
        <div>
          <dt>Hash</dt>
          <dd className="proof-hash">
            <code>{shown.hash.slice(0, 16)}…</code>
            <button type="button" className="copy" onClick={copy} aria-label={tr('পুরো hash কপি করুন', 'Copy the full hash')}>
              {copied ? tr('কপি হয়েছে', 'Copied') : tr('কপি', 'Copy')}
            </button>
          </dd>
        </div>
        {shown.prev_hash && <div><dt>{tr('আগের hash', 'Previous hash')}</dt><dd><code>{shown.prev_hash.slice(0, 16)}…</code></dd></div>}
        <div><dt>{tr('স্বাক্ষর', 'Signature')}</dt><dd>{shown.signature ? `Ed25519 · ${shown.signer || tr('রেজিস্ট্রি', 'registry')}` : tr('নেই', 'none')}</dd></div>
      </dl>
      <div className="proof-verdict">
        {!kind ? tr('যাচাইকৃত: এই ব্লক বদলালে শিকল ভেঙে যাবে', 'Verified: changing this block would break the chain')
          : shownBad ? tr('এই ব্লকে সমস্যা ধরা পড়েছে', 'A problem was found in this block')
            : tr('এই ব্লক ঠিক আছে, কিন্তু লেজার যাচাই ব্যর্থ', 'This block is fine, but the ledger check failed')}
      </div>
    </aside>
    </div>
  )
}
