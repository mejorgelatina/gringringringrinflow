import { acceptQuote, chooseDelivery, confirmCapacity, confirmReceipt, deliveryChoices, publish, recordPickup, reserve, tick } from "./coordinator.ts"
import type { Ms, Network, NetworkCase, Participant, Resource, Vehicle } from "./types.ts"

// Synthetic pilot network in a bounded region of mexico city. Every place, name, price and time is invented.
// Transport quotes are simulated; no courier, whatsapp or meta api is called.

export const DEMO_DAY = "2026-11-03" // a tuesday
export const at = (hhmm: string): Ms => Date.parse(`${DEMO_DAY}T${hhmm}:00-06:00`)
const H = (h: number, m = 0) => h * 60 + m
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

export const DEMO_PARTICIPANTS: Participant[] = [
  // generators: each one activates an impact zone around it (discovery radius, not a feasibility rule)
  {
    id: "don-espiga", name: "panadería la espiga", roles: ["donor"], location: { lat: 19.4194, lng: -99.1617 }, area: "roma norte", verified: true, whatsappOptIn: true,
    generator: { impactRadiusKm: 5, streams: [{ id: "pan", item: "pan del día", category: "panificados", condition: "edible", attributes: ["empacado"], kgPerWeek: 140, frequency: "diaria", typicalWindow: { from: H(17), to: H(19, 30) } }] },
  },
  {
    id: "don-jacaranda", name: "restaurante casa jacaranda", roles: ["donor"], location: { lat: 19.412, lng: -99.171 }, area: "condesa", verified: true, whatsappOptIn: true,
    generator: { impactRadiusKm: 5, streams: [
      { id: "cascara", item: "cáscara de huevo", category: "organico", material: "cáscara de huevo", condition: "inedible", attributes: ["limpia", "seca", "sin residuo"], kgPerWeek: 12, frequency: "semanal", typicalWindow: { from: H(11), to: H(14) } },
      { id: "cocina", item: "recortes de cocina", category: "organico", condition: "inedible", attributes: ["mezclado"], kgPerWeek: 70, frequency: "diaria", typicalWindow: { from: H(12), to: H(15) } },
    ] },
  },
  {
    id: "don-medellin", name: "mercado medellín · local 32", roles: ["donor"], location: { lat: 19.408, lng: -99.165 }, area: "roma sur", verified: true, whatsappOptIn: true,
    generator: { impactRadiusKm: 5, streams: [
      { id: "organico", item: "cáscaras mixtas de fruta y verdura", category: "organico", condition: "inedible", attributes: ["mezclado"], kgPerWeek: 245, frequency: "diaria", typicalWindow: { from: H(12, 30), to: H(15) } },
      { id: "verdura", item: "verdura del día", category: "verduras", condition: "edible", attributes: [], kgPerWeek: 105, frequency: "diaria", typicalWindow: { from: H(14), to: H(17) } },
    ] },
  },
  {
    id: "don-hotel", name: "hotel alameda", roles: ["donor"], location: { lat: 19.4355, lng: -99.1465 }, area: "juárez", verified: true, whatsappOptIn: true,
    generator: { impactRadiusKm: 5, streams: [
      { id: "pan", item: "pan del desayuno", category: "panificados", condition: "edible", attributes: ["empacado"], kgPerWeek: 42, frequency: "diaria", typicalWindow: { from: H(12), to: H(15) } },
      { id: "cascara", item: "cáscara de huevo", category: "organico", material: "cáscara de huevo", condition: "inedible", attributes: ["limpia", "seca", "sin residuo"], kgPerWeek: 8, frequency: "semanal", typicalWindow: { from: H(11), to: H(14) } },
      { id: "cocina", item: "orgánico de cocina", category: "organico", condition: "inedible", attributes: ["mezclado"], kgPerWeek: 84, frequency: "diaria", typicalWindow: { from: H(13), to: H(16) } },
      { id: "aceite", item: "aceite de cocina usado", category: "aceite", condition: "inedible", attributes: ["filtrado"], kgPerWeek: 10, frequency: "semanal", typicalWindow: { from: H(10), to: H(13) } },
    ] },
  },
  {
    id: "don-super", name: "súper del valle", roles: ["donor"], location: { lat: 19.389, lng: -99.163 }, area: "del valle", verified: true, whatsappOptIn: true,
    generator: { impactRadiusKm: 5, streams: [
      { id: "pan", item: "pan de caja por caducar", category: "panificados", condition: "edible", attributes: ["empacado"], kgPerWeek: 21, frequency: "diaria", typicalWindow: { from: H(14), to: H(18) } },
      { id: "merma", item: "merma de frutas y verduras", category: "organico", condition: "past_prime", attributes: ["mezclado"], kgPerWeek: 120, frequency: "diaria", typicalWindow: { from: H(9), to: H(12) } },
      { id: "devoluciones", item: "huevo devuelto en mal estado", category: "proteina", condition: "unknown", attributes: [], kgPerWeek: 15, frequency: "eventual", typicalWindow: { from: H(10), to: H(13) } },
    ] },
  },

  // tier 1 · people
  {
    id: "rec-doctores", name: "comedor comunitario doctores", roles: ["receiver"], location: { lat: 19.4167, lng: -99.1453 }, area: "doctores", verified: true, whatsappOptIn: true,
    need: { tier: "people", categories: ["panificados", "frutas", "verduras", "abarrotes"], conditions: ["edible"], requires: [], minKg: 5, maxKg: 40, weeklyCapacityKg: 300, usedThisWeekKg: 120, receiving: { days: [1, 2, 3, 4, 5, 6], from: H(13), to: H(20) }, selfPickup: true, selfPickupMaxMinutes: 30, notes: "recoge con su propia camioneta" },
  },
  {
    id: "rec-narvarte", name: "casa hogar narvarte", roles: ["receiver"], location: { lat: 19.396, lng: -99.156 }, area: "narvarte", verified: true, whatsappOptIn: true, serviceRadiusKm: 4,
    need: { tier: "people", categories: ["panificados", "lacteos", "abarrotes"], conditions: ["edible"], requires: [], minKg: 3, maxKg: 15, weeklyCapacityKg: 60, usedThisWeekKg: 10, receiving: { days: EVERY_DAY, from: H(12), to: H(20) }, selfPickup: false, selfPickupMaxMinutes: 0, notes: "sin vehículo; paga envío cuando le conviene" },
  },
  {
    id: "rec-norte", name: "albergue norte", roles: ["receiver"], location: { lat: 19.489, lng: -99.127 }, area: "gustavo a. madero", verified: true, whatsappOptIn: true,
    need: { tier: "people", categories: ["panificados", "lacteos"], conditions: ["edible"], requires: [], minKg: 5, maxKg: 50, weeklyCapacityKg: 200, usedThisWeekKg: 0, receiving: { days: EVERY_DAY, from: H(8), to: H(21) }, selfPickup: true, selfPickupMaxMinutes: 40 },
  },
  {
    id: "rec-esperanza", name: "comedor nueva esperanza", roles: ["receiver"], location: { lat: 19.423, lng: -99.15 }, area: "juárez", verified: false, whatsappOptIn: true,
    need: { tier: "people", categories: ["panificados"], conditions: ["edible"], requires: [], minKg: 2, maxKg: 30, weeklyCapacityKg: 100, usedThisWeekKg: 0, receiving: { days: EVERY_DAY, from: H(9), to: H(20) }, selfPickup: true, selfPickupMaxMinutes: 30, notes: "registro pendiente de validación" },
  },

  // tier 2 · transformation (makers)
  {
    id: "mak-cascara", name: "estudio de biomateriales de cáscara", roles: ["maker"], location: { lat: 19.423, lng: -99.156 }, area: "roma norte", verified: true, whatsappOptIn: true,
    need: { tier: "transformation", categories: ["organico"], materials: ["cáscara de huevo", "eggshell"], conditions: ["inedible", "past_prime"], requires: ["limpia", "seca", "sin residuo"], minKg: 5, maxKg: 50, weeklyCapacityKg: 20, usedThisWeekKg: 0, receiving: { days: [2, 4], from: H(10), to: H(19) }, selfPickup: true, selfPickupMaxMinutes: 25, notes: "carbonato de calcio para bioplásticos; martes y jueves; radio ~4 km" },
  },
  {
    id: "mak-ceramica", name: "taller de cerámica tierra", roles: ["maker"], location: { lat: 19.405, lng: -99.168 }, area: "roma sur", verified: true, whatsappOptIn: true,
    need: { tier: "transformation", categories: ["organico"], materials: ["cáscara de huevo"], conditions: ["inedible"], requires: ["limpia", "seca", "molida"], minKg: 2, maxKg: 10, weeklyCapacityKg: 10, usedThisWeekKg: 0, receiving: { days: EVERY_DAY, from: H(10), to: H(18) }, selfPickup: true, selfPickupMaxMinutes: 20, notes: "esmaltes; solo cáscara ya molida" },
  },
  {
    id: "mak-tinte", name: "colectivo de tinte natural", roles: ["maker"], location: { lat: 19.414, lng: -99.158 }, area: "roma norte", verified: true, whatsappOptIn: true,
    need: { tier: "transformation", categories: ["organico"], materials: ["cáscara de cebolla", "hueso de aguacate"], conditions: ["inedible", "past_prime"], requires: ["separada"], minKg: 1, maxKg: 15, weeklyCapacityKg: 15, usedThisWeekKg: 0, receiving: { days: EVERY_DAY, from: H(10), to: H(18) }, selfPickup: true, selfPickupMaxMinutes: 20, notes: "solo material separado por tipo" },
  },

  // tier 3 · compost
  {
    id: "cmp-guerrero", name: "centro de composta guerrero", roles: ["compost"], location: { lat: 19.44, lng: -99.15 }, area: "guerrero", verified: true, whatsappOptIn: true,
    need: { tier: "compost", categories: ["organico", "verduras", "frutas", "panificados"], conditions: ["edible", "past_prime", "inedible", "unknown"], requires: [], minKg: 2, maxKg: 500, weeklyCapacityKg: 2000, usedThisWeekKg: 400, receiving: { days: EVERY_DAY, from: H(8), to: H(18) }, selfPickup: false, selfPickupMaxMinutes: 0, notes: "recibe en planta" },
  },

  // carriers and operators
  { id: "op-mensajeria", name: "mensajería urbana (simulada)", roles: ["carrier"], location: { lat: 19.415, lng: -99.16 }, area: "roma", verified: true, whatsappOptIn: false },
  { id: "op-luis", name: "luis · camioneta de reparto", roles: ["carrier"], location: { lat: 19.41, lng: -99.175 }, area: "condesa", verified: true, whatsappOptIn: true },
  { id: "op-ana", name: "ana · coordinación grinflow", roles: ["operator"], location: { lat: 19.42, lng: -99.16 }, area: "roma", verified: true, whatsappOptIn: true },
]

