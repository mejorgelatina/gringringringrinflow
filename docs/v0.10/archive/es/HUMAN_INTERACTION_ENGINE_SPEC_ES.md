# Human Interaction Layer — motor de solicitudes v1

## Objetivo
Convertir una necesidad de coordinación en una pregunta dirigida a una persona/rol autorizado, con respuestas explícitas, caducidad y auditoría. Este módulo registra respuestas; no cambia por sí solo el estado de una oferta ni autoriza una operación.

## Ciclo
`pending → answered | expired | cancelled`

## Campos mínimos
- entidad afectada y código de razón;
- rol/persona destinataria;
- pregunta concreta;
- conjunto cerrado de respuestas permitidas;
- canal, fecha de creación y fecha de expiración;
- respuesta, actor, rol, hora y evidencia opcional;
- eventos de creación, respuesta, expiración o cancelación.

## Reglas
- Silencio nunca equivale a consentimiento, aceptación ni aprobación.
- Solo responde la persona destinataria (si está fijada) y con el rol requerido.
- Una respuesta fuera de las opciones permitidas se rechaza.
- Una solicitud vencida no puede contestarse retroactivamente.
- Una respuesta queda registrada, pero la acción operativa necesita su propio permiso, comprobaciones y transición de estado.
- Cancelar requiere actor y motivo.

## Estado de implementación
Implementado como módulo puro `src/lib/interactions.mjs`, con pruebas sintéticas. Aún no está conectado a UI, persistencia, notificaciones, WhatsApp ni a una cola de tareas.
