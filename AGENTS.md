# Repository Guidelines

Training platform for Fundacja Niepodzielni's volunteer-psychologist development program: a Laravel 13 (PHP 8.4) API plus a Next.js 16 (React 19, TypeScript, Tailwind 4) frontend, with PostgreSQL 17, Redis, and Mailpit via docker-compose. Work is organized into 21 vertical-slice packages H01–H21 (@docs/hackathon/01-pakiety-zadan.md).

## Hard rules

- @docs/hackathon/02-kontrakt-api.md is the source of truth for HTTP. Never invent routes, notification types, or audit slugs — missing routes go through the contract guardian (@docs/hackathon/00-przewodnik.md).
- Migrations are frozen: additive only, via the schema guardian, in designated windows.
- Touch only your package's `backend/routes/api/hXX.php`. Starter facades, `UserResource`/`/me`, panel layouts, and the menu registry are staff-owned.
- No new composer/npm dependencies or UI libraries without staff approval.
- Authorize every request server-side; validate with FormRequests; escape user content. Audit events only via `AuditLog::record`, notifications only via `Notify::send`, using contract registry values.
- UI text in Polish, code in English. Secrets only in `.env`. No real personal data — seeds per @docs/hackathon/04-seed-demo.md.
- Port conflicts: set `NP_APP_PORT`/`NP_DB_PORT`/`NP_MAILPIT_PORT`; never edit compose files.

## Package status coordination

The shared source of truth for H01–H21 ownership and status is
`openspec/changes/koordynacja-pakietow-h01-h21/tasks.md`.

- Before creating the first OpenSpec artifact or editing code for an HXX package, read the
  board and confirm that the package is not owned by someone else.
- Starting work requires setting the package owner and status to `W TOKU`. The update must
  be visible on `origin/main`; a status left only on a local package branch does not reserve
  the package. If you cannot update `main` safely, stop and ask the team coordinator.
- Use only these statuses: `GOTOWE` (unclaimed), `W TOKU` (active work), `REVIEW` (pushed and
  ready for review), `DONE` (merged and verified), `BLOCKED` (cannot continue). A `BLOCKED`
  entry must include the concrete reason.
- Update the board immediately when work moves to `REVIEW`, is merged as `DONE`, becomes
  `BLOCKED`, or resumes as `W TOKU`. Never change another person's ownership without an
  explicit team decision.
- After a board update lands on `main`, rebase or merge the current `origin/main` into the
  package branch before continuing implementation.

## Mandatory package workflow

Before starting a package branch and again before closing its OpenSpec change, committing,
pushing, or opening a Pull Request, follow
@docs/hackathon/06-workflow-pakietu-i-pr.md. Its repository safety rules are mandatory:
package work goes only to `origin` on `pakiet/HXX-nazwa`; never push to `upstream` or
directly to `origin/main`, never create a PR without the explicit repository, and never
merge your own package PR.

## Build, Test, and Development Commands

- `bash scripts/setup.sh` (Windows: `scripts\setup.ps1`) — full environment; then `cd frontend && npm run dev`. Frontend :3000, API :8000, Mailpit :8025.
- `docker compose exec app php artisan test` — PHPUnit suite.
- `./vendor/bin/pint` (backend), `npm run lint -- --fix` (frontend); CI also gates `npm run build`.
- Reset: `docker compose down -v && bash scripts/setup.sh`.

## Project Structure

- `backend/` — controllers in `app/Http/Controllers/Api/V1`, per-package routes in `routes/api/`, tests in `tests/{Unit,Feature}`.
- `frontend/` — App Router route groups `(uczestnik)`, `(prowadzacy)`, `(administracja)`; shared code in `components/{ui,layout}` and `lib/api.ts`. Read @frontend/AGENTS.md before writing Next.js 16 code.
- `docs/hackathon/` — guide, packages, API contract, seed spec; deeper specs in `docs/system/`.

## API Conventions

Base path `/api/v1`, Sanctum Bearer auth, responses always wrapped in `{"data": ...}` (lists add `meta`), errors in the `error` envelope, ISO 8601 UTC timestamps, decimals as strings. Details and status-code table: @docs/hackathon/02-kontrakt-api.md.

## Commit & Pull Request Guidelines

Branch `pakiet/HXX-nazwa`; keep PRs near 400 lines when the vertical slice permits it. Multiple package PRs may be open concurrently. Flow: partner review → liaison review → staff merge; CI (Pint, PHPUnit, ESLint, build) must pass. Package commits use `feat(HXX): opis zmiany`. Document demo results in `DEMO/HXX.md`. The complete closeout and PR checklist is @docs/hackathon/06-workflow-pakietu-i-pr.md.
