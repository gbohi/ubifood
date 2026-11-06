"""
Caisse et compte repas prépayé : routes de l'API.

Règles et calculs : comptes_repas.py (seule source de vérité). PDF : pdf_caisse.py.

Caisse (rôles caissier / comptabilite, administrateurs) :
  GET  /caisse/contexte/                     droits, modes de paiement, clôture en cours
  GET  /caisse/employes/?q=                  recherche d'un employé (champs minimaux)
  GET  /caisse/employes/<id>/                fiche : solde, repas des mois ouverts, reçus
  POST /caisse/recharger/                    recharge du compte (caissier)
  POST /caisse/rembourser/                   remboursement du solde (comptabilité)
  GET  /caisse/recus/  /caisse/recus/<id>/   reçus (caissier : les siens)
  GET  /caisse/recus/<id>/pdf/?papier=ticket|a5
  POST /caisse/recus/<id>/annuler/           annulation (comptabilité, motif)
  GET  /caisse/clotures/  POST /caisse/clotures/  GET /caisse/clotures/apercu/
  POST /caisse/clotures/<id>/valider/ | rejeter/   (comptabilité)
  GET  /caisse/journal/?date=&caissier=   (PDF : /caisse/journal/pdf/)
  GET  /caisse/comptes/                      soldes (comptabilité ; gestionnaire : ses agences)

Employé (ses données) :
  GET  /compte-repas/   /compte-repas/mouvements/   /compte-repas/recus/
  GET  /compte-repas/recus/<id>/pdf/
  GET  /compte-repas/paiement/?menu=ID | ?date=AAAA-MM-JJ   choix du mode à la commande

La « régularisation » (paiement à la caisse des repas non couverts) n'existe
plus : l'employé choisit compte repas ou retenue sur salaire en commandant.
Les anciens reçus de régularisation restent consultables (historique).
"""

from collections import OrderedDict
from datetime import date as date_type
from decimal import Decimal
from io import BytesIO

from django.db.models import Q, Sum
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import comptes_repas as cr
from . import facturation as fact
from .models import (
    ClotureCaisse, CompteRepas, MouvementCompte, ParametresSociete, Recu, User, UserAgence,
)
from .pagination import StandardPagination
from .permissions import (
    PRESTATAIRE_ROLES, IsAccesCaisse, IsAuthenticated, IsCaissier, IsComptabilite, agences_gerees,
    get_roles, is_admin, is_caissier, is_comptabilite, is_gestionnaire,
)
from .serializers import nom_complet

ZERO = Decimal('0')


def _f(m):
    return float(m) if m is not None else None


# ══════════════════════════════════════════════════════════════
# Représentations JSON
# ══════════════════════════════════════════════════════════════

def _agences_actuelles(user_ids):
    """Agence actuelle de chaque employé (ligne UserAgence en cours, sinon la plus récente)."""
    maintenant = timezone.now()
    par_user = {}
    for ua in UserAgence.objects.filter(user_id__in=set(user_ids)).select_related('agence'):
        par_user.setdefault(ua.user_id, []).append(ua)
    resultat = {}
    for uid, lignes in par_user.items():
        actives = [l for l in lignes if l.date_debut <= maintenant and (l.date_fin is None or l.date_fin >= maintenant)]
        resultat[uid] = max(actives or lignes, key=lambda l: l.date_debut).agence.nom_agence
    return resultat


def employe_json(user, agence=None, solde=None):
    """Champs minimaux d'un employé vus de la caisse."""
    return {'id': user.id, 'nom': user.nom, 'prenoms': user.prenom, 'nom_prenom': nom_complet(user),
            'matricule': user.username, 'agence': agence, 'actif': user.is_active,
            **({'solde': _f(solde)} if solde is not None else {})}