export const DEMO_VEHICLES: Vehicle[] = [
  { id: "veh-moto", operatorId: "op-mensajeria", label: "moto de mensajería", kind: "courier", capacityKg: 30, refrigerated: false, available: { start: at("10:00"), end: at("22:00") }, location: { lat: 19.415, lng: -99.16 }, pricing: { baseMxn: 35, perKmMxn: 9 }, simulated: true },
  { id: "veh-van-envio", operatorId: "op-mensajeria", label: "camioneta de envío", kind: "courier", capacityKg: 300, refrigerated: false, available: { start: at("09:00"), end: at("20:00") }, location: { lat: 19.43, lng: -99.17 }, pricing: { baseMxn: 120, perKmMxn: 14 }, simulated: true },
  { id: "veh-luis", operatorId: "op-luis", label: "camioneta de luis (regreso a bodega)", kind: "route", capacityKg: 400, refrigerated: false, available: { start: at("12:00"), end: at("15:00") }, location: { lat: 19.41, lng: -99.175 }, routeEnd: { lat: 19.452, lng: -99.161 }, pricing: { baseMxn: 0, perKmMxn: 6 }, simulated: true },
]

export const DEMO_NETWORK: Network = {
  participants: DEMO_PARTICIPANTS,
  vehicles: DEMO_VEHICLES,
  area: { id: "cdmx-piloto", name: "zona piloto centro-poniente cdmx", center: { lat: 19.42, lng: -99.155 }, radiusKm: 12, zoneAMaxMinutes: 20, zoneBMaxMinutes: 45 },
}

