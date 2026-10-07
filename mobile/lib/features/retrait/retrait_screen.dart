// lib/features/retrait/retrait_screen.dart

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../shared/models/models.dart';
import '../../core/widgets/common_widgets.dart';

class RetraitScreen extends StatefulWidget {
  const RetraitScreen({super.key});
  @override
  State<RetraitScreen> createState() => _RetraitScreenState();
}

class _RetraitScreenState extends State<RetraitScreen> {
  final _badgeCtrl = TextEditingController();
  Menu? _menuSelectionne;
  bool _scanMode = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = context.read<AuthProvider>();
      final agenceId = auth.user?.derniereAgenceId;
      // Charger uniquement les menus de l'agence du gestionnaire
      context.read<MenuProvider>().loadMenus(agenceId: agenceId);
      context.read<RetraitProvider>().reset();
    });
  }

  @override
  void dispose() {
    _badgeCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Cliquez sur le Qrcode'),
        actions: [
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
          Consumer2<MenuProvider, AuthProvider>(
              builder: (_, menuProv, auth, __) {
            if (menuProv.loading) return const ShimmerCard(height: 56);

            // Filtrer côté client aussi par sécurité
            final agenceId = auth.user?.derniereAgenceId;
            final agenceNom = auth.user?.derniereAgence ?? '';
            final menus = agenceId != null
                ? menuProv.menus.where((m) => m.agenceId == agenceId).toList()
                : menuProv.menus;

            if (menus.isEmpty) {
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
                  Text('Aucun menu disponible pour $agenceNom',
                      style: const TextStyle(color: AppColors.warning)),
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
                child: DropdownButton<Menu>(
                  value: _menuSelectionne,
                  isExpanded: true,
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  borderRadius: BorderRadius.circular(12),
                  hint: Text('Menu de $agenceNom'),
                  items: menus.map((m) {
                    final date = DateTime.tryParse(m.dateMenu);
                    final dateStr = date != null
                        ? DateFormat('EEE dd/MM/yyyy', 'fr_FR').format(date)
                        : m.dateMenu;
                    final label = m.isToday
                        ? "Aujourd'hui — $dateStr • ${m.agenceNom}"
                        : "$dateStr • ${m.agenceNom}";
                    return DropdownMenuItem(
                      value: m,
                      child: Text(label, overflow: TextOverflow.ellipsis),
                    );
                  }).toList(),
                  onChanged: (m) {
                    setState(() => _menuSelectionne = m);
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

          if (_scanMode)
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
                  onPressed: _menuSelectionne == null ? null : _rechercher,
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
                  Text(rProv.error!,
                      style: const TextStyle(color: AppColors.error)),
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
              menu: _menuSelectionne!,
              onValider: () => _validerRetrait(rProv, result),
              loading: rProv.loading,
            );
          }),
        ]),
      ),
    );
  }

  void _onBadgeScan(String value) {
    setState(() {
      _badgeCtrl.text = value;
      _scanMode = false;
    });
    _rechercher();
  }

  void _rechercher() {
    if (_menuSelectionne == null || _badgeCtrl.text.trim().isEmpty) return;
    context.read<RetraitProvider>().rechercherParBadge(
          _badgeCtrl.text.trim(),
          _menuSelectionne!.id,
        );
  }

  void _validerRetrait(RetraitProvider rProv, RechercheParBadgeResult result) {
    rProv.validerRetrait(result.userId, _menuSelectionne!.id, result.badge);
  }
}

// ── Résultat de recherche ──────────────────────────────────────

class _ResultatCard extends StatelessWidget {
  final RechercheParBadgeResult result;
  final Menu menu;
  final VoidCallback onValider;
  final bool loading;

  const _ResultatCard({
    required this.result,
    required this.menu,
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

            if (result.commandes.isEmpty)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.warningLight,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Row(children: [
                  Icon(Icons.warning_amber_rounded,
                      color: AppColors.warning, size: 18),
                  SizedBox(width: 8),
                  Text('Aucune commande en attente',
                      style: TextStyle(
                          color: AppColors.warning,
                          fontWeight: FontWeight.w500)),
                ]),
              )
            else
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

            // Bouton valider retrait
            if (!result.aRetire && result.commandes.isNotEmpty)
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
  final ValueChanged<String> onScan;
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
      child: Stack(children: [
        MobileScanner(
          onDetect: (capture) {
            if (_scanned) return;
            final barcode = capture.barcodes.firstOrNull;
            if (barcode?.rawValue != null) {
              _scanned = true;
              widget.onScan(barcode!.rawValue!);
            }
          },
        ),
        // Overlay
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
    );
  }
}
