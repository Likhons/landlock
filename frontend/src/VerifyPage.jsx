import { useEffect, useState } from 'react'
import { LogoMark } from './Logo.jsx'
import { API, DATA_LABEL, EVENT_LABEL, ROLE_NAME } from './labels.js'

// Public verify page, opened from a receipt's QR code (?verify=<hash>). Anyone can check, without
// logging in, that this ledger entry exists, is signed by the registry and has not been changed.
export default function VerifyPage({ hash }) {
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('landlock_lang') || 'bn' } catch { return 'bn' } })
  const tr = (bn, en) => (lang === 'bn' ? bn : en)
  const [res, setRes] = useState(null)

  useEffect(() => {
    fetch(`${API}/verify/${encodeURIComponent(hash)}`)
      .then((r) => r.json())
      .then(setRes)
      .catch(() => setRes({ found: false, offline: true }))
  }, [hash])

  const changeLang = (l) => { setLang(l); try { localStorage.setItem('landlock_lang', l) } catch { /* private mode */ } }
  const e = res && res.entry
  const ok = Boolean(res && res.authentic)
  const fields = e ? Object.keys(DATA_LABEL).filter((k) => e.data[k] !== undefined && e.data[k] !== '') : []
  const CHECKS = [
    { k: 'hash', bn: 'এন্ট্রির তথ্য অপরিবর্তিত (hash মিলেছে)', en: 'Entry unchanged (hash matches)' },
    { k: 'signature', bn: 'রেজিস্ট্রির ডিজিটাল স্বাক্ষর সঠিক', en: "Registry's digital signature is valid" },
    { k: 'ledger', bn: 'পুরো লেজার অক্ষত, রেকর্ড লেজারের সাথে মেলে', en: 'Whole ledger intact; records match it' },
  ]

  return (
    <div className="vp">
      <header className="vp-top">
        <a className="vp-brand" href={window.location.pathname}><LogoMark size={34} title="LandLock" /> LandLock</a>
        <div className="seg">
          <button className={lang === 'bn' ? 'on' : ''} onClick={() => changeLang('bn')}>বাংলা</button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => changeLang('en')}>EN</button>
        </div>
      </header>

      <main className="vp-main">
        <div className="vp-kicker">{tr('রসিদ যাচাই', 'Receipt check')}</div>
        {!res && <div className="vp-card"><p className="vp-wait">{tr('রেজিস্ট্রির লেজারে খোঁজা হচ্ছে…', 'Looking it up in the registry ledger…')}</p></div>}

        {res && !res.found && (
          <div className="vp-card bad">
            <div className="vp-seal bad" aria-hidden="true">✕</div>
            <h1>{res.offline ? tr('সার্ভারে যোগাযোগ করা যায়নি', 'Could not reach the server') : tr('এই রসিদ লেজারে নেই', 'This receipt is not in the ledger')}</h1>
            <p>{res.offline ? tr('একটু পরে আবার চেষ্টা করুন।', 'Please try again in a moment.') : (res[lang] || '')}</p>
          </div>
        )}

        {e && (
          <div className={`vp-card ${ok ? 'ok' : 'bad'}`}>
            <div className={`vp-seal ${ok ? 'ok' : 'bad'}`} aria-hidden="true">{ok ? '✓' : '!'}</div>
            <h1>{ok ? tr('এই রেকর্ড আসল', 'This record is genuine') : tr('এই রেকর্ড বিশ্বাসযোগ্য নয়', 'This record cannot be trusted')}</h1>
            <p className="vp-sub">
              {ok ? tr('রেজিস্ট্রির স্বাক্ষরিত লেজারে এন্ট্রিটি আছে এবং কেউ বদলায়নি।', 'The entry is in the registry’s signed ledger and nobody has changed it.')
                : tr('লেজারে পরিবর্তন ধরা পড়েছে। এই রসিদের ওপর নির্ভর করবেন না।', 'A change was detected in the ledger. Do not rely on this receipt.')}
            </p>
            <ul className="vp-checks">
              {CHECKS.map((c) => (
                <li key={c.k} className={res.checks[c.k] ? 'pass' : 'fail'}>
                  <span aria-hidden="true">{res.checks[c.k] ? '✓' : '✕'}</span>{tr(c.bn, c.en)}
                </li>
              ))}
            </ul>
            <dl className="vp-rows">
              <dt>{tr('এন্ট্রি', 'Entry')}</dt><dd>#{e.id} · {(EVENT_LABEL[e.event_type] || { bn: e.event_type, en: e.event_type })[lang]}</dd>
              {res.plot && <><dt>{tr('জমি', 'Plot')}</dt><dd>{tr('মৌজা', 'Mouza')} {res.plot.mouza} · {tr('খতিয়ান', 'Khatian')} {res.plot.khatian_no} · {tr('দাগ', 'Dag')} {res.plot.dag_no}</dd></>}
              {fields.map((k) => <Row key={k} k={DATA_LABEL[k][lang]} v={String(e.data[k])} />)}
              {e.data.by_role && <><dt>{tr('কার্যকারী অফিস', 'Acting office')}</dt><dd>{(ROLE_NAME[e.data.by_role] || { bn: e.data.by_role, en: e.data.by_role })[lang]}</dd></>}
              <dt>{tr('সময়', 'Time')}</dt><dd>{new Date(e.timestamp).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB')}</dd>
              <dt>Hash</dt><dd><code>{e.hash}</code></dd>
              <dt>{tr('পাবলিক কী-এর ছাপ', 'Key fingerprint')}</dt><dd><code>{res.public_key_fingerprint}</code></dd>
            </dl>
          </div>
        )}

        <p className="vp-note">
          {tr('নমুনা প্রোটোটাইপ, শুধু ডামি তথ্য। NID-এর শেষ ৪ অঙ্ক ছাড়া বাকিটা লুকানো। এটি আইনগত মালিকানার দলিল নয়।', 'Prototype with dummy data only. NIDs show only their last 4 digits. This is not a legal title document.')}
        </p>
        <a className="vp-back" href={window.location.pathname}>{tr('LandLock-এ যান', 'Go to LandLock')} →</a>
      </main>
    </div>
  )
}

function Row({ k, v }) {
  return <><dt>{k}</dt><dd>{v}</dd></>
}
