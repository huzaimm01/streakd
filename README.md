# Streak'd — Daily League

A daily-games league for friend groups: submit your Wordle, Connections,
Worldle, Globle, Flagle, Chainle, Angle, Krillion and Rooted results, keep
streaks alive, and crown a monthly champion.

- `packages/core` — pure TypeScript game registry, validators, scoring,
  streaks and championship logic (tested).
- `apps/api` — Fastify + Mongoose REST API.
- `apps/web` — React + Vite SPA.

## Run locally

```sh
cp .env.example .env   # fill in MONGO_PASSWORD, MONGODB_URI, JWT_SECRET
npm install
npm test
npm run typecheck
docker compose up -d --build
```

API: http://localhost:4000/health — Web: http://localhost:8080

Without Docker, run a local MongoDB, point `MONGODB_URI` at it, then
`npm run dev:api` and `npm run dev -w @streakd/web` (http://localhost:5173).

## Hosting

- Frontend: GitHub Pages, built by `.github/workflows/pages.yml`.
  `VITE_API_URL` is baked in at build time — set it as a repository
  variable to the public API URL.
- API: any host that runs the Docker image or Node 22, over HTTPS.
  GitHub Pages is static-only, so it cannot run the API. When the
  frontend and API are on different sites, set `COOKIE_SECURE=true`,
  `COOKIE_SAMESITE=none` and `CORS_ORIGINS` to the exact frontend origin.
- Database: MongoDB (bundled container, or Atlas). No migrations or seeds:
  indexes are created on startup.

Password reset needs SMTP (`SMTP_URL`, `MAIL_FROM`, `APP_URL`). Without it,
the reset link is printed in the API logs instead of emailed.
