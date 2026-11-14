# signals.py — horodatage de déconnexion, notifications FCM, nettoyage des fichiers

import logging
import threading

from django.contrib.auth.signals import user_logged_out
from django.db import close_old_connections, transaction
from django.db.models.signals import post_delete, post_save, pre_delete, pre_save
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
# Les notifications partent après la validation de la transaction
# (transaction.on_commit : rien n'est envoyé si elle est annulée) :
#   - serveur (gunicorn, runserver) : dans un thread, la requête HTTP
#     n'attend pas Firebase. Thread non « daemon » : à l'arrêt normal du
#     processus (redémarrage d'un worker), Python attend la fin des envois
#     en cours au lieu de les abandonner ;
#   - processus courts (commandes manage.py, scripts, tests) ou réglage
#     NOTIFICATIONS_SYNCHRONES : envoi synchrone, sinon le processus peut se
#     terminer avant le thread et la notification serait perdue.
# ══════════════════════════════════════════════════════════════

def envoi_synchrone():
    """Notifications envoyées dans le fil courant (voir NOTIFICATIONS_SYNCHRONES dans settings)."""
    from django.conf import settings
    return bool(getattr(settings, 'NOTIFICATIONS_SYNCHRONES', False))


def _en_arriere_plan(fonction, *args, **kwargs):
    def executer():
        try:
            fonction(*args, **kwargs)
        except Exception:
            logger.exception("Envoi de notification en échec")

    def executer_thread():
        try:
            executer()
        finally:
            close_old_connections()

    def demarrer():
        if envoi_synchrone():
            executer()
        else:
            threading.Thread(target=executer_thread, daemon=False).start()

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

    commande = Commande.objects.select_related('user', 'plat', 'menu', 'annulee_par').filter(pk=commande_id).first()
    if not commande:
        return
    date_str = commande.menu.date_menu.strftime("%d/%m/%Y")
    if statut == 'en_attente':
        # Suivi des repas : notification « Commande confirmée » désactivable
        from .suivi_repas import config
        if not config()['confirmee']['push']:
            return
        envoyer_notification_user(
            user=commande.user,
            titre='✅ Commande confirmée',
            message=f'Votre commande de {commande.plat.nom} pour le {date_str} a bien été enregistrée.',
            type_notif='commande_passee',
            commande_id=commande.id,
            menu_id=commande.menu_id,
        )
    elif statut == 'annulee':
        from .serializers import nom_complet
        par = ''
        if commande.annulee_par_id and commande.annulee_par_id != commande.user_id:
            par = f' par {nom_complet(commande.annulee_par)} (gestionnaire)'
        envoyer_notification_user(
            user=commande.user,
            titre='❌ Commande annulée',
            message=f'Votre commande de {commande.plat.nom} du {date_str} a été annulée{par}.',
            type_notif='commande_annulee',
            commande_id=commande.id,
            menu_id=commande.menu_id,
        )


@receiver(post_save, sender='api.Commande')
def notifier_commande(sender, instance, created, **kwargs):
    ancien = getattr(instance, '_ancien_statut', None)
    if getattr(instance, '_sans_notification', False):
        return  # notification dédiée envoyée par l'appelant (planning des équipes)
    if created or ancien != instance.statut:
        if instance.statut in ('en_attente', 'annulee'):
            _en_arriere_plan(_notifier_commande, instance.pk, instance.statut)


# ══════════════════════════════════════════════════════════════
# RETRAITS
# ══════════════════════════════════════════════════════════════

def _notifier_retrait(retrait_id):
    from .fcm_service import envoyer_notification_user
    from .models import Retrait

    from .models import Commande
    from .serializers import nom_complet

    retrait = (Retrait.objects.select_related('user', 'menu__agence', 'valide_par__prestataire')
               .filter(pk=retrait_id).first())
    if not retrait:
        return
    commande = (Commande.objects.filter(user=retrait.user, menu=retrait.menu,
                                        statut__in=('en_attente', 'retiree'))
                .select_related('plat').first())
    heure = timezone.localtime(retrait.date_retrait).strftime('%H:%M')
    plat = f' · {commande.plat.nom}' if commande else ''
    par = ''
    if retrait.valide_par_id:
        par = f', validé par {nom_complet(retrait.valide_par)}'
        if retrait.valide_par.prestataire_id:
            par += f' ({retrait.valide_par.prestataire.libelle})'
    # commande_id + retrait_id : l'application propose « Je n'ai pas retiré ce repas »
    envoyer_notification_user(
        user=retrait.user,
        titre=f'🍽️ Retrait validé{plat}',
        message=(f'Votre repas du {retrait.menu.date_menu.strftime("%d/%m/%Y")} a été remis à {heure} '
                 f'au comptoir de {retrait.menu.agence.nom_agence}{par}. '
                 "Ce n'est pas vous ? Signalez-le."),
        type_notif='retrait_valide',
        menu_id=retrait.menu_id,
        commande_id=commande.id if commande else None,
        retrait_id=retrait.id,
    )


