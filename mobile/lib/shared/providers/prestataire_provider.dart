// lib/shared/providers/prestataire_provider.dart
//
// État de l'espace prestataire (contexte, accueil du responsable, comptoir,
// liste du jour) et des contestations de l'employé. Les services sont
// injectables (tests).

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../core/api/api_client.dart';
import '../../core/services/prestataire_service.dart';
import '../models/prestataire_models.dart';

// ══════════════════════════════════════════════════════════════
// CONTEXTE + ACCUEIL DU RESPONSABLE
// ══════════════════════════════════════════════════════════════

class EspacePrestataireProvider extends ChangeNotifier {
  final PrestataireService service;
  EspacePrestataireProvider({PrestataireService? service})
      : service = service ?? prestataireService;

  ContextePrestataire? _contexte;
  bool _contexteEnCours = false;
  String? _contexteErreur;
  int? _agenceId;

  ContextePrestataire? get contexte => _contexte;
  bool get contexteEnCours => _contexteEnCours;
  String? get contexteErreur => _contexteErreur;
  List<AgencePrestataire> get agences => _contexte?.agences ?? const [];

  /// Agence du comptoir / de la liste (première desservie par défaut)
  int? get agenceId => _agenceId;
  AgencePrestataire? get agence {
    for (final a in agences) {
      if (a.id == _agenceId) return a;
    }
    return agences.firstOrNull;
  }

  void choisirAgence(int id) {
    if (id == _agenceId) return;
    _agenceId = id;
    notifyListeners();
  }

  AccueilPrestataire? _accueil;
  bool _accueilEnCours = false;
  String? _accueilErreur;
  DateTime? _accueilChargeLe;

  AccueilPrestataire? get accueil => _accueil;
  bool get accueilEnCours => _accueilEnCours;
  String? get accueilErreur => _accueilErreur;
  DateTime? get accueilChargeLe => _accueilChargeLe;

  int _generation = 0;
  Future<void>? _contexteFuture;

  /// Un seul chargement à la fois (plusieurs écrans le demandent au démarrage)
  Future<void> chargerContexte() =>
      _contexteFuture ??= _chargerContexte().whenComplete(() {
        _contexteFuture = null;
      });

  Future<void> _chargerContexte() async {
    final gen = _generation;
    _contexteEnCours = true;
    _contexteErreur = null;
    notifyListeners();
    try {
      final c = await service.contexte();
      if (gen != _generation) return;
      _contexte = c;
      if (!c.agences.any((a) => a.id == _agenceId)) {
        _agenceId = c.agences.firstOrNull?.id;
      }
    } catch (e) {
      if (gen != _generation) return;
      _contexteErreur =
          messageErreurApi(e) ?? "Impossible de charger l'espace prestataire";
    }
    _contexteEnCours = false;
    notifyListeners();
  }

  Future<void> chargerAccueil() async {
    final gen = _generation;
    _accueilEnCours = true;
    _accueilErreur = null;
    notifyListeners();
    try {
      final a = await service.accueil();
      if (gen != _generation) return;
      _accueil = a;
      _accueilChargeLe = DateTime.now();
    } catch (e) {
      if (gen != _generation) return;
      _accueilErreur = messageErreurApi(e) ?? "Impossible de charger l'accueil";
    }
    _accueilEnCours = false;
    notifyListeners();
  }

  /// Déconnexion : rien ne doit rester du compte précédent.
  void reset() {
    _generation++;
    _contexteFuture = null;
    _contexte = null;
    _contexteEnCours = false;
    _contexteErreur = null;
    _agenceId = null;
    _accueil = null;
    _accueilEnCours = false;
    _accueilErreur = null;
    _accueilChargeLe = null;
    notifyListeners();
  }
}

// ══════════════════════════════════════════════════════════════
// COMPTOIR
// ══════════════════════════════════════════════════════════════

class ComptoirProvider extends ChangeNotifier {
  final PrestataireService service;
  ComptoirProvider({PrestataireService? service})
      : service = service ?? prestataireService;

  ServiceComptoir? _service;
  bool _serviceEnCours = false;
  String? _serviceErreur;

  ServiceComptoir? get serviceDuJour => _service;
  bool get serviceEnCours => _serviceEnCours;
  String? get serviceErreur => _serviceErreur;

