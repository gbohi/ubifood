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
    # Mode de paiement proposé par défaut à la commande (modifiable par l'employé,
    # web et mobile) : « compte » (compte repas, si le solde couvre le repas,
    # sinon retenue) ou « retenue » (retenue sur salaire)
    MODE_PAIEMENT_PREFERE_CHOICES = [
        ('compte',  'Compte repas'),
        ('retenue', 'Retenue sur salaire'),
    ]
    mode_paiement_prefere = models.CharField(max_length=10, choices=MODE_PAIEMENT_PREFERE_CHOICES,
                                             default='compte')
    # Équipe de l'employé (Paramètres → Utilisateurs) : mise en avant et
    # présélectionnée dans le parcours de commande (il peut en choisir une autre)
    typeequipe = models.ForeignKey('TypeEquipe', on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='membres', verbose_name='Équipe')
    # Notifications du suivi des repas que l'employé a coupées (suivi_repas.py) :
    # {"preparation": false, "en_route": false, "rappel": true, "incidents": true}
    preferences_suivi = models.JSONField(default=dict, blank=True)

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
    # Parcours de commande : les employés des AUTRES agences peuvent-ils voir
    # et commander les menus de cette agence ? (modifiable par le gestionnaire
    # de l'agence et les administrateurs). Fermée : agence masquée aux
    # employés des autres agences ; leurs commandes déjà passées sont maintenues.
    accepter_autres_agences = models.BooleanField(default=False)

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
    # Horaires de retrait propres à l'équipe (vides : horaires de service de
    # l'agence, sinon ceux par défaut de Paramètres → Société). Les deux
    # heures sont renseignées ensemble ou laissées vides.
    heure_debut_retrait = models.TimeField('Début du retrait', null=True, blank=True)
    heure_fin_retrait   = models.TimeField('Fin du retrait', null=True, blank=True)
    # Équipe réservée aux employés inscrits au planning des équipes (ex. Nuit) :
    # les autres ne voient ni l'équipe ni ses menus et ne peuvent pas y commander.
    sur_planning = models.BooleanField('Réservée aux employés programmés', default=False)
    # Pendant ses jours programmés, l'employé ne voit et ne commande que cette équipe
    exclusive_planning = models.BooleanField('Exclusive pendant la période programmée', default=True)
    # Repas offert : l'employé ne paie pas (ni compte repas, ni retenue) ; le
    # prestataire est payé normalement. S'applique aux nouvelles commandes.
    repas_offert = models.BooleanField('Repas offert (non facturé aux employés)', default=False)


class ProgrammationEquipe(BaseModel):
    """
    Planning des équipes : l'employé est programmé dans une équipe « sur planning »
    du `date_debut` au `date_fin` (vide : jusqu'à nouvel ordre), les jours de la
    semaine listés dans `jours` (0 = lundi … 6 = dimanche). Voir planning_equipes.py.
    """
    user       = models.ForeignKey('User', on_delete=models.CASCADE, related_name='programmations_equipe')
    typeequipe = models.ForeignKey(TypeEquipe, on_delete=models.CASCADE, related_name='programmations')
    # Agence où l'employé est programmé : la sienne, ou une agence de mission
    # (il y voit et commande l'équipe, même si l'agence est fermée aux autres agences)
    agence     = models.ForeignKey(Agence, on_delete=models.CASCADE, null=True, blank=True,
                                   related_name='programmations_equipe')
    date_debut = models.DateField()
    date_fin   = models.DateField(null=True, blank=True)
    jours      = models.JSONField(default=list, blank=True)
    motif      = models.CharField(max_length=255, blank=True)
    importee   = models.BooleanField(default=False)

    class Meta:
        db_table = 'programmations_equipe'
        indexes = [models.Index(fields=['typeequipe', 'date_debut', 'date_fin']),
                   models.Index(fields=['user', 'typeequipe'])]


class HistoriqueProgrammation(models.Model):
    """Journal du planning des équipes : qui a programmé, modifié ou retiré qui, quand et pourquoi."""
    ACTION_CHOICES = [
        ('programmation', 'Programmation'),
        ('modification',  'Modification'),
        ('retrait',       'Retrait'),
        ('import',        'Import Excel'),
        ('copie',         'Copie de la semaine précédente'),
    ]
    user        = models.ForeignKey('User', on_delete=models.CASCADE, related_name='historique_programmations')
    typeequipe  = models.ForeignKey(TypeEquipe, on_delete=models.CASCADE, related_name='+')
    action      = models.CharField(max_length=20, choices=ACTION_CHOICES)
    description = models.TextField(blank=True)
    motif       = models.CharField(max_length=255, blank=True)
    par         = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'historique_programmations'
        ordering = ['-created_at', '-id']


