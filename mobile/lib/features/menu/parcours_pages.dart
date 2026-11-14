// lib/features/menu/parcours_pages.dart
//
// Parcours « Menus » : agence → prestataire → équipe → jour.
//   Page 1 : rangée d'agences (icônes rondes) + cartes des prestataires
//   Page 2 : profil du prestataire + choix de l'équipe
//   Page 3 : jours de la semaine + plats du jour choisi (Réserver)
// Le choix de l'agence est gardé pendant la navigation (pour la semaine
// affichée) et revient à l'agence de l'utilisateur au prochain lancement.

part of 'menu_screen.dart';

enum _PageParcours { agences, equipes, jours }

class MenuScreen extends StatefulWidget {
  /// Service du parcours (tests : faux service sans réseau)
  final ParcoursService? service;

  /// Aujourd'hui (tests)
  final DateTime Function()? maintenant;

  const MenuScreen({super.key, this.service, this.maintenant});

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  ParcoursService get _service => widget.service ?? parcoursService;
  DateTime _maintenant() => (widget.maintenant ?? DateTime.now)();

  _PageParcours _page = _PageParcours.agences;

  // ── Page 1 ──
  AgencesCommande? _agences;
  String? _agencesErreur;
  bool _agencesChargement = false;

  /// Agence choisie et semaine (lundi) du choix : un choix d'une autre
  /// semaine est oublié (retour à l'agence de l'utilisateur)
  int? _agenceId;
  DateTime? _agenceSemaine;

  final Map<int, PrestatairesAgence> _prestataires = {};
  final Map<int, String> _prestatairesErreur = {};
  final Set<int> _prestatairesChargement = {};

  // ── Pages 2 et 3 ──
  int? _prestataireId;
  PrestataireCommande? _prestataire;
  int? _equipeId;
  EquipeCommande? _equipe;

  /// Jour demandé par l'accueil sans menu connu : ouvert en page 3 après
  /// le choix du prestataire et de l'équipe
  DateTime? _jourCible;

  /// Jour ouvert par la page 3 (null : jour par défaut du serveur)
  DateTime? _jourOuverture;

  @override
  void initState() {
    super.initState();
    retourDansMenus = _retour;
    menuDemande.addListener(_onDemande);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final cmdProv = context.read<CommandeProvider>();
      // Liste des commandes (cartes « Votre repas », fiche du plat) puis
      // lien éventuel de l'accueil
      final commandes = cmdProv.mesCommandes.isEmpty
          ? cmdProv.loadMesCommandes()
          : Future<void>.value();
      _chargerAgences();
      final c = menuDemande.value;
      if (c != null) {
        menuDemande.value = null;
        commandes.whenComplete(() => _ouvrirCible(c));
      }
    });
  }

  @override
  void dispose() {
    if (retourDansMenus == _retour) retourDansMenus = null;
    menuDemande.removeListener(_onDemande);
    super.dispose();
  }

  void _onDemande() {
    final c = menuDemande.value;
    if (c == null || !mounted) return;
    menuDemande.value = null;
    _ouvrirCible(c);
  }

  /// Retour à la page précédente du parcours (false : première page)
  bool _retour() {
    if (!mounted || _page == _PageParcours.agences) return false;
    setState(() {
      _page = _page == _PageParcours.jours
          ? _PageParcours.equipes
          : _PageParcours.agences;
    });
    return true;
  }

  // ── Chargements ──────────────────────────────────────────────

  Future<void> _chargerAgences() async {
    setState(() {
      _agencesChargement = true;
      _agencesErreur = null;
    });
    try {
      final a = await _service.agences();
      if (!mounted) return;
      setState(() {
        _agences = a;
        _agencesChargement = false;
      });
      final id = _agenceCourante();
      if (id != null) _chargerPrestataires(id);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _agencesChargement = false;
        _agencesErreur =
            messageErreurApi(e) ?? 'Impossible de charger les agences';
      });
    }
  }

  Future<void> _chargerPrestataires(int agenceId, {bool force = false}) async {
    if (_prestatairesChargement.contains(agenceId)) return;
    if (!force && _prestataires.containsKey(agenceId)) return;
    setState(() {
      _prestatairesChargement.add(agenceId);
      _prestatairesErreur.remove(agenceId);
    });
    try {
      final p = await _service.prestataires(agenceId);
      if (!mounted) return;
      setState(() {
        _prestataires[agenceId] = p;
        _prestatairesChargement.remove(agenceId);
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _prestatairesChargement.remove(agenceId);
        _prestatairesErreur[agenceId] =
            messageErreurApi(e) ?? 'Impossible de charger les prestataires';
      });
    }
  }

  Future<void> _actualiser() async {
    final cmdProv = context.read<CommandeProvider>();
    _prestataires.clear();
    await Future.wait([_chargerAgences(), cmdProv.loadMesCommandes()]);
  }

  /// Agence affichée : le choix de la semaine en cours, sinon l'agence de
  /// l'utilisateur (sinon la première de la liste)
  int? _agenceCourante() {
    final agences = _agences?.agences ?? const <AgenceCommande>[];
    if (agences.isEmpty) return null;
    final semaine = lundiSemaine(_maintenant());
    final choix = _agenceId;
    if (choix != null &&
        _agenceSemaine == semaine &&
        agences.any((a) => a.id == choix)) {
      return choix;
    }
    return (_agences!.monAgence ?? agences.first).id;
  }

  void _choisirAgence(int id) {
    setState(() {
      _agenceId = id;
      _agenceSemaine = lundiSemaine(_maintenant());
    });
    _chargerPrestataires(id);
  }

  void _ouvrirPrestataire(PrestataireCommande p) => setState(() {
        _prestataireId = p.id;
        _prestataire = p;
        _equipeId = null;
        _equipe = null;
        _page = _PageParcours.equipes;
      });

  void _ouvrirEquipe(EquipeCommande e) => setState(() {
        _equipeId = e.id;
        _equipe = e;
        _jourOuverture = _jourCible;
        _jourCible = null;
        _page = _PageParcours.jours;
      });

  /// Lien de l'accueil : agence, prestataire, équipe et jour du menu
  /// demandé ; sinon la première page (le jour demandé sera ouvert après le
  /// choix du prestataire et de l'équipe).
  Future<void> _ouvrirCible(CibleMenu c) async {
    final cmds = context.read<CommandeProvider>().mesCommandes;
    Menu? menu;
    if (c.menuId != null) {
      menu = cmds
          .map((x) => x.menuDetail)
          .whereType<Menu>()
          .where((m) => m.id == c.menuId)
          .firstOrNull;
      if (menu == null) {
        try {
          menu = await _service.menu(c.menuId!);
        } catch (_) {
          menu = null;
        }
      }
    } else if (c.date != null) {
      final iso = isoJour(c.date!);
      menu = cmds
          .where((x) =>
              x.statut != StatutCommande.annulee &&
              x.menuDetail?.dateMenu == iso)
          .map((x) => x.menuDetail)
          .whereType<Menu>()
          .firstOrNull;
    }
    if (!mounted) return;
    final jour = jourIso(menu?.dateMenu) ?? c.date;
    setState(() {
      if (menu == null) {
        _jourCible = jour;
        _page = _PageParcours.agences;
        return;
      }
      _jourCible = null;
      _jourOuverture = jour;
      _agenceId = menu.agenceId;
      _agenceSemaine = lundiSemaine(_maintenant());
      _prestataireId = menu.prestataireId ?? 0;
      _prestataire = null;
      _equipeId = menu.typeEquipeId;
      _equipe = null;
      _page = _PageParcours.jours;
    });
    if (menu != null) _chargerPrestataires(menu.agenceId);
  }

  // ── Construction ─────────────────────────────────────────────

  AgenceCommande? _agence(int? id) =>
      _agences?.agences.where((a) => a.id == id).firstOrNull;

  @override
  Widget build(BuildContext context) {
    final agenceId = _agenceCourante() ?? _agenceId;
    final agence = _agence(agenceId);
    final page1 = _PageAgences(
      agences: _agences,
      erreur: _agencesErreur,
      chargement: _agencesChargement,
      agenceId: agenceId,
      prestataires: agenceId == null ? null : _prestataires[agenceId],
      prestatairesErreur:
          agenceId == null ? null : _prestatairesErreur[agenceId],
      prestatairesChargement:
          agenceId != null && _prestatairesChargement.contains(agenceId),
      maintenant: _maintenant(),
      onAgence: _choisirAgence,
      onPrestataire: _ouvrirPrestataire,
      onActualiser: _actualiser,
      onReessayerPrestataires: agenceId == null
          ? null
          : () => _chargerPrestataires(agenceId, force: true),
    );

    final prestataire = _prestataire ??
        (agenceId == null
            ? null
            : _prestataires[agenceId]
                ?.prestataires
                .where((p) => p.id == _prestataireId)
                .firstOrNull);

    Widget page2 = const SizedBox.shrink();
    if (_page != _PageParcours.agences &&
        agenceId != null &&
        _prestataireId != null) {
      page2 = _PageEquipes(
        key: ValueKey('equipes-$agenceId-$_prestataireId'),
        service: _service,
        agenceId: agenceId,
        agenceNom: agence?.nom,
        prestataireId: _prestataireId!,
        prestataire: prestataire,
        onRetour: _retour,
        onEquipe: _ouvrirEquipe,
      );
    }

    Widget page3 = const SizedBox.shrink();
    if (_page == _PageParcours.jours &&
        agenceId != null &&
        _prestataireId != null) {
      page3 = _PageJours(
        key: ValueKey(
            'jours-$agenceId-$_prestataireId-$_equipeId-$_jourOuverture'),
        service: _service,
        agenceId: agenceId,
        agenceNom: agence?.nom,
        prestataireId: _prestataireId!,
        prestataire: prestataire,
        equipeId: _equipeId,
        equipeLibelle: _equipe?.libelle,
        jourCible: _jourOuverture,
        onRetour: _retour,
      );
    }

    return Scaffold(
      body: IndexedStack(
        index: _page.index,
        sizing: StackFit.expand,
        children: [page1, page2, page3],
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// OUTILS D'AFFICHAGE
// ══════════════════════════════════════════════════════════════

/// « 11:30 » → « 11 h 30 », « 14:00 » → « 14 h »
String _heure(String? h) {
  if (h == null || h.isEmpty) return '';
  final p = h.split(':');
  final hh = int.tryParse(p.first);
  final mm = p.length > 1 ? int.tryParse(p[1]) ?? 0 : 0;
  if (hh == null) return h;
  return mm == 0 ? '$hh h' : '$hh h ${mm.toString().padLeft(2, '0')}';
}

String? _horaires(String? debut, String? fin) {
  if ((debut ?? '').isEmpty || (fin ?? '').isEmpty) return null;
  // Fin avant le début : retrait jusqu'au lendemain (équipe de nuit)
  final lendemain = fin!.compareTo(debut!) < 0 ? ' (lendemain)' : '';
  return '${_heure(debut)} – ${_heure(fin)}$lendemain';
}

const _joursAbreges = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

/// « À réserver » en mode sombre (distinct du vert « Réservé »)
const _bleuClair = Color(0xFF8DB8F0);

const _joursCourts = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/// Jours de la semaine servis : « lun. → ven. », « sam. et dim. », « jeu. »
String? _joursServis(List<DateTime> jours) {
  final j = jours.map((d) => d.weekday).toSet().toList()..sort();
  if (j.isEmpty) return null;
  if (j.length == 1) return _joursAbreges[j.first - 1];
  final contigus = j.last - j.first + 1 == j.length;
  if (j.length == 2) {
    return '${_joursAbreges[j.first - 1]} et ${_joursAbreges[j.last - 1]}';
  }
  if (contigus) {
    return '${_joursAbreges[j.first - 1]} → ${_joursAbreges[j.last - 1]}';
  }
  return j.map((d) => _joursAbreges[d - 1]).join(', ');
}

/// « Garba » + note : « ★ 4,5 (128) » ou « Nouveau »
class _NotePrestataire extends StatelessWidget {
  final double? note;
  final int nbAvis;
  final bool nouveau;
  final bool compacte;
  const _NotePrestataire(
      {required this.note,
      required this.nbAvis,
      required this.nouveau,
      this.compacte = false});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    if (nouveau || note == null) {
      return const PastilleStatut(label: 'Nouveau', ton: TonPastille.bleu);
    }
    return Row(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.star_rounded, size: 16, color: kCouleurEtoile),
      const SizedBox(width: 2),
      Text(formatNoteMoyenne(note!),
          style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: isDark
                  ? AppColors.darkTextPrimary
                  : AppColors.lightTextPrimary)),
      const SizedBox(width: 3),
      Text(compacte ? '($nbAvis)' : '· $nbAvis avis',
          style: TextStyle(fontSize: 12, color: gris)),
    ]);
  }
}

