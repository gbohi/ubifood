"""
Suivi des repas : l'employé suit son repas ; le prestataire déclare les étapes
d'un service (un menu = jour, agence, équipe, prestataire) en un geste.

Étapes (Paramètres → Société, chacune active ou non, notification push ou
seulement visible dans l'application) :
  confirmee   commande enregistrée (notification « Commande confirmée » existante)
  preparation bouton du prestataire, sinon automatique N h avant le retrait
  en_route    bouton « Livraison partie »
  arrive      bouton « Arrivé au comptoir », sinon automatique au début du retrait
  retire      scan du badge (notification « Retrait validé » existante)
Incidents : retard (nouvelle heure d'arrivée) ou message libre → employés du
service et gestionnaires de l'agence. Rappel N min avant la fin du retrait aux
employés qui n'ont pas retiré. L'employé peut couper les notifications du suivi
(sauf « Repas arrivé ») si le réglage l'autorise.

Ponctualité (information, aucune pénalité) : arrivée déclarée au plus tard au
début du retrait = à l'heure.

API (préfixe /api/api/)
  GET  prestataire/suivi/                       services du jour du prestataire
  POST prestataire/suivi/<menu_id>/             {etape: preparation|en_route|arrive}
  POST prestataire/suivi/<menu_id>/incident/    {type: retard|autre, heure, message}
  GET  suivi-livraisons/?date=&agence=          gestionnaires : services du jour
  GET  suivi-livraisons/ponctualite/?annee=&mois=&agence=
  GET/PATCH suivi/preferences/                  employé : notifications coupées
  (GET accueil/ : clé « suivi » du repas du jour)
"""
from collections import defaultdict
from datetime import date, datetime, time, timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Commande, IncidentRepas, Menu, ParametresSociete, Retrait, SuiviRepas, User, etapes_suivi_defaut,
)
from .permissions import IsAgentComptoir, IsAuthenticated, IsGestionnaireRole, agences_gerees, is_admin

ORDRE = ['confirmee', 'preparation', 'en_route', 'arrive', 'retire']
LIBELLES = {'confirmee': 'Confirmée', 'preparation': 'Préparation', 'en_route': 'En route',
            'arrive': 'Arrivé', 'retire': 'Retiré'}
ACTIONS = {'preparation': 'Préparation', 'en_route': 'Livraison partie', 'arrive': 'Arrivé au comptoir'}
ACTIVES = ('en_attente', 'retiree')
# Préférences de l'employé (« arrive » ne se coupe pas)
PREFERENCES = ['preparation', 'en_route', 'rappel', 'incidents']


# ══════════════════════════════════════════════════════════════
# RÉGLAGES
# ══════════════════════════════════════════════════════════════

def config(p=None):
    """Étapes : réglages enregistrés complétés par les valeurs par défaut."""
    p = p or ParametresSociete.charger()
    stocke = p.suivi_etapes if isinstance(p.suivi_etapes, dict) else {}
    res = {}
    for cle, defaut in etapes_suivi_defaut().items():
        val = stocke.get(cle) if isinstance(stocke.get(cle), dict) else {}
        res[cle] = {**defaut, **{k: v for k, v in val.items() if k in defaut}}
    return res


def valider_config(valeur):
    """Contrôle et normalise ParametresSociete.suivi_etapes (PATCH société)."""
    if not isinstance(valeur, dict):
        raise ValidationError({'suivi_etapes': "Format invalide."})
    defaut = etapes_suivi_defaut()
    res = {}
    for cle, d in defaut.items():
        v = valeur.get(cle) if isinstance(valeur.get(cle), dict) else {}
        e = dict(d)
        for k in ('actif', 'push', 'auto'):
            if k in d and k in v:
                e[k] = bool(v[k])
        if 'auto_heures' in d and 'auto_heures' in v:
            try:
                h = v['auto_heures']
                e['auto_heures'] = None if h in (None, '') else float(h)
            except (TypeError, ValueError):
                raise ValidationError({'suivi_etapes': "Heures de préparation automatique invalides."})
            if e['auto_heures'] is not None and not (0 <= e['auto_heures'] <= 12):
                raise ValidationError({'suivi_etapes': "Préparation automatique : entre 0 et 12 heures."})
        res[cle] = e
    res['retire']['push'] = True   # notification « Retrait validé » (contestation possible)
    return res


