# Supabase Heartbeat

Supabase Heartbeat is a project for monitoring the health and availability of Supabase instances.

## Monorepo structure

This repository is a monorepo managed with **Yarn 4 Workspaces**:

```text
supabase-heartbeat/
├── apps/
│   ├── api/            # Backend application (not yet initialized)
│   └── web/            # Frontend application (not yet initialized)
├── packages/
│   ├── contracts/      # Shared types and contracts (not yet initialized)
│   └── validation/     # Shared validation schemas and logic (not yet initialized)
├── package.json
├── yarn.lock
├── .yarnrc.yml
├── tsconfig.base.json
└── README.md
```

> **Note:** the apps and packages above only contain minimal scaffolding
> (`package.json`). No framework or library has been initialized yet
> (NestJS, React, Vite, Better Auth, Drizzle, Swagger, etc.).

## Installation

This project uses Yarn 4 via Corepack. To install dependencies:

```bash
yarn install
```
