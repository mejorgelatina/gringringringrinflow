# Arquitectura objetivo de GrinFlow (producción)

## Capas

1. **Canales de entrada:** interfaz web y, después de autorización, conectores de mensajería, correo, formularios y API.
2. **Ingesta y evidencia:** conserva texto fuente, identidad/organización autorizada, timestamp y referencia al mensaje original. Minimiza datos personales y aplica retención.
3. **Interpretación IA:** convierte lenguaje informal en eventos estructurados y campos con evidencia exacta. El modelo no decide inocuidad ni autoriza acciones.
4. **Validación de dominio:** esquema estricto, validación de citas, detección de correcciones, temporalidad, duplicados y datos faltantes.
5. **Registro operacional:** ofertas, necesidades, capacidades, disponibilidad temporal y restricciones. Versionado y auditoría append-only.
6. **Motor determinista de matching:** aplica hard gates; solo rankea candidatos que sobreviven a las restricciones. La incertidumbre crítica produce bloqueo o solicitud de aclaración.
7. **Planificación logística:** capacidad por ventana, compatibilidad de carga, tiempos de recepción, rutas verificadas, costos y alternativas. La ruta estimada nunca se presenta como confirmada.
8. **Aprobación y despacho:** aprobación explícita por usuario autorizado; reserva idempotente; confirmación del transportista y receptor. Integraciones externas requieren consentimiento.
9. **Seguimiento y cierre:** eventos de salida, recogida, llegada, recepción y excepciones. Impacto solo se calcula a partir de evidencia de cierre y métricas definidas.
10. **Observabilidad y seguridad:** métricas de precisión, falsos positivos, latencia, costo por mensaje, logs redactados, rate limits, roles, backups y alertas.

## Principios de dominio

- Una oferta no es una operación confirmada.
- Una propuesta no es una reserva.
- Una aprobación no es una recogida.
- Una recogida no es una entrega.
- Una entrega reportada necesita confirmación de receptor antes de computar impacto.
- Cantidad estimada nunca se trata como confirmada.
- Condición desconocida bloquea destinos de consumo humano.
- Un modelo no puede eliminar un bloqueo determinista.
- Correcciones generan eventos y conservan el estado previo.
- Cada operación tiene tenant/organización, actor, permisos y clave de idempotencia.

## Eventos de dominio sugeridos

`offer.received`, `offer.parsed`, `offer.review_requested`, `offer.corrected`, `offer.confirmed`, `match.generated`, `match.blocked`, `match.proposed`, `match.accepted`, `match.rejected`, `transport.availability_confirmed`, `transport.reserved`, `operation.approved`, `pickup.confirmed`, `delivery.reported`, `recipient.receipt_confirmed`, `operation.cancelled`, `exception.opened`, `exception.resolved`.

## Recomendación tecnológica

- **Frontend:** Next.js + TypeScript.
- **API:** rutas server-side con validación Zod y lógica de dominio fuera de la UI.
- **Persistencia:** PostgreSQL, por ejemplo Supabase, con migraciones versionadas.
- **Auth:** proveedor OIDC/Supabase Auth; roles por organización, nunca solo por UI.
- **Procesamiento asíncrono:** cola de trabajos cuando haya integraciones; idempotencia desde el primer endpoint que pueda repetirse.
- **IA:** adaptador de proveedor; el motor determinista no depende de un proveedor particular.
- **Mapas/rutas:** proveedor con rutas verificables y timestamp; no inventar distancias.
- **Observabilidad:** request IDs, métricas de coste, latencia, errores de extracción, calidad por campo y tasa de bloqueos incorrectos.

## Fases

### Fase A — hackathon
Consola de operaciones local-first, datos sintéticos, extracción y matching determinista, controles humanos, evidencia y demo verificable.

### Fase B — piloto controlado
Postgres, autenticación, aislamiento por organización, API de operaciones, auditoría server-side, backups y 1–2 organizaciones piloto con consentimiento.

### Fase C — operación real supervisada
Confirmación bilateral, disponibilidad logística, ruteo verificado, estados de recogida/entrega, manejo de excepciones, soporte operativo y medición de resultados comprobables.

### Fase D — red multi-organización
Conectores, API de partners, optimización multi-parada, predicción de capacidad y coordinación entre redes; solo tras validar calidad y gobernanza en el piloto.