# ══════════════════════════════════════════════════════════════
# ÉTAT D'UN SERVICE
# ══════════════════════════════════════════════════════════════

def _hm(dt):
    return timezone.localtime(dt).strftime('%H:%M') if dt else None


def _h(t):
    """time → « 11 h 30 »"""
    if t is None:
        return ''
    return f"{t.hour} h" if t.minute == 0 else f"{t.hour} h {t.minute:02d}"


def fenetre(menu, p):
    from .prestataires import fenetre_retrait
    return fenetre_retrait(menu.date_menu, menu.agence, menu.typeequipe, p)


def suivi_de(menu):
    try:
        return menu.suivi
    except SuiviRepas.DoesNotExist:
        return None


def instants(menu, suivi, p, cfg, maintenant):
    """{etape: (datetime, auto, par)} des étapes de service faites (déclarées ou automatiques)."""
    debut, _fin = fenetre(menu, p)
    res = {}
    s = suivi
    if cfg['preparation']['actif']:
        if s and s.preparation_le:
            res['preparation'] = (s.preparation_le, s.preparation_auto, s.preparation_par)
        elif cfg['preparation'].get('auto_heures') is not None:
            t = debut - timedelta(hours=cfg['preparation']['auto_heures'])
            if maintenant >= t:
                res['preparation'] = (t, True, None)
    if cfg['en_route']['actif'] and s and s.en_route_le:
        res['en_route'] = (s.en_route_le, False, s.en_route_par)
    if cfg['arrive']['actif']:
        if s and s.arrive_le:
            res['arrive'] = (s.arrive_le, s.arrive_auto, s.arrive_par)
        elif cfg['arrive'].get('auto') and maintenant >= debut:
            res['arrive'] = (debut, True, None)
    return res


def dernier_incident(menu):
    i = menu.incidents_suivi.select_related('par').first()
    if i is None:
        return None
    return {'id': i.id, 'type': i.type, 'type_libelle': i.get_type_display(),
            'heure_prevue': i.heure_prevue.strftime('%H:%M') if i.heure_prevue else None,
            'message': i.message, 'le': i.created_at.isoformat(), 'heure': _hm(i.created_at)}