class RappelPlanning(models.Model):
    """Rappel de réservation déjà envoyé (un par employé, équipe et jour)."""
    user       = models.ForeignKey('User', on_delete=models.CASCADE, related_name='+')
    typeequipe = models.ForeignKey(TypeEquipe, on_delete=models.CASCADE, related_name='+')
    date_menu  = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'rappels_planning'
        constraints = [models.UniqueConstraint(fields=['user', 'typeequipe', 'date_menu'],
                                               name='rappel_planning_unique')]


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
    # Prestataire qui sert (et facture) ce menu : plusieurs prestataires
    # peuvent desservir la même agence. Vide : menu historique d'UbiPharm
    # (regroupé sous « Cantine UbiPharm » dans le parcours de commande ;
    # facturé au prestataire rattaché à l'agence, comme avant).
    prestataire = models.ForeignKey('Prestataire', on_delete=models.PROTECT, null=True, blank=True,
                                    related_name='menus')


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
        ('planning',     "Retrait du planning des équipes"),
    ]
    motif_annulation = models.CharField(max_length=20, choices=MOTIF_ANNULATION_CHOICES, blank=True)
    # Mode de paiement choisi par l'employé à la commande (comptes_repas.py) :
    #   - compte  : débité du compte repas À LA COMMANDE (ReglementRepas « compte ») ;
    #   - retenue : retenu sur salaire à la clôture du mois.
    # Modifiable jusqu'à la date limite de commande. Commandes antérieures à
    # ce choix : renseigné par la migration 0039 (compte si déjà débitées).
    #   - offert  : équipe « repas offert » (TypeEquipe.repas_offert) : rien à payer
    #               par l'employé ; le prestataire est payé normalement.
    MODE_PAIEMENT_CHOICES = [
        ('compte',  'Compte repas'),
        ('retenue', 'Retenue sur salaire'),
        ('offert',  'Repas offert'),
    ]
    mode_paiement = models.CharField(max_length=10, choices=MODE_PAIEMENT_CHOICES, default='retenue')

    class Meta:
        # Un agent ne peut commander le même plat qu'une seule fois par menu
        unique_together = ('user', 'menu', 'plat')
        ordering = ['-date_commande']

    def __str__(self):
        return f"{self.user} — {self.menu.date_menu} — {self.plat.nom} [{self.statut}]"


def etapes_suivi_defaut():
    """Étapes du suivi des repas : active, notification push, déclenchement automatique."""
    return {
        'confirmee':   {'actif': True, 'push': True},
        'preparation': {'actif': True, 'push': False, 'auto_heures': 2},
        'en_route':    {'actif': True, 'push': False},
        'arrive':      {'actif': True, 'push': True, 'auto': True},
        'retire':      {'actif': True, 'push': True},
    }


