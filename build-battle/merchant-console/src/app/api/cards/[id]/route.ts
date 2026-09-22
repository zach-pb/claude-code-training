import { setCardStatus } from "@/data/cards"
import { CardStatus } from "@/data/types"
import { NextRequest, NextResponse } from "next/server"

const ALLOWED: readonly CardStatus[] = ["active", "frozen", "cancelled"]

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    )
  }

  const status = (body as Record<string, unknown>)?.status
  if (typeof status !== "string" || !ALLOWED.includes(status as CardStatus)) {
    return NextResponse.json(
      { error: "status must be one of active, frozen, cancelled." },
      { status: 400 },
    )
  }

  const result = setCardStatus(id, status as CardStatus)
  if (!result.ok) {
    const notFound = result.error === "Card not found."
    return NextResponse.json(
      { error: result.error },
      { status: notFound ? 404 : 409 },
    )
  }

  return NextResponse.json({ card: result.card })
}
