import qrcode from 'qrcode-generator'

// QR code drawn as one SVG path (crisp at any size, no canvas, no innerHTML).
export default function QrCode({ text, size = 168, label }) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  const quiet = 2 // white margin, in modules
  let d = ''
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`
  }
  const box = n + quiet * 2
  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${box} ${box}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={box} height={box} fill="#fff" />
      <path d={d} fill="#13231e" />
    </svg>
  )
}
