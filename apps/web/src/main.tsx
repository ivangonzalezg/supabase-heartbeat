import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"

import "./index.css"
import App from "./app/App.tsx"
import { queryClient } from "./app/query-client.ts"
import { SessionProvider } from "@/entities/session"
import { ThemeProvider } from "@/shared/lib/theme-provider.tsx"
import { Toaster } from "@/shared/ui"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SessionProvider>
          <App />
          <Toaster />
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)
