"""
Écran d'accueil (web et mobile) : tout ce qu'il faut afficher en une requête.

GET /api/api/accueil/
  Tout utilisateur connecté :
    repas_du_jour, semaine (lun.→ven.), prochain_a_reserver, mois (chiffres),
    recentes (3 dernières commandes)
  Gestionnaire / administrateur, en plus (clé « gestion », limité à ses agences) :
    service_du_jour (par agence), semaine (commandes par jour), a_faire (alertes)
"""
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import facturation as fact
from .models import Agence, Commande, Menu, MenuPlat, ParametresSociete, PlatImage
from .permissions import agences_gerees, is_gestionnaire
from .serializers import agence_actuelle, date_limite_commande, libelle_date_limite

JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
ACTIVES = ('en_attente', 'retiree')


def _jour_libelle(d):
    return f"{JOURS[d.weekday()]} {d:%d/%m}"


def _image_plat(plat_id, images):
    img = images.get(plat_id)
    return img.image.url if img else None


def _images(plat_ids):
    """Image principale (sinon la première) de chaque plat."""
    images = {}
    for img in PlatImage.objects.filter(plat_id__in=plat_ids).order_by('-is_principale', 'id'):
        images.setdefault(img.plat_id, img)
    return images


def _semaine_courante(aujourdhui):
    lundi = aujourdhui - timedelta(days=aujourdhui.weekday())
    return [lundi + timedelta(days=i) for i in range(5)]


def _commande_json(c, images):
    return {
        'id': c.id,
        'statut': c.statut,
        'date_menu': c.menu.date_menu,
        'plat': c.plat.nom,
        'plat_image_url': _image_plat(c.plat_id, images),
        'agence': c.menu.agence.nom_agence if c.menu.agence_id else None,
        'equipe': c.menu.typeequipe.libelle if c.menu.typeequipe_id else None,
        'menu_id': c.menu_id,
    }


