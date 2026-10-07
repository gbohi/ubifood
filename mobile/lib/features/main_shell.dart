// lib/features/main_shell.dart

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../shared/theme/app_theme.dart';
import '../shared/providers/app_provider.dart';
import 'dashboard/dashboard_screen.dart';
import 'menu/menu_screen.dart';
import 'commandes/commandes_screen.dart';
import 'retrait/retrait_screen.dart';
import 'profil/profil_screen.dart';
import 'facturation/facturation_screen.dart';
import 'allergies/allergies_screen.dart';
import 'gestion/gestion_commandes_screen.dart';
import 'notifications/notification_screen.dart';

class _NavItem {
  final IconData activeIcon;
  final IconData inactiveIcon;
  final String label;
  const _NavItem(this.activeIcon, this.inactiveIcon, this.label);
}

class MainShell extends StatefulWidget {
  const MainShell({super.key});
  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final GlobalKey<GestionCommandesScreenState> _gestionKey =
      GlobalKey<GestionCommandesScreenState>();

  List<_NavItem> _navItems(bool isGestionnaire) => [
        const _NavItem(Icons.home_rounded, Icons.home_outlined, 'Accueil'),
        const _NavItem(Icons.restaurant_menu_rounded,
            Icons.restaurant_menu_outlined, 'Menu'),
        if (!isGestionnaire) ...[
          const _NavItem(Icons.receipt_long_rounded,
              Icons.receipt_long_outlined, 'Commandes'),
          const _NavItem(Icons.account_balance_wallet_rounded,
              Icons.account_balance_wallet_outlined, 'Factures'),
        ],
        if (isGestionnaire) ...[
          const _NavItem(Icons.admin_panel_settings_rounded,
              Icons.admin_panel_settings_outlined, 'Gestion'),
          const _NavItem(
              Icons.qr_code_scanner_rounded, Icons.qr_code_outlined, 'Retrait'),
        ],
        const _NavItem(
            Icons.person_rounded, Icons.person_outline_rounded, 'Profil'),
      ];

  List<Widget> _screens(bool isGestionnaire) => [
        DashboardScreen(
            onOpenDrawer: () => _scaffoldKey.currentState?.openDrawer()),
        const MenuScreen(),
        if (!isGestionnaire) ...[
          const CommandesScreen(),
          const FacturationScreen(),
        ],
        if (isGestionnaire) ...[
          GestionCommandesScreen(key: _gestionKey),
          const RetraitScreen(),
        ],
        const ProfilScreen(),
      ];

  List<String> _titles(bool isGestionnaire) => [
        'Tableau de bord',
        'Menus',
        if (!isGestionnaire) ...['Mes commandes', 'Ma facturation'],
        if (isGestionnaire) ...['Gestion commandes', 'Retrait commande'],
        'Mon profil',
      ];

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final isGestionnaire = auth.isGestionnaire;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final items = _navItems(isGestionnaire);
    final screens = _screens(isGestionnaire);
    final titles = _titles(isGestionnaire);

    if (_index >= items.length) _index = 0;

