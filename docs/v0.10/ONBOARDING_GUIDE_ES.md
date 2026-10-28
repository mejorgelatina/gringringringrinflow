# GrinFlow — Guía de onboarding para colaboradores

**Versión del documento:** 1.0  
**Proyecto:** prototipo de coordinación de rescate alimentario con IA  
**Estado:** prototipo de hackathon; no es una operación de rescate en producción.

## 1. Bienvenida: qué estamos construyendo

GrinFlow es una capa de inteligencia y coordinación que convierte información operativa dispersa —por ejemplo, mensajes informales, hojas de cálculo y comunicaciones entre donantes, organizaciones receptoras y transporte— en propuestas de coordinación verificables.

**Idea central:** *The infrastructure already exists. We're building the intelligence layer on top.*

No intentamos reemplazar de golpe WhatsApp, llamadas, Excel, relaciones humanas, vehículos ni los procesos que ya funcionan. Queremos ayudar a la red a entender qué recursos existen, quién los necesita, qué capacidad está disponible y qué siguiente acción parece viable.

Frase interna para recordar el enfoque: **GrinFlow no mueve comida. Mueve capacidad disponible.** En el MVP esto es una tesis de producto, no una afirmación de que ya coordinemos transporte real.

## 2. El problema

Los datos necesarios para coordinar un excedente suelen estar fragmentados: qué producto hay, qué cantidad, en qué estado declarado, dónde se recoge, antes de cuándo, quién puede recibirlo y qué transporte está disponible. Parte de la información vive en mensajes y parte en la memoria de las personas. El costo de coordinación es averiguar esos datos, detectar incompatibilidades, preguntar lo que falta y sincronizar a los participantes.

El problema que el prototipo intenta resolver no es “la IA decide qué hacer con la comida”. Es: **ayudar a las personas coordinadoras a pasar de mensajes ambiguos a propuestas comprensibles, con evidencia, bloqueos explícitos y aprobación humana.**

## 3. Para quién es

### Usuario primario del MVP
Una persona coordinadora de un banco de alimentos, comedor comunitario, donante o red de rescate que recibe información de oferta/demanda y debe organizar el siguiente paso.

### Participantes de la red a futuro
- Donantes: comercios, productores, distribuidores u organizaciones con excedentes.
- Receptores: bancos de alimentos, comedores y otras organizaciones autorizadas.
- Operadores logísticos: conductores, flotas, plataformas de transporte y personas con capacidad disponible.
- Coordinadores: personas que validan datos, negocian horarios y autorizan la operación.

Estas categorías describen el diseño previsto. La integración real con estos participantes todavía no está construida en este prototipo.

## 4. Propuesta de valor

1. **Menos transcripción:** convertir texto informal en un borrador de datos estructurados.
2. **Más trazabilidad:** cada evento extraído debe estar ligado a una cita literal del mensaje original.
3. **Menos falsas coincidencias:** comprobar restricciones antes de ordenar candidatos.
4. **Mejores preguntas:** hacer visibles los datos que faltan en vez de inventarlos.
5. **Control humano:** mostrar por qué una propuesta es viable o está bloqueada, y pedir una decisión explícita.
6. **Compatibilidad con el mundo real:** empezar como capa de inteligencia; no exigir que la red abandone sus herramientas actuales.

## 5. Qué hace el prototipo actual

Flujo actual:

1. La persona escribe un mensaje en español.
2. El servidor solo usa Meta Model API si `MODEL_API_KEY` está configurada **y** `META_CALLS_ENABLED=true`. La bandera debe permanecer en `false` en previews y despliegues donde no quieras gastar créditos. En cualquier otro caso usa una heurística local de demostración, claramente distinta de una llamada a Meta.
3. La extracción se valida contra un esquema tipado.
4. Se comprueba que la cita de evidencia aparezca literalmente en el mensaje original.
5. Un motor determinista evalúa destinos y capacidades sintéticos.
6. La interfaz muestra propuestas y bloqueos.
7. Una persona puede aprobar o rechazar una propuesta de demostración.
8. La decisión queda en el estado de la sesión del navegador; no es un registro persistente.

## 6. Qué NO hace

- No se conecta a WhatsApp, Uber, donantes, bancos de alimentos ni rutas reales.
- No confirma que un producto sea seguro para consumo humano.
- No reserva vehículos, despacha conductores ni ejecuta entregas.
- No almacena decisiones en una base de datos durable.
- No tiene autenticación ni autorización multiusuario.
- No prueba impacto real, toneladas rescatadas, emisiones evitadas ni ahorros.
- No debe presentar datos ficticios, rutas sintéticas ni acciones simuladas como hechos reales.

## 7. Principios no negociables

