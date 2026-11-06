from django.contrib.auth.models import AbstractUser
from django.core.validators import FileExtensionValidator, MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone
from datetime import time

class BaseModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    user_created = models.ForeignKey(
        'User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='%(class)s_created'
    )
    user_updated = models.ForeignKey(
        'User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='%(class)s_updated'
    )

    class Meta:
        abstract = True

class User(AbstractUser):
    nom = models.CharField(max_length=255)
    prenom = models.CharField(max_length=255)
    # Facultatifs (le formulaire web les présente comme tels ; avant, la
    # création échouait s'ils étaient vides). contact sert à l'envoi du
    # code SMS « mot de passe oublié ».
    contact = models.CharField(max_length=255, blank=True)
    poste_telephone = models.CharField(max_length=255, blank=True)
    statut = models.ForeignKey('Statut', on_delete=models.CASCADE)
    last_logout = models.DateTimeField(null=True, blank=True)
    # Photo de profil (modifiable par l'utilisateur lui-même, web et mobile)
    photo = models.ImageField(upload_to='photos_profil/', null=True, blank=True,
                              validators=[FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp'])])
    # Comptes de l'espace prestataire (rôles « prestataire » et « agent_comptoir ») :
    # le prestataire auquel le compte appartient (vide pour les comptes UbiPharm).
    prestataire = models.ForeignKey('Prestataire', on_delete=models.PROTECT, null=True, blank=True,
                                    related_name='comptes')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    user_created = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        related_name='utilisateurs_crees'
    )
    user_updated = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        related_name='utilisateurs_modifies'
    )

    class Meta:
        db_table = 'users'

class Agence(BaseModel):
    nom_agence = models.CharField(max_length=255)
    # Horaires du service de la cantine de l'agence (vides : horaires par
    # défaut de Paramètres → Société). Servent au contrôle des retraits.
    heure_debut_service = models.TimeField(null=True, blank=True)
    heure_fin_service   = models.TimeField(null=True, blank=True)

class Etat(BaseModel):
    libelle_etat = models.CharField(max_length=255)

class Statut(BaseModel):
    libelle_statut = models.CharField(max_length=255)

class Service(BaseModel):
    libelle_service = models.CharField(max_length=255)

class TypeBesoin(BaseModel):
    libelle = models.CharField(max_length=255)

class Priorite(BaseModel):
    libelle = models.CharField(max_length=255)

