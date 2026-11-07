// lib/shared/models/prestataire_models.dart
//
// Espace prestataire (comptoir, liste du jour, accueil du responsable) et
// contestation d'un retrait par l'employé. Lecture tolérante : une valeur
// absente ou au mauvais format ne fait pas échouer tout l'écran.

import '../../core/config.dart';
import '../../core/services/notification_routage.dart';

int _int(dynamic v) =>
    v is num ? v.toInt() : int.tryParse(v?.toString() ?? '') ?? 0;

int? _intOuNull(dynamic v) =>
    v is num ? v.toInt() : int.tryParse(v?.toString() ?? '');

double? _doubleOuNull(dynamic v) =>
    v is num ? v.toDouble() : double.tryParse(v?.toString() ?? '');

String _str(dynamic v) => v?.toString() ?? '';

String? _strOuNull(dynamic v) {
  final s = v?.toString().trim() ?? '';
  return s.isEmpty ? null : s;
}

DateTime? _dateHeure(dynamic v) => DateTime.tryParse(v?.toString() ?? '');

/// Date « AAAA-MM-JJ » (jour civil, sans fuseau)
DateTime? _jour(dynamic v) {
  final d = DateTime.tryParse(v?.toString() ?? '');
  return d == null ? null : DateTime(d.year, d.month, d.day);
}

List<Map<String, dynamic>> _maps(dynamic v) => (v as List? ?? [])
    .whereType<Map>()
    .map((e) => Map<String, dynamic>.from(e))
    .toList();

Map<String, dynamic>? _map(dynamic v) =>
    v is Map ? Map<String, dynamic>.from(v) : null;

List<String> _strs(dynamic v) =>
    (v as List? ?? []).map((e) => e.toString()).toList();

String? _url(dynamic v) {
  final url = _strOuNull(v);
  if (url == null) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return '${AppConfig.serverUrl}${url.startsWith('/') ? '' : '/'}$url';
}

/// Clés « id d'agence en chaîne » → entiers
Map<int, int> _parAgence(dynamic v) {
  final m = _map(v) ?? const {};
  return {
    for (final e in m.entries)
      if (int.tryParse(e.key) != null) int.parse(e.key): _int(e.value),
  };
}

// ══════════════════════════════════════════════════════════════
// CONTEXTE (GET /prestataire/contexte/)
// ══════════════════════════════════════════════════════════════

class AgencePrestataire {
  final int id;
  final String nom;
  final int nbEmployes;
  final String? heureDebutService;
  final String? heureFinService;

  const AgencePrestataire({
    required this.id,
    required this.nom,
    this.nbEmployes = 0,
    this.heureDebutService,
    this.heureFinService,
  });

  /// « service 11:30 – 14:30 » (vide si horaires inconnus)
  String get libelleService =>
      heureDebutService == null || heureFinService == null
          ? ''
          : 'service $heureDebutService – $heureFinService';

  factory AgencePrestataire.fromJson(Map<String, dynamic> j) =>
      AgencePrestataire(
        id: _int(j['id'] ?? j['agence_id']),
        nom: _str(j['nom'] ?? j['agence_nom']),
        nbEmployes: _int(j['nb_employes']),
        heureDebutService: _strOuNull(j['heure_debut_service']),
        heureFinService: _strOuNull(j['heure_fin_service']),
      );
}

class ContextePrestataire {
  final int userId;
  final String nomComplet;
  final String role; // prestataire | agent_comptoir
  final String roleLibelle;
  final int prestataireId;
  final String prestataireLibelle;
  final List<AgencePrestataire> agences;
  final Map<String, bool> acces;

  const ContextePrestataire({
    required this.userId,
    required this.nomComplet,
    required this.role,
    required this.roleLibelle,
    required this.prestataireId,
    required this.prestataireLibelle,
    this.agences = const [],
    this.acces = const {},
  });

