// Rôle « Employé » obligatoire pour commander : modèle et écran explicatif.

import 'package:cantine_app/features/main_shell.dart' show SansRoleEmploye;
import 'package:cantine_app/shared/models/models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('peutCommander selon le rôle', () {
    AuthUser u(List<String> roles) => AuthUser.fromJson({'id': 1, 'username': 'x', 'roles': roles});
    expect(u(['employe']).peutCommander, isTrue);
    expect(u(['admin', 'employe']).peutCommander, isTrue);
    expect(u(['admin']).peutCommander, isFalse);
    expect(u(['caissier']).peutCommander, isFalse);
  });

  testWidgets('écran pour un compte sans rôle employé', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: SansRoleEmploye()));
    expect(find.byKey(const Key('sans-role-employe')), findsOneWidget);
    expect(find.textContaining('rôle « Employé »'), findsOneWidget);
  });
}
