import { useLayoutEffect, useRef, useState } from 'react'

// Language switch: "বাংলা · EN" with a gold ink stroke that slides under the chosen one.
// It keeps its own state, so a click repaints this switch at once; the parent then changes the whole
// page's language in a React transition (see changeLang in App.jsx), which never delays this feedback.
export default function LangSwitch({ lang, onChange }) {
  const [ui, setUi] = useState(lang)
  const [seen, setSeen] = useState(lang)
  // follow the parent's language when it changes from elsewhere (derived state, no effect needed)
  if (lang !== seen) { setSeen(lang); setUi(lang) }
  const wrap = useRef(null)
  const ink = useRef(null)

  // place the stroke under the active label: transform only (position + width as scaleX); again when
  // the switch resizes ("English" on wide screens, "EN" on phones)
  useLayoutEffect(() => {
    const place = () => {
      const label = wrap.current && wrap.current.querySelector(`[data-l="${ui}"] .lang-t`)
      if (!label || !ink.current) return
      const x = label.getBoundingClientRect().left - wrap.current.getBoundingClientRect().left
      ink.current.style.transform = `translateX(${x}px) scaleX(${label.offsetWidth / 100})`
    }
    place()
    if (!('ResizeObserver' in window)) return undefined
    const ro = new ResizeObserver(place)
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [ui])

  const pick = (l) => {
    if (l === ui) return
    setUi(l)
    onChange(l)
  }
  return (
    <div className="lang" ref={wrap} role="group" aria-label="ভাষা / Language">
      <button type="button" data-l="bn" className={ui === 'bn' ? 'on' : ''} aria-pressed={ui === 'bn'} onClick={() => pick('bn')}>
        <span className="lang-t">বাংলা</span>
      </button>
      <span className="lang-sep" aria-hidden="true" />
      <button type="button" data-l="en" className={ui === 'en' ? 'on' : ''} aria-pressed={ui === 'en'} aria-label="English" onClick={() => pick('en')}>
        <span className="lang-t"><span className="long">English</span><span className="short">EN</span></span>
      </button>
      <span className="lang-ink" ref={ink} aria-hidden="true" />
    </div>
  )
}