def recu_json(r, detail=False):
    d = {
        'id': r.id, 'numero': r.numero, 'type': r.type, 'type_libelle': r.get_type_display(),
        'statut': r.statut, 'statut_libelle': r.get_statut_display(),
        'date': timezone.localtime(r.created_at).isoformat(),
        'employe': employe_json(r.user),
        'caissier_id': r.caissier_id, 'caissier_nom': nom_complet(r.caissier),
        'mode': r.mode, 'mode_libelle': r.get_mode_display(), 'reference': r.reference,
        'montant': _f(r.montant), 'montant_repas': _f(r.montant_repas), 'montant_recu': _f(r.montant_recu),
        'monnaie': _f(r.monnaie), 'monnaie_creditee': r.monnaie_creditee,
        'encaissement': _f(r.encaissement), 'solde_avant': _f(r.solde_avant), 'solde_apres': _f(r.solde_apres),
        'motif': r.motif,
        'cloture_caisse_id': r.cloture_caisse_id,
        'verrouille': bool(r.cloture_caisse_id and r.cloture_caisse.statut in ('soumise', 'validee')),
        'annule_par_nom': nom_complet(r.annule_par) if r.annule_par_id else None,
        'annule_le': timezone.localtime(r.annule_le).isoformat() if r.annule_le else None,
        'motif_annulation': r.motif_annulation,
    }
    if detail:
        d['lignes'] = [{'commande_id': l.commande_id, 'date_menu': l.date_menu.isoformat(), 'plat': l.plat_nom,
                        'montant': _f(l.montant)} for l in r.lignes.all()]
    return d


def cloture_json(c, recus=False):
    d = {
        'id': c.id, 'caissier_id': c.caissier_id, 'caissier_nom': nom_complet(c.caissier),
        'jour': c.jour.isoformat(), 'debut': timezone.localtime(c.debut).isoformat() if c.debut else None,
        'soumise_le': timezone.localtime(c.soumise_le).isoformat(), 'nb_recus': c.nb_recus,
        'montant_theorique': _f(c.montant_theorique), 'montant_compte': _f(c.montant_compte),
        'ecart': _f(c.ecart), 'motif_ecart': c.motif_ecart,
        'statut': c.statut, 'statut_libelle': c.get_statut_display(),
        'traitee_par_nom': nom_complet(c.traitee_par) if c.traitee_par_id else None,
        'traitee_le': timezone.localtime(c.traitee_le).isoformat() if c.traitee_le else None,
        'commentaire': c.commentaire,
    }
    if recus:
        d['recus'] = [recu_json(r) for r in _recus_qs().filter(cloture_caisse=c).order_by('created_at', 'id')]
    return d


def mouvement_json(m):
    return {'id': m.id, 'type': m.type, 'type_libelle': m.get_type_display(), 'montant': _f(m.montant),
            'solde_apres': _f(m.solde_apres), 'libelle': m.libelle, 'commande_id': m.commande_id,
            'recu_id': m.recu_id, 'recu_numero': m.recu.numero if m.recu_id else None,
            'date': timezone.localtime(m.created_at).isoformat()}


def _recus_qs():
    return Recu.objects.select_related('user', 'caissier', 'annule_par', 'cloture_caisse')


def _entier(valeur, nom):
    if valeur in (None, ''):
        return None
    if isinstance(valeur, bool) or not str(valeur).isdigit():
        raise ValidationError({nom: f"Paramètre {nom} invalide."})
    return int(valeur)


def _date(valeur, defaut=None):
    if not valeur:
        return defaut
    try:
        return date_type.fromisoformat(valeur)
    except ValueError:
        raise ValidationError(f"Date invalide : {valeur} (format AAAA-MM-JJ)")


def _employes():
    """Employés de la caisse : comptes UbiPharm (les comptes prestataires n'ont pas de compte repas)."""
    return User.objects.exclude(groups__name__in=PRESTATAIRE_ROLES)


def _employe(pk, actifs=True):
    qs = _employes()
    if actifs:
        qs = qs.filter(is_active=True)
    return get_object_or_404(qs.distinct(), pk=pk)


