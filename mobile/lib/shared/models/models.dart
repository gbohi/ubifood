// lib/shared/models/models.dart

import 'package:intl/intl.dart';
import '../../core/config.dart';

/// Date limite lisible en heure locale : « dimanche 4 janvier à minuit »,
/// « lundi 5 janvier à 10:00 » (00:00 se lit « minuit » du jour précédent).
String libelleDateLimite(DateTime limite) {
  var d = limite.toLocal();
  if (d.hour == 0 && d.minute == 0) {
    d = d.subtract(const Duration(days: 1));
    return '${DateFormat('EEEE d MMMM', 'fr_FR').format(d)} à minuit';
  }
  return '${DateFormat('EEEE d MMMM', 'fr_FR').format(d)} à ${DateFormat('HH:mm').format(d)}';
}

// ── Helper : rendre une URL absolue ──────────────────────────
String? _absoluteUrl(String? url) {
  if (url == null || url.isEmpty) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return '${AppConfig.serverUrl}${url.startsWith('/') ? '' : '/'}$url';
}

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════

class AuthUser {
  final int id;
  final String username;
  final String email;
  final String nom;
  final String prenom;
  final List<int> groups;

  /// Noms des rôles renvoyés par l'API : super_admin, admin, gestionnaire, employe
  final List<String> roles;
  final bool isActive;
  final String? dernierService;
  final String? derniereAgence;
  final String? dernierPoste;
  final int? derniereCategoriesalarieId;
  final String? derniereCategoriesalarieLibelle;
  final int? derniereAgenceId; // ✅ ID agence du gestionnaire

  /// Photo de profil (URL absolue) ; null → initiales
  final String? photoUrl;

  const AuthUser({
    required this.id,
    required this.username,
    required this.email,
    required this.nom,
    required this.prenom,
    required this.groups,
    this.roles = const [],
    required this.isActive,
    this.dernierService,
    this.derniereAgence,
    this.dernierPoste,
    this.derniereCategoriesalarieId,
    this.derniereCategoriesalarieLibelle,
    this.derniereAgenceId,
    this.photoUrl,
  });

  String get fullName => '$nom $prenom'.trim();

  /// Initiales (prénom puis nom), comme sur le web : « Fatou KONE » → « FK »
  String get initiales {
    final lettres = [prenom, nom]
        .where((m) => m.trim().isNotEmpty)
        .map((m) => m.trim()[0].toUpperCase())
        .join();
    return lettres.isNotEmpty
        ? lettres
        : (username.isNotEmpty ? username[0].toUpperCase() : 'U');
  }

  bool get isAdmin => roles.contains('super_admin') || roles.contains('admin');

  /// Gestionnaire de cantine (les administrateurs ont aussi ces droits)
  bool get isGestionnaire => isAdmin || roles.contains('gestionnaire');

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['id'],
        username: json['username'] ?? '',
        email: json['email'] ?? '',
        nom: json['nom'] ?? '',
        prenom: json['prenom'] ?? '',
        groups: List<int>.from(json['groups'] ?? []),
        roles: List<String>.from(json['roles'] ?? []),
        isActive: json['is_active'] ?? true,
        dernierService: json['dernier_service']?['service_libelle'],
        derniereAgence: json['derniere_agence']?['agence_nom'],
        dernierPoste: json['dernier_poste']?['poste_libelle'],
        derniereCategoriesalarieId: json['derniere_categoriesalarie']
            ?['categoriesalarie'],
        derniereCategoriesalarieLibelle: json['derniere_categoriesalarie']
            ?['categoriesalarie_libelle'],
        derniereAgenceId: json['derniere_agence']?['agence'],
        photoUrl: _absoluteUrl(json['photo_url'] as String?),
      );
}

// ══════════════════════════════════════════════════════════════
// MENU & PLAT
// ══════════════════════════════════════════════════════════════

