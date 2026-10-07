from collections import defaultdict
from rest_framework import serializers
from datetime import datetime, time, timedelta
from django.db.models import Max
from django.db import IntegrityError
from django.contrib.auth.models import Group
from .models import *
from django.db.models import Q
from django.utils import timezone
from django.core.exceptions import ValidationError as DjangoValidationError
import re


# ============================================================
# VALIDATION MOT DE PASSE PERSONNALISÉE
# ============================================================

def validate_password_custom(password):
    """
    Valide les exigences de complexité du mot de passe :
    - 8 caractères minimum
    - Au moins 1 majuscule
    - Au moins 1 chiffre
    - Au moins 1 caractère spécial
    Lève DjangoValidationError si une règle n'est pas respectée.
    """
    errors = []
    if len(password) < 8:
        errors.append("Le mot de passe doit contenir au moins 8 caractères.")
    if not re.search(r'[A-Z]', password):
        errors.append("Le mot de passe doit contenir au moins une majuscule.")
    if not re.search(r'[0-9]', password):
        errors.append("Le mot de passe doit contenir au moins un chiffre.")
    if not re.search(r'[!@#$%^&*()\[\]{}\-_=+\\|;:\'",.<>?/`~]', password):
        errors.append("Le mot de passe doit contenir au moins un caractère spécial.")
    if errors:
        raise DjangoValidationError(errors)


# ============================================================
# USERS & GROUPES
# ============================================================

class GroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = '__all__'


# ============================================================
# RÉFÉRENTIELS
# ============================================================

class AgenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Agence
        fields = '__all__'


class EtatSerializer(serializers.ModelSerializer):
    class Meta:
        model = Etat
        fields = '__all__'


class StatutSerializer(serializers.ModelSerializer):
    class Meta:
        model = Statut
        fields = '__all__'


class ServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = '__all__'


class TypeBesoinSerializer(serializers.ModelSerializer):
    class Meta:
        model = TypeBesoin
        fields = '__all__'


class PrioriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Priorite
        fields = '__all__'


class FonctionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Fonction
        fields = '__all__'


class PlatPrestataireSerializer(serializers.ModelSerializer):
    statut_libelle = serializers.ReadOnlyField(source='statut.libelle_statut')

    class Meta:
        model = PlatPrestataire
        fields = '__all__'


class AgencePrestataireSerializer(serializers.ModelSerializer):
    statut_libelle = serializers.ReadOnlyField(source='statut.libelle_statut')
    agence_libelle = serializers.ReadOnlyField(source='agence.nom_agence')

    class Meta:
        model = AgencePrestataire
        fields = '__all__'


class PrestataireSerializer(serializers.ModelSerializer):
    statut_libelle      = serializers.ReadOnlyField(source='statut.libelle_statut')
    plat_prestataires   = PlatPrestataireSerializer(
        source='platprestataire_set', many=True, read_only=True
    )
    agence_prestataires = AgencePrestataireSerializer(
        source='agenceprestataire_set', many=True, read_only=True
    )

    class Meta:
        model = Prestataire
        fields = '__all__'


class PlatCategoriesalarieSerializer(serializers.ModelSerializer):
    statut_libelle = serializers.ReadOnlyField(source='statut.libelle_statut')

    class Meta:
        model = PlatCategoriesalarie
        fields = '__all__'


class CategoriesalarieSerializer(serializers.ModelSerializer):
    plat_categoriesalaries = PlatCategoriesalarieSerializer(
        source='platcategoriesalarie_set', many=True, read_only=True
    )

    class Meta:
        model = Categoriesalarie
        fields = '__all__'


class PosteSerializer(serializers.ModelSerializer):
    fonction_libelle = serializers.ReadOnlyField(source='fonction.libelle')
    service_libelle  = serializers.ReadOnlyField(source='service.nom_service')

    class Meta:
        model  = Poste
        fields = '__all__'


# ============================================================
# USER & SOUS-MODÈLES
# ============================================================

