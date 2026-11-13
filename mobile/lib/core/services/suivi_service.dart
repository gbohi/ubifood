// lib/core/services/suivi_service.dart
//
// Suivi des repas : services du jour du prestataire (étapes, incidents) et
// préférences de notification de l'employé.

import '../api/api_client.dart';
import '../../shared/models/suivi_models.dart';

Map<String, dynamic> _objet(dynamic data) =>
    data is Map ? Map<String, dynamic>.from(data) : const {};

class SuiviService {
  Future<ServicesSuivi> services() async {
    final res = await apiClient.get('/prestataire/suivi/');
    return ServicesSuivi.fromJson(_objet(res.data));
  }

  /// etape : preparation | en_route | arrive. Renvoie (service, employés prévenus).
  Future<(SuiviRepas, int)> declarer(int menuId, String etape) async {
    final res = await apiClient
        .post('/prestataire/suivi/$menuId/', data: {'etape': etape});
    final d = _objet(res.data);
    return (
      SuiviRepas.fromJson(_objet(d['service'])),
      (d['notifies'] as num?)?.toInt() ?? 0
    );
  }

  Future<(SuiviRepas, int)> incident(int menuId,
      {required String type, String? heure, String message = ''}) async {
    final res = await apiClient.post('/prestataire/suivi/$menuId/incident/',
        data: {
          'type': type,
          if (heure != null) 'heure': heure,
          'message': message
        });
    final d = _objet(res.data);
    return (
      SuiviRepas.fromJson(_objet(d['service'])),
      (d['notifies'] as num?)?.toInt() ?? 0
    );
  }

  Future<PreferencesSuivi> preferences() async {
    final res = await apiClient.get('/suivi/preferences/');
    return PreferencesSuivi.fromJson(_objet(res.data));
  }

  Future<PreferencesSuivi> modifierPreference(String code, bool actif) async {
    final res =
        await apiClient.patch('/suivi/preferences/', data: {code: actif});
    return PreferencesSuivi.fromJson(_objet(res.data));
  }
}
