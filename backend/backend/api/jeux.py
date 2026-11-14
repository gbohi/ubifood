"""
Jeux : quiz à lots pour inciter les employés à utiliser UbiFood.

Règles
  - Participation : au moins Jeu.repas_minimum repas commandés (non annulés ;
    repas offerts comptés seulement si compter_repas_offerts) dont la date de
    menu tombe dans le mois du début du jeu. Contrôlée au démarrage de la
    partie, puis À NOUVEAU à la publication des résultats (commande annulée
    entre-temps : non classé). Jeu limité à certaines agences : seuls leurs
    employés le voient.
  - UNE partie par employé et par jeu. Une partie commencée NE S'ARRÊTE
    JAMAIS : le temps est tenu par le serveur (heures de début et limite de
    chaque question enregistrées), que l'employé reste dans l'application ou
    non. Une réponse arrivée jusqu'à TOLERANCE après la limite (réseau lent)
    est acceptée sans bonus ; la question suivante s'ouvre à l'heure.
      · libre  : les questions s'enchaînent : la suivante s'ouvre dès la
                 réponse, ou à la limite de la précédente si l'employé n'a pas
                 répondu. Questions tirées au hasard dans la banque
                 (nb_questions), ordre des réponses mélangé par joueur ;
      · direct : tout le monde joue au même moment : la question i s'ouvre
                 pour tous à debut + durées des questions précédentes (même
                 tirage pour tous) ; celui qui a répondu attend la suivante.
                 On peut rejoindre la salle d'attente SALLE_ATTENTE avant.
  - Points : bonne réponse = points de la question + bonus de rapidité
    (jusqu'à bonus_rapidite_pct % des points, au prorata du temps restant).
    Mauvaise réponse ou temps écoulé : 0. Ni les points ni les corrections ne
    sont montrés pendant la partie ; le score à la fin de la partie, les
    corrections à la fin du jeu (fin_parties).
  - Classement : points décroissants, puis temps total de réponse (temps
    écoulé compté en entier), puis heure de fin de partie, puis tirage au
    sort enregistré à la création de la partie.
  - Lots : un exemplaire par rang (LotJeu.rang_debut..rang_fin) ; le nombre
    de gagnants est la somme des lots, jamais plus. Les lots vont, dans
    l'ordre du classement, aux joueurs qui remplissent score_minimum_pct et
    n'ont pas gagné de lot dans les exclure_gagnants_jours derniers jours.
    Lot en argent : crédité sur le compte repas à la publication (statut
    « credite ») ; objet : « a_remettre » puis « remis » (retiré) quand un
    gestionnaire ou un administrateur le remet — une seule fois.
  - Notifications : programmation du jeu (tous les employés concernés),
    rappel 15 min avant un jeu en direct, ouverture, relance la veille de la
    fin (libre, à ceux qui n'ont pas joué), résultats, lot retiré.

API employé (préfixe /api/api/)
  GET  jeux/                         en cours, à venir, mes participations
  GET  jeux/<id>/                    présentation, lots, conditions, ma partie
  POST jeux/<id>/commencer/          démarre (ou reprend) ma partie
  GET  jeux/<id>/partie/             état de ma partie (question en cours…)
  POST jeux/<id>/repondre/           {index, reponse_id}
  GET  jeux/<id>/resultats/          mon score, mes réponses (corrections après la fin)
  GET  jeux/<id>/classement/         après publication des résultats
API administration
  GET/POST        admin/jeux/                 (lecture : gestionnaires ; écriture : administrateurs)
  GET/PUT/DELETE  admin/jeux/<id>/
  POST admin/jeux/<id>/programmer/            visible et notifié
  POST admin/jeux/<id>/annuler/
  GET  admin/jeux/<id>/classement/            en direct (provisoire) puis définitif
  POST admin/jeux/<id>/publier-resultats/
  POST admin/jeux/<id>/remettre/<participation_id>/   lot retiré (gestionnaire de l'agence)
"""
import random
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Agence, Commande, Jeu, LotJeu, ParticipationJeu, QuestionJeu, ReponseJeu, ReponseJoueur, User, UserAgence,
)
from .permissions import (
    PRESTATAIRE_ROLES, IsAuthenticated, ReadGestionnaireWriteAdmin, agences_gerees, is_admin, is_gestionnaire,
)

TOLERANCE = timedelta(seconds=2)
SALLE_ATTENTE = timedelta(minutes=15)
RAPPEL_DIRECT = timedelta(minutes=15)
RELANCE_LIBRE = timedelta(hours=24)
MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre',
        'novembre', 'décembre']
MONTANT_MAX = Decimal('1000000')


# ══════════════════════════════════════════════════════════════
# OUTILS
# ══════════════════════════════════════════════════════════════

def _iso(dt):
    return timezone.localtime(dt).isoformat() if dt else None


def _quand(dt):
    return timezone.localtime(dt).strftime('%d/%m à %H:%M')


def _heure(dt):
    return timezone.localtime(dt).strftime('%H:%M')


def _ms(td):
    return max(0, int(td.total_seconds() * 1000))


def _fcfa(m):
    from .pdf_factures import fcfa
    return f"{fcfa(m)} F"


def nom_complet(u):
    return f"{u.nom} {u.prenom}".strip() or u.username


def nom_court(u):
    """Nom affiché aux autres employés : « Awa O. »."""
    prenom = (u.prenom or '').strip().split(' ')[0]
    initiale = (u.nom or '').strip()[:1].upper()
    return f"{prenom} {initiale}.".strip() if prenom else (f"{initiale}." if initiale else u.username)


def rang_fr(n):
    return '1er' if n == 1 else f'{n}e'


def libelle_rangs(lot):
    return str(lot.rang_debut) if lot.rang_debut == lot.rang_fin else f"{lot.rang_debut}-{lot.rang_fin}"


def libelle_lot(lot):
    return f"{_fcfa(lot.montant)} sur le compte repas" if lot.type == 'argent' and lot.montant else lot.libelle


def mois_du_jeu(jeu):
    d = timezone.localdate(jeu.debut)
    return d.year, d.month


def libelle_mois(jeu):
    a, m = mois_du_jeu(jeu)
    return f"{MOIS[m - 1]} {a}"


def questions_partie(jeu):
    """Questions jouées (libre : la banque entière ; direct : le tirage)."""
    qs = list(jeu.questions.all())
    if jeu.mode == 'direct' and jeu.tirage_direct:
        par_id = {q.id: q for q in qs}
        return [par_id[i] for i in jeu.tirage_direct if i in par_id]
    return qs


def nb_questions_effectif(jeu):
    if jeu.mode == 'direct' and jeu.tirage_direct:
        return len(jeu.tirage_direct)
    return min(jeu.nb_questions, jeu.questions.count())


def duree_max_partie(jeu):
    """Borne haute de la durée d'une partie (les nb questions les plus longues)."""
    if jeu.mode == 'direct':
        return timedelta(seconds=sum(q.duree for q in questions_partie(jeu)))
    durees = sorted((q.duree for q in jeu.questions.all()), reverse=True)[:jeu.nb_questions]
    return timedelta(seconds=sum(durees))