/// Logo rond du prestataire (sinon ses initiales)
class _LogoPrestataire extends StatelessWidget {
  final String nom;
  final String? url;
  final double taille;
  final bool bordure;
  const _LogoPrestataire(
      {required this.nom, this.url, this.taille = 52, this.bordure = true});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final initiales = Container(
      alignment: Alignment.center,
      color: isDark ? const Color(0xFF3A2A12) : const Color(0xFFFFF1DC),
      child: Text(initialesDe(nom),
          style: TextStyle(
              fontSize: taille * 0.34,
              fontWeight: FontWeight.w800,
              color:
                  isDark ? const Color(0xFFFFC46B) : const Color(0xFFC77A12))),
    );
    return Container(
      width: taille,
      height: taille,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: isDark ? AppColors.darkCard : Colors.white,
        border: bordure
            ? Border.all(
                color: isDark ? AppColors.darkCard : Colors.white, width: 3)
            : null,
        boxShadow: bordure
            ? [
                BoxShadow(
                    color: Colors.black.withOpacity(0.12),
                    blurRadius: 6,
                    offset: const Offset(0, 2))
              ]
            : null,
      ),
      child: ClipOval(
        child: url == null
            ? initiales
            : Image.network(url!,
                fit: BoxFit.cover, errorBuilder: (_, __, ___) => initiales),
      ),
    );
  }
}

/// Couverture d'un prestataire : sa photo, sinon un assemblage des photos
/// de ses plats, sinon un fond aux couleurs de l'application
class _CouverturePrestataire extends StatelessWidget {
  final PrestataireCommande prestataire;
  final double hauteur;
  const _CouverturePrestataire(
      {required this.prestataire, required this.hauteur});

  Widget _photo(String url, Widget secours) => Image.network(url,
      fit: BoxFit.cover,
      width: double.infinity,
      height: double.infinity,
      errorBuilder: (_, __, ___) => secours);

  @override
  Widget build(BuildContext context) {
    const vide = _CouvertureVide(key: Key('couverture-vide'));
    final couverture = prestataire.photoCouvertureUrl;
    final photos = prestataire.photosPlats;
    final Widget contenu;
    if (couverture != null) {
      contenu = KeyedSubtree(
          key: const Key('couverture-photo'), child: _photo(couverture, vide));
    } else if (photos.isNotEmpty) {
      final p = photos.take(3).toList();
      contenu = Row(key: const Key('couverture-collage'), children: [
        Expanded(flex: p.length == 3 ? 3 : 1, child: _photo(p[0], vide)),
        if (p.length == 2) ...[
          const SizedBox(width: 2),
          Expanded(child: _photo(p[1], vide)),
        ],
        if (p.length == 3) ...[
          const SizedBox(width: 2),
          Expanded(
            flex: 2,
            child: Column(children: [
              Expanded(child: _photo(p[1], vide)),
              const SizedBox(height: 2),
              Expanded(child: _photo(p[2], vide)),
            ]),
          ),
        ],
      ]);
    } else {
      contenu = vide;
    }
    return SizedBox(
        height: hauteur,
        width: double.infinity,
        child: ClipRect(child: contenu));
  }
}