def etat_service(menu, p=None, cfg=None, maintenant=None, commande=None, retrait=None):
    """
    Frise d'un service (ou du repas d'un employé si `commande`) :
    {etapes: [{code, libelle, statut: fait|en_cours|a_venir, heure, auto, par}],
     etape_courante, prochaine_action, statut_libelle, message, incident, debut, fin}
    """
    from .serializers import nom_complet
    p = p or ParametresSociete.charger()
    cfg = cfg or config(p)
    maintenant = maintenant or timezone.now()
    debut, fin = fenetre(menu, p)
    faits = instants(menu, suivi_de(menu), p, cfg, maintenant)
    if commande is not None:
        faits['confirmee'] = (commande.date_commande, False, None)
        if commande.statut == 'retiree':
            r = retrait or Retrait.objects.filter(user_id=commande.user_id, menu_id=menu.id).first()
            faits['retire'] = (r.date_retrait if r else maintenant, False, None)
    incident = dernier_incident(menu) if cfg and p.suivi_incidents_actif else None
    actives = [e for e in ORDRE if cfg[e]['actif'] and (commande is not None or e not in ('confirmee', 'retire'))]
    dernier_fait = max((i for i, e in enumerate(actives) if e in faits), default=-1)
    etapes = []
    for i, e in enumerate(actives):
        if e in faits or i < dernier_fait:
            st = 'fait'
        elif i == dernier_fait + 1:
            st = 'en_cours'
        else:
            st = 'a_venir'
        dt, auto, par = faits.get(e, (None, False, None))
        heure = (timezone.localtime(dt).strftime('%d/%m') if e == 'confirmee' and dt else _hm(dt))
        prevu = None
        if e == 'arrive' and st != 'fait':
            prevu = (incident['heure_prevue'] if incident and incident['type'] == 'retard' and incident['heure_prevue']
                     else debut.strftime('%H:%M'))
        etapes.append({'code': e, 'libelle': LIBELLES[e], 'statut': st, 'heure': heure, 'prevu': prevu,
                       'auto': bool(auto), 'par': nom_complet(par) if par else None})
    courante = next((x['code'] for x in etapes if x['statut'] == 'en_cours'), None)
    # Prochaine action du prestataire : première étape de service non faite
    prochaine = next((e for e in ('preparation', 'en_route', 'arrive')
                      if cfg[e]['actif'] and e not in faits), None)
    retard = incident if incident and incident['type'] == 'retard' and 'arrive' not in faits else None
    agence = menu.agence.nom_agence
    if commande is not None and commande.statut == 'retiree':
        message, statut = 'Repas retiré. Bon appétit !', 'retire'
    elif 'arrive' in faits:
        message, statut = f"Votre repas vous attend au comptoir de {agence}.", 'arrive'
    elif retard:
        message = f"Retard signalé : arrivée prévue vers {retard['heure_prevue'].replace(':', ' h ')}"
        statut = 'retard'
    elif 'en_route' in faits:
        message = f"Le repas est en route vers l'agence · arrivée prévue vers {_h(debut.time())}"
        statut = 'en_route'
    elif 'preparation' in faits:
        message, statut = f"Votre repas est en préparation chez {_nom_presta(menu)}.", 'preparation'
    else:
        message, statut = f"Retrait {_h(debut.time())} – {_h(fin.time())} à {agence}.", 'confirmee'
    libelles = {'retire': 'Retiré', 'arrive': 'À retirer', 'retard': 'Retard', 'en_route': 'En route',
                'preparation': 'En préparation', 'confirmee': 'Confirmée'}
    return {'etapes': etapes, 'etape_courante': courante, 'prochaine_action': prochaine,
            'prochaine_action_libelle': ACTIONS.get(prochaine), 'statut': statut,
            'statut_libelle': libelles[statut], 'message': message, 'incident': incident,
            'debut': debut.isoformat(), 'fin': fin.isoformat(),
            'heure_debut': debut.strftime('%H:%M'), 'heure_fin': fin.strftime('%H:%M'),
            'retrait_lendemain': fin.date() > debut.date()}


def _nom_presta(menu):
    return menu.prestataire.nom_public if menu.prestataire_id else 'Cantine UbiPharm'


def suivi_employe(user, maintenant=None):
    """Repas du jour de l'employé (ou repas de nuit de la veille en cours) et sa frise, ou None."""
    from .prestataires import menus_retirables
    maintenant = maintenant or timezone.now()
    p = ParametresSociete.charger()
    aujourdhui = timezone.localdate(maintenant)
    commandes = list(Commande.objects.filter(user=user, statut__in=ACTIVES,
                                             menu__date_menu__in=[aujourdhui, aujourdhui - timedelta(days=1)])
                     .select_related('menu__agence', 'menu__typeequipe', 'menu__prestataire', 'plat'))
    if not commandes:
        return None
    retirables = {m.id for m in menus_retirables(Menu.objects.filter(id__in=[c.menu_id for c in commandes]),
                                                 maintenant, p)}
    # Repas de nuit de la veille encore à retirer d'abord, sinon celui du jour
    candidats = [c for c in commandes if c.menu_id in retirables]
    if not candidats:
        return None
    candidats.sort(key=lambda c: (c.statut == 'retiree', c.menu.date_menu))
    c = candidats[0]
    return {'commande_id': c.id, 'menu_id': c.menu_id, 'date_menu': c.menu.date_menu.isoformat(),
            'plat': c.plat.nom, 'agence': c.menu.agence.nom_agence, 'prestataire': _nom_presta(c.menu),
            'equipe': c.menu.typeequipe.libelle if c.menu.typeequipe_id else None,
            **etat_service(c.menu, p, maintenant=maintenant, commande=c)}


