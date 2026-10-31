import type { CompositeIndex, IccRecord } from "./types.ts"

// The parts of ICC that are product decisions, kept in one place so they can be formalized without
// touching the code that collects evidence. Nothing here is calibrated. Every number is a demo
// placeholder until it is checked against scale readings and verified outcomes.

export const ICC_SPEC_VERSION = "icc-0.1-borrador"

/**
 * Composite index weights. Deliberately null: a score of 82 means nothing until the formula, scales and
 * weights are specified (docs/ICC.md, "open decisions"). While any weight is null, `composite()` returns
 * no score, only the components.
 */
export const ICC_WEIGHTS: Record<"product" | "quality" | "risk" | "physical", number | null> = {
  product: null,
  quality: null,
  risk: null,
  physical: null,
}

/**
 * Reference weight and volume per unit, used only to estimate (provenance "estimado", confidence "baja").
 * DEMO PLACEHOLDERS, not measured: replace with values calibrated against scale readings per donor and
 * package type. A unit with no entry gives no estimate, and the agent asks for the weight instead.
 */
export type UnitReference = { key: string; match: { category?: string; item?: RegExp }; units: string[]; kg: [number, number]; m3: [number, number]; note: string }

export const UNIT_REFERENCES: UnitReference[] = [
  { key: "pan-caja", match: { category: "panificados" }, units: ["caja", "box"], kg: [1.5, 2.5], m3: [0.02, 0.04], note: "caja de cartón de pan dulce o bolillo, placeholder" },
  { key: "pan-pieza", match: { category: "panificados" }, units: ["pieza"], kg: [0.05, 0.12], m3: [0.0003, 0.001], note: "pieza de pan, placeholder" },
  { key: "verdura-caja", match: { category: "verduras" }, units: ["caja", "box"], kg: [15, 25], m3: [0.04, 0.06], note: "caja de campo de jitomate o verdura, placeholder" },
  { key: "fruta-caja", match: { category: "frutas" }, units: ["caja", "box"], kg: [15, 20], m3: [0.04, 0.06], note: "caja de fruta, placeholder" },
  { key: "lacteo-caja", match: { category: "lacteos" }, units: ["caja", "box"], kg: [10, 13], m3: [0.015, 0.025], note: "caja de 12 litros, placeholder" },
  { key: "huevo-caja", match: { item: /huevo|egg/ }, units: ["caja", "box"], kg: [20, 23], m3: [0.05, 0.07], note: "caja de 360 huevos, placeholder" },
  { key: "despensa", match: {}, units: ["despensa"], kg: [5, 10], m3: [0.02, 0.04], note: "despensa armada, placeholder" },
  { key: "comida-contenedor", match: { item: /comida|guisado|contenedor|charola/ }, units: ["contenedor", "charola", "caja"], kg: [0.5, 1.5], m3: [0.002, 0.005], note: "contenedor de comida preparada, placeholder" },
  { key: "organico-costal", match: { category: "organico" }, units: ["costal", "bolsa"], kg: [15, 30], m3: [0.05, 0.1], note: "costal de orgánico, placeholder" },
  { key: "organico-cubeta", match: { category: "organico" }, units: ["cubeta", "bote"], kg: [8, 15], m3: [0.015, 0.02], note: "cubeta de 19 l, placeholder" },
]

/**
 * What the network may do with an estimated weight. Planning with an estimate keeps a lot moving, and
 * the estimate stays labelled until the handoff or receipt measures it. Change here, not in callers.
 */
export const PLANNING_POLICY = {
  /** Plan with the point of an estimated range (shown as estimado). If false, an estimated weight blocks like an unknown one. */
  planWithEstimatedWeight: true,
  /** Categories where the people route needs a declared storage condition (cold chain). */
  coldChainCategories: ["lacteos", "proteina"] as string[],
}

export function composite(record: Omit<IccRecord, "composite">): CompositeIndex {
  const components: CompositeIndex["components"] = [
    { dimension: "product", signal: "identidad", value: record.product.item ?? record.product.category ?? "sin identificar" },
    { dimension: "quality", signal: "condición", value: `${record.quality.condition.value} · ${record.quality.condition.provenance}` },
    ...(record.quality.visual ? [{ dimension: "quality" as const, signal: "foto", value: record.quality.visual.value }] : []),
    { dimension: "risk", signal: "alertas", value: record.risk.flags.map((f) => f.code).join(", ") || "ninguna" },
    { dimension: "risk", signal: "por verificar", value: String(record.risk.pendingVerifications.length) },
    { dimension: "physical", signal: "peso", value: record.physical.weightKg ? `${fmtRange(record.physical.weightKg.value)} kg · ${record.physical.weightKg.provenance}` : "desconocido" },
    { dimension: "physical", signal: "volumen", value: record.physical.volumeM3 ? `${fmtRange(record.physical.volumeM3.value, 2)} m³ · ${record.physical.volumeM3.provenance}` : "desconocido" },
  ]
  const ES: Record<string, string> = { product: "producto", quality: "calidad", risk: "riesgo", physical: "físico" }
  const unset = Object.entries(ICC_WEIGHTS).filter(([, w]) => w === null).map(([k]) => ES[k])
  return unset.length
    ? { score: null, status: "pendiente_especificacion", reason: `faltan las ponderaciones de ${unset.join(", ")} en la especificación (docs/ICC.md); no se inventan`, components }
    : { score: null, status: "pendiente_especificacion", reason: "ponderaciones definidas, pero la fórmula y las escalas por componente aún no están especificadas", components }
}

export function fmtRange(r: { min: number; max: number }, digits = 0): string {
  const f = (n: number) => (digits ? n.toFixed(digits) : String(Math.round(n * 10) / 10))
  return r.min === r.max ? f(r.min) : `${f(r.min)}–${f(r.max)}`
}