class PlatImage {
  final int id;
  final String? url;
  final bool isPrincipale;
  const PlatImage({required this.id, this.url, required this.isPrincipale});
  factory PlatImage.fromJson(Map<String, dynamic> j) => PlatImage(
        id: j['id'],
        url: _absoluteUrl(j['url'] as String?),
        isPrincipale: j['is_principale'] ?? false,
      );
}

class Plat {
  final int id;
  final String nom;
  final String description;
  final String? typePlatLibelle;
  final List<PlatImage> images;

  const Plat(
      {required this.id,
      required this.nom,
      required this.description,
      this.typePlatLibelle,
      required this.images});

  String? get imageUrl {
    final principale = images.where((i) => i.isPrincipale).firstOrNull;
    return principale?.url ?? images.firstOrNull?.url;
  }

  factory Plat.fromJson(Map<String, dynamic> j) => Plat(
        id: j['id'],
        nom: j['nom'] ?? '',
        description: j['description'] ?? '',
        typePlatLibelle: j['type_plat_libelle'],
        images: (j['images'] as List? ?? [])
            .map((e) => PlatImage.fromJson(e))
            .toList(),
      );
}

class MenuPlat {
  final int id;
  final Plat plat;
  const MenuPlat({required this.id, required this.plat});
  factory MenuPlat.fromJson(Map<String, dynamic> j) =>
      MenuPlat(id: j['id'], plat: Plat.fromJson(j['plat']));
}

class Menu {
  final int id;
  final String dateMenu;
  final int agenceId;
  final String agenceNom;
  final int typeEquipeId;
  final String typeEquipeLibelle;
  final List<MenuPlat> menuPlats;

  /// Dates limites calculées par le serveur à partir des délais paramétrés
  /// par l'administrateur (Paramètres → Société). Absentes : le serveur tranche.
  final DateTime? dateLimiteCommande;
  final DateTime? dateLimiteAnnulation;

  const Menu({
    required this.id,
    required this.dateMenu,
    required this.agenceId,
    required this.agenceNom,
    required this.typeEquipeId,
    required this.typeEquipeLibelle,
    required this.menuPlats,
    this.dateLimiteCommande,
    this.dateLimiteAnnulation,
  });

  bool get commandeFermee =>
      dateLimiteCommande != null && DateTime.now().isAfter(dateLimiteCommande!);

  bool get annulationFermee =>
      dateLimiteAnnulation != null &&
      DateTime.now().isAfter(dateLimiteAnnulation!);

  /// « Aujourd'hui » au sens du serveur (Africa/Abidjan = UTC+0)
  bool get isToday {
    final today = DateTime.now().toUtc();
    final d = DateTime.tryParse(dateMenu);
    if (d == null) return false;
    return d.year == today.year && d.month == today.month && d.day == today.day;
  }

  factory Menu.fromJson(Map<String, dynamic> j) => Menu(
        id: j['id'],
        dateMenu: j['date_menu'] ?? '',
        agenceId: j['agence_id'] ?? 0,
        agenceNom: j['agence_nom'] ?? '',
        typeEquipeId: j['typeequipe_id'] ?? 0,
        typeEquipeLibelle: j['typeequipe_libelle'] ?? '',
        menuPlats: (j['menu_plats'] as List? ?? [])
            .map((e) => MenuPlat.fromJson(e))
            .toList(),
        dateLimiteCommande:
            DateTime.tryParse(j['date_limite_commande'] ?? '')?.toUtc(),
        dateLimiteAnnulation:
            DateTime.tryParse(j['date_limite_annulation'] ?? '')?.toUtc(),
      );
}

// ══════════════════════════════════════════════════════════════
// COMMANDE
// ══════════════════════════════════════════════════════════════

enum StatutCommande { enAttente, annulee, retiree }

extension StatutCommandeExt on StatutCommande {
  String get value {
    switch (this) {
      case StatutCommande.enAttente:
        return 'en_attente';
      case StatutCommande.annulee:
        return 'annulee';
      case StatutCommande.retiree:
        return 'retiree';
    }
  }

