// Mode de paiement choisi à la commande : modèles, feuille « Comment payer
// ce repas ? » (solde suffisant / insuffisant, changement de mode),
// préférence du profil, détail d'une commande — sans débordement sur 320 px,
// en clair et en sombre.

import 'package:cantine_app/features/commandes/commandes_screen.dart';
import 'package:cantine_app/features/paiements/choix_paiement_sheet.dart';
import 'package:cantine_app/shared/models/compte_repas_models.dart';
import 'package:cantine_app/shared/models/models.dart';
import 'package:cantine_app/shared/providers/app_provider.dart';
import 'package:cantine_app/shared/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

/// Montants affichés : espace insécable entre milliers et avant « F »
String _n(String s) =>
    s.replaceAllMapped(RegExp(r'(\d) (?=\d|F)'), (m) => '${m[1]} ');

InfoPaiement _info({double solde = 1500, bool possible = true}) =>
    InfoPaiement.fromJson({
      'date_menu': '2099-11-10',
      'solde': solde,
      'prix': 1000.0,
      'sans_tarif': false,
      'compte_possible': possible,
      'raison_compte_impossible': possible
          ? null
          : 'Solde insuffisant : ${solde.round()} F disponibles, 1 000 F '
              'nécessaires — rechargez à la caisse',
      'mode_paiement_prefere': 'compte',
      'mode_par_defaut': possible ? 'compte' : 'retenue',
    });

Map<String, dynamic> _commandeJson(
        {String mode = 'compte',
        bool modifiable = true,
        String statut = 'en_attente'}) =>
    {
      'id': 7,
      'statut': statut,
      'date_commande': '2099-11-01T09:00:00Z',
      'plat_detail': {
        'id': 3,
        'nom': 'Riz sauce graine aux crabes de Grand-Bassam',
        'images': []
      },
      'menu_detail': {
        'id': 12,
        'date_menu': '2099-11-10',
        'agence_nom': 'Siège social Plateau',
        'typeequipe_libelle': 'Journée',
        'menu_plats': [],
        'date_limite_commande': '2099-11-08T00:00:00Z',
        'date_limite_annulation': '2099-11-08T00:00:00Z',
      },
      'user_nom': 'KONE Fatou',
      'mode_paiement': mode,
      'mode_paiement_libelle':
          mode == 'compte' ? 'Compte repas' : 'Retenue sur salaire',
      'mode_paiement_modifiable': modifiable,
      'mode_paiement_limite': '2099-11-08T00:00:00Z',
      'paiement': mode == 'compte'
          ? {
              'mode': 'compte',
              'libelle': 'Débité du compte repas',
              'montant': 1000.0
            }
          : null,
    };

/// Bouton qui ouvre la feuille et garde le résultat
class _Ouvreur extends StatelessWidget {
  final Future<Object?> Function(BuildContext) ouvrir;
  final void Function(Object?) resultat;
  const _Ouvreur({required this.ouvrir, required this.resultat});
  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: ElevatedButton(
              onPressed: () async => resultat(await ouvrir(context)),
              child: const Text('ouvrir')),
        ),
      );
}

Future<void> _app(WidgetTester tester, Widget home, {bool sombre = false}) =>
    tester.pumpWidget(MaterialApp(
        theme: sombre ? AppTheme.dark() : AppTheme.light(), home: home));

