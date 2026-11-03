import { CATEGORY_ES } from "./parse.ts"
import type { Accepts, RegisteredRole, Registration, RegistrationStatus } from "./types.ts"

// Display wording for registration roles and accepted materials, shared by the team view and the
// onboarding summary so both say the same thing. Roles come from the "role" step, materials and
// specs from the "accepts" step; this file only words them, it never re-parses answers.

export const ROLE_LABEL: Record<RegisteredRole, string> = { donor: "dona", receiver: "recibe para personas", maker: "maker", compost: "composta" }
export const ROLE_EXAMPLE: Record<RegisteredRole, string> = { donor: "ej. restaurante", receiver: "ej. banco de alimentos", maker: "ej. laboratorio", compost: "ej. centro de composta" }

export const STATUS_LABEL: Record<RegistrationStatus, string> = { pending: "pendiente de verificación", verified: "verificada", rejected: "rechazada" }

/** "dona · ej. restaurante, maker · ej. laboratorio" */
export function rolesLine(roles: RegisteredRole[]): string {
  return roles.map((r) => `${ROLE_LABEL[r]} · ${ROLE_EXAMPLE[r]}`).join(", ")
}

/** What the organization itself may read through /api/org/me: everything except the team's internal notes. */
export type PublicRegistration = Omit<Registration, "notes">;

/** Strip team-internal notes before serving a registration to its owner. The team keeps full reads via /api/registry. */
export function publicRegistration(reg: Registration): PublicRegistration {
  const { notes: _teamInternal, ...pub } = reg;
  void _teamInternal;
  return pub;
}

/** Core of the accepts line (materials or categories plus specs); call sites add their own prefix and quantity suffix. */
export function acceptsCore(a: Accepts, opts: { maker: boolean } = { maker: true }): string {
  const what = opts.maker && a.materials.length
    ? a.materials.join(", ")
    : a.categories.map((c) => CATEGORY_ES[c] ?? c).join(", ") || a.text
  return what + (a.requires.length ? ` (${a.requires.join(", ")})` : "")
}
