# Gmedic data model v2

Applied by `database/migrations/007_data_model_v2.sql` (run `npm run db:setup`).
Full resulting DDL: [schema-v2.sql](schema-v2.sql). Diagram: [gmedic-er-diagram-v2.png](gmedic-er-diagram-v2.png).

Status key: **Done** = in the live database and used by the app · **Schema only** = table/column exists, no app code uses it yet · **Guarded** = column kept on purpose, database trigger blocks drift · **Deferred** = needs an app-wide refactor, not done · **Already fine** = review point did not apply.

## 3NF / transitive dependencies

| Table.column | Result | Notes |
| --- | --- | --- |
| appointments.hospital_id, branch_id | **Guarded** | Kept for hospital-scoped queries and the receptionist/doctor portals. A trigger rejects an appointment whose `hospital_id` differs from its doctor's hospital. Data checked: 0 mismatches. |
| appointments.payment_status | **Deferred** | A cache of `payments.status`, written by app code in many places. Target: drop and derive through a view. |
| tokens.doctor_id, hospital_id, token_date | **Guarded** | Trigger enforces doctor/hospital equal the appointment's. Target: merge into appointments as `token_no` (1:1). Deferred because the queue, token and doctor-portal code query `tokens` directly. |
| refunds.appointment_id | **Guarded** | Trigger enforces it equals `payments.appointment_id`. Target: drop. |
| disputes.transaction_id | **Guarded** | Trigger enforces it equals `payments.transaction_id`. Target: drop. |
| qr_codes.hospital_id vs branch_id | **Done** | Trigger: a QR's branch must belong to the QR's hospital. |
| users.hospital_id for doctor users | **Guarded** | Trigger: a doctor login's hospital must equal its doctor's hospital. Target: separate staff / doctor-profile tables. |
| support_tickets.hospital_id, patient_id | **Kept** | Staff-raised tickets have no appointment, so these are not derivable. `appointment_id` is now a real FK. |
| support_messages.sender_role | **Done** | Column dropped. Role is derived from `users.role` (no user = PATIENT). |
| settlements.net_payout | **Kept (frozen)** | Computed once by `settlementService` at generation. New `settlement_items` lets it be recomputed and audited. |
| appointments.fee | **Kept** | Price-at-booking snapshot (documented, intentional). |
| appointments.doctor_id + date | **Kept** | Needed by the unique slot constraint. |

## Missing concepts

| Concept | Result |
| --- | --- |
| departments | **Done.** `departments` table, `doctors.department_id`; free-text `doctors.department` dropped. Admin doctor edit and all doctor/appointment reads use it. |
| doctor languages (1NF) | **Done.** `doctor_languages(doctor_id, language)`; `doctors.languages` dropped. Doctor profile save and reads use it. |
| qualifications, experience | **Already fine.** `qualifications`, `years_experience`, `bio` already on doctors. |
| doctor_leaves | **Schema only.** |
| schedule capacity_per_slot, online_quota, effective_from/to | **Schema only** (columns on `doctor_schedules`). |
| `doctors.availability` clash with schedules | **Kept.** It is the live "present / absent today" toggle the receptionist and doctor flip; the schedule is the weekly template. They answer different questions. Revisit when leaves are enforced. |
| slot holds | **Schema only.** `slot_holds` table (HELD / CONVERTED / EXPIRED / RELEASED) instead of overloading appointment status. |
| appointment_status_history | **Done.** Filled by triggers on every insert and status change (backfilled for the 556 existing appointments). `changed_by` is not yet set by app code. |
| rescheduled_from_id, reason_for_visit | **Schema only.** `source` already existed. |
| counter payments, gateway_order_id | **Schema only.** Column added; use `gateway = 'NONE'`, `method = 'CASH'` for counter payments. |
| receipt / invoice number | **Done.** `payments.receipt_number` (unique), assigned by trigger when a payment becomes PAID; backfilled for 463 paid payments. |
| settlement_items | **Done.** Written by `settlementService.create`; backfilled for existing settlements. |
| hospital policy config | **Schema only.** `hospital_policies` seeded with defaults (24 h cancellation window, 100 % refund, 30-day booking window). Not yet enforced by booking/refund code. |
| patient_hospital_links.removed_at | **Done** (column; unlink flow not built). |
| qr_codes.revoked_at | **Already fine.** Existed. |
| DPDP consent, device/push tokens | **Schema only.** `consent_records`, `device_tokens`. |
| patient identity model | **Schema only.** `patients.account_user_id`, `relation`, `date_of_birth`, `gender`. Patients and users are still separate rows until a patient app exists. |

