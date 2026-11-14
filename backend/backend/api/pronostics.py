"""
Pronostics sportifs : l'administrateur saisit les matchs d'une compétition
(CAN, Ligue des champions…), puis les scores.

  - Pronostic (score des deux équipes) modifiable jusqu'au coup d'envoi
    (heure du serveur). Condition : au moins repas_minimum repas commandés
    (non annulés) dans le mois du match. Les pronostics des autres sont
    visibles (tendances) après le coup d'envoi.
  - Points : score exact = points_exact ; bon vainqueur ou bon match nul =
    points_resultat ; sinon 0. Match annulé : 0 pour tous.
  - Classement : points, puis nombre de scores exacts, puis de bons
    résultats, puis tirage au sort enregistré à la publication.
  - Lots par rang (nombre de gagnants = somme des lots), publiés quand tous
    les matchs ont un score (ou sont annulés) ; argent crédité, objets à remettre.
  - Notifications : programmation, rappel chaque matin des matchs du jour
    non pronostiqués, points gagnés à la saisie du score, résultats.

API employé : GET pronostics/ · GET pronostics/<id>/ · POST pronostics/matchs/<id>/ {score_a, score_b}
              GET pronostics/<id>/classement/
API administration : GET/POST admin/pronostics/ · GET/PUT/DELETE admin/pronostics/<id>/
  POST admin/pronostics/<id>/programmer|annuler|publier-resultats/ · GET admin/pronostics/<id>/classement/
  POST admin/pronostics/<id>/matchs/ · PUT/DELETE admin/pronostics/matchs/<id>/
  POST admin/pronostics/matchs/<id>/score/ {score_a, score_b} ou {annule: true}
"""
import random
from collections import defaultdict
from datetime import time, timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import gains
from . import suspensions as _susp
from .models import (
    Agence, Commande, CompetitionPronostics, LotPronostics, MatchPronostics, Pronostic, ResultatPronostics,
)
from .permissions import IsAuthenticated, ReadGestionnaireWriteAdmin

HEURE_RAPPEL = time(8, 0)
MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre',
        'novembre', 'décembre']


def _iso(dt):
    return timezone.localtime(dt).isoformat() if dt else None


def _quand(dt):
    return timezone.localtime(dt).strftime('%d/%m à %H:%M')


def _donnees(c):
    return {'ecran': 'pronostics', 'competition_id': c.id}


def etat(c, maintenant=None):
    maintenant = maintenant or timezone.now()
    if c.annule_le:
        return 'annule'
    if not c.publie_le:
        return 'brouillon'
    if c.resultats_publies_le:
        return 'resultats'
    matchs = list(c.matchs.all())
    if not matchs or maintenant < matchs[0].coup_envoi:
        return 'a_venir'
    if all(m.annule or m.score_a is not None for m in matchs):
        return 'terminee'
    return 'en_cours'


LIBELLES_ETAT = {'annule': 'Annulée', 'brouillon': 'Brouillon', 'resultats': 'Résultats publiés',
                 'a_venir': 'Programmée', 'en_cours': 'En cours', 'terminee': 'Terminée'}


def points_pronostic(c, m, p_a, p_b):
    if m.annule or m.score_a is None:
        return 0
    if (p_a, p_b) == (m.score_a, m.score_b):
        return c.points_exact
    signe = lambda x, y: (x > y) - (x < y)
    return c.points_resultat if signe(p_a, p_b) == signe(m.score_a, m.score_b) else 0


def destinataires(c, maintenant=None):
    from .jeux import destinataires_agences
    return destinataires_agences(list(c.agences.values_list('id', flat=True)), maintenant)


def eligibilite(user, c, m):
    d = timezone.localdate(m.coup_envoi)
    n = (Commande.objects.filter(user=user, menu__date_menu__year=d.year, menu__date_menu__month=d.month)
         .exclude(statut='annulee').exclude(mode_paiement='offert').count())
    ok = n >= c.repas_minimum
    mois = f"{MOIS[d.month - 1]} {d.year}"
    return {'ok': ok, 'nb_repas': n, 'minimum': c.repas_minimum, 'mois': mois,
            'message': (f"{n} repas commandé(s) en {mois}." if ok else
                        f"Commandez au moins {c.repas_minimum} repas en {mois} pour pronostiquer ce match.")}


