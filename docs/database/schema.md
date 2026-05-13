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

1. **Simplicidad sobre flexibilidad, no mutabilidad peligrosa**: el proyecto es académico y de alcance acotado. No hay una colección separada de versiones, pero toda plantilla `publicada` es inmutable desde que puede haber sido descargada por clientes offline. Los cambios se hacen duplicando y archivando la anterior.
2. **Respuestas anónimas**: `survey_responses` no almacena información identificable del encuestado. Solo del *encuestador* (para auditoría y agregados por persona-que-recolecta).
3. **Mobile offline-first**: el dispositivo genera el identificador único de cada entrega antes de tener red. El backend es idempotente por ese identificador.
4. **Una plantilla publicada no se edita**: si requiere cambios, se duplica y la vieja se archiva. No se espera a que existan respuestas en servidor porque mobile pudo cachearla y capturar respuestas offline con la versión anterior.
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
| `published_at` | `Date?` | set al publicar; desde ese momento la plantilla queda inmutable |
| `archived_at` | `Date?` | set al archivar; permite decidir si se aceptan capturas offline previas |
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
| `options` | `Option[]?` | solo si `type='cerrada'` |
| `selection_mode` | `enum?` | requerido si `type='cerrada'`: `single` \| `multiple` |

`Option`:

| Campo | Tipo |
|---|---|
| `option_id` | `string` (UUID) |
| `text` | `string` |

**Índices**: `status`, `{status: 1, updated_at: -1}` para sync incremental de plantillas.

**Regla de inmutabilidad**: si una plantilla está `publicada`, el endpoint de edición responde **409 Conflict** con el mensaje `"plantilla publicada; duplíquela en lugar de editarla"`, aunque todavía no existan respuestas en servidor. La razón es offline-first: un cliente pudo descargar la plantilla publicada, capturar encuestas sin red y sincronizarlas después de un intento de edición. La UI de admin muestra "Duplicar" en vez de "Editar" para plantillas publicadas.

**Archivado compatible con offline**: archivar una plantilla impide nuevas capturas cuando el cliente recibe el cambio, pero el backend puede aceptar respuestas capturadas antes de `archived_at` si la plantilla coincide con la versión publicada descargada por mobile. Si no se implementa esa tolerancia, el sync de plantillas debe enviar tombstones/estado `archivada` y mobile debe bloquear la captura inmediatamente después de actualizar cache.

### `survey_responses`

| Campo | Tipo | Notas |
|---|---|---|
| `_id` | `ObjectId` | |
| `submission_id` | `string` | UUID v4 generado en el dispositivo; **índice único** (idempotencia) |
| `template_id` | `ObjectId` | |
| `surveyor_id` | `ObjectId` | encuestador que recolectó |
| `zone_id` | `ObjectId` | |
| `answers` | `Answer[]` | embebido |
| `captured_at` | `Date` | timestamp del dispositivo al guardar local |
| `synced_at` | `Date` | timestamp del servidor al persistir |

`Answer`:

