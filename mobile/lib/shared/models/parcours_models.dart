// lib/shared/models/parcours_models.dart
//
// Parcours de commande « agence → prestataire → équipe → jour » (onglet
// Menus). API : commander/agences/, commander/prestataires/,
// commander/prestataires/<id>/equipes/, commander/jours/.

import '../../core/config.dart';
import 'models.dart';

String? _url(dynamic v) {
  final url = v is String ? v.trim() : null;
  if (url == null || url.isEmpty) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return '${AppConfig.serverUrl}${url.startsWith('/') ? '' : '/'}$url';
}

int _int(dynamic v, [int defaut = 0]) =>
    v is num ? v.toInt() : int.tryParse('${v ?? ''}') ?? defaut;

int? _intOuNull(dynamic v) =>
    v is num ? v.toInt() : (v is String ? int.tryParse(v) : null);

double? _double(dynamic v) =>
    v is num ? v.toDouble() : (v is String ? double.tryParse(v) : null);

String _texte(dynamic v) => v == null ? '' : '$v';

List<Map<String, dynamic>> _maps(dynamic v) => v is List
    ? v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
    : const [];

Map<String, dynamic> _map(dynamic v) =>
    v is Map ? Map<String, dynamic>.from(v) : const {};

/// « AAAA-MM-JJ » → date locale (sans heure)
DateTime? jourIso(dynamic v) {
  final d = DateTime.tryParse(_texte(v));
  return d == null ? null : DateTime(d.year, d.month, d.day);
}

/// Date locale → « AAAA-MM-JJ »
String isoJour(DateTime d) => '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Lundi de la semaine de [d] (sans heure)
DateTime lundiSemaine(DateTime d) =>
    DateTime(d.year, d.month, d.day).subtract(Duration(days: d.weekday - 1));

// ══════════════════════════════════════════════════════════════
// AGENCES
// ══════════════════════════════════════════════════════════════

class AgenceCommande {
  final int id;
  final String nom;
  final String code;
  final bool monAgence;
  final bool accepterAutresAgences;

  /// Agence où l'utilisateur est programmé en mission (équipe sur planning)
  final bool mission;
  final int nbPrestatairesAujourdhui;
  final int nbPrestatairesSemaine;
  final String? heureDebutService;
  final String? heureFinService;

  const AgenceCommande({
    required this.id,
    required this.nom,
    this.code = '',
    this.monAgence = false,
    this.accepterAutresAgences = false,
    this.mission = false,
    this.nbPrestatairesAujourdhui = 0,
    this.nbPrestatairesSemaine = 0,
    this.heureDebutService,
    this.heureFinService,
  });

  factory AgenceCommande.fromJson(Map<String, dynamic> j) => AgenceCommande(
        id: _int(j['id']),
        nom: _texte(j['nom']),
        code: _texte(j['code']),
        monAgence: j['mon_agence'] == true,
        accepterAutresAgences: j['accepter_autres_agences'] == true,
        mission: j['mission'] == true,
        nbPrestatairesAujourdhui: _int(j['nb_prestataires_aujourdhui']),
        nbPrestatairesSemaine: _int(j['nb_prestataires_semaine']),
        heureDebutService: j['heure_debut_service'] as String?,
        heureFinService: j['heure_fin_service'] as String?,
      );
}

/// Équipe de l'utilisateur (Paramètres → Utilisateurs)
class EquipeUtilisateur {
  final int id;
  final String libelle;
  const EquipeUtilisateur({required this.id, this.libelle = ''});

  static EquipeUtilisateur? fromJsonOuNull(dynamic v) {
    if (v is! Map || _intOuNull(v['id']) == null) return null;
    return EquipeUtilisateur(id: _int(v['id']), libelle: _texte(v['libelle']));
  }
}

class AgencesCommande {
  final DateTime? date;
  final int? monAgenceId;

  /// Employé sans agence : il ne commande que dans les agences ouvertes aux
  /// autres agences (aucune → « Votre agence n'est pas renseignée »)
  final bool sansAgence;
  final EquipeUtilisateur? equipeUtilisateur;
  final List<AgenceCommande> agences;

