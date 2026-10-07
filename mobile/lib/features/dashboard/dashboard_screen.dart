// lib/features/dashboard/dashboard_screen.dart

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../shared/models/models.dart';
import '../../core/widgets/common_widgets.dart';
import '../profil/qr_code_screen.dart';
import '../commandes/commandes_screen.dart';
import '../facturation/facturation_screen.dart';
import '../notifications/notification_screen.dart'; // ✅ AJOUTÉ

// ── InheritedWidget pour navigation depuis Dashboard ──────────
class MainShellNavigator extends InheritedWidget {
  final void Function(int index) navigateTo;
  const MainShellNavigator({
    super.key,
    required this.navigateTo,
    required super.child,
  });
  static MainShellNavigator? of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<MainShellNavigator>();
  @override
  bool updateShouldNotify(MainShellNavigator old) =>
      navigateTo != old.navigateTo;
}

class DashboardScreen extends StatefulWidget {
  final VoidCallback? onOpenDrawer;
  const DashboardScreen({super.key, this.onOpenDrawer});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<MenuProvider>().loadMenus(
          agenceId: context.read<AuthProvider>().user?.derniereAgenceId);
      context.read<CommandeProvider>().loadMesCommandes();
    });
  }

  void _goCommandes(BuildContext context) {
    final auth = context.read<AuthProvider>();
    if (auth.isGestionnaire) {
      Navigator.push(
          context, MaterialPageRoute(builder: (_) => const CommandesScreen()));
    } else {
      MainShellNavigator.of(context)?.navigateTo(2);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final now = DateFormat('EEEE d MMMM yyyy', 'fr_FR').format(DateTime.now());

    return Scaffold(
      body: RefreshIndicator(
        color: AppColors.accent,
        backgroundColor: AppColors.primary,
        displacement: 90,
        notificationPredicate: (notification) => notification.depth == 0,
        onRefresh: () async {
          await Future.wait([
            context.read<MenuProvider>().loadMenus(
                agenceId: context.read<AuthProvider>().user?.derniereAgenceId),
            context.read<CommandeProvider>().loadMesCommandes(),
          ]);
        },
        child: CustomScrollView(slivers: [
          // ── SliverAppBar ──────────────────────────────────
          SliverAppBar(
            expandedHeight: 80,
            collapsedHeight: 80,
            floating: false,
            pinned: true,
            snap: false,
            automaticallyImplyLeading: false,
            backgroundColor: AppColors.primary,
            flexibleSpace: FlexibleSpaceBar(
              collapseMode: CollapseMode.none,
              background: Container(
                decoration:
                    const BoxDecoration(gradient: AppColors.heroGradient),
                child: SafeArea(
                  bottom: false,
                  child: SizedBox(
                    height: 80,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 4, vertical: 8),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          // Hamburger
                          IconButton(
                            icon: const Icon(Icons.menu_rounded,
                                color: Colors.white, size: 22),
                            onPressed: () => widget.onOpenDrawer?.call(),
                            tooltip: 'Menu',
                          ),

                          // Avatar
                          Container(
                            width: 38,
                            height: 38,
                            decoration: BoxDecoration(
                                color: AppColors.accent.withOpacity(0.2),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                    color: AppColors.accent.withOpacity(0.4))),
                            child: Center(
                                child: Text(
                                    auth.user?.nom.isNotEmpty == true
                                        ? auth.user!.nom[0].toUpperCase()
                                        : 'U',
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 16,
                                        fontWeight: FontWeight.w700))),
                          ),
                          const SizedBox(width: 8),

                          // Nom + Date
                          Expanded(
                              child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.center,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text('Bonjour,',
                                  style: TextStyle(
                                      color: Colors.white.withOpacity(0.7),
                                      fontSize: 11)),
                              Text(auth.user?.fullName ?? 'Utilisateur',
                                  style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700),
                                  overflow: TextOverflow.ellipsis,
                                  maxLines: 1),
                              Text(now,
                                  style: TextStyle(
                                      color: Colors.white.withOpacity(0.6),
                                      fontSize: 10),
                                  overflow: TextOverflow.ellipsis,
                                  maxLines: 1),
                            ],
                          )),

                          const SizedBox(width: 4),

                          // ✅ Cloche notifications
                          _DashboardNotificationBell(),

                          const SizedBox(width: 4),

                          // QR Code
                          GestureDetector(
                            onTap: () => Navigator.push(
                                context,
                                MaterialPageRoute(
                                    builder: (_) => const QrCodeScreen())),
                            child: Container(
                              width: 52,
                              height: 52,
                              padding: const EdgeInsets.all(2),
                              decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(
                                      color: AppColors.accent, width: 2)),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(5),
                                child: QrImageView(
                                  data: auth.user?.username ?? '',
                                  version: QrVersions.auto,
                                  size: 48,
                                  padding: EdgeInsets.zero,
                                  eyeStyle: const QrEyeStyle(
                                      eyeShape: QrEyeShape.square,
                                      color: Color(0xFF092440)),
                                  dataModuleStyle: const QrDataModuleStyle(
                                      dataModuleShape: QrDataModuleShape.square,
                                      color: Color(0xFF092440)),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 4),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),

          // ── Contenu ──────────────────────────────────────
          SliverToBoxAdapter(
              child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _BannerSlider(),
              const SizedBox(height: 20),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Menu du jour
                    Consumer<MenuProvider>(builder: (_, menuProv, __) {
                      if (menuProv.loading)
                        return const ShimmerCard(height: 130);
                      final menu = menuProv.menuDuJour;
                      return menu != null
                          ? _MenuDuJourCard(menu: menu)
                          : _NoMenuCard();
                    }),

                    const SizedBox(height: 24),

                    // Stats commandes
                    SectionHeader(
                      title: 'Mes commandes',
                      action: 'Voir tout',
                      onAction: () => _goCommandes(context),
                    ),
                    const SizedBox(height: 12),

                    Consumer<CommandeProvider>(builder: (_, cmdProv, __) {
                      if (cmdProv.isLoading) {
                        return GridView.count(
                          crossAxisCount: 2,
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                          childAspectRatio: 1.5,
                          children: List.generate(
                              4, (_) => const ShimmerCard(height: 100)),
                        );
                      }
                      return GridView.count(
                        crossAxisCount: 2,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                        childAspectRatio: 1.5,
                        children: [
                          StatCard(
                            label: 'Total',
                            value: cmdProv.totalCommandes.toString(),
                            icon: Icons.receipt_long_rounded,
                            color: AppColors.primary,
                            onTap: () => _goCommandes(context),
                          ),
                          StatCard(
                            label: 'En attente',
                            value: cmdProv.enAttente.toString(),
                            icon: Icons.schedule_rounded,
                            color: AppColors.warning,
                            onTap: () => _goCommandes(context),
                          ),
                          StatCard(
                            label: 'Retirées',
                            value: cmdProv.retirees.toString(),
                            icon: Icons.check_circle_rounded,
                            color: AppColors.success,
                            onTap: () => _goCommandes(context),
                          ),
                          StatCard(
                            label: 'Annulées',
                            value: cmdProv.annulees.toString(),
                            icon: Icons.cancel_rounded,
                            color: isDark
                                ? AppColors.darkTextSecondary
                                : AppColors.lightTextSecondary,
                            onTap: () => _goCommandes(context),
                          ),
                        ],
                      );
                    }),

                    const SizedBox(height: 24),

                    // Actions rapides
                    SectionHeader(title: 'Actions rapides'),
                    const SizedBox(height: 12),
                    _QuickActionsGrid(),

                    const SizedBox(height: 24),

                    // Dernières commandes
                    SectionHeader(
                      title: 'Récentes',
                      action: 'Tout voir',
                      onAction: () => _goCommandes(context),
                    ),
                    const SizedBox(height: 12),

                    Consumer<CommandeProvider>(builder: (_, cmdProv, __) {
                      if (cmdProv.isLoading) {
                        return Column(
                            children:
                                List.generate(3, (_) => const ShimmerCard()));
                      }
                      final recentes = cmdProv.mesCommandes.take(3).toList();
                      if (recentes.isEmpty) {
                        return EmptyState(
                          icon: Icons.receipt_outlined,
                          title: 'Aucune commande',
                          subtitle: 'Commandez depuis le menu du jour',
                          action: TextButton.icon(
                            icon: const Icon(Icons.restaurant_menu_rounded,
                                size: 16),
                            label: const Text('Voir le menu'),
                            onPressed: () =>
                                MainShellNavigator.of(context)?.navigateTo(1),
                          ),
                        );
                      }
                      return Column(
                          children: recentes
                              .map((c) => _CommandeItem(commande: c))
                              .toList());
                    }),

                    const SizedBox(height: 80),
                  ],
                ),
              ),
            ],
          )),
        ]),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// ✅ CLOCHE NOTIFICATIONS POUR LE DASHBOARD