| Campo | Tipo | Cuándo |
|---|---|---|
| `question_id` | `string` | siempre |
| `value` | `string?` | si la pregunta es `abierta` |
| `selected_option_ids` | `string[]?` | si la pregunta es `cerrada`; la cardinalidad se valida contra `Question.selection_mode` |

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
status         TEXT          -- publicada | archivada; permite invalidar cache stale
questions_json TEXT          -- JSON con el array questions[] tal como vino del backend
published_at   INTEGER
archived_at    INTEGER       -- null si sigue publicada
updated_at     INTEGER
```

### `responses` (cola de envío)

```sql
submission_id TEXT PRIMARY KEY  -- UUID v4 generado en el dispositivo
template_id   TEXT
zone_id       TEXT
surveyor_uid  TEXT
answers_json  TEXT              -- mismo shape que answers[] del payload
captured_at   INTEGER
status        TEXT              -- pending | synced | rejected | conflict
last_error    TEXT              -- motivo legible del último rechazo/error
retry_count   INTEGER           -- backoff y diagnóstico
updated_at    INTEGER
```

### `session` (un único row)

```sql
uid           TEXT PRIMARY KEY
email         TEXT
name          TEXT
role          TEXT
jwt_token     TEXT
zone_id       TEXT
```

**Datos solo locales** (no viajan al servidor): `status`, `last_error`, `retry_count`, `jwt_token`.

**Limpieza**: borrar filas de `responses` con `status = 'synced'` después de 7 días. Las filas `rejected` y `conflict` son terminales: no se reintentan automáticamente; quedan visibles para soporte/usuario hasta descartarlas manualmente o resolverlas con una migración.

---

## Contrato de sincronización

### Request

`POST /api/surveys/sync` recibe **un array** (no un objeto) de hasta 200 respuestas:

```json
[
  {
    "submission_id": "550e8400-e29b-41d4-a716-446655440000",
    "template_id": "65f1a2b3c4d5e6f7a8b9c0d1",
    "zone_id": "65f1a2b3c4d5e6f7a8b9c0d2",
    "captured_at": "2026-05-13T14:32:11.000Z",
    "answers": [
      { "question_id": "q-uuid-1", "value": "comentario libre" },
      { "question_id": "q-uuid-2", "selected_option_ids": ["opt-a"] }
    ]
  }
]
```

`surveyor_id` no viaja en el cuerpo; el backend lo deriva del JWT. Como precondición del contrato, mobile debe seleccionar únicamente filas de `responses` donde `surveyor_uid == session.uid`; si hay pendientes de otro usuario en un dispositivo compartido, deben permanecer aisladas y no sincronizarse con el JWT actual. Si la implementación decide enviar `surveyor_uid` como header/debug metadata, el backend debe rechazar cualquier mismatch contra el usuario derivado del JWT; si no lo envía, la garantía mínima obligatoria queda del lado del repositorio local/WorkManager.

`zone_id` viaja para mantener el payload autocontenido y facilitar validación offline, pero el servidor no confía en él: debe comprobar que pertenece al encuestador autenticado (`zone_id == user.zone_id`). Si en el futuro hay encuestadores multizona, la regla cambia a pertenencia en una lista explícita `user.zone_ids`; mientras no exista ese modelo, una zona válida de otro usuario se rechaza.

### Response

```json
{
  "accepted": ["550e8400-e29b-41d4-a716-446655440000"],
  "duplicated": [],
  "rejected": [],
  "conflict": []
}
```

- `accepted`: insertadas correctamente.
- `duplicated`: el `submission_id` ya existía y el documento persistido tiene el mismo contenido canónico. El mobile las marca como sincronizadas igual.
- `rejected`: fallaron validación permanente. Incluye `{ submission_id, reason }`. El mobile guarda `status='rejected'`, `last_error=reason` y deja de reintentar automáticamente.
- `conflict`: el `submission_id` ya existía pero el contenido canónico difiere. Incluye `{ submission_id, reason }`. El mobile guarda `status='conflict'`; no debe marcar la fila como sincronizada ni reintentar sin intervención.

### Idempotencia

Garantizada por el índice único en `survey_responses.submission_id`, pero el índice por sí solo no basta para distinguir retries seguros de corrupción local. El servidor debe calcular una representación canónica de los campos semánticos (`template_id`, `surveyor_id` derivado, `zone_id` validado, `captured_at` normalizado y `answers` ordenadas por `question_id`) y compararla con el documento existente cuando ocurra `E11000`.

- Si el contenido canónico coincide, responde `duplicated`: es un retry idempotente.
- Si difiere, responde `conflict`: posible bug local, restore de backup o reutilización accidental de UUID. No se debe marcar como sincronizado.

Para lotes mixtos, el servidor debe procesar cada item de forma independiente: un rechazo o conflicto no bloquea los demás `accepted`/`duplicated`.

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

const QuestionSchema = new Schema({
  question_id: { type: String, required: true },
  order: Number,
  text: { type: String, required: true },
  type: { type: String, enum: ['abierta', 'cerrada'], required: true },
  required: { type: Boolean, default: false },
  selection_mode: { type: String, enum: ['single', 'multiple'], required: function () { return this.type === 'cerrada' } },
  options: [{ option_id: String, text: String }],
}, { _id: false })

export const SurveyTemplate = model('SurveyTemplate', new Schema({
  name: { type: String, required: true },
  description: String,
  status: { type: String, enum: ['borrador', 'publicada', 'archivada'], default: 'borrador' },
  published_at: Date,
  archived_at: Date,
  questions: [QuestionSchema],
  created_by: { type: Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }))

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
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })

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
  val surveyorUid: String,
  val answersJson: String,
  val capturedAt: Long,
  val status: String = "pending",
  val lastError: String? = null,
  val retryCount: Int = 0,
  val updatedAt: Long,
)

@Entity(tableName = "templates_cache")
data class TemplateCacheEntity(
  @PrimaryKey val templateId: String,
  val name: String,
  val status: String,
  val questionsJson: String,
  val publishedAt: Long?,
  val archivedAt: Long?,
  val updatedAt: Long,
)
```

