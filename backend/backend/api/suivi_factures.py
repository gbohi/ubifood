"""
Suivi des factures prestataires (étape 3) : du relevé de prestations émis à
la clôture du mois jusqu'au paiement du prestataire.

Un relevé officiel (FacturePrestataire, un par prestataire et par mois
clôturé) suit cinq étapes, visibles des deux côtés :

  1. Relevé émis        à la clôture du mois (facturation.cloturer_mois) ;
  2. Bon pour accord    le responsable du prestataire accepte le relevé, ou le
                        conteste (commentaire obligatoire) : la comptabilité
                        répond (commentaire) et confirme le relevé, qui
                        redevient « émis » (montants figés : le mois est clôturé) ;
  3. Facture déposée    le prestataire dépose sa facture (PDF ≤ 10 Mo, n°,
                        date, montant TTC) ; le montant est comparé au relevé
                        (conforme, ou écart signalé à la comptabilité). Nouveau
                        dépôt possible tant que la facture n'est pas validée ;
  4. Facture validée    par la comptabilité, ou refusée (motif obligatoire :
                        le prestataire dépose une facture corrigée) ;
  5. Payée              date, mode (virement, chèque, espèces), référence,
                        justificatif facultatif.

Chaque action est tracée (HistoriqueFacturePrestataire : qui, quand, quoi,
commentaire) et notifiée : le prestataire (relevé émis, réponse à sa
contestation, facture validée / refusée, paiement, relance), la comptabilité
et les administrateurs (bon pour accord, contestation, facture déposée).

Routes (préfixe /api/api/) — référence : API.md de l'étape 3
  Prestataire (responsable, ses relevés seulement) :
    GET  prestataire/factures/                         ses relevés et leur suivi
    GET  prestataire/factures/<id>/                    détail (étapes, dépôts, historique)
    POST prestataire/factures/<id>/accord/             bon pour accord
    POST prestataire/factures/<id>/contester/          { commentaire }
    POST prestataire/factures/<id>/deposer/            multipart : fichier, numero_facture,
                                                       date_facture, montant_ttc
    GET  prestataire/factures/<id>/releve-pdf/         relevé officiel (PDF)
    GET  prestataire/factures/<id>/depots/<d>/fichier/ facture déposée (PDF)
    GET  prestataire/factures/<id>/justificatif/       justificatif de paiement
  Comptabilité (et administrateurs ; gestionnaire : lecture, prestataires de ses agences) :
    GET  paiements-prestataires/?annee=&mois=&prestataire=&statut=
    GET  paiements-prestataires/<id>/
    POST paiements-prestataires/<id>/repondre/         { commentaire }  (relevé confirmé)
    POST paiements-prestataires/<id>/valider/          { commentaire }
    POST paiements-prestataires/<id>/refuser/          { motif }
    POST paiements-prestataires/<id>/payer/            multipart : date_paiement, mode,
                                                       reference, justificatif (facultatif)
    POST paiements-prestataires/<id>/relancer/         { commentaire }
    GET  paiements-prestataires/<id>/releve-pdf/ | depots/<d>/fichier/ | justificatif/
"""

import os
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation
from io import BytesIO

from django.db import transaction
from django.db.models import Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    AgencePrestataire, FactureDeposee, FacturePrestataire, HistoriqueFacturePrestataire,
    ParametresSociete, User,
)
from .permissions import (
    IsAuthenticated, IsComptabilite, IsPrestataireResponsable, agences_gerees, is_comptabilite,
    is_gestionnaire, is_prestataire_responsable,
)
from .serializers import nom_complet

MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
        'septembre', 'octobre', 'novembre', 'décembre']

TAILLE_MAX = 10 * 1024 * 1024          # 10 Mo
COMMENTAIRE_MAX = 1000
MONTANT_MAX = Decimal('999999999999')

ETAPES = [
    (1, 'Relevé émis'),
    (2, 'Bon pour accord'),
    (3, 'Facture déposée'),
    (4, 'Facture validée'),
    (5, 'Payée'),
]
# Étape en cours (ou atteinte) pour chaque statut
ETAPE_DU_STATUT = {
    'emis': 2, 'conteste': 2, 'accorde': 3, 'facture_refusee': 3,
    'facture_deposee': 4, 'facture_validee': 5, 'payee': 5,
}
# Regroupement des montants (indicateurs de la comptabilité)
EN_COURS = ('emis', 'conteste', 'accorde', 'facture_deposee', 'facture_refusee')
DUS = ('facture_validee',)
PAYES = ('payee',)
# Relance possible : relevé bloqué à l'étape 2 (accord) ou 3 (facture)
RELANCABLES = ('emis', 'accorde', 'facture_refusee')
DEPOT_POSSIBLE = ('accorde', 'facture_deposee', 'facture_refusee')


