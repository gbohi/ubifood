# ============================================================
#  FICHIER : commande_backend.py
#  À intégrer dans serializers.py ET views.py
#  Séparé par des marqueurs clairs ci-dessous
# ============================================================


# ════════════════════════════════════════════════════════════
#  PARTIE 1 — serializers.py  (ajouter ces classes)
# ════════════════════════════════════════════════════════════

# --- Imports à ajouter en haut de serializers.py ------------
# from datetime import datetime, time, timedelta
# from django.utils import timezone
# from .models import Commande, Retrait

class CommandeSerializer(serializers.ModelSerializer):
    """
    Serializer principal pour Commande.
    Lecture  : retourne l'objet plat et menu complets + infos user.
    Écriture : accepte menu_id, plat_id, user_id (write_only).
    """
    # ── Lecture ───────────────────────────────────────────
    plat_detail  = PlatSerializer(source='plat',  read_only=True)
    menu_detail  = MenuSerializer(source='menu',  read_only=True)
    user_nom     = serializers.SerializerMethodField()
    user_agence  = serializers.SerializerMethodField()

    # ── Écriture ──────────────────────────────────────────
    menu_id = serializers.PrimaryKeyRelatedField(
        queryset=Menu.objects.all(), source='menu', write_only=True
    )
    plat_id = serializers.PrimaryKeyRelatedField(
        queryset=Plat.objects.all(), source='plat', write_only=True
    )
    # Le user est injecté dans perform_create (request.user) — pas envoyé par le client
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='user', write_only=True, required=False
    )

    class Meta:
        model   = Commande
        fields  = [
            'id', 'statut', 'date_commande', 'date_annulation',
            # lecture
            'plat_detail', 'menu_detail', 'user_nom', 'user_agence',
            # écriture
            'menu_id', 'plat_id', 'user_id',
        ]
        read_only_fields = ['date_commande', 'date_annulation', 'statut']

    def get_user_nom(self, obj):
        return f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.username

    def get_user_agence(self, obj):
        # Suppose que le profil User a une FK vers Agence
        # Adaptez selon votre modèle User/Profil
        try:
            return obj.user.profile.agence.nom_agence
        except Exception:
            return None

    def validate(self, attrs):
        """
        Vérifie que le plat appartient bien aux plats du menu
        et que le délai de 48h n'est pas dépassé pour la création.
        """
        menu = attrs.get('menu') or (self.instance.menu if self.instance else None)
        plat = attrs.get('plat') or (self.instance.plat if self.instance else None)

        if menu and plat:
            plat_ids = menu.menu_plats.values_list('plat_id', flat=True)
            if plat.id not in plat_ids:
                raise serializers.ValidationError(
                    "Ce plat n'appartient pas au menu sélectionné."
                )

        return attrs


class CommandeAnnulationSerializer(serializers.ModelSerializer):
    """
    Serializer dédié à l'annulation d'une commande (PATCH /commandes/{id}/annuler/).
    Vérifie le délai de 48h côté serveur.
    """
    class Meta:
        model  = Commande
        fields = ['id', 'statut', 'date_annulation']
        read_only_fields = ['statut', 'date_annulation']

    def validate(self, attrs):
        commande = self.instance
        if commande.statut != 'en_attente':
            raise serializers.ValidationError(
                "Seule une commande en attente peut être annulée."
            )
        # Règle 48h
        deadline = _get_deadline(commande.menu.date_menu)
        if timezone.now() > deadline:
            raise serializers.ValidationError(
                "Impossible d'annuler : le délai de 48h avant le menu est dépassé."
            )
        return attrs

    def update(self, instance, validated_data):
        instance.statut          = 'annulee'
        instance.date_annulation = timezone.now()
        instance.save()
        return instance


class RetraitSerializer(serializers.ModelSerializer):
    """
    Enregistre le retrait physique d'un agent.
    À la création, passe toutes les commandes en_attente de l'agent
    pour ce menu au statut 'retiree'.
    """
    user_nom    = serializers.SerializerMethodField(read_only=True)
    menu_detail = MenuSerializer(source='menu', read_only=True)

    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='user', write_only=True
    )
    menu_id = serializers.PrimaryKeyRelatedField(
        queryset=Menu.objects.all(), source='menu', write_only=True
    )

    class Meta:
        model  = Retrait
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
        # Vérifier qu'il n'y a pas déjà un retrait pour ce couple user/menu
        if Retrait.objects.filter(user=user, menu=menu).exists():
            raise serializers.ValidationError(
                "Un retrait a déjà été enregistré pour cet agent et ce menu."
            )
        # Vérifier qu'il existe au moins une commande en_attente
        if not Commande.objects.filter(user=user, menu=menu, statut='en_attente').exists():
            raise serializers.ValidationError(
                "Aucune commande en attente trouvée pour cet agent et ce menu."
            )
        return attrs

    def create(self, validated_data):
        retrait = super().create(validated_data)
        # Passer toutes les commandes en_attente → retiree
        Commande.objects.filter(
            user=retrait.user, menu=retrait.menu, statut='en_attente'
        ).update(statut='retiree')
        return retrait


