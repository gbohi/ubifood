// lib/shared/models/jeux_models.dart
//
// Jeux (quiz à lots) : jeu, lots, ma participation, état de la partie (le
// serveur tient le temps), résultats et classement. API : jeux/.

Map<String, dynamic> _m(dynamic v) =>
    v is Map ? Map<String, dynamic>.from(v) : const {};
List<dynamic> _l(dynamic v) => v is List ? v : const [];
int _i(dynamic v, [int d = 0]) => (v as num?)?.toInt() ?? d;
int? _in(dynamic v) => (v as num?)?.toInt();
DateTime? _d(dynamic v) =>
    v == null ? null : DateTime.tryParse(v.toString())?.toLocal();

class LotJeu {
  final int id;
  final String rangs;
  final int rangDebut;
  final int rangFin;
  final String libelle;
  final String libelleAffiche;
  final String type;
  final double? montant;
  final int quantite;

  const LotJeu({
    required this.id,
    required this.rangs,
    required this.rangDebut,
    required this.rangFin,
    required this.libelle,
    required this.libelleAffiche,
    required this.type,
    this.montant,
    required this.quantite,
  });

  factory LotJeu.fromJson(Map<String, dynamic> j) => LotJeu(
        id: _i(j['id']),
        rangs: j['rangs']?.toString() ?? '',
        rangDebut: _i(j['rang_debut'], 1),
        rangFin: _i(j['rang_fin'], 1),
        libelle: j['libelle']?.toString() ?? '',
        libelleAffiche:
            (j['libelle_affiche'] ?? j['libelle'])?.toString() ?? '',
        type: j['type']?.toString() ?? 'objet',
        montant: (j['montant'] as num?)?.toDouble(),
        quantite: _i(j['quantite'], 1),
      );
}

/// Ma participation à un jeu
class ParticipationJeu {
  final String statut; // en_cours | terminee
  final int? points;
  final int? nbBonnes;
  final int nbQuestions;
  final int? tempsTotalMs;
  final int? rang;

  /// gagne | perdu | non_classe (null : résultats pas encore publiés)
  final String? resultat;
  final String motif;
  final String? lotLibelle;
  final String? lotType;

  /// '' | a_remettre | remis | credite
  final String statutLot;
  final DateTime? lotRemisLe;

  const ParticipationJeu({
    required this.statut,
    this.points,
    this.nbBonnes,
    required this.nbQuestions,
    this.tempsTotalMs,
    this.rang,
    this.resultat,
    this.motif = '',
    this.lotLibelle,
    this.lotType,
    this.statutLot = '',
    this.lotRemisLe,
  });

  bool get terminee => statut == 'terminee';
  bool get lotRetire => statutLot == 'remis';

  factory ParticipationJeu.fromJson(Map<String, dynamic> j) {
    final lot = j['lot'] is Map ? _m(j['lot']) : null;
    return ParticipationJeu(
      statut: j['statut']?.toString() ?? 'en_cours',
      points: _in(j['points']),
      nbBonnes: _in(j['nb_bonnes']),
      nbQuestions: _i(j['nb_questions']),
      tempsTotalMs: _in(j['temps_total_ms']),
      rang: _in(j['rang']),
      resultat: j['resultat']?.toString(),
      motif: j['motif']?.toString() ?? '',
      lotLibelle: lot == null
          ? null
          : (lot['libelle_affiche'] ?? lot['libelle'])?.toString(),
      lotType: lot?['type']?.toString(),
      statutLot: j['statut_lot']?.toString() ?? '',
      lotRemisLe: _d(j['lot_remis_le']),
    );
  }
}

class EligibiliteJeu {
  final bool ok;
  final int nbRepas;
  final int minimum;
  final String message;

  const EligibiliteJeu(
      {required this.ok,
      required this.nbRepas,
      required this.minimum,
      required this.message});

  factory EligibiliteJeu.fromJson(Map<String, dynamic> j) => EligibiliteJeu(
        ok: j['ok'] == true,
        nbRepas: _i(j['nb_repas']),
        minimum: _i(j['minimum']),
        message: j['message']?.toString() ?? '',
      );
}

class Jeu {
  final int id;
  final String titre;
  final String description;
  final String mode; // libre | direct
  final DateTime debut;
  final DateTime fin;
  final DateTime? ouverture;

  /// brouillon | a_venir | en_cours | termine | resultats | annule
  final String etat;

  /// Écart horloge serveur − horloge du téléphone
  final Duration decalage;
  final int nbQuestions;
  final int dureeMin;
  final int dureeMax;
  final int nbGagnants;
  final List<LotJeu> lots;
  final int repasMinimum;
  final String mois;
  final int? nbParticipants;
  final ParticipationJeu? participation;
  final EligibiliteJeu? eligibilite;
  final int bonusRapiditePct;

