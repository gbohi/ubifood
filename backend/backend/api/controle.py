"""
Contrôle des retraits (côté UbiPharm) et contestations des employés.

  - Employé : « Je n'ai pas retiré ce repas » sur un repas retiré à son nom
    (une fois par repas, jusqu'à la clôture du mois et au plus
    DELAI_CONTESTATION_JOURS jours après le repas) ;
  - Gestionnaire (ses agences) / administrateur : liste des contestations,
    accepter avec une cause (erreur_comptoir : retrait et commande annulés,
    repas facturé ni à l'employé ni au prestataire ; badge_tiers : repas
    servi à un tiers avec le badge de l'employé, facturé normalement) ou
    rejeter (commentaire obligatoire, envoyé à l'employé) ;
  - Contrôle du jour : retraits par agent validant, rythme par tranche de
    5 minutes, contestations et anomalies calculées à la volée.
"""

from collections import OrderedDict, defaultdict
from datetime import datetime, timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import (
    Agence, ClotureMensuelle, Commande, ContestationRetrait, Menu, ParametresSociete, Retrait, User,
)
from .permissions import IsAuthenticated, IsGestionnaireRole, agences_gerees, is_gestionnaire
from .prestataires import fenetre_retrait, horaires_retrait
from .serializers import nom_complet

DELAI_CONTESTATION_JOURS = 31
# Anomalies : plus de RAFALE_NB retraits en RAFALE_SECONDES par un même agent
RAFALE_NB = 5
RAFALE_SECONDES = 120
# Matricule saisi à la main plus de SAISIES_MAX fois dans le mois pour un même employé
SAISIES_MAX = 3
# Agent du prestataire ayant SEUIL_ERREURS_AGENT contestations ou plus acceptées
# pour erreur au comptoir dans le mois
SEUIL_ERREURS_AGENT = 3
CAUSES = dict(ContestationRetrait.CAUSE_CHOICES)
# Conséquence de chaque cause, telle qu'expliquée à l'employé
EXPLICATIONS_CAUSE = {
    'erreur_comptoir': ("Le retrait résultait d'une erreur au comptoir : le repas est annulé, "
                        "il ne vous sera pas facturé."),
    'badge_tiers': ("Votre badge a été utilisé par un tiers (prêté ou perdu) : le repas a bien été servi, "
                    "il reste dû et vous sera facturé."),
}


def explication_decision(c):
    """Texte expliquant la décision à l'employé (None si la contestation est ouverte)."""
    if c.statut == 'acceptee':
        return EXPLICATIONS_CAUSE.get(c.cause, "Le retrait a été annulé.")
    if c.statut == 'rejetee':
        return "Le repas reste retiré et facturé."
    return None


def filtre_erreurs_comptoir(prefixe=''):
    """Contestations acceptées dont le repas sort du relevé du prestataire (erreur au comptoir ;
    cause vide : décisions antérieures aux causes)."""
    return (Q(**{f'{prefixe}statut': 'acceptee'})
            & (Q(**{f'{prefixe}cause': 'erreur_comptoir'}) | Q(**{f'{prefixe}cause__isnull': True})))


def _heure(dt):
    return timezone.localtime(dt).strftime('%H:%M') if dt else None


def mois_cloture(d):
    return ClotureMensuelle.objects.filter(annee=d.year, mois=d.month).exists()


def limite_contestation(date_menu):
    return date_menu + timedelta(days=DELAI_CONTESTATION_JOURS)


def contestable(commande, retrait=None):
    """(bool, raison si non) : l'employé peut-il contester le retrait de cette commande ?"""
    if commande.statut != 'retiree':
        return False, "Seul un repas retiré peut être contesté."
    if ContestationRetrait.objects.filter(commande=commande).exists():
        return False, "Vous avez déjà contesté ce retrait."
    d = commande.menu.date_menu
    if mois_cloture(d):
        return False, f"Le mois {d.month:02d}/{d.year} est clôturé : le retrait ne peut plus être contesté."
    if timezone.localdate() > limite_contestation(d):
        return False, (f"Le délai de contestation ({DELAI_CONTESTATION_JOURS} jours après le repas) "
                       "est dépassé.")
    return True, None


# ══════════════════════════════════════════════════════════════
# CONTESTATIONS
# ══════════════════════════════════════════════════════════════

