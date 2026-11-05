// Contestation d'un retrait : cause de la décision (erreur au comptoir /
// badge utilisé par un tiers), données des notifications, routage des
// notifications « Retrait validé » (message data seulement + bouton),
// photo du plat sur l'écran du retrait.

import 'package:cached_network_image/cached_network_image.dart';
import 'package:cantine_app/core/config.dart';
import 'package:cantine_app/core/services/notification_routage.dart';
import 'package:cantine_app/core/widgets/common_widgets.dart';
import 'package:cantine_app/features/contestation/retrait_detail_screen.dart';
import 'package:cantine_app/features/notifications/notification_screen.dart';
import 'package:cantine_app/shared/models/models.dart';
import 'package:cantine_app/shared/models/prestataire_models.dart';
import 'package:cantine_app/shared/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

Map<String, dynamic> _contestation(String statut, {String? cause}) => {
      'id': 12,
      'statut': statut,
      'statut_libelle': statut == 'acceptee' ? 'Acceptée' : 'Rejetée',
      'cause': cause,
      'cause_libelle': null,
      'explication': null,
      'motif': 'badge_utilise',
      'motif_libelle': "Quelqu'un a utilisé mon badge / matricule",
      'commentaire': '',
      'commentaire_traitement': '',
      'created_at': '2026-11-17T12:05:00Z',
      'date_traitement': '2026-11-18T09:00:00Z',
    };

Map<String, dynamic> _detail(
        {String statut = 'retiree',
        Map<String, dynamic>? contestation,
        String? image,
        bool annuleeParContestation = false}) =>
    {
      'commande_id': 4188,
      'statut': statut,
      'date_menu': '2026-11-17',
      'plat': 'Garba',
      'plat_image_url': image,
      'agence': 'Yopougon',
      'annulee_par_contestation': annuleeParContestation,
      'retrait': statut == 'retiree'
          ? {
              'id': 12009,
              'date_retrait': '2026-11-17T11:58:00Z',
              'heure': '11:58',
              'comptoir': 'Yopougon',
              'valide_par_nom': 'KONAN Serge',
              'valide_par_prestataire': 'Traiteur A',
              'mode': 'scan',
              'mode_libelle': 'Badge scanné'
            }
          : null,
      'contestation': contestation,
      'contestable': false,
      'raison_non_contestable': null,
      'contestable_jusqu_au': '2026-11-30',
      'motifs': const [],
    };

Widget _app(Widget corps, {bool sombre = false}) => MaterialApp(
      theme: sombre ? AppTheme.dark() : AppTheme.light(),
      home: Scaffold(body: corps),
    );

