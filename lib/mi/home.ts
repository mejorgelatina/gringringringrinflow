import { acceptsCore, type PublicRegistration } from "../registry/display.ts"

// Organization home content (E2): greeting data, badges and role sections computed only from the
// organization's own registration. Activity sections (offers, holds, missions) stay empty until
// E3-E5 create that data; nothing here invents numbers.

export type Badge = { id: string; label: string; detail: string }

export function badgesFor(reg: PublicRegistration): Badge[] {
  if (reg.status !== "verified") return []
  return [{
    id: "verified",
    label: "organización verificada",
    detail: reg.verifiedAt ? `desde ${reg.verifiedAt.slice(0, 10)}` : "verificada por el equipo",
  }]
}

export type HomeSection = { key: string; title: string; body: string | null; empty: string }

export function sectionsFor(reg: PublicRegistration): HomeSection[] {
  const out: HomeSection[] = []
  const accepts = reg.accepts ? acceptsCore(reg.accepts, { maker: reg.roles.includes("maker") }) : null
  if (reg.roles.includes("donor")) {
    out.push(
      { key: "offers", title: "mis ofertas", body: null, empty: "aún no publicas ofertas. cuando publiques la primera, aquí verás cada lote y a dónde fue." },
      { key: "generates", title: "lo que generas", body: reg.generates?.text || null, empty: "no declaraste qué te sobra." },
    )
  }
  if (reg.roles.includes("receiver")) {
    out.push(
      { key: "inbox", title: "ofertas para mí", body: null, empty: "no hay ofertas para ti ahora mismo. cuando llegue una compatible, aparecerá aquí." },
      { key: "accepts", title: "lo que recibes", body: accepts, empty: "no declaraste qué puedes recibir." },
    )
  }
  if (reg.roles.includes("maker")) {
    out.push(
      { key: "material-offers", title: "ofertas de material", body: null, empty: "no hay ofertas de material para ti ahora mismo." },
      { key: "materials", title: "materiales que acepto", body: accepts, empty: "no declaraste qué materiales aceptas." },
    )
  }
  if (reg.roles.includes("compost")) {
    out.push(
      { key: "incoming", title: "orgánicos por llegar", body: null, empty: "no hay orgánicos en camino ahora mismo." },
      { key: "composts", title: "lo que composteas", body: accepts, empty: "no declaraste qué composteas." },
    )
  }
  return out
}