export const SCENARIO_RESOURCES: Record<ScenarioId, Resource> = {
  pan: {
    id: "gf-pan-1103", donorId: "don-espiga", title: "60 panes de muerto del día", item: "pan de muerto", category: "panificados", kg: 30, units: { count: 60, unit: "piezas" },
    condition: "edible", conditionConfirmed: true, attributes: ["empacado"], location: { lat: 19.4194, lng: -99.1617 }, pickupWindow: { start: at("17:00"), end: at("19:30") }, refrigerationNeeded: false,
    rawMessage: "tengo 60 panes de muerto de hoy, en buen estado. se pueden recoger de 5 a 7:30",
  },
  cascara: {
    id: "gf-cas-1103", donorId: "don-jacaranda", title: "12 kg de cáscara de huevo", item: "cáscara de huevo", category: "organico", material: "cáscara de huevo", kg: 12,
    condition: "inedible", conditionConfirmed: true, attributes: ["limpia", "seca", "sin residuo"], location: { lat: 19.412, lng: -99.171 }, pickupWindow: { start: at("11:00"), end: at("14:00") }, refrigerationNeeded: false,
    rawMessage: "juntamos 12 kg de cáscara de huevo de la semana, lavada y seca, sin restos. ¿a alguien le sirve?",
  },
  organico: {
    id: "gf-org-1103", donorId: "don-medellin", title: "35 kg de cáscaras mixtas de fruta y verdura", item: "cáscaras mixtas de fruta y verdura", category: "organico", kg: 35,
    condition: "inedible", conditionConfirmed: true, attributes: ["mezclado"], location: { lat: 19.408, lng: -99.165 }, pickupWindow: { start: at("12:30"), end: at("15:00") }, refrigerationNeeded: false,
    rawMessage: "tengo como 35 kg de cáscaras y recortes de fruta y verdura, todo revuelto. no es para comer",
  },
}

