# Contributing to Bookify

Thanks for your interest in contributing! Bookify is an event booking API built to
demonstrate correct behaviour under high-contention seat inventory. Contributions of all
kinds are welcome — bug reports, docs, tests, and features.

## Ways to contribute

- **Report a bug** — open an issue with steps to reproduce, expected vs. actual behaviour,
  and your environment.
- **Suggest a feature** — open an issue describing the problem you want solved. The
  [Roadmap](README.md#roadmap) in the README is a good source of ideas.
- **Send a pull request** — fix a bug, improve docs, add a test, or pick up a roadmap item.

## Development setup

Bookify targets **Node.js 24+** and uses **pnpm**.

```bash
git clone https://github.com/neemchand/bookify-api.git
cd bookify-api
pnpm install
cp .env.example .env      # then edit JWT_SECRET etc.

pnpm infra:up             # Postgres, Redis, Kafka via docker compose
pnpm db:migrate           # apply schema
pnpm db:seed              # demo users + event

pnpm dev                  # API on http://localhost:3010 (Swagger at /docs)
```

See the [README Quickstart](README.md#quickstart) for the full walkthrough, including the
consumers and expiry worker.

## Making a change

1. **Fork** the repo and create a branch off `master`:
   `git checkout -b fix/short-description` or `feat/short-description`.
2. **Make your change.** Match the style of the surrounding code. The project is strict
   TypeScript, ESM, and uses TypeBox schemas to validate all request/response I/O.
3. **Add or update tests.** Behavioural changes should come with a test — the
   `tests/booking-concurrency.test.ts` oversell test is the model to follow for anything
   touching booking correctness.
4. **Run the checks locally** (see below) — they must pass.
5. **Open a pull request** against `master`. Fill in the PR template, link any related
   issue, and describe what you changed and why.

## Checks that must pass

```bash
pnpm build                # tsc — must type-check with no errors
pnpm infra:up             # tests need Postgres, Redis, and Kafka running
pnpm test                 # integration tests against isolated infra
```

Tests run against fully isolated infrastructure (a separate `bookify_test` database,
`test:`-prefixed Redis keys, `test.`-prefixed Kafka topics), so they never touch your dev
data. CI runs these same checks on every pull request.

## Commit messages

Please follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(bookings): add waitlist when a tier sells out
fix(kafka): create topics before consumers subscribe
docs(readme): clarify consumer scaling
test(bookings): cover confirm-vs-expire race
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`, `perf`.

## Code of Conduct

By participating, you agree to uphold our [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting security issues

Please do **not** open a public issue for security vulnerabilities. See
[SECURITY.md](SECURITY.md) for how to report them privately.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE) that covers the project.
