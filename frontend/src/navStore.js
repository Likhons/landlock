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

// Wide screens: icons-only sidebar, remembered between visits. Also kept outside App: App toggles
// the page's `nav-mini` class directly on change, so collapsing never re-renders the page.
let mini = false
try { mini = localStorage.getItem('landlock.navMini') === '1' } catch { /* private mode */ }
const miniSubs = new Set()

export const sidebarMini = {
  get: () => mini,
  toggle() {
    mini = !mini
    try { localStorage.setItem('landlock.navMini', mini ? '1' : '0') } catch { /* private mode */ }
    miniSubs.forEach((fn) => fn())
  },
  subscribe(fn) { miniSubs.add(fn); return () => miniSubs.delete(fn) },
}

export const useSidebarMini = () => useSyncExternalStore(sidebarMini.subscribe, sidebarMini.get)
