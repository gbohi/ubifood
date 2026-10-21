import 'package:cantine_app/core/widgets/common_widgets.dart';
import 'package:cantine_app/features/commandes/commandes_screen.dart';
import 'package:cantine_app/features/notifications/notification_screen.dart';
import 'package:cantine_app/shared/models/models.dart';
import 'package:cantine_app/shared/providers/app_provider.dart';
import 'package:cantine_app/shared/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

Map<String, dynamic> _menu(String date, {int id = 40}) => {
      'id': id,
      'date_menu': date,
      'agence_id': 1,
      'agence_nom': 'Siège',
      'typeequipe_id': 1,
      'typeequipe_libelle': 'Journée',
      'menu_plats': [],
      'date_limite_annulation': '${date}T00:00:00Z',
    };

Commande _commande(String statut, String date,
        {int id = 1, Map<String, dynamic>? avis, String? annuleePar}) =>
    Commande.fromJson({
      'id': id,
      'statut': statut,
      'date_commande': '2026-10-17T09:14:00Z',
      'date_annulation': statut == 'annulee' ? '2026-10-18T10:00:00Z' : null,
      'plat_detail': {
        'id': 7,
        'nom': 'Riz sauce graine',
        'description': 'Riz sauce graine',
        'type_plat_libelle': 'Plat principal',
        'images': [],
      },
      'menu_detail': _menu(date),
      'user_nom': 'KONE Fatou',
      'avis': avis,
      'annulee_par_nom': annuleePar,
      'annulee_par_gestionnaire': annuleePar != null,
    });

void main() {
  group('Notifications', () {
    test("l'emoji de tête des titres est retiré", () {
      expect(titreSansEmoji('✅ Commande confirmée'), 'Commande confirmée');
      expect(titreSansEmoji('❌ Commande annulée'), 'Commande annulée');
      expect(titreSansEmoji('🍽️ Nouveau menu disponible'),
          'Nouveau menu disponible');
      expect(titreSansEmoji('↩️ Retrait annulé'), 'Retrait annulé');
      expect(titreSansEmoji('☑ Commande confirmée'), 'Commande confirmée');
      // Pas d'emoji : titre intact (chiffres compris)
      expect(
          titreSansEmoji('48h avant la fermeture'), '48h avant la fermeture');
      expect(titreSansEmoji('Repas retiré'), 'Repas retiré');
    });
  });

  group('Commandes', () {
    final maintenant = DateTime.utc(2026, 10, 21, 10);

    test('état affiché : à venir, à retirer, non retiré, retirée, annulée', () {
      expect(etatCommande(_commande('en_attente', '2026-10-26'), maintenant),
          EtatCommande.aVenir);
      expect(etatCommande(_commande('en_attente', '2026-10-21'), maintenant),
          EtatCommande.aRetirer);
      expect(etatCommande(_commande('en_attente', '2026-10-20'), maintenant),
          EtatCommande.nonRetiree);
      expect(etatCommande(_commande('retiree', '2026-10-19'), maintenant),
          EtatCommande.retiree);
      expect(etatCommande(_commande('annulee', '2026-10-18'), maintenant),
          EtatCommande.annulee);
      expect(_commande('retiree', '2026-10-19').estNonRetiree(maintenant),
          isFalse);
    });

    test('groupes par semaine', () {
      final mer = DateTime(2026, 10, 21);
      expect(lundiDe(mer), DateTime(2026, 10, 19));
      expect(lundiDe(DateTime(2026, 10, 19)), DateTime(2026, 10, 19));
      expect(lundiDe(DateTime(2026, 10, 25)), DateTime(2026, 10, 19));
      expect(libelleSemaine(DateTime(2026, 10, 19), mer), 'Cette semaine');
      expect(libelleSemaine(DateTime(2026, 10, 26), mer), 'Semaine prochaine');
      expect(libelleSemaine(DateTime(2026, 10, 12), mer), 'Semaine dernière');
    });
  });

  group('Plat', () {
    test('description utile et note des agents (facultative)', () {
      final p = Plat.fromJson({
        'id': 1,
        'nom': 'Garba',
        'description': ' garba ',
        'images': [],
      });
      expect(p.descriptionUtile, isNull);
      expect(p.noteMoyenne, isNull);
      expect(p.nbAvis, isNull);
      final q = Plat.fromJson({
        'id': 2,
        'nom': 'Attiéké poisson',
        'description': 'Poisson braisé, attiéké',
        'images': [],
        'note_moyenne': 4.6,
        'nb_avis': 18,
      });
      expect(q.descriptionUtile, 'Poisson braisé, attiéké');
      expect(q.noteMoyenne, 4.6);
      expect(q.nbAvis, 18);
    });

    test('initiales', () {
      expect(initialesDe('KONE Fatou'), 'KF');
      expect(initialesDe('  Admin  '), 'A');
      expect(initialesDe(''), '?');
    });
  });

  group('Écrans : pas de débordement sur 320 px', () {
    setUpAll(() => initializeDateFormatting('fr_FR'));

    for (final sombre in [false, true]) {
      testWidgets(
          'lignes de commandes et fiche ${sombre ? '(sombre)' : '(clair)'}',
          (tester) async {
        tester.view.physicalSize = const Size(320, 1400);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final retiree = _commande('retiree', '2026-10-19',
            id: 3, avis: {'id': 1, 'note': 4, 'commentaire': 'Bon'});
        await tester.pumpWidget(MultiProvider(
          providers: [
            ChangeNotifierProvider(create: (_) => CommandeProvider()),
            ChangeNotifierProvider(create: (_) => FacturationProvider()),
          ],
          child: MaterialApp(
            theme: sombre ? AppTheme.dark() : AppTheme.light(),
            home: Scaffold(
              body: SingleChildScrollView(
                child: Column(children: [
                  const EnTeteMarine(
                      titre: 'Mes commandes',
                      sousTitre: 'Toutes les périodes · 4 commandes',
                      actions: [
                        EnTeteBouton(
                            icone: Icons.calendar_month_outlined,
                            tooltip: 'Période')
                      ]),
                  CarteListe(lignes: [
                    LigneCommande(
                        commande: _commande('en_attente', '2099-10-26')),
                    LigneCommande(
                        commande: _commande('en_attente', '2026-10-20')),
                    LigneCommande(commande: retiree),
                    LigneCommande(
                        commande: _commande('annulee', '2026-10-18',
                            annuleePar: 'YAO Koffi')),
                  ]),
                  SizedBox(
                      height: 700,
                      child: DetailCommandeSheet(
                          commandeId: retiree.id, initiale: retiree)),
                ]),
              ),
            ),
          ),
        ));
        expect(tester.takeException(), isNull);
        expect(find.text('Mes commandes'), findsOneWidget);
        // Pas de flèche retour : écran racine (onglet)
        expect(find.byIcon(Icons.arrow_back_ios_new_rounded), findsNothing);
        expect(find.text('Non retiré'), findsOneWidget);
        expect(
            find.text('Annulée par YAO Koffi (gestionnaire)'), findsOneWidget);
        expect(find.text('Retirée au comptoir'), findsOneWidget);
        expect(find.text('Modifier mon avis'), findsOneWidget);
      });
    }
  });
}