class UserAllergieSerializer(serializers.ModelSerializer):
    class Meta:
        model  = UserAllergie
        fields = '__all__'


class UserServiceSerializer(serializers.ModelSerializer):
    service_id      = serializers.ReadOnlyField(source='service.id')
    service_libelle = serializers.ReadOnlyField(source='service.libelle_service')
    statut_id       = serializers.ReadOnlyField(source='statut.id')
    statut_libelle  = serializers.ReadOnlyField(source='statut.libelle_statut')
    user_id         = serializers.ReadOnlyField(source='user.id')
    user_username   = serializers.ReadOnlyField(source='user.username')
    user_nom        = serializers.ReadOnlyField(source='user.nom')
    user_prenom     = serializers.ReadOnlyField(source='user.prenom')
    user_email      = serializers.ReadOnlyField(source='user.email')

    class Meta:
        model  = UserService
        fields = '__all__'


class UserAgenceSerializer(serializers.ModelSerializer):
    agence_id      = serializers.ReadOnlyField(source='agence.id')
    agence_nom     = serializers.ReadOnlyField(source='agence.nom_agence')
    statut_id      = serializers.ReadOnlyField(source='statut.id')
    statut_libelle = serializers.ReadOnlyField(source='statut.libelle_statut')
    user_id        = serializers.ReadOnlyField(source='user.id')
    user_username  = serializers.ReadOnlyField(source='user.username')
    user_nom       = serializers.ReadOnlyField(source='user.nom')
    user_prenom    = serializers.ReadOnlyField(source='user.prenom')
    user_email     = serializers.ReadOnlyField(source='user.email')

    class Meta:
        model  = UserAgence
        fields = '__all__'


class UserPosteSerializer(serializers.ModelSerializer):
    statut_libelle = serializers.ReadOnlyField(source='statut.libelle_statut')
    poste_libelle  = serializers.ReadOnlyField(source='poste.libelle')

    class Meta:
        model  = UserPoste
        fields = '__all__'


class UserCategoriesalarieSerializer(serializers.ModelSerializer):
    statut_libelle           = serializers.ReadOnlyField(source='statut.libelle_statut')
    categoriesalarie_libelle = serializers.ReadOnlyField(source='categoriesalarie.libelle')

    class Meta:
        model  = UserCategoriesalarie
        fields = '__all__'