class _CouvertureVide extends StatelessWidget {
  const _CouvertureVide({super.key});

  @override
  Widget build(BuildContext context) => Container(
        decoration: const BoxDecoration(gradient: AppColors.heroGradient),
        child: Stack(children: [
          Positioned(
            right: -18,
            bottom: -22,
            child: Icon(Icons.restaurant_menu_rounded,
                size: 130, color: Colors.white.withOpacity(0.07)),
          ),
          Positioned(
            left: -10,
            top: -14,
            child: Icon(Icons.lunch_dining_rounded,
                size: 80, color: AppColors.accent.withOpacity(0.12)),
          ),
          Center(
            child: Icon(Icons.restaurant_rounded,
                size: 34, color: AppColors.accent.withOpacity(0.75)),
          ),
        ]),
      );
}

/// Couleurs des icônes d'agences (hors agence de l'utilisateur)
const _teintesAgences = [
  (Color(0xFFFFF1DC), Color(0xFFE08A1E)),
  (Color(0xFFE3F7EA), Color(0xFF26A65B)),
  (Color(0xFFE6EEFB), Color(0xFF3B6FD8)),
  (Color(0xFFF1E9FB), Color(0xFF8A4FD8)),
  (Color(0xFFE2F5F5), Color(0xFF1E9C9C)),
];

// ══════════════════════════════════════════════════════════════
// PAGE 1 : AGENCES + PRESTATAIRES
// ══════════════════════════════════════════════════════════════

class _PageAgences extends StatelessWidget {
  final AgencesCommande? agences;
  final String? erreur;
  final bool chargement;
  final int? agenceId;
  final PrestatairesAgence? prestataires;
  final String? prestatairesErreur;
  final bool prestatairesChargement;
  final DateTime maintenant;
  final ValueChanged<int> onAgence;
  final ValueChanged<PrestataireCommande> onPrestataire;
  final Future<void> Function() onActualiser;
  final VoidCallback? onReessayerPrestataires;

  const _PageAgences({
    required this.agences,
    required this.erreur,
    required this.chargement,
    required this.agenceId,
    required this.prestataires,
    required this.prestatairesErreur,
    required this.prestatairesChargement,
    required this.maintenant,
    required this.onAgence,
    required this.onPrestataire,
    required this.onActualiser,
    required this.onReessayerPrestataires,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final liste = agences?.agences ?? const <AgenceCommande>[];
    final agence = liste.where((a) => a.id == agenceId).firstOrNull;
    final mienne = agences?.monAgence;
    final mission = agence != null && mienne != null && agence.id != mienne.id;

    final enfants = <Widget>[];
    if (agences == null && chargement) {
      enfants.addAll([
        const SizedBox(height: 92),
        for (var i = 0; i < 3; i++) const ShimmerCard(height: 210),
      ]);
    } else if (agences == null && erreur != null) {
      enfants.add(EmptyState(
        icon: Icons.cloud_off_rounded,
        title: 'Chargement impossible',
        subtitle: erreur,
        action: ElevatedButton.icon(
          icon: const Icon(Icons.refresh_rounded, size: 18),
          label: const Text('Réessayer'),
          onPressed: onActualiser,
        ),
      ));
    } else if (liste.isEmpty && agences?.agenceNonRenseignee == true) {
      // Employé sans agence et aucune agence ouverte aux autres agences
      enfants.add(const EmptyState(
        key: Key('agence-non-renseignee'),
        icon: Icons.domain_disabled_rounded,
        title: "Votre agence n'est pas renseignée — contactez votre "
            'gestionnaire',
        subtitle: 'Sans agence, vous ne pouvez commander que dans les '
            "agences ouvertes aux autres agences, et aucune ne l'est pour "
            'le moment.',
      ));
    } else if (liste.isEmpty) {
      enfants.add(const EmptyState(
        icon: Icons.store_mall_directory_outlined,
        title: 'Aucune agence disponible',
        subtitle: "Aucune agence ne vous est ouverte pour l'instant",
      ));
    } else {
      if (agences?.sansAgence == true) {
        enfants.add(const Padding(
          padding: EdgeInsets.only(bottom: 8),
          child: BandeauInfo(
            key: Key('bandeau-sans-agence'),
            icone: Icons.info_outline_rounded,
            ton: TonPastille.or,
            texte: "Votre agence n'est pas renseignée : vous ne pouvez "
                'commander que dans les agences ouvertes aux autres '
                'agences. Contactez votre gestionnaire.',
          ),
        ));
      }
      enfants.add(_RangeeAgences(
          agences: liste, agenceId: agenceId, onAgence: onAgence));
      if (mission) {
        enfants.add(Padding(
          padding: const EdgeInsets.only(top: 6, bottom: 4),
          child: _BandeauMission(
              agence: agence.nom, onMonAgence: () => onAgence(mienne.id)),
        ));
      }
      final p = prestataires;
      final n = p?.prestataires.length ?? 0;
      enfants.add(Padding(
        padding: const EdgeInsets.fromLTRB(2, 12, 2, 8),
        child: Row(children: [
          Expanded(
            child: Text(
                p == null
                    ? 'Prestataires à ${agence?.nom ?? ''}'
                    : '$n prestataire${n > 1 ? 's' : ''} à ${p.agenceNom.isEmpty ? agence?.nom ?? '' : p.agenceNom}',
                key: const Key('titre-prestataires'),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w800)),
          ),
          const SizedBox(width: 8),
          Text(DateFormat('EEE d MMM', 'fr_FR').format(maintenant),
              style: TextStyle(fontSize: 12, color: gris)),
        ]),
      ));
      if (p == null && prestatairesErreur != null) {
        enfants.add(BandeauInfo(
          icone: Icons.cloud_off_rounded,
          ton: TonPastille.rouge,
          texte: prestatairesErreur!,
          action: TextButton(
              onPressed: onReessayerPrestataires,
              child: const Text('Réessayer')),
        ));
      } else if (p == null) {
        enfants.addAll([
          for (var i = 0; i < 2; i++) const ShimmerCard(height: 210),
        ]);
      } else if (n == 0) {
        enfants.add(const EmptyState(
          icon: Icons.no_meals_rounded,
          title: 'Aucun prestataire',
          subtitle: "Aucun menu n'est prévu dans cette agence pour l'instant",
        ));
      } else {
        for (final presta in p.prestataires) {
          enfants.add(Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: _CartePrestataire(
                prestataire: presta, onTap: () => onPrestataire(presta)),
          ));
        }
      }
    }

    return Column(children: [
      const EnTeteMarine(
        titre: 'Menus',
        sousTitre: "Où mangez-vous aujourd'hui ?",
        retour: false,
      ),
      if (agences != null && erreur != null)
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
          child: BandeauInfo(
            icone: Icons.cloud_off_rounded,
            ton: TonPastille.rouge,
            texte: 'Actualisation impossible : $erreur',
          ),
        ),
      Expanded(
        child: RefreshIndicator(
          onRefresh: onActualiser,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 100),
            children: enfants,
          ),
        ),
      ),
    ]);
  }
}

class _RangeeAgences extends StatelessWidget {
  final List<AgenceCommande> agences;
  final int? agenceId;
  final ValueChanged<int> onAgence;
  const _RangeeAgences(
      {required this.agences, required this.agenceId, required this.onAgence});

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 96,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: agences.length,
          separatorBuilder: (_, __) => const SizedBox(width: 6),
          itemBuilder: (_, i) => _IconeAgence(
            agence: agences[i],
            teinte: _teintesAgences[i % _teintesAgences.length],
            selectionnee: agences[i].id == agenceId,
            onTap: () => onAgence(agences[i].id),
          ),
        ),
      );
}

