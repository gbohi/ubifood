import 'dart:typed_data';

import 'package:cantine_app/core/services/cantine_service.dart';
import 'package:cantine_app/core/services/compte_repas_service.dart';
import 'package:cantine_app/core/services/notification_routage.dart';
import 'package:cantine_app/core/widgets/common_widgets.dart';
import 'package:cantine_app/features/dashboard/accueil_widgets.dart'
    show formatFcfa;
import 'package:cantine_app/features/facturation/facturation_screen.dart';
import 'package:cantine_app/features/notifications/notification_screen.dart';
import 'package:cantine_app/features/paiements/mes_paiements_screen.dart';
import 'package:cantine_app/shared/models/compte_repas_models.dart';
import 'package:cantine_app/shared/models/models.dart';
import 'package:cantine_app/shared/providers/app_provider.dart';
import 'package:cantine_app/shared/providers/compte_repas_provider.dart';
import 'package:cantine_app/shared/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

// Réponses de l'API (contrat étape 2, §4 et §8)

Map<String, dynamic> _total(int nb, double montant, [String libelle = '']) =>
    {'nb': nb, 'montant': montant, 'libelle': libelle};

Map<String, dynamic> _repas(int id, String date, String statut,
        {String statutCommande = 'retiree',
        double? montant = 1000.0,
        String plat = 'Alloco poulet'}) =>
    {
      'commande_id': id,
      'date_menu': date,
      'plat': plat,
      'agence_menu': 'Siège',
      'statut_commande': statutCommande,
      'montant': montant,
      'sans_tarif': montant == null,
      'statut': statut,
      'statut_libelle': {
        'debite_compte': 'Payé par le compte repas',
        'paye_caisse': 'Payé à la caisse',
        'retenue': 'Retenu sur salaire',
        'retenue_prevue': 'Retenue sur salaire — à la clôture du mois',
      }[statut],
      'mode_paiement': statut == 'debite_compte' ? 'compte' : 'retenue',
      'mode_paiement_libelle':
          statut == 'debite_compte' ? 'Compte repas' : 'Retenue sur salaire',
      'mode_modifiable': statutCommande == 'en_attente',
    };

Map<String, dynamic> _mouvement(
        int id, String type, double montant, double solde, String date,
        {String libelle = '', int? recuId, String? numero}) =>
    {
      'id': id,
      'type': type,
      'type_libelle': '',
      'montant': montant,
      'solde_apres': solde,
      'libelle': libelle,
      'commande_id': null,
      'recu_id': recuId,
      'recu_numero': numero,
      'date': date,
    };

Map<String, dynamic> _recu(int id, String type,
        {String statut = 'valide', double montant = 5000.0}) =>
    {
      'id': id,
      'numero': 'REÇ-2026-00000$id',
      'type': type,
      'type_libelle': {
        'recharge': 'Recharge du compte',
        'regularisation': 'Régularisation du mois',
        'remboursement': 'Remboursement du solde',
      }[type],
      'statut': statut,
      'statut_libelle': statut == 'annule' ? 'Annulé' : 'Valide',
      'date': '2026-11-06T09:12:46+00:00',
      'employe': {'id': 4, 'nom': 'KONAN', 'prenoms': 'Yao'},
      'caissier_id': 11,
      'caissier_nom': 'KOUASSI Awa',
      'mode': 'especes',
      'mode_libelle': 'Espèces',
      'reference': '',
      'montant': montant,
      'montant_repas': type == 'regularisation' ? montant : 0.0,
      'montant_recu': type == 'remboursement' ? null : 5000.0,
      'monnaie': type == 'regularisation' ? 4000.0 : 0.0,
      'monnaie_creditee': type == 'regularisation',
      'encaissement': 5000.0,
      'solde_avant': 0.0,
      'solde_apres': type == 'regularisation' ? 4000.0 : montant,
      'motif': '',
      'cloture_caisse_id': null,
      'verrouille': false,
      'annule_par_nom': statut == 'annule' ? 'TRAORE Ali' : null,
      'annule_le': statut == 'annule' ? '2026-11-06T10:00:00+00:00' : null,
      'motif_annulation': statut == 'annule' ? 'Doublon de saisie' : '',
      if (type == 'regularisation')
        'lignes': [
          {
            'commande_id': 1,
            'date_menu': '2026-10-02',
            'plat': 'Alloco poulet',
            'montant': 1000.0
          }
        ],
    };