  bool get estResponsable => role == 'prestataire';
  bool peut(String ecran) => acces[ecran] ?? false;

  factory ContextePrestataire.fromJson(Map<String, dynamic> j) {
    final user = _map(j['user']) ?? const {};
    final presta = _map(j['prestataire']) ?? const {};
    final acces = _map(j['acces']) ?? const {};
    return ContextePrestataire(
      userId: _int(user['id']),
      nomComplet: _str(user['nom_complet']),
      role: _str(user['role']),
      roleLibelle: _str(user['role_libelle']),
      prestataireId: _int(presta['id']),
      prestataireLibelle: _str(presta['libelle']),
      agences: _maps(j['agences']).map(AgencePrestataire.fromJson).toList(),
      acces: {for (final e in acces.entries) e.key: e.value == true},
    );
  }
}

// ══════════════════════════════════════════════════════════════
// COMPTOIR
// ══════════════════════════════════════════════════════════════

/// Quantités d'un plat (service du jour)
class PlatService {
  final int platId;
  final String nom;
  final String? imageUrl;
  final int commandees;
  final int servies;
  final int aServir;

  const PlatService({
    required this.platId,
    required this.nom,
    this.imageUrl,
    this.commandees = 0,
    this.servies = 0,
    this.aServir = 0,
  });

  factory PlatService.fromJson(Map<String, dynamic> j) => PlatService(
        platId: _int(j['plat_id']),
        nom: _str(j['nom'] ?? j['plat']),
        imageUrl: _url(j['image_url']),
        commandees: _int(j['commandees']),
        servies: _int(j['servies']),
        aServir: _int(j['a_servir']),
      );
}

/// Retrait validé au comptoir (réponse de « valider », derniers retraits)
class RetraitComptoir {
  final int id;
  final int userId;
  final String userNom;
  final String matricule;
  final int? menuId;
  final DateTime? dateRetrait;
  final String heure;
  final List<String> plats;
  final int? valideParId;
  final String? valideParNom;
  final String? valideParPrestataire;
  final String mode; // scan | saisie | ''
  final bool annulableParMoi;
  final DateTime? annulableJusquA;

  const RetraitComptoir({
    required this.id,
    required this.userId,
    required this.userNom,
    this.matricule = '',
    this.menuId,
    this.dateRetrait,
    this.heure = '',
    this.plats = const [],
    this.valideParId,
    this.valideParNom,
    this.valideParPrestataire,
    this.mode = '',
    this.annulableParMoi = false,
    this.annulableJusquA,
  });

  /// Temps restant pour annuler (null : plus annulable par moi)
  Duration? resteAnnulation(DateTime maintenant) {
    if (!annulableParMoi || annulableJusquA == null) return null;
    final reste = annulableJusquA!.difference(maintenant);
    return reste.isNegative || reste == Duration.zero ? null : reste;
  }

  String get libelleMode => switch (mode) {
        'scan' => 'Badge scanné',
        'saisie' => 'Matricule saisi',
        _ => '',
      };

  factory RetraitComptoir.fromJson(Map<String, dynamic> j) => RetraitComptoir(
        id: _int(j['id']),
        userId: _int(j['user_id']),
        userNom: _str(j['user_nom']),
        matricule: _str(j['matricule'] ?? j['username']),
        menuId: _intOuNull(j['menu_id']),
        dateRetrait: _dateHeure(j['date_retrait']),
        heure: _str(j['heure']),
        plats: [
          for (final p in (j['plats'] as List? ?? []))
            if (p is Map) _str(p['plat']) else p.toString(),
        ],
        valideParId: _intOuNull(j['valide_par_id']),
        valideParNom: _strOuNull(j['valide_par_nom']),
        valideParPrestataire: _strOuNull(j['valide_par_prestataire']),
        mode: _str(j['mode']),
        annulableParMoi: j['annulable_par_moi'] == true,
        annulableJusquA: _dateHeure(j['annulable_jusqu_a']),
      );
}

