// lib/core/api/api_client.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config.dart';

const _kAccessToken = 'access_token';
const _kRefreshToken = 'refresh_token';

/// Extrait un message lisible d'une erreur Dio / Django REST Framework.
///
/// DRF renvoie selon les cas : {"detail": "..."}, {"error": "..."},
/// {"non_field_errors": ["..."]}, {"champ": ["..."]} ou ["..."].
/// `DioException.toString()` ne contient pas le corps de la réponse :
/// il faut le lire ici.
String? messageErreurApi(Object e) {
  if (e is! DioException) return null;
  final data = e.response?.data;

  String? premier(dynamic v) {
    if (v == null) return null;
    if (v is String) return v;
    if (v is List && v.isNotEmpty) return premier(v.first);
    if (v is Map) {
      for (final cle in ['detail', 'error', 'message', 'non_field_errors']) {
        final m = premier(v[cle]);
        if (m != null) return m;
      }
      for (final valeur in v.values) {
        final m = premier(valeur);
        if (m != null) return m;
      }
    }
    return null;
  }

  return premier(data);
}

class ApiClient {
  static const _storage = FlutterSecureStorage();
  late final Dio _dio;

  /// Refresh en cours : partagé par toutes les requêtes qui reçoivent un 401
  /// en même temps (une seule demande de refresh au serveur).
  Future<bool>? _refreshEnCours;

  /// Appelé quand la session est définitivement expirée (refresh refusé) :
  /// l'application revient à l'écran de connexion.
  void Function()? onSessionExpiree;

  ApiClient() {
    _dio = Dio(BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ));

    // ── Intercepteur JWT ──────────────────────────────────────
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: _kAccessToken);
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        final options = error.requestOptions;
        // Token expiré → un seul refresh, puis une seule nouvelle tentative
        // (avant : un 401 persistant relançait refresh + requête en boucle).
        if (error.response?.statusCode == 401 &&
            options.extra['retry'] != true) {
          final refreshed = await _refreshToken();
          if (refreshed) {
            try {
              final token = await _storage.read(key: _kAccessToken);
              options.headers['Authorization'] = 'Bearer $token';
              options.extra['retry'] = true;
              final response = await _dio.fetch(options);
              return handler.resolve(response);
            } on DioException catch (e) {
              return handler.next(e);
            }
          }
        }
        handler.next(error);
      },
    ));
  }

  Future<bool> _refreshToken() {
    return _refreshEnCours ??= _faireRefresh().whenComplete(() {
      _refreshEnCours = null;
    });
  }

  Future<bool> _faireRefresh() async {
    final refresh = await _storage.read(key: _kRefreshToken);
    if (refresh == null) return false;
    try {
      final response = await Dio().post(
        AppConfig.refreshUrl,
        data: {'refresh': refresh},
      );
      await _storage.write(
          key: _kAccessToken, value: response.data['access'] as String);
      return true;
    } on DioException catch (e) {
      // Refresh refusé par le serveur (expiré / révoqué) → vraie déconnexion.
      // En cas de simple coupure réseau, on garde la session.
      if (e.response?.statusCode == 401 || e.response?.statusCode == 400) {
        await clearTokens();
        onSessionExpiree?.call();
      }
      return false;
    }
  }

  Future<void> saveTokens(String access, String refresh) async {
    await _storage.write(key: _kAccessToken, value: access);
    await _storage.write(key: _kRefreshToken, value: refresh);
  }

  Future<String?> getRefreshToken() => _storage.read(key: _kRefreshToken);

  /// Supprime uniquement les jetons de session
  /// (avant : deleteAll() effaçait tout le stockage sécurisé de l'app).
  Future<void> clearTokens() async {
    await _storage.delete(key: _kAccessToken);
    await _storage.delete(key: _kRefreshToken);
  }

  Future<void> logout() => clearTokens();

  Future<bool> hasToken() async {
    final token = await _storage.read(key: _kAccessToken);
    return token != null;
  }

  // ── CRUD helpers ──────────────────────────────────────────

  Future<Response> get(String path, {Map<String, dynamic>? params}) =>
      _dio.get(path, queryParameters: params);

  Future<Response> post(String path, {dynamic data}) =>
      _dio.post(path, data: data);

  Future<Response> patch(String path, {dynamic data}) =>
      _dio.patch(path, data: data);

  Future<Response> delete(String path,
          {dynamic data, Map<String, dynamic>? params}) =>
      _dio.delete(path, data: data, queryParameters: params);

  /// Appel POST sans token JWT — pour les endpoints publics
  /// (forgot-password, verify-code, reset-password)
  Future<Response> postPublic(String path, {dynamic data}) => Dio(BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 30),
        headers: {'Content-Type': 'application/json'},
      )).post(path, data: data);
}

// Singleton
final apiClient = ApiClient();
