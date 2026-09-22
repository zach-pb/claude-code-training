/**
 * Card numbers are generated here, server-side only, on the 4242 test BIN.
 * Nothing produced by this file may resemble a real PAN.
 */

const BIN = "4242"
const LENGTH = 16

/** Standard Luhn check digit for a string of digits (no check digit yet). */
function luhnCheckDigit(digits: string): string {
  let sum = 0
  let double = true // rightmost of the existing digits doubles first
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i])
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return String((10 - (sum % 10)) % 10)
}

/** True if a full digit string (including its check digit) passes Luhn. */
export function isValidLuhn(number: string): boolean {
  if (!/^\d+$/.test(number)) return false
  const body = number.slice(0, -1)
  return luhnCheckDigit(body) === number.slice(-1)
}

/** Generates a 16-digit, Luhn-valid number starting with the 4242 test BIN. */
export function generateCardNumber(): string {
  const middleLength = LENGTH - BIN.length - 1
  let middle = ""
  for (let i = 0; i < middleLength; i++) {
    middle += String(Math.floor(Math.random() * 10))
  }
  const body = BIN + middle
  return body + luhnCheckDigit(body)
}

export function last4FromNumber(number: string): string {
  return number.slice(-4)
}

/** Display form for everywhere but the one-time creation response. */
export function maskCardNumber(last4: string): string {
  return `•••• ${last4}`
}