void main() {
  setUpAll(() => initializeDateFormatting('fr_FR'));

  group('Modèles : mode de paiement', () {
    test('commande : mode, changement possible, règlement', () {
      final c = Commande.fromJson(_commandeJson());
      expect(c.modePaiement, 'compte');
      expect(c.payeParCompte, isTrue);
      expect(c.modePaiementModifiable, isTrue);
      expect(c.modePaiementLimite, DateTime.utc(2099, 11, 8).toLocal());
      expect((c.paiementMode, c.paiementMontant), ('compte', 1000.0));
      expect(libelleModeCommande(c), _n('Compte repas · 1 000 F'));
      final r =
          Commande.fromJson(_commandeJson(mode: 'retenue', modifiable: false));
      expect(r.payeParCompte, isFalse);
      expect(r.paiementMode, isNull);
      expect(libelleModeCommande(r), 'Retenue sur salaire');
      // Serveur antérieur : pas de mode
      final ancien = Commande.fromJson({
        'id': 1,
        'statut': 'en_attente',
        'date_commande': '',
        'user_nom': ''
      });
      expect(ancien.modePaiement, isNull);
      expect(libelleModeCommande(ancien), isNull);
      // copyWithAvis conserve le paiement
      expect(c.copyWithAvis(null).paiementMontant, 1000.0);
    });

    test('information de paiement et préférence du profil', () {
      final ok = _info();
      expect((ok.solde, ok.prix, ok.comptePossible), (1500.0, 1000.0, true));
      expect(ok.modeParDefaut, ModePaiementCommande.compte);
      expect(ok.raisonCompteImpossible, isNull);
      final ko = _info(solde: 500, possible: false);
      expect(ko.modeParDefaut, ModePaiementCommande.retenue);
      expect(ko.raisonCompteImpossible, contains('Solde insuffisant : 500 F'));
      expect(InfoPaiement.fromJson(const {}).comptePossible, isFalse);
      expect(ModePaiementCommande.depuis('compte')!.libelle, 'Compte repas');
      expect(ModePaiementCommande.depuis('caisse'), isNull);
      // Équipe « repas offert »
      final offert = InfoPaiement.fromJson(const {
        'solde': 0,
        'prix': 0,
        'offert': true,
        'mode_par_defaut': 'offert'
      });
      expect((offert.offert, offert.modeParDefaut),
          (true, ModePaiementCommande.offert));
      expect(ModePaiementCommande.depuis('offert')!.libelle, 'Repas offert');
      expect(
          AuthUser.fromJson({'id': 1, 'mode_paiement_prefere': 'retenue'})
              .modePaiementPrefere,
          'retenue');
      expect(AuthUser.fromJson({'id': 1}).modePaiementPrefere, 'compte');
    });
  });

  for (final sombre in [false, true]) {
    final suffixe = sombre ? '(sombre)' : '(clair)';

    group('Feuille « Comment payer ce repas ? » $suffixe', () {
      testWidgets('repas offert : pas de choix de paiement', (tester) async {
        tester.view.physicalSize = const Size(320, 760);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        Object? choix = 'aucun';
        await _app(
            tester,
            _Ouvreur(
                ouvrir: (ctx) => ChoixPaiementSheet.show(ctx,
                    menuId: 12,
                    platNom: 'Tchêp au poulet',
                    jour: DateTime(2099, 11, 10),
                    chargerInfo: () async => InfoPaiement.fromJson(const {
                          'solde': 1500,
                          'prix': 0,
                          'offert': true,
                          'mode_par_defaut': 'offert'
                        })),
                resultat: (r) => choix = r),
            sombre: sombre);
        await tester.tap(find.text('ouvrir'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.byKey(const Key('paiement-offert')), findsOneWidget);
        expect(find.text('Retenue sur salaire'), findsNothing);
        await tester.tap(find.byKey(const Key('confirmer-paiement')));
        await tester.pumpAndSettle();
        expect(choix, ModePaiementCommande.offert);
      });

      testWidgets('solde suffisant : compte coché, réservation par le compte',
          (tester) async {
        tester.view.physicalSize = const Size(320, 760);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        Object? choix = 'aucun';
        await _app(
            tester,
            _Ouvreur(
                ouvrir: (ctx) => ChoixPaiementSheet.show(ctx,
                    menuId: 12,
                    platNom: 'Riz sauce graine aux crabes de Grand-Bassam',
                    jour: DateTime(2099, 11, 10),
                    limite: DateTime(2099, 11, 8),
                    chargerInfo: () async => _info()),
                resultat: (r) => choix = r),
            sombre: sombre);
        await tester.tap(find.text('ouvrir'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('Comment payer ce repas ?'), findsOneWidget);
        expect(find.textContaining(_n('(solde 1 500 F)'), findRichText: true),
            findsOneWidget);
        expect(find.text('Retenue sur salaire'), findsOneWidget);
        expect(find.byIcon(Icons.radio_button_checked_rounded), findsOneWidget);
        expect(find.text('Réserver et payer par le compte'), findsOneWidget);
        await tester.tap(find.byKey(const Key('confirmer-paiement')));
        await tester.pumpAndSettle();
        expect(choix, ModePaiementCommande.compte);
      });

      testWidgets(
          'solde insuffisant : compte désactivé, « Rechargez à la caisse », '
          'retenue par défaut', (tester) async {
        tester.view.physicalSize = const Size(320, 760);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        Object? choix = 'aucun';
        await _app(
            tester,
            _Ouvreur(
                ouvrir: (ctx) => ChoixPaiementSheet.show(ctx,
                    menuId: 12,
                    platNom: 'Garba',
                    chargerInfo: () async =>
                        _info(solde: 500, possible: false)),
                resultat: (r) => choix = r),
            sombre: sombre);
        await tester.tap(find.text('ouvrir'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(
            find.text('Solde insuffisant : 500 F disponibles, 1 000 F '
                'nécessaires — rechargez à la caisse'),
            findsOneWidget);
        expect(find.text('Mes paiements'), findsOneWidget);
        // Toucher « Compte repas » ne le sélectionne pas
        await tester.tap(find.byKey(const Key('option-compte')));
        await tester.pumpAndSettle();
        expect(find.text('Réserver'), findsOneWidget);
        await tester.tap(find.byKey(const Key('confirmer-paiement')));
        await tester.pumpAndSettle();
        expect(choix, ModePaiementCommande.retenue);
      });

      testWidgets('changer le mode : compte → retenue (recrédit annoncé)',
          (tester) async {
        tester.view.physicalSize = const Size(320, 760);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        Object? choix = 'aucun';
        await _app(
            tester,
            _Ouvreur(
                ouvrir: (ctx) => ChoixPaiementSheet.show(ctx,
                    menuId: 12,
                    platNom: 'Garba',
                    modeActuel: ModePaiementCommande.compte,
                    limite: DateTime(2099, 11, 8, 10),
                    // Solde après débit insuffisant : le compte reste choisi
                    chargerInfo: () async => _info(solde: 0, possible: false)),
                resultat: (r) => choix = r),
            sombre: sombre);
        await tester.tap(find.text('ouvrir'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('Changer le mode de paiement'), findsOneWidget);
        expect(find.text('Repas déjà débité de votre compte.'), findsOneWidget);
        expect(find.text('Le montant débité est recrédité sur votre compte.'),
            findsOneWidget);
        expect(find.textContaining("jusqu'au 08/11 à 10:00"), findsOneWidget);
        // Même mode : bouton inactif
        final bouton = tester.widget<ElevatedButton>(
            find.byKey(const Key('confirmer-paiement')));
        expect(bouton.onPressed, isNull);
        await tester.tap(find.byKey(const Key('option-retenue')));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Changer'));
        await tester.pumpAndSettle();
        expect(choix, ModePaiementCommande.retenue);
      });

      testWidgets('changer le mode : retenue → compte', (tester) async {
        tester.view.physicalSize = const Size(320, 760);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        Object? choix = 'aucun';
        await _app(
            tester,
            _Ouvreur(
                ouvrir: (ctx) => ChoixPaiementSheet.show(ctx,
                    menuId: 12,
                    platNom: 'Garba',
                    modeActuel: ModePaiementCommande.retenue,
                    chargerInfo: () async => _info()),
                resultat: (r) => choix = r),
            sombre: sombre);
        await tester.tap(find.text('ouvrir'));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('option-compte')));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Changer'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(choix, ModePaiementCommande.compte);
      });

      testWidgets('erreur de chargement puis nouvel essai', (tester) async {
        tester.view.physicalSize = const Size(320, 760);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        var essais = 0;
        await _app(
            tester,
            _Ouvreur(
                ouvrir: (ctx) => ChoixPaiementSheet.show(ctx,
                        menuId: 12, platNom: 'Garba', chargerInfo: () async {
                      essais++;
                      if (essais == 1) throw Exception('réseau');
                      return _info();
                    }),
                resultat: (_) {}),
            sombre: sombre);
        await tester.tap(find.text('ouvrir'));
        await tester.pumpAndSettle();
        expect(
            find.text("Votre solde n'a pas pu être chargé."), findsOneWidget);
        await tester.tap(find.text('Réessayer'));
        await tester.pumpAndSettle();
        expect(find.text('Réserver et payer par le compte'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });

      testWidgets('préférence du profil', (tester) async {
        tester.view.physicalSize = const Size(320, 640);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        Object? choix = 'aucun';
        await _app(
            tester,
            _Ouvreur(
                ouvrir: (ctx) => PreferencePaiementSheet.show(
                    ctx, ModePaiementCommande.compte),
                resultat: (r) => choix = r),
            sombre: sombre);
        await tester.tap(find.text('ouvrir'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('Paiement de mes repas'), findsOneWidget);
        await tester.tap(find.byKey(const Key('option-retenue')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('enregistrer-preference')));
        await tester.pumpAndSettle();
        expect(choix, ModePaiementCommande.retenue);
      });

      testWidgets('Mes commandes : mode et « Changer le mode de paiement »',
          (tester) async {
        tester.view.physicalSize = const Size(320, 1400);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final compte = Commande.fromJson(_commandeJson());
        final retenue = Commande.fromJson(
            {..._commandeJson(mode: 'retenue', modifiable: false), 'id': 8});
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
                  LigneCommande(commande: compte),
                  LigneCommande(commande: retenue),
                  SizedBox(
                      height: 700,
                      child: DetailCommandeSheet(
                          commandeId: compte.id, initiale: compte)),
                ]),
              ),
            ),
          ),
        ));
        expect(tester.takeException(), isNull);
        expect(find.byKey(const Key('mode-detail-commande')), findsOneWidget);
        expect(find.text(_n('Compte repas · 1 000 F')), findsOneWidget);
        expect(find.byKey(const Key('changer-mode-detail')), findsOneWidget);
        expect(find.textContaining('Retenue sur salaire'), findsOneWidget);
      });
    });
  }
}