class UserSerializer(serializers.ModelSerializer):
    password  = serializers.CharField(write_only=True, required=False)
    password2 = serializers.CharField(write_only=True, required=False)
    statut_libelle = serializers.ReadOnlyField(source='statut.libelle_statut')

    # ✅ groups : tableau d'IDs
    groups = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Group.objects.all(),
        required=False
    )

    # ── Listes complètes (historique) — utiles pour le détail et la modification
    user_services          = UserServiceSerializer(source='userservice_set', many=True, read_only=True)
    user_agences           = UserAgenceSerializer(source='useragence_set', many=True, read_only=True)
    user_postes            = UserPosteSerializer(source='userposte_set', many=True, read_only=True)
    user_categoriesalaries = UserCategoriesalarieSerializer(source='usercategoriesalarie_set', many=True, read_only=True)
    user_allergies         = UserAllergieSerializer(source='userallergie_set', many=True, read_only=True)

    # ✅ Dernière ligne active de chaque relation — utiles pour la LISTE
    # Retourne directement l'objet le plus récent (date_debut max) ou null
    dernier_service          = serializers.SerializerMethodField()
    derniere_agence          = serializers.SerializerMethodField()
    dernier_poste            = serializers.SerializerMethodField()
    derniere_categoriesalarie = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = [
            'id', 'username', 'password', 'password2', 'email',
            'nom', 'prenom', 'contact', 'poste_telephone',
            'first_name', 'last_name',
            'statut', 'statut_libelle',
            'last_login', 'last_logout', 'is_active',
            'groups',
            # Listes complètes
            'user_services', 'user_agences', 'user_postes',
            'user_categoriesalaries', 'user_allergies',
            # ✅ Dernières lignes (pour affichage en liste)
            'dernier_service', 'derniere_agence',
            'dernier_poste', 'derniere_categoriesalarie',
        ]
        read_only_fields = ['last_login', 'last_logout']

    # ── Utilitaire interne ──────────────────────────────────────
    @staticmethod
    def _get_items(obj, related_name):
        """
        Récupère les items d'une relation inverse.
        Quand prefetch_related a été appelé sur le queryset parent,
        Django stocke les résultats dans obj.<related_name>.all()
        via le prefetch cache — pas de requête supplémentaire.
        Le list() dans get_queryset() garantit que le cache est peuplé.
        """
        return list(getattr(obj, related_name).all())

    @staticmethod
    def _derniere_ligne(items):
        """Retourne l'item avec la date_debut la plus récente."""
        if not items:
            return None
        return max(items, key=lambda x: x.date_debut or '')

    # ── SerializerMethodField — dernières lignes ────────────────

    def get_dernier_service(self, obj):
        ligne = self._derniere_ligne(self._get_items(obj, 'userservice_set'))
        if not ligne:
            return None
        return {
            'id':              ligne.id,
            'service':         ligne.service_id,
            'service_libelle': ligne.service.libelle_service if ligne.service else None,
            'date_debut':      str(ligne.date_debut) if ligne.date_debut else None,
            'statut':          ligne.statut_id,
            'statut_libelle':  ligne.statut.libelle_statut if ligne.statut else None,
        }

    def get_derniere_agence(self, obj):
        ligne = self._derniere_ligne(self._get_items(obj, 'useragence_set'))
        if not ligne:
            return None
        return {
            'id':             ligne.id,
            'agence':         ligne.agence_id,
            'agence_nom':     ligne.agence.nom_agence if ligne.agence else None,
            'date_debut':     str(ligne.date_debut) if ligne.date_debut else None,
            'statut':         ligne.statut_id,
            'statut_libelle': ligne.statut.libelle_statut if ligne.statut else None,
        }

    def get_dernier_poste(self, obj):
        ligne = self._derniere_ligne(self._get_items(obj, 'userposte_set'))
        if not ligne:
            return None
        return {
            'id':             ligne.id,
            'poste':          ligne.poste_id,
            'poste_libelle':  ligne.poste.libelle if ligne.poste else None,
            'date_debut':     str(ligne.date_debut) if ligne.date_debut else None,
            'statut':         ligne.statut_id,
            'statut_libelle': ligne.statut.libelle_statut if ligne.statut else None,
        }

    def get_derniere_categoriesalarie(self, obj):
        ligne = self._derniere_ligne(self._get_items(obj, 'usercategoriesalarie_set'))
        if not ligne:
            return None
        return {
            'id':                       ligne.id,
            'categoriesalarie':         ligne.categoriesalarie_id,
            'categoriesalarie_libelle': ligne.categoriesalarie.libelle if ligne.categoriesalarie else None,
            'date_debut':               str(ligne.date_debut) if ligne.date_debut else None,
            'statut':                   ligne.statut_id,
            'statut_libelle':           ligne.statut.libelle_statut if ligne.statut else None,
        }

    def validate(self, attrs):
        password  = attrs.get('password')
        password2 = attrs.get('password2')
        if password or password2:
            if password != password2:
                raise serializers.ValidationError(
                    {"password": "Les mots de passe ne correspondent pas."}
                )
            # ✅ Validation complexité mot de passe
            try:
                validate_password_custom(password)
            except DjangoValidationError as e:
                raise serializers.ValidationError({"password": e.messages})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2', None)
        password = validated_data.pop('password', None)
        groups   = validated_data.pop('groups', [])
        user = User.objects.create(**validated_data)
        if password:
            user.set_password(password)
            user.save()
        # ✅ Assigner les groupes via la relation ManyToMany
        if groups:
            user.groups.set(groups)
        return user

    def update(self, instance, validated_data):
        validated_data.pop('password2', None)
        password = validated_data.pop('password', None)
        groups   = validated_data.pop('groups', None)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save()
        # ✅ Mettre à jour les groupes si fournis
        if groups is not None:
            user.groups.set(groups)
        return user


