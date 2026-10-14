import { useEffect, useId, useRef, useState } from 'react'

// Sample mouza map: each sample plot (dag) is drawn as a land parcel, grouped by mouza.
// The shapes are illustrative only (sample data), not real cadastral boundaries.
const PARCELS = {
  P1: [[44, 74], [188, 60], [198, 180], [56, 192]],
  P2: [[188, 60], [300, 70], [294, 186], [198, 180]],
  P3: [[360, 56], [478, 66], [468, 170], [350, 178]],
  P4: [[478, 66], [600, 84], [590, 188], [468, 170]],
  P5: [[52, 266], [190, 252], [204, 382], [62, 396]],
  P6: [[250, 256], [380, 246], [392, 376], [262, 388]],
  P7: [[440, 242], [600, 256], [588, 386], [430, 376]],
}
// Bangla names of the sample mouzas (display only; the data keeps the English name)
const MOUZA_BN = { Rampura: 'রামপুরা', Banasree: 'বনশ্রী', Uttara: 'উত্তরা', Mirpur: 'মিরপুর', Savar: 'সাভার' }

// the whole sheet, with a paper margin on the left and bottom so the map controls never cover a plot
const FULL = { x: -46, y: 0, w: 686, h: 450 }
const MIN_W = FULL.w / 4 // deepest zoom: 4x

const centre = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
const short = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
// keep a view inside the sheet
const clampView = (v) => {
  const w = Math.min(FULL.w, Math.max(MIN_W, v.w))
  const h = (w / FULL.w) * FULL.h
  return { w, h, x: Math.min(FULL.x + FULL.w - w, Math.max(FULL.x, v.x)), y: Math.min(FULL.y + FULL.h - h, Math.max(FULL.y, v.y)) }
}
const zoomAround = (v, factor, cx, cy) => clampView({ w: v.w / factor, x: cx - (cx - v.x) / factor, y: cy - (cy - v.y) / factor })

