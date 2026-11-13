// Parcours « Menus » : agence → prestataire → équipe → jour.
// Modèles des nouvelles routes (commander/…), page 1 (agences, cartes des
// prestataires, bandeau « mission »), page 2 (équipes), page 3 (jours,
// plats, réservation → feuille de paiement), lien de l'accueil — sans
// débordement sur 320 px, en clair et en sombre.

import 'dart:ui' show SemanticsFlag;

import 'package:cantine_app/core/services/parcours_service.dart';
import 'package:cantine_app/features/menu/menu_screen.dart';
import 'package:cantine_app/shared/models/compte_repas_models.dart';
import 'package:cantine_app/shared/models/models.dart';
import 'package:cantine_app/shared/models/parcours_models.dart';
import 'package:cantine_app/shared/providers/app_provider.dart';
import 'package:cantine_app/shared/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

// ── Données d'exemple (format de l'API, contrat « parcours de commande ») ──

/// Semaine affichée en page 3 (lointaine : délais et « non retiré » stables)
final _lundi = lundiSemaine(DateTime(2099, 11, 11));
DateTime _j(int i) => _lundi.add(Duration(days: i));
String _iso(int i) => isoJour(_j(i));
final _aujourdhui = DateTime(2099, 11, 7);

Map<String, dynamic> _agencesJson() => {
      'date': '2099-11-07',
      'mon_agence_id': 1,
      'agences': [
        {
          'id': 1,
          'nom': 'Siège Plateau',
          'code': 'SP',
          'mon_agence': true,
          'accepter_autres_agences': false,
          'nb_prestataires_aujourdhui': 1,
          'nb_prestataires_semaine': 3,
          'heure_debut_service': '11:30',
          'heure_fin_service': '14:30'
        },
        {
          'id': 2,
          'nom': 'Yopougon',
          'code': 'YOP',
          'mon_agence': false,
          'accepter_autres_agences': true,
          'nb_prestataires_aujourdhui': 0,
          'nb_prestataires_semaine': 1,
          'heure_debut_service': '12:00',
          'heure_fin_service': '14:00'
        },
      ],
    };

Map<String, dynamic> _prestaA() => {
      'id': 1,
      'libelle': 'Délices SARL',
      'nom_affiche': "Traiteur Délices d'Abidjan",
      'cantine_ubipharm': false,
      'logo_url': '/media/prestataires/logos/logo.png',
      'photo_couverture_url': '/media/prestataires/couvertures/couv.jpg',
      'photos_plats': ['/media/images_plats/garba.webp'],
      'description_courte': 'Cuisine ivoirienne maison : garba, tchep, alloco.',
      'cuisine': 'Ivoirienne',
      'tags': ['Grillades'],
      'note': 4.6,
      'nb_avis': 7,
      'nouveau': false,
      'nb_plats_jour': 3,
      'equipes': [
        {
          'id': 1,
          'libelle': 'Journée',
          'heure_debut_service': '11:30',
          'heure_fin_service': '14:30'
        },
        {
          'id': 2,
          'libelle': 'Nuit',
          'heure_debut_service': '11:30',
          'heure_fin_service': '14:30'
        },
      ],
      'commande_aujourdhui': true,
      'prochain_jour_a_reserver': {
        'date': _iso(2),
        'libelle': 'mercredi',
        'date_limite_commande': '${_iso(0)}T00:00:00+00:00',
        'libelle_limite': 'dimanche à minuit'
      },
    };

Map<String, dynamic> _prestaB() => {
      'id': 2,
      'libelle': 'Awa Restauration',
      'nom_affiche': 'Chez Tantie Awa',
      'logo_url': null,
      'photo_couverture_url': null,
      'photos_plats': [
        '/media/images_plats/foutou.webp',
        '/media/images_plats/tchep.webp'
      ],
      'description_courte': '',
      'cuisine': 'Maison',
      'tags': [],
      'note': 4.2,
      'nb_avis': 6,
      'nouveau': false,
      'nb_plats_jour': 0,
      'equipes': [
        {'id': 1, 'libelle': 'Journée'}
      ],
      'commande_aujourdhui': false,
      'prochain_jour_a_reserver': {
        'date': _iso(2),
        'libelle': 'mercredi 11/11'
      },
    };

Map<String, dynamic> _prestaC() => {
      'id': 3,
      'libelle': 'Placali Express',
      'nom_affiche': '',
      'logo_url': null,
      'photo_couverture_url': null,
      'photos_plats': [],
      'cuisine': '',
      'note': null,
      'nb_avis': 1,
      'nouveau': true,
      'nb_plats_jour': 1,
      'equipes': [],
      'commande_aujourdhui': false,
      'prochain_jour_a_reserver': null,
    };

Map<String, dynamic> _prestatairesJson(int agence) => {
      'agence': {
        'id': agence,
        'nom': agence == 1 ? 'Siège Plateau' : 'Yopougon',
        'code': agence == 1 ? 'SP' : 'YOP'
      },
      'date': '2099-11-07',
      'seuil_avis_note': 5,
      'prestataires':
          agence == 1 ? [_prestaA(), _prestaB(), _prestaC()] : [_prestaC()],
    };

Map<String, dynamic> _equipesJson() => {
      'agence': {'id': 1, 'nom': 'Siège Plateau'},
      'prestataire': {..._prestaA()}..remove('photos_plats'),
      'equipe_utilisateur': null,
      'equipes': [
        {
          'id': 1,
          'libelle': 'Journée',
          'mon_equipe': null,
          'heure_debut_service': '11:30',
          'heure_fin_service': '14:30',
          'jours': [for (var i = 0; i < 5; i++) _iso(i)],
          'nb_jours': 5,
          'prochain_menu': _iso(0)
        },
        {
          'id': 2,
          'libelle': 'Nuit',
          'mon_equipe': true,
          'heure_debut_service': '19:00',
          'heure_fin_service': '22:00',
          'jours': [_iso(0), _iso(2)],
          'nb_jours': 2,
          'prochain_menu': _iso(0)
        },
      ],
    };

