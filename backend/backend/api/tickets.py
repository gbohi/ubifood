"""
Tickets à gratter.

  - Un ticket par repas retiré (retrait validé au comptoir) pendant la
    campagne, et/ou un ticket gratuit par jour ouvré (lundi-vendredi), créé à
    l'ouverture de l'écran. Retrait annulé : ticket non gratté supprimé.
  - Le tirage a lieu sur le serveur au moment de gratter (verrou sur la
    campagne) : chaque lot a une probabilité (% par ticket) et un stock ; un
    lot épuisé, ou en argent au-delà du budget maximum, n'est plus tirable
    (sa chance revient à « Perdu »). Somme des probabilités ≤ 100 %.
  - Gratter jusqu'à validite_jours après la fin de la campagne.
  - Gain : argent crédité sur le compte repas, objet à remettre (remise unique).

API employé : GET tickets/ · POST tickets/<id>/gratter/
API administration : GET/POST admin/tickets/ · GET/PUT/DELETE admin/tickets/<id>/
  POST admin/tickets/<id>/programmer|annuler/ · GET admin/tickets/<id>/suivi/
"""
import random
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import gains
from .models import Agence, CampagneTickets, GainJeu, LotTicket, Ticket
from .permissions import IsAuthenticated, ReadGestionnaireWriteAdmin


def _iso(dt):
    return timezone.localtime(dt).isoformat() if dt else None


def _quand(dt):
    return timezone.localtime(dt).strftime('%d/%m à %H:%M')


def etat(c, maintenant=None):
    maintenant = maintenant or timezone.now()
    if c.annule_le:
        return 'annule'
    if not c.publie_le:
        return 'brouillon'
    if maintenant < c.debut:
        return 'a_venir'
    if maintenant < c.fin:
        return 'en_cours'
    return 'termine'


LIBELLES_ETAT = {'annule': 'Annulée', 'brouillon': 'Brouillon', 'a_venir': 'Programmée', 'en_cours': 'En cours',
                 'termine': 'Terminée'}


def limite_grattage(c):
    return c.fin + timedelta(days=c.validite_jours)


def concerne(user, c, maintenant=None):
    from .jeux import agences_actuelles
    from .permissions import is_employe
    if not is_employe(user):
        return False
    ags = set(c.agences.values_list('id', flat=True))
    return not ags or bool(agences_actuelles([user.id], maintenant).get(user.id, set()) & ags)


def campagnes_actives(maintenant):
    return CampagneTickets.objects.filter(publie_le__isnull=False, annule_le__isnull=True, debut__lte=maintenant,
                                          fin__gt=maintenant)


def creer_ticket_retrait(retrait_id):
    """Signal « retrait validé » : un ticket par campagne active qui le prévoit."""
    from .models import Retrait
    r = Retrait.objects.select_related('user').filter(pk=retrait_id).first()
    if r is None:
        return 0
    n = 0
    for c in campagnes_actives(r.date_retrait).filter(ticket_par_retrait=True):
        if concerne(r.user, c, r.date_retrait) and not Ticket.objects.filter(retrait=r).exists():
            Ticket.objects.create(campagne=c, user=r.user, source='retrait', retrait=r, cree_le=r.date_retrait)
            n += 1
            gains.notifier([r.user_id], '🎟️ Un ticket à gratter vous attend !',
                           f"Merci pour votre repas. Grattez votre ticket « {c.titre} » pour tenter de gagner.",
                           {'ecran': 'tickets', 'campagne_id': c.id})
            break    # un seul ticket par repas
    return n


def supprimer_ticket_retrait(retrait_id):
    """Retrait annulé : le ticket non gratté disparaît."""
    Ticket.objects.filter(retrait_id=retrait_id, gratte_le__isnull=True).delete()


def tickets_du_jour(user, maintenant):
    """Ticket gratuit du jour (lundi-vendredi) des campagnes qui le prévoient."""
    jour = timezone.localdate(maintenant)
    if jour.weekday() >= 5:
        return
    for c in campagnes_actives(maintenant).filter(ticket_quotidien=True):
        if concerne(user, c, maintenant):
            Ticket.objects.get_or_create(campagne=c, user=user, jour=jour,
                                         defaults={'source': 'quotidien', 'cree_le': maintenant})


def budget_consomme(c):
    return GainJeu.objects.filter(source='ticket', source_id=c.id, type='argent').aggregate(
        t=Sum('montant'))['t'] or Decimal('0')


