"use client"

import { useEffect, useRef, useState } from "react"

import { OPENERS, type Intent, type Lang } from "@/lib/channel/whatsapp-link"

type Bubble = { who: "you" | "grinflow"; text: string; image?: string }

const COPY = {
  en: {
    give: "i have food to give",
    giveHint: "what it is, how much, where, until when",
    receive: "my organization can receive food",
    receiveHint: "what you can take, how much, where",
    placeholder: "write like you would on whatsapp…",
    photo: "+ photo",
    changePhoto: "change photo",
    send: "send",
    sending: "sending…",
    restart: "start over",
    empty: "pick one to start, or just write.",
    register: "register my organization",
    registerHint: "once: name, address, hours, contact",
    registerOpener: "i want to register my organization",
    location: "share location",
    locating: "locating…",
    locationError: "could not get your location.",
    locationSent: "location shared",
  },
  es: {
    give: "tengo comida para donar",
    giveHint: "qué es, cuánto, dónde, hasta qué hora",
    receive: "mi organización puede recibir comida",
    receiveHint: "qué pueden recibir, cuánto, dónde",
    placeholder: "escribe como lo harías en whatsapp…",
    photo: "+ foto",
    changePhoto: "cambiar foto",
    send: "enviar",
    sending: "enviando…",
    restart: "empezar de nuevo",
    empty: "elige una opción para empezar, o simplemente escribe.",
    register: "registrar mi organización",
    registerHint: "una sola vez: nombre, dirección, horario, contacto",
    registerOpener: "quiero registrar mi organización",
    location: "compartir ubicación",
    locating: "localizando…",
    locationError: "no pude obtener tu ubicación.",
    locationSent: "ubicación compartida",
  },
} as const

function newSession(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

async function toDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", 0.82)
}