def _pdf_recu(recu, request):
    from .pdf_caisse import generer_recu
    # (« format » est réservé par DRF à la négociation de contenu)
    format_papier = request.query_params.get('papier', 'ticket')
    if format_papier not in ('ticket', 'a5'):
        raise ValidationError({'papier': "Format du reçu : « ticket » (80 mm) ou « a5 »."})
    contenu = generer_recu(recu, ParametresSociete.charger(), format_papier)
    numero = recu.numero.replace('REÇ', 'recu').lower()
    return FileResponse(BytesIO(contenu), content_type='application/pdf', as_attachment=True,
                        filename=f"{numero}.pdf")


class _Ecriture:
    """Opérations de caisse : limitation de débit par utilisateur."""
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'caisse'


# ══════════════════════════════════════════════════════════════
# Caisse
# ══════════════════════════════════════════════════════════════

class ContexteCaisseView(APIView):
    """GET /caisse/contexte/ : ce que l'utilisateur peut faire à la caisse."""
    permission_classes = [IsAccesCaisse]

    def get(self, request):
        u = request.user
        en_attente = list(cr.recus_a_cloturer(u)) if is_caissier(u) else []
        return Response({
            'utilisateur': {'id': u.id, 'nom_prenom': nom_complet(u), 'roles': sorted(get_roles(u))},
            'peut_encaisser': is_caissier(u),
            'peut_controler': is_comptabilite(u),
            'modes_paiement': [{'code': c, 'libelle': l, 'actif': c == 'especes' or cr.mobile_money_actif()}
                               for c, l in cr.MODES_PAIEMENT.items()],
            'mobile_money_actif': cr.mobile_money_actif(),
            'aujourdhui': timezone.localdate().isoformat(),
            'caisse_en_cours': {'nb_recus': len(en_attente), 'montant_theorique': _f(cr.theorique(en_attente))},
            'statuts_repas': cr.STATUTS_REPAS,
        })


class RechercheEmployeView(APIView):
    """
    GET /caisse/employes/?q=texte[&inactifs=1]   nom, prénoms, matricule ou badge
    (au moins 2 caractères ; 20 résultats). Champs minimaux et solde.
    """
    permission_classes = [IsAccesCaisse]

    def get(self, request):
        q = (request.query_params.get('q') or '').strip()
        if len(q) < 2:
            raise ValidationError({'q': "Saisissez au moins 2 caractères (nom, prénoms ou matricule)."})
        qs = _employes()
        if request.query_params.get('inactifs') not in ('1', 'true'):
            qs = qs.filter(is_active=True)
        filtre = Q()
        for mot in q.split()[:4]:
            filtre &= Q(nom__icontains=mot) | Q(prenom__icontains=mot) | Q(username__icontains=mot)
        # Badge scanné : matricule exact en tête
        users = list(qs.filter(filtre | Q(username__iexact=q)).distinct().order_by('nom', 'prenom', 'username')[:50])
        users.sort(key=lambda u: (u.username.lower() != q.lower(), (u.nom or '').upper(), u.username))
        users = users[:20]
        agences = _agences_actuelles([u.id for u in users])
        soldes = dict(CompteRepas.objects.filter(user__in=users).values_list('user_id', 'solde'))
        return Response({'resultats': [employe_json(u, agences.get(u.id), soldes.get(u.id, ZERO)) for u in users]})


class FicheEmployeView(APIView):
    """
    GET /caisse/employes/<id>/   solde, repas des mois ouverts (statut de
    chaque repas, totaux, reste à payer prévu) et derniers reçus.
    """
    permission_classes = [IsAccesCaisse]

    def get(self, request, pk):
        employe = _employe(pk, actifs=False)
        aujourdhui = timezone.localdate()
        # Mois ouverts : du plus ancien mois non clôturé ayant des repas jusqu'au mois en cours
        debut_mois, fin_mois = fact.bornes_mois(aujourdhui.year, aujourdhui.month)
        clotures = set(fact.ClotureMensuelle.objects.values_list('annee', 'mois'))
        dates = (employe.commandes.filter(statut__in=fact.STATUTS_FACTURES, menu__date_menu__lt=debut_mois,
                                          reglement__isnull=True)
                 .values_list('menu__date_menu', flat=True))
        ouverts = [d for d in dates if (d.year, d.month) not in clotures]
        debut = min(ouverts + [debut_mois]).replace(day=1)
        s = cr.situation(employe, debut, fin_mois, seulement_ouverts=True)
        recus = _recus_qs().filter(user=employe)
        if not is_comptabilite(request.user):
            recus = recus.filter(caissier=request.user)
        return Response({
            'employe': employe_json(employe, _agences_actuelles([employe.id]).get(employe.id)),
            **s,
            'derniers_recus': [recu_json(r) for r in recus[:10]],
        })