    return MainShellNavigator(
      navigateTo: (i) => setState(() => _index = i),
      child: Scaffold(
        key: _scaffoldKey,

        drawer: _AppDrawer(
          currentIndex: _index,
          isGestionnaire: isGestionnaire,
          onNavigate: (i) {
            setState(() => _index = i);
            Navigator.pop(context);
          },
        ),

        // ── AppBar ─────────────────────────────────────────────
        appBar: _index == 0
            ? null
            : AppBar(
                leading: IconButton(
                  icon: const Icon(Icons.arrow_back_ios_new_rounded),
                  onPressed: () => setState(() => _index = 0),
                  tooltip: 'Retour',
                ),
                title: _index == 2 && isGestionnaire
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(titles[_index]),
                          Text(
                            auth.user?.derniereAgence ?? '',
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.accent,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      )
                    : Text(titles[_index]),
                actions: [
                  // Menu
                  if (_index == 1)
                    IconButton(
                      icon: const Icon(Icons.refresh_rounded),
                      tooltip: 'Actualiser',
                      onPressed: () {
                        context.read<MenuProvider>().loadMenus();
                        context.read<CommandeProvider>().loadMesCommandes();
                      },
                    ),
                  // Commandes employé (index 2)
                  if (_index == 2 && !isGestionnaire)
                    IconButton(
                      icon: const Icon(Icons.refresh_rounded),
                      tooltip: 'Actualiser',
                      onPressed: () =>
                          context.read<CommandeProvider>().loadMesCommandes(),
                    ),
                  // Gestion commandes gestionnaire (index 2)
                  if (_index == 2 && isGestionnaire)
                    IconButton(
                      icon: const Icon(Icons.refresh_rounded),
                      tooltip: 'Actualiser',
                      onPressed: () => _gestionKey.currentState?.charger(),
                    ),
                  // Facturation employé (index 3)
                  if (_index == 3 && !isGestionnaire)
                    IconButton(
                      icon: const Icon(Icons.refresh_rounded),
                      tooltip: 'Actualiser',
                      onPressed: () =>
                          context.read<CommandeProvider>().loadMesCommandes(),
                    ),
                ],
              ),

        body: IndexedStack(index: _index, children: screens),

        // ── Bottom nav bar ─────────────────────────────────────
        bottomNavigationBar: Container(
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
            border: Border(
                top: BorderSide(
                    color:
                        isDark ? AppColors.darkBorder : AppColors.lightBorder)),
            boxShadow: [
              BoxShadow(
                  color: Colors.black.withOpacity(isDark ? 0.3 : 0.06),
                  blurRadius: 16,
                  offset: const Offset(0, -4))
            ],
          ),
          child: SafeArea(
            child: SizedBox(
              height: 56,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: List.generate(
                    items.length,
                    (i) => _NavBarItem(
                          item: items[i],
                          selected: _index == i,
                          compact: isGestionnaire,
                          onTap: () => setState(() => _index = i),
                        )),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// DRAWER LATÉRAL
// ══════════════════════════════════════════════════════════════

class _AppDrawer extends StatelessWidget {
  final int currentIndex;
  final bool isGestionnaire;
  final void Function(int) onNavigate;

  const _AppDrawer({
    required this.currentIndex,
    required this.isGestionnaire,
    required this.onNavigate,
  });

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final theme = context.watch<ThemeProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final user = auth.user;

    return Drawer(
      backgroundColor: isDark ? AppColors.darkSurface : AppColors.lightSurface,
      child: Column(children: [
        // ── Header ────────────────────────────────────────────
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(20, 52, 20, 24),
          decoration: const BoxDecoration(gradient: AppColors.heroGradient),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ✅ Logo + Cloche notifications côte à côte
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  // Logo
                  Expanded(
                    child: SvgPicture.asset(
                      'assets/images/logo_white.svg',
                      height: 36,
                      alignment: Alignment.centerLeft,
                    ),
                  ),
                  // ✅ Cloche notifications
                  _DrawerNotificationBell(),
                ],
              ),

              const SizedBox(height: 20),

              // Avatar
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                    color: AppColors.accent.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(14),
                    border:
                        Border.all(color: AppColors.accent.withOpacity(0.4))),
                child: Center(
                    child: Text(
                  user?.nom.isNotEmpty == true
                      ? user!.nom[0].toUpperCase()
                      : 'U',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w700),
                )),
              ),
              const SizedBox(height: 10),
              Text(user?.fullName ?? '—',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w700)),
              const SizedBox(height: 2),
              Text('@${user?.username ?? ''}',
                  style: TextStyle(
                      color: Colors.white.withOpacity(0.7), fontSize: 12)),
              const SizedBox(height: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                    color: AppColors.accent.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(20),
                    border:
                        Border.all(color: AppColors.accent.withOpacity(0.4))),
                child: Text(isGestionnaire ? '⚡ Gestionnaire' : '👤 Employé',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w600)),
              ),
            ],
          ),
        ),

        // ── Items ─────────────────────────────────────────────
        Expanded(
            child: ListView(
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            _DrawerItem(
                icon: Icons.home_rounded,
                label: 'Tableau de bord',
                index: 0,
                currentIndex: currentIndex,
                onTap: () => onNavigate(0)),
            _DrawerItem(
                icon: Icons.restaurant_menu_rounded,
                label: 'Menus',
                index: 1,
                currentIndex: currentIndex,
                onTap: () => onNavigate(1)),
            _DrawerItem(
                icon: Icons.receipt_long_rounded,
                label: 'Mes commandes',
                index: isGestionnaire ? -1 : 2,
                currentIndex: currentIndex,
                onTap: () {
                  if (isGestionnaire) {
                    Navigator.pop(context);
                    Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => const CommandesScreen()));
                  } else {
                    onNavigate(2);
                  }
                }),
            _DrawerItem(
                icon: Icons.account_balance_wallet_rounded,
                label: 'Ma facturation',
                index: isGestionnaire ? -1 : 3,
                currentIndex: currentIndex,
                onTap: () {
                  if (isGestionnaire) {
                    Navigator.pop(context);
                    Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => const FacturationScreen()));
                  } else {
                    onNavigate(3);
                  }
                }),
            if (isGestionnaire) ...[
              _DrawerItem(
                  icon: Icons.admin_panel_settings_rounded,
                  label: 'Gestion commandes',
                  index: 2,
                  currentIndex: currentIndex,
                  onTap: () => onNavigate(2)),
              _DrawerItem(
                  icon: Icons.qr_code_scanner_rounded,
                  label: 'Retrait badge',
                  index: 3,
                  currentIndex: currentIndex,
                  onTap: () => onNavigate(3)),
            ],
            _DrawerItem(
                icon: Icons.person_rounded,
                label: 'Mon profil',
                index: 4,
                currentIndex: currentIndex,
                onTap: () => onNavigate(4)),

            // Allergies (push)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
              child: ListTile(
                leading: const Icon(Icons.warning_amber_rounded,
                    color: AppColors.error, size: 20),
                title: Text('Mes allergies',
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w400,
                        color: isDark
                            ? AppColors.darkTextSecondary
                            : AppColors.lightTextSecondary)),
                dense: true,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                onTap: () {
                  Navigator.pop(context);
                  Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => const AllergiesScreen()));
                },
              ),
            ),

            const SizedBox(height: 8),
            Divider(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
            const SizedBox(height: 8),

            // Dark mode toggle
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Container(
                decoration: BoxDecoration(
                    color:
                        isDark ? AppColors.darkCard : AppColors.lightBackground,
                    borderRadius: BorderRadius.circular(12)),
                child: SwitchListTile(
                  secondary: Icon(
                      isDark
                          ? Icons.light_mode_rounded
                          : Icons.dark_mode_rounded,
                      color: isDark ? Colors.amber : AppColors.primary,
                      size: 20),
                  title: Text(isDark ? 'Mode clair' : 'Mode sombre',
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: isDark
                              ? AppColors.darkTextPrimary
                              : AppColors.lightTextPrimary)),
                  value: isDark,
                  activeColor: AppColors.accent,
                  onChanged: (_) => theme.toggle(),
                  dense: true,
                ),
              ),
            ),
          ],
        )),

        // ── Déconnexion ───────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 20),
          child: Container(
            decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.error.withOpacity(0.3))),
            child: ListTile(
              leading: const Icon(Icons.logout_rounded,
                  color: AppColors.error, size: 20),
              title: const Text('Se déconnecter',
                  style: TextStyle(
                      color: AppColors.error,
                      fontSize: 13,
                      fontWeight: FontWeight.w600)),
              dense: true,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
              onTap: () => _confirmerDeconnexion(context),
            ),
          ),
        ),
      ]),
    );
  }

  void _confirmerDeconnexion(BuildContext context) {
    Navigator.pop(context);
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Se déconnecter ?'),
        content: const Text(
            'Vous devrez vous reconnecter pour accéder à l\'application.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Annuler')),
          ElevatedButton(
              style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.error,
                  foregroundColor: Colors.white),
              onPressed: () async {
                Navigator.pop(dialogContext);
                await dialogContext.read<AuthProvider>().logout();
              },
              child: const Text('Déconnecter')),
        ],
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// ✅ CLOCHE NOTIFICATIONS DANS LE DRAWER
// Style adapté au fond sombre du header du drawer
// ══════════════════════════════════════════════════════════════

