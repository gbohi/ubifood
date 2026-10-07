// lib/features/commandes/commandes_screen.dart

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../shared/models/models.dart';
import '../../core/widgets/common_widgets.dart';

class CommandesScreen extends StatefulWidget {
  const CommandesScreen({super.key});
  @override
  State<CommandesScreen> createState() => _CommandesScreenState();
}

class _CommandesScreenState extends State<CommandesScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 4, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<CommandeProvider>().loadMesCommandes();
    });
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // Si on arrive via Navigator.push (gestionnaire),
    // le Navigator peut pop → on affiche un vrai AppBar
    final canPop = Navigator.of(context).canPop();
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        leading: canPop
            ? IconButton(
                icon: const Icon(Icons.arrow_back_ios_new_rounded),
                onPressed: () => Navigator.of(context).pop(),
                tooltip: 'Retour',
              )
            : null,
        title: canPop ? const Text('Mes commandes') : null,
        toolbarHeight: canPop ? kToolbarHeight : 0,
        actions: [
          if (canPop)
            IconButton(
              icon: const Icon(Icons.refresh_rounded),
              tooltip: 'Actualiser',
              onPressed: () =>
                  context.read<CommandeProvider>().loadMesCommandes(),
            ),
        ],
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          labelColor: isDark ? AppColors.accent : AppColors.primary,
          unselectedLabelColor: isDark
              ? AppColors.darkTextSecondary
              : AppColors.lightTextSecondary,
          indicatorColor: isDark ? AppColors.accent : AppColors.primary,
          indicatorSize: TabBarIndicatorSize.label,
          tabs: const [
            Tab(text: 'Toutes'),
            Tab(text: 'En attente'),
            Tab(text: 'Retirées'),
            Tab(text: 'Annulées'),
          ],
        ),
      ),
      body: Consumer<CommandeProvider>(builder: (_, cmdProv, __) {
        if (cmdProv.isLoading) {
          return ListView(
              padding: const EdgeInsets.all(16),
              children: List.generate(4, (_) => const ShimmerCard()));
        }
        return TabBarView(
          controller: _tabs,
          children: [
            _CommandesList(commandes: cmdProv.mesCommandes),
            _CommandesList(
                commandes: cmdProv.mesCommandes
                    .where((c) => c.statut == StatutCommande.enAttente)
                    .toList()),
            _CommandesList(
                commandes: cmdProv.mesCommandes
                    .where((c) => c.statut == StatutCommande.retiree)
                    .toList()),
            _CommandesList(
                commandes: cmdProv.mesCommandes
                    .where((c) => c.statut == StatutCommande.annulee)
                    .toList()),
          ],
        );
      }),
    );
  }
}

class _CommandesList extends StatelessWidget {
  final List<Commande> commandes;
  const _CommandesList({required this.commandes});