def pronostiquer(m, user, score_a, score_b, maintenant=None):
    from .jeux import concerne
    from .permissions import exiger_employe
    from .suspensions import exiger_actif
    exiger_employe(user)
    maintenant = maintenant or timezone.now()
    c = m.competition
    exiger_actif('pronostics', c.id)
    if etat(c, maintenant) not in ('a_venir', 'en_cours') or m.annule:
        raise ValidationError("Les pronostics sont fermés pour ce match.")
    if maintenant >= m.coup_envoi:
        raise ValidationError("Le match a commencé : pronostics fermés.")
    if not concerne(user, c, maintenant):
        raise PermissionDenied("Cette compétition est réservée à d'autres agences.")
    try:
        a, b = int(score_a), int(score_b)
    except (TypeError, ValueError):
        raise ValidationError("Score invalide.")
    if not (0 <= a <= 30 and 0 <= b <= 30):
        raise ValidationError("Score invalide (0 à 30).")
    elig = eligibilite(user, c, m)
    if not elig['ok']:
        raise ValidationError(elig['message'])
    p, _ = Pronostic.objects.update_or_create(match=m, user=user, defaults={'score_a': a, 'score_b': b})
    return p


def saisir_score(m, score_a, score_b, annule, par, maintenant=None):
    maintenant = maintenant or timezone.now()
    c = m.competition
    if c.resultats_publies_le:
        raise ValidationError("Les résultats sont publiés : scores figés.")
    if maintenant < m.coup_envoi:
        raise ValidationError("Le match n'a pas commencé.")
    with transaction.atomic():
        m = MatchPronostics.objects.select_for_update().get(pk=m.pk)
        if annule:
            m.annule, m.score_a, m.score_b = True, None, None
        else:
            try:
                a, b = int(score_a), int(score_b)
            except (TypeError, ValueError):
                raise ValidationError("Score invalide.")
            if not (0 <= a <= 50 and 0 <= b <= 50):
                raise ValidationError("Score invalide.")
            m.annule, m.score_a, m.score_b = False, a, b
        premier = m.score_saisi_le is None
        m.score_saisi_le = maintenant
        m.save(update_fields=['annule', 'score_a', 'score_b', 'score_saisi_le'])
        messages = []
        for p in m.pronostics.all():
            p.points = points_pronostic(c, m, p.score_a, p.score_b)
            p.save(update_fields=['points', 'updated_at'])
            if premier and not m.annule:
                messages.append((p.user_id, f"⚽ {m.equipe_a} {m.score_a}-{m.score_b} {m.equipe_b}",
                                 f"Votre pronostic {p.score_a}-{p.score_b} : "
                                 + (f"+{p.points} point{'s' if p.points > 1 else ''} !" if p.points else "0 point.")
                                 + f" ({c.titre})", _donnees(c)))
        transaction.on_commit(lambda: gains.notifier_par_user(messages))
    return m


def totaux(c):
    """{user_id: (points, exacts, bons_resultats, nb_pronostics)}"""
    res = defaultdict(lambda: [0, 0, 0, 0])
    for p in Pronostic.objects.filter(match__competition=c).select_related('match'):
        t = res[p.user_id]
        t[3] += 1
        pts = p.points or 0
        t[0] += pts
        if pts and pts == c.points_exact and (p.score_a, p.score_b) == (p.match.score_a, p.match.score_b):
            t[1] += 1
        elif pts:
            t[2] += 1
    return {u: tuple(v) for u, v in res.items()}


def classer(c, tirages=None):
    t = totaux(c)
    tirages = tirages or {}
    return sorted(t.items(), key=lambda kv: (-kv[1][0], -kv[1][1], -kv[1][2], tirages.get(kv[0], 0), kv[0]))


