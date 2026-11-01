// Feature switches for the network. Read at call time so a test or a Vercel env var can flip them.

/**
 * Coordinated carriers (courier quotes, backhaul on existing routes) are built but not validated with real
 * operators (jor, 2026-11-01). Until then they stay hidden: a receiver picks up with its own people or sends
 * its own courier (an uber) and pays it. Set NEXT_PUBLIC_GRINFLOW_CARRIERS=on to bring them back.
 */
export function carriersEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GRINFLOW_CARRIERS === "on"
}
