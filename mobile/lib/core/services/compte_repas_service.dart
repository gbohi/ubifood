// lib/core/services/compte_repas_service.dart
//
// Compte repas de l'employé connecté (routes /compte-repas/…) : situation du
// mois, mouvements, reçus de caisse, PDF d'un reçu et choix du mode de
// paiement à la commande. Les recharges se font à la caisse UbiPharm.

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import '../api/api_client.dart';
import '../../shared/models/compte_repas_models.dart';

/// Format du PDF d'un reçu : ticket (80 mm) ou A5
enum PapierRecu { ticket, a5 }

class CompteRepasService {
  Future<CompteRepas> situation({int? annee, int? mois}) async {
    final res = await apiClient.get('/compte-repas/', params: {
      if (annee != null) 'annee': annee,
      if (mois != null) 'mois': mois,
    });
    final data = res.data;
    return CompteRepas.fromJson(
        data is Map ? Map<String, dynamic>.from(data) : const {});
  }

  /// Solde, prix du repas et mode proposé pour un menu (écran de commande)
  /// `platId` : prix selon le type du plat (Standard, Complet…)
  Future<InfoPaiement> infoPaiement(int menuId, {int? platId}) async {
    final res = await apiClient.get('/compte-repas/paiement/',
        params: {'menu': menuId, if (platId != null) 'plat': platId});
    final data = res.data;
    return InfoPaiement.fromJson(
        data is Map ? Map<String, dynamic>.from(data) : const {});
  }

  Future<PageCompte<MouvementCompte>> mouvements(
      {int page = 1, int taille = 30}) async {
    final res = await apiClient.get('/compte-repas/mouvements/',
        params: {'page': page, 'page_size': taille});
    return PageCompte.fromJson(res.data, MouvementCompte.fromJson);
  }

  Future<PageCompte<RecuCaisse>> recus({int page = 1, int taille = 20}) async {
    final res = await apiClient.get('/compte-repas/recus/',
        params: {'page': page, 'page_size': taille});
    return PageCompte.fromJson(res.data, RecuCaisse.fromJson);
  }

  /// PDF d'un de mes reçus. Erreur : [ErreurPdfRecu] (message lisible).
  Future<Uint8List> pdfRecu(int id,
      {PapierRecu papier = PapierRecu.ticket}) async {
    try {
      final octets = await apiClient.getBytes('/compte-repas/recus/$id/pdf/',
          params: {'papier': papier.name});
      return Uint8List.fromList(octets);
    } on DioException catch (e) {
      throw ErreurPdfRecu(messagePdf(e));
    }
  }
}

class ErreurPdfRecu implements Exception {
  final String message;
  const ErreurPdfRecu(this.message);
  @override
  String toString() => message;
}

/// Message d'une erreur sur le PDF : le corps (JSON) est reçu en octets.
String messagePdf(DioException e) {
  final data = e.response?.data;
  if (data is List<int>) {
    try {
      final json = jsonDecode(utf8.decode(data));
      final m = messageErreurApi(DioException(
          requestOptions: e.requestOptions,
          response: Response(
              requestOptions: e.requestOptions,
              statusCode: e.response?.statusCode,
              data: json)));
      if (m != null) return m;
    } catch (_) {}
  }
  if (e.response?.statusCode == 404) return 'Reçu introuvable.';
  return messageErreurApi(e) ?? 'Impossible de télécharger le reçu.';
}

final compteRepasService = CompteRepasService();
