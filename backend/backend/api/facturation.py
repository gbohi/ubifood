"""
Facturation des repas — SEULE source de vérité, côté employés et côté
prestataires.

Règle commune : chaque repas commandé et NON annulé (en attente ou retiré)
est facturé ; les tarifs appliqués sont ceux en vigueur à la DATE DU MENU.
  - Employé     : tarif de la catégorie salarié de l'agent (PlatCategoriesalarie).
  - Prestataire : le prestataire rattaché à l'agence du menu
                  (AgencePrestataire), à son tarif (PlatPrestataire).

Mois clôturés : les montants viennent des factures figées
(FactureMensuelle / LigneFacture, FacturePrestataire /
LigneFacturePrestataire) et ne bougent plus, même si un tarif, une
catégorie ou un rattachement d'agence est modifié ensuite.

Utilisé par :
  - GET  /facturation/                    (web « Facturation commandes », mobile « Ma facturation »)
  - GET  /facturation/prestataires/       (web « Facturation prestataire »)
  - POST /facturation/clotures/cloturer/  (création des factures mensuelles figées)
  - le tableau de bord cantine (blocs « facturation employé / fournisseur »)
"""

import calendar
from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import (
    AgencePrestataire, ClotureMensuelle, Commande, FactureMensuelle, FacturePrestataire,
    LigneFacture, LigneFacturePrestataire, PlatCategoriesalarie, PlatPrestataire,
    UserCategoriesalarie,
)

STATUTS_FACTURES = ('en_attente', 'retiree')
REGLE = "Repas commandés et non annulés, au tarif de la catégorie salarié en vigueur à la date du menu"


def _jour(dt):
    return timezone.localtime(dt).date() if timezone.is_aware(dt) else dt.date()


def ligne_active(lignes, d):
    """Ligne (date_debut / date_fin) couvrant la date d ; la plus récente si plusieurs."""
    meilleure = None
    for l in lignes:
        if _jour(l.date_debut) <= d and (l.date_fin is None or _jour(l.date_fin) >= d):
            if meilleure is None or l.date_debut > meilleure.date_debut:
                meilleure = l
    return meilleure


def bornes_mois(annee, mois):
    return date(annee, mois, 1), date(annee, mois, calendar.monthrange(annee, mois)[1])


class Tarificateur:
    """Charge catégories et tarifs une seule fois, puis calcule le prix d'un repas."""

    def __init__(self, user_ids):
        self.categories = defaultdict(list)
        for uc in UserCategoriesalarie.objects.filter(user_id__in=user_ids).select_related('categoriesalarie'):
            self.categories[uc.user_id].append(uc)
        self.tarifs = defaultdict(list)
        for pc in PlatCategoriesalarie.objects.all():
            self.tarifs[pc.categoriesalarie_id].append(pc)

    def prix(self, user_id, date_menu):
        """(catégorie libellé ou None, montant Decimal ou None si pas de tarif)."""
        uc = ligne_active(self.categories.get(user_id, []), date_menu)
        if not uc:
            return None, None
        pc = ligne_active(self.tarifs.get(uc.categoriesalarie_id, []), date_menu)
        return uc.categoriesalarie.libelle, (pc.montant if pc else None)


def lignes_facturation(commandes_qs):
    """
    Une ligne par commande facturable du queryset (annulées exclues).
    Montant figé si le mois est clôturé pour l'agent, calculé sinon.
    """
    commandes = list(
        commandes_qs.filter(statut__in=STATUTS_FACTURES)
        .select_related('user', 'plat', 'menu__agence', 'menu__typeequipe')
        .order_by('menu__date_menu', 'id')
    )
    if not commandes:
        return []

    figees = {
        l.commande_id: l for l in LigneFacture.objects.filter(
            commande_id__in=[c.id for c in commandes]).select_related('facture')
    }
    tarif = Tarificateur({c.user_id for c in commandes})

    lignes = []
    for c in commandes:
        figee = figees.get(c.id)
        if figee:
            categorie, montant, source = figee.categorie_libelle, figee.montant, 'facture'
        else:
            categorie, montant = tarif.prix(c.user_id, c.menu.date_menu)
            source = 'calcul'
        lignes.append({
            'commande': c,
            'commande_id': c.id,
            'user_id': c.user_id,
            'date_menu': c.menu.date_menu,
            'plat': c.plat.nom,
            'agence_menu': c.menu.agence.nom_agence if c.menu.agence else '',
            'equipe': c.menu.typeequipe.libelle if c.menu.typeequipe else '',
            'statut': c.statut,
            'categorie': categorie,
            'montant': montant,
            'sans_tarif': montant is None,
            'source': source,
        })
    return lignes


