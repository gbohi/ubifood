// lib/features/dashboard/dashboard_screen.dart

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../shared/models/models.dart';
import '../../core/widgets/common_widgets.dart';
import '../../core/services/cantine_service.dart';
import '../profil/qr_code_screen.dart';
import '../commandes/commandes_screen.dart';
import '../facturation/facturation_screen.dart';
import '../notifications/notification_screen.dart';
import '../avis/avis_widgets.dart';
import '../menu/menu_screen.dart';
import 'accueil_widgets.dart';

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
  final _bannerKey = GlobalKey<_BannerSliderState>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<CommandeProvider>().loadMesCommandes();
      context.read<AccueilProvider>().charger();
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

  void _goFactures(BuildContext context) {
    final auth = context.read<AuthProvider>();
    if (auth.isGestionnaire) {
      Navigator.push(context,
          MaterialPageRoute(builder: (_) => const FacturationScreen()));
    } else {
      MainShellNavigator.of(context)?.navigateTo(3);
    }
  }

  /// Onglet Menu, sur le menu demandé si possible
  void _goMenu(BuildContext context, {int? menuId, DateTime? date}) {
    if (menuId != null || date != null) {
      menuDemande.value = CibleMenu(menuId: menuId, date: date);
    }
    MainShellNavigator.of(context)?.navigateTo(1);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final isGestionnaire = auth.isGestionnaire;
    final now = DateFormat('EEEE d MMMM yyyy', 'fr_FR').format(DateTime.now());

    Widget marges(Widget child) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20), child: child);

    final repasDuJour = Consumer<CommandeProvider>(builder: (_, cmdProv, __) {
      if (cmdProv.listLoading && cmdProv.mesCommandes.isEmpty) {
        return const ShimmerCard(height: 130);
      }
      final duJour = cmdProv.mesCommandes.where((c) =>
          c.statut != StatutCommande.annulee &&
          (c.menuDetail?.isToday ?? false));
      return _RepasDuJourCard(
          commande: duJour.firstOrNull,
          etiquette: isGestionnaire ? 'Mon repas' : "Aujourd'hui");
    });

    final recentes = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(
          title: 'Récentes',
          action: 'Tout voir',
          onAction: () => _goCommandes(context),
        ),
        const SizedBox(height: 12),
        Consumer<CommandeProvider>(builder: (_, cmdProv, __) {
          if (cmdProv.listLoading && cmdProv.mesCommandes.isEmpty) {
            return Column(
                children: List.generate(3, (_) => const ShimmerCard(height: 72)));
          }
          final liste = cmdProv.mesCommandes.take(3).toList();
          if (liste.isEmpty) {
            return EmptyState(
              icon: Icons.receipt_outlined,
              title: 'Aucune commande',
              subtitle: 'Commandez depuis le menu du jour',
              action: TextButton.icon(
                icon: const Icon(Icons.restaurant_menu_rounded, size: 16),
                label: const Text('Voir le menu'),
                onPressed: () => _goMenu(context),
              ),
            );
          }
          return Column(
              children:
                  liste.map((c) => _CommandeItem(commande: c)).toList());
        }),
      ],
    );

    final List<Widget> contenu = isGestionnaire
        ? [
            const SizedBox(height: 14),
            marges(_BlocGestion(
              onScanner: () => MainShellNavigator.of(context)?.navigateTo(3),
              onGestion: () => MainShellNavigator.of(context)?.navigateTo(2),
            )),
            const SizedBox(height: 8),
            marges(repasDuJour),
            const SizedBox(height: 12),
            marges(_ChiffresMois(
              gestionnaire: true,
              onCommandes: () => _goCommandes(context),
              onFactures: () => _goFactures(context),
            )),
            const SizedBox(height: 8),
            _BannerSlider(key: _bannerKey),
            // Ses propres commandes : seulement s'il en a (la maquette
            // s'arrête aux chiffres)
            Consumer<CommandeProvider>(
              builder: (_, cmdProv, __) => cmdProv.mesCommandes.isEmpty
                  ? const SizedBox.shrink()
                  : Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: marges(recentes)),
            ),
          ]
        : [
            _BannerSlider(key: _bannerKey),
            const SizedBox(height: 8),
            marges(repasDuJour),
            const SizedBox(height: 12),
            marges(_BlocEmploye(
              onMenu: ({int? menuId, DateTime? date}) =>
                  _goMenu(context, menuId: menuId, date: date),
              onCommandes: () => _goCommandes(context),
              onFactures: () => _goFactures(context),
            )),
            const SizedBox(height: 24),
            marges(recentes),
          ];

    return Scaffold(
      body: RefreshIndicator(
        color: AppColors.accent,
        backgroundColor: AppColors.primary,
        displacement: 90,
        notificationPredicate: (notification) => notification.depth == 0,
        onRefresh: () async {
          await Future.wait([
            context.read<CommandeProvider>().loadMesCommandes(),
            context.read<AccueilProvider>().charger(),
            _bannerKey.currentState?.charger() ?? Future.value(),
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
                            clipBehavior: Clip.antiAlias,
                            decoration: BoxDecoration(
                                color: AppColors.accent.withOpacity(0.2),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                    color: AppColors.accent.withOpacity(0.4))),
                            child: PhotoProfil(user: auth.user, fontSize: 14),
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
                          Semantics(
                            button: true,
                            label: 'Mon QR code',
                            excludeSemantics: true,
                            child: GestureDetector(
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
                                        dataModuleShape:
                                            QrDataModuleShape.square,
                                        color: Color(0xFF092440)),
                                  ),
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
              ...contenu,
              const SizedBox(height: 80),
            ],
          )),
        ]),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// BLOCS ALIMENTÉS PAR GET /accueil/