def publier_resultats(c, par, maintenant=None):
    maintenant = maintenant or timezone.now()
    with transaction.atomic():
        c = CompetitionPronostics.objects.select_for_update().get(pk=c.pk)
        e = etat(c, maintenant)
        if e == 'resultats':
            raise ValidationError("Les résultats sont déjà publiés.")
        if e != 'terminee':
            raise ValidationError("Saisissez le score de tous les matchs (ou annulez-les) avant de publier.")
        tirages = {u: random.random() for u in totaux(c)}
        exemplaires = []
        for lot in c.lots.order_by('rang_debut'):
            exemplaires.extend([lot] * (lot.rang_fin - lot.rang_debut + 1))
        messages = []
        for rang, (uid, (pts, ex, br, _)) in enumerate(classer(c, tirages), start=1):
            lot = exemplaires.pop(0) if exemplaires and pts > 0 else None
            gain = gains.attribuer(uid, 'pronostics', c.id, c.titre, lot.libelle, lot.type, lot.montant, par,
                                   maintenant, lot.valeur) if lot else None
            ResultatPronostics.objects.create(competition=c, user_id=uid, rang=rang, points=pts, nb_exacts=ex,
                                              nb_resultats=br, tirage=tirages[uid], lot=lot, gain=gain)
            if gain:
                messages.append((uid, '🏆 Vous avez gagné !',
                                 f"{c.titre} : {'1er' if rang == 1 else f'{rang}e'} avec {pts} points. Lot : "
                                 f"{gains.libelle_gain(gain.type, gain.libelle, gain.montant)}.", _donnees(c)))
            else:
                messages.append((uid, f"Résultats : {c.titre}",
                                 f"Vous terminez {'1er' if rang == 1 else f'{rang}e'} avec {pts} points. "
                                 "Perdu cette fois, merci d'avoir joué !", _donnees(c)))
        c.resultats_publies_le = maintenant
        c.save(update_fields=['resultats_publies_le', 'updated_at'])
        transaction.on_commit(lambda: gains.notifier_par_user(messages))
    return c


def taches_pronostics(maintenant=None):
    """Chaque matin (à partir de HEURE_RAPPEL) : rappel des matchs du jour non pronostiqués."""
    maintenant = maintenant or timezone.now()
    local = timezone.localtime(maintenant)
    if local.time() < HEURE_RAPPEL:
        return {'rappels_pronostics': 0}
    aujourdhui = local.date()
    n = 0
    for c in CompetitionPronostics.objects.filter(publie_le__isnull=False, annule_le__isnull=True,
                                                  resultats_publies_le__isnull=True):
        from .suspensions import suspendu
        if c.rappel_du == aujourdhui or suspendu('pronostics', c.id):
            continue
        matchs = [m for m in c.matchs.filter(annule=False) if timezone.localdate(m.coup_envoi) == aujourdhui
                  and m.coup_envoi > maintenant]
        if not CompetitionPronostics.objects.filter(pk=c.pk).exclude(rappel_du=aujourdhui).update(rappel_du=aujourdhui):
            continue
        if not matchs:
            continue
        ids = set(destinataires(c, maintenant).values_list('id', flat=True))
        complets = defaultdict(int)
        for uid in Pronostic.objects.filter(match__in=matchs).values_list('user_id', flat=True):
            complets[uid] += 1
        cibles = [u for u in ids if complets.get(u, 0) < len(matchs)]
        affiches = ', '.join(f"{m.equipe_a}-{m.equipe_b} ({timezone.localtime(m.coup_envoi):%H:%M})" for m in matchs[:3])
        gains.notifier(cibles, f"⚽ {len(matchs)} match{'s' if len(matchs) > 1 else ''} aujourd'hui",
                       f"{affiches}{'…' if len(matchs) > 3 else ''} : pronostiquez avant le coup d'envoi !",
                       _donnees(c))
        n += len(cibles)
    return {'rappels_pronostics': n}


# ══════════════════════════════════════════════════════════════
# SÉRIALISATION ET VUES EMPLOYÉ
# ══════════════════════════════════════════════════════════════

