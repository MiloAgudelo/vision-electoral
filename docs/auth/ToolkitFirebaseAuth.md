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

1. Ubica el archivo de ejemplo en `apps/web/src/environments/environment.example.ts`.
2. Copia ese archivo como `environment.ts` (producción) o `environment.development.ts` (desarrollo):
   ```bash
   cp apps/web/src/environments/environment.example.ts apps/web/src/environments/environment.ts
   ```
3. Reemplaza los valores `YOUR_*` con las credenciales reales del proyecto Firebase.  
   Las credenciales las provee **Juan Gaitán** ([@JuanGaitanD](https://github.com/JuanGaitanD)), quien administra el proyecto Firebase.

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

```typescript
import { Auth, signInWithPopup, GoogleAuthProvider, GithubAuthProvider,
  signInWithEmailAndPassword } from '@angular/fire/auth';

// 1. Google
const loginGoogle = () => signInWithPopup(this.auth, new GoogleAuthProvider());

// 2. GitHub
const loginGitHub = () => signInWithPopup(this.auth, new GithubAuthProvider());

// 3. Email
const loginEmail = (email, pass) => signInWithEmailAndPassword(this.auth, email, pass);
```

### Documentación Oficial

- [AngularFire Auth Guide](https://github.com/angular/angularfire/blob/master/docs/auth.md)
- [Firebase Web: GitHub Login](https://firebase.google.com/docs/auth/web/github-auth)

---

## 3. Plataforma ANDROID (Kotlin)

### Gestión de credenciales

El archivo `google-services.json` **no se versiona**. Para obtenerlo, contacta a **Juan Gaitán** ([@JuanGaitanD](https://github.com/JuanGaitanD)), quien administra el proyecto Firebase y puede compartirlo de forma segura.

Una vez que lo tengas, colócalo en la raíz del módulo `app/`:

```
android/
└── app/
    └── google-services.json   ← aquí
```


### Dependencias (`build.gradle`)

```gradle
dependencies {
    implementation platform('com.google.firebase:firebase-bom:32.x.x')
    implementation 'com.google.firebase:firebase-auth-ktx'
    implementation 'com.google.android.gms:play-services-auth:20.x.x'
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
