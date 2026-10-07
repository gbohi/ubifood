// lib/features/notifications/notification_screen.dart

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../core/api/api_client.dart';

// ══════════════════════════════════════════════════════════════
// MODÈLE
// ══════════════════════════════════════════════════════════════

class NotificationItem {
  final int id;
  final String type;
  final String titre;
  final String message;
  final bool lu;
  final DateTime createdAt;
  final int? commandeId;
  final int? menuId;

  const NotificationItem({
    required this.id,
    required this.type,
    required this.titre,
    required this.message,
    required this.lu,
    required this.createdAt,
    this.commandeId,
    this.menuId,
  });

  factory NotificationItem.fromJson(Map<String, dynamic> j) => NotificationItem(
        id: j['id'],
        type: j['type'] ?? '',
        titre: j['titre'] ?? '',
        message: j['message'] ?? '',
        lu: j['lu'] ?? false,
        createdAt: DateTime.parse(j['created_at']),
        commandeId: j['commande_id'],
        menuId: j['menu_id'],
      );

  NotificationItem copyWith({bool? lu}) => NotificationItem(
        id: id,
        type: type,
        titre: titre,
        message: message,
        lu: lu ?? this.lu,
        createdAt: createdAt,
        commandeId: commandeId,
        menuId: menuId,
      );
}

// ══════════════════════════════════════════════════════════════
// PROVIDER
// ══════════════════════════════════════════════════════════════

class NotificationProvider extends ChangeNotifier {
  List<NotificationItem> _notifications = [];
  int _nonLues = 0;
  bool _loading = false;
  Timer? _timer;

  List<NotificationItem> get notifications => _notifications;
  int get nonLues => _nonLues;
  bool get loading => _loading;

  /// Démarre le polling toutes les 30 secondes
  void startPolling() {
    charger();
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => charger());
  }

  void stopPolling() {
    _timer?.cancel();
    _timer = null;
  }

  @override
  void dispose() {
    stopPolling();
    super.dispose();
  }

  Future<void> charger() async {
    try {
      final res = await apiClient.get('/notifications/mes-notifications/');
      final data = res.data;
      _nonLues = data['non_lues'] ?? 0;
      final list = (data['notifications'] as List? ?? []);
      _notifications = list
          .map((e) => NotificationItem.fromJson(e as Map<String, dynamic>))
          .toList();
      notifyListeners();
    } catch (_) {}
  }

  Future<void> marquerLu(int id) async {
    try {
      await apiClient.patch('/notifications/$id/marquer-lu/');
      _notifications = _notifications
          .map((n) => n.id == id ? n.copyWith(lu: true) : n)
          .toList();
      _nonLues = _notifications.where((n) => !n.lu).length;
      notifyListeners();
    } catch (_) {}
  }

  Future<void> toutMarquerLu() async {
    try {
      await apiClient.patch('/notifications/tout-marquer-lu/');
      _notifications = _notifications.map((n) => n.copyWith(lu: true)).toList();
      _nonLues = 0;
      notifyListeners();
    } catch (_) {}
  }

  Future<void> supprimer(int id) async {
    try {
      await apiClient.delete('/notifications/$id/supprimer/');
      _notifications.removeWhere((n) => n.id == id);
      _nonLues = _notifications.where((n) => !n.lu).length;
      notifyListeners();
    } catch (_) {}
  }

  Future<void> toutSupprimer() async {
    try {
      await apiClient.delete('/notifications/tout-supprimer/');
      _notifications = [];
      _nonLues = 0;
      notifyListeners();
    } catch (_) {}
  }
}

// ══════════════════════════════════════════════════════════════
// WIDGET CLOCHE — à placer dans AppBar actions
// ══════════════════════════════════════════════════════════════

class NotificationBell extends StatelessWidget {
  const NotificationBell({super.key});

  @override
  Widget build(BuildContext context) {
    final count = context.watch<NotificationProvider>().nonLues;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          icon: const Icon(Icons.notifications_rounded),
          onPressed: () => Navigator.push(context,
              MaterialPageRoute(builder: (_) => const NotificationScreen())),
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
                )),
              ),
            ),
          ),
      ],
    );
  }
}

// ══════════════════════════════════════════════════════════════
// ÉCRAN NOTIFICATIONS
// ══════════════════════════════════════════════════════════════

