import { composite, ICC_SPEC_VERSION, PLANNING_POLICY, UNIT_REFERENCES, type UnitReference } from "./spec.ts"
import type { Assessed, Channel, Condition, DestinationEligibility, Evidence, IccRecord, MissingField, Provenance, Range, RiskFlag, Tier } from "./types.ts"

// One function turns what a channel collected into an ICC record. WhatsApp, /send, /intake, /agent and
// /network all reach it through `processIntake`, the agent tools or `characterizeResource`, so a lot is
// characterized the same way wherever it entered. It is deterministic and calls no model: models only
// contribute evidence (an extraction, a photo assessment) that arrives here already checked.

/** The offer as the channels extract it. Structurally the same as `Supply` in lib/intake/process.ts. */
export type IccSupply = {
  item?: string | null
  category: string | null
  quantity: number | null
  unit?: string | null
  quantityBasis: "stated" | "estimated" | "confirmed" | null
  /** Where an estimated count came from. A count read off a photo is never "stated". */
  quantitySource?: "texto" | "foto" | "operador" | null
  condition: Condition
  deadlineHour: number | null
  location: string | null
  /** A weight someone measured or checked, recorded by an operator or at a handoff. */
  measuredKg?: { kg: number; provenance: "medido" | "verificado"; by: string; at: string } | null
}

/** Only what the photo policy produces; the raw image is never kept. */
export type IccPhoto =
  | { status: "assessed"; model: string | null; assessment: { visible_items: { item: string; approx_count: number | null; packaging: string | null }[]; visible_issues: { issue: string; note: string }[]; visual_grade: string; image_quality: string } }
  | { status: "failed"; model: string | null }

export type IccCondition = {
  stated: Condition
  observed: string
  humanConfirmed: { condition: Condition; reviewer: string; at: string } | null
  effective: Condition
}

export type CharacterizeInput = {
  channel: Channel
  /** Everything the donor wrote, joined. Quotes used as evidence must be substrings of it. */
  text: string
  supply: IccSupply
  photo?: IccPhoto | null
  condition?: IccCondition | null
  receivedAt?: string
  now?: () => string
  /** Attributes the donor stated (limpia, seca…), as the network reads them. */
  attributes?: string[]
  material?: string | null
}

const norm = (s: string) => s.toLocaleLowerCase("es-MX").normalize("NFD").replace(/[̀-ͯ]/g, "")
const APPROX = /\bcomo\b|aprox|mas o menos|alrededor de|cerca de|about|around|roughly|\bunos\b|\bunas\b|~/
const COUNT_UNITS: [RegExp, string][] = [
  [/^cajas?$|^box(es)?$/, "caja"], [/^piezas?$/, "pieza"], [/^costal(es)?$/, "costal"], [/^bolsas?$/, "bolsa"], [/^cubetas?$/, "cubeta"],
  [/^botes?$/, "bote"], [/^contenedor(es)?$/, "contenedor"], [/^charolas?$/, "charola"], [/^despensas?$/, "despensa"], [/^tarimas?$|^pallets?$/, "tarima"],
]
const unitOf = (u: string | null | undefined) => (u ? COUNT_UNITS.find(([re]) => re.test(norm(u)))?.[1] ?? (/^(kg|kilos?|kilogramos?)$/.test(norm(u)) ? "kg" : norm(u)) : null)

function assessed<T>(value: T, provenance: Provenance, method: string, evidence: Evidence[], at: string, extra: Partial<Pick<Assessed<T>, "model" | "validatedBy" | "confidence">> = {}): Assessed<T> {
  const confidence = extra.confidence ?? (provenance === "medido" || provenance === "verificado" ? "alta" : provenance === "declarado" ? "media" : "baja")
  return { value, provenance, confidence, method, model: extra.model ?? null, evidence, validatedBy: extra.validatedBy ?? null, at }
}

/** The exact words a number came from, so a weight always points back to what someone wrote. */
function quoteAround(text: string, index: number, length: number): string {
  return text.slice(Math.max(0, index), index + length).trim()
}

