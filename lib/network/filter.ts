import type { Participant } from "./types.ts"

// Org-type filter for the network registry table. Counts come from the participant list itself.

export type OrgFilter = "all" | "donor" | "receiver" | "maker" | "compost"
export const ORG_FILTERS: OrgFilter[] = ["all", "donor", "receiver", "maker", "compost"]
export const ORG_FILTER_LABEL: Record<OrgFilter, string> = { all: "todos", donor: "donantes", receiver: "organizaciones", maker: "makers", compost: "composta" }

export function filterParticipants(list: Participant[], f: OrgFilter): Participant[] {
  return f === "all" ? [...list] : list.filter((p) => p.roles.includes(f))
}

export function countByFilter(list: Participant[]): Record<OrgFilter, number> {
  return Object.fromEntries(ORG_FILTERS.map((f) => [f, filterParticipants(list, f).length])) as Record<OrgFilter, number>
}
