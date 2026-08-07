import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

// jsdom doesn't implement scrollTo; TanStack Router calls it on navigation.
window.scrollTo = () => {}

// jsdom doesn't implement matchMedia; used by the sidebar's mobile
// detection (shared/lib/use-mobile.ts) and the theme toggle.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia

// jsdom doesn't implement ResizeObserver; used by radix-ui's Switch.
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(() => {
  cleanup()
})
