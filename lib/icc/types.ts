// ICC · índice de calidad compuesto. The standard characterization of one lot, built from whatever
// arrived (text, photo, audio transcript, a form, a scale, an inspection). It never stores only a final
// number: every value keeps where it came from, how it was obtained and how sure we are, so a later
// reader can audit it and a later measurement can correct it.

/**
 * How a value is known. The order matters: a value never moves up this list on its own.
 * - declarado: someone said it (donor message, form field). Not checked.
 * - estimado: computed or inferred (from a photo, a unit reference, an approximate statement).
 * - medido: read from an instrument (scale, thermometer) and recorded.
 * - verificado: a named person checked it on site.
 */
export type Provenance = "declarado" | "estimado" | "medido" | "verificado"

/** Rule-based, not a probability. alta: measured or verified. media: declared plainly. baja: estimated or approximate. */
export type Confidence = "alta" | "media" | "baja"

export type Channel = "whatsapp" | "web" | "agent" | "intake" | "network" | "audio"

export type EvidenceKind = "texto" | "foto" | "audio" | "formulario" | "bascula" | "inspeccion" | "referencia"

/** One piece of evidence behind a value. `ref` is the exact quote, or an id for a photo or a record. */
export type Evidence = { kind: EvidenceKind; ref: string }

export type Assessed<T> = {
  value: T
  provenance: Provenance
  confidence: Confidence
  /** How the value was obtained, in a few words ("unit reference × stated count"). */
  method: string
  /** Model and version that produced it, or null for rules and people. */
  model: string | null
  evidence: Evidence[]
  /** Who validated it, for medido and verificado. */
  validatedBy: string | null
  at: string
}

export type Range = { min: number; max: number; /** the single value planning uses; always inside the range */ point: number }

export type Condition = "edible" | "past_prime" | "inedible" | "unknown"

export type RiskFlag = { code: string; label: string; source: EvidenceKind | "regla" }

/** What is still missing for this lot, in the order the agent should ask. Only fields a person can answer. */
export type MissingField = {
  field: "quantity" | "weight" | "category" | "location" | "deadline_hour" | "condition" | "storage" | "material_specs"
  why: string
  /** Who can resolve it: the donor in a message, or a person on site. */
  askWho: "donor" | "operator"
}

export type Tier = "people" | "transformation" | "compost"

/**
 * ICC's preliminary view per destination. The network engine still decides with capacity, zones and
 * windows; this says whether the lot itself qualifies, and what would make it qualify.
 */
export type DestinationEligibility = {
  status: "elegible" | "condicionado" | "no_elegible"
  reasons: string[]
  /** What would move it to elegible (a declaration, an inspection, a measurement). */
  needs: string[]
}

export type IccRecord = {
  /** Spec version, so records stay comparable when the rules change. */
  spec: string
  channel: Channel
  receivedAt: string
  structuredAt: string

  product: {
    item: string | null
    category: string | null
    material: string | null
    packaging: Assessed<string> | null
  }
  quality: {
    condition: Assessed<Condition>
    /** What a photo shows, if one was assessed. Never more than "no visible issues". */
    visual: Assessed<string> | null
    /** Hours since preparation or harvest, only when someone said it. */
    hoursSincePrep: Assessed<number> | null
    storage: Assessed<string> | null
    /** Not estimated yet: needs product rules that are not specified. */
    shelfLife: null
  }
  risk: {
    flags: RiskFlag[]
    /** Facts nobody has established yet, written so a person understands them. */
    unknowns: string[]
    /** Checks that only a person or an instrument can do. */
    pendingVerifications: string[]
  }
  physical: {
    count: Assessed<{ count: number; unit: string }> | null
    weightKg: Assessed<Range> | null
    volumeM3: Assessed<Range> | null
  }
  missing: MissingField[]
  eligibility: Record<Tier, DestinationEligibility>
  composite: CompositeIndex
}

export type IccBand = "alto" | "medio" | "bajo"

/** The ICC score (0–100) and its band. See lib/icc/score.ts and docs/ICC.md. */
export type CompositeIndex = {
  score: number | null
  /** What the score could be once the missing factors are known (unknown = 0 … unknown = 100). */
  range: { min: number; max: number } | null
  /** "pendiente" while the condition is unconfirmed: the band waits for the donor or an inspection. */
  band: IccBand | "pendiente" | null
  status: "pendiente_especificacion" | "calculado"
  weights: "provisional" | "definitiva"
  reason: string
  factors: { factor: "tiempo" | "integridad" | "termico"; value: number | null; provenance: Provenance | null; basis: string }[]
  /** Signals kept for audit even when they are not part of the score. */
  components: { dimension: "product" | "quality" | "risk" | "physical"; signal: string; value: string }[]
}
