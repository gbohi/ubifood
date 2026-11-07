"""
Espace prestataire : vues des comptes « prestataire » (responsable) et
« agent_comptoir » (comptoir et liste du jour seulement).

Toutes les routes sont sous /api/api/prestataire/… (référence complète pour
le web et le mobile : API.md de l'espace prestataire).

Périmètre (jamais au-delà) :
  - agences : celles où le prestataire est rattaché (AgencePrestataire) —
    aujourd'hui pour composer, à la date du menu pour consulter ;
  - plats   : les siens (Plat.prestataire) ;
  - menus, commandes, retraits : ceux des menus qu'il sert (Menu.prestataire ;
    menus historiques sans prestataire : agence rattachée à la date du menu,
    même règle que la facturation). Plusieurs prestataires peuvent desservir
    la même agence ;
  - profil public (logo, couverture, nom affiché…) : /prestataire/profil/ ;
  - employés : nom, prénoms, matricule et agence seulement (jamais la
    catégorie, le poste, le salaire, le contact).
"""

from collections import OrderedDict, defaultdict
from datetime import date, timedelta

from django.db import transaction
from django.db.models import Avg, Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from . import facturation as fact
from . import releves as rel
from . import statistiques as stats
from . import suivi_factures as suivi
from .models import (
    Agence, AgencePrestataire, AvisPlat, Commande, ContestationRetrait, FacturePrestataire, Menu,
    MenuHistorique, MenuPlat, ParametresSociete, Plat, PlatImage, Retrait, TypePlat, User,
    UserAgence,
)
from .permissions import (
    LIBELLES_ROLES, ROLE_AGENT_COMPTOIR, ROLE_PRESTATAIRE, IsAgentComptoir, IsPrestataireResponsable,
    agences_prestataire, get_roles, is_prestataire_responsable,
)
from .prestataires import (
    equipes_horaires_json, filtre_menus_prestataire, historique_json, horaires_menus, horaires_service,
    menus_du_prestataire, tracer_menu,
)
from .serializers import (
    MenuSerializer, PlatImageSerializer, PlatImageUploadSerializer, commandes_actives,
    date_limite_commande, libelle_date_limite, nom_complet, verifier_mois_ouvert,
)

ACTIVES = ('en_attente', 'retiree')
JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
MOIS = rel.MOIS
PHOTOS_MAX = 3
# Un agent de comptoir peut annuler son propre retrait pendant ce délai
DELAI_ANNULATION_AGENT = timedelta(minutes=2)


# ══════════════════════════════════════════════════════════════
# OUTILS
# ══════════════════════════════════════════════════════════════

def _date(valeur, defaut):
    if not valeur:
        return defaut
    try:
        return date.fromisoformat(str(valeur))
    except ValueError:
        raise ValidationError(f"Date invalide : {valeur} (format AAAA-MM-JJ)")


def _entier(valeur, nom):
    if valeur in (None, ''):
        return None
    if not str(valeur).isdigit():
        raise ValidationError(f"Paramètre {nom} invalide.")
    return int(valeur)


def _jour_libelle(d):
    return f"{JOURS[d.weekday()]} {d:%d/%m}"


def _heure(dt):
    return timezone.localtime(dt).strftime('%H:%M') if dt else None


def _images(plat_ids):
    """URL de l'image principale (sinon la première) de chaque plat."""
    images = {}
    for img in PlatImage.objects.filter(plat_id__in=plat_ids).order_by('-is_principale', 'id'):
        images.setdefault(img.plat_id, img.image.url if img.image else None)
    return images


def agences_rattachees(prestataire_id):
    """Toutes les agences auxquelles le prestataire a été rattaché (toutes périodes)."""
    return set(AgencePrestataire.objects.filter(prestataire_id=prestataire_id)
               .values_list('agence_id', flat=True))


def commandes_du_prestataire(prestataire_id):
    """Commandes des menus servis par le prestataire."""
    return Commande.objects.filter(filtre_menus_prestataire(prestataire_id, 'menu__'))


def _agence_demandee(request, valeur=None):
    """
    Agence passée en paramètre (?agence=ID), vérifiée : une agence à laquelle
    le prestataire est (ou a été) rattaché. None si absente.
    """
    agence = _entier(valeur if valeur is not None else request.query_params.get('agence'), 'agence')
    if agence is not None and agence not in agences_rattachees(request.user.prestataire_id):
        raise PermissionDenied("Votre prestataire ne dessert pas cette agence.")
    return agence


def _nb_employes(agence_ids):
    """Employés actifs rattachés aujourd'hui à chaque agence."""
    maintenant = timezone.now()
    lignes = (UserAgence.objects.filter(agence_id__in=agence_ids, date_debut__lte=maintenant,
                                        user__is_active=True)
              .filter(Q(date_fin__isnull=True) | Q(date_fin__gte=maintenant))
              .values('agence_id').annotate(n=Count('user_id', distinct=True)))
    return {l['agence_id']: l['n'] for l in lignes}


def _agences_json(agence_ids, parametres=None):
    parametres = parametres or ParametresSociete.charger()
    nb = _nb_employes(agence_ids)
    resultat = []
    for a in Agence.objects.filter(id__in=agence_ids).order_by('nom_agence'):
        debut, fin = horaires_service(a, parametres)
        resultat.append({'id': a.id, 'nom': a.nom_agence, 'nb_employes': nb.get(a.id, 0),
                         'heure_debut_service': debut.strftime('%H:%M'),
                         'heure_fin_service': fin.strftime('%H:%M')})
    return resultat


def _employe_json(user, agence_nom=None):
    """Données d'un employé visibles du prestataire : nom, prénoms, matricule, agence."""
    return {'id': user.id, 'nom': user.nom, 'prenoms': user.prenom, 'nom_complet': nom_complet(user),
            'matricule': user.username, 'agence': agence_nom}


def _retrait_json(r, user=None, plats=None):
    """Retrait tel que vu au comptoir (agent qui l'a validé, annulable par lui ?)."""
    maintenant = timezone.now()
    limite = r.date_retrait + DELAI_ANNULATION_AGENT
    a_moi = user is not None and r.valide_par_id == user.id
    return {
        'id': r.id,
        'user_id': r.user_id,
        'user_nom': nom_complet(r.user),
        'matricule': r.user.username,
        'menu_id': r.menu_id,
        'date_retrait': r.date_retrait.isoformat(),
        'heure': _heure(r.date_retrait),
        'plats': plats if plats is not None else [],
        'valide_par_id': r.valide_par_id,
        'valide_par_nom': nom_complet(r.valide_par) if r.valide_par_id else None,
        'valide_par_prestataire': (r.valide_par.prestataire.libelle
                                   if r.valide_par_id and r.valide_par.prestataire_id else None),
        'mode': r.mode,
        'annulable_par_moi': bool(a_moi and maintenant <= limite),
        'annulable_jusqu_a': limite.isoformat() if a_moi else None,
    }


def _plats_retires(menu_ids, user_ids):
    resultat = defaultdict(list)
    for c in (Commande.objects.filter(menu_id__in=menu_ids, user_id__in=user_ids, statut='retiree')
              .select_related('plat')):
        resultat[(c.menu_id, c.user_id)].append({'commande_id': c.id, 'plat': c.plat.nom})
    return resultat


# ══════════════════════════════════════════════════════════════
# CONTEXTE (en-tête de l'espace, sélecteur d'agence du comptoir)
# ══════════════════════════════════════════════════════════════

class ContexteView(APIView):
    """GET /prestataire/contexte/ : compte connecté, prestataire, agences desservies aujourd'hui."""
    permission_classes = [IsAgentComptoir]

    def get(self, request):
        user = request.user
        p = user.prestataire
        responsable = is_prestataire_responsable(user)
        role = ROLE_PRESTATAIRE if responsable else ROLE_AGENT_COMPTOIR
        parametres = ParametresSociete.charger()
        donnees = {
            'user': {'id': user.id, 'username': user.username, 'nom': user.nom, 'prenom': user.prenom,
                     'nom_complet': nom_complet(user), 'role': role, 'role_libelle': LIBELLES_ROLES[role]},
            'prestataire': {'id': p.id, 'libelle': p.libelle, 'contact_nom': p.contact_nom,
                            'telephone': p.telephone, 'email': p.email},
            'agences': _agences_json(agences_prestataire(user), parametres),
            'acces': {
                'accueil': responsable, 'plats': responsable, 'menus': responsable,
                'a_preparer': responsable, 'comptoir': True, 'liste_du_jour': True,
                'releves': responsable, 'statistiques': responsable, 'equipe': responsable,
            },
            'delai_commande_heures': parametres.delai_commande_heures,
        }
        if responsable:
            tarif = rel.tarif_en_vigueur(p, timezone.localdate())
            donnees['tarif'] = tarif and {'montant': float(tarif.montant),
                                          'date_debut': fact._jour(tarif.date_debut).isoformat()}
        return Response(donnees)


