import 'package:cantine_app/core/config.dart';
import 'package:cantine_app/core/widgets/tic_echeance.dart';
import 'package:cantine_app/shared/models/models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Commande annulée par un gestionnaire', () {
    Map<String, dynamic> json(Map<String, dynamic> extra) => {
          'id': 12,
          'statut': 'annulee',
          'date_commande': '2026-10-19T08:00:00Z',
          'user_nom': 'KOUASSI Awa',
          ...extra,
        };

    test('lit annulee_par_nom et annulee_par_gestionnaire', () {
      final c = Commande.fromJson(json({
        'annulee_par_nom': 'GEST1 Test',
        'annulee_par_gestionnaire': true,
      }));
      expect(c.annuleeParNom, 'GEST1 Test');
      expect(c.annuleeParGestionnaire, isTrue);
      expect(c.libelleAnnulationGestionnaire,
          'Annulée par GEST1 Test (gestionnaire)');
      // Conservé quand l'avis est mis à jour
      expect(c.copyWithAvis(null).annuleeParGestionnaire, isTrue);
    });

    test('annulée par l\'agent lui-même ou ancien serveur : pas de mention', () {
      final parAgent = Commande.fromJson(json({
        'annulee_par_nom': 'KOUASSI Awa',
        'annulee_par_gestionnaire': false,
      }));
      expect(parAgent.libelleAnnulationGestionnaire, isNull);

      final ancien = Commande.fromJson(json({}));
      expect(ancien.annuleeParNom, isNull);
      expect(ancien.annuleeParGestionnaire, isFalse);
      expect(ancien.libelleAnnulationGestionnaire, isNull);
    });

    test('nom inconnu ou commande non annulée', () {
      expect(
          Commande.fromJson(json({
            'annulee_par_nom': null,
            'annulee_par_gestionnaire': true,
          })).libelleAnnulationGestionnaire,
          'Annulée par un gestionnaire');
      expect(
          Commande.fromJson(json({
            'statut': 'en_attente',
            'annulee_par_gestionnaire': true,
          })).libelleAnnulationGestionnaire,
          isNull);
    });
  });

  group('PopupConnexion', () {
    test('{} : aucune image active', () {
      expect(PopupConnexion.fromJsonOuNull(<String, dynamic>{}), isNull);
      expect(PopupConnexion.fromJsonOuNull(null), isNull);
      expect(PopupConnexion.fromJsonOuNull(''), isNull);
    });

    test('URL relative rendue absolue (version conservée)', () {
      final p = PopupConnexion.fromJsonOuNull({
        'id': 3,
        'titre': 'Semaine du goût',
        'image_url': '/media/popups/x.png?v=123',
        'actif': true,
        'updated_at': '2026-10-19T08:00:00Z',
      });
      expect(p, isNotNull);
      expect(p!.id, 3);
      expect(p.titre, 'Semaine du goût');
      expect(p.imageUrl, '${AppConfig.serverUrl}/media/popups/x.png?v=123');
    });

    test('sans image ou inactive : rien à afficher', () {
      expect(
          PopupConnexion.fromJsonOuNull(
              {'id': 3, 'titre': 'x', 'image_url': null, 'actif': true}),
          isNull);
      expect(
          PopupConnexion.fromJsonOuNull({
            'id': 3,
            'titre': 'x',
            'image_url': '/media/popups/x.png',
            'actif': false
          }),
          isNull);
    });
  });

  group('prochainTicEcheance', () {
    final now = DateTime.utc(2026, 10, 20, 9, 0, 0);
    const marge = Duration(milliseconds: 50);

    test('aucune échéance à venir : pas de minuteur', () {
      expect(prochainTicEcheance([], now), isNull);
      expect(prochainTicEcheance([null], now), isNull);
      expect(
          prochainTicEcheance(
              [now.subtract(const Duration(minutes: 1)), now], now),
          isNull);
    });

    test('se cale sur le prochain changement de minute', () {
      // 2 h 10 min 25 s restantes : prochain changement dans 25 s
      expect(
          prochainTicEcheance(
              [now.add(const Duration(hours: 2, minutes: 10, seconds: 25))],
              now),
          const Duration(seconds: 25) + marge);
      // Pile sur une minute : une minute entière
      expect(prochainTicEcheance([now.add(const Duration(hours: 3))], now),
          const Duration(minutes: 1) + marge);
    });

    test('moins d\'une minute : tic juste après l\'échéance', () {
      expect(
          prochainTicEcheance([now.add(const Duration(seconds: 7))], now),
          const Duration(seconds: 7) + marge);
    });

    test('la plus proche des échéances futures l\'emporte', () {
      expect(
          prochainTicEcheance([
            now.subtract(const Duration(hours: 1)), // passée : ignorée
            now.add(const Duration(days: 2, seconds: 40)),
            now.add(const Duration(minutes: 5, seconds: 12)),
            null,
          ], now),
          const Duration(seconds: 12) + marge);
    });
  });

  group('TicEcheance', () {
    testWidgets('reconstruit à l\'échéance puis s\'arrête', (tester) async {
      var builds = 0;
      // Échéance réelle très proche (DateTime.now n'est pas simulé)
      final echeance = DateTime.now().add(const Duration(milliseconds: 300));
      await tester.pumpWidget(Directionality(
        textDirection: TextDirection.ltr,
        child: TicEcheance(
          echeances: [echeance],
          builder: (_) {
            builds++;
            return Text(DateTime.now().isAfter(echeance) ? 'fermé' : 'ouvert');
          },
        ),
      ));
      expect(find.text('ouvert'), findsOneWidget);
      // Laisser passer le temps réel, puis faire avancer le minuteur simulé
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 400)));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('fermé'), findsOneWidget);
      final apres = builds;
      // Plus d'échéance à venir : plus aucun minuteur en attente
      await tester.pump(const Duration(minutes: 5));
      expect(builds, apres);
    });

    testWidgets('pas de minuteur quand l\'onglet est masqué', (tester) async {
      var builds = 0;
      await tester.pumpWidget(Directionality(
        textDirection: TextDirection.ltr,
        child: TickerMode(
          enabled: false,
          child: TicEcheance(
            echeances: [DateTime.now().add(const Duration(seconds: 2))],
            builder: (_) {
              builds++;
              return const SizedBox();
            },
          ),
        ),
      ));
      await tester.pump(const Duration(minutes: 2));
      expect(builds, 1);
    });
  });
}
