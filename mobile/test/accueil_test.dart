import 'package:cantine_app/core/config.dart';
import 'package:cantine_app/features/dashboard/accueil_widgets.dart';
import 'package:cantine_app/shared/models/models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

/// Réponse de GET /accueil/ telle que la renvoie le serveur (gestionnaire)
const _json = {
  'date': '2026-10-21',
  'repas_du_jour': {
    'id': 12,
    'statut': 'en_attente',
    'date_menu': '2026-10-21',
    'plat': 'Attiéké poisson',
    'plat_image_url': '/media/plats/attieke.jpg',
    'agence': 'Siège',
    'equipe': 'Journée',
    'menu_id': 40,
  },
  'semaine': [
    {'date': '2026-10-19', 'libelle': 'lundi 19/10', 'statut': 'retire', 'plat': 'Placali', 'commande_id': 10},
    {'date': '2026-10-20', 'libelle': 'mardi 20/10', 'statut': 'non_retire', 'plat': 'Foutou', 'commande_id': 11},
    {'date': '2026-10-21', 'libelle': 'mercredi 21/10', 'statut': 'a_retirer', 'plat': 'Attiéké poisson', 'commande_id': 12},
    {'date': '2026-10-22', 'libelle': 'jeudi 22/10', 'statut': 'ferme'},
    {'date': '2026-10-23', 'libelle': 'vendredi 23/10', 'statut': 'a_reserver', 'date_limite_commande': '2026-10-22T10:00:00Z'},
  ],
  'prochain_a_reserver': {
    'date': '2026-10-23',
    'libelle': 'vendredi 23/10',
    'agence': 'Siège',
    'nb_plats': 3,
    'menu_id': 44,
    'date_limite_commande': '2026-10-22T10:00:00Z',
    'date_limite_libelle': 'jeudi 22 octobre à 10:00',
  },
  'mois': {'repas': 14, 'retires': 12, 'annules': 1, 'montant': 7000.0, 'repas_sans_tarif': 0},
  'recentes': [
    {'id': 12, 'statut': 'en_attente', 'date_menu': '2026-10-21', 'plat': 'Attiéké poisson', 'plat_image_url': null, 'agence': 'Siège', 'equipe': null, 'menu_id': 40},
  ],
  'gestion': {
    'agences': ['Siège', 'Yopougon'],
    'service_du_jour': [
      {'agence_id': 1, 'agence': 'Siège', 'equipes': ['Journée'], 'nb_plats': 3, 'commandees': 50, 'servies': 34, 'a_servir': 16},
    ],
    'semaine': [
      {'date': '2026-10-19', 'libelle': 'lundi 19/10', 'etat': 'termine', 'commandees': 68, 'retirees': 65, 'agences_sans_menu': []},
      {'date': '2026-10-21', 'libelle': 'mercredi 21/10', 'etat': 'en_cours', 'commandees': 70, 'retirees': 34, 'agences_sans_menu': []},
      {'date': '2026-10-23', 'libelle': 'vendredi 23/10', 'etat': 'sans_menu', 'commandees': 0, 'retirees': 0, 'agences_sans_menu': ['Siège', 'Yopougon']},
    ],
    'a_faire': [
      {'type': 'cloture', 'annee': 2026, 'mois': 9, 'titre': "09/2026 n'est pas encore clôturé", 'detail': 'Clôturez le mois pour figer la facturation'},
      {'type': 'menu_manquant', 'date': '2026-10-23', 'titre': 'Pas de menu vendredi 23/10', 'detail': 'Yopougon · les agents ne peuvent pas commander'},
    ],
  },
};