# ══════════════════════════════════════════════════════════════
# NOTIFICATIONS
# ══════════════════════════════════════════════════════════════

def _veut(user, cle, p):
    if not p.suivi_preferences_employe:
        return True
    prefs = user.preferences_suivi if isinstance(user.preferences_suivi, dict) else {}
    return prefs.get(cle, True) is not False


def _commandes_a_prevenir(menu):
    return list(Commande.objects.filter(menu=menu, statut='en_attente').select_related('user', 'plat'))


def _envoyer(user_ids, titre, message, menu_id, donnees=None):
    from .fcm_service import envoyer_notification_user
    for u in User.objects.filter(id__in=user_ids, is_active=True):
        envoyer_notification_user(user=u, titre=titre, message=message, type_notif='suivi_repas',
                                  menu_id=menu_id, donnees=donnees or {})


def _envoyer_par_user(messages, menu_id, donnees=None):
    """messages : [(user_id, titre, message)]"""
    from .fcm_service import envoyer_notification_user
    users = {u.id: u for u in User.objects.filter(id__in=[m[0] for m in messages], is_active=True)}
    for uid, titre, message in messages:
        if uid in users:
            envoyer_notification_user(user=users[uid], titre=titre, message=message, type_notif='suivi_repas',
                                      menu_id=menu_id, donnees=donnees or {})


def notifier_etape(menu, etape, p=None):
    """Notification push de l'étape aux employés du service (selon réglages et préférences)."""
    from .signals import _en_arriere_plan
    p = p or ParametresSociete.charger()
    cfg = config(p)
    if not cfg[etape]['actif'] or not cfg[etape]['push']:
        return 0
    debut, fin = fenetre(menu, p)
    agence = menu.agence.nom_agence
    messages = []
    for c in _commandes_a_prevenir(menu):
        if etape != 'arrive' and not _veut(c.user, etape, p):
            continue
        if etape == 'preparation':
            messages.append((c.user_id, '👩🏾‍🍳 Repas en préparation',
                             f"Votre {c.plat.nom} est en préparation chez {_nom_presta(menu)}."))
        elif etape == 'en_route':
            messages.append((c.user_id, '🚚 Repas en route',
                             f"Votre {c.plat.nom} est en route vers {agence} · arrivée prévue vers {_h(debut.time())}."))
        elif etape == 'arrive':
            messages.append((c.user_id, '🍽️ Votre repas est arrivé',
                             f"Votre {c.plat.nom} vous attend au comptoir de {agence}. "
                             f"Retrait jusqu'à {_h(fin.time())}{' (lendemain)' if fin.date() > debut.date() else ''}."))
    if messages:
        _en_arriere_plan(_envoyer_par_user, messages, menu.id, {'etape': etape})
    return len(messages)


def notifier_incident(incident, p=None):
    from .signals import _en_arriere_plan, _gestionnaires_agence
    p = p or ParametresSociete.charger()
    menu = incident.menu
    if incident.type == 'retard':
        h = incident.heure_prevue
        titre = '⏱️ Retard de livraison'
        corps = f"Arrivée prévue vers {_h(h)} à {menu.agence.nom_agence}."
    else:
        titre = '⚠️ Information sur votre repas'
        corps = ''
    if incident.message:
        corps = f"{corps} {incident.message}".strip()
    employes = [c.user_id for c in _commandes_a_prevenir(menu) if _veut(c.user, 'incidents', p)]
    gest = [u.id for u in _gestionnaires_agence(menu.agence_id)]
    if employes:
        _en_arriere_plan(_envoyer, employes, titre, corps, menu.id, {'incident': incident.type})
    if gest:
        equipe = menu.typeequipe.libelle if menu.typeequipe_id else ''
        _en_arriere_plan(_envoyer, gest, f"{titre} · {_nom_presta(menu)}",
                         f"{menu.agence.nom_agence}, équipe {equipe} : {corps}", menu.id, {'incident': incident.type})
    return len(employes)


