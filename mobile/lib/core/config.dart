// lib/core/config.dart
//
// ⚠️ SEUL FICHIER À MODIFIER pour changer l'URL du serveur.
// Remplacer YOUR_API_URL par votre IP + port, ex: 192.168.1.100:8000

class AppConfig {
  // URL de base du serveur Django (sans slash final)
  static const serverUrl = 'http://51.20.12.161';

  // Base URL pour les appels API DRF
  static const apiBaseUrl = '$serverUrl/api/api';

  // Endpoint JWT (hors /api/api)
  static const tokenUrl = '$apiBaseUrl/token/';
  static const refreshUrl = '$apiBaseUrl/token/refresh/';
}
