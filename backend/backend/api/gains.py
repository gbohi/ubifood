"""
Gains des jeux (défis, pronostics, tickets à gratter) et remise des lots.

  - Lot en argent : crédité sur le compte repas à l'attribution (« credite »).
  - Objet : « a_remettre », puis « remis » UNE seule fois (verrou ; un second
    retrait est refusé avec la date et la personne qui l'a remis). L'employé
    voit « Lot retiré le … » dans son application.

API (préfixe /api/api/)
  GET  mes-gains/                               tous mes lots (quiz compris)
  GET  admin/jeux/lots-a-remettre/?statut=      lots objets de tous les jeux (gestionnaires : leurs agences)
  POST admin/jeux/gains/<id>/remettre/          lot retiré (défis, pronostics, tickets)
"""
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import GainJeu, ParticipationJeu, User
from .permissions import IsAuthenticated, agences_gerees, is_admin, is_gestionnaire

SOURCES = dict(GainJeu.SOURCE_CHOICES)


def _iso(dt):
    return timezone.localtime(dt).isoformat() if dt else None


def _quand(dt):
    return timezone.localtime(dt).strftime('%d/%m à %H:%M')


def fcfa(m):
    from .pdf_factures import fcfa as f
    return f"{f(m)} F"


def libelle_gain(type_lot, libelle, montant):
    return f"{fcfa(montant)} sur le compte repas" if type_lot == 'argent' and montant else libelle


def notifier(user_ids, titre, message, donnees):
    """Notification « jeu » (donnees : ecran + identifiant, pour ouvrir le bon écran)."""
    from .signals import _en_arriere_plan
    ids = list(user_ids)
    if not ids:
        return

    def envoyer():
        from .fcm_service import envoyer_notification_user
        for u in User.objects.filter(id__in=ids, is_active=True):
            envoyer_notification_user(user=u, titre=titre, message=message, type_notif='jeu', donnees=donnees)
    _en_arriere_plan(envoyer)


def notifier_par_user(messages):
    """messages : [(user_id, titre, message, donnees)]"""
    from .signals import _en_arriere_plan
    if not messages:
        return

    def envoyer():
        from .fcm_service import envoyer_notification_user
        users = {u.id: u for u in User.objects.filter(id__in=[m[0] for m in messages], is_active=True)}
        for uid, titre, message, donnees in messages:
            if uid in users:
                envoyer_notification_user(user=users[uid], titre=titre, message=message, type_notif='jeu',
                                          donnees=donnees)
    _en_arriere_plan(envoyer)


def attribuer(user_id, source, source_id, titre_jeu, libelle, type_lot, montant, par, maintenant=None):
    """Crée le gain (dans la transaction de l'appelant) ; argent : crédit immédiat du compte repas."""
    from . import comptes_repas as cr
    maintenant = maintenant or timezone.now()
    g = GainJeu(user_id=user_id, source=source, source_id=source_id, titre_jeu=titre_jeu[:150],
                libelle=(libelle or libelle_gain(type_lot, libelle, montant))[:150], type=type_lot,
                montant=montant if type_lot == 'argent' else None, created_at=maintenant)
    if type_lot == 'argent' and montant:
        compte = cr.compte_verrouille(user_id)
        g.mouvement = cr._mouvement(compte, 'gain_jeu', montant, par, libelle=f"Lot gagné : {titre_jeu}"[:255])
        g.statut_lot, g.lot_remis_le = 'credite', maintenant
    else:
        g.statut_lot = 'a_remettre'
    g.save()
    return g


def gain_json(g):
    return {'id': g.id, 'source': g.source, 'source_libelle': SOURCES.get(g.source, g.source),
            'source_id': g.source_id, 'jeu': g.titre_jeu, 'libelle': g.libelle,
            'libelle_affiche': libelle_gain(g.type, g.libelle, g.montant), 'type': g.type,
            'montant': float(g.montant) if g.montant is not None else None, 'statut_lot': g.statut_lot,
            'lot_remis_le': _iso(g.lot_remis_le), 'gagne_le': _iso(g.created_at)}


def _peut_remettre(user, employe_id):
    if is_admin(user):
        return True
    if not is_gestionnaire(user):
        return False
    from .jeux import agences_actuelles
    return bool(agences_actuelles([employe_id]).get(employe_id, set()) & (agences_gerees(user) or set()))