class UserService(BaseModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    service = models.ForeignKey(Service, on_delete=models.CASCADE)
    date_debut = models.DateTimeField()
    date_fin = models.DateTimeField(null=True, blank=True)
    statut = models.ForeignKey(Statut, on_delete=models.CASCADE)

class UserAgence(BaseModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    agence = models.ForeignKey(Agence, on_delete=models.CASCADE)
    date_debut = models.DateTimeField()
    date_fin = models.DateTimeField(null=True, blank=True)
    statut = models.ForeignKey(Statut, on_delete=models.CASCADE)


class Besoin(BaseModel):
    reference = models.CharField(max_length=255, unique=True, blank=True)
    titre = models.CharField(max_length=255)
    description = models.TextField()
    commentaire = models.TextField(null=True, blank=True)
    typebesoin = models.ForeignKey(TypeBesoin, on_delete=models.CASCADE)
    date_debut = models.DateTimeField()
    date_fin = models.DateTimeField()
    etat = models.ForeignKey(Etat, on_delete=models.CASCADE)
    priorite = models.ForeignKey(Priorite, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)

    def save(self, *args, **kwargs):
        if not self.pk:
            # ── 1ère sauvegarde : on laisse reference vide et on sauvegarde
            # pour obtenir l'ID auto-incrémenté de Django
            super().save(*args, **kwargs)

            # ── On construit la référence à partir de l'ID obtenu
            annee = timezone.now().strftime('%y')   # ex: '26'
            # ✅ UBS-26-000001, UBS-26-000002 ... basé sur l'ID réel
            self.reference = f"UBS-{annee}-{self.pk:06d}"

            # ── 2ème sauvegarde pour persister la référence
            # update_fields évite de re-déclencher toute la logique
            super().save(update_fields=['reference'])
        else:
            # Modification : ne pas recalculer la référence
            super().save(*args, **kwargs)

class BesoinService(BaseModel):
    besoin = models.ForeignKey(Besoin, on_delete=models.CASCADE)
    service = models.ForeignKey(Service, on_delete=models.CASCADE)
    date_creation = models.DateTimeField()

#class BesoinDocument(BaseModel):
#    besoin = models.ForeignKey(Besoin, on_delete=models.CASCADE)
#    lien_document = models.URLField()
#    date_creation = models.DateTimeField()

class BesoinDocument(BaseModel):
    besoin = models.ForeignKey(Besoin, on_delete=models.CASCADE, related_name="documents")
    document = models.FileField(upload_to='documents_besoins/', validators=[FileExtensionValidator(['pdf', 'docx', 'jpg', 'png','jpeg'])])
    date_creation = models.DateTimeField(auto_now_add=True)

class TypePlat(BaseModel):
    libelle = models.CharField(max_length=100)

class TypeEquipe(BaseModel):
    libelle = models.CharField(max_length=100)

class Plat(BaseModel):
    nom = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    type_plat = models.ForeignKey(TypePlat, on_delete=models.CASCADE)
    # Agence principale du plat (gestion UbiPharm). Les plats d'un prestataire
    # peuvent être proposés dans plusieurs agences : voir `agences`.
    agence = models.ForeignKey(Agence, on_delete=models.CASCADE)
    # Prestataire auteur du plat (vide : plat créé par UbiPharm)
    prestataire = models.ForeignKey('Prestataire', on_delete=models.PROTECT, null=True, blank=True,
                                    related_name='plats')
    # Agences où le plat est proposé (plats des prestataires ; contient l'agence principale)
    agences = models.ManyToManyField(Agence, blank=True, related_name='plats_proposes')
    # Mentions affichées aux employés (« Piment à part », « Arachide »…)
    mentions = models.JSONField(default=list, blank=True)
    # Masqué par un gestionnaire (photo non conforme…) : ne peut plus être mis au menu
    masque = models.BooleanField(default=False)
    motif_masquage = models.CharField(max_length=255, blank=True)

class PlatImage(BaseModel):
    plat = models.ForeignKey(Plat, on_delete=models.CASCADE, related_name="images")
    # Une photo de plat ne peut pas être un PDF (le mobile et le web l'affichent comme image)
    image = models.FileField(upload_to='images_plats/', validators=[FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp'])])
    is_principale = models.BooleanField(default=False)

class Menu(BaseModel):
    date_menu = models.DateField()
    agence = models.ForeignKey(Agence, on_delete=models.CASCADE)
    typeequipe = models.ForeignKey(TypeEquipe, on_delete=models.CASCADE)
    # Publication : un menu non publié (brouillon du prestataire) ou masqué
    # par un gestionnaire n'est ni visible ni commandable par les employés.
    publie = models.BooleanField(default=True)
    date_publication = models.DateTimeField(null=True, blank=True)
    masque = models.BooleanField(default=False)
    motif_masquage = models.CharField(max_length=255, blank=True)


class MenuHistorique(models.Model):
    """
    Historique d'un menu : création, modification, publication, masquage…
    par le prestataire ou par UbiPharm (visible des deux côtés). Les
    informations utiles sont recopiées : la ligne survit à la suppression du menu.
    """
    ACTION_CHOICES = [
        ('creation',     'Création'),
        ('modification', 'Modification'),
        ('publication',  'Publication'),
        ('masquage',     'Masquage'),
        ('affichage',    'Affichage'),
        ('suppression',  'Suppression'),
    ]
    menu       = models.ForeignKey(Menu, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='historique')
    date_menu  = models.DateField()
    agence     = models.ForeignKey(Agence, on_delete=models.CASCADE, related_name='+')
    action     = models.CharField(max_length=20, choices=ACTION_CHOICES)
    description = models.CharField(max_length=500, blank=True)
    motif      = models.CharField(max_length=255, blank=True)
    user       = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='+')
    # Auteur côté prestataire (sinon UbiPharm)
    par_prestataire = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'menu_historique'
        ordering = ['-created_at', '-id']

class MenuPlat(BaseModel):
    menu = models.ForeignKey(Menu, on_delete=models.CASCADE, related_name="menu_plats")
    plat = models.ForeignKey(Plat, on_delete=models.CASCADE)

class Commande(BaseModel):

    STATUT_CHOICES = [
        ('en_attente', 'En attente'),
        ('annulee',    'Annulée'),
        ('retiree',    'Retirée'),
    ]

    user          = models.ForeignKey(User, on_delete=models.CASCADE, related_name='commandes')
    menu          = models.ForeignKey(Menu, on_delete=models.CASCADE, related_name='commandes')
    plat          = models.ForeignKey(Plat, on_delete=models.CASCADE, related_name='commandes')
    date_commande = models.DateTimeField(default=timezone.now)
    statut        = models.CharField(max_length=20, choices=STATUT_CHOICES, default='en_attente')
    date_annulation = models.DateTimeField(null=True, blank=True)
    # Qui a annulé : l'agent lui-même ou un gestionnaire / administrateur
    annulee_par     = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                        related_name='commandes_annulees')
    # Annulation particulière : contestation de retrait acceptée pour erreur
    # au comptoir (repas facturé ni à l'employé, ni au prestataire)
    MOTIF_ANNULATION_CHOICES = [
        ('contestation', 'Contestation acceptée — erreur au comptoir'),
    ]
    motif_annulation = models.CharField(max_length=20, choices=MOTIF_ANNULATION_CHOICES, blank=True)

    class Meta:
        # Un agent ne peut commander le même plat qu'une seule fois par menu
        unique_together = ('user', 'menu', 'plat')
        ordering = ['-date_commande']

    def __str__(self):
        return f"{self.user} — {self.menu.date_menu} — {self.plat.nom} [{self.statut}]"


class Retrait(BaseModel):
    """
    Un retrait = un agent qui vient physiquement récupérer sa commande.
    Lié au menu + user (pas à une ligne plat) car on retire tout d'un coup.
    badge_matricule permet de valider l'identité à la distribution.
    """
    user           = models.ForeignKey(User, on_delete=models.CASCADE, related_name='retraits')
    menu           = models.ForeignKey(Menu, on_delete=models.CASCADE, related_name='retraits')
    date_retrait   = models.DateTimeField(default=timezone.now)
    badge_matricule = models.CharField(max_length=100)
    MODE_CHOICES = [('scan', 'Badge scanné'), ('saisie', 'Matricule saisi')]
    # Qui a validé le retrait au comptoir (agent du prestataire ou gestionnaire
    # en secours) et comment l'employé a été identifié (vide : non précisé)
    valide_par     = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                       related_name='retraits_valides')
    mode           = models.CharField(max_length=10, choices=MODE_CHOICES, blank=True)

    class Meta:
        # Un agent ne peut retirer qu'une seule fois par menu
        unique_together = ('user', 'menu')
        ordering = ['-date_retrait']

    def __str__(self):
        return f"Retrait {self.user} — {self.menu.date_menu}"

# suite cantine

class Fonction(BaseModel):
    libelle = models.CharField(max_length=100)

class Prestataire(BaseModel):
    libelle = models.CharField(max_length=100)
    date_debut = models.DateTimeField()
    date_fin = models.DateTimeField(null=True, blank=True)
    statut = models.ForeignKey(Statut, on_delete=models.CASCADE)
    # Coordonnées (affichées sur les factures PDF)
    contact_nom        = models.CharField('Personne à contacter', max_length=150, blank=True)
    adresse            = models.TextField(blank=True)
    ville              = models.CharField(max_length=100, blank=True)
    telephone          = models.CharField(max_length=100, blank=True)
    email              = models.EmailField(blank=True)
    identifiant_fiscal = models.CharField('N° compte contribuable / identifiant fiscal',
                                          max_length=100, blank=True)
    registre_commerce  = models.CharField('RCCM', max_length=100, blank=True)

class Categoriesalarie(BaseModel):
    libelle = models.CharField(max_length=100)

class Poste(BaseModel):
    libelle = models.CharField(max_length=100)
    service = models.ForeignKey(Service, on_delete=models.CASCADE)
    fonction = models.ForeignKey(Fonction, on_delete=models.CASCADE)

class UserPoste(BaseModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    poste = models.ForeignKey(Poste, on_delete=models.CASCADE)
    date_debut = models.DateTimeField()
    date_fin = models.DateTimeField(null=True, blank=True)
    statut = models.ForeignKey(Statut, on_delete=models.CASCADE)

class UserCategoriesalarie(BaseModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    categoriesalarie = models.ForeignKey(Categoriesalarie, on_delete=models.CASCADE)
    date_debut = models.DateTimeField()
    date_fin = models.DateTimeField(null=True, blank=True)
    statut = models.ForeignKey(Statut, on_delete=models.CASCADE)

class UserAllergie(BaseModel):
    libelle = models.TextField(blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE)

class PlatCategoriesalarie(BaseModel):
    categoriesalarie = models.ForeignKey(Categoriesalarie, on_delete=models.CASCADE)
    montant = models.DecimalField(max_digits=10, decimal_places=2)
    date_debut = models.DateTimeField()
    date_fin = models.DateTimeField(null=True, blank=True)
    statut = models.ForeignKey(Statut, on_delete=models.CASCADE)

class PlatPrestataire(BaseModel):
    prestataire = models.ForeignKey(Prestataire, on_delete=models.CASCADE)
    montant = models.DecimalField(max_digits=10, decimal_places=2)
    date_debut = models.DateTimeField()
    date_fin = models.DateTimeField(null=True, blank=True)
    statut = models.ForeignKey(Statut, on_delete=models.CASCADE)

class AgencePrestataire(BaseModel):
    prestataire = models.ForeignKey(Prestataire, on_delete=models.CASCADE)
    agence = models.ForeignKey(Agence, on_delete=models.CASCADE)
    date_debut = models.DateTimeField()
    date_fin = models.DateTimeField(null=True, blank=True)
    statut = models.ForeignKey(Statut, on_delete=models.CASCADE)

# ============================================================
# AJOUTER À LA FIN DE models.py
# ============================================================

class DeviceToken(models.Model):
    """
    Stocke les tokens FCM par user et plateforme.
    Un user peut avoir plusieurs appareils (mobile + web).
    On garde le token unique par (user, token) pour éviter les doublons.
    """
    PLATFORM_CHOICES = [
        ('android', 'Android'),
        ('ios',     'iOS'),
        ('web',     'Web'),
    ]

    user       = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='device_tokens'
    )
    token      = models.TextField(unique=True)
    platform   = models.CharField(max_length=10, choices=PLATFORM_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'device_tokens'
        # Un token est unique — pas de doublon même si re-envoyé
        unique_together = ('user', 'token')

    def __str__(self):
        return f"{self.user.username} [{self.platform}] {self.token[:20]}..."


class Notification(models.Model):
    """
    Notifications stockées en base pour chaque user.
    Créées par Django lors d'événements (commande, retrait, menu, etc.)
    et envoyées via FCM en même temps.
    """
    TYPE_CHOICES = [
        ('commande_passee',  'Commande passée'),
        ('commande_annulee', 'Commande annulée'),
        ('retrait_valide',   'Retrait validé'),
        ('retrait_annule',   'Retrait annulé'),
        ('menu_disponible',  'Menu disponible'),
        ('rappel_48h',       'Rappel avant la date limite'),
        ('contestation_nouvelle', 'Nouvelle contestation de retrait'),
        ('contestation_decidee',  'Contestation traitée'),
        ('menu_corrige',     'Menu corrigé par UbiPharm'),
        ('plat_masque',      'Plat masqué par UbiPharm'),
        ('compte_repas',     'Compte repas'),
        ('info',             'Information'),
    ]

    user        = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    type        = models.CharField(max_length=30, choices=TYPE_CHOICES, default='info')
    titre       = models.CharField(max_length=255)
    message     = models.TextField()
    lu          = models.BooleanField(default=False)
    commande_id = models.IntegerField(null=True, blank=True)
    menu_id     = models.IntegerField(null=True, blank=True)
    retrait_id  = models.IntegerField(null=True, blank=True)
    contestation_id = models.IntegerField(null=True, blank=True)
    # Données complémentaires propres au type (ex. contestation_decidee :
    # {"statut": "acceptee", "cause": "badge_tiers"}), reprises dans le message FCM
    donnees     = models.JSONField(default=dict, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.type}] {self.user.username} — {self.titre}"


# ============================================================
# FACTURATION MENSUELLE FIGÉE
# Calcul : api/facturation.py. Une fois un mois clôturé, ses montants
# ne dépendent plus des tarifs / catégories (modifiables ensuite).
# ============================================================

class ClotureMensuelle(models.Model):
    """Clôture de la facturation d'un mois (une seule par mois)."""
    annee         = models.PositiveSmallIntegerField()
    mois          = models.PositiveSmallIntegerField()
    cloturee_le   = models.DateTimeField(auto_now_add=True)
    cloturee_par  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True,
                                      related_name='clotures_facturation')
    nb_factures   = models.PositiveIntegerField(default=0)
    nb_repas      = models.PositiveIntegerField(default=0)
    montant_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    # Côté prestataires (montant dû aux fournisseurs pour le mois)
    nb_factures_prestataires      = models.PositiveIntegerField(default=0)
    montant_total_prestataires    = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    # Règlement des repas des employés (compte repas prépayé et caisse) :
    # consommé (montant_total) = compte + caisse + retenue sur salaire
    nb_repas_compte   = models.PositiveIntegerField(default=0)
    montant_compte    = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    nb_repas_caisse   = models.PositiveIntegerField(default=0)
    montant_caisse    = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    nb_repas_retenue  = models.PositiveIntegerField(default=0)
    montant_retenue   = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        db_table = 'clotures_mensuelles'
        unique_together = ('annee', 'mois')
        ordering = ['-annee', '-mois']

    def __str__(self):
        return f"Clôture {self.mois:02d}/{self.annee}"


class FactureMensuelle(models.Model):
    """Facture figée d'un agent pour un mois clôturé."""
    cloture           = models.ForeignKey(ClotureMensuelle, on_delete=models.PROTECT,
                                          related_name='factures')
    user              = models.ForeignKey(User, on_delete=models.PROTECT,
                                          related_name='factures_mensuelles')
    annee             = models.PositiveSmallIntegerField()
    mois              = models.PositiveSmallIntegerField()
    categorie_libelle = models.CharField(max_length=100, blank=True)
    nb_repas          = models.PositiveIntegerField()
    montant_total     = models.DecimalField(max_digits=12, decimal_places=2)
    # Règlement figé à la clôture : montant_total = compte + caisse + retenue
    nb_repas_compte   = models.PositiveIntegerField(default=0)
    montant_compte    = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    nb_repas_caisse   = models.PositiveIntegerField(default=0)
    montant_caisse    = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    nb_repas_retenue  = models.PositiveIntegerField(default=0)
    montant_retenue   = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table = 'factures_mensuelles'
        unique_together = ('user', 'annee', 'mois')
        ordering = ['-annee', '-mois', 'user__username']

    def __str__(self):
        return f"Facture {self.user.username} {self.mois:02d}/{self.annee}"


class LigneFacture(models.Model):
    """Un repas facturé, avec les valeurs figées au moment de la clôture."""
    facture           = models.ForeignKey(FactureMensuelle, on_delete=models.CASCADE,
                                          related_name='lignes')
    commande          = models.OneToOneField(Commande, on_delete=models.SET_NULL, null=True,
                                             related_name='ligne_facture')
    date_menu         = models.DateField()
    plat_nom          = models.CharField(max_length=255)
    agence_nom        = models.CharField(max_length=255, blank=True)
    categorie_libelle = models.CharField(max_length=100, blank=True)
    montant           = models.DecimalField(max_digits=10, decimal_places=2)
    # Comment le repas a été payé (figé à la clôture ; avant le compte
    # repas, tous les repas étaient retenus sur salaire)
    REGLEMENT_CHOICES = [
        ('compte',  'Payé par le compte repas'),
        ('caisse',  'Payé à la caisse'),
        ('retenue', 'Retenu sur salaire'),
    ]
    reglement         = models.CharField(max_length=10, choices=REGLEMENT_CHOICES, default='retenue')

    class Meta:
        db_table = 'lignes_facture'
        ordering = ['date_menu']


class FacturePrestataire(models.Model):
    """Facture figée d'un prestataire pour un mois clôturé."""
    cloture             = models.ForeignKey(ClotureMensuelle, on_delete=models.PROTECT,
                                            related_name='factures_prestataires')
    prestataire         = models.ForeignKey(Prestataire, on_delete=models.PROTECT,
                                            related_name='factures_mensuelles')
    prestataire_libelle = models.CharField(max_length=100)
    # Numéro unique attribué à la clôture : RP-AAAA-NNN (compteur par année ;
    # les relevés clôturés avant gardent leur ancien numéro FP-AAAA-MM-NNN)
    numero              = models.CharField(max_length=30, unique=True, null=True, blank=True)
    annee               = models.PositiveSmallIntegerField()
    mois                = models.PositiveSmallIntegerField()
    nb_repas            = models.PositiveIntegerField()
    montant_total       = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        db_table = 'factures_prestataires'
        unique_together = ('prestataire', 'annee', 'mois')
        ordering = ['-annee', '-mois', 'prestataire_libelle']

    def __str__(self):
        return f"Facture {self.prestataire_libelle} {self.mois:02d}/{self.annee}"


class LigneFacturePrestataire(models.Model):
    """Un repas facturé par le prestataire, valeurs figées à la clôture."""
    facture    = models.ForeignKey(FacturePrestataire, on_delete=models.CASCADE,
                                   related_name='lignes')
    commande   = models.OneToOneField(Commande, on_delete=models.SET_NULL, null=True,
                                      related_name='ligne_facture_prestataire')
    user       = models.ForeignKey(User, on_delete=models.SET_NULL, null=True,
                                   related_name='+')
    date_menu  = models.DateField()
    plat_nom   = models.CharField(max_length=255)
    agence_nom = models.CharField(max_length=255, blank=True)
    montant    = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = 'lignes_facture_prestataire'
        ordering = ['date_menu']


# ============================================================
# PARAMÈTRES DE LA SOCIÉTÉ (en-tête des factures PDF)
# Enregistrement unique (pk=1), modifiable à tout moment par un admin.
# Les factures PDF utilisent les paramètres en vigueur au moment du
# téléchargement ; les montants, eux, restent figés.
# ============================================================

def chemin_apk(instance, filename):
    """APK de l'application : nom lisible et stable (« ubifood-1.4.0.apk »)."""
    import re
    version = re.sub(r'[^0-9A-Za-z._-]+', '-', instance.application_android_version or '').strip('.-_')
    return f"application/ubifood-{version}.apk" if version else 'application/ubifood.apk'


class ParametresSociete(models.Model):
    nom                = models.CharField(max_length=255, blank=True)
    adresse            = models.TextField(blank=True)
    ville              = models.CharField(max_length=100, blank=True)
    telephone          = models.CharField(max_length=100, blank=True)
    email              = models.EmailField(blank=True)
    site_web           = models.CharField(max_length=255, blank=True)
    identifiant_fiscal = models.CharField('N° compte contribuable / identifiant fiscal',
                                          max_length=100, blank=True)
    registre_commerce  = models.CharField('RCCM', max_length=100, blank=True)
    pied_de_page       = models.TextField('Mentions de bas de page', blank=True,
                                          help_text="Ex. coordonnées bancaires, capital social…")
    logo               = models.ImageField(upload_to='societe/', blank=True, null=True,
                                           validators=[FileExtensionValidator(['png', 'jpg', 'jpeg'])])
    # Cantine : délais en heures avant le début du jour du menu (00:00).
    # Ex. menu du mercredi : 0 → mardi à minuit ; 24 → lundi à minuit ; 48 → dimanche à minuit.
    delai_commande_heures   = models.PositiveIntegerField(
        'Délai de commande (heures)', default=48, validators=[MaxValueValidator(720)],
        help_text="Nombre d'heures avant le jour du menu où les commandes se ferment.")
    delai_annulation_heures = models.PositiveIntegerField(
        "Délai d'annulation (heures)", default=48, validators=[MaxValueValidator(720)],
        help_text="Nombre d'heures avant le jour du menu où les annulations se ferment.")
    # Application mobile (interne, hors stores) : téléchargée depuis la page
    # publique /telecharger du site. Android : fichier APK déposé ici ;
    # iPhone : lien d'invitation (TestFlight ou équivalent).
    application_apk             = models.FileField(
        'APK Android', upload_to=chemin_apk, blank=True, null=True,
        validators=[FileExtensionValidator(['apk'])])
    application_android_version = models.CharField('Version Android', max_length=30, blank=True)
    application_ios_url         = models.URLField('Lien iPhone (TestFlight…)', max_length=500, blank=True)
    application_ios_version     = models.CharField('Version iPhone', max_length=30, blank=True)
    application_mise_a_jour     = models.DateTimeField(
        "Dernière mise à jour de l'application", null=True, blank=True)
    # Horaires du service par défaut (une agence peut avoir les siens)
    heure_debut_service = models.TimeField('Début du service', default=time(11, 30))
    heure_fin_service   = models.TimeField('Fin du service', default=time(14, 30))
    updated_at         = models.DateTimeField(auto_now=True)
    user_updated       = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                           related_name='+')

    class Meta:
        db_table = 'parametres_societe'

    @classmethod
    def charger(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return self.nom or 'Paramètres société'


class Banniere(models.Model):
    """
    Bannières de l'écran d'accueil de l'application mobile, gérées par les
    administrateurs (Paramètres → Bannières) : image, ordre d'affichage,
    activation et période d'affichage facultative (ex. une fête).
    """
    titre      = models.CharField(max_length=150, help_text="Nom interne (non affiché)")
    image      = models.ImageField(upload_to='bannieres/',
                                   validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'webp'])])
    ordre      = models.PositiveSmallIntegerField(default=0)
    actif      = models.BooleanField(default=True)
    date_debut = models.DateField(null=True, blank=True)
    date_fin   = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    user_created = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='+')
    user_updated = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='+')

    class Meta:
        db_table = 'banniere'
        ordering = ['ordre', 'id']

    def __str__(self):
        return self.titre


