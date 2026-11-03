import assert from "node:assert/strict"
import { test } from "node:test"

import { OPENERS, whatsappLink } from "../lib/channel/whatsapp-link.ts"
import { acceptsCore, rolesLine } from "../lib/registry/display.ts"
import { summary } from "../lib/registry/onboarding.ts"
import { wantsToRegister } from "../lib/registry/parse.ts"
import { DEMO_NETWORK } from "../lib/network/demo.ts"
import { countByFilter, filterParticipants } from "../lib/network/filter.ts"

// Makers visible: the landing register intent, shared role/accepts wording, and the network
// org-type filter. The onboarding flow and its texts are unchanged (pinned below).

test("makers-visible: the register intent opens onboarding on both languages", () => {
  assert.equal(OPENERS.es.register, "quiero registrar mi organización")
  assert.equal(OPENERS.en.register, "i want to register my organization")
  assert.ok(wantsToRegister(OPENERS.es.register))
  assert.ok(wantsToRegister(OPENERS.en.register))
  assert.match(whatsappLink("5215512345678", "register", "es"), /^https:\/\/wa\.me\/5215512345678\?text=/)
})

test("makers-visible: role lines name the type with a recognizable example", () => {
  assert.equal(rolesLine(["donor"]), "dona · ej. restaurante")
  assert.equal(rolesLine(["receiver"]), "recibe para personas · ej. banco de alimentos")
  assert.equal(rolesLine(["maker"]), "maker · ej. laboratorio")
  assert.equal(rolesLine(["compost"]), "composta · ej. centro de composta")
  assert.equal(rolesLine(["donor", "maker"]), "dona · ej. restaurante, maker · ej. laboratorio")
})

test("makers-visible: accepts core shows materials or categories plus specs", () => {
  assert.equal(
    acceptsCore({ categories: ["organico"], materials: ["cáscara de huevo"], requires: ["limpia", "seca"], weeklyKg: 20, text: "cáscara" }),
    "cáscara de huevo (limpia, seca)",
  )
  assert.equal(
    acceptsCore({ categories: ["panificados", "frutas"], materials: [], requires: [], weeklyKg: null, text: "" }),
    "pan, fruta",
  )
  assert.equal(acceptsCore({ categories: [], materials: [], requires: [], weeklyKg: null, text: "lo que haya" }), "lo que haya")
  assert.equal(
    acceptsCore({ categories: ["organico"], materials: ["cáscara de huevo"], requires: [], weeklyKg: null, text: "" }, { maker: false }),
    "orgánico",
    "non-makers never match on materials",
  )
})

test("makers-visible: the onboarding summary text is unchanged by the shared helper", () => {
  const s = summary({
    name: "Taller Demo",
    roles: ["maker"],
    accepts: { categories: ["organico"], materials: ["cáscara de huevo"], requires: ["limpia", "seca"], weeklyKg: 20, text: "cáscara" },
  })
  assert.match(s, /material: cáscara de huevo \(limpia, seca\), ~20 kg\/semana/)
  const r = summary({
    name: "Comedor Demo",
    roles: ["receiver"],
    accepts: { categories: ["panificados"], materials: [], requires: [], weeklyKg: 50, text: "pan" },
  })
  assert.match(r, /recibe: pan, ~50 kg\/semana/)
})

test("makers-visible: network counts come from the participant list", () => {
  assert.deepEqual(countByFilter(DEMO_NETWORK.participants), { all: 16, donor: 5, receiver: 4, maker: 3, compost: 1 })
})

test("makers-visible: the filter keeps order and only matching roles", () => {
  const makers = filterParticipants(DEMO_NETWORK.participants, "maker")
  assert.deepEqual(makers.map((p) => p.id), ["mak-cascara", "mak-ceramica", "mak-tinte"])
  assert.ok(makers.every((p) => p.roles.includes("maker")))
  const all = filterParticipants(DEMO_NETWORK.participants, "all")
  assert.equal(all.length, 16)
  assert.notEqual(all, DEMO_NETWORK.participants)
  for (const f of ["donor", "receiver", "compost"] as const) {
    assert.ok(filterParticipants(DEMO_NETWORK.participants, f).every((p) => p.roles.includes(f)))
  }
})