// statusOf(plot) -> 'free' | 'pending' | 'alert' (decided by the caller)
// stampOf(plot) -> { kind: 'pending' | 'alert', text } | null: a rubber stamp pressed onto the parcel
export default function PlotMap({ plots, selectedId, onSelect, statusOf, lang, statusLabel, stampOf }) {
  const id = useId()
  const tr = (bn, en) => (lang === 'bn' ? bn : en)
  const drawn = plots.filter((p) => PARCELS[p.id])
  const others = plots.filter((p) => !PARCELS[p.id])

  // ---- view (zoom / pan): display only ----
  const [view, setView] = useState(FULL)
  const [scenery, setScenery] = useState(true)
  const [dragging, setDragging] = useState(false)
  const svgRef = useRef(null)
  const viewRef = useRef(FULL)
  const anim = useRef(0)
  const drag = useRef(null) // { x, y, view, moved, pid }
  const justDragged = useRef(false)
  useEffect(() => { viewRef.current = view }, [view])
  useEffect(() => () => cancelAnimationFrame(anim.current), [])

  const animateTo = (target) => {
    cancelAnimationFrame(anim.current)
    const from = viewRef.current
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setView(target); return }
    const t0 = performance.now()
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 260)
      const e = 1 - (1 - k) ** 3
      setView({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, w: from.w + (target.w - from.w) * e, h: from.h + (target.h - from.h) * e })
      if (k < 1) anim.current = requestAnimationFrame(step)
    }
    anim.current = requestAnimationFrame(step)
  }
  const v = view
  const zoomed = v.w < FULL.w - 0.5
  const close = v.w <= 330 // already zoomed to about one plot
  const zoomBy = (f) => { const c = viewRef.current; animateTo(zoomAround(c, f, c.x + c.w / 2, c.y + c.h / 2)) }
  const sel = selectedId && PARCELS[selectedId]
  const locate = () => {
    if (!sel || close) { animateTo(FULL); return } // second press: whole sheet again
    const [cx, cy] = centre(sel)
    const w = 300; const h = (w / FULL.w) * FULL.h
    animateTo(clampView({ w, x: cx - w / 2, y: cy - h / 2 }))
  }

  // drag to pan (only when zoomed in; a press that does not move stays a normal click)
  const onPointerDown = (e) => {
    if (!zoomed || e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, view: viewRef.current, moved: false, pid: e.pointerId }
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x; const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 5) return
    if (!d.moved) { d.moved = true; setDragging(true); try { svgRef.current.setPointerCapture(d.pid) } catch { /* pointer already gone */ } cancelAnimationFrame(anim.current) }
    const scale = d.view.w / svgRef.current.clientWidth
    setView(clampView({ ...d.view, x: d.view.x - dx * scale, y: d.view.y - dy * scale }))
  }
  const onPointerUp = () => {
    if (drag.current && drag.current.moved) {
      justDragged.current = true
      setTimeout(() => { justDragged.current = false }, 0)
    }
    drag.current = null
    setDragging(false)
  }

  // dashed boundary + name for every mouza that has plots on the map
  const mouzas = [...new Set(drawn.map((p) => p.mouza))].map((m) => {
    const pts = drawn.filter((p) => p.mouza === m).flatMap((p) => PARCELS[p.id])
    const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1])
    return { name: m, x: Math.min(...xs) - 14, y: Math.min(...ys) - 14, w: Math.max(...xs) - Math.min(...xs) + 28, h: Math.max(...ys) - Math.min(...ys) + 28 }
  })

  const choose = (p) => { if (!justDragged.current) onSelect(p.id) }
  const onKey = (e, p) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.id) }
  }

  return (
    <>
      <div className={`map-frame${zoomed ? ' zoomed' : ''}${dragging ? ' dragging' : ''}`}>
        <svg
          ref={svgRef}
          className="plot-map"
          viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
          role="group"
          aria-label={tr('নমুনা মৌজা নকশা', 'Sample mouza map')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <defs>
            <pattern id={`${id}-hatch`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" className="hatch-pending" />
            </pattern>
            <pattern id={`${id}-cross`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="9" className="hatch-alert" />
              <line x1="0" y1="0" x2="9" y2="0" className="hatch-alert" />
            </pattern>
          </defs>

          {/* survey grid, like the squared paper of a mouza map sheet */}
          {Array.from({ length: 16 }, (_, i) => <line key={`v${i}`} className="grid-line" x1={i * 40} y1="0" x2={i * 40} y2="450" />)}
          {Array.from({ length: 11 }, (_, i) => <line key={`h${i}`} className="grid-line" x1="-46" y1={(i + 1) * 40} x2="640" y2={(i + 1) * 40} />)}

          {/* scenery (decoration only): roads between the mouzas, a river, trees, a compass */}
          {scenery && (
            <g className="scenery" aria-hidden="true">
              <path className="road" d="M-46 217 C 160 210, 300 222, 640 212" />
              <path className="road" d="M326 0 C 322 70, 330 150, 325 216" />
              <path className="road thin" d="M226 216 C 230 290, 222 350, 228 450" />
              <path className="river" d="M640 0 C 622 60, 636 120, 624 190 S 636 330, 622 450 L 640 450 Z" />
              {[[200, 22], [222, 32], [246, 20], [130, 410], [150, 404], [330, 410], [400, 432], [424, 438], [416, 20], [-20, 300], [-26, 120]].map(([x, y], i) => (
                <g key={i} className="tree"><circle cx={x} cy={y} r="7" /><circle cx={x - 3} cy={y - 2} r="3" className="tree-hi" /></g>
              ))}
              <g className="compass" transform="translate(286 26)">
                <circle r="15" />
                <path d="M0 -13 3.5 0 0 3 -3.5 0z" className="needle-n" />
                <path d="M0 13 3.5 0 0 -3 -3.5 0z" />
                <text y="-17">N</text>
              </g>
            </g>
          )}

          {mouzas.map((m) => (
            <g key={m.name}>
              <rect className="mz-box" x={m.x} y={m.y} width={m.w} height={m.h} rx="10" />
              <text className="mz-label" x={m.x + 4} y={m.y - 6}>
                {lang === 'bn' && MOUZA_BN[m.name]
                  ? <>{MOUZA_BN[m.name]}<tspan className="mz-en" dx="6">{m.name}</tspan></>
                  : tr(`মৌজা ${m.name}`, `${m.name} mouza`)}
              </text>
            </g>
          ))}

          {drawn.map((p, i) => {
            const pts = PARCELS[p.id]
            const [cx, cy] = centre(pts)
            const st = statusOf(p)
            const stamp = stampOf ? stampOf(p) : null
            const stampW = stamp ? Math.max(54, stamp.text.length * (lang === 'bn' ? 10 : 10.5) + 22) : 0
            const points = pts.map((q) => q.join(',')).join(' ')
            return (
              <g
                key={p.id}
                className={`parcel st-${st}${p.id === selectedId ? ' sel' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={p.id === selectedId}
                aria-label={`${p.id}, ${tr('মৌজা', 'mouza')} ${p.mouza}, ${tr('দাগ', 'dag')} ${p.dag_no}, ${tr('মালিক', 'owner')} ${p.current_owner}, ${statusLabel(p)}`}
                onClick={() => choose(p)}
                onKeyDown={(e) => onKey(e, p)}
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <title>{statusLabel(p)}</title>
                <polygon className="base" points={points} />
                {p.id === selectedId && <polygon className="ants" points={points} />}
                {st === 'pending' && <polygon className="tex" points={points} fill={`url(#${id}-hatch)`} />}
                {st === 'alert' && <polygon className="tex" points={points} fill={`url(#${id}-cross)`} />}
                <text className="pl-dag" x={cx} y={cy - 4}>{tr('দাগ', 'Dag')} {p.dag_no}</text>
                <text className="pl-owner" x={cx} y={cy + 18}>{short(p.current_owner, 14)}</text>
                <text className="pl-id" x={cx} y={cy + 36}>
                  {p.id}
                  {p.mortgage && <tspan className="pl-flag" dx="6">{tr('বন্ধকী', 'mortgaged')}</tspan>}
                </text>
                {stamp && (
                  <g transform={`rotate(-9 ${cx} ${cy - 44})`}>
                    {/* keyed by text, so a new status presses a fresh stamp */}
                    <g key={stamp.text} className={`stamp stamp-${stamp.kind}`}>
                      <rect x={cx - stampW / 2} y={cy - 58} width={stampW} height={26} rx="4" />
                      <rect className="inner" x={cx - stampW / 2 + 3} y={cy - 55} width={stampW - 6} height={20} rx="2" />
                      <text x={cx} y={cy - 40}>{stamp.text}</text>
                    </g>
                  </g>
                )}
              </g>
            )
          })}
        </svg>

        {/* map controls: zoom, go to the selected plot, scenery layer */}
        <div className="map-ctrl" role="group" aria-label={tr('মানচিত্র নিয়ন্ত্রণ', 'Map controls')}>
          <button type="button" onClick={() => zoomBy(1.5)} disabled={v.w <= MIN_W + 0.5} aria-label={tr('জুম ইন', 'Zoom in')} title={tr('জুম ইন', 'Zoom in')}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button type="button" onClick={() => zoomBy(1 / 1.5)} disabled={!zoomed} aria-label={tr('জুম আউট', 'Zoom out')} title={tr('জুম আউট', 'Zoom out')}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12h14" /></svg>
          </button>
          <button
            type="button"
            className="sep"
            onClick={locate}
            disabled={!sel && !zoomed}
            aria-label={close ? tr('পুরো নকশা দেখুন', 'Show the whole map') : tr('নির্বাচিত জমিতে যান', 'Go to the selected plot')}
            title={close ? tr('পুরো নকশা দেখুন', 'Show the whole map') : tr('নির্বাচিত জমিতে যান', 'Go to the selected plot')}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="1.6" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
          </button>
        </div>
        <button
          type="button"
          className={`map-layer${scenery ? ' on' : ''}`}
          onClick={() => setScenery((s) => !s)}
          aria-pressed={scenery}
          title={tr('রাস্তা, নদী ও গাছ দেখান / লুকান', 'Show / hide roads, river and trees')}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></svg>
          <span>{tr('দৃশ্য', 'Scenery')}</span>
        </button>
        {zoomed && <span className="map-zoom">{Math.round((FULL.w / v.w) * 100)}% · {tr('টেনে সরান', 'drag to move')}</span>}
      </div>

      {others.length > 0 && (
        <div className="map-others">
          {others.map((p) => (
            <button key={p.id} className={`plot-chip${p.id === selectedId ? ' on' : ''}`} onClick={() => onSelect(p.id)}>
              {p.id}: {p.mouza}, {tr('দাগ', 'dag')} {p.dag_no}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
