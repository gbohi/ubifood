// lib/core/services/parcours_service.dart
//
// Parcours de commande de l'onglet Menus : agences → prestataires →
// équipes → jours (contrat d'API « parcours de commande », §1).

import '../api/api_client.dart';
import 'compte_repas_service.dart';
import '../../shared/models/compte_repas_models.dart';
import '../../shared/models/models.dart';
import '../../shared/models/parcours_models.dart';

Map<String, dynamic> _objet(dynamic data) =>
    data is Map ? Map<String, dynamic>.from(data) : const {};

class ParcoursService {
  /// Agences où l'utilisateur peut commander (la sienne d'abord)
  Future<AgencesCommande> agences() async {
    final res = await apiClient.get('/commander/agences/');
    return AgencesCommande.fromJson(_objet(res.data));
  }

  /// Prestataires qui desservent [agenceId] à [date] (défaut : aujourd'hui)
  Future<PrestatairesAgence> prestataires(int agenceId,
      {DateTime? date}) async {
    final res = await apiClient.get('/commander/prestataires/', params: {
      'agence': agenceId,
      if (date != null) 'date': isoJour(date),
    });
    return PrestatairesAgence.fromJson(_objet(res.data));
  }

  /// Équipes d'un prestataire dans l'agence (0 : « Cantine UbiPharm »)
  Future<EquipesPrestataire> equipes(int prestataireId, int agenceId) async {
    final res = await apiClient.get(
        '/commander/prestataires/$prestataireId/equipes/',
        params: {'agence': agenceId});
    return EquipesPrestataire.fromJson(_objet(res.data));
  }

  /// Jours d'une semaine (n'importe quelle date de [semaine] ; sans : la
  /// semaine en cours ou celle du prochain jour à réserver)
  Future<JoursCommande> jours({
    required int agenceId,
    required int prestataireId,
    int? equipeId,
    DateTime? semaine,
  }) async {
    final res = await apiClient.get('/commander/jours/', params: {
      'agence': agenceId,
      'prestataire': prestataireId,
      if (equipeId != null) 'equipe': equipeId,
      if (semaine != null) 'semaine': isoJour(semaine),
    });
    return JoursCommande.fromJson(_objet(res.data));
  }

  /// Un menu (lien « Réserver » de l'accueil : agence, prestataire, équipe)
  Future<Menu> menu(int id) async {
    final res = await apiClient.get('/menus/$id/');
    return Menu.fromJson(_objet(res.data));
  }

  /// Solde et prix pour la feuille « Comment payer ce repas ? »
  Future<InfoPaiement> infoPaiement(int menuId, {int? platId}) =>
      compteRepasService.infoPaiement(menuId, platId: platId);
}

final parcoursService = ParcoursService();
