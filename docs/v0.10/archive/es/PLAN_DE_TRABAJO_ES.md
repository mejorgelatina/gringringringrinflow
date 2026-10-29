# GrinFlow — Plan de trabajo y lista de acciones

**Fecha de planificación:** 28 de octubre de 2026  
**Fecha límite del hackathon:** 4 de noviembre de 2026, 9:00 PM ET / 8:00 PM Ciudad de México.  
**Objetivo:** entregar una demo confiable, explicable y reproducible; no construir toda la plataforma logística.

## Resumen ejecutivo

El prototipo ya contiene una UI Next.js, un endpoint de ingesta, un adaptador para Meta, un fallback local, un matcher determinista, 30 casos de evaluación y 10 pruebas automatizadas. Las pruebas de lógica pasan. Todavía no está verificado el build limpio, la app en navegador, una inferencia real de Meta, la evaluación de los 30 casos, el despliegue ni la entrega.

**La prioridad no es agregar más funciones. Es cerrar la incertidumbre técnica y producir una demostración real que podamos defender.**

## Lo que ya está hecho y verificado

- [x] Filosofía de producto: añadir inteligencia a la infraestructura existente, no reemplazarla de golpe.
- [x] Brief del MVP y límites de la demo.
- [x] UI y endpoint de ingesta escritos.
- [x] Adaptador de Meta y fallback local claramente diferenciados por proveedor.
- [x] Validación de esquema y evidencia literal en el adaptador.
- [x] Matching determinista con bloqueos duros.
- [x] Conjunto de 30 mensajes en español.
- [x] `npm test`: 10/10 pruebas pasan en este entorno.
- [x] `node --check scripts/smoke-meta.mjs`: pasa.
- [x] Documentación de billing, acceso a Meta, workshop, arquitectura y presupuesto.
- [x] Guía de onboarding para un nuevo colaborador.

## Lo que NO está verificado

- [ ] Instalación limpia de dependencias en un entorno del usuario.
- [ ] `npm run typecheck`.
- [ ] `npm run build`.
- [ ] Arranque y recorrido completo en navegador.
- [ ] Primera inferencia real con Meta.
- [ ] Compatibilidad de JSON mode con el modelo habilitado para la cuenta.
- [ ] Evaluación de los 30 casos con el modelo real.
- [ ] Control de gasto que impida cargos por encima de créditos promocionales.
- [ ] Repositorio público con el estado final del código.
- [ ] Despliegue público estable.
- [ ] Video de demo de 3 minutos y envío final.

## Plan priorizado

### P0 — Hoy, 28 de octubre: ejecutar local y validar Meta con gasto mínimo

**Tareas del fundador**
- [ ] Abrir la página de Billing y registrar el saldo promocional actual (sin compartir capturas que revelen información sensible).
- [ ] Revisar si existe un límite de gasto real; si no existe, confirmar con Meta cómo evitar cargos extra.
- [ ] Confirmar qué ruta de modelo usaremos: la API directa (`muse-spark-1.3`) o el partner (`meta-models/muse-spark-open-1026`). No mezclar IDs ni endpoints.
- [ ] Enviar a Meta la pregunta pendiente sobre disponibilidad de `sam-3.1`, crédito promocional y atribución elegible del modelo partner.
- [ ] Ejecutar localmente `npm install`, `npm test`, `npm run typecheck`, `npm run build`.
- [ ] Iniciar `npm run dev` y recorrer la demo.
- [ ] Solo si billing y acceso están claros, ejecutar una llamada básica de inferencia; registrar proveedor/modelo, código de resultado, latencia aproximada y cambio de saldo. Nunca registrar API key.

**Criterio de salida**: build local comprobado y resultado inequívoco de la primera llamada (éxito o error diagnosticado), con consumo observado.

### P1 — 29 de octubre: cerrar la extracción verificable

- [ ] Corregir fallos encontrados por el typecheck/build.
- [ ] Probar mensaje actual, mensaje histórico, corrección, cantidad aproximada, cantidad ausente, condición desconocida y ubicación ausente.
- [ ] Comprobar que cada evento tenga una cita literal exacta.
- [ ] Comprobar que un mensaje sin evento no genere oferta actual.
- [ ] Ejecutar 3–5 casos del golden set con Meta y revisar manualmente cada resultado.
- [ ] No ampliar a los 30 casos hasta entender el costo y el patrón de errores.

**Criterio de salida**: conjunto pequeño revisado; errores y falsos positivos documentados; no hay afirmaciones de precisión sin medición.

### P2 — 30–31 de octubre: hacer que la demo explique sus decisiones

