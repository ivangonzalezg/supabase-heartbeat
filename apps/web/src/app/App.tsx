import { useEffect, useState } from "react"
import { Button } from "@/shared/ui"

type ApiStatus = "Loading" | "API online" | "API unavailable"

export function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("Loading")

  useEffect(() => {
    let cancelled = false

    fetch("/api/health")
      .then(async (response) => {
        if (!response.ok) {
          return false
        }
        // A 200 alone doesn't prove this reached the API, since a misrouted
        // proxy could return Vite's HTML with the same status.
        const body: unknown = await response.json()
        return (
          typeof body === "object" &&
          body !== null &&
          (body as { status?: unknown }).status === "ok"
        )
      })
      .then((isHealthy) => {
        if (!cancelled) {
          setApiStatus(isHealthy ? "API online" : "API unavailable")
        }
      })
      .catch(() => {
        if (!cancelled) {
          setApiStatus("API unavailable")
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex min-h-svh p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <div>
          <h1 className="font-medium">Project ready!</h1>
          <p>You may now add components and start building.</p>
          <p>We&apos;ve already added the button component for you.</p>
          <Button className="mt-2">Button</Button>
        </div>
        <p>{apiStatus}</p>
        <div className="font-mono text-xs text-muted-foreground">
          (Press <kbd>d</kbd> to toggle dark mode)
        </div>
      </div>
    </div>
  )
}

export default App
