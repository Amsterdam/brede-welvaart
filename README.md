# Brede Welvaart Scan

[![CI](https://github.com/Amsterdam/brede-welvaart/actions/workflows/ci.yml/badge.svg)](https://github.com/Amsterdam/brede-welvaart/actions/workflows/ci.yml)
[![Licence: EUPL-1.2](https://img.shields.io/badge/licence-EUPL--1.2-blue.svg)](LICENSE)

Web application used by the City of Amsterdam to record, review and archive the outcomes of
**Brede Welvaart** (broad prosperity) workshops. A facilitator captures arguments for the ten
broad-prosperity themes, invites reviewers to comment, and finalises the scan as a PDF that is
archived to the council information system. An optional AI service discovers sources and proposes
candidate effects.

This project was developed with public funding and is published under the
[EUPL-1.2](LICENSE) so other public organisations can reuse it. See [product.md](product.md) for the
domain model and [NOTICE.md](NOTICE.md) for the parts (logo, typeface) that are not open source.

## Architecture

| Service | Path | Port | Purpose |
| --- | --- | ---: | --- |
| Frontend | `apps/frontend` | 5173 | React app used by facilitators and reviewers |
| Backend | `apps/backend` | 3000 | Apollo GraphQL API, PDF endpoint, AI orchestration |
| PDF frontend | `apps/pdf-frontend` | 5174 | Render target for Puppeteer PDF generation |
| AI service | `apps/ai-service` | 8000 | FastAPI service for source discovery, talking points and effects |
| AI service mock | `apps/ai-service-mock` | 8001 | Fixture-backed stand-in for the AI service |
| Shared types | `apps/shared/types` | | GraphQL codegen output shared by all TypeScript apps |
| Shared UI | `apps/shared/ui` | | React components and contexts shared by both frontends |
| MongoDB | Docker Compose | 27017 | Application database |
| Azurite | Docker Compose | 11000 | Local Azure Blob Storage emulator for document uploads |

Stack: pnpm workspaces + Turborepo, React 19 + Vite + Apollo Client, Node.js + Apollo Server +
Mongoose, Python 3.13 + FastAPI, Microsoft Entra ID (MSAL) for sign-in, Amsterdam Design System
for UI.

## Prerequisites

- Node.js 24 (`corepack enable` gives you the pinned pnpm)
- Docker with Compose
- Python 3.13 and [`uv`](https://docs.astral.sh/uv/) (AI service only)
- An Azure subscription with an Entra ID app registration and, for the AI features, an
  Azure AI Foundry (Azure OpenAI) deployment

## Getting started

```bash
pnpm install
uv --directory apps/ai-service sync --group dev

cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
cp apps/pdf-frontend/.env.example apps/pdf-frontend/.env.local
cp apps/ai-service/.env.example apps/ai-service/.env
```

Fill in the Entra ID values in `apps/frontend/.env.local` and `apps/backend/.env`
(`MSAL_CLIENT_ID`, `MSAL_AUTHORITY`). The backend validates the tokens the frontend obtains, so
both must point at the same app registration.

Start infrastructure, then all services:

```bash
pnpm dev:infra   # MongoDB + Azurite
pnpm dev:e2e     # backend, frontend, pdf-frontend, ai-service
```

`pnpm dev:all` runs both. `pnpm dev` starts only backend, frontend and ai-service. Seed demo data:

```bash
pnpm --filter ./apps/backend seed
```

Open:

- App: <http://localhost:5173>
- GraphQL: <http://localhost:3000/graphql>
- PDF frontend: <http://localhost:5174>
- AI service docs: <http://127.0.0.1:8000/docs>

### AI service

The AI service authenticates to Azure AI Foundry with `DefaultAzureCredential`. Locally, run
`az login` with an account that has the `Cognitive Services OpenAI User` role on the Azure OpenAI
resource named in `FOUNDRY_ENDPOINT`. Deployed, use a managed identity with the same role.

Source discovery needs a local vector index in `apps/ai-service/data/openresearch/embeddings/`.
Build it from the AI service directory:

```bash
uv --directory apps/ai-service run python -m scripts.run_pipeline \
  --steps collect extract assemble embed
```

Without an index the service still starts and `/health` works, but source discovery returns
nothing. To develop the frontend without Azure access at all, point `AI_SERVICE_URL` in
`apps/backend/.env` at the mock (`http://127.0.0.1:8001`) and run
`docker compose up ai-service-mock -d`.

See [apps/ai-service/README.md](apps/ai-service/README.md) for details.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:generated   # run `pnpm codegen` after GraphQL schema changes
pnpm check:python
pnpm check             # all of the above plus dependency audits
```

## Container images

The root `Dockerfile` has one target per service: `frontend`, `pdf-frontend`, `backend`,
`ai-service`. The two frontends are static builds, so deployment-specific values are passed as
build arguments:

```bash
docker build . --target frontend \
  --build-arg VITE_BACKEND_URL=https://example.org/api \
  --build-arg VITE_ENTRAID_CLIENT_ID=<app-registration-client-id> \
  --build-arg VITE_ENTRAID_AUTHORITY=https://login.microsoftonline.com/<tenant> \
  --build-arg VITE_ENTRAID_LOGIN_REDIRECT_URI=https://example.org/ \
  --build-arg VITE_ENTRAID_LOGOUT_REDIRECT_URI=https://example.org/logout
```

`compose.yaml` builds all images for a local end-to-end run. Backend and AI service read their
configuration from environment variables at runtime; see the `.env.example` files for the full list.
The repository contains no deployment manifests. The City of Amsterdam deploys from a separate
private repository that includes this one as a git submodule.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

## Licence

[EUPL-1.2](LICENSE) © Gemeente Amsterdam. Logo, branding and the Amsterdam Sans typeface are
excluded, see [NOTICE.md](NOTICE.md).