export type ScenarioId = "pan" | "cascara" | "organico"

export type Step = {
  at: Ms
  actor: string
  title: string
  /** What grinflow or a participant says on whatsapp at this step (simulated). */
  message: { from: string; to: string; text: string } | null
  state: NetworkCase
}

export type Scenario = { id: ScenarioId; label: string; destination: string; steps: Step[] }

const name = (id: string) => DEMO_PARTICIPANTS.find((p) => p.id === id)?.name ?? id

function choicesText(c: NetworkCase, resId: string, now: Ms): string {
  const q = deliveryChoices(c, DEMO_NETWORK, resId, now)
  const line = (x: (typeof q)[number]) =>
    x.mode === "pickup" ? "· paso por ellos — gratis" : x.mode === "courier" ? `· envíamelo (${x.label}) — $${x.costMxn} mxn` : `· ruta existente (${x.label}) — $${x.costMxn} mxn, desvío ${x.detourKm} km`
  return q.map(line).join("\n")
}

export function runScenario(id: ScenarioId): Scenario {
  const net = DEMO_NETWORK
  const steps: Step[] = []
  const push = (state: NetworkCase, at: Ms, actor: string, title: string, message: Step["message"] = null) => steps.push({ at, actor, title, message, state })
  const r = SCENARIO_RESOURCES[id]
  let c = publish(r, net, r.pickupWindow.start)
  const wave = (n: number) => c.waves[n - 1]?.notified.map(name).join(", ")
  push(c, c.publishedAt, name(r.donorId), "el donante publica por whatsapp; grinflow estructura el recurso y filtra la red", { from: name(r.donorId), to: "grinflow", text: r.rawMessage ?? r.title })

  if (id === "pan") {
    push(c, c.publishedAt, "grinflow", `oleada 1 · personas: ${wave(1)}`, { from: "grinflow", to: "comedor comunitario doctores", text: `hay ${r.title} (${r.kg} kg) en roma norte, recoger de 17:00 a 19:30. ¿cuánto puedes recibir? responde con kg para apartar.` })
    let now = at("17:08")
    c = reserve(c, net, "rec-doctores", 20, now)
    push(c, now, name("rec-doctores"), "el comedor aparta 20 kg (parcial)", { from: "comedor comunitario doctores", to: "grinflow", text: "apartamos 20 kg" })
    push(c, now, "grinflow", "grinflow pregunta cómo quiere recibir", { from: "grinflow", to: "comedor comunitario doctores", text: `apartaste 20 kg de pan de muerto. ¿cómo quieres recibirlos?\n${choicesText(c, "gf-pan-1103-r1", now)}` })
    c = chooseDelivery(c, net, "gf-pan-1103-r1", "pickup", now)
    push(c, now, name("rec-doctores"), "elige pasar por ellos: gratis, se emite código de entrega", { from: "grinflow", to: "comedor comunitario doctores", text: `listo. tu código de entrega es ${c.reservations[0].handoffCode}. muéstralo en la panadería.` })
    now = at("17:15")
    c = reserve(c, net, "rec-narvarte", 10, now)
    push(c, now, name("rec-narvarte"), "la casa hogar aparta los 10 kg restantes; no tiene vehículo", { from: "grinflow", to: "casa hogar narvarte", text: `apartaste 10 kg. ¿cómo quieres recibirlos?\n${choicesText(c, "gf-pan-1103-r2", now)}` })
    c = chooseDelivery(c, net, "gf-pan-1103-r2", "courier", now, "veh-moto")
    const q = c.reservations[1].quote!
    push(c, now, "grinflow", `cotización de envío: $${q.costMxn} mxn, llegada estimada ${new Date(q.arrivalAt - 6 * 3600_000).toISOString().slice(11, 16)}`)
    now = at("17:17")
    c = acceptQuote(c, "gf-pan-1103-r2", "rec-narvarte", now)
    push(c, now, name("rec-narvarte"), "la casa hogar acepta el costo del envío", { from: "casa hogar narvarte", to: "grinflow", text: "sí, acepto el envío" })
    now = at("17:19")
    c = confirmCapacity(c, net, "gf-pan-1103-r2", "op-mensajeria", now)
    push(c, now, name("op-mensajeria"), "la mensajería confirma capacidad: el envío queda confirmado")
    now = at("17:40")
    c = recordPickup(c, "gf-pan-1103-r1", c.reservations[0].handoffCode!, "rec-doctores", now)
    push(c, now, name("rec-doctores"), "el comedor recoge con su código", { from: "panadería la espiga", to: "grinflow", text: "ya pasaron por 20 kg, el código coincidió" })
    now = at("17:52")
    c = recordPickup(c, "gf-pan-1103-r2", c.reservations[1].handoffCode!, "op-mensajeria", now)
    push(c, now, name("op-mensajeria"), "la moto recoge 10 kg con código")
    now = at("18:05")
    c = confirmReceipt(c, "gf-pan-1103-r1", 20, "rec-doctores", now)
    push(c, now, name("rec-doctores"), "el comedor confirma recepción: 20 kg verificados para personas", { from: "comedor comunitario doctores", to: "grinflow", text: "recibido, 20 kg" })
    now = at("18:20")
    c = confirmReceipt(c, "gf-pan-1103-r2", 10, "rec-narvarte", now)
    push(c, now, name("rec-narvarte"), "la casa hogar confirma recepción: el lote se cierra")
  }

  if (id === "cascara") {
    push(c, c.publishedAt, "grinflow", `no es alimento: personas no aplica. oleada 1 · transformación: ${wave(1)}`, { from: "grinflow", to: "estudio de biomateriales de cáscara", text: `hay ${r.kg} kg de cáscara de huevo limpia, seca y sin residuo en condesa, hoy de 11:00 a 14:00. cumple tus especificaciones. ¿la apartas?` })
    let now = at("11:12")
    c = reserve(c, net, "mak-cascara", 12, now)
    push(c, now, name("mak-cascara"), "el maker aparta los 12 kg (su capacidad semanal es 20 kg)", { from: "grinflow", to: "estudio de biomateriales de cáscara", text: `apartaste 12 kg. ¿cómo quieres recibirlos?\n${choicesText(c, "gf-cas-1103-r1", now)}` })
    c = chooseDelivery(c, net, "gf-cas-1103-r1", "pickup", now)
    push(c, now, name("mak-cascara"), "recoge en origen, como declaró en su registro", { from: "grinflow", to: "estudio de biomateriales de cáscara", text: `tu código de entrega es ${c.reservations[0].handoffCode}.` })
    now = at("12:10")
    c = recordPickup(c, "gf-cas-1103-r1", c.reservations[0].handoffCode!, "mak-cascara", now)
    push(c, now, name("mak-cascara"), "recolección con código en el restaurante")
    now = at("12:35")
    c = confirmReceipt(c, "gf-cas-1103-r1", 11.5, "mak-cascara", now)
    push(c, now, name("mak-cascara"), "el maker confirma 11.5 kg recibidos: material para transformación verificado", { from: "estudio de biomateriales de cáscara", to: "grinflow", text: "recibido: 11.5 kg, en buen estado para el proceso" })
  }

  if (id === "organico") {
    push(c, c.publishedAt, "grinflow", `ningún maker acepta este material mezclado; la cascada llega a composta: ${wave(1)}`, { from: "grinflow", to: "centro de composta guerrero", text: `hay ${r.kg} kg de orgánico mezclado en mercado medellín, de 12:30 a 15:00. ¿lo apartas?` })
    let now = at("12:40")
    c = reserve(c, net, "cmp-guerrero", 35, now)
    push(c, now, name("cmp-guerrero"), "la composta aparta los 35 kg; recibe en planta, no recoge", { from: "grinflow", to: "centro de composta guerrero", text: `apartaste 35 kg. ¿cómo quieres recibirlos?\n${choicesText(c, "gf-org-1103-r1", now)}` })
    c = chooseDelivery(c, net, "gf-org-1103-r1", "backhaul", now, "veh-luis")
    const q = c.reservations[0].quote!
    push(c, now, "grinflow", `ruta existente: la camioneta de luis regresa a bodega; desvío ${q.detourKm} km, $${q.costMxn} mxn`)
    now = at("12:42")
    c = acceptQuote(c, "gf-org-1103-r1", "cmp-guerrero", now)
    push(c, now, name("cmp-guerrero"), "la composta acepta el costo del desvío", { from: "centro de composta guerrero", to: "grinflow", text: "va, aceptamos" })
    now = at("12:45")
    c = confirmCapacity(c, net, "gf-org-1103-r1", "op-luis", now)
    push(c, now, name("op-luis"), "luis confirma espacio en su regreso", { from: "luis · camioneta de reparto", to: "grinflow", text: "sí tengo espacio, paso por ahí" })
    now = at("13:05")
    c = recordPickup(c, "gf-org-1103-r1", c.reservations[0].handoffCode!, "op-luis", now)
    push(c, now, name("op-luis"), "luis recoge en el mercado con código")
    now = at("13:30")
    c = confirmReceipt(c, "gf-org-1103-r1", 34, "cmp-guerrero", now)
    push(c, now, name("cmp-guerrero"), "la composta confirma 34 kg recibidos y gestionados")
  }

  c = tick(c, net, steps.at(-1)!.at)
  steps[steps.length - 1] = { ...steps[steps.length - 1], state: c }
  return { id, label: SCENARIO_LABEL[id], destination: SCENARIO_DESTINATION[id], steps }
}

export const SCENARIO_LABEL: Record<ScenarioId, string> = { pan: "a · pan fresco", cascara: "b · cáscara de huevo", organico: "c · orgánico mezclado" }
export const SCENARIO_DESTINATION: Record<ScenarioId, string> = { pan: "comedor y casa hogar", cascara: "maker de biomateriales", organico: "composta" }

export const SCENARIOS: ScenarioId[] = ["pan", "cascara", "organico"]