class AccueilView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        maintenant = timezone.now()
        aujourdhui = timezone.localdate()
        parametres = ParametresSociete.charger()
        jours = _semaine_courante(aujourdhui)

        # ── Partie personnelle (tout le monde commande) ──────────────
        agence = agence_actuelle(user)
        horizon = aujourdhui + timedelta(days=21)
        mes = list(
            Commande.objects.filter(user=user, menu__date_menu__gte=jours[0], menu__date_menu__lte=horizon)
            .select_related('plat', 'menu__agence', 'menu__typeequipe')
        )
        actives_par_jour = {c.menu.date_menu: c for c in mes if c.statut in ACTIVES}
        recentes = list(
            Commande.objects.filter(user=user)
            .select_related('plat', 'menu__agence', 'menu__typeequipe')
            .order_by('-menu__date_menu', '-date_commande')[:3]
        )
        images = _images({c.plat_id for c in mes + recentes})

        menus_agence = {}
        if agence:
            for m in (Menu.objects.filter(agence=agence, date_menu__gte=jours[0], date_menu__lte=horizon)
                      .annotate(nb_plats=Count('menu_plats'))):
                menus_agence.setdefault(m.date_menu, []).append(m)

        def etat_jour(d):
            c = actives_par_jour.get(d)
            if c:
                if c.statut == 'retiree':
                    statut = 'retire'
                else:
                    statut = 'a_retirer' if d == aujourdhui else ('reserve' if d > aujourdhui else 'non_retire')
                return {'statut': statut, 'plat': c.plat.nom, 'commande_id': c.id}
            if d in menus_agence:
                limite = date_limite_commande(d, parametres)
                if maintenant < limite:
                    return {'statut': 'a_reserver', 'date_limite_commande': limite}
                return {'statut': 'ferme'}
            return {'statut': 'pas_de_menu'}

        semaine = [{'date': d, 'libelle': _jour_libelle(d), **etat_jour(d)} for d in jours]

        prochain = None
        d = aujourdhui
        while d <= horizon and prochain is None:
            if d not in actives_par_jour and d in menus_agence:
                limite = date_limite_commande(d, parametres)
                if maintenant < limite:
                    menus = menus_agence[d]
                    prochain = {
                        'date': d, 'libelle': _jour_libelle(d),
                        'agence': agence.nom_agence,
                        'nb_plats': MenuPlat.objects.filter(menu__in=menus).values('plat').distinct().count(),
                        'menu_id': menus[0].id,
                        'date_limite_commande': limite,
                        'date_limite_libelle': libelle_date_limite(limite),
                    }
            d += timedelta(days=1)

        debut_mois, fin_mois = fact.bornes_mois(aujourdhui.year, aujourdhui.month)
        du_mois = Commande.objects.filter(user=user, menu__date_menu__gte=debut_mois,
                                          menu__date_menu__lte=fin_mois)
        compte = du_mois.aggregate(
            repas=Count('id', filter=Q(statut__in=ACTIVES)),
            retires=Count('id', filter=Q(statut='retiree')),
            annules=Count('id', filter=Q(statut='annulee')),
        )
        lignes = fact.lignes_facturation(du_mois)
        compte['montant'] = sum((l['montant'] for l in lignes if l['montant'] is not None), Decimal('0'))
        compte['repas_sans_tarif'] = sum(1 for l in lignes if l['montant'] is None)

        du_jour = actives_par_jour.get(aujourdhui)
        donnees = {
            'date': aujourdhui,
            'repas_du_jour': _commande_json(du_jour, images) if du_jour else None,
            'semaine': semaine,
            'prochain_a_reserver': prochain,
            'mois': compte,
            'recentes': [_commande_json(c, images) for c in recentes],
        }
        if is_gestionnaire(user):
            donnees['gestion'] = self._gestion(user, aujourdhui, maintenant, jours, parametres)
        return Response(donnees)

    # ── Gestionnaire / administrateur ─────────────────────────────────
    def _gestion(self, user, aujourdhui, maintenant, jours, parametres):
        geres = agences_gerees(user)
        menus = Menu.objects.all()
        if geres is not None:
            menus = menus.filter(agence_id__in=geres)
            agences = list(Agence.objects.filter(id__in=geres).order_by('nom_agence'))
        else:
            # Administrateur : agences qui ont servi des repas ces deux derniers mois
            recentes = menus.filter(date_menu__gte=aujourdhui - timedelta(days=60)).values('agence_id')
            agences = list(Agence.objects.filter(id__in=recentes).order_by('nom_agence'))
        commandes = Commande.objects.filter(menu__in=menus)

        # Service du jour, par agence
        service = []
        for ag in agences:
            menus_jour = list(menus.filter(agence=ag, date_menu=aujourdhui).select_related('typeequipe'))
            if not menus_jour:
                continue
            c = commandes.filter(menu__in=menus_jour).aggregate(
                commandees=Count('id', filter=Q(statut__in=ACTIVES)),
                servies=Count('id', filter=Q(statut='retiree')),
            )
            service.append({
                'agence_id': ag.id, 'agence': ag.nom_agence,
                'equipes': sorted({m.typeequipe.libelle for m in menus_jour if m.typeequipe_id}),
                'nb_plats': MenuPlat.objects.filter(menu__in=menus_jour).values('plat').distinct().count(),
                'commandees': c['commandees'], 'servies': c['servies'],
                'a_servir': c['commandees'] - c['servies'],
            })

        # Semaine : commandes par jour et état
        par_jour = {
            r['menu__date_menu']: r for r in
            commandes.filter(menu__date_menu__gte=jours[0], menu__date_menu__lte=jours[-1])
            .values('menu__date_menu')
            .annotate(commandees=Count('id', filter=Q(statut__in=ACTIVES)),
                      retirees=Count('id', filter=Q(statut='retiree')))
        }
        avec_menu = {}
        for date_menu, agence_id in menus.filter(date_menu__gte=jours[0], date_menu__lte=aujourdhui + timedelta(days=10)) \
                                         .values_list('date_menu', 'agence_id'):
            avec_menu.setdefault(date_menu, set()).add(agence_id)

        def sans_menu(d):
            return [a.nom_agence for a in agences if a.id not in avec_menu.get(d, set())]

        semaine = []
        for d in jours:
            r = par_jour.get(d, {})
            if d < aujourdhui:
                etat = 'termine'
            elif d == aujourdhui:
                etat = 'en_cours'
            else:
                etat = 'ouvert' if maintenant < date_limite_commande(d, parametres) else 'ferme'
            manquants = sans_menu(d) if d >= aujourdhui else []
            if d >= aujourdhui and agences and len(manquants) == len(agences):
                etat = 'sans_menu'
            semaine.append({'date': d, 'libelle': _jour_libelle(d), 'etat': etat,
                            'commandees': r.get('commandees', 0), 'retirees': r.get('retirees', 0),
                            'agences_sans_menu': manquants})

        # À faire : fermetures du jour, clôture, puis au plus 3 menus manquants
        a_faire = []
        manquants_a_faire = []
        d = aujourdhui + timedelta(days=1)
        while d <= aujourdhui + timedelta(days=7) and len(manquants_a_faire) < 3:
            if d.weekday() < 5:
                manquants = sans_menu(d)
                if manquants:
                    manquants_a_faire.append({'type': 'menu_manquant', 'date': d, 'agences': manquants,
                                    'titre': f"Pas de menu {_jour_libelle(d)}",
                                    'detail': f"{', '.join(manquants)} · les agents ne peuvent pas commander"})
            d += timedelta(days=1)
        fin_journee = timezone.make_aware(datetime.combine(aujourdhui + timedelta(days=1), time.min))
        dates_futures = sorted({m for m in avec_menu if m > aujourdhui})
        for dm in dates_futures:
            limite = date_limite_commande(dm, parametres)
            if maintenant < limite <= fin_journee:
                nb = commandes.filter(menu__date_menu=dm, statut__in=ACTIVES).count()
                a_faire.append({'type': 'fermeture', 'date': dm,
                                'titre': f"Commandes du {_jour_libelle(dm)} : fermeture le {libelle_date_limite(limite)}",
                                'detail': f"{nb} commande(s) à ce jour"})
        precedent = (aujourdhui.replace(day=1) - timedelta(days=1))
        if not fact.mois_cloture(precedent.year, precedent.month):
            debut, fin = fact.bornes_mois(precedent.year, precedent.month)
            if commandes.filter(menu__date_menu__gte=debut, menu__date_menu__lte=fin,
                                statut__in=ACTIVES).exists():
                a_faire.append({'type': 'cloture', 'annee': precedent.year, 'mois': precedent.month,
                                'titre': f"{precedent:%m/%Y} n'est pas encore clôturé",
                                'detail': "Clôturez le mois pour figer la facturation"})

        a_faire += manquants_a_faire

        return {
            'agences': [a.nom_agence for a in agences],
            'service_du_jour': service,
            'semaine': semaine,
            'a_faire': a_faire,
        }
