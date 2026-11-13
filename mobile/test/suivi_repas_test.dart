// Suivi des repas : modèles (accueil, services du prestataire, préférences),
// frise, blocs du prestataire (étape suivante, incident), écran des
// notifications du suivi — sans débordement sur 320 px.

import 'package:cantine_app/core/services/suivi_service.dart';
import 'package:cantine_app/features/suivi/suivi_widgets.dart';
import 'package:cantine_app/shared/models/models.dart';
import 'package:cantine_app/shared/models/suivi_models.dart';
import 'package:cantine_app/shared/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _etape(String code, String libelle, String statut,
        {String? heure, String? prevu, bool auto = false}) =>
    {
      'code': code,
      'libelle': libelle,
      'statut': statut,
      'heure': heure,
      'prevu': prevu,
      'auto': auto,
      'par': null
    };

Map<String, dynamic> _service(
        {String statut = 'en_route',
        String? prochaine = 'arrive',
        bool arrive = false}) =>
    {
      'menu_id': 7,
      'date_menu': '2099-11-16',
      'agence_id': 2,
      'agence': 'Yopougon',
      'equipe': 'Jour',
      'prestataire': 'Maquis Le Bon Goût',
      'nb_repas': 46,
      'nb_retires': 0,
      'etapes': [
        _etape('preparation', 'Préparation', 'fait',
            heure: '10:05', auto: true),
        _etape('en_route', 'En route', 'fait', heure: '11:10'),
        _etape('arrive', 'Arrivé', arrive ? 'fait' : 'en_cours',
            heure: arrive ? '11:42' : null, prevu: arrive ? null : '11:30'),
      ],
      'etape_courante': 'arrive',
      'prochaine_action': prochaine,
      'statut': statut,
      'statut_libelle': arrive ? 'À retirer' : 'En route',
      'message': 'Le repas est en route',
      'incident': null,
      'heure_debut': '11:30',
      'heure_fin': '14:00',
      'retrait_lendemain': false,
    };

class _FauxSuivi extends SuiviService {
  final appels = <String>[];
  bool rappel = true;

  @override
  Future<ServicesSuivi> services() async {
    appels.add('services');
    return ServicesSuivi.fromJson({
      'services': [_service()],
      'reglages': {'incidents_actif': true}
    });
  }

  @override
  Future<(SuiviRepas, int)> declarer(int menuId, String etape) async {
    appels.add('declarer:$menuId:$etape');
    return (
      SuiviRepas.fromJson(
          _service(statut: 'arrive', prochaine: null, arrive: true)),
      46
    );
  }

  @override
  Future<(SuiviRepas, int)> incident(int menuId,
      {required String type, String? heure, String message = ''}) async {
    appels.add('incident:$menuId:$type:$heure:$message');
    return (
      SuiviRepas.fromJson({
        ..._service(statut: 'retard'),
        'incident': {
          'type': 'retard',
          'type_libelle': 'Retard',
          'heure_prevue': heure,
          'message': message,
          'heure': '11:20'
        }
      }),
      46
    );
  }

  PreferencesSuivi _prefs() => PreferencesSuivi.fromJson({
        'modifiable': true,
        'rappel_minutes': 30,
        'arrive_actif': true,
        'preferences': [
          {'code': 'preparation', 'disponible': false, 'actif': true},
          {'code': 'en_route', 'disponible': true, 'actif': true},
          {'code': 'rappel', 'disponible': true, 'actif': rappel},
          {'code': 'incidents', 'disponible': true, 'actif': true},
        ]
      });

  @override
  Future<PreferencesSuivi> preferences() async => _prefs();

  @override
  Future<PreferencesSuivi> modifierPreference(String code, bool actif) async {
    appels.add('pref:$code:$actif');
    if (code == 'rappel') rappel = actif;
    return _prefs();
  }
}

