import { ICC_BANDS, ICC_UNKNOWN_FACTOR, ICC_WEIGHTS, ICC_WEIGHTS_STATUS, PLANNING_POLICY, SHELF_LIFE_HOURS, TIME_SCALE, fmtRange, type IccFactor } from "./spec.ts"
import type { CompositeIndex, IccBand, IccRecord } from "./types.ts"

// The ICC score and its band. The score ranks and filters destinations; it never overrides a safety rule:
// a lot that is not confirmed fit for people is never "alto", and nothing a score says reopens a blocked
// route. Every factor keeps where its value came from, so an 82 can be taken apart.

const interp = (x: number, pts: [number, number][]) => {
  if (x <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]
    if (x <= x1) return Math.round(y0 + ((x - x0) / (x1 - x0)) * (y1 - y0))
  }
  return pts.at(-1)![1]
}

type Base = Omit<IccRecord, "composite">

const perishable = (r: Base) => PLANNING_POLICY.coldChainCategories.includes(r.product.category ?? "") || /comida|guisado|preparad/.test(r.product.item ?? "")
const cold = (r: Base) => /refrig|refri|frio|congel|camara/.test((r.quality.storage?.value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, ""))
const ambient = (r: Base) => /ambiente|bodega/.test(r.quality.storage?.value ?? "")

function tiempo(r: Base): CompositeIndex["factors"][number] {
  const h = r.quality.hoursSincePrep
  const key = /comida|guisado|preparad/.test(r.product.item ?? "") ? "comida" : r.product.category ?? ""
  const life = SHELF_LIFE_HOURS[key]
  if (!h || !life) return { factor: "tiempo", value: null, provenance: null, basis: !life ? "sin vida útil de referencia para este producto" : "no se sabe cuándo se preparó o cosechó" }
  const hours = cold(r) ? life.frio : life.ambiente
  const remaining = Math.max(0, hours - h.value)
  return { factor: "tiempo", value: interp(remaining, TIME_SCALE), provenance: h.provenance === "declarado" ? "declarado" : "estimado", basis: `~${remaining} h restantes (${hours} h de referencia ${cold(r) ? "en frío" : "a temperatura ambiente"} − ${h.value} h; ${h.method})` }
}

function integridad(r: Base): CompositeIndex["factors"][number] {
  if (r.quality.condition.value === "inedible") return { factor: "integridad", value: 0, provenance: r.quality.condition.provenance, basis: "condición no comestible" }
  const severe = r.risk.flags.some((f) => /^foto_(mold|rot_or_decay|pests|leak_or_spill)$/.test(f.code))
  const minor = r.risk.flags.some((f) => /^foto_/.test(f.code) && f.code !== "foto_no_evaluada") || r.risk.flags.some((f) => f.code === "dano_declarado")
  const grade = r.quality.visual?.value
  if (severe) return { factor: "integridad", value: 0, provenance: "estimado", basis: "daño grave visible en la foto" }
  if (minor) return { factor: "integridad", value: 55, provenance: r.risk.flags.some((f) => f.code === "dano_declarado") ? "declarado" : "estimado", basis: "daño menor visible o declarado" }
  if (grade === "no visible issues") return { factor: "integridad", value: 100, provenance: "estimado", basis: "sin daño visible en la foto" }
  const pack = r.product.packaging
  if (pack && /sellad|cerrad|empacad/.test(pack.value)) return { factor: "integridad", value: 85, provenance: pack.provenance, basis: `empaque ${pack.value}, sin foto` }
  return { factor: "integridad", value: null, provenance: null, basis: "sin foto ni descripción del empaque" }
}

function termico(r: Base): CompositeIndex["factors"][number] {
  if (!perishable(r)) return { factor: "termico", value: 100, provenance: "estimado", basis: `${r.product.category ?? "producto"} no requiere cadena de frío (regla)` }
  if (cold(r)) return { factor: "termico", value: 100, provenance: r.quality.storage!.provenance, basis: `perecedero, ${r.quality.storage!.value}` }
  if (ambient(r)) return { factor: "termico", value: 15, provenance: r.quality.storage!.provenance, basis: `perecedero ${r.quality.storage!.value}: fuera de la cadena de frío` }
  return { factor: "termico", value: null, provenance: null, basis: "perecedero sin almacenamiento declarado" }
}

export function bandFor(score: number): IccBand {
  return score >= ICC_BANDS.alto ? "alto" : score >= ICC_BANDS.medio ? "medio" : "bajo"
}

export function composite(record: Base): CompositeIndex {
  const factors = [tiempo(record), integridad(record), termico(record)]
  const components: CompositeIndex["components"] = [
    { dimension: "product", signal: "identidad", value: record.product.item ?? record.product.category ?? "sin identificar" },
    { dimension: "quality", signal: "condición", value: `${record.quality.condition.value} · ${record.quality.condition.provenance}` },
    { dimension: "risk", signal: "alertas", value: record.risk.flags.map((f) => f.code).join(", ") || "ninguna" },
    { dimension: "physical", signal: "peso", value: record.physical.weightKg ? `${fmtRange(record.physical.weightKg.value)} kg · ${record.physical.weightKg.provenance}` : "desconocido" },
  ]
  const weights = factors.map((f) => ICC_WEIGHTS[f.factor as IccFactor])
  if (weights.some((w) => w === null)) {
    return { score: null, range: null, band: null, status: "pendiente_especificacion", weights: ICC_WEIGHTS_STATUS, reason: "sin puntaje: falta definir la ponderación de los factores", factors, components }
  }
  const total = weights.reduce<number>((a, w) => a + (w ?? 0), 0)
  const at = (unknown: number) => Math.round(factors.reduce((a, f, i) => a + (f.value ?? unknown) * weights[i]!, 0) / total)
  let score = at(ICC_UNKNOWN_FACTOR)
  const range = { min: at(0), max: at(100) }
  const missing = factors.filter((f) => f.value === null).map((f) => f.factor)
  const c = record.quality.condition.value
  const caps: string[] = []
  // Safety gates. The score can only push a lot down, never up past the rules.
  if (c === "inedible" || c === "past_prime") { score = Math.min(score, ICC_BANDS.medio - 1); range.max = Math.min(range.max, ICC_BANDS.medio - 1); range.min = Math.min(range.min, range.max); caps.push(`condición ${c.replace("_", " ")}: banda baja`) }
  let band: IccBand | "pendiente" = bandFor(score)
  if (band === "alto" && missing.length) { band = "medio"; caps.push(`sin banda alta mientras falte: ${missing.join(", ")}`) }
  if (band === "alto" && c === "edible" && record.quality.condition.provenance !== "declarado" && record.quality.condition.provenance !== "verificado") band = "medio"
  if (c === "unknown") { band = "pendiente"; caps.push("condición sin confirmar: la banda espera al donante o a una inspección") }
  const reason = [`ponderación ${ICC_WEIGHTS_STATUS}`, missing.length ? `${missing.join(", ")} sin dato cuenta ${ICC_UNKNOWN_FACTOR}; rango posible ${range.min}–${range.max}` : null, ...caps].filter(Boolean).join(" · ")
  return { score, range, band, status: "calculado", weights: ICC_WEIGHTS_STATUS, reason, factors, components }
}