# ══════════════════════════════════════════════════════════════
# DÉCLARATIONS DU PRESTATAIRE
# ══════════════════════════════════════════════════════════════

def declarer(menu, etape, par, p=None, maintenant=None):
    p = p or ParametresSociete.charger()
    cfg = config(p)
    if etape not in ACTIONS:
        raise ValidationError({'etape': "Étape invalide (preparation, en_route, arrive)."})
    if not cfg[etape]['actif']:
        raise ValidationError({'etape': "Cette étape n'est pas utilisée (Paramètres → Société)."})
    maintenant = maintenant or timezone.now()
    with transaction.atomic():
        suivi, _ = SuiviRepas.objects.select_for_update().get_or_create(menu=menu)
        if getattr(suivi, f'{etape}_le') and not (etape in ('preparation', 'arrive')
                                                 and getattr(suivi, f'{etape}_auto')):
            raise ValidationError(f"« {ACTIONS[etape]} » est déjà enregistré.")
        setattr(suivi, f'{etape}_le', maintenant)
        setattr(suivi, f'{etape}_par', par)
        if etape in ('preparation', 'arrive'):
            setattr(suivi, f'{etape}_auto', False)
        suivi.save()
    nb = notifier_etape(menu, etape, p)
    return suivi, nb


def taches_suivi(maintenant=None):
    """
    Toutes les 5 min (commande taches_planifiees) : préparation et arrivée
    automatiques enregistrées (et notifiées), rappel avant la fin du retrait.
    """
    from .prestataires import menus_retirables
    maintenant = maintenant or timezone.now()
    p = ParametresSociete.charger()
    cfg = config(p)
    aujourdhui = timezone.localdate(maintenant)
    menus = Menu.objects.filter(date_menu__in=[aujourdhui, aujourdhui - timedelta(days=1)],
                                commandes__statut__in=ACTIVES).distinct()
    compte = {'preparation': 0, 'arrive': 0, 'rappels': 0}
    for menu in menus_retirables(menus, maintenant, p):
        debut, fin = fenetre(menu, p)
        suivi = suivi_de(menu)
        prep = cfg['preparation']
        if prep['actif'] and prep.get('auto_heures') is not None and not (suivi and suivi.preparation_le):
            t = debut - timedelta(hours=prep['auto_heures'])
            if t <= maintenant < fin:
                suivi, cree = SuiviRepas.objects.get_or_create(menu=menu)
                if not suivi.preparation_le:
                    suivi.preparation_le, suivi.preparation_auto = t, True
                    suivi.save(update_fields=['preparation_le', 'preparation_auto', 'updated_at'])
                    compte['preparation'] += 1
                    notifier_etape(menu, 'preparation', p)
        arr = cfg['arrive']
        if arr['actif'] and arr.get('auto') and not (suivi and suivi.arrive_le) and debut <= maintenant < fin:
            suivi, _ = SuiviRepas.objects.get_or_create(menu=menu)
            if not suivi.arrive_le:
                suivi.arrive_le, suivi.arrive_auto = debut, True
                suivi.save(update_fields=['arrive_le', 'arrive_auto', 'updated_at'])
                compte['arrive'] += 1
                notifier_etape(menu, 'arrive', p)
        if (p.suivi_rappel_actif and suivi and suivi.arrive_le and not suivi.rappel_envoye_le
                and fin - timedelta(minutes=p.suivi_rappel_minutes) <= maintenant < fin):
            suivi.rappel_envoye_le = maintenant
            suivi.save(update_fields=['rappel_envoye_le', 'updated_at'])
            messages = [(c.user_id, '⏰ Votre repas vous attend',
                         f"Le retrait se termine dans {p.suivi_rappel_minutes} min ({_h(fin.time())}) "
                         f"au comptoir de {menu.agence.nom_agence}.")
                        for c in _commandes_a_prevenir(menu) if _veut(c.user, 'rappel', p)]
            if messages:
                from .signals import _en_arriere_plan
                _en_arriere_plan(_envoyer_par_user, messages, menu.id, {'rappel': True})
                compte['rappels'] += len(messages)
    return compte


