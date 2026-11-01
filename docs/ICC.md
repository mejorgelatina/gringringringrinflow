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

## icc score and bands (`lib/icc/score.ts`)

jor's definition (2026-11-01): a 0–100 score from three factors, and three bands that decide which part of the network sees the lot.

| factor | from | scale (placeholder) |
| --- | --- | --- |
| tiempo · vida útil restante | hours since preparation (declared "hecho hace 2 horas", or estimated from "fresco / del día" ≈ 6 h, "de ayer" ≈ 24 h) against `SHELF_LIFE_HOURS` by category and storage | `TIME_SCALE`: 0 h → 0, 4 h → 25, 12 h → 50, 24 h → 70, 48 h → 85, ≥ 72 h → 100 |
| integridad y empaque | photo grade and visible issues, damage the donor mentions, declared packaging (sellado, empacado) | no visible issues 100 · sealed, no photo 85 · minor damage 55 · severe damage or inedible 0 |
| historial térmico | declared storage for perishables (lácteos, proteína, prepared food) | cold chain declared 100 · ambient 15 · not perishable 100 (rule) |

- Weights: **provisional equal thirds** (`ICC_WEIGHTS`, `ICC_WEIGHTS_STATUS = "provisional"`), pending jor's decision. Set a weight to null and the score turns off.
- A factor with no evidence counts as 50 (neutral). The record also shows the range the score could take once it is known (unknown = 0 … unknown = 100).
- Every factor keeps its value, provenance and basis, so a score can be taken apart.

| band | score | who sees it |
| --- | --- | --- |
| alto | 80–100 | food banks and high-capacity kitchens (and every people destination) |
| medio | 40–79 | only kitchens and shelters that prepare the same day, in zone a (short ETA). A receiver can opt out with `need.iccBands: ["alto"]` (demo: casa hogar narvarte) |
| bajo | 0–39 | out of the food route: transformation or compost (the cascade continues) |

Safety gates. The score only pushes a lot down, never up past the rules:
- inedible or past prime → capped at 39 (bajo);
- condition unconfirmed → band `pendiente` until the donor or a person confirms it, whatever the number says;
- no `alto` while any factor is missing, or while the condition is not declared or verified.

What the score is not: a food-safety certification. It orders and filters what the network offers, with the evidence it has; it does not show temperature, contamination or storage history that nobody recorded. "grinflow audited food safety" is not a claim the product can make; "grinflow recorded what was declared, estimated, measured and verified, and who approved" is.

## what is placeholder

- `UNIT_REFERENCES` in `lib/icc/spec.ts`: kg and m³ per box, crate, sack or container. Demo values, not measured. They must be calibrated against scale readings per donor and package type.
- `ICC_WEIGHTS`: provisional equal thirds. `ICC_BANDS` (80 / 40) come from jor's examples.
- `SHELF_LIFE_HOURS`, `TIME_SCALE` and the integrity and thermal points: demo values, to be replaced with food-safety criteria.
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

1. Final factor weights and scales; whether bands 80/40 hold; the shelf-life table by product and storage (needs a food-safety specialist).
2. Who may mark a value verificado (operator, receiver, a sanitary authority) and with what evidence.
3. Whether people routes may plan with an estimated weight, or must wait for a declared one.
4. Unit references per donor (a bakery's box is not a supermarket's box).
5. Temperature/time decay curves per product (jor's "motor de decaimiento"): the time factor is a step toward it, not the curve.
6. Immutable audit trail: who approved what, with the ICC at that moment. Today runs are sealed and signed (`lib/agent/state.ts`) and persistence is optional Firestore; there are no database triggers or RLS in grinflow yet.
7. Allocation across several vehicles and receivers at once (knapsack + routing): today each delivery option is checked per vehicle and a lot is split by waves, not optimized jointly.
