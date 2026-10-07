// lib/core/services/notification_service.dart
//
// Responsabilités :
//   1. Initialiser Firebase Messaging
//   2. Demander les permissions (iOS + Android 13+)
//   3. Récupérer le FCM token et l'envoyer au backend Django
//   4. Configurer les handlers (foreground / background / terminated)
//   5. Afficher les notifications locales quand l'app est au premier plan

import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter/foundation.dart';
import '../../firebase_options.dart';
import '../api/api_client.dart';

// ── Handler background / terminated (doit être une fonction top-level) ────────
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Firebase doit être initialisé même en background
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  debugPrint('🔔 [FCM Background] ${message.notification?.title}');
}

// ══════════════════════════════════════════════════════════════
// NOTIFICATION SERVICE
// ══════════════════════════════════════════════════════════════

class NotificationService {
  static final NotificationService _instance = NotificationService._();
  factory NotificationService() => _instance;
  NotificationService._();

  final FirebaseMessaging _fcm = FirebaseMessaging.instance;

  // Plugin pour les notifications locales (foreground)
  final FlutterLocalNotificationsPlugin _localNotif =
      FlutterLocalNotificationsPlugin();

  // Canal Android pour les notifications locales
  static const _androidChannel = AndroidNotificationChannel(
    'ubifood_high', // id — doit correspondre à AndroidManifest
    'Notifications UbiFood', // nom affiché dans les paramètres Android
    description: 'Commandes, menus et rappels UbiFood',
    importance: Importance.high,
    playSound: true,
  );

  // Callback appelé quand l'utilisateur tape sur une notification
  // (pour naviguer vers le bon écran)
  void Function(RemoteMessage)? onMessageTap;

  // ── Initialisation complète ────────────────────────────────

  Future<void> init() async {
    // 1. Enregistrer le handler background (avant tout)
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // 2. Demander les permissions
    await _requestPermissions();

    // 3. Initialiser les notifications locales (foreground Android/iOS)
    await _initLocalNotifications();

    // 4. Configurer les handlers de réception
    _setupHandlers();

    // 5. Récupérer et envoyer le token au backend
    await _saveToken();

    // 6. Écouter les refresh de token
    _fcm.onTokenRefresh.listen(_sendTokenToBackend);

    debugPrint('✅ NotificationService initialisé');
  }

  // ── Permissions ───────────────────────────────────────────

  Future<void> _requestPermissions() async {
    final settings = await _fcm.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false, // true = permission silencieuse iOS
    );

    debugPrint(
      '🔔 Permission FCM : ${settings.authorizationStatus}',
    );
  }

  // ── Notifications locales (affichage foreground) ──────────

  Future<void> _initLocalNotifications() async {
    // Android : icône dans res/drawable (à créer)
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');

    // iOS
    const iosInit = DarwinInitializationSettings(
      requestAlertPermission: false, // déjà demandé via FCM
      requestBadgePermission: false,
      requestSoundPermission: false,
    );

    await _localNotif.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
      onDidReceiveNotificationResponse: (details) {
        // L'utilisateur a tapé sur une notification locale
        debugPrint('🔔 Tap notification locale : ${details.payload}');
      },
    );

    // Créer le canal Android (obligatoire Android 8+)
    if (Platform.isAndroid) {
      await _localNotif
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(_androidChannel);
    }
  }

  // ── Handlers de réception ─────────────────────────────────

  void _setupHandlers() {
    // ① App au premier plan → afficher une notification locale
    FirebaseMessaging.onMessage.listen((message) {
      debugPrint('🔔 [FCM Foreground] ${message.notification?.title}');
      _showLocalNotification(message);
    });

    // ② App en arrière-plan → l'user tape sur la notif
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      debugPrint('🔔 [FCM Background tap] ${message.notification?.title}');
      onMessageTap?.call(message);
    });

    // ③ App terminée → vérifier si lancée via une notification
    _fcm.getInitialMessage().then((message) {
      if (message != null) {
        debugPrint('🔔 [FCM Terminated tap] ${message.notification?.title}');
        // Délai pour laisser l'UI se construire avant navigation
        Future.delayed(const Duration(seconds: 1), () {
          onMessageTap?.call(message);
        });
      }
    });
  }

  // ── Afficher une notification locale (foreground) ─────────

  Future<void> _showLocalNotification(RemoteMessage message) async {
    final notif = message.notification;
    if (notif == null) return;

    await _localNotif.show(
      message.hashCode,
      notif.title,
      notif.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _androidChannel.id,
          _androidChannel.name,
          channelDescription: _androidChannel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: message.data['type'],
    );
  }

  // ── Gestion du token FCM ──────────────────────────────────

  Future<void> _saveToken() async {
    try {
      // Sur iOS, il faut d'abord récupérer le token APNS
      if (Platform.isIOS) {
        final apns = await _fcm.getAPNSToken();
        if (apns == null) {
          debugPrint('⚠️ APNS token non disponible (simulateur ?)');
          return;
        }
      }

      final token = await _fcm.getToken();
      if (token != null) {
        debugPrint('🔑 FCM Token : ${token.substring(0, 20)}...');
        await _sendTokenToBackend(token);
      }
    } catch (e) {
      debugPrint('❌ Erreur récupération FCM token : $e');
    }
  }

  Future<void> _sendTokenToBackend(String token) async {
    try {
      final platform = Platform.isAndroid
          ? 'android'
          : Platform.isIOS
              ? 'ios'
              : 'web';

      await apiClient.post('/device-tokens/', data: {
        'token': token,
        'platform': platform,
      });

      debugPrint('✅ Token FCM envoyé au backend ($platform)');
    } catch (e) {
      // Ne pas bloquer l'app si l'envoi échoue
      // (l'user n'est peut-être pas encore connecté)
      debugPrint('⚠️ Token FCM non envoyé : $e');
    }
  }

  // ── Méthode publique : envoyer le token après login ───────
  // À appeler depuis AuthProvider.login() une fois connecté

  Future<void> registerTokenAfterLogin() async {
    await _saveToken();
  }

  // ── Supprimer le token au logout ──────────────────────────

  Future<void> deleteToken() async {
    try {
      final token = await _fcm.getToken();
      if (token != null) {
        // Passé en paramètre (encodé) et non concaténé dans l'URL
        await apiClient
            .delete('/device-tokens/supprimer/', params: {'token': token});
      }
      await _fcm.deleteToken();
      debugPrint('✅ Token FCM supprimé');
    } catch (e) {
      debugPrint('⚠️ Erreur suppression token : $e');
    }
  }
}

// ── Instance globale ──────────────────────────────────────────
final notificationService = NotificationService();
