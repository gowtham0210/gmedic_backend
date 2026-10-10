# Patient app API (`/api/patient/...`)

The backend of the Gmedic patient app (`C:\Users\mubee\Downloads\gmedic\gmedic_app`). It mirrors the app's `GmedicApi` interface
(`lib/data/api/gmedic_api.dart`) one method per endpoint, so the app can replace its in-memory `FakeGmedicApi` with an HTTP client
without UI changes. It writes to the same SQLite database as the Super Admin, Receptionist and Doctor portals, so a patient's booking
shows up in the doctor's and receptionist's screens at once, and in the Super Admin's payments, refunds and settlements.

Full contract: [`openapispec.yaml`](../openapispec.yaml), tag **Patient** (33 operations). Code: `app/api/patient/**` (routes),
`services/patient/*` (rules), `lib/patientApi.js` (wrapper).

## Conventions
| | |
|---|---|
| Auth | `Authorization: Bearer <token>` from `POST /api/patient/auth/verify`. Tokens live 30 days (`PATIENT_SESSION_DAYS`) and are separate from the portals' cookie sessions. |
| Errors | `{ "error": "<message for the patient>", "code": "<STABLE_CODE>" }`; validation errors add `fields`. |
| Money | Integer **paise** everywhere in this API (the database stores rupees). |
| Time | `start` / `end` are ISO-8601 in the hospital's local time with its offset (e.g. `2026-10-08T12:45:00+05:30`). Dates are `YYYY-MM-DD`. |
| Enums | lower-case: `male/female/other`, `self/spouse/child/parent/sibling/other`, `upi/card/netbanking/wallet`, `fullPrepay/bookingFee/tokenFee`. |
| CORS | `/api/patient/*` allows any origin (bearer token, no cookies) so the Flutter web build can call it. |

## `GmedicApi` method -> endpoint
| App method | Endpoint |
|---|---|
| `requestOtp` | `POST /auth/otp` |
| `verifyOtp` | `POST /auth/verify` -> `{ token, user }` |
| `logout` | `POST /auth/logout` |
| `updateProfile` | `PUT /me` |
| `deleteAccount` | `DELETE /me` |
| `dependents` / `addDependent` / `updateDependent` / `removeDependent` | `GET`/`POST /dependents`, `PUT`/`DELETE /dependents/{id}` |
| `resolveQr` | `POST /qr/resolve` `{ raw }` |
| `linkHospital` / `unlinkHospital` / `relinkHospital` | `POST`/`DELETE /hospitals/{id}/link`, `POST /hospitals/{id}/relink` |
| `linkedHospitals` / `hospital` | `GET /hospitals`, `GET /hospitals/{id}` |
| `departments` / `doctors` | `GET /hospitals/{id}/departments`, `GET /hospitals/{id}/doctors` |
| `doctor` | `GET /doctors/{id}` |
| `slots` | `GET /doctors/{id}/slots?date=YYYY-MM-DD` |
| `nextAvailableDay` | `GET /doctors/{id}/next-available?after=YYYY-MM-DD` |
| `quote` | `GET /doctors/{id}/quote` |
| `holdSlot` / `releaseHold` | `POST /holds` `{ slotId, patientId }`, `DELETE /holds/{id}` |
| `pay` | `POST /holds/{id}/pay` `{ method, idempotencyKey, reason? }` -> appointment |
| `appointments` / `appointment` | `GET /appointments`, `GET /appointments/{id}` |
| `cancelQuote` / `cancel` | `GET /appointments/{id}/cancel-quote`, `POST /appointments/{id}/cancel` |
| `rescheduleBlocker` / `reschedule` | `GET /appointments/{id}/reschedule-check` -> `{ blocker }`, `POST /appointments/{id}/reschedule` `{ slotId }` |
| (new) in-app inbox | `GET /notifications`, `POST /notifications/read` |

