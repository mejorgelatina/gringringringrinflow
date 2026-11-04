// Documented estimation factors (E7). CO2 and water are estimated ONLY from these; the UI shows
// the values, the source and the assumptions verbatim. Both factors describe prevention (food
// eaten by people instead of wasted), so they apply to people-tier kilos only; transformation
// and compost kilos are reported as landfill diversion without CO2 claims.

export type ImpactFactor = {
  /** Units of avoided impact per verified kg. */
  perKg: number;
  unit: string;
  source: string;
  sourceUrl: string;
  assumptions: string[];
};

export const CO2_FACTOR: ImpactFactor = {
  perKg: 4.0,
  unit: "kg CO2e",
  source: "WRAP: each tonne of food waste prevented avoids nearly 4 tonnes of CO2e (UK Food and Drink Pact reporting).",
  sourceUrl: "https://www.wrap.ngo/",
  assumptions: [
    "UK food mix, 2009-2026 reporting lineage (3.8-4.4 range; we use 4.0).",
    "Counts production-chain emissions of food that did not need replacing.",
    "Applies to people-tier rescue only, on verified received kilos.",
  ],
};

export const WATER_FACTOR: ImpactFactor = {
  perKg: 190,
  unit: "litros de agua azul",
  source: "FAO Food Wastage Footprint (2013): 1.3 Gt of edible waste carry ~250 km3 of blue water, about 192 L/kg; we use 190.",
  sourceUrl: "https://www.fao.org/3/i3347e/i3347e.pdf",
  assumptions: [
    "Global average mix across all foods; single products vary enormously (sugar ~200, beef ~15,000 L/kg).",
    "Blue water only (surface and groundwater).",
    "Applies to people-tier rescue only, on verified received kilos.",
  ],
};
