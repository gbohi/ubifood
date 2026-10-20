// lib/shared/providers/app_provider.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/api/api_client.dart';
import '../models/models.dart';
import '../../core/services/cantine_service.dart';
import '../../core/services/notification_service.dart';

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

/// Résultat de la restauration de session au démarrage.
enum EtatSession { connecte, deconnecte, horsLigne }

class AuthProvider extends ChangeNotifier {
  AuthUser? _user;
  bool _loading = false;
  String? _error;

  AuthUser? get user => _user;
  bool get loading => _loading;
  String? get error => _error;
  bool get isLoggedIn => _user != null;

  /// Basé sur le NOM des rôles renvoyé par l'API (avant : IDs de groupe
  /// 3 et 4 codés en dur, faux dès que la base est recréée).
  bool get isGestionnaire => _user?.isGestionnaire ?? false;

  AuthProvider() {
    // Refresh token refusé par le serveur → retour à l'écran de connexion
    apiClient.onSessionExpiree = () {
      // L'appareil ne doit plus recevoir les notifications de ce compte
      notificationService.oublierTokenLocal();
      if (_user != null) {
        _user = null;
        notifyListeners();
      }
    };
  }

  /// Au démarrage : si un jeton est stocké, recharge le profil.
  /// Avant, l'utilisateur retombait toujours sur l'écran de connexion
  /// au redémarrage de l'app malgré un jeton valide.
  /// Hors ligne (serveur injoignable) : les jetons sont conservés et
  /// l'écran propose de réessayer, au lieu de renvoyer à la connexion.
  Future<EtatSession> restoreSession() async {
    if (!await authService.isLoggedIn()) return EtatSession.deconnecte;
    try {
      _user = await authService.me();
      notifyListeners();
      return EtatSession.connecte;
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      if (code == 401 || code == 403) {
        await authService.logout();
        return EtatSession.deconnecte;
      }
      return EtatSession.horsLigne;
    } catch (_) {
      return EtatSession.horsLigne;
    }
  }