def synthese_par_employe(lignes):
    """Regroupe les lignes par agent : nombre de repas, total, état de la facture."""
    par_user = {}
    for l in lignes:
        u = l['commande'].user
        e = par_user.setdefault(u.id, {
            'user_id': u.id,
            'username': u.username,
            'nom_prenom': f"{u.nom or ''} {u.prenom or ''}".strip() or u.username,
            'categorie': None,
            'tarif_unitaire': None,
            'nb_repas': 0,
            'total': Decimal('0'),
            'repas_sans_tarif': 0,
            'statuts': {'en_attente': 0, 'retiree': 0},
            '_sources': set(),
            'lignes': [],
        })
        e['nb_repas'] += 1
        e['statuts'][l['statut']] += 1
        e['_sources'].add(l['source'])
        if l['sans_tarif']:
            e['repas_sans_tarif'] += 1
        else:
            e['total'] += l['montant']
            e['tarif_unitaire'] = l['montant']  # dernier tarif appliqué (lignes triées par date)
        if l['categorie']:
            e['categorie'] = l['categorie']
        e['lignes'].append(l)

    for e in par_user.values():
        sources = e.pop('_sources')
        e['etat'] = _etat(sources)
    return sorted(par_user.values(), key=lambda e: e['username'])


# ══════════════════════════════════════════════════════════════
# CÔTÉ PRESTATAIRES
# ══════════════════════════════════════════════════════════════

class TarificateurPrestataire:
    """Prestataire de l'agence du menu et son tarif, à la date du menu."""

    def __init__(self):
        self.rattachements = defaultdict(list)
        for ap in AgencePrestataire.objects.select_related('prestataire'):
            self.rattachements[ap.agence_id].append(ap)
        self.tarifs = defaultdict(list)
        for pp in PlatPrestataire.objects.all():
            self.tarifs[pp.prestataire_id].append(pp)

    def prix(self, agence_id, date_menu):
        """(prestataire ou None, montant Decimal ou None)."""
        ap = ligne_active(self.rattachements.get(agence_id, []), date_menu)
        if not ap:
            return None, None
        pp = ligne_active(self.tarifs.get(ap.prestataire_id, []), date_menu)
        return ap.prestataire, (pp.montant if pp else None)


def lignes_prestataires(commandes_qs):
    """
    Une ligne par commande facturable (annulées exclues) avec son prestataire.
    Valeurs figées si le mois est clôturé, calculées sinon.
    """
    commandes = list(
        commandes_qs.filter(statut__in=STATUTS_FACTURES)
        .select_related('user', 'plat', 'menu__agence', 'menu__typeequipe')
        .order_by('menu__date_menu', 'id')
    )
    if not commandes:
        return []

    figees = {
        l.commande_id: l for l in LigneFacturePrestataire.objects.filter(
            commande_id__in=[c.id for c in commandes]).select_related('facture__prestataire')
    }
    tarif = TarificateurPrestataire()

    lignes = []
    for c in commandes:
        figee = figees.get(c.id)
        if figee:
            prestataire, montant, source = figee.facture.prestataire, figee.montant, 'facture'
        else:
            prestataire, montant = tarif.prix(c.menu.agence_id, c.menu.date_menu)
            source = 'calcul'
        lignes.append({
            'commande': c,
            'commande_id': c.id,
            'user_id': c.user_id,
            'date_menu': c.menu.date_menu,
            'plat': c.plat.nom,
            'agence_menu': c.menu.agence.nom_agence if c.menu.agence else '',
            'equipe': c.menu.typeequipe.libelle if c.menu.typeequipe else '',
            'statut': c.statut,
            'prestataire': prestataire,
            'montant': montant,
            'sans_prestataire': prestataire is None,
            'sans_tarif': prestataire is not None and montant is None,
            'source': source,
        })
    return lignes


def _etat(sources):
    return ('cloturee' if sources == {'facture'}
            else 'provisoire' if sources == {'calcul'} else 'partielle')


def synthese_par_prestataire(lignes):
    """Regroupe par prestataire puis par agent (repas sans prestataire exclus)."""
    par_prest = {}
    for l in lignes:
        p = l['prestataire']
        if p is None:
            continue
        e = par_prest.setdefault(p.id, {
            'prestataire_id': p.id, 'prestataire': p.libelle,
            'nb_repas': 0, 'total': Decimal('0'), 'repas_sans_tarif': 0,
            '_sources': set(), 'agents': {},
        })
        e['nb_repas'] += 1
        e['_sources'].add(l['source'])
        if l['montant'] is None:
            e['repas_sans_tarif'] += 1
        else:
            e['total'] += l['montant']
        u = l['commande'].user
        a = e['agents'].setdefault(u.id, {
            'user_id': u.id, 'username': u.username,
            'nom_prenom': f"{u.nom or ''} {u.prenom or ''}".strip() or u.username,
            'agence_menu': l['agence_menu'], 'equipe': l['equipe'],
            'nb_repas': 0, 'total': Decimal('0'),
            'statuts': {'en_attente': 0, 'retiree': 0}, 'lignes': [],
        })
        a['nb_repas'] += 1
        a['statuts'][l['statut']] += 1
        if l['montant'] is not None:
            a['total'] += l['montant']
        a['lignes'].append(l)

    resultat = []
    for e in par_prest.values():
        e['etat'] = _etat(e.pop('_sources'))
        e['agents'] = sorted(e['agents'].values(), key=lambda a: a['username'])
        resultat.append(e)
    return sorted(resultat, key=lambda e: e['prestataire'])


