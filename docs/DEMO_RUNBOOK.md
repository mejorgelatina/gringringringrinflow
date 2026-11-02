# guion del video demo (3 min, hackathon, deadline 4 nov)

Guion de grabación contra `main` en producción. Todo lo que se ve existe en las pantallas
desplegadas; nada está actuado salvo que se indique. Idioma del video: español, con la
interfaz en minúsculas tal como se ve. Regla de oro: las pantallas siempre dicen qué
proveedor corrió (local o Meta) y cuántas llamadas costó; muéstralo en cámara.

Doble core (repetirlo en voz alta al menos dos veces): grinflow rescata comida que sigue
apta para personas y la conecta con humanos, y manda los orgánicos que ya no son comida
a makers que los transforman. Ninguna pantalla certifica inocuidad: el modelo propone,
las reglas filtran y una persona firma.

## 1. escenas y pasos (3:00)

| tiempo | pantalla | pasos |
|---|---|---|
| 0:00–0:15 | landing `/` | hook: dos tomas, comida que se tira y taller maker. |
| 0:15–0:45 | whatsapp real o `/whatsapp` | mandar `quiero registrar mi organización`; responder nombre, colonia cdmx, horario, contacto y qué recibe; confirmar con `sí`. |
| 0:45–1:05 | `/team` | entrar con cuenta de equipo; abrir **por verificar**; revisar datos y pulsar **verificar**. |
| 1:05–1:35 | whatsapp + `/team` | mandar `Tenemos 20 cajas de pan fresco en la colonia Roma, hay que recogerlas antes de las 6 pm.` + foto con caption; mostrar inbox y tarjeta icc/foto (rutas a personas bloqueadas hasta revisión humana). |
| 1:35–2:10 | `/agent` | desde la oferta, **proponer destino ↗**; mostrar propuesta y checks; escribir revisor y pulsar **approve ↗**; mostrar `simulated outcome` y código `/track/GF-…`. |
| 2:10–2:35 | `/track/GF-…` | mostrar etapas estilo paquetería y etiquetas de pickup/delivery simulados. |
| 2:35–2:55 | `/network` | recorrer los tres destinos: pan → cocina, cáscara de huevo → maker, mixto → composta; cerrar en impacto verificado. |
| 2:55–3:00 | cierre | una frase + logo. |

Detalles por escena:

- whatsapp (0:15): si es número de prueba real, graba la pantalla del teléfono. Respuestas
  sugeridas: `comedor santa fe`, `orizaba 101, roma norte` (o pin de ubicación), `lunes a
  sábado de 12 a 7`, `mariana lópez 55 1234 5678`, `pan, fruta y verdura, unos 80 kg`.
  la última respuesta muestra el resumen y pide el `sí` (opt-in de whatsapp).
- `/team` (0:45): el botón **verificar** se deshabilita sin ubicación; si pasa, usa
  **ubicar** primero (queda bien en cámara: "nada entra a la red sin punto en el mapa").
- oferta con foto (1:05): en modo local la foto se acepta pero no se analiza; en ventana
  Meta (3 nov) una llamada vision la describe y la política de foto puede bloquear personas
  hasta que un humano confirme. di en voz alta lo que diga la tarjeta icc.
- `/agent` (1:35): el agente abre con el texto de whatsapp ya cargado. muestra la
  propuesta, que los checks corren en código y que se detiene en `waiting for sign-off`.
  el revisor escribe su nombre (mínimo 2 letras) y aprueba: nada se agenda, todo se
  registra. copia el código de tracking a cámara.
- `/network` (2:35): no abras los tres escenarios completos (no cabe en 20 s): muestra el
  hero `una red, tres destinos`, baja al maker (transformación) y a composta, y termina
  en `tres resultados, nunca sumados`. todo sintético: dilo una vez.

## 2. qué decir (1–2 frases por escena)

- hook: "un tercio de la comida se desperdicia mientras comedores y makers la necesitan.
  grinflow rescata la comida apta para personas y transforma los orgánicos en materiales."