def gratter(ticket_id, user, maintenant=None):
    from .permissions import exiger_employe
    exiger_employe(user)
    maintenant = maintenant or timezone.now()
    with transaction.atomic():
        t = Ticket.objects.select_for_update(of=('self',)).select_related('campagne').filter(pk=ticket_id, user=user).first()
        if t is None:
            raise NotFound("Ticket introuvable.")
        if t.gratte_le:
            return t
        c = CampagneTickets.objects.select_for_update().get(pk=t.campagne_id)
        if c.annule_le:
            raise ValidationError("Cette campagne a été annulée.")
        if maintenant > limite_grattage(c):
            raise ValidationError(f"Ticket expiré le {_quand(limite_grattage(c))}.")
        consomme = budget_consomme(c)
        tirage = random.uniform(0, 100)
        cumul, gagne = Decimal('0'), None
        for lot in c.lots.select_for_update().order_by('id'):
            disponible = lot.distribues < lot.stock and not (
                lot.type == 'argent' and c.budget_max is not None and consomme + (lot.montant or 0) > c.budget_max)
            cumul += lot.probabilite
            if disponible and tirage < float(cumul) and gagne is None:
                gagne = lot
        t.gratte_le = maintenant
        if gagne is not None:
            gagne.distribues += 1
            gagne.save(update_fields=['distribues'])
            t.lot = gagne
            t.gain = gains.attribuer(user.id, 'ticket', c.id, c.titre, gagne.libelle, gagne.type, gagne.montant, user,
                                     maintenant, gagne.valeur)
        t.save(update_fields=['gratte_le', 'lot', 'gain'])
    return t


def ticket_json(t):
    return {'id': t.id, 'campagne_id': t.campagne_id, 'campagne': t.campagne.titre, 'source': t.source,
            'source_libelle': 'Repas retiré' if t.source == 'retrait' else 'Ticket du jour',
            'cree_le': _iso(t.cree_le), 'gratte_le': _iso(t.gratte_le), 'expire_le': _iso(limite_grattage(t.campagne)),
            'gagne': bool(t.lot_id) if t.gratte_le else None,
            'gain': gains.gain_json(t.gain) if t.gain_id else None}


def lots_json(c, admin=False):
    res = []
    for l in c.lots.order_by('-montant', 'id'):
        d = {'id': l.id, 'libelle': l.libelle, 'type': l.type, 'montant': float(l.montant) if l.montant else None,
             'libelle_affiche': gains.libelle_gain(l.type, l.libelle, l.montant),
             'restants': max(0, l.stock - l.distribues)}
        if admin:
            d.update({'stock': l.stock, 'distribues': l.distribues, 'probabilite': float(l.probabilite),
                      'valeur': float(l.valeur) if l.valeur is not None else None})
        res.append(d)
    return res


def campagne_json(c, maintenant, admin=False):
    return {'id': c.id, 'titre': c.titre, 'debut': _iso(c.debut), 'fin': _iso(c.fin), 'etat': etat(c, maintenant),
            'ticket_par_retrait': c.ticket_par_retrait, 'ticket_quotidien': c.ticket_quotidien,
            'limite_grattage': _iso(limite_grattage(c)), 'lots': lots_json(c, admin)}


class MesTicketsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        maintenant = timezone.now()
        tickets_du_jour(request.user, maintenant)
        a_gratter = [t for t in Ticket.objects.filter(user=request.user, gratte_le__isnull=True)
                     .select_related('campagne') if not t.campagne.annule_le and maintenant <= limite_grattage(t.campagne)]
        grattes = (Ticket.objects.filter(user=request.user, gratte_le__isnull=False)
                   .select_related('campagne', 'gain').order_by('-gratte_le')[:30])
        campagnes = [c for c in CampagneTickets.objects.filter(publie_le__isnull=False, annule_le__isnull=True,
                                                               fin__gt=maintenant - timedelta(days=1))
                     .prefetch_related('lots', 'agences') if concerne(request.user, c, maintenant)]
        return Response({'serveur': _iso(maintenant), 'campagnes': [campagne_json(c, maintenant) for c in campagnes],
                         'a_gratter': [ticket_json(t) for t in a_gratter],
                         'grattes': [ticket_json(t) for t in grattes]})


class GratterView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        t = gratter(pk, request.user)
        t = Ticket.objects.select_related('campagne', 'gain').get(pk=t.pk)
        return Response(ticket_json(t))


# ══════════════════════════════════════════════════════════════
# ADMINISTRATION
# ══════════════════════════════════════════════════════════════

def _date(v, champ):
    dt = parse_datetime(str(v or ''))
    if dt is None:
        raise ValidationError({champ: "Date et heure invalides."})
    return timezone.make_aware(dt, timezone.get_current_timezone()) if timezone.is_naive(dt) else dt


