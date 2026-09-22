# SPEC · NWP-201 — Issue virtual cards from the console

> Written before any code. Generated with `/spec`, then edited by a human.
> Load it as context when you build: `@docs/specs/NWP-201-issue-cards.md`

**Ticket:** [NWP-201](../tickets/NWP-201.md)
**Author:** Zach Piscitelli-Bergin
**Status:** draft

## Problem

Ops issues virtual cards by messaging the platform team, who create them by hand — hours of turnaround, twelve to twenty times a week, and last month two cards got the wrong spend limit because the request lived in a Slack thread. Marcus Bell (Head of Merchant Ops) wants ops to issue a card, see every card they've issued, and open one to check it — from the console, not a chat thread.

## Current state

There is no cards feature yet. `build-battle/merchant-console/CLAUDE.md:54` says so explicitly: *"Cards is NWP-201 and does not exist yet."* But the app already has every pattern this ticket needs, built for payments:

- `src/data/types.ts` — domain types live here (`Currency`, `PaymentStatus`, etc.). No `Card` type exists yet.
- `src/data/store.ts` — the in-memory `Store` (`{ merchants, payments, refunds, disputes, payouts }`), generated once at boot, held on `globalThis.__northwindStore` so dev-server reloads don't reset it. No `cards` array.
- `src/data/queries.ts` — the shape to mirror: `parseFilters` (allowlist-validates client params) → `filterPayments`/`sortPayments`/`paginate`, composed as `queryPayments`. This is the "one query builder" the app's CLAUDE.md protects; a cards equivalent should follow the same shape, not reinvent it.
- `src/app/api/payments/route.ts` — a route handler is a thin wrapper: `parseFilters` in, `NextResponse.json` out. Nothing else lives in the handler.
- `src/app/payments/page.tsx` and `src/app/payments/[id]/page.tsx` — list and detail pages read the data layer directly as RSCs (`queryPayments`, `paymentById`) rather than fetching their own API route. The API route exists as a separate, reusable surface (used by `/api/payments/export`), not as the UI's only path to the data.
- `src/components/ui/payments/StatusBadge.tsx` — a status-to-badge mapping (`LABELS`, `DOTS`, `VARIANTS`) keyed on a union of `PaymentStatus | DisputeStatus | PayoutStatus`. Extending this union is less code than a new `CardStatusBadge`.
- `src/components/Drawer.tsx` — a Radix-dialog-based slide-over (`Drawer`, `DrawerTrigger`, `DrawerContent`, `DrawerHeader`, `DrawerBody`, `DrawerFooter`) already wired for focus trap and Escape-to-close. Nothing card-specific needed here.
- `src/lib/money.ts` — `formatMoney`, `parseAmountToMinorUnits` (parses `"250.00"` → `25000`, boundary-only). Reuse both; don't write a second parser for the limit field.
- `src/data/merchants.ts` — 10 fictional merchants, each with a `currency`. `merchantById` exists for lookups.
- `src/app/siteConfig.ts` + `src/components/ui/navigation/AppSidebar.tsx` — nav is a static list (`baseLinks.overview/payments/disputes/payouts`); `cards` isn't in it, so `/cards` won't be reachable from the sidebar until added.

Nothing in the ticket contradicts the code — it correctly assumes the money/date/validation helpers and the query-builder pattern already exist.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| Money is integer minor units, formatted once at the edge | `CLAUDE.md`, `.claude/rules/money.md` | A `$250.00` limit stored as `250.00` or `250` drifts the moment it's compared or summed |
| Reveal once, mask forever — full number only in the creation response | ticket rule 2, `.claude/rules/cards.md` | A full PAN sitting in the card record, a list/detail payload, or leftover client state is a real security-bug pattern, not a style nit |
| Card status is a state machine: `active ⇄ frozen`, either → `cancelled`, `cancelled` terminal | ticket rule 3, `.claude/rules/cards.md` | Skipping the server-side guard lets a cancelled card come back to life |
| `4242` test BIN + valid Luhn digit, generated server-side | ticket rule 4, `.claude/rules/cards.md` | A browser-generated or non-Luhn number risks resembling a real PAN |
| Validate on the server against an allowlist (merchant, currency, limit) | `CLAUDE.md`, `.claude/rules/api-routes.md`, ticket core criterion | Client-side-only checks let a missing merchant or a limit over 5,000,000 reach the store |
| Reuse existing components and helpers before adding new ones | `.claude/rules/components.md` | A second money formatter or a hand-rolled dialog is how the two halves of the app start disagreeing |