## Other modelling issues

| Issue | Result |
| --- | --- |
| Junction tables without PK | **Already fine.** `patient_hospital_links (patient_id, hospital_id)` and `announcement_hospitals (announcement_id, hospital_id)` already had composite PKs. |
| Actor columns not FKs | **Done.** Real FKs to `users` on refunds (requested_by, approved_by), support_tickets (created_by), support_messages (sender_id), notification_logs (recipient_user_id, notification_id), qr_codes (created_by, revoked_by, replaced_by), announcements/banners (created_by), patient_hospital_links (qr_code_id). `hospital_documents.reviewed_by` already was one. `doctors.verified_by` is enforced by trigger. |
| created_at / updated_at | **Already fine** on all business tables (with update triggers). Added to `doctor_schedules`. Log and junction tables are append-only on purpose. |
| Money as integer paise | **Deferred.** Every amount in the API and UI is a rupee `REAL`; changing it is a coordinated change across all portals. |
| UTC timestamps | **Already fine.** `CURRENT_TIMESTAMP` is UTC. |
| Status CHECK constraints | **Already fine** on every status column (only free-text `status_reason`, `gateway_status` are unconstrained, by design). New tables have CHECKs. |
| SQLite vs PostgreSQL | **Open.** SQLite is fine for this prototype; plan PostgreSQL for concurrent 9 am slot holds (`slot_holds` is designed for row locking there). |

## What still needs a refactor (deferred)
1. Merge `tokens` into `appointments` (`token_no`) and drop the three guarded token columns.
2. Replace `appointments.payment_status` with a derived view.
3. Drop `refunds.appointment_id` and `disputes.transaction_id` (queries and the settlement SQL join through payments instead).
4. Split `users` into staff and doctor-profile tables.
5. Convert money to integer paise.
6. Wire the schema-only tables into features: leaves, slot holds, hospital policy enforcement, consent, device tokens, patient accounts.

## Verification run
`PRAGMA integrity_check` ok, `PRAGMA foreign_key_check` empty. Re-tested after migration: doctor profile (languages), admin doctor department edit, appointment list, support ticket create/reply (derived sender role), appointment status change (history row written), token assignment, refund request, settlements list, and a guard trigger rejecting a mismatched appointment hospital. A pre-migration copy of the database is in `data/backup/`.

---

# Review round 2 (migration 008)

