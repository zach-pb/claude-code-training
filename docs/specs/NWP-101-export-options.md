# SPEC · NWP-101 — Payments export: column and scope options

> Written before any code. Generated with `/spec`, then edited by a human.
> Load it as context when you build: `@docs/specs/NWP-101-export-options.md`

**Ticket:** [NWP-101](../tickets/NWP-101.md)
**Author:** Zach Piscitelli-Bergin
**Status:** draft

## Problem

Ops exports the payments table several times a day and today gets every column, unfiltered by choice, always. Card last-four ships in every file, so anything going to a merchant has to be scrubbed by hand — 3–4 hours a month, and a near-miss last quarter where an unedited file almost reached the wrong merchant. They need to choose which columns come out and whether the export covers the current filter or the whole table.

## Current state

- `src/app/payments/page.tsx:70-79` — the Export button is a plain `<a href="/api/payments/export?...">`, carrying the page's current filter query string but no column or scope choice, and no dialog.
- `src/app/api/payments/export/route.ts` — `GET` calls `parseFilters`, then `filterPayments` + `sortPayments`, then `toCsv(rows)` with the default column set, and returns the CSV with filename from `exportFilename()`. Its own doc comment says: *"the column set and the scope are fixed. Giving ops control over both is NWP-101."*
- `src/lib/csv.ts` — `EXPORT_COLUMNS` (10 columns, includes `last4`) is the canonical order. `toCsv(payments, columns = EXPORT_COLUMNS)` already accepts a column subset and renders in the order given — this is the extension point, not a new file. `exportFilename(date = new Date())` returns `payments-<YYYY-MM-DD>.csv`, UTC-stamped, and takes no scope argument yet.
- `src/lib/csv.test.ts` — pins the escaping and per-column rendering contract, and says explicitly: *"NWP-101 changes which columns ship, not how a cell is written, and these should still pass afterwards."* Extend this file per the ticket's Definition of Done; do not start a new one.
- `src/data/queries.ts` — `parseFilters(params)` is the one allowlist-validated filter parser. `filterPayments(filters)` is the one query builder; passing `{ status: "all" }` with no other fields returns every payment, which is how "all payments" scope is obtained without a second code path.
- `src/app/api/payments/route.ts` — the existing `GET /api/payments` handler this ticket's notes point to as "the query builder behind it." It calls the same `parseFilters` + `queryPayments`.
- The export route bypasses pagination already (it calls `filterPayments`/`sortPayments` directly, not `queryPayments`/`paginate`), so the "exports only the current page" bug the notes warn about **does not currently exist** in the route — it would only be introduced if a new implementation read from the paginated table rows instead of re-querying. Worth stating plainly since the ticket implies it's live; the fix is "don't regress this," not "go fix a page-1-only bug."
- `src/components/Drawer.tsx` — wraps `@radix-ui/react-dialog` (already a dependency), unused elsewhere in the app today. This is the closest existing primitive to "an options dialog" and avoids adding a new dependency.
- `src/components/Select.tsx` — already used in `src/app/payments/filter-bar.tsx` for the status/merchant pickers. Reusable for the scope choice (two options) without adding a `RadioGroup` dependency that isn't in `package.json`.
- No checkbox component or `@radix-ui/react-checkbox` dependency exists anywhere in `src/components/` or `package.json`. Column selection needs one; per `.claude/rules/components.md`, prefer what's here, but there is nothing here for this. A small local checkbox wrapping a native `<input type="checkbox">`, styled like `Input.tsx` styles its native `<input>`, is the least-new-surface option.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| Validate column names server-side against an allowlist; never interpolate into a query | Ticket notes; `.claude/rules/api-routes.md`: "Validate everything from the client against an allowlist before it reaches the store, a query, or a filename." | An arbitrary client-supplied string reaches `cell()`'s switch or a filename unchecked — the switch is exhaustive today only because `ExportColumn` is a closed type; a raw client array breaks that guarantee. |
| One query builder | Ticket notes; `CLAUDE.md`: "Payment filtering goes through the builder behind `GET /api/payments`. A second implementation is a bug, not a shortcut." | A second filter path drifts from the real one and re-introduces the page-1-only bug the notes describe. |
| Money is integer minor units, formatted once at the edge | `CLAUDE.md`; `.claude/rules/money.md` | `csv.ts`'s `cell()` already calls `formatMoney` once for the `amount` column — must stay that way; no new arithmetic on `payment.amount` anywhere in this change. |
| Storage/bucketing UTC | `CLAUDE.md` | `exportFilename` must keep stamping the UTC date; do not switch to a merchant timezone for the filename. |
| Deselecting every column disables Download rather than producing an empty file | Ticket acceptance criteria | A CSV with a header row and no columns, or a 200 response with an empty body, ships to a merchant looking like a bug rather than a client-side guard. |

## Approach

Extend the existing pieces rather than building new ones: give the Export button an `onClick` that opens a `Drawer`-based dialog instead of navigating directly; the dialog collects a column selection (checkboxes, `last4` unchecked by default) and a scope choice (`Select`, defaulting to "current filter"), shows the row count for the selected scope, and on submit navigates to `/api/payments/export?<existing filter params>&columns=...&scope=...`. Server-side, `parseFilters` gains a `columns` allowlist check against `EXPORT_COLUMNS` and a `scope` field (`"filter" | "all"`, default `"filter"`); the export route picks `filterPayments(filters)` for `scope=filter` and `filterPayments({ status: "all" })` for `scope=all`, then calls `toCsv(rows, columns)` with the validated subset, and `exportFilename` gains an optional scope-label argument for the new naming.

