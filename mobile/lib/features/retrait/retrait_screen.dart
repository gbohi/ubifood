// lib/features/retrait/retrait_screen.dart
//
// Retrait au comptoir : un en-tête (menu concerné, avancement du service),
// « Scanner un badge » en premier, saisie du matricule en alternative,
// résultat encadré en vert et derniers retraits du menu.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../shared/models/models.dart';
import '../../core/widgets/common_widgets.dart';
import '../../core/api/api_client.dart';
import '../../core/services/cantine_service.dart';
import '../dashboard/dashboard_screen.dart' show MainShellNavigator;

class RetraitScreen extends StatefulWidget {
  const RetraitScreen({super.key});
  @override
  State<RetraitScreen> createState() => _RetraitScreenState();
}

class _RetraitScreenState extends State<RetraitScreen> {
  final _badgeCtrl = TextEditingController();

  // Liste propre à l'écran : menus des 7 derniers jours jusqu'à aujourd'hui
  // (le serveur refuse le retrait sur un menu futur). MenuProvider reste la
  // liste partagée des menus à venir pour la commande.
  List<Menu> _menus = [];
  bool _menusLoading = true;
  String? _menusErreur;
  int? _menuId; // sélection par ID : pas d'identité d'objet après rechargement
  bool _scanMode = false;
  bool _visible = true;

  /// Commandes du menu sélectionné (avancement, derniers retraits) :
  /// GET /commandes/par-agence-periode/ existant, filtré sur le menu
  List<Commande>? _commandesMenu;
  int _requeteStats = 0;

  /// Agents servis depuis cet écran (les plus récents en premier)
  final List<String> _servisIci = [];

