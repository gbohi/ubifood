"""
Compte repas prépayé et caisse — SEULE source de vérité des règlements
des repas des employés.

Règles :
  - chaque employé a un compte repas ; le solde n'est jamais négatif et se
    reporte de mois en mois. Le solde (CompteRepas.solde) est le cache du
    grand livre MouvementCompte, toujours modifié sous verrou
    (select_for_update) : deux opérations simultanées ne peuvent pas
    dépenser deux fois le même argent ;
  - l'employé CHOISIT le mode de paiement de chaque repas EN COMMANDANT
    (Commande.mode_paiement ; défaut : sa préférence User.mode_paiement_prefere,
    « compte » seulement si le solde couvre le repas) :
      · compte  : débité du compte À LA COMMANDE (ReglementRepas « compte »),
                  repas entier, au tarif de la catégorie salarié à la date du
                  menu (comme la facturation). Refusé (400 « Solde insuffisant »)
                  si le solde ne couvre pas le repas, ou sans tarif ;
      · retenue : retenu sur salaire à la clôture du mois ;
    modifiable jusqu'à la date limite de commande (compte → retenue :
    recrédité ; retenue → compte : débité si le solde suffit), figé ensuite ;
  - « commandé = dû » : un repas payé par le compte reste payé même s'il
    n'est pas retiré. Il n'est recrédité QUE si la commande est annulée
    (par l'employé dans le délai d'annulation, ou par un gestionnaire /
    administrateur) ou si une contestation est acceptée pour « erreur au
    comptoir ». Un retrait annulé (agent du comptoir dans les 2 minutes,
    gestionnaire) ne recrédite rien : la commande redevient « non retirée »,
    toujours due. Contestation « badge utilisé par un tiers » : reste payé ;
  - clôture du mois : les repas « compte » sont déjà réglés ; tous les autres
    (« retenue », et repas non couverts antérieurs au choix du mode) sont
    retenus sur salaire. Le solde n'est PAS utilisé automatiquement ;
  - caisse : recharge du compte (caissier) et remboursement du solde
    (comptabilité). La « régularisation » (paiement à la caisse des repas non
    couverts) n'existe plus : ses anciens reçus restent consultables et
    annulables (historique) ;
  - rien ne se paie ni ne se défait sur un mois clôturé.

Reçus (Recu) numérotés par année : REÇ-AAAA-NNNNNN (CompteurRecu, sous verrou).
Paiement : espèces seulement ; Mobile Money est prévu (champ mode,
référence) mais refusé tant que settings.CAISSE_MOBILE_MONEY_ACTIF est faux.
"""

from collections import defaultdict
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from . import facturation as fact
from .models import (
    ClotureCaisse, ClotureMensuelle, Commande, CompteRepas, CompteurRecu, MouvementCompte, Recu,
    ReglementRepas,
)

ZERO = Decimal('0')
CENTIME = Decimal('0.01')
MONTANT_MAX = Decimal('1000000')

MODES_PAIEMENT = {'especes': 'Espèces', 'mobile_money': 'Mobile Money'}

# Statut d'un repas vu du compte repas (écrans employé et caisse)
STATUTS_REPAS = {
    'debite_compte':  'Payé par le compte repas',
    'paye_caisse':    'Payé à la caisse',
    'retenue':        'Retenu sur salaire',
    'retenue_prevue': 'Retenue sur salaire — à la clôture du mois',
}
STATUT_PAR_MODE = {'compte': 'debite_compte', 'caisse': 'paye_caisse', 'retenue': 'retenue'}

# Mode de paiement choisi à la commande
# Modes que l'employé choisit (« offert » est fixé par le serveur selon l'équipe)
MODES_COMMANDE = {k: v for k, v in Commande.MODE_PAIEMENT_CHOICES if k != 'offert'}
MESSAGE_SANS_TARIF = ("Paiement par le compte repas impossible : aucun tarif n'est défini pour votre "
                      "catégorie à cette date (catégorie salarié ou tarif manquant). Choisissez la retenue "
                      "sur salaire ou contactez votre gestionnaire.")


