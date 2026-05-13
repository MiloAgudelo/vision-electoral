# Esquema de Base de Datos — Visión Electoral

Diseño de datos para las tres capas del sistema: backend (MongoDB Atlas), app móvil (SQLite/Room) y los contratos que viajan entre ambas a través de `POST /api/surveys/sync`.

> Este documento es la fuente de verdad del esquema. Cualquier cambio debe reflejarse aquí antes de tocar código en `apps/api/`, `mobile/` o `apps/web/`.

---

## Tabla de contenidos

- [Principios](#principios)
- [Diagrama de relaciones](#diagrama-de-relaciones)
- [MongoDB (servidor)](#mongodb-servidor)
- [SQLite / Room (mobile)](#sqlite--room-mobile)
- [Contrato de sincronización](#contrato-de-sincronización)
- [Anonimato](#anonimato)
- [Snippets de implementación](#snippets-de-implementación)
- [Reglas de validación](#reglas-de-validación)
- [Huecos vs estado actual del repo](#huecos-vs-estado-actual-del-repo)

---

## Principios

1. **Simplicidad sobre flexibilidad**: el proyecto es académico y de alcance acotado. No hay versionado de plantillas ni snapshots inmutables.
2. **Respuestas anónimas**: `survey_responses` no almacena información identificable del encuestado. Solo del *encuestador* (para auditoría y agregados por persona-que-recolecta).
3. **Mobile offline-first**: el dispositivo genera el identificador único de cada entrega antes de tener red. El backend es idempotente por ese identificador.
4. **Una plantilla publicada con respuestas no se edita**: si requiere cambios, se duplica y la vieja se archiva. Eso da inmutabilidad sin colecciones extra.
5. **Dos tipos de pregunta**: `abierta` (texto libre) y `cerrada` (selección de opciones). Si en el futuro se necesitan numéricas, escalas o fechas, se modelan como `abierta` con validación en el cliente.

---

## Diagrama de relaciones

```
                          ┌──────────────┐
                          │    users     │
                          │ (roles, zona)│
                          └──────┬───────┘
                                 │ surveyor_id
                                 ▼
   ┌──────────┐           ┌─────────────────┐         ┌────────────────────┐
   │  zones   │◄──zone_id─│ survey_responses│──tpl───►│  survey_templates  │
   └──────────┘           │   (anónimas)    │         │ (questions embed)  │
                          └─────────────────┘         └────────────────────┘
                                  ▲
                                  │
                          submission_id (UUID v4
                          generado en el dispositivo,
                          clave de idempotencia)
```

Mobile (espejo mínimo):

```
templates_cache  ───┐
                    │  (referenciado por template_id)
responses (cola) ◄──┘
session  (sesión actual del encuestador)
```

---

## MongoDB (servidor)

Cuatro colecciones.

### `users`

| Campo | Tipo | Notas |
|---|---|---|
| `_id` | `ObjectId` | |
| `firebase_uid` | `string` | único |
| `email` | `string` | único |
| `name` | `string` | |
| `role` | `enum` | `encuestador` \| `analista` \| `administrador` |
| `zone_id` | `ObjectId?` | zona asignada (solo encuestador) |
| `created_at`, `updated_at` | `Date` | |

**Índices**: `firebase_uid` único, `email` único, `role`.

### `zones`

| Campo | Tipo | Notas |
|---|---|---|
| `_id` | `ObjectId` | |
| `name` | `string` | único |
| `created_at` | `Date` | |

**Índices**: `name` único.

### `survey_templates`

| Campo | Tipo | Notas |
|---|---|---|
| `_id` | `ObjectId` | |
| `name` | `string` | |
| `description` | `string?` | |
| `status` | `enum` | `borrador` \| `publicada` \| `archivada` |
| `questions` | `Question[]` | embebido |
| `created_by` | `ObjectId` | `users._id` |
| `created_at`, `updated_at` | `Date` | |

`Question`:

| Campo | Tipo | Notas |
|---|---|---|
| `question_id` | `string` | UUID estable; sobrevive a renombrados de texto |
| `order` | `number` | |
| `text` | `string` | |
| `type` | `enum` | `abierta` \| `cerrada` |
| `required` | `boolean` | |
| `multiple` | `boolean` | solo si `type='cerrada'`. `false` = opción única (radio), `true` = múltiple (checkbox). Default `false` |
| `options` | `Option[]?` | solo si `type='cerrada'` |

`Option`:

| Campo | Tipo |
|---|---|
| `option_id` | `string` (UUID) |
| `text` | `string` |

**Índices**: `status`.

**Regla**: si una plantilla está `publicada` y tiene respuestas asociadas, el endpoint de edición responde **409 Conflict** con el mensaje `"plantilla con respuestas; duplíquela en lugar de editarla"`. La UI de admin muestra "Duplicar" en vez de "Editar" en ese caso.

### `survey_responses`

| Campo | Tipo | Notas |
|---|---|---|
| `_id` | `ObjectId` | |
| `submission_id` | `string` | UUID v4 generado en el dispositivo; **índice único** (idempotencia) |
| `template_id` | `ObjectId` | |
| `surveyor_id` | `ObjectId` | encuestador que **originalmente** recolectó la respuesta (capturado en mobile, no derivado del JWT del sync — protege contra cambio de sesión entre captura y envío) |
| `zone_id` | `ObjectId` | |
| `answers` | `Answer[]` | embebido |
| `captured_at` | `Date` | timestamp del dispositivo al guardar local |
| `synced_at` | `Date` | timestamp del servidor al persistir |

`Answer`:

| Campo | Tipo | Cuándo |
|---|---|---|
| `question_id` | `string` | siempre |
| `value` | `string?` | si la pregunta es `abierta` |
| `selected_option_ids` | `string[]?` | si la pregunta es `cerrada`. Cardinalidad determinada por `Question.multiple` (ver R8) |

**Índices**:

- `submission_id` único — **idempotencia del sync**.
- `{zone_id: 1, captured_at: -1}` — `/api/stats/by-zone`.
- `{surveyor_id: 1, captured_at: -1}` — `/api/stats/by-surveyor`.
- `{template_id: 1, captured_at: -1}` — agregaciones por plantilla.

> **El documento no contiene PII del encuestado**. Ver sección [Anonimato](#anonimato).

---

## SQLite / Room (mobile)

Tres tablas. Se prioriza simplicidad sobre normalización: el JSON de preguntas y respuestas se guarda crudo para minimizar código de mapeo.

### `templates_cache`

```sql
template_id    TEXT PRIMARY KEY
name           TEXT
status         TEXT             -- 'publicada' | 'archivada' (nunca se cachea 'borrador')
questions_json TEXT              -- JSON con el array questions[] tal como vino del backend
updated_at     INTEGER
```

**Invalidación**: cada vez que el mobile descarga plantillas (`GET /api/survey-templates`), borrar localmente las que ya no aparezcan en la respuesta del servidor o lleguen con `status='archivada'`. Las plantillas archivadas se conservan **solo** si hay respuestas en cola que las referencian (necesarias para renderizar el formulario al revisar la cola); se purgan cuando esas respuestas se marcan `synced` o `rejected`.

### `responses` (cola de envío)

```sql
submission_id TEXT PRIMARY KEY  -- UUID v4 generado en el dispositivo
template_id   TEXT
zone_id       TEXT
surveyor_uid  TEXT              -- uid del encuestador que llenó el formulario
answers_json  TEXT              -- mismo shape que answers[] del payload
captured_at   INTEGER
sync_status   TEXT              -- 'pending' | 'synced' | 'rejected'
sync_attempts INTEGER DEFAULT 0
last_error    TEXT              -- razón del último 'rejected' (mostrada al usuario)
server_synced_at INTEGER        -- timestamp servidor (nullable hasta sync exitoso)
```

`sync_status` evita reintentos infinitos:

- `pending` → la cola intenta enviar.
- `synced` → confirmado por el backend (`accepted` o `duplicated`). Sujeto a limpieza tras 7 días.
- `rejected` → el backend devolvió la fila en `rejected[]`. **No se reintenta automáticamente**; se muestra al usuario con `last_error` y queda a su decisión re-editar o descartar.

### `session` (un único row)

```sql
uid           TEXT PRIMARY KEY
email         TEXT
name          TEXT
role          TEXT
jwt_token     TEXT
zone_id       TEXT
```

**Datos solo locales** (no viajan al servidor): `sync_status`, `sync_attempts`, `last_error`, `server_synced_at`, `jwt_token`.

**Limpieza**: borrar filas de `responses` con `sync_status = 'synced'` después de 7 días. Las `rejected` se conservan hasta que el usuario las elimine o re-edite.

---

## Contrato de sincronización

### Request

`POST /api/surveys/sync` recibe **un array** (no un objeto) de hasta 200 respuestas:

```json
[
  {
    "submission_id": "550e8400-e29b-41d4-a716-446655440000",
    "template_id": "65f1a2b3c4d5e6f7a8b9c0d1",
    "surveyor_uid": "firebase-uid-del-autor-original",
    "zone_id": "65f1a2b3c4d5e6f7a8b9c0d2",
    "captured_at": "2026-05-13T14:32:11.000Z",
    "answers": [
      { "question_id": "q-uuid-1", "value": "comentario libre" },
      { "question_id": "q-uuid-2", "selected_option_ids": ["opt-a"] }
    ]
  }
]
```

`surveyor_uid` viaja explícitamente en el cuerpo: es el `firebase_uid` del encuestador que **originalmente capturó** la respuesta (guardado en `responses.surveyor_uid` localmente al guardar el formulario). El backend valida que coincida con el `firebase_uid` del JWT de la request **o** que el portador del JWT sea `administrador`. Esto evita que una respuesta capturada por el encuestador A pero sincronizada por el encuestador B (mismo dispositivo, cambio de sesión) quede mal atribuida.

### Response

```json
{
  "accepted":   ["550e8400-e29b-41d4-a716-446655440000"],
  "duplicated": [],
  "rejected":   []
}
```

- `accepted`: insertadas correctamente.
- `duplicated`: el `submission_id` ya existía (idempotencia). El mobile las marca como sincronizadas igual.
- `rejected`: fallaron validación. Incluye `{ submission_id, reason }`. El mobile las deja en cola y reporta al usuario.

### Idempotencia

Garantizada por el índice único en `survey_responses.submission_id`. El servidor usa `insertMany(..., { ordered: false })` y trata los errores `E11000` como "duplicado" (no como fallo).

---

## Anonimato

### Qué no se captura

- No hay campo `respondent` ni nada equivalente en `survey_responses`.
- No hay `device_id`, `imei`, `ip` ni metadatos del dispositivo.
- El backend **no debe loguear el cuerpo** del `POST /api/surveys/sync`. Solo `{count, surveyor_id, zone_id, accepted, duplicated}`.

### Qué sí queda (y por qué no rompe el anonimato)

- `surveyor_id`: identifica al *encuestador* (operador del sistema), no al encuestado. Necesario para estadísticas `/api/stats/by-surveyor` y auditoría.
- `submission_id`: UUID v4 aleatorio. Identifica la *fila*, no a la persona. No codifica fecha, dispositivo ni usuario. Existe solo para idempotencia del sync.

### Reglas operativas

| Regla | Dónde se aplica |
|---|---|
| Las plantillas no deben tener preguntas que pidan PII (nombre, cédula, teléfono, dirección, email). La web debe advertir si el texto contiene esas palabras. | UI admin / web |
| El texto libre de preguntas `abiertas` puede contener PII por error del encuestado. Documentar en la guía del encuestador. Para reportes públicos, exportar agregados, no texto crudo. | Capacitación + reportes |
| El analista **no** ve respuestas individuales; solo agregados. | Middleware en `apps/api/src/modules/surveys/` |
| El administrador puede ver respuestas individuales pero el acceso queda logueado para auditoría. | Middleware + tabla de auditoría |

### Riesgo residual

En zonas pequeñas, la combinación `(zone_id, captured_at, 3-4 respuestas)` podría re-identificar a alguien con contexto local. Aceptable para el alcance académico actual. Si en algún momento se publican datasets abiertos, redondear `captured_at` a día y agrupar zonas pequeñas.

---

## Snippets de implementación

### Mongoose

```ts
import { Schema, model, Types } from 'mongoose'

const TIMESTAMPS = { createdAt: 'created_at', updatedAt: 'updated_at' }

const QuestionSchema = new Schema({
  question_id: { type: String, required: true },
  order: Number,
  text: { type: String, required: true },
  type: { type: String, enum: ['abierta', 'cerrada'], required: true },
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },          // solo cerrada: false=radio, true=checkbox
  options: [{ option_id: String, text: String }],
}, { _id: false })

export const SurveyTemplate = model('SurveyTemplate', new Schema({
  name: { type: String, required: true },
  description: String,
  status: { type: String, enum: ['borrador', 'publicada', 'archivada'], default: 'borrador' },
  questions: [QuestionSchema],
  created_by: { type: Types.ObjectId, ref: 'User' },
}, { timestamps: TIMESTAMPS }))

const AnswerSchema = new Schema({
  question_id: { type: String, required: true },
  value: String,
  selected_option_ids: [String],
}, { _id: false })

const SurveyResponseSchema = new Schema({
  submission_id: { type: String, required: true, unique: true },
  template_id: { type: Types.ObjectId, ref: 'SurveyTemplate', required: true },
  surveyor_id: { type: Types.ObjectId, ref: 'User', required: true },
  zone_id: { type: Types.ObjectId, ref: 'Zone', required: true },
  answers: [AnswerSchema],
  captured_at: { type: Date, required: true },
  synced_at: { type: Date, default: Date.now },
}, { timestamps: TIMESTAMPS })

SurveyResponseSchema.index({ zone_id: 1, captured_at: -1 })
SurveyResponseSchema.index({ surveyor_id: 1, captured_at: -1 })
SurveyResponseSchema.index({ template_id: 1, captured_at: -1 })

export const SurveyResponse = model('SurveyResponse', SurveyResponseSchema)
```

### Zod (validación del sync)

```ts
import { z } from 'zod'

const AnswerInput = z.object({
  question_id: z.string(),
  value: z.string().max(2000).optional(),
  selected_option_ids: z.array(z.string()).optional(),
})

const SyncResponseInput = z.object({
  submission_id: z.string().uuid(),
  template_id: z.string(),
  surveyor_uid: z.string(),         // firebase_uid del autor original
  zone_id: z.string(),
  captured_at: z.string().datetime(),
  answers: z.array(AnswerInput).min(1),
})

export const SyncBody = z.array(SyncResponseInput).min(1).max(200)
```

### Room (Kotlin, esquema indicativo)

```kotlin
@Entity(tableName = "responses")
data class ResponseEntity(
  @PrimaryKey val submissionId: String,    // UUID.randomUUID().toString()
  val templateId: String,
  val zoneId: String,
  val surveyorUid: String,                 // se captura al guardar; viaja al backend
  val answersJson: String,
  val capturedAt: Long,
  val syncStatus: String = "pending",      // pending | synced | rejected
  val syncAttempts: Int = 0,
  val lastError: String? = null,
  val serverSyncedAt: Long? = null,
)

@Entity(tableName = "templates_cache")
data class TemplateCacheEntity(
  @PrimaryKey val templateId: String,
  val name: String,
  val status: String,                      // 'publicada' | 'archivada'
  val questionsJson: String,
  val updatedAt: Long,
)
```

---

## Reglas de validación

Toda entrada al servidor pasa por Zod antes de tocar Mongoose. Además del schema:

1. Para cada `answer.question_id`, debe existir en `survey_templates.questions[].question_id` del `template_id` dado.
2. Si la pregunta es `cerrada`: `selected_option_ids` no vacío y todos los IDs deben pertenecer a `question.options[].option_id`. `value` debe venir vacío.
3. Si la pregunta es `abierta`: `value` debe venir; `selected_option_ids` ausente o vacío.
4. Todas las preguntas con `required: true` deben tener una answer correspondiente en el payload.
5. `template_id` debe apuntar a una plantilla con `status: 'publicada'`.
6. `zone_id` debe existir y estar activo. `surveyor_uid` del payload debe (a) existir en `users` y estar activo, **y** (b) coincidir con el `firebase_uid` del JWT, o el portador del JWT debe tener `role: 'administrador'`. Si no coincide → respuesta rechazada con razón `"surveyor_mismatch"`.
7. Si el `surveyor` resuelto tiene `role: 'encuestador'`, su `zone_id` debe coincidir con `response.zone_id`. Esto evita que un encuestador asignado a la zona A envíe respuestas marcadas en la zona B. Para `analista`/`administrador` no aplica.
8. Si la pregunta cerrada tiene `multiple: false`, `selected_option_ids` debe contener exactamente 1 elemento. Si `multiple: true`, mínimo 1.

Las validaciones 1–4, 7 y 8 no se expresan en Zod; se hacen en el service después de cargar la plantilla y el usuario. La 6 se hace al principio (antes de tocar Mongo).

---

## Huecos vs estado actual del repo

| Hueco | Ubicación | Acción |
|---|---|---|
| API solo tiene `GET /salud`; faltan módulos `auth`, `surveys`, `users`, `zones`, `stats` | [apps/api/src/index.ts](../../apps/api/src/index.ts) | Crear scaffolding por módulo (router, controller, service, model, validator Zod) |
| No hay conexión Mongoose configurada | `apps/api/src/config/` (no existe) | Crear `config/mongoose.ts` con `mongoose.connect(MONGODB_URI)` y manejo de eventos |
| `JWT_SECRET` se documenta en [apps/api/AGENTS.md](../../apps/api/AGENTS.md) pero **no** está en `.env.example` del root | [README.md](../../README.md) sección "Variables de Entorno" | Agregar `JWT_SECRET=` |
| `mobile/AGENTS.md` describe `SurveyEntity` con `respondent`, `answers JSON` plano y **sin** `template_id` | [mobile/AGENTS.md](../../mobile/AGENTS.md) | Actualizar al esquema definido aquí: `submission_id`, `template_id`, sin `respondent` |
| No existe endpoint para que mobile descargue plantillas activas | [apps/api/AGENTS.md](../../apps/api/AGENTS.md) tabla de endpoints | Agregar `GET /api/survey-templates?status=publicada` |
| Falta endpoint admin para publicar plantilla | igual | Agregar `POST /api/survey-templates/:id/publish` |
| Idempotencia mencionada como requisito pero sin definir clave | [apps/api/AGENTS.md](../../apps/api/AGENTS.md) línea de "Notas importantes" | Documentar `submission_id` como clave de idempotencia |
| Formato de respuesta del sync sin definir | [mobile/AGENTS.md](../../mobile/AGENTS.md) sección "Sincronización" | Documentar `{accepted, duplicated, rejected}` |
| `packages/shared-types/` vacío | `packages/shared-types/` | Exportar enums (`UserRole`, `QuestionType`, `TemplateStatus`) y tipos derivados de los schemas Zod para compartir entre `apps/web` y `apps/api` |