def _f(m):
    return float(m) if m is not None else None


def _iso(dt):
    return timezone.localtime(dt).isoformat() if dt else None


def _nom(u):
    return nom_complet(u) if u else None


def libelle_mois(f):
    return f"{MOIS[f.mois - 1].capitalize()} {f.annee}"


def fcfa_texte(montant):
    """« 110 700 F » (notifications)."""
    m = Decimal(montant)
    entier = f"{abs(m):,.0f}" if m == m.to_integral() else f"{abs(m):,.2f}"
    return f"{'-' if m < 0 else ''}{entier.replace(',', ' ')} F"


def ecart_texte(ecart):
    return f"{'+' if ecart > 0 else ''}{fcfa_texte(ecart)}"


# ══════════════════════════════════════════════════════════════
# Représentation JSON
# ══════════════════════════════════════════════════════════════

def etapes(f, depot=None):
    """Les 5 étapes : etat = fait | en_cours | alerte | a_venir, date et précision."""
    courante = ETAPE_DU_STATUT.get(f.statut, 2)
    hist = {}
    for h in getattr(f, '_historique', None) or []:
        hist[h.action] = h        # la plus récente de chaque action
    resultat = []
    for numero, libelle in ETAPES:
        if f.statut == 'payee' or numero < courante:
            etat = 'fait'
        elif numero == courante:
            etat = 'en_cours'
        else:
            etat = 'a_venir'
        detail, quand = '', None
        if numero == 1:
            quand = f.cloture.cloturee_le if f.cloture_id else None
        elif numero == 2:
            if f.statut == 'conteste':
                etat, detail = 'alerte', 'Contesté'
                quand = hist['contestation'].created_at if 'contestation' in hist else None
            elif f.accord_le:
                quand = f.accord_le
        elif numero == 3:
            if f.statut == 'facture_refusee':
                etat, detail = 'alerte', 'Facture refusée : nouveau dépôt attendu'
            elif depot is not None and etat == 'fait':
                quand = depot.deposee_le
                detail = 'Montant conforme' if depot.conforme else f"Écart de {ecart_texte(depot.ecart)}"
        elif numero == 4 and f.validee_le:
            quand = f.validee_le
        elif numero == 5 and f.statut == 'payee':
            quand = f.paiement_le
            detail = f.get_mode_paiement_display()
        resultat.append({'numero': numero, 'libelle': libelle, 'etat': etat, 'date': _iso(quand),
                         'detail': detail})
    return resultat


def depot_json(d):
    return {
        'id': d.id, 'numero_facture': d.numero_facture, 'date_facture': d.date_facture.isoformat(),
        'montant_ttc': _f(d.montant_ttc), 'montant_releve': _f(d.montant_releve), 'ecart': _f(d.ecart),
        'conforme': d.conforme, 'statut': d.statut, 'statut_libelle': d.get_statut_display(),
        'nom_fichier': d.nom_fichier or os.path.basename(d.fichier.name), 'taille': d.taille,
        'deposee_le': _iso(d.deposee_le), 'deposee_par_nom': _nom(d.deposee_par),
        'traitee_le': _iso(d.traitee_le), 'traitee_par_nom': _nom(d.traitee_par),
        'motif_refus': d.motif_refus,
    }


def historique_json(h):
    return {'id': h.id, 'action': h.action, 'action_libelle': h.get_action_display(),
            'date': _iso(h.created_at), 'user_nom': _nom(h.user), 'commentaire': h.commentaire,
            'donnees': h.donnees or {}}


def actions_possibles(f, user):
    """Actions offertes à l'utilisateur sur ce relevé (le serveur les revérifie)."""
    if is_prestataire_responsable(user):
        if f.prestataire_id != user.prestataire_id:
            return []
        if f.statut == 'emis':
            return ['accord', 'contester']
        if f.statut in DEPOT_POSSIBLE:
            return ['deposer']
        return []
    if is_comptabilite(user):
        actions = []
        if f.statut == 'conteste':
            actions.append('repondre')
        if f.statut == 'facture_deposee':
            actions += ['valider', 'refuser']
        if f.statut == 'facture_validee':
            actions.append('payer')
        if f.statut in RELANCABLES:
            actions.append('relancer')
        return actions
    return []


