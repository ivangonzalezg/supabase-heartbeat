import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vitest/config"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  resolve: {
    alias: {
      "@/app": path.resolve(import.meta.dirname, "./src/app"),
      "@/pages": path.resolve(import.meta.dirname, "./src/pages"),
      "@/widgets": path.resolve(import.meta.dirname, "./src/widgets"),
      "@/features": path.resolve(import.meta.dirname, "./src/features"),
      "@/entities": path.resolve(import.meta.dirname, "./src/entities"),
      "@/shared": path.resolve(import.meta.dirname, "./src/shared"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // Requests reach Vite through the NestJS proxy on :3000, so the HMR
    // client must connect back to that port rather than Vite's own.
    hmr: {
      clientPort: 3000,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
})
