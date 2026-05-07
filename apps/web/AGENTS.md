# AGENTS.md — apps/web (Frontend Angular)

Contexto del módulo para desarrolladores e IAs trabajando en esta carpeta.

---

## ¿Qué hace este módulo?

Aplicación web en Angular que sirve como plataforma de análisis y gestión de las encuestas recolectadas en campo. Implementa autenticación con Firebase Auth (Google OAuth) y un dashboard con vistas diferenciadas según el rol del usuario.

---

## Stack

| Tecnología | Versión recomendada | Uso |
|---|---|---|
| Node.js | >= 22 | Runtime (LTS activo del proyecto) |
| Angular | >= 21 | Framework principal |
| TypeScript | >= 5.8 | Lenguaje |
| Firebase JS SDK | >= 12 | Autenticación Google (Auth) |
| Chart.js / ng2-charts | latest | Visualizaciones y gráficas |
| spartan/ui | latest | Componentes UI (port de shadcn/ui para Angular) |
| TailwindCSS | >= 4 | Estilos (requerido por spartan/ui) |

---

## Estructura de carpetas

```
apps/web/
├── src/
│   ├── app/
│   │   ├── core/             # Guards, interceptors, servicios singleton
│   │   ├── shared/           # Componentes y pipes reutilizables
│   │   ├── features/
│   │   │   ├── auth/         # Login / callback de Google
│   │   │   ├── dashboard/
│   │   │   │   ├── surveyor/ # Vista del encuestador
│   │   │   │   ├── analyst/  # Vista del analista
│   │   │   │   └── admin/    # Vista del administrador
│   │   │   ├── surveys/      # Listado y detalle de encuestas
│   │   │   └── reports/      # KPIs y reportes exportables
│   │   └── app.routes.ts
│   ├── environments/
│   └── assets/
├── package.json
└── angular.json
```

---

## Roles y vistas

| Rol | Qué ve |
|---|---|
| **Encuestador** | Encuestas realizadas hoy, total histórico, gráfica de productividad diaria |
| **Analista** | Encuestas por zona geográfica, encuestas por encuestador, tendencias, word cloud |
| **Administrador** | Todo lo anterior + gestión de usuarios y configuración del sistema |

El rol se obtiene del token JWT devuelto por el backend después de validar la sesión de Firebase.

---

## Autenticación

1. El usuario hace clic en "Iniciar sesión con Google".
2. Firebase Auth maneja el flujo OAuth.
3. El frontend envía el `idToken` de Firebase al endpoint `POST /api/auth/verify` del backend.
4. El backend valida el token, crea/actualiza el usuario en MongoDB y devuelve un JWT propio con el rol.
5. El JWT se almacena en memoria (no en `localStorage`) y se adjunta en el header `Authorization: Bearer <token>` de cada request.

---

## Comandos útiles

```bash
# Instalar dependencias (desde la raíz del monorepo)
pnpm install

# Levantar en modo desarrollo
pnpm --filter web dev

# Build de producción
pnpm --filter web build

# Ejecutar tests
pnpm --filter web test

# Lint
pnpm --filter web lint
```

---

## Variables de entorno

Se configuran en `src/environments/environment.ts` (desarrollo) y `environment.prod.ts` (producción). Los valores sensibles **no se suben al repo**.

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
  }
};
```

---

## Responsables

| Nombre | GitHub | Área |
|---|---|---|
| Juan José Pantoja | [@MrxHuaang](https://github.com/MrxHuaang) | Frontend |
| Camilo Agudelo | [@MiloAgudelo](https://github.com/MiloAgudelo) | Frontend |
| Luis Paredes | [@alejo18-23](https://github.com/alejo18-23) | Frontend |

---

## Notas importantes

- Los reportes deben actualizarse en tiempo real (usar polling o WebSockets según se defina).
- El JWT del backend **nunca** se guarda en `localStorage` por seguridad (XSS).
- Sigue la convención de commits del [`CONTRIBUTING.md`](../../CONTRIBUTING.md) con scope `web`.