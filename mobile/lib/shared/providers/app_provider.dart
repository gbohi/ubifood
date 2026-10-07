// lib/shared/providers/app_provider.dart

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/models.dart';
import '../../core/services/cantine_service.dart';
import '../../core/services/notification_service.dart'; // ✅ AJOUTÉ

// ══════════════════════════════════════════════════════════════
// THEME PROVIDER — avec persistance SharedPreferences
// ══════════════════════════════════════════════════════════════

class ThemeProvider extends ChangeNotifier {
  static const _key = 'theme_mode';

  ThemeMode _mode = ThemeMode.light;
  ThemeMode get mode => _mode;
  bool get isDark => _mode == ThemeMode.dark;

  ThemeProvider() {
    _loadTheme();
  }

  /// Charge le thème sauvegardé au démarrage
  Future<void> _loadTheme() async {
    final prefs = await SharedPreferences.getInstance();
    final isDark = prefs.getBool(_key) ?? false;
    _mode = isDark ? ThemeMode.dark : ThemeMode.light;
    notifyListeners();
  }

  /// Sauvegarde le thème à chaque changement
  Future<void> _saveTheme(bool isDark) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_key, isDark);
  }

  void toggle() {
    _mode = isDark ? ThemeMode.light : ThemeMode.dark;
    _saveTheme(_mode == ThemeMode.dark);
    notifyListeners();
  }

  void setMode(ThemeMode mode) {
    _mode = mode;
    _saveTheme(mode == ThemeMode.dark);
    notifyListeners();
  }
}

// ══════════════════════════════════════════════════════════════
// AUTH PROVIDER
// ══════════════════════════════════════════════════════════════

class AuthProvider extends ChangeNotifier {
  AuthUser? _user;
  bool _loading = false;
  String? _error;

  AuthUser? get user => _user;
  bool get loading => _loading;
  String? get error => _error;
  bool get isLoggedIn => _user != null;

  bool get isGestionnaire =>
      (_user?.groups ?? []).any((g) => [3, 4].contains(g));

  Future<bool> login(String username, String password) async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _user = await authService.login(username, password);

      // ✅ Envoyer le token FCM au backend maintenant qu'on est authentifié
      await notificationService.registerTokenAfterLogin();

      _loading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = _parseError(e);
      _loading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    // ✅ Supprimer le token FCM AVANT de déconnecter
    // (l'API client a encore le token JWT valide à ce stade)
    await notificationService.deleteToken();
    await authService.logout();
    _user = null;
    notifyListeners();
  }

  String _parseError(dynamic e) {
    if (e.toString().contains('401') ||
        e.toString().contains('No active account')) {
      return 'Identifiants incorrects';
    }
    if (e.toString().contains('SocketException') ||
        e.toString().contains('connect')) {
      return 'Impossible de contacter le serveur';
    }
    return 'Une erreur est survenue';
  }
}

// ══════════════════════════════════════════════════════════════
// MENU PROVIDER
// ══════════════════════════════════════════════════════════════

class MenuProvider extends ChangeNotifier {
  List<Menu> _menus = [];
  Menu? _selected;
  bool _loading = false;
  String? _error;

  List<Menu> get menus => _menus;
  Menu? get selected => _selected;
  bool get loading => _loading;
  String? get error => _error;

  Menu? get menuDuJour => _menus.where((m) => m.isToday).firstOrNull;

  Future<void> loadMenus({int? agenceId}) async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _menus = await menuService.getMenus(agenceId: agenceId);
      _loading = false;
      notifyListeners();
    } catch (e) {
      _error = 'Erreur chargement menus';
      _loading = false;
      notifyListeners();
    }
  }

  void selectMenu(Menu m) {
    _selected = m;
    notifyListeners();
  }
}

// ══════════════════════════════════════════════════════════════
// COMMANDE PROVIDER
// ══════════════════════════════════════════════════════════════

enum CommandeState { idle, loading, success, error }

class CommandeProvider extends ChangeNotifier {
  List<Commande> _mesCommandes = [];
  List<Commande> _commandesAgence = [];
  CommandeState _state = CommandeState.idle;
  String? _error;
  String? _successMessage;

