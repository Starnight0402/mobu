# Mobu — Our Life Together

A private, real-time archive and life tracker built for exactly two people. Nothing-inspired dark (and light) design: a deep black canvas, glassmorphic surfaces, and a purple accent (`#a855f7`), with a recurring "purple dot" motif that shows up in the nav, the calendar, and the map.

Access is hard-restricted to two allowlisted email addresses at signup — there is no way for anyone else to create an account.

## Features

**Home** — a rearrangeable widget dashboard (togetherness calendar, recent memories, computed insight, mood/spend stats, next capsule, recent activity), a relationship streak badge, and an "On This Day" strip surfacing memories from the same date in past years.

**Memory Board** — pin photos with custom card styling (size, font, colors, border, shadow). Two views: a draggable spatial "web" with connector lines between memories (node positions are a deterministic hash of each memory's ID, so the layout doesn't reshuffle every time you add or edit one) and a practical grid view for browsing. Photos are uploaded to Convex File Storage, compressed client-side before upload. Supports tagging a category and location, with a "use current location" button.

**Timeline** — memories grouped by year, newest first.

**Relationship Map** — real Google Maps view plotting memories that have coordinates, plus opt-in session-based live location sharing ("share for 1/3/8 hours") with a live "X km apart / Together" distance widget. This is deliberately *not* always-on background tracking — a PWA can't reliably do that, especially on iOS — sharing pauses if the tab is closed or backgrounded.

**Log Data** — mood (emoji scale), activity, food, health, and a proper expense splitter (bill amount + split-ratio slider) that writes to a dedicated expense ledger with a running "who owes whom" balance, a settle-up action, and CSV export.

**Chat** — a real-time, single-thread chat: text, image attachments, voice notes (recorded in-browser), and double-click-to-heart reactions.

**Call** — WebRTC video/audio calling between the two of you. Convex itself is the signaling channel (no separate signaling server); works over STUN alone on most networks, with an optional TURN relay for stricter NATs.

**Goals** — shared goals with progress tracking, plus a "date idea roulette" that spins to pick a random uncompleted goal.

**Capsules** — time-locked content that unlocks on a chosen date.

**Insights** — a handful of patterns computed from your own data (mood trend week-over-week, most common shared activity, most common day together, memory-capture pace). No AI involved — genuinely computed, not generated.

**Health** — records and tracking for both of you, under Us → Health. Upload or scan reports (an AI reads the date, lab and every value with its printed range; you check them before anything is saved), and each value is charted over time per marker. Also: medicines with dose reminders, refill and interaction warnings and a missed-dose nudge to your partner; vitals and sleep from Android Health Connect; visits with fasting/question prep; vaccines and screenings by age; symptoms, care mode for when one of you is ill, optional cycle tracking, mind check-ins, Medical ID with a QR page, insurance and claims, and view-only doctor links. Each of you chooses per category what the other sees (enforced on the server, `convex/health/access.ts`). Mobu keeps records; it doesn't diagnose.

**Settings** — currency, timezone, a light/dark theme toggle that syncs across devices, sign-out, and a "download all our data" button that exports everything as JSON.

## Stack

- **Frontend**: React 19, Vite, Tailwind CSS v4, Framer Motion, Recharts, `@react-google-maps/api`.
- **Backend**: [Convex](https://convex.dev) — database, server functions, file storage, and auth, all in one. There is no separate Node/Express server; the built frontend is a static site that talks to Convex directly.
- **Auth**: Convex Auth (email + password), with a hardcoded allowlist of the two permitted email addresses enforced server-side.
- **PWA**: `vite-plugin-pwa` (injectManifest mode) — installable on Android/iOS home screens, works offline for the app shell.
- **Hosting**: GitHub Pages, deployed via GitHub Actions on every push to `main` (see `.github/workflows/deploy.yml`).

### Health setup

| What | How |
| --- | --- |
| Report reading | Set `GEMINI_API_KEY` in the Convex dashboard (optional `GEMINI_MODEL`). Without it, uploads still work and you type values in. Each person can switch AI reading off in Health settings. |
| Health Connect | Needs the Android app (APK 1.4+). It's a native plugin, so unlike the web app it doesn't update over the air. |
| ABHA verification | Optional. Register Mobu at sandbox.abdm.gov.in, then set `ABDM_CLIENT_ID` and `ABDM_CLIENT_SECRET` (and `ABDM_ENV=production` when live). Without them, the number is saved as typed. |
| Reminders | Run from Convex crons (`convex/crons.ts`) as normal Mobu notifications. |

## Local development

```bash
npm install
npx convex dev   # first run: browser login + link/create a Convex project
```

Copy `.env.example` to `.env.local` and fill in what you need — `VITE_CONVEX_URL` gets written automatically by `npx convex dev`. `VITE_GOOGLE_MAPS_API_KEY` and the `VITE_TURN_*` vars are optional; the Map and Call views degrade gracefully without them (a clear "not connected" state rather than a silent failure).

```bash
npm run dev          # vite + convex dev together
npm run dev:frontend  # vite only
npm run dev:backend   # convex dev only
npm run lint          # tsc --noEmit
npm run build          # production build to dist/
```

## Testing

| Layer | Command | What it covers |
| --- | --- | --- |
| Unit | `npm test` | Pure logic: expense CSV, Splitwise import + carryover maths, WhatsApp parser, conflict/connection detectors (`tests/unit/`) |
| Integration | `npm test` | Real Convex queries/mutations against the real schema, in memory via `convex-test` (`tests/convex/`). Includes a sweep that finds **every** public function and asserts it rejects signed-out callers. A new function without `requireUserId` fails here. |
| Performance | `npm run test:perf` | Time budget for the chat-import pipeline on 30k messages (`tests/perf/`) |
| Bundle | `npm run check:bundle` | Gzip size of the initial load and each lazy chunk vs `perf-budget.json` (a ratchet: lower it when you shrink the bundle) |
| End-to-end | `npm run test:e2e` | Playwright on a phone profile, against the production build and a throwaway local Convex backend (no account needed; `scripts/e2e-backend.mjs`). Two people sign up, split a bill, settle it, chat live, pin a photo memory, complete a goal and lock a capsule; strangers and wrong passwords are refused. Also cold-load timing. |

`npm run verify` runs everything except E2E. Run it before pushing.

## Deployment

Every push runs typecheck, unit, integration, perf, bundle and E2E checks (`.github/workflows/ci.yml`). On `main`, **only if all of them pass** does it deploy (`deploy.yml`): `npx convex deploy` pushes the backend, then builds and deploys the frontend to GitHub Pages, then smoke-tests the live site. Other branches run the same checks without deploying.

Recovery: a **Rollback** workflow redeploys any earlier commit in one click, and a nightly **Backup** workflow exports all data and photos, encrypts them, keeps them 90 days and proves each one restores. See [docs/RUNBOOK.md](docs/RUNBOOK.md) for what to do when something breaks, and for the one-time `BACKUP_PASSPHRASE` setup. Requires a `CONVEX_DEPLOY_KEY` repository secret and GitHub Pages set to deploy from "GitHub Actions" (Settings → Pages).

GitHub Pages sites are always publicly reachable at their URL — there's no way to make the served site itself private on a free plan. Privacy comes entirely from Convex-side auth checks on every query and mutation, not from hiding the URL.
