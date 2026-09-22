import { describe, expect, it } from "vitest"
import { sortPayments } from "./queries"
import { Payment } from "./types"

const payment = (amount: number, id: string): Payment => ({
  id,
  merchantId: "mch_01",
  amount,
  currency: "USD",
  status: "captured",
  method: "card",
  cardBrand: "visa",
  last4: "4242",
  createdAt: "2026-01-01T00:00:00.000Z",
  description: "test",
})

describe("sortPayments", () => {
  it("sorts by amount numerically, not lexicographically", () => {
    const payments = [payment(1000, "a"), payment(900, "b"), payment(50, "c")]

    const ascending = sortPayments(payments, "amount", "asc")
    expect(ascending.map((p) => p.amount)).toEqual([50, 900, 1000])

    const descending = sortPayments(payments, "amount", "desc")
    expect(descending.map((p) => p.amount)).toEqual([1000, 900, 50])
  })

  it("sorts by createdAt when no sort is given", () => {
    const older: Payment = {
      ...payment(100, "old"),
      createdAt: "2026-01-01T00:00:00.000Z",
    }
    const newer: Payment = {
      ...payment(100, "new"),
      createdAt: "2026-02-01T00:00:00.000Z",
    }

    const result = sortPayments([older, newer])
    expect(result.map((p) => p.id)).toEqual(["new", "old"])
  })
})
