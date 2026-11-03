import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "grinflow — privacidad",
  description: "cómo grinflow trata tus datos: qué recibimos, para qué, con quién y cómo pedir que los borremos.",
}

const CONTACT = "hola@mejorgelatina.com"

const SECTIONS: { id: string; title: string; body: string[] }[] = [
  {
    id: "datos",
    title: "qué datos recibimos",
    body: [
      "mensajes de texto y fotos que envías a grinflow por whatsapp o por el chat web, para describir comida o materiales orgánicos que quieres donar o recibir.",
      "datos de registro de una organización: nombre, qué hace, dirección o punto de ubicación, horario, persona de contacto y teléfono, y qué acepta o genera.",
      "tu número de whatsapp, que whatsapp nos entrega al recibir un mensaje, y el correo de las cuentas del equipo.",
    ],
  },
  {
    id: "uso",
    title: "para qué los usamos",
    body: [
      "entender tu mensaje y tu foto, preguntarte lo que falta y proponer a qué organización puede ir la comida o el material.",
      "verificar organizaciones antes de que entren a la red: una persona del equipo revisa cada registro.",
      "dar seguimiento a cada caso (códigos de seguimiento y de entrega) y medir el impacto verificado.",
      "no vendemos tus datos ni los usamos para publicidad. una foto nunca se usa para certificar que un alimento es seguro.",
    ],
  },
  {
    id: "terceros",
    title: "con quién se procesan",
    body: [
      "meta (whatsapp cloud api y meta model api), para recibir mensajes y para interpretar mensajes y fotos.",
      "google firebase (autenticación y base de datos) y vercel (alojamiento de la aplicación).",
      "los datos de contacto de una organización solo se comparten con otra organización cuando hay una oferta o una entrega en curso que lo requiere.",
    ],
  },
  {
    id: "conservacion",
    title: "cuánto tiempo los conservamos",
    body: [
      "conservamos los registros y los casos mientras la organización participa en la red o hasta que pida borrarlos. los mensajes de conversación se conservan solo el tiempo necesario para dar seguimiento.",
    ],
  },
  {
    id: "borrar",
    title: "cómo pedir acceso o borrado",
    body: [
      `escribe a ${CONTACT} desde el correo o el teléfono con el que te registraste, indicando qué quieres consultar o borrar. respondemos y borramos tus datos de registro y de conversación en un plazo razonable.`,
    ],
  },
]

export default function PrivacyPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 md:py-14">
        <a href="/" className="inline-block" aria-label="grinflow home">
          <img src="/grinflow-logo.svg" alt="grinflow" className="h-7 w-auto" />
        </a>
        <h1 className="mt-8 text-3xl font-bold md:text-4xl">privacidad</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          grinflow conecta comida y materiales orgánicos que sobran con quien los puede aprovechar. esto es lo que hacemos con tus datos.
        </p>
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="mt-8">
            <h2 className="text-xl font-semibold">{s.title}</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-muted-foreground">
              {s.body.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ))}
        <p className="mt-10 text-sm text-muted-foreground">contacto: {CONTACT}</p>
      </div>
    </main>
  )
}
