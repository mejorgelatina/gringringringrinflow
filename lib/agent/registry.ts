/**
 * Tracking-number lookup, kept in this server instance's memory (newest 200). Enough for a demo,
 * not a database: another instance or a redeploy won't know the code, so the console also keeps
 * each run in the browser. Production needs a real table (see db/migrations, `operations`).
 */
const runs = new Map<string, string>();

export function remember(code: string, token: string) {
  runs.delete(code);
  runs.set(code, token);
  while (runs.size > 200) runs.delete(runs.keys().next().value!);
}

export function lookup(code: string): string | null {
  return runs.get(code.trim().toUpperCase()) ?? null;
}