def _notifier_retrait_annule(user_id, menu_id, par='le gestionnaire'):
    from .fcm_service import envoyer_notification_user
    from .models import Menu, User
    user = User.objects.filter(pk=user_id).first()
    menu = Menu.objects.filter(pk=menu_id).first()
    if not user or not menu:
        return
    envoyer_notification_user(
        user=user,
        titre='↩️ Retrait annulé',
        message=(f'Le retrait de votre repas du {menu.date_menu.strftime("%d/%m/%Y")} a été annulé '
                 f'par {par} : votre commande est de nouveau en attente.'),
        type_notif='retrait_annule',
        menu_id=menu.id,
    )


def notifier_retrait_annule(user_id, menu_id, par='le gestionnaire'):
    _en_arriere_plan(_notifier_retrait_annule, user_id, menu_id, par)


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

    from .serializers import date_limite_commande, libelle_date_limite
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
        message=(f'Le menu du {date_str} est disponible. Commandez au plus tard le '
                 f'{libelle_date_limite(date_limite_commande(menu.date_menu))}.'),
        type_notif='menu_disponible',
        menu_id=menu.id,
    )


@receiver(pre_save, sender='api.Menu')
def memoriser_publication_menu(sender, instance, **kwargs):
    instance._etait_publie = bool(instance.pk) and sender.objects.filter(
        pk=instance.pk, publie=True).exists()


@receiver(post_save, sender='api.Menu')
def notifier_menu_disponible(sender, instance, created, **kwargs):
    # Notification quand le menu devient visible des employés : à sa création
    # (publication automatique) ou à la publication d'un brouillon. Pas de
    # notification pour un menu déjà passé, ni quand on ré-affiche un menu masqué.
    visible = instance.publie and not instance.masque
    publication = created or not getattr(instance, '_etait_publie', True)
    if visible and publication and instance.date_menu >= timezone.localdate():
        _en_arriere_plan(_notifier_menu, instance.pk)


# ══════════════════════════════════════════════════════════════
# AGENCE FERMÉE AUX AUTRES AGENCES
# Commandes déjà passées maintenues ; les employés des autres agences qui y
# ont une commande à venir (non annulée, non retirée) sont prévenus.
# ══════════════════════════════════════════════════════════════

@receiver(pre_save, sender='api.Agence')
def memoriser_ouverture_agence(sender, instance, **kwargs):
    instance._etait_ouverte = bool(instance.pk) and sender.objects.filter(
        pk=instance.pk, accepter_autres_agences=True).exists()


def message_agence_fermee(agence):
    return (f"L'agence {agence.nom_agence} n'accepte plus les commandes des autres agences. "
            "Vos commandes déjà passées sont maintenues.")


def _notifier_agence_fermee(agence_id):
    from .fcm_service import envoyer_notification_user
    from .models import Agence, Commande, User
    from .parcours_commande import agences_origine
    agence = Agence.objects.filter(pk=agence_id).first()
    if agence is None:
        return
    user_ids = set(Commande.objects.filter(menu__agence_id=agence_id, statut='en_attente',
                                           menu__date_menu__gte=timezone.localdate())
                   .values_list('user_id', flat=True))
    origines = agences_origine(user_ids)
    concernes = [uid for uid in user_ids if getattr(origines.get(uid), 'id', None) != agence_id]
    for user in User.objects.filter(id__in=concernes, is_active=True):
        envoyer_notification_user(
            user=user, titre=f"🏢 {agence.nom_agence} : commandes des autres agences fermées",
            message=message_agence_fermee(agence), type_notif='agence_fermee',
            donnees={'agence_id': agence.id},
        )


@receiver(post_save, sender='api.Agence')
def notifier_agence_fermee(sender, instance, created, **kwargs):
    if not created and getattr(instance, '_etait_ouverte', False) and not instance.accepter_autres_agences:
        _en_arriere_plan(_notifier_agence_fermee, instance.pk)


# ══════════════════════════════════════════════════════════════
# ESPACE PRESTATAIRE — contestations, corrections d'UbiPharm
# ══════════════════════════════════════════════════════════════

def _gestionnaires_agence(agence_id):
    """Gestionnaires rattachés aujourd'hui à l'agence ; à défaut, les administrateurs."""
    from django.db.models import Q
    from .models import User
    maintenant = timezone.now()
    actifs = User.objects.filter(is_active=True)
    gest = actifs.filter(
        groups__name='gestionnaire',
        useragence__agence_id=agence_id, useragence__date_debut__lte=maintenant,
    ).filter(Q(useragence__date_fin__isnull=True) | Q(useragence__date_fin__gte=maintenant)).distinct()
    if gest.exists():
        return list(gest)
    return list(actifs.filter(Q(is_superuser=True) | Q(groups__name__in=['admin', 'super_admin'])).distinct())