def _lire_employe(request, actifs=True):
    uid = _entier(request.data.get('user_id'), 'user_id')
    if uid is None:
        raise ValidationError({'user_id': "Choisissez l'employé."})
    return _employe(uid, actifs=actifs)


class RechargerView(_Ecriture, APIView):
    """POST /caisse/recharger/ { user_id, montant, mode="especes", reference } → reçu."""
    permission_classes = [IsCaissier]

    def post(self, request):
        employe = _lire_employe(request)
        recu = cr.recharger(employe, request.data.get('montant'), request.user,
                            mode=request.data.get('mode'), reference=request.data.get('reference'))
        return Response(recu_json(_recus_qs().get(pk=recu.pk), detail=True), status=status.HTTP_201_CREATED)


class RembourserView(_Ecriture, APIView):
    """POST /caisse/rembourser/ { user_id, motif, mode } : solde rendu, compte à zéro (comptabilité)."""
    permission_classes = [IsComptabilite]

    def post(self, request):
        employe = _lire_employe(request, actifs=False)
        recu = cr.rembourser(employe, request.user, request.data.get('motif'),
                             mode=request.data.get('mode'), reference=request.data.get('reference'))
        return Response(recu_json(_recus_qs().get(pk=recu.pk), detail=True), status=status.HTTP_201_CREATED)


def _recus_visibles(user):
    qs = _recus_qs()
    return qs if is_comptabilite(user) else qs.filter(caissier=user)


class RecuListView(APIView):
    """
    GET /caisse/recus/?date=|date_debut=&date_fin=&type=&statut=&user=&caissier=&q=numero
    Caissier : les reçus qu'il a émis. Comptabilité / administrateurs : tous. Paginé.
    """
    permission_classes = [IsAccesCaisse]

    def get(self, request):
        qs = _recus_visibles(request.user)
        p = request.query_params
        jour = _date(p.get('date'))
        if jour:
            qs = qs.filter(created_at__date=jour)
        if p.get('date_debut'):
            qs = qs.filter(created_at__date__gte=_date(p['date_debut']))
        if p.get('date_fin'):
            qs = qs.filter(created_at__date__lte=_date(p['date_fin']))
        for champ in ('type', 'statut'):
            if p.get(champ):
                qs = qs.filter(**{champ: p[champ]})
        for champ in ('user', 'caissier'):
            v = _entier(p.get(champ), champ)
            if v is not None:
                qs = qs.filter(**{f'{champ}_id': v})
        if p.get('q'):
            qs = qs.filter(numero__icontains=p['q'].strip())
        pagination = StandardPagination()
        page = pagination.paginate_queryset(qs, request, view=self)
        return pagination.get_paginated_response([recu_json(r) for r in page])


class RecuDetailView(APIView):
    """GET /caisse/recus/<id>/   détail (repas régularisés, mouvements du compte)."""
    permission_classes = [IsAccesCaisse]

    def get(self, request, pk):
        recu = get_object_or_404(_recus_visibles(request.user), pk=pk)
        d = recu_json(recu, detail=True)
        d['mouvements'] = [mouvement_json(m) for m in recu.mouvements.select_related('recu').order_by('created_at', 'id')]
        return Response(d)


class RecuPdfView(APIView):
    """GET /caisse/recus/<id>/pdf/?papier=ticket|a5"""
    permission_classes = [IsAccesCaisse]

    def get(self, request, pk):
        return _pdf_recu(get_object_or_404(_recus_visibles(request.user), pk=pk), request)