class PopupConnexion(models.Model):
    """
    Image affichée dans une fenêtre juste après la connexion (web et mobile).
    Une seule peut être active à la fois ; aucune active → pas de fenêtre.
    """
    titre      = models.CharField(max_length=150, help_text="Nom interne (non affiché)")
    image      = models.ImageField(upload_to='popups/',
                                   validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'webp'])])
    actif      = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    user_created = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='+')
    user_updated = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='+')

    class Meta:
        db_table = 'popup_connexion'
        ordering = ['-actif', '-updated_at']
        constraints = [
            models.UniqueConstraint(fields=['actif'], condition=models.Q(actif=True),
                                    name='une_seule_popup_active'),
        ]

    def save(self, *args, **kwargs):
        from django.db import transaction
        with transaction.atomic():
            if self.actif:
                # Activer celle-ci désactive les autres
                PopupConnexion.objects.filter(actif=True).exclude(pk=self.pk).update(actif=False)
            super().save(*args, **kwargs)

    def __str__(self):
        return self.titre


class AvisPlat(models.Model):
    """
    Avis d'un agent sur un repas qu'il a retiré : une note de 1 à 5 et un
    commentaire facultatif, un seul avis par commande (modifiable).
    """
    commande    = models.OneToOneField(Commande, on_delete=models.CASCADE, related_name='avis')
    user        = models.ForeignKey(User, on_delete=models.CASCADE, related_name='avis_plats')
    plat        = models.ForeignKey(Plat, on_delete=models.CASCADE, related_name='avis')
    note        = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)])
    commentaire = models.TextField(blank=True, max_length=500)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'avis_plat'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.plat} : {self.note}/5"


