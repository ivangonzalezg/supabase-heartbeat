import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

// jsdom doesn't implement scrollTo; TanStack Router calls it on navigation.
window.scrollTo = () => {}

afterEach(() => {
  cleanup()
})