/** The web version of the whatsapp channel: same handler, same replies. */
export function WebChat({ initialIntent, initialLang, whatsapp }: { initialIntent: Intent | null; initialLang: Lang; whatsapp: Record<Intent, string> | null }) {
  const [lang, setLang] = useState<Lang>(initialLang)
  const [chat, setChat] = useState<Bubble[]>([])
  const [text, setText] = useState("")
  const [image, setImage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState("")
  const bodyRef = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  // The server remembers this conversation by a random id per tab, so an answer completes the last message.
  const [session, setSession] = useState(() => newSession())
  const t = COPY[lang]

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" })
  }, [chat, busy])

  async function post(body: Record<string, unknown>): Promise<string> {
    const r = await fetch("/api/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const d = await r.json()
    if (!r.ok || !d.ok) throw new Error(d.message || "something went wrong")
    return d.reply ?? ""
  }

  async function send(message: string, photo: string | null = image) {
    if (busy || (!message.trim() && !photo)) return
    setBusy(true)
    setError("")
    const history = chat.filter((b) => b.who === "you" && b.text).map((b) => b.text).slice(-10)
    setChat((c) => [...c, { who: "you", text: message.trim(), image: photo ?? undefined }])
    setText("")
    setImage(null)
    try {
      const reply = await post({ text: message.trim(), history, session, ...(photo ? { image: photo } : {}) })
      setChat((c) => [...c, { who: "grinflow", text: reply }])
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong")
    } finally {
      setBusy(false)
    }
  }

  function locate(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) reject(new Error("unavailable"))
      else navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000 })
    })
  }

  async function shareLocation() {
    if (busy || locating) return
    setLocating(true)
    setError("")
    let pos: GeolocationPosition
    try {
      pos = await locate()
    } catch {
      setError(t.locationError)
      setLocating(false)
      return
    }
    const { latitude: lat, longitude: lng } = pos.coords
    setBusy(true)
    const history = chat.filter((b) => b.who === "you" && b.text).map((b) => b.text).slice(-10)
    setChat((c) => [...c, { who: "you", text: `${t.locationSent} · ${lat.toFixed(4)}, ${lng.toFixed(4)}` }])
    try {
      const reply = await post({ text: "", history, session, location: { lat, lng, label: "" } })
      setChat((c) => [...c, { who: "grinflow", text: reply }])
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong")
    } finally {
      setBusy(false)
      setLocating(false)
    }
  }

  useEffect(() => {
    if (initialIntent && !started.current) {
      started.current = true
      send(OPENERS[initialLang][initialIntent], null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const intents: { intent: Intent; title: string; hint: string }[] = [
    { intent: "give", title: t.give, hint: t.giveHint },
    { intent: "receive", title: t.receive, hint: t.receiveHint },
  ]

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
      <div className="flex min-h-[560px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[var(--gf-shadow-sm)]">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="/grinflow-icon.svg" alt="" className="h-5 w-auto" />
            <p className="font-display text-base">grinflow</p>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-muted p-1 font-mono text-xs" role="group" aria-label="language">
            {(["es", "en"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={`rounded-full px-2.5 py-1 ${lang === l ? "bg-card text-foreground shadow-[var(--gf-shadow-sm)]" : "text-muted-foreground"}`}
              >
                {l === "es" ? "español" : "english"}
              </button>
            ))}
          </div>
        </div>

        <div ref={bodyRef} aria-live="polite" className="flex flex-1 flex-col gap-2 overflow-y-auto bg-[var(--gf-canvas)] p-4" style={{ maxHeight: 460 }}>
          {chat.length === 0 && (
            <div className="m-auto flex w-full max-w-md flex-col gap-3">
              <p className="text-center text-sm text-muted-foreground">{t.empty}</p>
              {intents.map((i) => (
                <button
                  key={i.intent}
                  onClick={() => send(OPENERS[lang][i.intent], null)}
                  className="rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-secondary"
                >
                  <span className="block font-display text-base">{i.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{i.hint}</span>
                </button>
              ))}
              <button
                onClick={() => send(t.registerOpener, null)}
                className="rounded-lg border border-dashed border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-secondary"
              >
                <span className="block font-display text-base">{t.register}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{t.registerHint}</span>
              </button>
            </div>
          )}
          {chat.map((b, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed shadow-[var(--gf-shadow-sm)] ${
                b.who === "you" ? "keep-case self-end bg-accent text-accent-foreground" : "self-start bg-card"
              }`}
            >
              {b.image && <img src={b.image} alt="your photo" className="mb-2 max-h-40 rounded-md object-cover" />}
              {b.text.split("\n").map((line, j) => (
                <p key={j}>{line}</p>
              ))}
            </div>
          ))}
          {busy && <div className="self-start rounded-lg bg-card px-3 py-2 text-sm text-muted-foreground">…</div>}
        </div>

        <form
          className="border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault()
            send(text)
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send(text)
              }
            }}
            maxLength={5000}
            rows={2}
            placeholder={t.placeholder}
            aria-label="message"
            className="w-full resize-none rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:shadow-[var(--gf-focus)]"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label htmlFor="web-photo" className="cursor-pointer rounded-md border border-dashed border-input px-3 py-2 text-sm text-brand-700 hover:bg-secondary">
              {image ? t.changePhoto : t.photo}
            </label>
            <button
              type="button"
              onClick={shareLocation}
              disabled={busy || locating}
              className="rounded-md border border-dashed border-input px-3 py-2 text-sm text-brand-700 hover:bg-secondary disabled:opacity-50"
            >
              {locating ? t.locating : t.location}
            </button>
            <input
              id="web-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                setError("")
                if (!f) return
                try {
                  setImage(await toDataUrl(f))
                } catch {
                  setError("could not read that image.")
                }
              }}
            />
            {image && <img src={image} alt="photo preview" className="h-9 w-9 rounded-md object-cover" />}
            {chat.length > 0 && (
              <button type="button" onClick={() => { setChat([]); setError(""); setSession(newSession()) }} className="px-2 py-2 text-sm text-muted-foreground hover:text-foreground">
                {t.restart}
              </button>
            )}
            <button
              type="submit"
              disabled={busy || (!text.trim() && !image)}
              className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? t.sending : t.send}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-[var(--gf-danger)]">
              {error}
            </p>
          )}
        </form>
      </div>

      <aside className="flex flex-col gap-3 text-sm">
        {whatsapp && (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="font-display text-base">prefer whatsapp?</p>
            <p className="mt-1 text-muted-foreground">same conversation, same answers.</p>
            <div className="mt-3 flex flex-col gap-2">
              <a href={whatsapp.give} className="rounded-md bg-primary px-3 py-2 text-center font-medium text-primary-foreground hover:bg-brand-700">
                {t.give}
              </a>
              <a href={whatsapp.receive} className="rounded-md border border-border px-3 py-2 text-center hover:bg-secondary">
                {t.receive}
              </a>
            </div>
          </div>
        )}
        <div className="rounded-lg bg-accent p-4 text-accent-foreground">
          <p className="font-display text-base">what happens next</p>
          <p className="mt-1 leading-relaxed">
            grinflow structures your message and asks only what is missing. a person on the team reviews it before any
            food moves, and no one is contacted automatically.
          </p>
        </div>
        <a href="/qr" className="eyebrow hover:text-foreground">get the grinflow qr →</a>
      </aside>
    </div>
  )
}
