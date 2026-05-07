# AGENTS.md — apps/api (Backend Node.js + Express)

Contexto del módulo para desarrolladores e IAs trabajando en esta carpeta.

---

## ¿Qué hace este módulo?

API REST en Node.js + Express (TypeScript) que actúa como capa central del sistema. Recibe las encuestas sincronizadas desde la app Android, valida y persiste los datos en MongoDB Atlas, gestiona la autenticación con Firebase Auth y expone los endpoints de estadísticas para el frontend Angular.

---

## Stack

| Tecnología | Versión | Uso |
|---|---|---|
| Node.js | >= 22 | Runtime (LTS activo del proyecto) |
| Express | >= 5 | Framework HTTP |
| TypeScript | >= 5.8 | Lenguaje |
| Firebase Admin SDK | >= 13 | Verificación de tokens de Google Auth |
| Mongoose | >= 8 | ODM para MongoDB |
| JWT (jsonwebtoken) | latest | Tokens de sesión propios hacia frontend y mobile |
| Zod | >= 3 | Validación de esquemas de entrada |
| bcrypt | latest | Hash de contraseñas (si se agrega auth por email en el futuro) |

---

## Estructura de carpetas

```
apps/api/
├── src/
│   ├── config/           # Conexión a MongoDB, Firebase Admin, variables de entorno
│   ├── middlewares/      # Auth (verifica JWT), error handler, logger
│   ├── modules/
│   │   ├── auth/         # Verificar idToken de Firebase, emitir JWT propio
│   │   ├── surveys/      # CRUD de encuestas, recepción de listas sincronizadas
│   │   ├── users/        # Gestión de usuarios y roles
│   │   ├── zones/        # Zonas geográficas
│   │   └── stats/        # Endpoints de estadísticas y KPIs
│   ├── utils/            # Helpers, transformadores
│   └── index.ts          # Entry point
├── package.json
└── tsconfig.json
```

---

## Endpoints principales

| Método | Ruta | Descripción | Auth requerida |
|---|---|---|---|
| `POST` | `/api/auth/verify` | Verifica idToken Firebase y devuelve JWT | No |
| `POST` | `/api/surveys/sync` | Recibe lista de encuestas desde mobile | Sí |
| `GET` | `/api/surveys` | Lista de encuestas con filtros | Sí |
| `GET` | `/api/stats/by-zone` | Encuestas agrupadas por zona | Sí (analista/admin) |
| `GET` | `/api/stats/by-surveyor` | Encuestas agrupadas por encuestador | Sí (analista/admin) |
| `GET` | `/api/stats/kpis` | KPIs principales del proyecto | Sí |
| `GET` | `/api/users` | Lista de usuarios | Sí (admin) |
| `PATCH` | `/api/users/:id/role` | Cambiar rol de usuario | Sí (admin) |

---

## Flujo de autenticación

1. El cliente (web o mobile) envía el `idToken` de Firebase al endpoint `POST /api/auth/verify`.
2. El backend usa **Firebase Admin SDK** para verificar el token.
3. Si es válido, busca o crea el usuario en MongoDB.
4. Devuelve un **JWT propio** firmado con el `uid`, `email` y `role` del usuario.
5. Todos los demás endpoints protegidos verifican este JWT en el middleware de auth.

> Las contraseñas nunca aparecen en logs ni en la base de datos en texto plano.

---

## Comandos útiles

```bash
# Instalar dependencias (desde la raíz del monorepo)
pnpm install

# Levantar en modo desarrollo (con hot reload)
pnpm --filter api dev

# Build de producción
pnpm --filter api build

# Ejecutar tests
pnpm --filter api test

# Lint
pnpm --filter api lint
```

---

## Variables de entorno

Definidas en `.env` en la raíz del monorepo (ver `.env.example`):

```env
MONGODB_URI=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
JWT_SECRET=
PORT=3000
NODE_ENV=development
```

> ⚠️ `FIREBASE_PRIVATE_KEY` contiene saltos de línea. En el `.env` usa comillas y `\n`. En producción usa variables de entorno del proveedor cloud.

---

## Validación de datos

Toda entrada de datos debe validarse con **Zod** antes de persistir. El endpoint `/api/surveys/sync` debe aceptar un **array** de encuestas (no una sola) para optimizar la sincronización desde mobile.

---

## Responsables

| Nombre | GitHub | Área |
|---|---|---|
| Juan Pablo Murillo | [@JuanPaMv2](https://github.com/JuanPaMv2) | Backend |
| Felipe Obregon | [@felipeo016](https://github.com/felipeo016) | Backend |
| Josué Puerta | [@jsuepuertamusic-code](https://github.com/jsuepuertamusic-code) | Backend |
| Santiago Marín | [@Santimarin06](https://github.com/Santimarin06) | Backend |
| Juan David Gaitán | [@JuanGaitanD](https://github.com/JuanGaitanD) | Auth |

---

## Notas importantes

- El endpoint de sync debe ser **idempotente**: si una encuesta ya existe (por su ID generado en mobile), no debe duplicarse.
- Los logs **nunca** deben incluir contraseñas, tokens completos ni datos sensibles.
- Sigue la convención de commits del [`CONTRIBUTING.md`](../../CONTRIBUTING.md) con scope `api`.