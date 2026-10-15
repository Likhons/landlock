import { useEffect, useRef, useState } from 'react'
import QrCode from './QrCode.jsx'
import { API, DATA_LABEL, EVENT_LABEL, ROLE_NAME, verifyUrl } from './labels.js'

// Signed receipt for one ledger entry, as a slip with a QR code. The details come from the public
// check (GET /api/verify/:hash), so the receipt shows exactly what anyone scanning it will see.
export default function Receipt({ hash, lang, onClose }) {
  const tr = (bn, en) => (lang === 'bn' ? bn : en)
  const [res, setRes] = useState(null)
  const [copied, setCopied] = useState(false)
  const closeRef = useRef(null)

  useEffect(() => {
    let live = true
    fetch(`${API}/verify/${hash}`).then((r) => r.json()).then((d) => { if (live) setRes(d) }).catch(() => { if (live) setRes({ found: false, error: true }) })
    return () => { live = false }
  }, [hash])

  // Escape closes; focus goes to the dialog once and back afterwards (onClose kept in a ref, so the
  // parent re-rendering never moves focus again)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    const before = document.activeElement
    if (closeRef.current) closeRef.current.focus({ preventScroll: true })
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); if (before && before.focus) before.focus({ preventScroll: true }) }
  }, [])

  const url = verifyUrl(hash)
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* not allowed */ }
  }
  const e = res && res.entry
  const fields = e ? Object.keys(DATA_LABEL).filter((k) => e.data[k] !== undefined && e.data[k] !== '') : []
  const when = e ? new Date(e.timestamp).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB') : ''

  return (
    <div className="rc-scrim" onClick={onClose}>
      <div className="rc" role="dialog" aria-modal="true" aria-label={tr('স্বাক্ষরিত রসিদ', 'Signed receipt')} onClick={(ev) => ev.stopPropagation()}>
        <div className="rc-head">
          <div>
            <div className="rc-kicker">LandLock · {tr('সাব-রেজিস্ট্রি অফিস (ডেমো)', 'Sub-Registry office (demo)')}</div>
            <h3>{tr('স্বাক্ষরিত রসিদ', 'Signed receipt')}</h3>
          </div>
          <button ref={closeRef} type="button" className="rc-x" onClick={onClose} aria-label={tr('বন্ধ করুন', 'Close')}>×</button>
        </div>

        {!res && <div className="rc-wait">{tr('রসিদ যাচাই হচ্ছে…', 'Checking the receipt…')}</div>}
        {res && !res.found && <div className="alert error">{res[lang] || tr('রসিদটি পাওয়া যায়নি।', 'Receipt not found.')}</div>}

        {e && (
          <div className="rc-body">
            <div className="rc-main">
              <div className={`rc-status ${res.authentic ? 'ok' : 'bad'}`}>
                <span className="rc-dot" aria-hidden="true">{res.authentic ? '✓' : '!'}</span>
                {res.authentic ? tr('যাচাইকৃত: রেকর্ডটি আসল ও অপরিবর্তিত', 'Verified: the record is genuine and unchanged')
                  : tr('সতর্কতা: রেকর্ড যাচাই হয়নি', 'Warning: the record did not verify')}
              </div>
              <dl className="rc-rows">
                <dt>{tr('এন্ট্রি', 'Entry')}</dt><dd>#{e.id} · {(EVENT_LABEL[e.event_type] || { bn: e.event_type, en: e.event_type })[lang]}</dd>
                {res.plot && <><dt>{tr('জমি', 'Plot')}</dt><dd>{tr('মৌজা', 'Mouza')} {res.plot.mouza} · {tr('খতিয়ান', 'Khatian')} {res.plot.khatian_no} · {tr('দাগ', 'Dag')} {res.plot.dag_no}</dd></>}
                {fields.map((k) => <FragmentRow key={k} k={DATA_LABEL[k][lang]} v={String(e.data[k])} />)}
                {e.data.by_role && <><dt>{tr('কার্যকারী অফিস', 'Acting office')}</dt><dd>{(ROLE_NAME[e.data.by_role] || { bn: e.data.by_role, en: e.data.by_role })[lang]}</dd></>}
                <dt>{tr('সময়', 'Time')}</dt><dd>{when}</dd>
              </dl>
              <div className="rc-crypto">
                <div><span>Hash (SHA-256)</span><code>{e.hash}</code></div>
                <div><span>{tr('রেজিস্ট্রির স্বাক্ষর (Ed25519)', 'Registry signature (Ed25519)')}</span><code>{e.signature.slice(0, 44)}…</code></div>
                <div><span>{tr('পাবলিক কী-এর ছাপ', 'Public key fingerprint')}</span><code>{res.public_key_fingerprint}</code></div>
              </div>
            </div>
            <div className="rc-side">
              <QrCode text={url} label={tr('যাচাই লিংকের QR কোড', 'QR code of the verify link')} />
              <span className="rc-cap">{tr('স্ক্যান করে যে কেউ যাচাই করতে পারেন', 'Anyone can scan this to verify')}</span>
              <a className="btn primary sm" href={url} target="_blank" rel="noreferrer">{tr('যাচাই পাতা খুলুন', 'Open verify page')}</a>
              <button type="button" className="btn ghost sm" onClick={copy}>{copied ? tr('কপি হয়েছে', 'Copied') : tr('লিংক কপি করুন', 'Copy link')}</button>
            </div>
          </div>
        )}
        <p className="rc-note">{tr('নমুনা প্রোটোটাইপ: রসিদটি প্রমাণ করে যে লেজারের এই এন্ট্রি রেজিস্ট্রির চাবিতে স্বাক্ষরিত ও অপরিবর্তিত; এটি আইনগত মালিকানার দলিল নয়।', 'Prototype: the receipt proves this ledger entry was signed with the registry key and is unchanged; it is not a legal title document.')}</p>
      </div>
    </div>
  )
}

function FragmentRow({ k, v }) {
  return <><dt>{k}</dt><dd>{v}</dd></>
}
