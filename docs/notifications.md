# Booking updates by SMS and WhatsApp

Customers and partners get a message at every important step. Messages are written to a `notifications` table in the same database transaction as the change (so nothing is sent for a change that failed), then the API sends them within a few seconds and retries up to 5 times (after 30 s, 2 min, 10 min, 30 min) if the provider is down. A message that could not go out within 12 hours is dropped, because "your professional is on the way" is useless the next day. The same message is never sent twice, even if both the payment webhook and the app confirm a booking.

- **SMS** always goes to the account's verified mobile number.
- **WhatsApp** goes only to people who ticked "Also send me booking updates on WhatsApp" (at checkout or on the Account page). Meta's rules require that opt-in.

## Settings

| Setting | Local (default) | Live |
|---|---|---|
| `SMS_PROVIDER` | `console`: printed in the API terminal as `[SMS to +91…] …` | `msg91` once DLT templates are approved, `off` until then |
| `MSG91_SMS_TEMPLATES` | | `booking_confirmed:<id>,pro_assigned:<id>,…` (one MSG91 template id per message below) |
| `WHATSAPP_PROVIDER` | `console` | `meta` once templates are approved, `off` until then |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | | From Meta Business → WhatsApp → API setup |

A message whose template id is missing is skipped (and logged), so you can register templates one at a time. A live server refuses `console`, so customers' numbers never pile up in a log.

## Registering the SMS templates (DLT)

In India every SMS text must be registered word for word on your operator's DLT portal (Jio, Airtel or Vi) under your sender ID (for example `ZARVAA`), as a **Service Implicit** (transactional) template. Each `{#var#}` may hold up to 30 characters; ZARVA shortens longer values automatically. After DLT approves a template, add it in MSG91 (**SMS → Templates**, paste the DLT template id) and copy MSG91's template id into `MSG91_SMS_TEMPLATES`. Variables go into MSG91 as `var1`, `var2`… in the order they appear in the text.

Copy each text exactly as written:

| Message | Text to register | Variables, in order |
|---|---|---|
| `booking_confirmed` | ZARVA: Booking {#var#} for {#var#} on {#var#} is confirmed. We will share your professional's details soon. | code, service, when |
| `pro_assigned` | ZARVA: {#var#} will do your booking {#var#} on {#var#}. Give start code {#var#} only when they arrive. | pro, code, when, startCode |
| `pro_on_the_way` | ZARVA: {#var#} is on the way for booking {#var#}. Call {#var#} if needed. | pro, code, phone |
| `job_completed` | ZARVA: Booking {#var#} is complete. Amount {#var#}. Thank you for choosing ZARVA. | code, amount |
| `booking_cancelled` | ZARVA: Booking {#var#} is cancelled. Reason: {#var#}. | code, reason |
| `refund_started` | ZARVA: Refund of {#var#} for booking {#var#} has started. It reaches your account in 5-7 days. | amount, code |
| `pro_job_assigned` | ZARVA Partner: New job {#var#} on {#var#} at {#var#}. Open the partner app for details. | code, when, area |
| `pro_job_cancelled` | ZARVA Partner: Job {#var#} on {#var#} has been cancelled. Please do not go to the customer. | code, when |
| `pro_approved` | ZARVA Partner: Welcome {#var#}, your profile is approved. You can now accept jobs in the partner app. | name |
| `pro_rejected` | ZARVA Partner: We could not approve your profile yet. Reason: {#var#}. Please fix it in the partner app. | reason |
| `pro_payout_details_changed` | ZARVA Partner: Your payout account was changed to {#var#}. If you did not do this, call ZARVA support now. | destination |
| `payout_paid` | ZARVA Partner: {#var#} has been paid to {#var#}. Reference {#var#}. | amount, destination, utr |

The texts live in `apps/api/src/notify/templates.ts`. If you change one there, register the new wording on DLT before deploying, or MSG91 will reject it.

## WhatsApp templates

In Meta Business Manager → WhatsApp → **Message templates**, create one **Utility** template per message, named `zarva_<message>` (for example `zarva_booking_confirmed`), language English, with the same text as above and `{{1}}`, `{{2}}`… in place of each `{#var#}`, in the same order. Templates that aren't approved yet are skipped, not retried.

## Try it locally

Run `pnpm dev`, make a booking, and watch the API terminal: every message shows up as `[SMS to +91…]` (and `[WhatsApp to +91…]` if you ticked the WhatsApp box).