// Style blanc adapté au fond sombre de la SliverAppBar
// ══════════════════════════════════════════════════════════════

class _DashboardNotificationBell extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final count = context.watch<NotificationProvider>().nonLues;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          icon: const Icon(
            Icons.notifications_rounded,
            color: Colors.white,
            size: 22,
          ),
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const NotificationScreen()),
          ),
          tooltip: 'Notifications',
        ),
        if (count > 0)
          Positioned(
            top: 6,
            right: 6,
            child: IgnorePointer(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                width: count > 9 ? 18 : 16,
                height: 16,
                decoration: const BoxDecoration(
                  color: AppColors.error,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    count > 99 ? '99+' : '$count',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

// ══════════════════════════════════════════════════════════════
// SLIDER DE BANNIÈRES
// ══════════════════════════════════════════════════════════════

class _BannerSlider extends StatefulWidget {
  const _BannerSlider();
  @override
  State<_BannerSlider> createState() => _BannerSliderState();
}

class _BannerSliderState extends State<_BannerSlider> {
  final PageController _ctrl = PageController(viewportFraction: 0.92);
  int _current = 0;
  Timer? _timer;

  static const _slides = [
    'assets/images/slide1.svg',
    'assets/images/slide2.svg',
    'assets/images/slide3.svg',
    'assets/images/slide4.svg',
  ];

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted) return;
      final next = (_current + 1) % _slides.length;
      _ctrl.animateToPage(next,
          duration: const Duration(milliseconds: 500), curve: Curves.easeInOut);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      SizedBox(
        height: 170,
        child: PageView.builder(
          controller: _ctrl,
          itemCount: _slides.length,
          onPageChanged: (i) => setState(() => _current = i),
          itemBuilder: (_, i) => AnimatedScale(
            duration: const Duration(milliseconds: 300),
            scale: _current == i ? 1.0 : 0.96,
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                      color: Colors.black.withOpacity(0.18),
                      blurRadius: 16,
                      offset: const Offset(0, 6))
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: SvgPicture.asset(_slides[i],
                    fit: BoxFit.cover, width: double.infinity, height: 154),
              ),
            ),
          ),
        ),
      ),
      const SizedBox(height: 4),
      Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(
          _slides.length,
          (i) => AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            margin: const EdgeInsets.symmetric(horizontal: 3),
            width: _current == i ? 20 : 6,
            height: 6,
            decoration: BoxDecoration(
                color: _current == i
                    ? AppColors.accent
                    : AppColors.accent.withOpacity(0.3),
                borderRadius: BorderRadius.circular(3)),
          ),
        ),
      ),
    ]);
  }
}

