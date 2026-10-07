// lib/shared/models/models.dart

import '../../core/config.dart';

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
  });

  String get fullName => '$nom $prenom'.trim();

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

  const Menu({
    required this.id,
    required this.dateMenu,
    required this.agenceId,
    required this.agenceNom,
    required this.typeEquipeId,
    required this.typeEquipeLibelle,
    required this.menuPlats,
  });

  bool get isToday {
    final today = DateTime.now();
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

  const Commande({
    required this.id,
    required this.statut,
    required this.dateCommande,
    this.dateAnnulation,
    this.platDetail,
    this.menuDetail,
    required this.userNom,
  });

  bool get peutAnnuler => statut == StatutCommande.enAttente;

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