class ContestationRetraitSerializer(serializers.ModelSerializer):
    commande_id = serializers.PrimaryKeyRelatedField(source='commande', queryset=Commande.objects.all(),
                                                     write_only=True)
    commande = serializers.IntegerField(source='commande_id', read_only=True)
    user_nom = serializers.SerializerMethodField()
    matricule = serializers.ReadOnlyField(source='user.username')
    date_menu = serializers.ReadOnlyField(source='menu.date_menu')
    agence_id = serializers.ReadOnlyField(source='menu.agence_id')
    agence_nom = serializers.ReadOnlyField(source='menu.agence.nom_agence')
    plat = serializers.ReadOnlyField(source='commande.plat.nom')
    motif_libelle = serializers.CharField(source='get_motif_display', read_only=True)
    statut_libelle = serializers.CharField(source='get_statut_display', read_only=True)
    cause_libelle = serializers.SerializerMethodField()
    explication = serializers.SerializerMethodField()
    retrait_valide_par_nom = serializers.SerializerMethodField()
    retrait_valide_par_prestataire = serializers.SerializerMethodField()
    traite_par_nom = serializers.SerializerMethodField()

    class Meta:
        model = ContestationRetrait
        fields = ['id', 'commande_id', 'commande', 'retrait', 'user', 'user_nom', 'matricule', 'menu',
                  'date_menu', 'agence_id', 'agence_nom', 'plat', 'motif', 'motif_libelle', 'commentaire',
                  'statut', 'statut_libelle', 'cause', 'cause_libelle', 'explication', 'date_retrait', 'retrait_valide_par',
                  'retrait_valide_par_nom', 'retrait_valide_par_prestataire', 'retrait_mode',
                  'traite_par', 'traite_par_nom', 'commentaire_traitement', 'date_traitement',
                  'created_at']
        read_only_fields = ['retrait', 'user', 'menu', 'statut', 'cause', 'date_retrait', 'retrait_valide_par',
                            'retrait_mode', 'traite_par', 'commentaire_traitement', 'date_traitement',
                            'created_at']

    def get_user_nom(self, obj):
        return nom_complet(obj.user)

    def get_cause_libelle(self, obj):
        return obj.get_cause_display() if obj.cause else None

    def get_explication(self, obj):
        return explication_decision(obj)

    def get_retrait_valide_par_nom(self, obj):
        return nom_complet(obj.retrait_valide_par) if obj.retrait_valide_par_id else None

    def get_retrait_valide_par_prestataire(self, obj):
        u = obj.retrait_valide_par
        return u.prestataire.libelle if u is not None and u.prestataire_id else None

    def get_traite_par_nom(self, obj):
        return nom_complet(obj.traite_par) if obj.traite_par_id else None

    def validate(self, attrs):
        request = self.context['request']
        commande = attrs['commande']
        if commande.user_id != request.user.id:
            raise PermissionDenied("Vous ne pouvez contester que vos propres repas.")
        ok, raison = contestable(commande)
        if not ok:
            raise serializers.ValidationError(raison)
        if attrs.get('motif') == 'autre' and not (attrs.get('commentaire') or '').strip():
            raise serializers.ValidationError({'commentaire': "Précisez la raison de votre contestation."})
        return attrs


class ContestationRetraitViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                                 mixins.CreateModelMixin, viewsets.GenericViewSet):
    """
    /contestations-retrait/
      GET            employé : ses contestations ; gestionnaire : celles de ses agences
                     (?statut=ouverte|acceptee|rejetee &date_debut= &date_fin= &agence= &mes=1)
      POST           employé : { commande_id, motif, commentaire }
      POST {id}/accepter/  { cause: erreur_comptoir|badge_tiers, commentaire? }   gestionnaire
      POST {id}/rejeter/   { commentaire }    gestionnaire (commentaire obligatoire)
    """
    serializer_class = ContestationRetraitSerializer
    permission_classes = [IsAuthenticated]
    throttle_scope = 'contestation'

    def get_throttles(self):
        # Limitation de débit sur la création seulement
        return [ScopedRateThrottle()] if self.action == 'create' else []

    def get_queryset(self):
        user = self.request.user
        qs = ContestationRetrait.objects.select_related(
            'user', 'menu__agence', 'commande__plat', 'retrait_valide_par__prestataire', 'traite_par')
        p = self.request.query_params
        if is_gestionnaire(user) and p.get('mes') not in ('1', 'true'):
            geres = agences_gerees(user)
            if geres is not None:
                qs = qs.filter(Q(menu__agence_id__in=geres) | Q(user=user))
        else:
            qs = qs.filter(user=user)
        if self.action == 'list':
            from .espace_prestataire import _date, _entier
            if p.get('statut'):
                qs = qs.filter(statut=p['statut'])
            if p.get('agence'):
                qs = qs.filter(menu__agence_id=_entier(p['agence'], 'agence'))
            if p.get('date_debut'):
                qs = qs.filter(menu__date_menu__gte=_date(p['date_debut'], None))
            if p.get('date_fin'):
                qs = qs.filter(menu__date_menu__lte=_date(p['date_fin'], None))
        return qs.order_by('-created_at')

    def list(self, request, *args, **kwargs):
        # 300 dernières, sans pagination
        return Response(self.get_serializer(list(self.get_queryset()[:300]), many=True).data)

    def perform_create(self, serializer):
        from .signals import notifier_contestation_nouvelle
        commande = serializer.validated_data['commande']
        retrait = (Retrait.objects.filter(user=commande.user, menu=commande.menu)
                   .select_related('valide_par').first())
        with transaction.atomic():
            c = serializer.save(
                user=self.request.user, menu=commande.menu, retrait=retrait,
                date_retrait=retrait.date_retrait if retrait else None,
                retrait_valide_par=retrait.valide_par if retrait else None,
                retrait_mode=retrait.mode if retrait else '',
            )
        notifier_contestation_nouvelle(c.id)

    def _a_traiter(self, request):
        if not is_gestionnaire(request.user):
            raise PermissionDenied("Action réservée aux gestionnaires.")
        c = self.get_object()
        geres = agences_gerees(request.user)
        if geres is not None and c.menu.agence_id not in geres:
            raise PermissionDenied("Cette contestation ne concerne pas l'une de vos agences.")
        if c.statut != 'ouverte':
            raise ValidationError("Cette contestation a déjà été traitée.")
        return c

    @action(detail=True, methods=['post'])
    def accepter(self, request, pk=None):
        """
        Accepte, avec la cause retenue (obligatoire) :
          - erreur_comptoir : retrait annulé et commande annulée (motif
            « contestation ») : repas facturé ni à l'employé, ni au prestataire ;
          - badge_tiers : repas réellement servi (badge prêté / perdu) : le
            retrait est conservé, l'employé paie et le prestataire est payé.
        """
        from .serializers import verifier_mois_ouvert
        from .signals import notifier_contestation_decidee
        from .views import annuler_retrait
        c = self._a_traiter(request)
        cause = str(request.data.get('cause') or '').strip()
        if cause not in CAUSES:
            raise ValidationError({'cause': "Choisissez la cause : « erreur_comptoir » (erreur ou fraude au "
                                            "comptoir) ou « badge_tiers » (badge utilisé par un tiers)."})
        verifier_mois_ouvert(c.menu.date_menu)
        with transaction.atomic():
            commande = Commande.objects.select_for_update().get(pk=c.commande_id)
            if cause == 'erreur_comptoir':
                if commande.statut == 'retiree':
                    retrait = Retrait.objects.filter(user=commande.user, menu=commande.menu).first()
                    annuler_retrait(retrait, request.user, commande=commande, notifier=False)
                    c.retrait = None      # supprimé par l'annulation (informations recopiées)
                # update() : pas de notification « Commande annulée » (l'employé reçoit la décision)
                maintenant = timezone.now()
                Commande.objects.filter(pk=commande.pk, statut__in=('en_attente', 'retiree')).update(
                    statut='annulee', annulee_par=request.user, date_annulation=maintenant,
                    motif_annulation='contestation', updated_at=maintenant, user_updated=request.user)
                # Repas jamais facturé : s'il avait été payé (compte repas à la commande,
                # ou caisse — historique), le montant est recrédité sur le compte repas
                from .comptes_repas import liberer_reglement
                liberer_reglement(commande, request.user, raison='Contestation acceptée (erreur au comptoir)')
            c.statut = 'acceptee'
            c.cause = cause
            c.traite_par = request.user
            c.commentaire_traitement = str(request.data.get('commentaire') or '').strip()[:1000]
            c.date_traitement = timezone.now()
            c.save()
        notifier_contestation_decidee(c.id)
        return Response(self.get_serializer(self.get_queryset().get(pk=c.pk)).data)

    @action(detail=True, methods=['post'])
    def rejeter(self, request, pk=None):
        """Rejette (commentaire obligatoire, envoyé à l'employé) : le repas reste retiré et facturé."""
        from .signals import notifier_contestation_decidee
        c = self._a_traiter(request)
        commentaire = str(request.data.get('commentaire') or '').strip()
        if not commentaire:
            raise ValidationError({'commentaire': "Le commentaire est obligatoire pour rejeter une contestation."})
        c.statut = 'rejetee'
        c.traite_par = request.user
        c.commentaire_traitement = commentaire[:1000]
        c.date_traitement = timezone.now()
        c.save()
        notifier_contestation_decidee(c.id)
        return Response(self.get_serializer(self.get_queryset().get(pk=c.pk)).data)