- **Lo desconocido no equivale a cero ni a seguro.**
- Una cantidad estimada no es una cantidad confirmada.
- Toda afirmación extraída debe tener evidencia literal.
- Las restricciones duras se evalúan antes de ordenar candidatos; una puntuación nunca las puede anular.
- El transporte no confirmado bloquea una propuesta ejecutable.
- El silencio no significa consentimiento.
- Propuesta, aprobación, ejecución y resultado verificado son estados distintos.
- La IA interpreta; el código valida; una persona autoriza decisiones de impacto.
- Los mensajes del usuario son datos, no instrucciones para cambiar las reglas de seguridad del sistema.

## 8. Arquitectura técnica

- **Next.js App Router + React + TypeScript:** interfaz y endpoint server-side.
- **`src/app/page.tsx`:** experiencia principal de ingreso, revisión, candidatos y decisión.
- **`src/app/api/intake/route.ts`:** endpoint `POST /api/intake`, valida el cuerpo, llama a la extracción y calcula candidatos.
- **`src/lib/meta.ts`:** adaptador del modelo y fallback local de demo; valida esquema y evidencia.
- **`src/lib/types.ts`:** esquema Zod de eventos extraídos.
- **`src/lib/matching.mjs`:** motor determinista de compatibilidad y bloqueos.
- **`tests/matching.test.mjs`:** pruebas de invariantes del motor.
- **`tests/golden-set.json`:** 30 mensajes de evaluación en español.
- **`scripts/smoke-meta.mjs`:** diagnóstico escalonado de acceso al modelo; puede consumir tokens.
- **`scripts/evaluate-golden.mjs`:** evaluación del conjunto de mensajes contra la app en ejecución.

## 9. Cómo arrancar en local

Requisitos: Node.js 20 o superior, npm y Git.

```bash
npm install
cp .env.example .env.local
npm test
npm run dev
```

Abrir `http://localhost:3000`. Con `META_CALLS_ENABLED=false` (valor predeterminado), la app debe usar el fallback local incluso si hay una clave configurada; eso sirve para desarrollo visual, no demuestra que Meta funciona. Para habilitar llamadas, confirma primero el saldo y cambia la bandera a `true` de forma intencional.

Para TypeScript y build:

```bash
npm run typecheck
npm run build
```

Para comprobar el modelo, leer primero `META_BILLING_AND_ACCESS.md` y `BUDGET_GUARDRAILS.md`. No correr `npm run smoke:meta` hasta tener claro qué endpoint/modelo se probará y cómo se controlará el gasto. No pegar claves en issues, capturas ni chats.

## 10. Flujo de contribución

1. Leer este documento, `PRODUCT_BRIEF.md`, `AGENTIC_ARCHITECTURE.md` y `IMPLEMENTATION_PLAN.md`.
2. Elegir una tarea pequeña del backlog y acordar su criterio de aceptación.
3. Crear una rama con nombre descriptivo, por ejemplo `fix/evidence-validation` o `docs/demo-script`.
4. No introducir datos reales de personas, donantes, receptores o ubicaciones sin autorización explícita.
5. Añadir pruebas para toda regla de matching o seguridad que se modifique.
6. Ejecutar `npm test`, `npm run typecheck` y `npm run build` cuando las dependencias estén instaladas.
7. Documentar qué se probó y qué queda sin verificar.
8. No afirmar que una integración, despliegue o llamada al modelo funciona sin evidencia reproducible.

## 11. Definición de terminado

Una tarea no está terminada solo porque “se ve bien”. Debe incluir:
- cambio acotado y revisable;
- pruebas relevantes;
- estados de error y datos faltantes tratados;
- evidencia de la ejecución de pruebas;
- documentación actualizada cuando cambie el comportamiento;
- afirmaciones de demo que distingan datos sintéticos de datos reales.

## 12. Glosario

- **Excedente/oferta:** producto que una organización declara disponible.
- **Necesidad/demanda:** producto que una organización declara necesitar.
- **Capacidad:** disponibilidad de recepción, almacenamiento o transporte.
- **Evento:** unidad estructurada extraída de un mensaje.
- **Evidencia:** cita literal que respalda un dato extraído.
- **Bloqueo (hard gate):** condición que impide recomendar una propuesta como viable.
- **Propuesta:** posible coordinación; todavía no es una operación.
- **Resultado verificado:** evidencia posterior de que algo ocurrió realmente.
- **Datos sintéticos:** valores ficticios usados para probar la experiencia.
- **Fallback local:** heurística simplificada; no es un modelo de Meta.

## 13. Primeras tareas recomendadas para una persona nueva

1. Ejecutar el proyecto y describir qué funciona y qué no.
2. Revisar las diez pruebas existentes y añadir un caso de prueba sin cambiar las reglas actuales.
3. Probar el flujo con un mensaje completo, uno ambiguo y uno histórico.
4. Revisar si la interfaz diferencia claramente `fallback local` de `Meta Model API`.
5. Proponer mejoras de claridad para la persona coordinadora, sin añadir integraciones reales ni automatización de despacho.