function findWeight(text: string): { kg: number; approx: boolean; quote: string } | null {
  // The newest statement wins: a follow-up "son 40 kg" corrects an earlier "como unos 30 kilos".
  const m = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|kilos?|kilogramos?)\b/gi)].at(-1)
  if (!m || m.index === undefined) return null
  const before = norm(text.slice(Math.max(0, m.index - 22), m.index))
  return { kg: Number(m[1].replace(",", ".")), approx: APPROX.test(before), quote: quoteAround(text, m.index, m[0].length) }
}

function findCount(text: string): { count: number; unit: string; approx: boolean; quote: string } | null {
  const m = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(cajas?|boxes|box|piezas?|costal(?:es)?|bolsas?|cubetas?|botes?|contenedor(?:es)?|charolas?|despensas?|tarimas?|pallets?)\b/gi)].at(-1)
  if (!m || m.index === undefined) return null
  const before = norm(text.slice(Math.max(0, m.index - 22), m.index))
  return { count: Number(m[1].replace(",", ".")), unit: unitOf(m[2])!, approx: APPROX.test(before), quote: quoteAround(text, m.index, m[0].length) }
}

export function referenceFor(category: string | null, item: string | null, unit: string): UnitReference | null {
  const it = norm(item ?? "")
  // An item rule (eggs, prepared food) wins over a category rule: a box of eggs is not a box of bread.
  return (
    UNIT_REFERENCES.find((r) => r.units.includes(unit) && r.match.item && r.match.item.test(it)) ??
    UNIT_REFERENCES.find((r) => r.units.includes(unit) && !r.match.item && (!r.match.category || r.match.category === category)) ??
    null
  )
}

const scale = ([lo, hi]: [number, number], n: number): Range => ({ min: lo * n, max: hi * n, point: ((lo + hi) / 2) * n })