  Future<bool> login(String username, String password) async {
    // Appui répété (bouton + touche « Entrée ») : une seule connexion
    if (_loading) return false;
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _user = await authService.login(username, password);

      // ✅ Envoyer le token FCM au backend maintenant qu'on est authentifié
      // (sans attendre : la récupération du token peut être longue et
      // bloquait l'écran de connexion sur le chargement)
      notificationService.registerTokenAfterLogin();

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

  // ── Photo de profil ─────────────────────────────────────────
  bool _photoEnCours = false;
  bool get photoEnCours => _photoEnCours;

  /// null si tout s'est bien passé, sinon le message d'erreur à afficher.
  Future<String?> changerPhoto(List<int> octets, String nomFichier) =>
      _majPhoto(() => authService.envoyerPhoto(octets, nomFichier));

  Future<String?> retirerPhoto() => _majPhoto(authService.retirerPhoto);

  Future<String?> _majPhoto(Future<AuthUser> Function() appel) async {
    if (_photoEnCours) return null;
    final demandeur = _user?.id;
    _photoEnCours = true;
    notifyListeners();
    try {
      final profil = await appel();
      // Déconnexion ou changement de compte pendant l'envoi : on ignore
      if (_user?.id == demandeur) _user = profil;
      return null;
    } catch (e) {
      return messageErreurApi(e) ?? "L'envoi de la photo a échoué.";
    } finally {
      _photoEnCours = false;
      notifyListeners();
    }
  }

  bool _deconnexionEnCours = false;

  Future<void> logout() async {
    // Double appui / double confirmation : une seule déconnexion
    if (_deconnexionEnCours) return;
    _deconnexionEnCours = true;
    _loading = true;
    notifyListeners();
    try {
      // Supprimer le token FCM AVANT de déconnecter
      // (l'API client a encore le token JWT valide à ce stade)
      await notificationService.deleteToken();
      await authService.logout();
    } finally {
      _deconnexionEnCours = false;
      _loading = false;
      _error = null;
      _user = null;
      notifyListeners();
    }
  }

  String _parseError(dynamic e) {
    if (e is DioException) {
      final code = e.response?.statusCode;
      if (code == 401) return 'Identifiants incorrects';
      if (code == 429) {
        return 'Trop de tentatives. Réessayez dans quelques minutes.';
      }
      if (e.response == null) return 'Impossible de contacter le serveur';
    }
    return messageErreurApi(e) ?? 'Une erreur est survenue';
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

  Menu? get menuDuJour => menuDuJourPour(null);

  /// Menu du jour, en privilégiant celui de l'agence de l'utilisateur
  /// (sinon le premier menu du jour trouvé).
  Menu? menuDuJourPour(int? agenceId) {
    final duJour = _menus.where((m) => m.isToday);
    if (agenceId != null) {
      final memeAgence = duJour.where((m) => m.agenceId == agenceId);
      if (memeAgence.isNotEmpty) return memeAgence.first;
    }
    return duJour.firstOrNull;
  }

  /// Menus à venir. Sans [agenceId] : toutes les agences (un agent peut
  /// commander dans l'agence où il se trouve) ; chaque écran filtre ensuite.
  Future<void> loadMenus({int? agenceId}) async {
    _loading = true;
    _error = null;
    notifyListeners();
    final gen = _generation;
    try {
      final menus = await menuService.getMenus(agenceId: agenceId);
      if (gen != _generation) return;
      _menus = menus;
      _loading = false;
      notifyListeners();
    } catch (e) {
      if (gen != _generation) return;
      _error = messageErreurApi(e) ?? 'Impossible de charger les menus';
      _loading = false;
      notifyListeners();
    }
  }

  void selectMenu(Menu m) {
    _selected = m;
    notifyListeners();
  }

  int _generation = 0;

  /// Déconnexion : rien ne doit rester du compte précédent.
  void reset() {
    _generation++;
    _menus = [];
    _selected = null;
    _loading = false;
    _error = null;
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

  /// Action en cours (commander / annuler)
  bool get isLoading => _state == CommandeState.loading;

  /// Commande en cours d'annulation (seule sa carte affiche le chargement)
  int? _commandeEnCours;
  int? get commandeEnCours => _commandeEnCours;

  /// Chargement de la liste (distinct des actions : annuler ne doit plus
  /// remplacer tout l'écran par des squelettes)
  bool _listLoading = false;
  bool get listLoading => _listLoading;
  String? _listError;
  String? get listError => _listError;
  int _generation = 0;
  Future<void>? _chargementEnCours;

  int get totalCommandes => _mesCommandes.length;

  /// Commandes dont le menu tombe dans le mois de [jour] (accueil).
  List<Commande> commandesDuMois(DateTime jour) => _mesCommandes.where((c) {
        final d = DateTime.tryParse(c.menuDetail?.dateMenu ?? '');
        return d != null && d.year == jour.year && d.month == jour.month;
      }).toList();
  int get enAttente =>
      _mesCommandes.where((c) => c.statut == StatutCommande.enAttente).length;
  int get retirees =>
      _mesCommandes.where((c) => c.statut == StatutCommande.retiree).length;
  int get annulees =>
      _mesCommandes.where((c) => c.statut == StatutCommande.annulee).length;

  /// Plusieurs écrans demandent la liste au démarrage : un seul appel.
  Future<void> loadMesCommandes() => _chargementEnCours ??=
      _charger().whenComplete(() => _chargementEnCours = null);

  Future<void> _charger() async {
    final gen = _generation;
    _listLoading = true;
    _listError = null;
    notifyListeners();
    try {
      final liste = await commandeService.getMesCommandes();
      if (gen != _generation) return;
      _mesCommandes = liste;
    } catch (e) {
      if (gen != _generation) return;
      _listError = messageErreurApi(e) ?? 'Impossible de charger vos commandes';
    }
    _listLoading = false;
    notifyListeners();
  }

  /// Déconnexion : rien ne doit rester du compte précédent.
  void reset() {
    _generation++;
    _chargementEnCours = null;
    _mesCommandes = [];
    _commandesAgence = [];
    _state = CommandeState.idle;
    _commandeEnCours = null;
    _actionGestionEnCours = null;
    _error = _successMessage = _listError = null;
    _listLoading = false;
    notifyListeners();
  }

  Future<bool> commander({required int menuId, required int platId}) async {
    _state = CommandeState.loading;
    _error = null;
    notifyListeners();
    try {
      final c = await commandeService.commander(menuId: menuId, platId: platId);
      // Le serveur peut renvoyer une commande existante (re-commande après
      // annulation) : on remplace l'élément au lieu de créer un doublon
      final idx = _mesCommandes.indexWhere((e) => e.id == c.id);
      if (idx != -1) {
        _mesCommandes[idx] = c;
      } else {
        _mesCommandes.insert(0, c);
      }
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
    _commandeEnCours = commandeId;
    _error = null;
    notifyListeners();
    try {
      final updated = await commandeService.annuler(commandeId);
      final idx = _mesCommandes.indexWhere((c) => c.id == commandeId);
      if (idx != -1) _mesCommandes[idx] = updated;
      _successMessage = 'Commande annulée';
      _state = CommandeState.success;
      _commandeEnCours = null;
      notifyListeners();
      return true;
    } catch (e) {
      _error = messageErreurApi(e) ?? 'Impossible d\'annuler la commande';
      _state = CommandeState.error;
      _commandeEnCours = null;
      notifyListeners();
      return false;
    }
  }

  // ── Gestion des commandes (gestionnaire / administrateur) ──────
  /// Commande d'agent en cours de traitement (une seule action à la fois)
  int? _actionGestionEnCours;
  int? get actionGestionEnCours => _actionGestionEnCours;

  /// Annule la commande d'un agent : le serveur n'applique pas la date
  /// limite au gestionnaire de l'agence (ni à l'administrateur) et prévient
  /// l'agent. null si tout s'est bien passé, sinon le message à afficher.
  Future<String?> annulerCommandeAgent(int commandeId) => _actionGestion(
      commandeId,
      () => commandeService.annuler(commandeId),
      'Impossible d\'annuler la commande');

  /// Retrait enregistré par erreur : la commande repasse « en attente »
  /// et l'avis de l'agent est supprimé.
  Future<String?> annulerRetrait(int commandeId) => _actionGestion(
      commandeId,
      () => commandeService.annulerRetrait(commandeId),
      'Impossible d\'annuler le retrait');

  Future<String?> _actionGestion(int commandeId,
      Future<Commande> Function() appel, String erreurParDefaut) async {
    // Double appui / seconde carte pendant une action : ignoré
    if (_actionGestionEnCours != null) return null;
    final gen = _generation;
    _actionGestionEnCours = commandeId;
    notifyListeners();
    try {
      final maj = await appel();
      if (gen != _generation) return null;
      // Sa propre commande (gestionnaire qui commande aussi) : liste à jour
      final idx = _mesCommandes.indexWhere((c) => c.id == commandeId);
      if (idx != -1) _mesCommandes[idx] = maj;
      return null;
    } catch (e) {
      return messageErreurApi(e) ?? erreurParDefaut;
    } finally {
      if (gen == _generation) {
        _actionGestionEnCours = null;
        notifyListeners();
      }
    }
  }

  /// Note un repas retiré : création (POST) ou modification (PATCH) de
  /// l'avis, puis mise à jour de la commande dans la liste.
  Future<bool> noter(Commande c, int note, String commentaire) async {
    _error = null;
    try {
      final avis = c.avis == null
          ? await avisService.donnerAvis(c.id, note, commentaire)
          : await avisService.modifierAvis(c.avis!.id, note, commentaire);
      final idx = _mesCommandes.indexWhere((e) => e.id == c.id);
      if (idx != -1) {
        _mesCommandes[idx] = _mesCommandes[idx].copyWithAvis(avis);
      }
      notifyListeners();
      return true;
    } catch (e) {
      _error = messageErreurApi(e) ?? 'Impossible d\'enregistrer votre avis';
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

  /// Le message utile est dans le corps de la réponse (e.toString() d'une
  /// DioException ne le contient pas : ces cas n'étaient jamais reconnus).
  String _parseCommandeError(dynamic e) {
    final msg = messageErreurApi(e) ?? '';
    if (msg.contains('déjà une commande')) {
      return 'Vous avez déjà commandé pour ce jour';
    }
    return msg.isNotEmpty ? msg : 'Erreur lors de la commande';
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

  int _recherche = 0;

  Future<void> rechercherParBadge(String badge, int menuId) async {
    // Une recherche déjà en cours (double scan, double appui) est ignorée
    if (_loading) return;
    final num = ++_recherche;
    _loading = true;
    _error = null;
    _successMessage = null;
    _result = null;
    notifyListeners();
    try {
      final r =
          await retraitService.rechercheParBadge(badge: badge, menuId: menuId);
      if (num != _recherche) return;
      _result = r;
    } catch (e) {
      if (num != _recherche) return;
      _error = messageErreurApi(e) ?? 'Erreur de recherche';
    }
    _loading = false;
    notifyListeners();
  }

  Future<bool> validerRetrait(int userId, int menuId, String badge) async {
    // Validation déjà en cours (double appui) : ignorée
    if (_loading) return false;
    _loading = true;
    _error = null;
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
      final msg = messageErreurApi(e) ?? '';
      _error = msg.contains('déjà')
          ? 'Retrait déjà enregistré'
          : (msg.isNotEmpty ? msg : 'Erreur de retrait');
      _loading = false;
      notifyListeners();
      return false;
    }
  }

  void reset() {
    _recherche++;
    _result = _error = _successMessage = null;
    _loading = false;
    notifyListeners();
  }
}

// ══════════════════════════════════════════════════════════════
// FACTURATION PROVIDER
// Montants calculés par le serveur : le mobile n'applique plus lui-même
// les tarifs (avant : catégorie actuelle de l'agent appliquée à tous ses
// repas, d'où des écarts avec le web et le tableau de bord).
// ══════════════════════════════════════════════════════════════

class FacturationProvider extends ChangeNotifier {
  Map<int, LigneFacturation> _lignes = {};
  bool _loading = false;
  bool _loaded = false;
  String? _error;

  bool get loading => _loading;
  bool get loaded => _loaded;
  String? get error => _error;

  /// Période chargée : du 1er du mois il y a 12 mois au dernier jour
  /// du 3e mois à venir (bornes incluses).
  DateTime get debutPeriode {
    final now = DateTime.now();
    return DateTime(now.year - 1, now.month, 1);
  }

  DateTime get finPeriode {
    final now = DateTime.now();
    return DateTime(now.year, now.month + 4, 0);
  }

  /// Charge 12 mois d'historique et 3 mois à venir (commandes anticipées).
  Future<void> charger() async {
    _loading = true;
    _error = null;
    notifyListeners();
    final gen = _generation;
    try {
      final debut = debutPeriode;
      final fin = finPeriode;
      String iso(DateTime d) =>
          '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      final lignes = await facturationService.mesLignes(
          dateDebut: iso(debut), dateFin: iso(fin));
      if (gen != _generation) return;
      _lignes = {for (final l in lignes) l.commandeId: l};
      _loaded = true;
    } catch (e) {
      if (gen != _generation) return;
      _error = messageErreurApi(e) ?? 'Impossible de charger la facturation';
    }
    _loading = false;
    notifyListeners();
  }

  int _generation = 0;

  /// Déconnexion : rien ne doit rester du compte précédent.
  void reset() {
    _generation++;
    _lignes = {};
    _loaded = false;
    _loading = false;
    _error = null;
    notifyListeners();
  }

  /// Montant d'un repas (null : annulé, hors période ou sans tarif).
  double? montant(Commande c) => _lignes[c.id]?.montant;

  /// Total des repas facturables (commandés et non annulés).
  double calculerTotal(List<Commande> commandes) => commandes
      .where((c) => c.statut != StatutCommande.annulee)
      .fold(0.0, (sum, c) => sum + (montant(c) ?? 0));

  /// Vrai si toutes les commandes facturables du mois sont figées (mois clôturé).
  bool estCloture(List<Commande> commandes) {
    final facturables = commandes
        .where((c) => c.statut != StatutCommande.annulee)
        .map((c) => _lignes[c.id])
        .toList();
    return facturables.isNotEmpty &&
        facturables.every((l) => l != null && l.cloturee);
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
      final liste = await allergieService.getMesAllergies(auth.id);
      if (auth.id != _authUser?.id) return;
      _allergies = liste;
      _loading = false;
      notifyListeners();
    } catch (e) {
      // Réponse d'un compte précédent (déconnexion entre-temps) : ignorée
      if (auth.id != _authUser?.id) return;
      _error = messageErreurApi(e) ?? 'Impossible de charger les allergies';
      _loading = false;
      notifyListeners();
    }
  }

  bool _existeDeja(String libelle, {int? sauf}) => _allergies.any((a) =>
      a.id != sauf &&
      a.libelle.trim().toLowerCase() == libelle.trim().toLowerCase());

  Future<bool> ajouter(String libelle) async {
    final auth = _getAuth();
    if (auth == null) return false;
    if (_existeDeja(libelle)) {
      _error = 'Cette allergie est déjà enregistrée';
      notifyListeners();
      return false;
    }
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
      _error = messageErreurApi(e) ?? 'Erreur lors de l\'ajout';
      _submitting = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> modifier(int id, String libelle) async {
    final auth = _getAuth();
    if (auth == null) return false;
    if (_existeDeja(libelle, sauf: id)) {
      _error = 'Cette allergie est déjà enregistrée';
      notifyListeners();
      return false;
    }
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
      _error = messageErreurApi(e) ?? 'Erreur lors de la modification';
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
      _error = messageErreurApi(e) ?? 'Erreur lors de la suppression';
      _submitting = false;
      notifyListeners();
      return false;
    }
  }

  AuthUser? _authUser;
  void setAuthUser(AuthUser? user) {
    // Changement de compte : on ne garde pas les allergies du précédent
    if (user?.id != _authUser?.id) {
      _allergies = [];
      _error = null;
      // Chargement du compte précédent ignoré : ne pas rester « en cours »
      _loading = false;
    }
    _authUser = user;
  }

  AuthUser? _getAuth() => _authUser;
}
