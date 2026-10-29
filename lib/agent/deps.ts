import OpenAI from "openai";
import { intakeDeps } from "@/lib/intake/deps";
import type { PHOTO_FIXTURES } from "@/lib/meta/photo-policy";
import { createMetaJudge, localJudge } from "./judge";
import { createMetaPlanner, createScriptedPlanner, type Planner } from "./planner";
import type { AgentDeps } from "./tools";

/**
 * Server-only wiring. Same opt-in as the intake: MODEL_API_KEY alone never spends credits;
 * META_CALLS_ENABLED=true is also required. Off, the scripted planner and a local check run instead.
 */
export function agentWiring(photoFixture?: keyof typeof PHOTO_FIXTURES): { deps: AgentDeps; planner: Planner } {
  const base = intakeDeps();
  if (!base.useMeta) return { deps: { ...base, judge: localJudge, photoFixture }, planner: createScriptedPlanner() };
  const model = base.modelId || "muse-spark-1.3";
  const client = new OpenAI({ apiKey: process.env.MODEL_API_KEY, baseURL: process.env.META_BASE_URL || "https://api.meta.ai/v1", timeout: 30_000, maxRetries: 0 });
  return { deps: { ...base, judge: createMetaJudge(client, model) }, planner: createMetaPlanner(client, model) };
}