def _depot_courant(f, depots):
    """Dernier dépôt (en attente, validé ou refusé) ; None si aucun."""
    for d in depots:
        if d.statut != 'remplacee':
            return d
    return None


def releve_json(f, user, detail=False):
    depots = list(f.depots.all())
    historique = list(f.historique.all())
    f._historique = historique
    depot = _depot_courant(f, depots)
    contestation = next((h for h in reversed(historique) if h.action == 'contestation'), None)
    reponse = next((h for h in reversed(historique) if h.action == 'reponse'), None)
    if contestation and reponse and reponse.created_at < contestation.created_at:
        reponse = None
    d = {
        'id': f.id, 'numero': f.numero, 'annee': f.annee, 'mois': f.mois, 'libelle': libelle_mois(f),
        'prestataire': {'id': f.prestataire_id, 'libelle': f.prestataire_libelle},
        'nb_repas': f.nb_repas, 'montant': _f(f.montant_total),
        'statut': f.statut, 'statut_libelle': f.get_statut_display(),
        'etape': ETAPE_DU_STATUT.get(f.statut, 2) if f.statut != 'payee' else 6,
        'etapes': etapes(f, depot),
        'cloturee_le': _iso(f.cloture.cloturee_le) if f.cloture_id else None,
        'accord_le': _iso(f.accord_le), 'accord_par_nom': _nom(f.accord_par),
        'validee_le': _iso(f.validee_le), 'validee_par_nom': _nom(f.validee_par),
        'facture': depot_json(depot) if depot else None,
        'contestation': ({'commentaire': contestation.commentaire, 'date': _iso(contestation.created_at),
                          'par': _nom(contestation.user),
                          'reponse': reponse.commentaire if reponse else None,
                          'reponse_date': _iso(reponse.created_at) if reponse else None,
                          'reponse_par': _nom(reponse.user) if reponse else None}
                         if contestation else None),
        'paiement': ({'date': f.date_paiement.isoformat() if f.date_paiement else None,
                      'mode': f.mode_paiement, 'mode_libelle': f.get_mode_paiement_display(),
                      'reference': f.reference_paiement, 'justificatif': bool(f.justificatif_paiement),
                      'enregistre_le': _iso(f.paiement_le), 'enregistre_par_nom': _nom(f.paiement_par)}
                     if f.statut == 'payee' else None),
        'derniere_relance_le': _iso(f.derniere_relance_le),
        'statut_modifie_le': _iso(f.statut_modifie_le or (f.cloture.cloturee_le if f.cloture_id else None)),
        'actions': actions_possibles(f, user),
    }
    if detail:
        d['depots'] = [depot_json(x) for x in depots]
        d['historique'] = [historique_json(h) for h in historique]
    return d


def _qs():
    return (FacturePrestataire.objects
            .select_related('cloture', 'accord_par', 'validee_par', 'paiement_par')
            .prefetch_related('depots__deposee_par', 'depots__traitee_par', 'historique__user'))


# ══════════════════════════════════════════════════════════════
# Notifications
# ══════════════════════════════════════════════════════════════

def destinataires_comptabilite():
    """Comptabilité et administrateurs actifs (jamais un compte prestataire)."""
    return list(User.objects.filter(is_active=True)
                .filter(Q(groups__name__in=['comptabilite', 'admin', 'super_admin']) | Q(is_superuser=True))
                .exclude(groups__name__in=['prestataire', 'agent_comptoir']).distinct())


def _envoyer(users, titre, message, releve):
    from .fcm_service import envoyer_notification_user
    for u in users:
        envoyer_notification_user(user=u, titre=titre, message=message, type_notif='facture_prestataire',
                                  donnees={'releve_id': releve.id, 'statut': releve.statut})


def _notifier(releve_id, cible, titre, message):
    releve = FacturePrestataire.objects.filter(pk=releve_id).first()
    if releve is None:
        return
    if cible == 'prestataire':
        users = list(User.objects.filter(prestataire_id=releve.prestataire_id, is_active=True,
                                         groups__name='prestataire').distinct())
    else:
        users = destinataires_comptabilite()
    _envoyer(users, titre, message, releve)


def notifier(releve, cible, titre, message):
    """Envoi après validation de la transaction (signals._en_arriere_plan)."""
    from .signals import _en_arriere_plan
    _en_arriere_plan(_notifier, releve.id, cible, titre, message)


def _ref(f):
    return f"{f.numero or 'relevé'} ({MOIS[f.mois - 1]} {f.annee})"