class SuiviRepas(models.Model):
    """
    Suivi d'un service (un menu : jour, agence, équipe, prestataire) déclaré par
    le prestataire : préparation, départ de la livraison, arrivée au comptoir.
    Étapes automatiques (`*_auto`) si le prestataire ne les a pas déclarées.
    """
    menu             = models.OneToOneField('Menu', on_delete=models.CASCADE, related_name='suivi')
    preparation_le   = models.DateTimeField(null=True, blank=True)
    preparation_par  = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    preparation_auto = models.BooleanField(default=False)
    en_route_le      = models.DateTimeField(null=True, blank=True)
    en_route_par     = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    arrive_le        = models.DateTimeField(null=True, blank=True)
    arrive_par       = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    arrive_auto      = models.BooleanField(default=False)
    rappel_envoye_le = models.DateTimeField(null=True, blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'suivis_repas'


class IncidentRepas(models.Model):
    """Incident signalé par le prestataire sur un service : retard (nouvelle heure) ou message."""
    TYPE_CHOICES = [('retard', 'Retard'), ('autre', 'Autre')]
    menu         = models.ForeignKey('Menu', on_delete=models.CASCADE, related_name='incidents_suivi')
    type         = models.CharField(max_length=10, choices=TYPE_CHOICES)
    heure_prevue = models.TimeField(null=True, blank=True)
    message      = models.CharField(max_length=300, blank=True)
    par          = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'incidents_repas'
        ordering = ['-created_at', '-id']


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
    # Profil affiché aux employés (parcours de commande) : modifiable par le
    # responsable du prestataire (espace prestataire) et par les administrateurs.
    nom_affiche        = models.CharField("Nom affiché aux employés", max_length=100, blank=True)
    description_courte = models.CharField(max_length=120, blank=True)
    cuisine            = models.CharField('Type de cuisine', max_length=100, blank=True)
    tags               = models.JSONField(default=list, blank=True)
    logo               = models.ImageField(upload_to='prestataires/logos/', null=True, blank=True,
                                           validators=[FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp'])])
    # Paysage, environ 1200 × 600 recommandé (5 Mo au plus)
    photo_couverture   = models.ImageField(upload_to='prestataires/couvertures/', null=True, blank=True,
                                           validators=[FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp'])])

    @property
    def nom_public(self):
        return self.nom_affiche or self.libelle

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
    # Type de plat (Standard, Complet…) ; vide : tarif « tous types » (s'applique
    # aux types sans tarif propre)
    type_plat = models.ForeignKey(TypePlat, on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    montant = models.DecimalField(max_digits=10, decimal_places=2)
    date_debut = models.DateTimeField()
    date_fin = models.DateTimeField(null=True, blank=True)
    statut = models.ForeignKey(Statut, on_delete=models.CASCADE)

class PlatPrestataire(BaseModel):
    prestataire = models.ForeignKey(Prestataire, on_delete=models.CASCADE)
    # Type de plat ; vide : tarif « tous types »
    type_plat = models.ForeignKey(TypePlat, on_delete=models.PROTECT, null=True, blank=True, related_name='+')
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
        ('agence_fermee',    "Agence fermée aux autres agences"),
        ('facture_prestataire', 'Suivi des factures prestataires'),
        ('planning_equipe',  'Planning des équipes'),
        ('suivi_repas',      'Suivi du repas'),
        ('jeu',              'Jeux'),
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
        ('caisse',  'Payé à la caisse'),   # historique (régularisation)
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

    # Suivi du relevé jusqu'au paiement (api/suivi_factures.py) :
    #   1. relevé émis (clôture) → 2. bon pour accord du prestataire (ou
    #   contestation) → 3. facture du prestataire déposée → 4. facture validée
    #   (ou refusée : nouveau dépôt) par la comptabilité → 5. payée.
    STATUT_CHOICES = [
        ('emis',            'Relevé émis'),
        ('conteste',        'Relevé contesté'),
        ('accorde',         'Bon pour accord'),
        ('facture_deposee', 'Facture déposée'),
        ('facture_refusee', 'Facture refusée'),
        ('facture_validee', 'Facture validée'),
        ('payee',           'Payée'),
    ]
    MODE_PAIEMENT_CHOICES = [
        ('virement', 'Virement'),
        ('cheque',   'Chèque'),
        ('especes',  'Espèces'),
    ]
    statut              = models.CharField(max_length=20, choices=STATUT_CHOICES, default='emis')
    accord_par          = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                            related_name='+')
    accord_le           = models.DateTimeField(null=True, blank=True)
    validee_par         = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                            related_name='+')
    validee_le          = models.DateTimeField(null=True, blank=True)
    # Paiement (étape 5)
    date_paiement       = models.DateField(null=True, blank=True)
    mode_paiement       = models.CharField(max_length=10, choices=MODE_PAIEMENT_CHOICES, blank=True)
    reference_paiement  = models.CharField(max_length=100, blank=True)
    justificatif_paiement = models.FileField(upload_to='factures_prestataires/paiements/%Y/', null=True,
                                             blank=True, max_length=255)
    paiement_par        = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                            related_name='+')
    paiement_le         = models.DateTimeField(null=True, blank=True)
    derniere_relance_le = models.DateTimeField(null=True, blank=True)
    statut_modifie_le   = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'factures_prestataires'
        unique_together = ('prestataire', 'annee', 'mois')
        ordering = ['-annee', '-mois', 'prestataire_libelle']

    def __str__(self):
        return f"Facture {self.prestataire_libelle} {self.mois:02d}/{self.annee}"


class FactureDeposee(models.Model):
    """
    Facture du prestataire (PDF) déposée pour un relevé (étape 3). Un nouveau
    dépôt est permis tant que la facture n'est pas validée : les précédents
    restent (historique), marqués « remplacée » ou « refusée ».
    ecart = montant TTC de la facture − montant du relevé (0 : conforme).
    """
    STATUT_CHOICES = [
        ('en_attente', 'En attente de validation'),
        ('validee',    'Validée'),
        ('refusee',    'Refusée'),
        ('remplacee',  'Remplacée par un nouveau dépôt'),
    ]
    releve         = models.ForeignKey(FacturePrestataire, on_delete=models.CASCADE, related_name='depots')
    fichier        = models.FileField(upload_to='factures_prestataires/factures/%Y/', max_length=255)
    nom_fichier    = models.CharField(max_length=255, blank=True)
    taille         = models.PositiveIntegerField(default=0)
    numero_facture = models.CharField(max_length=60)
    date_facture   = models.DateField()
    montant_ttc    = models.DecimalField(max_digits=14, decimal_places=2)
    montant_releve = models.DecimalField(max_digits=14, decimal_places=2)
    ecart          = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    statut         = models.CharField(max_length=12, choices=STATUT_CHOICES, default='en_attente')
    deposee_par    = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='+')
    deposee_le     = models.DateTimeField(default=timezone.now)
    traitee_par    = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    traitee_le     = models.DateTimeField(null=True, blank=True)
    motif_refus    = models.CharField(max_length=1000, blank=True)

    class Meta:
        db_table = 'factures_prestataires_depots'
        ordering = ['-deposee_le', '-id']

    @property
    def conforme(self):
        return self.ecart == 0

    def __str__(self):
        return f"Facture {self.numero_facture} ({self.releve})"


class HistoriqueFacturePrestataire(models.Model):
    """Journal du suivi d'un relevé : qui, quand, quelle action, commentaire."""
    ACTION_CHOICES = [
        ('emis',         'Relevé émis'),
        ('accord',       'Bon pour accord'),
        ('contestation', 'Relevé contesté'),
        ('reponse',      'Réponse à la contestation — relevé confirmé'),
        ('depot',        'Facture déposée'),
        ('validation',   'Facture validée'),
        ('refus',        'Facture refusée'),
        ('paiement',     'Paiement enregistré'),
        ('relance',      'Relance'),
    ]
    releve      = models.ForeignKey(FacturePrestataire, on_delete=models.CASCADE, related_name='historique')
    action      = models.CharField(max_length=20, choices=ACTION_CHOICES)
    user        = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    commentaire = models.TextField(blank=True)
    donnees     = models.JSONField(default=dict, blank=True)
    created_at  = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'factures_prestataires_historique'
        ordering = ['created_at', 'id']

    def __str__(self):
        return f"{self.get_action_display()} — {self.releve}"


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
    # Note d'un prestataire affichée aux employés à partir de ce nombre d'avis
    # (en dessous : « Nouveau », sans note)
    seuil_avis_note     = models.PositiveIntegerField("Avis nécessaires pour afficher une note", default=5,
                                                      validators=[MaxValueValidator(1000)])
    # Planning des équipes (équipes « sur planning », ex. Nuit) — planning_equipes.py
    planning_annulation_auto     = models.BooleanField(
        "Annuler les commandes d'un employé retiré du planning (délai d'annulation ouvert)", default=True)
    planning_remboursement_auto  = models.BooleanField("Rembourser les commandes annulées", default=True)
    planning_notif_employe       = models.BooleanField("Notifier l'employé", default=True)
    planning_notif_admin         = models.BooleanField("Notifier les administrateurs", default=True)
    planning_notif_gestionnaire  = models.BooleanField("Notifier les gestionnaires de l'agence", default=True)
    planning_notif_comptable     = models.BooleanField("Notifier la comptabilité", default=True)
    planning_notif_prestataire   = models.BooleanField("Notifier le prestataire", default=True)
    planning_notifier_programmation = models.BooleanField(
        "Prévenir l'employé quand il est programmé", default=True)
    planning_rappel_actif        = models.BooleanField("Rappel de réservation aux employés programmés", default=True)
    planning_rappel_jours        = models.PositiveIntegerField(
        "Rappel : jours avant la date limite", default=1, validators=[MaxValueValidator(14)])
    planning_saisie_gestionnaire = models.BooleanField(
        "Les gestionnaires saisissent le planning (leurs agences)", default=True)
    planning_commande_tardive    = models.BooleanField(
        "Autoriser une commande tardive pour une programmation tardive", default=False)
    planning_commande_tardive_heures = models.PositiveIntegerField(
        "Commande tardive : heures avant le début du retrait", default=12, validators=[MaxValueValidator(72)])
    # Suivi des repas (suivi_repas.py) : étapes, rappel avant la fin du retrait, incidents
    suivi_etapes              = models.JSONField(default=etapes_suivi_defaut, blank=True)
    suivi_rappel_actif        = models.BooleanField("Rappel avant la fin du retrait", default=True)
    suivi_rappel_minutes      = models.PositiveIntegerField(
        "Rappel : minutes avant la fin du retrait", default=30, validators=[MaxValueValidator(240)])
    suivi_incidents_actif     = models.BooleanField("Incidents signalés par le prestataire", default=True)
    suivi_preferences_employe = models.BooleanField(
        "Les employés peuvent couper les notifications du suivi", default=True)
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
      - remboursement  : solde du compte rendu à l'employé (comptabilité) ;
      - regularisation : HISTORIQUE seulement (plus émis depuis que l'employé
                         choisit son mode de paiement à la commande) :
                         paiement à la caisse de repas non couverts.
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
        ('gain_jeu',       'Lot gagné à un jeu'),
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
      - compte  : débité du compte repas à la commande (mode « compte »
                  choisi par l'employé ; avant ce choix : débit au retrait) ;
      - caisse  : historique — payé à la caisse (reçu de régularisation) ;
      - retenue : retenu sur salaire (créé à la clôture du mois).
    Supprimé si le paiement est défait (commande annulée, contestation
    « erreur au comptoir », passage en retenue, reçu annulé) tant que le
    mois est ouvert. Un retrait annulé ne le défait pas (commandé = dû).
    """
    MODE_CHOICES = [
        ('compte',  'Débité du compte repas'),
        ('caisse',  'Payé à la caisse'),   # historique (régularisation)
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


# ============================================================
# JEUX (quiz à lots) — règles dans jeux.py
# ============================================================

class Jeu(models.Model):
    """
    Quiz à lots. Deux modes :
      - libre  : chacun joue UNE partie quand il veut entre debut et fin ;
                 questions tirées au hasard dans la banque (nb_questions) ;
      - direct : tout le monde joue au même moment ; la question i est
                 ouverte pour tous à la même heure (debut + durées des
                 questions précédentes) ; fin = debut + somme des durées.
    Une partie commencée ne s'arrête jamais : le temps est tenu par le serveur.
    """
    MODE_CHOICES = [('libre', 'Libre (chacun joue quand il veut)'), ('direct', 'En direct (tous au même moment)')]
    titre        = models.CharField(max_length=150)
    description  = models.TextField(blank=True)
    mode         = models.CharField(max_length=10, choices=MODE_CHOICES, default='libre')
    debut        = models.DateTimeField()
    fin          = models.DateTimeField()
    # Nombre de questions par partie (tirées dans la banque) ; direct : même tirage pour tous
    nb_questions = models.PositiveSmallIntegerField(default=10)
    # Participation : au moins N repas commandés (non annulés) dans le mois du début du jeu
    repas_minimum = models.PositiveSmallIntegerField(default=1)
    compter_repas_offerts = models.BooleanField(default=False)
    # Bonus de rapidité : jusqu'à N % des points de la question selon le temps restant
    bonus_rapidite_pct = models.PositiveSmallIntegerField(default=50, validators=[MaxValueValidator(100)])
    # Pour gagner un lot : au moins N % de bonnes réponses (0 : pas de minimum)
    score_minimum_pct = models.PositiveSmallIntegerField(default=0, validators=[MaxValueValidator(100)])
    # Un employé qui a gagné un lot dans les N derniers jours n'en gagne pas (0 : pas de limite)
    exclure_gagnants_jours = models.PositiveSmallIntegerField(default=0)
    # Agences concernées (aucune : toutes)
    agences      = models.ManyToManyField(Agence, blank=True, related_name='jeux')
    # Direct : questions tirées à la programmation (liste d'ids, ordre de jeu)
    tirage_direct = models.JSONField(default=list, blank=True)
    publie_le    = models.DateTimeField(null=True, blank=True)       # programmé (visible, notifié)
    resultats_publies_le = models.DateTimeField(null=True, blank=True)
    annule_le    = models.DateTimeField(null=True, blank=True)
    # Notifications automatiques déjà envoyées (taches_planifiees)
    rappel_envoye_le    = models.DateTimeField(null=True, blank=True)   # direct : 15 min avant
    ouverture_envoyee_le = models.DateTimeField(null=True, blank=True)
    relance_envoyee_le  = models.DateTimeField(null=True, blank=True)   # libre : veille de la fin
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)
    user_created = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='+')

    class Meta:
        db_table = 'jeu'
        ordering = ['-debut', '-id']

    def __str__(self):
        return self.titre


class QuestionJeu(models.Model):
    jeu      = models.ForeignKey(Jeu, on_delete=models.CASCADE, related_name='questions')
    texte    = models.CharField(max_length=500)
    duree    = models.PositiveSmallIntegerField(default=20,
                                                validators=[MinValueValidator(5), MaxValueValidator(600)])
    points   = models.PositiveSmallIntegerField(default=100)
    ordre    = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'jeu_question'
        ordering = ['ordre', 'id']


class ReponseJeu(models.Model):
    question = models.ForeignKey(QuestionJeu, on_delete=models.CASCADE, related_name='reponses')
    texte    = models.CharField(max_length=255)
    correcte = models.BooleanField(default=False)
    ordre    = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'jeu_reponse'
        ordering = ['ordre', 'id']


class LotJeu(models.Model):
    """Lot attribué aux rangs rang_debut à rang_fin (un exemplaire par rang)."""
    TYPE_CHOICES = [('objet', 'Objet (remis en main propre)'),
                    ('argent', 'Argent (crédité sur le compte repas)')]
    jeu        = models.ForeignKey(Jeu, on_delete=models.CASCADE, related_name='lots')
    rang_debut = models.PositiveSmallIntegerField()
    rang_fin   = models.PositiveSmallIntegerField()
    libelle    = models.CharField(max_length=150)
    type       = models.CharField(max_length=10, choices=TYPE_CHOICES, default='objet')
    montant    = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = 'jeu_lot'
        ordering = ['rang_debut']


class ParticipationJeu(models.Model):
    STATUT_LOT_CHOICES = [
        ('',           'Aucun lot'),
        ('a_remettre', 'À remettre'),
        ('remis',      'Retiré'),
        ('credite',    'Crédité sur le compte repas'),
    ]
    jeu         = models.ForeignKey(Jeu, on_delete=models.CASCADE, related_name='participations')
    user        = models.ForeignKey(User, on_delete=models.CASCADE, related_name='participations_jeux')
    debut_le    = models.DateTimeField()
    termine_le  = models.DateTimeField(null=True, blank=True)
    # Questions de la partie, dans l'ordre (ids)
    questions   = models.JSONField(default=list)
    points      = models.PositiveIntegerField(default=0)
    nb_bonnes   = models.PositiveSmallIntegerField(default=0)
    temps_total_ms = models.PositiveIntegerField(default=0)
    # Départage final (tirage au sort enregistré à la création)
    tirage      = models.FloatField(default=0)
    nb_repas    = models.PositiveSmallIntegerField(default=0)    # au démarrage, puis à la publication
    exclu_motif = models.CharField(max_length=255, blank=True)   # non classé (condition non remplie…)
    rang        = models.PositiveIntegerField(null=True, blank=True)
    lot         = models.ForeignKey(LotJeu, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='gagnants')
    lot_motif   = models.CharField(max_length=255, blank=True)   # pourquoi pas de lot malgré le rang
    statut_lot  = models.CharField(max_length=12, choices=STATUT_LOT_CHOICES, blank=True, default='')
    lot_remis_le  = models.DateTimeField(null=True, blank=True)
    lot_remis_par = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    mouvement   = models.OneToOneField(MouvementCompte, on_delete=models.SET_NULL, null=True, blank=True,
                                       related_name='gain_jeu')

    class Meta:
        db_table = 'jeu_participation'
        constraints = [models.UniqueConstraint(fields=['jeu', 'user'], name='jeu_une_partie_par_employe')]


class ReponseJoueur(models.Model):
    """Question posée à un joueur : ouverte de debut_le à limite (heure serveur)."""
    participation = models.ForeignKey(ParticipationJeu, on_delete=models.CASCADE, related_name='reponses')
    question   = models.ForeignKey(QuestionJeu, on_delete=models.CASCADE, related_name='+')
    index      = models.PositiveSmallIntegerField()
    debut_le   = models.DateTimeField()
    limite     = models.DateTimeField()
    # Ordre des réponses présenté au joueur (ids, mélangés)
    ordre_reponses = models.JSONField(default=list)
    reponse    = models.ForeignKey(ReponseJeu, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    repondu_le = models.DateTimeField(null=True, blank=True)
    correcte   = models.BooleanField(default=False)
    points     = models.PositiveSmallIntegerField(default=0)
    temps_ms   = models.PositiveIntegerField(default=0)
    cloturee   = models.BooleanField(default=False)   # répondue ou temps écoulé

    class Meta:
        db_table = 'jeu_reponse_joueur'
        ordering = ['index']
        constraints = [models.UniqueConstraint(fields=['participation', 'index'], name='jeu_question_unique')]


# ============================================================
# GAINS DES JEUX (défis, pronostics, tickets) — remise unique
# ============================================================

class GainJeu(models.Model):
    """
    Lot gagné à un jeu autre que le quiz (le quiz garde ParticipationJeu) :
    argent crédité sur le compte repas (« credite ») ou objet « a_remettre »
    puis « remis » une seule fois (gestionnaire de l'agence, administrateur).
    """
    SOURCE_CHOICES = [('defis', 'Défis'), ('pronostics', 'Pronostics'), ('ticket', 'Ticket à gratter')]
    TYPE_CHOICES = [('objet', 'Objet'), ('argent', 'Argent')]
    STATUT_CHOICES = [('a_remettre', 'À remettre'), ('remis', 'Retiré'), ('credite', 'Crédité')]
    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='gains_jeux')
    source     = models.CharField(max_length=12, choices=SOURCE_CHOICES)
    source_id  = models.PositiveIntegerField()               # campagne / compétition
    titre_jeu  = models.CharField(max_length=150)
    libelle    = models.CharField(max_length=150)
    type       = models.CharField(max_length=10, choices=TYPE_CHOICES, default='objet')
    montant    = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    statut_lot = models.CharField(max_length=12, choices=STATUT_CHOICES, default='a_remettre')
    lot_remis_le  = models.DateTimeField(null=True, blank=True)
    lot_remis_par = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    mouvement  = models.OneToOneField(MouvementCompte, on_delete=models.SET_NULL, null=True, blank=True,
                                      related_name='gain_autre_jeu')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'jeu_gain'
        ordering = ['-created_at', '-id']


# ============================================================
# DÉFIS ET BADGES (mois) — règles dans defis.py
# ============================================================

class CampagneDefis(models.Model):
    """Défis d'un mois : chaque défi est actif si son objectif et ses points sont > 0."""
    titre       = models.CharField(max_length=150)
    annee       = models.PositiveSmallIntegerField()
    mois        = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])
    agences     = models.ManyToManyField(Agence, blank=True, related_name='campagnes_defis')
    # Commander N jours de service de suite
    serie_jours   = models.PositiveSmallIntegerField(default=5)
    serie_points  = models.PositiveSmallIntegerField(default=20)
    # Goûter N plats différents (jamais commandés avant le mois si plats_nouveaux)
    plats_nombre  = models.PositiveSmallIntegerField(default=3)
    plats_points  = models.PositiveSmallIntegerField(default=15)
    plats_nouveaux = models.BooleanField(default=True)
    # Donner son avis sur N repas du mois
    avis_nombre   = models.PositiveSmallIntegerField(default=5)
    avis_points   = models.PositiveSmallIntegerField(default=10)
    # Retirer tous ses repas du mois (au moins retraits_minimum commandés)
    retraits_minimum = models.PositiveSmallIntegerField(default=5)
    retraits_points  = models.PositiveSmallIntegerField(default=25)
    publie_le   = models.DateTimeField(null=True, blank=True)
    annule_le   = models.DateTimeField(null=True, blank=True)
    cloture_le  = models.DateTimeField(null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)
    user_created = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='+')

    class Meta:
        db_table = 'defis_campagne'
        ordering = ['-annee', '-mois', '-id']


class PalierDefis(models.Model):
    """Récompense dès points_min points (l'employé reçoit celle du plus haut palier atteint)."""
    campagne   = models.ForeignKey(CampagneDefis, on_delete=models.CASCADE, related_name='paliers')
    nom        = models.CharField(max_length=50)                 # Bronze, Argent, Or
    points_min = models.PositiveSmallIntegerField()
    libelle    = models.CharField(max_length=150, blank=True)    # récompense (objet)
    type       = models.CharField(max_length=10, choices=GainJeu.TYPE_CHOICES, default='argent')
    montant    = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    quantite   = models.PositiveIntegerField(null=True, blank=True)   # vide : illimité

    class Meta:
        db_table = 'defis_palier'
        ordering = ['points_min']


class DefiReussi(models.Model):
    DEFI_CHOICES = [('serie', 'Fidèle'), ('plats', 'Gourmet curieux'), ('avis', 'Critique culinaire'),
                    ('retraits', 'Zéro oubli')]
    campagne  = models.ForeignKey(CampagneDefis, on_delete=models.CASCADE, related_name='reussites')
    user      = models.ForeignKey(User, on_delete=models.CASCADE, related_name='defis_reussis')
    defi      = models.CharField(max_length=10, choices=DEFI_CHOICES)
    points    = models.PositiveSmallIntegerField()
    reussi_le = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'defis_reussi'
        constraints = [models.UniqueConstraint(fields=['campagne', 'user', 'defi'], name='defi_unique')]


class ResultatDefis(models.Model):
    """Bilan à la clôture du mois."""
    campagne = models.ForeignKey(CampagneDefis, on_delete=models.CASCADE, related_name='resultats')
    user     = models.ForeignKey(User, on_delete=models.CASCADE, related_name='resultats_defis')
    points   = models.PositiveIntegerField()
    rang     = models.PositiveIntegerField()
    palier   = models.ForeignKey(PalierDefis, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    gain     = models.OneToOneField(GainJeu, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta:
        db_table = 'defis_resultat'
        constraints = [models.UniqueConstraint(fields=['campagne', 'user'], name='defis_resultat_unique')]


# ============================================================
# PRONOSTICS — règles dans pronostics.py
# ============================================================

class CompetitionPronostics(models.Model):
    titre        = models.CharField(max_length=150)
    description  = models.TextField(blank=True)
    agences      = models.ManyToManyField(Agence, blank=True, related_name='competitions')
    points_exact = models.PositiveSmallIntegerField(default=3)     # score exact
    points_resultat = models.PositiveSmallIntegerField(default=1)  # bon vainqueur / nul
    # Pronostiquer un match : au moins N repas commandés dans le mois du match
    repas_minimum = models.PositiveSmallIntegerField(default=1)
    publie_le    = models.DateTimeField(null=True, blank=True)
    annule_le    = models.DateTimeField(null=True, blank=True)
    resultats_publies_le = models.DateTimeField(null=True, blank=True)
    rappel_du    = models.DateField(null=True, blank=True)        # dernier rappel quotidien
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)
    user_created = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='+')

    class Meta:
        db_table = 'prono_competition'
        ordering = ['-created_at', '-id']


class LotPronostics(models.Model):
    competition = models.ForeignKey(CompetitionPronostics, on_delete=models.CASCADE, related_name='lots')
    rang_debut  = models.PositiveSmallIntegerField()
    rang_fin    = models.PositiveSmallIntegerField()
    libelle     = models.CharField(max_length=150)
    type        = models.CharField(max_length=10, choices=GainJeu.TYPE_CHOICES, default='objet')
    montant     = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = 'prono_lot'
        ordering = ['rang_debut']


class MatchPronostics(models.Model):
    competition = models.ForeignKey(CompetitionPronostics, on_delete=models.CASCADE, related_name='matchs')
    equipe_a    = models.CharField(max_length=80)
    equipe_b    = models.CharField(max_length=80)
    phase       = models.CharField(max_length=80, blank=True)     # Groupe A, Quart de finale…
    coup_envoi  = models.DateTimeField()
    score_a     = models.PositiveSmallIntegerField(null=True, blank=True)
    score_b     = models.PositiveSmallIntegerField(null=True, blank=True)
    annule      = models.BooleanField(default=False)               # match reporté / annulé : 0 point
    score_saisi_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'prono_match'
        ordering = ['coup_envoi', 'id']


class Pronostic(models.Model):
    match      = models.ForeignKey(MatchPronostics, on_delete=models.CASCADE, related_name='pronostics')
    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='pronostics')
    score_a    = models.PositiveSmallIntegerField()
    score_b    = models.PositiveSmallIntegerField()
    points     = models.PositiveSmallIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'prono_pronostic'
        constraints = [models.UniqueConstraint(fields=['match', 'user'], name='prono_unique')]


