"""
Relevés de facturation (données) : relevé de prestations d'un prestataire
et relevé des repas des agents (retenues sur salaire).

Aucune règle de calcul ici : les lignes viennent de facturation.py
(lignes_prestataires / lignes_facturation), seule source de vérité, avec
les valeurs figées pour les mois clôturés. Ce module ne fait que les
regrouper (par plat, par jour, par agence, par agent) pour l'écran
« Facturation › Prestataires » et pour les PDF (pdf_factures.py).

Les totaux de chaque regroupement sont ceux des mêmes lignes : par plat,
par jour, par agence et par agent donnent tous le même total.
"""

import calendar
from collections import OrderedDict, defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from . import facturation as fact
from .models import (
    AgencePrestataire, ClotureMensuelle, Commande, FacturePrestataire, LigneFacturePrestataire,
    PlatPrestataire, Prestataire,
)

MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
        'septembre', 'octobre', 'novembre', 'décembre']
JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']


def mois_entier(debut, fin):
    """(annee, mois) si la période couvre exactement un mois civil, sinon None."""
    if debut.day == 1 and debut.year == fin.year and debut.month == fin.month \
            and fin.day == calendar.monthrange(fin.year, fin.month)[1]:
        return debut.year, debut.month
    return None


def libelle_periode(debut, fin):
    m = mois_entier(debut, fin)
    if m:
        return f"{MOIS[m[1] - 1]} {m[0]}"
    return f"du {debut:%d/%m/%Y} au {fin:%d/%m/%Y}"


def libelle_jour(d):
    """« Mar. 01/09 »"""
    return f"{JOURS[d.weekday()].capitalize()} {d:%d/%m}"


def _nom(u):
    if u is None:
        return ''
    return f"{u.nom or ''} {u.prenom or ''}".strip() or u.username


# ══════════════════════════════════════════════════════════════
# Lignes normalisées
# ══════════════════════════════════════════════════════════════

def _ligne(date_menu, plat, agence, montant, statut, user, source):
    return {'date_menu': date_menu, 'plat': plat, 'agence': agence or '—', 'montant': montant,
            'statut': statut, 'user': user, 'source': source}


def lignes_du_prestataire(lignes_prest, prestataire_id):
    """Lignes de facturation.lignes_prestataires attribuées à ce prestataire."""
    return [
        _ligne(l['date_menu'], l['plat'], l['agence_menu'], l['montant'], l['statut'],
               l['commande'].user, l['source'])
        for l in lignes_prest
        if l['prestataire'] is not None and l['prestataire'].id == prestataire_id
    ]


def lignes_de_facture(facture):
    """Lignes figées d'un relevé officiel (FacturePrestataire)."""
    return [
        _ligne(l.date_menu, l.plat_nom, l.agence_nom, l.montant,
               l.commande.statut if l.commande_id and l.commande else None, l.user, 'facture')
        for l in facture.lignes.select_related('commande', 'user').order_by('date_menu', 'id')
    ]


# ══════════════════════════════════════════════════════════════
# Regroupements
# ══════════════════════════════════════════════════════════════

def _somme(lignes):
    return sum((l['montant'] for l in lignes if l['montant'] is not None), Decimal('0'))


def par_plat(lignes):
    """
    Une ligne par plat et par prix unitaire (un seul tarif par repas : en
    général une ligne par plat ; deux si le tarif change dans la période).
    Quantité × P.U. = montant ; les repas sans tarif ont pu = None.
    """
    groupes = OrderedDict()
    for l in lignes:
        g = groupes.setdefault((l['plat'], l['montant']), {
            'plat': l['plat'], 'pu': l['montant'], 'nb_repas': 0, 'retires': 0, 'montant': Decimal('0')})
        g['nb_repas'] += 1
        g['retires'] += l['statut'] == 'retiree'
        if l['montant'] is not None:
            g['montant'] += l['montant']
    total_plat = defaultdict(int)
    for g in groupes.values():
        total_plat[g['plat']] += g['nb_repas']
    return sorted(groupes.values(),
                  key=lambda g: (-total_plat[g['plat']], g['plat'], g['pu'] is None, g['pu'] or 0))