void main() {
  group('Accueil.fromJson', () {
    test('lit la partie personnelle', () {
      final a = Accueil.fromJson(_json);
      expect(a.date, DateTime(2026, 10, 21));

      final r = a.repasDuJour!;
      expect(r.id, 12);
      expect(r.statut, StatutCommande.enAttente);
      expect(r.plat, 'Attiéké poisson');
      expect(r.platImageUrl, '${AppConfig.serverUrl}/media/plats/attieke.jpg');
      expect(r.agence, 'Siège');
      expect(r.menuId, 40);

      expect(a.semaine.map((j) => j.statut), [
        StatutJour.retire,
        StatutJour.nonRetire,
        StatutJour.aRetirer,
        StatutJour.ferme,
        StatutJour.aReserver,
      ]);
      expect(a.semaine.first.date, DateTime(2026, 10, 19));
      expect(a.semaine.first.commandeId, 10);
      expect(a.semaine.last.dateLimiteCommande,
          DateTime.utc(2026, 10, 22, 10));

      final p = a.prochainAReserver!;
      expect(p.date, DateTime(2026, 10, 23));
      expect(p.nbPlats, 3);
      expect(p.menuId, 44);
      expect(p.agence, 'Siège');
      expect(p.dateLimiteCommande, DateTime.utc(2026, 10, 22, 10));

      expect(a.mois.repas, 14);
      expect(a.mois.retires, 12);
      expect(a.mois.annules, 1);
      expect(a.mois.montant, 7000);
      expect(a.recentes.single.platImageUrl, isNull);
    });

    test('lit la partie gestionnaire', () {
      final g = Accueil.fromJson(_json).gestion!;
      expect(g.agences, ['Siège', 'Yopougon']);
      final s = g.serviceDuJour.single;
      expect([s.commandees, s.servies, s.aServir], [50, 34, 16]);
      expect(s.progression, closeTo(0.68, 0.001));
      expect(g.semaine.map((j) => j.etat), [
        EtatJourGestion.termine,
        EtatJourGestion.enCours,
        EtatJourGestion.sansMenu,
      ]);
      expect(g.semaine.last.agencesSansMenu, ['Siège', 'Yopougon']);
      expect(g.aFaire, hasLength(2));
      final manquant = g.menusManquants.single;
      expect(manquant.date, DateTime(2026, 10, 23));
      expect(manquant.agences, 'Yopougon');
    });

    test('employé, valeurs absentes ou au format texte', () {
      final a = Accueil.fromJson({
        'date': '2026-10-21',
        'repas_du_jour': null,
        'semaine': [
          {'date': '2026-10-19', 'libelle': 'lundi 19/10', 'statut': 'inconnu'}
        ],
        'prochain_a_reserver': null,
        'mois': {'repas': '3', 'montant': '1500.00'},
      });
      expect(a.repasDuJour, isNull);
      expect(a.prochainAReserver, isNull);
      expect(a.gestion, isNull);
      expect(a.recentes, isEmpty);
      expect(a.semaine.single.statut, StatutJour.pasDeMenu);
      expect(a.mois.repas, 3);
      expect(a.mois.montant, 1500);
      expect(a.mois.annules, 0);
      expect(const ServiceAgence(agenceId: 1, agence: 'X').progression, 0);
    });
  });

  group('Accueil : affichage', () {
    test('montant en FCFA', () {
      expect(formatFcfa(7000), '7 000 F');
      expect(formatFcfa(0), '0 F');
      expect(formatFcfa(1234567.4), '1 234 567 F');
    });

    test('compte à rebours avant fermeture', () {
      final t = DateTime.utc(2026, 10, 21, 8);
      expect(fermeDans(t.add(const Duration(days: 1, hours: 4)), t),
          'Ferme dans 1 j 4 h');
      expect(fermeDans(t.add(const Duration(days: 2)), t), 'Ferme dans 2 j');
      expect(fermeDans(t.add(const Duration(hours: 3, minutes: 5)), t),
          'Ferme dans 3 h 05');
      expect(fermeDans(t.add(const Duration(minutes: 12)), t),
          'Ferme dans 12 min');
      expect(fermeDans(t, t), isNull);
      expect(fermeDans(null, t), isNull);
    });
  });

  group('Accueil : pas de débordement sur un écran de 320 px', () {
    setUpAll(() => initializeDateFormatting('fr_FR'));

    for (final sombre in [false, true]) {
      testWidgets(sombre ? 'thème sombre' : 'thème clair', (tester) async {
        tester.view.physicalSize = const Size(320, 1400);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final a = Accueil.fromJson(_json);
        final g = a.gestion!;
        await tester.pumpWidget(MaterialApp(
          theme: ThemeData(
              brightness: sombre ? Brightness.dark : Brightness.light),
          home: Scaffold(
            body: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(children: [
                MaSemaineCard(
                    jours: a.semaine,
                    aujourdhui: a.date,
                    onVoirMenus: () {},
                    onJour: (_) {}),
                ProchainRepasCard(
                    prochain: a.prochainAReserver!, onReserver: () {}),
                ChiffresMoisRow(tuiles: [
                  const ChiffreTuile('14', 'repas oct.'),
                  const ChiffreTuile('12', 'retirés'),
                  const ChiffreTuile('1', 'annulé'),
                  ChiffreTuile(formatFcfa(127000), 'à payer', montant: true),
                ]),
                ServiceDuJourCard(
                    services: [
                      ...g.serviceDuJour,
                      const ServiceAgence(
                          agenceId: 2,
                          agence: 'Yopougon',
                          equipes: ['Nuit'],
                          commandees: 1250,
                          servies: 1000,
                          aServir: 250),
                    ],
                    actualiseLe: DateTime(2026, 10, 21, 10, 42),
                    chargement: false,
                    onScanner: () {},
                    onActualiser: () {}),
                AlerteMenuManquant(alerte: g.menusManquants.single),
                CommandesSemaineCard(
                    jours: g.semaine, aujourdhui: a.date, onGestion: () {}),
              ]),
            ),
          ),
        ));
        expect(tester.takeException(), isNull);
        expect(find.text('Ma semaine'), findsOneWidget);
        expect(find.text('Scanner un badge'), findsOneWidget);
        expect(find.textContaining('(Yopougon) — à créer sur le web'),
            findsOneWidget);
        final semantique = tester.ensureSemantics();
        expect(
            find.bySemanticsLabel(
                RegExp('vendredi 23/10, à réserver', caseSensitive: false)),
            findsOneWidget);
        semantique.dispose();
      });
    }
  });
}
