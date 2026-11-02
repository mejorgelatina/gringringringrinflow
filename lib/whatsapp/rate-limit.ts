/** Shared per-IP rate limiter for the public routes that can spend Meta model calls. Per server
 * instance (like the rest of the demo's memory); a distributed deployment needs a shared counter.
 * Time-injectable so tests don't wait out windows. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Same budget the web chat already uses: 20 requests per 10 minutes per IP. */
export const PUBLIC_WINDOW_MS = 10 * 60_000;
export const PUBLIC_MAX_PER_WINDOW = 20;

export function createRateLimiter(windowMs: number, maxPerWindow: number) {
  const hits = new Map<string, number[]>();
  return function overLimit(key: string, now = Date.now()): boolean {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    return recent.length > maxPerWindow;
  };
}