def detail_retrait(commande, request=None):
    """Détail du retrait d'une commande (écran employé « Retrait du 17/11 »)."""
    from .espace_prestataire import _images
    image = _images({commande.plat_id}).get(commande.plat_id)
    if image and request is not None:
        image = request.build_absolute_uri(image)
    retrait = (Retrait.objects.filter(user=commande.user, menu=commande.menu)
               .select_related('valide_par__prestataire', 'menu__agence').first())
    contestation = ContestationRetrait.objects.filter(commande=commande).first()
    ok, raison = contestable(commande)
    return {
        'commande_id': commande.id,
        'statut': commande.statut,
        'date_menu': commande.menu.date_menu.isoformat(),
        'plat': commande.plat.nom,
        'plat_image_url': image,
        'agence': commande.menu.agence.nom_agence,
        'annulee_par_contestation': commande.motif_annulation == 'contestation',
        'retrait': retrait and {
            'id': retrait.id,
            'date_retrait': retrait.date_retrait.isoformat(),
            'heure': _heure(retrait.date_retrait),
            'comptoir': retrait.menu.agence.nom_agence,
            'valide_par_nom': nom_complet(retrait.valide_par) if retrait.valide_par_id else None,
            'valide_par_prestataire': (retrait.valide_par.prestataire.libelle
                                       if retrait.valide_par_id and retrait.valide_par.prestataire_id else None),
            'mode': retrait.mode,
            'mode_libelle': retrait.get_mode_display() if retrait.mode else None,
        },
        'contestation': contestation and {
            'id': contestation.id, 'statut': contestation.statut,
            'statut_libelle': contestation.get_statut_display(),
            'cause': contestation.cause,
            'cause_libelle': contestation.get_cause_display() if contestation.cause else None,
            'explication': explication_decision(contestation),
            'motif': contestation.motif,
            'motif_libelle': contestation.get_motif_display(),
            'commentaire': contestation.commentaire,
            'commentaire_traitement': contestation.commentaire_traitement,
            'created_at': contestation.created_at.isoformat(),
            'date_traitement': contestation.date_traitement.isoformat() if contestation.date_traitement else None,
        },
        'contestable': ok,
        'raison_non_contestable': raison,
        'contestable_jusqu_au': limite_contestation(commande.menu.date_menu).isoformat(),
        'motifs': [{'valeur': v, 'libelle': l} for v, l in ContestationRetrait.MOTIF_CHOICES],
    }


# ══════════════════════════════════════════════════════════════
# CONTRÔLE DES RETRAITS DU JOUR
# ══════════════════════════════════════════════════════════════

def _rafales(retraits):
    """
    Fenêtres où un agent a validé plus de RAFALE_NB retraits en RAFALE_SECONDES
    (retraits triés par date). Fenêtres disjointes, la plus longue à chaque fois.
    """
    resultat, i, n = [], 0, len(retraits)
    while i < n:
        j = i
        while j < n and (retraits[j].date_retrait - retraits[i].date_retrait).total_seconds() <= RAFALE_SECONDES:
            j += 1
        if j - i > RAFALE_NB:
            resultat.append(retraits[i:j])
            i = j
        else:
            i += 1
    return resultat