/// GET /prestataire/comptoir/service/
class ServiceComptoir {
  final DateTime? date;
  final AgencePrestataire? agence;
  final List<int> menuIds;
  final int commandees;
  final int servies;
  final int aServir;
  final int pctServis;
  final List<PlatService> plats;
  final int mesRetraitsAujourdhui;
  final List<RetraitComptoir> derniers;

  const ServiceComptoir({
    this.date,
    this.agence,
    this.menuIds = const [],
    this.commandees = 0,
    this.servies = 0,
    this.aServir = 0,
    this.pctServis = 0,
    this.plats = const [],
    this.mesRetraitsAujourdhui = 0,
    this.derniers = const [],
  });

  bool get aDesMenus => menuIds.isNotEmpty;

  factory ServiceComptoir.fromJson(Map<String, dynamic> j) {
    final agence = _map(j['agence']);
    return ServiceComptoir(
      date: _jour(j['date']),
      agence: agence == null ? null : AgencePrestataire.fromJson(agence),
      menuIds: _maps(j['menus']).map((m) => _int(m['id'])).toList(),
      commandees: _int(j['commandees']),
      servies: _int(j['servies']),
      aServir: _int(j['a_servir']),
      pctServis: _int(j['pct_servis']),
      plats: _maps(j['plats']).map(PlatService.fromJson).toList(),
      mesRetraitsAujourdhui: _int(j['mes_retraits_aujourdhui']),
      derniers: _maps(j['derniers']).map(RetraitComptoir.fromJson).toList(),
    );
  }
}

class EmployeComptoir {
  final int id;
  final String nomComplet;
  final String matricule;
  final String agence;

  const EmployeComptoir({
    required this.id,
    required this.nomComplet,
    this.matricule = '',
    this.agence = '',
  });

  factory EmployeComptoir.fromJson(Map<String, dynamic> j) {
    final nomComplet = _strOuNull(j['nom_complet']) ??
        [_str(j['nom']), _str(j['prenoms'])]
            .where((s) => s.isNotEmpty)
            .join(' ');
    return EmployeComptoir(
      id: _int(j['id']),
      nomComplet: nomComplet,
      matricule: _str(j['matricule']),
      agence: _str(j['agence']),
    );
  }
}

class CommandeComptoir {
  final int commandeId;
  final int? menuId;
  final String plat;
  final String? platImageUrl;
  final String statut; // en_attente | retiree | annulee

  const CommandeComptoir({
    required this.commandeId,
    this.menuId,
    required this.plat,
    this.platImageUrl,
    this.statut = '',
  });

  bool get aRemettre => statut == 'en_attente';

  factory CommandeComptoir.fromJson(Map<String, dynamic> j) => CommandeComptoir(
        commandeId: _int(j['commande_id']),
        menuId: _intOuNull(j['menu_id']),
        plat: _str(j['plat']),
        platImageUrl: _url(j['plat_image_url']),
        statut: _str(j['statut']),
      );
}

/// GET /prestataire/comptoir/recherche/
class RechercheComptoir {
  final EmployeComptoir employe;
  final List<CommandeComptoir> commandes;
  final bool dejaRetire;
  final RetraitComptoir? retrait;
  final bool aRetirer;
  final int? menuId;
  final String message;

  const RechercheComptoir({
    required this.employe,
    this.commandes = const [],
    this.dejaRetire = false,
    this.retrait,
    this.aRetirer = false,
    this.menuId,
    this.message = '',
  });

  /// Plats à remettre (commandes en attente)
  int get nbARemettre => commandes.where((c) => c.aRemettre).length;