# ══════════════════════════════════════════════════════════════
# VUES
# ══════════════════════════════════════════════════════════════

def _service_json(menu, p, cfg, maintenant, stats=None):
    nb, nb_retires = stats.get(menu.id, (0, 0)) if stats is not None else (0, 0)
    return {'menu_id': menu.id, 'date_menu': menu.date_menu.isoformat(),
            'agence_id': menu.agence_id, 'agence': menu.agence.nom_agence,
            'equipe': menu.typeequipe.libelle if menu.typeequipe_id else None,
            'prestataire_id': menu.prestataire_id, 'prestataire': _nom_presta(menu),
            'nb_repas': nb, 'nb_retires': nb_retires,
            **etat_service(menu, p, cfg, maintenant)}


def _stats(menu_ids):
    res = {}
    for r in (Commande.objects.filter(menu_id__in=menu_ids, statut__in=ACTIVES).values('menu_id')
              .annotate(n=Count('id'), r=Count('id', filter=Q(statut='retiree')))):
        res[r['menu_id']] = (r['n'], r['r'])
    return res


def _reglages_json(p, cfg):
    return {'etapes': cfg, 'incidents_actif': p.suivi_incidents_actif,
            'rappel_actif': p.suivi_rappel_actif, 'rappel_minutes': p.suivi_rappel_minutes}


class PrestataireSuiviView(APIView):
    """GET prestataire/suivi/ : services du jour (et de nuit de la veille en cours) du prestataire."""
    permission_classes = [IsAgentComptoir]

    def get(self, request):
        from .prestataires import menus_du_prestataire
        maintenant = timezone.now()
        p = ParametresSociete.charger()
        cfg = config(p)
        aujourdhui = timezone.localdate(maintenant)
        qs = menus_du_prestataire(request.user.prestataire_id).filter(
            date_menu__in=[aujourdhui, aujourdhui - timedelta(days=1)])
        menus = [m for m in qs.select_related('agence', 'typeequipe', 'prestataire')
                 if m.date_menu == aujourdhui or maintenant <= fenetre(m, p)[1]]
        stats = _stats([m.id for m in menus])
        menus = [m for m in menus if stats.get(m.id, (0, 0))[0]]
        menus.sort(key=lambda m: (fenetre(m, p)[0], m.agence.nom_agence))
        return Response({'date': aujourdhui.isoformat(), 'reglages': _reglages_json(p, cfg),
                         'services': [_service_json(m, p, cfg, maintenant, stats) for m in menus]})


def _menu_prestataire(request, pk):
    from .prestataires import menus_du_prestataire
    menu = (menus_du_prestataire(request.user.prestataire_id).filter(pk=pk)
            .select_related('agence', 'typeequipe', 'prestataire').first())
    if menu is None:
        raise NotFound("Service introuvable pour votre prestataire.")
    p = ParametresSociete.charger()
    debut, fin = fenetre(menu, p)
    maintenant = timezone.now()
    if menu.date_menu != timezone.localdate(maintenant) and maintenant > fin:
        raise ValidationError("Ce service est terminé.")
    return menu, p


class PrestataireSuiviEtapeView(APIView):
    """POST prestataire/suivi/<menu_id>/ {etape} : Préparation, Livraison partie, Arrivé au comptoir."""
    permission_classes = [IsAgentComptoir]

    def post(self, request, pk):
        menu, p = _menu_prestataire(request, pk)
        _, nb = declarer(menu, request.data.get('etape'), request.user, p)
        return Response({'notifies': nb, 'service': _service_json(menu, p, config(p), timezone.now(),
                                                                  _stats([menu.id]))})


