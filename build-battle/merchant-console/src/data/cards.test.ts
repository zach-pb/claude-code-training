import { beforeEach, describe, expect, it } from "vitest"
import { createCard, listCards, parseCardInput, setCardStatus } from "./cards"
import { store } from "./store"
import { merchants } from "./merchants"

const validInput = () => ({
  nickname: "Ad spend",
  merchantId: merchants[0].id,
  limit: "250.00",
  currency: "USD",
})

beforeEach(() => {
  store.cards.length = 0
})

describe("parseCardInput", () => {
  it("accepts a valid card request and converts the limit to minor units once", () => {
    const result = parseCardInput(validInput())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.limit).toBe(25000)
  })

  it("rejects a missing merchant", () => {
    const result = parseCardInput({
      ...validInput(),
      merchantId: "mch_does_not_exist",
    })
    expect(result.ok).toBe(false)
  })

  it("rejects a zero limit", () => {
    const result = parseCardInput({ ...validInput(), limit: "0" })
    expect(result.ok).toBe(false)
  })

  it("rejects a negative limit", () => {
    const result = parseCardInput({ ...validInput(), limit: "-50.00" })
    expect(result.ok).toBe(false)
  })

  it("rejects a limit above 5,000,000 minor units", () => {
    const result = parseCardInput({ ...validInput(), limit: "50001.00" })
    expect(result.ok).toBe(false)
  })

  it("rejects a currency outside USD/EUR/GBP", () => {
    const result = parseCardInput({ ...validInput(), currency: "JPY" })
    expect(result.ok).toBe(false)
  })
})

describe("createCard + listCards", () => {
  it("reveals the full number once and stores only last4 and a masked status", () => {
    const parsed = parseCardInput(validInput())
    if (!parsed.ok) throw new Error("expected valid input")
    const { card, number } = createCard(parsed.data)

    expect(number.startsWith("4242")).toBe(true)
    expect(card.last4).toBe(number.slice(-4))
    expect(listCards()[0]).not.toHaveProperty("number")
  })
})

describe("setCardStatus", () => {
  it("allows active to frozen and back", () => {
    const parsed = parseCardInput(validInput())
    if (!parsed.ok) throw new Error("expected valid input")
    const { card } = createCard(parsed.data)

    expect(setCardStatus(card.id, "frozen").ok).toBe(true)
    expect(setCardStatus(card.id, "active").ok).toBe(true)
  })

  it("allows active or frozen to move to cancelled", () => {
    const parsed = parseCardInput(validInput())
    if (!parsed.ok) throw new Error("expected valid input")
    const { card } = createCard(parsed.data)

    expect(setCardStatus(card.id, "cancelled").ok).toBe(true)
  })

  it("never allows a transition out of cancelled", () => {
    const parsed = parseCardInput(validInput())
    if (!parsed.ok) throw new Error("expected valid input")
    const { card } = createCard(parsed.data)

    setCardStatus(card.id, "cancelled")
    expect(setCardStatus(card.id, "active").ok).toBe(false)
    expect(setCardStatus(card.id, "frozen").ok).toBe(false)
  })
})
