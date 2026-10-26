"""
Statistiques de la cantine (page web « Cantine › Statistiques » et blocs de
l'accueil gestionnaire). Gestionnaires (limités à leurs agences) et
administrateurs (toutes les agences) ; les employés n'y ont pas accès.

Définitions (commandes d'un menu dont la date est dans la période) :
  - commandés   : statut en_attente ou retiree (annulées exclues) ;
  - servis      : retiree ;
  - à servir    : en_attente, menu aujourd'hui ou à venir ;
  - non retirés : en_attente, menu passé (jamais récupérés) ;
  - annulées    : comptées à part ; « par le gestionnaire » si annulee_par
                  est un autre utilisateur que l'agent, sinon « par l'agent ».
  - taux de retrait : servis / (servis + non retirés), c.-à-d. sur les repas
                  dont le sort est connu (les repas à servir n'y entrent pas).
Catégorie de salarié et poste : ceux de l'agent AUJOURD'HUI (ligne active,
sinon la plus récente), comme agence_actuelle(). Agence : celle du menu.

GET /api/api/statistiques/?debut=&fin=&agence=&typeequipe=[&resume=1]
GET /api/api/statistiques/repas-categories/?debut=&fin=&agence=&typeequipe=
GET /api/api/statistiques/detail/?debut=&fin=&agence=&typeequipe=&plat=&categorie=
                                 &liste=commandes|servis|a_servir|non_retires
                                 &search=&page=&page_size=[&export=1]
"""
import calendar
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Avg, Case, Count, F, IntegerField, OuterRef, Q, Subquery, Value, When
from django.db.models.functions import TruncMonth, TruncWeek
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import facturation as fact
from .models import (
    Agence, AvisPlat, Categoriesalarie, Commande, Menu, Retrait, UserCategoriesalarie, UserPoste,
)
from .permissions import IsGestionnaireRole, agences_gerees

ACTIVES = ('en_attente', 'retiree')
LISTES = ('commandes', 'servis', 'a_servir', 'non_retires')
EXPORT_MAX = 5000
JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']


# ══════════════════════════════════════════════════════════════
# PARAMÈTRES ET PÉRIMÈTRE
# ══════════════════════════════════════════════════════════════

def _date(valeur, defaut):
    if not valeur:
        return defaut
    try:
        return date.fromisoformat(valeur)
    except ValueError:
        raise ValidationError(f"Date invalide : {valeur} (format AAAA-MM-JJ)")


def _entier(params, nom):
    valeur = params.get(nom)
    if valeur in (None, ''):
        return None
    if not str(valeur).isdigit():
        raise ValidationError(f"Paramètre {nom} invalide.")
    return int(valeur)


class Perimetre:
    """Période, agences et équipe demandées, limitées aux agences gérées."""

    def __init__(self, request):
        p = request.query_params
        self.aujourdhui = timezone.localdate()
        debut_mois, fin_mois = fact.bornes_mois(self.aujourdhui.year, self.aujourdhui.month)
        self.debut = _date(p.get('debut'), debut_mois)
        self.fin = _date(p.get('fin'), fin_mois)
        if self.debut > self.fin:
            raise ValidationError("La date de début doit être antérieure ou égale à la date de fin.")
        if (self.fin - self.debut).days > 3 * 366:
            raise ValidationError("Période trop longue (3 ans au plus).")

        self.geres = agences_gerees(request.user)          # None = administrateur
        self.agence = _entier(p, 'agence')
        if self.agence is not None and self.geres is not None and self.agence not in self.geres:
            raise PermissionDenied("Cette agence ne fait pas partie de vos agences.")
        self.typeequipe = _entier(p, 'typeequipe')

    # Filtres sur Commande (sans la période)
    def commandes(self):
        qs = Commande.objects.all()
        if self.agence is not None:
            qs = qs.filter(menu__agence_id=self.agence)
        elif self.geres is not None:
            qs = qs.filter(menu__agence_id__in=self.geres)
        if self.typeequipe is not None:
            qs = qs.filter(menu__typeequipe_id=self.typeequipe)
        return qs

    def commandes_periode(self, debut=None, fin=None):
        return self.commandes().filter(menu__date_menu__gte=debut or self.debut,
                                       menu__date_menu__lte=fin or self.fin)

    def menus(self):
        qs = Menu.objects.all()
        if self.agence is not None:
            qs = qs.filter(agence_id=self.agence)
        elif self.geres is not None:
            qs = qs.filter(agence_id__in=self.geres)
        if self.typeequipe is not None:
            qs = qs.filter(typeequipe_id=self.typeequipe)
        return qs

    def agences_libelles(self):
        if self.agence is not None:
            return list(Agence.objects.filter(id=self.agence).values_list('nom_agence', flat=True))
        if self.geres is not None:
            return list(Agence.objects.filter(id__in=self.geres).order_by('nom_agence')
                        .values_list('nom_agence', flat=True))
        return []      # administrateur : toutes les agences

    @property
    def en_cours(self):
        """La période contient aujourd'hui ou des jours à venir : chiffres provisoires."""
        return self.fin >= self.aujourdhui

    def precedente(self):
        """Période équivalente précédente : mois entiers → mêmes mois avant ; sinon même durée."""
        d, f = self.debut, self.fin
        if d.day == 1 and f.day == calendar.monthrange(f.year, f.month)[1]:
            nb = (f.year - d.year) * 12 + f.month - d.month + 1
            m = d.month - nb
            a = d.year + (m - 1) // 12
            m = (m - 1) % 12 + 1
            debut = date(a, m, 1)
            fin = d - timedelta(days=1)
            return debut, fin
        duree = (f - d).days + 1
        return d - timedelta(days=duree), d - timedelta(days=1)


