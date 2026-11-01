import assert from "node:assert/strict"
import { test } from "node:test"

import { PLACES, placePoint } from "../lib/network/supply.ts"
import { parseAddress } from "../lib/registry/parse.ts"

test("the expanded CDMX place catalog resolves common colonies", () => {
  for (const name of ["polanco", "santa maria la ribera", "escandon", "coyoacan", "lindavista", "tacuba"]) {
    const point = placePoint(`colonia ${name}`)
    assert.ok(point, `${name} should resolve`)
    assert.ok(Number.isFinite(point.lat) && Number.isFinite(point.lng))
    assert.deepEqual(point, PLACES[name])
  }
})

test("onboarding recognizes multi-word colonies and accents", () => {
  const santaMaria = parseAddress("Av. Rivera 10, colonia Santa María la Ribera")
  assert.equal(santaMaria.area, "santa maria la ribera")
  assert.deepEqual(santaMaria.point, PLACES["santa maria la ribera"])

  const coyoacan = parseAddress("calle Hidalgo, Coyoacán")
  assert.equal(coyoacan.area, "coyoacan")
  assert.deepEqual(coyoacan.point, PLACES.coyoacan)
})
