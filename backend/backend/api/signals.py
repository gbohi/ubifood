# signals.py — horodatage de déconnexion, notifications FCM, nettoyage des fichiers

import logging
import threading

from django.contrib.auth.signals import user_logged_out
from django.db import close_old_connections, transaction
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════
# DÉCONNEXION (admin Django)
# La date de dernière connexion est mise à jour par SimpleJWT
# (UPDATE_LAST_LOGIN) et la déconnexion API par /users/logout/.
# ══════════════════════════════════════════════════════════════

@receiver(user_logged_out)
def user_logged_out_handler(sender, request, user, **kwargs):
    if user:
        user.last_logout = timezone.now()
        user.save(update_fields=['last_logout'])


# ══════════════════════════════════════════════════════════════
# ENVOI EN ARRIÈRE-PLAN
# Les notifications partent après la validation de la transaction,
# dans un thread : la requête HTTP n'attend plus Firebase (avant, la
# création d'un menu notifiait chaque agent un par un, en bloquant).
# ══════════════════════════════════════════════════════════════

def _en_arriere_plan(fonction, *args, **kwargs):
    def executer():
        try:
            fonction(*args, **kwargs)
        except Exception:
            logger.exception("Envoi de notification en échec")
        finally:
            close_old_connections()

    def demarrer():
        threading.Thread(target=executer, daemon=True).start()

    transaction.on_commit(demarrer)


# ══════════════════════════════════════════════════════════════
# COMMANDES
# On ne notifie que lors d'un changement de statut : avant, chaque
# sauvegarde d'une commande annulée renvoyait « Commande annulée ».
# ══════════════════════════════════════════════════════════════

@receiver(pre_save, sender='api.Commande')
def memoriser_statut_commande(sender, instance, **kwargs):
    if instance.pk:
        instance._ancien_statut = (
            sender.objects.filter(pk=instance.pk).values_list('statut', flat=True).first()
        )
    else:
        instance._ancien_statut = None


def _notifier_commande(commande_id, statut):
    from .fcm_service import envoyer_notification_user
    from .models import Commande

    commande = Commande.objects.select_related('user', 'plat', 'menu').filter(pk=commande_id).first()
    if not commande:
        return
    date_str = commande.menu.date_menu.strftime("%d/%m/%Y")
    if statut == 'en_attente':
        envoyer_notification_user(
            user=commande.user,
            titre='✅ Commande confirmée',
            message=f'Votre commande de {commande.plat.nom} pour le {date_str} a bien été enregistrée.',
            type_notif='commande_passee',
            commande_id=commande.id,
            menu_id=commande.menu_id,
        )
    elif statut == 'annulee':
        envoyer_notification_user(
            user=commande.user,
            titre='❌ Commande annulée',
            message=f'Votre commande de {commande.plat.nom} du {date_str} a été annulée.',
            type_notif='commande_annulee',
            commande_id=commande.id,
            menu_id=commande.menu_id,
        )


@receiver(post_save, sender='api.Commande')
def notifier_commande(sender, instance, created, **kwargs):
    ancien = getattr(instance, '_ancien_statut', None)
    if created or ancien != instance.statut:
        if instance.statut in ('en_attente', 'annulee'):
            _en_arriere_plan(_notifier_commande, instance.pk, instance.statut)


# ══════════════════════════════════════════════════════════════
# RETRAITS
# ══════════════════════════════════════════════════════════════

def _notifier_retrait(retrait_id):
    from .fcm_service import envoyer_notification_user
    from .models import Retrait

    retrait = Retrait.objects.select_related('user', 'menu').filter(pk=retrait_id).first()
    if not retrait:
        return
    envoyer_notification_user(
        user=retrait.user,
        titre='🍽️ Repas retiré',
        message=f'Votre repas du {retrait.menu.date_menu.strftime("%d/%m/%Y")} a bien été retiré. Bon appétit !',
        type_notif='retrait_valide',
        menu_id=retrait.menu_id,
    )


@receiver(post_save, sender='api.Retrait')
def notifier_retrait(sender, instance, created, **kwargs):
    if created:
        _en_arriere_plan(_notifier_retrait, instance.pk)


# ══════════════════════════════════════════════════════════════
# MENUS — tous les agents actifs de l'agence
# ══════════════════════════════════════════════════════════════

JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']


def _notifier_menu(menu_id):
    from django.db.models import Q
    from .fcm_service import envoyer_notification_groupe
    from .models import Menu, User, UserAgence

    menu = Menu.objects.filter(pk=menu_id).first()
    if not menu:
        return

    maintenant = timezone.now()
    user_ids = UserAgence.objects.filter(
        agence_id=menu.agence_id,
    ).filter(
        Q(date_fin__isnull=True) | Q(date_fin__gte=maintenant)
    ).values_list('user_id', flat=True)

    users = User.objects.filter(id__in=user_ids, is_active=True)
    # strftime('%A') dépend de la locale du serveur (souvent anglaise)
    date_str = f"{JOURS[menu.date_menu.weekday()]} {menu.date_menu:%d/%m/%Y}"

    envoyer_notification_groupe(
        users=users,
        titre='🍽️ Nouveau menu disponible',
        message=f'Le menu du {date_str} est disponible. Commandez au plus tard 48h avant !',
        type_notif='menu_disponible',
        menu_id=menu.id,
    )


@receiver(post_save, sender='api.Menu')
def notifier_menu_disponible(sender, instance, created, **kwargs):
    if created:
        _en_arriere_plan(_notifier_menu, instance.pk)


# ══════════════════════════════════════════════════════════════
# FICHIERS — supprimés du disque avec leur ligne en base
# ══════════════════════════════════════════════════════════════

@receiver(post_delete, sender='api.PlatImage')
def supprimer_fichier_image(sender, instance, **kwargs):
    if instance.image:
        instance.image.delete(save=False)


@receiver(post_delete, sender='api.BesoinDocument')
def supprimer_fichier_document(sender, instance, **kwargs):
    if instance.document:
        instance.document.delete(save=False)