  Menu? get _menuSelectionne {
    for (final m in _menus) {
      if (m.id == _menuId) return m;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<RetraitProvider>().reset();
      _chargerMenus();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // MainShell garde les onglets en vie (IndexedStack) : un onglet masqué a
    // ses tickers désactivés. On coupe alors le scanner pour libérer la caméra.
    final visible = TickerMode.of(context);
    if (!visible && _visible) _scanMode = false;
    _visible = visible;
  }

  @override
  void dispose() {
    _badgeCtrl.dispose();
    super.dispose();
  }

  Future<void> _chargerMenus() async {
    final user = context.read<AuthProvider>().user;
    final isAdmin = user?.isAdmin ?? false;

    if (!isAdmin && user?.derniereAgenceId == null) {
      setState(() {
        _menusLoading = false;
        _menusErreur = 'Aucune agence assignée à votre compte.';
      });
      return;
    }

    setState(() {
      _menusLoading = true;
      _menusErreur = null;
    });
    try {
      final menus = await menuService.getMenusRetrait();
      if (!mounted) return;
      final ancien = _menuId;
      setState(() {
        _menus = menus;
        _menusLoading = false;
        if (_menuSelectionne == null) {
          _menuId = _menuParDefaut(menus, user?.derniereAgenceId)?.id;
        }
      });
      if (_menuId != ancien) context.read<RetraitProvider>().reset();
      _chargerStats();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _menusLoading = false;
        _menusErreur = messageErreurApi(e) ?? 'Erreur de chargement des menus';
      });
    }
  }

  /// Menu du jour de l'agence de l'utilisateur, sinon le plus récent
  /// (liste triée du plus récent au plus ancien).
  Menu? _menuParDefaut(List<Menu> menus, int? agenceId) {
    if (menus.isEmpty) return null;
    for (final m in menus) {
      if (m.isToday && (agenceId == null || m.agenceId == agenceId)) return m;
    }
    return menus.first;
  }

  /// Avancement du service pour le menu sélectionné (silencieux en cas
  /// d'erreur : le retrait reste possible)
  Future<void> _chargerStats() async {
    final menu = _menuSelectionne;
    final num = ++_requeteStats;
    if (menu == null) {
      setState(() => _commandesMenu = null);
      return;
    }
    try {
      final liste = await commandeService.getCommandesParAgencePeriode(
          dateDebut: menu.dateMenu,
          dateFin: menu.dateMenu,
          agenceId: menu.agenceId);
      if (!mounted || num != _requeteStats) return;
      setState(() => _commandesMenu =
          liste.where((c) => c.menuDetail?.id == menu.id).toList());
    } catch (_) {
      if (!mounted || num != _requeteStats) return;
      setState(() => _commandesMenu = null);
    }
  }

  void _choisirMenu(int? id) {
    setState(() {
      _menuId = id;
      _commandesMenu = null;
    });
    context.read<RetraitProvider>().reset();
    _chargerStats();
  }

  String _libelleMenu(Menu m, bool isAdmin) {
    final date = DateTime.tryParse(m.dateMenu);
    final dateStr = date != null
        ? DateFormat('EEE dd/MM', 'fr_FR').format(date)
        : m.dateMenu;
    return [
      m.isToday ? "Aujourd'hui · $dateStr" : dateStr,
      if (m.agenceNom.isNotEmpty) m.agenceNom,
      if (m.typeEquipeLibelle.isNotEmpty) m.typeEquipeLibelle,
    ].join(' · ');
  }

  void _ouvrirChoixMenu(bool isAdmin) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetCtx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(
              maxHeight: MediaQuery.of(sheetCtx).size.height * 0.7),
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                child: Text('Menu concerné',
                    style: Theme.of(sheetCtx)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w800)),
              ),
              for (final m in _menus)
                ListTile(
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                  leading: Icon(
                      m.id == _menuId
                          ? Icons.radio_button_checked_rounded
                          : Icons.radio_button_off_rounded,
                      color: m.id == _menuId ? AppColors.accentDark : null),
                  title: Text(_libelleMenu(m, isAdmin),
                      style: const TextStyle(fontSize: 14)),
                  onTap: () {
                    Navigator.pop(sheetCtx);
                    _choisirMenu(m.id);
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final isAdmin = auth.user?.isAdmin ?? false;
    final agenceNom = auth.user?.derniereAgence ?? '';
    final menu = _menuSelectionne;
    final stats = _commandesMenu;
    final servis =
        stats?.where((c) => c.statut == StatutCommande.retiree).length ?? 0;
    final aServir =
        stats?.where((c) => c.statut == StatutCommande.enAttente).length ?? 0;
    final commandes = servis + aServir;

    final enTete = EnTeteMarine(
      titre: 'Retrait',
      sousTitre: 'Validez les repas au comptoir',
      actions: [
        EnTeteBouton(
          icone: Icons.refresh_rounded,
          tooltip: 'Actualiser',
          onPressed: _menusLoading ? null : _chargerMenus,
        ),
      ],
      bas: _menus.isEmpty
          ? null
          : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Material(
                color: Colors.white.withOpacity(0.08),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: BorderSide(color: Colors.white.withOpacity(0.15))),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => _ouvrirChoixMenu(isAdmin),
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                    child: Row(children: [
                      const Icon(Icons.event_note_rounded,
                          size: 16, color: Colors.white),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                            menu == null
                                ? 'Choisissez un menu'
                                : _libelleMenu(menu, isAdmin),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w600)),
                      ),
                      Icon(Icons.keyboard_arrow_down_rounded,
                          size: 20, color: Colors.white.withOpacity(0.7)),
                    ]),
                  ),
                ),
              ),
              if (stats != null) ...[
                const SizedBox(height: 12),
                Semantics(
                  label: '$servis servis sur $commandes commandés',
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(
                      value: commandes == 0 ? 0 : servis / commandes,
                      minHeight: 8,
                      backgroundColor: Colors.white.withOpacity(0.15),
                      valueColor:
                          const AlwaysStoppedAnimation(AppColors.accent),
                    ),
                  ),
                ),
                const SizedBox(height: 5),
                Row(children: [
                  _Compteur(servis, servis > 1 ? 'servis' : 'servi'),
                  const Spacer(),
                  _Compteur(aServir, 'à servir'),
                  const Spacer(),
                  _Compteur(
                      commandes, commandes > 1 ? 'commandés' : 'commandé'),
                ]),
              ],
            ]),
    );

    return Scaffold(
      body: Column(children: [
        enTete,
        Expanded(
          child: RefreshIndicator(
            onRefresh: _chargerMenus,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 100),
              children: [
                if (_menusLoading && _menus.isEmpty)
                  const ShimmerCard(height: 200)
                else if (_menusErreur != null)
                  BandeauInfo(
                    icone: Icons.error_outline_rounded,
                    ton: TonPastille.rouge,
                    texte: _menusErreur!,
                    action: TextButton(
                        onPressed: _chargerMenus,
                        child: const Text('Réessayer')),
                  )
                else if (_menus.isEmpty)
                  BandeauInfo(
                    icone: Icons.warning_amber_rounded,
                    ton: TonPastille.or,
                    texte: isAdmin || agenceNom.isEmpty
                        ? 'Aucun menu disponible'
                        : 'Aucun menu disponible pour $agenceNom',
                  )
                else ...[
                  _carteScan(),
                  const SizedBox(height: 12),
                  _resultat(),
                  _derniersRetraits(),
                ],
              ],
            ),
          ),
        ),
      ]),
    );
  }

  // ── Scanner / saisie ─────────────────────────────────────────

  Widget _carteScan() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (_scanMode && _visible) ...[
          _ScannerWidget(onScan: _onBadgeScan),
          TextButton.icon(
            icon: const Icon(Icons.close_rounded, size: 18),
            label: const Text('Fermer la caméra'),
            onPressed: () => setState(() => _scanMode = false),
          ),
        ] else ...[
          Semantics(
            button: true,
            label: 'Ouvrir la caméra pour scanner un badge',
            excludeSemantics: true,
            child: GestureDetector(
              onTap: () => setState(() => _scanMode = true),
              child: Container(
                height: 118,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                      colors: [Color(0xFF0C2B4D), Color(0xFF12497F)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Stack(alignment: Alignment.center, children: [
                  const Icon(Icons.qr_code_scanner_rounded,
                      size: 46, color: AppColors.accent),
                  Positioned(
                    bottom: 9,
                    child: Text('Appuyez pour ouvrir la caméra',
                        style: TextStyle(
                            fontSize: 11,
                            color: Colors.white.withOpacity(0.7))),
                  ),
                ]),
              ),
            ),
          ),
          const SizedBox(height: 12),
          BoutonVert(
            label: 'Scanner un badge',
            icone: Icons.qr_code_scanner_rounded,
            hauteur: 46,
            onPressed: () => setState(() => _scanMode = true),
          ),
        ],
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: TextField(
              controller: _badgeCtrl,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'ou saisir un matricule…',
                isDense: true,
                prefixIcon: Icon(Icons.badge_outlined,
                    color: isDark ? AppColors.accent : AppColors.primaryLight),
              ),
              onSubmitted: (_) => _rechercher(),
            ),
          ),
          const SizedBox(width: 8),
          Consumer<RetraitProvider>(
            builder: (_, rProv, __) => SizedBox(
              width: 46,
              height: 46,
              child: ElevatedButton(
                onPressed: rProv.loading ? null : _rechercher,
                style: ElevatedButton.styleFrom(
                  padding: EdgeInsets.zero,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: rProv.loading
                    ? SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: isDark ? AppColors.primary : Colors.white))
                    : const Icon(Icons.search_rounded,
                        semanticLabel: 'Rechercher'),
              ),
            ),
          ),
        ]),
      ]),
    );
  }

  // ── Résultat ─────────────────────────────────────────────────

  Widget _resultat() {
    return Consumer<RetraitProvider>(builder: (_, rProv, __) {
      if (rProv.error != null) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: BandeauInfo(
              icone: Icons.error_outline_rounded,
              ton: TonPastille.rouge,
              texte: rProv.error!),
        );
      }
      if (rProv.successMessage != null) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _SuccessCard(
              message: rProv.successMessage!,
              nom: rProv.result?.userNom,
              onRetour: () {
                _badgeCtrl.clear();
                rProv.reset();
              }),
        );
      }
      if (rProv.result == null) return const SizedBox.shrink();
      final result = rProv.result!;
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: _ResultatCard(
          result: result,
          agence: _menuSelectionne?.agenceNom,
          onValider: () => _validerRetrait(rProv, result),
          loading: rProv.loading,
        ),
      );
    });
  }

  // ── Derniers retraits du menu ────────────────────────────────

  Widget _derniersRetraits() {
    final stats = _commandesMenu;
    if (stats == null) return const SizedBox.shrink();
    final retirees =
        stats.where((c) => c.statut == StatutCommande.retiree).toList();
    // Servis depuis cet écran en premier (plus récents d'abord)
    int rang(Commande c) {
      final i = _servisIci.indexOf(c.userNom);
      return i < 0 ? 1 << 20 : i;
    }

    retirees.sort((a, b) => rang(a).compareTo(rang(b)));
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text('Derniers retraits',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700)),
          ),
          InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: () => MainShellNavigator.of(context)?.navigateTo(2),
            child: Padding(
              padding: const EdgeInsets.all(4),
              child: Text('Voir la liste',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color:
                          isDark ? AppColors.accent : AppColors.primaryLight)),
            ),
          ),
        ]),
        const SizedBox(height: 4),
        if (retirees.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text('Aucun repas servi pour ce menu',
                style: TextStyle(fontSize: 12.5, color: gris)),
          ),
        for (final c in retirees.take(5))
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 7),
            child: Row(children: [
              const Icon(Icons.check_circle_rounded,
                  size: 17, color: AppColors.accentDark),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                    [c.userNom, if (c.platDetail != null) c.platDetail!.nom]
                        .join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context)
                        .textTheme
                        .bodyLarge
                        ?.copyWith(fontSize: 12.5)),
              ),
              const PastilleStatut(label: 'Retiré', ton: TonPastille.vert),
            ]),
          ),
      ]),
    );
  }

  /// Renvoie false si la lecture est ignorée : le scanner reste alors actif.
  bool _onBadgeScan(String value) {
    // Requête en cours (recherche ou validation) : on ne remplace pas le
    // badge affiché, la prochaine lecture sera prise en compte.
    if (context.read<RetraitProvider>().loading) return false;
    // Scanner coupé après une lecture, jusqu'au prochain appui sur « Scanner »
    setState(() {
      _badgeCtrl.text = value;
      _scanMode = false;
    });
    _rechercher();
    return true;
  }

  void _rechercher() {
    final badge = _badgeCtrl.text.trim();
    if (badge.isEmpty) return;
    final menu = _menuSelectionne;
    if (menu == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text("Sélectionnez d'abord le menu concerné.")));
      return;
    }
    context.read<RetraitProvider>().rechercherParBadge(badge, menu.id);
  }

  Future<void> _validerRetrait(
      RetraitProvider rProv, RechercheParBadgeResult result) async {
    final menu = _menuSelectionne;
    if (menu == null) return;
    final ok = await rProv.validerRetrait(result.userId, menu.id, result.badge);
    if (!ok || !mounted) return;
    _servisIci
      ..remove(result.userNom)
      ..insert(0, result.userNom);
    _chargerStats();
  }
}