// ══════════════════════════════════════════════════════════════

typedef _OuvrirMenu = void Function({int? menuId, DateTime? date});

/// Chargement / erreur communs : [builder] reçoit les données chargées.
class _AccueilConsumer extends StatelessWidget {
  final Widget Function(BuildContext, Accueil, AccueilProvider) builder;
  final List<double> squelettes;
  const _AccueilConsumer({required this.builder, required this.squelettes});

  @override
  Widget build(BuildContext context) {
    return Consumer<AccueilProvider>(builder: (context, prov, _) {
      final a = prov.accueil;
      if (a == null) {
        if (prov.error != null && !prov.loading) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: AccueilErreur(
                message: prov.error!, onReessayer: prov.charger),
          );
        }
        return Column(
            children: [for (final h in squelettes) ShimmerCard(height: h)]);
      }
      return builder(context, a, prov);
    });
  }
}

class _BlocEmploye extends StatelessWidget {
  final _OuvrirMenu onMenu;
  final VoidCallback onCommandes;
  final VoidCallback onFactures;
  const _BlocEmploye(
      {required this.onMenu,
      required this.onCommandes,
      required this.onFactures});

  @override
  Widget build(BuildContext context) {
    return _AccueilConsumer(
      squelettes: const [128, 76, 62],
      builder: (context, a, _) {
        final prochain = a.prochainAReserver;
        return Column(children: [
          if (a.semaine.isNotEmpty) ...[
            MaSemaineCard(
              jours: a.semaine,
              aujourdhui: a.date,
              onVoirMenus: () => onMenu(),
              onJour: (j) => onMenu(date: j.date),
            ),
            const SizedBox(height: 12),
          ],
          if (prochain != null) ...[
            ProchainRepasCard(
              prochain: prochain,
              onReserver: () =>
                  onMenu(menuId: prochain.menuId, date: prochain.date),
            ),
            const SizedBox(height: 12),
          ],
          _ChiffresMois(
              gestionnaire: false,
              onCommandes: onCommandes,
              onFactures: onFactures),
        ]);
      },
    );
  }
}

class _ChiffresMois extends StatelessWidget {
  final bool gestionnaire;
  final VoidCallback onCommandes;
  final VoidCallback onFactures;
  const _ChiffresMois(
      {required this.gestionnaire,
      required this.onCommandes,
      required this.onFactures});

  @override
  Widget build(BuildContext context) {
    final mois = DateFormat('MMM', 'fr_FR').format(DateTime.now());
    Widget tuiles(ChiffresMois m) => ChiffresMoisRow(tuiles: [
          ChiffreTuile('${m.repas}', 'repas $mois', onTap: onCommandes),
          ChiffreTuile('${m.retires}', m.retires > 1 ? 'retirés' : 'retiré',
              onTap: onCommandes),
          if (!gestionnaire)
            ChiffreTuile('${m.annules}', m.annules > 1 ? 'annulés' : 'annulé',
                onTap: onCommandes),
          ChiffreTuile(formatFcfa(m.montant), 'à payer',
              montant: true, onTap: onFactures),
        ]);

    // Employé : déjà sous le chargement de _BlocEmploye
    if (!gestionnaire) {
      final a = context.watch<AccueilProvider>().accueil;
      return a == null ? const SizedBox.shrink() : tuiles(a.mois);
    }
    return _AccueilConsumer(
      squelettes: const [62],
      builder: (_, a, __) => tuiles(a.mois),
    );
  }
}

