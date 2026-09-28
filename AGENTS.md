# Agent Instructions — Brede Welvaart Scan

This file is the single source of truth for AI coding agents in this repo. `CLAUDE.md` and `.github/copilot-instructions.md` are symlinks to this file, so Claude Code, GitHub Copilot, and any AGENTS.md-aware tool (Cursor, Codex, Aider) read the same guidance.

## Project

Digital tool for the City of Amsterdam to collect, review, and archive outcomes from Brede Welvaart (BW) workshops. A *Scan* contains 10 fixed topics; each topic has 1–8 arguments with sentiment (positive / negative / neutral) and threaded comments from invited reviewers. Facilitators export a finalized PDF that is archived to the council system.

See `product.md` for full domain terminology (Scan, Topic, Argument, Comment, locations, user roles).

This repository is **public** (EUPL-1.2). Never commit credentials, tenant or subscription identifiers, internal hostnames, or deployment manifests. Deployment lives in a separate private repository that consumes this one as a git submodule.

## Skills (read before acting in their domain)

These skills are pinned in `skills-lock.json` and hydrated into `.agents/skills/` by the `prepare` hook on `pnpm install` (via the [`skills`](https://www.npmjs.com/package/skills) CLI). The directory is `.gitignore`'d — re-run `pnpm install` after pulling if it goes missing. Use the skills as the source of truth for their topics — do not re-derive guidance.

- **`developers-amsterdam`** — engineering standards: Conventional Commits, branch protection, tests (~70–80% coverage), security-by-design, accessibility.
- **`amsterdam-design-system`** — `@amsterdam/design-system-react`, `--ams-*` tokens, BEM `ams-` classes, Compact mode, Tailwind bridge for layout only. Mandatory for all UI work.
- **`amsterdam-stijl`** — Dutch tone of voice (Heldere Taal B1, active voice, inclusive). Mandatory for all user-facing copy.

## Stack

- **Monorepo:** pnpm workspaces (`pnpm-workspace.yaml`). Use `pnpm`, never `npm` or `yarn` (`preinstall` blocks others).
- **Workspaces:** `apps/backend`, `apps/frontend`, `apps/pdf-frontend`, `apps/ai-service`, `apps/ai-service-mock`, `apps/shared/types`, `apps/shared/ui`.
- **Frontend:** React + Vite + Apollo Client. Follow the `amsterdam-design-system` skill — ADS components and `--ams-*` tokens first; shadcn only as a last resort and only when restyled with ADS tokens.
- **Backend:** Node.js + Apollo GraphQL, MongoDB. Run via `tsx` (no build step). Only the two frontends are built.
- **Types:** GraphQL codegen → emitted to `apps/shared/types`. Run `pnpm codegen` after schema changes.
- **Auth:** Entra ID SSO (`@azure/msal-react`); the backend validates the bearer token. Local dev needs an app registration in `.env.local` / `.env`.
- **AI:** `apps/ai-service` talks to Azure AI Foundry through `DefaultAzureCredential`. Don't call `api.openai.com` directly or hardcode model names; models are configured in `apps/ai-service/config/`.
- **PDF:** `apps/pdf-frontend` rendered via Puppeteer from the backend.
- **Package versions:** Pinned via the pnpm `catalog:` in `pnpm-workspace.yaml`. Reference catalog versions instead of hardcoding.
- **Containers:** one root `Dockerfile` with a target per service. Deployment-specific frontend values are `ARG`s, never files in the repo.

## Commands

- `pnpm dev` — Turbo runs backend + frontend + ai-service (Python) together. Add infra first with `pnpm dev:infra`.
- `pnpm dev:e2e` — same, plus `pdf-frontend` (full stack); `pnpm dev:all` runs `dev:infra` then `dev:e2e`.
- `pnpm dev:ai` / `pnpm dev:pdf` — run a single service via Turbo.
- `pnpm build` — builds both frontends
- `pnpm codegen` — regenerates GraphQL types into `apps/shared/types`
- `pnpm check` — lint, typecheck, tests, build, codegen drift, Python checks, audits (what CI runs)

## Conventions

- **TypeScript everywhere.** Strict mode. Use catalog-pinned `typescript` and `@types/node`.
- **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- **Dutch UI copy** — defer to the `amsterdam-stijl` skill. Code identifiers stay in English.
- **GraphQL-first:** Define schema in `apps/backend`, regenerate types, then consume from frontend via the generated hooks. Don't hand-roll types that the codegen produces.
- **No build step for backend code** — write code that runs directly under `tsx`. Avoid build-only TS features that depend on emit (e.g. `const enum` in shared code, decorators requiring transformers without explicit config).
- **Tracer-bullet vertical slices.** Ship the thinnest end-to-end path before broadening surface area.
- **Throwability over reusability.** Don't extract shared abstractions until two call sites demonstrably need them.
- **Editing existing files** is preferred over creating new ones. Don't add docs, READMEs, or planning files unless asked.
- **Comments:** explain *why*, not *what*. Skip narration of what the code does.

## Boundaries

- Only **facilitators** edit Scan content; **reviewers** can only comment. Enforce in resolvers, not just UI.
- Scans are editable **until finalized**. After finalization: read-only + archived PDF.
- All authenticated requests must come through Entra ID SSO — no anonymous mutations.
- All cross-package types must flow through `apps/shared/types` (codegen output) or `apps/shared/ui`.

## What to avoid

- Don't introduce alternative package managers, UI libraries (MUI, Chakra, Ant Design), or state libraries when Apollo cache or local React state suffice. Raw shadcn defaults are also out — see the `amsterdam-design-system` skill.
- Don't bypass the design system tokens with hardcoded colors / spacing.
- Don't write `if (env === 'dev') useFs(); else useBlob()`-style branches — use the official emulator (Azurite, local Mongo container) so dev mirrors prod.
- Don't commit secrets or environment-specific identifiers — `.env*` files are ignored; only `.env.example` files are tracked.
- Don't skip `pnpm codegen` after schema changes; stale generated types cause silent drift.
