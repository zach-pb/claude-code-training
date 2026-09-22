import { createCard, parseCardInput } from "@/data/cards"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    )
  }

  const parsed = parseCardInput(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const { card, number } = createCard(parsed.data)
  return NextResponse.json({ card, number }, { status: 201 })
}
