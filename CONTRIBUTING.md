# Guía de Contribución — Visión Electoral

Gracias por contribuir al proyecto. Esta guía define los estándares que **todo el equipo debe seguir** para mantener un historial limpio y un flujo de trabajo ordenado.

---

## Tabla de Contenidos

- [Flujo de Ramas](#flujo-de-ramas)
- [Convención de Commits](#convención-de-commits)
- [Pull Requests](#pull-requests)
- [Code Review](#code-review)
- [Reglas Generales](#reglas-generales)

---

## Flujo de Ramas

Usamos el modelo **GitHub Flow** adaptado al proyecto:

```
main
 └── develop
      ├── feature/<módulo>/<descripción-corta>
      ├── fix/<módulo>/<descripción-corta>
      ├── chore/<descripción-corta>
      └── docs/<descripción-corta>
```


| Rama        | Propósito                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `main`      | Código estable y desplegado en producción. Solo recibe merges desde `develop` vía PR aprobado. |
| `develop`   | Rama de integración. Aquí se acumula el trabajo antes de ir a `main`.                          |
| `feature/*` | Desarrollo de nuevas funcionalidades.                                                          |
| `fix/*`     | Corrección de bugs.                                                                            |
| `chore/*`   | Tareas de mantenimiento, configuración, dependencias.                                          |
| `docs/*`    | Cambios exclusivos de documentación.                                                           |


### Módulos válidos para el nombre de rama

`web` · `api` · `mobile` · `db` · `auth` · `shared` · `ci`

### Ejemplos

```bash
git checkout -b feature/web/dashboard-encuestador
git checkout -b fix/api/sync-endpoint-validation
git checkout -b chore/ci/add-lint-action
git checkout -b docs/mobile/sqlite-schema
```

---

## Convención de Commits

Seguimos **Conventional Commits** ([conventionalcommits.org](https://www.conventionalcommits.org/)). Cada commit debe tener el formato:

```
<tipo>(<scope>): <descripción corta en imperativo>

[cuerpo opcional]

[footer opcional: BREAKING CHANGE / closes #issue]
```

### Tipos permitidos


| Tipo       | Cuándo usarlo                                           |
| ---------- | ------------------------------------------------------- |
| `feat`     | Nueva funcionalidad                                     |
| `fix`      | Corrección de un bug                                    |
| `docs`     | Cambios solo en documentación                           |
| `style`    | Formateo, espacios, punto y coma (sin cambio de lógica) |
| `refactor` | Refactorización sin agregar features ni corregir bugs   |
| `test`     | Agregar o corregir tests                                |
| `chore`    | Tareas de build, dependencias, configuración            |
| `perf`     | Mejoras de rendimiento                                  |
| `ci`       | Cambios en pipelines de CI/CD                           |
| `revert`   | Revertir un commit anterior                             |


### Scopes válidos

`web` · `api` · `mobile` · `db` · `auth` · `shared` · `ci` · `docs`

### Reglas del mensaje

- Usa **imperativo** en la descripción: `agregar`, `corregir`, `actualizar`, `eliminar` — no `agregué`, `corrigiendo`, `actualizado`.
- Máximo **72 caracteres** en la primera línea.
- La descripción va en **minúsculas** (excepto nombres propios o acrónimos).
- No termines la descripción con punto.

### Ejemplos

```bash
# ✅ Correcto
feat(web): agregar enrutamiento de dashboard por rol
fix(api): validar lista de encuestas vacía antes de guardar
docs(mobile): agregar esquema sqlite al AGENTS.md
chore(ci): configurar caché de pnpm en github actions
refactor(api): extraer middleware de autenticación a módulo separado
test(web): agregar pruebas unitarias al componente de formulario

# ❌ Incorrecto
git commit -m "arreglé el bug del login"
git commit -m "actualización"
git commit -m "feat: se agregó nueva funcionalidad para el dashboard del analista"
```

### Commits con breaking changes

Si el commit rompe compatibilidad con versiones anteriores, agrega `BREAKING CHANGE` en el footer:

```
feat(api)!: cambiar esquema de respuesta del endpoint de encuestas

BREAKING CHANGE: la respuesta ahora retorna `data.encuestas` en lugar de `data`
```

---

## Pull Requests

### Antes de abrir un PR

- El código compila y corre localmente sin errores.
- Los tests existentes pasan (`pnpm test` o build de Android sin warnings críticos).
- El código está self-reviewed (léelo tú mismo antes de pedirle a otros).
- El nombre de la rama sigue la convención definida.
- Los commits del branch siguen Conventional Commits.

### Título del PR

Usa el mismo formato que los commits:

```
feat(web): implement analyst word cloud visualization
fix(mobile): resolve offline queue duplication on reconnect
```

### Descripción del PR

Usa la siguiente plantilla (también en `.github/PULL_REQUEST_TEMPLATE.md`):

```markdown
## ¿Qué hace este PR?
<!-- Descripción breve de los cambios -->

## ¿Por qué es necesario?
<!-- Contexto o problema que resuelve -->

## Cambios principales
- 
- 

## Cómo probar
<!-- Pasos para verificar que funciona -->

## Issues relacionados
Closes #

## Checklist
- [ ] El código compila sin errores
- [ ] Los tests pasan
- [ ] La documentación está actualizada (si aplica)
- [ ] Se actualizó AGENTS.md (si aplica)
```

### Reglas de merging

- Todo PR (tanto a `develop` como a `main`) requiere **aprobación de al menos uno** de los reviewers designados: @poethy, @john-mz o @MiloAgudelo.
- No hagas merge de tu propio PR sin esa aprobación.
- Usa **Squash and merge** para PRs pequeños de una sola funcionalidad.
- Usa **Merge commit** para PRs grandes con historial relevante.
- Elimina la rama después del merge.

---

## Code Review

Los reviews de aprobación los hacen únicamente **Juan José Ospina** (@poethy), **John Muñoz** (@john-mz) o **Camilo Agudelo** (@MiloAgudelo). Cualquier otro miembro del equipo puede dejar comentarios en un PR si identifica algo relevante, pero no cuenta como aprobación para el merge.

Como reviewer designado:

- Aprueba solo si entiendes qué hace el código y estás de acuerdo.
- Usa comentarios constructivos: sugiere, no ordenas.
- Distingue entre bloqueante (`🔴 bloqueante:`) y sugerencia (`💡 sugerencia:`).
- Responde o resuelve los comentarios dentro de **48 horas**.

Como autor:

- Responde todos los comentarios (de quien sean) antes de hacer merge.
- Si rechazas una sugerencia, explica por qué.

---

## Reglas Generales

- **Nunca** hagas push directo a `main` o `develop`.
- **Nunca** subas archivos `.env` ni credenciales al repositorio.
- **Nunca** subas archivos generados (`/dist`, `/build`, `node_modules`, `.gradle`).
- Mantén los PRs pequeños y enfocados: un PR = una funcionalidad o un fix.
- Si tu tarea dura más de 2 días, considera abrir el PR como **Draft** para visibilidad del equipo.
- Actualiza el `AGENTS.md` de tu módulo cuando hagas cambios estructurales.

