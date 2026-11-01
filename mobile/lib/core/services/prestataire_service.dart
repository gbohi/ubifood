// lib/core/services/prestataire_service.dart
//
// Espace prestataire (routes /prestataire/…) et contestation d'un retrait
// par l'employé. Un compte prestataire n'appelle QUE ces routes (et le
// profil, les notifications) : toute autre route répond 403.

import 'package:dio/dio.dart';
import '../api/api_client.dart';
import '../../shared/models/prestataire_models.dart';

Map<String, dynamic> _objet(dynamic data) =>
    data is Map ? Map<String, dynamic>.from(data) : const {};

/// Mode d'identification de l'employé au comptoir
enum ModeIdentification {
  scan,
  saisie;

  String get valeur => name;
}

class PrestataireService {
  Future<ContextePrestataire> contexte() async {
    final res = await apiClient.get('/prestataire/contexte/');
    return ContextePrestataire.fromJson(_objet(res.data));
  }

  Future<AccueilPrestataire> accueil() async {
    final res = await apiClient.get('/prestataire/accueil/');
    return AccueilPrestataire.fromJson(_objet(res.data));
  }

  Future<ServiceComptoir> service({int? agenceId, int limite = 8}) async {
    final res = await apiClient.get('/prestataire/comptoir/service/', params: {
      if (agenceId != null) 'agence': agenceId,
      'limite': limite,
    });
    return ServiceComptoir.fromJson(_objet(res.data));
  }

  Future<RechercheComptoir> recherche(String badge, {int? agenceId}) async {
    final res =
        await apiClient.get('/prestataire/comptoir/recherche/', params: {
      'badge': badge,
      if (agenceId != null) 'agence': agenceId,
    });
    return RechercheComptoir.fromJson(_objet(res.data));
  }

  /// 201 : le retrait enregistré au nom de l'agent connecté.
  /// 409 « déjà retiré » : DioException (lire avec [DejaRetire.depuisReponse]).
  Future<RetraitComptoir> valider({
    required int menuId,
    required int userId,
    required ModeIdentification mode,
  }) async {
    final res = await apiClient.post('/prestataire/comptoir/valider/', data: {
      'menu_id': menuId,
      'user_id': userId,
      'mode': mode.valeur,
    });
    return RetraitComptoir.fromJson(_objet(res.data));
  }

  /// Annulation par l'agent de SON retrait, dans les 2 minutes.
  Future<String> annuler(int retraitId) async {
    final res = await apiClient
        .post('/prestataire/comptoir/retraits/$retraitId/annuler/');
    return _objet(res.data)['detail']?.toString() ??
        'Retrait annulé : la commande est de nouveau à servir.';
  }

  Future<ListeDuJour> listeDuJour({
    int? agenceId,
    String? statut,
    String? recherche,
  }) async {
    final res = await apiClient.get('/prestataire/liste-du-jour/', params: {
      if (agenceId != null) 'agence': agenceId,
      if (statut != null && statut.isNotEmpty) 'statut': statut,
      if (recherche != null && recherche.trim().isNotEmpty)
        'search': recherche.trim(),
    });
    return ListeDuJour.fromJson(_objet(res.data));
  }
}

class ContestationService {
  /// Détail du retrait d'une commande et possibilité de le contester.
  Future<DetailRetraitCommande> detailRetrait(int commandeId) async {
    final res = await apiClient.get('/commandes/$commandeId/retrait/');
    return DetailRetraitCommande.fromJson(_objet(res.data));
  }

  Future<ContestationRetrait> contester({
    required int commandeId,
    required String motif,
    String commentaire = '',
  }) async {
    final res = await apiClient.post('/contestations-retrait/', data: {
      'commande_id': commandeId,
      'motif': motif,
      'commentaire': commentaire.trim(),
    });
    return ContestationRetrait.fromJson(_objet(res.data));
  }

  /// Ses propres contestations (mes=1 : un gestionnaire voit sinon celles
  /// de ses agences).
  Future<List<ContestationRetrait>> mesContestations() async {
    final res =
        await apiClient.get('/contestations-retrait/', params: {'mes': 1});
    final data = res.data;
    final liste = data is List
        ? data
        : (data is Map ? (data['results'] as List? ?? const []) : const []);
    return liste
        .whereType<Map>()
        .map((e) => ContestationRetrait.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }
}

/// Vrai si l'erreur est la réponse 409 « déjà retiré » du comptoir
bool estDejaRetire(Object e) =>
    e is DioException && e.response?.statusCode == 409;

final prestataireService = PrestataireService();
final contestationService = ContestationService();