def lots_json(c):
    return [{'id': l.id, 'rangs': str(l.rang_debut) if l.rang_debut == l.rang_fin else f"{l.rang_debut}-{l.rang_fin}",
             'rang_debut': l.rang_debut, 'rang_fin': l.rang_fin, 'libelle': l.libelle, 'type': l.type,
             'montant': float(l.montant) if l.montant is not None else None, 'quantite': l.rang_fin - l.rang_debut + 1,
             'libelle_affiche': gains.libelle_gain(l.type, l.libelle, l.montant),
             'valeur': float(l.valeur) if l.valeur is not None else None} for l in c.lots.order_by('rang_debut')]


def match_json(m, maintenant):
    return {'id': m.id, 'equipe_a': m.equipe_a, 'equipe_b': m.equipe_b, 'phase': m.phase,
         'coup_envoi': _iso(m.coup_envoi), 'score_a': m.score_a, 'score_b': m.score_b, 'annule': m.annule,
         'ouvert': not m.annule and maintenant < m.coup_envoi}


def competition_json(c, maintenant):
    from .suspensions import suspension_json
    matchs = list(c.matchs.all())
    return {'id': c.id, 'titre': c.titre, 'description': c.description, 'etat': etat(c, maintenant),
            'serveur': _iso(maintenant), 'points_exact': c.points_exact, 'points_resultat': c.points_resultat,
            'repas_minimum': c.repas_minimum, 'nb_matchs': len(matchs),
            'debut': _iso(matchs[0].coup_envoi) if matchs else None,
            'fin': _iso(matchs[-1].coup_envoi) if matchs else None,
            'lots': lots_json(c), 'nb_gagnants': sum(l.rang_fin - l.rang_debut + 1 for l in c.lots.all()),
            'resultats_publies_le': _iso(c.resultats_publies_le), 'suspension': suspension_json('pronostics', c.id)}


def _ma_place(c, user):
    if c.resultats_publies_le:
        r = c.resultats.filter(user=user).select_related('gain').first()
        return None if r is None else {'rang': r.rang, 'points': r.points, 'nb_exacts': r.nb_exacts,
                                       'gain': gains.gain_json(r.gain) if r.gain_id else None,
                                       'resultat': 'gagne' if r.gain_id else 'perdu'}
    cl = classer(c)
    for rang, (uid, (pts, ex, _, _)) in enumerate(cl, start=1):
        if uid == user.id:
            return {'rang': rang, 'points': pts, 'nb_exacts': ex, 'gain': None, 'resultat': None,
                    'provisoire': True, 'sur': len(cl)}
    return None


def _visibles(user):
    from .jeux import agences_actuelles
    ags = agences_actuelles([user.id]).get(user.id, set())
    return (CompetitionPronostics.objects.filter(publie_le__isnull=False, annule_le__isnull=True)
            .filter(Q(agences__isnull=True) | Q(agences__in=ags) | Q(matchs__pronostics__user=user)).distinct()
            .prefetch_related('matchs', 'lots'))


class PronosticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        maintenant = timezone.now()
        res = []
        for c in _visibles(request.user):
            e = etat(c, maintenant)
            if e == 'resultats' and c.resultats_publies_le < maintenant - timedelta(days=60):
                continue
            prochain = next((m for m in c.matchs.all() if not m.annule and m.coup_envoi > maintenant), None)
            res.append({**competition_json(c, maintenant), 'ma_place': _ma_place(c, request.user),
                        'prochain_match': match_json(prochain, maintenant) if prochain else None,
                        'a_pronostiquer': sum(1 for m in c.matchs.all() if not m.annule and m.coup_envoi > maintenant
                                              and not m.pronostics.filter(user=request.user).exists())})
        ordre = {'en_cours': 0, 'a_venir': 1, 'terminee': 2, 'resultats': 3}
        res.sort(key=lambda d: (ordre.get(d['etat'], 9), d['debut'] or ''))
        return Response({'serveur': _iso(maintenant), 'competitions': res})


def _competition_employe(request, pk):
    c = _visibles(request.user).filter(pk=pk).first()
    if c is None:
        raise NotFound("Compétition introuvable.")
    return c


class PronosticsDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        maintenant = timezone.now()
        c = _competition_employe(request, pk)
        miens = {p.match_id: p for p in Pronostic.objects.filter(user=request.user, match__competition=c)}
        tendances = defaultdict(lambda: [0, 0, 0])
        for mid, a, b in Pronostic.objects.filter(match__competition=c, match__coup_envoi__lte=maintenant) \
                .values_list('match_id', 'score_a', 'score_b'):
            tendances[mid][0 if a > b else (1 if a == b else 2)] += 1
        matchs = []
        for m in c.matchs.all():
            t = tendances.get(m.id) if m.coup_envoi <= maintenant else None
            tend = None
            if t and sum(t):
                tot = sum(t)
                tend = {'a': round(100 * t[0] / tot), 'nul': round(100 * t[1] / tot), 'b': round(100 * t[2] / tot),
                        'nb': tot}
            mien = miens.get(m.id)
            matchs.append({**match_json(m, maintenant), 'tendance': tend, 'mon_pronostic': (
                {'score_a': mien.score_a, 'score_b': mien.score_b, 'points': mien.points} if mien else None)})
        prochain = next((m for m in c.matchs.all() if not m.annule and m.coup_envoi > maintenant), None)
        return Response({**competition_json(c, maintenant), 'matchs': matchs, 'ma_place': _ma_place(c, request.user),
                         'eligibilite': eligibilite(request.user, c, prochain) if prochain else None})


class PronostiquerView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        m = MatchPronostics.objects.select_related('competition').filter(pk=pk).first()
        if m is None or not _visibles(request.user).filter(pk=m.competition_id).exists():
            raise NotFound("Match introuvable.")
        p = pronostiquer(m, request.user, request.data.get('score_a'), request.data.get('score_b'))
        return Response({'match_id': m.id, 'score_a': p.score_a, 'score_b': p.score_b})


class PronosticsClassementView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from .jeux import nom_court
        from .models import User
        c = _competition_employe(request, pk)
        if c.resultats_publies_le:
            lignes = [(r.user_id, r.rang, r.points, r.nb_exacts, r.lot) for r in
                      c.resultats.select_related('lot').order_by('rang')]
        else:
            lignes = [(u, i, t[0], t[1], None) for i, (u, t) in enumerate(classer(c), start=1)]
        users = {u.id: u for u in User.objects.filter(id__in=[l[0] for l in lignes])}
        return Response({'definitif': bool(c.resultats_publies_le), 'lignes': [
            {'rang': rang, 'nom': 'Vous' if uid == request.user.id else nom_court(users[uid]),
             'initiales': ((users[uid].prenom[:1] + users[uid].nom[:1]).upper() or users[uid].username[:2]),
             'moi': uid == request.user.id, 'points': pts, 'nb_exacts': ex,
             'lot': gains.libelle_gain(lot.type, lot.libelle, lot.montant) if lot else None}
            for uid, rang, pts, ex, lot in lignes]})


# ══════════════════════════════════════════════════════════════
# ADMINISTRATION
# ══════════════════════════════════════════════════════════════

def _entier(v, champ, mini, maxi, defaut):
    if v in (None, ''):
        return defaut
    try:
        n = int(v)
    except (TypeError, ValueError):
        raise ValidationError({champ: "Nombre entier attendu."})
    if not mini <= n <= maxi:
        raise ValidationError({champ: f"Entre {mini} et {maxi}."})
    return n


def _date(v, champ):
    dt = parse_datetime(str(v or ''))
    if dt is None:
        raise ValidationError({champ: "Date et heure invalides."})
    return timezone.make_aware(dt, timezone.get_current_timezone()) if timezone.is_naive(dt) else dt


def _lire_lots(donnees):
    from .jeux import _lire_lots as lire
    return lire(donnees)


def _lire_match(d):
    a, b = str(d.get('equipe_a') or '').strip(), str(d.get('equipe_b') or '').strip()
    if not a or not b:
        raise ValidationError({'match': "Les deux équipes sont obligatoires."})
    return {'equipe_a': a[:80], 'equipe_b': b[:80], 'phase': str(d.get('phase') or '').strip()[:80],
            'coup_envoi': _date(d.get('coup_envoi'), 'coup_envoi')}


