import { useId } from 'react'

// LandLock mark: a padlock on a green field. The red disc inside the shackle is the sun of the
// Bangladesh flag; the faint lines behind the lock are plot (dag) boundaries of a land map.
// Same drawing as public/landlock.svg (favicon).
export function LogoMark({ size = 44, title }) {
  const id = useId()
  const bg = `${id}-bg`
  const body = `${id}-body`
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : 'true'}>
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0c9a6c" />
          <stop offset="1" stopColor="#004532" />
        </linearGradient>
        <linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e3f3ec" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${bg})`} />
      {/* faint plot (dag) boundaries of a land map behind the lock */}
      <path d="M0 21 9 19 13 22M51 16l13-3M0 46l13-2M51 44l13 3M9 19 6 0M57 14 60 0M7 44 4 64M58 46l2 18M13 58l14-2 12 3 13-2" fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="32" cy="24.5" r="9.5" fill="#e8352b" />
      <path d="M20.5 31v-6.5a11.5 11.5 0 0 1 23 0V31" fill="none" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" />
      <rect x="13" y="29.5" width="38" height="25" rx="6.5" fill={`url(#${body})`} />
      <circle cx="32" cy="40" r="3.7" fill="#00563f" />
      <path d="M32 42.2v5.3" stroke="#00563f" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  )
}

// Mark + "LandLock" wordmark, with an optional tagline underneath
export function Logo({ size = 46, light = true, tagline }) {
  return (
    <div className={`logo${light ? ' light' : ''}`}>
      <LogoMark size={size} />
      <div className="logo-text">
        <div className="logo-word">Land<span>Lock</span></div>
        {tagline && <div className="logo-tag">{tagline}</div>}
      </div>
    </div>
  )
}
