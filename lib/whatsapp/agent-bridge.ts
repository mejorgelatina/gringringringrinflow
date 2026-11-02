import { resumeRun, startRun, type ResumeAction } from "../agent/loop.ts";
import type { Planner } from "../agent/planner.ts";
import { seal, unseal } from "../agent/state.ts";
import type { AgentDeps } from "../agent/tools.ts";
import type { AgentRun } from "../agent/types.ts";
import { trackUrl } from "./notify.ts";

// The bridge between a chat (WhatsApp, the web chat, the simulator) and the intake agent: a complete offer
// opens an agent run on its own, so the team no longer has to paste messages into /agent, and the donor's
// next answer goes straight to the run while it waits for them. Runs stay sealed, as in the console.

export type AgentBridge = {
  start(message: string, image?: string): Promise<AgentRun>;
  /** Moves the run the code names. Null when the code is unknown on this server. */
  resume(code: string, action: ResumeAction): Promise<AgentRun | null>;
  load(code: string): Promise<AgentRun | null>;
  baseUrl: string | null;
};

export function createAgentBridge(opts: {
  deps: () => AgentDeps;
  planner: () => Planner;
  remember: (code: string, token: string) => Promise<void>;
  lookup: (code: string) => Promise<string | null>;
  baseUrl: string | null;
}): AgentBridge {
  const keep = async (run: AgentRun) => { await opts.remember(run.code, seal(run)); return run; };
  const load = async (code: string) => { const t = await opts.lookup(code); return t ? unseal(t) : null; };
  return {
    baseUrl: opts.baseUrl,
    load,
    start: async (message, image) => keep(await startRun(message, image, opts.deps(), opts.planner())),
    resume: async (code, action) => {
      const run = await load(code);
      return run ? keep(await resumeRun(run, action, opts.deps(), opts.planner())) : null;
    },
  };
}

/** Public base URL for links in messages: GRINFLOW_BASE_URL, else Vercel's production domain. */
export function publicBaseUrl(env: Record<string, string | undefined> = process.env): string | null {
  const explicit = env.GRINFLOW_BASE_URL?.trim();
  if (explicit && /^https?:\/\//.test(explicit)) return explicit.replace(/\/+$/, "");
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

/** Off only when GRINFLOW_AUTO_AGENT=off. Agent model calls still need META_CALLS_ENABLED, like everything else. */
export const autoAgentEnabled = (env: Record<string, string | undefined> = process.env) => env.GRINFLOW_AUTO_AGENT?.trim().toLowerCase() !== "off";

/** What the donor reads after the agent moved: one short status, the single question if any, and the link. */
export function runReply(run: AgentRun, baseUrl: string | null, en: boolean): string {
  const url = trackUrl(baseUrl, run.code);
  const track = en ? `Tracking ${run.code}: ${url}` : `Seguimiento ${run.code}: ${url}`;
  switch (run.status) {
    case "needs_input":
      return [run.question?.text ?? (en ? "Can you tell me a bit more about the offer?" : "¿Me cuentas un poco más de la oferta?"), track].join("\n");
    case "awaiting_approval":
      return [en
        ? `We found a destination: ${run.proposal?.recipient}. A person on our team signs off before anything moves.`
        : `Encontramos destino: ${run.proposal?.recipient}. Una persona del equipo lo aprueba antes de mover nada.`, track].join("\n");
    case "approved":
      return [en ? `Approved: it goes to ${run.proposal?.recipient}.` : `Aprobado: va para ${run.proposal?.recipient}.`, track].join("\n");
    default:
      return [en ? "A person on our team is reviewing it and will follow up here." : "Una persona del equipo lo está revisando y te escribe por aquí.", track].join("\n");
  }
}