def enregistrer(c, d, par):
    if c.pk and (c.resultats_publies_le or c.annule_le):
        raise ValidationError("Cette compétition n'est plus modifiable.")
    titre = str(d.get('titre') or '').strip()
    if not titre:
        raise ValidationError({'titre': "Titre obligatoire."})
    lots = _lire_lots(d.get('lots') or [])
    with transaction.atomic():
        c.titre, c.description = titre[:150], str(d.get('description') or '')[:2000]
        c.points_exact = _entier(d.get('points_exact'), 'points_exact', 1, 100, 3)
        c.points_resultat = _entier(d.get('points_resultat'), 'points_resultat', 0, 100, 1)
        c.repas_minimum = _entier(d.get('repas_minimum'), 'repas_minimum', 0, 100, 1)
        if not c.pk:
            c.user_created = par
        c.save()
        c.agences.set(Agence.objects.filter(id__in=[a for a in (d.get('agences') or []) if str(a).isdigit()]))
        c.lots.all().delete()
        LotPronostics.objects.bulk_create([LotPronostics(competition=c, **l) for l in lots])
        if not c.pk or not c.matchs.exists():
            for md in (d.get('matchs') or []):
                MatchPronostics.objects.create(competition=c, **_lire_match(md))
        # Recalcul des points si les barèmes ont changé
        for m in c.matchs.filter(score_saisi_le__isnull=False):
            for p in m.pronostics.all():
                p.points = points_pronostic(c, m, p.score_a, p.score_b)
                p.save(update_fields=['points'])
    return c


def admin_json(c, complet=False):
    maintenant = timezone.now()
    d = {**competition_json(c, maintenant), 'etat_libelle': LIBELLES_ETAT[etat(c, maintenant)],
         'publie_le': _iso(c.publie_le), 'annule_le': _iso(c.annule_le),
         'agences': [{'id': a.id, 'nom': a.nom_agence} for a in c.agences.all()],
         'nb_joueurs': Pronostic.objects.filter(match__competition=c).values('user').distinct().count(),
         'historique_suspensions': _susp.historique('pronostics', c.id)}
    if complet:
        nb = defaultdict(int)
        for mid in Pronostic.objects.filter(match__competition=c).values_list('match_id', flat=True):
            nb[mid] += 1
        d['matchs'] = [match_json(m, maintenant) | {'nb_pronostics': nb.get(m.id, 0),
                                                    'score_saisi_le': _iso(m.score_saisi_le)}
                       for m in c.matchs.all()]
    return d


def _competition(pk):
    c = CompetitionPronostics.objects.filter(pk=pk).prefetch_related('matchs', 'lots', 'agences').first()
    if c is None:
        raise NotFound("Compétition introuvable.")
    return c


class AdminPronosticsView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def get(self, request):
        return Response([admin_json(c) for c in CompetitionPronostics.objects.prefetch_related('matchs', 'lots', 'agences')])

    def post(self, request):
        c = enregistrer(CompetitionPronostics(), request.data, request.user)
        return Response(admin_json(_competition(c.pk), True), status=201)


class AdminPronosticsDetailView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def get(self, request, pk):
        return Response(admin_json(_competition(pk), True))

    def put(self, request, pk):
        c = enregistrer(_competition(pk), request.data, request.user)
        return Response(admin_json(_competition(c.pk), True))

    def delete(self, request, pk):
        c = _competition(pk)
        if Pronostic.objects.filter(match__competition=c).exists():
            raise ValidationError("Des employés ont pronostiqué : annulez la compétition au lieu de la supprimer.")
        c.delete()
        return Response(status=204)


