# AGENTS.md — docs/

Contexto del módulo para desarrolladores e IAs trabajando en esta carpeta.

---

## ¿Qué hay aquí?

Toda la documentación técnica del proyecto **Visión Electoral**. No hay código ejecutable en esta carpeta.

---

## Estructura

```
docs/
├── architecture/         # Diagramas de arquitectura general, componentes y casos de uso
├── api/                  # Especificación de endpoints (OpenAPI / colección Postman)
└── database/             # Esquemas de MongoDB (colecciones) y SQLite (entidades Room)
```

---

## Contenido esperado por carpeta

### `architecture/`

- Diagrama de arquitectura general del sistema (los 3 módulos + nube)
- Diagrama de componentes por módulo
- Diagrama de casos de uso (por rol: encuestador, analista, administrador)
- Diagrama de clases (principalmente para el módulo Android y la API)
- Diagrama de flujo de sincronización offline → online

Formatos aceptados: `.png`, `.svg`, `.drawio`, `.puml` (PlantUML).

### `api/`

- Especificación OpenAPI (`openapi.yaml` o `openapi.json`) con todos los endpoints.
- Colección de Postman exportada (`vision-electoral.postman_collection.json`).
- Documenta: método, ruta, parámetros, body, respuestas y errores posibles.

### `database/`

- Esquema de MongoDB: descripción de colecciones, campos, tipos e índices.
- Esquema de SQLite: tablas, columnas, tipos y relaciones (para Room).
- Estrategia de limpieza y deduplicación de datos.

---

## Convención de nombres de archivos

```
architecture/
  system-architecture.drawio
  component-diagram-web.png
  use-case-diagram.puml
  class-diagram-api.puml
  sync-flow.png

api/
  openapi.yaml
  vision-electoral.postman_collection.json

database/
  mongodb-schema.md
  sqlite-schema.md
```

---

## Fecha de entrega

La primera entrega de documentación (diagramas + esquemas + descripción del tema) tiene fecha límite **viernes 16 de mayo**.

---

## Notas

- Todos los diagramas deben estar actualizados con la arquitectura real implementada, no con diseños iniciales descartados.
- Si cambias la estructura de la base de datos o un endpoint, actualiza los documentos de esta carpeta en el mismo PR.
- Sigue la convención de commits del [`CONTRIBUTING.md`](../../CONTRIBUTING.md) con scope `docs`.