class _Compteur extends StatelessWidget {
  final int n;
  final String libelle;
  const _Compteur(this.n, this.libelle);

  @override
  Widget build(BuildContext context) => Text.rich(
      TextSpan(children: [
        TextSpan(
            text: '$n ',
            style: const TextStyle(
                color: Colors.white, fontWeight: FontWeight.w700)),
        TextSpan(text: libelle),
      ]),
      style: TextStyle(fontSize: 11, color: Colors.white.withOpacity(0.7)));
}

// ── Résultat de recherche ──────────────────────────────────────

class _ResultatCard extends StatelessWidget {
  final RechercheParBadgeResult result;
  final String? agence;
  final VoidCallback onValider;
  final bool loading;

  const _ResultatCard({
    required this.result,
    required this.agence,
    required this.onValider,
    required this.loading,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final enAttente =
        result.commandes.any((c) => c.statut == StatutCommande.enAttente);
    final aServir = !result.aRetire && enAttente;
    final PastilleStatut pastille = result.aRetire
        ? const PastilleStatut(
            label: 'Déjà retiré',
            icone: Icons.check_rounded,
            ton: TonPastille.vert)
        : aServir
            ? const PastilleStatut(label: 'À servir', ton: TonPastille.or)
            : const PastilleStatut(
                label: 'Rien à servir', ton: TonPastille.gris);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: aServir || result.aRetire
              ? AppColors.accentDark
              : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
          width: 2,
        ),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          AvatarNom(nom: result.userNom, photoUrl: result.photoUrl, taille: 46),
          const SizedBox(width: 12),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(result.userNom,
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontSize: 15, fontWeight: FontWeight.w700)),
              Text(
                  [
                    'Matricule ${result.badge}',
                    if ((agence ?? '').isNotEmpty) agence!,
                  ].join(' · '),
                  style: TextStyle(fontSize: 11.5, color: gris)),
            ]),
          ),
          const SizedBox(width: 8),
          pastille,
        ]),
        const SizedBox(height: 12),

        if (result.commandes.isEmpty || (!result.aRetire && !enAttente))
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: BandeauInfo(
              icone: Icons.warning_amber_rounded,
              ton: TonPastille.or,
              texte: result.commandes.isEmpty
                  ? 'Aucune commande pour ce menu'
                  : 'Aucune commande en attente (commande annulée)',
            ),
          ),
        ...result.commandes.map((c) => Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(9),
              decoration: BoxDecoration(
                color:
                    isDark ? AppColors.darkSurface : AppColors.lightBackground,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(children: [
                VignettePlat(url: c.platDetail?.imageUrl, taille: 38, rayon: 9),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(c.platDetail?.nom ?? 'Plat',
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.w700)),
                        if (c.platDetail?.typePlatLibelle != null)
                          Text(c.platDetail!.typePlatLibelle!,
                              style: TextStyle(fontSize: 11.5, color: gris)),
                      ]),
                ),
                StatutBadge(statut: c.statut),
              ]),
            )),

        // Bouton valider retrait (uniquement s'il reste une commande en attente)
        if (aServir)
          BoutonVert(
            label: 'Valider le retrait',
            icone: Icons.done_all_rounded,
            hauteur: 48,
            chargement: loading,
            onPressed: onValider,
          )
        else if (result.aRetire)
          const BandeauInfo(
            icone: Icons.check_circle_rounded,
            ton: TonPastille.vert,
            texte: 'Retrait déjà effectué',
          ),
      ]),
    );
  }
}

