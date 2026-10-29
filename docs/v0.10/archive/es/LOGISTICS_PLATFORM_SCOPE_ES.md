# GrinFlow Logistics Platform — alcance v0.7

## Qué es esta entrega

Una primera consola operativa navegable para representar el ciclo logístico de excedentes: registrar una oferta, revisar la evidencia, seleccionar un destino y capacidad de transporte, evaluar bloqueos, registrar transiciones de estado y consultar el historial.

## Módulos incluidos

1. **Resumen:** conteos de operaciones, cola de atención, salud de coordinación y principios de operación.
2. **Operaciones:** registro de ofertas, detalle, evidencia, selección de destino y transporte, evaluación de restricciones y máquina de estados.
3. **Red de destinos:** directorio sintético con categoría, capacidad, tipo de uso, ventanas y política declarada de condición.
4. **Transporte:** capacidad sintética, disponibilidad, conductor y atributos pendientes de verificar.
5. **Historial:** registro local de cambios y transiciones.
6. **Exportación JSON:** exporta el estado local para revisión y respaldo manual.

## Ciclo de vida modelado

`draft → needs_review → ready_to_match → proposed → approved → assigned → picked_up → delivered`

Se permite cancelar en estados previos a entrega. Las transiciones inválidas se rechazan. Para pasar a `ready_to_match` se requieren categoría, cantidad positiva confirmada, condición declarada y confirmación humana de condición, ubicación y hora límite. Para proponer/aprobar/asignar/registrar recogida o entrega, se necesita una combinación de destino y vehículo que pase las reglas deterministas.

## Restricciones

- Todos los registros de arranque son ficticios.
- El almacenamiento usa `localStorage` en el navegador actual; no hay sincronización entre usuarios ni respaldo de servidor.
- La exportación JSON es manual y no es un mecanismo de seguridad.
- El historial local es útil para el prototipo, pero no es una bitácora inmutable o legalmente auditable.
- No hay login, roles, backend de operaciones, base de datos compartida, notificaciones, integración con WhatsApp, GPS/ruteo, reservas de vehículos ni comunicación con organizaciones.
- La condición del alimento es una declaración, no certificación de inocuidad.
- Una entrega registrada en la demo es solo una transición de estado; no demuestra que ocurrió físicamente.

## Qué sigue para producción

1. API autenticada y base de datos transaccional (PostgreSQL recomendado).
2. Multi-tenancy por organización, RBAC y políticas de acceso.
3. Auditoría append-only en servidor y versionado de correcciones.
4. Validación de dominio en servidor para toda transición; control de concurrencia e idempotencia.
5. Gestión de contactos y consentimiento, con minimización de datos personales.
6. Matching basado en capacidad disponible por intervalo, restricciones alimentarias, ventana temporal, ruta verificada y costo.
7. Integraciones opcionales con mensajería, mapas/ruteo y flota, siempre con permisos explícitos.
8. Observabilidad, backups, retención, alertas y pruebas de seguridad.
9. Piloto supervisado con organizaciones reales antes de cualquier despacho.