class RecuAnnulerView(_Ecriture, APIView):
    """POST /caisse/recus/<id>/annuler/ { motif } (comptabilité ; jamais ses propres reçus)."""
    permission_classes = [IsComptabilite]

    def post(self, request, pk):
        recu = get_object_or_404(Recu, pk=pk)
        recu = cr.annuler_recu(recu, request.user, request.data.get('motif'))
        return Response(recu_json(_recus_qs().get(pk=recu.pk), detail=True))


class ClotureCaisseListView(_Ecriture, APIView):
    """
    GET  /caisse/clotures/?statut=&caissier=   caissier : les siennes ; comptabilité : toutes
    POST /caisse/clotures/ { montant_compte, motif_ecart }   soumission (caissier)
    """
    permission_classes = [IsAccesCaisse]

    def get_throttles(self):
        return super().get_throttles() if self.request.method == 'POST' else []

    def get(self, request):
        qs = ClotureCaisse.objects.select_related('caissier', 'traitee_par')
        if not is_comptabilite(request.user):
            qs = qs.filter(caissier=request.user)
        if request.query_params.get('statut'):
            qs = qs.filter(statut=request.query_params['statut'])
        v = _entier(request.query_params.get('caissier'), 'caissier')
        if v is not None:
            qs = qs.filter(caissier_id=v)
        pagination = StandardPagination()
        page = pagination.paginate_queryset(qs, request, view=self)
        return pagination.get_paginated_response([cloture_json(c) for c in page])

    def post(self, request):
        if not is_caissier(request.user):
            raise PermissionDenied("Action réservée aux caissiers.")
        cloture = cr.soumettre_cloture(request.user, request.data.get('montant_compte'),
                                       request.data.get('motif_ecart'))
        return Response(cloture_json(cloture, recus=True), status=status.HTTP_201_CREATED)


class ClotureCaisseApercuView(APIView):
    """GET /caisse/clotures/apercu/   reçus pas encore clôturés du caissier et théorique."""
    permission_classes = [IsCaissier]

    def get(self, request):
        recus = list(cr.recus_a_cloturer(request.user).select_related('caissier', 'annule_par', 'cloture_caisse'))
        return Response({
            'nb_recus': len(recus),
            'debut': timezone.localtime(recus[0].created_at).isoformat() if recus else None,
            'montant_theorique': _f(cr.theorique(recus)),
            'recus': [recu_json(r) for r in recus],
        })


class ClotureCaisseDetailView(APIView):
    """GET /caisse/clotures/<id>/"""
    permission_classes = [IsAccesCaisse]

    def get(self, request, pk):
        qs = ClotureCaisse.objects.select_related('caissier', 'traitee_par')
        if not is_comptabilite(request.user):
            qs = qs.filter(caissier=request.user)
        return Response(cloture_json(get_object_or_404(qs, pk=pk), recus=True))


class ClotureCaisseTraiterView(_Ecriture, APIView):
    """POST /caisse/clotures/<id>/valider/ { commentaire } | /rejeter/ { commentaire obligatoire }"""
    permission_classes = [IsComptabilite]
    valider = True

    def post(self, request, pk):
        cloture = get_object_or_404(ClotureCaisse, pk=pk)
        cloture = cr.traiter_cloture(cloture, request.user, self.valider, request.data.get('commentaire'))
        return Response(cloture_json(ClotureCaisse.objects.select_related('caissier', 'traitee_par')
                                     .get(pk=cloture.pk), recus=True))


