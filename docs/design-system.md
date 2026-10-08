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
| Footer (Settings, Audit Logs, Logout) | anchored to the bottom, separated by a hairline |

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

---

## 11. Accessibility

- Small text must meet **WCAG AA 4.5:1** (check muted colours on navy).
- Collapsed/hidden labels stay available to screen readers.
- Toggles report state (`aria-expanded` on the sidebar hamburger).
- Tooltips appear on keyboard focus too.
- Respect `prefers-reduced-motion` for animations and transitions.