  RechercheComptoir? _recherche;
  ModeIdentification _mode = ModeIdentification.saisie;
  bool _rechercheEnCours = false;
  String? _rechercheErreur;

  RechercheComptoir? get recherche => _recherche;
  ModeIdentification get mode => _mode;
  bool get rechercheEnCours => _rechercheEnCours;
  String? get rechercheErreur => _rechercheErreur;

  bool _validationEnCours = false;
  RetraitComptoir? _valide;
  DejaRetire? _dejaRetire;
  String? _validationErreur;

  bool get validationEnCours => _validationEnCours;

  /// Retrait que l'agent vient de valider (carte de succès)
  RetraitComptoir? get valide => _valide;

  /// 409 « déjà retiré » (alerte orange)
  DejaRetire? get dejaRetire => _dejaRetire;
  String? get validationErreur => _validationErreur;

  int? _annulationEnCours;
  int? get annulationEnCours => _annulationEnCours;

  /// Une requête est en cours : les lectures de badge sont ignorées
  bool get occupe => _rechercheEnCours || _validationEnCours;

  int _generation = 0;
  int _requeteService = 0;

  Future<void> chargerService(int? agenceId) async {
    final gen = _generation;
    final num = ++_requeteService;
    _serviceEnCours = true;
    _serviceErreur = null;
    notifyListeners();
    try {
      final s = await service.service(agenceId: agenceId);
      if (gen != _generation || num != _requeteService) return;
      _service = s;
    } catch (e) {
      if (gen != _generation || num != _requeteService) return;
      _serviceErreur =
          messageErreurApi(e) ?? 'Impossible de charger le service du jour';
    }
    _serviceEnCours = false;
    notifyListeners();
  }

  int _requeteRecherche = 0;

  Future<void> rechercher(String badge, ModeIdentification mode,
      {int? agenceId}) async {
    final b = badge.trim();
    if (b.isEmpty || occupe) return;
    final gen = _generation;
    final num = ++_requeteRecherche;
    _mode = mode;
    _rechercheEnCours = true;
    _rechercheErreur = null;
    _recherche = null;
    _valide = null;
    _dejaRetire = null;
    _validationErreur = null;
    notifyListeners();
    try {
      final r = await service.recherche(b,
          agenceId: agenceId, lecture: mode == ModeIdentification.badge);
      if (gen != _generation || num != _requeteRecherche) return;
      _recherche = r;
      // Lecteur : badge d'accès reconnu, sinon c'était un QR code
      if (mode == ModeIdentification.badge && !r.parBadge) {
        _mode = ModeIdentification.scan;
      }
    } catch (e) {
      if (gen != _generation || num != _requeteRecherche) return;
      _rechercheErreur = messageErreurApi(e) ?? 'Recherche impossible';
    }
    _rechercheEnCours = false;
    notifyListeners();
    // Badge posé, un seul repas à retirer, réglage actif : validé sans clic
    final r = _recherche;
    if (r != null && r.validationAuto && r.aRetirer) {
      await valider(agenceId: agenceId);
    }
  }

  /// Valide le retrait de l'employé trouvé. true si enregistré.
  Future<bool> valider({int? agenceId}) async {
    final r = _recherche;
    final menuId =
        r?.menuId ?? r?.commandes.where((c) => c.aRemettre).firstOrNull?.menuId;
    if (r == null || menuId == null || _validationEnCours) return false;
    final gen = _generation;
    _validationEnCours = true;
    _validationErreur = null;
    _dejaRetire = null;
    notifyListeners();
    var ok = false;
    try {
      final retrait = await service.valider(
          menuId: menuId, userId: r.employe.id, mode: _mode);
      if (gen != _generation) return false;
      _valide = retrait;
      ok = true;
    } on DioException catch (e) {
      if (gen != _generation) return false;
      final deja =
          estDejaRetire(e) ? DejaRetire.depuisReponse(e.response?.data) : null;
      if (deja != null) {
        _dejaRetire = deja;
      } else {
        _validationErreur =
            messageErreurApi(e) ?? 'Le retrait n\'a pas pu être enregistré';
      }
    } catch (e) {
      if (gen != _generation) return false;
      _validationErreur = 'Le retrait n\'a pas pu être enregistré';
    }
    _validationEnCours = false;
    notifyListeners();
    // Compteurs et derniers retraits à jour
    if (ok || _dejaRetire != null) unawaited(chargerService(agenceId));
    return ok;
  }