def _f(montant):
    return float(montant) if montant is not None else None


def _nom(user):
    from .serializers import nom_complet
    return nom_complet(user)


def mobile_money_actif():
    return bool(getattr(settings, 'CAISSE_MOBILE_MONEY_ACTIF', False))


# ══════════════════════════════════════════════════════════════
# Contrôles des saisies
# ══════════════════════════════════════════════════════════════

def lire_montant(valeur, champ='montant', zero_permis=False):
    """Montant saisi (texte ou nombre) → Decimal à 2 décimales, > 0 (ou ≥ 0)."""
    try:
        montant = Decimal(str(valeur).replace(' ', '').replace(',', '.'))
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError({champ: "Montant invalide."})
    if not montant.is_finite() or montant != montant.quantize(CENTIME):
        raise ValidationError({champ: "Montant invalide (2 décimales au plus)."})
    if montant < 0 or (montant == 0 and not zero_permis):
        raise ValidationError({champ: "Le montant doit être supérieur à zéro."})
    if montant > MONTANT_MAX:
        raise ValidationError({champ: f"Montant trop élevé (maximum {int(MONTANT_MAX):,} F par opération)."
                                      .replace(',', ' ')})
    return montant.quantize(CENTIME)


def verifier_mode(mode, reference=''):
    """Mode de paiement : espèces ; Mobile Money refusé tant qu'il n'est pas activé."""
    mode = (mode or 'especes').strip()
    if mode not in MODES_PAIEMENT:
        raise ValidationError({'mode': "Mode de paiement invalide : « especes » ou « mobile_money »."})
    if mode == 'mobile_money' and not mobile_money_actif():
        raise ValidationError({'mode': "Le paiement par Mobile Money n'est pas encore disponible : "
                                       "encaissez en espèces."})
    reference = (reference or '').strip()
    if len(reference) > 100:
        raise ValidationError({'reference': "Référence trop longue (100 caractères au plus)."})
    return mode, reference


def verifier_employe(employe):
    from .permissions import is_compte_prestataire
    if employe is None or not employe.is_active:
        raise ValidationError("Employé introuvable ou compte désactivé.")
    if is_compte_prestataire(employe):
        raise ValidationError("Un compte prestataire n'a pas de compte repas.")


def mois_ouvert(d):
    return not ClotureMensuelle.objects.filter(annee=d.year, mois=d.month).exists()


# ══════════════════════════════════════════════════════════════
# Compte et grand livre
# ══════════════════════════════════════════════════════════════

def solde(user):
    return CompteRepas.objects.filter(user=user).values_list('solde', flat=True).first() or ZERO


def compte_verrouille(user_id, creer=True):
    """Compte repas de l'employé, verrouillé jusqu'à la fin de la transaction (None s'il n'existe pas)."""
    if creer:
        CompteRepas.objects.get_or_create(user_id=user_id)
    return CompteRepas.objects.select_for_update().filter(user_id=user_id).first()


def _mouvement(compte, type_mvt, montant, par, commande=None, recu=None, libelle=''):
    """Écrit un mouvement signé et met à jour le solde (compte déjà verrouillé)."""
    nouveau = compte.solde + montant
    if nouveau < 0:
        # Garde-fou : les appelants vérifient le solde avant
        raise ValidationError("Solde du compte repas insuffisant.")
    compte.solde = nouveau
    compte.save(update_fields=['solde', 'updated_at'])
    return MouvementCompte.objects.create(
        compte=compte, type=type_mvt, montant=montant, solde_apres=nouveau, commande=commande,
        recu=recu, libelle=libelle[:255], created_by=par)


def prix_repas(commande, tarif=None):
    """Prix employé du repas (tarif de la catégorie à la date du menu), None sans tarif."""
    if commande.mode_paiement == 'offert':
        return ZERO
    tarif = tarif or fact.Tarificateur({commande.user_id})
    return tarif.prix(commande.user_id, commande.menu.date_menu, commande.plat.type_plat_id)[1]


