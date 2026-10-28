# Plan para construir la plataforma logística completa

## Estado honesto al cierre de v0.9

Ya existe una consola navegable local-first que modela el ciclo de una operación, directorio sintético de destinos y transporte, correcciones humanas, bloqueos deterministas, historial local y exportación JSON. Se propuso un esquema PostgreSQL y arquitectura de producción.

Todavía no es una plataforma multiusuario ni un sistema logístico en producción. No tiene backend de operaciones, base de datos conectada, autenticación, permisos, integración con mensajería, ruteo en vivo, reserva de vehículos, notificaciones ni despacho real. La instalación y build de Next.js no se verificaron porque `npm install` agotó el tiempo en este entorno.

## Fase 0 — hacer reproducible el prototipo (bloqueante)

- [ ] Ejecutar `npm install` en una máquina de desarrollo con conectividad.
- [ ] Ejecutar `npm test`, `npm run typecheck`, `npm run build`.
- [ ] Corregir todos los errores de compilación.
- [ ] Abrir `/` y `/platform` en escritorio y móvil.
- [ ] Verificar alta de oferta, corrección, transiciones, historial y exportación.
- [ ] Confirmar que datos y estados se etiquetan como sintéticos.
- [ ] Probar acceso de Meta con consumo mínimo, sin lanzar el workshop completo hasta confirmar controles de facturación.

**Aceptación:** entorno reproducible y resultados de prueba documentados.

## Fase 1 — núcleo de dominio en servidor

- [ ] Elegir backend PostgreSQL gestionado (p. ej. Supabase) y revisar el esquema SQL con una persona técnica.
- [ ] Aplicar migraciones en un entorno de desarrollo, nunca directamente en producción.
- [ ] Definir tenancy: cada registro pertenece a una organización y los usuarios acceden mediante membresías.
- [ ] Implementar autenticación y autorización por rol (owner/admin/coordinator/reviewer/viewer/driver).
- [ ] Implementar API server-side para ofertas, destinos, capacidades, transporte, operaciones y eventos.
- [ ] Mover validación de transición al servidor; la UI no es una frontera de seguridad.
- [ ] Usar transacciones, versionado optimista e idempotencia para evitar dobles reservas.
- [ ] Guardar correcciones como eventos append-only con estado anterior/nuevo, actor, timestamp y request ID.
- [ ] Configurar RLS y pruebas de aislamiento entre organizaciones antes de introducir datos reales.
- [ ] Añadir backups, restauración probada, alertas, retención y política de borrado.

**Aceptación:** dos usuarios autorizados ven estado compartido; un usuario de otra organización no puede leer ni mutar esos datos; las transiciones inválidas fallan en servidor.

## Fase 2 — modelo operativo confiable

- [ ] Separar `supply_offer`, `recipient_capacity`, `transport_availability`, `match_proposal` y `rescue_operation` como entidades diferentes.
- [ ] Definir unidades normalizadas y conversiones explícitas; no comparar cajas con kg sin conversión declarada.
- [ ] Guardar vigencia temporal y confirmación de cada capacidad.
- [ ] Definir políticas por tipo de destino (consumo humano, alimento animal, composta, valorización).
- [ ] Implementar reglas de expiración para ofertas y capacidades.
- [ ] Definir solicitud de aclaración, corrección y nueva versión de extracción.
- [ ] Requerir consentimiento verificable para compartir ubicación/contacto y para despacho.
- [ ] Implementar cancelación, excepciones, no-show, rechazo del receptor y contingencias.

**Aceptación:** no hay propuesta ejecutable si falta un dato crítico, una capacidad expiró, una unidad no es comparable o el consentimiento necesario no existe.

## Fase 3 — matching y planificación logística

- [ ] Crear motor de hard gates independiente del LLM.
- [ ] Definir criterios de matching: categoría, condición, cantidad, uso permitido, ventana, distancia/tiempo, capacidad, requisitos de carga, costo y confiabilidad de datos.
- [ ] Añadir proveedor de rutas con respuesta versionada, timestamp y distinción entre estimación y ruta confirmada.
- [ ] Comprobar ventanas de recepción y disponibilidad de transporte por intervalos, no solo por estado general.
- [ ] Generar explicación de por qué cada candidato pasa o falla.
- [ ] Ordenar solo candidatos que pasan todos los bloqueos críticos.
- [ ] Comparar propuestas con restricciones y función objetivo documentadas.
- [ ] Añadir pruebas de regresión para rutas, horarios, capacidad, unidades, datos vencidos y condiciones.

**Aceptación:** la puntuación no puede vencer una restricción dura; cada recomendación es reproducible con la versión de reglas y datos usados.

## Fase 4 — canales e integraciones