  const Jeu({
    required this.id,
    required this.titre,
    this.description = '',
    required this.mode,
    required this.debut,
    required this.fin,
    this.ouverture,
    required this.etat,
    this.decalage = Duration.zero,
    required this.nbQuestions,
    this.dureeMin = 0,
    this.dureeMax = 0,
    required this.nbGagnants,
    this.lots = const [],
    this.repasMinimum = 0,
    this.mois = '',
    this.nbParticipants,
    this.participation,
    this.eligibilite,
    this.bonusRapiditePct = 50,
  });

  bool get direct => mode == 'direct';

  /// Heure du serveur estimée maintenant
  DateTime get maintenantServeur => DateTime.now().add(decalage);

  /// Le joueur peut démarrer / rejoindre (période ouverte, salle d'attente du direct)
  bool get ouvert =>
      etat == 'en_cours' ||
      (etat == 'a_venir' &&
          direct &&
          ouverture != null &&
          !maintenantServeur.isBefore(ouverture!));

  factory Jeu.fromJson(Map<String, dynamic> j) {
    final serveur = _d(j['serveur']);
    final regles = _m(j['regles']);
    return Jeu(
      id: _i(j['id']),
      titre: j['titre']?.toString() ?? '',
      description: j['description']?.toString() ?? '',
      mode: j['mode']?.toString() ?? 'libre',
      debut: _d(j['debut']) ?? DateTime.now(),
      fin: _d(j['fin']) ?? DateTime.now(),
      ouverture: _d(j['ouverture']),
      etat: j['etat']?.toString() ?? 'a_venir',
      decalage:
          serveur == null ? Duration.zero : serveur.difference(DateTime.now()),
      nbQuestions: _i(j['nb_questions']),
      dureeMin: _i(j['duree_min']),
      dureeMax: _i(j['duree_max']),
      nbGagnants: _i(j['nb_gagnants']),
      lots: _l(j['lots']).map((e) => LotJeu.fromJson(_m(e))).toList(),
      repasMinimum: _i(j['repas_minimum']),
      mois: j['mois']?.toString() ?? '',
      nbParticipants: _in(j['nb_participants']),
      participation: j['participation'] is Map
          ? ParticipationJeu.fromJson(_m(j['participation']))
          : null,
      eligibilite: j['eligibilite'] is Map
          ? EligibiliteJeu.fromJson(_m(j['eligibilite']))
          : null,
      bonusRapiditePct: _i(regles['bonus_rapidite_pct'], 50),
    );
  }
}

class ListeJeux {
  final List<Jeu> enCours;
  final List<Jeu> aVenir;
  final List<Jeu> passes;

  const ListeJeux(
      {this.enCours = const [],
      this.aVenir = const [],
      this.passes = const []});

  bool get vide => enCours.isEmpty && aVenir.isEmpty && passes.isEmpty;

  factory ListeJeux.fromJson(Map<String, dynamic> j) {
    // L'heure du serveur est donnée une fois pour la liste
    List<Jeu> jeux(String cle) => _l(j[cle])
        .map((e) => Jeu.fromJson({'serveur': j['serveur'], ..._m(e)}))
        .toList();
    return ListeJeux(
        enCours: jeux('en_cours'),
        aVenir: jeux('a_venir'),
        passes: jeux('passes'));
  }
}

class ReponseProposee {
  final int id;
  final String texte;
  const ReponseProposee(this.id, this.texte);
}

/// État de ma partie, à l'heure du serveur
class EtatPartie {
  /// attente_debut | question | attente_suivante | terminee
  final String statut;
  final int total;
  final int index;
  final int repondues;
  final String? question;
  final int duree;
  final List<ReponseProposee> reponses;

  /// Temps restant (question) ou avant la prochaine étape (attentes)
  final Duration restant;

  /// Instant (heure du téléphone) où le temps restant tombe à zéro
  final DateTime echeance;
  final int? points;
  final int? nbBonnes;
  final int? tempsTotalMs;
  final DateTime? correctionsLe;

  EtatPartie({
    required this.statut,
    required this.total,
    this.index = 0,
    this.repondues = 0,
    this.question,
    this.duree = 0,
    this.reponses = const [],
    this.restant = Duration.zero,
    DateTime? echeance,
    this.points,
    this.nbBonnes,
    this.tempsTotalMs,
    this.correctionsLe,
  }) : echeance = echeance ?? DateTime.now().add(restant);

  bool get terminee => statut == 'terminee';