def fin_parties(jeu):
    """Heure à laquelle toutes les parties sont forcément terminées."""
    return jeu.fin if jeu.mode == 'direct' else jeu.fin + duree_max_partie(jeu) + TOLERANCE


def etat_jeu(jeu, maintenant=None):
    maintenant = maintenant or timezone.now()
    if jeu.annule_le:
        return 'annule'
    if not jeu.publie_le:
        return 'brouillon'
    if jeu.resultats_publies_le:
        return 'resultats'
    if maintenant < jeu.debut:
        return 'a_venir'
    if maintenant < jeu.fin:
        return 'en_cours'
    return 'termine'


LIBELLES_ETAT = {'annule': 'Annulé', 'brouillon': 'Brouillon', 'resultats': 'Résultats publiés',
                 'a_venir': 'Programmé', 'en_cours': 'En cours', 'termine': 'Terminé'}


def agences_actuelles(user_ids, maintenant=None):
    maintenant = maintenant or timezone.now()
    res = defaultdict(set)
    for uid, aid in (UserAgence.objects.filter(user_id__in=user_ids, date_debut__lte=maintenant)
                     .filter(Q(date_fin__isnull=True) | Q(date_fin__gte=maintenant))
                     .values_list('user_id', 'agence_id')):
        res[uid].add(aid)
    return res


def concerne(user, jeu, maintenant=None):
    agences = set(jeu.agences.values_list('id', flat=True))
    if not agences:
        return True
    return bool(agences_actuelles([user.id], maintenant).get(user.id, set()) & agences)


def _commandes_du_mois(jeu):
    a, m = mois_du_jeu(jeu)
    qs = Commande.objects.filter(menu__date_menu__year=a, menu__date_menu__month=m).exclude(statut='annulee')
    if not jeu.compter_repas_offerts:
        qs = qs.exclude(mode_paiement='offert')
    return qs


def nb_repas(user_id, jeu):
    return _commandes_du_mois(jeu).filter(user_id=user_id).count()


def nb_repas_par_user(jeu, user_ids=None):
    qs = _commandes_du_mois(jeu)
    if user_ids is not None:
        qs = qs.filter(user_id__in=user_ids)
    return dict(qs.values('user_id').annotate(n=Count('id')).values_list('user_id', 'n'))


def eligibilite(user, jeu, maintenant=None):
    n = nb_repas(user.id, jeu)
    ok = n >= jeu.repas_minimum
    mois = libelle_mois(jeu)
    if ok:
        message = f"{n} repas commandé{'s' if n > 1 else ''} en {mois} ({jeu.repas_minimum} minimum)."
    else:
        manque = jeu.repas_minimum - n
        message = (f"Commandez encore {manque} repas en {mois} pour participer "
                   f"({jeu.repas_minimum} minimum, {n} commandé{'s' if n > 1 else ''}).")
    return {'ok': ok, 'nb_repas': n, 'minimum': jeu.repas_minimum, 'mois': mois, 'message': message}


def destinataires(jeu, maintenant=None):
    """Employés concernés par le jeu (comptes actifs, hors comptes prestataires)."""
    qs = User.objects.filter(is_active=True).exclude(groups__name__in=PRESTATAIRE_ROLES)
    agences = list(jeu.agences.values_list('id', flat=True))
    if agences:
        maintenant = maintenant or timezone.now()
        ids = (UserAgence.objects.filter(agence_id__in=agences, date_debut__lte=maintenant)
               .filter(Q(date_fin__isnull=True) | Q(date_fin__gte=maintenant)).values_list('user_id', flat=True))
        qs = qs.filter(id__in=ids)
    return qs.distinct()


def _notifier(user_ids, titre, message, jeu_id, donnees=None):
    from .signals import _en_arriere_plan

    def envoyer():
        from .fcm_service import envoyer_notification_user
        for u in User.objects.filter(id__in=list(user_ids), is_active=True):
            envoyer_notification_user(user=u, titre=titre, message=message, type_notif='jeu',
                                      donnees={'jeu_id': jeu_id, **(donnees or {})})
    if user_ids:
        _en_arriere_plan(envoyer)


def _notifier_par_user(messages, jeu_id):
    """messages : [(user_id, titre, message, donnees)]"""
    from .signals import _en_arriere_plan

    def envoyer():
        from .fcm_service import envoyer_notification_user
        users = {u.id: u for u in User.objects.filter(id__in=[m[0] for m in messages], is_active=True)}
        for uid, titre, message, donnees in messages:
            if uid in users:
                envoyer_notification_user(user=users[uid], titre=titre, message=message, type_notif='jeu',
                                          donnees={'jeu_id': jeu_id, **(donnees or {})})
    if messages:
        _en_arriere_plan(envoyer)


# ══════════════════════════════════════════════════════════════
# PARTIE : LE TEMPS EST TENU PAR LE SERVEUR
# ══════════════════════════════════════════════════════════════

def _ouvrir(p, index, question, debut):
    ordre = list(question.reponses.values_list('id', flat=True))
    random.shuffle(ordre)
    return ReponseJoueur.objects.create(participation=p, question=question, index=index, debut_le=debut,
                                        limite=debut + timedelta(seconds=question.duree), ordre_reponses=ordre)


def _expirer(r):
    r.cloturee = True
    r.temps_ms = r.question.duree * 1000
    r.save(update_fields=['cloturee', 'temps_ms'])


def _totaliser(p, termine_le=None):
    rs = list(p.reponses.all())
    p.points = sum(r.points for r in rs)
    p.nb_bonnes = sum(1 for r in rs if r.correcte)
    p.temps_total_ms = sum(r.temps_ms for r in rs)
    champs = ['points', 'nb_bonnes', 'temps_total_ms']
    if termine_le and not p.termine_le:
        p.termine_le = termine_le
        champs.append('termine_le')
    p.save(update_fields=champs)


def _horaires_direct(jeu, questions):
    """[(question, ouverture, limite)] : même horaire pour tous."""
    res, t = [], jeu.debut
    for q in questions:
        fin = t + timedelta(seconds=q.duree)
        res.append((q, t, fin))
        t = fin
    return res


def avancer(p, maintenant=None):
    """
    Met la partie à l'heure du serveur (participation verrouillée par
    l'appelant) : clôt les questions dont le temps est écoulé, ouvre les
    suivantes, termine la partie. Idempotent.
    """
    maintenant = maintenant or timezone.now()
    if p.termine_le:
        return
    questions = {q.id: q for q in QuestionJeu.objects.filter(id__in=p.questions)}
    ordre = [questions[i] for i in p.questions if i in questions]
    existantes = {r.index: r for r in p.reponses.select_related('question')}
    if p.jeu.mode == 'direct':
        horaires = _horaires_direct(p.jeu, ordre)
        for i, (q, ouverture, limite) in enumerate(horaires):
            if ouverture > maintenant:
                break
            r = existantes.get(i) or _ouvrir(p, i, q, ouverture)
            if not r.cloturee and maintenant >= r.limite:
                _expirer(r)
        if not horaires or maintenant >= horaires[-1][2]:
            _totaliser(p, horaires[-1][2] if horaires else maintenant)
        return
    # libre : enchaînement
    while True:
        if existantes:
            dernier = existantes[max(existantes)]
            if not dernier.cloturee:
                if maintenant < dernier.limite:
                    return
                _expirer(dernier)
                suivant_debut = dernier.limite
            else:
                suivant_debut = dernier.repondu_le or dernier.limite
            index = dernier.index + 1
        else:
            index, suivant_debut = 0, p.debut_le
        if index >= len(ordre):
            _totaliser(p, suivant_debut)
            return
        existantes[index] = _ouvrir(p, index, ordre[index], suivant_debut)


