"""
Compte repas prépayé et caisse — SEULE source de vérité des règlements
des repas des employés.

Règles :
  - chaque employé a un compte repas ; le solde n'est jamais négatif et se
    reporte de mois en mois. Le solde (CompteRepas.solde) est le cache du
    grand livre MouvementCompte, toujours modifié sous verrou
    (select_for_update) : deux opérations simultanées ne peuvent pas
    dépenser deux fois le même argent ;
  - un repas facturable (facturation.py : commandé et non annulé) est payé
    UNE seule fois (ReglementRepas, unique par commande) :
      · compte  : au retrait (tous canaux : comptoir du prestataire,
                  gestionnaire, mobile), si le solde couvre le prix du repas
                  (tarif de la catégorie salarié à la date du menu, comme la
                  facturation) ; sinon le repas reste « non couvert » (pas de
                  débit partiel). À la clôture du mois, le solde restant est
                  d'abord utilisé pour TOUS les repas impayés du mois (retirés
                  non couverts et commandés non retirés), par date, repas
                  entiers seulement ;
      · caisse  : « Régulariser le mois » à la caisse (reçu) ;
      · retenue : à la clôture, si le solde n'a pas suffi, le reste est
                  retenu sur salaire ;
  - retrait annulé (gestionnaire, agent du comptoir dans les 2 minutes,
    contestation « erreur au comptoir ») : le repas débité est recrédité ;
  - repas annulé (commande annulée, contestation « erreur au comptoir ») :
    jamais facturé ; s'il avait été payé (compte ou caisse), le montant est
    crédité sur le compte repas ;
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
    RecuLigne, ReglementRepas,
)

ZERO = Decimal('0')
CENTIME = Decimal('0.01')
MONTANT_MAX = Decimal('1000000')

MODES_PAIEMENT = {'especes': 'Espèces', 'mobile_money': 'Mobile Money'}

# Statut d'un repas vu du compte repas (écrans employé et caisse)
STATUTS_REPAS = {
    'debite_compte': 'Débité du compte repas',
    'paye_caisse':   'Payé à la caisse',
    'retenue':       'Retenu sur salaire',
    'non_couvert':   'Non couvert — sera retenu sur salaire à la clôture',
    'a_venir':       'À venir',
}
STATUT_PAR_MODE = {'compte': 'debite_compte', 'caisse': 'paye_caisse', 'retenue': 'retenue'}


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
    tarif = tarif or fact.Tarificateur({commande.user_id})
    return tarif.prix(commande.user_id, commande.menu.date_menu)[1]


def debiter_si_possible(commande, par, montant=None, libelle=None, verifier_mois=True, tarif=None):
    """
    Débite le compte repas du prix du repas si le solde le couvre (jamais de
    débit partiel). Renvoie le ReglementRepas créé, sinon None (repas non
    couvert, déjà payé, sans tarif, sans compte ou mois clôturé).
    """
    if commande.statut not in fact.STATUTS_FACTURES:
        return None
    if ReglementRepas.objects.filter(commande_id=commande.pk).exists():
        return None
    if verifier_mois and not mois_ouvert(commande.menu.date_menu):
        return None
    if montant is None:
        montant = prix_repas(commande, tarif)
    if montant is None:
        return None
    with transaction.atomic():
        compte = compte_verrouille(commande.user_id, creer=False)
        if compte is None or compte.solde < montant:
            return None
        if ReglementRepas.objects.filter(commande_id=commande.pk).exists():
            return None
        mvt = _mouvement(compte, 'debit_repas', -montant, par, commande=commande,
                         libelle=libelle or f"Repas du {commande.menu.date_menu:%d/%m/%Y} — {commande.plat.nom}")
        return ReglementRepas.objects.create(commande=commande, mode='compte', montant=montant, mouvement=mvt)


def debiter_retrait(user_id, menu_id, par):
    """Au retrait : débite chaque repas retiré du menu si le solde le couvre."""
    commandes = list(Commande.objects.filter(user_id=user_id, menu_id=menu_id, statut='retiree')
                     .select_related('menu', 'plat').order_by('id'))
    if not commandes:
        return []
    tarif = fact.Tarificateur({user_id})
    return [r for r in (debiter_si_possible(c, par, tarif=tarif) for c in commandes) if r]


def liberer_reglement(commande, par, garder_caisse=False, raison=''):
    """
    Défait le règlement d'un repas (mois ouvert) :
      - débité du compte → recrédité ;
      - payé à la caisse → conservé si garder_caisse (retrait annulé : le
        repas reste dû et payé), sinon crédité sur le compte (repas annulé) ;
      - retenue (mois clôturé) → inchangé.
    """
    with transaction.atomic():
        reglement = (ReglementRepas.objects.select_for_update(of=('self',)).select_related('recu')
                     .filter(commande_id=commande.pk).first())
        if reglement is None or reglement.mode == 'retenue':
            return None
        if reglement.mode == 'caisse' and garder_caisse:
            return None
        jour = f"{commande.menu.date_menu:%d/%m/%Y}"
        if reglement.mode == 'compte':
            libelle = f"{raison or 'Retrait annulé'} — repas du {jour} recrédité"
        else:
            libelle = (f"{raison or 'Repas annulé'} — repas du {jour} payé à la caisse "
                       f"({reglement.recu.numero}), crédité sur le compte")
        montant = reglement.montant
        reglement.delete()
        compte = compte_verrouille(commande.user_id)
        return _mouvement(compte, 'recredit', montant, par, commande=commande,
                          recu=reglement.recu if reglement.mode == 'caisse' else None, libelle=libelle)


def liberer_commandes(commandes, par, garder_caisse=False, raison=''):
    for c in commandes:
        liberer_reglement(c, par, garder_caisse=garder_caisse, raison=raison)


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


def repas_regularisables(user, jusqu_au=None):
    """
    Repas non couverts que la caisse peut encaisser : facturables, sans
    règlement, d'un mois non clôturé, déjà consommés (retirés, ou commandés
    pour un jour passé). Liste de (commande, montant ou None si sans tarif).
    """
    aujourdhui = jusqu_au or timezone.localdate()
    clotures = set(ClotureMensuelle.objects.values_list('annee', 'mois'))
    commandes = [
        c for c in Commande.objects.filter(user=user, statut__in=fact.STATUTS_FACTURES,
                                           reglement__isnull=True, menu__date_menu__lte=aujourdhui)
        .select_related('menu__agence', 'plat').order_by('menu__date_menu', 'id')
        if (c.menu.date_menu.year, c.menu.date_menu.month) not in clotures
        and (c.statut == 'retiree' or c.menu.date_menu < aujourdhui)
    ]
    tarif = fact.Tarificateur({user.id})
    return [(c, tarif.prix(c.user_id, c.menu.date_menu)[1]) for c in commandes]


def regulariser(employe, par, commande_ids=None, montant_recu=None, monnaie='rendre',
                mode='especes', reference=''):
    """
    « Régulariser le mois » : paie à la caisse tout ou partie des repas non
    couverts des mois ouverts. commande_ids None : tous. La monnaie (montant
    reçu − total) est rendue ou créditée sur le compte (monnaie « crediter »).
    """
    verifier_employe(employe)
    mode, reference = verifier_mode(mode, reference)
    if monnaie not in ('rendre', 'crediter'):
        raise ValidationError({'monnaie': "Monnaie : « rendre » (rendue en espèces) ou « crediter » "
                                          "(créditée sur le compte repas)."})
    if commande_ids is not None:
        if not isinstance(commande_ids, (list, tuple)) or not commande_ids \
                or not all(isinstance(i, int) and not isinstance(i, bool) for i in commande_ids):
            raise ValidationError({'commande_ids': "Choisissez les repas à régulariser (liste d'identifiants)."})
        if len(set(commande_ids)) != len(commande_ids):
            raise ValidationError({'commande_ids': "Un repas est sélectionné deux fois."})

    with transaction.atomic():
        # Verrou des repas (ordre des id) : une clôture du mois, un retrait ou
        # une autre caisse ne peuvent pas les régler en même temps
        qs = Commande.objects.select_for_update().filter(user=employe)
        if commande_ids is not None:
            qs = qs.filter(pk__in=commande_ids)
        list(qs.order_by('id').values_list('id', flat=True))
        candidats = {c.id: (c, m) for c, m in repas_regularisables(employe)}
        if commande_ids is None:
            choisis = list(candidats.values())
        else:
            inconnus = [i for i in commande_ids if i not in candidats]
            if inconnus:
                raise ValidationError({'commande_ids': _motif_non_regularisable(employe, inconnus[0])})
            choisis = [candidats[i] for i in commande_ids]
        if not choisis:
            raise ValidationError("Aucun repas non couvert à régulariser pour cet employé.")
        sans_tarif = [c for c, m in choisis if m is None]
        if sans_tarif:
            c = sans_tarif[0]
            raise ValidationError(f"Le repas du {c.menu.date_menu:%d/%m/%Y} n'a pas de tarif (catégorie "
                                  "salarié ou tarif manquant) : à compléter avant de l'encaisser.")
        choisis.sort(key=lambda x: (x[0].menu.date_menu, x[0].id))
        total = sum((m for _, m in choisis), ZERO)
        recu_especes = total if montant_recu in (None, '') else lire_montant(montant_recu, 'montant_recu')
        if recu_especes < total:
            raise ValidationError({'montant_recu': f"Montant reçu insuffisant : {_fcfa(recu_especes)} pour "
                                                   f"{_fcfa(total)} de repas (paiement partiel : choisissez "
                                                   "moins de repas)."})
        rendu = recu_especes - total
        crediter = monnaie == 'crediter' and rendu > 0

        compte = compte_verrouille(employe.id, creer=crediter)
        avant = compte.solde if compte else ZERO
        recu = _creer_recu(type='regularisation', user=employe, caissier=par, mode=mode, reference=reference,
                           montant=total, montant_repas=total, montant_recu=recu_especes, monnaie=rendu,
                           monnaie_creditee=crediter, encaissement=total + (rendu if crediter else ZERO),
                           solde_avant=avant, solde_apres=avant + (rendu if crediter else ZERO))
        for c, m in choisis:
            RecuLigne.objects.create(recu=recu, commande=c, date_menu=c.menu.date_menu, plat_nom=c.plat.nom,
                                     montant=m)
            ReglementRepas.objects.create(commande=c, mode='caisse', montant=m, recu=recu)
        if crediter:
            _mouvement(compte, 'regularisation', rendu, par, recu=recu,
                       libelle=f"Monnaie de la régularisation {recu.numero} créditée")
    message = (f"{len(choisis)} repas réglé{'s' if len(choisis) > 1 else ''} à la caisse pour "
               f"{_fcfa(total)} (reçu {recu.numero}) : ils ne seront pas retenus sur salaire.")
    if crediter:
        message += f" Monnaie créditée sur votre compte repas : {_fcfa(rendu)}."
    notifier_employe(employe.id, '🧾 Repas régularisés', message, {'recu_id': recu.id})
    return recu


def _motif_non_regularisable(employe, commande_id):
    c = Commande.objects.filter(pk=commande_id).select_related('menu').first()
    if c is None or c.user_id != employe.id:
        return "Ce repas n'est pas une commande de cet employé."
    if c.statut not in fact.STATUTS_FACTURES:
        return f"Le repas du {c.menu.date_menu:%d/%m/%Y} est annulé : il n'est pas facturé."
    if not mois_ouvert(c.menu.date_menu):
        d = c.menu.date_menu
        return f"Le mois {d.month:02d}/{d.year} est clôturé : sa facturation est figée."
    r = ReglementRepas.objects.filter(commande=c).first()
    if r is not None:
        return f"Le repas du {c.menu.date_menu:%d/%m/%Y} est déjà réglé ({r.get_mode_display().lower()})."
    return f"Le repas du {c.menu.date_menu:%d/%m/%Y} n'est pas encore consommé : il ne peut pas être régularisé."


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
    Repas déjà payés (compte, caisse) : inchangés. Tous les autres (retirés
    non couverts et commandés non retirés), par date : débités du compte si
    le solde couvre le repas entier ; sinon retenue sur salaire.
    l['reglement'] est renseigné.
    """
    existants = {r.commande_id: r for r in ReglementRepas.objects.filter(
        commande_id__in=[l['commande_id'] for l in lignes])}
    for l in sorted(lignes, key=lambda l: (l['date_menu'], l['commande_id'])):
        r = existants.get(l['commande_id'])
        if r is None:
            etat = 'retiré' if l['statut'] == 'retiree' else 'non retiré'
            r = debiter_si_possible(
                l['commande'], par, montant=l['montant'], verifier_mois=False,
                libelle=f"Repas du {l['date_menu']:%d/%m/%Y} ({etat}) — débité à la clôture du mois")
        if r is None:
            r = ReglementRepas.objects.create(commande=l['commande'], mode='retenue', montant=l['montant'])
        l['reglement'] = r.mode
        l['montant'] = r.montant