## Approach

Build cards as a self-contained feature that mirrors payments' existing shape rather than inventing a new one: a data-layer module (`src/data/cards.ts`) owns validation, creation, listing, and lookup against the in-memory store, following `queries.ts`'s parse-then-operate pattern; a small lib module (`src/lib/cardNumber.ts`) generates the Luhn-valid `4242`-BIN number entirely server-side; `/cards` (list) and `/cards/[id]` (detail) are server components reading the data layer directly, matching how the payments pages work today; and issuing a card happens in a `Drawer` (confirmed direction) triggered from the list page, which posts to a new `POST /api/cards` route and renders the one-time full-number reveal inside the drawer's own local state before it closes.

Cards start with `spent: 0` at creation. Nothing in this ticket adds a way to accrue spend against a card — there's no transaction/authorization feature to charge one — so "spend against the limit" on the detail page is real infrastructure (a `spent` field, formatted and compared like any other amount) showing a starting value of zero. That's a deliberate scope boundary, not a shortcut; flagged again under Out of scope.

**Considered and rejected:** a dedicated `/cards/new` page that redirects to the card's detail page with a one-time reveal banner after creation. Rejected because carrying a full card number through a redirect means it has to live somewhere that survives navigation — a query string, a server session, or client state — and that is exactly the "leftover client state after the success screen closes" `.claude/rules/cards.md` calls out. The drawer keeps the number in one component's local state for one render, then it's gone when the drawer closes. It also avoids adding two more route files under a 45-minute clock.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/data/types.ts` | change | Add `CardStatus` (`"active" \| "frozen" \| "cancelled"`) and `Card` (id, nickname, merchantId, last4, limit, currency, spent, status, createdAt) |
| `src/data/store.ts` | change | Add `cards: Card[]` to the `Store` interface, initialized empty in `createStore()` |
| `src/lib/cardNumber.ts` | add | `generateCardNumber()` (4242 BIN + random digits + Luhn check digit), a Luhn validator, `last4FromNumber()` |
| `src/lib/cardNumber.test.ts` | add (stretch) | Unit tests: generated numbers start `4242`, pass Luhn, `last4` matches the tail |
| `src/data/cards.ts` | add | `parseCardInput` (server-side allowlist: merchantId exists, limit is an integer in `(0, 5_000_000]`, currency ∈ `USD/EUR/GBP`), `createCard`, `listCards`, `cardById`, `setCardStatus` (guards the state machine) |
| `src/app/api/cards/route.ts` | add | `POST` only — validates via `parseCardInput`, calls `createCard`, returns the full number exactly once in the response body |
| `src/app/api/cards/[id]/route.ts` | add (stretch) | `PATCH` — freeze/unfreeze, transition guarded server-side via `setCardStatus` |
| `src/app/cards/page.tsx` | add | List page: table of nickname, merchant, masked number, limit, status, created date; "Issue card" button opens the drawer |
| `src/app/cards/issue-card-drawer.tsx` | add | `"use client"` — form (nickname, merchant select, limit input via `parseAmountToMinorUnits`, currency select), POST to `/api/cards`, one-time reveal panel, `router.refresh()` on close |
| `src/app/cards/[id]/page.tsx` | add | Detail page: full record (nickname, merchant, masked number, limit, spend vs. limit, status, created date) — mirrors `payments/[id]/page.tsx`'s `Field` pattern |
| `src/components/ui/payments/StatusBadge.tsx` | change | Extend the `AnyStatus` union and the `LABELS`/`DOTS`/`VARIANTS` maps with `active`/`frozen`/`cancelled`, additive only — existing payment/dispute/payout entries untouched |
| `src/app/siteConfig.ts` | change | Add `baseLinks.cards: "/cards"` |
| `src/components/ui/navigation/AppSidebar.tsx` | change | Add a "Cards" nav entry pointing at `siteConfig.baseLinks.cards` |

