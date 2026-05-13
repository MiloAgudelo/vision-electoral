# Toolkit de Autenticación Firebase
### Proyecto Universidad — Guía de Integración Web & Android

---

## 1. Configuración Global

Los métodos habilitados en la consola son: **Email/Password**, **Google** y **GitHub**.

> **Requisito Crítico:** Para que Google y GitHub funcionen en Android, el **SHA-1** debe estar registrado en la consola de Firebase.

---

## 2. Plataforma WEB (Angular + Node.js)

### Dependencias

Instalar el SDK de Firebase en el proyecto Angular:

```bash
npm install firebase @angular/fire
```

### Gestión de credenciales

El archivo con las credenciales reales **no se versiona**. Para configurar el entorno local:

1. `environment.development.ts` ya está en el repositorio con valores de placeholder. Solo edítalo y reemplaza los valores `YOUR_*`.
2. Para producción, copia el archivo de ejemplo:
   ```bash
   cp apps/web/src/environments/environment.example.ts apps/web/src/environments/environment.ts
   ```
   y cambia `production: false` a `true`.
3. Las credenciales reales las provee **Juan Gaitán** ([@JuanGaitanD](https://github.com/JuanGaitanD)), quien administra el proyecto Firebase.

El archivo de ejemplo tiene esta forma:

```typescript
export const environment = {
  production: false, // cambiar a true en environment.ts (producción)
  firebase: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT_ID.firebasestorage.app',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    appId: 'YOUR_APP_ID',
  },
};
```

### Implementación (Angular/TypeScript)

> **Nota mobile:** `signInWithPopup` falla en WebViews y navegadores móviles que bloquean
> ventanas emergentes. Usa `signInWithRedirect` como fallback cuando detectes ese entorno.

```typescript
import {
  Auth,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  GoogleAuthProvider, GithubAuthProvider,
  signInWithEmailAndPassword,
} from '@angular/fire/auth';

// Detecta entornos que bloquean popups (WebViews, algunos navegadores móviles)
const isMobile = () => /Android|iPhone|iPad/i.test(navigator.userAgent);

// 1. Google
const loginGoogle = () => {
  const provider = new GoogleAuthProvider();
  return isMobile()
    ? signInWithRedirect(this.auth, provider)
    : signInWithPopup(this.auth, provider);
};

// 2. GitHub
const loginGitHub = () => {
  const provider = new GithubAuthProvider();
  return isMobile()
    ? signInWithRedirect(this.auth, provider)
    : signInWithPopup(this.auth, provider);
};

// 3. Email
const loginEmail = (email, pass) => signInWithEmailAndPassword(this.auth, email, pass);

// Llama esto al iniciar la app para capturar el resultado del redirect
const checkRedirectResult = () => getRedirectResult(this.auth);
```

### Documentación Oficial

- [AngularFire Auth Guide](https://github.com/angular/angularfire/blob/master/docs/auth.md)
- [Firebase Web: GitHub Login](https://firebase.google.com/docs/auth/web/github-auth)

---

## 3. Plataforma ANDROID (Kotlin)

### Gestión de credenciales

El archivo `google-services.json` **no se versiona**. Para obtenerlo, contacta a **Juan Gaitán** ([@JuanGaitanD](https://github.com/JuanGaitanD)), quien administra el proyecto Firebase y puede compartirlo de forma segura.

Una vez que lo tengas, colócalo en la raíz del módulo `app/` del proyecto Android:

```
mobile/
└── app/
    └── google-services.json   ← aquí
```


### Plugin de Google Services

El plugin transforma el `google-services.json` en recursos Android. Sin él, Firebase no se inicializa aunque las dependencias estén presentes.

**`mobile/build.gradle` (nivel proyecto):**
```gradle
plugins {
    id 'com.google.gms.google-services' version '4.4.x' apply false
}
```

**`mobile/app/build.gradle` (nivel app):**
```gradle
plugins {
    id 'com.google.gms.google-services'
}
```

### Dependencias (`mobile/app/build.gradle`)

> **Nota:** A partir del BoM 34.0.0 los módulos `-ktx` fueron eliminados. Usa el artefacto
> principal directamente; Kotlin es compatible sin sufijo.

```gradle
dependencies {
    implementation platform('com.google.firebase:firebase-bom:34.x.x')
    implementation 'com.google.firebase:firebase-auth'
    implementation 'com.google.android.gms:play-services-auth:21.x.x'
}
```

### Implementación (Kotlin)

```kotlin
val auth = Firebase.auth

// 1. Google: Requiere configuración de GoogleSignInClient

// 2. GitHub (OAuth genérico en Android):
val provider = OAuthProvider.newBuilder("github.com")
auth.startActivityForSignInWithProvider(this, provider.build())
    .addOnSuccessListener { authResult -> /* Usuario logueado */ }
    .addOnFailureListener { e -> /* Error */ }

// 3. Email:
auth.signInWithEmailAndPassword(email, password).addOnCompleteListener { ... }
```

### Documentación Oficial

- [Firebase Android: Google Sign-In](https://firebase.google.com/docs/auth/android/google-signin)
- [Firebase Android: GitHub Login](https://firebase.google.com/docs/auth/android/github-auth)
