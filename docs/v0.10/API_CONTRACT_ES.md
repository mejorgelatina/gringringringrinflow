# Contrato API v1 — GrinFlow (propuesta)

Este contrato define la frontera del servidor antes de conectar la consola a datos reales. No implica que los endpoints ya estén implementados.

## Principios
- Todas las rutas requieren sesión autenticada salvo `GET /api/health`.
- El servidor obtiene `organization_id` de la sesión/membresía; nunca confía en un tenant enviado por el navegador.
- Cada acción comprueba rol, estado actual, versión del registro y consentimiento relevante.
- Las mutaciones aceptan `Idempotency-Key` y `If-Match`/`expectedVersion` cuando corresponda.
- Los eventos de auditoría son append-only. El cliente no puede modificar eventos históricos.
- Los endpoints de matching devuelven propuestas, nunca ejecutan una asignación.
- Respuestas de error usan `{ code, message, details?, requestId }`; no devuelven secretos ni mensajes internos de proveedores.

## Endpoints propuestos

Ya implementados como previews stateless (sin autenticación porque no persisten datos ni ejecutan acciones): `POST /api/demo/match-preview` y `POST /api/demo/backhaul-preview`. Son rutas de demostración, aceptan payloads acotados, devuelven bloqueos y resultados, y no llaman a proveedores externos. No deben usarse con datos personales ni como endpoints operativos públicos. El resto de rutas de la tabla sigue siendo propuesta.

| Método | Ruta | Roles mínimos | Resultado |
|---|---|---|---|
| GET | `/api/health` | Público | Estado técnico, sin secretos |
| GET/POST | `/api/v1/offers` | Viewer / Coordinator | Lista filtrada por tenant; crear oferta como borrador |
| GET/PATCH | `/api/v1/offers/:id` | Viewer / Coordinator / Reviewer | Detalle; corrección versionada y auditada |
| POST | `/api/v1/offers/:id/confirm-quantity` | Coordinator / Reviewer | Confirmación humana con usuario, hora y evidencia |
| POST | `/api/v1/offers/:id/confirm-condition` | Reviewer / Coordinator autorizado | Condición y evidencia de verificación separadas de extracción IA |
| GET/POST | `/api/v1/recipients` | Viewer / Coordinator | Directorio y capacidades disponibles |
| GET/POST | `/api/v1/transports` | Viewer / Coordinator | Unidades y disponibilidad declarada |
| POST | `/api/v1/match-previews` | Coordinator / Reviewer | Candidatos, bloqueos, score versionado; no despacho |
| POST | `/api/v1/backhaul-previews` | Coordinator | Oportunidades de retorno; requiere ruta verificable y permisos |
| POST | `/api/v1/operations` | Coordinator | Crear operación a partir de propuesta aprobada |
| POST | `/api/v1/operations/:id/transitions` | Según transición | Transición válida y evento inmutable |
| GET | `/api/v1/operations/:id/events` | Miembro del tenant | Línea de tiempo auditable |
| POST | `/api/v1/consents` | Owner / Admin | Registrar o retirar consentimiento granular |
| GET | `/api/v1/audit-events` | Owner / Admin | Auditoría del tenant con paginación |

## Contrato de extracción

`POST /api/v1/intake/preview` acepta texto autorizado, canal y referencia de consentimiento. Devuelve:
- eventos extraídos;
- citas exactas del mensaje de origen;
- campos faltantes;
- nivel de revisión requerido;
- modelo/proveedor y versión de prompt;
- estado `preview_only`.

No crea oferta automáticamente. Una acción humana convierte un borrador revisado en registro operativo. Mensajes no autorizados o sin base de tratamiento se rechazan antes de invocar al modelo.

## Transiciones

La máquina de estados del servidor es la fuente de verdad. El servidor vuelve a comprobar todas las condiciones en cada transición. `delivered` requiere evidencia de entrega; `cancelled` requiere razón. No aceptar un cambio de estado directo por PATCH.

## Seguridad y privacidad
- No poner claves de proveedor en variables `NEXT_PUBLIC_*`.
- Limitar tamaño de cuerpo, tasa por usuario/tenant, longitud del texto y coste de IA.
- Redactar PII en logs; mantener el mensaje fuente con retención y permisos definidos.
- Evitar incluir direcciones/contactos en prompts si no son necesarios.
- No enviar datos de un tenant a otro para matching sin consentimiento y regla de visibilidad explícitos.
- Los webhooks deben validar firma, timestamp y protección anti-replay.

## Estados de datos

Cada dato crítico debe poder distinguir: `unknown`, `extracted_unverified`, `estimated`, `human_confirmed`, `provider_verified`, `expired`, `withdrawn`. La extracción de IA nunca equivale a verificación humana.