class NotificationScreen extends StatefulWidget {
  const NotificationScreen({super.key});
  @override
  State<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback(
        (_) => context.read<NotificationProvider>().charger());
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final prov = context.watch<NotificationProvider>();

    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          const Text('Notifications'),
          if (prov.nonLues > 0) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.error,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text('${prov.nonLues}',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w700)),
            ),
          ],
        ]),
        actions: [
          // Tout marquer lu
          if (prov.nonLues > 0)
            IconButton(
              icon: const Icon(Icons.done_all_rounded),
              tooltip: 'Tout marquer comme lu',
              onPressed: () => prov.toutMarquerLu(),
            ),
          // Menu supprimer tout
          PopupMenuButton(
            icon: const Icon(Icons.more_vert_rounded),
            itemBuilder: (_) => [
              PopupMenuItem(
                child: const Row(children: [
                  Icon(Icons.refresh_rounded, size: 18),
                  SizedBox(width: 8),
                  Text('Actualiser'),
                ]),
                onTap: () => prov.charger(),
              ),
              PopupMenuItem(
                child: const Row(children: [
                  Icon(Icons.delete_sweep_rounded,
                      size: 18, color: AppColors.error),
                  SizedBox(width: 8),
                  Text('Tout supprimer',
                      style: TextStyle(color: AppColors.error)),
                ]),
                onTap: () => _confirmerToutSupprimer(context, prov),
              ),
            ],
          ),
        ],
      ),
      body: prov.loading && prov.notifications.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : prov.notifications.isEmpty
              ? _EmptyNotifications()
              : RefreshIndicator(
                  onRefresh: prov.charger,
                  color: AppColors.accent,
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: prov.notifications.length,
                    separatorBuilder: (_, __) => Divider(
                        height: 1,
                        color: isDark
                            ? AppColors.darkBorder
                            : AppColors.lightBorder),
                    itemBuilder: (_, i) {
                      final notif = prov.notifications[i];
                      return _NotificationTile(
                        notif: notif,
                        onTap: () {
                          if (!notif.lu) prov.marquerLu(notif.id);
                        },
                        onDismiss: () => prov.supprimer(notif.id),
                      );
                    },
                  ),
                ),
    );
  }

  void _confirmerToutSupprimer(
      BuildContext context, NotificationProvider prov) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Tout supprimer ?'),
        content: const Text('Toutes les notifications seront supprimées.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Annuler')),
          ElevatedButton(
              style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.error,
                  foregroundColor: Colors.white),
              onPressed: () {
                Navigator.pop(context);
                prov.toutSupprimer();
              },
              child: const Text('Supprimer')),
        ],
      ),
    );
  }
}

// ── Tile notification ──────────────────────────────────────────

class _NotificationTile extends StatelessWidget {
  final NotificationItem notif;
  final VoidCallback onTap;
  final VoidCallback onDismiss;

  const _NotificationTile({
    required this.notif,
    required this.onTap,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final config = _typeConfig(notif.type);
    final date = _formatDate(notif.createdAt);

    return Dismissible(
      key: Key('notif_${notif.id}'),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        color: AppColors.error,
        child: const Icon(Icons.delete_rounded, color: Colors.white, size: 24),
      ),
      onDismissed: (_) => onDismiss(),
      child: InkWell(
        onTap: onTap,
        child: Container(
          color: notif.lu
              ? Colors.transparent
              : (isDark
                  ? AppColors.accent.withOpacity(0.05)
                  : AppColors.accent.withOpacity(0.04)),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // Icône type
            Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: config.color.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(config.icon, color: config.color, size: 20)),

            const SizedBox(width: 12),

            // Contenu
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Row(children: [
                    Expanded(
                        child: Text(notif.titre,
                            style: TextStyle(
                                fontSize: 14,
                                fontWeight: notif.lu
                                    ? FontWeight.w400
                                    : FontWeight.w700,
                                color: isDark
                                    ? AppColors.darkTextPrimary
                                    : AppColors.lightTextPrimary),
                            overflow: TextOverflow.ellipsis)),
                    if (!notif.lu)
                      Container(
                          width: 8,
                          height: 8,
                          margin: const EdgeInsets.only(left: 6),
                          decoration: const BoxDecoration(
                              color: AppColors.accent, shape: BoxShape.circle)),
                  ]),
                  const SizedBox(height: 3),
                  Text(notif.message,
                      style: TextStyle(
                          fontSize: 13,
                          height: 1.4,
                          color: isDark
                              ? AppColors.darkTextSecondary
                              : AppColors.lightTextSecondary),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Text(date,
                      style: TextStyle(
                          fontSize: 11,
                          color: isDark
                              ? AppColors.darkTextSecondary
                              : AppColors.lightTextSecondary)),
                ])),
          ]),
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);
    if (diff.inMinutes < 1) return 'À l\'instant';
    if (diff.inMinutes < 60) return 'Il y a ${diff.inMinutes} min';
    if (diff.inHours < 24) return 'Il y a ${diff.inHours}h';
    if (diff.inDays == 1) return 'Hier';
    if (diff.inDays < 7) return 'Il y a ${diff.inDays} jours';
    return DateFormat('dd/MM/yyyy').format(date);
  }

  _NotifConfig _typeConfig(String type) {
    switch (type) {
      case 'commande_passee':
        return _NotifConfig(Icons.check_circle_rounded, AppColors.success);
      case 'commande_annulee':
        return _NotifConfig(Icons.cancel_rounded, AppColors.error);
      case 'retrait_valide':
        return _NotifConfig(Icons.restaurant_rounded, AppColors.accent);
      case 'menu_disponible':
        return _NotifConfig(Icons.restaurant_menu_rounded, AppColors.primary);
      case 'rappel_48h':
        return _NotifConfig(Icons.timer_rounded, AppColors.warning);
      default:
        return _NotifConfig(
            Icons.notifications_rounded, AppColors.lightTextSecondary);
    }
  }
}

class _NotifConfig {
  final IconData icon;
  final Color color;
  const _NotifConfig(this.icon, this.color);
}

// ── Empty state ────────────────────────────────────────────────

class _EmptyNotifications extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
        child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
                color: AppColors.accent.withOpacity(0.1),
                shape: BoxShape.circle),
            child: const Icon(Icons.notifications_off_rounded,
                color: AppColors.accent, size: 36)),
        const SizedBox(height: 16),
        Text('Aucune notification',
            style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 6),
        Text('Vous êtes à jour !',
            style: Theme.of(context).textTheme.bodySmall),
      ],
    ));
  }
}
