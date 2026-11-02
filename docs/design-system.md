# Gmedic Design System

The rules the Super Admin, Receptionist and Doctor portals follow. The goal is a
calm, structured, enterprise healthcare look — not a generic "AI-generated SaaS
dashboard". When in doubt: **less colour, less decoration, more meaning.**

All tokens live at the top of [`public/css/app.css`](../public/css/app.css) (`:root`).
Use the tokens; don't hard-code new colours, radii or shadows.

> Keep this file up to date when you change a rule. If the code and this file
> disagree, fix one of them in the same change.

---

## 1. Principles

1. **Colour carries meaning.** Green / amber / red are for status only. Plain
   numbers and icons are neutral.
2. **No decoration for its own sake.** No glows, gradients, textures, giant pills
   or hover "lift" effects.
3. **Prioritise.** Not everything gets equal visual weight — group, rank, and
   move exceptions to where they will be acted on.
4. **Say what a number means.** Every data card states what it shows and over
   what period.
5. **Never show an ambiguous empty state.** Empty data gets an explicit message,
   not blank axes or an invisible series.

---

## 2. Tokens

### Colour

| Role | Token | Value | Use |
|---|---|---|---|
| Brand | `--teal-600` | `#0a8f8c` | Primary buttons, chart primary series |
| Brand (on dark) | `--teal-400` | `#2dbdb6` | Active nav indicator / icon on the navy sidebar |
| Brand (indicator, light) | `--teal-500` | `#05a2a0` | Tab underline, Settings-menu indicator |
| Sidebar | — | `#082238` | One solid surface, nothing layered on it |
| Text | `--ink` / `--ink-2` / `--muted` | `#0f263d` / `#33475b` / `#64748b` | Headings / body / secondary |
| Page background | `--bg` | `#f3f7f9` | |
| Surfaces | `--surface` / `--surface-2` | `#ffffff` / `#f6f9fb` | Cards / subtle fills, hover |
| Borders | `--border` / `--border-2` | `#e3ebf0` / `#edf2f5` | |
| Positive | `--green-600` / `--green-50` | `#1a9160` / `#e7f7ef` | Healthy status |
| Warning | `--amber-600` / `--amber-50` | `#c27400` / `#fff4e0` | Needs attention |
| Critical | `--red-600` / `--red-50` | `#d14343` / `#fdeeee` | Failures, suspended |
| Neutral icon | `.tone-neutral` | bg `#eef4f8`, icon `--navy-800` | Every non-status KPI icon |

`blue`, `violet` and `teal` icon tones still exist in the CSS but **must not be
used to decorate KPIs** — see §6.

### Shape & depth

| Token | Value | Use |
|---|---|---|
| `--radius-lg` | `8px` | Cards, modals |
| `--radius` | `6px` | Buttons, inputs, icon boxes |
| `--radius-sm` | `4px` | Badges, chips, tabs, small items |
| `--shadow` | `0 1px 2px rgba(15,38,61,.05)` | Cards: a crisp border + hairline shadow |
| `--shadow-hover` | `0 1px 3px rgba(15,38,61,.08)` | Hover — never a lift/translate |

**Pills are not allowed** for labels. Keep `50%` / `999px` only where roundness
means something: avatars, status dots, radio buttons, the toggle switch, the
notification counter and the password-strength bar.

### Typography

- Font: **Plus Jakarta Sans** (`--font`); monospace for IDs (`.mono`).
- Card title: `16.5px / 700`, `--ink`.
- Card subtitle: `13px / 500`, `--muted`.
- Section / group labels (sidebar sections, KPI group titles): `11–12px / 600`,
  `uppercase`, `letter-spacing: 0.04em`, muted.

---

## 3. Navigation

### One rule for every navigation element

| State | Look |
|---|---|
| Default | Text + icon, no background |
| Hover | Subtle background only |
| Active | **3px teal indicator** + slightly lighter background + strong text + teal icon |

No glow, no gradient, no pill.

- **Sidebar (dark):** active = `inset 3px 0 0 var(--teal-400)`, background
  `rgba(255,255,255,.07)`, white text, teal icon. Radius `0 4px 4px 0`.
- **Settings side menu (light card):** same, on `--surface-2` with `--teal-500`;
  on phones the indicator moves to the bottom.
