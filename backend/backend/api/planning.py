"""
Planning des menus (web, gestionnaires et administrateurs).

GET /api/api/planning/?debut=AAAA-MM-JJ[&agence=ID&typeequipe=ID&origine=toutes|mon_agence|autres]
  Semaine (lundi → vendredi) contenant `debut` (par défaut : la semaine en cours).
  Pour chaque agence gérée (gestionnaire : ses agences ; administrateur : toutes)
  et chaque jour : les menus, leurs plats avec le nombre de commandes reçues
  (non annulées), l'état des commandes (ouvert / fermé / en service / terminé)
  selon les délais paramétrés, et les retraits du jour.
  « externes » : commandes d'employés d'une autre agence que celle du menu ;
  `origine` restreint les comptes à ces commandes (autres) ou aux autres (mon_agence).
"""
from collections import defaultdict
from datetime import date as date_type, timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Agence, Commande, Menu, MenuPlat, ParametresSociete, UserAgence
from .permissions import IsGestionnaireRole, agences_gerees
from .serializers import date_limite_commande, libelle_date_limite

ACTIVES = ('en_attente', 'retiree')


def etat_menu(date_menu, aujourdhui, maintenant, parametres):
    """terminé (jour passé), en_service (aujourd'hui), ouvert / ferme (selon le délai de commande)."""
    if date_menu < aujourdhui:
        return 'termine'
    if date_menu == aujourdhui:
        return 'en_service'
    return 'ouvert' if maintenant < date_limite_commande(date_menu, parametres) else 'ferme'


def _entier(request, nom):
    valeur = request.query_params.get(nom)
    if not valeur:
        return None
    if not str(valeur).isdigit():
        raise ValidationError(f"Paramètre {nom} invalide.")
    return int(valeur)


class PlanningView(APIView):
    permission_classes = [IsGestionnaireRole]

    def get(self, request):
        aujourdhui = timezone.localdate()
        maintenant = timezone.now()
        parametres = ParametresSociete.charger()

        debut = request.query_params.get('debut')
        try:
            reference = date_type.fromisoformat(debut) if debut else aujourdhui
        except ValueError:
            raise ValidationError(f"Date invalide : {debut} (format AAAA-MM-JJ)")
        lundi = reference - timedelta(days=reference.weekday())
        jours = [lundi + timedelta(days=i) for i in range(5)]

        geres = agences_gerees(request.user)
        agences = Agence.objects.all().order_by('nom_agence')
        menus = Menu.objects.filter(date_menu__gte=jours[0], date_menu__lte=jours[-1])
        if geres is not None:
            agences = agences.filter(id__in=geres)
            menus = menus.filter(agence_id__in=geres)
        agence_id = _entier(request, 'agence')
        if agence_id:
            agences = agences.filter(id=agence_id)
            menus = menus.filter(agence_id=agence_id)
        typeequipe_id = _entier(request, 'typeequipe')
        if typeequipe_id:
            menus = menus.filter(typeequipe_id=typeequipe_id)
        menus = list(menus.select_related('typeequipe').order_by('date_menu', 'typeequipe__libelle'))
        agences = list(agences)

        # Commandes reçues par menu et par plat, origine des employés (externes)
        from .parcours_commande import agences_origine, est_externe, garder_origine, lire_origine
        origine = lire_origine(request)
        agence_menu = {m.id: m.agence_id for m in menus}
        rangs = list(Commande.objects.filter(menu__in=menus, statut__in=ACTIVES)
                     .values_list('menu_id', 'plat_id', 'user_id', 'statut'))
        origines = agences_origine({r[2] for r in rangs})
        par_plat, externes_plat, retirees = defaultdict(int), defaultdict(int), defaultdict(int)
        for menu_id, plat_id, user_id, statut in rangs:
            externe = est_externe(origines.get(user_id), agence_menu[menu_id])
            if not garder_origine(origine, externe):
                continue
            par_plat[(menu_id, plat_id)] += 1
            externes_plat[(menu_id, plat_id)] += externe
            if statut == 'retiree':
                retirees[menu_id] += 1
        plats = {}
        for mp in MenuPlat.objects.filter(menu__in=menus).select_related('plat__type_plat').order_by('id'):
            plats.setdefault(mp.menu_id, []).append(mp.plat)

        # Agents rattachés aujourd'hui à chaque agence
        nb_agents = {
            r['agence_id']: r['n'] for r in
            UserAgence.objects.filter(agence__in=agences, date_debut__lte=maintenant, user__is_active=True)
            .filter(Q(date_fin__isnull=True) | Q(date_fin__gte=maintenant))
            .values('agence_id').annotate(n=Count('user_id', distinct=True))
        }

        def menu_json(m):
            lignes = [{
                'id': p.id, 'nom': p.nom,
                'type_plat': p.type_plat.libelle if p.type_plat_id else None,
                'commandes': par_plat.get((m.id, p.id), 0),
                'externes': externes_plat.get((m.id, p.id), 0),
            } for p in plats.get(m.id, [])]
            limite = date_limite_commande(m.date_menu, parametres)
            return {
                'id': m.id,
                'date_menu': m.date_menu,
                'agence_id': m.agence_id,
                'typeequipe_id': m.typeequipe_id,
                'typeequipe': m.typeequipe.libelle if m.typeequipe_id else None,
                'etat': etat_menu(m.date_menu, aujourdhui, maintenant, parametres),
                'date_limite_commande': limite,
                'date_limite_libelle': libelle_date_limite(limite),
                'commandes': sum(l['commandes'] for l in lignes),
                'externes': sum(l['externes'] for l in lignes),
                'retirees': retirees.get(m.id, 0),
                'plats': lignes,
            }

        par_case = {}
        for m in menus:
            par_case.setdefault((m.agence_id, m.date_menu), []).append(menu_json(m))

        return Response({
            'aujourdhui': aujourdhui,
            'origine': origine,
            'debut': jours[0],
            'fin': jours[-1],
            'jours': [{
                'date': d,
                'etat': etat_menu(d, aujourdhui, maintenant, parametres),
                'date_limite_commande': date_limite_commande(d, parametres),
            } for d in jours],
            'agences': [{
                'id': ag.id,
                'nom': ag.nom_agence,
                'nb_agents': nb_agents.get(ag.id, 0),
                'equipes': sorted({m.typeequipe.libelle for m in menus
                                   if m.agence_id == ag.id and m.typeequipe_id}),
                'jours': [{'date': d, 'menus': par_case.get((ag.id, d), [])} for d in jours],
            } for ag in agences],
        })