# ══════════════════════════════════════════════════════════════
# AGRÉGATS COMMUNS
# ══════════════════════════════════════════════════════════════

def compteurs(aujourdhui):
    return {
        'commandes':   Count('id', filter=Q(statut__in=ACTIVES)),
        'servis':      Count('id', filter=Q(statut='retiree')),
        'a_servir':    Count('id', filter=Q(statut='en_attente', menu__date_menu__gte=aujourdhui)),
        'non_retires': Count('id', filter=Q(statut='en_attente', menu__date_menu__lt=aujourdhui)),
        'annulees':    Count('id', filter=Q(statut='annulee')),
    }


def taux_retrait(servis, non_retires):
    base = (servis or 0) + (non_retires or 0)
    return round(servis / base * 100, 1) if base else None


def _note(v):
    return round(float(v), 2) if v is not None else None


def _ligne(row):
    """Compteurs d'une ligne d'agrégat + taux de retrait."""
    d = {k: int(row.get(k) or 0) for k in ('commandes', 'servis', 'a_servir', 'non_retires', 'annulees')}
    d['taux_retrait'] = taux_retrait(d['servis'], d['non_retires'])
    if 'note' in row:
        d['note'] = _note(row['note'])
        d['nb_avis'] = int(row.get('nb_avis') or 0)
    return d


def _actif_d_abord(modele, champ):
    """
    Sous-requête : valeur `champ` de la ligne d'historique de l'agent active
    aujourd'hui, sinon la plus récente (même règle qu'agence_actuelle()).
    """
    maintenant = timezone.now()
    lignes = (modele.objects.filter(user_id=OuterRef('user_id'))
              .annotate(_actif=Case(
                  When(Q(date_debut__lte=maintenant) & (Q(date_fin__isnull=True) | Q(date_fin__gte=maintenant)),
                       then=Value(0)),
                  default=Value(1), output_field=IntegerField()))
              .order_by('_actif', '-date_debut', '-id')
              .values(champ)[:1])
    return Subquery(lignes)


def categorie_actuelle_id():
    return _actif_d_abord(UserCategoriesalarie, 'categoriesalarie_id')


def par_repas(qs, aujourdhui):
    """Commandés / servis / à servir / non retirés par plat (annulées hors total)."""
    lignes = list(
        qs.values('plat_id', 'plat__nom')
        .annotate(**compteurs(aujourdhui), note=Avg('avis__note'), nb_avis=Count('avis'))
        .order_by('-commandes', 'plat__nom')
    )
    agences = defaultdict(set)
    for plat_id, nom in qs.filter(statut__in=ACTIVES).values_list('plat_id', 'menu__agence__nom_agence').distinct():
        agences[plat_id].add(nom)
    return [
        {'plat_id': r['plat_id'], 'plat': r['plat__nom'], 'agences': sorted(agences.get(r['plat_id'], [])),
         **_ligne(r)}
        for r in lignes if r['commandes'] > 0
    ]


