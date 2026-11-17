# HANDOFF: Streak’d (Daily League)

State of the repo: the shared core (games, scoring, streaks, championships) is tested. The API is written but **has never been run**: it was authored in a sandbox with no network, so no `npm install`, no MongoDB and no Docker. Treat the first run as the real test. The React/Vite frontend in `apps/web` is also untested (never built or loaded in a browser).

## Layout
- `packages/core`: game registry, validators, scoring, streak and championship logic. 8 passing tests (`npm test`).
- `apps/api`: Fastify + Mongoose REST API. Run with `tsx` (core is imported as TypeScript source).
- `apps/web`: React + Vite SPA (plain CSS, `strict: false` TypeScript). API URL comes from `VITE_API_URL` at build time. Static output works on GitHub Pages (`base: './'`).
- `docker-compose.yml`: MongoDB 7 (volume, auth, healthcheck), API (healthcheck on `/health`), web (nginx serving the built static files on :8080).

## First run, in order
1. `cp .env.example .env`; set `MONGO_PASSWORD`, put the same password into `MONGODB_URI`, and set `JWT_SECRET` (`openssl rand -hex 32`).
2. `npm install` (generates the lockfile; commit it, then switch the Dockerfile to `npm ci`).
3. `npm test` then `npm run typecheck`. **Expect to fix some type errors**: the API was never compiled.
4. `docker compose up -d --build`, then `curl localhost:4000/health`.
5. Smoke test: register, create a group, create an invite, join with a second user, `PUT /groups/:id/submissions`, `GET .../streaks`, `GET .../championships/YYYY-MM`.

## Required services
MongoDB. Optional SMTP for password reset: set `SMTP_URL`, `MAIL_FROM` and `APP_URL` (the public frontend URL). With no SMTP the reset link is printed in the API logs. No migrations: collections and indexes (unique, compound, TTL) are created by `syncIndexes()` at startup.

## Environment variables
See `.env.example`. Required: `MONGODB_URI`, `JWT_SECRET` (32+ chars). If the frontend is on a different site from the API, set `CORS_ORIGINS` to its exact origin, `COOKIE_SECURE=true` and `COOKIE_SAMESITE=none`, and serve the API over HTTPS.

## Production domain
Put a TLS-terminating proxy (Caddy or Nginx) in front of the API on port 4000. The refresh cookie is scoped to path `/auth`, so the frontend should call `/auth/refresh` on the same API base URL. Frontend must read the API URL from one build-time variable (e.g. `VITE_API_URL`).

## Backups
`docker compose exec mongo mongodump -u $MONGO_USER -p $MONGO_PASSWORD --authenticationDatabase admin --archive=/data/db/backup.gz --gzip`, copy the file out, and restore with `mongorestore --archive=... --gzip`. Schedule it.

## API summary
Auth: `POST /auth/register|login|refresh|logout`. Users: `GET|PATCH /users/me`. Games: `GET /games`. Groups: `POST|GET /groups`, `GET|PATCH|DELETE /groups/:groupId`, `POST /groups/join`, `POST /groups/:id/leave|invites|transfer|games/custom`, `PATCH /groups/:id/games`, `PATCH|DELETE /groups/:id/members/:userId`. Password reset: `POST /auth/forgot`, `POST /auth/reset`. Results: `PUT|GET /groups/:id/submissions`. `GET /groups/:id/streaks`. `GET /groups/:id/championships[/:month]`. All group routes require membership; non-members get 404.

## Decisions and assumptions
- Connections: input is mistakes 0-4, 4 = failed. Angle: two parts, failed part counts as 5, success needs both. Real rules unverified.
- Rooted thresholds are placeholders (uncapped game). All thresholds live in `packages/core/src/games.ts`, with `scoringVersion` stored per submission and championship. There is no admin UI or API for editing thresholds yet.
- Failed results score 0; completed results score at least 1. Custom games never earn points.
- A failed attempt still counts as completing the game for streaks. Current streak stays alive if today isn't played yet.
- Completed months are archived lazily on first read, then served unchanged.

## Not built (cut from scope, schema-compatible later)
Account deletion, avatars (initials only), achievements (including Monthly Champion badge; the champion is recorded on archives), statistics beyond streaks and standings (no heatmap or charts, no recharts/lucide/Tailwind in the frontend), frontend UI for removing members, changing roles and transferring ownership (API exists), rank-change display, Swagger docs, GitHub Actions, a reverse proxy/TLS config, API tests for authorization and group isolation (need a MongoDB test instance; the `member()` helper in `server.ts` is where isolation is enforced).

## Look and feel
Default theme is dark: navy background (`#0f1b3d`) with a white accent. Groups store `mainColor` (page background) and `accentColor` (buttons, highlights); light/dark/system is a per-user setting. All colours derive from CSS variables in `apps/web/src/styles.css`.
