# 🗳️ Visión Electoral

Sistema integral de encuestas de campo aplicado al contexto electoral. Permite a encuestadores recopilar datos en terreno desde dispositivos Android (con soporte offline), sincronizarlos con un servidor central y visualizar análisis estadísticos en tiempo real desde una plataforma web.

---

## 📋 Tabla de Contenidos

- [Descripción General](#descripción-general)
- [Arquitectura](#arquitectura)
- [Stack Tecnológico](#stack-tecnológico)
- [Estructura del Repositorio](#estructura-del-repositorio)
- [Requisitos Previos](#requisitos-previos)
- [Instalación y Configuración](#instalación-y-configuración)
- [Variables de Entorno](#variables-de-entorno)
- [Equipo](#equipo)
- [Contribuir](#contribuir)

---

## Descripción General

**Visión Electoral** es una plataforma de recolección y análisis de datos compuesta por tres capas principales:

- **App Android** — los encuestadores llenan formularios en campo. Funciona sin conexión y sincroniza los datos al recuperar señal.
- **Backend (Node.js + Express)** — API REST que recibe, valida y persiste las encuestas. Gestiona autenticación con Firebase Auth y almacena los datos en MongoDB Atlas.
- **Frontend (Angular)** — dashboard web con vistas diferenciadas por rol: encuestador, analista y administrador. Incluye estadísticas en tiempo real, KPIs y visualizaciones.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        CAMPO                                │
│  Encuestador → App Android → SQLite (local)                 │
│                     │                                       │
│              Sincronizador                                  │
│           (online / cola offline)                           │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP / REST
┌──────────────────────────▼──────────────────────────────────┐
│                       BACKEND                               │
│         Node.js + Express  ←→  Firebase Auth                │
│                     │                                       │
│                  MongoDB Atlas                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      FRONTEND                               │
│          Angular — Dashboard por Rol / KPIs / Reportes      │
└─────────────────────────────────────────────────────────────┘
```

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| App móvil | Android nativo (Java / Kotlin) |
| Base de datos local | SQLite |
| Frontend web | Angular (TypeScript) |
| Backend | Node.js + Express (TypeScript) |
| Base de datos central | MongoDB Atlas |
| Autenticación | Firebase Auth (Google OAuth) |
| Gestor de paquetes JS | pnpm workspaces (monorepo) |
| Control de versiones | Git + GitHub |
| Contenerización | Docker |
| Pruebas de API | Postman |

---

## Estructura del Repositorio

```
vision-electoral/
│
├── apps/
│   ├── web/                  # Frontend Angular
│   └── api/                  # Backend Node.js + Express
│
├── mobile/                   # App Android (Java/Kotlin)
│
├── packages/                 # Código compartido entre apps JS/TS
│   └── shared-types/         # Interfaces y tipos comunes (TypeScript)
│
├── docs/                     # Documentación técnica del proyecto
│   ├── architecture/         # Diagramas de arquitectura, componentes, clases
│   ├── api/                  # Especificación de endpoints (OpenAPI / Postman)
│   └── database/             # Esquemas MongoDB y SQLite
│
├── .github/
│   ├── workflows/            # CI/CD pipelines
│   └── PULL_REQUEST_TEMPLATE.md
│
├── pnpm-workspace.yaml       # Configuración de pnpm workspaces
├── package.json              # Root package (scripts globales)
├── .gitignore
├── .env.example
├── README.md                 # Este archivo
└── CONTRIBUTING.md           # Guía de contribución y estándares
```

### ¿Qué hace cada carpeta?

**`apps/web/`** — Aplicación Angular. Contiene el dashboard con vistas por rol (encuestador, analista, administrador), visualizaciones estadísticas y gestión de usuarios. Ver [`apps/web/AGENTS.md`](apps/web/AGENTS.md).

**`apps/api/`** — API REST en Node.js + Express. Expone los endpoints de autenticación, guardado de encuestas y estadísticas. Se comunica con MongoDB Atlas. Ver [`apps/api/AGENTS.md`](apps/api/AGENTS.md).

**`mobile/`** — Aplicación Android nativa. Gestiona los formularios de campo, almacenamiento local en SQLite y sincronización con el backend. Ver [`mobile/AGENTS.md`](mobile/AGENTS.md).

**`packages/shared-types/`** — Tipos e interfaces TypeScript compartidos entre `web` y `api` para garantizar consistencia en los contratos de datos.

**`docs/`** — Toda la documentación técnica: diagramas UML, especificación de la API y esquemas de base de datos.

---

## Requisitos Previos

Asegúrate de tener instalado lo siguiente antes de clonar el proyecto:

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 8 → `npm install -g pnpm`
- [Android Studio](https://developer.android.com/studio) (para el módulo móvil)
- [Docker](https://www.docker.com/) (opcional, para levantar servicios localmente)
- Una cuenta en [Firebase](https://firebase.google.com/) con un proyecto configurado
- Acceso a un cluster de [MongoDB Atlas](https://www.mongodb.com/atlas)

---

## Instalación y Configuración

```bash
# 1. Clonar el repositorio
git clone https://github.com/MiloAgudelo/vision-electoral.git
cd vision-electoral

# 2. Instalar dependencias (todas las apps JS/TS de una vez)
pnpm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de Firebase y MongoDB Atlas

# 4. Levantar el backend en modo desarrollo
pnpm --filter api dev

# 5. Levantar el frontend en modo desarrollo
pnpm --filter web dev
```

Para el módulo Android, abre la carpeta `mobile/` desde Android Studio y configura el archivo `local.properties` con la URL del backend.

---

## Variables de Entorno

Copia `.env.example` a `.env` y completa los valores. Las variables requeridas son:

```env
# MongoDB
MONGODB_URI=mongodb+srv://<usuario>:<password>@<cluster>.mongodb.net/<db>

# Firebase Admin SDK
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# App
PORT=3000
NODE_ENV=development
```

> ⚠️ Nunca subas el archivo `.env` al repositorio. Está incluido en `.gitignore`.

---

## Equipo

| Nombre | Rol | GitHub |
|---|---|---|
| Camilo Agudelo | Project Lead & DB | [@MiloAgudelo](https://github.com/MiloAgudelo) |
| John Muñoz | Scrum Master | [@john-mz](https://github.com/john-mz) |
| Juan José Ospina | Scrum Master & Tester | [@poethy](https://github.com/poethy) |
| Juan José Pantoja | Web — Frontend | [@MrxHuaang](https://github.com/MrxHuaang) |
| Luis Paredes | Web — Frontend | [@alejo18-23](https://github.com/alejo18-23) |
| Juan Pablo Murillo | Web — Backend | [@JuanPaMv2](https://github.com/JuanPaMv2) |
| Felipe Obregon | Web — Backend | [@felipeo016](https://github.com/felipeo016) |
| Josué Puerta | Web — Backend | [@jsuepuertamusic-code](https://github.com/jsuepuertamusic-code) |
| Santiago Marín | Web — Backend & Mobile Backend | [@Santimarin06](https://github.com/Santimarin06) |
| Juan José Arango | Mobile — Frontend | [@Arango134204](https://github.com/Arango134204) |
| Emmanuel García | Mobile — Backend | [@emmanuel-2005-hub](https://github.com/emmanuel-2005-hub) |
| Julian Hinestroza | DB | [@Kloomcitoo](https://github.com/Kloomcitoo) |
| Mariana Colorado | DB | [@MarianaColorado01](https://github.com/MarianaColorado01) |
| Juan David Gaitán | DB & Auth | [@JuanGaitanD](https://github.com/JuanGaitanD) |

---

## Contribuir

Consulta [`CONTRIBUTING.md`](CONTRIBUTING.md) para conocer las convenciones de commits, flujo de ramas y proceso de Pull Requests.