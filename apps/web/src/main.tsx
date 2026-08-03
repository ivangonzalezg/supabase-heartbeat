import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"

import "./index.css"
import { router } from "./app/router"
import { queryClient } from "./app/query-client.ts"
import { SessionProvider } from "@/entities/session"
import { ThemeProvider } from "@/shared/lib/theme-provider.tsx"
import { Toaster } from "@/shared/ui"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SessionProvider>
          <RouterProvider router={router} />
          <Toaster />
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)
