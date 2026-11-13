// lib/shared/models/suivi_models.dart
//
// Suivi des repas (serveur : api/suivi_repas.py) : frise des étapes
// (Confirmée → Préparation → En route → Arrivé → Retiré), incidents du
// prestataire, services du jour du prestataire, préférences de l'employé.

String _texte(dynamic v) => v?.toString() ?? '';
int _int(dynamic v) =>
    v is num ? v.toInt() : int.tryParse(v?.toString() ?? '') ?? 0;
List<Map<String, dynamic>> _maps(dynamic v) => (v as List? ?? const [])
    .whereType<Map>()
    .map((e) => Map<String, dynamic>.from(e))
    .toList();

enum StatutEtape { fait, enCours, aVenir }

class EtapeSuivi {
  final String code;
  final String libelle;
  final StatutEtape statut;
  final String? heure;
  final String? prevu;
  final bool auto;
  final String? par;

  const EtapeSuivi(
      {required this.code,
      required this.libelle,
      this.statut = StatutEtape.aVenir,
      this.heure,
      this.prevu,
      this.auto = false,
      this.par});

  factory EtapeSuivi.fromJson(Map<String, dynamic> j) => EtapeSuivi(
        code: _texte(j['code']),
        libelle: _texte(j['libelle']),
        statut: switch (j['statut']) {
          'fait' => StatutEtape.fait,
          'en_cours' => StatutEtape.enCours,
          _ => StatutEtape.aVenir,
        },
        heure: j['heure'] as String?,
        prevu: j['prevu'] as String?,
        auto: j['auto'] == true,
        par: j['par'] as String?,
      );
}

class IncidentSuivi {
  final String type; // retard | autre
  final String typeLibelle;
  final String? heurePrevue;
  final String message;
  final String? heure;

  const IncidentSuivi(
      {required this.type,
      this.typeLibelle = '',
      this.heurePrevue,
      this.message = '',
      this.heure});

  factory IncidentSuivi.fromJson(Map<String, dynamic> j) => IncidentSuivi(
        type: _texte(j['type']),
        typeLibelle: _texte(j['type_libelle']),
        heurePrevue: j['heure_prevue'] as String?,
        message: _texte(j['message']),
        heure: j['heure'] as String?,
      );
}

/// Frise d'un service (prestataire) ou du repas d'un employé (accueil)
class SuiviRepas {
  final List<EtapeSuivi> etapes;

  /// confirmee | preparation | en_route | retard | arrive | retire
  final String statut;
  final String statutLibelle;
  final String message;
  final IncidentSuivi? incident;
  final String? prochaineAction; // preparation | en_route | arrive
  final String heureDebut;
  final String heureFin;
  final bool retraitLendemain;

  // Repas de l'employé
  final int commandeId;
  final String plat;

  // Service (prestataire)
  final int menuId;
  final String agence;
  final int agenceId;
  final String? equipe;
  final int nbRepas;
  final int nbRetires;

  const SuiviRepas({
    this.etapes = const [],
    this.statut = 'confirmee',
    this.statutLibelle = '',
    this.message = '',
    this.incident,
    this.prochaineAction,
    this.heureDebut = '',
    this.heureFin = '',
    this.retraitLendemain = false,
    this.commandeId = 0,
    this.plat = '',
    this.menuId = 0,
    this.agence = '',
    this.agenceId = 0,
    this.equipe,
    this.nbRepas = 0,
    this.nbRetires = 0,
  });

  bool get enRetard => statut == 'retard';
  int get aServir => nbRepas - nbRetires;

  factory SuiviRepas.fromJson(Map<String, dynamic> j) => SuiviRepas(
        etapes: _maps(j['etapes']).map(EtapeSuivi.fromJson).toList(),
        statut: _texte(j['statut']),
        statutLibelle: _texte(j['statut_libelle']),
        message: _texte(j['message']),
        incident: j['incident'] is Map
            ? IncidentSuivi.fromJson(Map<String, dynamic>.from(j['incident']))
            : null,
        prochaineAction: j['prochaine_action'] as String?,
        heureDebut: _texte(j['heure_debut']),
        heureFin: _texte(j['heure_fin']),
        retraitLendemain: j['retrait_lendemain'] == true,
        commandeId: _int(j['commande_id']),
        plat: _texte(j['plat']),
        menuId: _int(j['menu_id']),
        agence: _texte(j['agence']),
        agenceId: _int(j['agence_id']),
        equipe: j['equipe'] as String?,
        nbRepas: _int(j['nb_repas']),
        nbRetires: _int(j['nb_retires']),
      );

  static SuiviRepas? fromJsonOuNull(dynamic v) =>
      v is Map ? SuiviRepas.fromJson(Map<String, dynamic>.from(v)) : null;
}

/// GET /prestataire/suivi/
class ServicesSuivi {
  final List<SuiviRepas> services;
  final bool incidentsActif;
  const ServicesSuivi({this.services = const [], this.incidentsActif = true});

  factory ServicesSuivi.fromJson(Map<String, dynamic> j) => ServicesSuivi(
        services: _maps(j['services']).map(SuiviRepas.fromJson).toList(),
        incidentsActif: j['reglages'] is Map
            ? (j['reglages'] as Map)['incidents_actif'] != false
            : true,
      );
}

/// GET /suivi/preferences/
class PreferenceSuivi {
  final String code; // preparation | en_route | rappel | incidents
  final bool disponible;
  final bool actif;
  const PreferenceSuivi(
      {required this.code, this.disponible = true, this.actif = true});
}

class PreferencesSuivi {
  final bool modifiable;
  final int rappelMinutes;
  final bool arriveActif;
  final List<PreferenceSuivi> preferences;
  const PreferencesSuivi(
      {this.modifiable = true,
      this.rappelMinutes = 30,
      this.arriveActif = true,
      this.preferences = const []});

  factory PreferencesSuivi.fromJson(Map<String, dynamic> j) => PreferencesSuivi(
        modifiable: j['modifiable'] != false,
        rappelMinutes: _int(j['rappel_minutes']),
        arriveActif: j['arrive_actif'] != false,
        preferences: _maps(j['preferences'])
            .map((p) => PreferenceSuivi(
                code: _texte(p['code']),
                disponible: p['disponible'] != false,
                actif: p['actif'] != false))
            .toList(),
      );
}
