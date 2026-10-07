# signals.py — fichier complet (existant + notifications FCM)

from django.contrib.auth.signals import user_logged_in, user_logged_out
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)

# ══════════════════════════════════════════════════════════════
# SIGNAUX EXISTANTS — login / logout
# ══════════════════════════════════════════════════════════════

@receiver(user_logged_in)
def user_logged_in_handler(sender, request, user, **kwargs):
    user.last_login = timezone.now()
    user.save()

@receiver(user_logged_out)
def user_logged_out_handler(sender, request, user, **kwargs):
    if user:
        user.last_logout = timezone.now()
        user.save()

# ══════════════════════════════════════════════════════════════
# SIGNAUX FCM — notifications push
# ══════════════════════════════════════════════════════════════

@receiver(post_save, sender='api.Commande')
def notifier_commande(sender, instance, created, **kwargs):
    """
    Notifie l'agent quand sa commande est créée ou annulée.
    """
    try:
        from .fcm_service import envoyer_notification_user
        if created:
            envoyer_notification_user(
                user=instance.user,
                titre='✅ Commande confirmée',
                message=(
                    f'Votre commande de {instance.plat.nom} '
                    f'pour le {instance.menu.date_menu.strftime("%d/%m/%Y")} '
                    f'a bien été enregistrée.'
                ),
                type_notif='commande_passee',
                commande_id=instance.id,
                menu_id=instance.menu.id,
            )
        else:
            if instance.statut == 'annulee':
                envoyer_notification_user(
                    user=instance.user,
                    titre='❌ Commande annulée',
                    message=(
                        f'Votre commande de {instance.plat.nom} '
                        f'du {instance.menu.date_menu.strftime("%d/%m/%Y")} '
                        f'a été annulée.'
                    ),
                    type_notif='commande_annulee',
                    commande_id=instance.id,
                    menu_id=instance.menu.id,
                )
    except Exception as e:
        logger.error(f"❌ Signal commande notification : {e}")


@receiver(post_save, sender='api.Retrait')
def notifier_retrait(sender, instance, created, **kwargs):
    """
    Notifie l'agent quand son retrait est validé.
    """
    if not created:
        return
    try:
        from .fcm_service import envoyer_notification_user
        envoyer_notification_user(
            user=instance.user,
            titre='🍽️ Repas retiré',
            message=(
                f'Votre repas du {instance.menu.date_menu.strftime("%d/%m/%Y")} '
                f'a bien été retiré. Bon appétit !'
            ),
            type_notif='retrait_valide',
            menu_id=instance.menu.id,
        )
    except Exception as e:
        logger.error(f"❌ Signal retrait notification : {e}")


@receiver(post_save, sender='api.Menu')
def notifier_menu_disponible(sender, instance, created, **kwargs):
    """
    Notifie tous les agents de l'agence quand un nouveau menu est publié.
    """
    if not created:
        return
    try:
        from .fcm_service import envoyer_notification_groupe
        from .models import User, UserAgence
        from django.db.models import Q

        today = timezone.now()

        # Trouver tous les users actifs de cette agence
        user_ids = UserAgence.objects.filter(
            agence=instance.agence,
        ).filter(
            Q(date_fin__isnull=True) | Q(date_fin__gte=today)
        ).values_list('user_id', flat=True)

        users = User.objects.filter(id__in=user_ids, is_active=True)

        date_str = instance.date_menu.strftime('%A %d/%m/%Y')

        envoyer_notification_groupe(
            users=users,
            titre='🍽️ Nouveau menu disponible',
            message=f'Le menu du {date_str} est disponible. Commandez avant 48h !',
            type_notif='menu_disponible',
            menu_id=instance.id,
        )
    except Exception as e:
        logger.error(f"❌ Signal menu notification : {e}")