---

## Reglas de validación

Toda entrada al servidor pasa por Zod antes de tocar Mongoose. Además del schema:

1. Para cada `answer.question_id`, debe existir en `survey_templates.questions[].question_id` del `template_id` dado.
2. Si la pregunta es `cerrada`: `selected_option_ids` no vacío y todos los IDs deben pertenecer a `question.options[].option_id`. `value` debe venir vacío.
3. Si la pregunta cerrada tiene `selection_mode='single'`, `selected_option_ids.length` debe ser exactamente 1; si tiene `selection_mode='multiple'`, puede ser mayor a 1.
4. Si la pregunta es `abierta`: `value` debe venir; `selected_option_ids` ausente o vacío.
5. Todas las preguntas con `required: true` deben tener una answer correspondiente en el payload.
6. `template_id` debe apuntar a una plantilla `publicada`, o a una `archivada` solo si `captured_at <= archived_at` y la plantilla coincide con la versión publicada cacheada.
7. `surveyor_id` (derivado del JWT) debe existir, estar activo y coincidir con la fila local que mobile está sincronizando (`surveyor_uid == session.uid`).
8. `zone_id` debe existir, estar activa y pertenecer al encuestador autenticado (`zone_id == user.zone_id`, salvo modelo multizona explícito).
9. En duplicados por `submission_id`, comparar contenido canónico antes de devolver `duplicated`; si difiere, devolver `conflict`.

Las validaciones 1–5 no se expresan completamente en Zod; se hacen en el service después de cargar la plantilla.

---

## Huecos vs estado actual del repo

| Hueco | Ubicación | Acción |
|---|---|---|
| API solo tiene `GET /salud`; faltan módulos `auth`, `surveys`, `users`, `zones`, `stats` | [apps/api/src/index.ts](../../apps/api/src/index.ts) | Crear scaffolding por módulo (router, controller, service, model, validator Zod) |
| No hay conexión Mongoose configurada | `apps/api/src/config/` (no existe) | Crear `config/mongoose.ts` con `mongoose.connect(MONGODB_URI)` y manejo de eventos |
| `mobile/AGENTS.md` describe `SurveyEntity` con `respondent`, `answers JSON` plano y **sin** `template_id` | [mobile/AGENTS.md](../../mobile/AGENTS.md) | Actualizar al esquema definido aquí: `submission_id`, `template_id`, sin `respondent` |
| No existe endpoint para que mobile descargue plantillas activas | [apps/api/AGENTS.md](../../apps/api/AGENTS.md) tabla de endpoints | Agregar `GET /api/survey-templates?status=publicada` |
| Falta endpoint admin para publicar plantilla | igual | Agregar `POST /api/survey-templates/:id/publish` |
| Idempotencia mencionada como requisito pero sin definir clave | [apps/api/AGENTS.md](../../apps/api/AGENTS.md) línea de "Notas importantes" | Documentar `submission_id` como clave de idempotencia |
| Formato de respuesta del sync sin definir | [mobile/AGENTS.md](../../mobile/AGENTS.md) sección "Sincronización" | Documentar `{accepted, duplicated, rejected, conflict}` |
| `packages/shared-types/` vacío | `packages/shared-types/` | Exportar enums (`UserRole`, `QuestionType`, `TemplateStatus`) y tipos derivados de los schemas Zod para compartir entre `apps/web` y `apps/api` |