class _IconeAgence extends StatelessWidget {
  final AgenceCommande agence;
  final (Color, Color) teinte;
  final bool selectionnee;
  final VoidCallback onTap;
  const _IconeAgence(
      {required this.agence,
      required this.teinte,
      required this.selectionnee,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final mienne = agence.monAgence;
    final (fondClair, icone) = teinte;
    final fond = mienne
        ? (isDark ? AppColors.accent.withOpacity(0.18) : AppColors.primary)
        : (isDark ? icone.withOpacity(0.18) : fondClair);
    final couleurIcone = mienne
        ? (isDark ? AppColors.accent : Colors.white)
        : (isDark ? icone.withOpacity(0.95) : icone);
    final texte =
        isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    return Semantics(
      button: true,
      selected: selectionnee,
      label:
          'Agence ${agence.nom}${mienne ? ' (mon agence)' : (agence.mission ? ' (mission)' : '')}',
      excludeSemantics: true,
      child: InkWell(
        key: Key('agence-${agence.id}'),
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: SizedBox(
          width: 72,
          child: Column(children: [
            const SizedBox(height: 2),
            Stack(clipBehavior: Clip.none, children: [
              Container(
                width: 60,
                height: 60,
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                      color: selectionnee
                          ? AppColors.accentDark
                          : Colors.transparent,
                      width: 2.5),
                ),
                child: Container(
                  decoration:
                      BoxDecoration(shape: BoxShape.circle, color: fond),
                  child: Icon(
                      mienne
                          ? Icons.apartment_rounded
                          : Icons.storefront_rounded,
                      size: 24,
                      color: couleurIcone),
                ),
              ),
              if (mienne)
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Container(
                    key: const Key('epingle-mon-agence'),
                    width: 20,
                    height: 20,
                    decoration: BoxDecoration(
                      color: AppColors.accentDark,
                      shape: BoxShape.circle,
                      border: Border.all(
                          color: isDark
                              ? AppColors.darkBackground
                              : AppColors.lightBackground,
                          width: 2),
                    ),
                    child: const Icon(Icons.location_on_rounded,
                        size: 11, color: Colors.white),
                  ),
                ),
            ]),
            const SizedBox(height: 4),
            Text(agence.nom,
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 11,
                    height: 1.15,
                    fontWeight:
                        selectionnee ? FontWeight.w800 : FontWeight.w500,
                    color: selectionnee
                        ? (isDark ? AppColors.accent : AppColors.accentDark)
                        : (mienne ? texte : gris))),
            // Agence de mission : seulement l'équipe où l'employé est programmé
            if (agence.mission)
              Text('Mission',
                  key: Key('mission-${agence.id}'),
                  style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFFB45309))),
          ]),
        ),
      ),
    );
  }
}

/// « Vous commandez à l'agence Yopougon (mission) » + « Mon agence »
class _BandeauMission extends StatelessWidget {
  final String agence;
  final VoidCallback onMonAgence;
  const _BandeauMission({required this.agence, required this.onMonAgence});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final (_, couleur) = couleursPastille(TonPastille.or, isDark);
    final fond =
        isDark ? AppColors.warning.withOpacity(0.15) : AppColors.warningLight;
    return Container(
      key: const Key('bandeau-mission'),
      padding: const EdgeInsets.fromLTRB(12, 6, 4, 6),
      decoration: BoxDecoration(
        color: fond,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.warning.withOpacity(0.45)),
      ),
      child: Row(children: [
        Icon(Icons.work_outline_rounded, size: 18, color: couleur),
        const SizedBox(width: 9),
        Expanded(
          child: Text.rich(
            TextSpan(children: [
              const TextSpan(text: "Vous commandez à l'agence "),
              TextSpan(
                  text: agence,
                  style: const TextStyle(fontWeight: FontWeight.w800)),
              const TextSpan(text: ' (mission)'),
            ]),
            style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.w500, color: couleur),
          ),
        ),
        TextButton(
          key: const Key('lien-mon-agence'),
          style: TextButton.styleFrom(
              foregroundColor:
                  isDark ? AppColors.darkTextPrimary : AppColors.primary,
              visualDensity: VisualDensity.compact),
          onPressed: onMonAgence,
          child: const Text('Mon agence',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
        ),
      ]),
    );
  }
}

class _CartePrestataire extends StatelessWidget {
  final PrestataireCommande prestataire;
  final VoidCallback onTap;
  const _CartePrestataire({required this.prestataire, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final p = prestataire;
    const hauteur = 132.0;
    final infos = <String>[
      if (p.nbPlatsJour > 0)
        '${p.nbPlatsJour} plat${p.nbPlatsJour > 1 ? 's' : ''} aujourd\'hui'
      else if (p.prochainJourAReserver != null)
        'Prochain menu ${p.prochainJourAReserver!.libelle}'
      else
        "Pas de menu aujourd'hui",
      if (p.cuisine.isNotEmpty) 'Cuisine ${_minuscule(p.cuisine)}',
    ];
    final equipes = p.equipes
        .map((e) =>
            e.monEquipe == true ? '${e.libelle} (mon équipe)' : e.libelle)
        .join(', ');

    Widget ligne(IconData icone, String texte) => Row(children: [
          Icon(icone, size: 13, color: gris),
          const SizedBox(width: 5),
          Expanded(
            child: Text(texte,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11.5, color: gris)),
          ),
        ]);

    return Material(
      key: Key('presta-${p.id}'),
      color: isDark ? AppColors.darkCard : AppColors.lightCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _CouvertureEtLogo(
            prestataire: p,
            hauteur: hauteur,
            logo: 54,
            marge: 12,
            surCouverture: [
              if (p.commandeAujourdhui)
                Positioned(
                  left: 10,
                  top: 10,
                  child: Container(
                    key: const Key('badge-commande-aujourdhui'),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.accentDark,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.check_circle_rounded,
                          size: 13, color: Colors.white),
                      SizedBox(width: 4),
                      Text("Commandé aujourd'hui",
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w700)),
                    ]),
                  ),
                ),
            ],
            aDroite:
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Text(p.nomAffiche,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800, height: 1.2)),
              ),
              const SizedBox(width: 6),
              _NotePrestataire(
                  note: p.note,
                  nbAvis: p.nbAvis,
                  nouveau: !p.aUneNote,
                  compacte: true),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
            child: Column(children: [
              ligne(Icons.restaurant_rounded, infos.join(' · ')),
              if (equipes.isNotEmpty) ...[
                const SizedBox(height: 3),
                ligne(Icons.groups_outlined, equipes),
              ],
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Couverture du prestataire, logo rond à cheval sur son bord bas et
/// contenu à droite du logo (nom, note)
class _CouvertureEtLogo extends StatelessWidget {
  final PrestataireCommande? prestataire;
  final double hauteur;
  final double logo;
  final double marge;
  final List<Widget> surCouverture;
  final Widget aDroite;
  const _CouvertureEtLogo({
    required this.prestataire,
    required this.hauteur,
    required this.logo,
    required this.marge,
    this.surCouverture = const [],
    required this.aDroite,
  });

  @override
  Widget build(BuildContext context) {
    final p = prestataire;
    return Stack(clipBehavior: Clip.none, children: [
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(
          height: hauteur,
          child: Stack(fit: StackFit.expand, children: [
            if (p != null)
              _CouverturePrestataire(prestataire: p, hauteur: hauteur)
            else
              const _CouvertureVide(),
            ...surCouverture,
          ]),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(marge + logo + 10, 8, marge, 0),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: logo / 2 - 6),
            child: aDroite,
          ),
        ),
      ]),
      Positioned(
        left: marge,
        top: hauteur - logo / 2,
        child: _LogoPrestataire(
            nom: p?.nomAffiche ?? '', url: p?.logoUrl, taille: logo),
      ),
    ]);
  }
}

