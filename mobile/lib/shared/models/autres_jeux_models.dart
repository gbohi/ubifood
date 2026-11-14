// lib/shared/models/autres_jeux_models.dart
//
// Défis et badges, pronostics, tickets à gratter, gains (lots gagnés).

Map<String, dynamic> _m(dynamic v) =>
    v is Map ? Map<String, dynamic>.from(v) : const {};
List<dynamic> _l(dynamic v) => v is List ? v : const [];
int _i(dynamic v, [int d = 0]) => (v as num?)?.toInt() ?? d;
int? _in(dynamic v) => (v as num?)?.toInt();
String _s(dynamic v) => v?.toString() ?? '';
DateTime? _d(dynamic v) =>
    v == null ? null : DateTime.tryParse(v.toString())?.toLocal();

/// Lot gagné (tous jeux) et son retrait
class Gain {
  final String source;
  final String sourceLibelle;
  final String jeu;
  final String libelle;
  final String type;

  /// a_remettre | remis | credite
  final String statutLot;
  final DateTime? lotRemisLe;
  final DateTime? gagneLe;

  const Gain({
    required this.source,
    required this.sourceLibelle,
    required this.jeu,
    required this.libelle,
    required this.type,
    required this.statutLot,
    this.lotRemisLe,
    this.gagneLe,
  });

  bool get retire => statutLot == 'remis';

  factory Gain.fromJson(Map<String, dynamic> j) => Gain(
        source: _s(j['source']),
        sourceLibelle: _s(j['source_libelle']),
        jeu: _s(j['jeu']),
        libelle: _s(j['libelle_affiche'] ?? j['libelle']),
        type: _s(j['type']),
        statutLot: _s(j['statut_lot']),
        lotRemisLe: _d(j['lot_remis_le']),
        gagneLe: _d(j['gagne_le']),
      );
}

// ── Défis ──────────────────────────────────────────────────────

class Defi {
  final String code;
  final String nom;
  final String description;
  final int objectif;
  final int points;
  final int valeur;
  final int cible;
  final bool reussi;
  final DateTime? reussiLe;
  final int serieCourante;
  final int commandes;
  final int retires;
  final int oublies;

  const Defi({
    required this.code,
    required this.nom,
    required this.description,
    required this.objectif,
    required this.points,
    required this.valeur,
    required this.cible,
    required this.reussi,
    this.reussiLe,
    this.serieCourante = 0,
    this.commandes = 0,
    this.retires = 0,
    this.oublies = 0,
  });

  /// Avancement de 0 à 1
  double get avancement {
    final c = code == 'retraits' ? commandes : objectif;
    if (c <= 0) return 0;
    return ((code == 'retraits' ? retires : valeur) / c).clamp(0, 1).toDouble();
  }

  factory Defi.fromJson(Map<String, dynamic> j) => Defi(
        code: _s(j['code']),
        nom: _s(j['nom']),
        description: _s(j['description']),
        objectif: _i(j['objectif']),
        points: _i(j['points']),
        valeur: _i(j['valeur']),
        cible: _i(j['cible']),
        reussi: j['reussi'] == true,
        reussiLe: _d(j['reussi_le']),
        serieCourante: _i(j['serie_courante']),
        commandes: _i(j['commandes']),
        retires: _i(j['retires']),
        oublies: _i(j['oublies']),
      );
}

class PalierDefi {
  final String nom;
  final int pointsMin;
  final String recompense;
  final bool atteint;
  const PalierDefi(
      {required this.nom,
      required this.pointsMin,
      required this.recompense,
      required this.atteint});
  factory PalierDefi.fromJson(Map<String, dynamic> j) => PalierDefi(
        nom: _s(j['nom']),
        pointsMin: _i(j['points_min']),
        recompense: _s(j['recompense']),
        atteint: j['atteint'] == true,
      );
}

class BadgeJeu {
  final String code;
  final String nom;
  final int nombre;
  const BadgeJeu({required this.code, required this.nom, required this.nombre});
  factory BadgeJeu.fromJson(Map<String, dynamic> j) =>
      BadgeJeu(code: _s(j['code']), nom: _s(j['nom']), nombre: _i(j['nombre']));
}

class ProgrammeDefis {
  final int id;
  final String titre;
  final String mois;
  final int points;
  final int pointsMax;
  final List<Defi> defis;
  final List<PalierDefi> paliers;
  final String? palierObtenu;
  final Gain? gain;

  const ProgrammeDefis({
    required this.id,
    required this.titre,
    required this.mois,
    required this.points,
    required this.pointsMax,
    this.defis = const [],
    this.paliers = const [],
    this.palierObtenu,
    this.gain,
  });

  factory ProgrammeDefis.fromJson(Map<String, dynamic> j) {
    final r = _m(j['resultat']);
    final g = j['gain'] ?? r['gain'];
    return ProgrammeDefis(
      id: _i(j['id']),
      titre: _s(j['titre']),
      mois: _s(j['mois_libelle']),
      points: _i(j['points'] ?? r['points']),
      pointsMax: _i(j['points_max']),
      defis: _l(j['defis']).map((e) => Defi.fromJson(_m(e))).toList(),
      paliers: _l(j['paliers']).map((e) => PalierDefi.fromJson(_m(e))).toList(),
      palierObtenu: (j['palier'] ?? r['palier'])?.toString(),
      gain: g is Map ? Gain.fromJson(_m(g)) : null,
    );
  }
}

class MesDefis {
  final ProgrammeDefis? courante;
  final ProgrammeDefis? prochaine;
  final List<BadgeJeu> badges;
  final List<ProgrammeDefis> historique;

  const MesDefis(
      {this.courante,
      this.prochaine,
      this.badges = const [],
      this.historique = const []});