// ── Success card ───────────────────────────────────────────────

class _SuccessCard extends StatelessWidget {
  final String message;
  final String? nom;
  final VoidCallback onRetour;
  const _SuccessCard({required this.message, this.nom, required this.onRetour});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF1F9D55), Color(0xFF3EC970)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(children: [
        const Icon(Icons.check_circle_rounded, color: Colors.white, size: 52),
        const SizedBox(height: 8),
        Text(message,
            style: const TextStyle(
                color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700),
            textAlign: TextAlign.center),
        if (nom != null && nom!.isNotEmpty) ...[
          const SizedBox(height: 2),
          Text(nom!,
              style: TextStyle(
                  color: Colors.white.withOpacity(0.85), fontSize: 13),
              textAlign: TextAlign.center),
        ],
        const SizedBox(height: 14),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.white,
            side: const BorderSide(color: Colors.white),
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
          ),
          icon: const Icon(Icons.qr_code_scanner_rounded, size: 18),
          onPressed: onRetour,
          label: const Text('Nouveau retrait'),
        ),
      ]),
    );
  }
}

// ── Scanner QR/Badge ───────────────────────────────────────────

class _ScannerWidget extends StatefulWidget {
  /// Renvoie false si la lecture n'est pas prise en compte.
  final bool Function(String) onScan;
  const _ScannerWidget({required this.onScan});
  @override
  State<_ScannerWidget> createState() => _ScannerWidgetState();
}