def _anomalies_prestataires(lignes):
    return sorted({
        f"{l['agence_menu']} ({l['date_menu']:%d/%m/%Y}) : "
        + ("aucun prestataire rattaché à l'agence" if l['sans_prestataire']
           else f"pas de tarif pour le prestataire {l['prestataire'].libelle}")
        for l in lignes if l['sans_prestataire'] or l['sans_tarif']
    })


# ══════════════════════════════════════════════════════════════
# CLÔTURE MENSUELLE
# ══════════════════════════════════════════════════════════════

class ClotureImpossible(Exception):
    def __init__(self, message, details=None):
        super().__init__(message)
        self.details = details or []


def mois_cloture(annee, mois):
    return ClotureMensuelle.objects.filter(annee=annee, mois=mois).exists()


def cloturer_mois(annee, mois, par_user):
    """
    Fige la facturation d'un mois terminé : une ClotureMensuelle, puis
      - une FactureMensuelle par agent ayant au moins un repas facturable ;
      - une FacturePrestataire par prestataire ;
    chacune avec le détail de chaque repas.
    Refusé si le mois n'est pas terminé, déjà clôturé, ou si des repas
    n'ont pas de tarif employé, de prestataire ou de tarif prestataire
    (à corriger avant de clôturer).
    """
    debut, fin = bornes_mois(annee, mois)
    if fin >= timezone.localdate():
        raise ClotureImpossible(f"Le mois {mois:02d}/{annee} n'est pas terminé.")

    if mois_cloture(annee, mois):
        raise ClotureImpossible(f"Le mois {mois:02d}/{annee} est déjà clôturé.")

    commandes_mois = Commande.objects.filter(menu__date_menu__gte=debut, menu__date_menu__lte=fin)
    lignes = lignes_facturation(commandes_mois)
    lignes_prest = lignes_prestataires(commandes_mois)

    details = sorted({
        f"Employé {l['commande'].user.username} ({l['date_menu']:%d/%m/%Y}) : "
        + ("aucune catégorie salarié" if not l['categorie']
           else f"pas de tarif pour la catégorie {l['categorie']}")
        for l in lignes if l['sans_tarif']
    }) + [f"Prestataire — {d}" for d in _anomalies_prestataires(lignes_prest)]
    if details:
        raise ClotureImpossible(
            "Des repas n'ont pas de tarif : complétez les catégories, tarifs et "
            "prestataires des agences avant de clôturer.",
            details)

    employes = synthese_par_employe(lignes)
    prestataires = synthese_par_prestataire(lignes_prest)
    try:
        with transaction.atomic():
            # unique (annee, mois) : une clôture concurrente échoue ici
            cloture = ClotureMensuelle.objects.create(
                annee=annee, mois=mois, cloturee_par=par_user,
                nb_factures=len(employes),
                nb_repas=sum(e['nb_repas'] for e in employes),
                montant_total=sum((e['total'] for e in employes), Decimal('0')),
                nb_factures_prestataires=len(prestataires),
                montant_total_prestataires=sum((p['total'] for p in prestataires), Decimal('0')),
            )
            for rang, p in enumerate(prestataires, start=1):
                facture_p = FacturePrestataire.objects.create(
                    cloture=cloture, prestataire_id=p['prestataire_id'],
                    prestataire_libelle=p['prestataire'], annee=annee, mois=mois,
                    numero=f"FP-{annee}-{mois:02d}-{rang:03d}",
                    nb_repas=p['nb_repas'], montant_total=p['total'],
                )
                LigneFacturePrestataire.objects.bulk_create([
                    LigneFacturePrestataire(
                        facture=facture_p, commande=l['commande'], user_id=l['user_id'],
                        date_menu=l['date_menu'], plat_nom=l['plat'],
                        agence_nom=l['agence_menu'], montant=l['montant'],
                    ) for a in p['agents'] for l in a['lignes']
                ])
            for e in employes:
                facture = FactureMensuelle.objects.create(
                    cloture=cloture, user_id=e['user_id'], annee=annee, mois=mois,
                    categorie_libelle=e['categorie'] or '',
                    nb_repas=e['nb_repas'], montant_total=e['total'],
                )
                LigneFacture.objects.bulk_create([
                    LigneFacture(
                        facture=facture, commande=l['commande'], date_menu=l['date_menu'],
                        plat_nom=l['plat'], agence_nom=l['agence_menu'],
                        categorie_libelle=l['categorie'] or '', montant=l['montant'],
                    ) for l in e['lignes']
                ])
    except IntegrityError:
        raise ClotureImpossible(f"Le mois {mois:02d}/{annee} est déjà clôturé.")
    return cloture