class ContestationRetrait(models.Model):
    """
    « Je n'ai pas retiré ce repas » : un employé conteste un retrait validé
    à son nom au comptoir. Le gestionnaire de l'agence tranche :
      - acceptée, avec une cause :
          · erreur_comptoir : erreur ou fraude au comptoir (mauvais badge
            validé, retrait fictif) : le retrait est supprimé et la commande
            annulée (motif « contestation ») : repas facturé ni à l'employé,
            ni au prestataire ;
          · badge_tiers : un tiers a utilisé le badge de l'employé (prêté,
            perdu) : le repas a bien été servi, le retrait est conservé,
            l'employé le paie et le prestataire est payé ;
        (cause vide : contestation acceptée avant l'introduction des causes,
        repas retiré du seul relevé du prestataire) ;
      - rejetée  : commentaire obligatoire, envoyé à l'employé.
    Les informations du retrait sont recopiées (le retrait est supprimé si
    la contestation est acceptée pour erreur au comptoir).
    """
    MOTIF_CHOICES = [
        ('absent',         "J'étais absent(e) (mission, congé…)"),
        ('badge_utilise',  "Quelqu'un a utilisé mon badge / matricule"),
        ('autre',          'Autre raison'),
    ]
    STATUT_CHOICES = [
        ('ouverte',  'Ouverte'),
        ('acceptee', 'Acceptée'),
        ('rejetee',  'Rejetée'),
    ]
    CAUSE_CHOICES = [
        ('erreur_comptoir', 'Erreur ou fraude au comptoir'),
        ('badge_tiers',     'Badge utilisé par un tiers'),
    ]
    commande    = models.OneToOneField(Commande, on_delete=models.CASCADE, related_name='contestation')
    retrait     = models.ForeignKey(Retrait, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='contestations')
    user        = models.ForeignKey(User, on_delete=models.CASCADE, related_name='contestations')
    menu        = models.ForeignKey(Menu, on_delete=models.CASCADE, related_name='contestations')
    motif       = models.CharField(max_length=20, choices=MOTIF_CHOICES)
    commentaire = models.TextField(blank=True, max_length=1000)
    statut      = models.CharField(max_length=10, choices=STATUT_CHOICES, default='ouverte')
    # Retrait contesté (recopié)
    date_retrait       = models.DateTimeField(null=True, blank=True)
    retrait_valide_par = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                           related_name='+')
    retrait_mode       = models.CharField(max_length=10, blank=True)
    # Décision
    traite_par  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='contestations_traitees')
    commentaire_traitement = models.TextField(blank=True, max_length=1000)
    date_traitement = models.DateTimeField(null=True, blank=True)
    # Cause retenue à l'acceptation (vide tant que non décidée, ou si rejetée)
    cause       = models.CharField(max_length=20, choices=CAUSE_CHOICES, null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'contestation_retrait'
        ordering = ['-created_at']

    def __str__(self):
        return f"Contestation {self.user} — {self.menu.date_menu} [{self.statut}]"


# ============================================================
# COMPTE REPAS PRÉPAYÉ ET CAISSE
# Logique : api/comptes_repas.py ; écrans : api/caisse.py ; PDF : api/pdf_caisse.py.
#
# Chaque employé a un compte repas (solde jamais négatif, reporté de mois
# en mois). Le solde est un cache du grand livre MouvementCompte (somme
# des montants signés), mis à jour sous verrou (select_for_update).
# Un repas facturable est payé UNE seule fois (ReglementRepas, unique par
# commande) : débit du compte, paiement à la caisse ou retenue sur salaire.
# ============================================================

MODE_PAIEMENT_CHOICES = [
    ('especes',      'Espèces'),
    ('mobile_money', 'Mobile Money'),
]


class CompteRepas(models.Model):
    """Compte repas prépayé d'un employé (créé à la première opération)."""
    user       = models.OneToOneField(User, on_delete=models.PROTECT, related_name='compte_repas')
    solde      = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'compte_repas'
        constraints = [
            models.CheckConstraint(condition=models.Q(solde__gte=0), name='compte_repas_solde_positif'),
        ]

    def __str__(self):
        return f"Compte repas {self.user.username} : {self.solde}"


class CompteurRecu(models.Model):
    """Dernier rang de reçu attribué dans l'année (numérotation REÇ-AAAA-NNNNNN)."""
    annee   = models.PositiveSmallIntegerField(primary_key=True)
    dernier = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'compteur_recu'


class ClotureCaisse(models.Model):
    """
    Clôture de caisse (journalière) d'un caissier : espèces comptées contre
    le théorique (reçus en espèces non annulés depuis sa dernière clôture).
    Soumise par le caissier, validée ou rejetée par la comptabilité.
    Rejetée : ses reçus sont libérés (le caissier soumet une nouvelle clôture).
    """
    STATUT_CHOICES = [
        ('soumise', 'Soumise — en attente de validation'),
        ('validee', 'Validée'),
        ('rejetee', 'Rejetée'),
    ]
    caissier          = models.ForeignKey(User, on_delete=models.PROTECT, related_name='clotures_caisse')
    jour              = models.DateField()
    debut             = models.DateTimeField(null=True, blank=True)   # premier reçu de la période
    nb_recus          = models.PositiveIntegerField(default=0)
    montant_theorique = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    montant_compte    = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    ecart             = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    motif_ecart       = models.CharField(max_length=500, blank=True)
    statut            = models.CharField(max_length=10, choices=STATUT_CHOICES, default='soumise')
    soumise_le        = models.DateTimeField(auto_now_add=True)
    traitee_par       = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                          related_name='clotures_caisse_traitees')
    traitee_le        = models.DateTimeField(null=True, blank=True)
    commentaire       = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = 'cloture_caisse'
        ordering = ['-soumise_le', '-id']

    def __str__(self):
        return f"Clôture de caisse {self.caissier.username} du {self.jour:%d/%m/%Y} [{self.statut}]"