# ============================================================
# BESOINS
# ============================================================

class BesoinServiceSerializer(serializers.ModelSerializer):
    service_id       = serializers.ReadOnlyField(source='service.id')
    service_libelle  = serializers.ReadOnlyField(source='service.libelle_service')
    besoin_id        = serializers.ReadOnlyField(source='besoin.id')
    besoin_reference = serializers.ReadOnlyField(source='besoin.reference')
    besoin_titre     = serializers.ReadOnlyField(source='besoin.titre')

    class Meta:
        model = BesoinService
        fields = '__all__'


class BesoinDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = BesoinDocument
        fields = '__all__'


class BesoinDocumentUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model  = BesoinDocument
        fields = ['document']


class BesoinSerializer(serializers.ModelSerializer):
    typebesoin_id      = serializers.ReadOnlyField(source='typebesoin.id')
    typebesoin_libelle = serializers.ReadOnlyField(source='typebesoin.libelle')
    etat_id            = serializers.ReadOnlyField(source='etat.id')
    etat_libelle       = serializers.ReadOnlyField(source='etat.libelle_etat')
    priorite_id        = serializers.ReadOnlyField(source='priorite.id')
    priorite_libelle   = serializers.ReadOnlyField(source='priorite.libelle')
    user_id            = serializers.ReadOnlyField(source='user.id')
    user_username      = serializers.ReadOnlyField(source='user.username')
    user_nom           = serializers.ReadOnlyField(source='user.nom')
    user_prenom        = serializers.ReadOnlyField(source='user.prenom')
    user_email         = serializers.ReadOnlyField(source='user.email')

    services  = BesoinServiceSerializer(source='besoinservice_set', many=True, read_only=True)
    documents = BesoinDocumentSerializer(many=True, read_only=True)

    class Meta:
        model = Besoin
        fields = '__all__'


class BesoinWithDocumentsSerializer(serializers.ModelSerializer):
    """
    Utilisé par BesoinCreateView (POST /api/besoins/creer/).
    Reçoit un FormData avec les champs du besoin + documents[].
    La référence UBS-26-000001 est générée automatiquement par Besoin.save().
    """
    class Meta:
        model  = Besoin
        fields = [
            'titre', 'description', 'commentaire',
            'typebesoin', 'date_debut', 'date_fin',
            'etat', 'priorite', 'user'
        ]

    def create(self, validated_data):
        # ✅ La référence est générée par Besoin.save() : UBS-{annee}-{pk:06d}
        besoin = Besoin.objects.create(**validated_data)

        # Attacher les documents envoyés sous la clé documents[]
        files = self.context['request'].FILES.getlist('documents[]')
        for file in files:
            BesoinDocument.objects.create(besoin=besoin, document=file)

        return besoin

# ============================================================
# CANTINE
# ============================================================

class TypePlatSerializer(serializers.ModelSerializer):
    class Meta:
        model = TypePlat
        fields = '__all__'


class TypeEquipeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TypeEquipe
        fields = '__all__'


class PlatImageSerializer(serializers.ModelSerializer):
    plat_nom = serializers.ReadOnlyField(source='plat.nom')
    url = serializers.SerializerMethodField()

    class Meta:
        model = PlatImage
        fields = ['id', 'plat', 'plat_nom', 'image', 'url', 'is_principale']

    def get_url(self, obj):
        if obj.image:
            return obj.image.url
        return None