  List<Commande> get mesCommandes => _mesCommandes;
  List<Commande> get commandesAgence => _commandesAgence;
  CommandeState get state => _state;
  String? get error => _error;
  String? get successMessage => _successMessage;
  bool get isLoading => _state == CommandeState.loading;

  int get totalCommandes => _mesCommandes.length;
  int get enAttente =>
      _mesCommandes.where((c) => c.statut == StatutCommande.enAttente).length;
  int get retirees =>
      _mesCommandes.where((c) => c.statut == StatutCommande.retiree).length;
  int get annulees =>
      _mesCommandes.where((c) => c.statut == StatutCommande.annulee).length;

  Future<void> loadMesCommandes() async {
    _state = CommandeState.loading;
    notifyListeners();
    try {
      _mesCommandes = await commandeService.getMesCommandes();
      _state = CommandeState.idle;
      notifyListeners();
    } catch (e) {
      _error = 'Erreur chargement commandes';
      _state = CommandeState.error;
      notifyListeners();
    }
  }

  Future<void> loadCommandesAgence(
      {String? dateDebut, String? dateFin, int? agenceId}) async {
    _state = CommandeState.loading;
    notifyListeners();
    try {
      _commandesAgence = await commandeService.getCommandesParAgencePeriode(
        dateDebut: dateDebut,
        dateFin: dateFin,
        agenceId: agenceId,
      );
      _state = CommandeState.idle;
      notifyListeners();
    } catch (e) {
      _error = 'Erreur chargement commandes';
      _state = CommandeState.error;
      notifyListeners();
    }
  }

  Future<bool> commander({required int menuId, required int platId}) async {
    _state = CommandeState.loading;
    _error = null;
    notifyListeners();
    try {
      final c = await commandeService.commander(menuId: menuId, platId: platId);
      _mesCommandes.insert(0, c);
      _successMessage = 'Commande passée avec succès !';
      _state = CommandeState.success;
      notifyListeners();
      return true;
    } catch (e) {
      _error = _parseCommandeError(e);
      _state = CommandeState.error;
      notifyListeners();
      return false;
    }
  }

  Future<bool> annuler(int commandeId) async {
    _state = CommandeState.loading;
    notifyListeners();
    try {
      final updated = await commandeService.annuler(commandeId);
      final idx = _mesCommandes.indexWhere((c) => c.id == commandeId);
      if (idx != -1) _mesCommandes[idx] = updated;
      _successMessage = 'Commande annulée';
      _state = CommandeState.success;
      notifyListeners();
      return true;
    } catch (e) {
      _error = 'Impossible d\'annuler la commande';
      _state = CommandeState.error;
      notifyListeners();
      return false;
    }
  }

  void clearMessages() {
    _error = null;
    _successMessage = null;
    if (_state != CommandeState.loading) _state = CommandeState.idle;
    notifyListeners();
  }

  String _parseCommandeError(dynamic e) {
    final msg = e.toString();
    if (msg.contains('déjà une commande'))
      return 'Vous avez déjà commandé pour ce jour';
    if (msg.contains('48h'))
      return 'Délai de commande dépassé (48h avant le menu)';
    return 'Erreur lors de la commande';
  }
}

// ══════════════════════════════════════════════════════════════
// RETRAIT PROVIDER
// ══════════════════════════════════════════════════════════════

class RetraitProvider extends ChangeNotifier {
  RechercheParBadgeResult? _result;
  bool _loading = false;
  String? _error;
  String? _successMessage;

  RechercheParBadgeResult? get result => _result;
  bool get loading => _loading;
  String? get error => _error;
  String? get successMessage => _successMessage;

  Future<void> rechercherParBadge(String badge, int menuId) async {
    _loading = true;
    _error = null;
    _result = null;
    notifyListeners();
    try {
      _result =
          await retraitService.rechercheParBadge(badge: badge, menuId: menuId);
      _loading = false;
      notifyListeners();
    } catch (e) {
      _error = e.toString().contains('404')
          ? 'Badge "$badge" non trouvé'
          : 'Erreur de recherche';
      _loading = false;
      notifyListeners();
    }
  }