def releve_emis(releve, par_user):
    """Étape 1, appelée par la clôture du mois : historique et notification du prestataire."""
    HistoriqueFacturePrestataire.objects.create(
        releve=releve, action='emis', user=par_user,
        donnees={'numero': releve.numero or '', 'montant': str(releve.montant_total)})
    notifier(releve, 'prestataire', '📄 Relevé de prestations émis',
             f"Votre relevé {_ref(releve)} est émis : {releve.nb_repas} repas, "
             f"{fcfa_texte(releve.montant_total)}. Donnez votre bon pour accord, puis déposez votre facture "
             "dans « Relevés & factures ».")


# ══════════════════════════════════════════════════════════════
# Transitions (sous verrou : deux actions simultanées ne se croisent pas)
# ══════════════════════════════════════════════════════════════

def _verrou(releve_id):
    return FacturePrestataire.objects.select_for_update().get(pk=releve_id)


def _exiger(f, statuts, message):
    if f.statut not in statuts:
        raise ValidationError({'statut': f"{message} (relevé : {f.get_statut_display().lower()})."})


def _texte(valeur, champ, obligatoire, message=None, maxi=COMMENTAIRE_MAX):
    texte = (valeur or '').strip() if isinstance(valeur, str) else ''
    if obligatoire and not texte:
        raise ValidationError({champ: message or "Ce champ est obligatoire."})
    if len(texte) > maxi:
        raise ValidationError({champ: f"{maxi} caractères au plus."})
    return texte


def _tracer(f, action, user, commentaire='', **donnees):
    HistoriqueFacturePrestataire.objects.create(releve=f, action=action, user=user,
                                                commentaire=commentaire or '', donnees=donnees)


def _changer(f, statut, champs=()):
    f.statut = statut
    f.statut_modifie_le = timezone.now()
    f.save(update_fields=['statut', 'statut_modifie_le', *champs])


def accorder(releve_id, user, commentaire=''):
    commentaire = _texte(commentaire, 'commentaire', False)
    with transaction.atomic():
        f = _verrou(releve_id)
        _exiger(f, ('emis',), "Le bon pour accord n'est possible que sur un relevé émis")
        f.accord_par, f.accord_le = user, timezone.now()
        _changer(f, 'accorde', ('accord_par', 'accord_le'))
        _tracer(f, 'accord', user, commentaire)
        notifier(f, 'comptabilite', f"👍 Bon pour accord — {f.prestataire_libelle}",
                 f"{f.prestataire_libelle} a donné son bon pour accord sur le relevé {_ref(f)} "
                 f"({fcfa_texte(f.montant_total)}). Sa facture est attendue.")
    return f


def contester(releve_id, user, commentaire):
    commentaire = _texte(commentaire, 'commentaire', True, "Expliquez ce que vous contestez dans le relevé.")
    with transaction.atomic():
        f = _verrou(releve_id)
        _exiger(f, ('emis',), "Seul un relevé émis (avant le bon pour accord) peut être contesté")
        _changer(f, 'conteste')
        _tracer(f, 'contestation', user, commentaire)
        notifier(f, 'comptabilite', f"⚠️ Relevé contesté — {f.prestataire_libelle}",
                 f"{f.prestataire_libelle} conteste le relevé {_ref(f)} : {commentaire}")
    return f


def repondre(releve_id, user, commentaire):
    commentaire = _texte(commentaire, 'commentaire', True, "La réponse au prestataire est obligatoire.")
    with transaction.atomic():
        f = _verrou(releve_id)
        _exiger(f, ('conteste',), "Ce relevé n'est pas contesté")
        _changer(f, 'emis')
        _tracer(f, 'reponse', user, commentaire)
        notifier(f, 'prestataire', '💬 Réponse à votre contestation',
                 f"Relevé {_ref(f)} : {commentaire} Le relevé est confirmé "
                 f"({fcfa_texte(f.montant_total)}) : donnez votre bon pour accord.")
    return f


def lire_montant(valeur, champ):
    try:
        m = Decimal(str(valeur).replace(' ', '').replace(' ', '').replace(',', '.'))
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError({champ: "Montant invalide."})
    if not m.is_finite() or m != m.quantize(Decimal('0.01')):
        raise ValidationError({champ: "Montant invalide (2 décimales au plus)."})
    if m <= 0:
        raise ValidationError({champ: "Le montant doit être supérieur à zéro."})
    if m > MONTANT_MAX:
        raise ValidationError({champ: "Montant trop élevé."})
    return m.quantize(Decimal('0.01'))