## Plan

1. **Types and store** — add `Card`/`CardStatus` to `types.ts`, wire `cards: []` into `store.ts`. Done when: the project type-checks with the new field present and empty.
2. **Card number generation** — build `src/lib/cardNumber.ts`. Done when: a manual call generates a 16-digit number starting `4242` that passes its own Luhn validator, every time across repeated calls.
3. **Data layer** — build `src/data/cards.ts` (`parseCardInput`, `createCard`, `listCards`, `cardById`). Done when: calling `createCard` with a bad merchant, a zero/negative/over-limit amount, or a non-`USD/EUR/GBP` currency is rejected before it touches the store, and a valid call adds exactly one card.
4. **Create route** — `POST /api/cards`. Done when: a valid POST returns 201 with the full number present once in the body; an invalid POST returns a 4xx with a safe message and nothing is added to the store.
5. **List page + nav** — `/cards` page and sidebar entry. Done when: visiting `/cards` from the sidebar renders the table (empty state included) with masked numbers only.
6. **Issue-card drawer** — done when: submitting the form creates a card, the drawer shows the full number exactly once, and after closing, `/cards` shows the new card masked.
7. **Detail page** — `/cards/[id]`. Done when: opening a card from the list shows its full record and `spent` (0) against `limit`, and the full number is never present anywhere in the page's rendered output or network response.
8. **Stretch, time permitting** — freeze/unfreeze action + `PATCH` route with the transition guarded server-side; Luhn/status-transition unit tests; merchant category lock; written empty/error states beyond the default table empty row.
9. **Before push** — `npm test`, then `/ship-ready`.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Issue a card via form/dialog | Manual: open the drawer on `/cards`, submit valid input, see the card appear in the list |
| `/cards` list with nickname, merchant, masked number, limit, status, created date | Manual: inspect the rendered table columns |
| Card detail shows full record + spend vs. limit | Manual: click into a card from the list |
| Numbers generated server-side, `4242` BIN, valid Luhn | Manual: inspect the one-time reveal after creation (starts `4242`); unit test on `cardNumber.ts` if time allows |
| Reveal once, mask forever | Manual: after closing the drawer, check the browser network tab / re-render of `/cards` and `/cards/[id]` for the full number — it must appear nowhere but the original `POST` response |
| Server-side validation (missing merchant, limit ≤ 0, limit > 5,000,000, bad currency) | Manual: submit each bad case through the form (client should block it) and, separately, `curl -X POST` the route directly with each bad body to confirm the server rejects it independent of the client |

## Risks

- **The 45-minute clock.** Core criteria (steps 1–7) come first; stretch items are ordered by likely score impact but are the first thing to cut if time runs short.
- **`spent` starting at 0 with no way to change it** could read as incomplete to a reviewer skimming the detail page. It's called out here and again in Out of scope so it reads as a scope boundary, not a missed requirement.
- **Extending the shared `StatusBadge`** touches a file payments/disputes/payouts already depend on — the change must be additive (new union members, new map entries) and not reorder or rename existing keys.

## Out of scope

- Persistence, a database, an ORM, or migrations — cards live in the in-memory store and vanish on restart, same as everything else. Real persistence is NWP-203.
- Authentication, roles, and permissions.
- Real card-network/issuer calls.
- Editing a card's limit after issue (NWP-202).
- Any mechanism for a card to accrue real spend (transactions/authorizations against a card). `spent` exists as a field and renders correctly, but nothing in this ticket adds a way to change it from 0.

## Open questions

- None blocking. The UI-shape question (drawer vs. dedicated page) is resolved above in favor of the drawer.