# ══════════════════════════════════════════════════════════════
# MES PLATS
# ══════════════════════════════════════════════════════════════

class PlatEspaceSerializer(serializers.ModelSerializer):
    type_plat = serializers.PrimaryKeyRelatedField(queryset=TypePlat.objects.all())
    type_plat_libelle = serializers.ReadOnlyField(source='type_plat.libelle')
    agences = serializers.PrimaryKeyRelatedField(many=True, queryset=Agence.objects.all())
    agences_noms = serializers.SerializerMethodField()
    mentions = serializers.ListField(child=serializers.CharField(max_length=40), required=False,
                                     max_length=10)
    images = PlatImageSerializer(many=True, read_only=True)
    note_moyenne = serializers.SerializerMethodField()
    nb_avis = serializers.SerializerMethodField()
    nb_servis = serializers.SerializerMethodField()
    prix = serializers.SerializerMethodField()
    modifie_par = serializers.SerializerMethodField()

    class Meta:
        model = Plat
        fields = ['id', 'nom', 'description', 'type_plat', 'type_plat_libelle', 'agences',
                  'agences_noms', 'mentions', 'images', 'masque', 'motif_masquage', 'note_moyenne',
                  'nb_avis', 'nb_servis', 'prix', 'created_at', 'updated_at', 'modifie_par']
        read_only_fields = ['masque', 'motif_masquage', 'created_at', 'updated_at']

    def _stats(self):
        ctx = self.context
        if '_stats_plats' not in ctx:
            pid = ctx['request'].user.prestataire_id
            avis = {r['plat_id']: (r['m'], r['n']) for r in AvisPlat.objects.filter(plat__prestataire_id=pid)
                    .values('plat_id').annotate(m=Avg('note'), n=Count('id'))}
            servis = dict(Commande.objects.filter(plat__prestataire_id=pid, statut='retiree')
                          .values('plat_id').annotate(n=Count('id')).values_list('plat_id', 'n'))
            ctx['_stats_plats'] = (avis, servis)
        return ctx['_stats_plats']

    def get_agences_noms(self, obj):
        return sorted(a.nom_agence for a in obj.agences.all())

    def get_note_moyenne(self, obj):
        m = self._stats()[0].get(obj.id, (None, 0))[0]
        return round(m, 1) if m is not None else None

    def get_nb_avis(self, obj):
        return self._stats()[0].get(obj.id, (None, 0))[1]

    def get_nb_servis(self, obj):
        return self._stats()[1].get(obj.id, 0)

    def get_prix(self, obj):
        """Tarif du contrat (fixé par UbiPharm, non modifiable par le prestataire)."""
        ctx = self.context
        if '_tarif' not in ctx:
            t = rel.tarif_en_vigueur(ctx['request'].user.prestataire, timezone.localdate())
            ctx['_tarif'] = float(t.montant) if t else None
        return ctx['_tarif']

    def get_modifie_par(self, obj):
        return nom_complet(obj.user_updated) if obj.user_updated_id else None

    def validate_nom(self, nom):
        nom = (nom or '').strip()
        if not nom:
            raise serializers.ValidationError("Le nom du plat est obligatoire.")
        return nom

    def validate_mentions(self, mentions):
        return [m.strip() for m in mentions if m and m.strip()]

    def validate_agences(self, agences):
        if not agences:
            raise serializers.ValidationError("Choisissez au moins une agence où le plat est proposé.")
        desservies = agences_prestataire(self.context['request'].user)
        hors = sorted(a.nom_agence for a in agences if a.id not in desservies)
        if hors:
            raise serializers.ValidationError(
                f"Votre prestataire ne dessert pas : {', '.join(hors)}.")
        return agences

    def validate(self, attrs):
        if self.instance is None and 'agences' not in attrs:
            raise serializers.ValidationError({'agences': "Choisissez au moins une agence où le plat est proposé."})
        return attrs

    def _enregistrer(self, plat, agences):
        if agences is not None:
            plat.agences.set(agences)
            if plat.agence_id not in {a.id for a in agences}:
                plat.agence = sorted(agences, key=lambda a: a.id)[0]
                plat.save(update_fields=['agence'])

    def create(self, validated_data):
        agences = validated_data.pop('agences')
        validated_data['agence'] = sorted(agences, key=lambda a: a.id)[0]
        plat = super().create(validated_data)
        self._enregistrer(plat, agences)
        return plat

    def update(self, instance, validated_data):
        agences = validated_data.pop('agences', None)
        plat = super().update(instance, validated_data)
        self._enregistrer(plat, agences)
        return plat