function physical(input: CharacterizeInput, at: string) {
  const { supply, text } = input
  const declaredWeight = findWeight(text)
  const textCount = findCount(text)
  // The extractor may give a count without its unit; the donor's own words supply it.
  const unit = unitOf(supply.unit) ?? (textCount && textCount.count === supply.quantity ? textCount.unit : null)

  // "40 kg de pan en 20 cajas": an extractor may keep 40 and the unit "caja". When the extracted number is the
  // one written next to "kg", it is the weight, and the count comes from the donor's own words.
  const qtyIsWeight = supply.quantity != null && (unit === "kg" || (declaredWeight?.kg === supply.quantity && textCount?.count !== supply.quantity))

  // count: what the donor said, or what a photo suggests (always estimado)
  let count: IccRecord["physical"]["count"] = null
  if (supply.quantity != null && unit && !qtyIsWeight) {
    const fromPhoto = supply.quantitySource === "foto"
    const byOperator = supply.quantityBasis === "confirmed"
    count = assessed(
      { count: supply.quantity, unit },
      byOperator ? "verificado" : fromPhoto || supply.quantityBasis === "estimated" ? "estimado" : "declarado",
      byOperator ? "conteo confirmado por una persona" : fromPhoto ? "conteo aparente en la foto" : supply.quantityBasis === "estimated" ? "cantidad aproximada dicha por el donante" : "cantidad dicha por el donante",
      fromPhoto ? [{ kind: "foto", ref: "foto del donante (no se guarda)" }] : textCount ? [{ kind: "texto", ref: textCount.quote }] : [],
      at,
      { model: fromPhoto && input.photo ? input.photo.model : null },
    )
  } else if (textCount) {
    count = assessed({ count: textCount.count, unit: textCount.unit }, textCount.approx ? "estimado" : "declarado", textCount.approx ? "cantidad aproximada dicha por el donante" : "cantidad dicha por el donante", [{ kind: "texto", ref: textCount.quote }], at)
  }

  // weight: measured > declared in kg > estimated from a unit reference. Never a guess without a reference.
  let weightKg: IccRecord["physical"]["weightKg"] = null
  let reference: UnitReference | null = null
  if (supply.measuredKg) {
    const m = supply.measuredKg
    weightKg = assessed({ min: m.kg, max: m.kg, point: m.kg }, m.provenance, m.provenance === "medido" ? "báscula" : "revisado en sitio por una persona", [{ kind: m.provenance === "medido" ? "bascula" : "inspeccion", ref: `${m.by} · ${m.at}` }], at, { validatedBy: m.by })
  } else if (qtyIsWeight) {
    const approx = supply.quantityBasis === "estimated" || (declaredWeight?.kg === supply.quantity && declaredWeight.approx)
    const q = declaredWeight?.quote ?? `${supply.quantity} kg`
    const kg = supply.quantity!
    weightKg = assessed({ min: kg, max: kg, point: kg }, approx ? "estimado" : "declarado", approx ? "peso aproximado dicho por el donante" : "peso dicho por el donante", [{ kind: "texto", ref: q }], at)
  } else if (declaredWeight) {
    weightKg = assessed({ min: declaredWeight.kg, max: declaredWeight.kg, point: declaredWeight.kg }, declaredWeight.approx ? "estimado" : "declarado", declaredWeight.approx ? "peso aproximado dicho por el donante" : "peso dicho por el donante", [{ kind: "texto", ref: declaredWeight.quote }], at)
  } else if (count) {
    reference = referenceFor(supply.category, supply.item ?? null, count.value.unit)
    if (reference) {
      weightKg = assessed(scale(reference.kg, count.value.count), "estimado", `referencia por unidad (${reference.key}) × conteo ${count.provenance}`, [...count.evidence, { kind: "referencia", ref: `${reference.key}: ${reference.kg.join("–")} kg por ${count.value.unit} · ${reference.note}` }], at, { confidence: "baja" })
    }
  }

  // volume: a photo alone gives no scale, so volume is always estimated from a unit reference
  let volumeM3: IccRecord["physical"]["volumeM3"] = null
  if (count) {
    reference ??= referenceFor(supply.category, supply.item ?? null, count.value.unit)
    if (reference) volumeM3 = assessed(scale(reference.m3, count.value.count), "estimado", `referencia por unidad (${reference.key}) × conteo ${count.provenance}`, [{ kind: "referencia", ref: `${reference.key}: ${reference.m3.join("–")} m³ por ${count.value.unit}` }], at, { confidence: "baja" })
  }
  return { count, weightKg, volumeM3 }
}

function conditionOf(input: CharacterizeInput, at: string): Assessed<Condition> {
  const c = input.condition
  const value = c?.effective ?? input.supply.condition
  if (c?.humanConfirmed) return assessed(value, "verificado", "inspección en sitio", [{ kind: "inspeccion", ref: `${c.humanConfirmed.reviewer} · ${c.humanConfirmed.at}` }], at, { validatedBy: c.humanConfirmed.reviewer })
  if (value === "unknown") {
    const fromPhoto = c && ["past_prime", "inedible", "assessment_failed"].includes(c.observed)
    return assessed(value, fromPhoto ? "estimado" : "declarado", fromPhoto ? `la foto generó una duda (${c!.observed.replaceAll("_", " ")}); requiere inspección` : "nadie ha declarado la condición", fromPhoto ? [{ kind: "foto", ref: "foto del donante (no se guarda)" }] : [], at, { confidence: "baja", model: fromPhoto && input.photo ? input.photo.model : null })
  }
  return assessed(value, "declarado", "condición dicha por el donante", [{ kind: "texto", ref: input.text.slice(0, 160) }], at)
}