def lire_date(valeur, champ, futur=False):
    if not valeur:
        raise ValidationError({champ: "La date est obligatoire."})
    try:
        d = date.fromisoformat(str(valeur)[:10])
    except ValueError:
        raise ValidationError({champ: "Date invalide (format AAAA-MM-JJ)."})
    if not futur and d > timezone.localdate():
        raise ValidationError({champ: "La date ne peut pas être dans le futur."})
    return d


SIGNATURES = {
    'pdf': (b'%PDF-',),
    'png': (b'\x89PNG\r\n\x1a\n',),
    'jpg': (b'\xff\xd8\xff',),
    'jpeg': (b'\xff\xd8\xff',),
}


def verifier_fichier(fichier, champ, extensions=('pdf',)):
    """Fichier envoyé : extension et contenu (signature) autorisés, 10 Mo au plus."""
    if fichier is None or not hasattr(fichier, 'read'):
        raise ValidationError({champ: "Joignez le fichier."})
    ext = os.path.splitext(fichier.name or '')[1].lower().lstrip('.')
    noms = ' ou '.join(e.upper() for e in extensions if e != 'jpeg')
    if ext not in extensions:
        raise ValidationError({champ: f"Format refusé : fichier {noms} uniquement."})
    if fichier.size > TAILLE_MAX:
        raise ValidationError({champ: "Fichier trop volumineux (10 Mo au plus)."})
    if not fichier.size:
        raise ValidationError({champ: "Le fichier est vide."})
    debut = fichier.read(8)
    fichier.seek(0)
    if not any(debut.startswith(s) for s in SIGNATURES[ext]):
        raise ValidationError({champ: f"Le fichier n'est pas un {noms} valide."})
    nom_origine = os.path.basename(fichier.name)[:255]
    fichier.name = f"{uuid.uuid4().hex}.{'jpg' if ext == 'jpeg' else ext}"   # nom non devinable
    return nom_origine


def deposer(releve_id, user, fichier, numero_facture, date_facture, montant_ttc):
    numero_facture = _texte(numero_facture, 'numero_facture', True, "Le numéro de la facture est obligatoire.",
                            maxi=60)
    date_facture = lire_date(date_facture, 'date_facture')
    montant_ttc = lire_montant(montant_ttc, 'montant_ttc')
    nom_origine = verifier_fichier(fichier, 'fichier')
    with transaction.atomic():
        f = _verrou(releve_id)
        if f.statut in ('emis', 'conteste'):
            raise ValidationError({'statut': "Donnez d'abord votre bon pour accord sur le relevé."})
        _exiger(f, DEPOT_POSSIBLE, "La facture ne peut plus être déposée")
        if date_facture < date(f.annee, f.mois, 1):
            raise ValidationError({'date_facture': "La facture ne peut pas précéder le mois facturé."})
        remplace = f.statut == 'facture_deposee'
        f.depots.filter(statut='en_attente').update(statut='remplacee')
        ecart = montant_ttc - f.montant_total
        depot = FactureDeposee.objects.create(
            releve=f, fichier=fichier, nom_fichier=nom_origine, taille=fichier.size,
            numero_facture=numero_facture, date_facture=date_facture, montant_ttc=montant_ttc,
            montant_releve=f.montant_total, ecart=ecart, deposee_par=user)
        _changer(f, 'facture_deposee')
        _tracer(f, 'depot', user, '', depot_id=depot.id, numero_facture=numero_facture,
                montant_ttc=str(montant_ttc), ecart=str(ecart), conforme=ecart == 0, remplace=remplace)
        if ecart == 0:
            constat = "montant conforme au relevé"
            titre = f"📥 Facture déposée — {f.prestataire_libelle}"
        else:
            constat = (f"⚠️ écart de {ecart_texte(ecart)} avec le relevé "
                       f"({fcfa_texte(montant_ttc)} facturés pour {fcfa_texte(f.montant_total)})")
            titre = f"⚠️ Facture avec écart — {f.prestataire_libelle}"
        notifier(f, 'comptabilite', titre,
                 f"{f.prestataire_libelle} a déposé la facture n° {numero_facture} pour le relevé {_ref(f)} : "
                 f"{constat}. À valider.")
    return f, depot


