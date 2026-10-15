import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { drawer, useDrawerOpen, useSidebarMini } from './navStore.js'

// same breakpoint as the drawer CSS in index.css
const DRAWER_MQ = window.matchMedia('(max-width: 1199px)')
const subscribeDrawerMode = (fn) => { DRAWER_MQ.addEventListener('change', fn); return () => DRAWER_MQ.removeEventListener('change', fn) }

// Left sidebar: links to the sections of this one page (no separate pages exist), with the
// section currently on screen highlighted. On wide screens it can shrink to icons only;
// on smaller screens it slides in as a drawer.
const ITEMS = [
  { id: 'top', icon: 'home', bn: 'হোম', en: 'Home' },
  { id: 'map', icon: 'map', bn: 'মানচিত্র', en: 'Map' },
  { id: 'ledger', icon: 'link', bn: 'লেজার', en: 'Ledger' },
  { id: 'record', icon: 'file', bn: 'জমির রেকর্ড', en: 'Land record' },
  { id: 'survey', icon: 'scroll', bn: 'জরিপ ইতিহাস', en: 'Survey history' },
  { id: 'gap', icon: 'clock', bn: 'নামজারি বাকি', en: 'Pending mutations' },
]

// line drawing of fields, trees and a river (decoration only)
function Landscape() {
  return (
    <svg className="sn-land" viewBox="0 0 220 170" aria-hidden="true">
      <path className="ln-sky" d="M0 62c30-10 52-8 74-2s46 8 70-2 52-10 76-2" />
      {/* distant tree line */}
      {[18, 34, 48, 150, 166, 184, 200].map((x, i) => (
        <g key={x} className="ln-tree" transform={`translate(${x} ${56 - (i % 2) * 4})`}>
          <path d="M0 10V3" /><circle cx="0" cy="0" r={5 + (i % 3)} />
        </g>
      ))}
      {/* a hut */}
      <g className="ln-hut" transform="translate(96 46)">
        <path d="M-12 8 0-3 12 8" /><path d="M-9 8v9h18V8" /><path d="M-2 17v-6h4v6" />
      </g>
      {/* fields in perspective, converging on the horizon */}
      <path className="ln-field" d="M0 70h220M0 84h220M0 102h220M0 126h220M0 156h220" />
      <path className="ln-field" d="M110 66 20 170M110 66 70 170M110 66 150 170M110 66 200 170M110 66-30 160M110 66 250 160" />
      {/* the river */}
      <path className="ln-river" d="M140 66c-6 14 18 22 8 40s-34 22-22 64" />
      <path className="ln-river" d="M150 66c-4 14 22 22 12 40s-30 22-16 64" />
    </svg>
  )
}

