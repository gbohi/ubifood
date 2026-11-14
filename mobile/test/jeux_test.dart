// Jeux (quiz à lots) : modèles, liste (gagné / lot retiré / perdu),
// présentation (conditions), partie chronométrée (le temps vient du
// serveur, réponse refusée), résultats et classement.

import 'package:cantine_app/core/services/jeux_service.dart';
import 'package:cantine_app/features/jeux/jeux_screen.dart';
import 'package:cantine_app/features/jeux/partie_screen.dart';
import 'package:cantine_app/features/jeux/resultats_jeu_screen.dart';
import 'package:cantine_app/shared/models/jeux_models.dart';
import 'package:cantine_app/shared/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

final _serveur = DateTime.now().toUtc().toIso8601String();
String _dans(Duration d) => DateTime.now().toUtc().add(d).toIso8601String();

Map<String, dynamic> _jeu({
  int id = 1,
  String etat = 'en_cours',
  String mode = 'libre',
  Map<String, dynamic>? participation,
  bool eligible = true,
}) =>
    {
      'id': id,
      'titre': 'Quiz de novembre',
      'mode': mode,
      'debut': _dans(const Duration(hours: -2)),
      'fin': _dans(const Duration(days: 2)),
      'ouverture': _dans(const Duration(hours: -2)),
      'etat': etat,
      'serveur': _serveur,
      'nb_questions': 10,
      'duree_min': 20,
      'duree_max': 30,
      'nb_gagnants': 3,
      'nb_participants': 146,
      'lots': [
        {
          'id': 1,
          'rangs': '1',
          'rang_debut': 1,
          'rang_fin': 1,
          'libelle': 'Smartphone',
          'libelle_affiche': 'Smartphone',
          'type': 'objet',
          'quantite': 1
        },
        {
          'id': 2,
          'rangs': '2-3',
          'rang_debut': 2,
          'rang_fin': 3,
          'libelle': '20 000 F',
          'libelle_affiche': '20 000 F sur le compte repas',
          'type': 'argent',
          'montant': 20000,
          'quantite': 2
        },
      ],
      'repas_minimum': 1,
      'mois': 'novembre 2026',
      'participation': participation,
      'eligibilite': {
        'ok': eligible,
        'nb_repas': eligible ? 6 : 0,
        'minimum': 1,
        'message': eligible
            ? '6 repas commandés en novembre 2026 (1 minimum).'
            : 'Commandez encore 1 repas en novembre 2026 pour participer.'
      },
      'regles': {'bonus_rapidite_pct': 50},
    };

Map<String, dynamic> _gagne({String statutLot = 'a_remettre'}) => {
      'statut': 'terminee',
      'points': 1310,
      'nb_bonnes': 9,
      'nb_questions': 10,
      'temps_total_ms': 161000,
      'rang': 2,
      'resultat': 'gagne',
      'statut_lot': statutLot,
      'lot_remis_le': statutLot == 'remis' ? '2026-11-18T10:05:00+00:00' : null,
      'lot': {
        'libelle': 'Smartphone',
        'libelle_affiche': 'Smartphone',
        'type': 'objet'
      },
    };

Map<String, dynamic> _question({int index = 3, int restantMs = 18000}) => {
      'statut': 'question',
      'total': 10,
      'index': index,
      'repondues': index,
      'restant_ms': restantMs,
      'question': {
        'texte': 'Quel plat est fait de semoule de manioc ?',
        'duree': 30,
        'reponses': [
          {'id': 11, 'texte': 'Foutou banane'},
          {'id': 12, 'texte': 'Attiéké'},
        ],
      },
    };

class _FauxService extends JeuxService {
  Map<String, dynamic> jeuJson = _jeu();
  Map<String, dynamic> listeJson = const {};
  EtatPartie? apresReponse;
  Object? erreurReponse;
  int appelsPartie = 0;
  final List<(int, int)> reponses = [];

  @override
  Future<ListeJeux> liste() async => ListeJeux.fromJson(listeJson);
  @override
  Future<Jeu> jeu(int id) async => Jeu.fromJson(jeuJson);
  @override
  Future<EtatPartie> commencer(int id) async =>
      EtatPartie.fromJson(_question(index: 0, restantMs: 30000));
  @override
  Future<EtatPartie> partie(int id) async {
    appelsPartie++;
    return EtatPartie.fromJson(_question(index: 4, restantMs: 25000));
  }

  @override
  Future<EtatPartie> repondre(int id, int index, int reponseId) async {
    reponses.add((index, reponseId));
    if (erreurReponse != null) throw erreurReponse!;
    return apresReponse!;
  }

