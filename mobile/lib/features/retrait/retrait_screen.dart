// lib/features/retrait/retrait_screen.dart

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
    final agenceId = isAdmin ? null : user?.derniereAgenceId;

    if (!isAdmin && agenceId == null) {
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
      final menus = await menuService.getMenusRetrait(agenceId: agenceId);
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
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _menusLoading = false;
        _menusErreur =
            messageErreurApi(e) ?? 'Erreur de chargement des menus';
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

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scannez le QR code'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _menusLoading ? null : _chargerMenus,
            tooltip: 'Actualiser les menus',
          ),
          IconButton(
            icon: Icon(_scanMode
                ? Icons.keyboard_rounded
                : Icons.qr_code_scanner_rounded),
            onPressed: () => setState(() => _scanMode = !_scanMode),
            tooltip: _scanMode ? 'Saisie manuelle' : 'Scanner QR',
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // ── Sélection menu ────────────────────────────────
          Text('Menu concerné', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 10),
          Consumer<AuthProvider>(builder: (_, auth, __) {
            if (_menusLoading) return const ShimmerCard(height: 56);

            final isAdmin = auth.user?.isAdmin ?? false;
            final agenceNom = auth.user?.derniereAgence ?? '';

            if (_menusErreur != null) {
              return Container(
                padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
                decoration: BoxDecoration(
                  color: AppColors.errorLight,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.error.withOpacity(0.3)),
                ),
                child: Row(children: [
                  const Icon(Icons.error_outline_rounded,
                      color: AppColors.error, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(_menusErreur!,
                        style: const TextStyle(color: AppColors.error)),
                  ),
                  TextButton(
                    onPressed: _chargerMenus,
                    child: const Text('Réessayer'),
                  ),
                ]),
              );
            }

            if (_menus.isEmpty) {
              return Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.warningLight,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.warning.withOpacity(0.3)),
                ),
                child: Row(children: [
                  const Icon(Icons.warning_amber_rounded,
                      color: AppColors.warning, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                        isAdmin || agenceNom.isEmpty
                            ? 'Aucun menu disponible'
                            : 'Aucun menu disponible pour $agenceNom',
                        style: const TextStyle(color: AppColors.warning)),
                  ),
                ]),
              );
            }

            return Container(
              decoration: BoxDecoration(
                color: isDark ? AppColors.darkCard : AppColors.lightCard,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color:
                        isDark ? AppColors.darkBorder : AppColors.lightBorder),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<int>(
                  value: _menuSelectionne?.id,
                  isExpanded: true,
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  borderRadius: BorderRadius.circular(12),
                  hint: Text(isAdmin || agenceNom.isEmpty
                      ? 'Choisissez un menu'
                      : 'Menu de $agenceNom'),
                  items: _menus.map((m) {
                    final date = DateTime.tryParse(m.dateMenu);
                    final dateStr = date != null
                        ? DateFormat('EEE dd/MM/yyyy', 'fr_FR').format(date)
                        : m.dateMenu;
                    final parts = [
                      m.isToday ? "Aujourd'hui — $dateStr" : dateStr,
                      if (isAdmin && m.agenceNom.isNotEmpty) m.agenceNom,
                      if (m.typeEquipeLibelle.isNotEmpty) m.typeEquipeLibelle,
                    ];
                    return DropdownMenuItem<int>(
                      value: m.id,
                      child: Text(parts.join(' • '),
                          overflow: TextOverflow.ellipsis),
                    );
                  }).toList(),
                  onChanged: (id) {
                    setState(() => _menuId = id);
                    context.read<RetraitProvider>().reset();
                  },
                ),
              ),
            );
          }),

          const SizedBox(height: 24),

          // ── Recherche badge ───────────────────────────────
          Text('Matricule', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 10),

          if (_scanMode && _visible)
            _ScannerWidget(onScan: _onBadgeScan)
          else
            Row(children: [
              Expanded(
                child: TextField(
                  controller: _badgeCtrl,
                  decoration: const InputDecoration(
                    hintText: 'Saisir le badge...',
                    prefixIcon:
                        Icon(Icons.badge_outlined, color: AppColors.primary),
                  ),
                  onSubmitted: (_) => _rechercher(),
                ),
              ),
              const SizedBox(width: 10),
              Consumer<RetraitProvider>(
                builder: (_, rProv, __) => ElevatedButton(
                  onPressed: rProv.loading ? null : _rechercher,
                  style: ElevatedButton.styleFrom(
                    minimumSize: const Size(56, 56),
                    padding: EdgeInsets.zero,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  child: rProv.loading
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.search_rounded),
                ),
              ),
            ]),

          const SizedBox(height: 24),

          // ── Résultat recherche ────────────────────────────
          Consumer<RetraitProvider>(builder: (_, rProv, __) {
            if (rProv.error != null) {
              return Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.errorLight,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.error.withOpacity(0.3)),
                ),
                child: Row(children: [
                  const Icon(Icons.error_outline_rounded,
                      color: AppColors.error),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(rProv.error!,
                        style: const TextStyle(color: AppColors.error)),
                  ),
                ]),
              );
            }

            if (rProv.successMessage != null) {
              return _SuccessCard(
                  message: rProv.successMessage!,
                  onRetour: () {
                    _badgeCtrl.clear();
                    rProv.reset();
                  });
            }

            if (rProv.result == null) return const SizedBox.shrink();

            final result = rProv.result!;
            return _ResultatCard(
              result: result,
              onValider: () => _validerRetrait(rProv, result),
              loading: rProv.loading,
            );
          }),
        ]),
      ),
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

  void _validerRetrait(RetraitProvider rProv, RechercheParBadgeResult result) {
    final menu = _menuSelectionne;
    if (menu == null) return;
    rProv.validerRetrait(result.userId, menu.id, result.badge);
  }
}

