import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./app/App.tsx"
import { SessionProvider } from "@/entities/session"
import { ThemeProvider } from "@/shared/lib/theme-provider.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <SessionProvider>
        <App />
      </SessionProvider>
    </ThemeProvider>
  </StrictMode>
)