def _partie_verrouillee(jeu, user):
    return ParticipationJeu.objects.select_for_update().select_related('jeu').filter(jeu=jeu, user=user).first()


def commencer(jeu, user, maintenant=None):
    maintenant = maintenant or timezone.now()
    etat = etat_jeu(jeu, maintenant)
    existante = ParticipationJeu.objects.filter(jeu=jeu, user=user).first()
    if existante:
        return existante
    ouverture = jeu.debut - (SALLE_ATTENTE if jeu.mode == 'direct' else timedelta(0))
    if etat not in ('a_venir', 'en_cours') or maintenant < ouverture:
        if etat == 'a_venir':
            raise ValidationError(f"Le jeu ouvre le {_quand(ouverture)}.")
        raise ValidationError("Ce jeu n'est pas ouvert.")
    if maintenant >= jeu.fin:
        raise ValidationError("Ce jeu est terminé.")
    if not concerne(user, jeu, maintenant):
        raise PermissionDenied("Ce jeu est réservé à d'autres agences.")
    elig = eligibilite(user, jeu, maintenant)
    if not elig['ok']:
        raise ValidationError(elig['message'])
    if jeu.mode == 'direct':
        ids = list(jeu.tirage_direct)
    else:
        ids = list(jeu.questions.values_list('id', flat=True))
        ids = random.sample(ids, min(jeu.nb_questions, len(ids)))
    if not ids:
        raise ValidationError("Ce jeu ne contient aucune question.")
    try:
        with transaction.atomic():
            return ParticipationJeu.objects.create(
                jeu=jeu, user=user, debut_le=max(maintenant, jeu.debut) if jeu.mode == 'direct' else maintenant,
                questions=ids, tirage=random.random(), nb_repas=elig['nb_repas'])
    except IntegrityError:
        return ParticipationJeu.objects.get(jeu=jeu, user=user)


def etat_partie(p, maintenant=None):
    """État présenté au joueur (aucune bonne réponse, aucun point pendant la partie)."""
    maintenant = maintenant or timezone.now()
    jeu = p.jeu
    total = len(p.questions)
    base = {'serveur': _iso(maintenant), 'total': total, 'mode': jeu.mode}
    if p.termine_le:
        return {**base, 'statut': 'terminee', 'points': p.points, 'nb_bonnes': p.nb_bonnes,
                'temps_total_ms': p.temps_total_ms, 'corrections_le': _iso(fin_parties(jeu)),
                'resultats_publies': bool(jeu.resultats_publies_le)}
    rs = list(p.reponses.select_related('question').order_by('index'))
    ouverte = next((r for r in rs if not r.cloturee), None)
    if jeu.mode == 'direct' and maintenant < jeu.debut:
        return {**base, 'statut': 'attente_debut', 'debut_dans_ms': _ms(jeu.debut - maintenant),
                'debut': _iso(jeu.debut)}
    if ouverte is None:
        # direct : réponse donnée, la question suivante s'ouvre pour tous plus tard
        par_id = {q.id: q for q in QuestionJeu.objects.filter(id__in=p.questions)}
        horaires = _horaires_direct(jeu, [par_id[i] for i in p.questions if i in par_id])
        prochaine = next((h for h in horaires[len(rs):]), None)
        return {**base, 'statut': 'attente_suivante', 'index': len(rs), 'repondues': len(rs),
                'suivante_dans_ms': _ms(prochaine[1] - maintenant) if prochaine else 0}
    reponses = {x.id: x for x in ouverte.question.reponses.all()}
    return {**base, 'statut': 'question', 'index': ouverte.index, 'repondues': ouverte.index,
            'question': {'texte': ouverte.question.texte, 'duree': ouverte.question.duree,
                         'reponses': [{'id': i, 'texte': reponses[i].texte} for i in ouverte.ordre_reponses
                                      if i in reponses]},
            'limite': _iso(ouverte.limite), 'restant_ms': _ms(ouverte.limite - maintenant)}


def repondre(p, index, reponse_id, maintenant=None):
    """Enregistre la réponse à la question ouverte (participation verrouillée)."""
    maintenant = maintenant or timezone.now()
    avancer(p, maintenant)
    r = p.reponses.select_related('question').filter(index=index).first()
    # Réponse arrivée juste après la limite (réseau lent) : acceptée pendant TOLERANCE,
    # sans bonus ; la question suivante, elle, s'est ouverte à l'heure.
    en_retard_tolere = (r is not None and r.cloturee and r.reponse_id is None
                        and maintenant <= r.limite + TOLERANCE)
    if r is None or (r.cloturee and not en_retard_tolere):
        raise ValidationError({'code': 'temps_ecoule',
                               'detail': "Temps écoulé : cette question est close."})
    try:
        reponse_id = int(reponse_id)
    except (TypeError, ValueError):
        raise ValidationError("Réponse invalide.")
    if reponse_id not in r.ordre_reponses:
        raise ValidationError("Réponse invalide.")
    choix = ReponseJeu.objects.get(pk=reponse_id)
    q = r.question
    instant = min(maintenant, r.limite)
    r.reponse, r.repondu_le, r.cloturee = choix, instant, True
    r.temps_ms = min(_ms(instant - r.debut_le), q.duree * 1000)
    r.correcte = choix.correcte
    if choix.correcte:
        restant = max(0.0, 1 - r.temps_ms / (q.duree * 1000))
        r.points = q.points + round(q.points * p.jeu.bonus_rapidite_pct / 100 * restant)
    r.save(update_fields=['reponse', 'repondu_le', 'cloturee', 'temps_ms', 'correcte', 'points'])
    _totaliser(p)
    if not en_retard_tolere:
        avancer(p, maintenant)


# ══════════════════════════════════════════════════════════════
# CLASSEMENT ET LOTS
# ══════════════════════════════════════════════════════════════

def _cle_classement(p):
    from datetime import datetime
    fin = p.termine_le or timezone.make_aware(datetime(9999, 1, 1))
    return (-p.points, p.temps_total_ms, fin, p.tirage)


def gagnants_recents(jeu, jours, maintenant):
    if not jours:
        return set()
    return set(ParticipationJeu.objects.filter(
        lot__isnull=False, jeu__resultats_publies_le__gte=maintenant - timedelta(days=jours))
        .exclude(jeu=jeu).values_list('user_id', flat=True))