def _libelle_repas(commande):
    return f"Repas du {commande.menu.date_menu:%d/%m/%Y} — {commande.plat.nom}"


def message_solde_insuffisant(disponible, necessaire):
    return (f"Solde insuffisant : {_fcfa(disponible)} disponibles, {_fcfa(necessaire)} nécessaires — "
            "rechargez à la caisse")


def info_paiement(user, date_menu, type_plat_id=None, offert=False):
    """
    Ce que l'écran de commande doit proposer pour un repas du date_menu :
    solde, prix du repas pour l'employé (selon le type de plat), compte possible
    ou non (et pourquoi), préférence et mode proposé par défaut. `offert` :
    équipe « repas offert », rien à payer.
    """
    disponible = solde(user)
    if offert:
        return {'solde': _f(disponible), 'prix': _f(ZERO), 'sans_tarif': False, 'offert': True,
                'compte_possible': False, 'raison_compte_impossible': None,
                'mode_paiement_prefere': user.mode_paiement_prefere, 'mode_par_defaut': 'offert',
                'modes': [{'code': 'offert', 'libelle': 'Repas offert'}]}
    prix = fact.Tarificateur({user.id}).prix(user.id, date_menu, type_plat_id)[1]
    if prix is None:
        possible, raison = False, MESSAGE_SANS_TARIF
    elif disponible < prix:
        possible, raison = False, message_solde_insuffisant(disponible, prix)
    else:
        possible, raison = True, None
    prefere = user.mode_paiement_prefere
    return {
        'solde': _f(disponible),
        'prix': _f(prix),
        'sans_tarif': prix is None,
        'compte_possible': possible,
        'raison_compte_impossible': raison,
        'mode_paiement_prefere': prefere,
        'mode_par_defaut': 'compte' if prefere == 'compte' and possible else 'retenue',
        'modes': [{'code': c, 'libelle': l} for c, l in MODES_COMMANDE.items()],
        'offert': False,
    }


def lire_mode_commande(valeur):
    """Mode demandé par le client : None (non précisé), « compte » ou « retenue »."""
    if valeur in (None, ''):
        return None
    if valeur not in MODES_COMMANDE:
        raise ValidationError({'mode_paiement': "Mode de paiement invalide : « compte » (compte repas) ou "
                                                "« retenue » (retenue sur salaire)."})
    return valeur


def debiter_commande(commande, par, montant=None, libelle=None):
    """
    Débite le compte repas du prix du repas (repas entier, compte verrouillé).
    Lève une erreur 400 si le repas n'a pas de tarif ou si le solde ne le
    couvre pas. Renvoie le ReglementRepas « compte ».
    """
    if montant is None:
        montant = prix_repas(commande)
    if montant is None:
        raise ValidationError({'detail': MESSAGE_SANS_TARIF, 'code': 'sans_tarif'})
    with transaction.atomic():
        compte = compte_verrouille(commande.user_id, creer=False)
        disponible = compte.solde if compte else ZERO
        if compte is None or disponible < montant:
            raise ValidationError({'detail': message_solde_insuffisant(disponible, montant),
                                   'code': 'solde_insuffisant'})
        if ReglementRepas.objects.filter(commande_id=commande.pk).exists():
            raise ValidationError("Ce repas est déjà réglé.")
        mvt = _mouvement(compte, 'debit_repas', -montant, par, commande=commande,
                         libelle=libelle or f"{_libelle_repas(commande)} (commande)")
        return ReglementRepas.objects.create(commande=commande, mode='compte', montant=montant, mouvement=mvt)


