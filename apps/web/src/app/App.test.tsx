import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import App from "./App"

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("requests /api/health and reports the API as online", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    render(<App />)

    expect(await screen.findByText("API online")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith("/api/health")
  })

  it("reports the API as unavailable when the request fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"))
    vi.stubGlobal("fetch", fetchMock)

    render(<App />)

    expect(await screen.findByText("API unavailable")).toBeInTheDocument()
  })

  it("reports the API as unavailable when a 200 response has an unexpected body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<!doctype html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    render(<App />)

    expect(await screen.findByText("API unavailable")).toBeInTheDocument()
  })
})