void main() {
  setUpAll(() => initializeDateFormatting('fr_FR'));

  group('Routage des notifications', () {
    final retraitValide = {
      'type': 'retrait_valide',
      'commande_id': '4188',
      'menu_id': '9',
      'retrait_id': '12009',
      'contestation_id': '',
      'notif_id': '55',
      'titre': '🍽️ Retrait validé · Garba',
      'message': 'Votre repas du 17/11/2026 a été remis à 11:58…',
    };

    test('« Retrait validé » data seulement : affiché par l\'application', () {
      expect(
          aAfficherParLApplication(retraitValide, aUnBlocNotification: false),
          isTrue);
      // Bloc notification présent (iOS, ancien serveur) : affiché par le système
      expect(aAfficherParLApplication(retraitValide, aUnBlocNotification: true),
          isFalse);
      // Autres types : jamais affichés par le gestionnaire d'arrière-plan
      expect(
          aAfficherParLApplication(
              {'type': 'menu_disponible', 'titre': 'x', 'message': 'y'},
              aUnBlocNotification: false),
          isFalse);
      final contenu = contenuNotification(retraitValide)!;
      expect(contenu.titre, '🍽️ Retrait validé · Garba');
      expect(contenu.message, startsWith('Votre repas'));
      // Le bloc notification prime sur les données
      expect(contenuNotification(retraitValide, titre: 'T', message: 'M'),
          (titre: 'T', message: 'M'));
      expect(contenuNotification({'type': 'retrait_valide'}), isNull);
    });

    test('bouton « Je n\'ai pas retiré ce repas » et écran ouvert', () {
      expect(proposerActionContester(retraitValide), isTrue);
      expect(proposerActionContester({...retraitValide, 'commande_id': ''}),
          isFalse);
      expect(
          proposerActionContester(
              {'type': 'contestation_decidee', 'commande_id': '4188'}),
          isFalse);
      // Appui sur la notification : détail du retrait
      expect(commandeRetraitAOuvrir(retraitValide), 4188);
      expect(ouvrirFormulaireContestation(retraitValide), isFalse);
      // Appui sur le bouton (payload JSON + identifiant d'action) : formulaire
      final bouton = {...retraitValide, 'action': actionContester};
      expect(commandeRetraitAOuvrir(bouton), 4188);
      expect(ouvrirFormulaireContestation(bouton), isTrue);
      expect(categorieRetraitValide, 'RETRAIT_VALIDE');
    });

    test('décision : données du serveur, sinon d\'après le titre', () {
      expect(
          decisionContestation(
              {'statut': 'acceptee', 'cause': 'badge_tiers'}, '✅ Contestation'),
          (statut: 'acceptee', cause: 'badge_tiers'));
      expect(decisionContestation({'statut': 'rejetee', 'cause': ''}, ''),
          (statut: 'rejetee', cause: null));
      // Anciennes notifications : titre seul
      expect(decisionContestation({}, '✅ Contestation acceptée'),
          (statut: 'acceptee', cause: null));
      expect(
          decisionContestation(
              {}, '✅ Contestation acceptée — repas non facturé'),
          (statut: 'acceptee', cause: 'erreur_comptoir'));
      expect(decisionContestation({}, '✅ Contestation acceptée — repas dû'),
          (statut: 'acceptee', cause: 'badge_tiers'));
      expect(decisionContestation({}, '❌ Contestation rejetée'),
          (statut: 'rejetee', cause: null));
      expect(decisionContestation({}, 'Autre'), (statut: null, cause: null));
      expect(libelleDecisionContestation('acceptee', 'erreur_comptoir'),
          'Acceptée — repas non facturé');
      expect(libelleDecisionContestation('acceptee', 'badge_tiers'),
          'Acceptée — badge utilisé par un tiers, repas dû');
    });

    test('notification de décision : données lues, icône selon la cause', () {
      final n = NotificationItem.fromJson({
        'id': 56,
        'type': 'contestation_decidee',
        'titre': '✅ Contestation acceptée — repas dû',
        'message': '…',
        'lu': false,
        'created_at': '2026-11-18T09:00:00Z',
        'commande_id': 4188,
        'contestation_id': 12,
        'donnees': {'statut': 'acceptee', 'cause': 'badge_tiers'},
      });
      expect(n.decision, (statut: 'acceptee', cause: 'badge_tiers'));
      expect(n.ouvreRetrait, isTrue);
      expect(configTypeNotification(n.type, n.titre, n.donnees).$2,
          TonPastille.or);
      expect(
          configTypeNotification('contestation_decidee', 'Décision',
              {'statut': 'acceptee', 'cause': 'erreur_comptoir'}).$2,
          TonPastille.vert);
      // Ancienne notification sans données
      final ancienne = NotificationItem.fromJson({
        'id': 1,
        'type': 'contestation_decidee',
        'titre': '❌ Contestation rejetée',
        'message': '',
        'lu': true,
        'created_at': '2026-11-18T09:00:00Z',
      });
      expect(ancienne.donnees, isEmpty);
      expect(ancienne.decision.statut, 'rejetee');
    });
  });

  group('Cause de la décision', () {
    test('contestation : libellé et conséquence', () {
      final erreur = ContestationRetrait.fromJson(
          _contestation('acceptee', cause: 'erreur_comptoir'));
      expect(erreur.libelleDecision, 'Acceptée — repas non facturé');
      expect(erreur.repasDu, isFalse);
      expect(erreur.texteDecision, contains('ne vous sera pas facturé'));
      final tiers = ContestationRetrait.fromJson(
          _contestation('acceptee', cause: 'badge_tiers'));
      expect(tiers.libelleDecision,
          'Acceptée — badge utilisé par un tiers, repas dû');
      expect(tiers.repasDu, isTrue);
      expect(tiers.texteDecision, contains('reste dû'));
      // Explication envoyée par le serveur : prioritaire
      final serveur = ContestationRetrait.fromJson({
        ..._contestation('acceptee', cause: 'badge_tiers'),
        'explication': 'Texte du serveur',
      });
      expect(serveur.texteDecision, 'Texte du serveur');
      final rejet = ContestationRetrait.fromJson(_contestation('rejetee'));
      expect((rejet.libelleDecision, rejet.repasDu), ('Rejetée', true));
    });

    test('commande annulée par contestation', () {
      final c = Commande.fromJson({
        'id': 4188,
        'statut': 'annulee',
        'date_commande': '2026-11-15T10:00:00Z',
        'user_nom': 'KOUASSI Awa',
        'annulee_par_nom': 'GEST Test',
        'annulee_par_gestionnaire': true,
        'motif_annulation': 'contestation',
      });
      expect(c.annuleeParContestation, isTrue);
      expect(c.libelleAnnulationGestionnaire,
          'Annulée — contestation acceptée, repas non facturé');
      final ordinaire = Commande.fromJson({
        'id': 1,
        'statut': 'annulee',
        'date_commande': '2026-11-15T10:00:00Z',
        'user_nom': 'x',
        'annulee_par_nom': 'GEST Test',
        'annulee_par_gestionnaire': true,
      });
      expect(ordinaire.libelleAnnulationGestionnaire,
          'Annulée par GEST Test (gestionnaire)');
    });

    test('photo du plat : URL absolue conservée, relative complétée', () {
      expect(
          DetailRetraitCommande.fromJson(
                  _detail(image: 'https://cantine.example/media/garba.png'))
              .platImageUrl,
          'https://cantine.example/media/garba.png');
      expect(
          DetailRetraitCommande.fromJson(_detail(image: '/media/garba.png'))
              .platImageUrl,
          '${AppConfig.serverUrl}/media/garba.png');
      expect(DetailRetraitCommande.fromJson(_detail()).platImageUrl, isNull);
    });
  });

  group('Écran du retrait', () {
    for (final sombre in [false, true]) {
      final t = sombre ? '(sombre)' : '(clair)';

      testWidgets('acceptée — erreur au comptoir $t', (tester) async {
        await tester.pumpWidget(_app(
            DetailRetraitCorps(
                detail: DetailRetraitCommande.fromJson(_detail(
                    statut: 'annulee',
                    annuleeParContestation: true,
                    contestation:
                        _contestation('acceptee', cause: 'erreur_comptoir')))),
            sombre: sombre));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('Acceptée — repas non facturé'), findsOneWidget);
        expect(find.text('Repas annulé · non facturé'), findsOneWidget);
        expect(find.textContaining('ne vous sera pas facturé'), findsOneWidget);
        // Sans photo : icône de substitution
        expect(find.byKey(const Key('photo-plat-substitut')), findsOneWidget);
      });

      testWidgets('acceptée — badge utilisé par un tiers $t', (tester) async {
        await tester.pumpWidget(_app(
            DetailRetraitCorps(
                detail: DetailRetraitCommande.fromJson(_detail(
                    contestation:
                        _contestation('acceptee', cause: 'badge_tiers')))),
            sombre: sombre));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('Acceptée — badge utilisé par un tiers, repas dû'),
            findsOneWidget);
        expect(find.textContaining('reste dû'), findsOneWidget);
        // Repas servi : le retrait reste affiché
        expect(find.text('Retrait validé'), findsOneWidget);
        expect(find.text('KONAN Serge (Traiteur A)'), findsOneWidget);
      });
    }

    testWidgets('photo du plat (CachedNetworkImage)', (tester) async {
      await tester.pumpWidget(_app(DetailRetraitCorps(
          detail: DetailRetraitCommande.fromJson(
              _detail(image: 'https://cantine.example/media/garba.png')))));
      await tester.pump();
      final image =
          tester.widget<CachedNetworkImage>(find.byType(CachedNetworkImage));
      expect(image.imageUrl, 'https://cantine.example/media/garba.png');
      // Pendant le chargement (ou en cas d'erreur) : icône de substitution
      expect(find.byKey(const Key('photo-plat-substitut')), findsOneWidget);
      expect(find.byType(VignettePlat), findsNothing);
      await tester.pumpWidget(const SizedBox());
    });
  });
}