  @override
  Widget build(BuildContext context) {
    if (commandes.isEmpty) {
      return EmptyState(
        icon: Icons.receipt_long_outlined,
        title: 'Aucune commande',
        subtitle: 'Aucune commande dans cette catégorie',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: commandes.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (_, i) => _CommandeCard(commande: commandes[i]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// CARTE COMMANDE
// ══════════════════════════════════════════════════════════════

class _CommandeCard extends StatelessWidget {
  final Commande commande;
  const _CommandeCard({required this.commande});

  bool get _depasseDelai {
    final dateMenu = commande.menuDetail?.dateMenu != null
        ? DateTime.tryParse(commande.menuDetail!.dateMenu)
        : null;
    if (dateMenu == null) return true;
    final deadline = DateTime(dateMenu.year, dateMenu.month, dateMenu.day)
        .subtract(const Duration(hours: 48));
    return DateTime.now().isAfter(deadline);
  }

  String get _delaiMessage {
    final dateMenu = commande.menuDetail?.dateMenu != null
        ? DateTime.tryParse(commande.menuDetail!.dateMenu)
        : null;
    if (dateMenu == null) return '';
    final deadline = DateTime(dateMenu.year, dateMenu.month, dateMenu.day)
        .subtract(const Duration(hours: 48));
    final now = DateTime.now();
    if (now.isAfter(deadline)) return 'Délai d\'annulation dépassé';
    final diff = deadline.difference(now);
    if (diff.inHours < 1)
      return 'Annulation possible encore ${diff.inMinutes} min';
    if (diff.inHours < 24)
      return 'Annulation possible encore ${diff.inHours}h${diff.inMinutes.remainder(60).toString().padLeft(2, '0')}';
    return 'Annulation possible encore ${diff.inDays}j ${diff.inHours.remainder(24)}h';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final date = DateTime.tryParse(commande.dateCommande);
    final dateMenu = commande.menuDetail?.dateMenu;
    final menuDate = dateMenu != null ? DateTime.tryParse(dateMenu) : null;
    final peutAnnuler = commande.peutAnnuler && !_depasseDelai;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // ── Header ─────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.08),
                borderRadius: BorderRadius.circular(14),
              ),
              child: commande.platDetail?.imageUrl != null
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: Image.network(
                        commande.platDetail!.imageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const Icon(
                            Icons.restaurant_rounded,
                            color: AppColors.primary),
                      ),
                    )
                  : const Icon(Icons.restaurant_rounded,
                      color: AppColors.primary, size: 24),
            ),
            const SizedBox(width: 12),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(commande.platDetail?.nom ?? 'Plat',
                      style: Theme.of(context).textTheme.titleMedium,
                      overflow: TextOverflow.ellipsis),
                  if (commande.menuDetail != null)
                    Text(commande.menuDetail!.agenceNom,
                        style: Theme.of(context).textTheme.bodySmall),
                ])),
            StatutBadge(statut: commande.statut),
          ]),
        ),

        Divider(
            height: 1,
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder),

        // ── Détails ─────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.all(14),
          child: Column(children: [
            if (menuDate != null)
              _DetailRow(
                icon: Icons.calendar_today_rounded,
                label: 'Menu du',
                value: DateFormat('dd MMMM yyyy', 'fr_FR').format(menuDate),
              ),
            if (date != null)
              _DetailRow(
                icon: Icons.access_time_rounded,
                label: 'Commandé le',
                value: DateFormat('dd/MM/yyyy à HH:mm').format(date),
              ),
            if (commande.menuDetail != null)
              _DetailRow(
                icon: Icons.groups_rounded,
                label: 'Équipe',
                value: commande.menuDetail!.typeEquipeLibelle,
              ),

            // ── Badge délai ───────────────────────────────────
            if (commande.statut == StatutCommande.enAttente) ...[
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: _depasseDelai
                      ? AppColors.errorLight
                      : AppColors.accentLight,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                      color: _depasseDelai
                          ? AppColors.error.withOpacity(0.3)
                          : AppColors.accent.withOpacity(0.3)),
                ),
                child: Row(children: [
                  Icon(
                    _depasseDelai
                        ? Icons.lock_clock_rounded
                        : Icons.timer_outlined,
                    size: 14,
                    color: _depasseDelai ? AppColors.error : AppColors.accent,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                      child: Text(_delaiMessage,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: _depasseDelai
                                ? AppColors.error
                                : AppColors.accent,
                          ))),
                ]),
              ),
            ],

            // ── Bouton annuler ────────────────────────────────
            if (commande.statut == StatutCommande.enAttente) ...[
              const SizedBox(height: 12),
              if (peutAnnuler)
                Consumer<CommandeProvider>(
                  builder: (_, cmdProv, __) => AppButton(
                    label: 'Annuler la commande',
                    outlined: true,
                    color: AppColors.error,
                    icon: Icons.cancel_outlined,
                    loading: cmdProv.isLoading,
                    onPressed: () => _showAnnulerDialog(context, cmdProv),
                  ),
                )
              else
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color:
                        isDark ? AppColors.darkCard : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                        color: (isDark
                                ? AppColors.darkTextSecondary
                                : AppColors.lightTextSecondary)
                            .withOpacity(0.3)),
                  ),
                  child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.lock_outline_rounded,
                            size: 14,
                            color: isDark
                                ? AppColors.darkTextSecondary
                                : AppColors.lightTextSecondary),
                        const SizedBox(width: 6),
                        Text('Annulation impossible — délai de 48h dépassé',
                            style: TextStyle(
                                fontSize: 12,
                                color: isDark
                                    ? AppColors.darkTextSecondary
                                    : AppColors.lightTextSecondary,
                                fontWeight: FontWeight.w500)),
                      ]),
                ),
            ],
          ]),
        ),
      ]),
    );
  }

  void _showAnnulerDialog(BuildContext context, CommandeProvider cmdProv) {
    showDialog(
        context: context,
        builder: (dialogCtx) => AlertDialog(
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16)),
              title: const Row(children: [
                Icon(Icons.warning_amber_rounded, color: AppColors.warning),
                SizedBox(width: 8),
                Text('Annuler ?'),
              ]),
              content: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text('Voulez-vous annuler cette commande ?'),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.warningLight,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Row(children: [
                    Icon(Icons.info_outline_rounded,
                        color: AppColors.warning, size: 16),
                    SizedBox(width: 6),
                    Expanded(
                        child: Text(
                            'Toute annulation après 48h avant le menu est définitive.',
                            style: TextStyle(
                                fontSize: 12, color: AppColors.warning))),
                  ]),
                ),
              ]),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(dialogCtx),
                  child: const Text('Non, garder'),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.error,
                    foregroundColor: Colors.white,
                  ),
                  onPressed: () async {
                    Navigator.pop(dialogCtx);
                    final ok = await cmdProv.annuler(commande.id);
                    if (ok && context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                        content: const Row(children: [
                          Icon(Icons.check_rounded, color: Colors.white),
                          SizedBox(width: 8),
                          Text('Commande annulée'),
                        ]),
                        backgroundColor: AppColors.warning,
                        behavior: SnackBarBehavior.floating,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10)),
                        margin: const EdgeInsets.all(12),
                      ));
                    }
                  },
                  child: const Text('Oui, annuler'),
                ),
              ],
            ));
  }
}

// ── Ligne de détail ────────────────────────────────────────────

class _DetailRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _DetailRow(
      {required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(children: [
        Icon(icon,
            size: 15,
            color: isDark
                ? AppColors.darkTextSecondary
                : AppColors.lightTextSecondary),
        const SizedBox(width: 8),
        Text('$label : ', style: Theme.of(context).textTheme.bodySmall),
        Expanded(
            child: Text(value,
                style: Theme.of(context).textTheme.labelMedium,
                overflow: TextOverflow.ellipsis)),
      ]),
    );
  }
}