def journal_caisse(jour, caissier=None):
    """Journal d'une journée : reçus, totaux par type et par caissier, clôtures."""
    recus = _recus_qs().filter(created_at__date=jour).order_by('created_at', 'id')
    clotures = ClotureCaisse.objects.filter(jour=jour).select_related('caissier', 'traitee_par')
    if caissier is not None:
        recus = recus.filter(caissier=caissier)
        clotures = clotures.filter(caissier=caissier)
    recus = list(recus)
    valides = [r for r in recus if r.statut == 'valide']
    par_type = OrderedDict((t, {'type': t, 'libelle': l, 'nb': 0, 'montant': ZERO, 'encaissement': ZERO})
                           for t, l in Recu.TYPE_CHOICES)
    # Régularisation : historique seulement (affichée si un ancien reçu est dans le journal)
    if not any(r.type == 'regularisation' for r in valides):
        par_type.pop('regularisation')
    par_caissier = OrderedDict()
    for r in valides:
        t = par_type[r.type]
        t['nb'] += 1
        t['montant'] += r.montant
        t['encaissement'] += r.encaissement
        c = par_caissier.setdefault(r.caissier_id, {'caissier_id': r.caissier_id, 'caissier_nom': nom_complet(r.caissier),
                                                    'nb': 0, 'encaissement': ZERO})
        c['nb'] += 1
        c['encaissement'] += r.encaissement
    annules = [r for r in recus if r.statut == 'annule']
    return {
        'date_objet': jour,
        'date': jour.isoformat(),
        'caissier_libelle': nom_complet(caissier) if caissier else 'tous',
        'nb_recus': len(recus),
        'nb_valides': len(valides),
        'nb_annules': len(annules),
        'montant_annules': sum((r.montant for r in annules), ZERO),
        'especes_net': sum((r.encaissement for r in valides if r.mode == 'especes'), ZERO),
        'par_type': list(par_type.values()),
        'par_caissier': list(par_caissier.values()),
        'recus': [{**recu_json(r), 'heure': f"{timezone.localtime(r.created_at):%H:%M}"} for r in recus],
        'clotures': [cloture_json(c) for c in clotures],
    }


def _journal_json(j):
    def conv(d):
        return {k: (_f(v) if isinstance(v, Decimal) else v) for k, v in d.items()}
    return {**{k: v for k, v in conv(j).items() if k != 'date_objet'},
            'par_type': [conv(t) for t in j['par_type']],
            'par_caissier': [conv(c) for c in j['par_caissier']]}


class JournalCaisseView(APIView):
    """
    GET /caisse/journal/?date=AAAA-MM-JJ[&caissier=ID]       JSON
    GET /caisse/journal/pdf/?date=AAAA-MM-JJ[&caissier=ID]   PDF (A4)
    Comptabilité : tous les caissiers. Caissier : son propre journal.
    """
    permission_classes = [IsAccesCaisse]
    pdf = False

    def get(self, request):
        jour = _date(request.query_params.get('date'), timezone.localdate())
        caissier = None
        cid = _entier(request.query_params.get('caissier'), 'caissier')
        if not is_comptabilite(request.user):
            if cid is not None and cid != request.user.id:
                raise PermissionDenied("Vous ne pouvez consulter que votre propre journal de caisse.")
            caissier = request.user
        elif cid is not None:
            caissier = get_object_or_404(User, pk=cid)
        j = journal_caisse(jour, caissier)
        if self.pdf:
            from .pdf_caisse import generer_journal
            contenu = generer_journal(j, ParametresSociete.charger())
            return FileResponse(BytesIO(contenu), content_type='application/pdf', as_attachment=True,
                                filename=f"journal-caisse-{jour:%Y-%m-%d}.pdf")
        return Response(_journal_json(j))