  factory MesDefis.fromJson(Map<String, dynamic> j) => MesDefis(
        courante: j['courante'] is Map
            ? ProgrammeDefis.fromJson(_m(j['courante']))
            : null,
        prochaine: j['prochaine'] is Map
            ? ProgrammeDefis.fromJson(_m(j['prochaine']))
            : null,
        badges: _l(j['badges']).map((e) => BadgeJeu.fromJson(_m(e))).toList(),
        historique: _l(j['historique'])
            .map((e) => ProgrammeDefis.fromJson(_m(e)))
            .toList(),
      );
}

// ── Pronostics ─────────────────────────────────────────────────

class MatchProno {
  final int id;
  final String equipeA;
  final String equipeB;
  final String phase;
  final DateTime coupEnvoi;
  final int? scoreA;
  final int? scoreB;
  final bool annule;
  final bool ouvert;
  final int? monA;
  final int? monB;
  final int? mesPoints;
  final String? tendance;

  const MatchProno({
    required this.id,
    required this.equipeA,
    required this.equipeB,
    this.phase = '',
    required this.coupEnvoi,
    this.scoreA,
    this.scoreB,
    this.annule = false,
    this.ouvert = false,
    this.monA,
    this.monB,
    this.mesPoints,
    this.tendance,
  });

  factory MatchProno.fromJson(Map<String, dynamic> j) {
    final p = _m(j['mon_pronostic']);
    final t = _m(j['tendance']);
    return MatchProno(
      id: _i(j['id']),
      equipeA: _s(j['equipe_a']),
      equipeB: _s(j['equipe_b']),
      phase: _s(j['phase']),
      coupEnvoi: _d(j['coup_envoi']) ?? DateTime.now(),
      scoreA: _in(j['score_a']),
      scoreB: _in(j['score_b']),
      annule: j['annule'] == true,
      ouvert: j['ouvert'] == true,
      monA: _in(p['score_a']),
      monB: _in(p['score_b']),
      mesPoints: _in(p['points']),
      tendance: t.isEmpty
          ? null
          : '${t['a']} % · nul ${t['nul']} % · ${t['b']} % (${t['nb']})',
    );
  }
}

class Competition {
  final int id;
  final String titre;
  final String etat;
  final int pointsExact;
  final int pointsResultat;
  final int nbMatchs;
  final int aPronostiquer;
  final int? rang;
  final int? points;
  final bool provisoire;
  final String? resultat;
  final Gain? gain;
  final List<MatchProno> matchs;
  final String? messageEligibilite;

  const Competition({
    required this.id,
    required this.titre,
    required this.etat,
    this.pointsExact = 3,
    this.pointsResultat = 1,
    this.nbMatchs = 0,
    this.aPronostiquer = 0,
    this.rang,
    this.points,
    this.provisoire = false,
    this.resultat,
    this.gain,
    this.matchs = const [],
    this.messageEligibilite,
  });

  factory Competition.fromJson(Map<String, dynamic> j) {
    final p = _m(j['ma_place']);
    final e = _m(j['eligibilite']);
    return Competition(
      id: _i(j['id']),
      titre: _s(j['titre']),
      etat: _s(j['etat']),
      pointsExact: _i(j['points_exact'], 3),
      pointsResultat: _i(j['points_resultat'], 1),
      nbMatchs: _i(j['nb_matchs']),
      aPronostiquer: _i(j['a_pronostiquer']),
      rang: _in(p['rang']),
      points: _in(p['points']),
      provisoire: p['provisoire'] == true,
      resultat: p['resultat']?.toString(),
      gain: p['gain'] is Map ? Gain.fromJson(_m(p['gain'])) : null,
      matchs: _l(j['matchs']).map((x) => MatchProno.fromJson(_m(x))).toList(),
      messageEligibilite:
          e.isNotEmpty && e['ok'] != true ? _s(e['message']) : null,
    );
  }
}

// ── Tickets ────────────────────────────────────────────────────

class TicketJeu {
  final int id;
  final String campagne;
  final String sourceLibelle;
  final DateTime? expireLe;
  final DateTime? gratteLe;

  /// null : pas encore gratté
  final bool? gagne;
  final Gain? gain;

  const TicketJeu({
    required this.id,
    required this.campagne,
    required this.sourceLibelle,
    this.expireLe,
    this.gratteLe,
    this.gagne,
    this.gain,
  });

  factory TicketJeu.fromJson(Map<String, dynamic> j) => TicketJeu(
        id: _i(j['id']),
        campagne: _s(j['campagne']),
        sourceLibelle: _s(j['source_libelle']),
        expireLe: _d(j['expire_le']),
        gratteLe: _d(j['gratte_le']),
        gagne: j['gagne'] as bool?,
        gain: j['gain'] is Map ? Gain.fromJson(_m(j['gain'])) : null,
      );
}

class MesTickets {
  final List<String> campagnes;
  final List<TicketJeu> aGratter;
  final List<TicketJeu> grattes;
  const MesTickets(
      {this.campagnes = const [],
      this.aGratter = const [],
      this.grattes = const []});

  factory MesTickets.fromJson(Map<String, dynamic> j) => MesTickets(
        campagnes: _l(j['campagnes']).map((c) {
          final m = _m(c);
          final lots = _l(m['lots'])
              .map((l) => _s(_m(l)['libelle_affiche']))
              .take(3)
              .join(', ');
          return '${_s(m['titre'])} : à gagner $lots…';
        }).toList(),
        aGratter:
            _l(j['a_gratter']).map((e) => TicketJeu.fromJson(_m(e))).toList(),
        grattes:
            _l(j['grattes']).map((e) => TicketJeu.fromJson(_m(e))).toList(),
      );
}