def par_categorie(qs, aujourdhui):
    """Mêmes compteurs par catégorie de salarié actuelle de l'agent (« Sans catégorie » en dernier)."""
    lignes = list(
        qs.annotate(cat_id=categorie_actuelle_id())
        .values('cat_id')
        .annotate(**compteurs(aujourdhui))
        .order_by()
    )
    libelles = dict(Categoriesalarie.objects.filter(id__in=[r['cat_id'] for r in lignes if r['cat_id']])
                    .values_list('id', 'libelle'))
    resultat = [
        {'categorie_id': r['cat_id'], 'categorie': libelles.get(r['cat_id']) if r['cat_id'] else None,
         **_ligne(r)}
        for r in lignes if r['commandes'] > 0
    ]
    resultat.sort(key=lambda x: (x['categorie_id'] is None, -x['commandes'], x['categorie'] or ''))
    return resultat


def _total(lignes):
    t = {k: sum(l[k] for l in lignes) for k in ('commandes', 'servis', 'a_servir', 'non_retires')}
    t['taux_retrait'] = taux_retrait(t['servis'], t['non_retires'])
    return t


def kpis(qs, aujourdhui):
    c = qs.aggregate(**compteurs(aujourdhui))
    avis = AvisPlat.objects.filter(commande__in=qs.filter(statut='retiree')).aggregate(
        note=Avg('note'), nb=Count('id'))
    return {
        **_ligne(c),
        'note_moyenne': _note(avis['note']),
        'nb_avis': avis['nb'],
    }


def _mois_entre(debut, fin):
    mois, (a, m) = [], (debut.year, debut.month)
    while (a, m) <= (fin.year, fin.month):
        mois.append((a, m))
        a, m = (a + 1, 1) if m == 12 else (a, m + 1)
    return mois


# ══════════════════════════════════════════════════════════════
# VUES
# ══════════════════════════════════════════════════════════════