Map<String, dynamic> _plat(int id, String nom, int jour, String statut,
        {double? note, bool nouveau = true, String? photo}) =>
    {
      'id': id,
      'nom': nom,
      'description': '',
      'type_plat_id': 1,
      'type_plat': 'Plat principal',
      'mentions': [],
      'photo_url': photo,
      'photos': [if (photo != null) photo],
      'note': note,
      'nb_avis': note == null ? 2 : 7,
      'nouveau': nouveau,
      'prix': 1000.0,
      'menu_id': 40 + jour,
      'typeequipe_id': 1,
      'typeequipe': 'Journée',
      'statut': statut,
      'commande_id': statut == 'commande' ? 17 : null,
    };

List<Map<String, dynamic>> _plats(int jour, List<String> statuts) => [
      _plat(1, 'Garba thon frit', jour, statuts[0],
          note: 4.6, nouveau: false, photo: '/media/images_plats/garba.webp'),
      _plat(2, 'Tchep au poulet', jour, statuts[1],
          photo: '/media/images_plats/tchep.webp'),
      _plat(3, 'Alloco poulet braisé', jour, statuts[2]),
    ];

Map<String, dynamic> _jour(int i, String etat,
        {Map<String, dynamic>? commande, List<String>? statuts}) =>
    {
      'date': _iso(i),
      'libelle': DateFormat('EEEE dd/MM', 'fr_FR').format(_j(i)),
      'etat': etat,
      'date_limite_commande': '${_iso(i)}T00:00:00+00:00',
      'libelle_limite': 'la veille à minuit',
      'menus': etat == 'pas_de_menu'
          ? []
          : [
              {'id': 40 + i, 'typeequipe_id': 1, 'typeequipe': 'Journée'}
            ],
      'commande': commande,
      'plats': etat == 'pas_de_menu'
          ? []
          : _plats(i, statuts ?? ['disponible', 'disponible', 'disponible']),
    };

Map<String, dynamic> _joursJson() => {
      'agence': {'id': 1, 'nom': 'Siège Plateau'},
      'prestataire': {..._prestaA()}..remove('photos_plats'),
      'equipe': {'id': 1, 'libelle': 'Journée'},
      'semaine': {
        'debut': _iso(0),
        'fin': _iso(6),
        'precedente': _iso(-7),
        'suivante': _iso(7)
      },
      'aujourdhui': '2099-11-07',
      'jour_par_defaut': _iso(2),
      'mode_paiement_prefere': 'compte',
      'jours': [
        _jour(0, 'ferme', statuts: ['ferme', 'ferme', 'ferme']),
        _jour(1, 'reserve', commande: {
          'id': 16,
          'statut': 'en_attente',
          'plat_id': 5,
          'plat': 'Riz sauce arachide',
          'menu_id': 29,
          'date_menu': _iso(1),
          'agence_id': 1,
          'agence': 'Siège Plateau',
          'prestataire_id': 2,
          'prestataire': 'Chez Tantie Awa',
          'typeequipe_id': 1,
          'mode_paiement': 'compte',
          'ici': false
        }, statuts: [
          'autre_plat_commande',
          'autre_plat_commande',
          'autre_plat_commande'
        ]),
        _jour(2, 'a_reserver'),
        _jour(3, 'reserve', commande: {
          'id': 17,
          'statut': 'en_attente',
          'plat_id': 2,
          'plat': 'Tchep au poulet',
          'menu_id': 43,
          'date_menu': _iso(3),
          'agence_id': 1,
          'agence': 'Siège Plateau',
          'prestataire_id': 1,
          'prestataire': "Traiteur Délices d'Abidjan",
          'typeequipe_id': 1,
          'mode_paiement': 'retenue',
          'ici': true
        }, statuts: [
          'autre_plat_commande',
          'commande',
          'autre_plat_commande'
        ]),
        _jour(4, 'a_reserver'),
        _jour(5, 'pas_de_menu'),
        _jour(6, 'pas_de_menu'),
      ],
    };

Map<String, dynamic> _menuJson(int jour) => {
      'id': 40 + jour,
      'date_menu': _iso(jour),
      'agence_id': 1,
      'agence_nom': 'Siège Plateau',
      'typeequipe_id': 1,
      'typeequipe_libelle': 'Journée',
      'prestataire': 1,
      'prestataire_nom': "Traiteur Délices d'Abidjan",
      'menu_plats': [
        {
          'id': 1,
          'plat': {'id': 2, 'nom': 'Tchep au poulet', 'images': []}
        }
      ],
      'date_limite_commande': '${_iso(jour)}T00:00:00Z',
      'date_limite_annulation': '${_iso(jour)}T00:00:00Z',
    };

/// Commande du jeudi (ici) : retenue sur salaire, mode modifiable
Commande _commandeJeudi() => Commande.fromJson({
      'id': 17,
      'statut': 'en_attente',
      'date_commande': '2099-11-01T09:00:00Z',
      'plat_detail': {'id': 2, 'nom': 'Tchep au poulet', 'images': []},
      'menu_detail': _menuJson(3),
      'user_nom': 'KOUASSI Awa',
      'mode_paiement': 'retenue',
      'mode_paiement_modifiable': true,
      'mode_paiement_limite': '${_iso(3)}T00:00:00Z',
    });

// ── Faux services ────────────────────────────────────────────────────────

class _FauxParcours extends ParcoursService {
  final appels = <String>[];

  @override
  Future<AgencesCommande> agences() async {
    appels.add('agences');
    return AgencesCommande.fromJson(_agencesJson());
  }

