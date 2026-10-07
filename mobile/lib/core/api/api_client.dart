// lib/core/api/api_client.dart

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config.dart';

class ApiClient {
  static const _storage = FlutterSecureStorage();
  late final Dio _dio;

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
        final token = await _storage.read(key: 'access_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        // Token expiré → refresh automatique
        if (error.response?.statusCode == 401) {
          final refreshed = await _refreshToken();
          if (refreshed) {
            // Relancer la requête originale
            final token = await _storage.read(key: 'access_token');
            error.requestOptions.headers['Authorization'] = 'Bearer $token';
            final response = await _dio.fetch(error.requestOptions);
            return handler.resolve(response);
          }
        }
        handler.next(error);
      },
    ));
  }

  Future<bool> _refreshToken() async {
    try {
      final refresh = await _storage.read(key: 'refresh_token');
      if (refresh == null) return false;
      final response = await Dio().post(
        AppConfig.refreshUrl,
        data: {'refresh': refresh},
      );
      await _storage.write(key: 'access_token', value: response.data['access']);
      return true;
    } catch (_) {
      await logout();
      return false;
    }
  }

  Future<void> saveTokens(String access, String refresh) async {
    await _storage.write(key: 'access_token', value: access);
    await _storage.write(key: 'refresh_token', value: refresh);
  }

  Future<void> logout() async {
    await _storage.deleteAll();
  }

  Future<bool> hasToken() async {
    final token = await _storage.read(key: 'access_token');
    return token != null;
  }

  // ── CRUD helpers ──────────────────────────────────────────

  Future<Response> get(String path, {Map<String, dynamic>? params}) =>
      _dio.get(path, queryParameters: params);

  Future<Response> post(String path, {dynamic data}) =>
      _dio.post(path, data: data);

  Future<Response> patch(String path, {dynamic data}) =>
      _dio.patch(path, data: data);

  Future<Response> delete(String path, {dynamic data}) =>
      _dio.delete(path, data: data);

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