def classer(jeu, maintenant=None, definitif=False):
    """
    Classement : [(participation, rang|None, lot|None, motif)] trié. Sans
    `definitif`, provisoire (rien n'est enregistré, parties en cours comprises).
    """
    maintenant = maintenant or timezone.now()
    parts = list(jeu.participations.select_related('user'))
    repas = nb_repas_par_user(jeu, [p.user_id for p in parts]) if definitif else {}
    classes, exclus = [], []
    for p in parts:
        if definitif:
            p.nb_repas = repas.get(p.user_id, 0)
            if p.nb_repas < jeu.repas_minimum:
                p.exclu_motif = (f"Condition non remplie à la fin du jeu : {p.nb_repas} repas commandé(s) en "
                                 f"{libelle_mois(jeu)} ({jeu.repas_minimum} minimum).")
                exclus.append(p)
                continue
            p.exclu_motif = ''
        elif p.exclu_motif:
            exclus.append(p)
            continue
        classes.append(p)
    classes.sort(key=_cle_classement)
    exemplaires = []
    for lot in jeu.lots.order_by('rang_debut'):
        exemplaires.extend([lot] * (lot.rang_fin - lot.rang_debut + 1))
    recents = gagnants_recents(jeu, jeu.exclure_gagnants_jours, maintenant)
    res = []
    for rang, p in enumerate(classes, start=1):
        lot, motif = None, ''
        if exemplaires:
            nbq = len(p.questions) or 1
            if jeu.score_minimum_pct and p.nb_bonnes * 100 < jeu.score_minimum_pct * nbq:
                motif = f"Score minimum non atteint ({jeu.score_minimum_pct} % de bonnes réponses)."
            elif p.user_id in recents:
                motif = f"Lot déjà gagné dans les {jeu.exclure_gagnants_jours} derniers jours."
            else:
                lot = exemplaires.pop(0)
        res.append((p, rang, lot, motif))
    for p in exclus:
        res.append((p, None, None, p.exclu_motif))
    return res


def publier_resultats(jeu, par, maintenant=None):
    from . import comptes_repas as cr
    maintenant = maintenant or timezone.now()
    with transaction.atomic():
        jeu = Jeu.objects.select_for_update().get(pk=jeu.pk)
        etat = etat_jeu(jeu, maintenant)
        if etat == 'resultats':
            raise ValidationError("Les résultats sont déjà publiés.")
        if etat != 'termine':
            raise ValidationError("Le jeu n'est pas terminé.")
        if maintenant < fin_parties(jeu):
            raise ValidationError(f"Des parties peuvent encore être en cours : publication possible à partir "
                                  f"du {_quand(fin_parties(jeu))}.")
        for p in jeu.participations.select_for_update():
            p.jeu = jeu
            avancer(p, maintenant)
        messages = []
        for p, rang, lot, motif in classer(jeu, maintenant, definitif=True):
            p.rang, p.lot, p.lot_motif = rang, lot, (motif if rang else '')
            p.statut_lot = ''
            if lot is not None:
                if lot.type == 'argent' and lot.montant:
                    compte = cr.compte_verrouille(p.user_id)
                    p.mouvement = cr._mouvement(compte, 'gain_jeu', lot.montant, par,
                                                libelle=f"Lot gagné : {jeu.titre} ({rang_fr(rang)})")
                    p.statut_lot, p.lot_remis_le = 'credite', maintenant
                else:
                    p.statut_lot = 'a_remettre'
            p.save(update_fields=['rang', 'lot', 'lot_motif', 'statut_lot', 'lot_remis_le', 'mouvement',
                                  'nb_repas', 'exclu_motif'])
            if lot is not None:
                suite = ("Le montant a été crédité sur votre compte repas." if p.statut_lot == 'credite'
                         else "Présentez-vous pour retirer votre lot.")
                messages.append((p.user_id, '🏆 Vous avez gagné !',
                                 f"{jeu.titre} : {rang_fr(rang)} sur {_nb_classes(jeu)}. Lot : {libelle_lot(lot)}. {suite}",
                                 {'resultat': 'gagne'}))
            elif rang:
                messages.append((p.user_id, f"Résultats : {jeu.titre}",
                                 f"Vous êtes {rang_fr(rang)} avec {p.points} points. Perdu cette fois, merci d'avoir "
                                 "participé !", {'resultat': 'perdu'}))
            else:
                messages.append((p.user_id, f"Résultats : {jeu.titre}", f"Non classé : {p.exclu_motif}",
                                 {'resultat': 'non_classe'}))
        jeu.resultats_publies_le = maintenant
        jeu.save(update_fields=['resultats_publies_le', 'updated_at'])
        transaction.on_commit(lambda: _notifier_par_user(messages, jeu.id))
    return jeu


def _nb_classes(jeu):
    return jeu.participations.filter(rang__isnull=False).count() or jeu.participations.count()


def peut_remettre(user, participation):
    if is_admin(user):
        return True
    if not is_gestionnaire(user):
        return False
    geres = agences_gerees(user) or set()
    return bool(agences_actuelles([participation.user_id]).get(participation.user_id, set()) & geres)


def remettre_lot(participation_id, jeu, par, maintenant=None):
    """Lot objet retiré par l'employé : enregistré une seule fois (pas de double retrait)."""
    maintenant = maintenant or timezone.now()
    with transaction.atomic():
        p = (ParticipationJeu.objects.select_for_update(of=('self',)).select_related('user', 'lot', 'lot_remis_par')
             .filter(pk=participation_id, jeu=jeu).first())
        if p is None:
            raise NotFound("Participation introuvable.")
        if not peut_remettre(par, p):
            raise PermissionDenied("Cet employé ne dépend pas de vos agences.")
        if p.statut_lot == 'remis':
            qui = nom_complet(p.lot_remis_par) if p.lot_remis_par else '—'
            raise ValidationError(f"Lot déjà retiré le {_quand(p.lot_remis_le)} (remis par {qui}).")
        if p.statut_lot == 'credite':
            raise ValidationError("Ce lot a été crédité sur le compte repas : rien à remettre.")
        if p.statut_lot != 'a_remettre':
            raise ValidationError("Cet employé n'a pas de lot à retirer.")
        p.statut_lot, p.lot_remis_le, p.lot_remis_par = 'remis', maintenant, par
        p.save(update_fields=['statut_lot', 'lot_remis_le', 'lot_remis_par'])
        transaction.on_commit(lambda: _notifier(
            [p.user_id], '🎁 Lot retiré', f"{p.lot.libelle} ({jeu.titre}) : retiré le {_quand(maintenant)}.",
            jeu.id, {'lot_retire': True}))
    return p


# ══════════════════════════════════════════════════════════════
# TÂCHES PLANIFIÉES
# ══════════════════════════════════════════════════════════════

def _marquer(jeu, champ, maintenant):
    """Pose le drapeau d'envoi une seule fois (vrai si c'est cet appel qui l'a posé)."""
    return Jeu.objects.filter(pk=jeu.pk, **{f'{champ}__isnull': True}).update(**{champ: maintenant}) == 1