class PlatSerializer(serializers.ModelSerializer):
    type_plat_id      = serializers.ReadOnlyField(source='type_plat.id')
    type_plat_libelle = serializers.ReadOnlyField(source='type_plat.libelle')
    agence_id         = serializers.ReadOnlyField(source='agence.id')
    agence_nom        = serializers.ReadOnlyField(source='agence.nom_agence')
    images = PlatImageSerializer(many=True, read_only=True)

    class Meta:
        model = Plat
        fields = '__all__'


class PlatImageUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatImage
        fields = ['image', 'is_principale']


class PlatUploadSerializer(serializers.ModelSerializer):
    images = PlatImageUploadSerializer(many=True, write_only=True)

    class Meta:
        model = Plat
        fields = ['nom', 'description', 'type_plat', 'agence', 'images']

    def create(self, validated_data):
        images_data = validated_data.pop('images', [])
        request = self.context.get('request')
        plat = Plat.objects.create(
            user_created=request.user,
            user_updated=request.user,
            **validated_data
        )
        for img_data in images_data:
            PlatImage.objects.create(plat=plat, **img_data)
        return plat


class PlatCreateWithImagesSerializer(serializers.ModelSerializer):
    images = serializers.ListField(
        child=serializers.FileField(), write_only=True, required=False
    )

    class Meta:
        model = Plat
        fields = ['id', 'nom', 'description', 'type_plat', 'agence', 'images']

    def create(self, validated_data):
        images_data = validated_data.pop('images', [])
        request = self.context.get('request')
        plat = Plat.objects.create(
            user_created=request.user,
            user_updated=request.user,
            **validated_data
        )
        for i, image in enumerate(images_data):
            PlatImage.objects.create(plat=plat, image=image, is_principale=(i == 0))
        return plat


class MenuPlatSerializer(serializers.ModelSerializer):
    """
    Lecture  : retourne l'objet Plat complet avec ses images.
    Écriture : accepte { menu: <id>, plat_id: <id> }
    """
    plat = PlatSerializer(read_only=True)
    plat_id = serializers.PrimaryKeyRelatedField(
        queryset=Plat.objects.all(),
        source='plat',
        write_only=True
    )

    class Meta:
        model = MenuPlat
        fields = '__all__'


class MenuSerializer(serializers.ModelSerializer):
    agence_id          = serializers.ReadOnlyField(source='agence.id')
    agence_nom         = serializers.ReadOnlyField(source='agence.nom_agence')
    typeequipe_id      = serializers.ReadOnlyField(source='typeequipe.id')
    typeequipe_libelle = serializers.ReadOnlyField(source='typeequipe.libelle')
    menu_plats         = MenuPlatSerializer(many=True, read_only=True)

    class Meta:
        model = Menu
        fields = '__all__'


# ── Utilitaire partagé ────────────────────────────────────────────────────────
def _get_deadline(date_menu):
    """Retourne le datetime limite d'annulation/commande (J-2 à minuit)."""
    deadline = datetime.combine(date_menu, time.min) - timedelta(hours=48)
    return timezone.make_aware(deadline)


# ─────────────────────────────────────────────────────────────────────────────
# COMMANDE
# ─────────────────────────────────────────────────────────────────────────────