class _BlocGestion extends StatelessWidget {
  final VoidCallback onScanner;
  final VoidCallback onGestion;
  const _BlocGestion({required this.onScanner, required this.onGestion});

  @override
  Widget build(BuildContext context) {
    return _AccueilConsumer(
      squelettes: const [170, 90],
      builder: (context, a, prov) {
        final g = a.gestion;
        if (g == null) return const SizedBox.shrink();
        return Column(children: [
          ServiceDuJourCard(
            services: g.serviceDuJour,
            actualiseLe: prov.chargeLe,
            chargement: prov.loading,
            onScanner: onScanner,
            onActualiser: prov.charger,
          ),
          for (final alerte in g.menusManquants) ...[
            const SizedBox(height: 10),
            AlerteMenuManquant(alerte: alerte),
          ],
          if (g.semaine.isNotEmpty) ...[
            const SizedBox(height: 12),
            CommandesSemaineCard(
              jours: g.semaine,
              aujourdhui: a.date,
              onGestion: onGestion,
            ),
          ],
          const SizedBox(height: 4),
        ]);
      },
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
  const _BannerSlider({super.key});
  @override
  State<_BannerSlider> createState() => _BannerSliderState();
}

/// Bannières paramétrées dans l'administration web (Paramètres → Bannières).
/// Aucune bannière active : le bloc n'est pas affiché.
class _BannerSliderState extends State<_BannerSlider> {
  final PageController _ctrl = PageController(viewportFraction: 0.92);
  int _current = 0;
  Timer? _timer;
  List<Banniere> _bannieres = [];

  @override
  void initState() {
    super.initState();
    charger();
  }

  Future<void> charger() async {
    try {
      final liste = await banniereService.getBannieres();
      if (!mounted) return;
      setState(() {
        _bannieres = liste.where((b) => b.imageUrl != null).toList();
        _current = 0;
      });
      // Liste rechargée : retour à la première bannière (l'ancienne page
      // peut ne plus exister)
      if (_ctrl.hasClients && _bannieres.isNotEmpty) _ctrl.jumpToPage(0);
      _demarrerDefilement();
    } catch (_) {
      // Pas de bannière en cas d'erreur réseau : l'accueil reste utilisable
    }
  }

  void _demarrerDefilement() {
    _timer?.cancel();
    if (_bannieres.length < 2) return;
    _timer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted || !_ctrl.hasClients) return;
      final next = (_current + 1) % _bannieres.length;
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
    if (_bannieres.isEmpty) return const SizedBox(height: 4);
    return Column(children: [
      SizedBox(
        height: 170,
        child: PageView.builder(
          controller: _ctrl,
          itemCount: _bannieres.length,
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
                child: Image.network(
                  _bannieres[i].imageUrl!,
                  fit: BoxFit.cover,
                  width: double.infinity,
                  height: 154,
                  semanticLabel: _bannieres[i].titre,
                  errorBuilder: (_, __, ___) => Container(
                    color: AppColors.primary,
                    child: const Center(
                        child: Icon(Icons.image_not_supported_outlined,
                            color: Colors.white54)),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
      if (_bannieres.length > 1) ...[
        const SizedBox(height: 4),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(
            _bannieres.length,
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
      ],
    ]);
  }
}

// ══════════════════════════════════════════════════════════════
// MON REPAS DU JOUR (fond vert)
// ══════════════════════════════════════════════════════════════

class _RepasDuJourCard extends StatelessWidget {
  final Commande? commande;
  final String etiquette;
  const _RepasDuJourCard({this.commande, this.etiquette = "Aujourd'hui"});

  static const _vertFonce = Color(0xFF15803D);
  static const _vert = Color(0xFF22A55A);

  @override
  Widget build(BuildContext context) {
    final c = commande;
    final retire = c?.statut == StatutCommande.retiree;
    final plat = c?.platDetail;
    final menu = c?.menuDetail;

    return GestureDetector(
      // Sans commande : les menus ; avec commande : le QR code à présenter
      onTap: () => c == null
          ? MainShellNavigator.of(context)?.navigateTo(1)
          : Navigator.push(context,
              MaterialPageRoute(builder: (_) => const QrCodeScreen())),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
              colors: [_vertFonce, _vert],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
                color: _vert.withOpacity(0.35),
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
              child: Text(etiquette,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w600)),
            ),
            const Spacer(),
            if (c != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20)),
                child: Text(retire ? 'Retiré' : 'À retirer',
                    style: const TextStyle(
                        color: _vertFonce,
                        fontSize: 11,
                        fontWeight: FontWeight.w700)),
              ),
          ]),
          const SizedBox(height: 14),
          if (c == null) ...[
            Row(children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.18),
                    borderRadius: BorderRadius.circular(16)),
                child: const Icon(Icons.no_meals_rounded,
                    color: Colors.white, size: 26),
              ),
              const SizedBox(width: 14),
              const Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Pas de repas réservé pour aujourd\'hui',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 17,
                              fontWeight: FontWeight.w700)),
                      SizedBox(height: 4),
                      Text('Pensez à réserver vos prochains repas '
                          'avant la date limite de commande.',
                          style: TextStyle(color: Colors.white70, fontSize: 12)),
                    ]),
              ),
            ]),
            const SizedBox(height: 14),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                style: TextButton.styleFrom(
                    foregroundColor: _vertFonce,
                    backgroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12))),
                icon: const Icon(Icons.restaurant_menu_rounded, size: 16),
                label: const Text('Voir les menus'),
                onPressed: () => MainShellNavigator.of(context)?.navigateTo(1),
              ),
            ),
          ] else ...[
            Row(children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  width: 64,
                  height: 64,
                  color: Colors.white.withOpacity(0.18),
                  child: plat?.imageUrl != null
                      ? Image.network(plat!.imageUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Icon(
                              Icons.restaurant_rounded,
                              color: Colors.white,
                              size: 28))
                      : const Icon(Icons.restaurant_rounded,
                          color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Mon repas du jour',
                          style: TextStyle(color: Colors.white70, fontSize: 12)),
                      const SizedBox(height: 2),
                      Text(plat?.nom ?? 'Repas commandé',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 20,
                              fontWeight: FontWeight.w700),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 4),
                      Text(
                          [menu?.agenceNom, menu?.typeEquipeLibelle]
                              .where((e) => e != null && e.isNotEmpty)
                              .join(' • '),
                          style: const TextStyle(
                              color: Colors.white70, fontSize: 12)),
                    ]),
              ),
            ]),
            const SizedBox(height: 14),
            Row(children: [
              Icon(retire ? Icons.check_circle_rounded : Icons.qr_code_rounded,
                  color: Colors.white, size: 16),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                    retire
                        ? 'Repas retiré — bon appétit !'
                        : 'Présentez votre QR code au comptoir de la cantine.',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w500)),
              ),
            ]),
            // ── Avis sur le repas retiré ──────────────────────
            if (retire) ...[
              const SizedBox(height: 14),
              Align(
                alignment: Alignment.centerRight,
                child: c.avis == null
                    ? TextButton.icon(
                        style: TextButton.styleFrom(
                            foregroundColor: _vertFonce,
                            backgroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12))),
                        icon: const Icon(Icons.star_outline_rounded, size: 18),
                        label: const Text('Donner mon avis'),
                        onPressed: () => showAvisSheet(context, c),
                      )
                    : Material(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(12),
                          onTap: () => showAvisSheet(context, c),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 8),
                            child: Row(mainAxisSize: MainAxisSize.min, children: [
                              EtoilesNote(
                                  note: c.avis!.note,
                                  size: 18,
                                  emptyColor: _vertFonce.withOpacity(0.25)),
                              const SizedBox(width: 8),
                              const Icon(Icons.edit_rounded,
                                  size: 14, color: _vertFonce),
                            ]),
                          ),
                        ),
                      ),
              ),
            ],
          ],
        ]),
      ),
    );
  }
}

class _CommandeItem extends StatelessWidget {
  final Commande commande;
  const _CommandeItem({required this.commande});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final date = DateTime.tryParse(commande.dateCommande)?.toLocal();
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
