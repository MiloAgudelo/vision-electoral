# AGENTS.md — mobile/ (App Android)

Contexto del módulo para desarrolladores e IAs trabajando en esta carpeta.

---

## ¿Qué hace este módulo?

Aplicación Android nativa (Java/Kotlin) usada por los encuestadores en campo. Permite llenar formularios de encuestas sin necesidad de conexión a internet, almacena los datos localmente en SQLite y los sincroniza con el backend cuando se recupera la señal.

---

## Stack

| Tecnología | Versión | Uso |
|---|---|---|
| Android Studio | Panda 4 \| 2025.3.4 (estable) | IDE principal |
| Android nativo (Kotlin) | Kotlin 2.x | Lenguaje principal (preferir Kotlin sobre Java en código nuevo) |
| Android Gradle Plugin (AGP) | >= 9.1 | Build system |
| Room (SQLite) | >= 2.7 | Base de datos local offline-first |
| Firebase Auth SDK Android | BoM >= 34 | Autenticación con Google |
| Retrofit | >= 2.11 | Cliente HTTP para comunicarse con la API |
| WorkManager | >= 2.10 | Cola de sincronización en background |

---

## Estructura de carpetas

```
mobile/
├── app/
│   └── src/
│       └── main/
│           ├── java/com/visionelectoral/
│           │   ├── auth/           # Firebase Auth, manejo de sesión
│           │   ├── data/
│           │   │   ├── local/      # Room DB, DAOs, entidades SQLite
│           │   │   └── remote/     # Retrofit, DTOs, API service
│           │   ├── sync/           # WorkManager, lógica de sincronización
│           │   ├── ui/
│           │   │   ├── login/      # Pantalla de login (Google)
│           │   │   ├── survey/     # Formularios de encuesta
│           │   │   └── dashboard/  # Resumen del encuestador
│           │   └── utils/
│           └── res/
│               ├── layout/
│               └── values/
├── local.properties.example    # Template con la URL del backend
└── build.gradle
```

---

## Flujo principal

```
Usuario abre app
       │
  ¿Está autenticado?
   No → Login Google (Firebase Auth)
   Sí ↓
Dashboard encuestador
       │
  Llenar formulario
       │
  Guardar en SQLite (Room)  ← funciona sin internet
       │
  WorkManager detecta conexión
       │
  POST /api/surveys/sync  → envía lista de encuestas pendientes
       │
  Marca registros como sincronizados en SQLite
```

---

## Base de datos local (SQLite / Room)

### Entidades principales

**`SurveyEntity`**
```
id          TEXT PRIMARY KEY  (UUID generado en el dispositivo)
respondent  TEXT
zone        TEXT
answers     TEXT              (JSON serializado)
created_at  INTEGER           (timestamp Unix)
synced      INTEGER           (0 = pendiente, 1 = sincronizado)
```

**`UserEntity`**
```
uid         TEXT PRIMARY KEY  (Firebase UID)
email       TEXT
name        TEXT
jwt_token   TEXT              (JWT del backend, para llamadas API)
```

> Los IDs se generan en el dispositivo (UUID v4) para garantizar unicidad incluso offline. El backend debe ser idempotente con estos IDs.

---

## Sincronización

- Se usa **WorkManager** con `NetworkType.CONNECTED` para disparar la sincronización automáticamente al recuperar conexión.
- El sincronizador envía **listas** de encuestas pendientes al endpoint `POST /api/surveys/sync`.
- Solo se marcan como sincronizadas las encuestas que el backend confirma (HTTP 200/201).
- En caso de error parcial, las encuestas fallidas permanecen en la cola.

---

## Autenticación

1. El usuario hace "Sign in with Google" usando Firebase Auth SDK para Android.
2. Se obtiene el `idToken` de Firebase.
3. Se envía al backend (`POST /api/auth/verify`) con Retrofit.
4. El backend devuelve un JWT propio que se guarda en `UserEntity.jwt_token` (en Room).
5. Ese JWT se incluye en el header `Authorization: Bearer <token>` de todas las llamadas a la API.

---

## Configuración local

Crea `mobile/local.properties` (no se sube al repo):

```properties
# URL del backend (desarrollo local)
API_BASE_URL=http://10.0.2.2:3000/api

# Firebase — estos valores vienen del google-services.json
# (descargar desde Firebase Console y colocar en app/)
```

También descarga el archivo `google-services.json` desde tu proyecto en Firebase Console y colócalo en `mobile/app/`. Este archivo **no se sube al repo** (está en `.gitignore`).

---

## Responsables

| Nombre | GitHub | Área |
|---|---|---|
| Juan José Arango | [@Arango134204](https://github.com/Arango134204) | Mobile Frontend |
| Emmanuel García | [@emmanuel-2005-hub](https://github.com/emmanuel-2005-hub) | Mobile Backend |
| Santiago Marín | [@Santimarin06](https://github.com/Santimarin06) | Mobile Backend |

---

## Notas importantes

- La app **debe funcionar completamente offline**. Ninguna funcionalidad core puede depender de conexión activa.
- El campo `synced` en SQLite es la fuente de verdad del estado de sincronización.
- Los formularios deben validar campos requeridos antes de guardar localmente.
- Sigue la convención de commits del [`CONTRIBUTING.md`](../../CONTRIBUTING.md) con scope `mobile`.