class ResultatPronostics(models.Model):
    competition = models.ForeignKey(CompetitionPronostics, on_delete=models.CASCADE, related_name='resultats')
    user        = models.ForeignKey(User, on_delete=models.CASCADE, related_name='resultats_pronostics')
    rang        = models.PositiveIntegerField()
    points      = models.PositiveIntegerField()
    nb_exacts   = models.PositiveSmallIntegerField(default=0)
    nb_resultats = models.PositiveSmallIntegerField(default=0)
    tirage      = models.FloatField(default=0)
    lot         = models.ForeignKey(LotPronostics, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    gain        = models.OneToOneField(GainJeu, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta:
        db_table = 'prono_resultat'
        constraints = [models.UniqueConstraint(fields=['competition', 'user'], name='prono_resultat_unique')]


# ============================================================
# TICKETS À GRATTER — règles dans tickets.py
# ============================================================

class CampagneTickets(models.Model):
    titre       = models.CharField(max_length=150)
    debut       = models.DateTimeField()
    fin         = models.DateTimeField()
    agences     = models.ManyToManyField(Agence, blank=True, related_name='campagnes_tickets')
    ticket_par_retrait = models.BooleanField(default=True)    # un ticket par repas retiré
    ticket_quotidien   = models.BooleanField(default=False)   # un ticket gratuit par jour ouvré
    budget_max  = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)  # lots en argent
    validite_jours = models.PositiveSmallIntegerField(default=7)   # pour gratter après la fin
    publie_le   = models.DateTimeField(null=True, blank=True)
    annule_le   = models.DateTimeField(null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)
    user_created = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='+')

    class Meta:
        db_table = 'ticket_campagne'
        ordering = ['-debut', '-id']


