# OneApp — Daily Chores System

A multi-service "super-app" that brings cabs, hotels, flights, trains, buses,
grocery, stationary, electronics, clothing, gas booking and bill payments into
a single product — **Web**, **iOS** and **Android**, sharing one backend and
one TypeScript domain model.

> **Status: MVP scaffold.** Every category has a real, working, end-to-end
> flow (search → book/add-to-cart → pay → order history) backed by our own
> API and seeded demo data. There are no live third-party integrations yet
> (no real cab dispatch, airline GDS, payment gateway, etc.) — those require
> business partnerships and provider API keys that are out of scope for a
> single build. The architecture is designed so each category's mock data
> source can be swapped for a real provider integration behind the same API
> shape.

## Monorepo layout

```
packages/shared/   Domain types, category catalog, and a fetch-based API client
                    shared by both the web app and the mobile app.
apps/backend/       Node.js + Express + TypeScript + Prisma/PostgreSQL API,
                    JWT auth, and the seed script with realistic mock listings.
apps/web/           React (Vite) + Tailwind web app.
apps/mobile/        Expo (React Native) app for iOS and Android.
```

All apps talk to the same REST API and share the same `Listing` / `Order` /
`User` types from `packages/shared`, so a new category or field only needs to
be added once.

## Categories & flows

| Group    | Categories                                              | Flow |
|----------|----------------------------------------------------------|------|
| Booking  | Cabs, Hotels, Flights, Trains, Buses, Gas refills         | Search → pick a listing → **Book now** → order created immediately |
| Shop     | Grocery, Stationary, Electronics, Clothing                | Browse/search → **Add to cart** → **Checkout** → order created |
| Bills    | Electricity, Water, Mobile, DTH, Broadband, Credit card    | Enter consumer number → mock biller returns amount due → **Pay** |

All orders land in **Order history**, available from both clients.

## Getting started

### 1. Backend

```bash
# Start a local Postgres (or point DATABASE_URL at any Postgres instance)
docker compose up -d

cd apps/backend
cp .env.example .env
npm install        # (or just `npm install` from the repo root, once)
npx prisma migrate dev --name init
npm run seed        # creates ~64 demo listings + demo@oneapp.dev / password123
npm run dev          # http://localhost:4000
```

### 2. Web app

```bash
cd apps/web
echo "VITE_API_URL=http://localhost:4000" > .env
npm run dev           # http://localhost:5173
```

### 3. Mobile app (Expo)

```bash
cd apps/mobile
npm run start
```

Then press `i` for iOS simulator, `a` for Android emulator, or scan the QR
code with Expo Go on a physical device. By default the app talks to
`http://localhost:4000`; on an Android emulator that must be
`http://10.0.2.2:4000`, and on a physical device use your computer's LAN IP —
set `EXPO_PUBLIC_API_URL` or edit `extra.apiUrl` in `apps/mobile/app.json`.

### Demo login

Every client can log in with the seeded demo account:

```
email:    demo@oneapp.dev
password: password123
```

## Root scripts

Run from the repo root (npm workspaces):

- `npm run dev:backend` / `npm run dev:web` / `npm run dev:mobile`
- `npm run typecheck` — typechecks every workspace
- `npm run seed` — re-seed the database

## What's real vs. mocked

- **Real:** auth (JWT + bcrypt), Postgres persistence, cart/checkout logic,
  booking logic, order history, a deterministic mock "biller" lookup, full
  REST API, shared type-safe client used by both frontends.
- **Mocked:** listing data (flights/hotels/cabs/etc. are seeded, not pulled
  from live providers), payments (checkout/pay always "succeeds" — no card
  processor is wired in), delivery/dispatch tracking.

## Extending to a real provider

Each category's listings are just rows in the `Listing` table with a
`categorySlug` and a free-form `meta` JSON blob. To wire in a real provider
(e.g. a flight GDS or a payment gateway), replace the seed data / mock lookup
in `apps/backend/src/routes/*.ts` with a call to that provider's API, keeping
the same `Listing` / `Order` shape so neither frontend needs to change.
