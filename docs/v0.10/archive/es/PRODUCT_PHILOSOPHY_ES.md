# GrinFlow — filosofía de producto

## Tesis
**No reemplazamos la infraestructura existente. La hacemos más inteligente.**

The infrastructure already exists. We're building the intelligence layer on top.

El sistema operativo real de una red de recuperación de alimentos no es una aplicación: es una combinación de WhatsApp, llamadas, hojas de cálculo, relaciones personales, conocimiento tácito de coordinadores y decisiones de conductores sobre la marcha. Es imperfecto, pero tiene adopción y resuelve trabajo real. GrinFlow debe aumentar su capacidad sin exigir que todos abandonen sus herramientas de un día para otro.

## Qué construimos
GrinFlow es una capa de inteligencia logística que conecta **oferta, demanda, capacidad de recepción y capacidad de transporte ociosa** en una red que ya existe. No es primero un ERP nuevo, una flota propia ni otro chat que obligue a cambiar de hábito.

## Evolución por niveles

### 1. Comunicación → información estructurada
- Recibir mensajes de canales autorizados y fuentes manuales.
- Extraer oferta, cantidad, unidad, condición declarada, ubicación, ventana de recolección y evidencia literal.
- Mantener el mensaje original y distinguir dato explícito, estimación e inferencia.
- No crear eventos operativos a partir de agradecimientos, mensajes históricos o ruido.

### 2. Coordinación → opciones concretas
- Relacionar oferta con demanda, capacidad de recepción y ventanas de tiempo.
- Proponer opciones explicables con bloqueos y datos faltantes.
- Enviar propuestas a una persona responsable para aprobación.
- No responder a nombre de un donante, banco o conductor sin autorización explícita.

### 3. Logística → capacidad ya existente
- Consultar unidades, conductores, rutas y proveedores que estén disponibles y autorizados.
- Preferir capacidad ociosa de vehículos que ya están en movimiento, cuando sea legal, segura y operacionalmente compatible.
- No comprar ni administrar flotas como primera respuesta.
- No asumir que Uber, Uber Package u otra plataforma permiten transportar alimentos; validar términos, capacidad, temperatura y consentimiento antes de integrar.

### 4. Optimización de red → backhauls y viajes de retorno
- Detectar oportunidades de segunda recogida después de una entrega confirmada.
- Comparar ruta base contra ruta con desvío, con distancia/ETA verificados.
- Calcular kilómetros vacíos potencialmente evitados y kilómetros/minutos incrementales.
- Bloquear la oportunidad si el beneficio neto no es positivo, no hay consentimiento, no hay capacidad libre o las ventanas no cuadran.
- Requerir aprobación humana antes de contactar a un conductor o cambiar un viaje.

## Reglas no negociables
1. **No inventar disponibilidad, distancia, ETA, cantidad ni condición sanitaria.**
2. **La IA extrae y recomienda; no certifica seguridad ni ejecuta logística por sí sola.**
3. **La incertidumbre se muestra, no se esconde.** Cada dato importante tiene estado: explícito, estimado, confirmado, no verificado o desconocido.
4. **Consentimiento granular.** Autorización para procesar mensajes no implica automáticamente autorización para compartir ubicación, contacto, oferta o ejecutar transporte.
5. **Human-in-the-loop.** Confirmaciones humanas separadas para cantidad, condición, destino, transporte, asignación y entrega.
6. **Integración incremental.** CSV/Excel y captura manual primero; conectores de mensajería solo con permisos y bases legales apropiadas.
7. **Medir impacto real.** Separar alimentos ofrecidos, aceptados, recogidos y entregados. No reportar desperdicio evitado sin evidencia.

## Métrica central
**Rescates completados con seguridad y evidencia por unidad de coordinación**, acompañada de:
- tiempo de oferta a confirmación;
- tasa de ofertas con información completa;
- tasa de match aceptado y entrega completada;
- kilómetros incrementales frente a kilómetros vacíos evitados;
- cancelaciones y causas;
- kg/piezas entregadas verificadas (no solo anunciadas);
- carga administrativa por operación;
- incidentes de seguridad y consentimiento.

## Flujo operativo a una mano
La operación se adapta a las manos del operador, no el operador a la interfaz. Registrar un excedente debe ser lo que ya se hace: tomar una foto, hablar y seguir trabajando.

1. **Capturar:** una foto o una nota de voz.
2. **Interpretar:** productos, cantidades aparentes, contexto y datos disponibles.
3. **Evaluar:** ICC (índice de calidad compuesto) construye una evaluación preliminar con evidencia y nivel de confianza.
4. **Resolver:** el sistema pregunta únicamente lo que no puede determinar.
5. **Registrar:** el registro estructurado entra a la red.

Menos fricción no significa menos rigor: el sistema distingue lo observado, lo declarado, lo estimado y lo verificado. Una imagen no demuestra temperatura, historial de conservación ni inocuidad. ICC no inventa certeza para que la experiencia sea rápida.

> El mejor software operativo es el que nunca interrumpe la operación.

### Métricas de ingesta
El objetivo de menos de diez segundos es para captura y primera estructuración, no para completar todas las verificaciones.

| métrica | qué mide |
| --- | --- |
| Time to Capture | tiempo para tomar la foto o grabar el audio |
| Time to Structured Resource | tiempo hasta generar el registro estructurado |
| Time to Actionable Resource | tiempo hasta tener información suficiente para evaluar una acción |
| Human Correction Rate | porcentaje de registros que requieren corrección |
| Completion Without Typing | registros completados sin escribir manualmente |

## Posicionamiento
No vendemos “otra app para coordinar donaciones”. Construimos inteligencia de red sobre los canales y activos que ya existen, comenzando por estructurar mensajes y reducir coordinación manual; después conectamos demanda y logística; finalmente optimizamos la capacidad ociosa de toda la red.