  factory EtatPartie.fromJson(Map<String, dynamic> j) {
    final statut = j['statut']?.toString() ?? 'terminee';
    final ms = switch (statut) {
      'question' => _i(j['restant_ms']),
      'attente_debut' => _i(j['debut_dans_ms']),
      'attente_suivante' => _i(j['suivante_dans_ms']),
      _ => 0,
    };
    final q = _m(j['question']);
    return EtatPartie(
      statut: statut,
      total: _i(j['total']),
      index: _i(j['index']),
      repondues: _i(j['repondues']),
      question: q['texte']?.toString(),
      duree: _i(q['duree']),
      reponses: _l(q['reponses'])
          .map((e) => _m(e))
          .map(
              (e) => ReponseProposee(_i(e['id']), e['texte']?.toString() ?? ''))
          .toList(),
      restant: Duration(milliseconds: ms),
      points: _in(j['points']),
      nbBonnes: _in(j['nb_bonnes']),
      tempsTotalMs: _in(j['temps_total_ms']),
      correctionsLe: _d(j['corrections_le']),
    );
  }
}

class ReponseCorrigee {
  final int index;
  final String question;
  final bool repondu;
  final String? reponse;
  final int tempsMs;
  final bool? correcte;
  final String? bonneReponse;
  final int? points;

  const ReponseCorrigee({
    required this.index,
    required this.question,
    required this.repondu,
    this.reponse,
    required this.tempsMs,
    this.correcte,
    this.bonneReponse,
    this.points,
  });

  factory ReponseCorrigee.fromJson(Map<String, dynamic> j) => ReponseCorrigee(
        index: _i(j['index']),
        question: j['question']?.toString() ?? '',
        repondu: j['repondu'] == true,
        reponse: j['reponse']?.toString(),
        tempsMs: _i(j['temps_ms']),
        correcte: j['correcte'] as bool?,
        bonneReponse: j['bonne_reponse']?.toString(),
        points: _in(j['points']),
      );
}

class ResultatsJeu {
  final Jeu jeu;
  final bool corrections;
  final DateTime? correctionsLe;
  final int nbParticipants;
  final List<ReponseCorrigee> reponses;

  const ResultatsJeu({
    required this.jeu,
    required this.corrections,
    this.correctionsLe,
    required this.nbParticipants,
    this.reponses = const [],
  });

  factory ResultatsJeu.fromJson(Map<String, dynamic> j) => ResultatsJeu(
        jeu: Jeu.fromJson(_m(j['jeu'])),
        corrections: j['corrections'] == true,
        correctionsLe: _d(j['corrections_le']),
        nbParticipants: _i(j['nb_participants']),
        reponses: _l(j['reponses'])
            .map((e) => ReponseCorrigee.fromJson(_m(e)))
            .toList(),
      );
}

class LigneClassement {
  final int rang;
  final String nom;
  final String initiales;
  final bool moi;
  final int points;
  final int nbBonnes;
  final int nbQuestions;
  final int tempsTotalMs;
  final String? lot;

  const LigneClassement({
    required this.rang,
    required this.nom,
    required this.initiales,
    required this.moi,
    required this.points,
    required this.nbBonnes,
    required this.nbQuestions,
    required this.tempsTotalMs,
    this.lot,
  });

  factory LigneClassement.fromJson(Map<String, dynamic> j) => LigneClassement(
        rang: _i(j['rang']),
        nom: j['nom']?.toString() ?? '',
        initiales: j['initiales']?.toString() ?? '',
        moi: j['moi'] == true,
        points: _i(j['points']),
        nbBonnes: _i(j['nb_bonnes']),
        nbQuestions: _i(j['nb_questions']),
        tempsTotalMs: _i(j['temps_total_ms']),
        lot: j['lot']?.toString(),
      );
}

class ClassementJeu {
  final int nbParticipants;
  final List<LigneClassement> lignes;

  const ClassementJeu({required this.nbParticipants, this.lignes = const []});

  factory ClassementJeu.fromJson(Map<String, dynamic> j) => ClassementJeu(
        nbParticipants: _i(j['nb_participants']),
        lignes: _l(j['lignes'])
            .map((e) => LigneClassement.fromJson(_m(e)))
            .toList(),
      );
}

/// « 2 min 41 » / « 45 s »
String formatDureeJeu(int? ms) {
  if (ms == null) return '—';
  final s = (ms / 1000).round();
  if (s < 60) return '$s s';
  return '${s ~/ 60} min ${(s % 60).toString().padLeft(2, '0')}';
}

/// « 1er », « 2e »…
String rangFr(int n) => n == 1 ? '1er' : '${n}e';
