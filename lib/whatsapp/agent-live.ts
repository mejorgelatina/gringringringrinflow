import { agentWiring } from "@/lib/agent/deps";
import { lookup, remember } from "@/lib/agent/registry";
import { autoAgentEnabled, createAgentBridge, publicBaseUrl, type AgentBridge } from "./agent-bridge";

/**
 * The server's agent bridge for chats, or null when GRINFLOW_AUTO_AGENT=off. Model calls follow the same
 * opt-in as everything else: without META_CALLS_ENABLED=true the scripted planner runs and nothing is spent.
 */
export function liveAgentBridge(fallbackOrigin?: string, photoFixture?: Parameters<typeof agentWiring>[0]): AgentBridge | null {
  if (!autoAgentEnabled()) return null;
  return createAgentBridge({
    deps: () => agentWiring(photoFixture).deps,
    planner: () => agentWiring().planner,
    remember,
    lookup,
    baseUrl: publicBaseUrl() ?? fallbackOrigin ?? null,
  });
}