# ── Utilitaire partagé ────────────────────────────────────
def _get_deadline(date_menu):
    """Retourne le datetime limite d'annulation (J-2 à minuit)."""
    from datetime import datetime, time, timedelta
    deadline = datetime.combine(date_menu, time.min) - timedelta(hours=48)
    return timezone.make_aware(deadline)


# ════════════════════════════════════════════════════════════
#  PARTIE 2 — views.py  (ajouter ces classes)
# ════════════════════════════════════════════════════════════

# --- Imports à ajouter en haut de views.py ------------------
# from rest_framework.decorators import action
# from rest_framework.response import Response
# from rest_framework import status
# from django.utils import timezone
# from .serializers import CommandeSerializer, CommandeAnnulationSerializer, RetraitSerializer
# from .models import Commande, Retrait

class CommandeViewSet(BaseViewSet):
    """
    CRUD commandes + action custom /annuler/.

    Filtres disponibles :
      GET /commandes/?menu=<id>
      GET /commandes/?user=<id>
      GET /commandes/?statut=en_attente|annulee|retiree
      GET /commandes/?menu__agence=<id>          (super-admin)
      GET /commandes/?menu__date_menu=YYYY-MM-DD
    """
    serializer_class = CommandeSerializer
    filterset_fields = {
        'menu':              ['exact'],
        'user':              ['exact'],
        'statut':            ['exact'],
        'menu__agence':      ['exact'],
        'menu__date_menu':   ['exact', 'gte', 'lte'],
    }

    def get_queryset(self):
        return (
            Commande.objects
            .select_related('user', 'menu__agence', 'menu__typeequipe', 'plat')
            .prefetch_related('plat__images')
            .order_by('-date_commande')
        )

    def perform_create(self, serializer):
        """
        Si user_id n'est pas fourni, on utilise l'utilisateur connecté.
        Un gestionnaire peut passer user_id explicitement.
        """
        user = serializer.validated_data.get('user') or self.request.user
        # Vérification délai 48h à la création aussi
        menu = serializer.validated_data['menu']
        from .serializers import _get_deadline
        if timezone.now() > _get_deadline(menu.date_menu):
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                "Impossible de commander : le délai de 48h avant le menu est dépassé."
            )
        serializer.save(user=user)

    @action(detail=True, methods=['patch'], url_path='annuler')
    def annuler(self, request, pk=None):
        """
        PATCH /api/api/commandes/{id}/annuler/
        Annule la commande si le délai de 48h n'est pas dépassé.
        """
        commande = self.get_object()
        serializer = CommandeAnnulationSerializer(
            commande, data={}, partial=True, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            CommandeSerializer(commande, context={'request': request}).data,
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['get'], url_path='mes-commandes')
    def mes_commandes(self, request):
        """
        GET /api/api/commandes/mes-commandes/
        Retourne uniquement les commandes de l'utilisateur connecté.
        Accepte les filtres ?statut= et ?menu__date_menu__gte=
        """
        qs = self.get_queryset().filter(user=request.user)
        qs = self.filter_queryset(qs)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='par-menu')
    def par_menu(self, request):
        """
        GET /api/api/commandes/par-menu/?menu=<id>
        Vue gestionnaire : toutes les commandes d'un menu groupées par user.
        """
        menu_id = request.query_params.get('menu')
        if not menu_id:
            return Response({'detail': 'Paramètre menu requis.'}, status=400)

        commandes = self.get_queryset().filter(menu_id=menu_id)
        # Grouper par user
        grouped = {}
        for cmd in commandes:
            uid = cmd.user_id
            if uid not in grouped:
                grouped[uid] = {
                    'user_id':    uid,
                    'user_nom':   f"{cmd.user.first_name} {cmd.user.last_name}".strip() or cmd.user.username,
                    'commandes':  [],
                    'a_retire':   Retrait.objects.filter(user_id=uid, menu_id=menu_id).exists(),
                }
            grouped[uid]['commandes'].append(
                CommandeSerializer(cmd, context={'request': request}).data
            )
        return Response(list(grouped.values()))


class RetraitViewSet(BaseViewSet):
    """
    CRUD retraits.
    POST /api/api/retraits/ → enregistre le retrait et passe les commandes à 'retiree'

    Filtres :
      GET /retraits/?menu=<id>
      GET /retraits/?user=<id>
    """
    serializer_class = RetraitSerializer
    filterset_fields = ['menu', 'user']

    def get_queryset(self):
        return (
            Retrait.objects
            .select_related('user', 'menu__agence', 'menu__typeequipe')
            .order_by('-date_retrait')
        )


# ════════════════════════════════════════════════════════════
#  PARTIE 3 — urls.py  (ajouter au router)
# ════════════════════════════════════════════════════════════

# Dans api/urls.py, ajouter :
# router.register(r'commandes', CommandeViewSet, basename='commande')
# router.register(r'retraits',  RetraitViewSet,  basename='retrait')