class StatistiquesView(APIView):
    """Toutes les données de la page Statistiques (resume=1 : chiffres clés seulement)."""
    permission_classes = [IsGestionnaireRole]

    def get(self, request):
        per = Perimetre(request)
        auj = per.aujourdhui
        qs = per.commandes_periode()
        prec_debut, prec_fin = per.precedente()

        donnees = {
            'periode': {
                'debut': per.debut, 'fin': per.fin, 'aujourdhui': auj, 'en_cours': per.en_cours,
                'precedente': {'debut': prec_debut, 'fin': prec_fin},
            },
            'agences': per.agences_libelles(),
            'kpis': kpis(qs, auj),
            'precedent': kpis(per.commandes_periode(prec_debut, prec_fin), auj),
        }
        if request.query_params.get('resume') in ('1', 'true'):
            return Response(donnees)

        # ── Commandes par mois (au moins 6 mois, jusqu'au mois de fin) ──
        fin_mois = date(per.fin.year, per.fin.month, 1)
        a6, m6 = (fin_mois.year, fin_mois.month - 5) if fin_mois.month > 5 else (fin_mois.year - 1, fin_mois.month + 7)
        six = date(a6, m6, 1)
        debut_mois = min(date(per.debut.year, per.debut.month, 1), six)
        mois = _mois_entre(debut_mois, per.fin)
        dernier = calendar.monthrange(per.fin.year, per.fin.month)[1]
        qs_mois = per.commandes_periode(debut_mois, date(per.fin.year, per.fin.month, dernier))
        rows = {
            (r['m'].year, r['m'].month): r for r in
            qs_mois.annotate(m=TruncMonth('menu__date_menu')).values('m')
            .annotate(**compteurs(auj), note=Avg('avis__note'), nb_avis=Count('avis'),
                      annul_agent=Count('id', filter=Q(statut='annulee') & (
                          Q(annulee_par__isnull=True) | Q(annulee_par_id=F('user_id')))),
                      annul_gest=Count('id', filter=Q(statut='annulee', annulee_par__isnull=False)
                                       & ~Q(annulee_par_id=F('user_id'))))
            .order_by('m')
        }
        par_mois, annulations = [], []
        for a, m in mois:
            r = rows.get((a, m), {})
            par_mois.append({'annee': a, 'mois': m,
                             'en_cours': (a, m) >= (auj.year, auj.month),
                             **_ligne({**r, 'note': r.get('note'), 'nb_avis': r.get('nb_avis')})})
            annulations.append({'annee': a, 'mois': m,
                                'par_agent': int(r.get('annul_agent') or 0),
                                'par_gestionnaire': int(r.get('annul_gest') or 0)})

        # ── Par agence ───────────────────────────────────────────
        agence_rows = (qs.values('menu__agence_id', 'menu__agence__nom_agence')
                       .annotate(**compteurs(auj), note=Avg('avis__note'), nb_avis=Count('avis'))
                       .order_by('-commandes'))
        par_agence = [{'agence_id': r['menu__agence_id'], 'agence': r['menu__agence__nom_agence'], **_ligne(r)}
                      for r in agence_rows]

        # ── Évolution par date de menu ───────────────────────────
        evolution = [
            {'date': r['menu__date_menu'], 'commandes': r['commandes'], 'servis': r['servis'],
             'futur': r['menu__date_menu'] > auj}
            for r in qs.values('menu__date_menu').annotate(**compteurs(auj)).order_by('menu__date_menu')
        ]

        # ── Repas & catégories ───────────────────────────────────
        repas = par_repas(qs, auj)
        categories = par_categorie(qs, auj)

        # ── Plats & avis ─────────────────────────────────────────
        par_type = [
            {'type_plat': r['plat__type_plat__libelle'] or '—', 'commandes': r['n']}
            for r in qs.filter(statut__in=ACTIVES).values('plat__type_plat__libelle')
            .annotate(n=Count('id')).order_by('-n')
        ]
        classement = sorted(
            [{'plat_id': r['plat_id'], 'plat': r['plat'], 'note': r['note'], 'nb_avis': r['nb_avis'],
              'commandes': r['commandes'], 'servis': r['servis'],
              'taux_avis': round(r['nb_avis'] / r['servis'] * 100, 1) if r['servis'] else None}
             for r in repas if r['nb_avis']],
            key=lambda x: (-x['note'], -x['nb_avis'], x['plat']))

        # ── Fréquentation ────────────────────────────────────────
        ref = min(per.fin, auj)
        lundi = ref - timedelta(days=ref.weekday())
        premier = lundi - timedelta(weeks=9)
        semaines_rows = {
            r['s']: r['n'] for r in
            per.commandes().filter(statut='en_attente', menu__date_menu__lt=auj,
                                   menu__date_menu__gte=premier, menu__date_menu__lte=ref)
            .annotate(s=TruncWeek('menu__date_menu')).values('s').annotate(n=Count('id')).order_by()
        }
        semaines_rows = {(k.date() if hasattr(k, 'date') else k): v for k, v in semaines_rows.items()}
        non_retires_semaine = [
            {'semaine': premier + timedelta(weeks=i),
             'non_retires': semaines_rows.get(premier + timedelta(weeks=i), 0),
             'en_cours': premier + timedelta(weeks=i) == auj - timedelta(days=auj.weekday())}
            for i in range(10)
        ]
        # Coût estimé des repas non retirés de la période : tarif du prestataire
        # à la date du menu (même calcul que la facturation prestataires).
        lignes_perdues = fact.lignes_prestataires(qs.filter(statut='en_attente', menu__date_menu__lt=auj))
        perte = sum((l['montant'] for l in lignes_perdues if l['montant'] is not None), Decimal('0'))
        perte_sans_tarif = sum(1 for l in lignes_perdues if l['montant'] is None)

        debut_j = ref - timedelta(days=91)
        jours_menus = defaultdict(set)
        for d in per.menus().filter(date_menu__gte=debut_j, date_menu__lte=ref).values_list('date_menu', flat=True):
            jours_menus[d.weekday()].add(d)
        cmd_jour = defaultdict(int)
        for r in (per.commandes().filter(statut__in=ACTIVES, menu__date_menu__gte=debut_j, menu__date_menu__lte=ref)
                  .values('menu__date_menu').annotate(n=Count('id'))):
            cmd_jour[r['menu__date_menu'].weekday()] += r['n']
        jours = [
            {'jour': i, 'libelle': JOURS[i], 'nb_jours': len(jours_menus[i]),
             'moyenne': round(cmd_jour[i] / len(jours_menus[i]), 1) if jours_menus[i] else 0}
            for i in range(7) if i < 5 or cmd_jour[i]
        ]

        donnees.update({
            'par_mois': par_mois,
            'par_agence': par_agence,
            'evolution': evolution,
            'par_repas': repas,
            'par_categorie': categories,
            'total_repas': _total(repas),
            'par_type_plat': par_type,
            'classement_plats': classement,
            'non_retires_semaine': non_retires_semaine,
            'perte_non_retires': {'montant': float(perte), 'repas': len(lignes_perdues),
                                  'repas_sans_tarif': perte_sans_tarif},
            'annulations': annulations,
            'jours': jours,
            'jours_periode': {'debut': debut_j, 'fin': ref},
        })
        return Response(donnees)