// ══════════════════════════════════════════════════════════════
// PAGE 2 : PRESTATAIRE + CHOIX DE L'ÉQUIPE
// ══════════════════════════════════════════════════════════════

class _PageEquipes extends StatefulWidget {
  final ParcoursService service;
  final int agenceId;
  final String? agenceNom;
  final int prestataireId;
  final PrestataireCommande? prestataire;
  final bool Function() onRetour;
  final ValueChanged<EquipeCommande> onEquipe;

  const _PageEquipes({
    super.key,
    required this.service,
    required this.agenceId,
    required this.agenceNom,
    required this.prestataireId,
    required this.prestataire,
    required this.onRetour,
    required this.onEquipe,
  });

  @override
  State<_PageEquipes> createState() => _PageEquipesState();
}

class _PageEquipesState extends State<_PageEquipes> {
  EquipesPrestataire? _donnees;
  String? _erreur;
  bool _chargement = true;

  @override
  void initState() {
    super.initState();
    _charger();
  }

  Future<void> _charger() async {
    setState(() {
      _chargement = true;
      _erreur = null;
    });
    try {
      final d =
          await widget.service.equipes(widget.prestataireId, widget.agenceId);
      if (!mounted) return;
      setState(() {
        _donnees = d;
        _chargement = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _chargement = false;
        _erreur = messageErreurApi(e) ?? 'Impossible de charger les équipes';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final presta = _donnees?.prestataire ?? widget.prestataire;
    final agenceNom = (_donnees?.agenceNom.isNotEmpty ?? false)
        ? _donnees!.agenceNom
        : widget.agenceNom ?? '';
    final equipes = _donnees?.equipes ?? const <EquipeCommande>[];
    const hauteur = 190.0;

    final contenu = <Widget>[];
    if (_chargement && _donnees == null) {
      contenu.addAll([
        for (var i = 0; i < 3; i++) const ShimmerCard(height: 70),
      ]);
    } else if (_donnees == null) {
      contenu.add(EmptyState(
        icon: Icons.cloud_off_rounded,
        title: 'Chargement impossible',
        subtitle: _erreur,
        action: ElevatedButton.icon(
          icon: const Icon(Icons.refresh_rounded, size: 18),
          label: const Text('Réessayer'),
          onPressed: _charger,
        ),
      ));
    } else if (equipes.isEmpty) {
      contenu.add(const EmptyState(
        icon: Icons.event_busy_rounded,
        title: 'Aucun menu à venir',
        subtitle: "Ce prestataire n'a pas encore publié de menu ici",
      ));
    } else {
      // Équipe de l'utilisateur : renvoyée en premier et présélectionnée
      // (mise en avant) ; il peut en choisir une autre
      final mienne = _donnees?.equipeParDefaut;
      for (final e in equipes) {
        contenu.add(Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: _CarteEquipe(
              equipe: e,
              preselectionnee: mienne?.id == e.id,
              onTap: () => widget.onEquipe(e)),
        ));
      }
    }

    return RefreshIndicator(
      onRefresh: _charger,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 100),
        children: [
          _CouvertureEtLogo(
            prestataire: presta,
            hauteur: hauteur,
            logo: 68,
            marge: 16,
            surCouverture: [
              Positioned(
                left: 8,
                top: 0,
                child: SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(4),
                    child: _BoutonRetourRond(onTap: widget.onRetour),
                  ),
                ),
              ),
            ],
            aDroite: Text(presta?.nomAffiche ?? '',
                key: const Key('nom-prestataire'),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800, height: 1.2)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    if (presta != null)
                      _NotePrestataire(
                          note: presta.note,
                          nbAvis: presta.nbAvis,
                          nouveau: !presta.aUneNote),
                    if (agenceNom.isNotEmpty)
                      Text('· $agenceNom',
                          style: TextStyle(fontSize: 12, color: gris)),
                  ]),
              if (presta != null &&
                  (presta.descriptionCourte.isNotEmpty ||
                      presta.cuisine.isNotEmpty)) ...[
                const SizedBox(height: 8),
                Text(
                    presta.descriptionCourte.isNotEmpty
                        ? presta.descriptionCourte
                        : 'Cuisine ${_minuscule(presta.cuisine)}',
                    style: TextStyle(fontSize: 12.5, height: 1.4, color: gris)),
              ],
            ]),
          ),
          Divider(
              height: 1,
              color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
            child: Row(children: [
              Expanded(
                child: Text('Choisissez votre équipe',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800)),
              ),
              if (equipes.isNotEmpty)
                Text('${equipes.length} équipe${equipes.length > 1 ? 's' : ''}',
                    style: TextStyle(fontSize: 12, color: gris)),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Column(children: contenu),
          ),
        ],
      ),
    );
  }
}

class _BoutonRetourRond extends StatelessWidget {
  final bool Function() onTap;
  const _BoutonRetourRond({required this.onTap});

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.white,
        shape: const CircleBorder(),
        elevation: 2,
        child: IconButton(
          key: const Key('retour-parcours'),
          tooltip: 'Retour',
          icon: const Icon(Icons.arrow_back_rounded,
              color: AppColors.primary, size: 20),
          onPressed: () => onTap(),
        ),
      );
}

(IconData, Color) _iconeEquipe(String libelle) {
  final l = libelle.toLowerCase();
  if (l.contains('nuit') || l.contains('soir')) {
    return (Icons.nightlight_round, const Color(0xFF3B6FD8));
  }
  if (l.contains('week') || l.contains('sam') || l.contains('dim')) {
    return (Icons.event_rounded, const Color(0xFF8A4FD8));
  }
  return (Icons.wb_sunny_rounded, const Color(0xFFE08A1E));
}

class _CarteEquipe extends StatelessWidget {
  final EquipeCommande equipe;

  /// Équipe proposée d'office (celle de l'utilisateur, ou la seule)
  final bool preselectionnee;
  final VoidCallback onTap;
  const _CarteEquipe(
      {required this.equipe,
      this.preselectionnee = false,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final (icone, couleur) = _iconeEquipe(equipe.libelle);
    final mienne = equipe.monEquipe == true || preselectionnee;
    final details = [
      if (_horaires(equipe.heureDebutService, equipe.heureFinService)
          case final h?)
        'Retrait $h',
      if (_joursServis(equipe.jours) case final j?) j,
    ].join(' · ');
    return Material(
      key: Key('equipe-${equipe.id}'),
      color: isDark ? AppColors.darkCard : AppColors.lightCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
            color: mienne
                ? AppColors.accentDark
                : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
            width: mienne ? 2 : 1),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 8, 12),
          child: Row(children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: couleur.withOpacity(isDark ? 0.2 : 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icone, color: couleur, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                        spacing: 8,
                        runSpacing: 2,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(equipe.libelle,
                              style: Theme.of(context)
                                  .textTheme
                                  .titleSmall
                                  ?.copyWith(fontWeight: FontWeight.w800)),
                          if (equipe.monEquipe == true)
                            const PastilleStatut(
                                label: 'Mon équipe', ton: TonPastille.vert),
                        ]),
                    if (details.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(details,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 11.5, color: gris)),
                    ],
                    // Équipe sur planning (ex. Nuit) : période de l'employé
                    if (equipe.programmation.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Container(
                        key: Key('programmation-${equipe.id}'),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 9, vertical: 3),
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          const Icon(Icons.event_available_rounded,
                              size: 12, color: Colors.white),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(equipe.programmation,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w700)),
                          ),
                        ]),
                      ),
                    ],
                  ]),
            ),
            Icon(Icons.chevron_right_rounded, color: gris),
          ]),
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// PAGE 3 : JOURS + PLATS
// ══════════════════════════════════════════════════════════════

class _PageJours extends StatefulWidget {
  final ParcoursService service;
  final int agenceId;
  final String? agenceNom;
  final int prestataireId;
  final PrestataireCommande? prestataire;
  final int? equipeId;
  final String? equipeLibelle;