  @override
  Future<PrestatairesAgence> prestataires(int agenceId,
      {DateTime? date}) async {
    appels.add('prestataires:$agenceId');
    return PrestatairesAgence.fromJson(_prestatairesJson(agenceId));
  }

  @override
  Future<EquipesPrestataire> equipes(int prestataireId, int agenceId) async {
    appels.add('equipes:$prestataireId:$agenceId');
    return EquipesPrestataire.fromJson(_equipesJson());
  }

  @override
  Future<JoursCommande> jours(
      {required int agenceId,
      required int prestataireId,
      int? equipeId,
      DateTime? semaine}) async {
    appels.add('jours:$agenceId:$prestataireId:$equipeId:'
        '${semaine == null ? '' : isoJour(semaine)}');
    return JoursCommande.fromJson(_joursJson());
  }

  @override
  Future<Menu> menu(int id) async {
    appels.add('menu:$id');
    return Menu.fromJson(_menuJson(id - 40));
  }

  @override
  Future<InfoPaiement> infoPaiement(int menuId) async => InfoPaiement.fromJson({
        'date_menu': _iso(2),
        'solde': 5000.0,
        'prix': 1000.0,
        'sans_tarif': false,
        'compte_possible': true,
        'mode_paiement_prefere': 'compte',
        'mode_par_defaut': 'compte',
      });
}

class _Commandes extends CommandeProvider {
  List<Commande> liste;
  final commandes = <(int, int, String?)>[];
  _Commandes(this.liste);

  @override
  List<Commande> get mesCommandes => liste;

  @override
  Future<void> loadMesCommandes() async {}

  @override
  Future<bool> commander(
      {required int menuId, required int platId, String? modePaiement}) async {
    commandes.add((menuId, platId, modePaiement));
    return true;
  }
}

class _Facturation extends FacturationProvider {
  @override
  Future<void> charger() async {}
}

/// Équipe Nuit « sur planning » : l'employé y est programmé (badge) ; jeudi
/// non programmé dans l'équipe choisie
class _FauxPlanning extends _FauxParcours {
  @override
  Future<EquipesPrestataire> equipes(int prestataireId, int agenceId) async {
    appels.add('equipes:$prestataireId:$agenceId');
    final j = _equipesJson();
    final equipes = (j['equipes'] as List).cast<Map<String, dynamic>>();
    equipes[1] = {
      ...equipes[1],
      'heure_debut_service': '22:00',
      'heure_fin_service': '01:00',
      'sur_planning': true,
      'programmation': {
        'du': _iso(0),
        'au': _iso(4),
        'jours': [0, 1, 2, 3, 4],
        'libelle': 'Programmé(e) du 09/11 au 13/11/2099'
      },
    };
    return EquipesPrestataire.fromJson(j);
  }

  @override
  Future<JoursCommande> jours(
      {required int agenceId,
      required int prestataireId,
      int? equipeId,
      DateTime? semaine}) async {
    appels.add('jours:$agenceId:$prestataireId:$equipeId:'
        '${semaine == null ? '' : isoJour(semaine)}');
    final j = _joursJson();
    final jours = (j['jours'] as List).cast<Map<String, dynamic>>();
    jours[4] = {
      ..._jour(4, 'non_programme'),
      'plats': [],
      'motif_indisponible':
          "Vous n'êtes pas programmé(e) dans l'équipe Nuit le ven. 13/11."
    };
    j['jour_par_defaut'] = _iso(4);
    return JoursCommande.fromJson(j);
  }
}

