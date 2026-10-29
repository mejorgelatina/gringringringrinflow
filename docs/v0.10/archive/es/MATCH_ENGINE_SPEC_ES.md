# Motor de matching de GrinFlow — especificación v1

## Propósito
Convertir una oferta de excedente en una lista explicable de combinaciones oferta–destino–transporte. El motor **no ejecuta operaciones**. Genera evaluación determinista para revisión humana.

## Principio de decisión
1. **Hard gates primero.** Una sola condición crítica fallida hace que el candidato no sea elegible y su score sea `null`.
2. **Ranking después.** El score solo ordena candidatos elegibles; nunca compensa una condición insegura, dato ausente, unidad incompatible o disponibilidad no confirmada.
3. **Evidencia y procedencia.** No se infieren kilómetros o ETAs por colonia/nombre. Para ser elegible, el candidato debe traer una ruta con proveedor, distancia, duración, ETA y marca de verificación.
4. **Human-in-the-loop.** La cantidad, la condición del alimento, la disponibilidad del destino y el transporte deben tener confirmación explícita.

## Bloqueos v1
- categoría no aceptada;
- cantidad ausente, estimada o no confirmada;
- unidades distintas (sin conversión explícita);
- destino o transporte no confirmado;
- capacidad insuficiente;
- condición no aceptada;
- consumo humano sin condición `edible` y confirmación humana independiente;
- deadline ausente o vencido;
- ruta no verificada, llegada posterior al deadline o fuera de ventana.

## Score explicable (solo elegibles)
Versión `grinflow-match-v1`, ponderaciones iniciales provisionales:
- ajuste de capacidad: 25%;
- confirmación del destino: 20%;
- confirmación de transporte: 20%;
- eficiencia de ruta: 20%;
- holgura temporal: 15%.

Estas ponderaciones no se han calibrado con operaciones reales. Antes de un piloto, se deben validar con coordinadores y medir tasa de asignaciones completadas, cancelaciones, distancia real vs. estimada, tiempo de coordinación y desperdicio evitado verificado.

## Contrato de ruta
`{ verified: true, provider, distanceKm, durationMinutes, estimatedArrivalAt, verifiedAt }`

`estimatedArrivalAt` es timestamp Unix en milisegundos. La fuente puede ser un proveedor de mapas o una verificación humana documentada. Si la ruta no está verificada, el candidato se bloquea. No usar datos sintéticos como rutas reales.

## Límites actuales
- No hace geocodificación, cálculo real de rutas ni reserva de unidades.
- No normaliza unidades automáticamente; no asumir que cajas, kg y piezas son equivalentes.
- No evalúa cadena de frío, alérgenos, trazabilidad sanitaria ni requisitos regulatorios de cada alimento.
- No se ha conectado al dashboard ni a una base de datos. Las pruebas son sintéticas.