- **Tabs (horizontal):** active = `inset 0 -3px 0 var(--teal-500)` underline,
  `--ink` text, on a 1px baseline (`.tabs`).

### Sidebar

| Property | Value |
|---|---|
| Width (expanded) | `264px` default; user can drag 220–300px |
| Width (collapsed) | `72px` icon rail |
| Background | solid `#082238` |
| Row height | `48px` (`padding: 14px 16px; line-height: 20px`) |
| Icon | Font Awesome, **20px tall in a 25px fixed-width box** |
| Icon–label gap | `14px` |
| Sub-items | indented `14px` under their section label |
| Section labels | quiet, always visible, not clickable (§2 typography); `rgba(198,212,225,.6)` ≈ `#7a8d9d`, 4.72:1 contrast |
| Footer (Admin: Admin Team, Settings, Audit Logs · Doctor: Help & Support · Receptionist: Settings) | anchored to the bottom, separated by a hairline; hidden when the user can see none of its items. No Logout in any sidebar — logout lives only in the top-bar profile menu. No tagline in the Super Admin or Doctor sidebars |

**Super Admin sections:** Overview · Hospital Network · Operations · Finance ·
Communications. Every item belongs to a section.

**Collapsed (desktop):** toggled by the top-bar hamburger only (no second toggle in
the sidebar).
- Logo → the Gmedic medical-cross mark (`gmedic-mark.png`), 40px.
- Icons centred (centre at 36px). Section labels hidden.
- Active item: teal tile `rgba(45,189,182,.14)`, teal icon, 6px radius — **no**
  3px bar (no room).
- **Tooltips are required:** label to the right of the rail after **400ms**
  (instant on keyboard focus), hidden on leave / click / scroll / Esc.
- Labels stay in the DOM for screen readers (visually hidden, never `display:none`).
- State is remembered and restored before first paint.

**Mobile/tablet (<1024px):** off-canvas overlay drawer with full labels and section
headings, regardless of the desktop collapsed setting.

### Top bar

- **Doctor portal:** today's availability is a live switch (`.switch--topbar`,
  "Available" / "Unavailable") before the notification bell, not a read-only badge.
  It's the only switch for it; the dashboard doesn't repeat it. The label keeps a
  fixed width so the bar doesn't shift on toggle, and is visually hidden below 768px
  (switch only). The full Available/Unavailable controls stay on the Availability page;
  both stay in sync.

---

## 4. Icons

- **Font Awesome Free, solid style only.** Never mix in Regular or other families.
- Source of truth: [`lib/iconMap.js`](../lib/iconMap.js) (portal name → FA icon).
  React renders it via `components/Icon.js`; plain-JS pages and EJS views use the
  generated sprite `public/images/fa-icons.svg`.
- To add an icon: add it to `lib/iconMap.js`, then `npm run icons:build`.
- Default size 20px; in navigation always the fixed-width 25×20 box.

---

## 5. Cards

### Header rule

Every **data card** (chart, list, summary) has:

```
Title
What it shows · period
```

Examples: `Last 14 days · bookings by status`, `Today · queue status`,
`Latest 6 bookings · all hospitals`. Period first when it is a time window.
The subtitle must match what the query actually returns.

Form and detail cards (Settings, Profile, Hospital Information, Quick Actions)
may use a title only.

Markup:

```html
<div class="card__head">
  <div>
    <h2 class="card__title">Booking Overview</h2>
    <p class="card__subtitle">Last 14 days · bookings by status</p>
  </div>
  <!-- optional right side: link, totals (.chart-totals), badge -->
</div>
```

### Summary above a table

On registry/list pages (Hospitals, Payments, QR, …) the **table is the primary
working area**; status counts above it are supporting information. Use
`.summary-strip.summary-strip--compact`: 32px icon box, 18px/700 value, 12px
gaps, no shadow. Colour an icon only when its status has a count above 0;
otherwise `.tone-neutral`. (KPI pages such as Analytics keep the full-size cards.)

### Empty states

Never render empty axes, an empty grid, an invisible series or a bare empty
table. Tables and lists distinguish two cases, each with a next step:

| Case | Icon | Title | Action |
|---|---|---|---|
| Nothing exists yet | the entity's icon | `No hospitals yet` + what will appear here | Primary create button (`Add Hospital`) |
| Search/filters match nothing | `search` | `No hospitals match your search` + echo the filters (`Nothing matches "Apollo" · status Suspended`) | `Clear filters` |

Decide "nothing exists" from an unfiltered total (e.g. the status summary), not
from the filtered result. Only suggest checking spelling when there is search text.

Charts use `.chart-empty` (same footprint as the chart):

```
No hospital growth data yet
Growth trends will appear as hospitals are added to the Gmedic platform.
```

---

## 6. KPIs

- **Prioritise.** The Super Admin Dashboard shows 9 metrics, not 12:
  - **Platform health:** Total Hospitals · Active Hospitals · Payment Success
  - **Today's activity:** Appointments · Revenue · Total Patients
  - **Exceptions** go in the attention banner (§7), not KPI cards.
- Group KPIs under a small uppercase group title (`.kpi-group__title`), three per
  row (`.stats--3`).
- **Icon colour rule:** neutral (`.tone-neutral`) for plain counts; colour only
  for status:
  - Active hospitals → green (positive).
  - Payment success → by value via `lib/admin/kpiTone.js`: **≥95% green,
    85–95% amber, <85% red**.
  - Pending/waiting items → amber; failures/suspended → red.
- Label wording is consistent: `Today's bookings`, `Today's revenue`,
  `Payment success rate`, `Today's QR scans`.
- **Payments page** keeps exactly four cards, labelled so money vs. count is
  unambiguous: `Collected amount` · `Failed amount` · `Successful payments` ·
  `Failed payments`. Don't pad it with refund amount, average transaction,
  conversion/success %, or today's revenue — broader performance analysis
  belongs to Analytics.
- **Every money/count KPI states its scope** in `.mini-stat__hint` under the
  value, so the number has one meaning. On Payments the cards follow the table
  filters: `All time` with no dates, otherwise `7 Oct 2026 – 8 Oct 2026` /
  `Since …` / `Up to …`, plus `· filtered` when search or status is set.
  `Collected amount` also says `gross, before refunds` (refunds live in their
  own table and are not netted out).
- **Payments transaction filters** stay as: Search (patient, doctor or
  transaction ID) · Status · From · To · Reset. Don't add a Hospital filter just
  because the table has a Hospital column; revisit only if multi-hospital use
  becomes common.
- **Webhook Inbox source notice** is driven by `PAYMENT_GATEWAY`, never
  hard-coded. No gateway → info banner saying the inbox holds development
  sample events. Gateway connected but `is_sample` rows remain → info banner
  naming the gateway and asking for the setup test events to be removed.
  Gateway connected, no sample rows → no banner, just a muted
  `Receiving events from <gateway>.` line. "Sample" wording must never appear
  once a live gateway is connected and the sample rows are gone.
- **Webhook columns:** keep *Status* (gateway event: RECEIVED/PROCESSED/FAILED)
  and *Sync* (our side: NOT_REQUIRED/PENDING/SYNCED/FAILED) as separate
  columns — they are different dimensions and both matter when debugging.
- The row action is **`Retry sync`** (not "Resync"/"Retry"): it retries our
  sync step, it does not reprocess the gateway event. Shown only when Sync is
  PENDING or FAILED; the backend ignores a retry on an already-synced event.
- **Idempotency (backend):** a webhook receiver must store the gateway's event
  id in `payment_webhooks.event_id` (unique per gateway, migration 013) and
  skip processing when the insert conflicts. Payments are also unique on
  `transaction_id` and one PAID row per appointment.

---

## 7. Attention banner

"Do I need to do anything?" is answered **directly under the KPIs**, never at the
bottom of the page (`AttentionBanner` in `app/admin/dashboard/page.js`).

- **All clear:** green check, `All clear` / `Nothing requires your attention right
  now.` (Don't claim "All systems operational" — we don't monitor systems.)
- **Issues:** `N items need attention` + one linked line per non-empty category
  (e.g. `2 hospitals pending KYC`). Amber, or red if anything is critical
  (suspended hospitals, failed payments).
- Counts must be true totals, not lengths of capped lists.

---

## 8. Charts

Shared config in [`components/admin/DashboardCharts.js`](../components/admin/DashboardCharts.js).