def par_jour(lignes, plats_ordre):
    """Jours servis : quantités par plat, repas, montant ; regroupés par semaine (lundi)."""
    jours = OrderedDict()
    for l in sorted(lignes, key=lambda l: l['date_menu']):
        j = jours.setdefault(l['date_menu'], {'date': l['date_menu'], 'plats': defaultdict(int),
                                              'nb_repas': 0, 'montant': Decimal('0')})
        j['plats'][l['plat']] += 1
        j['nb_repas'] += 1
        if l['montant'] is not None:
            j['montant'] += l['montant']
    semaines = OrderedDict()
    for j in jours.values():
        lundi = j['date'] - timedelta(days=j['date'].weekday())
        s = semaines.setdefault(lundi, {'jours': [], 'plats': defaultdict(int), 'nb_repas': 0,
                                        'montant': Decimal('0')})
        s['jours'].append(j)
        for p, n in j['plats'].items():
            s['plats'][p] += n
        s['nb_repas'] += j['nb_repas']
        s['montant'] += j['montant']
    rang = {p: i for i, p in enumerate(plats_ordre)}
    resultat = []
    for numero, s in enumerate(semaines.values(), start=1):
        premier, dernier = s['jours'][0]['date'], s['jours'][-1]['date']
        resultat.append({
            'numero': numero,
            'libelle': f"Semaine du {premier:%d/%m} au {dernier:%d/%m}",
            'debut': premier, 'fin': dernier, 'nb_jours': len(s['jours']),
            'plats': dict(s['plats']), 'nb_repas': s['nb_repas'], 'montant': s['montant'],
            'jours': [{**j, 'plats': sorted(j['plats'].items(), key=lambda x: (-x[1], rang.get(x[0], 0)))}
                      for j in s['jours']],
        })
    return resultat


def par_agence(lignes):
    groupes = OrderedDict()
    for l in sorted(lignes, key=lambda l: l['agence']):
        g = groupes.setdefault(l['agence'], {'agence': l['agence'], 'nb_repas': 0, 'montant': Decimal('0')})
        g['nb_repas'] += 1
        if l['montant'] is not None:
            g['montant'] += l['montant']
    return sorted(groupes.values(), key=lambda g: -g['nb_repas'])


def par_agent(lignes):
    groupes = {}
    for l in lignes:
        u = l['user']
        cle = u.id if u else None
        g = groupes.setdefault(cle, {
            'user_id': cle, 'username': u.username if u else '—', 'nom_prenom': _nom(u) or '—',
            'agence': l['agence'], 'nb_repas': 0, 'retires': 0, 'montant': Decimal('0'), 'lignes': []})
        g['nb_repas'] += 1
        g['retires'] += l['statut'] == 'retiree'
        if l['montant'] is not None:
            g['montant'] += l['montant']
        g['lignes'].append(l)
    return sorted(groupes.values(), key=lambda g: (g['nom_prenom'].upper(), g['username']))


def synthese(lignes, debut, fin):
    """Tous les regroupements d'un relevé de prestations, sur les mêmes lignes."""
    plats = par_plat(lignes)
    ordre = list(OrderedDict.fromkeys(p['plat'] for p in plats))
    jours = par_jour(lignes, ordre)
    nb_jours = sum(s['nb_jours'] for s in jours)
    nb = len(lignes)
    sources = {l['source'] for l in lignes}
    return {
        'debut': debut, 'fin': fin, 'periode': libelle_periode(debut, fin),
        'nb_repas': nb,
        'retires': sum(l['statut'] == 'retiree' for l in lignes),
        'non_retires': sum(l['statut'] != 'retiree' for l in lignes),
        'repas_sans_tarif': sum(l['montant'] is None for l in lignes),
        'montant': _somme(lignes),
        'jours_servis': nb_jours,
        'moyenne_jour': round(nb / nb_jours) if nb_jours else 0,
        'tarifs': sorted({l['montant'] for l in lignes if l['montant'] is not None}),
        'plats_ordre': ordre,
        'par_plat': plats,
        'semaines': jours,
        'par_agence': par_agence(lignes),
        'agences': sorted({l['agence'] for l in lignes}),
        'etat': fact._etat(sources) if sources else 'provisoire',
    }


