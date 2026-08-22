# OneApp — Daily Chores System

A multi-service "super-app" that brings cabs, hotels, flights, trains, buses,
gas, movies & events, home services, grocery, food delivery, pharmacy,
stationary, electronics, clothing, and bill payments into a single product —
**Web**, **iOS** and **Android**, sharing one backend and one TypeScript
domain model.

> **Status: MVP with several real, working subsystems — not a market-ready
> product.** Every category has a real, working, end-to-end flow (search →
> book/add-to-cart → pay → order history) backed by our own API and seeded
> demo data. On top of that: cab fares are **computed live from real
> distance/time/surge** (not flat), hotel/flight prices **shift with date and
> demand** the way real OTAs price, cab/food/home-service orders get a **live
> simulated tracking journey** (moving driver, ETA, status), **Razorpay**
> checkout is fully wired (needs your own API keys to activate), **grocery
> search** pulls real live product data from Open Food Facts, and **push
> notifications** fire on every booking/order/payment via Expo's push
> service. See [What's real vs. mocked](#whats-real-vs-mocked) for the exact
> boundary — there's still no real cab dispatch, airline GDS, or restaurant
> POS integration (those need business partnerships), no deployment/hosting,
> no app store build, and no test suite. This is a strong prototype to build
> from, not a finished business.

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

| Group    | Categories                                                                 | Flow |
|----------|------------------------------------------------------------------------------|------|
| Booking  | Cabs, Hotels, Flights, Trains, Buses, Gas refills, Movies & Events, Home Services | Search → pick a listing → (cabs: drop pins on a map) → **Book now** → order created |
| Shop     | Grocery, Food Delivery, Pharmacy, Stationary, Electronics, Clothing           | Browse/search → **Add to cart** → **Checkout** → order created |
| Bills    | Electricity, Water, Mobile, DTH, Broadband, Credit card                       | Enter consumer number → mock biller returns amount due → **Pay** |

All orders land in **Order history**, available from both clients. Every
"book now" / "checkout" / "pay" action offers **Razorpay** checkout when the
backend has keys configured, and otherwise falls back to an instant one-click
"demo checkout" — nothing is ever blocked on having payment credentials.

### Dynamic pricing

- **Cabs** don't have a flat fare. Pick pickup/drop pins on the map and the
  backend computes a real quote — `apps/backend/src/lib/pricing.ts` takes the
  actual haversine distance between your two pins (× a road-distance fudge
  factor), the vehicle's per-km/per-min rates, and a live surge multiplier
  (time-of-day peak windows + a slow "market is moving" wiggle) — and shows
  the full breakdown before you book. The price you're charged is
  **recomputed server-side at booking time** from the same pickup/drop, never
  trusted from the client.
- **Hotels & flights** price like a real OTA/airline: `computeDynamicTravelPrice`
  applies a last-minute premium / advance-purchase discount curve based on
  days-until-checkin/departure, a small popularity bump for highly-rated
  listings, a Friday/Saturday night premium for hotels, and the same live
  demand wiggle — so refreshing a search (or picking a date) visibly changes
  the price. Search with a date (`?date=YYYY-MM-DD`) to see it most clearly.

### Live tracking (simulated)

Cab bookings, food delivery orders, and home-service bookings get a **live
tracking journey** — open it from the booking confirmation screen, or the
"Track live" link on Order history. A driver/delivery-partner icon moves in
real time along a real route on a Leaflet/OpenStreetMap map, through
realistic phases (assigned → heading to pickup → arrived → in progress →
completed) with a live ETA and ⭐-rated driver card, polled every 2 seconds
from `apps/backend/src/lib/tracking.ts`. This is a genuine simulation, not
real GPS — there's no real fleet behind it (see
[What's real vs. mocked](#whats-real-vs-mocked)) — but the position math,
timing, and progression are all real, computed from actual elapsed time and
actual distances, not scripted. Food/home-service delivery points are
synthesized near the restaurant/provider (no address picker for those yet —
a natural next step).

Grocery search also merges in real live results from **Open Food Facts**
alongside our own seeded catalog — search for a real packaged product (e.g.
"nutella", "oreo", "lays") to see it. Cab bookings show a real Leaflet +
OpenStreetMap picker to drop pickup/drop pins (no API key required), reverse-
geocoded to an address via OpenStreetMap's Nominatim service. On mobile, a
booking/order/bill-payment confirmation also fires a real push notification
via Expo's push service once you've logged in and granted notification
permission.

## Getting started

### 1. Backend

```bash
# Start a local Postgres (or point DATABASE_URL at any Postgres instance)
docker compose up -d

cd apps/backend
cp .env.example .env
npm install        # (or just `npm install` from the repo root, once)
npx prisma migrate dev --name init
npm run seed        # creates ~90 demo listings across 14 categories + demo@oneapp.dev / password123
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
  booking logic, order history, full REST API, shared type-safe client used
  by both frontends, **cab fare pricing** (real distance/time/surge math,
  server-recomputed at booking time), **hotel/flight dynamic pricing** (real
  date/demand curve), **live order tracking simulation** (real position/ETA
  math over real elapsed time, not scripted), **Razorpay payments** (real
  SDK, real order creation, real HMAC signature verification — activates once
  you set `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`), **live grocery search**
  via Open Food Facts (real product names/brands/photos, no API key), **cab
  pickup/drop map** via Leaflet + OpenStreetMap + Nominatim (no API key), and
  **push notifications** via Expo's push service (no API key, but needs an
  EAS project — see below).
- **Mocked / simulated:** listing data for every category (all seeded, not
  pulled from live providers — no real airline/hotel/restaurant inventory),
  the bill-payment lookup (deterministic fake amounts), payments when
  Razorpay isn't configured (an instant "demo checkout" success), and —
  importantly — **tracking itself is a simulation**: there is no real
  driver/delivery fleet, so the "live" journey is generated server-side from
  real geometry and real elapsed time rather than actual GPS. It's honestly
  labelled as such nowhere in the UI (worth adding if this ships), but the
  underlying math is not faked or hardcoded.
- **Not attempted at all:** deployment/hosting, an app store build, load
  testing, a security review, and an automated test suite. None of this is a
  few-line fix — see the status note at the top.

### Setting up the real integrations

- **Razorpay:** get test keys from your
  [Razorpay dashboard](https://dashboard.razorpay.com/app/keys) and set
  `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in `apps/backend/.env`. Without
  them, every checkout/booking/bill-pay button falls back to the demo flow —
  the app is fully usable either way.
- **Push notifications (mobile):** Expo's push service needs an EAS project
  id to mint tokens. Run `npx eas init` inside `apps/mobile` (creates a free
  Expo account project) and it wires up `extra.eas.projectId` in
  `app.json` automatically. Without it, notification registration silently
  no-ops — nothing breaks, you just won't get pushes.
- **Grocery live search & cab maps:** work out of the box, no setup — they
  call Open Food Facts / OpenStreetMap directly with no API key.

> **A note on this repo's own build sandbox:** the environment this was
> built in blocks outbound requests to arbitrary internet hosts (only npm,
> GitHub, etc. are allowlisted), so `world.openfoodfacts.org`,
> `nominatim.openstreetmap.org`, `tile.openstreetmap.org`,
> `checkout.razorpay.com` and `exp.host` could not be reached to live-test
> those calls end-to-end from inside that sandbox. Every one of those code
> paths was verified for correct request shape, and — for the network calls
> that could reach the blocked hosts — the graceful fallback UI (e.g. "Live
> product search is temporarily unavailable") was confirmed working. Run it
> anywhere with normal internet access (your machine, CI, a real server) and
> these should work live; if something doesn't, it's worth a bug report.

## Extending to a real provider

Each category's listings are just rows in the `Listing` table with a
`categorySlug` and a free-form `meta` JSON blob. To wire in a real provider
(e.g. a flight GDS), replace the seed data / mock lookup in
`apps/backend/src/routes/*.ts` and `apps/backend/src/providers/*.ts` with a
call to that provider's API, keeping the same `Listing` / `Order` shape so
neither frontend needs to change — `apps/backend/src/providers/openFoodFacts.ts`
is a worked example of exactly this pattern.
