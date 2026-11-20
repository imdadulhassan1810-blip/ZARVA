# ZARVA

*Har Zaroorat Ek Thikana.* One app for everyday services: food, shopping, events, travel and home services.

This repository is the **vertical-agnostic foundation** (sign-in, profiles, addresses, payments, design system, a module slot per vertical) plus the first vertical, **home services**, launching in Durgapur. See [docs/home-services.md](docs/home-services.md). Other verticals show as "Coming soon" until their module is written and switched on.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language for API, web and mobile; shared types and validation |
| Monorepo | pnpm workspaces | Simple, fast, no extra build tool needed yet |
| API | Fastify 5 + Drizzle ORM + PostgreSQL 16 | Fast, typed SQL, plain migrations; Postgres covers everything up to serious scale |
| Web | Next.js 15 (App Router) + PWA manifest | SEO for landing pages, installable on Android |
| Mobile | Expo SDK 53 (React Native 0.79) | One codebase for Android and iOS; OTA updates |
| Auth | Phone OTP, JWT access token (15 min) + rotating refresh token (60 days) | Phone is the identity in India |
| SMS | MSG91 adapter (console sender in dev) | Needs DLT registration before go-live |
| Payments | Provider interface; Razorpay adapter (UPI first) + mock | Swap provider without touching verticals |

## Layout

```
apps/
  api/        Fastify API. src/modules/<vertical> is where each vertical plugs in
  web/        Next.js customer web app
  mobile/     Expo app (Android + iOS)
packages/
  brand/      Design tokens from the ZARVA logo kit + SVG masters
  core/       Shared zod schemas, typed API client, module registry contract
  payments/   PaymentProvider interface, Razorpay + mock adapters
```

## Run it locally

Needs Node 22+, pnpm 10, and Postgres 16 (or Docker).

```bash
pnpm install
cp .env.example .env              # then set JWT_SECRET to a long random string
docker compose up -d              # or use your own Postgres
pnpm db:migrate
pnpm dev:api                      # http://localhost:4000, OTP codes print in this terminal
pnpm dev:web                      # http://localhost:3000
pnpm dev:mobile                   # scan the QR with Expo Go
```

On a physical phone, set `extra.apiUrl` in `apps/mobile/app.json` to your computer's LAN IP.

Tests need a `zarva_test` database (`createdb -O zarva zarva_test`), then `pnpm test`.

## API (v1)

| Method | Path | Auth | What |
|---|---|---|---|
| POST | /v1/auth/otp/request | - | Send OTP. 30 s resend gap, 5 per hour per number |
| POST | /v1/auth/otp/verify | - | Verify OTP, create user if new, return tokens |
| POST | /v1/auth/refresh | - | Rotate refresh token. Reusing an old one revokes all sessions |
| POST | /v1/auth/logout | - | Revoke this device's session |
| GET/PATCH | /v1/me | yes | Profile (name, email, language: en/hi/bn) |
| GET/POST | /v1/me/addresses | yes | List / add (max 20, one default) |
| PATCH/DELETE | /v1/me/addresses/:id | yes | Edit / soft delete |
| POST | /v1/payments/confirm | yes | Verify client-side checkout signature |
| GET | /v1/payments/:id | yes | Payment status |
| POST | /v1/payments/webhook/:provider | signature | Provider webhook, deduped by event id |
| GET | /v1/modules | - | Which verticals exist and which are on |

## Adding a vertical

1. Replace the placeholder in `apps/api/src/modules/index.ts` with a real module in `src/modules/<id>/`.
2. Its tables go in the schema prefixed `<id>_` (for example `home_bookings`). Don't change core tables.
3. Take money only via `app.services.payments.createForOrder(...)`; never call Razorpay directly.
4. Add the id to `ENABLED_MODULES`. The web and mobile home tiles switch from "Coming soon" automatically.

## Before going live

- **DLT registration** of SMS sender ID and OTP template (TRAI rule; 1-2 weeks). Without it MSG91 will not deliver.
- **Razorpay KYC** and live keys; set the webhook URL to `/v1/payments/webhook/razorpay` with `payment.captured`, `payment.failed`.
- Move the web refresh token from localStorage to an httpOnly cookie.
- Add per-IP rate limiting at the edge (Cloudflare) in addition to the per-number OTP limits.
- Privacy notice + consent screen for the DPDP Act 2023.

## Brand

Colours, fonts and logo rules come from the ZARVA logo kit and live in `packages/brand`. Each vertical has its own colour (food coral, shopping green, events violet, travel blue, home amber). Don't recolour the logo; below 48 px use the `*-flat` files.