class LotTicket(models.Model):
    campagne    = models.ForeignKey(CampagneTickets, on_delete=models.CASCADE, related_name='lots')
    libelle     = models.CharField(max_length=150)
    type        = models.CharField(max_length=10, choices=GainJeu.TYPE_CHOICES, default='objet')
    montant     = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    stock       = models.PositiveIntegerField()
    probabilite = models.DecimalField(max_digits=6, decimal_places=3)   # % par ticket gratté
    distribues  = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'ticket_lot'
        ordering = ['-montant', 'id']


class Ticket(models.Model):
    SOURCE_CHOICES = [('retrait', 'Repas retiré'), ('quotidien', 'Ticket du jour')]
    campagne  = models.ForeignKey(CampagneTickets, on_delete=models.CASCADE, related_name='tickets')
    user      = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tickets')
    source    = models.CharField(max_length=10, choices=SOURCE_CHOICES)
    retrait   = models.OneToOneField(Retrait, on_delete=models.SET_NULL, null=True, blank=True, related_name='ticket')
    jour      = models.DateField(null=True, blank=True)
    cree_le   = models.DateTimeField(default=timezone.now)
    gratte_le = models.DateTimeField(null=True, blank=True)
    lot       = models.ForeignKey(LotTicket, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    gain      = models.OneToOneField(GainJeu, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta:
        db_table = 'ticket'
        ordering = ['-cree_le', '-id']
        constraints = [models.UniqueConstraint(fields=['campagne', 'user', 'jour'], name='ticket_quotidien_unique')]
