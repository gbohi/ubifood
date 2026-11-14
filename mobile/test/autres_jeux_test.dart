// Défis et badges, pronostics, ticket à gratter, mes gains (onglets de Jeux).

import 'package:cantine_app/core/services/jeux_service.dart';
import 'package:cantine_app/features/jeux/autres_jeux_onglets.dart';
import 'package:cantine_app/features/jeux/jeux_screen.dart';
import 'package:cantine_app/features/jeux/lots_a_remettre_screen.dart';
import 'package:cantine_app/shared/models/autres_jeux_models.dart';
import 'package:cantine_app/shared/models/jeux_models.dart';
import 'package:cantine_app/shared/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

final _demain = DateTime.now().add(const Duration(days: 1)).toUtc().toIso8601String();
final _hier = DateTime.now().subtract(const Duration(days: 1)).toUtc().toIso8601String();

Map<String, dynamic> _gain({String statut = 'remis'}) => {
      'source': 'ticket', 'source_libelle': 'Ticket à gratter', 'jeu': 'Tickets de décembre',
      'libelle': 'T-shirt', 'libelle_affiche': 'T-shirt', 'type': 'objet', 'statut_lot': statut,
      'lot_remis_le': statut == 'remis' ? '2026-12-03T10:00:00+00:00' : null, 'gagne_le': '2026-12-01T10:00:00+00:00',
    };

class _Faux extends JeuxService {
  final List<(int, int, int)> pronos = [];
  int grattages = 0;

  @override
  Future<ListeJeux> liste() async => const ListeJeux();

  @override
  Future<MesDefis> defis() async => MesDefis.fromJson({
        'courante': {
          'id': 1, 'titre': 'Défis de décembre', 'mois_libelle': 'décembre 2026', 'points': 35, 'points_max': 70,
          'defis': [
            {'code': 'serie', 'nom': 'Fidèle', 'description': 'Commander 5 jours de service de suite', 'objectif': 5,
             'points': 20, 'valeur': 6, 'cible': 5, 'reussi': true, 'reussi_le': '2026-12-08T09:00:00+00:00', 'serie_courante': 6},
            {'code': 'avis', 'nom': 'Critique culinaire', 'description': 'Donner votre avis sur 5 repas du mois',
             'objectif': 5, 'points': 10, 'valeur': 3, 'cible': 5, 'reussi': false},
            {'code': 'retraits', 'nom': 'Zéro oubli', 'description': 'Retirer tous vos repas du mois', 'objectif': 5,
             'points': 25, 'valeur': 8, 'cible': 9, 'reussi': false, 'commandes': 9, 'retires': 8, 'oublies': 1},
          ],
          'paliers': [
            {'nom': 'Bronze', 'points_min': 20, 'recompense': '500 F sur le compte repas', 'atteint': true},
            {'nom': 'Or', 'points_min': 70, 'recompense': 'T-shirt UbiFood', 'atteint': false},
          ],
        },
        'badges': [
          {'code': 'serie', 'nom': 'Fidèle', 'nombre': 2},
          {'code': 'plats', 'nom': 'Gourmet curieux', 'nombre': 0},
        ],
        'historique': [],
      });

  @override
  Future<List<Competition>> competitions() async => [
        Competition.fromJson({'id': 3, 'titre': 'CAN 2027', 'etat': 'en_cours', 'nb_matchs': 2, 'a_pronostiquer': 1,
                              'ma_place': {'rang': 1, 'points': 3, 'provisoire': true}}),
      ];

  @override
  Future<Competition> competition(int id) async => Competition.fromJson({
        'id': 3, 'titre': 'CAN 2027', 'etat': 'en_cours', 'points_exact': 3, 'points_resultat': 1,
        'ma_place': {'rang': 1, 'points': 3, 'provisoire': true},
        'matchs': [
          {'id': 10, 'equipe_a': "Côte d'Ivoire", 'equipe_b': 'Mali', 'coup_envoi': _hier, 'score_a': 2, 'score_b': 1,
           'ouvert': false, 'mon_pronostic': {'score_a': 2, 'score_b': 1, 'points': 3},
           'tendance': {'a': 50, 'nul': 50, 'b': 0, 'nb': 2}},
          {'id': 11, 'equipe_a': 'Sénégal', 'equipe_b': 'Ghana', 'coup_envoi': _demain, 'ouvert': true, 'mon_pronostic': null},
        ],
      });

  @override
  Future<void> pronostiquer(int matchId, int a, int b) async => pronos.add((matchId, a, b));

  @override
  Future<MesTickets> tickets() async => MesTickets.fromJson({
        'campagnes': [{'titre': 'Tickets de décembre', 'lots': [{'libelle_affiche': 'T-shirt'}]}],
        'a_gratter': [{'id': 7, 'campagne': 'Tickets de décembre', 'source_libelle': 'Repas retiré', 'expire_le': _demain}],
        'grattes': [],
      });

  @override
  Future<TicketJeu> gratter(int id) async {
    grattages++;
    return TicketJeu.fromJson({'id': id, 'campagne': 'Tickets de décembre', 'source_libelle': 'Repas retiré',
                               'gratte_le': _hier, 'gagne': true, 'gain': _gain(statut: 'a_remettre')});
  }