def _rythme(retraits):
    """Retraits par tranche de 5 minutes, du premier au dernier (tranches vides comprises)."""
    if not retraits:
        return []
    def tranche(dt):
        t = timezone.localtime(dt)
        return t.replace(minute=t.minute - t.minute % 5, second=0, microsecond=0)
    compte = defaultdict(int)
    for r in retraits:
        compte[tranche(r.date_retrait)] += 1
    t, fin, res = tranche(retraits[0].date_retrait), tranche(retraits[-1].date_retrait), []
    while t <= fin:
        res.append({'debut': t.strftime('%H:%M'), 'nb': compte.get(t, 0)})
        t += timedelta(minutes=5)
    return res


def _retrait_ligne(r, plats, origines=None):
    from .parcours_commande import origine_json
    return {**origine_json((origines or {}).get(r.user_id), r.menu.agence_id),
            'id': r.id, 'heure': _heure(r.date_retrait), 'date_retrait': r.date_retrait.isoformat(),
            'user_id': r.user_id, 'user_nom': nom_complet(r.user), 'matricule': r.user.username,
            'agence_id': r.menu.agence_id, 'agence_nom': r.menu.agence.nom_agence,
            'plats': plats.get((r.menu_id, r.user_id), []), 'mode': r.mode,
            'valide_par_id': r.valide_par_id,
            'valide_par_nom': nom_complet(r.valide_par) if r.valide_par_id else None}


