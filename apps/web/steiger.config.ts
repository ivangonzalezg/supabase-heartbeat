import { defineConfig } from "steiger"
import fsd from "@feature-sliced/steiger-plugin"

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // `widgets/run-details-drawer` currently has only one consumer
    // (`pages/workflow-overview`), which trips this heuristic — but it
    // was deliberately extracted to `widgets/` (not left in
    // `pages/workflow-overview/ui/`) because it's explicitly meant to be
    // reused by future project-level and workspace-level run-list
    // pages, matching the same rationale as `widgets/workflow-form`.
    files: ["./src/widgets/run-details-drawer/**"],
    rules: { "fsd/insignificant-slice": "off" },
  },
])