  /// Annule SON retrait dans les 2 minutes : null si annulé, sinon l'erreur.
  Future<String?> annuler(RetraitComptoir retrait, {int? agenceId}) async {
    if (_annulationEnCours != null) return null;
    final gen = _generation;
    _annulationEnCours = retrait.id;
    notifyListeners();
    String? erreur;
    try {
      await service.annuler(retrait.id);
      if (gen != _generation) return null;
      if (_valide?.id == retrait.id) _valide = null;
    } catch (e) {
      erreur = messageErreurApi(e) ?? "L'annulation a échoué";
    }
    if (gen != _generation) return erreur;
    _annulationEnCours = null;
    notifyListeners();
    unawaited(chargerService(agenceId));
    return erreur;
  }

  /// Nouvel employé : efface le résultat affiché
  void effacer() {
    _requeteRecherche++;
    _recherche = null;
    _rechercheErreur = null;
    _rechercheEnCours = false;
    _valide = null;
    _dejaRetire = null;
    _validationErreur = null;
    notifyListeners();
  }

  /// Déconnexion / changement d'agence
  void reset() {
    _generation++;
    _service = null;
    _serviceEnCours = false;
    _serviceErreur = null;
    _annulationEnCours = null;
    _validationEnCours = false;
    effacer();
  }
}

// ══════════════════════════════════════════════════════════════
// LISTE DU JOUR
// ══════════════════════════════════════════════════════════════

class ListeDuJourProvider extends ChangeNotifier {
  final PrestataireService service;
  ListeDuJourProvider({PrestataireService? service})
      : service = service ?? prestataireService;

  ListeDuJour? _liste;
  bool _enCours = false;
  String? _erreur;
  String _statut = '';
  String _recherche = '';

  ListeDuJour? get liste => _liste;
  bool get enCours => _enCours;
  String? get erreur => _erreur;

  /// '' (tous), 'a_servir', 'retire'
  String get statut => _statut;
  String get recherche => _recherche;

  int _generation = 0;
  int _requete = 0;

  Future<void> charger(int? agenceId,
      {String? statut, String? recherche}) async {
    if (statut != null) _statut = statut;
    if (recherche != null) _recherche = recherche;
    final gen = _generation;
    final num = ++_requete;
    _enCours = true;
    _erreur = null;
    notifyListeners();
    try {
      final l = await service.listeDuJour(
          agenceId: agenceId, statut: _statut, recherche: _recherche);
      if (gen != _generation || num != _requete) return;
      _liste = l;
    } catch (e) {
      if (gen != _generation || num != _requete) return;
      _erreur = messageErreurApi(e) ?? 'Impossible de charger la liste du jour';
    }
    _enCours = false;
    notifyListeners();
  }

  void reset() {
    _generation++;
    _liste = null;
    _enCours = false;
    _erreur = null;
    _statut = '';
    _recherche = '';
    notifyListeners();
  }
}

// ══════════════════════════════════════════════════════════════
// CONTESTATIONS DE L'EMPLOYÉ
// ══════════════════════════════════════════════════════════════

class ContestationProvider extends ChangeNotifier {
  final ContestationService service;
  ContestationProvider({ContestationService? service})
      : service = service ?? contestationService;

  Map<int, ContestationRetrait> _parCommande = {};
  int _generation = 0;

  /// Contestation envoyée pour cette commande (null : aucune / inconnue)
  ContestationRetrait? pour(int commandeId) => _parCommande[commandeId];

  /// Silencieux en cas d'erreur : l'information est secondaire
  Future<void> charger() async {
    final gen = _generation;
    try {
      final liste = await service.mesContestations();
      if (gen != _generation) return;
      _parCommande = {
        for (final c in liste)
          if (c.commandeId != null) c.commandeId!: c,
      };
      notifyListeners();
    } catch (_) {}
  }

  /// Contestation envoyée depuis l'écran du retrait
  void enregistrer(int commandeId, ContestationRetrait c) {
    _parCommande = {..._parCommande, commandeId: c};
    notifyListeners();
  }

  void reset() {
    _generation++;
    _parCommande = {};
    notifyListeners();
  }
}
