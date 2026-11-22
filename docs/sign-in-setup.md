# Sign-in setup: Google, Apple, email and phone

The sign-in screen (website `/login`, and the first screen of both phone apps) offers, in this order:
**Google, Email, Apple, Phone**, then **Customer sign up** and **Partner sign up**.

Everything works today in development without any accounts: Google and Apple show a **demo** form,
and email and phone codes are printed in the API terminal. Before launch you need the accounts below.
Until a key is set, a live server simply hides that button, so nothing breaks.

| Method | Works in development | Needed before launch | Cost |
|---|---|---|---|
| Phone (OTP) | Yes (code in API terminal) | MSG91 account + DLT registration (see [notifications.md](notifications.md)) | Per SMS |
| Email (code) | Yes (code in API terminal) | Resend account + your domain verified | Free tier, then paid |
| Google | Demo form | Google Cloud OAuth client ids | Free |
| Apple | Demo form | Apple Developer Program membership | $99 a year |

## Who sees what

- **ZARVA (customer app and website)**: all four ways in. Customer sign up starts with the mobile number, because bookings need it.
- **ZARVA Partner**: phone only. Partners are identified by their mobile number for KYC and weekly payouts. Its "Customer sign up" button opens the customer app's page.
- In the customer app, **Partner sign up** opens the partner sign-up page (`PARTNER_SIGNUP_URL`, default `https://zarva.in/partner/login`). Point it at the ZARVA Partner store listing once that app is published.
- **ZARVA team (admin)** sign-in is not on this screen. It stays at `/admin/login`.

## Google

1. Follow "Google sign-in" in the [README](../README.md) to create the **Web application** client id and put it in `GOOGLE_CLIENT_ID`.
2. For the phone app, in the same Google Cloud project create two more OAuth client ids:
   - **iOS**: bundle id `in.zarva.app`.
   - **Android**: package `in.zarva.app`, plus the SHA-1 fingerprint from `eas credentials` (Android, production keystore).
3. Give the build the ids, in EAS (expo.dev → project → Environment variables) or in `eas.json`:
   `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_WEB_CLIENT_ID`.
4. Add **all three** ids to the API's `GOOGLE_CLIENT_ID`, comma-separated, website id first:
   `GOOGLE_CLIENT_ID=web-id.apps.googleusercontent.com,ios-id.apps.googleusercontent.com,android-id.apps.googleusercontent.com`
   The API only accepts Google tokens issued for one of these ids.

Google does not work inside Expo Go (Google can't send the person back to Expo Go). Use a build from `eas build --profile customer-preview`.

## Apple

You need an **Apple Developer Program** membership ($99 a year, developer.apple.com/programs). Enrol as an
organisation if you can (needs a D-U-N-S number), so the App Store shows "ZARVA" and not your personal name.

Apple's App Store rule 4.8: an iPhone app that offers Google sign-in must also offer Sign in with Apple
(or an equivalent private option). So once Google is live on iPhone, Apple must be too.

1. **iPhone app**: in developer.apple.com → Certificates, Identifiers & Profiles → Identifiers, open (or create) the App ID `in.zarva.app` and tick **Sign in with Apple**. The app config already asks for it (`usesAppleSignIn`), and EAS sets up the rest when you build.
2. **Website**: create a **Services ID**, for example `in.zarva.web`. Tick **Sign in with Apple** → Configure:
   - Primary App ID: `in.zarva.app`
   - Domains: `zarva.in`
   - Return URLs: `https://zarva.in/login`
3. Set on the API (Render → Environment):
   ```
   APPLE_CLIENT_IDS=in.zarva.app,in.zarva.web
   APPLE_WEB_SERVICE_ID=in.zarva.web
   ```
   The API only accepts Apple tokens issued for one of these ids, checked against Apple's public keys.

Notes:
- Apple has no built-in sign-in on Android phones, so the Android app hides the Apple button once Apple is live. Android users have Google, email and phone.
- Apple sends the person's name only the very first time they sign in. The app passes it to the API, which saves it on the new account.
- People can choose "Hide my email". They then get a `@privaterelay.appleid.com` address. To email those addresses you must register your sending domain in Apple's "Sign in with Apple for Email Communication" settings.

## Email

Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` and `EMAIL_FROM` (see [deploy.md](deploy.md)).

## Phone

Set `OTP_PROVIDER=msg91` with the MSG91 keys. Real SMS in India needs DLT registration first (see [notifications.md](notifications.md)).