  const AgencesCommande(
      {this.date,
      this.monAgenceId,
      this.sansAgence = false,
      this.equipeUtilisateur,
      this.agences = const []});

  factory AgencesCommande.fromJson(Map<String, dynamic> j) => AgencesCommande(
        date: jourIso(j['date']),
        monAgenceId: _intOuNull(j['mon_agence_id']),
        sansAgence: j['sans_agence'] is bool
            ? j['sans_agence'] as bool
            : _intOuNull(j['mon_agence_id']) == null,
        equipeUtilisateur:
            EquipeUtilisateur.fromJsonOuNull(j['equipe_utilisateur']),
        agences: _maps(j['agences']).map(AgenceCommande.fromJson).toList(),
      );

  /// Aucune agence où commander : agence non renseignée et aucune ouverte
  bool get agenceNonRenseignee => sansAgence && agences.isEmpty;

  AgenceCommande? get monAgence =>
      agences.where((a) => a.monAgence).firstOrNull ??
      agences.where((a) => a.id == monAgenceId).firstOrNull;
}

// ══════════════════════════════════════════════════════════════
// PRESTATAIRES
// ══════════════════════════════════════════════════════════════

/// Équipe servie par un prestataire (avec les horaires de retrait)
class EquipeService {
  final int id;
  final String libelle;
  final String? heureDebutService;
  final String? heureFinService;

  /// Équipe de l'utilisateur (null : aucune équipe ne lui est attribuée)
  final bool? monEquipe;

  const EquipeService(
      {required this.id,
      required this.libelle,
      this.heureDebutService,
      this.heureFinService,
      this.monEquipe});

  factory EquipeService.fromJson(Map<String, dynamic> j) => EquipeService(
        id: _int(j['id']),
        libelle: _texte(j['libelle']),
        heureDebutService: j['heure_debut_service'] as String?,
        heureFinService: j['heure_fin_service'] as String?,
        monEquipe: j['mon_equipe'] is bool ? j['mon_equipe'] as bool : null,
      );
}

class ProchainJourAReserver {
  final DateTime date;
  final String libelle;
  final DateTime? dateLimiteCommande;
  final String libelleLimite;

  const ProchainJourAReserver(
      {required this.date,
      this.libelle = '',
      this.dateLimiteCommande,
      this.libelleLimite = ''});

  static ProchainJourAReserver? fromJsonOuNull(dynamic v) {
    final j = _map(v);
    final date = jourIso(j['date']);
    if (date == null) return null;
    return ProchainJourAReserver(
      date: date,
      libelle: _texte(j['libelle']),
      dateLimiteCommande:
          DateTime.tryParse(_texte(j['date_limite_commande']))?.toUtc(),
      libelleLimite: _texte(j['libelle_limite']),
    );
  }
}

/// Profil public d'un prestataire dans le parcours (id 0 : « Cantine
/// UbiPharm », menus sans prestataire)
class PrestataireCommande {
  final int id;
  final String libelle;
  final String nomAffiche;
  final bool cantineUbipharm;
  final String? logoUrl;
  final String? photoCouvertureUrl;
  final List<String> photosPlats;
  final String descriptionCourte;
  final String cuisine;
  final List<String> tags;

  /// Moyenne des avis (null : pas assez d'avis, voir [nouveau])
  final double? note;
  final int nbAvis;
  final bool nouveau;
  final int nbPlatsJour;
  final List<EquipeService> equipes;
  final bool commandeAujourdhui;
  final ProchainJourAReserver? prochainJourAReserver;

  const PrestataireCommande({
    required this.id,
    required this.nomAffiche,
    this.libelle = '',
    this.cantineUbipharm = false,
    this.logoUrl,
    this.photoCouvertureUrl,
    this.photosPlats = const [],
    this.descriptionCourte = '',
    this.cuisine = '',
    this.tags = const [],
    this.note,
    this.nbAvis = 0,
    this.nouveau = true,
    this.nbPlatsJour = 0,
    this.equipes = const [],
    this.commandeAujourdhui = false,
    this.prochainJourAReserver,
  });