  /// Jour à ouvrir (lien de l'accueil) ; sinon le jour par défaut du serveur
  final DateTime? jourCible;
  final bool Function() onRetour;

  const _PageJours({
    super.key,
    required this.service,
    required this.agenceId,
    required this.agenceNom,
    required this.prestataireId,
    required this.prestataire,
    required this.equipeId,
    required this.equipeLibelle,
    required this.jourCible,
    required this.onRetour,
  });

  @override
  State<_PageJours> createState() => _PageJoursState();
}

class _PageJoursState extends State<_PageJours> {
  JoursCommande? _donnees;
  String? _erreur;
  bool _chargement = true;
  DateTime? _semaine;
  DateTime? _jour;

  /// Empreinte de « mes commandes » : une commande, une annulation (ici ou
  /// depuis la fiche du plat) recharge les états des jours
  String? _empreinte;

  @override
  void initState() {
    super.initState();
    _semaine = widget.jourCible;
    _charger(premier: true);
  }

  Future<void> _charger({bool premier = false, DateTime? semaine}) async {
    if (semaine != null) _semaine = semaine;
    setState(() {
      _chargement = true;
      _erreur = null;
    });
    try {
      final d = await widget.service.jours(
        agenceId: widget.agenceId,
        prestataireId: widget.prestataireId,
        equipeId: widget.equipeId,
        semaine: _semaine,
      );
      if (!mounted) return;
      setState(() {
        final ancien = _jour;
        _donnees = d;
        _chargement = false;
        // Jour gardé lors d'une actualisation ; sinon jour demandé, sinon
        // jour par défaut (prochain jour à réserver)
        if (!premier &&
            semaine == null &&
            ancien != null &&
            d.jour(ancien) != null) {
          _jour = ancien;
        } else if (premier &&
            widget.jourCible != null &&
            d.jour(widget.jourCible!) != null) {
          _jour = widget.jourCible;
        } else {
          _jour = d.jourParDefaut ?? d.jours.firstOrNull?.date;
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _chargement = false;
        _erreur = messageErreurApi(e) ?? 'Impossible de charger les menus';
      });
    }
  }

  String _empreinteCommandes(List<Commande> commandes) =>
      commandes.map((c) => '${c.id}:${c.statut.name}').join(',');

  @override
  Widget build(BuildContext context) {
    final cmdProv = context.watch<CommandeProvider>();
    final empreinte = _empreinteCommandes(cmdProv.mesCommandes);
    if (_empreinte != null && _empreinte != empreinte && _donnees != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _charger();
      });
    }
    _empreinte = empreinte;

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final d = _donnees;
    final presta = d?.prestataire ?? widget.prestataire;
    final agenceNom =
        (d?.agenceNom.isNotEmpty ?? false) ? d!.agenceNom : widget.agenceNom;
    final equipe = d?.equipeLibelle ?? widget.equipeLibelle;
    final jour = _jour == null ? null : d?.jour(_jour!);