def _notifier_contestation_nouvelle(contestation_id):
    from .fcm_service import envoyer_notification_user
    from .models import ContestationRetrait
    from .serializers import nom_complet
    c = (ContestationRetrait.objects.select_related('user', 'menu__agence', 'commande__plat')
         .filter(pk=contestation_id).first())
    if not c:
        return
    for gestionnaire in _gestionnaires_agence(c.menu.agence_id):
        envoyer_notification_user(
            user=gestionnaire,
            titre='⚠️ Retrait contesté',
            message=(f'{nom_complet(c.user)} ({c.menu.agence.nom_agence}) indique ne pas avoir retiré '
                     f'son repas du {c.menu.date_menu:%d/%m/%Y} ({c.commande.plat.nom}) : '
                     f'{c.get_motif_display()}.'),
            type_notif='contestation_nouvelle',
            commande_id=c.commande_id, menu_id=c.menu_id, retrait_id=c.retrait_id,
            contestation_id=c.id,
        )


def notifier_contestation_nouvelle(contestation_id):
    _en_arriere_plan(_notifier_contestation_nouvelle, contestation_id)


def message_contestation_decidee(c):
    """(titre, message, données) de la notification envoyée à l'employé."""
    date = f'{c.menu.date_menu:%d/%m/%Y}'
    if c.statut == 'acceptee':
        if c.cause == 'badge_tiers':
            titre = '✅ Contestation acceptée — repas dû'
            message = (f'Votre contestation du repas du {date} est acceptée : votre badge a été utilisé par '
                       'un tiers (badge prêté ou perdu). Le repas a bien été servi : il reste dû et vous '
                       'sera facturé. Pensez à signaler un badge perdu.')
        elif c.cause == 'erreur_comptoir':
            titre = '✅ Contestation acceptée — repas non facturé'
            message = (f'Votre contestation du repas du {date} est acceptée : le retrait résultait d\'une '
                       'erreur au comptoir. Le repas est annulé et ne vous sera pas facturé.')
        else:
            titre = '✅ Contestation acceptée'
            message = f'Votre contestation du repas du {date} est acceptée : le retrait est annulé.'
        if c.commentaire_traitement:
            message += f' {c.commentaire_traitement}'
    else:
        titre = '❌ Contestation rejetée'
        message = f'Votre contestation du repas du {date} est rejetée : {c.commentaire_traitement}'
    return titre, message, {'statut': c.statut, 'cause': c.cause or ''}


def _notifier_contestation_decidee(contestation_id):
    from .fcm_service import envoyer_notification_user
    from .models import ContestationRetrait
    c = ContestationRetrait.objects.select_related('user', 'menu').filter(pk=contestation_id).first()
    if not c:
        return
    titre, message, donnees = message_contestation_decidee(c)
    envoyer_notification_user(
        user=c.user, titre=titre, message=message, type_notif='contestation_decidee',
        commande_id=c.commande_id, menu_id=c.menu_id, contestation_id=c.id, donnees=donnees,
    )


def notifier_contestation_decidee(contestation_id):
    _en_arriere_plan(_notifier_contestation_decidee, contestation_id)


def _notifier_prestataire(prestataire_id, titre, message, type_notif, menu_id=None):
    """Responsables (rôle prestataire) actifs du prestataire."""
    from .fcm_service import envoyer_notification_user
    from .models import User
    for user in User.objects.filter(prestataire_id=prestataire_id, is_active=True,
                                    groups__name='prestataire').distinct():
        envoyer_notification_user(user=user, titre=titre, message=message,
                                  type_notif=type_notif, menu_id=menu_id)


def notifier_prestataire(prestataire_id, titre, message, type_notif, menu_id=None):
    if prestataire_id:
        _en_arriere_plan(_notifier_prestataire, prestataire_id, titre, message, type_notif, menu_id)


# ══════════════════════════════════════════════════════════════
# COMPTE REPAS — commande supprimée : son règlement (compte, caisse) est
# crédité sur le compte repas avant la suppression (mois ouvert)
# ══════════════════════════════════════════════════════════════

@receiver(pre_delete, sender='api.Commande')
def liberer_reglement_commande(sender, instance, **kwargs):
    from .comptes_repas import liberer_reglement
    from .models import ReglementRepas
    if ReglementRepas.objects.filter(commande_id=instance.pk).exclude(mode='retenue').exists():
        liberer_reglement(instance, None, raison='Commande supprimée')


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


@receiver(post_delete, sender='api.Banniere')
def supprimer_fichier_banniere(sender, instance, **kwargs):
    if instance.image:
        instance.image.delete(save=False)


# ══════════════════════════════════════════════════════════════
# TICKETS À GRATTER : un ticket par repas retiré (tickets.py)
# ══════════════════════════════════════════════════════════════

@receiver(post_save, sender='api.Retrait')
def ticket_apres_retrait(sender, instance, created, **kwargs):
    if created:
        from .tickets import creer_ticket_retrait
        rid = instance.pk
        transaction.on_commit(lambda: creer_ticket_retrait(rid))


@receiver(pre_delete, sender='api.Retrait')
def ticket_retrait_annule(sender, instance, **kwargs):
    from .tickets import supprimer_ticket_retrait
    supprimer_ticket_retrait(instance.pk)
