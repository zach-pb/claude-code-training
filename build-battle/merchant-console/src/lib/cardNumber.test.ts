import { describe, expect, it } from "vitest"
import {
  generateCardNumber,
  isValidLuhn,
  last4FromNumber,
  maskCardNumber,
} from "./cardNumber"

describe("generateCardNumber", () => {
  it("always starts with the 4242 test BIN", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateCardNumber().startsWith("4242")).toBe(true)
    }
  })

  it("is always 16 digits", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateCardNumber()).toMatch(/^\d{16}$/)
    }
  })

  it("always passes its own Luhn check", () => {
    for (let i = 0; i < 50; i++) {
      expect(isValidLuhn(generateCardNumber())).toBe(true)
    }
  })
})

describe("isValidLuhn", () => {
  it("rejects a number with a corrupted check digit", () => {
    const number = generateCardNumber()
    const lastDigit = Number(number.slice(-1))
    const corrupted = number.slice(0, -1) + String((lastDigit + 1) % 10)
    expect(isValidLuhn(corrupted)).toBe(false)
  })

  it("rejects non-digit input", () => {
    expect(isValidLuhn("4242abcd1234567")).toBe(false)
  })
})

describe("last4FromNumber", () => {
  it("returns the trailing four digits", () => {
    expect(last4FromNumber("4242123456789012")).toBe("9012")
  })
})

describe("maskCardNumber", () => {
  it("masks everything but the last four", () => {
    expect(maskCardNumber("9012")).toBe("•••• 9012")
  })
})
