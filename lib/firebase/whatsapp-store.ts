import { createHash } from "node:crypto";
import { firestore } from "./admin";
import type { Trace } from "../whatsapp/handler";
import type { InboundMessage } from "../whatsapp/webhook";

function idFor(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 40);
}

function isAlreadyExists(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 6;
}

/** Claims a Meta message exactly once. If Firebase is not configured, local memory remains the fallback. */
export async function claimWebhookMessage(messageId: string): Promise<"claimed" | "duplicate" | "unavailable"> {
  const db = firestore();
  if (!db) return "unavailable";
  const ref = db.collection("whatsapp_webhook_events").doc(idFor(messageId));
  try {
    await ref.create({ messageId, claimedAt: new Date().toISOString(), source: "whatsapp" });
    return "claimed";
  } catch (error) {
    if (isAlreadyExists(error)) return "duplicate";
    console.error("Firebase webhook claim failed; continuing in demo mode", error);
    return "unavailable";
  }
}

/** Stores the inbound event, the generated reply and the safe trace. Images are never persisted. */
export async function persistWhatsAppTurn(message: InboundMessage, trace: Trace) {
  const db = firestore();
  if (!db) return false;
  const now = new Date().toISOString();
  const conversationId = idFor(message.from);
  const messageRef = db.collection("whatsapp_messages").doc(idFor(message.id));
  const conversationRef = db.collection("whatsapp_conversations").doc(conversationId);
  await db.runTransaction(async transaction => {
    transaction.set(messageRef, {
      messageId: message.id,
      conversationId,
      from: message.from,
      type: message.type,
      text: message.text || null,
      receivedAt: trace.receivedAt,
      reply: trace.reply,
      replyStatus: trace.replyStatus,
      metaCalls: trace.metaCalls,
      trace: trace.steps,
      updatedAt: now,
    }, { merge: true });
    transaction.set(conversationRef, {
      conversationId,
      phone: message.from,
      lastMessageId: message.id,
      lastMessageAt: trace.receivedAt,
      lastReplyStatus: trace.replyStatus,
      updatedAt: now,
    }, { merge: true });
  });
  return true;
}