  @override
  Future<ResultatsJeu> resultats(int id) async => ResultatsJeu.fromJson({
        'jeu': _jeu(etat: 'resultats', participation: _gagne()),
        'corrections': true,
        'nb_participants': 146,
        'reponses': [
          {
            'index': 0,
            'question': 'Q1 ?',
            'repondu': true,
            'reponse': 'Attiéké',
            'temps_ms': 5000,
            'correcte': true,
            'bonne_reponse': 'Attiéké',
            'points': 142
          },
          {
            'index': 1,
            'question': 'Q2 ?',
            'repondu': true,
            'reponse': 'Riz',
            'temps_ms': 9000,
            'correcte': false,
            'bonne_reponse': 'Attiéké',
            'points': 0
          },
          {
            'index': 2,
            'question': 'Q3 ?',
            'repondu': false,
            'temps_ms': 20000,
            'correcte': false,
            'bonne_reponse': 'Minuit',
            'points': 0
          },
        ],
      });

  @override
  Future<ClassementJeu> classement(int id) async => ClassementJeu.fromJson({
        'nb_participants': 4,
        'lignes': [
          {
            'rang': 1,
            'nom': 'Awa O.',
            'initiales': 'AO',
            'moi': false,
            'points': 1365,
            'nb_bonnes': 10,
            'nb_questions': 10,
            'temps_total_ms': 132000,
            'lot': 'Smartphone'
          },
          {
            'rang': 2,
            'nom': 'Vous',
            'initiales': 'IK',
            'moi': true,
            'points': 1310,
            'nb_bonnes': 9,
            'nb_questions': 10,
            'temps_total_ms': 161000,
            'lot': '20 000 F sur le compte repas'
          },
          {
            'rang': 3,
            'nom': 'Paul N.',
            'initiales': 'PN',
            'moi': false,
            'points': 1298,
            'nb_bonnes': 9,
            'nb_questions': 10,
            'temps_total_ms': 150000,
            'lot': '20 000 F sur le compte repas'
          },
          {
            'rang': 4,
            'nom': 'Jean K.',
            'initiales': 'JK',
            'moi': false,
            'points': 1020,
            'nb_bonnes': 8,
            'nb_questions': 10,
            'temps_total_ms': 189000,
            'lot': null
          },
        ],
      });
}

Widget _app(Widget home) => MaterialApp(theme: AppTheme.light(), home: home);

