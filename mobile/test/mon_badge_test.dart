// Profil › Mon badge d'accès : numéro masqué, « Déclarer mon badge perdu ».

import 'package:cantine_app/features/profil/mon_badge_screen.dart';
import 'package:cantine_app/shared/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

class _Faux extends BadgeService {
  int declarations = 0;
  MonBadge etat = MonBadge.fromJson({
    'badge': {'id': 1, 'masque': '•••• 5678', 'statut': 'actif', 'associe_le': '2026-11-02T08:00:00Z'},
    'perdu': null,
  });
  @override
  Future<MonBadge> monBadge() async => etat;
  @override
  Future<MonBadge> declarerPerdu() async {
    declarations++;
    return etat = MonBadge.fromJson({
      'badge': null,
      'perdu': {'id': 1, 'masque': '•••• 5678', 'statut': 'perdu', 'fin_le': '2026-11-14T08:00:00Z'},
    });
  }
}

void main() {
  setUpAll(() => initializeDateFormatting('fr_FR'));

  for (final largeur in [390.0, 320.0]) {
    testWidgets('mon badge : actif puis déclaré perdu ($largeur px)', (tester) async {
      tester.view.physicalSize = Size(largeur, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final s = _Faux();
      await tester.pumpWidget(MaterialApp(theme: AppTheme.light(), home: MonBadgeScreen(service: s)));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Badge actif'), findsOneWidget);
      expect(find.textContaining('•••• 5678'), findsOneWidget);
      await tester.tap(find.byKey(const Key('declarer-badge-perdu')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirmer-badge-perdu')));
      await tester.pumpAndSettle();
      expect(s.declarations, 1);
      expect(find.text('Badge déclaré perdu'), findsOneWidget);
      expect(find.byKey(const Key('declarer-badge-perdu')), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