def payer_a_la_commande(commande, mode_demande, par):
    """
    À la commande (création ou commande annulée reprise), dans la transaction
    de la commande : applique le mode demandé, ou, à défaut, la préférence de
    l'employé (« compte » si le solde couvre le repas, sinon retenue).
    Mode « compte » demandé explicitement et impossible : erreur 400 (la
    commande n'est pas créée). Renvoie le mode retenu.
    """
    user = commande.user
    if commande.menu.typeequipe_id and commande.menu.typeequipe.repas_offert:
        # Équipe « repas offert » : rien à payer, quel que soit le mode demandé
        mode = 'offert'
    elif mode_demande is None:
        mode = 'retenue'
        if user.mode_paiement_prefere == 'compte':
            prix = prix_repas(commande)
            if prix is not None and solde(user) >= prix:
                mode = 'compte'
    else:
        mode = mode_demande
    if mode == 'compte':
        debiter_commande(commande, par)
    if commande.mode_paiement != mode:
        commande.mode_paiement = mode
        commande.save(update_fields=['mode_paiement'])
    return mode


def mode_modifiable(commande, maintenant=None, limite=None):
    """(modifiable, motif) : changement du mode jusqu'à la date limite de commande."""
    from .serializers import date_limite_commande, libelle_date_limite
    if commande.statut != 'en_attente':
        return False, "Seule une commande en attente peut changer de mode de paiement."
    if commande.mode_paiement == 'offert':
        return False, "Repas offert : rien à payer."
    if not mois_ouvert(commande.menu.date_menu):
        d = commande.menu.date_menu
        return False, f"Le mois {d.month:02d}/{d.year} est clôturé : sa facturation est figée."
    limite = limite or date_limite_commande(commande.menu.date_menu)
    if (maintenant or timezone.now()) > limite:
        return False, ("Le mode de paiement ne peut plus être changé : les commandes pour ce menu étaient "
                       f"ouvertes jusqu'au {libelle_date_limite(limite)}.")
    return True, None


def changer_mode(commande, mode, par):
    """
    Change le mode de paiement d'une commande en attente, jusqu'à la date
    limite de commande : retenue → compte (débit, solde suffisant exigé),
    compte → retenue (recrédit). Renvoie la commande à jour.
    """
    mode = lire_mode_commande(mode)
    if mode is None:
        raise ValidationError({'mode_paiement': "Choisissez le mode de paiement : « compte » ou « retenue »."})
    with transaction.atomic():
        commande = (Commande.objects.select_for_update().select_related('user', 'menu', 'plat')
                    .get(pk=commande.pk))
        ok, motif = mode_modifiable(commande)
        if not ok:
            raise ValidationError({'detail': motif, 'code': 'mode_verrouille'})
        reglement = ReglementRepas.objects.filter(commande_id=commande.pk).first()
        if reglement is not None and reglement.mode != 'compte':
            raise ValidationError(f"Ce repas est déjà réglé ({reglement.get_mode_display().lower()}).")
        if mode == commande.mode_paiement and (mode == 'retenue' or reglement is not None):
            return commande
        if mode == 'compte':
            debiter_commande(commande, par, libelle=f"{_libelle_repas(commande)} (passage au compte repas)")
        else:
            liberer_reglement(commande, par, raison='Passage en retenue sur salaire')
        commande.mode_paiement = mode
        commande.user_updated = par
        commande.save(update_fields=['mode_paiement', 'user_updated', 'updated_at'])
    return commande


def liberer_reglement(commande, par, raison=''):
    """
    Défait le règlement d'un repas (mois ouvert) — commande annulée,
    contestation « erreur au comptoir », passage en retenue :
      - débité du compte → recrédité ;
      - payé à la caisse (historique) → crédité sur le compte ;
      - retenue (mois clôturé) → inchangé.
    N'est PAS appelé à l'annulation d'un retrait (le repas reste dû).
    """
    with transaction.atomic():
        reglement = (ReglementRepas.objects.select_for_update(of=('self',)).select_related('recu')
                     .filter(commande_id=commande.pk).first())
        if reglement is None or reglement.mode == 'retenue':
            return None
        jour = f"{commande.menu.date_menu:%d/%m/%Y}"
        if reglement.mode == 'compte':
            libelle = f"{raison or 'Repas annulé'} — repas du {jour} recrédité"
        else:
            libelle = (f"{raison or 'Repas annulé'} — repas du {jour} payé à la caisse "
                       f"({reglement.recu.numero}), crédité sur le compte")
        montant = reglement.montant
        reglement.delete()
        compte = compte_verrouille(commande.user_id)
        return _mouvement(compte, 'recredit', montant, par, commande=commande,
                          recu=reglement.recu if reglement.mode == 'caisse' else None, libelle=libelle)


