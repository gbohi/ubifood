from django.contrib.auth.models import AbstractUser
from django.core.validators import FileExtensionValidator, MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

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
    agence = models.ForeignKey(Agence, on_delete=models.CASCADE)

class PlatImage(BaseModel):
    plat = models.ForeignKey(Plat, on_delete=models.CASCADE, related_name="images")
    # Une photo de plat ne peut pas être un PDF (le mobile et le web l'affichent comme image)
    image = models.FileField(upload_to='images_plats/', validators=[FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp'])])
    is_principale = models.BooleanField(default=False)

class Menu(BaseModel):
    date_menu = models.DateField()
    agence = models.ForeignKey(Agence, on_delete=models.CASCADE)
    typeequipe = models.ForeignKey(TypeEquipe, on_delete=models.CASCADE)

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

    class Meta:
        # Un agent ne peut retirer qu'une seule fois par menu
        unique_together = ('user', 'menu')
        ordering = ['-date_retrait']

    def __str__(self):
        return f"Retrait {self.user} — {self.menu.date_menu}"

#Gestion Cantine


#Debut Gestion entretien vehicule
class TypeVehicule(BaseModel):
    libelle = models.CharField(max_length=100)

class Vehicule(BaseModel):
    immatriculation = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    type_vehicule = models.ForeignKey(TypeVehicule, on_delete=models.CASCADE)
    statut = models.ForeignKey(Statut, on_delete=models.CASCADE)
    agence = models.ForeignKey(Agence, on_delete=models.CASCADE)
    date_circulation = models.DateTimeField()

class EntretienVehicule(BaseModel):
    description = models.TextField(blank=True)
    vehicule = models.ForeignKey(Vehicule, on_delete=models.CASCADE)
    date_entretien_vehicule = models.DateTimeField()
    periode = models.CharField(max_length=10)
    debit = models.DecimalField(max_digits=10, decimal_places=2)
    credit = models.DecimalField(max_digits=10, decimal_places=2)
    solde = models.DecimalField(max_digits=10, decimal_places=2)
#Fin Gestion entretien vehicule

# Ressource Humaines

class SimulationSalaire(models.Model):
    matricule = models.CharField(max_length=20)
    categorie = models.CharField(max_length=10)
    date_naissance = models.DateField()
    salaire_base = models.DecimalField(max_digits=10, decimal_places=2)
    sursalaire = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    salaire_brut_2025 = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

class SimulationHistorique(models.Model):
    simulation = models.ForeignKey(SimulationSalaire, on_delete=models.CASCADE, related_name='historique')
    annee = models.IntegerField()
    age = models.IntegerField()
    salaire = models.DecimalField(max_digits=12, decimal_places=2)
    taux_augmentation = models.DecimalField(max_digits=5, decimal_places=2)
    augmentation = models.DecimalField(max_digits=12, decimal_places=2)
    cotisation = models.DecimalField(max_digits=12, decimal_places=2)

class SimulationHistorique2(models.Model):
    simulation = models.ForeignKey(SimulationSalaire, on_delete=models.CASCADE, related_name='historique2')
    annee = models.IntegerField()
    age = models.IntegerField()
    salaire = models.DecimalField(max_digits=12, decimal_places=2)
    taux_augmentation = models.DecimalField(max_digits=5, decimal_places=2)
    augmentation = models.DecimalField(max_digits=12, decimal_places=2)
    cotisation = models.DecimalField(max_digits=12, decimal_places=2)
#Fin Ressources Humaines

#Plan comptable
class CategorieComptable(BaseModel):
    libelle = models.CharField(max_length=255, unique=True)

class PosteReporting(BaseModel):
    codepr = models.CharField(max_length=15, unique=True)
    libelle = models.CharField(max_length=255)
    categoriecomptable = models.ForeignKey(CategorieComptable, on_delete=models.CASCADE)

class ClasseComptable(BaseModel):
    numeroclasse = models.CharField(max_length=15, unique=True)
    libelle = models.CharField(max_length=255)
    categoriecomptable = models.ForeignKey(CategorieComptable, on_delete=models.CASCADE)

class CompteComptable(BaseModel):
    numerocompte = models.CharField(max_length=15, unique=True)
    libelle = models.CharField(max_length=255) 
    classecomptable = models.ForeignKey(ClasseComptable, on_delete=models.CASCADE)
    postereporting = models.ForeignKey(PosteReporting, on_delete=models.SET_NULL, null=True, blank=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True)
    est_mouvementable = models.BooleanField(default=True)
    actif = models.BooleanField(default=True) 
#Fin plan comptable

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
        ('menu_disponible',  'Menu disponible'),
        ('rappel_48h',       'Rappel 48h'),
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
    # Numéro unique attribué à la clôture : FP-AAAA-MM-NNN
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
