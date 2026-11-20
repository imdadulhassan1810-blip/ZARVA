# ZARVA

*Har Zaroorat Ek Thikana.* One app for everyday services: food, shopping, events, travel and home services.

This repository is the **vertical-agnostic foundation** (sign-in, profiles, addresses, payments, design system, a module slot per vertical) plus the first vertical, **home services**, launching in Durgapur. See [docs/home-services.md](docs/home-services.md). Other verticals show as "Coming soon" until their module is written and switched on.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language for API, web and mobile; shared types and validation |
| Monorepo | pnpm workspaces | Simple, fast, no extra build tool needed yet |
| API | Fastify 5 + Drizzle ORM + PostgreSQL 16 | Fast, typed SQL, plain migrations; Postgres covers everything up to serious scale |
| Web | Next.js 15.5 (App Router) + PWA manifest | SEO for landing pages, installable on Android |
| Mobile | Expo SDK 58 (React Native 0.88) | One codebase for Android and iOS; OTA updates |
| Auth | Phone OTP, email code, Google; JWT access token (15 min) + rotating refresh token (60 days) | No passwords to leak or reset; verified phone required before booking |
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

## Run it locally (Windows, macOS, Linux)

You only need **Node.js 22 or newer** and **pnpm**. There's no database to install: by default the API uses a built-in demo database that lives in `apps/api/.data`.

### One-time setup

1. Install Node.js 22 LTS (or newer) from https://nodejs.org (accept the defaults).
2. Open a **new** terminal (on Windows, PowerShell or the VS Code terminal) and run:
   ```
   npm install -g pnpm@10
   ```
3. In the project folder:
   ```
   pnpm install
   ```

### Start the website

```
pnpm dev
```

Wait for `ZARVA API ready` and `Ready`, then open **http://localhost:3000**.

To sign in, enter any 10-digit Indian mobile number (for example `98765 43210`) and press **Send OTP**. No SMS is sent: the 6-digit code appears in the terminal as
`>>> OTP for +919876543210: 123456 <<<`. Type that code into the website.

You can also sign in with **email** (the code is printed the same way, as `>>> Email code for … <<<`) or **Continue with Google**. Until you add real Google keys, the Google button is a demo: type any Gmail address and a name.

Google and email accounts must add a mobile number (Account page) before booking, because professionals call customers.

Stop with `Ctrl + C`. Your demo data stays until you delete `apps/api/.data`.

### See the mobile app on your phone

1. Install **Expo Go** from the Play Store or App Store.
2. Make sure the phone and the computer are on the **same Wi-Fi**.
3. Keep `pnpm dev` running, and in a **second** terminal run:
   ```
   pnpm dev:mobile
   ```
4. Scan the QR code: on Android with the Expo Go app, on iPhone with the Camera app.
5. If Windows asks whether Node.js may use the network, allow it on **private networks**, or the phone can't reach the API.

The phone finds the API on your computer automatically. If it can't (some office or hostel Wi-Fi blocks devices from seeing each other), run `pnpm dev:mobile -- --tunnel` instead, and set `extra.apiUrl` in `apps/mobile/app.json` to an address the phone can reach.

### Using real PostgreSQL instead (optional)

Copy `.env.example` to `.env`, set `DATABASE_URL=postgres://zarva:zarva@localhost:5432/zarva_dev`, and start Postgres (`docker compose up -d`). Migrations run automatically when the API starts. The API tests need a `zarva_test` Postgres database (`createdb -O zarva zarva_test`); then run `pnpm test`.

## Google sign-in (real, when you're ready)

Free, about 10 minutes, and needs a Google account:

1. Go to https://console.cloud.google.com and create a project named **ZARVA**.
2. Open **APIs & Services → OAuth consent screen**. Choose **External**, fill in the app name (ZARVA), a support email and the logo, and save. While it's in "Testing" mode, add your own Gmail under **Test users**.
3. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**
   - Authorised JavaScript origins: `http://localhost:3000` (add your real domain later, e.g. `https://zarva.in`)
   - Redirect URIs: leave empty (the button doesn't need one)
4. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`). The client secret is not needed.
5. Put it in `.env` (copy `.env.example` to `.env` first if you don't have one):
   ```
   GOOGLE_CLIENT_ID=1234-abc.apps.googleusercontent.com
   ```
   and restart `pnpm dev`. The demo button becomes the real Google button.
6. Before launch, click **Publish app** on the consent screen so anyone can sign in.

Google sign-in on the **mobile app** needs a custom Expo development build (it doesn't work inside Expo Go). Mobile users can sign in with phone or email meanwhile.

## API (v1)

| Method | Path | Auth | What |
|---|---|---|---|
| POST | /v1/auth/otp/request | - | Send OTP. 30 s resend gap, 5 per hour per number |
| POST | /v1/auth/otp/verify | - | Verify OTP, create user if new, return tokens |
| POST | /v1/auth/refresh | - | Rotate refresh token. Reusing an old one revokes all sessions |
| POST | /v1/auth/logout | - | Revoke this device's session |
| GET | /v1/auth/providers | - | Which sign-in methods are on (Google live / demo / off) |
| POST | /v1/auth/email/request | - | Email a 6-digit code |
| POST | /v1/auth/email/verify | - | Verify email code, create user if new |
| POST | /v1/auth/google | - | Sign in with a Google ID token (links to an existing account with the same verified email) |
| POST | /v1/me/phone/request, /verify | yes | Add a verified mobile to the account (required before booking) |
| POST | /v1/me/email/request, /verify | yes | Add a verified email to the account |
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
