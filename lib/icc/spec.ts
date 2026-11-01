
// The parts of ICC that are product decisions, kept in one place so they can be formalized without
// touching the code that collects evidence. Nothing here is calibrated. Every number is a demo
// placeholder until it is checked against scale readings and verified outcomes.

export const ICC_SPEC_VERSION = "icc-0.2-borrador"

/**
 * ICC score, 0 to 100, from three factors jor defined (2026-11-01): time (remaining shelf life), physical
 * integrity and packaging, thermal and sanitary history. The weights are PROVISIONAL (equal thirds) until
 * jor sets them; change them here only. A null weight turns the score off and leaves only the factors.
 */
export type IccFactor = "tiempo" | "integridad" | "termico"
export const ICC_WEIGHTS: Record<IccFactor, number | null> = { tiempo: 1 / 3, integridad: 1 / 3, termico: 1 / 3 }
export const ICC_WEIGHTS_STATUS: "provisional" | "definitiva" = "provisional"

/** Bands from jor's examples: alto 80–100, medio 40–79, bajo 0–39. */
export const ICC_BANDS = { alto: 80, medio: 40 }

/** A factor with no evidence counts as this (neutral), and the band can never be "alto" with any factor missing. */
export const ICC_UNKNOWN_FACTOR = 50

/**
 * Hours a product stays usable for people from preparation or harvest, by category and storage. DEMO
 * PLACEHOLDERS, not food-safety values: replace with criteria from a food-safety specialist.
 */
export const SHELF_LIFE_HOURS: Record<string, { frio: number; ambiente: number }> = {
  panificados: { frio: 72, ambiente: 48 },
  verduras: { frio: 120, ambiente: 72 },
  frutas: { frio: 120, ambiente: 72 },
  lacteos: { frio: 120, ambiente: 4 },
  proteina: { frio: 48, ambiente: 2 },
  abarrotes: { frio: 2000, ambiente: 2000 },
  comida: { frio: 48, ambiente: 4 },
}

/** Remaining hours → time factor. Piecewise linear between these points. Placeholder scale. */
export const TIME_SCALE: [number, number][] = [[0, 0], [4, 25], [12, 50], [24, 70], [48, 85], [72, 100]]

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

export function fmtRange(r: { min: number; max: number }, digits = 0): string {
  const f = (n: number) => (digits ? n.toFixed(digits) : String(Math.round(n * 10) / 10))
  return r.min === r.max ? f(r.min) : `${f(r.min)}–${f(r.max)}`
}