class _DrawerNotificationBell extends StatelessWidget {
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
            size: 24,
          ),
          onPressed: () {
            Navigator.pop(context); // fermer le drawer
            Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const NotificationScreen()),
            );
          },
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
// DRAWER ITEM
// ══════════════════════════════════════════════════════════════

class _DrawerItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final int index;
  final int currentIndex;
  final VoidCallback onTap;

  const _DrawerItem({
    required this.icon,
    required this.label,
    required this.index,
    required this.currentIndex,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isActive = index == currentIndex;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      child: ListTile(
        leading: Icon(icon,
            color: isActive
                ? AppColors.accent
                : (isDark
                    ? AppColors.darkTextSecondary
                    : AppColors.lightTextSecondary),
            size: 20),
        title: Text(label,
            style: TextStyle(
                fontSize: 14,
                fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
                color: isActive
                    ? (isDark
                        ? AppColors.darkTextPrimary
                        : AppColors.lightTextPrimary)
                    : (isDark
                        ? AppColors.darkTextSecondary
                        : AppColors.lightTextSecondary))),
        selected: isActive,
        selectedTileColor: AppColors.accent.withOpacity(0.1),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        dense: true,
        onTap: onTap,
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// BOTTOM NAV ITEM
// ══════════════════════════════════════════════════════════════

class _NavBarItem extends StatelessWidget {
  final _NavItem item;
  final bool selected;
  final bool compact;
  final VoidCallback onTap;

  const _NavBarItem({
    required this.item,
    required this.selected,
    required this.onTap,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final activeColor = isDark ? AppColors.accent : AppColors.primary;
    final inactiveColor =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;

    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding:
              EdgeInsets.symmetric(horizontal: compact ? 4 : 8, vertical: 4),
          decoration: BoxDecoration(
            color: selected ? activeColor.withOpacity(0.1) : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 200),
                  child: Icon(
                    selected ? item.activeIcon : item.inactiveIcon,
                    key: ValueKey(selected),
                    color: selected ? activeColor : inactiveColor,
                    size: compact ? 20 : 22,
                  ),
                ),
                const SizedBox(height: 2),
                Text(item.label,
                    style: TextStyle(
                        fontSize: compact ? 8 : 9,
                        fontWeight:
                            selected ? FontWeight.w600 : FontWeight.w400,
                        color: selected ? activeColor : inactiveColor),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ]),
        ),
      ),
    );
  }
}