// ══════════════════════════════════════════════════════════════
// MENU DU JOUR CARD
// ══════════════════════════════════════════════════════════════

class _MenuDuJourCard extends StatelessWidget {
  final Menu menu;
  const _MenuDuJourCard({required this.menu});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => MainShellNavigator.of(context)?.navigateTo(1),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
              colors: [AppColors.primary, AppColors.primaryLight],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
                color: AppColors.primary.withOpacity(0.3),
                blurRadius: 20,
                offset: const Offset(0, 8))
          ],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(20)),
              child: const Text("Aujourd'hui",
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w600)),
            ),
            const Spacer(),
            const Icon(Icons.arrow_forward_ios_rounded,
                color: Colors.white, size: 14),
          ]),
          const SizedBox(height: 12),
          const Text('Menu du jour',
              style: TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(
              '${menu.menuPlats.length} plat(s) • ${menu.agenceNom} • ${menu.typeEquipeLibelle}',
              style: TextStyle(
                  color: Colors.white.withOpacity(0.8), fontSize: 13)),
          if (menu.menuPlats.isNotEmpty) ...[
            const SizedBox(height: 12),
            SizedBox(
                height: 60,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: menu.menuPlats.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, i) {
                    final plat = menu.menuPlats[i].plat;
                    return Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(12)),
                      child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.restaurant_rounded,
                                color: Colors.white, size: 16),
                            const SizedBox(height: 4),
                            Text(plat.nom,
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w500),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis),
                          ]),
                    );
                  },
                )),
          ],
        ]),
      ),
    );
  }
}