# ══════════════════════════════════════════════════════════════
# Reçus
# ══════════════════════════════════════════════════════════════

def numero_recu(annee, rang):
    return f"REÇ-{annee}-{rang:06d}"


def _nouveau_numero(annee):
    """Rang suivant de l'année, sous verrou (deux caisses simultanées : pas de doublon)."""
    CompteurRecu.objects.get_or_create(annee=annee)
    compteur = CompteurRecu.objects.select_for_update().get(annee=annee)
    compteur.dernier += 1
    compteur.save(update_fields=['dernier'])
    return numero_recu(annee, compteur.dernier)


def _creer_recu(**champs):
    maintenant = timezone.now()
    annee = timezone.localtime(maintenant).year
    return Recu.objects.create(numero=_nouveau_numero(annee), annee=annee, created_at=maintenant, **champs)


def notifier_employe(user_id, titre, message, donnees=None):
    from .signals import _en_arriere_plan

    def envoyer():
        from .fcm_service import envoyer_notification_user
        from .models import User
        user = User.objects.filter(pk=user_id).first()
        if user:
            envoyer_notification_user(user=user, titre=titre, message=message, type_notif='compte_repas',
                                      donnees=donnees or {})
    _en_arriere_plan(envoyer)


def _fcfa(m):
    from .pdf_factures import fcfa
    return f"{fcfa(m)} F"


def recharger(employe, montant, par, mode='especes', reference=''):
    """« Recharger le compte » : crédite le compte repas (reçu de recharge)."""
    verifier_employe(employe)
    montant = lire_montant(montant)
    mode, reference = verifier_mode(mode, reference)
    with transaction.atomic():
        compte = compte_verrouille(employe.id)
        avant = compte.solde
        recu = _creer_recu(type='recharge', user=employe, caissier=par, mode=mode, reference=reference,
                           montant=montant, montant_recu=montant, encaissement=montant,
                           solde_avant=avant, solde_apres=avant + montant)
        _mouvement(compte, 'recharge', montant, par, recu=recu, libelle=f"Recharge {recu.numero}")
    notifier_employe(employe.id, '💳 Compte repas rechargé',
                     f"Votre compte repas a été crédité de {_fcfa(montant)} (reçu {recu.numero}). "
                     f"Nouveau solde : {_fcfa(recu.solde_apres)}.", {'recu_id': recu.id})
    return recu


def rembourser(employe, par, motif, mode='especes', reference=''):
    """Remboursement du solde (départ de l'employé) : comptabilité, solde → 0."""
    verifier_employe_rembourse(employe)
    motif = (motif or '').strip()
    if not motif:
        raise ValidationError({'motif': "Le motif du remboursement est obligatoire."})
    mode, reference = verifier_mode(mode, reference)
    with transaction.atomic():
        compte = compte_verrouille(employe.id, creer=False)
        if compte is None or compte.solde <= 0:
            raise ValidationError(f"Le compte repas de {_nom(employe)} est à zéro : rien à rembourser.")
        montant = compte.solde
        recu = _creer_recu(type='remboursement', user=employe, caissier=par, mode=mode, reference=reference,
                           montant=montant, encaissement=-montant, solde_avant=montant, solde_apres=ZERO,
                           motif=motif[:500])
        _mouvement(compte, 'remboursement', -montant, par, recu=recu, libelle=f"Remboursement {recu.numero}")
    notifier_employe(employe.id, '💵 Compte repas remboursé',
                     f"Le solde de votre compte repas ({_fcfa(montant)}) vous a été remboursé "
                     f"(reçu {recu.numero}).", {'recu_id': recu.id})
    return recu


def verifier_employe_rembourse(employe):
    # Un employé désactivé (départ) peut être remboursé
    from .permissions import is_compte_prestataire
    if employe is None or is_compte_prestataire(employe):
        raise ValidationError("Employé introuvable.")