  factory PrestataireCommande.fromJson(Map<String, dynamic> j) {
    final libelle = _texte(j['libelle']);
    final nom = _texte(j['nom_affiche']).trim();
    final note = _double(j['note']);
    return PrestataireCommande(
      id: _int(j['id']),
      libelle: libelle,
      nomAffiche: nom.isNotEmpty ? nom : libelle,
      cantineUbipharm: j['cantine_ubipharm'] == true,
      logoUrl: _url(j['logo_url']),
      photoCouvertureUrl: _url(j['photo_couverture_url']),
      photosPlats: (j['photos_plats'] as List? ?? const [])
          .map(_url)
          .whereType<String>()
          .toList(),
      descriptionCourte: _texte(j['description_courte']).trim(),
      cuisine: _texte(j['cuisine']).trim(),
      tags: (j['tags'] as List? ?? const []).map((e) => '$e').toList(),
      note: note,
      nbAvis: _int(j['nb_avis']),
      // Absent : nouveau tant qu'aucune note n'est fournie
      nouveau: j['nouveau'] is bool ? j['nouveau'] as bool : note == null,
      nbPlatsJour: _int(j['nb_plats_jour']),
      equipes: _maps(j['equipes']).map(EquipeService.fromJson).toList(),
      commandeAujourdhui: j['commande_aujourdhui'] == true,
      prochainJourAReserver:
          ProchainJourAReserver.fromJsonOuNull(j['prochain_jour_a_reserver']),
    );
  }

  /// Note affichable (assez d'avis)
  bool get aUneNote => !nouveau && note != null;

  /// Le prestataire sert l'équipe de l'utilisateur
  bool get sertMonEquipe => equipes.any((e) => e.monEquipe == true);
}

class PrestatairesAgence {
  final int agenceId;
  final String agenceNom;
  final DateTime? date;
  final int seuilAvisNote;
  final List<PrestataireCommande> prestataires;

  const PrestatairesAgence({
    required this.agenceId,
    required this.agenceNom,
    this.date,
    this.seuilAvisNote = 5,
    this.prestataires = const [],
  });