Future<_FauxParcours> _ouvrir(WidgetTester tester,
    {bool sombre = false,
    double largeur = 390,
    _Commandes? commandes,
    _FauxParcours? service,
    DateTime Function()? maintenant}) async {
  tester.view.physicalSize = Size(largeur, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final s = service ?? _FauxParcours();
  await tester.pumpWidget(MultiProvider(
    providers: [
      ChangeNotifierProvider<CommandeProvider>(
          create: (_) => commandes ?? _Commandes([_commandeJeudi()])),
      ChangeNotifierProvider<FacturationProvider>(
          create: (_) => _Facturation()),
    ],
    child: MaterialApp(
      theme: sombre ? AppTheme.dark() : AppTheme.light(),
      home: MenuScreen(service: s, maintenant: maintenant ?? () => _aujourdhui),
    ),
  ));
  await _attendre(tester);
  return s;
}

/// Chargements (faux services immédiats) sans attendre les squelettes
Future<void> _attendre(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

Future<void> _tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pump();
  await tester.tap(f);
  await _attendre(tester);
}

void main() {
  setUpAll(() => initializeDateFormatting('fr_FR'));
  tearDown(() => menuDemande.value = null);

  group('Modèles du parcours', () {
    test('agences : la mienne, code, compteurs', () {
      final a = AgencesCommande.fromJson(_agencesJson());
      expect(a.monAgenceId, 1);
      expect(a.agences.map((e) => e.nom), ['Siège Plateau', 'Yopougon']);
      expect(a.monAgence!.code, 'SP');
      expect(a.agences[1].accepterAutresAgences, isTrue);
      expect(a.agences[1].nbPrestatairesSemaine, 1);
      // Employé sans agence
      final sans =
          AgencesCommande.fromJson({'mon_agence_id': null, 'agences': []});
      expect(sans.monAgence, isNull);
    });

    test('prestataires : note ou « Nouveau », couverture, URL absolues', () {
      final p = PrestatairesAgence.fromJson(_prestatairesJson(1));
      expect(p.agenceNom, 'Siège Plateau');
      expect(p.seuilAvisNote, 5);
      final a = p.prestataires[0];
      expect(a.nomAffiche, "Traiteur Délices d'Abidjan");
      expect((a.note, a.nbAvis, a.aUneNote), (4.6, 7, true));
      expect(a.logoUrl, endsWith('/media/prestataires/logos/logo.png'));
      expect(a.logoUrl, startsWith('http'));
      expect(a.photoCouvertureUrl, isNotNull);
      expect(a.equipes.map((e) => e.libelle), ['Journée', 'Nuit']);
      expect(a.commandeAujourdhui, isTrue);
      expect(a.prochainJourAReserver!.date, _j(2));
      final b = p.prestataires[1];
      expect(b.photoCouvertureUrl, isNull);
      expect(b.photosPlats, hasLength(2));
      final c = p.prestataires[2];
      // Nom affiché vide : libellé
      expect(c.nomAffiche, 'Placali Express');
      expect((c.note, c.nouveau, c.aUneNote), (null, true, false));
      expect(c.prochainJourAReserver, isNull);
      // Cantine UbiPharm (id 0)
      final cantine = PrestataireCommande.fromJson({
        'id': 0,
        'nom_affiche': 'Cantine UbiPharm',
        'cantine_ubipharm': true,
        'note': null,
        'nb_avis': 2,
      });
      expect((cantine.id, cantine.cantineUbipharm, cantine.nouveau),
          (0, true, true));
    });

    test('équipes : mon équipe inconnue, jours', () {
      final e = EquipesPrestataire.fromJson(_equipesJson());
      expect(e.prestataire!.nomAffiche, "Traiteur Délices d'Abidjan");
      expect(e.equipes[0].monEquipe, isNull);
      expect(e.equipes[1].monEquipe, isTrue);
      expect(e.equipes[0].jours, hasLength(5));
      expect(e.equipes[0].prochainMenu, _j(0));
      expect(e.equipes[1].heureDebutService, '19:00');
    });

    test('jours : états, commande ici / ailleurs, statuts des plats', () {
      final d = JoursCommande.fromJson(_joursJson());
      expect(d.debut, _j(0));
      expect(d.fin, _j(6));
      expect(d.suivante, _j(7));
      expect(d.jourParDefaut, _j(2));
      expect(d.equipeLibelle, 'Journée');
      expect(d.jours.map((j) => j.etat), [
        EtatJour.ferme,
        EtatJour.reserve,
        EtatJour.aReserver,
        EtatJour.reserve,
        EtatJour.aReserver,
        EtatJour.pasDeMenu,
        EtatJour.pasDeMenu,
      ]);
      final mardi = d.jour(_j(1))!;
      expect(mardi.commande!.ici, isFalse);
      expect(mardi.commande!.prestataire, 'Chez Tantie Awa');
      expect(mardi.plats.first.statut, StatutPlatJour.autrePlatCommande);
      final jeudi = d.jour(_j(3))!;
      expect(jeudi.commande!.ici, isTrue);
      expect(jeudi.plats[1].statut, StatutPlatJour.commande);
      expect(jeudi.plats[1].commandeId, 17);
      final garba = d.jour(_j(2))!.plats.first;
      expect((garba.prix, garba.aUneNote, garba.menuId), (1000.0, true, 42));
      expect(garba.photoUrl, endsWith('garba.webp'));
      // Au format des écrans existants (fiche du plat)
      final plat = garba.versPlat();
      expect(plat.imageUrl, garba.photoUrl);
      expect((plat.noteMoyenne, plat.nbAvis), (4.6, 7));
      expect(d.jour(_j(2))!.plats[1].versPlat().noteMoyenne, isNull);
      expect(EtatJour.depuis('inconnu'), EtatJour.pasDeMenu);
      expect(StatutPlatJour.depuis(null), StatutPlatJour.disponible);
    });

    test('menu : prestataire et nom affiché', () {
      final m = Menu.fromJson(_menuJson(3));
      expect((m.prestataireId, m.prestataireNom),
          (1, "Traiteur Délices d'Abidjan"));
      final ancien = Menu.fromJson({'id': 1, 'prestataire': null});
      expect((ancien.prestataireId, ancien.prestataireNom), (null, null));
      expect(lundiSemaine(DateTime(2026, 11, 7)), DateTime(2026, 11, 2));
      expect(isoJour(DateTime(2026, 1, 5)), '2026-01-05');
    });
  });

  group('Page 1 : agences et prestataires', () {
    testWidgets('mon agence par défaut, note / Nouveau, couvertures',
        (tester) async {
      final s = await _ouvrir(tester);
      expect(find.text('Menus'), findsOneWidget);
      expect(find.text("Où mangez-vous aujourd'hui ?"), findsOneWidget);
      expect(s.appels, ['agences', 'prestataires:1']);
      // Mon agence sélectionnée, avec l'épingle ; pas de bandeau « mission »
      expect(find.byKey(const Key('epingle-mon-agence')), findsOneWidget);
      expect(
          tester
              .getSemantics(find.byKey(const Key('agence-1')))
              .hasFlag(SemanticsFlag.isSelected),
          isTrue);
      expect(find.byKey(const Key('bandeau-mission')), findsNothing);
      expect(find.text('3 prestataires à Siège Plateau'), findsOneWidget);
      // Note (assez d'avis) ou « Nouveau »
      expect(find.text('4,6'), findsOneWidget);
      expect(find.text('(7)'), findsOneWidget);
      expect(find.text('Nouveau'), findsOneWidget);
      // Couverture : photo, assemblage des plats, fond de l'application
      expect(find.byKey(const Key('couverture-photo')), findsOneWidget);
      expect(find.byKey(const Key('couverture-collage')), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('presta-3')));
      await tester.pump();
      expect(
          find.descendant(
              of: find.byKey(const Key('presta-3')),
              matching: find.byKey(const Key('couverture-vide'))),
          findsOneWidget);
      // Ligne d'information, équipes, badge
      expect(find.text("3 plats aujourd'hui · Cuisine ivoirienne"),
          findsOneWidget);
      expect(find.text('Journée, Nuit'), findsOneWidget);
      expect(find.text("Commandé aujourd'hui"), findsOneWidget);
      expect(find.text('Prochain menu mercredi 11/11 · Cuisine maison'),
          findsOneWidget);
      // Initiales sans logo
      expect(find.text('CT'), findsOneWidget);
    });

    testWidgets('autre agence : liste, bandeau « mission », Mon agence',
        (tester) async {
      final s = await _ouvrir(tester);
      await _tap(tester, find.byKey(const Key('agence-2')));
      expect(s.appels.last, 'prestataires:2');
      expect(find.byKey(const Key('bandeau-mission')), findsOneWidget);
      expect(find.textContaining('Yopougon', findRichText: true), findsWidgets);
      expect(find.text('1 prestataire à Yopougon'), findsOneWidget);
      expect(find.byKey(const Key('presta-1')), findsNothing);
      await _tap(tester, find.byKey(const Key('lien-mon-agence')));
      expect(find.byKey(const Key('bandeau-mission')), findsNothing);
      expect(find.text('3 prestataires à Siège Plateau'), findsOneWidget);
      // Liste déjà chargée : pas de nouvel appel
      expect(s.appels.where((a) => a == 'prestataires:1'), hasLength(1));
    });

    testWidgets(
        "le choix de l'agence est gardé, puis oublié la semaine suivante",
        (tester) async {
      var maintenant = _aujourdhui;
      final s = _FauxParcours();
      await _ouvrir(tester, service: s, maintenant: () => maintenant);
      await _tap(tester, find.byKey(const Key('agence-2')));
      // Page 2 puis retour : toujours Yopougon
      await _tap(tester, find.byKey(const Key('presta-3')));
      expect(find.text('Choisissez votre équipe'), findsOneWidget);
      await _tap(
          tester, find.byKey(const Key('retour-parcours')).hitTestable());
      expect(find.byKey(const Key('bandeau-mission')), findsOneWidget);
      // Semaine suivante : retour à mon agence
      maintenant = _aujourdhui.add(const Duration(days: 7));
      await tester.pumpWidget(MultiProvider(
        providers: [
          ChangeNotifierProvider<CommandeProvider>(
              create: (_) => _Commandes([])),
          ChangeNotifierProvider<FacturationProvider>(
              create: (_) => _Facturation()),
        ],
        child: MaterialApp(
            theme: AppTheme.light(),
            home: MenuScreen(service: s, maintenant: () => maintenant)),
      ));
      await _attendre(tester);
      expect(find.byKey(const Key('bandeau-mission')), findsNothing);
      expect(find.text('3 prestataires à Siège Plateau'), findsOneWidget);
    });
  });

  group('Page 2 : équipes', () {
    testWidgets('profil du prestataire et choix de l\'équipe', (tester) async {
      final s = await _ouvrir(tester);
      await _tap(tester, find.byKey(const Key('presta-1')));
      expect(s.appels.last, 'equipes:1:1');
      expect(find.byKey(const Key('nom-prestataire')), findsOneWidget);
      expect(find.text('Cuisine ivoirienne maison : garba, tchep, alloco.'),
          findsOneWidget);
      expect(find.text('· Siège Plateau'), findsOneWidget);
      expect(find.text('· 7 avis'), findsOneWidget);
      expect(find.text('Choisissez votre équipe'), findsOneWidget);
      expect(find.text('2 équipes'), findsOneWidget);
      expect(
          find.text('Retrait 11 h 30 – 14 h 30 · lun. → ven.'), findsOneWidget);
      expect(find.text('Retrait 19 h – 22 h · lun. et mer.'), findsOneWidget);
      // « Mon équipe » seulement si le serveur la donne
      expect(find.text('Mon équipe'), findsOneWidget);
      expect(
          find.descendant(
              of: find.byKey(const Key('equipe-2')),
              matching: find.text('Mon équipe')),
          findsOneWidget);
    });
  });

  group('Page 3 : jours et plats', () {
    testWidgets('jour par défaut, états des jours, autre commande',
        (tester) async {
      final s = await _ouvrir(tester);
      await _tap(tester, find.byKey(const Key('presta-1')));
      await _tap(tester, find.byKey(const Key('equipe-1')));
      expect(s.appels.last, 'jours:1:1:1:');
      expect(find.text('Équipe Journée · Siège Plateau'), findsOneWidget);
      // Ouvert sur le prochain jour à réserver (mercredi)
      final titre = DateFormat('EEEE d MMMM', 'fr_FR').format(_j(2));
      expect(find.text(titre[0].toUpperCase() + titre.substring(1)),
          findsOneWidget);
      expect(
          tester
              .getSemantics(find.byKey(Key('jour-${_iso(2)}')))
              .hasFlag(SemanticsFlag.isSelected),
          isTrue);
      // Samedi / dimanche sans menu masqués ; états et légende
      expect(find.byKey(Key('jour-${_iso(5)}')), findsNothing);
      expect(find.text('Réservé'), findsNWidgets(2));
      expect(find.text('À réserver'), findsNWidgets(2));
      expect(find.text('Fermé'), findsOneWidget);
      expect(find.text('fermé (délai passé ou pas de menu)'), findsOneWidget);
      // Plats : note / Nouveau, prix, Réserver
      expect(find.text('Garba thon frit'), findsOneWidget);
      expect(find.text('Nouveau'), findsNWidgets(2));
      expect(find.byKey(const Key('reserver-1')), findsOneWidget);
      expect(
          find.byWidgetPredicate((w) =>
              w is Text && RegExp(r'^1\s000\sF$').hasMatch(w.data ?? '')),
          findsNWidgets(3));
      // Mardi : repas déjà commandé chez un autre prestataire
      await _tap(tester, find.byKey(Key('jour-${_iso(1)}')));
      expect(find.byKey(const Key('bandeau-autre-commande')), findsOneWidget);
      expect(find.textContaining('(Chez Tantie Awa · Siège Plateau)'),
          findsOneWidget);
      expect(find.text('Autre plat\ncommandé'), findsNWidgets(3));
      expect(find.byKey(const Key('reserver-1')), findsNothing);
      // Lundi : fermé
      await _tap(tester, find.byKey(Key('jour-${_iso(0)}')));
      expect(find.text('Commandes fermées pour ce jour'), findsOneWidget);
      // Semaine suivante
      await _tap(tester, find.byKey(const Key('semaine-suivante')));
      expect(s.appels.last, 'jours:1:1:1:${_iso(7)}');
    });

    testWidgets('plat commandé ici : mode de paiement, changer, annuler',
        (tester) async {
      await _ouvrir(tester);
      await _tap(tester, find.byKey(const Key('presta-1')));
      await _tap(tester, find.byKey(const Key('equipe-1')));
      await _tap(tester, find.byKey(Key('jour-${_iso(3)}')));
      expect(find.byKey(const Key('mode-votre-repas')), findsOneWidget);
      expect(find.text('Retenue sur salaire'), findsOneWidget);
      expect(find.byKey(const Key('changer-mode-votre-repas')), findsOneWidget);
      expect(find.text('Annuler'), findsOneWidget);
      expect(find.text('Commandé'), findsOneWidget);
    });

    testWidgets(
        'Réserver → feuille de paiement « Plat · Prestataire » → commande',
        (tester) async {
      final cmds = _Commandes([_commandeJeudi()]);
      await _ouvrir(tester, commandes: cmds);
      await _tap(tester, find.byKey(const Key('presta-1')));
      await _tap(tester, find.byKey(const Key('equipe-1')));
      await _tap(tester, find.byKey(const Key('reserver-1')));
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.text('Comment payer ce repas ?'), findsOneWidget);
      expect(
          find.textContaining("Garba thon frit · Traiteur Délices d'Abidjan"),
          findsOneWidget);
      expect(find.text('Réserver et payer par le compte'), findsOneWidget);
      await tester.tap(find.byKey(const Key('confirmer-paiement')));
      await tester.pump(const Duration(milliseconds: 500));
      await _attendre(tester);
      expect(cmds.commandes, [(42, 1, 'compte')]);
      expect(find.textContaining('commande confirmée'), findsOneWidget);
    });

    testWidgets('un plat ouvre sa fiche détaillée', (tester) async {
      await _ouvrir(tester);
      await _tap(tester, find.byKey(const Key('presta-1')));
      await _tap(tester, find.byKey(const Key('equipe-1')));
      await tester.tap(find.text('Tchep au poulet'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('Réserver ce plat'), findsOneWidget);
    });
  });

  group('Planning des équipes (équipe de nuit)', () {
    test('modèles : programmation et jour non programmé', () async {
      final e = await _FauxPlanning().equipes(1, 1);
      expect(e.equipes[1].surPlanning, isTrue);
      expect(e.equipes[1].programmation, 'Programmé(e) du 09/11 au 13/11/2099');
      expect(e.equipes[0].surPlanning, isFalse);
      expect(e.equipes[0].programmation, isEmpty);
      final d = await _FauxPlanning().jours(agenceId: 1, prestataireId: 1);
      expect(d.jours[4].etat, EtatJour.nonProgramme);
      expect(d.jours[4].motifIndisponible, contains('pas programmé(e)'));
    });

    test(
        'repas de nuit de la veille : encore « du jour » avant la fin du retrait',
        () {
      final hier = DateTime.now().toUtc().subtract(const Duration(days: 1));
      Menu menu(DateTime? fin) => Menu.fromJson({
            'id': 1,
            'date_menu': isoJour(hier),
            'agence_id': 1,
            'agence_nom': 'Siège',
            'typeequipe_id': 2,
            'typeequipe_libelle': 'Nuit',
            'menu_plats': [],
            if (fin != null) 'fin_retrait': fin.toIso8601String(),
          });
      final dansUneHeure = DateTime.now().toUtc().add(const Duration(hours: 1));
      final ilYAUneHeure =
          DateTime.now().toUtc().subtract(const Duration(hours: 1));
      expect(menu(dansUneHeure).retraitEnCours, isTrue);
      expect(menu(ilYAUneHeure).retraitEnCours, isFalse);
      expect(menu(null).retraitEnCours, isFalse);
    });

    testWidgets('badge de programmation et jour « Non programmé »',
        (tester) async {
      await _ouvrir(tester, service: _FauxPlanning());
      await _tap(tester, find.byKey(const Key('presta-1')));
      expect(find.byKey(const Key('programmation-2')), findsOneWidget);
      expect(find.text('Programmé(e) du 09/11 au 13/11/2099'), findsOneWidget);
      expect(find.byKey(const Key('programmation-1')), findsNothing);
      // Retrait passant minuit
      expect(find.textContaining('Retrait 22 h – 1 h (lendemain)'),
          findsOneWidget);
      await _tap(tester, find.byKey(const Key('equipe-2')));
      await _tap(tester, find.byKey(Key('jour-${_iso(4)}')));
      expect(find.text('Non prog.'), findsOneWidget);
      expect(find.byKey(const Key('jour-non-programme')), findsOneWidget);
      expect(find.textContaining("pas programmé(e) dans l'équipe Nuit"),
          findsOneWidget);
      expect(find.byKey(const Key('reserver-1')), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('pas de débordement sur 320 px', (tester) async {
      await _ouvrir(tester, service: _FauxPlanning(), largeur: 320);
      await _tap(tester, find.byKey(const Key('presta-1')));
      expect(tester.takeException(), isNull);
      await _tap(tester, find.byKey(const Key('equipe-2')));
      await _tap(tester, find.byKey(Key('jour-${_iso(4)}')));
      expect(tester.takeException(), isNull);
    });
  });

  group("Lien de l'accueil", () {
    testWidgets('menu demandé : agence, prestataire, équipe et jour',
        (tester) async {
      menuDemande.value = CibleMenu(menuId: 44, date: _j(4));
      final s = await _ouvrir(tester, commandes: _Commandes([]));
      expect(s.appels, contains('menu:44'));
      expect(s.appels, contains('jours:1:1:1:${_iso(4)}'));
      expect(
          tester
              .getSemantics(find.byKey(Key('jour-${_iso(4)}')))
              .hasFlag(SemanticsFlag.isSelected),
          isTrue);
      // Retour : page 2 (équipes du prestataire), puis page 1
      await _tap(
          tester, find.byKey(const Key('retour-parcours')).hitTestable());
      expect(find.text('Choisissez votre équipe'), findsOneWidget);
      await _tap(
          tester, find.byKey(const Key('retour-parcours')).hitTestable());
      expect(find.text('3 prestataires à Siège Plateau'), findsOneWidget);
    });

    testWidgets('jour sans menu connu : première page', (tester) async {
      menuDemande.value = CibleMenu(date: _j(2));
      await _ouvrir(tester, commandes: _Commandes([]));
      expect(find.text('3 prestataires à Siège Plateau'), findsOneWidget);
    });
  });

  group('Pas de débordement sur 320 px', () {
    for (final sombre in [false, true]) {
      testWidgets('pages 1, 2 et 3 ${sombre ? '(sombre)' : '(clair)'}',
          (tester) async {
        await _ouvrir(tester, largeur: 320, sombre: sombre);
        expect(tester.takeException(), isNull);
        await _tap(tester, find.byKey(const Key('agence-2')));
        expect(tester.takeException(), isNull);
        await _tap(tester, find.byKey(const Key('lien-mon-agence')));
        await _tap(tester, find.byKey(const Key('presta-1')));
        expect(tester.takeException(), isNull);
        await _tap(tester, find.byKey(const Key('equipe-1')));
        expect(tester.takeException(), isNull);
        for (final i in [0, 1, 3]) {
          await _tap(tester, find.byKey(Key('jour-${_iso(i)}')));
          expect(tester.takeException(), isNull);
        }
      });
    }
  });

  // ── Finitions : équipe de l'employé, annulation, employé sans agence ──
  group('Finitions du parcours', () {
    test('modèles : agence non renseignée, mon équipe, annulation', () {
      final sans = AgencesCommande.fromJson({
        'mon_agence_id': null,
        'sans_agence': true,
        'equipe_utilisateur': {'id': 2, 'libelle': 'Nuit'},
        'agences': [],
      });
      expect((sans.sansAgence, sans.agenceNonRenseignee), (true, true));
      expect(sans.equipeUtilisateur!.libelle, 'Nuit');
      // Ancien serveur (sans « sans_agence ») : déduit de mon_agence_id
      final ancien = AgencesCommande.fromJson(_agencesJson());
      expect((ancien.sansAgence, ancien.agenceNonRenseignee), (false, false));
      // Prestataire : équipe de l'utilisateur
      final p = PrestataireCommande.fromJson({
        ..._prestaA(),
        'equipes': [
          {'id': 2, 'libelle': 'Nuit', 'mon_equipe': true},
          {'id': 1, 'libelle': 'Journée', 'mon_equipe': false},
        ],
      });
      expect(p.sertMonEquipe, isTrue);
      expect(PrestataireCommande.fromJson(_prestaA()).sertMonEquipe, isFalse);
      // Équipes : présélection (seule équipe, sinon la mienne)
      final e = EquipesPrestataire.fromJson({
        ..._equipesJson(),
        'equipe_utilisateur': {'id': 2, 'libelle': 'Nuit'}
      });
      expect(e.equipeUtilisateur!.id, 2);
      expect(e.equipeParDefaut!.id, 2);
      final aucune = EquipesPrestataire.fromJson({
        ..._equipesJson(),
        'equipes': [
          {'id': 1, 'libelle': 'Journée', 'mon_equipe': null},
          {'id': 3, 'libelle': 'Week-end', 'mon_equipe': null},
        ],
      });
      expect(aucune.equipeParDefaut, isNull);
      // Jour et plat : date limite d'annulation
      final j = JourCommande.fromJson({
        ..._jour(2, 'a_reserver'),
        'date_limite_annulation': '${_iso(0)}T00:00:00+00:00',
        'libelle_annulation': 'dimanche à minuit',
      });
      expect(j.dateLimiteAnnulation, DateTime.parse('${_iso(0)}T00:00:00Z'));
      expect(j.libelleAnnulation, 'dimanche à minuit');
      final pl = PlatJour.fromJson({
        ..._plat(1, 'Garba', 2, 'disponible'),
        'date_limite_annulation': '${_iso(1)}T10:00:00+00:00',
        'libelle_annulation': 'lundi à 10:00',
      });
      expect(pl.dateLimiteAnnulation, DateTime.parse('${_iso(1)}T10:00:00Z'));
      final jours = JoursCommande.fromJson({
        ..._joursJson(),
        'equipe': {'id': 2, 'libelle': 'Nuit', 'mon_equipe': true}
      });
      expect(jours.equipeMonEquipe, isTrue);
      expect(JoursCommande.fromJson(_joursJson()).equipeMonEquipe, isNull);
    });

    test('retrait, accueil : employé d\'une autre agence, sans agence', () {
      final r = RechercheParBadgeResult.fromJson({
        'user_id': 4,
        'user_nom': 'KONAN Yao',
        'badge': 'M3101',
        'a_retire': false,
        'externe': true,
        'agence_origine': 'Yopougon',
        'commandes': [],
      });
      expect((r.externe, r.agenceOrigine), (true, 'Yopougon'));
      final g = AccueilGestion.fromJson({
        'a_faire': [
          {'type': 'cloture', 'titre': '10/2099 non clôturé'},
          {
            'type': 'employes_sans_agence',
            'titre': '2 employés sans agence ne peuvent pas commander',
            'nb': 2
          },
          {'type': 'menu_manquant', 'titre': 'Pas de menu lundi'},
        ]
      });
      expect(g.alertes.map((a) => a.type),
          ['menu_manquant', 'employes_sans_agence']);
    });

    testWidgets('page 1 : agence non renseignée, aucune agence ouverte',
        (tester) async {
      await _ouvrir(tester, service: _FauxSansAgence(ouvertes: false));
      expect(find.byKey(const Key('agence-non-renseignee')), findsOneWidget);
      expect(
          find.text("Votre agence n'est pas renseignée — contactez votre "
              'gestionnaire'),
          findsOneWidget);
      expect(find.byKey(const Key('bandeau-sans-agence')), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('page 1 : sans agence, agences ouvertes : bandeau',
        (tester) async {
      await _ouvrir(tester, service: _FauxSansAgence(ouvertes: true));
      expect(find.byKey(const Key('agence-non-renseignee')), findsNothing);
      expect(find.byKey(const Key('bandeau-sans-agence')), findsOneWidget);
      expect(find.text('1 prestataire à Yopougon'), findsOneWidget);
    });

    testWidgets('page 2 : mon équipe en premier et présélectionnée',
        (tester) async {
      await _ouvrir(tester, service: _FauxMonEquipe());
      expect(find.textContaining('Nuit (mon équipe)'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('presta-1')));
      final nuit = tester.getTopLeft(find.byKey(const Key('equipe-2')));
      final journee = tester.getTopLeft(find.byKey(const Key('equipe-1')));
      expect(nuit.dy, lessThan(journee.dy));
      expect(
          find.descendant(
              of: find.byKey(const Key('equipe-2')),
              matching: find.text('Mon équipe')),
          findsOneWidget);
      // Il peut choisir une autre équipe
      await _tap(tester, find.byKey(const Key('equipe-1')));
      expect(find.text('Choisissez votre équipe'), findsNothing);
    });

    testWidgets('page 3 et fiche du plat : « Annulable jusqu\'au … »',
        (tester) async {
      await _ouvrir(tester, service: _FauxMonEquipe());
      await _tap(tester, find.byKey(const Key('presta-1')));
      await _tap(tester, find.byKey(const Key('equipe-2')));
      expect(find.text('Équipe Nuit (mon équipe) · Siège Plateau'),
          findsOneWidget);
      final texte = "Annulable jusqu'au "
          '${libelleDateLimite(DateTime.parse('${_iso(1)}T00:00:00Z'))}';
      expect(find.byKey(const Key('annulable-jusqua')), findsOneWidget);
      expect(find.text(texte), findsOneWidget);
      // Fiche du plat (avant de commander) : même date limite
      await _tap(tester, find.text('Garba thon frit'));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text(texte), findsNWidgets(2));
      expect(tester.takeException(), isNull);
    });
  });
}

/// Employé sans agence : agences ouvertes ou non
class _FauxSansAgence extends _FauxParcours {
  final bool ouvertes;
  _FauxSansAgence({required this.ouvertes});

  @override
  Future<AgencesCommande> agences() async {
    appels.add('agences');
    final yop = (_agencesJson()['agences'] as List)[1];
    return AgencesCommande.fromJson({
      'date': '2099-11-07',
      'mon_agence_id': null,
      'sans_agence': true,
      'equipe_utilisateur': null,
      'agences': ouvertes ? [yop] : [],
    });
  }
}

/// Employé de l'équipe « Nuit » : équipes (la sienne d'abord), jours avec la
/// date limite d'annulation
class _FauxMonEquipe extends _FauxParcours {
  @override
  Future<PrestatairesAgence> prestataires(int agenceId,
      {DateTime? date}) async {
    appels.add('prestataires:$agenceId');
    final j = _prestatairesJson(agenceId);
    final a = j['prestataires'][0] as Map<String, dynamic>;
    a['equipes'] = [
      {'id': 2, 'libelle': 'Nuit', 'mon_equipe': true},
      {'id': 1, 'libelle': 'Journée', 'mon_equipe': false},
    ];
    return PrestatairesAgence.fromJson(j);
  }

  @override
  Future<EquipesPrestataire> equipes(int prestataireId, int agenceId) async {
    appels.add('equipes:$prestataireId:$agenceId');
    final j = _equipesJson();
    final equipes = (j['equipes'] as List).cast<Map<String, dynamic>>();
    equipes[0]['mon_equipe'] = false;
    return EquipesPrestataire.fromJson({
      ...j,
      'equipe_utilisateur': {'id': 2, 'libelle': 'Nuit'},
      'equipes': equipes.reversed.toList(),
    });
  }

  @override
  Future<JoursCommande> jours(
      {required int agenceId,
      required int prestataireId,
      int? equipeId,
      DateTime? semaine}) async {
    appels.add('jours:$agenceId:$prestataireId:$equipeId');
    final j = _joursJson();
    j['equipe'] = {'id': 2, 'libelle': 'Nuit', 'mon_equipe': true};
    for (final jour in (j['jours'] as List).cast<Map<String, dynamic>>()) {
      final d = DateTime.parse(jour['date'] as String);
      final limite = '${isoJour(d.subtract(const Duration(days: 1)))}'
          'T00:00:00+00:00';
      jour['date_limite_annulation'] = limite;
      for (final p in (jour['plats'] as List).cast<Map<String, dynamic>>()) {
        p['date_limite_annulation'] = limite;
      }
    }
    return JoursCommande.fromJson(j);
  }
}