class Recu(models.Model):
    """
    Reçu de caisse (non fiscal), numéroté par année : REÇ-AAAA-NNNNNN.
      - recharge       : crédit du compte repas (montant crédité) ;
      - regularisation : paiement de repas non couverts d'un mois ouvert
                         (montant = total des repas ; la monnaie est rendue
                         ou créditée sur le compte) ;
      - remboursement  : solde du compte rendu à l'employé (comptabilité).
    encaissement : espèces entrées (+) ou sorties (−) de la caisse.
    """
    TYPE_CHOICES = [
        ('recharge',       'Recharge du compte'),
        ('regularisation', 'Régularisation du mois'),
        ('remboursement',  'Remboursement du solde'),
    ]
    STATUT_CHOICES = [
        ('valide', 'Valide'),
        ('annule', 'Annulé'),
    ]
    numero           = models.CharField(max_length=30, unique=True)
    annee            = models.PositiveSmallIntegerField()
    type             = models.CharField(max_length=20, choices=TYPE_CHOICES)
    statut           = models.CharField(max_length=10, choices=STATUT_CHOICES, default='valide')
    user             = models.ForeignKey(User, on_delete=models.PROTECT, related_name='recus_caisse')
    caissier         = models.ForeignKey(User, on_delete=models.PROTECT, related_name='recus_emis')
    mode             = models.CharField(max_length=20, choices=MODE_PAIEMENT_CHOICES, default='especes')
    # Référence de la transaction (Mobile Money, plus tard) : facultative
    reference        = models.CharField(max_length=100, blank=True)
    montant          = models.DecimalField(max_digits=12, decimal_places=2)
    montant_repas    = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    montant_recu     = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    monnaie          = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    monnaie_creditee = models.BooleanField(default=False)
    encaissement     = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    solde_avant      = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    solde_apres      = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    motif            = models.CharField(max_length=500, blank=True)
    cloture_caisse   = models.ForeignKey(ClotureCaisse, on_delete=models.SET_NULL, null=True, blank=True,
                                         related_name='recus')
    annule_par       = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                         related_name='recus_annules')
    annule_le        = models.DateTimeField(null=True, blank=True)
    motif_annulation = models.CharField(max_length=500, blank=True)
    created_at       = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'recu_caisse'
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f"{self.numero} {self.get_type_display()} {self.montant}"


