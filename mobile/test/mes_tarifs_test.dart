// Profil → « Mes tarifs » : modèle, affichage par type, offerts, 320 px.

import 'package:cantine_app/features/tarifs/mes_tarifs_screen.dart';
import 'package:cantine_app/shared/models/compte_repas_models.dart';
import 'package:cantine_app/shared/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

MesTarifs _tarifs() => MesTarifs.fromJson({
      'categorie': 'Agent',
      'tarifs': [
        {'type_plat': 'Complet', 'montant': 1500, 'propre': true},
        {'type_plat': 'Standard', 'montant': 1000, 'propre': false},
        {'type_plat': null, 'montant': 1000, 'propre': true},
      ],
      'a_venir': [
        {'type_plat': 'Complet', 'montant': 1600, 'date_debut': '2099-12-01'}
      ],
      'equipes_offertes': ['Nuit'],
    });

void main() {
  test('modèle', () {
    final t = _tarifs();
    expect(t.categorie, 'Agent');
    expect(t.parType.map((x) => (x.typePlat, x.montant)),
        [('Complet', 1500.0), ('Standard', 1000.0)]);
    expect(t.aVenir.single.dateDebut, DateTime(2099, 12, 1));
    expect(MesTarifs.fromJson(const {}).tarifs, isEmpty);
  });

  for (final largeur in [390.0, 320.0]) {
    testWidgets('écran ($largeur px)', (tester) async {
      tester.view.physicalSize = Size(largeur, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MaterialApp(
          theme: AppTheme.light(),
          home: MesTarifsScreen(charger: () async => _tarifs())));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Mes tarifs'), findsOneWidget);
      expect(find.text('Catégorie : Agent'), findsOneWidget);
      expect(find.byKey(const Key('tarif-Complet')), findsOneWidget);
      expect(find.byKey(const Key('tarif-Standard')), findsOneWidget);
      expect(find.textContaining('01/12/2099'), findsOneWidget);
      expect(find.byKey(const Key('mes-tarifs-offerts')), findsOneWidget);
    });
  }

  testWidgets('sans tarif', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: MesTarifsScreen(
            charger: () async => MesTarifs.fromJson(const {}))));
    await tester.pumpAndSettle();
    expect(find.textContaining('Aucun tarif défini'), findsOneWidget);
  });
}
