// src/environments/environment.ts
export const environment = {
  production: false,

  apiUrl: 'http://51.20.12.161',

  defaultauth: 'fakebackend',

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
