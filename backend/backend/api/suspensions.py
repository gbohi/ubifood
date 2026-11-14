"""
Suspension des jeux (quiz, défis, pronostics, tickets à gratter) par un
administrateur, avec motif facultatif affiché aux employés ; « Reprendre »
remet le jeu en marche (notification de reprise en option). Historique
conservé (qui, quand, pourquoi).

Effets pendant la suspension :
  quiz        plus de nouvelle partie (une partie commencée se termine : son
              chrono ne s'arrête jamais) ; notifications automatiques suspendues ;
  defis       défis réussis non enregistrés ; commandes passées et avis donnés
              pendant la suspension ne comptent pas ;
  pronostics  impossible de pronostiquer (les scores se saisissent toujours) ;
  ticket      aucun nouveau ticket, grattage bloqué ; le délai pour gratter
              est prolongé de la durée totale des suspensions.

API : POST admin/jeux/suspension/ {source, id, action: suspendre|reprendre, motif, notifier}
"""
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SuspensionJeu
from .permissions import ReadGestionnaireWriteAdmin

SOURCES = ('quiz', 'defis', 'pronostics', 'ticket')


def _iso(dt):
    return timezone.localtime(dt).isoformat() if dt else None


def active(source, source_id):
    return SuspensionJeu.objects.filter(source=source, source_id=source_id, fin__isnull=True).first()


def suspendu(source, source_id):
    return SuspensionJeu.objects.filter(source=source, source_id=source_id, fin__isnull=True).exists()


def suspension_json(source, source_id):
    s = active(source, source_id)
    return None if s is None else {'depuis': _iso(s.debut), 'motif': s.motif}


def historique(source, source_id):
    from .jeux import nom_complet
    return [{'debut': _iso(s.debut), 'fin': _iso(s.fin), 'motif': s.motif,
             'par': nom_complet(s.suspendu_par) if s.suspendu_par_id else None,
             'repris_par': nom_complet(s.repris_par) if s.repris_par_id else None}
            for s in SuspensionJeu.objects.filter(source=source, source_id=source_id)
            .select_related('suspendu_par', 'repris_par')]


def intervalles(source, source_id, maintenant=None):
    maintenant = maintenant or timezone.now()
    return [(s.debut, s.fin or maintenant) for s in SuspensionJeu.objects.filter(source=source, source_id=source_id)]


def duree_totale(source, source_id, maintenant=None):
    return sum((f - d for d, f in intervalles(source, source_id, maintenant)), timedelta(0))


def exclure_suspensions(qs, champ, source, source_id):
    """Retire du queryset les lignes dont `champ` (date et heure) tombe dans une suspension."""
    for d, f in intervalles(source, source_id):
        qs = qs.exclude(**{f'{champ}__range': (d, f)})
    return qs


def message(source, source_id):
    s = active(source, source_id)
    return "Jeu suspendu momentanément" + (f" : {s.motif}" if s and s.motif else ".")


def exiger_actif(source, source_id):
    if suspendu(source, source_id):
        raise ValidationError(message(source, source_id))


def _jeu(source, source_id):
    from .models import CampagneDefis, CampagneTickets, CompetitionPronostics, Jeu
    modele = {'quiz': Jeu, 'defis': CampagneDefis, 'pronostics': CompetitionPronostics, 'ticket': CampagneTickets}[source]
    obj = modele.objects.filter(pk=source_id).first()
    if obj is None:
        raise NotFound("Jeu introuvable.")
    return obj


def destinataires(source, obj):
    from .jeux import destinataires_agences
    return destinataires_agences(list(obj.agences.values_list('id', flat=True)))


def suspendre(source, source_id, par, motif=''):
    obj = _jeu(source, source_id)
    if getattr(obj, 'annule_le', None):
        raise ValidationError("Ce jeu est annulé.")
    with transaction.atomic():
        if SuspensionJeu.objects.select_for_update().filter(source=source, source_id=source_id, fin__isnull=True).exists():
            raise ValidationError("Ce jeu est déjà suspendu.")
        return SuspensionJeu.objects.create(source=source, source_id=source_id, motif=(motif or '').strip()[:255],
                                            suspendu_par=par)


def reprendre(source, source_id, par, notifier=False):
    from . import gains
    obj = _jeu(source, source_id)
    with transaction.atomic():
        s = SuspensionJeu.objects.select_for_update().filter(source=source, source_id=source_id, fin__isnull=True).first()
        if s is None:
            raise ValidationError("Ce jeu n'est pas suspendu.")
        s.fin, s.repris_par = timezone.now(), par
        s.save(update_fields=['fin', 'repris_par'])
    if notifier:
        ecran = {'quiz': None, 'defis': 'defis', 'pronostics': 'pronostics', 'ticket': 'tickets'}[source]
        donnees = {'jeu_id': obj.id} if source == 'quiz' else {'ecran': ecran, 'campagne_id': obj.id}
        gains.notifier(list(destinataires(source, obj).values_list('id', flat=True)),
                       f"▶️ {obj.titre} reprend", "Le jeu est de nouveau ouvert. Bonne chance !", donnees)
    return s


class AdminSuspensionView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def post(self, request):
        d = request.data
        source = d.get('source')
        if source not in SOURCES:
            raise ValidationError({'source': "Jeu invalide (quiz, defis, pronostics, ticket)."})
        try:
            sid = int(d.get('id'))
        except (TypeError, ValueError):
            raise ValidationError({'id': "Identifiant invalide."})
        action = d.get('action')
        if action == 'suspendre':
            suspendre(source, sid, request.user, d.get('motif') or '')
        elif action == 'reprendre':
            reprendre(source, sid, request.user, d.get('notifier') in (True, 'true', 1, '1'))
        else:
            raise ValidationError({'action': "Action invalide (suspendre, reprendre)."})
        return Response({'suspension': suspension_json(source, sid), 'historique': historique(source, sid)})