class _ScannerWidgetState extends State<_ScannerWidget> {
  bool _scanned = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 240,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.accentDark, width: 2),
      ),
      clipBehavior: Clip.antiAlias,
      child: MobileScanner(
        onDetect: (capture) {
          if (_scanned) return;
          // QR code vide ou illisible : on continue de scanner
          final valeur = capture.barcodes.firstOrNull?.rawValue?.trim() ?? '';
          if (valeur.isEmpty) return;
          _scanned = widget.onScan(valeur);
        },
        // Caméra refusée ou indisponible : message explicite (avant : icône seule)
        errorBuilder: (context, erreur, _) => ColoredBox(
          color: Colors.black,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.no_photography_outlined,
                    color: Colors.white, size: 36),
                const SizedBox(height: 10),
                Text(
                  erreur.errorCode == MobileScannerErrorCode.permissionDenied
                      ? "Accès à la caméra refusé. Autorisez-le dans les "
                          "réglages du téléphone ou saisissez le badge."
                      : 'Caméra indisponible. Saisissez le badge manuellement.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                ),
              ]),
            ),
          ),
        ),
        // Cadre de visée : non affiché si la caméra est en erreur
        overlay: Stack(children: [
          Container(
            decoration: BoxDecoration(
              border: Border.all(
                  color: AppColors.primary.withOpacity(0.3), width: 40),
            ),
          ),
          Center(
              child: Container(
            width: 160,
            height: 160,
            decoration: BoxDecoration(
              border: Border.all(color: AppColors.primary, width: 3),
              borderRadius: BorderRadius.circular(12),
            ),
          )),
          Positioned(
            bottom: 12,
            left: 0,
            right: 0,
            child: Center(
                child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text('Pointez le badge vers la caméra',
                  style: TextStyle(color: Colors.white, fontSize: 12)),
            )),
          ),
        ]),
      ),
    );
  }
}
