# Nexus — Our Life Together

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

**Settings** — currency, timezone, a light/dark theme toggle that syncs across devices, sign-out, and a "download all our data" button that exports everything as JSON.

## Stack

- **Frontend**: React 19, Vite, Tailwind CSS v4, Framer Motion, Recharts, `@react-google-maps/api`.
- **Backend**: [Convex](https://convex.dev) — database, server functions, file storage, and auth, all in one. There is no separate Node/Express server; the built frontend is a static site that talks to Convex directly.
- **Auth**: Convex Auth (email + password), with a hardcoded allowlist of the two permitted email addresses enforced server-side.
- **PWA**: `vite-plugin-pwa` (injectManifest mode) — installable on Android/iOS home screens, works offline for the app shell.
- **Hosting**: GitHub Pages, deployed via GitHub Actions on every push to `main` (see `.github/workflows/deploy.yml`).

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

## Deployment

Push to `main` and GitHub Actions handles the rest: `npx convex deploy` pushes the backend, then builds and deploys the frontend to GitHub Pages. Requires a `CONVEX_DEPLOY_KEY` repository secret and GitHub Pages set to deploy from "GitHub Actions" (Settings → Pages).

GitHub Pages sites are always publicly reachable at their URL — there's no way to make the served site itself private on a free plan. Privacy comes entirely from Convex-side auth checks on every query and mutation, not from hiding the URL.