- [ ] Diseñar un modelo de conector con permisos mínimos y consentimiento explícito.
- [ ] Empezar por un canal de entrada (formulario/webhook/correo) antes de integrar mensajería compleja.
- [ ] Para WhatsApp u otro canal, guardar referencia al mensaje y consentimiento; respetar políticas del proveedor y revocación.
- [ ] Añadir cola de procesamiento, reintentos con backoff, idempotencia y dead-letter queue.
- [ ] No enviar mensajes ni reservar transporte sin una acción humana explícita y permisos válidos.
- [ ] Añadir integraciones de mapas/rutas y flota solo después de validar datos del piloto.

**Aceptación:** reintentar un webhook no crea duplicados ni repite una acción externa.

## Fase 5 — ejecución y seguimiento

- [ ] Confirmación bilateral de donante y receptor.
- [ ] Confirmación del transportista y ventana de disponibilidad.
- [ ] Estados con evidencia: aceptado, asignado, recogido, recibido y cerrado.
- [ ] Manejo de incidencias, cancelaciones, rechazos y rutas fallidas.
- [ ] Notificaciones con registro de entrega y preferencias del usuario.
- [ ] Confirmación del receptor antes de computar impacto.
- [ ] Métricas separadas: ofertado, aceptado, recogido, entregado y verificado.

**Aceptación:** ninguna métrica de impacto se calcula solo a partir de una oferta o una propuesta aprobada.

## Fase 6 — seguridad y calidad operativa

- [ ] Threat model y revisión de seguridad.
- [ ] Pruebas de permisos, aislamiento de tenant, IDOR, rate limiting, abuso y entradas maliciosas.
- [ ] Redacción de secretos y datos personales en logs.
- [ ] Auditoría de acceso y exportación.
- [ ] Pruebas de restauración y respuesta a incidentes.
- [ ] Evaluación de extracción por campo, costo, latencia, calibración y falsos positivos.
- [ ] Supervisión humana del sistema de matching durante el piloto.
- [ ] Procedimiento para pausar operaciones si las señales de seguridad o calidad fallan.

## Fase 7 — piloto controlado

1. Seleccionar una zona y un conjunto pequeño de participantes.
2. Firmar/registrar consentimiento y responsabilidades.
3. Operar primero en modo shadow: GrinFlow recomienda, una persona compara con el proceso actual.
4. Revisar discrepancias, falsos positivos, tiempo de coordinación y carga operativa.
5. Pasar a operación asistida solo tras criterios acordados con participantes.
6. No automatizar despacho ni reportar impacto público hasta tener evidencia suficiente.

## Lo que debe hacer el fundador ahora

1. Descarga el paquete v0.9 y comparte `ONBOARDING_GUIDE_ES.md` con la persona que se incorpore.
2. En una máquina con Node.js 20+, ejecuta `npm install`, `npm test`, `npm run typecheck`, `npm run build`.
3. Prueba `/platform`; si aparece un error, comparte el log sin secretos.
4. Decide si el objetivo inmediato sigue siendo el hackathon o si vamos a iniciar un piloto: son planes distintos y el piloto requiere datos, permisos y controles que no debemos improvisar.
5. Elige backend y asigna a alguien la revisión del SQL. No conectes la app a datos reales hasta tener auth, RLS y pruebas de aislamiento.
6. Mantén Meta como adaptador de extracción; el núcleo logístico y las restricciones deben seguir funcionando sin depender del modelo.

## Prioridad recomendada

**Primero:** instalación/build y demo fiable. **Después:** backend multiusuario con seguridad. **Luego:** matching real y confirmación de capacidades. **Finalmente:** integraciones y ejecución. No empieces por WhatsApp, Uber ni agentes autónomos: sin un registro operacional confiable, solo automatizaríamos incertidumbre.


## Avance añadido en v0.9

- Filosofía de producto formalizada: GrinFlow agrega una capa de inteligencia sobre WhatsApp, llamadas, hojas de cálculo y capacidad logística existente.
- Motor de matching con hard gates y score explicable; no considera elegible un candidato sin ruta verificada.
- Motor de backhaul para evaluar recogidas adicionales tras una entrega confirmada, con consentimiento, capacidad libre, compatibilidad, permisos de transporte y beneficio neto de ruta.
- Contrato API propuesto para separar interfaz, servidor, permisos, eventos de auditoría y motores de decisión.
- Migración RLS propuesta, todavía no ejecutada y pendiente de revisión de seguridad.
- Suite local: 34 pruebas pasan; no se hicieron llamadas de pago.


## Avance añadido en v0.10

- Motor aislado de Human Interaction Layer: solicitudes con razón, destinatario/rol, opciones cerradas, expiración, cancelación y eventos.
- La respuesta no ejecuta ni aprueba automáticamente ninguna operación.
- Suite de pruebas actualizada: 44/44 pasan.