class RecuLigne(models.Model):
    """Repas payé par un reçu de régularisation (valeurs recopiées)."""
    recu      = models.ForeignKey(Recu, on_delete=models.CASCADE, related_name='lignes')
    commande  = models.ForeignKey(Commande, on_delete=models.SET_NULL, null=True, blank=True,
                                  related_name='+')
    date_menu = models.DateField()
    plat_nom  = models.CharField(max_length=255)
    montant   = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = 'recu_ligne'
        ordering = ['date_menu', 'id']


class MouvementCompte(models.Model):
    """
    Grand livre du compte repas : un mouvement signé par opération
    (+ crédit, − débit). solde_apres : solde du compte après le mouvement.
    """
    TYPE_CHOICES = [
        ('recharge',       'Recharge'),
        ('debit_repas',    'Repas débité'),
        ('recredit',       'Repas recrédité'),
        ('regularisation', 'Monnaie de régularisation créditée'),
        ('remboursement',  'Remboursement du solde'),
        ('annulation',     "Annulation d'un reçu"),
    ]
    compte      = models.ForeignKey(CompteRepas, on_delete=models.PROTECT, related_name='mouvements')
    type        = models.CharField(max_length=20, choices=TYPE_CHOICES)
    montant     = models.DecimalField(max_digits=12, decimal_places=2)
    solde_apres = models.DecimalField(max_digits=12, decimal_places=2)
    commande    = models.ForeignKey(Commande, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='mouvements_compte')
    recu        = models.ForeignKey(Recu, on_delete=models.PROTECT, null=True, blank=True,
                                    related_name='mouvements')
    libelle     = models.CharField(max_length=255, blank=True)
    created_by  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='+')
    created_at  = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'mouvement_compte'
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f"{self.get_type_display()} {self.montant} ({self.compte.user.username})"


