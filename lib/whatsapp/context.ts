import { intakeDeps } from "@/lib/intake/deps";
import { downloadMediaAsDataUrl, graphConfig, sendText } from "./graph";
import type { HandlerContext } from "./handler";

/** Live context for the real webhook. Replies need credentials AND an explicit flag, like Meta model calls. */
export function liveContext(): HandlerContext {
  const cfg = graphConfig();
  const repliesEnabled = process.env.WHATSAPP_REPLIES_ENABLED === "true";
  return {
    deps: intakeDeps(),
    allowlist: process.env.WHATSAPP_ALLOWED_SENDERS,
    send: cfg && repliesEnabled ? (to, body) => sendText(to, body, cfg) : null,
    fetchMedia: cfg ? (id) => downloadMediaAsDataUrl(id, cfg) : null,
    source: "webhook"
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
    metaCallsEnabled: intakeDeps().useMeta
  };
}