Appointment endpoints return `{ appointment, hospital, doctor }` (the app's `AppointmentView`). The account holder's own `patientId` is the
**user id**; family members use their own id.

## Error codes
`INVALID_PHONE`, `INVALID_OTP`, `TOO_MANY_REQUESTS` (429), `OTP_UNAVAILABLE` (501), `NOT_SIGNED_IN` (401), `ACCOUNT_DISABLED`, `VALIDATION` (400),
`NOT_FOUND` (404), `NOT_LINKED` (403), `QR_INVALID` / `QR_REVOKED` / `QR_SUSPENDED` (422), `LIMIT_REACHED` (409), `SLOT_UNAVAILABLE` (409),
`DUPLICATE_BOOKING` (409), `HOLD_EXPIRED` (410), `PAYMENT_DECLINED` / `PAYMENT_TIMEOUT` / `PAYMENT_LATE_REFUNDED` (402), `POLICY` (422).

## Rules enforced on the server
- **QR / linking:** `https://gmedic.app/h/<hospital>?k=<key>`, `gmedic://gmedic.app/h/<hospital>` or a bare hospital code. The key must be an active QR code of that hospital; revoked keys and inactive hospitals are refused. Every scan is logged in `qr_scans` (the Super Admin's QR analytics).
- **Slots:** generated from the doctor's weekly schedule (`doctor_schedules`, seats = `capacity_per_slot`), minus bookings and other patients' live holds, leaves and the hospital's booking window (`hospital_policies.booking_window_days`, 7 days for the demo hospital). Slots that start within 30 minutes are unavailable.
- **Hold:** one live hold per account, 10 minutes (`appointment_hold_minutes` setting). A lapsed hold frees its seat.
- **One active booking per patient, doctor and day.**
- **Payment:** simulated gateway (no real money). The same `idempotencyKey` never charges twice. A payment after the hold lapsed is confirmed only if a seat is still free, otherwise `PAYMENT_LATE_REFUNDED`. In dev (not production) the header `x-simulate-payment: decline|timeout` forces a failure.
- **Fees:** by the hospital's model (`fullPrepay`, `bookingFee`, `tokenFee`) + convenience fee + 18 % GST on the convenience fee.
- **Cancel:** confirmed appointments only. Refund = the fee part paid in the app (not the convenience fee or GST), only when cancelled at least `cancellation_window_hours` (4) before the slot, scaled by `refund_percent`; token fees never refund. The refund is a `refunds` row that the Super Admin sees (the payout is simulated as completed).
- **Reschedule:** once, same doctor, up to 2 hours before the slot.
- **Notifications:** booking fires `NEW_APPOINTMENT` (doctor, receptionists), `APPOINTMENT_CONFIRMED` and `PAYMENT_SUCCESS` (patient, receptionists); cancel and reschedule notify everyone involved. The wording is the Super Admin's template (Communications).
- **Walk-in history:** signing in with the mobile number of an existing hospital patient adopts that record, so earlier visits appear in the app.
- **Delete account:** future appointments are cancelled (refund per policy), personal details are erased, visit and payment records stay with the hospital.

## What is simulated or missing
- **OTP:** no SMS provider is connected. `PATIENT_OTP_MODE=dev` (default outside production) accepts the fixed code `PATIENT_DEV_OTP` (123456); `sms` mode answers 501 until a provider is added.
- **Payment gateway and refund payouts:** simulated (`gateway = SIMULATED`).
- **Push notifications:** none; the app polls `GET /notifications`.
- **Doctor gender / department / schedules for the demo doctors** were filled in by `db/seedPatientDemo.js` (only where empty).

## Testing
```bash
npm run db:setup                              # applies migrations 012-013 and the catalogue seed
npm run dev
python scripts/patient-api-smoke.py           # 55 checks: every endpoint, each response validated against openapispec.yaml
python scripts/patient-api-scenarios.py       # 29 checks: seat races, late payment, two-seat slots, refund timing, OTP limits, delete account
node scripts/patient-api-cleanup.js all       # removes the test patients and what they booked
```

## Environment
`PATIENT_OTP_MODE` (`dev` | `sms`), `PATIENT_DEV_OTP`, `PATIENT_SESSION_DAYS` - see `.env.example`.
