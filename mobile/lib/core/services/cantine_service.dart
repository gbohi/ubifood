// lib/core/services/cantine_service.dart

import 'package:dio/dio.dart';
import '../api/api_client.dart';
import '../config.dart';
import '../../shared/models/models.dart';

// ══════════════════════════════════════════════════════════════
// AUTH SERVICE
// ══════════════════════════════════════════════════════════════

class AuthService {
  Future<AuthUser> login(String username, String password) async {
    final tokenRes = await Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
    )).post(AppConfig.tokenUrl, data: {
      'username': username,
      'password': password,
    });
    await apiClient.saveTokens(
      tokenRes.data['access'],
      tokenRes.data['refresh'],
    );
    try {
      return await me();
    } catch (_) {
      // Profil illisible : pas de demi-connexion au prochain lancement
      await apiClient.clearTokens();
      rethrow;
    }
  }

  /// Profil de l'utilisateur connecté (sert aussi à restaurer la session).
  Future<AuthUser> me() async {
    final meRes = await apiClient.get('/users/me/');
    return AuthUser.fromJson(meRes.data);
  }

  /// Envoie la photo de profil (le serveur la vérifie et la réduit).
  Future<AuthUser> envoyerPhoto(List<int> octets, String nomFichier) async {
    final res = await apiClient.post('/users/me/photo/',
        data: FormData.fromMap({
          'photo': MultipartFile.fromBytes(octets, filename: nomFichier),
        }));
    return AuthUser.fromJson(res.data);
  }

  Future<AuthUser> retirerPhoto() async {
    final res = await apiClient.delete('/users/me/photo/');
    return AuthUser.fromJson(res.data);
  }

  /// Révoque le refresh token côté serveur puis efface les jetons locaux.
  Future<void> logout() async {
    try {
      final refresh = await apiClient.getRefreshToken();
      if (refresh != null) {
        // Hors ligne : on n'attend pas plus de 5 s pour déconnecter
        await apiClient
            .post('/users/logout/', data: {'refresh': refresh})
            .timeout(const Duration(seconds: 5));
      }
    } catch (_) {
      // Hors ligne ou session déjà expirée : la déconnexion locale suffit.
    }
    await apiClient.logout();
  }

  Future<bool> isLoggedIn() => apiClient.hasToken();
}

// ══════════════════════════════════════════════════════════════
// MENU SERVICE
// ══════════════════════════════════════════════════════════════