# ══════════════════════════════════════════════════════════════
# Relevé de prestations : écran et PDF provisoire
# ══════════════════════════════════════════════════════════════

def commandes_visibles(debut, fin, agences_gerees_ids=None, agence=None, typeequipe=None):
    qs = Commande.objects.filter(menu__date_menu__gte=debut, menu__date_menu__lte=fin)
    if agences_gerees_ids is not None:
        qs = qs.filter(menu__agence_id__in=agences_gerees_ids)
    if agence:
        qs = qs.filter(menu__agence_id=agence)
    if typeequipe:
        qs = qs.filter(menu__typeequipe_id=typeequipe)
    return qs


def factures_visibles(agences_gerees_ids):
    """Relevés officiels visibles : tous (admin) ou ceux qui ne concernent que les agences gérées."""
    qs = FacturePrestataire.objects.select_related('cloture', 'prestataire')
    if agences_gerees_ids is None:
        return qs
    hors = LigneFacturePrestataire.objects.exclude(
        commande__menu__agence_id__in=agences_gerees_ids).values('facture_id')
    return qs.filter(lignes__isnull=False).exclude(pk__in=hors).distinct()


def tarif_en_vigueur(prestataire, d):
    """Ligne PlatPrestataire active à la date d (ou la plus récente commencée avant)."""
    tarifs = list(PlatPrestataire.objects.filter(prestataire=prestataire))
    t = fact.ligne_active(tarifs, d)
    if t is None:
        anterieurs = [x for x in tarifs if fact._jour(x.date_debut) <= d]
        t = max(anterieurs, key=lambda x: x.date_debut, default=None)
    return t


def etat_cloture(prestataire, debut, fin):
    """
    État du relevé pour la période :
      cloture     mois clôturé (relevé officiel, numéroté) ;
      a_cloturer  mois terminé, pas encore clôturé ;
      en_cours    mois pas terminé ;
      periode     période personnalisée (pas de clôture possible).
    """
    m = mois_entier(debut, fin)
    if not m:
        return {'etat': 'periode', 'annee': None, 'mois': None}
    annee, mois = m
    resultat = {'annee': annee, 'mois': mois, 'fin': fin}
    cloture = ClotureMensuelle.objects.filter(annee=annee, mois=mois).first()
    if cloture:
        facture = None
        if prestataire is not None:
            facture = FacturePrestataire.objects.filter(prestataire=prestataire, annee=annee, mois=mois).first()
        return {**resultat, 'etat': 'cloture', 'cloturee_le': cloture.cloturee_le,
                'facture': facture}
    if fin < timezone.localdate():
        return {**resultat, 'etat': 'a_cloturer'}
    return {**resultat, 'etat': 'en_cours'}


def mois_precedent(annee, mois):
    return (annee - 1, 12) if mois == 1 else (annee, mois - 1)


