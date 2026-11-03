import assert from "node:assert/strict"
import { test } from "node:test"

import { badgesFor, sectionsFor } from "../lib/mi/home.ts"
import type { RegisteredRole, Registration } from "../lib/registry/types.ts"

// E2: home content comes only from the organization's own registration. Activity sections stay
// empty until E3-E5 create that data; profile sections show what the registration declares.

function reg(overrides: Partial<Registration> = {}): Registration {
  const at = "2026-11-03T12:00:00.000Z"
  return {
    id: "reg-1", phone: "", ownerUid: "uid-a", source: "web", name: "Org",
    roles: ["donor"], address: null, location: null, locationSource: null, area: null,
    hours: null, hoursText: "", contacts: [], accepts: null, generates: null,
    selfPickup: null, whatsappOptIn: false, status: "pending",
    createdAt: at, updatedAt: at, verifiedAt: null, verifiedBy: null, notes: null,
    ...overrides,
  }
}

test("mi-home: badges only from real verification", () => {
  assert.deepEqual(badgesFor(reg({ status: "pending" })), [])
  assert.deepEqual(badgesFor(reg({ status: "rejected" })), [])
  assert.deepEqual(
    badgesFor(reg({ status: "verified", verifiedAt: "2026-11-02T10:00:00.000Z" })),
    [{ id: "verified", label: "organización verificada", detail: "desde 2026-11-02" }],
  )
  assert.deepEqual(
    badgesFor(reg({ status: "verified", verifiedAt: null })),
    [{ id: "verified", label: "organización verificada", detail: "verificada por el equipo" }],
  )
})

test("mi-home: donors see offers (empty) plus what they generate", () => {
  const withData = sectionsFor(reg({ roles: ["donor"], generates: { categories: ["panificados"], kgPerWeek: 20, frequency: "diaria", text: "pan del día" } }))
  assert.deepEqual(withData.map((s) => s.key), ["offers", "generates"])
  assert.equal(withData[0].body, null)
  assert.match(withData[0].empty, /aún no publicas ofertas/)
  assert.equal(withData[1].body, "pan del día")
  const empty = sectionsFor(reg({ roles: ["donor"] }))
  assert.equal(empty[1].body, null)
  assert.match(empty[1].empty, /no declaraste qué te sobra/)
})

test("mi-home: receivers see their inbox plus what they take", () => {
  const SRL = sectionsFor(reg({
    roles: ["receiver"],
    accepts: { categories: ["panificados", "frutas"], materials: [], requires: [], weeklyKg: null, text: "" },
  }))
  assert.deepEqual(SRL.map((s) => s.key), ["inbox", "accepts"])
  assert.equal(SRL[0].body, null)
  assert.equal(SRL[1].body, "pan, fruta")
})

test("mi-home: makers see materials with specs", () => {
  const SRL = sectionsFor(reg({
    roles: ["maker"],
    accepts: { categories: ["organico"], materials: ["cáscara de huevo"], requires: ["limpia", "seca"], weeklyKg: 20, text: "" },
  }))
  assert.deepEqual(SRL.map((s) => s.key), ["material-offers", "materials"])
  assert.equal(SRL[1].body, "cáscara de huevo (limpia, seca)")
  const empty = sectionsFor(reg({ roles: ["compost"] }))
  assert.deepEqual(empty.map((s) => s.key), ["incoming", "composts"])
  assert.equal(empty[1].body, null)
})

test("mi-home: several roles stack their sections in role order", () => {
  const roles: RegisteredRole[] = ["receiver", "donor"]
  const SRL = sectionsFor(reg({ roles }))
  assert.deepEqual(SRL.map((s) => s.key), ["offers", "generates", "inbox", "accepts"])
})
