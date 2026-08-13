# Confirmed Revenue Line Graph Audit

Date: 2026-08-13

## Executive summary

The line graph is internally consistent with its present rules, but those rules do not represent one clear business concept. It currently mixes sales recognition, fulfillment, and cash collection:

- It includes only orders whose current analytics status is `confirmed`, `fulfilled`, the legacy typo `fullfilled`, or `paid`.
- It groups each included order on the latest of `fulfilledAt`, `paidAt`, `orderDate`, and `createdAt`.
- Archived orders are included by default. They contribute revenue only when `previousStatus` exists and is one of the four revenue statuses.
- Draft, pending, cancelled, and returned-status orders contribute no line revenue.
- Returns are reported separately and are not subtracted from this line.
- `totalAmount` is added without converting it to a number. A string amount can concatenate instead of add.
- Only the current `orders` collection is loaded. The legacy `orders_archive` collection is not part of the dashboard query.

The highest-confidence defects are unsafe numeric addition and ambiguous date selection. The highest-risk data compatibility gaps are archived records without `previousStatus`, any historical records stored only in `orders_archive`, and return states that should reduce net revenue.

## Current calculation, end to end

1. `orderService.getAllOrders()` reads every document in the `orders` collection, ordered by `createdAt`. It does not query `orders_archive`.
2. The dashboard defaults `showArchivedAnalytics` to `true`, so active and archived records are initially passed to analytics.
3. If archived data is disabled, records with `archived === true` or `status === "archived"` are removed.
4. The selected period is converted into a local-time start and end. Presets include today, 7, 30, 90, 180, and 365 days; `all` starts at the earliest timestamp found.
5. Each record is filtered into the period using:

   `max(fulfilledAt, paidAt, orderDate, createdAt)`, then `updatedAt`, `localUpdatedAt`, or `archivedAt` as fallbacks.

6. The chart creates a bucket for each day, week, or month in the selected period.
7. Each order is assigned to a bucket using only `max(fulfilledAt, paidAt, orderDate, createdAt)`. If all four are missing, it is assigned to the current date even though the period filter may have used an update or archive date.
8. The chart obtains an analytics status. An archived record uses `previousStatus` when present; otherwise its analytics status remains `archived`.
9. The full `totalAmount` is added to `confirmedRevenue` only for `confirmed`, `fulfilled`, `fullfilled`, or `paid`.
10. Chart.js draws `confirmedRevenue`; it does not perform the business calculation.

## State behavior

| Stored state | Included as an order in the period KPI? | Included in the revenue line? | Notes |
|---|---:|---:|---|
| `draft` | Yes | No | Drafts lower AOV because order count includes them but revenue does not. |
| `pending` | Yes | No | Same denominator issue as drafts. |
| `confirmed` | Yes | Yes | Full `totalAmount`, classified as outstanding. |
| `fulfilled` / `fullfilled` | Yes | Yes | Full `totalAmount`, classified as outstanding. |
| `paid` | Yes | Yes | Full `totalAmount`, usually moved to `paidAt`. |
| `cancelled` | Yes | No | Counted in Orders and AOV denominator. |
| Active order with partial return data | Yes | Usually yes | Original/full `totalAmount` remains on the line; return amount is not subtracted. |
| Active order with full return data | Yes | Usually yes | If its stored order status remains paid/fulfilled, full revenue still remains on the line. |
| `returned`, `partially_returned`, `fully_returned` | Yes | No | Excluded entirely from line revenue rather than shown net of returns. |
| `archived` with revenue-bearing `previousStatus` | Yes by default | Yes | Archive is treated as a visibility state, which is desirable when metadata is complete. |
| `archived` without `previousStatus` | Yes by default | No | Included in order count but loses its revenue classification. |

## Confirmed and likely mismatch causes

### 1. Numeric strings can produce severely incorrect totals

`totalAmount` is added directly. JavaScript changes from numeric addition to string concatenation when an amount is stored as a string. A reproduced example with amounts `100`, `"200"`, and an archived paid amount of `500` returned KPI revenue `"100200500"` and chart values `"100200"` plus `500`, rather than `800` total.

New orders appear to calculate numeric totals, but imported, legacy, offline, or manually edited Firestore records can still carry string values. Analytics should normalize every amount with the existing `safeNumber` helper before arithmetic.

### 2. The graph changes historical sales dates as an order progresses

The timestamp helper returns the greatest timestamp, not a fixed business date. An order dated August 10, fulfilled August 11, and paid August 12 appears on August 12. Before payment it may have appeared on August 11. This means historical points move over time.

That behavior is appropriate for a cash-collected chart only if the value is included only when paid. It is not appropriate for a confirmed-sales chart.

### 3. Archived records are only safe when `previousStatus` is complete

The current archive action preserves `previousStatus`, and focused tests cover that modern path. Legacy records, failed/offline transitions, direct Firestore edits, or already-archived records can lack it. Such records remain visible as archived but contribute no revenue.

There is also a permitted legacy `orders_archive` collection in Firestore rules, but the dashboard only reads `orders`. If production contains documents exclusively in `orders_archive`, they are completely absent, even when “Showing active + archived data” is enabled.

### 4. Returns do not produce a defined net-revenue result