def taches_jeux(maintenant=None):
    maintenant = maintenant or timezone.now()
    compte = {'rappels': 0, 'ouvertures': 0, 'relances': 0}
    actifs = Jeu.objects.filter(publie_le__isnull=False, annule_le__isnull=True, resultats_publies_le__isnull=True,
                                fin__gt=maintenant)
    for jeu in actifs:
        if (jeu.mode == 'direct' and not jeu.rappel_envoye_le and jeu.debut - RAPPEL_DIRECT <= maintenant < jeu.debut
                and _marquer(jeu, 'rappel_envoye_le', maintenant)):
            ids = list(destinataires(jeu, maintenant).values_list('id', flat=True))
            _notifier(ids, f"⏰ {jeu.titre} commence à {_heure(jeu.debut)}",
                      "Quiz en direct : tout le monde joue au même moment. Rejoignez la salle d'attente !", jeu.id)
            compte['rappels'] += len(ids)
        if not jeu.ouverture_envoyee_le and jeu.debut <= maintenant and _marquer(jeu, 'ouverture_envoyee_le', maintenant):
            ids = list(destinataires(jeu, maintenant).values_list('id', flat=True))
            if jeu.mode == 'direct':
                titre, msg = f"🎮 {jeu.titre} : c'est parti !", "Le quiz en direct commence maintenant."
            else:
                titre, msg = f"🎮 {jeu.titre} est ouvert", f"Jouez avant le {_quand(jeu.fin)} et gagnez des lots."
            _notifier(ids, titre, msg, jeu.id)
            compte['ouvertures'] += len(ids)
        if (jeu.mode == 'libre' and not jeu.relance_envoyee_le and jeu.fin - jeu.debut > RELANCE_LIBRE
                and jeu.fin - RELANCE_LIBRE <= maintenant and _marquer(jeu, 'relance_envoyee_le', maintenant)):
            joueurs = set(jeu.participations.values_list('user_id', flat=True))
            ids = [i for i in destinataires(jeu, maintenant).values_list('id', flat=True) if i not in joueurs]
            _notifier(ids, f"⌛ Dernier jour : {jeu.titre}",
                      f"Le jeu se termine le {_quand(jeu.fin)}. Il est encore temps de jouer !", jeu.id)
            compte['relances'] += len(ids)
    return compte


# ══════════════════════════════════════════════════════════════
# SÉRIALISATION
# ══════════════════════════════════════════════════════════════

def lots_json(jeu):
    return [{'id': l.id, 'rangs': libelle_rangs(l), 'rang_debut': l.rang_debut, 'rang_fin': l.rang_fin,
             'libelle': l.libelle, 'type': l.type, 'montant': float(l.montant) if l.montant is not None else None,
             'quantite': l.rang_fin - l.rang_debut + 1, 'libelle_affiche': libelle_lot(l)}
            for l in jeu.lots.order_by('rang_debut')]


def resultat_participation(p, jeu):
    if p is None:
        return None
    if not jeu.resultats_publies_le:
        return None
    if p.rang is None:
        return 'non_classe'
    return 'gagne' if p.lot_id else 'perdu'


def participation_json(p, jeu, maintenant):
    if p is None:
        return None
    return {
        'statut': 'terminee' if p.termine_le else 'en_cours',
        'debut_le': _iso(p.debut_le), 'termine_le': _iso(p.termine_le),
        'points': p.points if p.termine_le else None, 'nb_bonnes': p.nb_bonnes if p.termine_le else None,
        'nb_questions': len(p.questions), 'temps_total_ms': p.temps_total_ms if p.termine_le else None,
        'rang': p.rang if jeu.resultats_publies_le else None,
        'resultat': resultat_participation(p, jeu),
        'motif': (p.exclu_motif or p.lot_motif) if jeu.resultats_publies_le else '',
        'lot': ({'libelle': p.lot.libelle, 'libelle_affiche': libelle_lot(p.lot), 'type': p.lot.type,
                 'montant': float(p.lot.montant) if p.lot.montant is not None else None}
                if jeu.resultats_publies_le and p.lot_id else None),
        'statut_lot': p.statut_lot if jeu.resultats_publies_le else '',
        'lot_remis_le': _iso(p.lot_remis_le) if jeu.resultats_publies_le else None,
    }


def jeu_json(jeu, user=None, maintenant=None, participation=None, detail=False):
    maintenant = maintenant or timezone.now()
    lots = lots_json(jeu)
    questions = list(jeu.questions.all())
    durees = [q.duree for q in questions]
    d = {
        'id': jeu.id, 'titre': jeu.titre, 'description': jeu.description, 'mode': jeu.mode,
        'debut': _iso(jeu.debut), 'fin': _iso(jeu.fin), 'etat': etat_jeu(jeu, maintenant),
        'serveur': _iso(maintenant),
        'nb_questions': nb_questions_effectif(jeu),
        'duree_min': min(durees) if durees else 0, 'duree_max': max(durees) if durees else 0,
        'nb_gagnants': sum(l['quantite'] for l in lots), 'lots': lots,
        'repas_minimum': jeu.repas_minimum, 'mois': libelle_mois(jeu),
        'ouverture': _iso(jeu.debut - (SALLE_ATTENTE if jeu.mode == 'direct' else timedelta(0))),
        'resultats_publies_le': _iso(jeu.resultats_publies_le),
        'nb_participants': jeu.participations.count() if detail or jeu.resultats_publies_le else None,
    }
    if user is not None:
        d['participation'] = participation_json(participation, jeu, maintenant)
        if detail:
            d['eligibilite'] = eligibilite(user, jeu, maintenant)
            d['regles'] = {'bonus_rapidite_pct': jeu.bonus_rapidite_pct, 'score_minimum_pct': jeu.score_minimum_pct,
                           'exclure_gagnants_jours': jeu.exclure_gagnants_jours}
    return d


# ══════════════════════════════════════════════════════════════
# VUES EMPLOYÉ
# ══════════════════════════════════════════════════════════════

def _jeux_visibles(user, maintenant):
    agences = agences_actuelles([user.id], maintenant).get(user.id, set())
    return (Jeu.objects.filter(publie_le__isnull=False, annule_le__isnull=True)
            .filter(Q(agences__isnull=True) | Q(agences__in=agences) | Q(participations__user=user))
            .distinct().prefetch_related('lots', 'questions', 'agences'))


def _jeu_employe(request, pk):
    maintenant = timezone.now()
    jeu = _jeux_visibles(request.user, maintenant).filter(pk=pk).first()
    if jeu is None:
        raise NotFound("Jeu introuvable.")
    return jeu, maintenant


class JeuxView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        maintenant = timezone.now()
        jeux = list(_jeux_visibles(request.user, maintenant))
        parts = {p.jeu_id: p for p in ParticipationJeu.objects.filter(user=request.user, jeu__in=jeux)
                 .select_related('lot')}
        en_cours, a_venir, passes = [], [], []
        for j in jeux:
            p = parts.get(j.id)
            if p and not p.termine_le:
                with transaction.atomic():
                    p = _partie_verrouillee(j, request.user)
                    avancer(p, maintenant)
            d = jeu_json(j, request.user, maintenant, p)
            etat = d['etat']
            if etat == 'en_cours' or (etat == 'a_venir' and j.mode == 'direct' and maintenant >= j.debut - SALLE_ATTENTE):
                en_cours.append(d)
            elif etat == 'a_venir':
                a_venir.append(d)
            elif p is not None:
                passes.append(d)
            elif etat == 'termine' or (etat == 'resultats' and j.resultats_publies_le >= maintenant - timedelta(days=30)):
                passes.append(d)
        en_cours.sort(key=lambda d: d['fin'])
        a_venir.sort(key=lambda d: d['debut'])
        passes.sort(key=lambda d: d['fin'], reverse=True)
        return Response({'serveur': _iso(maintenant), 'en_cours': en_cours, 'a_venir': a_venir, 'passes': passes})


class JeuDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        jeu, maintenant = _jeu_employe(request, pk)
        p = ParticipationJeu.objects.filter(jeu=jeu, user=request.user).select_related('lot').first()
        if p and not p.termine_le:
            with transaction.atomic():
                p = _partie_verrouillee(jeu, request.user)
                avancer(p, maintenant)
        return Response(jeu_json(jeu, request.user, maintenant, p, detail=True))


class JeuCommencerView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        jeu, maintenant = _jeu_employe(request, pk)
        commencer(jeu, request.user, maintenant)
        with transaction.atomic():
            p = _partie_verrouillee(jeu, request.user)
            avancer(p, maintenant)
            return Response(etat_partie(p, maintenant))


class JeuPartieView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        jeu, maintenant = _jeu_employe(request, pk)
        with transaction.atomic():
            p = _partie_verrouillee(jeu, request.user)
            if p is None:
                raise NotFound("Vous n'avez pas commencé ce jeu.")
            avancer(p, maintenant)
            return Response(etat_partie(p, maintenant))


class JeuRepondreView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        jeu, maintenant = _jeu_employe(request, pk)
        try:
            index = int(request.data.get('index'))
        except (TypeError, ValueError):
            raise ValidationError({'index': "Question invalide."})
        with transaction.atomic():
            p = _partie_verrouillee(jeu, request.user)
            if p is None:
                raise NotFound("Vous n'avez pas commencé ce jeu.")
            try:
                with transaction.atomic():
                    repondre(p, index, request.data.get('reponse_id'), maintenant)
            except ValidationError as e:
                avancer(p, maintenant)
                if isinstance(e.detail, dict):
                    detail = {k: str(v[0] if isinstance(v, list) else v) for k, v in e.detail.items()}
                else:
                    detail = {'detail': str(e.detail[0] if isinstance(e.detail, list) else e.detail)}
                return Response({**detail, 'etat': etat_partie(p, maintenant)}, status=400)
            return Response(etat_partie(p, maintenant))


class JeuResultatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        jeu, maintenant = _jeu_employe(request, pk)
        with transaction.atomic():
            p = _partie_verrouillee(jeu, request.user)
            if p is None:
                raise NotFound("Vous n'avez pas participé à ce jeu.")
            avancer(p, maintenant)
        if not p.termine_le:
            raise ValidationError("Votre partie n'est pas terminée.")
        p = ParticipationJeu.objects.select_related('lot').get(pk=p.pk)
        corrections = maintenant >= fin_parties(jeu)
        reponses = []
        for r in p.reponses.select_related('question', 'reponse').prefetch_related('question__reponses'):
            item = {'index': r.index, 'question': r.question.texte, 'repondu': r.reponse_id is not None,
                    'reponse': r.reponse.texte if r.reponse_id else None, 'temps_ms': r.temps_ms}
            if corrections:
                bonne = next((x.texte for x in r.question.reponses.all() if x.correcte), None)
                item.update({'correcte': r.correcte, 'bonne_reponse': bonne, 'points': r.points})
            reponses.append(item)
        return Response({'jeu': jeu_json(jeu, request.user, maintenant, p),
                         'corrections': corrections, 'corrections_le': _iso(fin_parties(jeu)),
                         'nb_participants': jeu.participations.count(), 'reponses': reponses})


class JeuClassementView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        jeu, maintenant = _jeu_employe(request, pk)
        if not jeu.resultats_publies_le:
            raise ValidationError("Le classement sera visible à la publication des résultats.")
        parts = (jeu.participations.filter(rang__isnull=False).select_related('user', 'lot').order_by('rang'))
        lignes = [{'rang': p.rang, 'nom': 'Vous' if p.user_id == request.user.id else nom_court(p.user),
                   'initiales': (p.user.prenom[:1] + p.user.nom[:1]).upper() or p.user.username[:2].upper(),
                   'moi': p.user_id == request.user.id, 'points': p.points, 'nb_bonnes': p.nb_bonnes,
                   'nb_questions': len(p.questions), 'temps_total_ms': p.temps_total_ms,
                   'lot': libelle_lot(p.lot) if p.lot_id else None} for p in parts]
        return Response({'jeu': {'id': jeu.id, 'titre': jeu.titre}, 'nb_participants': jeu.participations.count(),
                         'nb_classes': len(lignes), 'lignes': lignes})


# ══════════════════════════════════════════════════════════════
# ADMINISTRATION
# ══════════════════════════════════════════════════════════════

def _date(valeur, champ):
    dt = parse_datetime(str(valeur or ''))
    if dt is None:
        raise ValidationError({champ: "Date et heure invalides."})
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _entier(valeur, champ, mini, maxi, defaut=None):
    if valeur in (None, '') and defaut is not None:
        return defaut
    try:
        n = int(valeur)
    except (TypeError, ValueError):
        raise ValidationError({champ: "Nombre entier attendu."})
    if not mini <= n <= maxi:
        raise ValidationError({champ: f"Entre {mini} et {maxi}."})
    return n


def _lire_questions(donnees):
    if not isinstance(donnees, list):
        raise ValidationError({'questions': "Liste attendue."})
    if len(donnees) > 500:
        raise ValidationError({'questions': "500 questions au plus."})
    res = []
    for n, q in enumerate(donnees, start=1):
        if not isinstance(q, dict):
            raise ValidationError({'questions': f"Question {n} : format invalide."})
        texte = str(q.get('texte') or '').strip()
        if not texte:
            raise ValidationError({'questions': f"Question {n} : texte obligatoire."})
        reponses = [r for r in (q.get('reponses') or []) if isinstance(r, dict) and str(r.get('texte') or '').strip()]
        if not 2 <= len(reponses) <= 4:
            raise ValidationError({'questions': f"Question {n} : 2 à 4 réponses."})
        if sum(1 for r in reponses if r.get('correcte')) != 1:
            raise ValidationError({'questions': f"Question {n} : une et une seule bonne réponse."})
        res.append({'texte': texte[:500], 'duree': _entier(q.get('duree'), 'questions', 5, 600, 20),
                    'points': _entier(q.get('points'), 'questions', 1, 10000, 100),
                    'reponses': [{'texte': str(r['texte']).strip()[:255], 'correcte': bool(r.get('correcte'))}
                                 for r in reponses]})
    return res