def annuler_recu(recu, par, motif):
    """
    Annulation d'un reçu (comptabilité, motif obligatoire) : ses effets sont
    défaits. Refusée pour ses propres opérations, pour un reçu d'une clôture
    de caisse soumise ou validée, pour des repas d'un mois clôturé, et si le
    solde deviendrait négatif (crédit déjà dépensé).
    """
    motif = (motif or '').strip()
    if not motif:
        raise ValidationError({'motif': "Le motif de l'annulation est obligatoire."})
    with transaction.atomic():
        recu = (Recu.objects.select_for_update(of=('self',)).select_related('cloture_caisse', 'user')
                .get(pk=recu.pk))
        if recu.statut == 'annule':
            raise ValidationError(f"Le reçu {recu.numero} est déjà annulé.")
        if recu.caissier_id == par.id:
            raise PermissionDenied("Vous ne pouvez pas annuler une opération que vous avez vous-même "
                                   "enregistrée : demandez à un autre membre de la comptabilité.")
        if recu.cloture_caisse_id and recu.cloture_caisse.statut in ('soumise', 'validee'):
            raise ValidationError(
                f"Le reçu {recu.numero} fait partie d'une clôture de caisse "
                f"{'validée' if recu.cloture_caisse.statut == 'validee' else 'soumise'} : il ne peut plus "
                "être annulé" + (" (rejetez d'abord la clôture)." if recu.cloture_caisse.statut == 'soumise'
                                 else "."))
        libelle = f"Annulation du reçu {recu.numero}"
        if recu.type == 'recharge':
            a_debiter = recu.montant
        elif recu.type == 'remboursement':
            a_debiter = -recu.montant
        else:
            a_debiter = recu.monnaie if recu.monnaie_creditee else ZERO
            lignes = list(recu.lignes.select_related('commande__menu'))
            ids = [l.commande_id for l in lignes if l.commande_id]
            list(Commande.objects.select_for_update().filter(pk__in=ids).order_by('id').values_list('id', flat=True))
            reglements = {r.commande_id: r for r in ReglementRepas.objects.select_for_update()
                          .filter(recu=recu, mode='caisse')}
            for l in lignes:
                if not mois_ouvert(l.date_menu):
                    raise ValidationError(
                        f"Le mois {l.date_menu.month:02d}/{l.date_menu.year} est clôturé : les repas de ce reçu "
                        "ne peuvent plus être défaits.")
                if l.commande_id not in reglements:
                    # Repas annulé depuis : son montant a été crédité sur le compte
                    a_debiter += l.montant
        compte = compte_verrouille(recu.user_id, creer=a_debiter < 0)
        disponible = compte.solde if compte else ZERO
        if a_debiter > disponible:
            raise ValidationError(
                f"Annulation impossible : le compte repas de {_nom(recu.user)} n'a plus que "
                f"{_fcfa(disponible)} alors qu'il faudrait en retirer {_fcfa(a_debiter)} (le crédit a déjà "
                "été utilisé).")
        if recu.type == 'regularisation':
            ReglementRepas.objects.filter(recu=recu, mode='caisse').delete()
        if a_debiter:
            _mouvement(compte, 'annulation', -a_debiter, par, recu=recu, libelle=libelle)
        recu.statut = 'annule'
        recu.annule_par = par
        recu.annule_le = timezone.now()
        recu.motif_annulation = motif[:500]
        recu.save(update_fields=['statut', 'annule_par', 'annule_le', 'motif_annulation'])
    notifier_employe(recu.user_id, '↩️ Reçu annulé',
                     f"Le reçu {recu.numero} ({recu.get_type_display().lower()}, {_fcfa(recu.montant)}) a été "
                     f"annulé par la comptabilité : {recu.motif_annulation}", {'recu_id': recu.id})
    return recu


# ══════════════════════════════════════════════════════════════
# Clôture de caisse (journalière)
# ══════════════════════════════════════════════════════════════

TYPES_CAISSE = ('recharge', 'regularisation')


