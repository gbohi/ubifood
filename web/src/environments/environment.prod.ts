// src/environments/environment.prod.ts
export const environment = {
  production: true,

  // Vide = même serveur que le site : en production, Nginx sert le site
  // Angular ET l'API (/api/...). Le site fonctionne donc quelle que soit
  // l'adresse du serveur (IP, nom de domaine, HTTP ou HTTPS).
  apiUrl: '',

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