class ControleRetraitsView(APIView):
    """
    GET /controle-retraits/?date=AAAA-MM-JJ&agence=ID   (gestionnaires : leurs agences)
    Retraits du jour par agent validant, contestations, anomalies.
    """
    permission_classes = [IsGestionnaireRole]

    def get(self, request):
        from .espace_prestataire import _date, _entier
        aujourdhui = timezone.localdate()
        d = _date(request.query_params.get('date'), aujourdhui)
        geres = agences_gerees(request.user)
        agence = _entier(request.query_params.get('agence'), 'agence')
        if agence is not None and geres is not None and agence not in geres:
            raise PermissionDenied("Cette agence n'est pas l'une des vôtres.")
        menus = Menu.objects.filter(date_menu=d)
        if agence is not None:
            menus = menus.filter(agence_id=agence)
        elif geres is not None:
            menus = menus.filter(agence_id__in=geres)
        parametres = ParametresSociete.charger()

        retraits = list(Retrait.objects.filter(menu__in=menus)
                        .select_related('user', 'menu__agence', 'menu__typeequipe', 'valide_par__prestataire')
                        .order_by('date_retrait'))
        plats = defaultdict(list)
        for c in (Commande.objects.filter(menu__in=menus, statut='retiree').select_related('plat')):
            plats[(c.menu_id, c.user_id)].append(c.plat.nom)
        commandes = Commande.objects.filter(menu__in=menus, statut__in=('en_attente', 'retiree')).count()
        # Employés d'une autre agence que celle du menu (commandes « externes »)
        from .parcours_commande import agences_origine, est_externe
        origines = agences_origine({r.user_id for r in retraits})
        nb_externes = sum(est_externe(origines.get(r.user_id), r.menu.agence_id) for r in retraits)

        # ── Anomalies ──────────────────────────────────────────────
        anomalies = []
        par_agent = OrderedDict()
        for r in retraits:
            par_agent.setdefault(r.valide_par_id, []).append(r)
        anomalies_agent = defaultdict(list)
        for agent_id, rs in par_agent.items():
            if agent_id is None:
                continue
            for rafale in _rafales(rs):
                a = {'type': 'rafale', 'libelle': 'Rythme anormal',
                     'agent_id': agent_id, 'agent_nom': nom_complet(rs[0].valide_par),
                     'agence_nom': rafale[0].menu.agence.nom_agence, 'nb': len(rafale),
                     'debut': _heure(rafale[0].date_retrait), 'fin': _heure(rafale[-1].date_retrait),
                     'description': (f"{len(rafale)} retraits entre {_heure(rafale[0].date_retrait)} et "
                                     f"{_heure(rafale[-1].date_retrait)} (seuil : {RAFALE_NB} en "
                                     f"{RAFALE_SECONDES // 60} min)"),
                     'retrait_ids': [x.id for x in rafale]}
                anomalies.append(a)
                anomalies_agent[agent_id].append(a)
        # Horaires de retrait de l'équipe du menu, sinon de l'agence, sinon par défaut ;
        # retrait passant minuit (équipe de nuit) : jusqu'à l'heure de fin le lendemain
        horaires = {}
        for r in retraits:
            ag = r.menu.agence
            cle_h = (ag.id, r.menu.typeequipe_id)
            if cle_h not in horaires:
                horaires[cle_h] = horaires_retrait(ag, r.menu.typeequipe, parametres)
            debut, fin = horaires[cle_h]
            ouverture, fermeture = fenetre_retrait(r.menu.date_menu, ag, r.menu.typeequipe, parametres)
            if not (ouverture <= r.date_retrait <= fermeture):
                a = {'type': 'hors_horaires', 'libelle': 'Retrait hors horaires de service',
                     'agent_id': r.valide_par_id,
                     'agent_nom': nom_complet(r.valide_par) if r.valide_par_id else None,
                     'agence_nom': ag.nom_agence, 'retrait_id': r.id, 'heure': _heure(r.date_retrait),
                     'user_nom': nom_complet(r.user), 'matricule': r.user.username,
                     'equipe': r.menu.typeequipe.libelle if r.menu.typeequipe_id else None,
                     'heure_debut': debut.strftime('%H:%M'), 'heure_fin': fin.strftime('%H:%M'),
                     'description': (f"{_heure(r.date_retrait)} — {nom_complet(r.user)} "
                                     + (f"(retrait équipe {r.menu.typeequipe.libelle} : "
                                        if r.menu.typeequipe_id else "(service ")
                                     + f"{debut:%H:%M} – {fin:%H:%M})")}
                anomalies.append(a)
                anomalies_agent[r.valide_par_id].append(a)
        saisis = [r for r in retraits if r.mode == 'saisie']
        if saisis:
            debut_mois = d.replace(day=1)
            nb = dict(Retrait.objects.filter(user_id__in={r.user_id for r in saisis}, mode='saisie',
                                             menu__date_menu__gte=debut_mois, menu__date_menu__lte=d)
                      .values('user_id').annotate(n=Count('id')).values_list('user_id', 'n'))
            vus = set()
            for r in saisis:
                if nb.get(r.user_id, 0) > SAISIES_MAX and r.user_id not in vus:
                    vus.add(r.user_id)
                    a = {'type': 'saisie_manuelle', 'libelle': 'Matricule saisi à la main trop souvent',
                         'agent_id': r.valide_par_id,
                         'agent_nom': nom_complet(r.valide_par) if r.valide_par_id else None,
                         'agence_nom': r.menu.agence.nom_agence, 'user_id': r.user_id,
                         'user_nom': nom_complet(r.user), 'matricule': r.user.username, 'nb': nb[r.user_id],
                         'description': (f"Matricule de {nom_complet(r.user)} saisi {nb[r.user_id]} fois "
                                         f"ce mois-ci (seuil : {SAISIES_MAX})")}
                    anomalies.append(a)
                    anomalies_agent[r.valide_par_id].append(a)

        # ── Contestations ──────────────────────────────────────────
        cont = ContestationRetrait.objects.select_related(
            'user', 'menu__agence', 'commande__plat', 'retrait_valide_par__prestataire', 'traite_par')
        if agence is not None:
            cont = cont.filter(menu__agence_id=agence)
        elif geres is not None:
            cont = cont.filter(menu__agence_id__in=geres)
        contest_agent = defaultdict(int)
        for c in cont.filter(menu__date_menu=d):
            contest_agent[c.retrait_valide_par_id] += 1
        # Contestations acceptées pour erreur au comptoir, par agent, dans le mois
        erreurs_agent = {
            row['retrait_valide_par']: row['n'] for row in
            cont.filter(statut='acceptee', cause='erreur_comptoir', retrait_valide_par__isnull=False,
                        menu__date_menu__year=d.year, menu__date_menu__month=d.month)
            .values('retrait_valide_par').annotate(n=Count('id'))
        }
        agents_erreurs = {u.id: u for u in User.objects.filter(id__in=[
            a for a, n in erreurs_agent.items() if n >= SEUIL_ERREURS_AGENT]).select_related('prestataire')}
        for agent_id, u in sorted(agents_erreurs.items(), key=lambda x: -erreurs_agent[x[0]]):
            n = erreurs_agent[agent_id]
            a = {'type': 'erreurs_comptoir', 'libelle': 'Contestations acceptées pour erreur au comptoir',
                 'agent_id': agent_id, 'agent_nom': nom_complet(u),
                 'prestataire': u.prestataire.libelle if u.prestataire_id else None, 'nb': n,
                 'description': (f"{nom_complet(u)} : {n} contestations acceptées pour erreur au comptoir "
                                 f"en {d.month:02d}/{d.year} (seuil : {SEUIL_ERREURS_AGENT})")}
            anomalies.append(a)
            anomalies_agent[agent_id].append(a)
        ouvertes = list(cont.filter(statut='ouverte').order_by('created_at'))
        debut_mois = d.replace(day=1)
        decisions = list(cont.exclude(statut='ouverte').filter(date_traitement__date__gte=debut_mois)
                         .order_by('-date_traitement')[:20])
        serial = ContestationRetraitSerializer

        def _contestation(c):
            data = serial(c).data
            # Contexte : rafale de l'agent autour du retrait contesté
            data['rafale'] = None
            for a in anomalies_agent.get(c.retrait_valide_par_id, []):
                if a['type'] == 'rafale' and c.retrait_id in a['retrait_ids']:
                    data['rafale'] = {'nb': a['nb'], 'debut': a['debut'], 'fin': a['fin']}
            data['anciennete_jours'] = (timezone.now() - c.created_at).days
            return data

        # ── Par agent ──────────────────────────────────────────────
        agents = []
        for agent_id, rs in par_agent.items():
            u = rs[0].valide_par
            secours = u is not None and not u.prestataire_id
            agents.append({
                'agent_id': agent_id,
                'agent_nom': nom_complet(u) if u else 'Non renseigné',
                'prestataire': (u.prestataire.libelle if u and u.prestataire_id
                                else ('UbiPharm (secours)' if u else None)),
                'secours': secours,
                'agences': sorted({r.menu.agence.nom_agence for r in rs}),
                'nb_retraits': len(rs),
                'premier': _heure(rs[0].date_retrait), 'dernier': _heure(rs[-1].date_retrait),
                'rythme': _rythme(rs),
                'nb_contestations': contest_agent.get(agent_id, 0),
                'erreurs_comptoir_mois': erreurs_agent.get(agent_id, 0),
                'anomalies': [{'type': a['type'], 'description': a['description']}
                              for a in anomalies_agent.get(agent_id, [])],
                'retraits': [_retrait_ligne(r, plats, origines) for r in rs],
            })
        agents.sort(key=lambda a: (a['secours'], a['agent_id'] is None, -a['nb_retraits']))
        en_secours = sum(a['nb_retraits'] for a in agents if a['secours'])
        nb = len(retraits)
        # Repas sortis du relevé du prestataire (erreur au comptoir) dans le mois
        mois_d = cont.filter(filtre_erreurs_comptoir(), menu__date_menu__year=d.year,
                             menu__date_menu__month=d.month).count()
        return Response({
            'date': d.isoformat(),
            'agence': agence,
            'chiffres': {
                'retraits': nb,
                'retraits_externes': nb_externes,
                'par_prestataire': nb - en_secours - sum(a['nb_retraits'] for a in agents if a['agent_id'] is None),
                'en_secours': en_secours,
                'commandes': commandes,
                'a_servir': commandes - nb if d >= aujourdhui else 0,
                'contestations_a_traiter': len(ouvertes),
                'contestations_du_jour': sum(1 for c in ouvertes if timezone.localtime(c.created_at).date() == aujourdhui),
                'anomalies': len(anomalies),
                'retraits_annules_mois': mois_d,
                'annulable_jusqu_a_cloture': not mois_cloture(d),
            },
            'agents': agents,
            'contestations': [_contestation(c) for c in ouvertes],
            'decisions_mois': [serial(c).data for c in decisions],
            'anomalies': anomalies,
            'regles': {'rafale_nb': RAFALE_NB, 'rafale_secondes': RAFALE_SECONDES,
                       'saisies_max_mois': SAISIES_MAX,
                       'erreurs_comptoir_max_mois': SEUIL_ERREURS_AGENT,
                       'horaires_defaut': {'debut': parametres.heure_debut_service.strftime('%H:%M'),
                                           'fin': parametres.heure_fin_service.strftime('%H:%M')}},
        })