def _decimal(v, champ, mini, maxi):
    try:
        x = Decimal(str(v).replace(' ', '').replace(',', '.'))
    except (InvalidOperation, TypeError):
        raise ValidationError({champ: "Nombre invalide."})
    if not mini <= x <= maxi:
        raise ValidationError({champ: f"Entre {mini} et {maxi}."})
    return x


def _lire_lots(donnees):
    if not isinstance(donnees, list) or not donnees:
        raise ValidationError({'lots': "Ajoutez au moins un lot."})
    res, total = [], Decimal('0')
    for n, l in enumerate(donnees, start=1):
        if not isinstance(l, dict):
            raise ValidationError({'lots': f"Lot {n} : format invalide."})
        type_lot = l.get('type') or 'objet'
        if type_lot not in ('objet', 'argent'):
            raise ValidationError({'lots': f"Lot {n} : type invalide."})
        montant = _decimal(l.get('montant'), 'lots', Decimal('1'), Decimal('1000000')) if type_lot == 'argent' else None
        libelle = str(l.get('libelle') or '').strip() or (gains.fcfa(montant) if montant else '')
        if not libelle:
            raise ValidationError({'lots': f"Lot {n} : libellé obligatoire."})
        try:
            stock = int(l.get('stock'))
        except (TypeError, ValueError):
            raise ValidationError({'lots': f"Lot {n} : stock invalide."})
        if not 1 <= stock <= 1000000:
            raise ValidationError({'lots': f"Lot {n} : stock entre 1 et 1 000 000."})
        proba = _decimal(l.get('probabilite'), 'lots', Decimal('0.001'), Decimal('100'))
        total += proba
        from .jeux import lire_valeur
        res.append({'id': l.get('id'), 'libelle': libelle[:150], 'type': type_lot, 'montant': montant,
                    'stock': stock, 'probabilite': proba,
                    'valeur': lire_valeur(l.get('valeur'), 'lots', n) if type_lot == 'objet' else None})
    if total > 100:
        raise ValidationError({'lots': f"La somme des probabilités ({total} %) dépasse 100 %."})
    return res


def enregistrer(c, d, par):
    if c.pk and c.annule_le:
        raise ValidationError("Cette campagne est annulée.")
    titre = str(d.get('titre') or '').strip()
    if not titre:
        raise ValidationError({'titre': "Titre obligatoire."})
    debut, fin = _date(d.get('debut'), 'debut'), _date(d.get('fin'), 'fin')
    if fin <= debut:
        raise ValidationError({'fin': "La fin doit être après le début."})
    par_retrait = d.get('ticket_par_retrait', True) not in (False, 'false', 0, '0')
    quotidien = d.get('ticket_quotidien') in (True, 'true', 1, '1')
    if not par_retrait and not quotidien:
        raise ValidationError("Choisissez au moins une façon d'obtenir des tickets.")
    budget = d.get('budget_max')
    budget = None if budget in (None, '') else _decimal(budget, 'budget_max', Decimal('1'), Decimal('100000000'))
    try:
        validite = int(d.get('validite_jours') or 7)
    except (TypeError, ValueError):
        raise ValidationError({'validite_jours': "Nombre entier attendu."})
    lots = _lire_lots(d.get('lots'))
    with transaction.atomic():
        c.titre, c.debut, c.fin = titre[:150], debut, fin
        c.ticket_par_retrait, c.ticket_quotidien, c.budget_max = par_retrait, quotidien, budget
        c.validite_jours = max(0, min(validite, 90))
        if not c.pk:
            c.user_created = par
        c.save()
        c.agences.set(Agence.objects.filter(id__in=[a for a in (d.get('agences') or []) if str(a).isdigit()]))
        existants = {l.id: l for l in c.lots.select_for_update()}
        gardes = set()
        for l in lots:
            ident = l.pop('id')
            lot = existants.get(int(ident)) if str(ident or '').isdigit() else None
            if lot is not None:
                if l['stock'] < lot.distribues:
                    raise ValidationError({'lots': f"« {lot.libelle} » : stock inférieur aux lots déjà gagnés ({lot.distribues})."})
                for k, v in l.items():
                    setattr(lot, k, v)
                lot.save()
                gardes.add(lot.id)
            else:
                LotTicket.objects.create(campagne=c, **l)
        for ident, lot in existants.items():
            if ident not in gardes:
                if lot.distribues:
                    raise ValidationError({'lots': f"« {lot.libelle} » a déjà été gagné : il ne peut pas être retiré "
                                                   "(mettez son stock au nombre déjà gagné)."})
                lot.delete()
    return c


