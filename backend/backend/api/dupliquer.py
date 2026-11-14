"""
Dupliquer un jeu (quiz, défis, pronostics, tickets) : copie en BROUILLON
avec les mêmes réglages, questions, lots / paliers et agences, sous un
nouveau titre et de nouvelles dates (pronostics : sans les matchs, à saisir
pour la nouvelle compétition). Rien n'est notifié avant « Programmer ».

API : POST admin/jeux/dupliquer/ {source, id, titre, debut, fin}
      → {source, id} du nouveau jeu (brouillon)
"""
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    CampagneDefis, CampagneTickets, CompetitionPronostics, Jeu, LotJeu, LotPronostics, LotTicket, PalierDefis,
    QuestionJeu, ReponseJeu,
)
from .permissions import ReadGestionnaireWriteAdmin


def _date(v, champ, requis=True):
    if v in (None, '') and not requis:
        return None
    dt = parse_datetime(str(v or ''))
    if dt is None:
        raise ValidationError({champ: "Date et heure invalides."})
    return timezone.make_aware(dt, timezone.get_current_timezone()) if timezone.is_naive(dt) else dt


def _copier(obj, exclure=()):
    """Copie des champs simples (sans id, dates d'état, ni relations)."""
    nouveau = type(obj)()
    for f in obj._meta.concrete_fields:
        if f.primary_key or f.name in exclure:
            continue
        setattr(nouveau, f.attname, getattr(obj, f.attname))
    return nouveau


ETAT = ('publie_le', 'annule_le', 'resultats_publies_le', 'cloture_le', 'rappel_envoye_le', 'ouverture_envoyee_le',
        'relance_envoyee_le', 'rappel_du', 'created_at', 'updated_at', 'tirage_direct')


@transaction.atomic
def dupliquer(source, source_id, par, titre, debut, fin):
    titre = (titre or '').strip()
    if source == 'quiz':
        jeu = Jeu.objects.filter(pk=source_id).first()
        if jeu is None:
            raise NotFound("Jeu introuvable.")
        n = _copier(jeu, ETAT)
        n.titre = (titre or f"{jeu.titre} (copie)")[:150]
        n.debut = debut
        n.fin = fin if jeu.mode == 'libre' else debut
        if jeu.mode == 'libre' and (fin is None or fin <= debut):
            raise ValidationError({'fin': "La fin doit être après le début."})
        n.user_created = par
        n.save()
        n.agences.set(jeu.agences.all())
        for q in jeu.questions.prefetch_related('reponses'):
            nq = QuestionJeu.objects.create(jeu=n, texte=q.texte, duree=q.duree, points=q.points, ordre=q.ordre)
            ReponseJeu.objects.bulk_create([ReponseJeu(question=nq, texte=r.texte, correcte=r.correcte, ordre=r.ordre)
                                            for r in q.reponses.all()])
        LotJeu.objects.bulk_create([LotJeu(jeu=n, rang_debut=l.rang_debut, rang_fin=l.rang_fin, libelle=l.libelle,
                                           type=l.type, montant=l.montant, valeur=l.valeur) for l in jeu.lots.all()])
        if n.mode == 'direct':
            from .jeux import _tirer_direct
            _tirer_direct(n)
            n.save(update_fields=['tirage_direct', 'fin'])
        return n
    if source == 'defis':
        c = CampagneDefis.objects.filter(pk=source_id).first()
        if c is None:
            raise NotFound("Programme introuvable.")
        if fin is None or fin <= debut:
            raise ValidationError({'fin': "La fin doit être après le début."})
        n = _copier(c, ETAT)
        n.titre = (titre or f"{c.titre} (copie)")[:150]
        n.debut, n.fin, n.user_created = debut, fin, par
        n.save()
        n.agences.set(c.agences.all())
        PalierDefis.objects.bulk_create([PalierDefis(campagne=n, nom=p.nom, points_min=p.points_min, libelle=p.libelle,
                                                     type=p.type, montant=p.montant, quantite=p.quantite, valeur=p.valeur)
                                         for p in c.paliers.all()])
        return n
    if source == 'pronostics':
        c = CompetitionPronostics.objects.filter(pk=source_id).first()
        if c is None:
            raise NotFound("Compétition introuvable.")
        n = _copier(c, ETAT)
        n.titre = (titre or f"{c.titre} (copie)")[:150]
        n.user_created = par
        n.save()
        n.agences.set(c.agences.all())
        LotPronostics.objects.bulk_create([LotPronostics(competition=n, rang_debut=l.rang_debut, rang_fin=l.rang_fin,
                                                         libelle=l.libelle, type=l.type, montant=l.montant, valeur=l.valeur)
                                           for l in c.lots.all()])
        return n
    if source == 'ticket':
        c = CampagneTickets.objects.filter(pk=source_id).first()
        if c is None:
            raise NotFound("Campagne introuvable.")
        if fin is None or fin <= debut:
            raise ValidationError({'fin': "La fin doit être après le début."})
        n = _copier(c, ETAT)
        n.titre = (titre or f"{c.titre} (copie)")[:150]
        n.debut, n.fin, n.user_created = debut, fin, par
        n.save()
        n.agences.set(c.agences.all())
        LotTicket.objects.bulk_create([LotTicket(campagne=n, libelle=l.libelle, type=l.type, montant=l.montant,
                                                 stock=l.stock, probabilite=l.probabilite, valeur=l.valeur, distribues=0)
                                       for l in c.lots.all()])
        return n
    raise ValidationError({'source': "Jeu invalide (quiz, defis, pronostics, ticket)."})


class AdminDupliquerView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def post(self, request):
        d = request.data
        source = d.get('source')
        try:
            sid = int(d.get('id'))
        except (TypeError, ValueError):
            raise ValidationError({'id': "Identifiant invalide."})
        sans_dates = source == 'pronostics'
        debut = None if sans_dates else _date(d.get('debut'), 'debut')
        fin = None if sans_dates else _date(d.get('fin'), 'fin', requis=False)
        n = dupliquer(source, sid, request.user, d.get('titre'), debut, fin)
        return Response({'source': source, 'id': n.id, 'titre': n.titre}, status=201)