function quality(input: CharacterizeInput, at: string) {
  const t = norm(input.text)
  const photo = input.photo
  const visual = photo?.status === "assessed" ? assessed(photo.assessment.visual_grade.replaceAll("_", " "), "estimado", "evaluación visual de la foto; no muestra temperatura ni historial", [{ kind: "foto", ref: "foto del donante (no se guarda)" }], at, { model: photo.model, confidence: photo.assessment.image_quality === "good" ? "media" : "baja" }) : null
  const storageMatch = /(refrigerad[oa]s?|en refri|en fr[ií]o|congelad[oa]s?|a temperatura ambiente|en bodega|en c[aá]mara)/.exec(t)
  const storage = storageMatch ? assessed(storageMatch[1], "declarado", "almacenamiento dicho por el donante", [{ kind: "texto", ref: storageMatch[1] }], at) : null
  const hoursMatch = /(\d+)\s*horas?/.exec(t)
  const hoursSincePrep = hoursMatch && /(prepar|hech|cocin|cosech)/.test(t) ? assessed(Number(hoursMatch[1]), "declarado", "tiempo desde preparación dicho por el donante", [{ kind: "texto", ref: hoursMatch[0] }], at) : null
  const packagingWord = /(empacad[oa]s?|en bolsas?|en cajas?|en charolas?|a granel|en costal(?:es)?)/.exec(t)
  const photoPackaging = photo?.status === "assessed" ? photo.assessment.visible_items.find((v) => v.packaging)?.packaging ?? null : null
  const packaging = packagingWord ? assessed(packagingWord[1], "declarado", "empaque dicho por el donante", [{ kind: "texto", ref: packagingWord[1] }], at) : photoPackaging ? assessed(photoPackaging, "estimado", "empaque visible en la foto", [{ kind: "foto", ref: "foto del donante (no se guarda)" }], at, { model: photo!.model }) : null
  return { condition: conditionOf(input, at), visual, hoursSincePrep, storage, shelfLife: null as null, packaging }
}

function risk(input: CharacterizeInput, q: ReturnType<typeof quality>, p: ReturnType<typeof physical>) {
  const t = norm(input.text)
  const flags: RiskFlag[] = []
  const unknowns: string[] = []
  const pending: string[] = []
  const photo = input.photo
  if (photo?.status === "assessed") for (const i of photo.assessment.visible_issues) flags.push({ code: `foto_${i.issue}`, label: `visible en la foto: ${i.issue.replaceAll("_", " ")}${i.note ? ` (${i.note})` : ""}`, source: "foto" })
  if (photo?.status === "failed") flags.push({ code: "foto_no_evaluada", label: "la foto no se pudo evaluar", source: "foto" })
  if (/devoluci|devuelt/.test(t)) flags.push({ code: "devolucion", label: "producto devuelto: historial de almacenamiento desconocido", source: "texto" })
  if (/desde ayer|de ayer|del dia anterior/.test(t)) flags.push({ code: "mas_de_un_dia", label: "el donante dice que es de ayer", source: "texto" })
  if (q.condition.value === "inedible") flags.push({ code: "no_comestible", label: "condición: no comestible", source: q.condition.provenance === "verificado" ? "inspeccion" : "texto" })
  const cold = PLANNING_POLICY.coldChainCategories.includes(input.supply.category ?? "")
  if (!q.storage) unknowns.push("cómo se almacenó y a qué temperatura")
  if (cold && !q.storage && q.condition.value !== "inedible") flags.push({ code: "cadena_de_frio_desconocida", label: "producto perecedero sin almacenamiento declarado", source: "regla" })
  if (!p.weightKg) unknowns.push("peso total")
  if (!p.volumeM3) unknowns.push("volumen")
  if (!q.hoursSincePrep) unknowns.push("tiempo desde preparación o cosecha")
  if (q.condition.value === "edible" || q.condition.value === "unknown") pending.push("aptitud para consumo humano: la confirma el donante o una persona en sitio; una foto no la demuestra")
  if (p.weightKg && p.weightKg.provenance !== "medido" && p.weightKg.provenance !== "verificado") pending.push("peso en báscula al entregar o recibir")
  if (input.condition && ["past_prime", "inedible", "assessment_failed"].includes(input.condition.observed) && !input.condition.humanConfirmed) pending.push("inspección en sitio por la duda que generó la foto")
  return { flags, unknowns, pendingVerifications: pending }
}