String _iso(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

class MenuService {
  /// Menus pour le retrait : servis aujourd'hui ou les jours précédents
  /// (un menu futur ne peut pas être retiré), du plus récent au plus ancien.
  Future<List<Menu>> getMenusRetrait({int? agenceId, int joursPasses = 7}) async {
    final today = DateTime.now().toUtc();
    final params = <String, dynamic>{
      'date_menu__lte': _iso(today),
      'date_menu__gte': _iso(today.subtract(Duration(days: joursPasses))),
      'ordering': '-date_menu',
      'page_size': 200,
      // Gestionnaire : uniquement les menus de ses agences (admin : tous)
      'gerees': 1,
    };
    if (agenceId != null) params['agence'] = agenceId;
    final res = await apiClient.get('/menus/', params: params);
    final results = res.data['results'] as List? ?? res.data as List? ?? [];
    return results.map((e) => Menu.fromJson(e)).toList();
  }

  /// Menus à venir (date >= aujourd'hui)
  Future<List<Menu>> getMenus({
    String? dateDebut,
    String? dateFin,
    int? agenceId,
    int? typeEquipeId,
  }) async {
    // Dates au sens du serveur (Africa/Abidjan = UTC+0)
    final today = DateTime.now().toUtc();
    final params = <String, dynamic>{
      'date_menu__gte': dateDebut ?? _iso(today),
      // Trois semaines à venir, toutes agences et équipes
      'date_menu__lte': dateFin ?? _iso(today.add(const Duration(days: 21))),
      'page_size': 500,
      // Le backend trie par -date_menu par défaut : on demande l'ordre
      // croissant pour ne pas perdre les menus les plus proches (aujourd'hui)
      'ordering': 'date_menu',
    };
    if (agenceId != null) params['agence'] = agenceId;
    if (typeEquipeId != null) params['typeequipe'] = typeEquipeId;

    final res = await apiClient.get('/menus/', params: params);
    final results = res.data['results'] as List? ?? res.data as List? ?? [];
    final menus = results.map((e) => Menu.fromJson(e)).toList();

    // ✅ Trier du plus proche au plus lointain (croissant)
    menus.sort((a, b) => a.dateMenu.compareTo(b.dateMenu));

    return menus;
  }

  Future<Menu> getMenuById(int id) async {
    final res = await apiClient.get('/menus/$id/');
    return Menu.fromJson(res.data);
  }
}

// ══════════════════════════════════════════════════════════════
// COMMANDE SERVICE
// ══════════════════════════════════════════════════════════════

class CommandeService {
  Future<List<Commande>> getMesCommandes(
      {String? statut, String? dateGte}) async {
    final params = <String, dynamic>{};
    if (statut != null) params['statut'] = statut;
    if (dateGte != null) params['menu__date_menu__gte'] = dateGte;
    final res =
        await apiClient.get('/commandes/mes-commandes/', params: params);
    final list = res.data as List? ?? [];
    return list.map((e) => Commande.fromJson(e)).toList();
  }

  Future<List<Commande>> getCommandesParAgencePeriode({
    String? dateDebut,
    String? dateFin,
    int? agenceId,
    int? typeEquipeId,
  }) async {
    final params = <String, dynamic>{};
    if (dateDebut != null) params['date_debut'] = dateDebut;
    if (dateFin != null) params['date_fin'] = dateFin;
    if (agenceId != null) params['agence'] = agenceId;
    if (typeEquipeId != null) params['typeequipe'] = typeEquipeId;
    final res =
        await apiClient.get('/commandes/par-agence-periode/', params: params);
    final list = res.data as List? ?? [];
    return list.map((e) => Commande.fromJson(e)).toList();
  }

  Future<Commande> commander({required int menuId, required int platId}) async {
    final res = await apiClient.post('/commandes/', data: {
      'menu_id': menuId,
      'plat_id': platId,
    });
    return Commande.fromJson(res.data);
  }

  Future<Commande> annuler(int commandeId) async {
    final res = await apiClient.patch('/commandes/$commandeId/annuler/');
    return Commande.fromJson(res.data);
  }
}

// ══════════════════════════════════════════════════════════════
// AVIS SERVICE (notes des repas retirés)
// ══════════════════════════════════════════════════════════════

class AvisService {
  /// Premier avis sur une commande retirée (une seule fois par commande).
  Future<Avis> donnerAvis(int commandeId, int note, String commentaire) async {
    final res = await apiClient.post('/avis-plats/', data: {
      'commande_id': commandeId,
      'note': note,
      'commentaire': commentaire,
    });
    return Avis.fromJson(res.data);
  }

  Future<Avis> modifierAvis(int id, int note, String commentaire) async {
    final res = await apiClient.patch('/avis-plats/$id/', data: {
      'note': note,
      'commentaire': commentaire,
    });
    return Avis.fromJson(res.data);
  }

  /// Note moyenne, nombre d'avis et derniers commentaires d'un plat.
  Future<ResumeAvisPlat> resumePlat(int platId) async {
    final res = await apiClient.get('/plats/$platId/avis/');
    return ResumeAvisPlat.fromJson(res.data as Map<String, dynamic>);
  }
}

// ══════════════════════════════════════════════════════════════
// RETRAIT SERVICE
// ══════════════════════════════════════════════════════════════

class RetraitService {
  Future<RechercheParBadgeResult> rechercheParBadge({
    required String badge,
    required int menuId,
  }) async {
    final res = await apiClient.get('/commandes/recherche-par-badge/', params: {
      'badge': badge,
      'menu': menuId,
    });
    return RechercheParBadgeResult.fromJson(res.data);
  }

  Future<void> enregistrerRetrait({
    required int userId,
    required int menuId,
    required String badgeMatricule,
  }) async {
    await apiClient.post('/retraits/', data: {
      'user_id': userId,
      'menu_id': menuId,
      'badge_matricule': badgeMatricule,
    });
  }
}

// ══════════════════════════════════════════════════════════════
// FACTURATION SERVICE
// Les montants sont calculés par le serveur (GET /facturation/) :
// repas commandés et non annulés, au tarif de la catégorie salarié en
// vigueur à la date du menu ; montants figés pour les mois clôturés.
// ══════════════════════════════════════════════════════════════

class LigneFacturation {
  final int commandeId;
  final String dateMenu;
  final double? montant; // null : pas de tarif défini pour ce repas
  final bool cloturee; // true : mois clôturé, montant figé

  const LigneFacturation({
    required this.commandeId,
    required this.dateMenu,
    required this.montant,
    required this.cloturee,
  });

  factory LigneFacturation.fromJson(Map<String, dynamic> j) => LigneFacturation(
        commandeId: j['commande_id'],
        dateMenu: j['date_menu'] ?? '',
        montant: (j['montant'] as num?)?.toDouble(),
        cloturee: j['source'] == 'facture',
      );
}

class BanniereService {
  /// Bannières à afficher aujourd'hui (actives et dans leur période).
  Future<List<Banniere>> getBannieres() async {
    final res = await apiClient.get('/bannieres/');
    final list = res.data as List? ?? [];
    return list.map((e) => Banniere.fromJson(e)).toList();
  }
}

class FacturationService {
  /// Lignes de facturation de l'utilisateur connecté sur la période.
  Future<List<LigneFacturation>> mesLignes({
    required String dateDebut,
    required String dateFin,
  }) async {
    final res = await apiClient.get('/facturation/', params: {
      'date_debut': dateDebut,
      'date_fin': dateFin,
      // Ses propres repas, même pour un gestionnaire (sinon : tous ses agents)
      'moi': 1,
    });
    final employes = res.data['employes'] as List? ?? [];
    return [
      for (final e in employes)
        for (final l in (e['lignes'] as List? ?? []))
          LigneFacturation.fromJson(l as Map<String, dynamic>),
    ];
  }
}

// ══════════════════════════════════════════════════════════════
// INSTANCES
// ══════════════════════════════════════════════════════════════

final authService = AuthService();
final menuService = MenuService();
final commandeService = CommandeService();
final avisService = AvisService();
final banniereService = BanniereService();
final retraitService = RetraitService();
final facturationService = FacturationService();

// ══════════════════════════════════════════════════════════════
// ALLERGIE SERVICE
// ══════════════════════════════════════════════════════════════

class AllergieService {
  Future<List<AllergieModel>> getMesAllergies(int userId) async {
    final res = await apiClient.get(
      '/user-allergies/',
      params: {'user': userId, 'page_size': 100},
    );
    final list = (res.data['results'] ?? res.data) as List;
    return list.map((e) => AllergieModel.fromJson(e)).toList();
  }

  Future<AllergieModel> ajouter(int userId, String libelle) async {
    final res = await apiClient.post('/user-allergies/', data: {
      'user': userId,
      'libelle': libelle,
    });
    return AllergieModel.fromJson(res.data);
  }

  Future<AllergieModel> modifier(int id, int userId, String libelle) async {
    final res = await apiClient.patch('/user-allergies/$id/', data: {
      'user': userId,
      'libelle': libelle,
    });
    return AllergieModel.fromJson(res.data);
  }

  Future<void> supprimer(int id) async {
    await apiClient.delete('/user-allergies/$id/');
  }
}

final allergieService = AllergieService();