  String get label {
    switch (this) {
      case StatutCommande.enAttente:
        return 'En attente';
      case StatutCommande.annulee:
        return 'Annulée';
      case StatutCommande.retiree:
        return 'Retirée';
    }
  }

  static StatutCommande fromString(String s) {
    switch (s) {
      case 'annulee':
        return StatutCommande.annulee;
      case 'retiree':
        return StatutCommande.retiree;
      default:
        return StatutCommande.enAttente;
    }
  }
}

class Commande {
  final int id;
  final StatutCommande statut;
  final String dateCommande;
  final String? dateAnnulation;
  final Plat? platDetail;
  final Menu? menuDetail;
  final String userNom;

  /// Avis de l'agent sur ce repas (repas retirés uniquement)
  final Avis? avis;

  /// Auteur de l'annulation (null si non annulée ou inconnu)
  final String? annuleeParNom;

  /// true : annulée par un gestionnaire / administrateur (et non par l'agent)
  final bool annuleeParGestionnaire;

  const Commande({
    required this.id,
    required this.statut,
    required this.dateCommande,
    this.dateAnnulation,
    this.platDetail,
    this.menuDetail,
    required this.userNom,
    this.avis,
    this.annuleeParNom,
    this.annuleeParGestionnaire = false,
  });

  /// « Annulée par Jean DUPONT (gestionnaire) », null si l'agent a lui-même
  /// annulé (ou si la commande n'est pas annulée).
  String? get libelleAnnulationGestionnaire {
    if (statut != StatutCommande.annulee || !annuleeParGestionnaire) {
      return null;
    }
    final nom = annuleeParNom?.trim() ?? '';
    return nom.isEmpty
        ? 'Annulée par un gestionnaire'
        : 'Annulée par $nom (gestionnaire)';
  }

  bool get peutAnnuler => statut == StatutCommande.enAttente;

  /// Un repas retiré peut être noté (ou sa note modifiée)
  bool get peutNoter => statut == StatutCommande.retiree;

  Commande copyWithAvis(Avis? avis) => Commande(
        id: id,
        statut: statut,
        dateCommande: dateCommande,
        dateAnnulation: dateAnnulation,
        platDetail: platDetail,
        menuDetail: menuDetail,
        userNom: userNom,
        avis: avis,
        annuleeParNom: annuleeParNom,
        annuleeParGestionnaire: annuleeParGestionnaire,
      );

  factory Commande.fromJson(Map<String, dynamic> j) => Commande(
        id: j['id'],
        statut: StatutCommandeExt.fromString(j['statut'] ?? ''),
        dateCommande: j['date_commande'] ?? '',
        dateAnnulation: j['date_annulation'],
        platDetail:
            j['plat_detail'] != null ? Plat.fromJson(j['plat_detail']) : null,
        menuDetail:
            j['menu_detail'] != null ? Menu.fromJson(j['menu_detail']) : null,
        userNom: j['user_nom'] ?? '',
        avis: j['avis'] is Map<String, dynamic>
            ? Avis.fromJson(j['avis'] as Map<String, dynamic>)
            : null,
        annuleeParNom: j['annulee_par_nom'] as String?,
        annuleeParGestionnaire: j['annulee_par_gestionnaire'] == true,
      );
}

// ══════════════════════════════════════════════════════════════
// AVIS (note d'un repas retiré)
// ══════════════════════════════════════════════════════════════

class Avis {
  final int id;
  final int note; // 1 à 5
  final String commentaire;

  const Avis({required this.id, required this.note, this.commentaire = ''});

  factory Avis.fromJson(Map<String, dynamic> j) => Avis(
        id: j['id'],
        note: (j['note'] as num?)?.toInt() ?? 0,
        commentaire: j['commentaire'] ?? '',
      );
}

class AvisRecent {
  final int note;
  final String commentaire;
  final String auteur;
  final String date;