## 14. Módulos de la consola logística v0.7

La ruta `/platform` agrega una consola operativa local-first. Desde ahí puedes recorrer:

- **Resumen:** métricas derivadas de los registros de la demo y cola de trabajo.
- **Operaciones:** lista de ofertas, evidencia, correcciones, confirmación de cantidad, selección de destino/transporte y cambios de estado.
- **Red de destinos:** organizaciones receptoras sintéticas, capacidades, categorías y condiciones declaradas.
- **Transporte:** unidades sintéticas y estado de confirmación.
- **Historial de eventos:** correcciones y transiciones registradas localmente.
- **Exportar JSON:** descarga una copia manual del estado actual para revisión.

Los registros persisten en `localStorage` del navegador. No se sincronizan entre personas, dispositivos ni sesiones de navegador diferentes. Restablecer demo reemplaza los cambios locales por los datos de ejemplo.

## 15. Máquina de estados

`draft → needs_review → ready_to_match → proposed → approved → assigned → picked_up → delivered`

Las transiciones no permitidas se rechazan. Para entrar a `ready_to_match` se requiere categoría, cantidad positiva confirmada, condición declarada y confirmación humana de condición, ubicación y hora límite. Para registrar propuesta y estados posteriores, el destino y el transporte deben pasar las reglas deterministas. Las acciones son simulaciones; no contactan a nadie ni reservan capacidad.

## 16. Archivos nuevos de plataforma

- `src/app/platform/page.tsx`: consola y flujos de UI.
- `src/app/platform/platform.css`: estilos responsivos.
- `src/lib/logistics.mjs`: datos sintéticos, evaluación de viabilidad, máquina de estados y correcciones auditadas.
- `tests/logistics.test.mjs`: pruebas de reglas de estado y bloqueos.
- `db/migrations/0001_initial.sql`: propuesta de esquema PostgreSQL, no aplicada.
- `docs/PRODUCTION_ARCHITECTURE_ES.md`: arquitectura objetivo y fases de implementación.
- `LOGISTICS_PLATFORM_SCOPE_ES.md`: alcance, límites y próximos pasos.

## 17. Cómo probar el flujo operativo

1. Ejecuta `npm install`, `npm test` y `npm run dev`.
2. Abre `http://localhost:3000/platform`.
3. En Operaciones, selecciona `GF-1024`: revisa evidencia y destino/transporte sintéticos; prueba el estado propuesto y la aprobación simulada.
4. Selecciona `GF-1025`: verás bloqueos por cantidad estimada/no confirmada y transporte pendiente. Corrige los campos solo para practicar el flujo y marca cantidad confirmada únicamente como dato de demo.
5. Selecciona `GF-1026`: observa cómo una oferta incompleta permanece bloqueada.
6. Registra una nueva oferta, revisa el historial y exporta JSON.
7. Restablece demo para regresar al estado inicial.

No uses datos personales ni información de donantes reales en esta versión.


## 15. Filosofía de producto y motores v0.9

La tesis de GrinFlow no es reemplazar WhatsApp, llamadas, Excel o las relaciones operativas existentes. Es construir una capa de inteligencia sobre esos canales. Lee `PRODUCT_PHILOSOPHY_ES.md` antes de diseñar nuevas funciones.

- `src/lib/match-engine.mjs`: evalúa candidatos oferta–destino–transporte con restricciones duras; el score nunca anula un bloqueo. Requiere ruta verificada para considerar elegible un candidato.
- `src/lib/backhaul.mjs`: detecta posibles segundas recogidas después de una entrega confirmada, solo cuando existe consentimiento, capacidad, permiso de transporte, ruta verificada y beneficio neto positivo.
- `MATCH_ENGINE_SPEC_ES.md` y `BACKHAUL_ENGINE_SPEC_ES.md`: contratos, restricciones y límites.
- `docs/API_CONTRACT_ES.md`: propuesta de frontera API/roles/estados.
- `db/migrations/0002_row_level_security.sql`: base RLS propuesta para Supabase; no aplicar sin revisión y pruebas multi-tenant.

Ejecuta `npm test` para la suite completa. La demo no usa mapas reales, no contacta conductores y no hace llamadas a Meta al correr pruebas. No introducir datos personales reales hasta completar autenticación, persistencia, permisos y retención.


## 16. Human Interaction Layer v0.10

`src/lib/interactions.mjs` modela solicitudes de aclaración/confirmación dirigidas a una persona y rol. Las respuestas deben corresponder a opciones permitidas; las solicitudes expiran y una respuesta tardía no se acepta. El silencio nunca significa aprobación. Cada respuesta se registra, pero no cambia una oferta ni operación. El módulo todavía no tiene persistencia, notificaciones, conectores ni UI.