  factory RechercheComptoir.fromJson(Map<String, dynamic> j) {
    final retrait = _map(j['retrait']);
    return RechercheComptoir(
      employe: EmployeComptoir.fromJson(_map(j['employe']) ?? const {}),
      commandes: _maps(j['commandes']).map(CommandeComptoir.fromJson).toList(),
      dejaRetire: j['deja_retire'] == true,
      retrait: retrait == null ? null : RetraitComptoir.fromJson(retrait),
      aRetirer: j['a_retirer'] == true,
      menuId: _intOuNull(j['menu_id']),
      message: _str(j['message']),
    );
  }
}

/// 409 « déjà retiré » renvoyé par POST /prestataire/comptoir/valider/
class DejaRetire {
  final String message;
  final RetraitComptoir? retrait;
  const DejaRetire({required this.message, this.retrait});

  /// null si le corps n'est pas une réponse « déjà retiré »
  static DejaRetire? depuisReponse(dynamic data) {
    final j = _map(data);
    if (j == null) return null;
    if (j['code'] != 'deja_retire' && j['retrait'] == null) return null;
    final retrait = _map(j['retrait']);
    return DejaRetire(
      message: _strOuNull(j['detail']) ?? 'Repas déjà retiré.',
      retrait: retrait == null ? null : RetraitComptoir.fromJson(retrait),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// LISTE DU JOUR (GET /prestataire/liste-du-jour/)
// ══════════════════════════════════════════════════════════════

class LigneListeDuJour {
  final int commandeId;
  final int userId;
  final String nomComplet;
  final String matricule;
  final String agence;
  final String plat;
  final String statut; // a_servir | retire | non_retire
  final String? heureRetrait;
  final String? valideParNom;

  const LigneListeDuJour({
    required this.commandeId,
    required this.userId,
    required this.nomComplet,
    this.matricule = '',
    this.agence = '',
    this.plat = '',
    this.statut = '',
    this.heureRetrait,
    this.valideParNom,
  });

  bool get estRetire => statut == 'retire';

  factory LigneListeDuJour.fromJson(Map<String, dynamic> j) => LigneListeDuJour(
        commandeId: _int(j['commande_id']),
        userId: _int(j['user_id']),
        nomComplet: _strOuNull(j['nom_complet']) ??
            [_str(j['nom']), _str(j['prenoms'])]
                .where((s) => s.isNotEmpty)
                .join(' '),
        matricule: _str(j['matricule']),
        agence: _str(j['agence']),
        plat: _str(j['plat']),
        statut: _str(j['statut']),
        heureRetrait: _strOuNull(j['heure_retrait']),
        valideParNom: _strOuNull(j['valide_par_nom']),
      );
}

class ListeDuJour {
  final DateTime? date;
  final int total;
  final int retires;
  final int aServir;
  final List<LigneListeDuJour> lignes;

  const ListeDuJour({
    this.date,
    this.total = 0,
    this.retires = 0,
    this.aServir = 0,
    this.lignes = const [],
  });

  factory ListeDuJour.fromJson(Map<String, dynamic> j) => ListeDuJour(
        date: _jour(j['date']),
        total: _int(j['total']),
        retires: _int(j['retires']),
        aServir: _int(j['a_servir']),
        lignes: _maps(j['lignes']).map(LigneListeDuJour.fromJson).toList(),
      );
}

// ══════════════════════════════════════════════════════════════
// ACCUEIL DU RESPONSABLE (GET /prestataire/accueil/)
// ══════════════════════════════════════════════════════════════

class ServiceAgencePrestataire {
  final int agenceId;
  final String agenceNom;
  final String? heureDebutService;
  final String? heureFinService;
  final int commandees;
  final int servies;
  final int aServir;

  /// dont employés d'autres agences
  final int externes;
  final List<PlatService> plats;

  const ServiceAgencePrestataire({
    required this.agenceId,
    required this.agenceNom,
    this.heureDebutService,
    this.heureFinService,
    this.commandees = 0,
    this.servies = 0,
    this.aServir = 0,
    this.externes = 0,
    this.plats = const [],
  });

  double get progression =>
      commandees <= 0 ? 0 : (servies / commandees).clamp(0, 1).toDouble();

  factory ServiceAgencePrestataire.fromJson(Map<String, dynamic> j) =>
      ServiceAgencePrestataire(
        agenceId: _int(j['agence_id']),
        agenceNom: _str(j['agence_nom']),
        heureDebutService: _strOuNull(j['heure_debut_service']),
        heureFinService: _strOuNull(j['heure_fin_service']),
        commandees: _int(j['commandees']),
        servies: _int(j['servies']),
        aServir: _int(j['a_servir']),
        externes: _int(j['externes']),
        plats: _maps(j['plats']).map(PlatService.fromJson).toList(),
      );
}

class PlatAPreparer {
  final int platId;
  final String plat;
  final Map<int, int> parAgence;
  final int total;

  const PlatAPreparer({
    required this.platId,
    required this.plat,
    this.parAgence = const {},
    this.total = 0,
  });

  factory PlatAPreparer.fromJson(Map<String, dynamic> j) => PlatAPreparer(
        platId: _int(j['plat_id']),
        plat: _str(j['plat']),
        parAgence: _parAgence(j['par_agence']),
        total: _int(j['total']),
      );
}

/// Prochain jour de service (quantités à préparer)
class JourAPreparer {
  final DateTime? date;
  final String libelle;
  final String etat; // passe | en_service | fige | provisoire | ouvert
  final bool provisoire;
  final String libelleLimite;
  final Map<int, int> totauxParAgence;
  final int total;
  final List<PlatAPreparer> plats;
  final List<AgencePrestataire> agences;

  const JourAPreparer({
    this.date,
    this.libelle = '',
    this.etat = '',
    this.provisoire = false,
    this.libelleLimite = '',
    this.totauxParAgence = const {},
    this.total = 0,
    this.plats = const [],
    this.agences = const [],
  });

  /// « Quantités définitives », « Provisoire · figé mardi 17/11/2026 à 16:00 »…
  String get libelleEtat => switch (etat) {
        'fige' => 'Quantités définitives',
        'provisoire' => libelleLimite.isEmpty
            ? 'Provisoire'
            : 'Provisoire · figé $libelleLimite',
        'ouvert' => libelleLimite.isEmpty
            ? 'Commandes ouvertes (estimation)'
            : 'Commandes ouvertes jusqu\'au $libelleLimite',
        'en_service' => 'En service',
        _ => provisoire ? 'Provisoire' : '',
      };

  factory JourAPreparer.fromJson(Map<String, dynamic> j) => JourAPreparer(
        date: _jour(j['date']),
        libelle: _str(j['libelle']),
        etat: _str(j['etat']),
        provisoire: j['provisoire'] == true,
        libelleLimite: _str(j['libelle_limite']),
        totauxParAgence: _parAgence(j['totaux_par_agence']),
        total: _int(j['total']),
        plats: _maps(j['plats']).map(PlatAPreparer.fromJson).toList(),
        agences: _maps(j['agences']).map(AgencePrestataire.fromJson).toList(),
      );
}

/// Alerte de l'accueil (menus à composer, contestation, relevé, plat masqué)
class AlertePrestataire {
  final String type;
  final Map<String, dynamic> donnees;
  const AlertePrestataire({required this.type, this.donnees = const {}});

  /// Titre court de l'alerte
  String get titre => switch (type) {
        'menus_a_composer' => 'Menus à composer',
        'contestation' => 'Retrait contesté',
        'releve' => 'Relevé ${_str(donnees['libelle'])}'.trim(),
        'plat_masque' => 'Plat masqué par UbiPharm',
        _ => 'À noter',
      };

  /// Détail lisible
  String get detail {
    switch (type) {
      case 'menus_a_composer':
        final agences = _maps(donnees['agences']);
        final parties = [
          for (final a in agences)
            '${_str(a['agence_nom'])} : ${_int(a['jours_a_composer'])} '
                'jour${_int(a['jours_a_composer']) > 1 ? 's' : ''}'
                '${_strs(a['brouillons']).isEmpty ? '' : ' (${_strs(a['brouillons']).length} en brouillon)'}',
        ];
        final semaine = _jour(donnees['semaine_du']);
        final debut = semaine == null
            ? ''
            : 'Semaine du ${semaine.day.toString().padLeft(2, '0')}/'
                '${semaine.month.toString().padLeft(2, '0')}';
        return [debut, ...parties].where((s) => s.isNotEmpty).join(' · ');
      case 'contestation':
        final d = _jour(donnees['date_menu']);
        return [
          _str(donnees['plat']),
          _str(donnees['agence_nom']),
          if (d != null)
            '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}',
          if (_strOuNull(donnees['valide_par_nom']) != null)
            'validé par ${donnees['valide_par_nom']}'
                '${_strOuNull(donnees['heure_retrait']) == null ? '' : ' à ${donnees['heure_retrait']}'}',
        ].where((s) => s.isNotEmpty).join(' · ');
      case 'releve':
        final etat = switch (_str(donnees['etat'])) {
          'cloture' => 'clôturé',
          'a_cloturer' => 'à clôturer',
          'en_cours' => 'en cours',
          final e => e,
        };
        return [
          etat,
          if (_strOuNull(donnees['numero']) != null) 'N° ${donnees['numero']}',
          '${_int(donnees['nb_repas'])} repas',
        ].where((s) => s.isNotEmpty).join(' · ');
      case 'plat_masque':
        return [_str(donnees['plat']), _str(donnees['motif'])]
            .where((s) => s.isNotEmpty)
            .join(' · ');
      default:
        return '';
    }
  }

  factory AlertePrestataire.fromJson(Map<String, dynamic> j) =>
      AlertePrestataire(type: _str(j['type']), donnees: j);
}

class AccueilPrestataire {
  final DateTime? date;
  final String heure;
  final String prestataireLibelle;
  final List<AgencePrestataire> agences;
  final List<ServiceAgencePrestataire> serviceDuJour;
  final JourAPreparer? aPreparer;
  final List<AlertePrestataire> alertes;
  final double? noteMoyenne;
  final int nbAvis;

  const AccueilPrestataire({
    this.date,
    this.heure = '',
    this.prestataireLibelle = '',
    this.agences = const [],
    this.serviceDuJour = const [],
    this.aPreparer,
    this.alertes = const [],
    this.noteMoyenne,
    this.nbAvis = 0,
  });

  int get totalCommandees => serviceDuJour.fold(0, (s, a) => s + a.commandees);
  int get totalServies => serviceDuJour.fold(0, (s, a) => s + a.servies);
  int get totalAServir => serviceDuJour.fold(0, (s, a) => s + a.aServir);

  factory AccueilPrestataire.fromJson(Map<String, dynamic> j) {
    final presta = _map(j['prestataire']) ?? const {};
    final aPreparer = _map(j['a_preparer']);
    final note = _map(j['note_moyenne']) ?? const {};
    return AccueilPrestataire(
      date: _jour(j['date']),
      heure: _str(j['heure']),
      prestataireLibelle: _str(presta['libelle']),
      agences: _maps(j['agences']).map(AgencePrestataire.fromJson).toList(),
      serviceDuJour: _maps(j['service_du_jour'])
          .map(ServiceAgencePrestataire.fromJson)
          .toList(),
      aPreparer: aPreparer == null ? null : JourAPreparer.fromJson(aPreparer),
      alertes: _maps(j['alertes']).map(AlertePrestataire.fromJson).toList(),
      noteMoyenne: _doubleOuNull(note['note']),
      nbAvis: _int(note['nb_avis']),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// CONTESTATION D'UN RETRAIT (employé)
// ══════════════════════════════════════════════════════════════

enum StatutContestation {
  ouverte,
  acceptee,
  rejetee;

  static StatutContestation fromString(String? s) => switch (s) {
        'acceptee' => acceptee,
        'rejetee' => rejetee,
        _ => ouverte,
      };

  String get label => switch (this) {
        ouverte => "En cours d'examen",
        acceptee => 'Contestation acceptée',
        rejetee => 'Contestation rejetée',
      };
}

class ContestationRetrait {
  final int id;
  final int? commandeId;
  final StatutContestation statut;
  final String motif;
  final String motifLibelle;
  final String commentaire;
  final String commentaireTraitement;
  final DateTime? createdAt;
  final DateTime? dateTraitement;

  /// Cause retenue à l'acceptation : erreur_comptoir (repas non facturé)
  /// ou badge_tiers (badge utilisé par un tiers, repas dû) ; null sinon
  final String? cause;
  final String? causeLibelle;

  /// Conséquence expliquée par le serveur (null : contestation ouverte)
  final String? explication;

  const ContestationRetrait({
    required this.id,
    this.commandeId,
    this.statut = StatutContestation.ouverte,
    this.motif = '',
    this.motifLibelle = '',
    this.commentaire = '',
    this.commentaireTraitement = '',
    this.createdAt,
    this.dateTraitement,
    this.cause,
    this.causeLibelle,
    this.explication,
  });

  /// « Acceptée — repas non facturé », « Acceptée — badge utilisé par un
  /// tiers, repas dû », « Rejetée », « En cours d'examen »
  String get libelleDecision => statut == StatutContestation.ouverte
      ? statut.label
      : libelleDecisionContestation(statut.name, cause);

  /// Le repas reste dû par l'employé (rejet, ou badge utilisé par un tiers)
  bool get repasDu =>
      statut == StatutContestation.rejetee ||
      (statut == StatutContestation.acceptee && cause == 'badge_tiers');

  /// Explication de la décision pour l'employé (le libellé de la décision
  /// est affiché à part)
  String get texteDecision {
    if ((explication ?? '').isNotEmpty) return explication!;
    return switch (statut) {
      StatutContestation.ouverte =>
        'Le gestionnaire cantine examine votre contestation.',
      StatutContestation.acceptee => switch (cause) {
          'badge_tiers' => 'Votre badge a été utilisé par un tiers (prêté ou '
              'perdu) : le repas a bien été servi, il reste dû et vous sera '
              'facturé.',
          'erreur_comptoir' =>
            "Le retrait résultait d'une erreur au comptoir : "
                'le repas est annulé, il ne vous sera pas facturé.',
          _ => 'Le retrait a été annulé.',
        },
      StatutContestation.rejetee => 'Le repas reste retiré et facturé.',
    };
  }

  factory ContestationRetrait.fromJson(Map<String, dynamic> j) =>
      ContestationRetrait(
        id: _int(j['id']),
        commandeId: _intOuNull(j['commande'] ?? j['commande_id']),
        statut: StatutContestation.fromString(j['statut'] as String?),
        motif: _str(j['motif']),
        motifLibelle: _str(j['motif_libelle']),
        commentaire: _str(j['commentaire']),
        commentaireTraitement: _str(j['commentaire_traitement']),
        createdAt: _dateHeure(j['created_at']),
        dateTraitement: _dateHeure(j['date_traitement']),
        cause: _strOuNull(j['cause']),
        causeLibelle: _strOuNull(j['cause_libelle']),
        explication: _strOuNull(j['explication']),
      );
}

class MotifContestation {
  final String valeur;
  final String libelle;
  const MotifContestation(this.valeur, this.libelle);

  /// Motifs proposés si le serveur ne les envoie pas
  static const parDefaut = [
    MotifContestation('absent', "J'étais absent(e) (mission, congé…)"),
    MotifContestation(
        'badge_utilise', "Quelqu'un a utilisé mon badge / matricule"),
    MotifContestation('autre', 'Autre raison'),
  ];
}

class InfoRetrait {
  final int id;
  final DateTime? dateRetrait;
  final String heure;
  final String comptoir;
  final String? valideParNom;
  final String? valideParPrestataire;
  final String mode;
  final String? modeLibelle;

  const InfoRetrait({
    required this.id,
    this.dateRetrait,
    this.heure = '',
    this.comptoir = '',
    this.valideParNom,
    this.valideParPrestataire,
    this.mode = '',
    this.modeLibelle,
  });

  factory InfoRetrait.fromJson(Map<String, dynamic> j) => InfoRetrait(
        id: _int(j['id']),
        dateRetrait: _dateHeure(j['date_retrait']),
        heure: _str(j['heure']),
        comptoir: _str(j['comptoir']),
        valideParNom: _strOuNull(j['valide_par_nom']),
        valideParPrestataire: _strOuNull(j['valide_par_prestataire']),
        mode: _str(j['mode']),
        modeLibelle: _strOuNull(j['mode_libelle']),
      );
}

/// GET /commandes/{id}/retrait/
class DetailRetraitCommande {
  final int commandeId;
  final String statut;
  final DateTime? dateMenu;
  final String plat;

  /// Photo du plat (URL absolue), null : icône de substitution
  final String? platImageUrl;
  final String agence;

  /// Commande annulée suite à la contestation (erreur au comptoir)
  final bool annuleeParContestation;
  final InfoRetrait? retrait;
  final ContestationRetrait? contestation;
  final bool contestable;
  final String? raisonNonContestable;
  final DateTime? contestableJusquAu;
  final List<MotifContestation> motifs;

  const DetailRetraitCommande({
    required this.commandeId,
    this.statut = '',
    this.dateMenu,
    this.plat = '',
    this.platImageUrl,
    this.agence = '',
    this.annuleeParContestation = false,
    this.retrait,
    this.contestation,
    this.contestable = false,
    this.raisonNonContestable,
    this.contestableJusquAu,
    this.motifs = MotifContestation.parDefaut,
  });

  factory DetailRetraitCommande.fromJson(Map<String, dynamic> j) {
    final retrait = _map(j['retrait']);
    final contestation = _map(j['contestation']);
    final motifs = _maps(j['motifs'])
        .map((m) => MotifContestation(_str(m['valeur']), _str(m['libelle'])))
        .where((m) => m.valeur.isNotEmpty)
        .toList();
    return DetailRetraitCommande(
      commandeId: _int(j['commande_id']),
      statut: _str(j['statut']),
      dateMenu: _jour(j['date_menu']),
      plat: _str(j['plat']),
      platImageUrl: _url(j['plat_image_url']),
      agence: _str(j['agence']),
      annuleeParContestation: j['annulee_par_contestation'] == true,
      retrait: retrait == null ? null : InfoRetrait.fromJson(retrait),
      contestation: contestation == null
          ? null
          : ContestationRetrait.fromJson(contestation),
      contestable: j['contestable'] == true,
      raisonNonContestable: _strOuNull(j['raison_non_contestable']),
      contestableJusquAu: _jour(j['contestable_jusqu_au']),
      motifs: motifs.isEmpty ? MotifContestation.parDefaut : motifs,
    );
  }
}

/// Vérifie le formulaire « Je n'ai pas retiré ce repas » avant l'envoi :
/// null si valide, sinon le message à afficher.
String? verifierContestation(String? motif, String commentaire) {
  if (motif == null || motif.isEmpty) return 'Choisissez une raison.';
  if (motif == 'autre' && commentaire.trim().isEmpty) {
    return 'Précisez la raison de votre contestation.';
  }
  if (commentaire.trim().length > 1000) {
    return 'Commentaire trop long (1000 caractères au plus).';
  }
  return null;
}