- **The line/bar is the primary visual.** Booked line `2.5px`, secondary lines
  `1.75px`; no point dots (they appear on hover); gentle curves (`tension .25`).
- **Area fills are a faint supporting layer:** `rgba(10,143,140,.04)`.
- **Grid is barely there:** horizontal lines only, `rgba(15,38,61,.06)`, no axis
  borders, muted tick labels.
- Hover shows all series for that day (`interaction: index`).
- **No invisible series:** a series that is zero across the whole range is
  dropped from the chart and its legend; if only one series remains, hide the
  legend. Series with real data always stay in the legend.
- **Overlapping series must stay distinguishable:** give each a different line
  style (Booked solid teal, Completed dashed navy, Cancelled solid coral), draw
  the dashed one on top (`order: -1`, legend/tooltip kept in reading order via
  `datasetIndex` sorting), and use different hover markers (circle vs square).
- **State zero outright:** show period totals as figures in the header
  (`.chart-totals`, e.g. `Gross ₹98,200 · Refunded ₹0`) instead of relying on a
  bar the reader can't see.
- Time series always cover the full window (zero-filled), with readable labels
  (`Jul`, not `2026-07`) and whole-number ticks for counts.
- **Booking Sources** (Super Admin Dashboard only): a full-width card under Booking and Revenue
  Overview, grouped bars per day for the last 14 days (zero-filled, cancelled excluded), `Gmedic App`
  teal vs `Walk-in` navy. `Phone` bookings get a third slate series only when there are any. Period
  totals sit in `.chart-totals` (`Gmedic App 146 · Walk-in 0`), so a zero is stated, never an
  invisible bar. No bookings at all shows `.chart-empty`. Data: `sourceTrend` from
  `lib/admin/getDashboardData.js`, from `appointments.source`.
- Funnels are HTML (`.funnel`), not bar charts: each stage is a subset of the
  previous (same unit at every stage), with `↓ N%` step conversion and an overall
  rate in the header.
- Chart cards sit in an even two-column grid (`.dash-grid--charts`); one column on
  phones. Avoid lone half-width cards next to empty space.

---

## 9. Tables

- **Numeric columns are right-aligned — header included.** Give the `<th>` the
  same `num` class as its cells (`<th className="num">`), so the header lines up
  with the figures. Amounts use `₹` with Indian grouping (`toLocaleString('en-IN')`).
- Name the value precisely: `Consultation Fee`, not `Fee`; keep the column header,
  the cell `data-label` (used as the label on phones) and any edit-form label the same.
- **Dates read as `14 Oct 2026`** everywhere (date + time: `7 Oct 2026, 02:30 PM`;
  chart axes: `14 Oct`). Use `lib/format.js` in React (`formatDate`,
  `formatDateTime`, `formatShortDate`, `formatTime`) and `G.date` / `G.time` in
  plain-JS pages — they produce identical output. Never render raw ISO
  (`2026-10-14`) or call `toLocaleString()` without a locale (ambiguous 7/10 vs 10/7).
  Dates are not monospace; use `nowrap`.
- **Patient phone numbers are masked in lists** (`95••••17`, `maskMobile` in
  `lib/format.js`) and shown in full only in an authorised detail view
  (`patients.view`). Never hide the column — mask it. Staff/hospital business
  phones are not patient PII.
- **Compact history lists** (payments, refunds) carry a second identifying
  dimension — at least the date — not just an amount and status. Row-level
  references (e.g. the appointment ID) go as secondary text, not a new column.
- Empty tables follow §5 (nothing exists yet vs no match).
- **Identifiers are human-referenceable and consistent.** QR codes use
  `QR-<hospital>-<NN>` (e.g. `QR-HSP001-02`), generated only via
  `services/qrIds.js`.

## 10. Buttons & controls

- Primary button: solid `--teal-600`, hover `--teal-700`, `0 1px 2px` shadow. No
  gradient, no glow.
- Badges, chips, tab counts: `4px` radius rectangles, not pills.
- **Confirmation buttons name the action, never "Confirm":** `Cancel | Reject Doctor`,
  `Cancel | Suspend Hospital`, `Cancel | Approve Refund`. Destructive actions use
  `btn--danger` and require a reason (free text, with a placeholder such as
  "Enter the reason for suspending this hospital…").
- Selection controls (filter chips, pagination, role picker) are **not**
  navigation and may look different from §3.
