// src/environments/environment.prod.ts
export const environment = {
  production: true,

  // URL du serveur Django (sans /api/api ni slash final).
  // Passer en https:// dès que le certificat est installé sur le serveur.
  apiUrl: 'http://51.20.12.161',

  // ✅ Configuration Firebase — copier depuis Firebase Console
  // Project Settings → General → Your apps → Web app → firebaseConfig
  firebaseConfig: {
    apiKey:            'AIzaSyCj2ivb1V-nmdioUyD0A-3FgjJ1ULHTjpk',
    authDomain:        'ubifood-1605e.firebaseapp.com',
    projectId:         'ubifood-1605e',
    storageBucket:     'ubifood-1605e.firebasestorage.app',
    messagingSenderId: '518841892567',
    appId:             '1:518841892567:web:5d40553f0e590daa967a92',
  }
};