    final enTete = Material(
      color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(4, 8, 14, 10),
          child: Row(children: [
            IconButton(
              key: const Key('retour-parcours'),
              tooltip: 'Retour',
              icon: const Icon(Icons.arrow_back_rounded, size: 22),
              onPressed: widget.onRetour,
            ),
            _LogoPrestataire(
                nom: presta?.nomAffiche ?? '',
                url: presta?.logoUrl,
                taille: 38,
                bordure: false),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(presta?.nomAffiche ?? '',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(fontWeight: FontWeight.w800)),
                    Text(
                        [
                          if (equipe != null && equipe.isNotEmpty)
                            d?.equipeMonEquipe == true
                                ? 'Équipe $equipe (mon équipe)'
                                : 'Équipe $equipe',
                          if (agenceNom != null && agenceNom.isNotEmpty)
                            agenceNom,
                        ].join(' · '),
                        key: const Key('sous-titre-jours'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 12,
                            color: isDark
                                ? AppColors.darkTextSecondary
                                : AppColors.lightTextSecondary)),
                  ]),
            ),
          ]),
        ),
      ),
    );

    final corps = <Widget>[];
    if (d == null && _chargement) {
      corps.addAll([
        const ShimmerCard(height: 74),
        for (var i = 0; i < 3; i++) const ShimmerCard(height: 90),
      ]);
    } else if (d == null) {
      corps.add(EmptyState(
        icon: Icons.cloud_off_rounded,
        title: 'Chargement impossible',
        subtitle: _erreur,
        action: ElevatedButton.icon(
          icon: const Icon(Icons.refresh_rounded, size: 18),
          label: const Text('Réessayer'),
          onPressed: _charger,
        ),
      ));
    } else {
      if (_erreur != null) {
        corps.add(Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: BandeauInfo(
              icone: Icons.cloud_off_rounded,
              ton: TonPastille.rouge,
              texte: _erreur!),
        ));
      }
      corps.add(_NavigationSemaine(
        donnees: d,
        chargement: _chargement,
        onSemaine: (s) => _charger(semaine: s),
      ));
      corps.add(const SizedBox(height: 8));
      corps.add(_BandeJours(
        donnees: d,
        selection: _jour,
        onJour: (j) => setState(() => _jour = j),
      ));
      corps.add(const SizedBox(height: 8));
      corps.add(const _LegendeJours());
      corps.add(const SizedBox(height: 12));
      if (jour != null) {
        corps.addAll(_contenuJour(context, cmdProv, d, jour));
      }
    }

    return Column(children: [
      enTete,
      Divider(
          height: 1,
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      Expanded(
        child: RefreshIndicator(
          onRefresh: () => Future.wait([
            _charger(),
            context.read<CommandeProvider>().loadMesCommandes(),
          ]),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 100),
            children: corps,
          ),
        ),
      ),
    ]);
  }

  /// Menu (au format des écrans existants) d'un plat du jour : celui de la
  /// commande si elle existe (dates limites complètes), sinon reconstruit
  Menu _menuDe(
      JoursCommande d, JourCommande j, PlatJour p, List<Commande> commandes) {
    final duServeur = commandes
        .map((c) => c.menuDetail)
        .whereType<Menu>()
        .where((m) => m.id == p.menuId && m.menuPlats.isNotEmpty)
        .firstOrNull;
    final presta = d.prestataire;
    if (duServeur != null) {
      return Menu(
        id: duServeur.id,
        dateMenu: duServeur.dateMenu,
        agenceId: duServeur.agenceId,
        agenceNom: duServeur.agenceNom,
        typeEquipeId: duServeur.typeEquipeId,
        typeEquipeLibelle: duServeur.typeEquipeLibelle,
        menuPlats: duServeur.menuPlats,
        dateLimiteCommande: duServeur.dateLimiteCommande,
        dateLimiteAnnulation: duServeur.dateLimiteAnnulation,
        prestataireId: duServeur.prestataireId,
        prestataireNom: duServeur.prestataireNom ?? presta?.nomAffiche,
      );
    }
    final equipe =
        j.menus.where((m) => m.id == p.menuId).firstOrNull?.typeEquipe;
    return Menu(
      id: p.menuId,
      dateMenu: isoJour(j.date),
      agenceId: d.agenceId,
      agenceNom: d.agenceNom,
      typeEquipeId: p.typeEquipeId ?? d.equipeId ?? 0,
      typeEquipeLibelle: p.typeEquipe.isNotEmpty
          ? p.typeEquipe
          : equipe ?? d.equipeLibelle ?? '',
      menuPlats: [
        for (final x in j.plats.where((x) => x.menuId == p.menuId))
          MenuPlat(id: x.id, plat: x.versPlat()),
      ],
      dateLimiteCommande: j.dateLimiteCommande,
      // « Annulable jusqu'au … » de la fiche du plat, avant de commander
      dateLimiteAnnulation: p.dateLimiteAnnulation ?? j.dateLimiteAnnulation,
      prestataireId: presta?.id,
      prestataireNom: presta?.nomAffiche,
    );
  }

  List<Widget> _contenuJour(BuildContext context, CommandeProvider cmdProv,
      JoursCommande d, JourCommande j) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final titre =
        _majusculeInitiale(DateFormat('EEEE d MMMM', 'fr_FR').format(j.date));
    final n = j.plats.length;
    final out = <Widget>[
      Row(children: [
        Expanded(
          child: Text(titre,
              key: const Key('titre-jour'),
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w800)),
        ),
        if (n > 0)
          Text('$n plat${n > 1 ? 's' : ''}',
              style: TextStyle(fontSize: 12, color: gris)),
      ]),
      const SizedBox(height: 8),
    ];

    final cmd = j.commande;
    if (j.etat == EtatJour.nonProgramme) {
      out.add(EmptyState(
        key: const Key('jour-non-programme'),
        icon: Icons.event_busy_rounded,
        title: 'Non programmé(e)',
        subtitle: j.motifIndisponible.isNotEmpty
            ? j.motifIndisponible
            : "Vous n'êtes pas programmé(e) dans cette équipe ce jour-là.",
      ));
      return out;
    }
    if (j.etat == EtatJour.pasDeMenu) {
      out.add(const EmptyState(
        icon: Icons.no_meals_rounded,
        title: 'Pas de menu ce jour',
        subtitle: 'Choisissez un autre jour',
      ));
      return out;
    }
    if (cmd != null && cmd.ici) {
      final c = cmdProv.mesCommandes.where((x) => x.id == cmd.id).firstOrNull;
      final menu = c?.menuDetail;
      if (c != null && menu != null) {
        final m = menu.prestataireNom == null && d.prestataire != null
            ? _menuDe(
                d,
                j,
                j.plats.firstWhere((p) => p.menuId == menu.id,
                    orElse: () => j.plats.first),
                cmdProv.mesCommandes)
            : menu;
        out.add(_CarteVotreRepas(commande: c, menu: m));
        out.addAll(_bandeauAnnulation(context, cmdProv, c, m));
      } else {
        out.add(BandeauInfo(
          icone: Icons.check_circle_rounded,
          ton: TonPastille.vert,
          texte: 'Vous avez réservé « ${cmd.plat} » ce jour.',
        ));
      }
    } else if (cmd != null) {
      final ou = [
        if (cmd.prestataire.isNotEmpty) cmd.prestataire,
        if (cmd.agence.isNotEmpty) cmd.agence,
      ].join(' · ');
      out.add(BandeauInfo(
        key: const Key('bandeau-autre-commande'),
        icone: Icons.location_off_rounded,
        ton: TonPastille.rouge,
        texte: 'Vous avez déjà commandé « ${cmd.plat} » ce jour'
            '${ou.isEmpty ? '' : ' ($ou)'}. Un seul repas par jour.',
      ));
    } else if (j.etat == EtatJour.aReserver) {
      final restant = fermeDans(j.dateLimiteCommande, DateTime.now());
      out.add(BandeauInfo(
        icone: Icons.alarm_rounded,
        ton: TonPastille.or,
        texte: [
          'Commandes ouvertes',
          if (restant != null) _minuscule(restant),
          if (restant == null && j.libelleLimite.isNotEmpty)
            "jusqu'au ${j.libelleLimite}",
        ].join(' · '),
      ));
      if (j.dateLimiteAnnulation != null) {
        // Délai d'annulation plus long que celui de commande : déjà dépassé
        final depasse = !DateTime.now().isBefore(j.dateLimiteAnnulation!);
        out.add(Padding(
          padding: const EdgeInsets.fromLTRB(4, 6, 4, 0),
          child: Row(children: [
            Icon(depasse ? Icons.lock_outline_rounded : Icons.undo_rounded,
                size: 14, color: gris),
            const SizedBox(width: 5),
            Expanded(
              child: Text(
                  depasse
                      ? "Non annulable : délai d'annulation dépassé"
                      : "Annulable jusqu'au "
                          '${libelleDateLimite(j.dateLimiteAnnulation!)}',
                  key: const Key('annulable-jusqua'),
                  style: TextStyle(fontSize: 11.5, color: gris)),
            ),
          ]),
        ));
      }
    } else if (j.etat == EtatJour.ferme) {
      out.add(const BandeauInfo(
        icone: Icons.lock_outline_rounded,
        ton: TonPastille.gris,
        texte: 'Commandes fermées pour ce jour',
      ));
    }
    out.add(const SizedBox(height: 10));
    if (n == 0) {
      out.add(const EmptyState(
        icon: Icons.no_meals_rounded,
        title: 'Aucun plat',
        subtitle: 'Aucun plat ajouté pour ce jour',
      ));
    }
    for (final p in j.plats) {
      out.add(Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: _CartePlatJour(
          plat: p,
          reservable: j.etat == EtatJour.aReserver,
          menu: () => _menuDe(d, j, p, cmdProv.mesCommandes),
          chargerInfo: (menuId, platId) =>
              widget.service.infoPaiement(menuId, platId: platId),
        ),
      ));
    }
    return out;
  }
}

class _NavigationSemaine extends StatelessWidget {
  final JoursCommande donnees;
  final bool chargement;
  final ValueChanged<DateTime> onSemaine;
  const _NavigationSemaine(
      {required this.donnees,
      required this.chargement,
      required this.onSemaine});

  @override
  Widget build(BuildContext context) {
    final d = donnees;
    final debut = d.debut;
    final fin = d.fin;
    final memeMois = debut.month == fin.month;
    final libelle = memeMois
        ? 'Semaine du ${debut.day} au ${DateFormat('d MMMM', 'fr_FR').format(fin)}'
        : 'Semaine du ${DateFormat('d MMM', 'fr_FR').format(debut)} '
            'au ${DateFormat('d MMM', 'fr_FR').format(fin)}';
    final aujourdhui = d.aujourdhui ?? DateTime.now();
    // Pas de retour avant la semaine en cours
    final precedente =
        d.precedente != null && !d.debut.isAfter(lundiSemaine(aujourdhui))
            ? null
            : d.precedente;
    return Row(children: [
      IconButton(
        key: const Key('semaine-precedente'),
        tooltip: 'Semaine précédente',
        visualDensity: VisualDensity.compact,
        icon: const Icon(Icons.chevron_left_rounded),
        onPressed: chargement || precedente == null
            ? null
            : () => onSemaine(precedente),
      ),
      Expanded(
        child: Text(libelle,
            key: const Key('libelle-semaine'),
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
      ),
      IconButton(
        key: const Key('semaine-suivante'),
        tooltip: 'Semaine suivante',
        visualDensity: VisualDensity.compact,
        icon: const Icon(Icons.chevron_right_rounded),
        onPressed: chargement || d.suivante == null
            ? null
            : () => onSemaine(d.suivante!),
      ),
    ]);
  }
}

class _BandeJours extends StatelessWidget {
  final JoursCommande donnees;
  final DateTime? selection;
  final ValueChanged<DateTime> onJour;
  const _BandeJours(
      {required this.donnees, required this.selection, required this.onJour});