class CommandeSerializer(serializers.ModelSerializer):
    plat_detail = PlatSerializer(source='plat', read_only=True)
    menu_detail = MenuSerializer(source='menu', read_only=True)
    user_nom    = serializers.SerializerMethodField()
    user_agence = serializers.SerializerMethodField()

    menu_id = serializers.PrimaryKeyRelatedField(
        queryset=Menu.objects.all(), source='menu', write_only=True
    )
    plat_id = serializers.PrimaryKeyRelatedField(
        queryset=Plat.objects.all(), source='plat', write_only=True
    )

    class Meta:
        model = Commande
        fields = [
            'id', 'statut', 'date_commande', 'date_annulation',
            'plat_detail', 'menu_detail', 'user_nom', 'user_agence',
            'menu_id', 'plat_id',
        ]
        read_only_fields = ['date_commande', 'date_annulation', 'statut']

    def get_user_nom(self, obj):
        return f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.username

    def get_user_agence(self, obj):
        try:
            return obj.user.profile.agence.nom_agence
        except Exception:
            return None

    def validate(self, attrs):
        menu = attrs.get('menu') or (self.instance.menu if self.instance else None)
        plat = attrs.get('plat') or (self.instance.plat if self.instance else None)

        if menu and plat:
            plat_ids = menu.menu_plats.values_list('plat_id', flat=True)
            if plat.id not in plat_ids:
                raise serializers.ValidationError(
                    "Ce plat n'appartient pas au menu sélectionné."
                )

        if menu:
            request = self.context.get('request')
            user = request.user if request else None

            if user:
                commande_existante = Commande.objects.filter(
                    user=user,
                    menu__date_menu=menu.date_menu,
                    statut='en_attente',
                )
                if self.instance:
                    commande_existante = commande_existante.exclude(id=self.instance.id)

                if commande_existante.exists():
                    raise serializers.ValidationError(
                        f"Vous avez déjà une commande pour le {menu.date_menu}. "
                        "Une seule commande est autorisée par jour."
                    )

        return attrs


class CommandeAnnulationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Commande
        fields = ['id', 'statut', 'date_annulation']
        read_only_fields = ['statut', 'date_annulation']

    def validate(self, attrs):
        commande = self.instance
        if commande.statut != 'en_attente':
            raise serializers.ValidationError(
                "Seule une commande en attente peut être annulée."
            )
        if timezone.now() > _get_deadline(commande.menu.date_menu):
            raise serializers.ValidationError(
                "Impossible d'annuler : le délai de 48h avant le menu est dépassé."
            )
        return attrs

    def update(self, instance, validated_data):
        instance.statut          = 'annulee'
        instance.date_annulation = timezone.now()
        instance.save()
        return instance


# ─────────────────────────────────────────────────────────────────────────────
# RETRAIT
# ─────────────────────────────────────────────────────────────────────────────

class RetraitSerializer(serializers.ModelSerializer):
    user_nom    = serializers.SerializerMethodField(read_only=True)
    menu_detail = MenuSerializer(source='menu', read_only=True)

    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='user', write_only=True
    )
    menu_id = serializers.PrimaryKeyRelatedField(
        queryset=Menu.objects.all(), source='menu', write_only=True
    )

    class Meta:
        model = Retrait
        fields = [
            'id', 'date_retrait', 'badge_matricule',
            'user_nom', 'menu_detail',
            'user_id', 'menu_id',
        ]
        read_only_fields = ['date_retrait']

    def get_user_nom(self, obj):
        return f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.username

    def validate(self, attrs):
        user = attrs.get('user')
        menu = attrs.get('menu')
        if Retrait.objects.filter(user=user, menu=menu).exists():
            raise serializers.ValidationError(
                "Un retrait a déjà été enregistré pour cet agent et ce menu."
            )
        if not Commande.objects.filter(user=user, menu=menu, statut='en_attente').exists():
            raise serializers.ValidationError(
                "Aucune commande en attente trouvée pour cet agent et ce menu."
            )
        return attrs

    def create(self, validated_data):
        retrait = super().create(validated_data)
        Commande.objects.filter(
            user=retrait.user, menu=retrait.menu, statut='en_attente'
        ).update(statut='retiree')
        return retrait


# ============================================================
# GESTION VÉHICULE
# ============================================================

class TypeVehiculeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TypeVehicule
        fields = '__all__'


class VehiculeSerializer(serializers.ModelSerializer):
    type_vehicule_id      = serializers.ReadOnlyField(source='type_vehicule.id')
    type_vehicule_libelle = serializers.ReadOnlyField(source='type_vehicule.libelle')
    agence_id             = serializers.ReadOnlyField(source='agence.id')
    agence_nom            = serializers.ReadOnlyField(source='agence.nom_agence')
    statut_id             = serializers.ReadOnlyField(source='statut.id')
    statut_libelle        = serializers.ReadOnlyField(source='statut.libelle_statut')

    class Meta:
        model = Vehicule
        fields = '__all__'


