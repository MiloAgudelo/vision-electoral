// NUNCA subas los archivos con credenciales reales al repositorio.
//
// Para DESARROLLO: copia como environment.development.ts y deja production: false
// Para PRODUCCIÓN:  copia como environment.ts y cambia production: true
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