## Unmarked derived columns
| Column | Result |
| --- | --- |
| tokens.token_date | **Guarded** and now marked red. Trigger: must equal the appointment's date (insert). |
| support_messages.sender_name | **Kept as a snapshot** (the name at the time of writing, like an email's From line) and marked red. |
| qr_codes.hospital_id | **Guarded**, marked red. Trigger on insert (007) and update (008): the branch must belong to the QR's hospital. |

## Logic gaps
| Issue | Result |
| --- | --- |
| Double booking with capacity_per_slot > 1 | **Done.** `appointments.seat_no` (default 1) with unique `(doctor_id, appt_date, appt_time, seat_no)` for non-cancelled rows, plus a trigger rejecting a seat above the covering schedule's `capacity_per_slot`. Booking code must pick the lowest free seat. |
| users has no mobile | **Already there as `users.phone`**; now unique (partial). `patients.mobile` is nullable (table rebuilt); its unique index ignores NULLs. |
| Links and scans keyed on patient | **Partly done.** `patient_hospital_links.account_user_id` (unique per hospital) and `qr_scans.account_user_id` added. `patient_id` stays because walk-ins and existing rows have no account. Switching the primary key to the account is deferred until a patient app writes these rows. |
| Payments lost convenience_fee / method | **Not lost**: both existed. Added `consultation_amount` (backfilled for all 463 payments) and `tax_amount`. `method` is limited to UPI, Card, Net Banking, Wallet, Cash by trigger. |
| appointments has no source | **Already there** (`source`, 556 rows). Now limited to `Gmedic App` / `Walk-in` by trigger; labels kept so the UI is unchanged. `patients.account_user_id` was already nullable. |
| doctors.availability still there | **Kept, disagree.** It is the live present/absent toggle the receptionist and doctor portals flip today; schedules are the weekly template and leaves are not enforced yet. Drop it when leave checking replaces it. |
| hospitals / branches have no address, GSTIN, contact | **Already there.** hospitals: address_line1, city, state, pincode, gstin, contact_person, phone, email, registration_number. branches: address, contact_person, phone. The diagram only shows key columns. |

## Smaller items
| Item | Result |
| --- | --- |
| settlement_items exactly one of payment_id / refund_id | **Already enforced** by a CHECK in 007. |
| departments global vs per hospital | **Kept global** (shared master list). Add `hospital_id` and unique `(hospital_id, name)` if hospitals need their own. |
| doctors qualifications / years of experience | **Already there** (`qualifications`, `years_experience`, `bio`); now shown in the diagram. |
| Overlapping schedule windows | **Done.** Triggers on insert and update reject overlapping time windows with overlapping effective dates for the same doctor and day. The doctor API already rejected plain overlaps. |
| internal_notes (entity_type + entity_id) | **Documented:** polymorphic reference, so no database FK; the controller checks the target exists before inserting. |
| created_at / updated_at everywhere | **Checked.** Every mutable business table has both. Tables without `created_at`: meta, sessions, qr_scans (`scanned_at`), payment_webhooks (`received_at`), announcement_hospitals, platform_settings / feature_flags / app_versions (`updated_at`), patient_hospital_links (`linked_at`). Without `updated_at`: append-only logs and history (audit_logs, notification_logs, appointment_status_history, support_messages, internal_notes, qr_scans, payment_webhooks, settlement_items), and notifications / consent_records / doctor_languages, which carry their own `read_at`, `withdrawn_at` or are insert-only. |

Verified after 008: integrity and foreign-key checks clean; overlapping schedule, bad source, over-capacity seat and unknown payment method are all rejected; doctor schedule add/remove, admin patient and payment lists still work.

---

# Review round 3 (migration 009 + `npm run db:verify`)

## 1. Denormalisation and trigger dependence
- **Drift check outside the triggers.** `npm run db:verify` (`db/verifyIntegrity.js`) re-checks every red `~` column against its source (hospital, payment status, token fields, refund and dispute copies, branch/hospital, account links, settlement maths and line items, seats) and exits 1 on drift. Run it after any bulk import, restore or migration that disables triggers. It currently passes.
- **payment_status.** Still a cache of `payments`, but it now follows the payment through a trigger (a PAID payment sets `paid`), so it can no longer be set without the payment. Dropping it for a view stays deferred.
- **Snapshots are enforced, not just conventional.** Triggers reject updates to a PAID settlement's amounts / rate / period, to any `support_messages` row, to `appointment_status_history`, to `audit_logs` (update and delete), and to `appointments.fee` once a PAID payment exists.
- **Hidden logic.** Every trigger is in a numbered migration file and listed in the diagram's constraint panel; `db:verify` is the test of the rules.

## 2. Money and settlements
| Point | Result |
| --- | --- |
| No currency | **Done.** `currency` (ISO-4217, default INR) on payments, refunds, settlements and doctors; a refund must match its payment's currency. |
| Derived totals stored | **Kept, verified.** Payment components and settlement totals are stored so a statement never changes after the fact; `db:verify` recomputes them (components = amount; net = gross − refunds − commission; line items = gross). |
| settlement_items polymorphic | **Already had** the exactly-one CHECK (007), plus unique payment / refund so an item is settled once. |
| Refund totals | **Done.** Trigger: non-rejected refunds on a payment cannot exceed it. The API now says "Only ₹50 is still refundable on this payment." |
| Commission history | **Done.** `hospital_rate_history` (trigger-written on every change to model, fees or commission; backfilled). Each settlement also keeps the rule it used. |
| Disputes vs settlements | **Done (schema).** `settlement_adjustments(settlement_id, dispute_id, amount, reason)`. Not yet written by app code. |

## 3. Booking and scheduling
| Point | Result |
| --- | --- |
| Overbooking | Enforced in the database: unique `(doctor, date, time, seat_no)`, a trigger capping the seat at the slot's capacity, and `slot_holds` with a unique HELD seat plus a check against existing bookings. App code still needs to pick the seat in a transaction. |
| Duplicate tokens | Already unique on `(hospital, token_date, number)`: numbering is per hospital per day, which is why `tokens.hospital_id` and `token_date` are kept. |
| Overlapping ranges | Schedule windows (008) and now leaves (009) are blocked by triggers. SQLite has no exclusion constraints; PostgreSQL would use `EXCLUDE`. |
| Separate date and time | **Kept.** Appointments are in the hospital's local time; `hospitals.timezone` (default Asia/Kolkata) now states it. Revisit when a hospital outside one timezone is onboarded. |
| availability vs schedules | Kept as the live toggle (see round 2). |

## 4. Identity and tenancy
- **One hospital per doctor / user:** a deliberate current scope (a doctor record is a hospital employment). Multi-hospital doctors would need `doctor_affiliations`; deferred.
- **users ↔ doctors 1:1:** now enforced by a unique index on `users.doctor_id`.
- **users.role mixes kinds / departments global:** unchanged and documented (splitting users is on the deferred list).
- **Redundant account link:** `patient_hospital_links.account_user_id` and `qr_scans.account_user_id` stay (they carry the per-account unique rule) but are guarded: they must equal the patient's account.

## 5. Referential integrity
- **qr_scans** now has real FKs (qr code, hospital, branch, patient, account).
- **notifications.event_key** is now an FK to `notification_templates.event_key`. `notification_logs.event_key` stays free text so unknown events can still be logged.
- **payment_webhooks.payment_id** is now an FK (set null on delete).
- **audit_logs / internal_notes** remain soft references on purpose (audit must outlive the rows it describes); append-only for audit is now enforced.
- **consent policy_version, doctor_languages.language:** free text for now; lookup tables would also require changing the doctor profile form. Deferred.
- **Status columns:** all have CHECKs except `hospitals.status_reason` and `payments.gateway_status` (free text by design).

## 6. Missing or risky areas
- **Health / personal data:** `reason_for_visit`, `date_of_birth`, `gender`, `mobile` are plain columns. Nothing is encrypted at the column level yet. Before a patient app launches: encrypt at rest (disk or SQLCipher / PostgreSQL TDE), restrict who can read these fields (Super Admin currently sees patient lists), and define retention. Not implemented.
- **Soft delete / cancellation:** appointments are cancelled, never deleted; `cancelled_at` is added next to the existing `cancel_reason` and `cancelled_by`. No generic `deleted_at` convention yet.
- **Prescriptions, ratings, invoice table:** out of scope for this version; `payments.receipt_number` covers the receipt number.
- **Payment retries:** `payments` is already many rows per appointment (one per attempt), and a unique index now allows at most one PAID row.

## 7. Diagram
Platform tables that have relationships (`feature_flags`, `payment_webhooks`, `hospital_rate_history`) are now drawn with their lines; the remaining unlinked ones are standalone. A panel lists the unique, CHECK and trigger rules. Lines are semi-transparent but a few long ones still run behind boxes; a layout tool such as dbdiagram or Graphviz would route them better.

Verified after 009: `db:verify` all green, integrity and FK checks clean; over-cap refund, second PAID payment, edits to audit logs / a paid settlement / messages are rejected; refund request and approval, notifications, QR analytics and webhooks still work. Restart the app after running a migration: a server started before it can hold stale prepared statements (one first call failed that way before the restart).

---

# Review round 4 (migration 010)

Rules moved from triggers to declarative constraints wherever SQLite allows.

## High impact
| Point | Result |
| --- | --- |
| One hospital per doctor / user | **Deferred, plan below.** Not changed in 010. |
| Currency half done | **Done.** `currency` on hospitals (the settlement currency), doctors, appointments, payments, refunds, disputes, settlements, settlement_items, settlement_adjustments. Foreign keys tie them together: payment -> appointment, refund / dispute -> payment, settlement -> hospital, item / adjustment -> settlement and payment / refund / dispute. A settlement can no longer mix currencies. (Hospital booking and convenience fees inherit `hospitals.currency`.) |
| Triggers instead of constraints | **Done for the drift guards.** Composite foreign keys now enforce: appointment (doctor, hospital) -> doctor; appointment (branch, hospital) -> branch; token (appointment, doctor, hospital, date) -> appointment (with ON UPDATE CASCADE, so a reschedule moves the token date); refund (payment, appointment) and (payment, currency) -> payment; dispute (payment, transaction) -> payment; doctor and QR (branch, hospital) -> branch; doctor login (doctor, hospital) -> doctor, plus a CHECK that a doctor login has a hospital (a NULL would otherwise skip the key). `doctors.verified_by` and the other actor columns are plain FKs. The 13 guard triggers they replace are gone. |
| Overlap exclusion constraints | **Not possible in SQLite.** Schedule, leave and settlement-period overlap stay as triggers; PostgreSQL would use `EXCLUDE USING gist`. |
| Capacity races | SQLite allows one writer at a time, so a trigger check and its insert run under one write lock; the unique `(doctor, date, time, seat_no)` index is the final guard either way. `online_quota` is now enforced (trigger: app bookings for a slot cannot exceed the covering schedule's quota). On PostgreSQL use a locked `slots` row (`SELECT ... FOR UPDATE`). |

## Medium impact
| Point | Result |
| --- | --- |
| Stored totals can disagree | **CHECKs added**: payment components = amount; settlement net = max(0, gross - refunds - commission - fees); period start <= end. Settlement totals vs line items cannot be a row CHECK, so `db:verify` recomputes them (now for refunds and gross). |
| Payouts not reproducible | **Done.** `settlements.rate_history_id` points at the `hospital_rate_history` row in force (set by `settlementService`, backfilled), next to the rule snapshot. `hospitals` keeps the *current* rate as an intended cache of the latest history row; `db:verify` checks they match. Overlapping settlement periods per hospital are rejected by trigger. |
| settlement_adjustments currency / status / double adjustment | **Done.** `currency` (FK-tied), `status` APPLIED / VOID, unique APPLIED adjustment per dispute. |
| payments.transaction_id missing? | It exists (unique); the diagram shows key columns only. `disputes.transaction_id` is now a composite FK, not a trigger-guarded copy. |
| availability vs schedules | Unchanged: live toggle vs weekly template (see round 2). |
| Split date and time | Unchanged, local time per hospital (`hospitals.timezone`). |

## Lower impact
- **Soft references** (`audit_logs`, `internal_notes`): kept; they must outlive or span entity types. **Free text** (`consent.policy_version`, `doctor_languages.language`): deferred (lookup tables need form changes). `notifications.event_key` is already an FK.
- **departments** now has an optional `hospital_id`: NULL is a shared department, otherwise it is private to a hospital; unique per scope and name.
- **CHECK-based statuses** do need a migration per new value; the same is true of PostgreSQL enums. A lookup table is the alternative if statuses become configurable.
- **Sensitive data:** unchanged, see round 3.
- **Diagram:** every table with a foreign key is drawn with its line; the unlinked ones are standalone. The bundle around users, hospitals and appointments remains dense; use Graphviz / dbdiagram from `schema-v2.sql` for a routed layout.

## Plan for multi-hospital doctors (deferred)
Add `doctor_affiliations (doctor_id, hospital_id, branch_id, ...)` with primary key `(doctor_id, hospital_id)`, backfilled from `doctors`. Then point `appointments (doctor_id, hospital_id)` and `users (doctor_id, hospital_id)` at it instead of `doctors (id, hospital_id)`, and drop `doctors.hospital_id` / `branch_id` (the doctor's profile and registration number stay on `doctors`). This is cheap now because the composite keys are the only place the pairing is encoded, but it touches every query that filters `doctors` by hospital, so it needs its own change.

## Verification and a backup lesson
After 010: foreign-key and integrity checks clean, `db:verify` green; 15 bad writes (wrong hospital, branch, doctor, date, currency, transaction, payment total, settlement net, overlapping period, held-and-booked seat) were each rejected by a constraint; settlement generation (with line items, currency and rate-history link), refunds, tokens, appointment status, support, doctor profile / department and every portal list endpoint still work.

Process note: a file copy of the SQLite database taken while it is in WAL mode can miss recent writes. Use `VACUUM INTO 'file'` for backups (the latest is `data/backup/gmedic.after010.sqlite`). My first run of 010 failed halfway on a trigger that referenced a rebuilt table; I restored a copy that turned out to predate migrations 008-009, then replayed 008-010 on it. The data matched (only test rows differed, and I cleaned those), but the older `before00x` copies in `data/backup/` should not be trusted for point-in-time restore.