Return analytics calculates returned amounts separately. The line graph neither subtracts those amounts nor consistently excludes the parent sale. The outcome depends on the order's stored status:

- If the order stays `paid` or `fulfilled`, the full original amount remains revenue.
- If its status becomes `returned`, all revenue disappears.
- A partial return can therefore be treated as either full revenue or zero revenue, rather than original amount minus returned amount.

### 5. KPI labels and denominators invite a different user interpretation

The “Orders” KPI counts all date-matched records, including draft, pending, cancelled, returned, and archived-without-history records. “Confirmed Revenue” counts only four statuses. AOV divides confirmed revenue by all orders. A user reconciling the line to order count or expecting average confirmed order value will see a mismatch even when the chart code operates as written.

### 6. The period filter and chart bucket use different fallback rules

An old record with no order/created/fulfilled/paid timestamp can pass the period filter through `updatedAt` or `archivedAt`, but bucket assignment falls back to the current date. This can create unexpected current-period spikes after archive or maintenance activity.

## Recommended business contract

The safest model is to make archive a visibility/storage state, never an accounting state, and to separate three concepts that are currently mixed:

1. **Confirmed sales trend** (the existing line): recognize the net order value on `orderDate`, falling back to `createdAt`. Include confirmed, fulfilled, and paid lifecycle stages. Exclude draft, pending, and cancelled. Subtract recorded returns. Archived orders follow their pre-archive lifecycle state and remain included by default.
2. **Cash collected trend** (future separate line or toggle): include only paid value and group it on `paidAt`.
3. **Outstanding balance** (snapshot KPI): include confirmed/fulfilled unpaid value as of now; do not treat it as a historical flow line unless status history is available.

Under this contract, an order never jumps from one historical date to another merely because it was fulfilled, paid, or archived.

## Required state normalization

Create one canonical analytics projection per order before any KPI or chart calculation. It should expose at least:

- `recordId`
- `isArchived`
- `lifecycleStatus`
- `analyticsDate`
- `grossAmount`
- `returnedAmount`
- `netAmount`
- `revenueEligible`
- `exclusionReason`
- `dataWarnings`

Canonical status recovery should use, in order:

1. `previousStatus` for archived orders.
2. The latest non-archived entry in `statusHistory`, if available.
3. A linked order/invoice status or audit history when reliably matched.
4. `unknown` with a visible data warning. Do not silently guess paid or fulfilled.

Aliases should be normalized in one place (`fullfilled` to `fulfilled`, `canceled` to `cancelled`, and any supported legacy states). Numeric fields must be converted before every calculation.

## Reconciliation and user trust

Add an “Explain this number” audit table or downloadable CSV for the selected period. Each row should show order number, customer, stored status, canonical status, archived flag, chosen date, gross amount, returns, net included amount, and inclusion/exclusion reason. The table total must equal the line-chart total and the Confirmed Revenue KPI.

Also show a compact summary near the chart, for example:

`42 revenue orders included · 7 drafts excluded · 3 cancelled excluded · 5 archived included · 2 records need review`

This makes disagreement diagnosable without inspecting Firestore.

## Lowest-risk implementation sequence

1. Add regression tests for numeric strings, every order status, archives with and without `previousStatus`, sale-date stability, return adjustments, missing dates, and legacy archive-source deduplication.
2. Introduce a pure canonical analytics projection helper. Route only the revenue KPI and revenue line through it first.
3. Normalize all amounts and use one analytics date consistently for both period filtering and bucketing.
4. Add warning counts and an explainable reconciliation export.
5. Audit production data by status, archive location, missing `previousStatus`, amount type, and missing dates.
6. If `orders_archive` contains unique historical orders, union it with `orders`, deduplicate by stable ID, and document the compatibility path. Avoid a destructive migration.
7. After the revenue result is accepted, align AOV, product charts, unit-demand charts, and financial-intelligence calculations to the same canonical projection where appropriate.

## ICF architecture assessment

The canonical projection and chart aggregation should remain pure calculation helpers; wrapping every calculation in ICF would add ceremony without improving authorization or state control. The existing analytics-range selection already uses a six-stage `SelectDashboardAnalyticsRangeIntent`.

Two future user/system actions are suitable ICF candidates:

- `GenerateRevenueReconciliationIntent`: Validate the period and granularity; Normalize dates and options; Add Context with authorized order sources; Authorize analytics access for the active store; Process the canonical rows and totals; Emit the table or CSV plus warning summary.
- `BackfillOrderAnalyticsMetadataIntent`: Validate an explicitly approved migration scope; Normalize target IDs; Add Context with records, history, and linked documents; Authorize superadmin/admin migration rights; Process recoverable `previousStatus` or date metadata with audit entries; Emit changed, skipped, and ambiguous counts.

The reconciliation intent is the lowest-risk ICF addition because it is read-only. A backfill should come only after reviewing real production exceptions and preparing a non-destructive migration plan.

## Tests reviewed

The focused dashboard and archive helper suites pass (11 tests). They verify current archived inclusion, preservation of `previousStatus`, range selection, full custom end dates, and day/week/month grouping consistency. They do not cover the mismatch cases described above.

Implementation status: the canonical net-revenue contract, stable order-date grouping, legacy archive union, numeric normalization, reconciliation UI, and regression coverage were implemented for release 2.44. No production data was migrated or rewritten.