void main() {
  setUpAll(() => initializeDateFormatting('fr_FR'));

  test('modèles : participation, état de la partie, durée', () {
    final j = Jeu.fromJson(_jeu(participation: _gagne(statutLot: 'remis')));
    expect(j.participation!.lotRetire, isTrue);
    expect(j.participation!.lotRemisLe, isNotNull);
    expect(j.nbGagnants, 3);
    expect(j.lots[1].libelleAffiche, contains('compte repas'));
    final e = EtatPartie.fromJson(_question());
    expect((e.statut, e.index, e.reponses.length), ('question', 3, 2));
    expect(e.echeance.difference(DateTime.now()).inSeconds,
        inInclusiveRange(16, 18));
    expect(
        EtatPartie.fromJson({
          'statut': 'attente_suivante',
          'total': 5,
          'suivante_dans_ms': 4000
        }).restant,
        const Duration(seconds: 4));
    expect(formatDureeJeu(161000), '2 min 41');
    expect(formatDureeJeu(45000), '45 s');
  });

  testWidgets('liste : jeu en cours, lot retiré, perdu', (tester) async {
    final s = _FauxService()
      ..listeJson = {
        'serveur': _serveur,
        'en_cours': [_jeu(id: 1)],
        'a_venir': [_jeu(id: 2, etat: 'a_venir', mode: 'direct')],
        'passes': [
          _jeu(
              id: 3,
              etat: 'resultats',
              participation: _gagne(statutLot: 'remis')),
          _jeu(id: 4, etat: 'resultats', participation: {
            'statut': 'terminee',
            'points': 780,
            'nb_bonnes': 6,
            'nb_questions': 10,
            'rang': 41,
            'resultat': 'perdu',
            'statut_lot': ''
          }),
        ],
      };
    await tester.pumpWidget(_app(JeuxScreen(service: s)));
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('jeu-en-cours-1')), findsOneWidget);
    expect(find.text('Jouer'), findsOneWidget);
    expect(find.text('À venir'), findsOneWidget);
    expect(find.text('Smartphone · retiré'), findsOneWidget);
    expect(find.text('Perdu'), findsOneWidget);
  });

  for (final largeur in [390.0, 320.0]) {
    testWidgets('présentation : conditions et lots ($largeur px)',
        (tester) async {
      tester.view.physicalSize = Size(largeur, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final s = _FauxService();
      await tester.pumpWidget(_app(JeuDetailScreen(jeuId: 1, service: s)));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.textContaining('Vous pouvez jouer'), findsOneWidget);
      expect(
          find.textContaining('Le chrono ne s\'arrête jamais'), findsOneWidget);
      expect(find.text('Smartphone'), findsOneWidget);
      expect(find.text('Commencer la partie'), findsOneWidget);
    });
  }

  testWidgets('présentation : non éligible, bouton désactivé', (tester) async {
    final s = _FauxService()..jeuJson = _jeu(eligible: false);
    await tester.pumpWidget(_app(JeuDetailScreen(jeuId: 1, service: s)));
    await tester.pumpAndSettle();
    expect(find.textContaining('Commandez encore 1 repas'), findsOneWidget);
    final bouton =
        tester.widget<BoutonJeu>(find.byKey(const Key('btn-commencer')));
    expect(bouton.onPressed, isNull);
  });

  testWidgets('gagné : lot retiré affiché pour éviter un second retrait',
      (tester) async {
    final s = _FauxService()
      ..jeuJson =
          _jeu(etat: 'resultats', participation: _gagne(statutLot: 'remis'));
    await tester.pumpWidget(_app(JeuDetailScreen(jeuId: 1, service: s)));
    await tester.pumpAndSettle();
    expect(find.text('Bravo, vous avez gagné !'), findsOneWidget);
    expect(find.textContaining('Lot retiré le'), findsOneWidget);
    expect(find.byKey(const Key('btn-classement')), findsOneWidget);
  });

  testWidgets('partie : chrono du serveur, réponse, question suivante',
      (tester) async {
    final s = _FauxService()
      ..apresReponse =
          EtatPartie.fromJson(_question(index: 4, restantMs: 30000));
    final jeu = Jeu.fromJson(_jeu());
    await tester.pumpWidget(_app(PartieScreen(
        jeu: jeu, etatInitial: EtatPartie.fromJson(_question()), service: s)));
    await tester.pump();
    expect(find.text('Question 4 / 10'), findsOneWidget);
    expect(find.text('18'), findsOneWidget);
    expect(find.textContaining('correct'),
        findsNothing); // aucune correction pendant la partie
    await tester.tap(find.byKey(const Key('reponse-12')));
    await tester.pump();
    expect(s.reponses, [(3, 12)]);
    expect(find.text('Question 5 / 10'), findsOneWidget);
    expect(find.text('30'), findsOneWidget);
    await tester.pumpWidget(const SizedBox()); // arrête les minuteurs
  });

  testWidgets('partie : réponse refusée (temps écoulé) → état du serveur',
      (tester) async {
    final s = _FauxService()
      ..erreurReponse = ReponseRefusee(
          'Temps écoulé : cette question est close.',
          EtatPartie.fromJson(_question(index: 4, restantMs: 12000)));
    final jeu = Jeu.fromJson(_jeu());
    await tester.pumpWidget(_app(PartieScreen(
        jeu: jeu, etatInitial: EtatPartie.fromJson(_question()), service: s)));
    await tester.pump();
    await tester.tap(find.byKey(const Key('reponse-11')));
    await tester.pump();
    expect(
        find.text('Temps écoulé : cette question est close.'), findsOneWidget);
    expect(find.text('Question 5 / 10'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
      'partie : à l\'échéance, le serveur donne la suite (le temps continue)',
      (tester) async {
    final s = _FauxService();
    final jeu = Jeu.fromJson(_jeu());
    await tester.pumpWidget(_app(PartieScreen(
        jeu: jeu,
        etatInitial: EtatPartie.fromJson(_question(restantMs: 1000)),
        service: s)));
    await tester.pump(const Duration(milliseconds: 1600));
    await tester.pump();
    expect(s.appelsPartie, 1);
    expect(find.text('Question 5 / 10'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('partie : salle d\'attente du direct, partie terminée',
      (tester) async {
    final jeu = Jeu.fromJson(_jeu(mode: 'direct'));
    await tester.pumpWidget(_app(PartieScreen(
        jeu: jeu,
        etatInitial: EtatPartie.fromJson(
            {'statut': 'attente_debut', 'total': 10, 'debut_dans_ms': 125000}),
        service: _FauxService())));
    await tester.pump();
    expect(find.text('Salle d\'attente'), findsOneWidget);
    expect(find.text('02:05'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(_app(PartieScreen(
        jeu: jeu,
        etatInitial: EtatPartie.fromJson({
          'statut': 'terminee',
          'total': 10,
          'points': 980,
          'nb_bonnes': 8,
          'temps_total_ms': 150000
        }),
        service: _FauxService())));
    await tester.pump();
    expect(find.byKey(const Key('partie-terminee')), findsOneWidget);
    expect(find.text('8/10'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('résultats et classement', (tester) async {
    final s = _FauxService();
    await tester.pumpWidget(_app(ResultatsJeuScreen(jeuId: 1, service: s)));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('✓ Attiéké'), findsOneWidget);
    expect(find.text('✗ Riz'), findsOneWidget);
    expect(find.text('⏱ Temps écoulé'), findsOneWidget);
    expect(find.text('· bonne réponse : Minuit'), findsOneWidget);
    await tester.pumpWidget(_app(ClassementJeuScreen(
        jeu: Jeu.fromJson(_jeu(etat: 'resultats')), service: s)));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Vous'), findsNWidgets(2)); // podium + liste
    expect(find.text('Perdu'), findsOneWidget);
    expect(find.text('🏆 Smartphone'), findsOneWidget);
  });
}
