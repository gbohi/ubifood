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


# ── Construction du message FCM ──────────────────────────────

# Types envoyés en message « data seulement » (sans bloc notification) :
# sur Android, c'est l'application (gestionnaire d'arrière-plan Flutter) qui
# affiche la notification, avec un bouton d'action — même application en
# arrière-plan ou fermée. Un message avec bloc notification est affiché par
# le système, sans bouton possible. iOS : alerte APNs avec une catégorie
# (actions déclarées par l'application).
TYPES_DONNEES_SEULES = {'retrait_valide'}
CATEGORIES_IOS = {'retrait_valide': 'RETRAIT_VALIDE'}
CANAL_ANDROID = 'ubifood_high'   # doit correspondre au canal Flutter


def donnees_fcm(type_notif, notif_id=None, commande_id=None, menu_id=None, retrait_id=None,
                contestation_id=None, donnees=None):
    """Bloc data du message FCM (valeurs en chaînes, exigé par FCM)."""
    data = {
        # data payload : disponible même quand l'app est fermée
        'type':         type_notif,
        'commande_id':  str(commande_id) if commande_id else '',
        'menu_id':      str(menu_id)     if menu_id     else '',
        'retrait_id':   str(retrait_id)  if retrait_id  else '',
        'contestation_id': str(contestation_id) if contestation_id else '',
        'notif_id':     str(notif_id) if notif_id else '',
    }
    for cle, valeur in (donnees or {}).items():
        data.setdefault(str(cle), '' if valeur is None else str(valeur))
    return data


def construire_message(tokens, titre, message, type_notif, data):
    """MulticastMessage FCM (sans envoi) : voir TYPES_DONNEES_SEULES."""
    aps_commun = {'sound': 'default', 'badge': 1}
    if type_notif in TYPES_DONNEES_SEULES:
        return messaging.MulticastMessage(
            tokens=tokens,
            # Titre et texte dans les données : l'application construit la notification
            data={**data, 'titre': titre, 'message': message},
            android=messaging.AndroidConfig(priority='high'),
            apns=messaging.APNSConfig(
                headers={'apns-priority': '10', 'apns-push-type': 'alert'},
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(
                        alert=messaging.ApsAlert(title=titre, body=message),
                        category=CATEGORIES_IOS.get(type_notif),
                        **aps_commun,
                    ),
                ),
            ),
        )
    return messaging.MulticastMessage(
        tokens=tokens,
        notification=messaging.Notification(
            title=titre,
            body=message,
        ),
        data=data,
        android=messaging.AndroidConfig(
            priority='high',
            notification=messaging.AndroidNotification(
                channel_id=CANAL_ANDROID,
                sound='default',
            ),
        ),
        apns=messaging.APNSConfig(
            payload=messaging.APNSPayload(
                aps=messaging.Aps(**aps_commun),
            ),
        ),
    )


# ── Envoi d'une notification à un user ───────────────────────

def envoyer_notification_user(user, titre: str, message: str,
                               type_notif: str = 'info',
                               commande_id: int = None,
                               menu_id: int = None,
                               retrait_id: int = None,
                               contestation_id: int = None,
                               donnees: dict = None):
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
        retrait_id  : optionnel, ID du retrait (action « Je n'ai pas retiré ce repas »)
        contestation_id : optionnel, ID de la contestation de retrait
        donnees     : optionnel, données propres au type (stockées et ajoutées au bloc data FCM)
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
        retrait_id=retrait_id,
        contestation_id=contestation_id,
        donnees=donnees or {},
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

        fcm_message = construire_message(
            tokens, titre, message, type_notif,
            donnees_fcm(type_notif, notif.id, commande_id, menu_id, retrait_id, contestation_id, donnees),
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
