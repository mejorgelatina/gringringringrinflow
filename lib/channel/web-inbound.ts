import type { InboundMessage } from "../whatsapp/webhook.ts"

/** A location shared from the web chat (browser geolocation): same shape as a whatsapp pin. */
export type WebLocation = { lat: number; lng: number; label: string }

export type WebInboundInput = {
  id: string
  timestamp: string
  text: string
  image: string | null
  location: WebLocation | null
}

/**
 * The web chat's message as a channel inbound. Clients send a photo and a location separately;
 * if both arrive together the location wins (a pin answers "where", a photo never does).
 */
export function webInbound(input: WebInboundInput): { msg: InboundMessage; useImage: boolean } {
  const { id, timestamp, text, image, location } = input
  const type = location ? "location" : image ? "image" : "text"
  return {
    msg: {
      id,
      from: "web",
      timestamp,
      type,
      text,
      mediaId: type === "image" && image ? "web" : null,
      location: location ? { lat: location.lat, lng: location.lng, label: location.label } : null,
    },
    useImage: type === "image",
  }
}