  const AvisRecent({
    required this.note,
    required this.commentaire,
    required this.auteur,
    required this.date,
  });

  factory AvisRecent.fromJson(Map<String, dynamic> j) => AvisRecent(
        note: (j['note'] as num?)?.toInt() ?? 0,
        commentaire: j['commentaire'] ?? '',
        auteur: j['auteur'] ?? '',
        date: j['date'] ?? '',
      );
}

/// Résumé des avis d'un plat (GET /plats/{id}/avis/)
class ResumeAvisPlat {
  final double? noteMoyenne;
  final int nbAvis;
  final List<AvisRecent> derniers;

  const ResumeAvisPlat({
    required this.noteMoyenne,
    required this.nbAvis,
    required this.derniers,
  });

  factory ResumeAvisPlat.fromJson(Map<String, dynamic> j) => ResumeAvisPlat(
        noteMoyenne: (j['note_moyenne'] as num?)?.toDouble(),
        nbAvis: (j['nb_avis'] as num?)?.toInt() ?? 0,
        derniers: (j['derniers'] as List? ?? [])
            .map((e) => AvisRecent.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

// ══════════════════════════════════════════════════════════════
// RETRAIT
// ══════════════════════════════════════════════════════════════

class RechercheParBadgeResult {
  final int userId;
  final String userNom;
  final String badge;
  final bool aRetire;
  final List<Commande> commandes;

  const RechercheParBadgeResult({
    required this.userId,
    required this.userNom,
    required this.badge,
    required this.aRetire,
    required this.commandes,
  });

  factory RechercheParBadgeResult.fromJson(Map<String, dynamic> j) =>
      RechercheParBadgeResult(
        userId: j['user_id'],
        userNom: j['user_nom'] ?? '',
        badge: j['badge'] ?? '',
        aRetire: j['a_retire'] ?? false,
        commandes: (j['commandes'] as List? ?? [])
            .map((e) => Commande.fromJson(e))
            .toList(),
      );
}

// ══════════════════════════════════════════════════════════════
// STATS DASHBOARD
// ══════════════════════════════════════════════════════════════

class DashboardStats {
  final int totalCommandes;
  final int enAttente;
  final int retirees;
  final int annulees;
  final Menu? menuDuJour;

  const DashboardStats({
    required this.totalCommandes,
    required this.enAttente,
    required this.retirees,
    required this.annulees,
    this.menuDuJour,
  });
}

// ══════════════════════════════════════════════════════════════
// ALLERGIE
// ══════════════════════════════════════════════════════════════

class AllergieModel {
  final int? id;
  final String libelle;
  final int? userId;

  const AllergieModel({this.id, required this.libelle, this.userId});

  factory AllergieModel.fromJson(Map<String, dynamic> j) => AllergieModel(
        id: j['id'],
        libelle: j['libelle'] ?? '',
        userId: j['user'],
      );

  AllergieModel copyWith({String? libelle}) =>
      AllergieModel(id: id, libelle: libelle ?? this.libelle, userId: userId);
}

// ══════════════════════════════════════════════════════════════
// BANNIÈRE (accueil, paramétrée dans l'administration web)
// ══════════════════════════════════════════════════════════════

class Banniere {
  final int id;
  final String titre;
  final String? imageUrl;

  const Banniere({required this.id, required this.titre, this.imageUrl});

  factory Banniere.fromJson(Map<String, dynamic> j) => Banniere(
        id: j['id'],
        titre: j['titre'] ?? '',
        imageUrl: _absoluteUrl(j['image_url'] as String?),
      );
}

// ══════════════════════════════════════════════════════════════
// FENÊTRE APRÈS CONNEXION (image paramétrée dans l'administration web)
// ══════════════════════════════════════════════════════════════

class PopupConnexion {
  final int id;
  final String titre;
  final String imageUrl; // URL absolue

  const PopupConnexion(
      {required this.id, required this.titre, required this.imageUrl});

  /// GET /popups-connexion/active/ renvoie {} quand aucune image n'est
  /// active : null dans ce cas (ou si l'image manque / est désactivée).
  static PopupConnexion? fromJsonOuNull(dynamic j) {
    if (j is! Map) return null;
    final id = j['id'];
    final url = _absoluteUrl(j['image_url'] as String?);
    if (id is! int || url == null || j['actif'] == false) return null;
    return PopupConnexion(
        id: id, titre: (j['titre'] as String?) ?? '', imageUrl: url);
  }
}

// ══════════════════════════════════════════════════════════════
// ÉCRAN D'ACCUEIL (GET /accueil/ : tout l'accueil en une requête)
// ══════════════════════════════════════════════════════════════

int _int(dynamic v) =>
    v is num ? v.toInt() : int.tryParse(v?.toString() ?? '') ?? 0;

double _double(dynamic v) =>
    v is num ? v.toDouble() : double.tryParse(v?.toString() ?? '') ?? 0;

/// Date « AAAA-MM-JJ » du serveur (jour civil, sans fuseau)
DateTime? _jour(dynamic v) {
  final d = DateTime.tryParse(v?.toString() ?? '');
  return d == null ? null : DateTime(d.year, d.month, d.day);
}

List<Map<String, dynamic>> _maps(dynamic v) => (v as List? ?? [])
    .whereType<Map>()
    .map((e) => Map<String, dynamic>.from(e))
    .toList();

/// Commande résumée (repas du jour, récentes)
class AccueilCommande {
  final int id;
  final StatutCommande statut;
  final DateTime? dateMenu;
  final String plat;
  final String? platImageUrl; // URL absolue
  final String? agence;
  final String? equipe;
  final int? menuId;

  const AccueilCommande({
    required this.id,
    required this.statut,
    this.dateMenu,
    required this.plat,
    this.platImageUrl,
    this.agence,
    this.equipe,
    this.menuId,
  });

  factory AccueilCommande.fromJson(Map<String, dynamic> j) => AccueilCommande(
        id: _int(j['id']),
        statut: StatutCommandeExt.fromString(j['statut']?.toString() ?? ''),
        dateMenu: _jour(j['date_menu']),
        plat: j['plat']?.toString() ?? '',
        platImageUrl: _absoluteUrl(j['plat_image_url'] as String?),
        agence: j['agence'] as String?,
        equipe: j['equipe'] as String?,
        menuId: j['menu_id'] is num ? (j['menu_id'] as num).toInt() : null,
      );
}

/// État d'un jour de la semaine pour l'utilisateur
enum StatutJour {
  retire,
  aRetirer,
  reserve,
  nonRetire,
  aReserver,
  ferme,
  pasDeMenu;

  static StatutJour fromString(String? s) => switch (s) {
        'retire' => retire,
        'a_retirer' => aRetirer,
        'reserve' => reserve,
        'non_retire' => nonRetire,
        'a_reserver' => aReserver,
        'ferme' => ferme,
        _ => pasDeMenu,
      };

  String get label => switch (this) {
        retire => 'retiré',
        aRetirer => 'à retirer',
        reserve => 'réservé',
        nonRetire => 'non retiré',
        aReserver => 'à réserver',
        ferme => 'commandes fermées',
        pasDeMenu => 'pas de menu',
      };
}

class JourSemaine {
  final DateTime date;
  final String libelle; // « lundi 19/10 »
  final StatutJour statut;
  final String? plat;
  final int? commandeId;
  final DateTime? dateLimiteCommande;

  const JourSemaine({
    required this.date,
    required this.libelle,
    required this.statut,
    this.plat,
    this.commandeId,
    this.dateLimiteCommande,
  });

  factory JourSemaine.fromJson(Map<String, dynamic> j) => JourSemaine(
        date: _jour(j['date']) ?? DateTime(1970),
        libelle: j['libelle']?.toString() ?? '',
        statut: StatutJour.fromString(j['statut'] as String?),
        plat: j['plat'] as String?,
        commandeId:
            j['commande_id'] is num ? (j['commande_id'] as num).toInt() : null,
        dateLimiteCommande:
            DateTime.tryParse(j['date_limite_commande']?.toString() ?? '')
                ?.toUtc(),
      );
}

class ProchainAReserver {
  final DateTime date;
  final String libelle;
  final String agence;
  final int nbPlats;
  final int menuId;
  final DateTime? dateLimiteCommande;
  final String dateLimiteLibelle;

  const ProchainAReserver({
    required this.date,
    required this.libelle,
    required this.agence,
    required this.nbPlats,
    required this.menuId,
    this.dateLimiteCommande,
    this.dateLimiteLibelle = '',
  });

  factory ProchainAReserver.fromJson(Map<String, dynamic> j) =>
      ProchainAReserver(
        date: _jour(j['date']) ?? DateTime(1970),
        libelle: j['libelle']?.toString() ?? '',
        agence: j['agence']?.toString() ?? '',
        nbPlats: _int(j['nb_plats']),
        menuId: _int(j['menu_id']),
        dateLimiteCommande:
            DateTime.tryParse(j['date_limite_commande']?.toString() ?? '')
                ?.toUtc(),
        dateLimiteLibelle: j['date_limite_libelle']?.toString() ?? '',
      );
}

/// Chiffres du mois en cours (montant en FCFA calculé par le serveur)
class ChiffresMois {
  final int repas;
  final int retires;
  final int annules;
  final double montant;
  final int repasSansTarif;

  const ChiffresMois({
    this.repas = 0,
    this.retires = 0,
    this.annules = 0,
    this.montant = 0,
    this.repasSansTarif = 0,
  });

  factory ChiffresMois.fromJson(Map<String, dynamic> j) => ChiffresMois(
        repas: _int(j['repas']),
        retires: _int(j['retires']),
        annules: _int(j['annules']),
        montant: _double(j['montant']),
        repasSansTarif: _int(j['repas_sans_tarif']),
      );
}

class ServiceAgence {
  final int agenceId;
  final String agence;
  final List<String> equipes;
  final int nbPlats;
  final int commandees;
  final int servies;
  final int aServir;

  const ServiceAgence({
    required this.agenceId,
    required this.agence,
    this.equipes = const [],
    this.nbPlats = 0,
    this.commandees = 0,
    this.servies = 0,
    this.aServir = 0,
  });

  /// Part des repas servis (0 → 1)
  double get progression =>
      commandees <= 0 ? 0 : (servies / commandees).clamp(0, 1).toDouble();

  factory ServiceAgence.fromJson(Map<String, dynamic> j) => ServiceAgence(
        agenceId: _int(j['agence_id']),
        agence: j['agence']?.toString() ?? '',
        equipes: (j['equipes'] as List? ?? []).map((e) => '$e').toList(),
        nbPlats: _int(j['nb_plats']),
        commandees: _int(j['commandees']),
        servies: _int(j['servies']),
        aServir: _int(j['a_servir']),
      );
}

enum EtatJourGestion {
  termine,
  enCours,
  ouvert,
  ferme,
  sansMenu;

  static EtatJourGestion fromString(String? s) => switch (s) {
        'termine' => termine,
        'en_cours' => enCours,
        'ouvert' => ouvert,
        'sans_menu' => sansMenu,
        _ => ferme,
      };
}

class JourGestion {
  final DateTime date;
  final String libelle;
  final EtatJourGestion etat;
  final int commandees;
  final int retirees;
  final List<String> agencesSansMenu;

  const JourGestion({
    required this.date,
    required this.libelle,
    required this.etat,
    this.commandees = 0,
    this.retirees = 0,
    this.agencesSansMenu = const [],
  });

  factory JourGestion.fromJson(Map<String, dynamic> j) => JourGestion(
        date: _jour(j['date']) ?? DateTime(1970),
        libelle: j['libelle']?.toString() ?? '',
        etat: EtatJourGestion.fromString(j['etat'] as String?),
        commandees: _int(j['commandees']),
        retirees: _int(j['retirees']),
        agencesSansMenu:
            (j['agences_sans_menu'] as List? ?? []).map((e) => '$e').toList(),
      );
}

/// Alerte du gestionnaire (« menu_manquant », « fermeture », « cloture »)
class AFaire {
  final String type;
  final String titre;
  final String detail;
  final DateTime? date;

  /// Agences concernées (menu manquant), envoyées par le serveur
  final List<String> listeAgences;

  const AFaire(
      {required this.type,
      required this.titre,
      this.detail = '',
      this.date,
      this.listeAgences = const []});

  bool get estMenuManquant => type == 'menu_manquant';

  /// Agences concernées par un menu manquant (ancien serveur : début du détail)
  String get agences => listeAgences.isNotEmpty
      ? listeAgences.join(', ')
      : detail.split(' · ').first.trim();

  factory AFaire.fromJson(Map<String, dynamic> j) => AFaire(
        type: j['type']?.toString() ?? '',
        titre: j['titre']?.toString() ?? '',
        detail: j['detail']?.toString() ?? '',
        date: _jour(j['date']),
        listeAgences: (j['agences'] as List? ?? [])
            .map((e) => e.toString())
            .toList(),
      );
}

class AccueilGestion {
  final List<String> agences;
  final List<ServiceAgence> serviceDuJour;
  final List<JourGestion> semaine;
  final List<AFaire> aFaire;

  const AccueilGestion({
    this.agences = const [],
    this.serviceDuJour = const [],
    this.semaine = const [],
    this.aFaire = const [],
  });

  List<AFaire> get menusManquants =>
      aFaire.where((a) => a.estMenuManquant).toList();

  factory AccueilGestion.fromJson(Map<String, dynamic> j) => AccueilGestion(
        agences: (j['agences'] as List? ?? []).map((e) => '$e').toList(),
        serviceDuJour:
            _maps(j['service_du_jour']).map(ServiceAgence.fromJson).toList(),
        semaine: _maps(j['semaine']).map(JourGestion.fromJson).toList(),
        aFaire: _maps(j['a_faire']).map(AFaire.fromJson).toList(),
      );
}

class Accueil {
  final DateTime? date;
  final AccueilCommande? repasDuJour;
  final List<JourSemaine> semaine;
  final ProchainAReserver? prochainAReserver;
  final ChiffresMois mois;
  final List<AccueilCommande> recentes;

  /// Gestionnaire / administrateur seulement
  final AccueilGestion? gestion;

  const Accueil({
    this.date,
    this.repasDuJour,
    this.semaine = const [],
    this.prochainAReserver,
    this.mois = const ChiffresMois(),
    this.recentes = const [],
    this.gestion,
  });

  factory Accueil.fromJson(Map<String, dynamic> j) {
    Map<String, dynamic>? map(dynamic v) =>
        v is Map ? Map<String, dynamic>.from(v) : null;
    final repas = map(j['repas_du_jour']);
    final prochain = map(j['prochain_a_reserver']);
    final mois = map(j['mois']);
    final gestion = map(j['gestion']);
    return Accueil(
      date: _jour(j['date']),
      repasDuJour: repas == null ? null : AccueilCommande.fromJson(repas),
      semaine: _maps(j['semaine']).map(JourSemaine.fromJson).toList(),
      prochainAReserver:
          prochain == null ? null : ProchainAReserver.fromJson(prochain),
      mois: mois == null ? const ChiffresMois() : ChiffresMois.fromJson(mois),
      recentes: _maps(j['recentes']).map(AccueilCommande.fromJson).toList(),
      gestion: gestion == null ? null : AccueilGestion.fromJson(gestion),
    );
  }
}