  @override
  Widget build(BuildContext context) {
    // Samedi / dimanche sans menu : masqués
    final jours = donnees.jours
        .where((j) => j.date.weekday < 6 || j.etat != EtatJour.pasDeMenu)
        .toList();
    return Row(children: [
      for (var i = 0; i < jours.length; i++) ...[
        if (i > 0) const SizedBox(width: 5),
        Expanded(
          child: _PuceJour(
            jour: jours[i],
            selectionne: selection != null &&
                jours[i].date.year == selection!.year &&
                jours[i].date.month == selection!.month &&
                jours[i].date.day == selection!.day,
            onTap: () => onJour(jours[i].date),
          ),
        ),
      ],
    ]);
  }
}

class _PuceJour extends StatelessWidget {
  final JourCommande jour;
  final bool selectionne;
  final VoidCallback onTap;
  const _PuceJour(
      {required this.jour, required this.selectionne, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final fondSel =
        isDark ? AppColors.accent.withOpacity(0.2) : AppColors.primary;
    final texte = selectionne
        ? Colors.white
        : (isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary);
    final (String etat, Color couleur, IconData? icone) = switch (jour.etat) {
      EtatJour.reserve => ('Réservé', AppColors.accentDark, null),
      EtatJour.aReserver => (
          'À réserver',
          isDark ? _bleuClair : AppColors.primaryLight,
          null
        ),
      EtatJour.ferme => ('Fermé', gris, Icons.lock_outline_rounded),
      EtatJour.pasDeMenu => ('Fermé', gris, Icons.lock_outline_rounded),
      EtatJour.nonProgramme => ('Non prog.', gris, Icons.lock_outline_rounded),
    };
    final grise = jour.etat == EtatJour.pasDeMenu ||
        jour.etat == EtatJour.nonProgramme ||
        (jour.etat == EtatJour.ferme && !selectionne);
    final pastille = selectionne && jour.etat == EtatJour.aReserver
        ? Container(
            padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 1),
            decoration: BoxDecoration(
                color: AppColors.accentDark,
                borderRadius: BorderRadius.circular(6)),
            child: Text(etat,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 8.5,
                    fontWeight: FontWeight.w800,
                    color: Colors.white)),
          )
        : Row(mainAxisSize: MainAxisSize.min, children: [
            if (icone != null) ...[
              Icon(icone,
                  size: 9, color: selectionne ? Colors.white70 : couleur),
              const SizedBox(width: 1),
            ],
            Flexible(
              child: Text(etat,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 8.5,
                      fontWeight: FontWeight.w800,
                      color: selectionne
                          ? (jour.etat == EtatJour.reserve
                              ? AppColors.accent
                              : Colors.white70)
                          : couleur)),
            ),
          ]);
    return Semantics(
      button: true,
      selected: selectionne,
      label:
          '${jour.libelle.isEmpty ? isoJour(jour.date) : jour.libelle} : $etat',
      excludeSemantics: true,
      child: Opacity(
        opacity: grise ? 0.6 : 1,
        child: Material(
          key: Key('jour-${isoJour(jour.date)}'),
          color: selectionne
              ? fondSel
              : (isDark ? AppColors.darkCard : AppColors.lightCard),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(
              color: selectionne
                  ? (isDark ? AppColors.accent : AppColors.primary)
                  : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
            ),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 2),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(_joursCourts[jour.date.weekday - 1],
                    style: TextStyle(
                        fontSize: 10.5,
                        color: selectionne ? Colors.white70 : gris)),
                Text('${jour.date.day}',
                    style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: texte)),
                const SizedBox(height: 2),
                SizedBox(height: 15, child: Center(child: pastille)),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class _LegendeJours extends StatelessWidget {
  const _LegendeJours();

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    Widget point(Color c, String t) =>
        Row(mainAxisSize: MainAxisSize.min, children: [
          Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
          const SizedBox(width: 4),
          Flexible(
              child: Text(t, style: TextStyle(fontSize: 10.5, color: gris))),
        ]);
    return Wrap(spacing: 12, runSpacing: 4, children: [
      point(AppColors.accentDark, 'réservé'),
      point(isDark ? _bleuClair : AppColors.primaryLight, 'à réserver'),
      point(gris.withOpacity(0.6), 'fermé (délai passé ou pas de menu)'),
    ]);
  }
}

class _CartePlatJour extends StatefulWidget {
  final PlatJour plat;
  final bool reservable;

  /// Menu du plat (fiche détaillée, réservation)
  final Menu Function() menu;

  /// Solde et prix du menu (feuille de paiement)
  final Future<InfoPaiement> Function(int menuId, int platId) chargerInfo;
  const _CartePlatJour(
      {required this.plat,
      required this.reservable,
      required this.menu,
      required this.chargerInfo});

  @override
  State<_CartePlatJour> createState() => _CartePlatJourState();
}

class _CartePlatJourState extends State<_CartePlatJour> {
  bool _envoi = false;

  Future<void> _reserver(CommandeProvider cmdProv) async {
    setState(() => _envoi = true);
    final menu = widget.menu();
    await _reserverPlat(context, cmdProv, menu, widget.plat.versPlat(),
        chargerInfo: () => widget.chargerInfo(menu.id, widget.plat.id));
    if (mounted) setState(() => _envoi = false);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cmdProv = context.watch<CommandeProvider>();
    final p = widget.plat;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final commande = p.statut == StatutPlatJour.commande;
    final autre = p.statut == StatutPlatJour.autrePlatCommande;
    final disponible =
        p.statut == StatutPlatJour.disponible && widget.reservable;

    final note = p.aUneNote
        ? Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.star_rounded, size: 14, color: kCouleurEtoile),
            const SizedBox(width: 2),
            Text(formatNoteMoyenne(p.note!),
                style: TextStyle(
                    fontSize: 11.5, fontWeight: FontWeight.w600, color: gris)),
          ])
        : Text('Nouveau',
            style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w800,
                color: isDark ? _bleuClair : AppColors.primaryLight));

    final Widget statut;
    if (commande) {
      statut = const Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.check_circle_rounded, color: AppColors.accentDark, size: 18),
        SizedBox(width: 3),
        Text('Commandé',
            style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: AppColors.accentDark)),
      ]);
    } else if (autre) {
      statut = Text('Autre plat\ncommandé',
          textAlign: TextAlign.right,
          style: TextStyle(
              fontSize: 10.5, fontWeight: FontWeight.w600, color: gris));
    } else if (disponible) {
      statut = BoutonVert(
        key: Key('reserver-${p.id}'),
        label: 'Réserver',
        compact: true,
        chargement: _envoi,
        onPressed: cmdProv.isLoading ? null : () => _reserver(cmdProv),
      );
    } else {
      statut = Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.lock_outline_rounded, size: 13, color: gris),
        const SizedBox(width: 3),
        Text('Fermé',
            style: TextStyle(
                fontSize: 11.5, fontWeight: FontWeight.w700, color: gris)),
      ]);
    }

    final carte = Material(
      key: Key('plat-${p.id}'),
      color: isDark ? AppColors.darkCard : AppColors.lightCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: commande
              ? AppColors.accentDark
              : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
          width: commande ? 2 : 1,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _PlatDetailSheet.show(context,
            menu: widget.menu(), plat: p.versPlat()),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(children: [
            VignettePlat(url: p.photoUrl, taille: 64, rayon: 12),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(p.nom,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context)
                            .textTheme
                            .titleSmall
                            ?.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Wrap(
                        spacing: 4,
                        runSpacing: 2,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          note,
                          if (p.typePlat != null)
                            Text('· ${p.typePlat}',
                                style: TextStyle(fontSize: 11.5, color: gris)),
                        ]),
                  ]),
            ),
            const SizedBox(width: 8),
            Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (p.offert) ...[
                    Row(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.card_giftcard_rounded,
                          size: 15, color: AppColors.accentDark),
                      const SizedBox(width: 3),
                      Text('Offert',
                          key: Key('offert-${p.id}'),
                          style: Theme.of(context)
                              .textTheme
                              .titleSmall
                              ?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.accentDark)),
                    ]),
                    const SizedBox(height: 6),
                  ] else if (p.prix != null) ...[
                    Text(formatFcfa(p.prix!),
                        style: Theme.of(context)
                            .textTheme
                            .titleSmall
                            ?.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 6),
                  ],
                  // Bouton « Réserver » distinct de la carte (lecteurs
                  // d'écran)
                  Semantics(container: true, child: statut),
                ]),
          ]),
        ),
      ),
    );
    return autre ? Opacity(opacity: 0.55, child: carte) : carte;
  }
}