class ReglementRepas(models.Model):
    """
    Règlement d'un repas facturable à l'employé : UN seul par commande
    (contrainte d'unicité : un repas n'est jamais payé deux fois).
      - compte  : débité du compte repas (mouvement débit) ;
      - caisse  : payé à la caisse (reçu de régularisation) ;
      - retenue : retenu sur salaire (créé à la clôture du mois).
    Supprimé si le paiement est défait (retrait annulé, repas annulé, reçu
    annulé) tant que le mois est ouvert.
    """
    MODE_CHOICES = [
        ('compte',  'Débité du compte repas'),
        ('caisse',  'Payé à la caisse'),
        ('retenue', 'Retenu sur salaire'),
    ]
    commande   = models.OneToOneField(Commande, on_delete=models.CASCADE, related_name='reglement')
    mode       = models.CharField(max_length=10, choices=MODE_CHOICES)
    montant    = models.DecimalField(max_digits=10, decimal_places=2)
    mouvement  = models.OneToOneField(MouvementCompte, on_delete=models.SET_NULL, null=True, blank=True,
                                      related_name='reglement')
    recu       = models.ForeignKey(Recu, on_delete=models.PROTECT, null=True, blank=True,
                                   related_name='reglements')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'reglement_repas'

    def __str__(self):
        return f"Règlement {self.commande_id} : {self.mode} {self.montant}"
