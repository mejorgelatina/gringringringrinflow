# Motor de oportunidades de retorno (backhaul) — v1

## Objetivo
Detectar una segunda tarea compatible para una unidad después de que complete una entrega, usando capacidad existente y reduciendo kilómetros vacíos. El motor produce una recomendación explicable; no asigna conductores ni modifica viajes.

## Entradas requeridas
- Primera entrega confirmada.
- Vehículo/conductor y ventana de disponibilidad confirmados.
- Capacidad útil y carga remanente después de la primera entrega.
- Oferta nueva con cantidad confirmada, donante confirmado y consentimiento explícito para compartir los datos necesarios.
- Destino confirmado, categoría compatible y política de condición.
- Confirmación de que el contrato del transportista/plataforma permite ese tipo de carga.
- Ruta verificada con proveedor, ETA de recogida y entrega, km incrementales, km vacíos evitados y duración incremental.

## Bloqueos
Sin consentimiento; primera entrega no confirmada; unidad o capacidad no confirmada; carga excedente; destino no confirmado/incompatible; condición no verificada para consumo humano; oferta vencida; ETA fuera de ventana; ruta sin verificación; beneficio neto no positivo; condiciones del transportista sin validar.

## Cálculo
`beneficio_neto_km = km_vacios_evitados - km_incrementales`

Solo se considera factible cuando el beneficio neto es estrictamente positivo y todos los hard gates pasan. El score inicial es una normalización provisional de beneficio neto respecto a kilómetros vacíos evitados. No está calibrado con datos reales.

## Guardrails
- Los kilómetros son estimaciones de una ruta verificada, no prueba de impacto.
- No suponer que un vehículo puede transportar comida por ser de rideshare o paquetería.
- No añadir paradas automáticamente ni contactar al conductor sin aprobación.
- No revelar información de donantes/destinos a terceros sin consentimiento específico.
- Medir contra la ruta base documentada; guardar versión de proveedor, fecha y hora.