  factory PrestatairesAgence.fromJson(Map<String, dynamic> j) {
    final agence = _map(j['agence']);
    return PrestatairesAgence(
      agenceId: _int(agence['id']),
      agenceNom: _texte(agence['nom']),
      date: jourIso(j['date']),
      seuilAvisNote: _int(j['seuil_avis_note'], 5),
      prestataires:
          _maps(j['prestataires']).map(PrestataireCommande.fromJson).toList(),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// ÉQUIPES D'UN PRESTATAIRE
// ══════════════════════════════════════════════════════════════

class EquipeCommande {
  final int id;
  final String libelle;

  /// Équipe de l'utilisateur (User.typeequipe) ; null : aucune équipe ne lui
  /// est attribuée
  final bool? monEquipe;
  final String? heureDebutService;
  final String? heureFinService;
  final List<DateTime> jours;
  final int nbJours;
  final DateTime? prochainMenu;

  /// Équipe réservée aux employés programmés (ex. Nuit)
  final bool surPlanning;

  /// « Programmé(e) du 09/11 au 13/11/2026 » : période de l'utilisateur dans
  /// une équipe sur planning (vide sinon)
  final String programmation;

  const EquipeCommande({
    required this.id,
    required this.libelle,
    this.monEquipe,
    this.heureDebutService,
    this.heureFinService,
    this.jours = const [],
    this.nbJours = 0,
    this.prochainMenu,
    this.surPlanning = false,
    this.programmation = '',
  });

  factory EquipeCommande.fromJson(Map<String, dynamic> j) {
    final jours = (j['jours'] as List? ?? const [])
        .map(jourIso)
        .whereType<DateTime>()
        .toList();
    return EquipeCommande(
      id: _int(j['id']),
      libelle: _texte(j['libelle']),
      monEquipe: j['mon_equipe'] is bool ? j['mon_equipe'] as bool : null,
      heureDebutService: j['heure_debut_service'] as String?,
      heureFinService: j['heure_fin_service'] as String?,
      jours: jours,
      nbJours: _int(j['nb_jours'], jours.length),
      prochainMenu: jourIso(j['prochain_menu']),
      surPlanning: j['sur_planning'] == true,
      programmation: j['programmation'] is Map
          ? _texte((j['programmation'] as Map)['libelle'])
          : '',
    );
  }
}

class EquipesPrestataire {
  final int agenceId;
  final String agenceNom;
  final PrestataireCommande? prestataire;
  final EquipeUtilisateur? equipeUtilisateur;

  /// Équipe de l'utilisateur en premier (serveur)
  final List<EquipeCommande> equipes;

  const EquipesPrestataire({
    required this.agenceId,
    required this.agenceNom,
    this.prestataire,
    this.equipeUtilisateur,
    this.equipes = const [],
  });

  /// Équipe à présélectionner : la seule, sinon celle de l'utilisateur
  EquipeCommande? get equipeParDefaut => equipes.length == 1
      ? equipes.first
      : equipes.where((e) => e.monEquipe == true).firstOrNull;

  factory EquipesPrestataire.fromJson(Map<String, dynamic> j) {
    final agence = _map(j['agence']);
    final p = j['prestataire'];
    return EquipesPrestataire(
      agenceId: _int(agence['id']),
      agenceNom: _texte(agence['nom']),
      prestataire: p is Map
          ? PrestataireCommande.fromJson(Map<String, dynamic>.from(p))
          : null,
      equipeUtilisateur:
          EquipeUtilisateur.fromJsonOuNull(j['equipe_utilisateur']),
      equipes: _maps(j['equipes']).map(EquipeCommande.fromJson).toList(),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// JOURS D'UNE SEMAINE
// ══════════════════════════════════════════════════════════════

enum EtatJour {
  pasDeMenu,
  reserve,
  aReserver,
  ferme,

  /// Équipe sur planning : l'employé n'y est pas programmé ce jour-là
  nonProgramme;

  static EtatJour depuis(dynamic v) => switch (v) {
        'reserve' => EtatJour.reserve,
        'a_reserver' => EtatJour.aReserver,
        'ferme' => EtatJour.ferme,
        'non_programme' => EtatJour.nonProgramme,
        _ => EtatJour.pasDeMenu,
      };
}

enum StatutPlatJour {
  disponible,
  commande,
  autrePlatCommande,
  ferme;

  static StatutPlatJour depuis(dynamic v) => switch (v) {
        'commande' => StatutPlatJour.commande,
        'autre_plat_commande' => StatutPlatJour.autrePlatCommande,
        'ferme' => StatutPlatJour.ferme,
        _ => StatutPlatJour.disponible,
      };
}

class MenuJour {
  final int id;
  final int typeEquipeId;
  final String typeEquipe;
  const MenuJour(
      {required this.id, required this.typeEquipeId, this.typeEquipe = ''});
  factory MenuJour.fromJson(Map<String, dynamic> j) => MenuJour(
        id: _int(j['id']),
        typeEquipeId: _int(j['typeequipe_id']),
        typeEquipe: _texte(j['typeequipe']),
      );
}

/// Commande de l'utilisateur ce jour-là (ici ou ailleurs)
class CommandeJour {
  final int id;
  final String statut;
  final int? platId;
  final String plat;
  final int? menuId;
  final int? agenceId;
  final String agence;
  final int? prestataireId;
  final String prestataire;
  final int? typeEquipeId;
  final String? modePaiement;

  /// Commande passée dans la sélection affichée (agence + prestataire +
  /// équipe)
  final bool ici;

  const CommandeJour({
    required this.id,
    this.statut = 'en_attente',
    this.platId,
    this.plat = '',
    this.menuId,
    this.agenceId,
    this.agence = '',
    this.prestataireId,
    this.prestataire = '',
    this.typeEquipeId,
    this.modePaiement,
    this.ici = false,
  });

  static CommandeJour? fromJsonOuNull(dynamic v) {
    if (v is! Map) return null;
    final j = Map<String, dynamic>.from(v);
    return CommandeJour(
      id: _int(j['id']),
      statut: _texte(j['statut']),
      platId: _intOuNull(j['plat_id']),
      plat: _texte(j['plat']),
      menuId: _intOuNull(j['menu_id']),
      agenceId: _intOuNull(j['agence_id']),
      agence: _texte(j['agence']),
      prestataireId: _intOuNull(j['prestataire_id']),
      prestataire: _texte(j['prestataire']),
      typeEquipeId: _intOuNull(j['typeequipe_id']),
      modePaiement: j['mode_paiement'] as String?,
      ici: j['ici'] == true,
    );
  }
}

class PlatJour {
  final int id;
  final String nom;
  final String description;
  final int? typePlatId;
  final String? typePlat;
  final List<String> mentions;
  final String? photoUrl;
  final List<String> photos;
  final double? note;
  final int nbAvis;
  final bool nouveau;
  final double? prix;
  final int menuId;
  final int? typeEquipeId;
  final String typeEquipe;
  final StatutPlatJour statut;
  final int? commandeId;

  /// Annulation possible jusqu'à cette date (affichée avant de commander)
  final DateTime? dateLimiteAnnulation;
  final String libelleAnnulation;

  const PlatJour({
    required this.id,
    required this.nom,
    this.description = '',
    this.typePlatId,
    this.typePlat,
    this.mentions = const [],
    this.photoUrl,
    this.photos = const [],
    this.note,
    this.nbAvis = 0,
    this.nouveau = true,
    this.prix,
    required this.menuId,
    this.typeEquipeId,
    this.typeEquipe = '',
    this.statut = StatutPlatJour.disponible,
    this.commandeId,
    this.dateLimiteAnnulation,
    this.libelleAnnulation = '',
  });

  factory PlatJour.fromJson(Map<String, dynamic> j) {
    final note = _double(j['note']);
    final photos = (j['photos'] as List? ?? const [])
        .map(_url)
        .whereType<String>()
        .toList();
    final type = _texte(j['type_plat']).trim();
    return PlatJour(
      id: _int(j['id']),
      nom: _texte(j['nom']),
      description: _texte(j['description']),
      typePlatId: _intOuNull(j['type_plat_id']),
      typePlat: type.isEmpty ? null : type,
      mentions: (j['mentions'] as List? ?? const []).map((e) => '$e').toList(),
      photoUrl: _url(j['photo_url']) ?? photos.firstOrNull,
      photos: photos,
      note: note,
      nbAvis: _int(j['nb_avis']),
      nouveau: j['nouveau'] is bool ? j['nouveau'] as bool : note == null,
      prix: _double(j['prix']),
      menuId: _int(j['menu_id']),
      typeEquipeId: _intOuNull(j['typeequipe_id']),
      typeEquipe: _texte(j['typeequipe']),
      statut: StatutPlatJour.depuis(j['statut']),
      commandeId: _intOuNull(j['commande_id']),
      dateLimiteAnnulation:
          DateTime.tryParse(_texte(j['date_limite_annulation']))?.toUtc(),
      libelleAnnulation: _texte(j['libelle_annulation']),
    );
  }

  bool get aUneNote => !nouveau && note != null;

  /// Plat au format des écrans existants (fiche détaillée du plat)
  Plat versPlat() {
    final images = <PlatImage>[];
    final urls = [
      if (photoUrl != null) photoUrl!,
      ...photos.where((p) => p != photoUrl),
    ];
    for (var i = 0; i < urls.length; i++) {
      images.add(PlatImage(id: i, url: urls[i], isPrincipale: i == 0));
    }
    return Plat(
      id: id,
      nom: nom,
      description: description,
      typePlatLibelle: typePlat,
      images: images,
      noteMoyenne: aUneNote ? note : null,
      nbAvis: nbAvis,
    );
  }
}

class JourCommande {
  final DateTime date;
  final String libelle;
  final EtatJour etat;
  final DateTime? dateLimiteCommande;
  final String libelleLimite;

  /// Annulation possible jusqu'à cette date (« Annulable jusqu'au … »)
  final DateTime? dateLimiteAnnulation;
  final String libelleAnnulation;
  final List<MenuJour> menus;
  final CommandeJour? commande;
  final List<PlatJour> plats;

  /// « Vous n'êtes pas programmé(e) dans l'équipe Nuit le sam. 14/11. »
  final String motifIndisponible;

  const JourCommande({
    required this.date,
    this.libelle = '',
    this.etat = EtatJour.pasDeMenu,
    this.dateLimiteCommande,
    this.libelleLimite = '',
    this.dateLimiteAnnulation,
    this.libelleAnnulation = '',
    this.menus = const [],
    this.commande,
    this.plats = const [],
    this.motifIndisponible = '',
  });

  factory JourCommande.fromJson(Map<String, dynamic> j) => JourCommande(
        date: jourIso(j['date']) ?? DateTime(1970),
        libelle: _texte(j['libelle']),
        etat: EtatJour.depuis(j['etat']),
        dateLimiteCommande:
            DateTime.tryParse(_texte(j['date_limite_commande']))?.toUtc(),
        libelleLimite: _texte(j['libelle_limite']),
        dateLimiteAnnulation:
            DateTime.tryParse(_texte(j['date_limite_annulation']))?.toUtc(),
        libelleAnnulation: _texte(j['libelle_annulation']),
        menus: _maps(j['menus']).map(MenuJour.fromJson).toList(),
        commande: CommandeJour.fromJsonOuNull(j['commande']),
        plats: _maps(j['plats']).map(PlatJour.fromJson).toList(),
        motifIndisponible: _texte(j['motif_indisponible']),
      );
}

class JoursCommande {
  final int agenceId;
  final String agenceNom;
  final PrestataireCommande? prestataire;
  final int? equipeId;
  final String? equipeLibelle;

  /// L'équipe choisie est celle de l'utilisateur (null : il n'en a pas)
  final bool? equipeMonEquipe;
  final DateTime debut;
  final DateTime fin;
  final DateTime? precedente;
  final DateTime? suivante;
  final DateTime? aujourdhui;
  final DateTime? jourParDefaut;
  final String? modePaiementPrefere;
  final List<JourCommande> jours;

  const JoursCommande({
    required this.agenceId,
    required this.agenceNom,
    this.prestataire,
    this.equipeId,
    this.equipeLibelle,
    this.equipeMonEquipe,
    required this.debut,
    required this.fin,
    this.precedente,
    this.suivante,
    this.aujourdhui,
    this.jourParDefaut,
    this.modePaiementPrefere,
    this.jours = const [],
  });

  factory JoursCommande.fromJson(Map<String, dynamic> j) {
    final agence = _map(j['agence']);
    final equipe = _map(j['equipe']);
    final semaine = _map(j['semaine']);
    final jours = _maps(j['jours']).map(JourCommande.fromJson).toList();
    final debut = jourIso(semaine['debut']) ??
        jours.firstOrNull?.date ??
        lundiSemaine(DateTime.now());
    final p = j['prestataire'];
    return JoursCommande(
      agenceId: _int(agence['id']),
      agenceNom: _texte(agence['nom']),
      prestataire: p is Map
          ? PrestataireCommande.fromJson(Map<String, dynamic>.from(p))
          : null,
      equipeId: _intOuNull(equipe['id']),
      equipeLibelle: equipe['libelle'] as String?,
      equipeMonEquipe:
          equipe['mon_equipe'] is bool ? equipe['mon_equipe'] as bool : null,
      debut: debut,
      fin: jourIso(semaine['fin']) ?? debut.add(const Duration(days: 6)),
      precedente: jourIso(semaine['precedente']),
      suivante: jourIso(semaine['suivante']),
      aujourdhui: jourIso(j['aujourdhui']),
      jourParDefaut: jourIso(j['jour_par_defaut']),
      modePaiementPrefere: j['mode_paiement_prefere'] as String?,
      jours: jours,
    );
  }

  JourCommande? jour(DateTime d) => jours
      .where((j) =>
          j.date.year == d.year &&
          j.date.month == d.month &&
          j.date.day == d.day)
      .firstOrNull;
}