Map<String, dynamic> _compte(
    {double solde = 4000,
    double reste = 0,
    bool cloture = false,
    List<Map<String, dynamic>>? repas}) {
  final r = repas ??
      [
        _repas(1, '2026-11-03', 'debite_compte'),
        _repas(2, '2026-11-04', 'paye_caisse',
            plat: 'Riz sauce graine aux crabes de Grand-Bassam'),
        _repas(3, '2026-11-05', 'retenue_prevue'),
        _repas(4, '2026-11-06', 'retenue_prevue', statutCommande: 'en_attente'),
        _repas(5, '2026-11-12', 'retenue_prevue',
            statutCommande: 'en_attente', montant: 1500),
      ];
  final totaux = <String, Map<String, dynamic>>{};
  for (final s in ['debite_compte', 'paye_caisse', 'retenue', 'retenue_prevue']) {
    final l = r.where((x) => x['statut'] == s);
    totaux[s] = _total(
        l.length, l.fold(0.0, (a, x) => a + ((x['montant'] as num?) ?? 0)));
  }
  return {
    'annee': 2026,
    'mois': 11,
    'mois_cloture': cloture,
    'solde': solde,
    'date_debut': '2026-11-01',
    'date_fin': '2026-11-30',
    'repas': r,
    'totaux': {
      'consomme': _total(
          r.length, r.fold(0.0, (a, x) => a + ((x['montant'] as num?) ?? 0))),
      ...totaux,
    },
    'reste_a_payer_prevu': reste,
    'mention_reste':
        'Reste à payer : repas en retenue sur salaire, retenus à la clôture du mois.',
    'mode_paiement_prefere': 'compte',
    'derniers_mouvements': [],
  };
}

/// Montants affichés : espace insécable entre milliers et avant « F »
String _n(String s) =>
    s.replaceAllMapped(RegExp(r'(\d) (?=\d|F)'), (m) => '${m[1]}\u00A0');

class _FauxService extends CompteRepasService {
  final Map<String, dynamic> compte;
  final List<Map<String, dynamic>> mouvementsJson;
  final List<Map<String, dynamic>> recusJson;
  final List<(int?, int?)> appels = [];
  _FauxService(this.compte,
      {this.mouvementsJson = const [], this.recusJson = const []});

  @override
  Future<CompteRepas> situation({int? annee, int? mois}) async {
    appels.add((annee, mois));
    return CompteRepas.fromJson({...compte, 'annee': annee, 'mois': mois});
  }

  @override
  Future<PageCompte<MouvementCompte>> mouvements(
          {int page = 1, int taille = 30}) async =>
      PageCompte.fromJson({
        'count': mouvementsJson.length,
        'next': null,
        'results': mouvementsJson
      }, MouvementCompte.fromJson);

  @override
  Future<PageCompte<RecuCaisse>> recus({int page = 1, int taille = 20}) async =>
      PageCompte.fromJson(
          {'count': recusJson.length, 'next': null, 'results': recusJson},
          RecuCaisse.fromJson);

  @override
  Future<Uint8List> pdfRecu(int id,
          {PapierRecu papier = PapierRecu.ticket}) async =>
      Uint8List(0);
}

class _Commandes extends CommandeProvider {
  final List<Commande> liste;
  _Commandes(this.liste);
  @override
  List<Commande> get mesCommandes => liste;
  @override
  Future<void> loadMesCommandes() async {}
}

class _Facturation extends FacturationProvider {
  @override
  Future<void> charger() async {}
}