  Future<bool> validerRetrait(int userId, int menuId, String badge) async {
    _loading = true;
    notifyListeners();
    try {
      await retraitService.enregistrerRetrait(
        userId: userId,
        menuId: menuId,
        badgeMatricule: badge,
      );
      if (_result != null) {
        _result = RechercheParBadgeResult(
          userId: _result!.userId,
          userNom: _result!.userNom,
          badge: _result!.badge,
          aRetire: true,
          commandes: _result!.commandes,
        );
      }
      _successMessage = 'Retrait validé avec succès !';
      _loading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString().contains('déjà')
          ? 'Retrait déjà enregistré'
          : 'Erreur de retrait';
      _loading = false;
      notifyListeners();
      return false;
    }
  }

  void reset() {
    _result = _error = _successMessage = null;
    _loading = false;
    notifyListeners();
  }
}

// ══════════════════════════════════════════════════════════════
// TARIF PROVIDER
// ══════════════════════════════════════════════════════════════

class TarifProvider extends ChangeNotifier {
  List<PlatCategoriesalarieModel> _tarifs = [];
  bool _loading = false;
  String? _error;
  int? _categoriesalarieId;

  List<PlatCategoriesalarieModel> get tarifs => _tarifs;
  bool get loading => _loading;
  String? get error => _error;
  bool get loaded => _tarifs.isNotEmpty;

  Future<void> loadTarifs(int categoriesalarieId) async {
    if (_categoriesalarieId == categoriesalarieId && _tarifs.isNotEmpty) return;
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _tarifs = await tarifService.getTarifs(categoriesalarieId);
      _categoriesalarieId = categoriesalarieId;
      _loading = false;
      notifyListeners();
    } catch (e) {
      debugPrint('=== TarifProvider ERROR: $e ===');
      _error = 'Impossible de charger les tarifs';
      _loading = false;
      notifyListeners();
    }
  }

  double getMontant(String dateMenu) =>
      tarifService.getMontantPourDate(_tarifs, dateMenu);

  double calculerTotal(List<Commande> commandes) {
    return commandes.where((c) => c.statut != StatutCommande.annulee).fold(0.0,
        (sum, c) {
      final dateMenu = c.menuDetail?.dateMenu ?? '';
      return sum + getMontant(dateMenu);
    });
  }
}

// ══════════════════════════════════════════════════════════════
// ALLERGIE PROVIDER
// ══════════════════════════════════════════════════════════════

class AllergieProvider extends ChangeNotifier {
  List<AllergieModel> _allergies = [];
  bool _loading = false;
  bool _submitting = false;
  String? _error;

  List<AllergieModel> get allergies => _allergies;
  bool get loading => _loading;
  bool get submitting => _submitting;
  String? get error => _error;

  Future<void> loadAllergies() async {
    final auth = _getAuth();
    if (auth == null) return;
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _allergies = await allergieService.getMesAllergies(auth.id);
      _loading = false;
      notifyListeners();
    } catch (e) {
      _error = 'Impossible de charger les allergies';
      _loading = false;
      notifyListeners();
    }
  }

  Future<bool> ajouter(String libelle) async {
    final auth = _getAuth();
    if (auth == null) return false;
    _submitting = true;
    _error = null;
    notifyListeners();
    try {
      final a = await allergieService.ajouter(auth.id, libelle);
      _allergies.add(a);
      _submitting = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = 'Erreur lors de l\'ajout';
      _submitting = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> modifier(int id, String libelle) async {
    final auth = _getAuth();
    if (auth == null) return false;
    _submitting = true;
    _error = null;
    notifyListeners();
    try {
      final updated = await allergieService.modifier(id, auth.id, libelle);
      final idx = _allergies.indexWhere((a) => a.id == id);
      if (idx != -1) _allergies[idx] = updated;
      _submitting = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = 'Erreur lors de la modification';
      _submitting = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> supprimer(int id) async {
    _submitting = true;
    _error = null;
    notifyListeners();
    try {
      await allergieService.supprimer(id);
      _allergies.removeWhere((a) => a.id == id);
      _submitting = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = 'Erreur lors de la suppression';
      _submitting = false;
      notifyListeners();
      return false;
    }
  }

  AuthUser? _authUser;
  void setAuthUser(AuthUser? user) => _authUser = user;
  AuthUser? _getAuth() => _authUser;
}
