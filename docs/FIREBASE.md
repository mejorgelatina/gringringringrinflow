# Firebase: auth del equipo y firestore

GrinFlow usa el proyecto de Firebase **grinflow** para dos cosas:

1. **Firebase Authentication (correo y contraseña)** para que el equipo entre a `/team`.
2. **Cloud Firestore** como almacén durable de registros, conversaciones, bandeja de ofertas, tracking y mensajes de WhatsApp.

## Cómo está armado

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| Config web pública | `lib/firebase/config.ts` | Lee `NEXT_PUBLIC_FIREBASE_*`. No son secretos. |
| SDK del navegador | `lib/firebase/client.ts` | Solo Auth. El navegador nunca toca Firestore. |
| SDK de servidor (Admin) | `lib/firebase/admin.ts` | Firestore con la cuenta de servicio; verificación de ID tokens (basta el project id). |
| Quién es del equipo | `lib/auth/team.ts` | Token válido + correo **verificado** + en `GRINFLOW_TEAM_EMAILS` (o claim `grinflowTeam: true`). `OPERATOR_KEY` sigue como respaldo. |
| Login | `app/(ops)/team/sign-in.tsx` | Entrar, crear cuenta (manda correo de verificación), recuperar contraseña, salir. |
| API | `app/api/registry/route.ts` | Datos de contacto y verificar/rechazar solo para el equipo. Quien verifica queda registrado con su correo. |
| Reglas | `firestore.rules` | Niegan todo acceso directo desde clientes. El servidor usa Admin SDK y no pasa por reglas. |
| CLI | `firebase.json`, `.firebaserc` | Activa email/password y despliega reglas al proyecto `grinflow`. |

Crear una cuenta es libre, pero una cuenta sola no da acceso: sin correo verificado y sin estar en la lista, `/team` solo muestra los registros del simulador.

## Colecciones (todas escritas por el servidor)

`gf_registrations`, `gf_conversations`, `gf_inbox` (ofertas, necesidades, registros), `agent_tracking`, `whatsapp_messages`, `whatsapp_conversations`, `whatsapp_webhook_events`.

## Puesta en marcha (una vez, con tu cuenta de Google)

```bash
npx -y firebase-tools@latest login
npx -y firebase-tools@latest projects:list          # confirma el ID real del proyecto "grinflow"
# si el ID no es exactamente "grinflow", cámbialo en .firebaserc
npx -y firebase-tools@latest apps:create WEB grinflow-web
npx -y firebase-tools@latest apps:sdkconfig WEB <APP_ID>   # copia los valores a las variables de abajo
npx -y firebase-tools@latest deploy --only auth,firestore:rules,firestore:indexes
```

Firestore debe existir antes del deploy (Consola → Firestore Database → Crear base de datos, edición Standard, modo producción). La cuenta de servicio se saca como dice `FIREBASE_SETUP_ES.md` (paso 3).

En **Authentication → Settings → Authorized domains**, agrega el dominio de Vercel además de `localhost`.

## Variables en Vercel

| Variable | Tipo | De dónde |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | pública | `apps:sdkconfig` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | pública | `apps:sdkconfig` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | pública | `apps:sdkconfig` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | pública | `apps:sdkconfig` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | públicas, opcionales | `apps:sdkconfig` |
| `GRINFLOW_TEAM_EMAILS` | servidor | correos del equipo separados por coma |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | **secretas** | JSON de la cuenta de servicio |
| `OPERATOR_KEY` | secreta, opcional | respaldo para scripts |

Las `NEXT_PUBLIC_*` se incrustan en el build: después de ponerlas hay que hacer redeploy.

## Costos

Todo esto cabe en el plan **Spark** (gratis). Correo/contraseña y los correos de verificación no cuestan. No activamos teléfono (SMS), que sí cobra.
