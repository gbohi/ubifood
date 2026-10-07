# ============================================================
# api/fcm_service.py
# Service d'envoi de notifications FCM via firebase-admin
# ============================================================

import firebase_admin
from firebase_admin import credentials, messaging
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

# ── Initialisation Firebase Admin (une seule fois) ───────────
# À appeler dans apps.py ou au démarrage Django

def init_firebase():
    """Initialise Firebase Admin SDK si pas déjà fait."""
    if not firebase_admin._apps:
        cred = credentials.Certificate(settings.FIREBASE_SERVICE_ACCOUNT_KEY)
        firebase_admin.initialize_app(cred)
        logger.info("✅ Firebase Admin initialisé")


# ── Envoi d'une notification à un user ───────────────────────

def envoyer_notification_user(user, titre: str, message: str,
                               type_notif: str = 'info',
                               commande_id: int = None,
                               menu_id: int = None):
    """
    Envoie une notification FCM à tous les appareils d'un user
    ET crée une entrée en base Notification.

    Args:
        user        : instance User Django
        titre       : titre de la notification
        message     : corps de la notification
        type_notif  : type parmi TYPE_CHOICES de Notification
        commande_id : optionnel, ID de la commande concernée
        menu_id     : optionnel, ID du menu concerné
    """
    from .models import DeviceToken, Notification

    # 1. Créer la notification en base
    notif = Notification.objects.create(
        user=user,
        type=type_notif,
        titre=titre,
        message=message,
        commande_id=commande_id,
        menu_id=menu_id,
    )

    # 2. Récupérer tous les tokens FCM de l'user
    tokens = list(
        DeviceToken.objects.filter(user=user).values_list('token', flat=True)
    )

    if not tokens:
        logger.debug(f"Aucun token FCM pour {user.username}")
        return notif

    # 3. Envoyer via FCM (multicast — jusqu'à 500 tokens à la fois)
    try:
        init_firebase()

        fcm_message = messaging.MulticastMessage(
            tokens=tokens,
            notification=messaging.Notification(
                title=titre,
                body=message,
            ),
            data={
                # data payload : disponible même quand l'app est fermée
                'type':         type_notif,
                'commande_id':  str(commande_id) if commande_id else '',
                'menu_id':      str(menu_id)     if menu_id     else '',
                'notif_id':     str(notif.id),
            },
            android=messaging.AndroidConfig(
                priority='high',
                notification=messaging.AndroidNotification(
                    channel_id='ubifood_high',  # doit correspondre au canal Flutter
                    sound='default',
                ),
            ),
            apns=messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(
                        sound='default',
                        badge=1,
                    ),
                ),
            ),
        )

        response = messaging.send_each_for_multicast(fcm_message)
        logger.info(
            f"FCM envoyé à {user.username} : "
            f"{response.success_count} succès, "
            f"{response.failure_count} échec(s)"
        )

        # 4. Supprimer les tokens invalides (appli désinstallée, token expiré)
        if response.failure_count > 0:
            tokens_invalides = [
                tokens[i]
                for i, resp in enumerate(response.responses)
                if not resp.success and (
                    isinstance(resp.exception, messaging.UnregisteredError) or
                    'Registration token is not valid' in str(resp.exception)
                )
            ]
            if tokens_invalides:
                DeviceToken.objects.filter(token__in=tokens_invalides).delete()
                logger.info(f"🗑️ {len(tokens_invalides)} token(s) invalide(s) supprimé(s)")

    except Exception as e:
        logger.error(f"❌ Erreur envoi FCM à {user.username} : {e}")

    return notif


# ── Envoi groupé (ex: menu disponible → tous les users d'une agence) ──

def envoyer_notification_groupe(users, titre: str, message: str,
                                 type_notif: str = 'info',
                                 menu_id: int = None):
    """
    Envoie une notification à une liste de users.
    Utilisé pour notifier tous les agents d'une agence quand un menu est publié.
    """
    for user in users:
        envoyer_notification_user(
            user=user,
            titre=titre,
            message=message,
            type_notif=type_notif,
            menu_id=menu_id,
        )
