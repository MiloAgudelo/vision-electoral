# Esquema de Base de Datos — Visión Electoral

Diseño de datos para las tres capas del sistema: backend (MongoDB Atlas), app móvil (SQLite/Room) y los contratos que viajan entre ambas a través de `POST /api/surveys/sync`.

> Este documento es la fuente de verdad del esquema. Cualquier cambio debe reflejarse aquí antes de tocar código en `apps/api/`, `mobile/` o `apps/web/`.

---

## Tabla de contenidos

- [Principios](#principios)
- [Diagrama de relaciones](#diagrama-de-relaciones)
- [MongoDB (servidor)](#mongodb-servidor)
  - [users](#users)
  - [zones](#zones)
  - [survey\_templates](#survey_templates)
  - [survey\_responses](#survey_responses)
  - [audit\_logs](#audit_logs)
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
4. **Una plantilla publicada es inmutable**: pasar a `publicada` la congela definitivamente. Si requiere cambios, se duplica como nuevo borrador y la original se archiva. Eso da inmutabilidad sin versionado explícito y cierra la ventana de carrera offline (mobile cachea ↔ admin edita ↔ sync).
5. **Dos tipos de pregunta**: `abierta` (texto libre) y `cerrada` (selección de opciones). Si en el futuro se necesitan numéricas, escalas o fechas, se modelan como `abierta` con validación en el cliente.

---

## Diagrama de relaciones

```
                          ┌──────────────┐
                          │    users     │
                          │ (roles, zona)│
                          └──────┬───────┘
                          admin_uid│  │surveyor_id
                                  ▼  ▼
   ┌──────────┐           ┌─────────────────┐         ┌────────────────────┐
   │  zones   │◄──zone_id─│ survey_responses│──tpl───►│  survey_templates  │
   └──────────┘           │   (anónimas)    │         │ (questions embed)  │
                          └─────────────────┘         └────────────────────┘
                                  ▲
                                  │ resource_id
                          ┌───────┴───────┐
                          │  audit_logs   │
                          │ (accesos adm) │
                          └───────────────┘
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

Cinco colecciones.

### `users`

| Campo | Tipo | Notas |
|---|---|---|
| `_id` | `ObjectId` | |
| `firebase_uid` | `string` | único |
| `email` | `string` | único |
| `name` | `string` | |
| `role` | `enum` | `encuestador` \| `analista` \| `administrador` |
| `zone_id` | `ObjectId?` | zona asignada (encuestador y analista; administrador no tiene zona) |
| `created_at`, `updated_at` | `Date` | |

**Índices**: `firebase_uid` único, `email` único, `role`.

### `zones`

Cada zona representa una universidad. Encuestadores y analistas están asignados a una sola zona; el administrador no pertenece a ninguna.

| Campo | Tipo | Notas |
|---|---|---|
| `_id` | `ObjectId` | |
| `name` | `string` | nombre de la universidad; único |
| `created_at` | `Date` | |

**Índices**: `name` único.

### `survey_templates`

| Campo | Tipo | Notas |
|---|---|---|
| `_id` | `ObjectId` | |
| `name` | `string` | |
| `description` | `string?` | |
| `status` | `enum` | `borrador` \| `abierta` \| `cerrada` \| `archivada` |
| `questions` | `Question[]` | embebido |
| `created_by` | `ObjectId` | `users._id` |
| `opened_at` | `Date?` | timestamp en que pasó a `abierta` por primera vez; las preguntas se congelan a partir de aquí |
| `archived_at` | `Date?` | timestamp en que pasó a `archivada` |
| `created_at`, `updated_at` | `Date` | `updated_at` solo cambia mientras está en `borrador` |

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

**Ciclo de vida:**

```
borrador ──→ abierta ──→ cerrada ──→ archivada
                 ↑____________│
```

- `borrador`: solo visible para el admin; editable.
- `abierta`: visible en mobile para los encuestadores de todas las universidades; acepta respuestas.
- `cerrada`: no visible en mobile; no acepta respuestas nuevas. Puede volver a `abierta`.
- `archivada`: estado final, no reversible.

**Regla de inmutabilidad**: al pasar a `abierta` por primera vez, `questions`, `name` y `description` se congelan. Ni `abierta` ni `cerrada` se pueden editar. El endpoint de edición responde **409 Conflict** con el mensaje `"encuesta abierta o cerrada; duplíquela para modificarla"`. La UI de admin muestra "Duplicar" en vez de "Editar".

> Esta inmutabilidad cierra la ventana de carrera offline: si un mobile descargó la encuesta abierta y captura respuestas sin red, el backend siempre puede validarlas contra esa misma versión. Sin necesidad de versionado explícito.

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

### `audit_logs`

Registra cada acceso del administrador a respuestas individuales. Solo de escritura desde el backend; nunca se expone en bulk al cliente.

| Campo | Tipo | Notas |
|---|---|---|
| `_id` | `ObjectId` | |
| `admin_uid` | `ObjectId` | `users._id` del administrador que accedió |
| `action` | `string` | `"read_response"` (extensible a `"export"`, etc.) |
| `resource` | `string` | Colección afectada: `"survey_responses"` |
| `resource_id` | `ObjectId?` | `_id` del documento accedido (si aplica) |
| `query_params` | `object?` | Filtros usados (ej. `{ zone_id, date_range }`) para accesos por lote |
| `timestamp` | `Date` | Momento del acceso (indexado) |
| `ip` | `string?` | IP del servidor de origen (no del encuestado) |

**Índices**: `{ admin_uid: 1, timestamp: -1 }`, `timestamp`.

---

## SQLite / Room (mobile)

Tres tablas. Se prioriza simplicidad sobre normalización: el JSON de preguntas y respuestas se guarda crudo para minimizar código de mapeo.

### `templates_cache`

```sql
template_id    TEXT PRIMARY KEY
name           TEXT
status         TEXT             -- 'abierta' (nunca se cachea 'borrador', 'cerrada' ni 'archivada')
questions_json TEXT             -- JSON con el array questions[] tal como vino del backend
updated_at     INTEGER
```

**Invalidación**: el mobile descarga solo encuestas con `status='abierta'` (`GET /api/surveys?status=abierta`). En cada descarga se eliminan del cache las entradas que ya no aparezcan en la respuesta del servidor (fueron cerradas o archivadas mientras el dispositivo estaba offline).

**Caso offline con encuesta cerrada**: si el dispositivo tenía respuestas `pending` de una encuesta que se cerró antes del sync, el servidor las rechazará con razón `"survey_closed"`. La app las marcará como `rejected` y notificará al usuario. Por eso las entradas de `templates_cache` se conservan hasta que todas las filas `pending` que las referencian pasen a `synced` o `rejected`; solo entonces se purgan.

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
zone_id       TEXT    -- nullable: analista y administrador no tienen zona asignada
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

Garantizada por el índice único en `survey_responses.submission_id`. Procedimiento del servidor:

1. `insertMany(..., { ordered: false })` — intenta insertar todo el lote.
2. Por cada error `E11000` (duplicate key), **cargar el documento existente** y compararlo con el payload entrante en los campos `template_id`, `surveyor_uid`, `zone_id`, `captured_at` y hash de `answers`.
   - **Si coinciden** → la fila va a `duplicated` (reintento legítimo del mobile; ya estaba guardada).
   - **Si difieren** → la fila va a `rejected` con razón `"submission_id_conflict"`. Esto solo puede ocurrir si el cliente reusó un UUID v4 (bug) o si alguien manipuló el payload. **No** se sobrescribe el documento existente.

Esto evita corrupción silenciosa: un `submission_id` reusado con datos distintos no se acepta como "duplicado" sino que se marca como conflicto explícito.

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
  status: { type: String, enum: ['borrador', 'abierta', 'cerrada', 'archivada'], default: 'borrador' },
  questions: [QuestionSchema],
  created_by: { type: Types.ObjectId, ref: 'User' },
  opened_at: Date,    // se setea la primera vez que pasa a 'abierta'; inmutable desde entonces
  archived_at: Date,
}, { timestamps: TIMESTAMPS }))

const AnswerSchema = new Schema({
  question_id: { type: String, required: true },
  value: String,
  selected_option_ids: [String],
}, { _id: false })

// Sin timestamps automáticos: synced_at ya cumple el rol de created_at del servidor.
const SurveyResponseSchema = new Schema({
  submission_id: { type: String, required: true, unique: true },
  template_id: { type: Types.ObjectId, ref: 'SurveyTemplate', required: true },
  surveyor_id: { type: Types.ObjectId, ref: 'User', required: true },
  zone_id: { type: Types.ObjectId, ref: 'Zone', required: true },
  answers: [AnswerSchema],
  captured_at: { type: Date, required: true },
  synced_at: { type: Date, default: Date.now },
})

SurveyResponseSchema.index({ zone_id: 1, captured_at: -1 })
SurveyResponseSchema.index({ surveyor_id: 1, captured_at: -1 })
SurveyResponseSchema.index({ template_id: 1, captured_at: -1 })

export const SurveyResponse = model('SurveyResponse', SurveyResponseSchema)
```

### Zod (validación del sync)

```ts
import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ObjectId inválido')

const AnswerInput = z.object({
  question_id: z.string(),
  value: z.string().max(2000).optional(),
  selected_option_ids: z.array(z.string()).optional(),
})

const SyncResponseInput = z.object({
  submission_id: z.string().uuid(),
  template_id: objectId,
  surveyor_uid: z.string(),         // firebase_uid del autor original
  zone_id: objectId,
  captured_at: z.string().datetime(),
  answers: z.array(AnswerInput).min(1),
})

// El mobile envía en lotes de máximo 200. Si la cola supera ese límite,
// la app itera en múltiples llamadas hasta vaciarla.
export const SyncBody = z.array(SyncResponseInput).min(1).max(200)
```

### Room (Kotlin, esquema indicativo)

```kotlin
// capturedAt se guarda como epoch en ms (System.currentTimeMillis()).
// Al armar el payload del sync se convierte a ISO 8601:
//   Instant.ofEpochMilli(capturedAt).toString()  → "2026-05-13T14:32:11.000Z"
@Entity(tableName = "responses")
data class ResponseEntity(
  @PrimaryKey val submissionId: String,    // UUID.randomUUID().toString()
  val templateId: String,
  val zoneId: String,
  val surveyorUid: String,                 // se captura al guardar; viaja al backend
  val answersJson: String,
  val capturedAt: Long,                    // epoch ms → convertir a ISO al sincronizar
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
5. `template_id` debe apuntar a una encuesta con `status: 'abierta'`. Si está `cerrada` o `archivada`, la respuesta se rechaza con razón `"survey_closed"`.
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
| `mobile/AGENTS.md` describe `SurveyEntity` con `respondent`, `answers JSON` plano y **sin** `template_id` | [mobile/AGENTS.md](../../mobile/AGENTS.md) | Actualizar al esquema definido aquí: `submission_id`, `template_id`, sin `respondent` |
| No existe endpoint para que mobile descargue encuestas abiertas | [apps/api/AGENTS.md](../../apps/api/AGENTS.md) tabla de endpoints | Agregar `GET /api/surveys?status=abierta` |
| Faltan endpoints de ciclo de vida de encuesta | igual | Agregar `POST /api/surveys/:id/open`, `POST /api/surveys/:id/close`, `POST /api/surveys/:id/archive` |
| Idempotencia mencionada como requisito pero sin definir clave | [apps/api/AGENTS.md](../../apps/api/AGENTS.md) línea de "Notas importantes" | Documentar `submission_id` como clave de idempotencia |
| Formato de respuesta del sync sin definir | [mobile/AGENTS.md](../../mobile/AGENTS.md) sección "Sincronización" | Documentar `{accepted, duplicated, rejected}` |
| `packages/shared-types/` vacío | `packages/shared-types/` | Exportar enums (`UserRole`, `QuestionType`, `TemplateStatus`) y tipos derivados de los schemas Zod para compartir entre `apps/web` y `apps/api` |
| Colección `audit_logs` sin implementar | `apps/api/src/middleware/` | Crear middleware `audit.ts` que inserte en `audit_logs` al acceder a respuestas individuales desde `stats/`; conectar a `MOD_STATS` |