class ComptesRepasView(APIView):
    """
    GET /caisse/comptes/?q=&agence=&solde_min=   soldes des comptes repas (lecture seule).
    Comptabilité / administrateurs : tous ; gestionnaire : employés de ses agences.
    """

    def get_permissions(self):
        return [IsAuthenticated()]

    def get(self, request):
        u = request.user
        if not (is_comptabilite(u) or is_gestionnaire(u)):
            raise PermissionDenied("Accès réservé à la comptabilité et aux gestionnaires.")
        qs = CompteRepas.objects.select_related('user')
        maintenant = timezone.now()
        en_cours = UserAgence.objects.filter(date_debut__lte=maintenant).filter(
            Q(date_fin__isnull=True) | Q(date_fin__gte=maintenant))
        geres = None if is_comptabilite(u) or is_admin(u) else agences_gerees(u)
        if geres is not None:
            qs = qs.filter(user_id__in=en_cours.filter(agence_id__in=geres).values('user_id'))
        agence = _entier(request.query_params.get('agence'), 'agence')
        if agence is not None:
            qs = qs.filter(user_id__in=en_cours.filter(agence_id=agence).values('user_id'))
        q = (request.query_params.get('q') or '').strip()
        if q:
            qs = qs.filter(Q(user__nom__icontains=q) | Q(user__prenom__icontains=q) | Q(user__username__icontains=q))
        if request.query_params.get('solde_min'):
            qs = qs.filter(solde__gte=cr.lire_montant(request.query_params['solde_min'], 'solde_min', zero_permis=True))
        qs = qs.order_by('user__nom', 'user__prenom')
        total = qs.aggregate(t=Sum('solde'))['t'] or ZERO
        pagination = StandardPagination()
        page = pagination.paginate_queryset(qs, request, view=self)
        agences = _agences_actuelles([c.user_id for c in page])
        r = pagination.get_paginated_response([
            {**employe_json(c.user, agences.get(c.user_id), c.solde),
             'mis_a_jour': timezone.localtime(c.updated_at).isoformat()} for c in page])
        r.data['total_soldes'] = _f(total)
        return r


# ══════════════════════════════════════════════════════════════
# Employé : son compte repas
# ══════════════════════════════════════════════════════════════

class InfoPaiementView(APIView):
    """
    GET /compte-repas/paiement/?menu=ID  (ou ?date=AAAA-MM-JJ)
    Pour l'écran de commande : solde, prix du repas pour moi à cette date,
    compte repas possible (sinon pourquoi), préférence et mode par défaut.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import Menu
        menu_id = _entier(request.query_params.get('menu'), 'menu')
        if menu_id is not None:
            jour = get_object_or_404(Menu, pk=menu_id).date_menu
        else:
            jour = _date(request.query_params.get('date'), timezone.localdate())
        return Response({'date_menu': jour.isoformat(), **cr.info_paiement(request.user, jour)})


class MonCompteView(APIView):
    """
    GET /compte-repas/?annee=&mois=   solde, repas du mois (mode de paiement et
    statut : payé par le compte, retenue prévue à la clôture, retenu, payé à
    la caisse — historique), totaux, reste à payer prévu à la clôture (repas
    en retenue) et 10 derniers mouvements.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        aujourdhui = timezone.localdate()
        try:
            annee = int(request.query_params.get('annee') or aujourdhui.year)
            mois = int(request.query_params.get('mois') or aujourdhui.month)
            if not 1 <= mois <= 12 or not 2000 <= annee <= 2100:
                raise ValueError
        except ValueError:
            raise ValidationError("Paramètres annee et mois (1-12) invalides.")
        debut, fin = fact.bornes_mois(annee, mois)
        s = cr.situation(request.user, debut, fin)
        mouvements = MouvementCompte.objects.filter(compte__user=request.user).select_related('recu')[:10]
        return Response({
            'annee': annee, 'mois': mois,
            'mois_cloture': fact.mois_cloture(annee, mois),
            'mode_paiement_prefere': request.user.mode_paiement_prefere,
            **s,
            'derniers_mouvements': [mouvement_json(m) for m in mouvements],
        })


class MesMouvementsView(APIView):
    """GET /compte-repas/mouvements/   grand livre de mon compte (paginé, du plus récent)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = MouvementCompte.objects.filter(compte__user=request.user).select_related('recu')
        pagination = StandardPagination()
        page = pagination.paginate_queryset(qs, request, view=self)
        return pagination.get_paginated_response([mouvement_json(m) for m in page])


class MesRecusView(APIView):
    """GET /compte-repas/recus/   mes reçus de caisse (paginé)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = _recus_qs().filter(user=request.user)
        pagination = StandardPagination()
        page = pagination.paginate_queryset(qs, request, view=self)
        return pagination.get_paginated_response([recu_json(r) for r in page])


class MonRecuPdfView(APIView):
    """GET /compte-repas/recus/<id>/pdf/?papier=ticket|a5   (mes reçus seulement)"""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return _pdf_recu(get_object_or_404(_recus_qs().filter(user=request.user), pk=pk), request)