class AdminPronosticsActionView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]
    action = ''

    def post(self, request, pk):
        c = _competition(pk)
        maintenant = timezone.now()
        if self.action == 'programmer':
            if c.publie_le or c.annule_le:
                raise ValidationError("Déjà programmée ou annulée.")
            if not c.matchs.exists():
                raise ValidationError("Ajoutez au moins un match.")
            if not c.lots.exists():
                raise ValidationError("Ajoutez au moins un lot.")
            c.publie_le = maintenant
            c.save(update_fields=['publie_le', 'updated_at'])
            m = c.matchs.first()
            nb = sum(l.rang_fin - l.rang_debut + 1 for l in c.lots.all())
            gains.notifier(list(destinataires(c, maintenant).values_list('id', flat=True)),
                           f"⚽ Pronostics : {c.titre}",
                           f"{c.matchs.count()} matchs à pronostiquer, premier le {_quand(m.coup_envoi)}. "
                           f"Score exact : {c.points_exact} pts, bon résultat : {c.points_resultat} pt. "
                           f"{nb} lot{'s' if nb > 1 else ''} à gagner !", _donnees(c))
        elif self.action == 'annuler':
            if c.resultats_publies_le:
                raise ValidationError("Les résultats sont publiés.")
            c.annule_le = maintenant
            c.save(update_fields=['annule_le', 'updated_at'])
        elif self.action == 'publier-resultats':
            publier_resultats(c, request.user, maintenant)
        return Response(admin_json(_competition(pk), True))


class AdminMatchsView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def post(self, request, pk):
        c = _competition(pk)
        if c.resultats_publies_le or c.annule_le:
            raise ValidationError("Cette compétition n'est plus modifiable.")
        MatchPronostics.objects.create(competition=c, **_lire_match(request.data))
        return Response(admin_json(_competition(pk), True), status=201)


class AdminMatchDetailView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def _match(self, pk):
        m = MatchPronostics.objects.select_related('competition').filter(pk=pk).first()
        if m is None:
            raise NotFound("Match introuvable.")
        return m

    def put(self, request, pk):
        m = self._match(pk)
        if m.score_saisi_le or timezone.now() >= m.coup_envoi:
            raise ValidationError("Le match a commencé : il n'est plus modifiable (saisissez le score).")
        for k, v in _lire_match(request.data).items():
            setattr(m, k, v)
        m.save()
        return Response(admin_json(_competition(m.competition_id), True))

    def delete(self, request, pk):
        m = self._match(pk)
        if m.pronostics.exists():
            raise ValidationError("Des pronostics existent : annulez le match (0 point pour tous) au lieu de le supprimer.")
        cid = m.competition_id
        m.delete()
        return Response(admin_json(_competition(cid), True))


class AdminMatchScoreView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def post(self, request, pk):
        m = MatchPronostics.objects.select_related('competition').filter(pk=pk).first()
        if m is None:
            raise NotFound("Match introuvable.")
        saisir_score(m, request.data.get('score_a'), request.data.get('score_b'),
                     request.data.get('annule') in (True, 'true', 1, '1'), request.user)
        return Response(admin_json(_competition(m.competition_id), True))


class AdminPronosticsClassementView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def get(self, request, pk):
        from .jeux import agences_actuelles, nom_complet
        from .models import User
        c = _competition(pk)
        if c.resultats_publies_le:
            rs = list(c.resultats.select_related('gain', 'lot').order_by('rang'))
            lignes = [(r.user_id, r.rang, r.points, r.nb_exacts, r.nb_resultats, r.gain) for r in rs]
        else:
            lignes = [(u, i, t[0], t[1], t[2], None) for i, (u, t) in enumerate(classer(c), start=1)]
        users = {u.id: u for u in User.objects.filter(id__in=[l[0] for l in lignes])}
        agences = agences_actuelles(list(users))
        noms = dict(Agence.objects.values_list('id', 'nom_agence'))
        return Response({'competition': admin_json(c), 'definitif': bool(c.resultats_publies_le), 'lignes': [
            {'rang': rang, 'employe': nom_complet(users[uid]), 'matricule': users[uid].username,
             'agence': ', '.join(sorted(noms.get(a, '') for a in agences.get(uid, set()))),
             'points': pts, 'nb_exacts': ex, 'nb_resultats': br,
             'gain': gains.gain_json(g) if g else None}
            for uid, rang, pts, ex, br, g in lignes]})
