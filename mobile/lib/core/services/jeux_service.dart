// lib/core/services/jeux_service.dart
//
// Jeux (quiz à lots) : liste, présentation, partie (le serveur tient le
// temps), réponse, résultats, classement. API : jeux/.

import 'package:dio/dio.dart';

import '../api/api_client.dart';
import '../../shared/models/autres_jeux_models.dart';
import '../../shared/models/jeux_models.dart';

Map<String, dynamic> _objet(dynamic data) =>
    data is Map ? Map<String, dynamic>.from(data) : const {};

/// Réponse refusée (temps écoulé…) : message et état à jour de la partie
class ReponseRefusee implements Exception {
  final String message;
  final EtatPartie etat;
  const ReponseRefusee(this.message, this.etat);
  @override
  String toString() => message;
}

class JeuxService {
  Future<ListeJeux> liste() async =>
      ListeJeux.fromJson(_objet((await apiClient.get('/jeux/')).data));

  Future<Jeu> jeu(int id) async =>
      Jeu.fromJson(_objet((await apiClient.get('/jeux/$id/')).data));

  Future<EtatPartie> commencer(int id) async => EtatPartie.fromJson(
      _objet((await apiClient.post('/jeux/$id/commencer/')).data));

  Future<EtatPartie> partie(int id) async => EtatPartie.fromJson(
      _objet((await apiClient.get('/jeux/$id/partie/')).data));

  Future<EtatPartie> repondre(int id, int index, int reponseId) async {
    try {
      final res = await apiClient.post('/jeux/$id/repondre/',
          data: {'index': index, 'reponse_id': reponseId});
      return EtatPartie.fromJson(_objet(res.data));
    } on DioException catch (e) {
      final d = _objet(e.response?.data);
      if (d['etat'] is Map) {
        throw ReponseRefusee(d['detail']?.toString() ?? 'Temps écoulé.',
            EtatPartie.fromJson(_objet(d['etat'])));
      }
      rethrow;
    }
  }

  Future<ResultatsJeu> resultats(int id) async => ResultatsJeu.fromJson(
      _objet((await apiClient.get('/jeux/$id/resultats/')).data));

  Future<ClassementJeu> classement(int id) async => ClassementJeu.fromJson(
      _objet((await apiClient.get('/jeux/$id/classement/')).data));

  // ── Défis, pronostics, tickets, gains ──
  Future<MesDefis> defis() async =>
      MesDefis.fromJson(_objet((await apiClient.get('/defis/')).data));

  Future<List<Gain>> gains() async {
    final d = (await apiClient.get('/mes-gains/')).data;
    return (d is List ? d : const [])
        .map((e) => Gain.fromJson(_objet(e)))
        .toList();
  }

  Future<List<Competition>> competitions() async {
    final d = _objet((await apiClient.get('/pronostics/')).data);
    return ((d['competitions'] as List?) ?? const [])
        .map((e) => Competition.fromJson(_objet(e)))
        .toList();
  }

  Future<Competition> competition(int id) async => Competition.fromJson(
      _objet((await apiClient.get('/pronostics/$id/')).data));

  Future<void> pronostiquer(int matchId, int a, int b) => apiClient
      .post('/pronostics/matchs/$matchId/', data: {'score_a': a, 'score_b': b});

  Future<List<Map<String, dynamic>>> classementPronostics(int id) async {
    final d = _objet((await apiClient.get('/pronostics/$id/classement/')).data);
    return ((d['lignes'] as List?) ?? const []).map((e) => _objet(e)).toList();
  }

  // ── Gestionnaires : lots à remettre ──
  Future<List<LotARemettre>> lotsARemettre(String statut) async {
    final d = (await apiClient
            .get('/admin/jeux/lots-a-remettre/', params: {'statut': statut}))
        .data;
    return (d is List ? d : const [])
        .map((e) => LotARemettre.fromJson(_objet(e)))
        .toList();
  }

  Future<void> remettreLot(LotARemettre l) => apiClient.post(l.genre == 'quiz'
      ? '/admin/jeux/${l.jeuId}/remettre/${l.id}/'
      : '/admin/jeux/gains/${l.id}/remettre/');

  Future<MesTickets> tickets() async =>
      MesTickets.fromJson(_objet((await apiClient.get('/tickets/')).data));

  Future<TicketJeu> gratter(int id) async => TicketJeu.fromJson(
      _objet((await apiClient.post('/tickets/$id/gratter/')).data));
}

final jeuxService = JeuxService();
