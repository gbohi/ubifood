// src/firebase-messaging-sw.js
//
// Service Worker FCM — OBLIGATOIRE pour les notifications Web
// Ce fichier doit être à la racine de src/ (servi depuis /)
// Il gère les notifications quand l'onglet est fermé ou en arrière-plan

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// ✅ Même config que environment.ts
firebase.initializeApp({
  apiKey:            'AIzaSyCj2ivb1V-nmdioUyD0A-3FgjJ1ULHTjpk',
  authDomain:        'ubifood-1605e.firebaseapp.com',
  projectId:         'ubifood-1605e',
  storageBucket:     'ubifood-1605e.firebasestorage.app',
  messagingSenderId: '518841892567',
  appId:             '1:518841892567:web:5d40553f0e590daa967a92',
});

const messaging = firebase.messaging();

// Gestion des notifications background (onglet fermé/arrière-plan)
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Message background reçu:', payload);

  const titre   = payload.notification?.title || 'UbiFood';
  const body    = payload.notification?.body  || '';
  const icon    = '/assets/images/logo.png';   // ← adapter au chemin réel

  self.registration.showNotification(titre, {
    body:    body,
    icon:    icon,
    badge:   icon,
    data:    payload.data,
    vibrate: [200, 100, 200],
  });
});

// Clic sur la notification → ouvrir/focus l'onglet Angular
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si l'onglet est déjà ouvert → le focus
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Sinon → ouvrir un nouvel onglet
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
