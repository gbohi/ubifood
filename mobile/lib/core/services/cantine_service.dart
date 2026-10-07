// lib/core/services/cantine_service.dart

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../api/api_client.dart';
import '../config.dart';
import '../../shared/models/models.dart';

// ══════════════════════════════════════════════════════════════
// AUTH SERVICE
// ══════════════════════════════════════════════════════════════

class AuthService {
  Future<AuthUser> login(String username, String password) async {
    final tokenRes = await Dio().post(AppConfig.tokenUrl, data: {
      'username': username,
      'password': password,
    });
    await apiClient.saveTokens(
      tokenRes.data['access'],
      tokenRes.data['refresh'],
    );
    final meRes = await apiClient.get('/users/me/');
    return AuthUser.fromJson(meRes.data);
  }

  Future<void> logout() => apiClient.logout();
  Future<bool> isLoggedIn() => apiClient.hasToken();
}

// ══════════════════════════════════════════════════════════════
// MENU SERVICE
// ══════════════════════════════════════════════════════════════

class MenuService {
  /// Menus à venir (date >= aujourd'hui)
  Future<List<Menu>> getMenus({
    String? dateDebut,
    String? dateFin,
    int? agenceId,
    int? typeEquipeId,
  }) async {
    final today = DateTime.now();
    final params = <String, dynamic>{
      'date_menu__gte': dateDebut ??
          '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}',
      'page_size': 30,
    };
    if (dateFin != null) params['date_menu__lte'] = dateFin;
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
// TARIF SERVICE
// ══════════════════════════════════════════════════════════════

class PlatCategoriesalarieModel {
  final int id;
  final int categoriesalarieId;
  final double montant;
  final String dateDebut;
  final String? dateFin;

  const PlatCategoriesalarieModel({
    required this.id,
    required this.categoriesalarieId,
    required this.montant,
    required this.dateDebut,
    this.dateFin,
  });

  factory PlatCategoriesalarieModel.fromJson(Map<String, dynamic> j) =>
      PlatCategoriesalarieModel(
        id: j['id'],
        categoriesalarieId: j['categoriesalarie'],
        montant: double.tryParse(j['montant'].toString()) ?? 0,
        dateDebut: j['date_debut'] ?? '',
        dateFin: j['date_fin'],
      );

  bool actifPour(String dateMenu) {
    final d = dateDebut.substring(0, 10);
    final fin = dateFin != null ? dateFin!.substring(0, 10) : null;
    final target = dateMenu.substring(0, 10);
    if (target.compareTo(d) < 0) return false;
    if (fin != null && target.compareTo(fin) > 0) return false;
    return true;
  }
}

class TarifService {
  Future<List<PlatCategoriesalarieModel>> getTarifs(
      int categoriesalarieId) async {
    final res = await apiClient.get(
      '/plat-categoriesalaries/',
      params: {'categoriesalarie': categoriesalarieId, 'page_size': 1000},
    );
    final list = (res.data['results'] ?? res.data) as List;
    return list.map((e) => PlatCategoriesalarieModel.fromJson(e)).toList();
  }

  double getMontantPourDate(
      List<PlatCategoriesalarieModel> tarifs, String dateMenu) {
    final valides = tarifs.where((t) => t.actifPour(dateMenu)).toList();
    if (valides.isEmpty) return 0;
    valides.sort((a, b) => b.dateDebut.compareTo(a.dateDebut));
    return valides.first.montant;
  }
}

// ══════════════════════════════════════════════════════════════
// INSTANCES
// ══════════════════════════════════════════════════════════════

final authService = AuthService();
final menuService = MenuService();
final commandeService = CommandeService();
final retraitService = RetraitService();
final tarifService = TarifService();

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