class _NoMenuCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
          color: isDark ? AppColors.darkCard : AppColors.lightCard,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: isDark ? AppColors.darkBorder : AppColors.lightBorder)),
      child: Row(children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
              color: AppColors.warning.withOpacity(0.1),
              borderRadius: BorderRadius.circular(14)),
          child: const Icon(Icons.no_meals_rounded,
              color: AppColors.warning, size: 24),
        ),
        const SizedBox(width: 14),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text("Pas de menu aujourd'hui",
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 2),
          Text('Consultez les menus à venir',
              style: Theme.of(context).textTheme.bodySmall),
        ])),
        TextButton(
          onPressed: () => MainShellNavigator.of(context)?.navigateTo(1),
          child: const Text('Voir'),
        ),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// ACTIONS RAPIDES
// ══════════════════════════════════════════════════════════════

class _QuickActionsGrid extends StatelessWidget {
  static Color _c(Color color, bool isDark) =>
      (isDark && color == AppColors.primary) ? AppColors.accent : color;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final actions = [
      _QuickAction(
        icon: Icons.restaurant_menu_rounded,
        label: 'Menu',
        color: AppColors.primary,
        onTap: () => MainShellNavigator.of(context)?.navigateTo(1),
      ),
      _QuickAction(
        icon: Icons.receipt_long_rounded,
        label: 'Commandes',
        color: AppColors.success,
        onTap: () {
          if (auth.isGestionnaire) {
            Navigator.push(context,
                MaterialPageRoute(builder: (_) => const CommandesScreen()));
          } else {
            MainShellNavigator.of(context)?.navigateTo(2);
          }
        },
      ),
      _QuickAction(
        icon: Icons.account_balance_wallet_rounded,
        label: 'Facturation',
        color: AppColors.accent,
        onTap: () {
          if (auth.isGestionnaire) {
            Navigator.push(context,
                MaterialPageRoute(builder: (_) => const FacturationScreen()));
          } else {
            MainShellNavigator.of(context)?.navigateTo(3);
          }
        },
      ),
      if (auth.isGestionnaire)
        _QuickAction(
          icon: Icons.qr_code_scanner_rounded,
          label: 'Retrait',
          color: AppColors.warning,
          onTap: () => MainShellNavigator.of(context)?.navigateTo(3),
        ),
    ];

    return Row(
        children: actions
            .map((a) => Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: GestureDetector(
                      onTap: a.onTap,
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        decoration: BoxDecoration(
                            color: isDark
                                ? AppColors.darkCard
                                : AppColors.lightCard,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                                color: isDark
                                    ? AppColors.darkBorder
                                    : AppColors.lightBorder)),
                        child: Column(children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                                color: _c(a.color, isDark).withOpacity(0.1),
                                borderRadius: BorderRadius.circular(12)),
                            child: Icon(a.icon,
                                color: _c(a.color, isDark), size: 20),
                          ),
                          const SizedBox(height: 8),
                          Text(a.label,
                              style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  color: isDark
                                      ? AppColors.darkTextPrimary
                                      : AppColors.lightTextPrimary)),
                        ]),
                      ),
                    ),
                  ),
                ))
            .toList());
  }
}

class _QuickAction {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });
}

class _CommandeItem extends StatelessWidget {
  final Commande commande;
  const _CommandeItem({required this.commande});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final date = DateTime.tryParse(commande.dateCommande);
    final dateStr =
        date != null ? DateFormat('dd/MM/yyyy à HH:mm').format(date) : '';
    final dateMenu = commande.menuDetail?.dateMenu != null
        ? DateTime.tryParse(commande.menuDetail!.dateMenu)
        : null;

    return GestureDetector(
      onTap: () {
        final auth = context.read<AuthProvider>();
        if (auth.isGestionnaire) {
          Navigator.push(context,
              MaterialPageRoute(builder: (_) => const CommandesScreen()));
        } else {
          MainShellNavigator.of(context)?.navigateTo(2);
        }
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: isDark ? AppColors.darkCard : AppColors.lightCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder)),
        child: Row(children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.08),
                borderRadius: BorderRadius.circular(12)),
            child: commande.platDetail?.imageUrl != null
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.network(commande.platDetail!.imageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const Icon(
                            Icons.restaurant_rounded,
                            color: AppColors.primary,
                            size: 22)))
                : const Icon(Icons.restaurant_rounded,
                    color: AppColors.primary, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(commande.platDetail?.nom ?? 'Plat',
                    style: Theme.of(context).textTheme.titleSmall,
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(
                    dateMenu != null
                        ? 'Menu du ${DateFormat('dd/MM/yyyy').format(dateMenu)}'
                        : dateStr,
                    style: Theme.of(context).textTheme.bodySmall),
              ])),
          const SizedBox(width: 8),
          StatutBadge(statut: commande.statut),
        ]),
      ),
    );
  }
}
