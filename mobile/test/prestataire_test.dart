import 'package:cantine_app/core/services/notification_routage.dart';
import 'package:cantine_app/core/services/prestataire_service.dart';
import 'package:cantine_app/features/contestation/retrait_detail_screen.dart';
import 'package:cantine_app/features/notifications/notification_screen.dart';
import 'package:cantine_app/features/prestataire/accueil_prestataire_screen.dart';
import 'package:cantine_app/features/prestataire/comptoir_screen.dart';
import 'package:cantine_app/features/prestataire/liste_du_jour_screen.dart';
import 'package:cantine_app/features/prestataire/prestataire_widgets.dart';
import 'package:cantine_app/features/main_shell.dart';
import 'package:cantine_app/core/widgets/common_widgets.dart';
import 'package:cantine_app/shared/models/models.dart';
import 'package:cantine_app/shared/models/prestataire_models.dart';
import 'package:cantine_app/shared/providers/app_provider.dart';
import 'package:cantine_app/shared/providers/prestataire_provider.dart';
import 'package:cantine_app/shared/theme/app_theme.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ── Données d'exemple (format de l'API, docs espace prestataire) ─────────

final _contexte = {
  'user': {
    'id': 190,
    'nom_complet': "N'GUESSAN Aya",
    'role': 'agent_comptoir',
    'role_libelle': 'Agent de comptoir'
  },
  'prestataire': {'id': 2, 'libelle': "Traiteur Délices d'Abidjan"},
  'agences': [
    {
      'id': 4,
      'nom': 'Siège',
      'nb_employes': 168,
      'heure_debut_service': '11:30',
      'heure_fin_service': '14:30'
    },
  ],
  'acces': {'comptoir': true, 'liste_du_jour': true, 'accueil': false},
};

Map<String, dynamic> _retrait(
        {int id = 12009,
        bool annulable = true,
        Duration reste = const Duration(seconds: 100)}) =>
    {
      'id': id,
      'user_id': 191,
      'user_nom': 'KOUAME Brice Emmanuel Kouassi',
      'matricule': 'UBI-0457',
      'menu_id': 773,
      'date_retrait': DateTime.now().toUtc().toIso8601String(),
      'heure': '12:31',
      'plats': [
        {'commande_id': 4127, 'plat': 'Tchep au poulet'}
      ],
      'valide_par_id': 190,
      'valide_par_nom': "N'GUESSAN Aya",
      'valide_par_prestataire': "Traiteur Délices d'Abidjan",
      'mode': 'scan',
      'annulable_par_moi': annulable,
      'annulable_jusqu_a': DateTime.now().add(reste).toUtc().toIso8601String(),
    };

Map<String, dynamic> _service() => {
      'date': '2026-11-17',
      'agence': {
        'id': 4,
        'nom': 'Siège',
        'heure_debut_service': '11:30',
        'heure_fin_service': '14:30'
      },
      'menus': [
        {'id': 773, 'typeequipe_libelle': 'Jour'}
      ],
      'commandees': 64,
      'servies': 41,
      'a_servir': 23,
      'pct_servis': 64,
      'plats': [
        {
          'plat_id': 27,
          'nom': 'Garba au thon frit et attiéké maison',
          'image_url': null,
          'commandees': 24,
          'servies': 15,
          'a_servir': 9
        }
      ],
      'mes_retraits_aujourdhui': 27,
      'derniers': [
        _retrait(),
        _retrait(id: 12008, annulable: false),
      ],
    };

final _recherche = {
  'employe': {
    'id': 191,
    'nom': 'KOUAME',
    'prenoms': 'Brice',
    'nom_complet': 'KOUAME Brice Emmanuel Kouassi Yao',
    'matricule': 'UBI-0457',
    'agence': 'Siège'
  },
  'commandes': [
    {
      'commande_id': 4127,
      'menu_id': 773,
      'plat_id': 31,
      'plat': 'Tchep au poulet braisé et légumes',
      'plat_image_url': null,
      'statut': 'en_attente',
      'date_commande': '2026-11-16T09:12:00Z'
    }
  ],
  'deja_retire': false,
  'retrait': null,
  'a_retirer': true,
  'menu_id': 773,
  'message': 'Commande du jour trouvée.',
};

const _message409 =
    'TRAORE Ali a déjà retiré son repas à 12:41 (validé par ASSI Rodrigue).';

final _liste = {
  'date': '2026-11-17',
  'agence': 4,
  'total': 64,
  'retires': 41,
  'a_servir': 23,
  'lignes': [
    {
      'commande_id': 4127,
      'menu_id': 773,
      'user_id': 191,
      'nom': 'BAMBA',
      'prenoms': 'Salif',
      'nom_complet': 'BAMBA Salif Abdoulaye Mamadou',
      'matricule': 'UBI-0457',
      'agence': 'Siège',
      'agence_id': 4,
      'plat_id': 27,
      'plat': 'Garba au thon frit',
      'statut': 'retire',
      'heure_retrait': '12:22',
      'valide_par_nom': "N'GUESSAN Aya Marie-Laure"
    },
    {
      'commande_id': 4128,
      'user_id': 192,
      'nom_complet': 'DIALLO Mariam',
      'matricule': 'UBI-0912',
      'plat': 'Placali',
      'statut': 'a_servir',
      'heure_retrait': null,
      'valide_par_nom': null
    },
  ],
};

final _accueil = {
  'date': '2026-11-17',
  'heure': '12:40',
  'prestataire': {'id': 2, 'libelle': "Traiteur Délices d'Abidjan"},
  'agences': [
    {'id': 4, 'nom': 'Siège'},
    {'id': 7, 'nom': 'Yopougon'}
  ],
  'service_du_jour': [
    {
      'agence_id': 4,
      'agence_nom': 'Siège',
      'heure_debut_service': '11:30',
      'heure_fin_service': '14:30',
      'commandees': 64,
      'servies': 41,
      'a_servir': 23,
      'pct_servis': 64,
      'plats': [
        {
          'plat_id': 27,
          'plat': 'Garba',
          'image_url': null,
          'commandees': 24,
          'servies': 15,
          'a_servir': 9
        }
      ]
    }
  ],
  'a_preparer': {
    'date': '2026-11-18',
    'libelle': 'mercredi 18/11',
    'etat': 'provisoire',
    'provisoire': true,
    'libelle_limite': 'mardi 17/11/2026 à 16:00',
    'totaux_par_agence': {'4': 62, '7': 29},
    'total': 91,
    'plats': [
      {
        'plat_id': 31,
        'plat': 'Alloco poulet braisé sauce tomate',
        'par_agence': {'4': 26, '7': 10},
        'total': 36
      }
    ],
    'agences': [
      {'id': 4, 'nom': 'Siège'},
      {'id': 7, 'nom': 'Yopougon'}
    ]
  },
  'alertes': [
    {
      'type': 'menus_a_composer',
      'semaine_du': '2026-11-23',
      'agences': [
        {
          'agence_id': 4,
          'agence_nom': 'Siège',
          'jours_a_composer': 2,
          'dates': ['2026-11-26', '2026-11-27'],
          'brouillons': ['2026-11-26']
        }
      ]
    },
    {
      'type': 'contestation',
      'contestation_id': 12,
      'date_menu': '2026-11-17',
      'agence_nom': 'Yopougon',
      'plat': 'Garba',
      'valide_par_nom': 'KONAN Serge',
      'heure_retrait': '11:58',
      'statut': 'ouverte'
    },
    {
      'type': 'releve',
      'libelle': 'Octobre 2026',
      'etat': 'cloture',
      'numero': 'RP-2026-001',
      'nb_repas': 1862
    },
    {'type': 'plat_masque', 'plat': 'Garba', 'motif': 'Photo non conforme'},
  ],
  'note_moyenne': {'note': 4.4, 'nb_avis': 312},
};

Map<String, dynamic> _detailRetrait({Map<String, dynamic>? contestation}) => {
      'commande_id': 4188,
      'statut': 'retiree',
      'date_menu': '2026-11-17',
      'plat': 'Garba',
      'agence': 'Yopougon',
      'retrait': {
        'id': 12009,
        'date_retrait': '2026-11-17T11:58:00Z',
        'heure': '11:58',
        'comptoir': 'Yopougon',
        'valide_par_nom': 'KONAN Serge',
        'valide_par_prestataire': "Traiteur Délices d'Abidjan",
        'mode': 'saisie',
        'mode_libelle': 'Matricule saisi'
      },
      'contestation': contestation,
      'contestable': contestation == null,
      'raison_non_contestable': null,
      'contestable_jusqu_au': '2026-11-30',
      'motifs': [
        {'valeur': 'absent', 'libelle': "J'étais absent(e) (mission, congé…)"},
        {
          'valeur': 'badge_utilise',
          'libelle': "Quelqu'un a utilisé mon badge / matricule"
        },
        {'valeur': 'autre', 'libelle': 'Autre raison'}
      ],
    };

final _contestationRejetee = {
  'id': 12,
  'statut': 'rejetee',
  'statut_libelle': 'Rejetée',
  'motif': 'absent',
  'motif_libelle': "J'étais absent(e) (mission, congé…)",
  'commentaire': "J'étais en mission à San-Pédro toute la journée.",
  'commentaire_traitement':
      'Votre badge a été scanné à 11:58, la caméra du comptoir vous montre.',
  'created_at': '2026-11-17T12:05:00Z',
  'date_traitement': '2026-11-18T09:00:00Z',
};

DioException _erreur409() {
  final req = RequestOptions(path: '/prestataire/comptoir/valider/');
  return DioException(
    requestOptions: req,
    response: Response(requestOptions: req, statusCode: 409, data: {
      'detail': _message409,
      'code': 'deja_retire',
      'retrait': _retrait(annulable: false),
    }),
    type: DioExceptionType.badResponse,
  );
}

class _FausseApi extends PrestataireService {
  bool repondre409 = false;
  int validations = 0;
  ModeIdentification? dernierMode;

  @override
  Future<ContextePrestataire> contexte() async =>
      ContextePrestataire.fromJson(_contexte);
  @override
  Future<AccueilPrestataire> accueil() async =>
      AccueilPrestataire.fromJson(_accueil);
  @override
  Future<ServiceComptoir> service({int? agenceId, int limite = 8}) async =>
      ServiceComptoir.fromJson(_service());
  @override
  Future<RechercheComptoir> recherche(String badge, {int? agenceId}) async =>
      RechercheComptoir.fromJson(_recherche);
  @override
  Future<RetraitComptoir> valider(
      {required int menuId,
      required int userId,
      required ModeIdentification mode}) async {
    validations++;
    dernierMode = mode;
    if (repondre409) throw _erreur409();
    return RetraitComptoir.fromJson(_retrait());
  }

  @override
  Future<ListeDuJour> listeDuJour(
          {int? agenceId, String? statut, String? recherche}) async =>
      ListeDuJour.fromJson(_liste);
}

class _FausseContestation extends ContestationService {
  final List<(String, String)> envois = [];
  @override
  Future<DetailRetraitCommande> detailRetrait(int commandeId) async =>
      DetailRetraitCommande.fromJson(_detailRetrait());
  @override
  Future<ContestationRetrait> contester(
      {required int commandeId,
      required String motif,
      String commentaire = ''}) async {
    envois.add((motif, commentaire));
    return ContestationRetrait.fromJson({
      'id': 13,
      'commande': commandeId,
      'statut': 'ouverte',
      'motif': motif,
      'commentaire': commentaire
    });
  }
}

Widget _app(Widget home,
    {required bool sombre,
    List<ChangeNotifierProvider>? providers,
    _FausseApi? api}) {
  final fausse = api ?? _FausseApi();
  return MultiProvider(
    providers: [
      ChangeNotifierProvider(create: (_) => AuthProvider()),
      ChangeNotifierProvider(create: (_) => NotificationProvider()),
      ChangeNotifierProvider(
          create: (_) => EspacePrestataireProvider(service: fausse)),
      ChangeNotifierProvider(create: (_) => ComptoirProvider(service: fausse)),
      ChangeNotifierProvider(
          create: (_) => ListeDuJourProvider(service: fausse)),
      ChangeNotifierProvider(create: (_) => ContestationProvider()),
      ...?providers,
    ],
    child: MaterialApp(
      theme: sombre ? AppTheme.dark() : AppTheme.light(),
      home: home,
    ),
  );
}

void _ecran320(WidgetTester tester, {double hauteur = 1800}) {
  tester.view.physicalSize = Size(320, hauteur);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

void main() {
  setUpAll(() {
    SharedPreferences.setMockInitialValues({});
    return initializeDateFormatting('fr_FR');
  });

  group('Rôles', () {
    Map<String, dynamic> me(List<String> roles) => {
          'id': 190,
          'username': 'UBI-P-0007',
          'nom': "N'GUESSAN",
          'prenom': 'Aya',
          'groups': [7],
          'roles': roles,
          'prestataire': 2,
          'prestataire_libelle': "Traiteur Délices d'Abidjan",
        };

    test('agent de comptoir et responsable du prestataire', () {
      final agent = AuthUser.fromJson(me(['agent_comptoir']));
      expect(agent.isAgentComptoir, isTrue);
      expect(agent.isPrestataireResponsable, isFalse);
      expect(agent.isComptePrestataire, isTrue);
      expect(agent.isGestionnaire, isFalse);
      expect(agent.prestataireId, 2);
      expect(agent.prestataireLibelle, "Traiteur Délices d'Abidjan");
      expect(agent.libelleRole, 'Agent de comptoir');

      final resp = AuthUser.fromJson(me(['prestataire']));
      expect(resp.isPrestataireResponsable, isTrue);
      expect(resp.isAgentComptoir, isFalse);
      expect(resp.isComptePrestataire, isTrue);
      expect(resp.libelleRole, 'Prestataire (responsable)');

      final emp = AuthUser.fromJson(me(['employe'])..remove('prestataire'));
      expect(emp.isComptePrestataire, isFalse);
      expect(emp.prestataireId, isNull);
      expect(emp.libelleRole, 'Employé');
      expect(
          AuthUser.fromJson(me(['gestionnaire'])).isComptePrestataire, isFalse);
    });
  });

  group('Comptoir : lecture des réponses', () {
    test('contexte, service, recherche, retrait', () {
      final c = ContextePrestataire.fromJson(_contexte);
      expect(c.estResponsable, isFalse);
      expect(c.peut('comptoir'), isTrue);
      expect(c.peut('accueil'), isFalse);
      expect(c.agences.single.libelleService, 'service 11:30 – 14:30');

      final s = ServiceComptoir.fromJson(_service());
      expect(s.aDesMenus, isTrue);
      expect((s.servies, s.aServir, s.commandees), (41, 23, 64));
      expect(s.plats.single.aServir, 9);
      expect(s.derniers, hasLength(2));
      expect(s.derniers.first.plats, ['Tchep au poulet']);
      expect(s.derniers.first.libelleMode, 'Badge scanné');

      final r = RechercheComptoir.fromJson(_recherche);
      expect(r.aRetirer, isTrue);
      expect(r.nbARemettre, 1);
      expect(r.menuId, 773);
      expect(r.employe.matricule, 'UBI-0457');

      // Annulation : seulement les siens, avant l'échéance
      final now = DateTime.now();
      expect(s.derniers.first.resteAnnulation(now), isNotNull);
      expect(s.derniers[1].resteAnnulation(now), isNull);
      expect(
          RetraitComptoir.fromJson(_retrait(reste: const Duration(seconds: -5)))
              .resteAnnulation(now),
          isNull);
      expect(minutesSecondes(const Duration(seconds: 105)), '1:45');

      // Valeurs absentes : pas de plantage
      final vide = ServiceComptoir.fromJson({});
      expect(vide.aDesMenus, isFalse);
      expect(vide.derniers, isEmpty);
    });

    test('409 « déjà retiré »', () {
      final d = DejaRetire.depuisReponse(_erreur409().response!.data)!;
      expect(d.message, _message409);
      expect(d.retrait?.valideParNom, "N'GUESSAN Aya");
      expect(DejaRetire.depuisReponse({'detail': 'Autre'}), isNull);
      expect(DejaRetire.depuisReponse('texte'), isNull);
      expect(estDejaRetire(_erreur409()), isTrue);
    });

    test('liste du jour et accueil du responsable', () {
      final l = ListeDuJour.fromJson(_liste);
      expect((l.total, l.retires, l.aServir), (64, 41, 23));
      expect(l.lignes.first.estRetire, isTrue);
      expect(l.lignes.first.valideParNom, "N'GUESSAN Aya Marie-Laure");
      expect(l.lignes[1].heureRetrait, isNull);

      final a = AccueilPrestataire.fromJson(_accueil);
      expect(a.totalCommandees, 64);
      expect(a.aPreparer!.totauxParAgence, {4: 62, 7: 29});
      expect(a.aPreparer!.plats.single.parAgence[7], 10);
      expect(a.aPreparer!.libelleEtat,
          'Provisoire · figé mardi 17/11/2026 à 16:00');
      expect(a.alertes.map((e) => e.type),
          ['menus_a_composer', 'contestation', 'releve', 'plat_masque']);
      expect(a.alertes.first.detail, contains('Siège : 2 jours'));
      expect(a.alertes[1].detail, contains('validé par KONAN Serge à 11:58'));
      expect(a.noteMoyenne, 4.4);
    });
  });

  group('Contestation', () {
    test('détail du retrait et contestation', () {
      final d = DetailRetraitCommande.fromJson(_detailRetrait());
      expect(d.contestable, isTrue);
      expect(d.retrait!.valideParNom, 'KONAN Serge');
      expect(d.retrait!.modeLibelle, 'Matricule saisi');
      expect(
          d.motifs.map((m) => m.valeur), ['absent', 'badge_utilise', 'autre']);
      expect(d.contestableJusquAu, DateTime(2026, 11, 30));

      final avec = DetailRetraitCommande.fromJson(
          _detailRetrait(contestation: _contestationRejetee));
      expect(avec.contestation!.statut, StatutContestation.rejetee);
      expect(avec.contestation!.commentaireTraitement, contains('scanné'));
      // Motifs absents : motifs par défaut
      expect(DetailRetraitCommande.fromJson({'commande_id': 1}).motifs,
          hasLength(3));
      expect(ContestationRetrait.fromJson({'id': 1, 'commande': 4188}).statut,
          StatutContestation.ouverte);
    });

    test('validation du formulaire', () {
      expect(verifierContestation(null, ''), 'Choisissez une raison.');
      expect(verifierContestation('autre', '   '),
          'Précisez la raison de votre contestation.');
      expect(verifierContestation('autre', 'Badge prêté'), isNull);
      expect(verifierContestation('absent', ''), isNull);
      expect(verifierContestation('absent', 'x' * 1001), isNotNull);
    });

    test('notification « Retrait validé » : commande à ouvrir', () {
      final data = {
        'type': 'retrait_valide',
        'commande_id': '4188',
        'menu_id': '773',
        'retrait_id': '12009',
        'contestation_id': '',
        'notif_id': '55',
      };
      expect(commandeRetraitAOuvrir(data), 4188);
      expect(ouvrirFormulaireContestation(data), isFalse);
      expect(ouvrirFormulaireContestation({...data, 'action': actionContester}),
          isTrue);
      expect(
          commandeRetraitAOuvrir(
              {'type': 'contestation_decidee', 'commande_id': '4188'}),
          4188);
      expect(
          commandeRetraitAOuvrir(
              {'type': 'commande_passee', 'commande_id': '1'}),
          isNull);
      expect(
          commandeRetraitAOuvrir({'type': 'retrait_valide', 'commande_id': ''}),
          isNull);

      final n = NotificationItem.fromJson({
        'id': 55,
        'type': 'retrait_valide',
        'titre': '🍽️ Retrait validé · Garba',
        'message': '…',
        'lu': false,
        'created_at': '2026-11-17T11:58:00Z',
        'commande_id': 4188,
        'retrait_id': 12009,
        'contestation_id': null,
      });
      expect(n.retraitId, 12009);
      expect(n.ouvreRetrait, isTrue);
      expect(
          configTypeNotification(
                  'contestation_decidee', '✅ Contestation acceptée')
              .$2,
          TonPastille.vert);
      expect(
          configTypeNotification(
                  'contestation_decidee', '❌ Contestation rejetée')
              .$2,
          TonPastille.rouge);
      expect(configTypeNotification('plat_masque').$1,
          Icons.visibility_off_outlined);
    });
  });

  group('Espace prestataire : 320 px sans débordement', () {
    for (final sombre in [false, true]) {
      final t = sombre ? '(sombre)' : '(clair)';

      testWidgets('comptoir : recherche, validation, annulation $t',
          (tester) async {
        _ecran320(tester);
        final api = _FausseApi();
        await tester.pumpWidget(_app(const ComptoirScreen(ongletListe: 1),
            sombre: sombre, api: api));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('Comptoir · Siège'), findsOneWidget);
        expect(find.text('Scanner un badge'), findsOneWidget);
        expect(find.text('Derniers retraits'), findsOneWidget);
        // Seul son retrait récent est annulable (compte à rebours)
        expect(find.textContaining('Annuler · 1:'), findsOneWidget);

        await tester.enterText(find.byType(TextField), 'UBI-0457');
        await tester.testTextInput.receiveAction(TextInputAction.search);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('1 plat à remettre'), findsOneWidget);
        expect(find.text('Commande n° 4127'), findsOneWidget);
        expect(find.textContaining('Enregistré au nom de'), findsOneWidget);

        await tester.tap(find.text('Valider le retrait'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(api.dernierMode, ModeIdentification.saisie);
        expect(find.text('Retrait validé à 12:31'), findsOneWidget);
        expect(find.textContaining('Annuler · 1:'), findsWidgets);
        expect(tester.takeException(), isNull);

        // Disposer les comptes à rebours
        await tester.pumpWidget(const SizedBox());
      });

      testWidgets('comptoir : alerte 409 déjà retiré $t', (tester) async {
        _ecran320(tester);
        final api = _FausseApi()..repondre409 = true;
        await tester
            .pumpWidget(_app(const ComptoirScreen(), sombre: sombre, api: api));
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextField), 'ubi-0457');
        await tester.testTextInput.receiveAction(TextInputAction.search);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Valider le retrait'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.text('Repas déjà retiré'), findsOneWidget);
        expect(find.text(_message409), findsOneWidget);
        expect(find.text('Valider le retrait'), findsNothing);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      });

      testWidgets('liste du jour $t', (tester) async {
        _ecran320(tester, hauteur: 900);
        await tester
            .pumpWidget(_app(const ListeDuJourScreen(), sombre: sombre));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('Retiré · 12:22'), findsOneWidget);
        expect(find.text('À servir'), findsWidgets);
        expect(find.textContaining('Validé par'), findsOneWidget);
      });

      testWidgets('accueil du responsable $t', (tester) async {
        _ecran320(tester, hauteur: 2200);
        await tester
            .pumpWidget(_app(const AccueilPrestataireScreen(), sombre: sombre));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('Ouvrir le comptoir'), findsOneWidget);
        expect(find.text('Retrait contesté'), findsOneWidget);
        expect(find.text('Mercredi 18/11'), findsOneWidget);
        expect(find.text('91 repas'), findsOneWidget);
      });

      testWidgets('retrait contesté : détail et formulaire $t', (tester) async {
        _ecran320(tester, hauteur: 1200);
        final api = _FausseContestation();
        await tester.pumpWidget(_app(
            RetraitDetailScreen(commandeId: 4188, service: api),
            sombre: sombre));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('Retrait du 17/11'), findsOneWidget);
        expect(find.text('Validé par'), findsOneWidget);
        expect(find.text("KONAN Serge (Traiteur Délices d'Abidjan)"),
            findsOneWidget);

        await tester.tap(find.text("Je n'ai pas retiré ce repas"));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        // Sans raison : refusé
        await tester.tap(find.text('Envoyer la contestation'));
        await tester.pumpAndSettle();
        expect(find.text('Choisissez une raison.'), findsOneWidget);
        // « Autre raison » sans commentaire : refusé
        await tester.tap(find.text('Autre raison'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Envoyer la contestation'));
        await tester.pumpAndSettle();
        expect(find.text('Précisez la raison de votre contestation.'),
            findsOneWidget);
        expect(api.envois, isEmpty);
        await tester.enterText(
            find.byType(TextField).last, "Je n'étais pas au bureau");
        await tester.tap(find.text('Envoyer la contestation'));
        await tester.pumpAndSettle();
        expect(api.envois, [('autre', "Je n'étais pas au bureau")]);
        expect(find.text('Contestation envoyée'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });

      testWidgets('suivi d\'une contestation rejetée $t', (tester) async {
        _ecran320(tester, hauteur: 1000);
        await tester.pumpWidget(_app(
            Scaffold(
                body: DetailRetraitCorps(
                    detail: DetailRetraitCommande.fromJson(
                        _detailRetrait(contestation: _contestationRejetee)))),
            sombre: sombre));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('Contestation rejetée'), findsOneWidget);
        expect(find.textContaining('Réponse : Votre badge'), findsOneWidget);
        expect(find.text("Je n'ai pas retiré ce repas"), findsNothing);
      });

      testWidgets('ligne retrait et compteurs $t', (tester) async {
        _ecran320(tester, hauteur: 600);
        await tester.pumpWidget(_app(
            Scaffold(
              body: Column(children: [
                const EnTeteMarine(
                    titre: 'Comptoir · Agence Plateau Centre',
                    bas: CompteursService(
                        servis: 1041, aServir: 1023, commandes: 2064)),
                LigneRetraitComptoir(
                    retrait: RetraitComptoir.fromJson(_retrait()),
                    onAnnuler: () {}),
                const AlerteDejaRetire(message: _message409),
              ]),
            ),
            sombre: sombre));
        await tester.pump();
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      });
    }
  });

  group('Navigation de l\'espace prestataire', () {
    for (final (role, onglets) in [
      ('agent_comptoir', ['Comptoir', 'Liste du jour', 'Profil']),
      ('prestataire', ['Accueil', 'Comptoir', 'Liste du jour', 'Profil']),
    ]) {
      testWidgets('onglets $role (pas d\'écran employé)', (tester) async {
        _ecran320(tester, hauteur: 900);
        final commandes = CommandeProvider();
        final allergies = AllergieProvider();
        final auth = AuthProvider()
          ..utilisateurPourTest = AuthUser.fromJson({
            'id': 190,
            'username': 'UBI-P-0007',
            'nom': "N'GUESSAN",
            'prenom': 'Aya',
            'groups': [],
            'roles': [role],
            'prestataire': 2,
            'prestataire_libelle': "Traiteur Délices d'Abidjan",
          });
        await tester
            .pumpWidget(_app(const MainShell(), sombre: false, providers: [
          ChangeNotifierProvider<AuthProvider>.value(value: auth),
          ChangeNotifierProvider<ThemeProvider>(create: (_) => ThemeProvider()),
          ChangeNotifierProvider<CommandeProvider>.value(value: commandes),
          ChangeNotifierProvider<FacturationProvider>(
              create: (_) => FacturationProvider()),
          ChangeNotifierProvider<AllergieProvider>.value(value: allergies),
        ]));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        for (final o in onglets) {
          expect(find.text(o), findsWidgets);
        }
        for (final absent in ['Menu', 'Commandes', 'Factures', 'Gestion']) {
          expect(find.text(absent), findsNothing);
        }
        // Aucune route employé appelée (403 pour un compte prestataire)
        expect(commandes.listLoading || commandes.listError != null, isFalse);
        expect(allergies.loading || allergies.error != null, isFalse);
        // Profil : ni badge QR ni allergies
        await tester.tap(find.text('Profil').last);
        await tester.pumpAndSettle();
        expect(find.text('Mon badge QR'), findsNothing);
        expect(find.text('Mes allergies'), findsNothing);
        expect(find.textContaining("Traiteur Délices d'Abidjan"), findsWidgets);
        await tester.pumpWidget(const SizedBox());
      });
    }
  });

  group('Accueil du responsable : employés d\'autres agences', () {
    testWidgets('« dont N autres agences » sous les chiffres du service',
        (tester) async {
      final service = ServiceAgencePrestataire.fromJson({
        'agence_id': 4,
        'agence_nom': 'Siège',
        'heure_debut_service': '18:00',
        'heure_fin_service': '20:30',
        'commandees': 12,
        'servies': 5,
        'a_servir': 7,
        'externes': 3,
        'plats': [],
      });
      expect(service.externes, 3);
      await tester.pumpWidget(MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(body: CarteServiceAgence(service: service))));
      expect(
          find.text(
              '5 servis · 7 à servir · 12 commandés · dont 3 autres agences'),
          findsOneWidget);
      expect(find.text('18:00 – 20:30'), findsOneWidget);
      // Aucun employé d'une autre agence : rien de plus
      await tester.pumpWidget(MaterialApp(
          home: Scaffold(
              body: CarteServiceAgence(
                  service: ServiceAgencePrestataire.fromJson({
        'agence_id': 4,
        'agence_nom': 'Siège',
        'commandees': 1
      })))));
      expect(find.textContaining('autres agences'), findsNothing);
    });
  });
}
