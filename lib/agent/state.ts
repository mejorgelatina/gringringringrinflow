import { createHmac, timingSafeEqual } from "node:crypto";
import type { AgentRun } from "./types.ts";

/**
 * Runs are not stored on the server: the browser holds a sealed copy and sends it back to resume.
 * The seal stops anyone from editing the run (say, marking food as inspected) between steps.
 * Set AGENT_STATE_SECRET in production; without it a fixed demo key is used and the run says so.
 */
const DEMO_KEY = "grinflow-demo-unsigned";
const key = () => process.env.AGENT_STATE_SECRET || DEMO_KEY;
export const stateSigned = () => Boolean(process.env.AGENT_STATE_SECRET);

const sign = (body: string) => createHmac("sha256", key()).update(body).digest("base64url");

export function seal(run: AgentRun): string {
  const body = Buffer.from(JSON.stringify(run)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function unseal(token: string): AgentRun | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body)), given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AgentRun; } catch { return null; }
}
