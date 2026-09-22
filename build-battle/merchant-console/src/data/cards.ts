import { parseAmountToMinorUnits } from "@/lib/money"
import { generateCardNumber, last4FromNumber } from "@/lib/cardNumber"
import { merchantById } from "./merchants"
import { store } from "./store"
import { Card, CardStatus, Currency } from "./types"

const CURRENCIES: readonly Currency[] = ["USD", "EUR", "GBP"]
const MAX_LIMIT = 5_000_000

export const MAX_LIMIT_MINOR_UNITS = MAX_LIMIT

interface CardInput {
  nickname: string
  merchantId: string
  limit: number
  currency: Currency
}

type ParseResult = { ok: true; data: CardInput } | { ok: false; error: string }

/**
 * Anything from the client is checked against an allowlist before it reaches
 * the store. Mirrors the shape of parseFilters in data/queries.ts.
 */
export function parseCardInput(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be an object." }
  }
  const raw = body as Record<string, unknown>

  const nickname = typeof raw.nickname === "string" ? raw.nickname.trim() : ""
  if (!nickname) {
    return { ok: false, error: "Nickname is required." }
  }

  const merchantId = typeof raw.merchantId === "string" ? raw.merchantId : ""
  if (!merchantId || !merchantById(merchantId)) {
    return { ok: false, error: "A valid merchant is required." }
  }

  const currency = raw.currency
  if (
    typeof currency !== "string" ||
    !CURRENCIES.includes(currency as Currency)
  ) {
    return { ok: false, error: "Currency must be one of USD, EUR, GBP." }
  }

  const rawLimit = raw.limit
  const limit =
    typeof rawLimit === "number"
      ? Number.isInteger(rawLimit)
        ? rawLimit
        : null
      : typeof rawLimit === "string"
        ? parseAmountToMinorUnits(rawLimit)
        : null

  if (limit === null || limit <= 0) {
    return { ok: false, error: "Limit must be a positive amount." }
  }
  if (limit > MAX_LIMIT) {
    return { ok: false, error: "Limit cannot exceed 5,000,000 minor units." }
  }

  return {
    ok: true,
    data: { nickname, merchantId, limit, currency: currency as Currency },
  }
}

/** Creates a card and returns it alongside the full number, generated once. */
export function createCard(input: CardInput): { card: Card; number: string } {
  const number = generateCardNumber()
  const card: Card = {
    id: `card_${String(store.cards.length + 1).padStart(6, "0")}`,
    nickname: input.nickname,
    merchantId: input.merchantId,
    last4: last4FromNumber(number),
    limit: input.limit,
    currency: input.currency,
    spent: 0,
    status: "active",
    createdAt: new Date().toISOString(),
  }
  store.cards.push(card)
  return { card, number }
}

export function listCards(): Card[] {
  return [...store.cards].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function cardById(id: string): Card | null {
  return store.cards.find((c) => c.id === id) ?? null
}

const TRANSITIONS: Record<CardStatus, readonly CardStatus[]> = {
  active: ["frozen", "cancelled"],
  frozen: ["active", "cancelled"],
  cancelled: [],
}

type StatusResult = { ok: true; card: Card } | { ok: false; error: string }

/** Guards the state machine server-side: active ⇄ frozen, either → cancelled, cancelled terminal. */
export function setCardStatus(id: string, next: CardStatus): StatusResult {
  const card = cardById(id)
  if (!card) return { ok: false, error: "Card not found." }

  if (!TRANSITIONS[card.status].includes(next)) {
    return {
      ok: false,
      error: `Cannot move a ${card.status} card to ${next}.`,
    }
  }

  card.status = next
  return { ok: true, card }
}