class EntretienVehiculeSerializer(serializers.ModelSerializer):
    vehicule_id               = serializers.ReadOnlyField(source='vehicule.id')
    vehicule_immatriculation  = serializers.ReadOnlyField(source='vehicule.immatriculation')
    vehicule_description      = serializers.ReadOnlyField(source='vehicule.description')
    vehicule_date_circulation = serializers.ReadOnlyField(source='vehicule.date_circulation')

    class Meta:
        model = EntretienVehicule
        fields = '__all__'


def get_entretien_par_agence_avec_groupement(annee, agence_id=None, immatriculation=None):
    queryset = EntretienVehicule.objects.filter(
        date_entretien_vehicule__year=annee
    ).select_related('vehicule', 'vehicule__agence')

    if agence_id is not None:
        queryset = queryset.filter(vehicule__agence__id=agence_id)
    if immatriculation:
        queryset = queryset.filter(vehicule__immatriculation__iexact=immatriculation)

    resultats         = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    total_global_mois = defaultdict(float)

    for ev in queryset:
        try:
            mois = int(ev.periode.split("-")[1])
        except Exception:
            mois = ev.date_entretien_vehicule.month

        agence  = ev.vehicule.agence.nom_agence
        immat   = ev.vehicule.immatriculation
        montant = float(ev.debit)

        resultats[agence][immat][mois] += montant
        total_global_mois[mois]        += montant

    data         = []
    total_global = 0.0

    for agence, vehicules in resultats.items():
        vehicule_list     = []
        total_mois_agence = defaultdict(float)

        for immat, mois_dict in vehicules.items():
            total     = sum(mois_dict.values())
            mois_data = {m: round(mois_dict.get(m, 0), 2) for m in range(1, 13)}
            for m, v in mois_data.items():
                total_mois_agence[m] += v
            vehicule_list.append({"immatriculation": immat, "mois": mois_data, "total": round(total, 2)})

        total_agence  = sum(total_mois_agence.values())
        total_global += total_agence
        data.append({
            "agence":              agence,
            "vehicules":           vehicule_list,
            "total_agence_mois":   {m: round(total_mois_agence.get(m, 0), 2) for m in range(1, 13)},
            "total_agence_global": round(total_agence, 2)
        })

    return {
        "donnees":           data,
        "total_global_mois": {m: round(total_global_mois.get(m, 0), 2) for m in range(1, 13)},
        "total_global":      round(total_global, 2)
    }


# ============================================================
# RESSOURCES HUMAINES
# ============================================================

class SimulationHistoriqueSerializer(serializers.ModelSerializer):
    class Meta:
        model = SimulationHistorique
        fields = '__all__'


class SimulationHistorique2Serializer(serializers.ModelSerializer):
    class Meta:
        model = SimulationHistorique2
        fields = '__all__'


class SimulationSalaireSerializer(serializers.ModelSerializer):
    historique      = serializers.SerializerMethodField()
    total_matricule = serializers.SerializerMethodField()

    class Meta:
        model = SimulationSalaire
        fields = [
            'id', 'matricule', 'categorie', 'date_naissance',
            'salaire_base', 'sursalaire', 'salaire_brut_2025',
            'created_at', 'historique', 'total_matricule',
        ]

    def get_historique(self, obj):
        request       = self.context.get('request')
        historique_qs = obj.historique.all()
        filters       = Q()
        if request is not None:
            annee_debut = request.query_params.get('annee_debut')
            annee_fin   = request.query_params.get('annee_fin')
            salaire_min = request.query_params.get('salaire_min')
            salaire_max = request.query_params.get('salaire_max')
            if annee_debut: filters &= Q(annee__gte=annee_debut)
            if annee_fin:   filters &= Q(annee__lte=annee_fin)
            if salaire_min: filters &= Q(salaire__gte=salaire_min)
            if salaire_max: filters &= Q(salaire__lte=salaire_max)
        if filters:
            historique_qs = historique_qs.filter(filters)
        self._filtered_historique = historique_qs
        return SimulationHistoriqueSerializer(historique_qs, many=True).data

    def get_total_matricule(self, obj):
        historique_qs = getattr(self, '_filtered_historique', obj.historique.all())
        return {
            "salaire":      sum(float(h.salaire)      for h in historique_qs),
            "augmentation": sum(float(h.augmentation) for h in historique_qs),
            "cotisation":   sum(float(h.cotisation)   for h in historique_qs),
        }