- **Slot picker** (`.slot-grid` / `.slot`, front-desk booking): one 4px-radius
  tile per slot with the time and the seats as text (`3 of 5 left`, `Full`,
  `Closed`). A slot with no seat left is greyed out (`--surface-2`, muted text)
  and `disabled`. Never signal full by colour alone. The selected slot uses the
  teal border + `--teal-50` fill. Seat counts come from the server and stay
  **live** while the picker is open: the grid listens to
  `GET /api/doctors/:id/slots/stream` (Server-Sent Events), so a seat taken at
  another counter or in the patient app greys out within about a second. If the
  stream can't be opened it falls back to polling `GET /api/doctors/:id/slots`
  every 20 s. The legend says which one is running, in words (`Live`,
  `Reconnecting…`, `Updates every 20 s`).
- **Emergency walk-in tiles.** A full slot that can still take an emergency
  walk-in (today only, the doctor's per-block emergency seats, 0–3) stays
  pickable. It gets a dashed `--red-500` border, a `--red-50` fill and the
  words `Full · 2 emergency left`. Picking it turns the border solid and shows a
  red `alert--error` note under the grid saying the slot is full, how many
  emergency seats are left, and that the patient goes to the front of the
  doctor's queue. The submit button then reads `Book Emergency Walk-in` and the
  "How did they book?" select is locked to walk-in (an emergency is never a
  phone booking). If the last regular seat goes while a regular booking is being
  made, the pick is cleared with a toast. The slot is never silently turned
  into an emergency.
- **Emergency badge.** Wherever a token or appointment is listed (appointments
  table and detail, Tokens page, doctor's queue), an emergency shows
  `badge--emergency` reading `Emergency` next to its `E01` code. Never colour
  alone.
- **Status pickers and row actions only offer moves the server accepts.** Build
  the options from the record's allowed transitions (e.g. a token's
  `nextStatuses`, from `TRANSITIONS` in `models/tokenModel.js`), never from a
  fixed list, so no choice is guaranteed to fail. Tokens follow Call →
  Send in → Complete; cancelling keeps its own confirm-twice button.
- **Cancelling is never a dropdown status.** An action with side effects
  (refund, queue token, notices) gets its own red ghost button that opens a
  `modal__panel--sm` dialog: what will happen (e.g. the refund), a required
  reason, and `Back | Cancel Appointment` (`btn--danger`).
- **A blank field never removes a verified identifier.** In the hospital KYC
  form a blank GSTIN / registration number keeps the stored one (with a hint
  saying so); removing it is a separate `Remove <field>` ghost button in red
  that needs a second click. Changing or removing either on Verified KYC shows
  an amber `field__hint is-warning` first and sends KYC back to Under review.
- **Completed and cancelled are final** for both an appointment and its queue
  token, which always move together (migration `015_token_appointment_sync.sql`).
  Their detail views hide the status controls instead of offering a dead end.
- **Actions that lock someone out confirm first.** Resetting a password and
  deactivating an account (admin Receptionists, Admin team) open a
  `modal__panel--sm` dialog that says what happens to their sessions, with
  `Cancel | Reset Password` (primary) or `Cancel | Deactivate Account`
  (`btn--danger`). Activating again stays one click.
- **One-time credentials look the same everywhere.** New and reset accounts
  both show `components/admin/CredentialsModal`: "Sign in with" is the email
  address (never a generated username) plus a random 12-character temporary
  password the person must change at first sign-in.
- **Cancel dialogs show the money.** The admin appointment cancel offers the
  refund as `.radio-row` choices that each carry the amount ("₹400: everything
  they paid", "₹250: the hospital's policy"), a required reason, and
  `Back | Cancel Appointment` (`btn--danger`). The appointment drawer lists
  refunds and the status history (`.drawer__timeline`).
- **Irreversible actions need the record's ID typed.** Erasing a patient's
  personal data (admin Patients) opens a `modal__panel--sm` dialog that says what
  is removed and what hospitals keep, lists side effects (upcoming appointments
  cancelled), and keeps `Erase Personal Data` (`btn--danger`) disabled until the
  patient ID is typed. Blocking asks for a reason; unblocking asks to confirm.
- **Holding or voiding money records needs a reason and says what it does.** On
  Settlements, `Hold` (primary) and `Void` (`btn--danger`) open a `modal__panel--sm`
  dialog with a required reason; Void states that the record is kept, what it
  releases and that a paid one can't be voided. Lists that don't create records
  say when something is waiting ("1 weekly statement is waiting to be generated")
  with an explicit button, instead of writing on page load.
- **Profile photo row** (admin doctor edit): a 64px rounded-square image, or the
  initials avatar when there is none, then `Upload photo` / `Change photo` and a
  red ghost `Remove`, with the hint "PNG, JPEG or WebP, up to 3 MB". Upload and
  remove save immediately (their own toast); the rest of the form saves with Save.
- **A doctor's photo replaces their initials everywhere.** Any doctor avatar (doctor
  top bar and dashboard, profile, reception doctors list / detail / availability
  dialog) shows the uploaded photo when there is one (`components/DoctorAvatar` in
  React, `G.avatar(name, size, photoUrl)` in the vanilla pages), cropped with
  `object-fit: cover` at the same avatar size; initials otherwise.
- **Hospital logo row** (admin hospital detail): a 56px contained image or "No
  logo", then `Upload logo` / `Replace` and `Remove`, hint "PNG or JPEG, up to
  3 MB". Saves immediately, like the profile photo row.
- **Status the front desk can't change is still shown, with why.** Receptionist
  pages render the hospital's real status (`HospitalStatusBadge`); when it isn't
  Active, an `.alert--warning` under the page head says what is blocked and who to
  contact (`HospitalStatusNotice`). Never a hard-coded "Active" badge. Things owned
  by Gmedic (name, ID, logo, About) carry a lock icon and a note saying so.
- **Nothing to show is said, never faked.** With no active QR code, the QR card
  and dashboard panel are replaced by an `.alert--warning` ("No active QR code …
  contact Gmedic support") instead of a code built from an empty key.
- **Alerts:** `.alert--error` (failed), `.alert--success`, `.alert--info` (teal,
  neutral facts) and `.alert--warning` (amber: something is blocked or missing and
  needs someone outside this screen).
- **Front desk invites its doctors.** The reception doctor page has a "Doctor
  portal login" card: `Invite to Portal` (email + optional mobile) or, once
  invited, email, status badge (`Invited · not signed in yet` / `Active` /
  `Locked`), last sign-in and `Reset password` (confirm first). Credentials show
  once in the same layout as `CredentialsModal`.
- **Closing your own ticket confirms in place.** In the support drawer the reply
  box has a ghost `Close ticket (problem solved or raised by mistake)`; it swaps the
  footer for a short confirm (what closing means, optional reason, `Back | Close
  Ticket` in `btn--danger`). Shared lists (the hospital's front desk) say so in the
  page subtitle and offer a `Raised by: Anyone at the desk / Me` filter.
- **Finishing a consultation confirms, then offers undo.** "Mark Completed" swaps the
  drawer footer for a one-line confirm (`Back | Mark Completed`); it is disabled with a
  hint ("Can be completed from <date>") before the appointment day. After completing,
  the queue shows an `.alert--success` "T001 completed … Undo" and the drawer a
  `Reopen` footer for 10 minutes (server-enforced).
- **Read-only days say so.** The doctor's queue for any day but today shows an
  `.alert--info` "Past and future queues are read-only" with `Back to today`, and no
  action buttons. One action per row state: `Call` for waiting, `Recall` for skipped;
  `Skip` only while a patient is called (never during a consultation).
- **Clinical notes are versioned, never overwritten.** Diagnosis / Notes /
  Prescription; Save adds a version (hint says so), the drawer shows the latest with
  "Version N · author · date" and a toggle for earlier versions.
- **Cancel dialogs preview the refund before asking for the reason** (doctor and
  front desk alike); if it can't be cancelled, the dialog shows why and the action
  stays disabled.
- **Changes that hit booked days ask first, with the list.** Adding or extending
  leave over booked days returns the bookings; the dialog shows them (ID, date,
  time, patient, paid) with two `.radio-row` choices, "Keep them" (front desk moves
  them) or "Cancel them now" (refunded and told), and the submit button names the
  choice (`Save and Keep Bookings` / `Save and Cancel N` in `btn--danger`).
  Withdrawing leave confirms; leave that has started can only change its end date.
- **Announcements can be closed.** The amber announcement banner at the top of the Doctor and
  Receptionist portals (`components/shared/DismissibleNotice`) has a close (x) button with the
  label "Dismiss announcement: <title>". Closing is remembered on this device only, per
  announcement (`localStorage` key `gmedic.dismissedAnnouncements`), so a new announcement still
  shows and clearing browser data brings old ones back. Banners (teal, scheduled) are not
  dismissible.
- **Doctor Schedule is a week grid first.** Page head: ghost `Add Leave` + primary
  `Add Working Hours`. Under it a compact summary strip (Working days · Weekly hours ·
  Appointment slots · Next leave / On leave now; only the leave tile is amber, and only
  while on leave). The "Weekly Hours" card has `Week` / `List` tabs (phones open on
  List) and a legend. **Week** = Monday→Sunday of the current week on a time axis
  (`.wk`): working hours are teal blocks (`.wk__block`, 3px teal left edge) with time
  and `15 min · 1 per slot`; today's header is a teal date tile; leave days are
  hatched grey and say `Leave` in the header (never colour alone); empty days say
  `Day off`. The axis fits the hours plus an hour either side (min 8 h). Click a block
  to edit, click an empty spot to add hours pre-filled with that day and time. **List** =
  one row per day with Edit / Remove actions. With no hours at all the card shows the
  empty state with `Add Working Hours`.
- **Schedule blocks edit in place.** Edit opens the working-hours dialog; its footer
  carries a red ghost `Remove Hours` on the left (the list view also has a Remove
  action). Remove confirms with how many upcoming bookings sit in those hours. Blocks
  ending today show `Ends today` and can't be opened; new versions are dashed and show
  `Starts <date>`. Leave dates read `14 Oct 2026` (§9), never raw ISO.
- **Tokens come with the booking.** There is no "Generate Token" step: the Tokens page explains that tokens are
  issued automatically and numbered in slot order, and its only action is a ghost `Re-issue Token` (for a token
  cancelled by mistake). The dashboard quick action is "Today's Tokens".
- **Two kinds of money, always labelled.** A Gmedic app booking pays only the **booking token** online; the
  **consultation fee** is paid at the hospital. Screens never call the token "paid" for the appointment: the reception
  appointment dialog shows "Consultation fee" status (paid only once collected at the desk) and a separate "Booking
  token ₹5 paid in the Gmedic app (non-refundable, not part of the fee)" row; admin Payments has a Type column/filter
  (Booking token / Consultation fee). Cancel dialogs say the booking token is not refunded instead of offering refund
  choices; there is no "Issue refund" action. The admin hospital page shows a read-only "Booking payment" card linking to
  Platform Settings, where the token amount is set once for every hospital.
- **Notification switches save to the account.** Doctor Settings > Preferences has a
  "Notifications" card: one `.switch` per kind of notice (label + one-line help), each
  saving on its own with a toast, and the notices that can't be muted listed below with
  a lock "Always on" badge. There is no separate Notifications tab.
- **Device-only preferences say so.** Doctor Settings > Preferences notes "Saved on
  this device only" and every preference is used somewhere; switches that wouldn't do
  anything are removed rather than shown.
- **Token slips.** The token detail dialog has `Print slip` (live tokens only),
  and opens straight after Generate Token. The slip prints from its own window:
  hospital, large token code, patient, doctor, date, time and appointment ID.

**Patients from another hospital are shown masked.** A patient record is shared by
every hospital, so a front desk only sees details of patients who already have an
appointment or link with its own hospital. For anyone else the number lookup shows a
masked name (`A****** M*****`) and says they are "registered on Gmedic"; it does not
prefill the form and shows no id, birth date or relatives. When the typed name differs
from the one on a number, the "Same person / Different person" choice uses the masked
name too. Patient details that other hospitals also use are not editable from a
front-desk appointment dialog (the dialog says so instead of showing the fields as editable).

---

## 11. Accessibility

- Small text must meet **WCAG AA 4.5:1** (check muted colours on navy).
- Collapsed/hidden labels stay available to screen readers.
- Toggles report state (`aria-expanded` on the sidebar hamburger).
- Tooltips appear on keyboard focus too.
- Respect `prefers-reduced-motion` for animations and transitions.
