import { Suspense, lazy } from 'react'
import App from './App.jsx'

// The verify page is its own small chunk, loaded only for verify links
const VerifyPage = lazy(() => import('./VerifyPage.jsx'))

// ?verify=<hash> (from a receipt's QR code) opens the public verify page instead of the app
export default function Root() {
  const verifyHash = new URLSearchParams(window.location.search).get('verify')
  return verifyHash ? <Suspense fallback={null}><VerifyPage hash={verifyHash} /></Suspense> : <App />
}