class SimulationSalaire2Serializer(serializers.ModelSerializer):
    historique2     = serializers.SerializerMethodField()
    total_matricule = serializers.SerializerMethodField()

    class Meta:
        model = SimulationSalaire
        fields = [
            'id', 'matricule', 'categorie', 'date_naissance',
            'salaire_base', 'sursalaire', 'salaire_brut_2025',
            'created_at', 'historique2', 'total_matricule',
        ]

    def get_historique2(self, obj):
        request       = self.context.get('request')
        historique_qs = obj.historique2.all()
        filters       = Q()
        if request is not None:
            annee_debut = request.query_params.get('annee_debut')
            annee_fin   = request.query_params.get('annee_fin')
            salaire_min = request.query_params.get('salaire_min')
            salaire_max = request.query_params.get('salaire_max')
            if annee_debut: filters &= Q(annee__gte=annee_debut)
            if annee_fin:   filters &= Q(annee__lte=annee_fin)
            if salaire_min: filters &= Q(salaire__gte=salaire_min)
            if salaire_max: filters &= Q(salaire__lte=salaire_max)
        if filters:
            historique_qs = historique_qs.filter(filters)
        self._filtered_historique2 = historique_qs
        return SimulationHistorique2Serializer(historique_qs, many=True).data

    def get_total_matricule(self, obj):
        historique_qs = getattr(self, '_filtered_historique2', obj.historique2.all())
        return {
            "salaire":      sum(float(h.salaire)      for h in historique_qs),
            "augmentation": sum(float(h.augmentation) for h in historique_qs),
            "cotisation":   sum(float(h.cotisation)   for h in historique_qs),
        }


# ============================================================
# PLAN COMPTABLE
# ============================================================

class CategorieComptableSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategorieComptable
        fields = '__all__'


class ClasseComptableSerializer(serializers.ModelSerializer):
    categorie_id      = serializers.ReadOnlyField(source='categoriecomptable.id')
    categorie_libelle = serializers.ReadOnlyField(source='categoriecomptable.libelle')

    class Meta:
        model = ClasseComptable
        fields = '__all__'


class PosteReportingSerializer(serializers.ModelSerializer):
    categorie_id      = serializers.ReadOnlyField(source='categoriecomptable.id')
    categorie_libelle = serializers.ReadOnlyField(source='categoriecomptable.libelle')

    class Meta:
        model = PosteReporting
        fields = '__all__'


class CompteComptableSerializer(serializers.ModelSerializer):
    classe_id      = serializers.ReadOnlyField(source='classecomptable.id')
    classe_numero  = serializers.ReadOnlyField(source='classecomptable.numeroclasse')
    classe_libelle = serializers.ReadOnlyField(source='classecomptable.libelle')

    poste_id      = serializers.SerializerMethodField()
    poste_code    = serializers.SerializerMethodField()
    poste_libelle = serializers.SerializerMethodField()

    class Meta:
        model = CompteComptable
        fields = '__all__'

    def get_poste_id(self, obj):
        return obj.postereporting.id if obj.postereporting else None

    def get_poste_code(self, obj):
        return obj.postereporting.codepr if obj.postereporting else None

    def get_poste_libelle(self, obj):
        return obj.postereporting.libelle if obj.postereporting else None
