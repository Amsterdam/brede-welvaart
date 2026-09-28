# Contributing to Brede Welvaart Scan

Thanks for your interest. This project is developed by the City of Amsterdam Innovation team and
is open source so other public organisations can reuse and improve it.

## Before you start

- Read the [README](README.md) to run the stack locally.
- Check [open issues](https://github.com/Amsterdam/brede-welvaart/issues). Open one before starting
  larger changes so we can agree on the approach.
- Be respectful. The [Code of Conduct](CODE_OF_CONDUCT.md) applies to all interactions.

## Workflow

1. Fork the repository and create a branch from `main`.
2. Make your change. Keep pull requests focused on one thing.
3. Run the checks (see below) and make sure they pass.
4. Open a pull request using the template. Describe what changed and why.

Maintainers review pull requests and merge them once CI is green and the change fits the product.

## Commits and branches

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- User-facing text is Dutch, written in clear language (B1 level). Code identifiers are English.

## Checks

```bash
pnpm install
uv --directory apps/ai-service sync --group dev

pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:generated   # GraphQL codegen output must be committed
pnpm check:python      # ai-service lint + tests
```

`pnpm check` runs all of the above plus dependency audits.

## Guidelines

- **GraphQL-first.** Change the schema in `apps/backend`, run `pnpm codegen`, then consume the
  generated types from `apps/shared/types`. Never hand-write types the codegen produces.
- **Amsterdam Design System.** Use `@amsterdam/design-system-react` components and `--ams-*` tokens.
  Do not add other UI libraries or hardcode colours and spacing.
- **Authorisation lives in resolvers.** Only facilitators edit scan content; reviewers comment.
  Enforce this in the backend, not only in the UI.
- **No secrets in the repo.** Local settings go in `.env` / `.env.local` files, which are ignored.
- **Tests.** Add or update tests for behaviour you change. Backend tests use Jest,
  frontend tests use Vitest, the AI service uses pytest.

## Security issues

Do not report vulnerabilities through public issues. See [SECURITY.md](SECURITY.md).

## Licence

By contributing you agree that your contributions are licensed under the [EUPL-1.2](LICENSE).