def valider(releve_id, user, commentaire=''):
    commentaire = _texte(commentaire, 'commentaire', False)
    with transaction.atomic():
        f = _verrou(releve_id)
        _exiger(f, ('facture_deposee',), "Aucune facture en attente de validation")
        depot = f.depots.filter(statut='en_attente').order_by('-deposee_le', '-id').first()
        if depot is None:
            raise ValidationError({'statut': "Aucune facture en attente de validation."})
        maintenant = timezone.now()
        FactureDeposee.objects.filter(pk=depot.pk).update(statut='validee', traitee_par=user, traitee_le=maintenant)
        f.validee_par, f.validee_le = user, maintenant
        _changer(f, 'facture_validee', ('validee_par', 'validee_le'))
        _tracer(f, 'validation', user, commentaire, depot_id=depot.id, numero_facture=depot.numero_facture,
                ecart=str(depot.ecart))
        notifier(f, 'prestataire', '✅ Facture validée',
                 f"Votre facture n° {depot.numero_facture} (relevé {_ref(f)}, {fcfa_texte(depot.montant_ttc)}) "
                 "est validée par la comptabilité : elle est mise en paiement."
                 + (f" {commentaire}" if commentaire else ''))
    return f


def refuser(releve_id, user, motif):
    motif = _texte(motif, 'motif', True, "Le motif du refus est obligatoire.")
    with transaction.atomic():
        f = _verrou(releve_id)
        _exiger(f, ('facture_deposee',), "Aucune facture en attente de validation")
        depot = f.depots.filter(statut='en_attente').order_by('-deposee_le', '-id').first()
        if depot is None:
            raise ValidationError({'statut': "Aucune facture en attente de validation."})
        FactureDeposee.objects.filter(pk=depot.pk).update(statut='refusee', traitee_par=user,
                                                          traitee_le=timezone.now(), motif_refus=motif)
        _changer(f, 'facture_refusee')
        _tracer(f, 'refus', user, motif, depot_id=depot.id, numero_facture=depot.numero_facture)
        notifier(f, 'prestataire', '❌ Facture refusée',
                 f"Votre facture n° {depot.numero_facture} (relevé {_ref(f)}) est refusée : {motif} "
                 "Déposez une facture corrigée dans « Relevés & factures ».")
    return f


def payer(releve_id, user, date_paiement, mode, reference, justificatif=None):
    date_paiement = lire_date(date_paiement, 'date_paiement')
    mode = (mode or '').strip() if isinstance(mode, str) else ''
    if mode not in dict(FacturePrestataire.MODE_PAIEMENT_CHOICES):
        raise ValidationError({'mode': "Mode de paiement : virement, chèque ou espèces."})
    reference = _texte(reference, 'reference', mode in ('virement', 'cheque'),
                       "La référence du virement ou le numéro du chèque est obligatoire.", maxi=100)
    nom_justificatif = None
    if justificatif is not None:
        nom_justificatif = verifier_fichier(justificatif, 'justificatif', ('pdf', 'png', 'jpg', 'jpeg'))
    with transaction.atomic():
        f = _verrou(releve_id)
        _exiger(f, ('facture_validee',), "Seule une facture validée peut être marquée payée")
        if f.validee_le and date_paiement < timezone.localdate(f.validee_le):
            raise ValidationError({'date_paiement': "Le paiement ne peut pas précéder la validation de la facture."})
        f.date_paiement, f.mode_paiement, f.reference_paiement = date_paiement, mode, reference
        f.paiement_par, f.paiement_le = user, timezone.now()
        champs = ['date_paiement', 'mode_paiement', 'reference_paiement', 'paiement_par', 'paiement_le']
        if justificatif is not None:
            f.justificatif_paiement = justificatif
            champs.append('justificatif_paiement')
        _changer(f, 'payee', champs)
        _tracer(f, 'paiement', user, '', date=date_paiement.isoformat(), mode=mode, reference=reference,
                justificatif=nom_justificatif or '')
        depot = f.depots.filter(statut='validee').order_by('-deposee_le').first()
        montant = depot.montant_ttc if depot else f.montant_total
        notifier(f, 'prestataire', '💰 Paiement effectué',
                 f"Le relevé {_ref(f)} est payé : {fcfa_texte(montant)} le {date_paiement:%d/%m/%Y} "
                 f"par {f.get_mode_paiement_display().lower()}" + (f" (réf. {reference})" if reference else '') + '.')
    return f


def relancer(releve_id, user, commentaire=''):
    commentaire = _texte(commentaire, 'commentaire', False)
    with transaction.atomic():
        f = _verrou(releve_id)
        _exiger(f, RELANCABLES, "Relance possible seulement en attente du bon pour accord ou de la facture")
        attendu = ("votre bon pour accord" if f.statut == 'emis'
                   else "une facture corrigée" if f.statut == 'facture_refusee' else "votre facture")
        f.derniere_relance_le = timezone.now()
        f.save(update_fields=['derniere_relance_le'])
        _tracer(f, 'relance', user, commentaire, attendu=attendu)
        notifier(f, 'prestataire', f"⏰ Relance : relevé {f.numero or ''}".strip(),
                 f"La comptabilité attend {attendu} pour le relevé {_ref(f)} ({fcfa_texte(f.montant_total)})."
                 + (f" {commentaire}" if commentaire else ''))
    return f