Future<void> _ouvrir(WidgetTester tester, Widget w,
    {double largeur = 390}) async {
  tester.view.physicalSize = Size(largeur, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(theme: AppTheme.light(), home: w));
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  group('Modèles', () {
    test('accueil : suivi du repas du jour', () {
      final a = Accueil.fromJson({
        'date': '2099-11-16',
        'semaine': [],
        'mois': {},
        'recentes': [],
        'suivi': {
          ..._service(statut: 'retard'),
          'commande_id': 12,
          'plat': 'Garba',
          'incident': {
            'type': 'retard',
            'type_libelle': 'Retard',
            'heure_prevue': '12:45',
            'message': 'Embouteillage',
            'heure': '11:20'
          }
        },
      });
      expect(a.suivi!.commandeId, 12);
      expect(a.suivi!.enRetard, isTrue);
      expect(a.suivi!.incident!.heurePrevue, '12:45');
      expect(a.suivi!.etapes.map((e) => e.statut),
          [StatutEtape.fait, StatutEtape.fait, StatutEtape.enCours]);
      expect(
          Accueil.fromJson({'semaine': [], 'mois': {}, 'recentes': []}).suivi,
          isNull);
    });

    test('services du prestataire : à servir, prochaine action', () {
      final s = ServicesSuivi.fromJson({
        'services': [_service()],
        'reglages': {'incidents_actif': false}
      });
      expect(s.incidentsActif, isFalse);
      expect((s.services.first.aServir, s.services.first.prochaineAction),
          (46, 'arrive'));
    });
  });

  testWidgets('frise sur la carte de l\'accueil (fond coloré)', (tester) async {
    final s = SuiviRepas.fromJson(_service());
    await _ouvrir(
        tester,
        Scaffold(
            body: Container(
                color: const Color(0xFF15803D),
                padding: const EdgeInsets.all(10),
                child: FriseSuivi(etapes: s.etapes, surFondColore: true))),
        largeur: 320);
    expect(find.byKey(const Key('etape-en_route-fait')), findsOneWidget);
    expect(find.byKey(const Key('etape-arrive-enCours')), findsOneWidget);
    expect(find.text('prévu 11:30'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  group('Prestataire : suivi des livraisons', () {
    testWidgets('étape suivante puis incident', (tester) async {
      final f = _FauxSuivi();
      await _ouvrir(
          tester,
          Scaffold(
              body: ListView(
                  children: [SuiviServicesPresta(service: f, agenceId: 2)])));
      expect(find.text('Suivi des livraisons'), findsOneWidget);
      expect(find.text('Yopougon · équipe Jour'), findsOneWidget);
      expect(find.textContaining('Arrivé au comptoir · prévient 46 employés'),
          findsOneWidget);
      // Incident : retard
      await tester.tap(find.byKey(const Key('suivi-incident-7')));
      await tester.pumpAndSettle();
      await tester.enterText(
          find.byKey(const Key('incident-message')), 'Embouteillage');
      await tester.tap(find.byKey(const Key('incident-envoyer')));
      await tester.pumpAndSettle();
      expect(f.appels.last, 'incident:7:retard:12:00:Embouteillage');
      expect(find.textContaining('arrivée prévue vers 12:00'), findsOneWidget);
      // Arrivé au comptoir
      await tester.tap(find.byKey(const Key('suivi-arrive-7')));
      await tester.pumpAndSettle();
      expect(f.appels.last, 'declarer:7:arrive');
      expect(find.text('À retirer'), findsOneWidget);
      expect(find.byKey(const Key('suivi-incident-7')), findsNothing);
    });

    testWidgets('autre agence : rien n\'est affiché', (tester) async {
      await _ouvrir(
          tester,
          Scaffold(
              body: ListView(children: [
            SuiviServicesPresta(service: _FauxSuivi(), agenceId: 9)
          ])));
      expect(find.text('Suivi des livraisons'), findsNothing);
    });

    testWidgets('pas de débordement sur 320 px', (tester) async {
      await _ouvrir(
          tester,
          Scaffold(
              body: ListView(
                  children: [SuiviServicesPresta(service: _FauxSuivi())])),
          largeur: 320);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('employé : notifications du suivi', (tester) async {
    final f = _FauxSuivi();
    await _ouvrir(tester, NotificationsSuiviScreen(service: f));
    expect(find.text('Notifications du suivi'), findsOneWidget);
    // Préparation : visible dans l'application seulement (pas de push) → désactivé
    final prep = tester
        .widget<SwitchListTile>(find.byKey(const Key('pref-preparation')));
    expect((prep.value, prep.onChanged), (false, null));
    // Repas arrivé : toujours envoyé
    expect(
        tester
            .widget<SwitchListTile>(find.byKey(const Key('pref-arrive')))
            .onChanged,
        isNull);
    expect(find.text('30 min avant'), findsOneWidget);
    await tester.tap(find.byKey(const Key('pref-rappel')));
    await tester.pumpAndSettle();
    expect(f.appels.last, 'pref:rappel:false');
    expect(
        tester
            .widget<SwitchListTile>(find.byKey(const Key('pref-rappel')))
            .value,
        isFalse);
  });
}
