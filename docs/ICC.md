# icc · índice de calidad compuesto (`lib/icc/`)

ICC is grinflow's standard characterization of a lot. It takes whatever arrived (a WhatsApp message, a photo, a form, a voice note transcript, an operator's inspection, a scale reading) and produces one structured record that the network engine can act on and a person can audit.

It is a core capability, not a chat feature: every channel reaches it.

```
whatsapp · /send · /intake ──► processIntake ─┐
/agent (tools, one step at a time) ───────────┼──► characterize() ──► IccRecord ──► evaluateSupply ──► network engine
/network (lots already in the network) ───────┘     lib/icc/characterize.ts          lib/network/supply.ts
```

Models contribute evidence (an extraction, a photo assessment). `characterize` is deterministic and calls no model.

## the record (`lib/icc/types.ts`)

Four dimensions. Every value is an `Assessed<T>`: `value`, `provenance`, `confidence`, `method`, `model` (name and version, or null), `evidence[]` (exact quote, photo, reference, scale, inspection), `validatedBy`, `at`.

| dimension | fields |
| --- | --- |
| product | item, category, material, packaging |
| quality | condition, visual (what a photo shows), hours since preparation, storage, shelf life (not estimated yet) |
| risk | flags (from photo, text or rules), unknowns, pending verifications |
| physical | count + unit, weight kg (range + planning point), volume m³ (range) |

Plus: `missing` (what to ask, and whether the donor or an operator can answer), `eligibility` per destination, and `composite`.

### provenance

| state | meaning | example |
| --- | --- | --- |
| declarado | someone said it; not checked | "120 kg" in a message |
| estimado | computed or inferred | 95–110 kg from 20 boxes × a unit reference; 1.8 m³ from a photo count |
| medido | read from an instrument and recorded | 103 kg on the receiver's scale |
| verificado | a named person checked it on site | operator confirms 37 kg at pickup |

A value never moves up this list on its own. Only a person (`confirmIntake`, the agent's `inspection` action) or an instrument (`confirmReceipt` in the network) moves it. Confidence is rule-based, not a probability: medido/verificado → alta, declarado → media, estimado → baja.

### weight

- A count is not a weight. "20 cajas" is never 20 kg (PR #11 assumed one unit ≈ one kg; that assumption is gone).
- Order: measured or verified → declared in kg → estimated from a unit reference × count → **unknown**. With no reference for that unit and product, there is no estimate: the engine gets `weight_unknown` and the agent asks the donor.
- A photo can give an approximate count (`quantitySource: "foto"`, always estimado) and, with a unit reference, a volume and weight range. It never gives a weight by itself.
- The network plans with the point of an estimated range and shows `weight_estimated` until someone weighs it (`PLANNING_POLICY.planWithEstimatedWeight`). Set it to false and an estimate blocks like an unknown weight.

## eligibility for the three destinations

Preliminary, per lot. The network engine still decides with capacity, zones, windows and logistics. Statuses: `elegible`, `condicionado` (with what it needs), `no_elegible`.

| destination | elegible when | condicionado when | no elegible when |
| --- | --- | --- | --- |
| personas | condition edible, declared by the donor or verified by a person, no doubt from the photo, and (for lácteos, proteína) storage declared | condition unknown; photo raised a doubt; perishable with no storage declared | organic waste; past prime or inedible |
| transformación | not food for people, material identified (cáscara de huevo, cáscara de cebolla…), specs declared (limpia, seca…) | edible (cascade offers people first); unknown condition; material without specs | no material identified; mixed with other waste |
| composta | organic or food not fit for people | edible (last in the cascade); unknown condition | not compostable (e.g. oil) |

grinflow never certifies food safety. "elegible" for people means the donor or a person stated the condition; the reason text says so. A photo cannot show temperature, microbiological contamination or storage history.

## composite index

`composite()` keeps the components (identity, condition + provenance, photo grade, risk flags, pending checks, weight and volume with provenance) and returns **no score**. The formula, scales and weights (`ICC_WEIGHTS` in `lib/icc/spec.ts`) are a product decision that has not been made; they are `null` on purpose. A score of 82 means nothing until it is specified and can be audited.

## what is placeholder

- `UNIT_REFERENCES` in `lib/icc/spec.ts`: kg and m³ per box, crate, sack or container. Demo values, not measured. They must be calibrated against scale readings per donor and package type.
- `ICC_WEIGHTS`: null.
- Shelf life: not estimated.
- Cold-chain categories: lácteos, proteína (`PLANNING_POLICY.coldChainCategories`).

## the agent and ICC

- `extract_event` and `assess_photo` rebuild the ICC record (`refreshIcc`); the planner sees it with provenance (`iccSummary`).
- `ask_donor` accepts `weight` and `storage`, only while they are actually missing or estimated.
- `propose_match` is refused in code when the rationale states kilos and no weight is known, or states an estimated weight as fact (must say "~" or "estimado"). The local claims check also requires a number to keep its unit ("50 cajas" is not supported by "30–50 kg").
- A photo with no count: the agent says what it saw and asks once for count and weight: "por la foto identifico aproximadamente 12 contenedores. puedo estimar el volumen, pero no tengo el peso confirmado. ¿cuántos son, y tienen el peso total o lo registramos como estimado?"
- An operator's inspection can record the weight checked on site (`weightKg` → verificado).

## test scenarios (`tests/icc.test.ts`)

1. declared weight and count → declarado, reaches the network with that weight.
2. photo, no count or weight → count and weight estimado (from the photo + a reference), condition unknown, everything missing listed; every network row blocked with reasons.
3. approximate count → count, weight and volume estimado; evaluated but not committed.

In all three, no value is medido or verificado unless a person or an instrument made it so.

## not built yet (P1, P2)

- Evaluation history per lot (each `IccRecord` is a snapshot; the agent and `/intake` keep only the latest).
- Calibration of references and of ICC against measurements and verified outcomes (receipts already record received kg).
- Audio input: `Channel` has `audio`, but no channel transcribes voice notes yet.
- Quality prediction and industrial use.

## open decisions for the product spec

1. Composite formula, scales per component, weights, and the eligibility thresholds that use them.
2. Who may mark a value verificado (operator, receiver, a sanitary authority) and with what evidence.
3. Whether people routes may plan with an estimated weight, or must wait for a declared one.
4. Unit references per donor (a bakery's box is not a supermarket's box).