**Considered and rejected:** building the export client-side from the rows already on the page (`payments/page.tsx`'s `rows`). Rejected because that data is one paginated page (`PAGE_SIZE = 20`), which is exactly the page-1-only bug the ticket's notes warn about — the export must always re-query the full filtered or full unfiltered set server-side.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/data/types.ts` | Change | Add `columns?: ExportColumn[]` and `scope?: "filter" \| "all"` to `PaymentFilters`, or a sibling `ExportOptions` type — whichever keeps `parseFilters`'s return type honest. |
| `src/data/queries.ts` | Change | `parseFilters` validates `scope` against `["filter", "all"]`. Column validation can live here or in `csv.ts` next to `EXPORT_COLUMNS` — see Plan step 2. |
| `src/lib/csv.ts` | Change | Export a `parseColumns(raw: string[]): ExportColumn[]` (or equivalent) that filters client input against `EXPORT_COLUMNS`, keeping canonical order rather than client-given order. Extend `exportFilename` to accept a scope label. |
| `src/lib/csv.test.ts` | Change | Add cases for the new column-allowlist function and the new filename shapes (status-named, `filtered`, `all`). Existing cases must keep passing unmodified. |
| `src/app/api/payments/export/route.ts` | Change | Read `columns`/`scope` from the query string, branch `filterPayments` on scope, pass validated columns to `toCsv`, pass the scope label to `exportFilename`. |
| `src/app/api/payments/route.ts` or a small new helper | Maybe change | Only if the row-count-before-download needs a fetch; see Open questions. Prefer computing counts server-side in `payments/page.tsx` instead (no new endpoint) — see Approach. |
| `src/app/payments/export-dialog.tsx` | Add | New client component: the options dialog (`Drawer` + column checkboxes + scope `Select` + row count + Download link/button, disabled when zero columns selected). |
| `src/components/Checkbox.tsx` | Add | Small local checkbox primitive, styled to match `Input.tsx`'s conventions, since none exists. |
| `src/app/payments/page.tsx` | Change | Replace the bare `<a>` Export button with `<PaymentsExportDialog>`, passing the current filter query string and both row counts (current-filter total, all-payments total) computed via `filterPayments`. |

## Plan

1. **Extend `csv.ts` and its types** — add the column allowlist parser and the scope-aware `exportFilename`. Done when: `npm test` passes with new unit tests covering an invalid/unknown column being dropped, an empty selection, and each new filename shape.
2. **Wire `parseFilters`/`PaymentFilters`** to carry `scope`, validated against `["filter", "all"]` with `"filter"` as the fallback. Done when: an unrecognized `scope` value falls back to `"filter"` rather than throwing or passing through.
3. **Update the export route** to branch on scope and pass validated columns through. Done when: hitting `/api/payments/export?scope=all&columns=id,amount` returns a two-column CSV of every payment regardless of any status/merchant params also present; hitting it with a bogus column name (`?columns=id,password`) silently drops the unknown one rather than erroring or including it.
4. **Build `Checkbox.tsx`** — done when: it renders a labeled, keyboard-operable checkbox matching the visual language of `Input.tsx`/`Select.tsx` (focus ring, dark mode).
5. **Build `export-dialog.tsx`** — column checklist (last4 unchecked by default), scope `Select`, row count for the selected scope, Download control disabled at zero columns selected. Done when: toggling scope updates the displayed row count without a page reload, and unchecking every column visibly disables Download.
6. **Wire it into `payments/page.tsx`** — pass current filter params and both counts in, replace the old `<a>` Export button. Done when: opening `/payments` with a status filter active, then opening the dialog, shows the filtered count by default and the full-table count when scope is switched to "all payments."
7. **End-to-end check in the browser** — done when: downloading with last4 excluded and scope "all" produces a CSV with every payment, no `last4` column, and a filename like `payments-all-2026-08-13.csv`; downloading with a `disputed` status filter and default scope produces `payments-disputed-2026-08-13.csv`.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Ops can choose columns; last4 off by default | Manual check in the dialog (step 5/6) + unit test on the column allowlist function |
| Ops can choose scope, current filter default, row count visible before download | Manual check (step 6) — count updates on scope change before any download happens |
| Filename reflects scope and date | Unit tests in `csv.test.ts` for the status-named, `filtered`, and `all` shapes |
| Amounts stay minor units internally, formatted once with currency in its own column | Existing `csv.test.ts` amount-formatting cases keep passing unmodified; no new arithmetic added on `payment.amount` |
| Deselecting every column disables Download | Manual check in the dialog; optionally a component-level assertion if the test setup supports it |
| Unit test covers the column serializer, `npm test` passes | `npm test` run before opening the PR |

## Risks

- The column-validation logic could end up duplicated between `csv.ts` and `queries.ts` if not careful about which module owns it — decide in step 1 and keep it in one place (`csv.ts`, next to `EXPORT_COLUMNS`, is the natural owner).
- A `Checkbox.tsx` built without keyboard/focus support would violate `.claude/rules/components.md`'s "dialogs and forms must be operable" — worth a manual Tab-and-Space check, not just a click test.

## Out of scope

- Reordering columns (ops picks a subset of the canonical order, not a custom order) — not requested by the acceptance criteria.
- Persisting a saved column/scope preference across sessions — not mentioned in the ticket.
- NWP-102 (yesterday's totals) — unrelated ticket.

## Open questions

- None blocking. The filename scope-label convention was the one ambiguity and is resolved above: the active status filter's name when one is set, else `filtered` (other filters, no status) or `all` (all-payments scope).