function missingFields(input: CharacterizeInput, q: ReturnType<typeof quality>, p: ReturnType<typeof physical>): MissingField[] {
  const s = input.supply
  const out: MissingField[] = []
  const photoDoubt = input.condition && ["past_prime", "inedible", "assessment_failed"].includes(input.condition.observed) && !input.condition.humanConfirmed
  if (!s.category) out.push({ field: "category", why: s.item ? `"${s.item}" no tiene categoría de la red todavía (pan, verdura, fruta, lácteos, abarrotes, proteína, orgánico)` : "no sabemos qué producto es", askWho: "donor" })
  if (!p.count && !p.weightKg) out.push({ field: "quantity", why: "no hay cantidad ni peso", askWho: "donor" })
  else if (p.count && p.count.provenance === "estimado" && !p.weightKg?.provenance.match(/declarado|medido|verificado/)) out.push({ field: "quantity", why: p.count.method, askWho: "donor" })
  if (!p.weightKg) out.push({ field: "weight", why: p.count ? `no hay referencia de peso para "${p.count.value.unit}" de este producto` : "sin cantidad no se puede estimar el peso", askWho: "donor" })
  if (!s.location) out.push({ field: "location", why: "falta el punto de recolección", askWho: "donor" })
  if (s.deadlineHour == null) out.push({ field: "deadline_hour", why: "falta la hora límite de recolección", askWho: "donor" })
  if (q.condition.value === "unknown") out.push({ field: "condition", why: q.condition.method, askWho: photoDoubt ? "operator" : "donor" })
  if (PLANNING_POLICY.coldChainCategories.includes(s.category ?? "") && !q.storage && q.condition.value !== "inedible") out.push({ field: "storage", why: "perecedero: hace falta saber si estuvo refrigerado", askWho: "donor" })
  return out
}

function eligibility(input: CharacterizeInput, q: ReturnType<typeof quality>, r: ReturnType<typeof risk>): Record<Tier, DestinationEligibility> {
  const s = input.supply
  const c = q.condition
  const organic = s.category === "organico"
  const severePhoto = r.flags.some((f) => /^foto_(mold|rot_or_decay|pests|leak_or_spill)$/.test(f.code))
  const photoDoubt = input.condition && ["past_prime", "inedible", "assessment_failed"].includes(input.condition.observed) && !input.condition.humanConfirmed
  const attrs = input.attributes ?? []

  let people: DestinationEligibility
  if (organic) people = { status: "no_elegible", reasons: ["no es alimento para personas"], needs: [] }
  else if (c.value === "inedible" || c.value === "past_prime") people = { status: "no_elegible", reasons: [`condición ${c.value.replaceAll("_", " ")} (${c.provenance})`], needs: [] }
  else if (photoDoubt || severePhoto) people = { status: "condicionado", reasons: ["la foto generó una duda sobre la condición"], needs: ["inspección en sitio por una persona"] }
  else if (c.value === "unknown") people = { status: "condicionado", reasons: ["nadie ha declarado la condición"], needs: ["que el donante declare la condición, o una inspección"] }
  else if (PLANNING_POLICY.coldChainCategories.includes(s.category ?? "") && !q.storage) people = { status: "condicionado", reasons: ["perecedero sin almacenamiento declarado"], needs: ["que el donante diga si estuvo refrigerado"] }
  else people = { status: "elegible", reasons: [`condición ${c.provenance === "verificado" ? "verificada por una persona" : "declarada por el donante"}; grinflow no certifica inocuidad`], needs: [] }

  const material = input.material ?? (/(cascaras? de huevo|eggshell|cascara de cebolla|hueso de aguacate|bagazo|posos? de cafe)/.exec(norm(`${s.item ?? ""} ${input.text}`))?.[1] ?? null)
  let transformation: DestinationEligibility
  if (c.value === "edible") transformation = { status: "condicionado", reasons: ["es comida apta: la cascada la ofrece primero a personas"], needs: [] }
  else if (c.value === "unknown") transformation = { status: "condicionado", reasons: ["condición desconocida: podría ser comida para personas"], needs: ["confirmar la condición primero"] }
  else if (!material) transformation = { status: "no_elegible", reasons: ["sin material identificado para un maker"], needs: ["nombrar el material (p. ej. cáscara de huevo)"] }
  else if (attrs.includes("mezclado")) transformation = { status: "no_elegible", reasons: [`${material} mezclado con otros residuos`], needs: ["separar por material"] }
  else if (!attrs.length) transformation = { status: "condicionado", reasons: [`material identificado: ${material}`], needs: ["declarar especificaciones (limpia, seca, sin residuo, molida)"] }
  else transformation = { status: "elegible", reasons: [`material ${material}, especificaciones declaradas: ${attrs.join(", ")}`], needs: [] }

  const compostable = organic || ["panificados", "verduras", "frutas", "proteina", "lacteos"].includes(s.category ?? "")
  let compost: DestinationEligibility
  if (!compostable) compost = { status: "no_elegible", reasons: [s.category ? `${s.category} no es material compostable` : "categoría desconocida"], needs: s.category ? [] : ["saber qué producto es"] }
  else if (c.value === "edible") compost = { status: "condicionado", reasons: ["es comida apta: composta es el último destino de la cascada"], needs: [] }
  else if (c.value === "unknown") compost = { status: "condicionado", reasons: ["condición desconocida: podría ser comida para personas"], needs: ["confirmar la condición primero"] }
  else compost = { status: "elegible", reasons: ["orgánico no apto para personas"], needs: /empacad/.test(norm(input.text)) ? ["retirar empaque antes de compostar"] : [] }

  return { people, transformation, compost }
}