void main() {
  setUpAll(() => initializeDateFormatting('fr_FR'));

  group('Modèles du compte repas', () {
    test('situation du mois : solde, repas, totaux, reste prévu', () {
      final c = CompteRepas.fromJson(_compte(solde: 500, reste: 1500));
      expect(c.solde, 500);
      expect(c.repas, hasLength(5));
      expect(c.repas.first.statut, StatutPaiementRepas.debiteCompte);
      expect(c.repas.first.modePaiement, ModePaiementCommande.compte);
      expect(c.repas[2].statutLibelle,
          'Retenue sur salaire — à la clôture du mois');
      expect(c.repas[2].modePaiement, ModePaiementCommande.retenue);
      expect(c.repas[2].modeModifiable, isFalse);
      expect(c.repas[3].modeModifiable, isTrue);
      expect(c.repas[3].retire, isFalse);
      expect(c.consomme.nb, 5);
      expect(c.consomme.montant, 5500);
      expect(c.debiteCompte.montant, 1000);
      expect(c.payeCaisse.nb, 1);
      expect(c.retenuePrevue.montant, 3500);
      expect(c.retenue.nb, 0);
      // consommé = compte + caisse (historique) + retenue prévue
      expect(c.debiteCompte.montant + c.payeCaisse.montant + c.retenuePrevue.montant,
          c.consomme.montant);
      expect(c.modePaiementPrefere, ModePaiementCommande.compte);
      expect(c.restePrevu, 1500);
      expect(c.moisCloture, isFalse);
    });

    test('statuts : codes, libellés courts, tons', () {
      expect(
          StatutPaiementRepas.depuis('debite_compte').libelle, 'Compte repas');
      expect(StatutPaiementRepas.depuis('paye_caisse').libelle,
          'Payé à la caisse');
      expect(
          StatutPaiementRepas.depuis('retenue').libelle, 'Retenu sur salaire');
      expect(StatutPaiementRepas.depuis('retenue_prevue').ton, TonPastille.or);
      expect(StatutPaiementRepas.depuis('retenue_prevue').libelle,
          'Retenue sur salaire');
      // Code inconnu (ancien « non_couvert », version future) : pas d'erreur
      expect(StatutPaiementRepas.depuis('xyz'),
          StatutPaiementRepas.retenuePrevue);
      expect(StatutPaiementRepas.depuis('non_couvert'),
          StatutPaiementRepas.retenuePrevue);
      expect(StatutPaiementRepas.depuisReglement('compte'),
          StatutPaiementRepas.debiteCompte);
      expect(StatutPaiementRepas.depuisReglement('caisse'),
          StatutPaiementRepas.payeCaisse);
      expect(StatutPaiementRepas.depuisReglement('retenue'),
          StatutPaiementRepas.retenue);
      expect(StatutPaiementRepas.depuisReglement(null), isNull);
    });

    test('repas sans tarif et réponse incomplète', () {
      final r = RepasCompte.fromJson(
          _repas(9, '2026-11-02', 'retenue_prevue', montant: null));
      expect(r.montant, isNull);
      expect(r.sansTarif, isTrue);
      final vide = CompteRepas.fromJson(const {});
      expect(vide.solde, 0);
      expect(vide.repas, isEmpty);
      expect(vide.consomme.nb, 0);
    });

    test('mouvements : types, montant signé, groupés par jour', () {
      final ms = [
        _mouvement(5, 'annulation', -5000, 0, '2026-11-06T15:00:00+00:00'),
        _mouvement(4, 'debit_repas', -1000, 5000, '2026-11-06T12:10:00+00:00',
            libelle: 'Repas du 06/11/2026'),
        _mouvement(3, 'recharge', 6000, 6000, '2026-11-05T08:00:00+00:00',
            recuId: 1, numero: 'REÇ-2026-000001'),
        _mouvement(2, 'recredit', 1000, 1000, '2026-11-04T09:00:00+00:00'),
        _mouvement(1, 'remboursement', -2000, 0, '2026-11-01T09:00:00+00:00'),
        {..._mouvement(0, 'regularisation', 4000, 4000, ''), 'date': null},
      ].map(MouvementCompte.fromJson).toList();
      expect(ms[0].type, TypeMouvement.annulation);
      expect(ms[0].typeLibelle, "Annulation d'un reçu");
      expect(ms[1].type, TypeMouvement.debitRepas);
      expect(ms[1].credit, isFalse);
      expect(ms[2].credit, isTrue);
      expect(ms[2].recuNumero, 'REÇ-2026-000001');
      expect(ms[3].typeLibelle, 'Repas recrédité');
      expect(ms[4].typeLibelle, 'Remboursement du solde');
      expect(
          TypeMouvement.depuis('regularisation'), TypeMouvement.regularisation);
      expect(TypeMouvement.depuis('nouveau'), TypeMouvement.autre);
      final jours = mouvementsParJour(ms);
      expect(jours.map((j) => j.$2.length).toList(), [2, 1, 1, 1, 1]);
      expect(jours.first.$1, DateTime(2026, 11, 6));
      expect(jours.last.$1, DateTime(0)); // date inconnue, en dernier
    });

    test('reçus : recharge, régularisation (lignes, monnaie), annulé', () {
      final recharge = RecuCaisse.fromJson(_recu(1, 'recharge'));
      expect(recharge.numero, 'REÇ-2026-000001');
      expect(recharge.typeLibelle, 'Recharge du compte');
      expect(recharge.modeLibelle, 'Espèces');
      expect(recharge.annule, isFalse);
      expect(recharge.effetSurCompte, 5000);
      expect(recharge.lignes, isEmpty);
      final regul =
          RecuCaisse.fromJson(_recu(2, 'regularisation', montant: 1000));
      expect(regul.lignes.single.plat, 'Alloco poulet');
      expect(regul.lignes.single.dateMenu, DateTime(2026, 10, 2));
      expect(regul.monnaie, 4000);
      expect(regul.monnaieCreditee, isTrue);
      expect(regul.montantRecu, 5000);
      final remb = RecuCaisse.fromJson(_recu(3, 'remboursement'));
      expect(remb.montantRecu, isNull);
      final annule =
          RecuCaisse.fromJson(_recu(4, 'recharge', statut: 'annule'));
      expect(annule.annule, isTrue);
      expect(annule.annuleParNom, 'TRAORE Ali');
      expect(annule.motifAnnulation, 'Doublon de saisie');
      // Libellés absents : valeurs par défaut
      final minimal = RecuCaisse.fromJson(
          {'id': 9, 'type': 'remboursement', 'mode': 'mobile_money'});
      expect(minimal.typeLibelle, 'Remboursement du solde');
      expect(minimal.modeLibelle, 'Mobile Money');
      expect(minimal.statutLibelle, 'Valide');
    });

    test('pages paginées et listes simples', () {
      final p = PageCompte.fromJson({
        'count': 25,
        'next': 'http://x/?page=2',
        'results': [_recu(1, 'recharge')]
      }, RecuCaisse.fromJson);
      expect(p.count, 25);
      expect(p.suivante, isTrue);
      expect(p.resultats.single.id, 1);
      final l =
          PageCompte.fromJson([_recu(1, 'recharge')], RecuCaisse.fromJson);
      expect(l.suivante, isFalse);
      expect(l.count, 1);
    });

    test('ligne de facturation : règlement du repas', () {
      LigneFacturation l(dynamic reglement) => LigneFacturation.fromJson({
            'commande_id': 1,
            'date_menu': '2026-11-03',
            'montant': 1000.0,
            'source': 'calcul',
            'reglement': reglement,
          });
      expect(l('compte').reglement, 'compte');
      expect(l('caisse').reglement, 'caisse');
      expect(l('retenue').reglement, 'retenue');
      expect(l(null).reglement, isNull);
      expect(l('inconnu').reglement, isNull);
      // Ancienne version du serveur : pas de champ
      expect(
          LigneFacturation.fromJson(
              {'commande_id': 1, 'date_menu': '', 'montant': null}).reglement,
          isNull);
    });
  });

  group('Facturation : paiement des repas', () {
    Commande cmd(int id, String statut) => Commande.fromJson({
          'id': id,
          'statut': statut,
          'date_commande': '2026-11-01T09:00:00Z',
          'plat_detail': {'id': 1, 'nom': 'Garba', 'images': []},
          'menu_detail': {
            'id': id,
            'date_menu': '2026-11-0$id',
            'agence_nom': 'Siège',
            'menu_plats': [],
          },
        });
    LigneFacturation ligne(int id, double m, String? reglement) =>
        LigneFacturation.fromJson({
          'commande_id': id,
          'date_menu': '2026-11-0$id',
          'montant': m,
          'source': 'calcul',
          'reglement': reglement,
        });

    test('répartition compte / caisse / retenue / pas encore payé', () {
      final f = FacturationProvider()
        ..lignesPourTest = [
          ligne(1, 1000, 'compte'),
          ligne(2, 1500, 'caisse'),
          ligne(3, 1000, null),
          ligne(4, 1000, 'retenue'),
          ligne(5, 2000, 'compte'),
        ];
      final cs = [
        cmd(1, 'retiree'),
        cmd(2, 'retiree'),
        cmd(3, 'en_attente'),
        cmd(4, 'retiree'),
        cmd(5, 'annulee'), // annulée : jamais comptée
      ];
      final r = f.repartition(cs);
      expect(r.compte, 1000);
      expect(r.caisse, 1500);
      expect(r.retenue, 1000);
      expect(r.nonRegle, 1000);
      expect(f.reglement(cs[1]), 'caisse');
      expect(f.reglement(cs[2]), isNull);
      expect(f.calculerTotal(cs), 4500);
    });
  });

  group('Reste à payer prévu', () {
    String fmt(double m) => formatFcfa(m);

    test('reste à retenir sur salaire', () {
      final r = resteAPayer(
          CompteRepas.fromJson(_compte(solde: 500, reste: 3500)), fmt);
      expect(r.texte,
          _n('Reste à payer prévu à la clôture : 3 500 F (retenue sur salaire)'));
      expect(r.ton, TonPastille.or);
    });

    test('repas en retenue : le solde n\'est pas utilisé automatiquement', () {
      // Solde 4 000 F et un repas en retenue de 1 000 F : 1 000 F retenus
      final r = resteAPayer(
          CompteRepas.fromJson(_compte(solde: 4000, reste: 1000, repas: [
            _repas(2, '2026-11-06', 'retenue_prevue'),
          ])),
          fmt);
      expect(r.texte,
          _n('Reste à payer prévu à la clôture : 1 000 F (retenue sur salaire)'));
      expect(r.detail, contains('changez le mode de paiement'));
      expect(r.detail, isNot(contains('non couvert')));
      expect(r.ton, TonPastille.or);
    });

    test('tout est payé', () {
      final r = resteAPayer(
          CompteRepas.fromJson(_compte(repas: [
            _repas(1, '2026-11-03', 'debite_compte'),
            _repas(2, '2026-11-04', 'paye_caisse'),
          ])),
          fmt);
      expect(r.texte, _n('Reste à payer prévu à la clôture : 0 F'));
      expect(r.detail, 'Aucun repas en retenue sur salaire ce mois-ci.');
      expect(r.ton, TonPastille.vert);
    });

    test('mois clôturé : retenue définitive', () {
      final c = CompteRepas.fromJson(_compte(cloture: true, repas: [
        _repas(1, '2026-10-03', 'debite_compte'),
        _repas(2, '2026-10-04', 'retenue', montant: 1500),
      ]));
      expect(resteAPayer(c, fmt).texte, _n('Retenu sur salaire : 1 500 F'));
      final sans = CompteRepas.fromJson(_compte(cloture: true, repas: [
        _repas(1, '2026-10-03', 'debite_compte'),
      ]));
      expect(resteAPayer(sans, fmt).texte, 'Aucune retenue sur salaire');
    });

    test('montants signés et libellés des jours', () {
      expect(formatSigne(5000), _n('+5 000 F'));
      expect(formatSigne(-1000), _n('−1 000 F'));
      final now = DateTime(2026, 11, 6, 10);
      expect(libelleJour(DateTime(2026, 11, 6), now), "Aujourd'hui");
      expect(libelleJour(DateTime(2026, 11, 5), now), 'Hier');
      expect(libelleJour(DateTime(2026, 11, 3), now), 'Mardi 3 novembre');
      expect(libelleJour(DateTime(2025, 12, 31), now),
          'Mercredi 31 décembre 2025');
    });
  });

  group('Notifications compte repas', () {
    test('icône et ouverture de Mes paiements', () {
      final (icone, ton) =
          configTypeNotification('compte_repas', '💳 Compte repas rechargé');
      expect(icone, Icons.account_balance_wallet_outlined);
      expect(ton, TonPastille.vert);
      expect(configTypeNotification('compte_repas', '↩️ Reçu annulé').$2,
          TonPastille.or);
      expect(
          ouvreMesPaiements({'type': 'compte_repas', 'recu_id': '3'}), isTrue);
      expect(ouvreMesPaiements({'type': 'retrait_valide'}), isFalse);
      expect(commandeRetraitAOuvrir({'type': 'compte_repas'}), isNull);
    });
  });

  group('Mes paiements : pas de débordement sur 320 px', () {
    for (final sombre in [false, true]) {
      testWidgets('écran complet ${sombre ? '(sombre)' : '(clair)'}',
          (tester) async {
        tester.view.physicalSize = const Size(320, 2600);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final service = _FauxService(
          _compte(solde: 125000, reste: 2500),
          mouvementsJson: [
            _mouvement(3, 'debit_repas', -1000, 4000,
                DateTime.now().toUtc().toIso8601String(),
                libelle:
                    'Repas du 06/11/2026 — Alloco poulet, débité au comptoir'),
            _mouvement(
                2, 'regularisation', 4000, 5000, '2026-11-02T09:00:00+00:00',
                libelle:
                    'Monnaie de la régularisation REÇ-2026-000002 créditée',
                recuId: 2,
                numero: 'REÇ-2026-000002'),
            _mouvement(1, 'recharge', 1000, 1000, '2026-11-02T08:00:00+00:00',
                recuId: 1, numero: 'REÇ-2026-000001'),
          ],
          recusJson: [
            _recu(2, 'regularisation', montant: 1000),
            _recu(1, 'recharge', statut: 'annule', montant: 1000000),
          ],
        );
        final prov = CompteRepasProvider(service: service);
        await tester.pumpWidget(ChangeNotifierProvider.value(
          value: prov,
          child: MaterialApp(
            theme: sombre ? AppTheme.dark() : AppTheme.light(),
            home: const MesPaiementsScreen(),
          ),
        ));
        await tester.pump();
        await tester.pump();
        expect(tester.takeException(), isNull);
        final now = DateTime.now();
        expect(service.appels.first, (now.year, now.month));
        expect(find.text('Mes paiements'), findsOneWidget);
        expect(find.text('Solde du compte repas'), findsOneWidget);
        expect(find.text(_n('125 000 F')), findsOneWidget);
        expect(find.text('Rechargez à la caisse UbiPharm (espèces)'),
            findsOneWidget);
        expect(find.text('Bientôt disponible'), findsOneWidget);
        expect(
            find.text(_n(
                'Reste à payer prévu à la clôture : 2 500 F (retenue sur salaire)')),
            findsOneWidget);
        for (final s in [
          'Payé par le compte repas',
          'Retenue sur salaire (à la clôture)',
          'Payé à la caisse',
          'Compte repas',
          'Retenue sur salaire',
        ]) {
          // Ligne du mois et pastille d'un repas
          expect(find.textContaining(s, findRichText: true), findsWidgets);
        }
        // Plus de « non couvert » ni de régularisation à faire
        expect(find.textContaining('Non couvert'), findsNothing);
        expect(find.textContaining('à payer à la caisse'), findsNothing);
        // Mouvements groupés par jour
        expect(find.text("AUJOURD'HUI"), findsOneWidget);
        expect(find.text('Repas débité'), findsOneWidget);
        expect(find.text(_n('+4 000 F')), findsOneWidget);
        expect(find.text(_n('−1 000 F')), findsOneWidget);
        // Reçus
        await tester.tap(find.text('Reçus'));
        await tester.pump();
        expect(tester.takeException(), isNull);
        expect(find.text('Régularisation du mois'), findsOneWidget);
        expect(find.text('Annulé'), findsOneWidget);
        expect(find.text('Voir le reçu (PDF)'), findsNWidgets(2));
        // Mois précédent : nouvelle situation demandée
        await tester.tap(find.byTooltip('Mois précédent'));
        await tester.pump();
        await tester.pump();
        expect(service.appels.last, (
          DateTime(now.year, now.month - 1).year,
          DateTime(now.year, now.month - 1).month
        ));
        expect(tester.takeException(), isNull);
      });

      testWidgets(
          'Ma facturation : paiement par repas et du mois '
          '${sombre ? '(sombre)' : '(clair)'}', (tester) async {
        tester.view.physicalSize = const Size(320, 1800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final now = DateTime.now();
        String jour(int j) => '${now.year}-'
            '${now.month.toString().padLeft(2, '0')}-'
            '${j.toString().padLeft(2, '0')}';
        Commande cmd(int id, String statut) => Commande.fromJson({
              'id': id,
              'statut': statut,
              'date_commande': '${jour(1)}T08:00:00Z',
              'plat_detail': {
                'id': id,
                'nom': 'Riz sauce graine aux crabes de Grand-Bassam',
                'images': []
              },
              'menu_detail': {
                'id': id,
                'date_menu': jour(id),
                'agence_nom': 'Siège',
                'menu_plats': [],
              },
            });
        final fact = _Facturation()
          ..lignesPourTest = [
            for (final (id, r) in [(1, 'compte'), (2, 'caisse'), (3, null)])
              LigneFacturation.fromJson({
                'commande_id': id,
                'date_menu': jour(id),
                'montant': 1000.0,
                'source': 'calcul',
                'reglement': r,
              }),
          ];
        await tester.pumpWidget(MultiProvider(
          providers: [
            ChangeNotifierProvider<CommandeProvider>(
                create: (_) => _Commandes([
                      cmd(1, 'retiree'),
                      cmd(2, 'retiree'),
                      cmd(3, 'retiree'),
                    ])),
            ChangeNotifierProvider<FacturationProvider>.value(value: fact),
            ChangeNotifierProvider(
                create: (_) => CompteRepasProvider(
                    service: _FauxService(_compte(reste: 1000)))),
            ChangeNotifierProvider(create: (_) => AuthProvider()),
          ],
          child: MaterialApp(
            theme: sombre ? AppTheme.dark() : AppTheme.light(),
            home: const FacturationScreen(),
          ),
        ));
        await tester.pump();
        await tester.pump();
        expect(tester.takeException(), isNull);
        expect(find.text('Mon compte repas · Mes paiements'), findsOneWidget);
        expect(find.text('Paiement du mois'), findsOneWidget);
        expect(find.text('Compte repas'), findsOneWidget);
        expect(find.text('Payé à la caisse'), findsOneWidget);
        expect(find.text('Retenue sur salaire'), findsOneWidget);
        expect(find.text('retenue à la clôture'), findsOneWidget);
        expect(find.text('Non couvert'), findsNothing);
        // Ouvre Mes paiements
        await tester.tap(find.text('Mon compte repas · Mes paiements'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        await tester.pump();
        expect(tester.takeException(), isNull);
        expect(find.text('Solde du compte repas'), findsOneWidget);
      });

      testWidgets(
          'carte « Mon compte repas » ${sombre ? '(sombre)' : '(clair)'}',
          (tester) async {
        tester.view.physicalSize = const Size(320, 600);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final prov =
            CompteRepasProvider(service: _FauxService(_compte(reste: 2500)));
        await prov.charger();
        await tester.pumpWidget(ChangeNotifierProvider.value(
          value: prov,
          child: MaterialApp(
            theme: sombre ? AppTheme.dark() : AppTheme.light(),
            home: const Scaffold(
                body: Padding(
                    padding: EdgeInsets.all(14),
                    child: CarteCompteRepasResume())),
          ),
        ));
        expect(tester.takeException(), isNull);
        expect(find.text(_n('4 000 F')), findsOneWidget);
        expect(find.text(_n('Reste prévu à la clôture : 2 500 F')),
            findsOneWidget);
      });
    }
  });
}
