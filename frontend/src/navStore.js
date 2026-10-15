import { useSyncExternalStore } from 'react'

// Open/closed state of the phone/tablet drawer, kept outside the App component on purpose:
// opening the drawer then re-renders only the sidebar and the menu button, not the whole page,
// so nothing heavy runs on the main thread while the drawer slides in.
let open = false
const subs = new Set()

export const drawer = {
  get: () => open,
  set(v) {
    if (v === open) return
    open = v
    subs.forEach((fn) => fn())
  },
  toggle() { drawer.set(!open) },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
}

export const useDrawerOpen = () => useSyncExternalStore(drawer.subscribe, drawer.get)