def recus_a_cloturer(caissier):
    """Reçus du caissier pas encore dans une clôture (remboursements : hors caisse)."""
    return (Recu.objects.filter(caissier=caissier, cloture_caisse__isnull=True, type__in=TYPES_CAISSE)
            .select_related('user').order_by('created_at', 'id'))


def theorique(recus):
    """Espèces attendues : encaissements en espèces des reçus valides."""
    return sum((r.encaissement for r in recus if r.statut == 'valide' and r.mode == 'especes'), ZERO)


def soumettre_cloture(caissier, montant_compte, motif_ecart=''):
    montant_compte = lire_montant(montant_compte, 'montant_compte', zero_permis=True)
    motif_ecart = (motif_ecart or '').strip()
    with transaction.atomic():
        # Verrou des reçus : un reçu émis pendant la soumission entre dans la clôture suivante
        recus = list(recus_a_cloturer(caissier).select_for_update(of=('self',)))
        if not recus:
            raise ValidationError("Aucune opération à clôturer depuis votre dernière clôture de caisse.")
        attendu = theorique(recus)
        ecart = montant_compte - attendu
        if ecart != 0 and not motif_ecart:
            raise ValidationError({'motif_ecart': f"Écart de {_fcfa(ecart)} entre le montant compté et le "
                                                  "théorique : le motif est obligatoire."})
        cloture = ClotureCaisse.objects.create(
            caissier=caissier, jour=timezone.localdate(), debut=recus[0].created_at, nb_recus=len(recus),
            montant_theorique=attendu, montant_compte=montant_compte, ecart=ecart, motif_ecart=motif_ecart[:500])
        Recu.objects.filter(pk__in=[r.pk for r in recus]).update(cloture_caisse=cloture)
    return cloture


def traiter_cloture(cloture, par, valider, commentaire=''):
    commentaire = (commentaire or '').strip()
    with transaction.atomic():
        cloture = ClotureCaisse.objects.select_for_update().get(pk=cloture.pk)
        if cloture.statut != 'soumise':
            raise ValidationError("Cette clôture de caisse a déjà été traitée.")
        if cloture.caissier_id == par.id:
            raise PermissionDenied("Vous ne pouvez pas valider ou rejeter votre propre clôture de caisse.")
        if not valider and not commentaire:
            raise ValidationError({'commentaire': "Le commentaire est obligatoire pour rejeter une clôture."})
        cloture.statut = 'validee' if valider else 'rejetee'
        cloture.traitee_par = par
        cloture.traitee_le = timezone.now()
        cloture.commentaire = commentaire[:500]
        cloture.save()
        if not valider:
            # Reçus libérés : le caissier recompte et soumet une nouvelle clôture
            cloture.recus.update(cloture_caisse=None)
    return cloture


# ══════════════════════════════════════════════════════════════
# Clôture mensuelle de la facturation
# ══════════════════════════════════════════════════════════════

def regler_a_la_cloture(lignes, par):
    """
    Appelé par facturation.cloturer_mois (transaction, repas du mois
    verrouillés) : chaque repas facturable reçoit son règlement définitif.
    Repas déjà payés (compte à la commande, caisse — historique) : inchangés.
    Tous les autres (mode « retenue », et repas non couverts antérieurs au
    choix du mode) : retenue sur salaire. Le solde du compte n'est pas
    utilisé automatiquement (choix de l'employé respecté).
    l['reglement'] est renseigné.
    """
    existants = {r.commande_id: r for r in ReglementRepas.objects.filter(
        commande_id__in=[l['commande_id'] for l in lignes])}
    for l in sorted(lignes, key=lambda l: (l['date_menu'], l['commande_id'])):
        r = existants.get(l['commande_id'])
        if r is None:
            r = ReglementRepas.objects.create(commande=l['commande'], mode='retenue', montant=l['montant'])
        l['reglement'] = r.mode
        l['montant'] = r.montant


# ══════════════════════════════════════════════════════════════
# Situation d'un employé (écran employé, fiche caisse)
# ══════════════════════════════════════════════════════════════