# ══════════════════════════════════════════════════════════════
# Vues
# ══════════════════════════════════════════════════════════════

def _fichier(champ_fichier, nom, type_mime=None):
    if not champ_fichier:
        raise Http404("Aucun fichier.")
    try:
        flux = champ_fichier.open('rb')
    except (FileNotFoundError, OSError):
        raise Http404("Fichier introuvable sur le serveur.")
    ext = os.path.splitext(champ_fichier.name)[1].lower()
    if type_mime is None:
        type_mime = {'.pdf': 'application/pdf', '.png': 'image/png'}.get(ext, 'image/jpeg')
    return FileResponse(flux, content_type=type_mime, as_attachment=True, filename=nom)


def _releve_pdf(f):
    from .pdf_factures import generer_facture_prestataire
    contenu = generer_facture_prestataire(f, ParametresSociete.charger())
    return FileResponse(BytesIO(contenu), content_type='application/pdf', as_attachment=True,
                        filename=f"releve-prestations-{f.numero or f.id}.pdf")


def _nom_justificatif(f):
    ext = os.path.splitext(f.justificatif_paiement.name)[1].lower() or '.pdf'
    return f"justificatif-paiement-{f.numero or f.id}{ext}"


class _Base(APIView):
    """Accès commun : `releves(request)` = relevés visibles de l'utilisateur."""
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def releves(self, request):
        raise NotImplementedError

    def releve(self, request, pk):
        return get_object_or_404(self.releves(request), pk=pk)

    def repondre_json(self, request, f, code=200):
        return Response(releve_json(_qs().get(pk=f.pk), request.user, detail=True), status=code)


# ── Prestataire ──────────────────────────────────────────────

class _PrestataireBase(_Base):
    permission_classes = [IsPrestataireResponsable]

    def releves(self, request):
        return _qs().filter(prestataire_id=request.user.prestataire_id)


class PrestaFacturesView(_PrestataireBase):
    """GET prestataire/factures/   relevés officiels du prestataire et leur suivi (du plus récent)."""

    def get(self, request):
        return Response([releve_json(f, request.user) for f in self.releves(request)])


class PrestaFactureDetailView(_PrestataireBase):
    def get(self, request, pk):
        return Response(releve_json(self.releve(request, pk), request.user, detail=True))


class PrestaFactureActionView(_PrestataireBase):
    """POST prestataire/factures/<id>/accord/ | contester/ | deposer/"""
    action = None

    def post(self, request, pk):
        f = self.releve(request, pk)
        d = request.data
        if self.action == 'accord':
            f = accorder(f.pk, request.user, d.get('commentaire'))
        elif self.action == 'contester':
            f = contester(f.pk, request.user, d.get('commentaire'))
        elif self.action == 'deposer':
            f, _ = deposer(f.pk, request.user, request.FILES.get('fichier'), d.get('numero_facture'),
                           d.get('date_facture'), d.get('montant_ttc'))
        return self.repondre_json(request, f)


# ── Comptabilité ─────────────────────────────────────────────

class _ComptaBase(_Base):
    """Comptabilité et administrateurs ; gestionnaire en lecture (prestataires de ses agences)."""
    permission_classes = [IsAuthenticated]

    def releves(self, request):
        u = request.user
        if is_comptabilite(u):
            return _qs()
        if is_gestionnaire(u):
            geres = agences_gerees(u)
            ids = AgencePrestataire.objects.filter(agence_id__in=geres or []).values('prestataire_id')
            return _qs().filter(prestataire_id__in=ids)
        raise PermissionDenied("Accès réservé à la comptabilité.")


def _totaux(qs):
    t = {}
    for cle, statuts in (('dus', DUS), ('en_cours', EN_COURS), ('payes', PAYES)):
        lignes = [f for f in qs if f.statut in statuts]
        t[cle] = {'nb': len(lignes), 'montant': _f(sum((f.montant_total for f in lignes), Decimal('0')))}
    t['total'] = {'nb': len(qs), 'montant': _f(sum((f.montant_total for f in qs), Decimal('0')))}
    t['a_traiter'] = sum(f.statut in ('conteste', 'facture_deposee', 'facture_validee') for f in qs)
    return t