# ══════════════════════════════════════════════════════════════
# Situation d'un employé (écran employé, fiche caisse)
# ══════════════════════════════════════════════════════════════

def statut_repas(ligne, aujourdhui):
    if ligne.get('reglement'):
        return STATUT_PAR_MODE[ligne['reglement']]
    if ligne['statut'] == 'retiree' or ligne['date_menu'] < aujourdhui:
        return 'non_couvert'
    return 'a_venir'


def situation(user, debut=None, fin=None, seulement_ouverts=False):
    """
    Compte repas et repas de la période (par défaut : mois en cours) :
    statut de chaque repas, totaux (consommé = compte + caisse + retenue +
    non couvert + à venir) et reste à payer prévu à la clôture (estimation :
    le solde actuel est appliqué d'abord aux repas non couverts, puis aux
    repas à venir, par date et par repas entier ; le reste serait retenu).
    seulement_ouverts : repas des mois non clôturés seulement (fiche caisse).
    """
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
    for l in lignes:
        st = statut_repas(l, aujourdhui)
        totaux[st]['nb'] += 1
        totaux[st]['montant'] += l['montant'] or ZERO
        repas.append({
            'commande_id': l['commande_id'],
            'date_menu': l['date_menu'].isoformat(),
            'plat': l['plat'],
            'agence_menu': l['agence_menu'],
            'statut_commande': l['statut'],
            'montant': _f(l['montant']),
            'sans_tarif': l['sans_tarif'],
            'statut': st,
            'statut_libelle': STATUTS_REPAS[st],
            'regularisable': st == 'non_couvert' and not l['sans_tarif'] and l['source'] == 'calcul',
        })

    # Estimation de la retenue à la clôture
    reste = ZERO
    disponible = solde_actuel
    impayes = [l for l in lignes if not l['reglement'] and l['montant'] is not None]
    impayes.sort(key=lambda l: (statut_repas(l, aujourdhui) != 'non_couvert', l['date_menu'], l['commande_id']))
    for l in impayes:
        if disponible >= l['montant']:
            disponible -= l['montant']
        else:
            reste += l['montant']

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
        'mention_reste': "Reste à payer — sera retenu sur salaire à la clôture du mois.",
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
