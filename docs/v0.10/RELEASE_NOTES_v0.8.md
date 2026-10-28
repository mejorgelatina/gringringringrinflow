# GrinFlow v0.8 — avance técnico

## Añadido
- Motor de matching aislado en `src/lib/match-engine.mjs`.
- Ranking determinista de candidatos con hard gates y score explicable versión `grinflow-match-v1`.
- Bloqueo explícito si falta ruta verificada; no inventa distancia ni ETA.
- Bloqueos por cantidad estimada/no confirmada, unidad incompatible, condición insegura, destino/transporte no confirmado, capacidad, deadline y ventanas operativas.
- Migración propuesta `0002_row_level_security.sql` con políticas base por tenant y rol, más registros de operación/auditoría de solo lectura desde cliente.
- Prompt de extracción reforzado para tratar el mensaje de origen como dato JSON no confiable, límite de 10,000 caracteres y soporte real para `META_BASE_URL`.
- Ocho pruebas nuevas del motor de matching.

## Verificación de esta entrega
- `npm test`: 26 pruebas pasan.
- `node --check` del motor nuevo pasa.
- No se hizo ninguna llamada al modelo ni se consumieron créditos de Meta.

## No verificado
- Instalación limpia de dependencias, `next build`, typecheck completo y pruebas de navegador.
- Ejecución de migraciones contra Supabase/PostgreSQL; las políticas RLS requieren revisión de seguridad y pruebas con dos organizaciones y todos los roles.
- Matching conectado a la interfaz, persistencia real, autenticación o rutas de mapas reales.

## Advertencia de seguridad
La migración RLS es una base revisable, no una certificación de seguridad. Antes de usar datos reales, se deben probar las referencias cruzadas entre organizaciones, políticas de cada rol, invitaciones, revocación de consentimiento, operaciones concurrentes y acceso a través de APIs server-side.
