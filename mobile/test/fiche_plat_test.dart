import 'package:cantine_app/features/menu/menu_screen.dart';
import 'package:cantine_app/shared/models/models.dart';
import 'package:cantine_app/shared/providers/app_provider.dart';
import 'package:cantine_app/shared/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

/// Commandes de l'agent fournies sans serveur
class _Commandes extends CommandeProvider {
  final List<Commande> liste;
  _Commandes(this.liste);
  @override
  List<Commande> get mesCommandes => liste;
}

Map<String, dynamic> _plat(int id, String nom) => {
      'id': id,
      'nom': nom,
      'description': 'Attiéké et thon frit, oignons et piment frais, '
          'huile de friture.',
      'type_plat_libelle': 'Plat principal',
      'images': [],
      'note_moyenne': 4.2,
      'nb_avis': 9,
    };

Menu _menu({required bool ouvert}) {
  final now = DateTime.now().toUtc();
  final limite = ouvert
      ? now.add(const Duration(days: 2, hours: 15))
      : now.subtract(const Duration(hours: 2));
  return Menu.fromJson({
    'id': 40,
    'date_menu': '2026-10-26',
    'agence_id': 1,
    'agence_nom': 'Siège social Plateau',
    'typeequipe_id': 1,
    'typeequipe_libelle': 'Journée',
    'menu_plats': [
      {'id': 1, 'plat': _plat(7, 'Garba')},
      {'id': 2, 'plat': _plat(8, 'Attiéké poisson')},
    ],
    'date_limite_commande': limite.toIso8601String(),
    'date_limite_annulation':
        limite.add(const Duration(days: 1)).toIso8601String(),
  });
}

Commande _commande(Menu menu, int platId, String statut) => Commande(
      id: 1,
      statut: StatutCommandeExt.fromString(statut),
      dateCommande: '2026-10-20T09:00:00Z',
      platDetail:
          menu.menuPlats.firstWhere((mp) => mp.plat.id == platId).plat,
      menuDetail: menu,
      userNom: 'KONE Fatou',
    );

ResumeAvisPlat _resume(int n) => ResumeAvisPlat(
      noteMoyenne: n == 0 ? null : 4.2,
      nbAvis: n == 0 ? 0 : 12,
      derniers: [
        for (var i = 0; i < n; i++)
          AvisRecent(
              note: 4,
              commentaire: 'Thon bien croustillant, attiéké frais, '
                  'un peu trop de piment pour moi.',
              auteur: 'Jean-Baptiste Kouassi-Yao K.',
              date: '2026-10-1$i'),
      ],
    );

void main() {
  setUpAll(() => initializeDateFormatting('fr_FR'));

  final cas = <String, (bool, int?, String?, int)>{
    // ouvert, plat commandé, statut, nombre de commentaires
    'jour ouvert': (true, null, null, 3),
    'plat réservé': (true, 7, 'en_attente', 1),
    'autre plat commandé, jour fermé': (false, 8, 'en_attente', 0),
    'repas retiré': (false, 7, 'retiree', 0),
  };

  group('Fiche d\'un plat : pas de débordement sur 320 px', () {
    for (final sombre in [false, true]) {
      for (final e in cas.entries) {
        testWidgets('${e.key} ${sombre ? '(sombre)' : '(clair)'}',
            (tester) async {
          tester.view.physicalSize = const Size(320, 640);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.reset);
          final (ouvert, platCommande, statut, nbCommentaires) = e.value;
          final menu = _menu(ouvert: ouvert);
          final plat = menu.menuPlats.first.plat;
          await tester.pumpWidget(MultiProvider(
            providers: [
              ChangeNotifierProvider<CommandeProvider>(
                  create: (_) => _Commandes([
                        if (platCommande != null)
                          _commande(menu, platCommande, statut!),
                      ])),
              ChangeNotifierProvider(create: (_) => FacturationProvider()),
            ],
            child: MaterialApp(
              theme: sombre ? AppTheme.dark() : AppTheme.light(),
              home: ficheDetailPlat(
                menu: menu,
                plat: plat,
                chargerAvis: (_) async => _resume(nbCommentaires),
              ),
            ),
          ));
          await tester.pump();
          expect(tester.takeException(), isNull);
          expect(find.text('Garba'), findsOneWidget);
          switch (e.key) {
            case 'jour ouvert':
              expect(find.text('Réserver ce plat'), findsOneWidget);
              expect(find.text('Voir les 3'), findsOneWidget);
              expect(find.textContaining('Commandes ouvertes'), findsOneWidget);
            case 'plat réservé':
              expect(find.text('Plat réservé'), findsOneWidget);
              expect(find.text('Annuler ma réservation'), findsOneWidget);
              expect(find.textContaining('Voir les'), findsNothing);
            case 'autre plat commandé, jour fermé':
              expect(find.text('Commandes fermées pour ce jour'),
                  findsOneWidget);
              expect(find.textContaining('Votre repas ce jour'),
                  findsOneWidget);
              expect(find.text('Avis des collègues'.toUpperCase()),
                  findsNothing);
            case 'repas retiré':
              expect(find.text('Repas retiré'), findsOneWidget);
              expect(find.text('Noter ce repas'), findsOneWidget);
          }
        });
      }
    }
  });
}