const nowIso = () => new Date().toISOString()

export function characterize(input: CharacterizeInput): IccRecord {
  const at = (input.now ?? nowIso)()
  const p = physical(input, at)
  const q = quality(input, at)
  const r = risk(input, q, p)
  const base: Omit<IccRecord, "composite"> = {
    spec: ICC_SPEC_VERSION,
    channel: input.channel,
    receivedAt: input.receivedAt ?? at,
    structuredAt: at,
    product: { item: input.supply.item ?? null, category: input.supply.category, material: input.material ?? null, packaging: q.packaging },
    quality: { condition: q.condition, visual: q.visual, hoursSincePrep: q.hoursSincePrep, storage: q.storage, shelfLife: null },
    risk: r,
    physical: p,
    missing: missingFields(input, q, p),
    eligibility: eligibility(input, q, r),
  }
  return { ...base, composite: composite(base) }
}

/** The weight the network plans with, and whether it is only an estimate. Null when nothing supports a number. */
export function planningWeight(icc: IccRecord): { kg: number; provenance: Provenance; range: Range } | null {
  const w = icc.physical.weightKg
  if (!w) return null
  if (w.provenance === "estimado" && !PLANNING_POLICY.planWithEstimatedWeight) return null
  return { kg: Math.round(w.value.point * 10) / 10, provenance: w.provenance, range: w.value }
}

/** Fills a missing count from a photo. The count stays estimado and the donor is asked to confirm it. */
export function countFromPhoto<S extends IccSupply>(supply: S, photo: IccPhoto | null | undefined): S {
  if (supply.quantity != null || photo?.status !== "assessed") return supply
  const items = photo.assessment.visible_items.filter((v) => v.approx_count != null && v.approx_count > 0)
  if (!items.length) return supply
  const count = items.reduce((n, v) => n + (v.approx_count ?? 0), 0)
  const pack = items.find((v) => v.packaging)?.packaging ?? ""
  const unit = /caja|box/i.test(pack) ? "caja" : /contenedor|container|tray|charola/i.test(pack) ? "contenedor" : /costal|sack|bag|bolsa/i.test(pack) ? "costal" : "unidad"
  return { ...supply, quantity: count, unit, quantityBasis: "estimated", quantitySource: "foto" }
}
