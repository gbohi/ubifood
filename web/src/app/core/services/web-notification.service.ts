// src/app/core/services/web-notification.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { ToastrService } from 'ngx-toastr';

const VAPID_KEY = 'BHVtuBhT4bLXdM8MZ2tK0dbzabvoUAGTvVapKOUfnrv4yFtx8gYkYisWd5Q0BSP5zIGG5RYfFOckMxfB3V5dKmo'; // ← votre clé VAPID

@Injectable({ providedIn: 'root' })
export class WebNotificationService {

  private messaging!: Messaging;
  private apiUrl = `${environment.apiUrl}/api/api`;
  private swRegistration!: ServiceWorkerRegistration;

  constructor(
    private http: HttpClient,
    private toastr: ToastrService,
  ) {}

  // ── Initialisation ────────────────────────────────────────

  async init(): Promise<void> {
    try {
      // 1. Initialiser Firebase
      if (getApps().length === 0) {
        initializeApp(environment.firebaseConfig);
      }
      this.messaging = getMessaging();

      // 2. ✅ Enregistrer le Service Worker manuellement
      if ('serviceWorker' in navigator) {
        this.swRegistration = await navigator.serviceWorker.register(
          '/firebase-messaging-sw.js',
          { scope: '/' }
        );
        await navigator.serviceWorker.ready;
        console.log('✅ Service Worker FCM enregistré');
      }

      // 3. Écouter les messages foreground
      this._listenForeground();

      console.log('✅ WebNotificationService initialisé');
    } catch (e) {
      console.warn('⚠️ WebNotificationService init error:', e);
    }
  }

  // ── Permission + Token ────────────────────────────────────

  async requestPermissionAndSaveToken(): Promise<void> {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('⚠️ Permission notifications refusée');
        return;
      }

      console.log('✅ Permission notifications accordée');

      // ✅ Passer la swRegistration à getToken
      const token = await getToken(this.messaging, {
        vapidKey:             VAPID_KEY,
        serviceWorkerRegistration: this.swRegistration,
      });

      if (!token) {
        console.warn('⚠️ Token FCM Web non disponible');
        return;
      }

      console.log('🔑 Token FCM Web:', token.substring(0, 20) + '...');
      await this._sendTokenToBackend(token);

    } catch (e) {
      console.warn('⚠️ Erreur permission/token FCM Web:', e);
    }
  }

  // ── Envoi token au backend ────────────────────────────────

  private async _sendTokenToBackend(token: string): Promise<void> {
    try {
      await this.http.post(`${this.apiUrl}/device-tokens/`, {
        token:    token,
        platform: 'web',
      }).toPromise();
      console.log('✅ Token FCM Web envoyé au backend');
    } catch (e) {
      console.warn('⚠️ Token FCM Web non envoyé:', e);
    }
  }

  // ── Suppression token au logout ───────────────────────────

  async deleteToken(): Promise<void> {
    try {
      const token = await getToken(this.messaging, {
        vapidKey:             VAPID_KEY,
        serviceWorkerRegistration: this.swRegistration,
      });
      if (token) {
        await this.http.delete(
          `${this.apiUrl}/device-tokens/supprimer/?token=${token}`
        ).toPromise();
        console.log('✅ Token FCM Web supprimé');
      }
    } catch (e) {
      console.warn('⚠️ Erreur suppression token FCM Web:', e);
    }
  }

  // ── Messages foreground → Toast ───────────────────────────

  private _listenForeground(): void {
    onMessage(this.messaging, (message) => {
      console.log('🔔 [FCM Web Foreground]', message.notification?.title);
      const titre = message.notification?.title || 'Notification';
      const body  = message.notification?.body  || '';
      const type  = message.data?.['type']      || 'info';

      switch (type) {
        case 'commande_passee':
          this.toastr.success(body, titre, { timeOut: 5000 });
          break;
        case 'commande_annulee':
          this.toastr.error(body, titre, { timeOut: 5000 });
          break;
        case 'retrait_valide':
          this.toastr.success(body, titre, { timeOut: 5000, progressBar: true });
          break;
        case 'menu_disponible':
          this.toastr.info(body, titre, { timeOut: 6000 });
          break;
        case 'rappel_48h':
          this.toastr.warning(body, titre, { timeOut: 6000 });
          break;
        default:
          this.toastr.info(body, titre, { timeOut: 4000 });
      }
    });
  }
}