class PrestataireIncidentView(APIView):
    """POST prestataire/suivi/<menu_id>/incident/ {type: retard|autre, heure: HH:MM, message}"""
    permission_classes = [IsAgentComptoir]

    def post(self, request, pk):
        menu, p = _menu_prestataire(request, pk)
        if not p.suivi_incidents_actif:
            raise ValidationError("Le signalement d'incidents n'est pas activé.")
        d = request.data
        type_ = d.get('type')
        if type_ not in ('retard', 'autre'):
            raise ValidationError({'type': "Type invalide (retard, autre)."})
        heure = None
        message = str(d.get('message') or '').strip()[:300]
        if type_ == 'retard':
            try:
                heure = time.fromisoformat(str(d.get('heure') or '')[:5])
            except ValueError:
                raise ValidationError({'heure': "Nouvelle heure d'arrivée requise (HH:MM)."})
        elif not message:
            raise ValidationError({'message': "Décrivez l'incident."})
        incident = IncidentRepas.objects.create(menu=menu, type=type_, heure_prevue=heure, message=message,
                                                par=request.user)
        nb = notifier_incident(incident, p)
        return Response({'notifies': nb, 'service': _service_json(menu, p, config(p), timezone.now(),
                                                                  _stats([menu.id]))}, status=201)


def _date(valeur):
    if not valeur:
        return timezone.localdate()
    try:
        return date.fromisoformat(str(valeur)[:10])
    except ValueError:
        raise ValidationError({'date': "Date invalide (AAAA-MM-JJ)."})


def _agences(request):
    geres = None if is_admin(request.user) else (agences_gerees(request.user) or set())
    a = request.query_params.get('agence')
    if str(a or '').isdigit():
        a = int(a)
        if geres is not None and a not in geres:
            raise PermissionDenied("Agence non gérée.")
        return {a}
    return geres


class SuiviLivraisonsView(APIView):
    """GET suivi-livraisons/?date=&agence= : services du jour (gestionnaires, administrateurs)."""
    permission_classes = [IsGestionnaireRole]

    def get(self, request):
        d = _date(request.query_params.get('date'))
        agences = _agences(request)
        p = ParametresSociete.charger()
        cfg = config(p)
        maintenant = timezone.now()
        qs = Menu.objects.filter(date_menu=d).select_related('agence', 'typeequipe', 'prestataire')
        if agences is not None:
            qs = qs.filter(agence_id__in=agences)
        menus = list(qs)
        stats = _stats([m.id for m in menus])
        menus = [m for m in menus if stats.get(m.id, (0, 0))[0]]
        services = []
        for m in sorted(menus, key=lambda m: (m.agence.nom_agence, fenetre(m, p)[0])):
            s = _service_json(m, p, cfg, maintenant, stats)
            s['ponctualite'] = _ponctualite_service(m, p, maintenant)
            services.append(s)
        return Response({'date': d.isoformat(), 'reglages': _reglages_json(p, cfg), 'services': services})


