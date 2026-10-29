# Validación de la integración con Meta Model API

Fecha de revisión: 28 de octubre de 2026.

## Lo que confirman las fuentes oficiales

- Base URL: `https://api.meta.ai/v1`.
- ID de modelo para la API directa: `muse-spark-1.3`.
- Chat Completions: `POST /v1/chat/completions`, con `model` y `messages`; es adecuado para esta extracción de un solo turno.
- Responses: `POST /v1/responses`, con `model` e `input`; Meta lo recomienda para agentes, continuidad de razonamiento entre turnos y funciones disponibles solo en Responses.
- Structured output en Chat Completions: la documentación muestra `response_format: { type: "json_schema", json_schema: { name, schema } }`.

Fuentes:
- https://dev.meta.ai/docs/overview
- https://dev.meta.ai/docs/protocols
- https://dev.meta.ai/docs/protocols/chat-completions
- https://dev.meta.ai/docs/protocols/responses
- https://dev.meta.ai/docs/structured-output

## Decisión aplicada en el adaptador

Se mantiene Chat Completions porque el intake es una extracción de un solo turno y no requiere razonamiento entre turnos, tool loops ni search grounding. Se cambia la petición desde JSON mode (`json_object`) a un JSON Schema explícito, siguiendo el patrón documentado por Meta para extracción. Después de recibir la respuesta, la aplicación aún valida con Zod y comprueba que cada `quote` sea una subcadena exacta del mensaje fuente.

La documentación revisada demuestra que Meta documenta `json_schema`; no demuestra que `json_object` sea inválido o esté deshabilitado. Por tanto, `json_object` queda clasificado como no verificado para esta cuenta/modelo, no como definitivamente incompatible.

## Seguridad de gasto

La ruta `/api/intake` requiere ahora ambas condiciones para llamar al modelo:

- `MODEL_API_KEY` presente.
- `META_CALLS_ENABLED=true` explícito.

`.env.example` establece `META_CALLS_ENABLED=false`. Las pruebas de inferencia del script `npm run smoke:meta` son una acción separada y pueden consumir créditos; el script no se ejecutó durante esta revisión.

## Pendiente de validar con una llamada real

- Que la cuenta y la clave tengan permiso de inferencia en `muse-spark-1.3`.
- Que Meta acepte el esquema completo utilizado por GrinFlow en esta cuenta/modelo.
- El comportamiento real del endpoint desde el entorno desplegado.
- Los límites concretos de palabras clave y restricciones de JSON Schema.

## Pregunta para office hours

> Our app uses Muse Spark 1.3 through Chat Completions for single-turn extraction. The current docs show `response_format.type = "json_schema"`. Is `json_object` also supported for Muse Spark 1.3, and are there any schema subset/keyword limitations we should account for? Would you recommend Responses API for single-turn extraction when we do not need multi-turn reasoning replay or Responses-only features?

No se hicieron llamadas a Meta para esta validación documental.