class PaiementsPrestatairesView(_ComptaBase):
    """
    GET paiements-prestataires/?annee=2026|toutes&mois=&prestataire=&statut=|a_traiter
    Indicateurs (dus = factures validées à payer, en cours, payés) sur l'année
    (et le prestataire) choisis ; une ligne par prestataire et par mois.
    """

    def get(self, request):
        p = request.query_params
        tous = self.releves(request)
        annees = sorted(set(tous.values_list('annee', flat=True)), reverse=True)
        annee = p.get('annee')
        if annee in (None, ''):
            annee = timezone.localdate().year if timezone.localdate().year in annees or not annees else annees[0]
        elif annee == 'toutes':
            annee = None
        elif str(annee).isdigit():
            annee = int(annee)
        else:
            raise ValidationError({'annee': "Année invalide."})
        qs = tous if annee is None else tous.filter(annee=annee)
        prestataire = p.get('prestataire')
        if prestataire:
            if not str(prestataire).isdigit():
                raise ValidationError({'prestataire': "Prestataire invalide."})
            qs = qs.filter(prestataire_id=int(prestataire))
        base = list(qs)
        lignes = base
        mois = p.get('mois')
        if mois:
            if not str(mois).isdigit() or not 1 <= int(mois) <= 12:
                raise ValidationError({'mois': "Mois invalide (1-12)."})
            lignes = [f for f in lignes if f.mois == int(mois)]
        statut = p.get('statut')
        if statut == 'a_traiter':
            lignes = [f for f in lignes if f.statut in ('conteste', 'facture_deposee', 'facture_validee')]
        elif statut:
            if statut not in dict(FacturePrestataire.STATUT_CHOICES):
                raise ValidationError({'statut': "Statut invalide."})
            lignes = [f for f in lignes if f.statut == statut]
        prestataires = {}
        for f in tous:
            prestataires.setdefault(f.prestataire_id, f.prestataire_libelle)
        return Response({
            'annee': annee,
            'annees': annees,
            'peut_agir': is_comptabilite(request.user),
            'totaux': _totaux(base),
            'statuts': [{'code': c, 'libelle': l} for c, l in FacturePrestataire.STATUT_CHOICES],
            'prestataires': [{'id': i, 'libelle': l} for i, l in sorted(prestataires.items(), key=lambda x: x[1])],
            'resultats': [releve_json(f, request.user) for f in lignes],
        })


class PaiementPrestataireDetailView(_ComptaBase):
    def get(self, request, pk):
        return Response(releve_json(self.releve(request, pk), request.user, detail=True))


class PaiementPrestataireActionView(_ComptaBase):
    """POST paiements-prestataires/<id>/repondre/ | valider/ | refuser/ | payer/ | relancer/"""
    action = None

    def post(self, request, pk):
        if not is_comptabilite(request.user):
            raise PermissionDenied(IsComptabilite.message)
        f = self.releve(request, pk)
        d = request.data
        if self.action == 'repondre':
            f = repondre(f.pk, request.user, d.get('commentaire'))
        elif self.action == 'valider':
            f = valider(f.pk, request.user, d.get('commentaire'))
        elif self.action == 'refuser':
            f = refuser(f.pk, request.user, d.get('motif'))
        elif self.action == 'payer':
            f = payer(f.pk, request.user, d.get('date_paiement'), d.get('mode'), d.get('reference'),
                      request.FILES.get('justificatif'))
        elif self.action == 'relancer':
            f = relancer(f.pk, request.user, d.get('commentaire'))
        return self.repondre_json(request, f)


# ── Fichiers (les deux côtés) ────────────────────────────────

def _vue_fichiers(base):
    class ReleveFichiersView(base):
        """GET …/<id>/releve-pdf/ | …/<id>/depots/<depot>/fichier/ | …/<id>/justificatif/"""
        quoi = None

        def get(self, request, pk, depot=None):
            f = self.releve(request, pk)
            if self.quoi == 'releve':
                return _releve_pdf(f)
            if self.quoi == 'depot':
                d = get_object_or_404(FactureDeposee, pk=depot, releve=f)
                return _fichier(d.fichier, d.nom_fichier or f"facture-{d.numero_facture}.pdf", 'application/pdf')
            return _fichier(f.justificatif_paiement, _nom_justificatif(f) if f.justificatif_paiement else '')

    return ReleveFichiersView


PrestaFichiersView = _vue_fichiers(_PrestataireBase)
PaiementFichiersView = _vue_fichiers(_ComptaBase)