def _ponctualite_service(menu, p, maintenant):
    """{statut: a_l_heure|retard|non_signale|a_venir, retard_minutes}"""
    debut, _ = fenetre(menu, p)
    s = suivi_de(menu)
    if s and s.arrive_le and not s.arrive_auto:
        minutes = int((s.arrive_le - debut).total_seconds() // 60)
        return {'statut': 'a_l_heure' if minutes <= 0 else 'retard', 'retard_minutes': max(minutes, 0),
                'arrivee': _hm(s.arrive_le)}
    if maintenant < debut:
        return {'statut': 'a_venir', 'retard_minutes': None, 'arrivee': None}
    return {'statut': 'non_signale', 'retard_minutes': None, 'arrivee': None}


class PonctualiteView(APIView):
    """GET suivi-livraisons/ponctualite/?annee=&mois=&agence= : par prestataire (information, sans pénalité)."""
    permission_classes = [IsGestionnaireRole]

    def get(self, request):
        q = request.query_params
        auj = timezone.localdate()
        annee = int(q['annee']) if str(q.get('annee') or '').isdigit() else auj.year
        mois = int(q['mois']) if str(q.get('mois') or '').isdigit() else auj.month
        if not 1 <= mois <= 12:
            raise ValidationError({'mois': "Mois invalide."})
        debut_m = date(annee, mois, 1)
        fin_m = (date(annee + mois // 12, mois % 12 + 1, 1) - timedelta(days=1))
        agences = _agences(request)
        p = ParametresSociete.charger()
        maintenant = timezone.now()
        qs = (Menu.objects.filter(date_menu__gte=debut_m, date_menu__lte=min(fin_m, auj),
                                  commandes__statut__in=ACTIVES).distinct()
              .select_related('agence', 'typeequipe', 'prestataire', 'suivi'))
        if agences is not None:
            qs = qs.filter(agence_id__in=agences)
        incidents = defaultdict(int)
        for menu_id, n in (IncidentRepas.objects.filter(menu__in=qs).values_list('menu_id')
                           .annotate(n=Count('id'))):
            incidents[menu_id] = n
        par = defaultdict(lambda: {'services': 0, 'a_l_heure': 0, 'retards': [], 'incidents': 0, 'non_signale': 0})
        noms = {}
        for m in qs:
            pt = _ponctualite_service(m, p, maintenant)
            if pt['statut'] == 'a_venir':
                continue
            cle = m.prestataire_id or 0
            noms[cle] = _nom_presta(m)
            r = par[cle]
            r['services'] += 1
            r['incidents'] += incidents.get(m.id, 0)
            if pt['statut'] == 'a_l_heure':
                r['a_l_heure'] += 1
            elif pt['statut'] == 'retard':
                r['retards'].append(pt['retard_minutes'])
            else:
                r['non_signale'] += 1
        lignes = []
        for cle, r in par.items():
            signales = r['a_l_heure'] + len(r['retards'])
            lignes.append({'prestataire_id': cle or None, 'prestataire': noms[cle], 'services': r['services'],
                           'a_l_heure': r['a_l_heure'], 'retards': len(r['retards']),
                           'taux_a_l_heure': round(100 * r['a_l_heure'] / signales) if signales else None,
                           'retard_moyen_minutes': round(sum(r['retards']) / len(r['retards']))
                           if r['retards'] else None,
                           'incidents': r['incidents'], 'arrivees_non_signalees': r['non_signale']})
        lignes.sort(key=lambda l: (-(l['taux_a_l_heure'] or 0), l['prestataire']))
        return Response({'annee': annee, 'mois': mois, 'prestataires': lignes})


class PreferencesSuiviView(APIView):
    """GET / PATCH suivi/preferences/ : notifications du suivi que l'employé reçoit."""
    permission_classes = [IsAuthenticated]

    def _json(self, user, p):
        cfg = config(p)
        prefs = user.preferences_suivi if isinstance(user.preferences_suivi, dict) else {}
        disponibles = {
            'preparation': cfg['preparation']['actif'] and cfg['preparation']['push'],
            'en_route': cfg['en_route']['actif'] and cfg['en_route']['push'],
            'rappel': p.suivi_rappel_actif,
            'incidents': p.suivi_incidents_actif,
        }
        return {'modifiable': p.suivi_preferences_employe, 'rappel_minutes': p.suivi_rappel_minutes,
                'arrive_actif': cfg['arrive']['actif'] and cfg['arrive']['push'],
                'preferences': [{'code': k, 'disponible': disponibles[k], 'actif': prefs.get(k, True) is not False}
                                for k in PREFERENCES]}

    def get(self, request):
        return Response(self._json(request.user, ParametresSociete.charger()))

    def patch(self, request):
        p = ParametresSociete.charger()
        if not p.suivi_preferences_employe:
            raise PermissionDenied("Les notifications du suivi ne sont pas modifiables.")
        prefs = dict(request.user.preferences_suivi or {})
        for k in PREFERENCES:
            if k in request.data:
                prefs[k] = bool(request.data[k]) if not isinstance(request.data[k], str) \
                    else request.data[k].lower() in ('1', 'true', 'oui')
        request.user.preferences_suivi = prefs
        request.user.save(update_fields=['preferences_suivi'])
        return Response(self._json(request.user, p))