// ── Résultat de recherche ──────────────────────────────────────

class _ResultatCard extends StatelessWidget {
  final RechercheParBadgeResult result;
  final VoidCallback onValider;
  final bool loading;

  const _ResultatCard({
    required this.result,
    required this.onValider,
    required this.loading,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: result.aRetire ? AppColors.success : AppColors.primary,
          width: 1.5,
        ),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Agent info
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: result.aRetire
                ? AppColors.success.withOpacity(0.08)
                : AppColors.primary.withOpacity(0.06),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
          ),
          child: Row(children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: result.aRetire
                    ? AppColors.success.withOpacity(0.15)
                    : AppColors.primary.withOpacity(0.1),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(
                result.aRetire
                    ? Icons.check_circle_rounded
                    : Icons.person_rounded,
                color: result.aRetire ? AppColors.success : AppColors.primary,
                size: 26,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(result.userNom,
                      style: Theme.of(context).textTheme.titleMedium),
                  Text('Badge : ${result.badge}',
                      style: Theme.of(context).textTheme.bodySmall),
                ])),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: result.aRetire
                    ? AppColors.successLight
                    : AppColors.infoLight,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                result.aRetire ? 'Déjà retiré' : 'Non retiré',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: result.aRetire ? AppColors.success : AppColors.primary,
                ),
              ),
            ),
          ]),
        ),

        Padding(
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // Commandes
            Text('Commande(s)', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 10),

            if (result.commandes.isEmpty ||
                (!result.aRetire &&
                    !result.commandes
                        .any((c) => c.statut == StatutCommande.enAttente)))
              Container(
                margin: EdgeInsets.only(
                    bottom: result.commandes.isEmpty ? 0 : 10),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.warningLight,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(children: [
                  const Icon(Icons.warning_amber_rounded,
                      color: AppColors.warning, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                        result.commandes.isEmpty
                            ? 'Aucune commande pour ce menu'
                            : 'Aucune commande en attente (commande annulée)',
                        style: const TextStyle(
                            color: AppColors.warning,
                            fontWeight: FontWeight.w500)),
                  ),
                ]),
              ),
            ...result.commandes.map((c) => Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: isDark
                          ? AppColors.darkSurface
                          : AppColors.lightBackground,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(children: [
                      const Icon(Icons.restaurant_rounded,
                          size: 16, color: AppColors.primary),
                      const SizedBox(width: 8),
                      Expanded(
                          child: Text(c.platDetail?.nom ?? 'Plat',
                              style: Theme.of(context).textTheme.titleSmall)),
                      StatutBadge(statut: c.statut),
                    ]),
                  )),

            const SizedBox(height: 14),

            // Bouton valider retrait (uniquement s'il reste une commande en attente)
            if (!result.aRetire &&
                result.commandes
                    .any((c) => c.statut == StatutCommande.enAttente))
              AppButton(
                label: 'Valider le retrait',
                icon: Icons.done_all_rounded,
                loading: loading,
                onPressed: onValider,
              )
            else if (result.aRetire)
              Container(
                padding: const EdgeInsets.symmetric(vertical: 14),
                decoration: BoxDecoration(
                  color: AppColors.successLight,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.check_circle_rounded,
                          color: AppColors.success),
                      SizedBox(width: 8),
                      Text('Retrait déjà effectué',
                          style: TextStyle(
                              color: AppColors.success,
                              fontWeight: FontWeight.w600)),
                    ]),
              ),
          ]),
        ),
      ]),
    );
  }
}

// ── Success card ───────────────────────────────────────────────

class _SuccessCard extends StatelessWidget {
  final String message;
  final VoidCallback onRetour;
  const _SuccessCard({required this.message, required this.onRetour});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.success, Color(0xFF00A846)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
              color: AppColors.success.withOpacity(0.3),
              blurRadius: 20,
              offset: const Offset(0, 8)),
        ],
      ),
      child: Column(children: [
        const Icon(Icons.check_circle_rounded, color: Colors.white, size: 64),
        const SizedBox(height: 12),
        Text(message,
            style: const TextStyle(
                color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700),
            textAlign: TextAlign.center),
        const SizedBox(height: 20),
        OutlinedButton(
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.white,
            side: const BorderSide(color: Colors.white),
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
          ),
          onPressed: onRetour,
          child: const Text('Nouveau retrait'),
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
        border: Border.all(color: AppColors.primary, width: 2),
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