export default function SideNav({ lang, Icon, Logo }) {
  const tr = (bn, en) => (lang === 'bn' ? bn : en)
  // drawer state comes from navStore, so opening it re-renders only this component
  const open = useDrawerOpen()
  const mini = useSidebarMini()
  const onClose = () => drawer.set(false)
  const onNavigate = onClose
  // below 1200px the sidebar is a drawer; when closed it sits painted just off screen, so it is made
  // inert (no focus, no screen reader) until opened. Wide screens dock it and it is always usable.
  const isDrawer = useSyncExternalStore(subscribeDrawerMode, () => DRAWER_MQ.matches)
  // the section currently on screen; tracked here so scrolling re-renders only the sidebar
  const [active, setActive] = useState('top')
  useEffect(() => {
    let raf = 0
    const spy = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (window.scrollY < 40) { setActive('top'); return }
        // at the very bottom the last sections can never reach the top, so any visible one counts
        const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
        let cur = 'top'
        for (const it of ITEMS) {
          const el = document.getElementById(it.id)
          if (el && el.getBoundingClientRect().top < window.innerHeight * (atEnd ? 0.9 : 0.35)) cur = it.id
        }
        setActive(cur)
      })
    }
    spy()
    window.addEventListener('scroll', spy, { passive: true })
    return () => { window.removeEventListener('scroll', spy); cancelAnimationFrame(raf) }
  }, [])
  const asideRef = useRef(null)
  const backRef = useRef(null)
  const closeRef = useRef(null)
  const swipe = useRef(null) // { x, y, dx, horizontal }

  // drawer open: Escape closes it, and so does the screen becoming wide (e.g. a tablet turned
  // sideways: the sidebar is docked then). Focus moves inside once the slide has finished, and
  // goes back on close. The page behind is NOT locked with body overflow: that restyles the whole
  // document right as the slide starts. The backdrop blocks touch and wheel scrolling instead.
  useEffect(() => {
    if (!open) return undefined
    const before = document.activeElement
    const onKey = (e) => { if (e.key === 'Escape') drawer.set(false) }
    const wide = window.matchMedia('(min-width: 1200px)')
    const onWide = () => { if (wide.matches) drawer.set(false) }
    const stopWheel = (e) => e.preventDefault()
    const back = backRef.current
    const focusLater = setTimeout(() => closeRef.current && closeRef.current.focus({ preventScroll: true }), 320)
    window.addEventListener('keydown', onKey)
    wide.addEventListener('change', onWide)
    if (back) back.addEventListener('wheel', stopWheel, { passive: false })
    return () => {
      clearTimeout(focusLater)
      window.removeEventListener('keydown', onKey)
      wide.removeEventListener('change', onWide)
      if (back) back.removeEventListener('wheel', stopWheel)
      if (before && before.focus) before.focus({ preventScroll: true })
    }
  }, [open])

  // swipe left to close: the drawer follows the finger, then closes or springs back
  const onTouchStart = (e) => {
    if (!open) return
    const t = e.touches[0]
    swipe.current = { x: t.clientX, y: t.clientY, dx: 0, horizontal: null }
  }
  const onTouchMove = (e) => {
    const sw = swipe.current
    if (!sw) return
    const t = e.touches[0]
    const dx = t.clientX - sw.x; const dy = t.clientY - sw.y
    if (sw.horizontal === null && Math.hypot(dx, dy) > 8) sw.horizontal = Math.abs(dx) > Math.abs(dy)
    if (!sw.horizontal) return
    sw.dx = Math.min(0, dx)
    const w = asideRef.current.offsetWidth
    asideRef.current.style.transition = 'none'
    asideRef.current.style.transform = `translateX(${sw.dx}px)`
    if (backRef.current) { backRef.current.style.transition = 'none'; backRef.current.style.opacity = String(1 + sw.dx / w) }
  }
  const onTouchEnd = () => {
    const sw = swipe.current
    swipe.current = null
    if (!sw || !sw.horizontal) return
    asideRef.current.style.transition = ''
    asideRef.current.style.transform = ''
    if (backRef.current) { backRef.current.style.transition = ''; backRef.current.style.opacity = '' }
    if (sw.dx < -70) onClose()
  }

  return (
    <>
    <div ref={backRef} className={`sn-backdrop${open ? ' show' : ''}`} onClick={onClose} aria-hidden="true" />
    <aside
      ref={asideRef}
      className={`sidenav${mini ? ' mini' : ''}${open ? ' open' : ''}`}
      aria-label={tr('পাতার অংশ', 'Page sections')}
      inert={(isDrawer && !open) || undefined}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* drawer header (phones and tablets only) */}
      <div className="sn-head">
        <span className="sn-brand"><Logo size={34} title="LandLock" /> LandLock</span>
        <button ref={closeRef} type="button" className="sn-close" onClick={onClose} aria-label={tr('মেনু বন্ধ করুন', 'Close menu')}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <nav>
        <ul>
          {ITEMS.map((it) => (
            <li key={it.id}>
              <a
                href={`#${it.id}`}
                className={active === it.id ? 'on' : ''}
                aria-current={active === it.id ? 'location' : undefined}
                title={mini ? it[lang] : undefined}
                onClick={onNavigate}
              >
                <Icon name={it.icon} size={19} />
                <span className="sn-label">{it[lang]}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="sn-foot">
        <Landscape />
        <p className="sn-tag">{tr('নিরাপদ জমি', 'Safe land')}<span>{tr('নিশ্চিন্ত মালিকানা', 'certain ownership')}</span></p>
        <p className="sn-hint">{tr('বন্ধ করতে বাঁয়ে সোয়াইপ করুন', 'Swipe left to close')}</p>
      </div>
    </aside>
    </>
  )
}