def admin_json(c, complet=False):
    maintenant = timezone.now()
    st = c.tickets.aggregate(emis=Count('id'), grattes=Count('id', filter=Q(gratte_le__isnull=False)),
                             gagnants=Count('id', filter=Q(lot__isnull=False)))
    d = {**campagne_json(c, maintenant, admin=True), 'etat_libelle': LIBELLES_ETAT[etat(c, maintenant)],
         'publie_le': _iso(c.publie_le), 'annule_le': _iso(c.annule_le),
         'budget_max': float(c.budget_max) if c.budget_max is not None else None,
         'budget_consomme': float(budget_consomme(c)), 'validite_jours': c.validite_jours,
         'agences': [{'id': a.id, 'nom': a.nom_agence} for a in c.agences.all()], 'stats': st,
         'proba_perdu': float(100 - sum(l.probabilite for l in c.lots.all()))}
    return d


def _campagne(pk):
    c = CampagneTickets.objects.filter(pk=pk).prefetch_related('lots', 'agences').first()
    if c is None:
        raise NotFound("Campagne introuvable.")
    return c


class AdminTicketsView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def get(self, request):
        return Response([admin_json(c) for c in CampagneTickets.objects.prefetch_related('lots', 'agences')])

    def post(self, request):
        c = enregistrer(CampagneTickets(), request.data, request.user)
        return Response(admin_json(_campagne(c.pk)), status=201)


class AdminTicketsDetailView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def get(self, request, pk):
        return Response(admin_json(_campagne(pk)))

    def put(self, request, pk):
        c = enregistrer(_campagne(pk), request.data, request.user)
        return Response(admin_json(_campagne(c.pk)))

    def delete(self, request, pk):
        c = _campagne(pk)
        if c.tickets.exists():
            raise ValidationError("Des tickets ont été distribués : annulez la campagne au lieu de la supprimer.")
        c.delete()
        return Response(status=204)


class AdminTicketsActionView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]
    action = ''

    def post(self, request, pk):
        from .jeux import destinataires_agences
        c = _campagne(pk)
        maintenant = timezone.now()
        if self.action == 'programmer':
            if c.publie_le or c.annule_le:
                raise ValidationError("Déjà programmée ou annulée.")
            if c.fin <= maintenant:
                raise ValidationError("La campagne est terminée.")
            c.publie_le = maintenant
            c.save(update_fields=['publie_le', 'updated_at'])
            comment = ' et '.join(x for x in (
                'un ticket à chaque repas retiré' if c.ticket_par_retrait else '',
                'un ticket gratuit chaque jour ouvré' if c.ticket_quotidien else '') if x)
            meilleurs = ', '.join(l['libelle_affiche'] for l in lots_json(c)[:3])
            gains.notifier(list(destinataires_agences(list(c.agences.values_list('id', flat=True)), maintenant)
                                .values_list('id', flat=True)),
                           f"🎟️ {c.titre}", f"Du {_quand(c.debut)} au {_quand(c.fin)} : {comment}. "
                           f"À gagner : {meilleurs}…", {'ecran': 'tickets', 'campagne_id': c.id})
        elif self.action == 'annuler':
            c.annule_le = maintenant
            c.save(update_fields=['annule_le', 'updated_at'])
        return Response(admin_json(_campagne(pk)))


class AdminTicketsSuiviView(APIView):
    """Gagnants de la campagne (avec remise des lots)."""
    permission_classes = [ReadGestionnaireWriteAdmin]

    def get(self, request, pk):
        from .jeux import agences_actuelles, nom_complet
        c = _campagne(pk)
        ts = list(c.tickets.filter(lot__isnull=False).select_related('user', 'gain', 'gain__lot_remis_par')
                  .order_by('-gratte_le'))
        agences = agences_actuelles([t.user_id for t in ts])
        noms = dict(Agence.objects.values_list('id', 'nom_agence'))
        return Response({'campagne': admin_json(c), 'gagnants': [
            {'ticket_id': t.id, 'employe': nom_complet(t.user), 'matricule': t.user.username,
             'agence': ', '.join(sorted(noms.get(a, '') for a in agences.get(t.user_id, set()))),
             'gratte_le': _iso(t.gratte_le), 'gain': gains.gain_json(t.gain) if t.gain_id else None,
             'lot_remis_par': nom_complet(t.gain.lot_remis_par) if t.gain_id and t.gain.lot_remis_par_id else None}
            for t in ts]})