class RepasCategoriesView(APIView):
    """Service d'une période (accueil : aujourd'hui) par repas et par catégorie de salarié."""
    permission_classes = [IsGestionnaireRole]

    def get(self, request):
        per = Perimetre(request)
        qs = per.commandes_periode()
        repas = par_repas(qs, per.aujourdhui)
        return Response({
            'periode': {'debut': per.debut, 'fin': per.fin, 'aujourdhui': per.aujourdhui,
                        'en_cours': per.en_cours},
            'agences': per.agences_libelles(),
            'par_repas': repas,
            'par_categorie': par_categorie(qs, per.aujourdhui),
            'total': _total(repas),
        })


class DetailServiceView(APIView):
    """Liste nominative (une ligne par commande) d'un onglet, avec le nombre de lignes de chaque onglet."""
    permission_classes = [IsGestionnaireRole]

    def get(self, request):
        per = Perimetre(request)
        p = request.query_params
        auj = per.aujourdhui
        liste = p.get('liste') or 'commandes'
        if liste not in LISTES:
            raise ValidationError("Paramètre liste invalide (commandes, servis, a_servir, non_retires).")

        qs = (per.commandes_periode()
              .annotate(cat_id=categorie_actuelle_id(),
                        cat_lib=_actif_d_abord(UserCategoriesalarie, 'categoriesalarie__libelle'),
                        poste_lib=_actif_d_abord(UserPoste, 'poste__libelle')))
        plat = _entier(p, 'plat')
        if plat is not None:
            qs = qs.filter(plat_id=plat)
        categorie = p.get('categorie')
        if categorie == 'aucune':
            qs = qs.filter(cat_id__isnull=True)
        elif categorie not in (None, ''):
            qs = qs.filter(cat_id=_entier(p, 'categorie'))
        recherche = (p.get('search') or '').strip()
        if recherche:
            filtre = Q()
            for mot in recherche.split():
                filtre &= (Q(user__nom__icontains=mot) | Q(user__prenom__icontains=mot)
                           | Q(user__username__icontains=mot) | Q(poste_lib__icontains=mot)
                           | Q(cat_lib__icontains=mot) | Q(plat__nom__icontains=mot))
            qs = qs.filter(filtre)

        c = qs.aggregate(**compteurs(auj))
        compte = {k: c[k] for k in LISTES}

        filtres = {
            'commandes':   Q(statut__in=ACTIVES),
            'servis':      Q(statut='retiree'),
            'a_servir':    Q(statut='en_attente', menu__date_menu__gte=auj),
            'non_retires': Q(statut='en_attente', menu__date_menu__lt=auj),
        }
        lignes = (qs.filter(filtres[liste])
                  .annotate(heure_retrait=Subquery(
                      Retrait.objects.filter(user_id=OuterRef('user_id'), menu_id=OuterRef('menu_id'))
                      .values('date_retrait')[:1]))
                  .select_related('user', 'plat', 'menu__agence', 'menu__typeequipe'))
        if liste == 'servis':
            lignes = lignes.order_by(F('heure_retrait').desc(nulls_last=True), 'user__nom', 'id')
        else:
            lignes = lignes.order_by('user__nom', 'user__prenom', 'menu__date_menu', 'id')

        total = compte[liste]
        if p.get('export') in ('1', 'true'):
            page, taille = 1, EXPORT_MAX
        else:
            taille = min(max(_entier(p, 'page_size') or 10, 1), 200)
            page = max(_entier(p, 'page') or 1, 1)
        debut = (page - 1) * taille

        def statut(cmd):
            if cmd.statut == 'retiree':
                return 'servi'
            return 'a_servir' if cmd.menu.date_menu >= auj else 'non_retire'

        resultats = [{
            'commande_id': cmd.id,
            'user_id': cmd.user_id,
            'matricule': cmd.user.username,
            'nom': (cmd.user.nom or '').upper(),
            'prenom': cmd.user.prenom or '',
            'categorie': cmd.cat_lib,
            'poste': cmd.poste_lib,
            'agence': cmd.menu.agence.nom_agence if cmd.menu.agence_id else None,
            'equipe': cmd.menu.typeequipe.libelle if cmd.menu.typeequipe_id else None,
            'date_menu': cmd.menu.date_menu,
            'plat': cmd.plat.nom,
            'statut': statut(cmd),
            'heure_retrait': timezone.localtime(cmd.heure_retrait) if cmd.heure_retrait else None,
        } for cmd in lignes[debut:debut + taille]]

        return Response({
            'liste': liste,
            'periode': {'debut': per.debut, 'fin': per.fin, 'aujourdhui': auj, 'en_cours': per.en_cours},
            'compteurs': compte,
            'count': total,
            'page': page,
            'page_size': taille,
            'tronque': total > EXPORT_MAX and p.get('export') in ('1', 'true'),
            'results': resultats,
        })
