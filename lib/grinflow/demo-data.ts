import type { Actor, Destination, Offer, Vehicle } from "./types.ts"

// Synthetic data for the demo. Places, distances and availability are invented, not real.

export const DEMO_DAY = "2026-11-03"
const at = (hhmm: string) => `${DEMO_DAY}T${hhmm}:00.000Z`

export const DEMO_ACTORS: Record<string, Actor> = {
  donor: { id: "donor-panaderia-roma", role: "donor", name: "Panadería La Espiga (demo)" },
  operator: { id: "op-ana", role: "operator", name: "Ana, coordinación (demo)" },
  driver: { id: "driver-luis", role: "driver", name: "Luis, transportista (demo)" },
}

// What the extractor would produce from the message: some fields reported, some missing.
export function demoOffer(): Offer {
  return {
    id: "offer-001",
    donorId: DEMO_ACTORS.donor.id,
    rawMessage: "Hola, tengo 40 cajas de pan del día. Se puede recoger hoy de 18 a 20.",
    product: { value: "pan del día", status: "reported", source: "message" },
    category: { value: "panaderia", status: "reported", source: "message" },
    quantity: { value: 40, status: "reported", source: "message" },
    unit: { value: "cajas", status: "reported", source: "message" },
    weightKg: { value: null, status: "missing", source: null },
    condition: { value: null, status: "missing", source: null },
    pickupLocation: { value: { lat: 19.4194, lng: -99.1617 }, status: "confirmed", source: "donor_profile" },
    pickupWindow: { value: { start: at("18:00"), end: at("20:00") }, status: "reported", source: "message" },
  }
}

export const DEMO_DESTINATIONS: Destination[] = [
  {
    id: "dest-comedor-doctores",
    name: "Comedor comunitario Doctores",
    use: "human_consumption",
    acceptedCategories: ["panaderia", "fruta_verdura", "abarrotes"],
    capacityKg: 150,
    location: { lat: 19.4167, lng: -99.1453 },
    receivingWindow: { start: at("17:00"), end: at("21:00") },
    acceptsConditions: ["good", "near_expiry"],
  },
  {
    id: "dest-albergue-norte",
    name: "Albergue Norte",
    use: "human_consumption",
    acceptedCategories: ["panaderia", "lacteos"],
    capacityKg: 50,
    location: { lat: 19.4890, lng: -99.1270 },
    receivingWindow: { start: at("08:00"), end: at("19:00") },
    acceptsConditions: ["good"],
  },
  {
    id: "dest-compostaje-iztapalapa",
    name: "Planta de compostaje Iztapalapa",
    use: "valorization",
    acceptedCategories: ["panaderia", "fruta_verdura", "preparados"],
    capacityKg: 2000,
    location: { lat: 19.3570, lng: -99.0590 },
    receivingWindow: { start: at("06:00"), end: at("22:00") },
    acceptsConditions: ["good", "near_expiry", "damaged", "unknown"],
  },
]

export const DEMO_VEHICLES: Vehicle[] = [
  {
    id: "veh-van-luis",
    label: "Van de Luis (ruta de retorno)",
    capacityKg: 400,
    location: { lat: 19.4270, lng: -99.1677 },
    availableWindow: { start: at("18:30"), end: at("21:00") },
    availabilityConfirmed: true,
    refrigerated: false,
  },
  {
    id: "veh-moto-carga",
    label: "Moto de carga",
    capacityKg: 40,
    location: { lat: 19.4150, lng: -99.1600 },
    availableWindow: { start: at("16:00"), end: at("22:00") },
    availabilityConfirmed: true,
    refrigerated: false,
  },
  {
    id: "veh-camioneta-banco",
    label: "Camioneta del banco de alimentos",
    capacityKg: 1500,
    location: { lat: 19.3900, lng: -99.1200 },
    availableWindow: { start: at("17:00"), end: at("20:00") },
    availabilityConfirmed: false,
    refrigerated: true,
  },
]

// Donor answers for the scripted walkthrough, in the order the questions are opened.
export const DEMO_ANSWERS: Record<string, string> = {
  quantity: "si",
  weightKg: "60",
  condition: "good",
  pickupWindow: "si",
}