def releve_prestataire(prestataire, debut, fin, agences_gerees_ids=None, agence=None, typeequipe=None):
    """
    Relevé d'un prestataire sur la période, dans le périmètre de l'utilisateur.
    Renvoie (synthese, lignes) ; synthese['precedent'] compare au mois précédent
    quand la période est un mois entier.
    """
    qs = commandes_visibles(debut, fin, agences_gerees_ids, agence, typeequipe)
    lignes_prest = fact.lignes_prestataires(qs)
    lignes = lignes_du_prestataire(lignes_prest, prestataire.id) if prestataire else []
    s = synthese(lignes, debut, fin)

    # Agences avec des repas mais sans prestataire rattaché (signalées, non facturées)
    sans = OrderedDict()
    for l in lignes_prest:
        if l['sans_prestataire']:
            g = sans.setdefault(l['agence_menu'] or '—', {'agence': l['agence_menu'] or '—',
                                                          'jours': set(), 'nb_repas': 0})
            g['jours'].add(l['date_menu'])
            g['nb_repas'] += 1
    s['agences_sans_prestataire'] = [
        {'agence': g['agence'], 'nb_jours': len(g['jours']), 'nb_repas': g['nb_repas']} for g in sans.values()]

    # Prestataires de la période (sélecteur) : ceux qui ont des repas, puis les autres rattachés
    totaux = OrderedDict()
    for l in lignes_prest:
        p = l['prestataire']
        if p is None:
            continue
        t = totaux.setdefault(p.id, {'id': p.id, 'libelle': p.libelle, 'nb_repas': 0, 'montant': Decimal('0')})
        t['nb_repas'] += 1
        if l['montant'] is not None:
            t['montant'] += l['montant']
    rattaches = AgencePrestataire.objects.select_related('prestataire')
    if agences_gerees_ids is not None:
        rattaches = rattaches.filter(agence_id__in=agences_gerees_ids)
    for ap in rattaches:
        totaux.setdefault(ap.prestataire_id, {'id': ap.prestataire_id, 'libelle': ap.prestataire.libelle,
                                              'nb_repas': 0, 'montant': Decimal('0')})
    s['prestataires'] = sorted(totaux.values(), key=lambda t: (-t['nb_repas'], t['libelle']))

    # Comparaison au mois précédent (même périmètre)
    s['precedent'] = None
    m = mois_entier(debut, fin)
    if m and prestataire:
        a, mo = mois_precedent(*m)
        d2, f2 = fact.bornes_mois(a, mo)
        prec = lignes_du_prestataire(fact.lignes_prestataires(
            commandes_visibles(d2, f2, agences_gerees_ids, agence, typeequipe)), prestataire.id)
        plats_prec = defaultdict(int)
        for l in prec:
            plats_prec[l['plat']] += 1
        s['precedent'] = {'annee': a, 'mois': mo, 'libelle': MOIS[mo - 1], 'nb_repas': len(prec),
                          'montant': _somme(prec), 'plats': dict(plats_prec)}
    return s, lignes


# ══════════════════════════════════════════════════════════════
# Relevé des repas des agents (retenues sur salaire)
# ══════════════════════════════════════════════════════════════

def releve_agents(lignes_fact):
    """
    À partir de facturation.lignes_facturation : chiffres, synthèse par
    catégorie et agents regroupés par agence (agence du menu du premier repas,
    comme l'écran), avec sous-totaux.
    """
    employes = fact.synthese_par_employe(lignes_fact)
    agences = OrderedDict()
    for e in sorted(employes, key=lambda e: ((e['lignes'][0]['agence_menu'] or '—'),
                                            (e['nom_prenom'] or '').upper())):
        nom = e['lignes'][0]['agence_menu'] or '—'
        g = agences.setdefault(nom, {'agence': nom, 'agents': [], 'nb_repas': 0, 'montant': Decimal('0')})
        g['agents'].append(e)
        g['nb_repas'] += e['nb_repas']
        g['montant'] += e['total']
    sources = {l['source'] for l in lignes_fact}
    return {
        'nb_agents': len(employes),
        'nb_repas': sum(e['nb_repas'] for e in employes),
        'montant': sum((e['total'] for e in employes), Decimal('0')),
        'repas_sans_tarif': sum(e['repas_sans_tarif'] for e in employes),
        'par_categorie': fact.synthese_par_categorie(lignes_fact),
        'agences': list(agences.values()),
        'etat': fact._etat(sources) if sources else 'provisoire',
    }