- registro: "una organización se registra sola por whatsapp en dos minutos, pero nada
  entra a la red hasta que una persona del equipo la verifica."
- verificación: "aquí el equipo revisa datos reales y firma; sin firma, no hay red."
- oferta con foto: "el donante manda texto y foto. el modelo describe, las reglas miden, y
  la foto jamás certifica que algo es apto para personas: eso lo confirma un humano."
- agente: "el agente propone un destino con evidencia citada y se detiene; la decisión es
  humana, queda firmada y nada se despacha solo."
- tracking: "cada caso se sigue como un paquete, con hora estimada y etapas claras."
- red: "y lo que ya no es comida no se tira: va a makers que lo transforman o a composta.
  rescate para personas y transformación para orgánicos: ese es grinflow."
- cierre: "menos desperdicio, más personas alimentadas y más materiales recuperados."

## 3. checklist previo a grabar

- [ ] `pnpm test` y `pnpm typecheck` en verde sobre el commit desplegado.
- [ ] variables en vercel → settings → environment variables (production):
  `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ALLOWED_SENDERS` (teléfonos de jueces/equipo
  en formato internacional, o vacío para prueba abierta), `WHATSAPP_REPLIES_ENABLED`
  (`true` solo al grabar), `MODEL_API_KEY` (solo production),
  `META_CALLS_ENABLED` (`true` solo en la ventana del 3 nov), `FIREBASE_PROJECT_ID`,
  `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `GRINFLOW_TEAM_EMAILS`.
  redeploy después de cambiarlas (las `NEXT_PUBLIC_*` quedan fijas en el build).
- [ ] webhook en el dashboard de meta: callback
  `https://<producción>/api/whatsapp/webhook`, campo `messages` suscrito, verify token
  igual al de vercel. usar el dominio de producción (preview suele pedir login).
- [ ] número de prueba: remitente verificado agregado, token vigente (el temporal dura
  24 h; para más usa token de usuario de sistema), mensaje de prueba recibido.
- [ ] cuenta de equipo: creada en `/team`, correo verificado, correo en
  `GRINFLOW_TEAM_EMAILS`; probar login y que se ve **por verificar**.
- [ ] ventana Meta 3 nov: activar, grabar solo las tomas que la necesitan (foto vision
  y planner del agente), desactivar al terminar. costos: texto 1 llamada, foto +1,
  run del agente 5–9. ojo: en `main` solo `/send` tiene tope por ip; ventana corta.
- [ ] `/whatsapp` → **live setup** todo en verde antes de grabar.
- [ ] teléfono cargado, respuestas del registro a la mano, foto de pan lista; segunda
  foto (daño visible) opcional para el bloque de seguridad.
- [ ] encuadre: nunca mostrar secretos, `.env`, tokens ni números sin enmascarar.
- [ ] respaldo: capturas en `/mnt/project-files/grinflow-demo/` listas por si algo falla.

## 4. plan b si algo falla en vivo

- webhook o meta caídos: graba en `/whatsapp` con los mismos mensajes (usa **sample 1**
  y el último sample de registro). el simulador corre el handler real y deja la misma
  traza paso a paso; `/team` muestra igual el registro y la oferta.
- no llegan replies de whatsapp: sigue en el simulador y muestra la traza con reply
  `preview`; el flujo de datos es el mismo, solo cambia el envío.
- se acaban los créditos o cierra la ventana Meta: modo local etiquetado (el fallback
  extrae la oferta y aplica las reglas) y foto con **simulate** en `/intake`.
- se pierde un código `/track/GF-…` (memoria fría o redeploy sin firebase): re-corre el
  agente o abre el run guardado en el navegador que lo inició; con firebase
  configurado el código sobrevive.
- `/network` no carga: usa las capturas de respaldo y narra la cascada
  personas → transformación → composta con la tarjeta de impacto.
- cualquier pantalla tarda: corta a la captura equivalente; el video manda, el vivo no.