def _lire_lots(donnees):
    if not isinstance(donnees, list):
        raise ValidationError({'lots': "Liste attendue."})
    res, pris = [], set()
    for n, l in enumerate(donnees, start=1):
        if not isinstance(l, dict):
            raise ValidationError({'lots': f"Lot {n} : format invalide."})
        debut = _entier(l.get('rang_debut'), 'lots', 1, 10000)
        fin = _entier(l.get('rang_fin') or debut, 'lots', debut, 10000)
        rangs = set(range(debut, fin + 1))
        if rangs & pris:
            raise ValidationError({'lots': f"Lot {n} : rangs {debut}-{fin} déjà attribués à un autre lot."})
        pris |= rangs
        type_lot = l.get('type') or 'objet'
        if type_lot not in ('objet', 'argent'):
            raise ValidationError({'lots': f"Lot {n} : type invalide."})
        montant = None
        if type_lot == 'argent':
            try:
                montant = Decimal(str(l.get('montant')).replace(' ', '').replace(',', '.'))
            except (InvalidOperation, TypeError):
                raise ValidationError({'lots': f"Lot {n} : montant invalide."})
            if not Decimal('0') < montant <= MONTANT_MAX:
                raise ValidationError({'lots': f"Lot {n} : montant entre 1 et 1 000 000 F."})
        libelle = str(l.get('libelle') or '').strip()
        if not libelle:
            libelle = f"{_fcfa(montant)}" if montant else ''
        if not libelle:
            raise ValidationError({'lots': f"Lot {n} : libellé obligatoire."})
        res.append({'rang_debut': debut, 'rang_fin': fin, 'libelle': libelle[:150], 'type': type_lot,
                    'montant': montant})
    if pris and pris != set(range(1, max(pris) + 1)):
        raise ValidationError({'lots': "Les rangs des lots doivent se suivre à partir de 1 (sans trou)."})
    return res


def modifiable(jeu, maintenant=None):
    """Questions, lots et dates modifiables tant que personne n'a pu commencer."""
    maintenant = maintenant or timezone.now()
    if jeu.annule_le or jeu.resultats_publies_le or jeu.participations.exists():
        return False
    if jeu.publie_le:
        ouverture = jeu.debut - (SALLE_ATTENTE if jeu.mode == 'direct' else timedelta(0))
        return maintenant < ouverture
    return True


def _tirer_direct(jeu):
    ids = list(jeu.questions.values_list('id', flat=True))
    jeu.tirage_direct = random.sample(ids, min(jeu.nb_questions, len(ids)))
    jeu.fin = jeu.debut + timedelta(seconds=sum(
        QuestionJeu.objects.filter(id__in=jeu.tirage_direct).values_list('duree', flat=True)))


def enregistrer(jeu, d, par, maintenant=None):
    maintenant = maintenant or timezone.now()
    if jeu.pk and not modifiable(jeu, maintenant):
        raise ValidationError("Ce jeu a commencé : il n'est plus modifiable.")
    titre = str(d.get('titre') or '').strip()
    if not titre:
        raise ValidationError({'titre': "Titre obligatoire."})
    mode = d.get('mode') or 'libre'
    if mode not in ('libre', 'direct'):
        raise ValidationError({'mode': "Mode invalide (libre, direct)."})
    debut = _date(d.get('debut'), 'debut')
    fin = _date(d.get('fin'), 'fin') if mode == 'libre' else debut
    if mode == 'libre' and fin <= debut:
        raise ValidationError({'fin': "La fin doit être après le début."})
    questions = _lire_questions(d.get('questions') or [])
    lots = _lire_lots(d.get('lots') or [])
    agences = d.get('agences') or []
    if not isinstance(agences, list):
        raise ValidationError({'agences': "Liste attendue."})
    agences = list(Agence.objects.filter(id__in=[a for a in agences if str(a).isdigit()]))
    with transaction.atomic():
        jeu.titre, jeu.description, jeu.mode = titre[:150], str(d.get('description') or '')[:2000], mode
        jeu.debut, jeu.fin = debut, fin
        jeu.nb_questions = _entier(d.get('nb_questions'), 'nb_questions', 1, 100, 10)
        jeu.repas_minimum = _entier(d.get('repas_minimum'), 'repas_minimum', 0, 100, 1)
        jeu.compter_repas_offerts = bool(d.get('compter_repas_offerts'))
        jeu.bonus_rapidite_pct = _entier(d.get('bonus_rapidite_pct'), 'bonus_rapidite_pct', 0, 100, 50)
        jeu.score_minimum_pct = _entier(d.get('score_minimum_pct'), 'score_minimum_pct', 0, 100, 0)
        jeu.exclure_gagnants_jours = _entier(d.get('exclure_gagnants_jours'), 'exclure_gagnants_jours', 0, 3650, 0)
        if not jeu.pk:
            jeu.user_created = par
        jeu.save()
        jeu.agences.set(agences)
        jeu.questions.all().delete()
        for n, q in enumerate(questions):
            question = QuestionJeu.objects.create(jeu=jeu, texte=q['texte'], duree=q['duree'], points=q['points'],
                                                  ordre=n)
            ReponseJeu.objects.bulk_create([ReponseJeu(question=question, texte=r['texte'], correcte=r['correcte'],
                                                       ordre=i) for i, r in enumerate(q['reponses'])])
        jeu.lots.all().delete()
        LotJeu.objects.bulk_create([LotJeu(jeu=jeu, **l) for l in lots])
        if mode == 'direct':
            _tirer_direct(jeu)
        else:
            jeu.tirage_direct = []
        jeu.save(update_fields=['tirage_direct', 'fin', 'updated_at'])
    return jeu


def programmer(jeu, par, maintenant=None):
    maintenant = maintenant or timezone.now()
    if jeu.publie_le:
        raise ValidationError("Ce jeu est déjà programmé.")
    if jeu.annule_le:
        raise ValidationError("Ce jeu est annulé.")
    nbq = jeu.questions.count()
    if not nbq:
        raise ValidationError("Ajoutez au moins une question.")
    if jeu.nb_questions > nbq:
        raise ValidationError(f"Le jeu pose {jeu.nb_questions} questions mais la banque n'en contient que {nbq}.")
    if not jeu.lots.exists():
        raise ValidationError("Ajoutez au moins un lot.")
    if jeu.fin <= maintenant:
        raise ValidationError("La fin du jeu est passée.")
    with transaction.atomic():
        if jeu.mode == 'direct':
            _tirer_direct(jeu)
        jeu.publie_le = maintenant
        jeu.save(update_fields=['publie_le', 'tirage_direct', 'fin', 'updated_at'])
        ids = list(destinataires(jeu, maintenant).values_list('id', flat=True))
        nb = sum(l.rang_fin - l.rang_debut + 1 for l in jeu.lots.all())
        if jeu.mode == 'direct':
            msg = (f"Quiz en direct le {_quand(jeu.debut)} : tout le monde joue au même moment. "
                   f"{nb} lot{'s' if nb > 1 else ''} à gagner.")
        else:
            msg = f"Du {_quand(jeu.debut)} au {_quand(jeu.fin)} : {nb} lot{'s' if nb > 1 else ''} à gagner."
        if jeu.repas_minimum:
            msg += f" Pour jouer : au moins {jeu.repas_minimum} repas commandé(s) en {libelle_mois(jeu)}."
        transaction.on_commit(lambda: _notifier(ids, f"🎮 Nouveau jeu : {jeu.titre}", msg, jeu.id))
    return jeu


