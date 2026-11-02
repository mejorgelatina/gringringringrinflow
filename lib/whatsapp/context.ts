import { firebaseEnabled } from "@/lib/firebase/admin";
import { intakeDeps } from "@/lib/intake/deps";
import { downloadMediaAsDataUrl, graphConfig, sendTemplate, sendText } from "./graph";
import type { HandlerContext } from "./handler";
import { registryStore } from "@/lib/registry/store";
import { liveAgentBridge } from "./agent-live";
import { autoAgentEnabled, publicBaseUrl } from "./agent-bridge";
import type { Outbound } from "./notify";

/** Live context for the real webhook. Replies need credentials AND an explicit flag, like Meta model calls. */
export function liveContext(): HandlerContext {
  const cfg = graphConfig();
  const repliesEnabled = process.env.WHATSAPP_REPLIES_ENABLED === "true";
  return {
    deps: intakeDeps(),
    allowlist: process.env.WHATSAPP_ALLOWED_SENDERS,
    send: cfg && repliesEnabled ? (to, body) => sendText(to, body, cfg) : null,
    fetchMedia: cfg ? (id) => downloadMediaAsDataUrl(id, cfg) : null,
    source: "webhook",
    store: registryStore(),
    agent: liveAgentBridge()
  };
}

/** Outbound notices: text needs replies enabled; templates also need WHATSAPP_TEMPLATES_APPROVED=true. */
export function liveOutbound(): Outbound {
  const cfg = graphConfig();
  const replies = Boolean(cfg) && process.env.WHATSAPP_REPLIES_ENABLED === "true";
  const templates = replies && process.env.WHATSAPP_TEMPLATES_APPROVED === "true";
  return {
    sendText: replies ? (to, body) => sendText(to, body, cfg!) : null,
    sendTemplate: templates ? (to, name, language, params) => sendTemplate(to, name, language, params, cfg!) : null,
  };
}

export function whatsappStatus() {
  return {
    verifyTokenSet: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    appSecretSet: Boolean(process.env.WHATSAPP_APP_SECRET),
    accessTokenSet: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
    phoneNumberIdSet: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    repliesEnabled: process.env.WHATSAPP_REPLIES_ENABLED === "true",
    allowlistSet: Boolean(process.env.WHATSAPP_ALLOWED_SENDERS),
    metaCallsEnabled: intakeDeps().useMeta,
    firebaseSet: firebaseEnabled(),
    memory: registryStore().kind,
    templatesApproved: process.env.WHATSAPP_TEMPLATES_APPROVED === "true",
    autoAgent: autoAgentEnabled(),
    publicBaseUrlSet: Boolean(publicBaseUrl())
  };
}
