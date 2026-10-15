import { useEffect, useRef, useState } from 'react'

// Floating plot switcher, shown once the map has scrolled out of view (display only).
// Wide screens: a pill near the top. Phones: a pill near the bottom (in thumb reach) whose list opens
// as a bottom sheet. It is always mounted and slides in/out, so it never pops or shifts the page.
// statusOf(plot) -> 'free' | 'pending' | 'alert' (same as the map colours)
export default function PlotSwitcher({ watchRef, plots, selectedId, onSelect, onMap, risk, statusOf, lang, Icon }) {
  const tr = (bn, en) => (lang === 'bn' ? bn : en)
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const btnRef = useRef(null)
  // visible once the watched element (the map) has scrolled up out of view; kept here so that
  // showing/hiding re-renders only this pill
  const [show, setShow] = useState(false)
  useEffect(() => {
    const el = watchRef.current
    if (!el || !('IntersectionObserver' in window)) return undefined
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0))
    io.observe(el)
    return () => io.disconnect()
  }, [watchRef])

  // close the list on Escape or a click outside; closing also happens when the pill hides
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() } }
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown) }
  }, [open])
  if (!show && open) setOpen(false)

  const idx = plots.findIndex((p) => p.id === selectedId)
  const plot = plots[idx]
  if (!plot) return null
  const step = (d) => onSelect(plots[(idx + d + plots.length) % plots.length].id)
  const choose = (id) => { onSelect(id); setOpen(false) }
  const riskText = { green: tr('সতর্কতা নেই', 'No warnings'), yellow: tr('সতর্কতা', 'Caution'), red: tr('ঝুঁকিপূর্ণ', 'High risk') }

  // The list is a sibling of the pill, not its child: the pill slides with `transform`, and a
  // transformed parent would trap the phone's full-width bottom sheet inside the pill's box.
  return (
    <div ref={rootRef} role="region" aria-label={tr('জমি বদলান', 'Switch plot')}>
      {open && <div className="psw-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      {open && (
        <div className="psw-menu">
          <div className="psw-menu-head">{tr('কোন জমি দেখবেন?', 'Which plot?')}</div>
          <ul>
            {plots.map((p) => (
              <li key={p.id}>
                <button type="button" className={`psw-item${p.id === selectedId ? ' on' : ''}`} aria-current={p.id === selectedId || undefined} onClick={() => choose(p.id)}>
                  <span className={`psw-dot st-${statusOf(p)}`} aria-hidden="true" />
                  <span className="psw-item-main">
                    <b>{tr('দাগ', 'Dag')} {p.dag_no}</b>
                    <span>{p.mouza} · {p.current_owner}</span>
                  </span>
                  {p.id === selectedId && <Icon name="check" size={16} />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={`psw${show ? ' show' : ''}`} aria-hidden={!show || undefined} inert={!show || undefined}>
      <div className="psw-pill">
        <button type="button" className="psw-step" onClick={() => step(-1)} aria-label={tr('আগের জমি', 'Previous plot')}>
          <Icon name="chevron" size={18} />
        </button>
        <button ref={btnRef} type="button" className="psw-main" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true">
          <span className={`psw-dot ${risk}`} aria-hidden="true" />
          <span className="psw-title">{tr('দাগ', 'Dag')} {plot.dag_no}</span>
          <span className="psw-meta">{plot.mouza} · {plot.current_owner}</span>
          <span className={`psw-risk ${risk}`}>{riskText[risk]}</span>
          <span className="psw-caret"><Icon name="chevron" size={16} /></span>
        </button>
        <button type="button" className="psw-step next" onClick={() => step(1)} aria-label={tr('পরের জমি', 'Next plot')}>
          <Icon name="chevron" size={18} />
        </button>
        <span className="psw-sep" aria-hidden="true" />
        <button type="button" className="psw-map" onClick={onMap} aria-label={tr('মানচিত্রে ফিরুন', 'Back to the map')} title={tr('মানচিত্রে ফিরুন', 'Back to the map')}>
          <Icon name="map" size={18} />
        </button>
      </div>
      </div>
    </div>
  )
}