class PlatEspaceViewSet(viewsets.ModelViewSet):
    """
    /prestataire/plats/ : plats du prestataire (responsable). Photos par
    multipart : new_images (fichiers, 3 photos au plus par plat),
    images_to_delete (IDs). Le prix n'est pas modifiable (tarif du contrat).
    """
    permission_classes = [IsPrestataireResponsable]
    serializer_class = PlatEspaceSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = None

    def get_queryset(self):
        qs = (Plat.objects.filter(prestataire_id=self.request.user.prestataire_id)
              .select_related('type_plat', 'user_updated').prefetch_related('images', 'agences')
              .order_by('nom'))
        p = self.request.query_params
        if p.get('type_plat'):
            qs = qs.filter(type_plat_id=_entier(p['type_plat'], 'type_plat'))
        if p.get('agence'):
            qs = qs.filter(agences__id=_entier(p['agence'], 'agence'))
        if p.get('search'):
            qs = qs.filter(Q(nom__icontains=p['search']) | Q(description__icontains=p['search']))
        if p.get('sans_photo') in ('1', 'true'):
            qs = qs.filter(images__isnull=True)
        return qs.distinct()

    def list(self, request, *args, **kwargs):
        plats = list(self.get_queryset())
        return Response({
            'nb_plats': len(plats),
            'nb_sans_photo': sum(1 for x in plats if not x.images.all()),
            'plats': self.get_serializer(plats, many=True).data,
        })

    @staticmethod
    def _fichiers(request):
        fichiers = request.FILES.getlist('new_images')
        for f in fichiers:
            PlatImageUploadSerializer(data={'image': f}).is_valid(raise_exception=True)
        return fichiers

    @staticmethod
    def _a_supprimer(request):
        getlist = getattr(request.data, 'getlist', None)
        ids = (getlist('images_to_delete[]') or getlist('images_to_delete')) if getlist \
            else request.data.get('images_to_delete', [])
        return [int(i) for i in ids if str(i).isdigit()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fichiers = self._fichiers(request)
        if len(fichiers) > PHOTOS_MAX:
            raise ValidationError(f"{PHOTOS_MAX} photos au plus par plat.")
        with transaction.atomic():
            plat = serializer.save(prestataire=request.user.prestataire, user_created=request.user,
                                   user_updated=request.user)
            for i, f in enumerate(fichiers):
                PlatImage.objects.create(plat=plat, image=f, is_principale=(i == 0),
                                         user_created=request.user, user_updated=request.user)
        return Response(self.get_serializer(self.get_queryset().get(pk=plat.pk)).data,
                        status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        plat = self.get_object()
        serializer = self.get_serializer(plat, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        fichiers = self._fichiers(request)
        a_supprimer = self._a_supprimer(request)
        restantes = plat.images.exclude(id__in=a_supprimer).count()
        if restantes + len(fichiers) > PHOTOS_MAX:
            raise ValidationError(f"{PHOTOS_MAX} photos au plus par plat.")
        with transaction.atomic():
            for img in PlatImage.objects.filter(id__in=a_supprimer, plat=plat):
                img.delete()
            for f in fichiers:
                PlatImage.objects.create(plat=plat, image=f, user_created=request.user,
                                         user_updated=request.user)
            images = plat.images.order_by('id')
            if images.exists() and not images.filter(is_principale=True).exists():
                images.filter(pk=images.first().pk).update(is_principale=True)
            serializer.save(user_updated=request.user)
        return Response(self.get_serializer(self.get_queryset().get(pk=plat.pk)).data)

    def perform_destroy(self, instance):
        if MenuPlat.objects.filter(plat=instance).exists() or Commande.objects.filter(plat=instance).exists():
            raise ValidationError(
                f"Le plat « {instance.nom} » figure dans des menus ou des commandes : il ne peut pas être supprimé.")
        for img in instance.images.all():
            img.delete()
        instance.delete()

    @action(detail=True, methods=['post'], url_path='image-principale')
    def image_principale(self, request, pk=None):
        """POST /prestataire/plats/{id}/image-principale/ { image_id }"""
        plat = self.get_object()
        image = plat.images.filter(pk=request.data.get('image_id')).first()
        if image is None:
            raise ValidationError("Cette photo n'appartient pas au plat.")
        with transaction.atomic():
            plat.images.exclude(pk=image.pk).update(is_principale=False)
            plat.images.filter(pk=image.pk).update(is_principale=True)
        return Response(self.get_serializer(self.get_queryset().get(pk=plat.pk)).data)


# ══════════════════════════════════════════════════════════════
# MES MENUS (publication automatique)
# ══════════════════════════════════════════════════════════════

def _modifiable(menu, maintenant=None, parametres=None):
    """Le prestataire peut modifier le menu jusqu'à la date limite de commande."""
    maintenant = maintenant or timezone.now()
    return not menu.masque and maintenant < date_limite_commande(menu.date_menu, parametres)


class MenuEspaceSerializer(MenuSerializer):
    """
    Menu composé par le prestataire. Mêmes règles que côté UbiPharm (doublon,
    prestataire et tarif à la date, plats commandés non retirables) plus :
    agence desservie à la date du menu, ses propres plats non masqués et
    proposés dans l'agence, et avant la date limite de commande.
    """
    modifiable = serializers.SerializerMethodField()
    nb_commandes = serializers.SerializerMethodField()
    nb_employes_agence = serializers.SerializerMethodField()
    cree_par = serializers.SerializerMethodField()
    modifie_par = serializers.SerializerMethodField()

    def get_modifiable(self, obj):
        return _modifiable(obj, parametres=self._parametres())

    def get_nb_commandes(self, obj):
        # Annoté par la vue ; sinon (menu tout juste créé) compté
        if hasattr(obj, 'nb_commandes'):
            return obj.nb_commandes
        return commandes_actives(obj).count()

    def get_nb_employes_agence(self, obj):
        ctx = self.context
        if '_nb_employes' not in ctx:
            ctx['_nb_employes'] = _nb_employes(agences_rattachees(ctx['request'].user.prestataire_id))
        return ctx['_nb_employes'].get(obj.agence_id, 0)

    def get_cree_par(self, obj):
        return nom_complet(obj.user_created) if obj.user_created_id else None

    def get_modifie_par(self, obj):
        return nom_complet(obj.user_updated) if obj.user_updated_id else None

    def validate(self, attrs):
        user = self.context['request'].user
        inst = self.instance
        maintenant = timezone.now()
        date_menu = attrs.get('date_menu', getattr(inst, 'date_menu', None))
        agence = attrs.get('agence', getattr(inst, 'agence', None))
        if date_menu is None or agence is None or attrs.get('typeequipe', getattr(inst, 'typeequipe', None)) is None:
            raise serializers.ValidationError("La date, l'agence et l'équipe du menu sont obligatoires.")

        if inst is not None:
            if inst.masque:
                raise serializers.ValidationError(
                    "Ce menu a été masqué par UbiPharm : il ne peut plus être modifié.")
            limite = date_limite_commande(inst.date_menu)
            if maintenant >= limite:
                raise serializers.ValidationError(
                    "La date limite de commande est passée "
                    f"({libelle_date_limite(limite)}) : le menu ne peut plus être modifié.")
            if inst.publie and attrs.get('publie') is False:
                raise serializers.ValidationError("Un menu publié ne peut pas repasser en brouillon.")
        limite = date_limite_commande(date_menu)
        if maintenant >= limite:
            raise serializers.ValidationError(
                f"Les commandes du {date_menu:%d/%m/%Y} sont closes depuis le "
                f"{libelle_date_limite(limite)} : ce menu ne peut plus être composé.")
        if agence.id not in agences_prestataire(user, date_menu):
            raise serializers.ValidationError(
                f"Votre prestataire ne dessert pas l'agence {agence.nom_agence} le {date_menu:%d/%m/%Y}.")
        # Plusieurs prestataires peuvent desservir l'agence : le menu est le sien
        attrs['prestataire'] = user.prestataire

        plats = attrs.get('plat_ids')
        if plats:
            autres = sorted(p.nom for p in plats if p.prestataire_id != user.prestataire_id)
            if autres:
                raise serializers.ValidationError(
                    {'plat_ids': f"Ces plats ne sont pas les vôtres : {', '.join(autres)}."})
            hors = sorted(p.nom for p in plats
                          if p.agences.exists() and not p.agences.filter(pk=agence.pk).exists())
            if hors:
                raise serializers.ValidationError(
                    {'plat_ids': f"Plats non proposés à {agence.nom_agence} : {', '.join(hors)}."})
        return super().validate(attrs)


class MenuEspaceViewSet(viewsets.ModelViewSet):
    """
    /prestataire/menus/ : menus des agences du prestataire. Publication
    automatique (publie=true par défaut : employés notifiés), brouillon
    possible (publie=false). Modifiable jusqu'à la date limite de commande.
    """
    permission_classes = [IsPrestataireResponsable]
    serializer_class = MenuEspaceSerializer
    pagination_class = None

    def get_serializer_context(self):
        return {**super().get_serializer_context(), 'espace_prestataire': True}

    def get_queryset(self):
        qs = (menus_du_prestataire(self.request.user.prestataire_id)
              .select_related('agence', 'typeequipe', 'user_created', 'user_updated')
              .prefetch_related('menu_plats__plat__images', 'menu_plats__plat__type_plat',
                                'menu_plats__plat__agence')
              .annotate(nb_commandes=Count('commandes', filter=Q(commandes__statut__in=ACTIVES)))
              .order_by('date_menu', 'agence__nom_agence', 'typeequipe__libelle'))
        if self.action != 'list':
            return qs
        p = self.request.query_params
        agence = _agence_demandee(self.request)
        if agence is not None:
            qs = qs.filter(agence_id=agence)
        aujourdhui = timezone.localdate()
        lundi = aujourdhui - timedelta(days=aujourdhui.weekday())
        debut = _date(p.get('date_debut'), lundi)
        fin = _date(p.get('date_fin'), debut + timedelta(days=13))
        if (fin - debut).days > 92:
            raise ValidationError("Période trop longue (92 jours au plus).")
        qs = qs.filter(date_menu__gte=debut, date_menu__lte=fin)
        if p.get('publie') in ('0', 'false'):
            qs = qs.filter(publie=False)
        elif p.get('publie') in ('1', 'true'):
            qs = qs.filter(publie=True)
        return qs

    def perform_create(self, serializer):
        publie = serializer.validated_data.get('publie', True)
        menu = serializer.save(user_created=self.request.user, user_updated=self.request.user,
                               date_publication=timezone.now() if publie else None)
        plats = ', '.join(sorted(menu.menu_plats.values_list('plat__nom', flat=True)))
        tracer_menu(menu, 'creation', self.request.user,
                    f"{'Publié' if publie else 'Brouillon'} — plats : {plats}")

    def perform_update(self, serializer):
        menu = serializer.instance
        avant = ', '.join(sorted(menu.menu_plats.values_list('plat__nom', flat=True)))
        etait_publie = menu.publie
        publie = serializer.validated_data.get('publie', etait_publie)
        extra = {'date_publication': timezone.now()} if publie and not etait_publie else {}
        menu = serializer.save(user_updated=self.request.user, **extra)
        apres = ', '.join(sorted(menu.menu_plats.values_list('plat__nom', flat=True)))
        if avant != apres:
            tracer_menu(menu, 'modification', self.request.user, f"Plats : {avant} → {apres}")
        if extra:
            tracer_menu(menu, 'publication', self.request.user, f"Plats : {apres}")

    def perform_destroy(self, instance):
        if not _modifiable(instance):
            raise ValidationError("La date limite de commande est passée : ce menu ne peut plus être supprimé.")
        verifier_mois_ouvert(instance.date_menu)
        if commandes_actives(instance).exists():
            raise ValidationError(
                f"Le menu du {instance.date_menu:%d/%m/%Y} a déjà des commandes : il ne peut pas être supprimé.")
        tracer_menu(instance, 'suppression', self.request.user)
        instance.delete()

    @action(detail=False, methods=['post'])
    def publier(self, request):
        """
        POST /prestataire/menus/publier/ { ids: [..] }  ou  { agence, date_debut, date_fin }
        Publie les brouillons (avant leur date limite) : les employés sont notifiés.
        """
        qs = self.get_queryset().filter(publie=False, masque=False)
        ids = request.data.get('ids')
        if ids:
            if not isinstance(ids, list) or not all(str(i).isdigit() for i in ids):
                raise ValidationError("ids doit être une liste d'identifiants.")
            qs = qs.filter(id__in=[int(i) for i in ids])
        else:
            debut = _date(request.data.get('date_debut'), None)
            fin = _date(request.data.get('date_fin'), None)
            if not debut or not fin:
                raise ValidationError("Indiquez ids, ou date_debut et date_fin.")
            qs = qs.filter(date_menu__gte=debut, date_menu__lte=fin)
            agence = _agence_demandee(request, request.data.get('agence'))
            if agence is not None:
                qs = qs.filter(agence_id=agence)
        publies, ignores = [], []
        maintenant = timezone.now()
        for menu in qs:
            if not _modifiable(menu, maintenant):
                ignores.append({'id': menu.id, 'date_menu': menu.date_menu.isoformat(),
                                'raison': "Date limite de commande passée."})
                continue
            menu.publie = True
            menu.date_publication = maintenant
            menu.user_updated = request.user
            menu.save()
            tracer_menu(menu, 'publication', request.user)
            publies.append(menu.id)
        return Response({'publies': publies, 'ignores': ignores,
                         'menus': self.get_serializer(self.get_queryset().filter(id__in=publies), many=True).data})

    def _copier(self, source, date_menu, agence_id, publie):
        data = {'date_menu': date_menu.isoformat(), 'agence': agence_id, 'typeequipe': source.typeequipe_id,
                'publie': publie, 'plat_ids': list(source.menu_plats.values_list('plat_id', flat=True))}
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return serializer.instance

    @staticmethod
    def _publie(valeur):
        return valeur not in (False, 'false', '0', 0)

    @action(detail=False, methods=['post'])
    def copier(self, request):
        """
        POST /prestataire/menus/copier/ { menu_source, date_menu, agence?, publie? }
        Crée un menu identique (mêmes plats et équipe) à une autre date / agence.
        """
        source = get_object_or_404(self.get_queryset(), pk=_entier(request.data.get('menu_source'), 'menu_source'))
        date_menu = _date(request.data.get('date_menu'), None)
        if date_menu is None:
            raise ValidationError({'date_menu': "Date du nouveau menu requise."})
        agence = _agence_demandee(request, request.data.get('agence')) or source.agence_id
        menu = self._copier(source, date_menu, agence, self._publie(request.data.get('publie', True)))
        return Response(self.get_serializer(self.get_queryset().get(pk=menu.pk)).data,
                        status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='copier-semaine')
    def copier_semaine(self, request):
        """
        POST /prestataire/menus/copier-semaine/ { agence, semaine_source, semaine_cible, publie? }
        (dates quelconques des deux semaines) : recopie chaque menu de la semaine
        source au même jour de la semaine cible, sauf jours déjà composés ou clos.
        """
        agence = _agence_demandee(request, request.data.get('agence'))
        if agence is None:
            raise ValidationError({'agence': "Agence requise."})
        src = _date(request.data.get('semaine_source'), None)
        cible = _date(request.data.get('semaine_cible'), None)
        if not src or not cible:
            raise ValidationError("semaine_source et semaine_cible sont requises.")
        src -= timedelta(days=src.weekday())
        cible -= timedelta(days=cible.weekday())
        publie = self._publie(request.data.get('publie', True))
        crees, ignores = [], []
        for source in (self.get_queryset().filter(agence_id=agence, date_menu__gte=src,
                                                  date_menu__lte=src + timedelta(days=6))):
            d = cible + timedelta(days=source.date_menu.weekday())
            try:
                with transaction.atomic():
                    crees.append(self._copier(source, d, agence, publie).id)
            except ValidationError as e:
                detail = e.detail
                if isinstance(detail, dict):
                    detail = next(iter(detail.values()))
                if isinstance(detail, list):
                    detail = detail[0]
                ignores.append({'date_menu': d.isoformat(), 'raison': str(detail)})
        return Response({'crees': crees, 'ignores': ignores,
                         'menus': self.get_serializer(self.get_queryset().filter(id__in=crees), many=True).data},
                        status=status.HTTP_201_CREATED if crees else status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def historique(self, request):
        """GET /prestataire/menus/historique/?agence=&date_debut=&date_fin=&menu= : dernières modifications."""
        qs = (MenuHistorique.objects.filter(filtre_menus_prestataire(
            request.user.prestataire_id, champ_prestataire='menu__prestataire_id'))
              .select_related('user'))
        p = request.query_params
        agence = _agence_demandee(request)
        if agence is not None:
            qs = qs.filter(agence_id=agence)
        if p.get('menu'):
            qs = qs.filter(menu_id=_entier(p['menu'], 'menu'))
        if p.get('date_debut'):
            qs = qs.filter(date_menu__gte=_date(p['date_debut'], None))
        if p.get('date_fin'):
            qs = qs.filter(date_menu__lte=_date(p['date_fin'], None))
        return Response([historique_json(h) for h in qs[:100]])


# ══════════════════════════════════════════════════════════════
# À PRÉPARER ET LISTE DU JOUR
# ══════════════════════════════════════════════════════════════

def _etat_jour(d, aujourdhui, maintenant, parametres):
    limite = date_limite_commande(d, parametres)
    if d < aujourdhui:
        etat = 'passe'
    elif d == aujourdhui:
        etat = 'en_service'
    elif maintenant >= limite:
        etat = 'fige'           # commandes closes : quantités définitives
    elif timezone.localtime(limite).date() <= aujourdhui + timedelta(days=1) or limite - maintenant <= timedelta(hours=24):
        etat = 'provisoire'     # se fige bientôt (aujourd'hui ou dans les 24 h)
    else:
        etat = 'ouvert'         # commandes ouvertes : estimation
    return etat, limite


def quantites(prestataire_id, debut, fin, agence=None, origine='toutes'):
    """
    Quantités à préparer par jour × plat × agence (commandes non annulées des
    menus servis par le prestataire). Avant la date limite : provisoire.
    `externes` : commandes d'employés d'une autre agence que celle du menu ;
    `origine` (toutes | mon_agence | autres) : filtre sur cette origine.
    """
    from .parcours_commande import agences_origine, est_externe, garder_origine
    aujourdhui, maintenant = timezone.localdate(), timezone.now()
    parametres = ParametresSociete.charger()
    qs = commandes_du_prestataire(prestataire_id).filter(
        statut__in=ACTIVES, menu__date_menu__gte=debut, menu__date_menu__lte=fin)
    if agence is not None:
        qs = qs.filter(menu__agence_id=agence)
    rangs = list(qs.values_list('menu__date_menu', 'plat_id', 'plat__nom', 'menu__agence_id', 'statut', 'user_id'))
    origines = agences_origine({r[5] for r in rangs})
    lignes = {}
    for d, plat_id, plat_nom, agence_id, statut, user_id in rangs:
        externe = est_externe(origines.get(user_id), agence_id)
        if not garder_origine(origine, externe):
            continue
        l = lignes.setdefault((d, plat_id, agence_id), {'menu__date_menu': d, 'plat_id': plat_id,
                                                        'plat__nom': plat_nom, 'menu__agence_id': agence_id,
                                                        'n': 0, 'servis': 0, 'externes': 0})
        l['n'] += 1
        l['servis'] += statut == 'retiree'
        l['externes'] += externe
    jours = OrderedDict()
    d = debut
    while d <= fin:
        etat, limite = _etat_jour(d, aujourdhui, maintenant, parametres)
        jours[d] = {'date': d.isoformat(), 'libelle': _jour_libelle(d), 'etat': etat,
                    'provisoire': maintenant < limite, 'date_limite_commande': limite.isoformat(),
                    'libelle_limite': libelle_date_limite(limite),
                    '_plats': OrderedDict(), 'totaux_par_agence': defaultdict(int), 'total': 0, 'servis': 0,
                    'externes': 0, 'externes_par_agence': defaultdict(int)}
        d += timedelta(days=1)
    for l in sorted(lignes.values(), key=lambda x: x['plat__nom']):
        j = jours[l['menu__date_menu']]
        p = j['_plats'].setdefault(l['plat_id'], {'plat_id': l['plat_id'], 'plat': l['plat__nom'],
                                                  'par_agence': defaultdict(int), 'total': 0, 'servis': 0,
                                                  'externes': 0})
        p['par_agence'][l['menu__agence_id']] += l['n']
        p['total'] += l['n']
        p['servis'] += l['servis']
        p['externes'] += l['externes']
        j['totaux_par_agence'][l['menu__agence_id']] += l['n']
        j['total'] += l['n']
        j['servis'] += l['servis']
        j['externes'] += l['externes']
        j['externes_par_agence'][l['menu__agence_id']] += l['externes']
    resultat = []
    for j in jours.values():
        plats = sorted(j.pop('_plats').values(), key=lambda p: (-p['total'], p['plat']))
        j['plats'] = [{**p, 'par_agence': {str(k): v for k, v in p['par_agence'].items()}} for p in plats]
        j['totaux_par_agence'] = {str(k): v for k, v in j['totaux_par_agence'].items()}
        j['externes_par_agence'] = {str(k): v for k, v in j['externes_par_agence'].items() if v}
        resultat.append(j)
    return resultat


class APreparerView(APIView):
    """
    GET /prestataire/a-preparer/?date_debut=&date_fin=&agence=&origine=toutes|mon_agence|autres
    Défaut : aujourd'hui et les deux jours suivants. 31 jours au plus.
    externes : repas commandés par des employés d'une autre agence que celle du menu.
    """
    permission_classes = [IsPrestataireResponsable]

    def get(self, request):
        aujourdhui = timezone.localdate()
        debut = _date(request.query_params.get('date_debut'), aujourdhui)
        fin = _date(request.query_params.get('date_fin'), debut + timedelta(days=2))
        if fin < debut:
            raise ValidationError("La date de fin précède la date de début.")
        if (fin - debut).days > 30:
            raise ValidationError("Période trop longue (31 jours au plus).")
        agence = _agence_demandee(request)
        from .parcours_commande import lire_origine
        origine = lire_origine(request)
        pid = request.user.prestataire_id
        jours = quantites(pid, debut, fin, agence, origine)
        agences = sorted({int(a) for j in jours for a in j['totaux_par_agence']}
                         | (agences_prestataire(request.user) if agence is None else {agence}))

        # Semaine en cours (lundi → dimanche) : repas commandés et montant estimé
        lundi = aujourdhui - timedelta(days=aujourdhui.weekday())
        dimanche = lundi + timedelta(days=6)
        sem = commandes_du_prestataire(pid).filter(statut__in=ACTIVES, menu__date_menu__gte=lundi,
                                                   menu__date_menu__lte=dimanche)
        if agence is not None:
            sem = sem.filter(menu__agence_id=agence)
        nb = sem.count()
        tarif = rel.tarif_en_vigueur(request.user.prestataire, aujourdhui)
        return Response({
            'date_debut': debut.isoformat(), 'date_fin': fin.isoformat(), 'origine': origine,
            'agences': _agences_json(agences),
            'jours': jours,
            'semaine': {'debut': lundi.isoformat(), 'fin': dimanche.isoformat(), 'nb_repas': nb,
                        'tarif': float(tarif.montant) if tarif else None,
                        'montant_estime': float(tarif.montant * nb) if tarif else None},
        })


class ListeDuJourView(APIView):
    """
    GET /prestataire/liste-du-jour/?date=&agence=&statut=a_servir|retire|non_retire&search=
                                   &origine=toutes|mon_agence|autres
    Liste nominative (nom, prénoms, matricule, plat, statut). Agent de comptoir :
    aujourd'hui seulement ; responsable : toute date.
    """
    permission_classes = [IsAgentComptoir]

    def get(self, request):
        aujourdhui = timezone.localdate()
        d = _date(request.query_params.get('date'), aujourdhui)
        if d != aujourdhui and not is_prestataire_responsable(request.user):
            raise PermissionDenied("La liste nominative n'est disponible que pour le jour du service.")
        agence = _agence_demandee(request)
        if agence is None:
            # Sans ?agence= : l'agence desservie ce jour-là si elle est la seule
            desservies = agences_prestataire(request.user, d)
            if desservies and len(desservies) == 1:
                agence = next(iter(desservies))
        qs = (commandes_du_prestataire(request.user.prestataire_id)
              .filter(statut__in=ACTIVES, menu__date_menu=d)
              .select_related('user', 'plat', 'menu__agence'))
        if agence is not None:
            qs = qs.filter(menu__agence_id=agence)
        from .parcours_commande import agences_origine, filtrer_commandes_origine, lire_origine, origine_json
        origine = lire_origine(request)
        commandes = list(qs)
        origines = agences_origine({c.user_id for c in commandes})
        commandes, _ = filtrer_commandes_origine(commandes, origine, origines)
        retraits = {(r.menu_id, r.user_id): r for r in Retrait.objects.filter(
            menu_id__in={c.menu_id for c in commandes}).select_related('valide_par')}

        def statut(c):
            if c.statut == 'retiree':
                return 'retire'
            return 'a_servir' if d >= aujourdhui else 'non_retire'

        lignes = []
        for c in commandes:
            r = retraits.get((c.menu_id, c.user_id))
            lignes.append({
                'commande_id': c.id, 'menu_id': c.menu_id,
                **{k: v for k, v in _employe_json(c.user, c.menu.agence.nom_agence).items() if k != 'id'},
                'user_id': c.user_id, 'agence_id': c.menu.agence_id,
                'plat_id': c.plat_id, 'plat': c.plat.nom, 'statut': statut(c),
                'heure_retrait': _heure(r.date_retrait) if r and c.statut == 'retiree' else None,
                'valide_par_nom': nom_complet(r.valide_par) if r and r.valide_par_id else None,
                **origine_json(origines.get(c.user_id), c.menu.agence_id),
            })
        total, retires = len(lignes), sum(l['statut'] == 'retire' for l in lignes)
        externes = sum(l['externe'] for l in lignes)
        filtre = request.query_params.get('statut')
        if filtre:
            lignes = [l for l in lignes if l['statut'] == filtre]
        terme = (request.query_params.get('search') or '').strip().lower()
        if terme:
            lignes = [l for l in lignes if terme in f"{l['nom_complet']} {l['matricule']} {l['plat']}".lower()]
        lignes.sort(key=lambda l: (l['nom_complet'].upper(), l['matricule']))
        return Response({'date': d.isoformat(), 'agence': agence, 'origine': origine, 'total': total,
                         'retires': retires, 'a_servir': total - retires, 'externes': externes,
                         'lignes': lignes})


# ══════════════════════════════════════════════════════════════
# COMPTOIR
# ══════════════════════════════════════════════════════════════

def _agence_comptoir(request, valeur=None):
    """Agence du comptoir : ?agence=ID, ou la seule agence desservie aujourd'hui."""
    agence = _agence_demandee(request, valeur)
    if agence is None:
        agences = agences_prestataire(request.user)
        if len(agences) != 1:
            raise ValidationError({'agence': "Précisez l'agence du comptoir."})
        agence = next(iter(agences))
    return agence


def _menus_du_jour(request, agence, d=None):
    return list(menus_du_prestataire(request.user.prestataire_id)
                .filter(agence_id=agence, date_menu=d or timezone.localdate())
                .select_related('agence', 'typeequipe'))


class ComptoirServiceView(APIView):
    """
    GET /prestataire/comptoir/service/?agence=&limite=8
    Avancement du service du jour dans l'agence (tous les menus du jour) :
    commandés / servis / à servir, par plat, derniers retraits.
    """
    permission_classes = [IsAgentComptoir]

    def get(self, request):
        agence = _agence_comptoir(request)
        menus = _menus_du_jour(request, agence)
        ids = [m.id for m in menus]
        actives = Commande.objects.filter(menu_id__in=ids, statut__in=ACTIVES)
        images = _images(set(actives.values_list('plat_id', flat=True)))
        plats = [
            {'plat_id': r['plat_id'], 'nom': r['plat__nom'], 'image_url': images.get(r['plat_id']),
             'commandees': r['c'], 'servies': r['s'], 'a_servir': r['c'] - r['s']}
            for r in actives.values('plat_id', 'plat__nom')
            .annotate(c=Count('id'), s=Count('id', filter=Q(statut='retiree'))).order_by('plat__nom')
        ]
        commandees = sum(p['commandees'] for p in plats)
        servies = sum(p['servies'] for p in plats)
        try:
            limite = min(max(int(request.query_params.get('limite', 8)), 1), 50)
        except ValueError:
            limite = 8
        derniers = list(Retrait.objects.filter(menu_id__in=ids)
                        .select_related('user', 'valide_par__prestataire').order_by('-date_retrait')[:limite])
        retires = _plats_retires(ids, [r.user_id for r in derniers])
        from .parcours_commande import agences_origine, est_externe, origine_json
        origines = agences_origine(set(actives.values_list('user_id', flat=True)) | {r.user_id for r in derniers})
        externes = defaultdict(int)
        for plat_id, user_id in actives.values_list('plat_id', 'user_id'):
            externes[plat_id] += est_externe(origines.get(user_id), agence)
        for p in plats:
            p['externes'] = externes.get(p['plat_id'], 0)
        ag = Agence.objects.get(pk=agence)
        # Horaires des équipes des menus du jour (sinon de l'agence, sinon par défaut)
        parametres = ParametresSociete.charger()
        debut, fin = horaires_menus(ag, menus, parametres)
        horaires_eq = {e['id']: e for e in equipes_horaires_json(ag, menus, parametres)}
        return Response({
            'date': timezone.localdate().isoformat(),
            'agence': {'id': ag.id, 'nom': ag.nom_agence, 'heure_debut_service': debut.strftime('%H:%M'),
                       'heure_fin_service': fin.strftime('%H:%M')},
            'menus': [{'id': m.id, 'typeequipe_libelle': m.typeequipe.libelle,
                       'heure_debut_service': horaires_eq[m.typeequipe_id]['heure_debut_service'],
                       'heure_fin_service': horaires_eq[m.typeequipe_id]['heure_fin_service']}
                      for m in menus],
            'commandees': commandees, 'servies': servies, 'a_servir': commandees - servies,
            'pct_servis': round(servies / commandees * 100) if commandees else 0,
            'externes': sum(externes.values()),
            'plats': plats,
            'mes_retraits_aujourdhui': Retrait.objects.filter(
                valide_par=request.user, date_retrait__date=timezone.localdate()).count(),
            'derniers': [{**_retrait_json(r, request.user, retires.get((r.menu_id, r.user_id), [])),
                          **origine_json(origines.get(r.user_id), agence)}
                         for r in derniers],
        })


class ComptoirRechercheView(APIView):
    """
    GET /prestataire/comptoir/recherche/?badge=MATRICULE&agence=
    Employé (badge scanné ou matricule saisi) et sa commande du jour dans l'agence.
    """
    permission_classes = [IsAgentComptoir]

    def get(self, request):
        badge = (request.query_params.get('badge') or '').strip()
        if not badge:
            raise ValidationError({'badge': "Badge ou matricule requis."})
        agence = _agence_comptoir(request)
        employe = User.objects.filter(username__iexact=badge, prestataire__isnull=True).first()
        if employe is None:
            return Response({'detail': f"Aucun employé trouvé avec le matricule « {badge} »."},
                            status=status.HTTP_404_NOT_FOUND)
        menus = _menus_du_jour(request, agence)
        commandes = list(Commande.objects.filter(user=employe, menu__in=menus, statut__in=ACTIVES)
                         .select_related('plat', 'menu__agence'))
        images = _images({c.plat_id for c in commandes})
        retrait = (Retrait.objects.filter(user=employe, menu__in=menus)
                   .select_related('user', 'valide_par__prestataire').first())
        from .serializers import agence_actuelle
        ag = agence_actuelle(employe)
        a_retirer = [c for c in commandes if c.statut == 'en_attente']
        if retrait is not None:
            message = (f"{nom_complet(employe)} a déjà retiré son repas à {_heure(retrait.date_retrait)}"
                       + (f" (validé par {nom_complet(retrait.valide_par)})" if retrait.valide_par_id else '')
                       + '.')
        elif not commandes:
            message = "Aucune commande pour aujourd'hui dans cette agence."
        else:
            message = "Commande du jour trouvée."
        from .parcours_commande import origine_json
        origine = origine_json(ag, agence)
        return Response({
            'employe': {**_employe_json(employe, ag.nom_agence if ag else None), **origine},
            **origine,
            'commandes': [{'commande_id': c.id, 'menu_id': c.menu_id, 'plat_id': c.plat_id, 'plat': c.plat.nom,
                           'plat_image_url': images.get(c.plat_id), 'statut': c.statut,
                           'date_commande': c.date_commande.isoformat()} for c in commandes],
            'deja_retire': retrait is not None,
            'retrait': _retrait_json(retrait, request.user,
                                     [{'commande_id': c.id, 'plat': c.plat.nom} for c in commandes
                                      if c.statut == 'retiree']) if retrait else None,
            'a_retirer': bool(a_retirer) and retrait is None,
            'menu_id': a_retirer[0].menu_id if a_retirer and retrait is None else None,
            'message': message,
        })


class ComptoirValiderView(APIView):
    """
    POST /prestataire/comptoir/valider/ { menu_id, user_id, mode: "scan"|"saisie" }
    Enregistre le retrait au nom de l'agent connecté (valide_par) ; l'employé
    reçoit la notification « Retrait validé » (avec action de contestation).
    """
    permission_classes = [IsAgentComptoir]

    def post(self, request):
        from .serializers import RetraitSerializer
        mode = request.data.get('mode')
        if mode not in ('scan', 'saisie'):
            raise ValidationError({'mode': "Indiquez le mode d'identification : « scan » ou « saisie »."})
        menu_id = _entier(request.data.get('menu_id'), 'menu_id')
        user_id = _entier(request.data.get('user_id'), 'user_id')
        if menu_id is None or user_id is None:
            raise ValidationError("menu_id et user_id sont requis.")
        menu = menus_du_prestataire(request.user.prestataire_id).filter(pk=menu_id).first()
        if menu is None:
            raise PermissionDenied("Ce menu n'est pas servi par votre prestataire.")
        if menu.date_menu != timezone.localdate():
            raise ValidationError("Le retrait n'est possible que le jour du menu.")
        employe = get_object_or_404(User, pk=user_id)
        deja = Retrait.objects.filter(user=employe, menu=menu).select_related('user', 'valide_par__prestataire').first()
        if deja is not None:
            return Response({
                'detail': (f"{nom_complet(employe)} a déjà retiré son repas à {_heure(deja.date_retrait)}"
                           + (f" (validé par {nom_complet(deja.valide_par)})" if deja.valide_par_id else '')
                           + '.'),
                'code': 'deja_retire',
                'retrait': _retrait_json(deja, request.user),
            }, status=status.HTTP_409_CONFLICT)
        serializer = RetraitSerializer(data={'user_id': employe.id, 'menu_id': menu.id,
                                             'badge_matricule': employe.username, 'mode': mode},
                                       context={'request': request})
        serializer.is_valid(raise_exception=True)
        retrait = serializer.save(valide_par=request.user, user_created=request.user, user_updated=request.user)
        retrait = Retrait.objects.select_related('user', 'valide_par__prestataire').get(pk=retrait.pk)
        plats = _plats_retires([menu.id], [employe.id]).get((menu.id, employe.id), [])
        return Response(_retrait_json(retrait, request.user, plats), status=status.HTTP_201_CREATED)


class ComptoirAnnulerView(APIView):
    """
    POST /prestataire/comptoir/retraits/<id>/annuler/
    L'agent annule SON retrait dans les 2 minutes ; au-delà, seul le
    gestionnaire UbiPharm peut l'annuler (jusqu'à la clôture du mois).
    """
    permission_classes = [IsAgentComptoir]

    def post(self, request, pk):
        from .views import annuler_retrait
        retrait = get_object_or_404(
            Retrait.objects.filter(filtre_menus_prestataire(request.user.prestataire_id, 'menu__'))
            .select_related('menu'), pk=pk)
        if retrait.valide_par_id != request.user.id:
            raise PermissionDenied("Vous ne pouvez annuler que les retraits que vous avez validés.")
        if timezone.now() > retrait.date_retrait + DELAI_ANNULATION_AGENT:
            raise PermissionDenied(
                "Le délai de 2 minutes est dépassé : seul le gestionnaire UbiPharm peut annuler ce retrait.")
        annuler_retrait(retrait, request.user, par_libelle="l'agent du comptoir")
        return Response({'detail': "Retrait annulé : la commande est de nouveau à servir."})


# ══════════════════════════════════════════════════════════════
# RELEVÉS (lecture seule ; les PDF passent par les routes de facturation)
# ══════════════════════════════════════════════════════════════

def releves_du_prestataire(prestataire, nb_mois=12):
    """
    Relevés mois par mois (du plus récent) : officiel (mois clôturé) ou
    provisoire (calculé). Mois sans repas et sans relevé omis.
    """
    aujourdhui = timezone.localdate()
    officiels = {(f.annee, f.mois): f for f in FacturePrestataire.objects.filter(prestataire=prestataire)
                 .select_related('cloture')}
    clotures = set(fact.ClotureMensuelle.objects.values_list('annee', 'mois'))
    resultat = []
    a, m = aujourdhui.year, aujourdhui.month
    for _ in range(nb_mois):
        debut, fin = fact.bornes_mois(a, m)
        f = officiels.get((a, m))
        ligne = {'annee': a, 'mois': m, 'libelle': f"{MOIS[m - 1].capitalize()} {a}",
                 'date_debut': debut.isoformat(), 'date_fin': fin.isoformat()}
        if f is not None:
            ligne.update({'etat': 'cloture', 'releve_id': f.id, 'numero': f.numero, 'nb_repas': f.nb_repas,
                          'montant': float(f.montant_total), 'cloturee_le': f.cloture.cloturee_le.isoformat(),
                          # Suivi jusqu'au paiement (suivi_factures.py) : étape en cours et statut
                          'statut': f.statut, 'statut_libelle': f.get_statut_display(),
                          'etape': suivi.ETAPE_DU_STATUT.get(f.statut, 2) if f.statut != 'payee' else 6})
        elif (a, m) in clotures:
            ligne = None    # mois clôturé sans repas pour ce prestataire
        else:
            synth, _ = rel.releve_prestataire(prestataire, debut, fin)
            if synth['nb_repas'] or (a, m) == (aujourdhui.year, aujourdhui.month):
                ligne.update({'etat': 'en_cours' if fin >= aujourdhui else 'a_cloturer', 'releve_id': None,
                              'numero': None, 'nb_repas': synth['nb_repas'], 'montant': float(synth['montant']),
                              'cloturee_le': None, 'statut': None, 'statut_libelle': None, 'etape': 0})
            else:
                ligne = None
        if ligne is not None:
            resultat.append(ligne)
        a, m = rel.mois_precedent(a, m)
    return resultat


class RelevesView(APIView):
    """GET /prestataire/releves/?nb_mois=12 : relevés du prestataire (PDF : voir API.md)."""
    permission_classes = [IsPrestataireResponsable]

    def get(self, request):
        nb = min(max(_entier(request.query_params.get('nb_mois'), 'nb_mois') or 12, 1), 24)
        return Response(releves_du_prestataire(request.user.prestataire, nb))


# ══════════════════════════════════════════════════════════════
# ACCUEIL DU RESPONSABLE
# ══════════════════════════════════════════════════════════════

def _service_agence(menus, images, agence_id=None):
    ids = [m.id for m in menus]
    actives = Commande.objects.filter(menu_id__in=ids, statut__in=ACTIVES)
    plats = [{'plat_id': r['plat_id'], 'plat': r['plat__nom'], 'image_url': images.get(r['plat_id']),
              'commandees': r['c'], 'servies': r['s'], 'a_servir': r['c'] - r['s']}
             for r in actives.values('plat_id', 'plat__nom')
             .annotate(c=Count('id'), s=Count('id', filter=Q(statut='retiree'))).order_by('-c', 'plat__nom')]
    c = sum(p['commandees'] for p in plats)
    s = sum(p['servies'] for p in plats)
    donnees = {'commandees': c, 'servies': s, 'a_servir': c - s,
               'pct_servis': round(s / c * 100) if c else 0, 'plats': plats}
    if agence_id is not None:
        # Employés d'une autre agence que celle du menu (« dont N autres agences »)
        from .parcours_commande import agences_origine, est_externe
        users = list(actives.values_list('user_id', flat=True))
        origines = agences_origine(users)
        donnees['externes'] = sum(est_externe(origines.get(u), agence_id) for u in users)
    return donnees


def equipe_du_jour(prestataire_id, d):
    """Retraits validés le jour d par chaque agent du prestataire."""
    lignes = (Retrait.objects.filter(valide_par__prestataire_id=prestataire_id, date_retrait__date=d)
              .values('valide_par_id').annotate(n=Count('id')))
    comptes = {l['valide_par_id']: l['n'] for l in lignes}
    agents = []
    for u in User.objects.filter(id__in=comptes):
        rs = Retrait.objects.filter(valide_par=u, date_retrait__date=d).select_related('menu__agence')
        premier = rs.order_by('date_retrait').first()
        agents.append({'user_id': u.id, 'nom': nom_complet(u), 'nb_retraits': comptes[u.id],
                       'agences': sorted({r.menu.agence.nom_agence for r in rs}),
                       'premier_retrait': _heure(premier.date_retrait) if premier else None})
    agents.sort(key=lambda a: -a['nb_retraits'])
    return {'agents': agents, 'total': sum(comptes.values())}


class AccueilPrestataireView(APIView):
    """GET /prestataire/accueil/ : tableau de bord du responsable."""
    permission_classes = [IsPrestataireResponsable]

    def get(self, request):
        user = request.user
        p = user.prestataire
        aujourdhui, maintenant = timezone.localdate(), timezone.now()
        parametres = ParametresSociete.charger()
        agences = sorted(agences_prestataire(user))
        agences_json = _agences_json(agences, parametres)
        noms = {a['id']: a['nom'] for a in agences_json}

        # Service du jour par agence
        menus_jour = list(menus_du_prestataire(p.id).filter(date_menu=aujourdhui)
                          .select_related('agence', 'typeequipe'))
        images = _images(set(Commande.objects.filter(menu__in=menus_jour).values_list('plat_id', flat=True)))
        service = []
        for a in agences_json:
            menus = [m for m in menus_jour if m.agence_id == a['id']]
            if menus:
                # Horaires des équipes servies aujourd'hui (sinon de l'agence)
                ag = menus[0].agence
                debut, fin = horaires_menus(ag, menus, parametres)
                service.append({'agence_id': a['id'], 'agence_nom': a['nom'],
                                'heure_debut_service': debut.strftime('%H:%M'),
                                'heure_fin_service': fin.strftime('%H:%M'),
                                'equipes': equipes_horaires_json(ag, menus, parametres),
                                **_service_agence(menus, images, a['id'])})

        # À préparer : prochain jour de service (demain, ou premier jour suivant avec des commandes)
        prochain = aujourdhui + timedelta(days=1)
        suivant = (commandes_du_prestataire(p.id).filter(statut__in=ACTIVES, menu__date_menu__gt=aujourdhui)
                   .order_by('menu__date_menu').values_list('menu__date_menu', flat=True).first())
        if suivant and suivant <= aujourdhui + timedelta(days=7):
            prochain = suivant
        demain = quantites(p.id, prochain, prochain)[0]

        # Alertes
        alertes = []
        lundi = aujourdhui - timedelta(days=aujourdhui.weekday()) + timedelta(days=7)
        jours_sem = [lundi + timedelta(days=i) for i in range(5)]
        menus_sem = list(menus_du_prestataire(p.id).filter(date_menu__in=jours_sem)
                         .values('agence_id', 'date_menu', 'publie'))
        manquants = []
        for a in agences:
            faits = {m['date_menu'] for m in menus_sem if m['agence_id'] == a}
            brouillons = {m['date_menu'] for m in menus_sem if m['agence_id'] == a and not m['publie']}
            sans = [d for d in jours_sem if d not in faits
                    and maintenant < date_limite_commande(d, parametres)]
            if sans or brouillons:
                manquants.append({'agence_id': a, 'agence_nom': noms.get(a), 'jours_a_composer': len(sans),
                                  'dates': [d.isoformat() for d in sans],
                                  'brouillons': [d.isoformat() for d in sorted(brouillons)]})
        if manquants:
            limite = min(date_limite_commande(d, parametres) for d in jours_sem)
            alertes.append({'type': 'menus_a_composer', 'semaine_du': lundi.isoformat(),
                            'date_limite': limite.isoformat(), 'agences': manquants})
        contestations = (ContestationRetrait.objects.filter(statut='ouverte')
                         .filter(filtre_menus_prestataire(p.id, 'menu__'))
                         .select_related('menu__agence', 'commande__plat', 'retrait_valide_par'))
        for c in contestations[:10]:
            alertes.append({'type': 'contestation', 'contestation_id': c.id, 'date_menu': c.menu.date_menu.isoformat(),
                            'agence_nom': c.menu.agence.nom_agence, 'plat': c.commande.plat.nom,
                            'valide_par_nom': nom_complet(c.retrait_valide_par) if c.retrait_valide_par_id else None,
                            'heure_retrait': _heure(c.date_retrait), 'statut': c.statut})
        releves = releves_du_prestataire(p, 6)
        dernier = next((r for r in releves if r['etat'] == 'cloture'), None)
        if dernier:
            alertes.append({'type': 'releve', **dernier})
        masques = list(Plat.objects.filter(prestataire=p, masque=True).values('id', 'nom', 'motif_masquage'))
        for pl in masques:
            alertes.append({'type': 'plat_masque', 'plat_id': pl['id'], 'plat': pl['nom'],
                            'motif': pl['motif_masquage']})

        debut_mois, fin_mois = fact.bornes_mois(aujourdhui.year, aujourdhui.month)
        avis = AvisPlat.objects.filter(commande__in=commandes_du_prestataire(p.id).filter(
            menu__date_menu__gte=debut_mois, menu__date_menu__lte=fin_mois)).aggregate(m=Avg('note'), n=Count('id'))
        return Response({
            'date': aujourdhui.isoformat(),
            'heure': timezone.localtime(maintenant).strftime('%H:%M'),
            'prestataire': {'id': p.id, 'libelle': p.libelle},
            'agences': agences_json,
            'service_du_jour': service,
            'a_preparer': {**demain, 'agences': agences_json},
            'equipe': equipe_du_jour(p.id, aujourdhui),
            'alertes': alertes,
            'releves': releves,
            'note_moyenne': {'note': round(avis['m'], 1) if avis['m'] is not None else None,
                             'nb_avis': avis['n'], 'mois': f"{MOIS[aujourdhui.month - 1]} {aujourdhui.year}"},
        })


# ══════════════════════════════════════════════════════════════
# STATISTIQUES ET ÉQUIPE
# ══════════════════════════════════════════════════════════════

class StatistiquesPrestataireView(APIView):
    """GET /prestataire/statistiques/?debut=&fin=&agence= (défaut : le mois en cours)."""
    permission_classes = [IsPrestataireResponsable]

    def get(self, request):
        aujourdhui = timezone.localdate()
        d0, f0 = fact.bornes_mois(aujourdhui.year, aujourdhui.month)
        debut = _date(request.query_params.get('debut'), d0)
        fin = _date(request.query_params.get('fin'), f0)
        if fin < debut:
            raise ValidationError("La date de début doit être antérieure ou égale à la date de fin.")
        if (fin - debut).days > 366:
            raise ValidationError("Période trop longue (un an au plus).")
        agence = _agence_demandee(request)
        qs = commandes_du_prestataire(request.user.prestataire_id).filter(
            menu__date_menu__gte=debut, menu__date_menu__lte=fin)
        if agence is not None:
            qs = qs.filter(menu__agence_id=agence)
        return Response({
            'debut': debut.isoformat(), 'fin': fin.isoformat(), 'agence': agence,
            'en_cours': fin >= aujourdhui,
            'kpis': stats.kpis(qs, aujourdhui),
            'par_plat': stats.par_repas(qs, aujourdhui),
        })


class EquipeView(APIView):
    """GET /prestataire/equipe/ : comptes du prestataire (création par UbiPharm)."""
    permission_classes = [IsPrestataireResponsable]

    def get(self, request):
        aujourdhui = timezone.localdate()
        debut_mois = aujourdhui.replace(day=1)
        comptes = User.objects.filter(prestataire_id=request.user.prestataire_id).prefetch_related('groups') \
            .order_by('nom', 'prenom')
        resultat = []
        for u in comptes:
            roles = {g.name for g in u.groups.all()}
            role = ROLE_PRESTATAIRE if ROLE_PRESTATAIRE in roles else ROLE_AGENT_COMPTOIR
            rs = Retrait.objects.filter(valide_par=u)
            resultat.append({
                'id': u.id, 'username': u.username, 'nom': u.nom, 'prenom': u.prenom,
                'nom_complet': nom_complet(u), 'role': role, 'role_libelle': LIBELLES_ROLES[role],
                'is_active': u.is_active, 'last_login': u.last_login.isoformat() if u.last_login else None,
                'retraits_aujourdhui': rs.filter(date_retrait__date=aujourdhui).count(),
                'retraits_mois': rs.filter(date_retrait__date__gte=debut_mois).count(),
            })
        return Response(resultat)


# ══════════════════════════════════════════════════════════════
# PROFIL PUBLIC (parcours de commande des employés)
# ══════════════════════════════════════════════════════════════

class ProfilPrestataireView(APIView):
    """
    GET   /prestataire/profil/   profil affiché aux employés (+ note et photos de secours)
    PATCH /prestataire/profil/   multipart ou JSON : nom_affiche, description_courte (120 car.),
                                 cuisine, tags, logo, photo_couverture (jpg/png/webp, 5 Mo),
                                 supprimer_logo, supprimer_photo_couverture
    Responsable du prestataire, pour SON prestataire seulement.
    """
    permission_classes = [IsPrestataireResponsable]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _reponse(self, prestataire):
        from .parcours_commande import images_plats, note_json, notes_prestataires
        from .serializers import PrestataireProfilSerializer
        parametres = ParametresSociete.charger()
        moyenne, nb = notes_prestataires().get(prestataire.id, (None, 0))
        plats = list(Plat.objects.filter(prestataire=prestataire, masque=False).order_by('nom')
                     .values_list('id', flat=True))
        images = images_plats(plats)
        photos = [images[p][0] for p in plats if images.get(p)][:3]
        return Response({**PrestataireProfilSerializer(prestataire).data,
                         **note_json(moyenne, nb, parametres.seuil_avis_note),
                         'seuil_avis_note': parametres.seuil_avis_note,
                         'photos_plats': photos})

    def get(self, request):
        return self._reponse(request.user.prestataire)

    def patch(self, request):
        from .serializers import PrestataireProfilSerializer
        prestataire = request.user.prestataire
        serializer = PrestataireProfilSerializer(prestataire, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(user_updated=request.user)
        prestataire.refresh_from_db()
        return self._reponse(prestataire)
