import { NextResponse } from "next/server"
import { z } from "zod"

import { runDemoFlow } from "@/lib/grinflow/run-demo.ts"

// Demo only: runs offer → gaps → confirmation → proposals → route review → human decision in memory.
// Interactions and matching run on the v0.10 engines in lib/engines.
// Stores nothing, sends nothing, calls no external API.

const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
const window = z.object({ start: z.string().datetime(), end: z.string().datetime() })
const condition = z.enum(["edible", "past_prime", "inedible", "unknown"])
const tracked = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value: value.nullable(), status: z.enum(["missing", "reported", "confirmed"]), source: z.string().max(80).nullable() })

const offer = z.object({
  id: z.string().min(1).max(64),
  donorId: z.string().min(1).max(64),
  rawMessage: z.string().max(2000).nullable(),
  product: tracked(z.string().max(120)),
  category: tracked(z.string().max(40)),
  quantity: tracked(z.number().positive().max(1_000_000)),
  unit: tracked(z.string().max(20)),
  weightKg: tracked(z.number().positive().max(100_000)),
  condition: tracked(condition),
  pickupLocation: tracked(point),
  pickupWindow: tracked(window),
})

const destination = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  use: z.enum(["human_consumption", "valorization"]),
  acceptedCategories: z.array(z.string().max(40)).max(20),
  capacityKg: z.number().nonnegative().max(100_000),
  location: point,
  receivingWindow: window,
  acceptsConditions: z.array(condition).max(4),
  confirmed: z.boolean(),
})

const vehicle = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  capacityKg: z.number().nonnegative().max(100_000),
  location: point,
  availableWindow: window,
  availabilityConfirmed: z.boolean(),
  refrigerated: z.boolean(),
})

const body = z
  .object({
    offer: offer.optional(),
    destinations: z.array(destination).min(1).max(20).optional(),
    vehicles: z.array(vehicle).min(1).max(20).optional(),
    answers: z.record(z.string().max(200)).optional(),
    reviewRouteIndex: z.number().int().min(0).max(400).nullable().optional(),
    decision: z
      .object({
        outcome: z.enum(["approved", "rejected"]),
        proposalIndex: z.number().int().min(0).max(400).optional(),
        reason: z.string().max(500).optional(),
      })
      .nullable()
      .optional(),
  })
  .strict()

export async function POST(request: Request) {
  const text = await request.text()
  if (text.length > 64_000) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 })
  }
  let json: unknown = {}
  if (text.trim() !== "") {
    try {
      json = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 })
    }
  }
  const parsed = body.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues.slice(0, 10) }, { status: 400 })
  }
  const result = runDemoFlow(parsed.data)
  return NextResponse.json({ ...result, persisted: false, messagesSent: 0 })
}