def statut_repas(ligne):
    """Réglé (compte, caisse, retenue figée) ou retenue prévue à la clôture."""
    if ligne.get('reglement'):
        return STATUT_PAR_MODE[ligne['reglement']]
    return 'retenue_prevue'


def situation(user, debut=None, fin=None, seulement_ouverts=False):
    """
    Compte repas et repas de la période (par défaut : mois en cours) :
    mode de paiement et statut de chaque repas, totaux (consommé = compte +
    caisse + retenue + retenue prévue) et reste à payer prévu à la clôture
    (= repas en retenue sur salaire non encore réglés, y compris les repas
    non couverts antérieurs au choix du mode).
    seulement_ouverts : repas des mois non clôturés seulement (fiche caisse).
    """
    from .serializers import date_limite_commande
    aujourdhui = timezone.localdate()
    if debut is None:
        debut, fin = fact.bornes_mois(aujourdhui.year, aujourdhui.month)
    qs = Commande.objects.filter(user=user, menu__date_menu__gte=debut, menu__date_menu__lte=fin)
    lignes = fact.lignes_facturation(qs)
    if seulement_ouverts:
        clotures = set(ClotureMensuelle.objects.values_list('annee', 'mois'))
        lignes = [l for l in lignes if (l['date_menu'].year, l['date_menu'].month) not in clotures]
    compte = CompteRepas.objects.filter(user=user).first()
    solde_actuel = compte.solde if compte else ZERO

    totaux = {k: {'nb': 0, 'montant': ZERO} for k in STATUTS_REPAS}
    repas = []
    maintenant = timezone.now()
    from .models import ParametresSociete
    parametres = ParametresSociete.charger()
    for l in lignes:
        st = statut_repas(l)
        totaux[st]['nb'] += 1
        totaux[st]['montant'] += l['montant'] or ZERO
        c = l['commande']
        modifiable = (l['source'] == 'calcul' and l['reglement'] in (None, 'compte')
                      and mode_modifiable(c, maintenant, date_limite_commande(c.menu.date_menu, parametres))[0])
        repas.append({
            'commande_id': l['commande_id'],
            'date_menu': l['date_menu'].isoformat(),
            'plat': l['plat'],
            'agence_menu': l['agence_menu'],
            'statut_commande': l['statut'],
            'montant': _f(l['montant']),
            'sans_tarif': l['sans_tarif'],
            'mode_paiement': l['mode_paiement'],
            'mode_paiement_libelle': MODES_COMMANDE.get(l['mode_paiement'], ''),
            'mode_modifiable': modifiable,
            'statut': st,
            'statut_libelle': STATUTS_REPAS[st],
        })

    reste = totaux['retenue_prevue']['montant']
    consomme = sum((l['montant'] or ZERO for l in lignes), ZERO)
    return {
        'solde': _f(solde_actuel),
        'date_debut': debut.isoformat(),
        'date_fin': fin.isoformat(),
        'repas': repas,
        'totaux': {
            'consomme': {'nb': len(lignes), 'montant': _f(consomme)},
            **{k: {'nb': v['nb'], 'montant': _f(v['montant']), 'libelle': STATUTS_REPAS[k]}
               for k, v in totaux.items()},
        },
        'reste_a_payer_prevu': _f(reste),
        'mention_reste': "Reste à payer : repas en retenue sur salaire, retenus à la clôture du mois.",
    }


def synthese_reglements(lignes):
    """Par mode de règlement : nombre de repas et montant (repas sans tarif exclus du montant)."""
    s = defaultdict(lambda: {'nb': 0, 'montant': ZERO})
    for l in lignes:
        mode = l.get('reglement') or 'retenue'
        s[mode]['nb'] += 1
        s[mode]['montant'] += l['montant'] or ZERO
    return {m: s[m] for m in ('compte', 'caisse', 'retenue')}


def total_mouvements(compte):
    """Somme du grand livre (contrôle : égale au solde du compte)."""
    return compte.mouvements.aggregate(t=Sum('montant'))['t'] or ZERO