def remettre(gain_id, par, maintenant=None):
    maintenant = maintenant or timezone.now()
    with transaction.atomic():
        g = (GainJeu.objects.select_for_update(of=('self',)).select_related('lot_remis_par')
             .filter(pk=gain_id).first())
        if g is None:
            raise NotFound("Lot introuvable.")
        if not _peut_remettre(par, g.user_id):
            raise PermissionDenied("Cet employé ne dépend pas de vos agences.")
        if g.statut_lot == 'remis':
            qui = f"{g.lot_remis_par.nom} {g.lot_remis_par.prenom}" if g.lot_remis_par else '—'
            raise ValidationError(f"Lot déjà retiré le {_quand(g.lot_remis_le)} (remis par {qui}).")
        if g.statut_lot == 'credite':
            raise ValidationError("Ce lot a été crédité sur le compte repas : rien à remettre.")
        g.statut_lot, g.lot_remis_le, g.lot_remis_par = 'remis', maintenant, par
        g.save(update_fields=['statut_lot', 'lot_remis_le', 'lot_remis_par'])
        transaction.on_commit(lambda: notifier(
            [g.user_id], '🎁 Lot retiré', f"{g.libelle} ({g.titre_jeu}) : retiré le {_quand(maintenant)}.",
            {'ecran': 'gains', 'lot_retire': True}))
    return g


class MesGainsView(APIView):
    """Tous mes lots gagnés, quiz compris (plus récents d'abord)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .jeux import libelle_lot
        res = [gain_json(g) for g in GainJeu.objects.filter(user=request.user)]
        for p in (ParticipationJeu.objects.filter(user=request.user, lot__isnull=False, jeu__resultats_publies_le__isnull=False)
                  .select_related('lot', 'jeu')):
            res.append({'id': None, 'source': 'quiz', 'source_libelle': 'Quiz', 'source_id': p.jeu_id,
                        'jeu': p.jeu.titre, 'libelle': p.lot.libelle, 'libelle_affiche': libelle_lot(p.lot),
                        'type': p.lot.type, 'montant': float(p.lot.montant) if p.lot.montant is not None else None,
                        'statut_lot': p.statut_lot, 'lot_remis_le': _iso(p.lot_remis_le),
                        'gagne_le': _iso(p.jeu.resultats_publies_le)})
        res.sort(key=lambda g: g['gagne_le'] or '', reverse=True)
        return Response(res)


class LotsARemettreView(APIView):
    """Lots objets de tous les jeux : à remettre (défaut) ou déjà retirés (?statut=remis)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_gestionnaire(request.user):
            raise PermissionDenied("Réservé aux gestionnaires et administrateurs.")
        from .jeux import agences_actuelles, nom_complet
        statut = request.query_params.get('statut') or 'a_remettre'
        if statut not in ('a_remettre', 'remis'):
            raise ValidationError({'statut': "Statut invalide (a_remettre, remis)."})
        lignes = []
        for g in GainJeu.objects.filter(statut_lot=statut, type='objet').select_related('user', 'lot_remis_par'):
            lignes.append(('gain', g.id, g.user, SOURCES.get(g.source, g.source), g.titre_jeu, g.libelle,
                           g.created_at, g.lot_remis_le, g.lot_remis_par))
        for p in (ParticipationJeu.objects.filter(statut_lot=statut).select_related('user', 'lot', 'jeu', 'lot_remis_par')):
            lignes.append(('quiz', p.id, p.user, 'Quiz', p.jeu.titre, p.lot.libelle if p.lot_id else '',
                           p.jeu.resultats_publies_le, p.lot_remis_le, p.lot_remis_par))
        geres = None if is_admin(request.user) else (agences_gerees(request.user) or set())
        agences = agences_actuelles([l[2].id for l in lignes])
        from .models import Agence
        noms = dict(Agence.objects.values_list('id', 'nom_agence'))
        res = []
        for genre, ident, u, source, jeu, lot, gagne, remis, par in lignes:
            ags = agences.get(u.id, set())
            if geres is not None and not ags & geres:
                continue
            res.append({'genre': genre, 'id': ident, 'jeu_id': None, 'source': source, 'jeu': jeu, 'lot': lot,
                        'employe': nom_complet(u), 'matricule': u.username,
                        'agence': ', '.join(sorted(noms.get(a, '') for a in ags)), 'gagne_le': _iso(gagne),
                        'lot_remis_le': _iso(remis), 'lot_remis_par': nom_complet(par) if par else None})
        # identifiant du quiz pour l'URL de remise
        quiz = dict(ParticipationJeu.objects.filter(id__in=[r['id'] for r in res if r['genre'] == 'quiz'])
                    .values_list('id', 'jeu_id'))
        for r in res:
            if r['genre'] == 'quiz':
                r['jeu_id'] = quiz.get(r['id'])
        res.sort(key=lambda r: r['lot_remis_le' if statut == 'remis' else 'gagne_le'] or '', reverse=statut == 'remis')
        return Response(res)


class RemettreGainView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_gestionnaire(request.user):
            raise PermissionDenied("Réservé aux gestionnaires et administrateurs.")
        g = remettre(pk, request.user)
        return Response(gain_json(g))