- [ ] Mostrar todos los bloqueos relevantes por candidato.
- [ ] Diferenciar visualmente: datos extraídos, datos por confirmar, propuesta, aprobación y resultado simulado.
- [ ] Mostrar proveedor y modelo usados en la sesión sin exponer secretos.
- [ ] Añadir un caso de corrección que preserve el texto original o deje explícito que el cambio es una nueva revisión.
- [ ] Añadir una respuesta clara cuando el modelo falla: sin fallback silencioso que haga parecer que Meta respondió.
- [ ] Verificar diseño móvil y estados de carga/error.

**Criterio de salida**: una persona nueva entiende por qué una propuesta aparece, qué está bloqueado y qué no ha ocurrido.

### P3 — 1–2 de noviembre: demo congelada y despliegue

- [ ] Preparar un escenario sintético reproducible, con datos y resultado esperados.
- [ ] Verificar que la demo etiqueta destinos, capacidades y rutas como sintéticos.
- [ ] Crear o confirmar repositorio público y retirar secretos/archivos `.env`.
- [ ] Desplegar y probar el flujo desde un navegador limpio.
- [ ] Hacer feature freeze el 2 de noviembre: solo corregir defectos que afecten la demo.

**Criterio de salida**: enlace público estable, demo repetible y README claro.

### P4 — 3–4 de noviembre: video y submission

- [ ] Grabar video de máximo 3 minutos.
- [ ] Mostrar una llamada real a Meta solo si ha sido comprobada y se puede atribuir honestamente.
- [ ] Explicar qué código/funcionalidad se construyó durante el hackathon.
- [ ] Incluir problema, flujo, límites, uso de Meta y siguiente paso.
- [ ] Probar enlaces, permisos de video y repositorio desde una sesión privada.
- [ ] Enviar con margen antes del 4 de noviembre a las 8:00 PM CDMX.

## Lo que debe hacer el fundador primero

1. **No ejecutar todavía el workshop completo de US$7.** Primero cerrar la prueba mínima de acceso y gasto.
2. En una terminal, entrar a la carpeta del proyecto y ejecutar:
   ```bash
   npm install
   npm test
   npm run typecheck
   npm run build
   ```
3. Si algo falla, copiar el error completo eliminando claves, tokens, datos privados y cualquier valor sensible.
4. Confirmar si `MODEL_API_KEY` está en `.env.local`, no en `.env.example`, y nunca usar el prefijo `NEXT_PUBLIC_`.
5. Compartir solo el resultado no sensible de la prueba: modelo, estado HTTP/código de error, etapa que falló y cambio de créditos.
6. No afirmar que la app usa Meta si el indicador dice `Local demo fallback`.

## Cómo dividir el trabajo con una persona nueva

**Colaborador A — QA y extracción**
- Reproducir entorno local.
- Ejecutar tests y typecheck/build.
- Diseñar casos adversariales y revisar los 30 mensajes.
- Entregar tabla de fallos por campo, sin inventar métricas.

**Colaborador B — experiencia y demo**
- Mejorar claridad de evidencia, bloqueos y estados.
- Añadir mensajes de error y estados de carga.
- Verificar mobile y consistencia visual.
- Mantener los datos sintéticos etiquetados.

**Fundador — acceso, producto y submission**
- Resolver acceso/billing con Meta.
- Decidir qué ruta de modelo se utilizará.
- Aprobar cambios de alcance y afirmaciones del pitch.
- Confirmar repo, hosting, video y envío.

Una persona puede cubrir más de un rol; estas responsabilidades sirven para evitar que nadie asuma que otra persona está haciendo una tarea crítica.

## Riesgos y respuestas

| Riesgo | Respuesta |
|---|---|
| Billing activo pero inference no autorizada | Probar primero acceso/modelo; no ejecutar muchas llamadas. |
| Créditos no limitan cargos adicionales | Confirmar controles de gasto; monitorear saldo; detener pruebas si no hay protección clara. |
| JSON mode no funciona con el modelo habilitado | Separar fallo de acceso y fallo de formato; consultar a Meta; no ocultarlo con fallback. |
| Fallback local se confunde con Meta | Mostrar proveedor claramente; no permitir atribución falsa en video. |
| Falsa propuesta por dato desconocido | Hard gates, evidencia literal, revisión humana y pruebas. |
| Integraciones reales se comen el tiempo | No construir WhatsApp/Uber ni persistencia de producción en esta entrega salvo requisito crítico. |
| Demo no es reproducible | Congelar escenario sintético y probarlo desde navegador limpio. |

## Criterios de aceptación del hackathon

- Una persona puede ingresar un mensaje informal en español.
- El sistema presenta un borrador estructurado con evidencia.
- Los datos inciertos o faltantes son visibles.
- Las restricciones deterministas bloquean candidatos incompatibles.
- La interfaz explica el porqué de una propuesta o de un bloqueo.
- La persona debe aprobar explícitamente; no existe consentimiento por silencio.
- No se afirma que hubo rescate, despacho o impacto real.
- El uso de Meta se demuestra y se describe honestamente.
- El repositorio, el despliegue y el video se pueden abrir por los jueces.
