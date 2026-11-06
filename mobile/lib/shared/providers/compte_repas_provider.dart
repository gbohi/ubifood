// lib/shared/providers/compte_repas_provider.dart
//
// « Mes paiements » : compte repas de l'employé connecté (solde, repas du
// mois et leur paiement, mouvements, reçus de caisse).

import 'package:flutter/foundation.dart';
import '../../core/api/api_client.dart';
import '../../core/services/compte_repas_service.dart';
import '../models/compte_repas_models.dart';

class CompteRepasProvider extends ChangeNotifier {
  final CompteRepasService _service;
  CompteRepasProvider({CompteRepasService? service})
      : _service = service ?? compteRepasService;

  int _generation = 0;

  // ── Situation du mois ──────────────────────────────────────
  CompteRepas? _compte;
  bool _loading = false;
  String? _error;

  /// Mois affiché (1er du mois) ; null : mois en cours
  DateTime? _mois;

  CompteRepas? get compte => _compte;
  bool get loading => _loading;
  String? get error => _error;
  DateTime get mois {
    final now = DateTime.now();
    return _mois ?? DateTime(now.year, now.month);
  }

  /// Solde connu (dernière situation chargée), null : pas encore chargé
  double? get solde => _compte?.solde;

  Future<void> charger({DateTime? mois}) async {
    if (mois != null) _mois = DateTime(mois.year, mois.month);
    final m = this.mois;
    _loading = true;
    _error = null;
    notifyListeners();
    final gen = _generation;
    try {
      final c = await _service.situation(annee: m.year, mois: m.month);
      if (gen != _generation || m != this.mois) return;
      _compte = c;
    } catch (e) {
      if (gen != _generation || m != this.mois) return;
      _error = messageErreurApi(e) ?? 'Impossible de charger le compte repas';
    }
    _loading = false;
    notifyListeners();
  }

  // ── Mouvements (paginés, du plus récent) ───────────────────
  final List<MouvementCompte> _mouvements = [];
  int _pageMouvements = 0;
  bool _mouvementsSuivants = false;
  bool _mouvementsLoading = false;
  bool _mouvementsCharges = false;
  String? _mouvementsError;

  List<MouvementCompte> get mouvements => List.unmodifiable(_mouvements);
  bool get mouvementsSuivants => _mouvementsSuivants;
  bool get mouvementsLoading => _mouvementsLoading;
  bool get mouvementsCharges => _mouvementsCharges;
  String? get mouvementsError => _mouvementsError;

  Future<void> chargerMouvements({bool suite = false}) async {
    if (_mouvementsLoading) return;
    _mouvementsLoading = true;
    _mouvementsError = null;
    notifyListeners();
    final gen = _generation;
    final page = suite ? _pageMouvements + 1 : 1;
    try {
      final p = await _service.mouvements(page: page);
      if (gen != _generation) return;
      if (!suite) _mouvements.clear();
      _mouvements.addAll(p.resultats);
      _pageMouvements = page;
      _mouvementsSuivants = p.suivante;
      _mouvementsCharges = true;
    } catch (e) {
      if (gen != _generation) return;
      _mouvementsError =
          messageErreurApi(e) ?? 'Impossible de charger les mouvements';
    }
    _mouvementsLoading = false;
    notifyListeners();
  }

  // ── Reçus (paginés) ────────────────────────────────────────
  final List<RecuCaisse> _recus = [];
  int _pageRecus = 0;
  bool _recusSuivants = false;
  bool _recusLoading = false;
  bool _recusCharges = false;
  String? _recusError;

  List<RecuCaisse> get recus => List.unmodifiable(_recus);
  bool get recusSuivants => _recusSuivants;
  bool get recusLoading => _recusLoading;
  bool get recusCharges => _recusCharges;
  String? get recusError => _recusError;

  Future<void> chargerRecus({bool suite = false}) async {
    if (_recusLoading) return;
    _recusLoading = true;
    _recusError = null;
    notifyListeners();
    final gen = _generation;
    final page = suite ? _pageRecus + 1 : 1;
    try {
      final p = await _service.recus(page: page);
      if (gen != _generation) return;
      if (!suite) _recus.clear();
      _recus.addAll(p.resultats);
      _pageRecus = page;
      _recusSuivants = p.suivante;
      _recusCharges = true;
    } catch (e) {
      if (gen != _generation) return;
      _recusError = messageErreurApi(e) ?? 'Impossible de charger les reçus';
    }
    _recusLoading = false;
    notifyListeners();
  }

  /// Tout l'écran : situation du mois affiché, mouvements, reçus
  Future<void> chargerTout() =>
      Future.wait([charger(), chargerMouvements(), chargerRecus()])
          .then((_) {});

  Future<Uint8List> pdfRecu(int id, {PapierRecu papier = PapierRecu.ticket}) =>
      _service.pdfRecu(id, papier: papier);

  /// Déconnexion : rien ne doit rester du compte précédent.
  void reset() {
    _generation++;
    _compte = null;
    _mois = null;
    _loading = false;
    _error = null;
    _mouvements.clear();
    _pageMouvements = 0;
    _mouvementsSuivants = false;
    _mouvementsLoading = false;
    _mouvementsCharges = false;
    _mouvementsError = null;
    _recus.clear();
    _pageRecus = 0;
    _recusSuivants = false;
    _recusLoading = false;
    _recusCharges = false;
    _recusError = null;
    notifyListeners();
  }
}
