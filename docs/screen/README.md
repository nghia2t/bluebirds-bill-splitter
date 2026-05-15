# BlueBirds Bill Splitter — Stitch Screen Designs

Source: Google Stitch project `10852865368296998212`. Pulled 2026-05-14.

Each screen ships as a standalone `*.html` (Tailwind + Material-3-styled component) plus a `*.png` rendered preview. Open the HTML directly in a browser to interact with the layout; the PNG is a flat snapshot for quick reference.

## Design system at a glance

- **Visual language:** Material 3 expressive (rounded surfaces, soft shadows, generous spacing). Color tokens follow MD3 (`primary`, `on-surface`, `surface-variant`, …).
- **Typography:** `font-display-*`, `font-headline-*`, `font-body-*`, `font-label-*` scales — desktop and mobile use the same scale names.
- **Currency:** All amounts shown in USD with comma grouping (e.g. `$1,240.50`). Localize when wiring to the real app (the app already supports `$` / `₫`).
- **Demo data:** Mock user is "Alex"; mock groups are "Lake House Trip" and "Roommates". These do not match the seeded data in `server/db/migrations` — treat the HTML as a visual reference, not as fixtures.

## Screens

| File | Title | Device | Canvas (W×H) | Stitch screen ID |
|------|-------|--------|--------------|------------------|
| [`bluebirds-dashboard.html`](./bluebirds-dashboard.html) | Bluebirds Dashboard | DESKTOP | 2560 × 2048 | `ed45a909dee6440292fec1f5ca3e7869` |
| [`bluebirds-finance-tracker.html`](./bluebirds-finance-tracker.html) | Bluebirds Finance Tracker | DESKTOP | 1280 × 1024 | `14d968d55f294f1ea14a8c16f9a10e67` |
| [`bluebirds-group-details.html`](./bluebirds-group-details.html) | Bluebirds — Group Details | DESKTOP | 2560 × 2176 | `d145fb16f43a4b5eac59c66eaa9f9417` |
| [`add-new-expense.html`](./add-new-expense.html) | Add New Expense | DESKTOP | 2560 × 2048 | `0a646e0f767b4ebe88e69806655a848c` |
| [`settle-up-and-history.html`](./settle-up-and-history.html) | Settle Up & History | DESKTOP | 2560 × 2048 | `a68c13b3a776455cac7623c7063a1249` |
| [`dashboard-mobile.html`](./dashboard-mobile.html) | Dashboard Mobile | MOBILE | 780 × 2292 | `033142feb529419d96c7f773aff50d29` |
| [`group-details-mobile.html`](./group-details-mobile.html) | Group Details Mobile | MOBILE | 780 × 2500 | `9393e22d863c49ad97f8f81a1e9601ee` |
| [`add-expense-mobile.html`](./add-expense-mobile.html) | Add Expense Mobile | MOBILE | 780 × 1972 | `e32fe89c6cb24877ac63a74fb4da2ec3` |
| [`settle-up-mobile.html`](./settle-up-mobile.html) | Settle Up Mobile | MOBILE | 780 × 2224 | `7ff3059b14c94a4eaf41c53503af978b` |

> The two "dashboard" exports are byte-identical HTML; only the Stitch canvas size differs. Use `bluebirds-dashboard.html` as the canonical desktop dashboard.

---

## Per-screen detail

### 1. Bluebirds Dashboard — desktop
- **File:** `bluebirds-dashboard.html` · **Preview:** `bluebirds-dashboard.png`
- **Maps to:** `app/pages/app/index.vue` (logged-in landing).
- **Sections:** greeting (`Good Morning, Alex`), aggregate balance card (`$1,240.50`), **Settle Up** suggestion list, **Active Groups** grid, **Recent Activity** feed.
- **Notable UI:** large display number for the balance, two-column layout with a sticky-feeling activity column on the right.

### 2. Bluebirds Finance Tracker — desktop (compact)
- **File:** `bluebirds-finance-tracker.html` · *no preview rendered by Stitch*
- Same markup as #1 but framed at 1280×1024 — useful for checking the dashboard at a typical laptop viewport.

### 3. Bluebirds — Group Details — desktop
- **File:** `bluebirds-group-details.html` · **Preview:** `bluebirds-group-details.png`
- **Maps to:** `app/pages/app/teams/[teamId]/index.vue`.
- **Sections:** group hero with **Total Group Spend**, **Group Balances** member list, **Expenses** ledger.
- **Notable UI:** balance chips show per-member owe/owed colors; expense rows include payer avatar + split summary.

### 4. Add New Expense — desktop
- **File:** `add-new-expense.html` · **Preview:** `add-new-expense.png`
- **Maps to:** `app/components/BillFormDialog.vue` (new bill flow).
- **Sections:** breadcrumb (`Bluebirds`), title "Add Expense", form with amount, description, date, **Split with** participant picker.
- **Notable UI:** large amount input, segmented split-method control (equal / shares / exact).

### 5. Settle Up & History — desktop
- **File:** `settle-up-and-history.html` · **Preview:** `settle-up-and-history.png`
- **Maps to:** the deleted `app/pages/app/teams/[teamId]/settle.vue` flow (currently being reworked into `PaymentRecordDialog.vue`).
- **Sections:** **Group Settlements** header, **Suggested to Settle Up** card list with one-tap settle buttons, **History** table of past payments.

### 6. Dashboard Mobile
- **File:** `dashboard-mobile.html` · **Preview:** `dashboard-mobile.png`
- Mobile counterpart of #1. Single column, balance display at top (`$1,248.50`), then **Active Groups** stack and **Recent Activity** list. Bottom nav implied by spacing — not rendered in the HTML.

### 7. Group Details Mobile
- **File:** `group-details-mobile.html` · **Preview:** `group-details-mobile.png`
- Mobile counterpart of #3. Adds a **Settlement Progress** segment with a horizontal progress indicator. Balances and expenses collapse into stacked cards.

### 8. Add Expense Mobile
- **File:** `add-expense-mobile.html` · **Preview:** `add-expense-mobile.png`
- Mobile counterpart of #4. Includes an **Attachments** affordance (receipt photo) that the desktop variant does not surface explicitly.

### 9. Settle Up Mobile
- **File:** `settle-up-mobile.html` · **Preview:** `settle-up-mobile.png`
- Mobile counterpart of #5. Two-section layout: **Suggested** settlements at top, **History** below. No table — uses stacked rows.

---

## Re-pulling these assets

```bash
# requires the Stitch MCP server configured in Claude Code
# list:
#   mcp__stitch__list_screens projectId=10852865368296998212
# fetch one:
#   mcp__stitch__get_screen name=projects/10852865368296998212/screens/<screenId>
```

The `htmlCode.downloadUrl` and `screenshot.downloadUrl` returned by `get_screen` are signed Google URLs — they expire, so re-run the MCP call before downloading again rather than reusing the URLs in this folder.