def admin_json(jeu, maintenant=None, complet=False):
    maintenant = maintenant or timezone.now()
    d = jeu_json(jeu, None, maintenant, detail=True)
    d.update({
        'etat_libelle': LIBELLES_ETAT[d['etat']], 'modifiable': modifiable(jeu, maintenant),
        'publie_le': _iso(jeu.publie_le), 'annule_le': _iso(jeu.annule_le),
        'nb_questions_banque': jeu.questions.count(),
        'agences': [{'id': a.id, 'nom': a.nom_agence} for a in jeu.agences.all()],
        'fin_parties': _iso(fin_parties(jeu)),
        'peut_publier_resultats': d['etat'] == 'termine' and maintenant >= fin_parties(jeu),
        'nb_participants': jeu.participations.count(),
    })
    if complet:
        d.update({
            'nb_questions_par_partie': jeu.nb_questions, 'compter_repas_offerts': jeu.compter_repas_offerts,
            'bonus_rapidite_pct': jeu.bonus_rapidite_pct, 'score_minimum_pct': jeu.score_minimum_pct,
            'exclure_gagnants_jours': jeu.exclure_gagnants_jours, 'tirage_direct': jeu.tirage_direct,
            'questions': [{'id': q.id, 'texte': q.texte, 'duree': q.duree, 'points': q.points,
                           'reponses': [{'texte': r.texte, 'correcte': r.correcte} for r in q.reponses.all()]}
                          for q in jeu.questions.prefetch_related('reponses')],
        })
    return d


def _jeu_admin(pk):
    jeu = Jeu.objects.filter(pk=pk).prefetch_related('lots', 'questions', 'agences').first()
    if jeu is None:
        raise NotFound("Jeu introuvable.")
    return jeu


class AdminJeuxView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def get(self, request):
        maintenant = timezone.now()
        jeux = Jeu.objects.prefetch_related('lots', 'questions', 'agences')
        return Response([admin_json(j, maintenant) for j in jeux])

    def post(self, request):
        jeu = enregistrer(Jeu(), request.data, request.user)
        return Response(admin_json(_jeu_admin(jeu.pk), complet=True), status=201)


class AdminJeuDetailView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def get(self, request, pk):
        return Response(admin_json(_jeu_admin(pk), complet=True))

    def put(self, request, pk):
        jeu = enregistrer(_jeu_admin(pk), request.data, request.user)
        return Response(admin_json(_jeu_admin(jeu.pk), complet=True))

    def delete(self, request, pk):
        jeu = _jeu_admin(pk)
        if jeu.participations.exists():
            raise ValidationError("Des employés ont joué : annulez le jeu au lieu de le supprimer.")
        if jeu.publie_le and not jeu.annule_le:
            raise ValidationError("Ce jeu est programmé : annulez-le d'abord.")
        jeu.delete()
        return Response(status=204)


class AdminJeuProgrammerView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def post(self, request, pk):
        jeu = programmer(_jeu_admin(pk), request.user)
        return Response(admin_json(_jeu_admin(jeu.pk), complet=True))


class AdminJeuAnnulerView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def post(self, request, pk):
        jeu = _jeu_admin(pk)
        if jeu.annule_le:
            raise ValidationError("Ce jeu est déjà annulé.")
        if jeu.resultats_publies_le:
            raise ValidationError("Les résultats sont publiés : le jeu ne peut plus être annulé.")
        maintenant = timezone.now()
        jeu.annule_le = maintenant
        jeu.save(update_fields=['annule_le', 'updated_at'])
        if jeu.publie_le:
            ids = list(destinataires(jeu, maintenant).values_list('id', flat=True))
            ids = set(ids) | set(jeu.participations.values_list('user_id', flat=True))
            motif = str(request.data.get('motif') or '').strip()
            _notifier(ids, f"Jeu annulé : {jeu.titre}", motif or "Ce jeu a été annulé.", jeu.id)
        return Response(admin_json(_jeu_admin(pk), complet=True))


class AdminJeuClassementView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def get(self, request, pk):
        jeu = _jeu_admin(pk)
        maintenant = timezone.now()
        if jeu.resultats_publies_le:
            parts = list(jeu.participations.select_related('user', 'lot', 'lot_remis_par'))
            parts.sort(key=lambda p: (p.rang is None, p.rang or 0))
            lignes = [(p, p.rang, p.lot, p.exclu_motif or p.lot_motif) for p in parts]
        else:
            with transaction.atomic():
                for p in jeu.participations.select_for_update().filter(termine_le__isnull=True):
                    avancer(p, maintenant)
            lignes = classer(jeu, maintenant)
        agences = agences_actuelles([p.user_id for p, *_ in lignes], maintenant)
        noms = dict(Agence.objects.values_list('id', 'nom_agence'))
        res = []
        for p, rang, lot, motif in lignes:
            res.append({
                'participation_id': p.id, 'rang': rang, 'employe': nom_complet(p.user), 'matricule': p.user.username,
                'agence': ', '.join(sorted(noms.get(a, '') for a in agences.get(p.user_id, set()))),
                'points': p.points, 'nb_bonnes': p.nb_bonnes, 'nb_questions': len(p.questions),
                'temps_total_ms': p.temps_total_ms, 'en_cours': not p.termine_le, 'termine_le': _iso(p.termine_le),
                'lot': libelle_lot(lot) if lot else None, 'motif': motif,
                'statut_lot': p.statut_lot if jeu.resultats_publies_le else '',
                'lot_remis_le': _iso(p.lot_remis_le) if jeu.resultats_publies_le else None,
                'lot_remis_par': nom_complet(p.lot_remis_par) if p.lot_remis_par_id else None,
                'peut_remettre': bool(jeu.resultats_publies_le and p.statut_lot == 'a_remettre'
                                      and peut_remettre(request.user, p)),
            })
        concernes = list(destinataires(jeu, maintenant).values_list('id', flat=True))
        repas = nb_repas_par_user(jeu, concernes)
        nb_eligibles = sum(1 for u in concernes if repas.get(u, 0) >= jeu.repas_minimum)
        total_q = sum(len(p.questions) for p, *_ in lignes if p.termine_le)
        bonnes = sum(p.nb_bonnes for p, *_ in lignes if p.termine_le)
        return Response({
            'jeu': admin_json(jeu, maintenant), 'definitif': bool(jeu.resultats_publies_le), 'lignes': res,
            'kpi': {'participants': len(res), 'eligibles': nb_eligibles, 'concernes': len(concernes),
                    'taux_bonnes': round(100 * bonnes / total_q) if total_q else None,
                    'gagnants': sum(1 for r in res if r['lot'])},
        })


class AdminJeuPublierResultatsView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def post(self, request, pk):
        jeu = publier_resultats(_jeu_admin(pk), request.user)
        return Response(admin_json(_jeu_admin(jeu.pk), complet=True))


class AdminJeuRemettreView(APIView):
    """Lot retiré : gestionnaires (employés de leurs agences) et administrateurs."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, participation_id):
        if not is_gestionnaire(request.user):
            raise PermissionDenied("Réservé aux gestionnaires et administrateurs.")
        p = remettre_lot(participation_id, _jeu_admin(pk), request.user)
        return Response({'participation_id': p.id, 'statut_lot': p.statut_lot, 'lot_remis_le': _iso(p.lot_remis_le),
                         'lot_remis_par': nom_complet(request.user)})