  @override
  Future<List<Gain>> gains() async => [Gain.fromJson(_gain()), Gain.fromJson({..._gain(statut: 'credite'), 'jeu': 'Défis'})];
}

Widget _app(Widget w) => MaterialApp(theme: AppTheme.light(), home: Scaffold(body: w));

void main() {
  setUpAll(() => initializeDateFormatting('fr_FR'));

  test('modèles', () {
    final d = Defi.fromJson({'code': 'retraits', 'objectif': 5, 'commandes': 8, 'retires': 6});
    expect(d.avancement, 0.75);
    expect(Gain.fromJson(_gain()).retire, isTrue);
    expect(etatGain(Gain.fromJson(_gain(statut: 'credite'))), 'Crédité sur le compte repas');
  });

  for (final largeur in [390.0, 320.0]) {
    testWidgets('défis : progression, paliers, badges ($largeur px)', (tester) async {
      tester.view.physicalSize = Size(largeur, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(_app(OngletDefis(service: _Faux())));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('35 / 70 points'), findsOneWidget);
      expect(find.textContaining('Réussi le'), findsOneWidget);
      expect(find.textContaining('1 oublié(s) : défi perdu'), findsOneWidget);
      expect(find.text('Bronze · dès 20 pts'), findsOneWidget);
      expect(find.text('×2'), findsOneWidget);
      expect(find.text('à débloquer'), findsOneWidget);
    });
  }

  testWidgets('pronostics : saisie avant le coup d\'envoi', (tester) async {
    final s = _Faux();
    await tester.pumpWidget(MaterialApp(theme: AppTheme.light(), home: CompetitionScreen(id: 3, titre: 'CAN 2027', service: s)));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('2 – 1'), findsOneWidget);
    expect(find.textContaining('+3 pts'), findsOneWidget);
    expect(find.textContaining('tendances'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('score-a-11')), '1');
    await tester.enterText(find.byKey(const Key('score-b-11')), '0');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    expect(s.pronos, contains((11, 1, 0)));
  });

  testWidgets('ticket : tirage au premier geste, dévoilé une fois gratté', (tester) async {
    final s = _Faux();
    await tester.pumpWidget(_app(OngletTickets(service: s)));
    await tester.pumpAndSettle();
    final zone = tester.getRect(find.byKey(const Key('grattoir')));
    final geste = await tester.startGesture(zone.topLeft + const Offset(5, 5));
    await tester.pump();
    for (var y = 5.0; y < zone.height; y += 14) {
      for (var x = 5.0; x < zone.width; x += 14) {
        await geste.moveTo(zone.topLeft + Offset(x, y));
      }
    }
    await geste.up();
    await tester.pumpAndSettle();
    expect(s.grattages, 1);
    expect(find.byKey(const Key('grattoir')), findsNothing);
    expect(find.text('Gagné !'), findsOneWidget);
    expect(find.text('À retirer auprès de votre gestionnaire'), findsOneWidget);
  });

  testWidgets('mes gains : lot retiré affiché', (tester) async {
    await tester.pumpWidget(_app(OngletGains(service: _Faux())));
    await tester.pumpAndSettle();
    expect(find.textContaining('Lot retiré le'), findsOneWidget);
    expect(find.text('Crédité sur le compte repas'), findsOneWidget);
  });

  testWidgets('rubrique Jeux : ouverture sur l\'onglet demandé', (tester) async {
    await tester.pumpWidget(MaterialApp(theme: AppTheme.light(), home: JeuxScreen(service: _Faux(), ongletInitial: 'gains')));
    await tester.pumpAndSettle();
    expect(find.text('Mes gains'), findsOneWidget);
    expect(find.textContaining('Lot retiré le'), findsOneWidget);
  });

  testWidgets('gestionnaire : lots à remettre, « Lot retiré » confirmé', (tester) async {
    final s = _FauxLots();
    await tester.pumpWidget(MaterialApp(theme: AppTheme.light(), home: LotsARemettreScreen(service: s)));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Smartphone'), findsOneWidget);
    await tester.tap(find.byKey(const Key('remettre-quiz-5')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirmer'));
    await tester.pumpAndSettle();
    expect(s.remis.single.jeuId, 9);
    await tester.tap(find.text('Déjà retirés'));
    await tester.pumpAndSettle();
    expect(find.textContaining('par BROU Clarisse'), findsOneWidget);
  });
}

class _FauxLots extends JeuxService {
  final List<LotARemettre> remis = [];
  @override
  Future<List<LotARemettre>> lotsARemettre(String statut) async => statut == 'remis'
      ? [LotARemettre.fromJson({'genre': 'gain', 'id': 2, 'source': 'Défis', 'jeu': 'Défis de mars', 'lot': 'T-shirt',
                                'employe': 'YAO Marie', 'matricule': '01404', 'lot_remis_le': '2026-12-02T09:00:00+00:00',
                                'lot_remis_par': 'BROU Clarisse'})]
      : [LotARemettre.fromJson({'genre': 'quiz', 'id': 5, 'jeu_id': 9, 'source': 'Quiz', 'jeu': "Quiz d'octobre",
                                'lot': 'Smartphone', 'employe': 'KONÉ Ibrahim', 'matricule': '01401', 'agence': 'Yopougon'})];
  @override
  Future<void> remettreLot(LotARemettre l) async => remis.add(l);
}
