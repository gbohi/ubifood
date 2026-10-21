// lib/features/notifications/notification_screen.dart

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../shared/theme/app_theme.dart';
import '../../core/api/api_client.dart';
import '../../core/widgets/common_widgets.dart';

// ══════════════════════════════════════════════════════════════
// NAVIGATION DEPUIS UNE NOTIFICATION
// ══════════════════════════════════════════════════════════════

/// Écran à ouvrir après un appui sur une notification
enum CibleNotification { menus, commandes }

/// Demande écoutée par MainShell (l'écran des notifications est poussé
/// au-dessus de lui et ne peut pas changer l'onglet directement).
final cibleNotification = ValueNotifier<CibleNotification?>(null);

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
        // Affichage à l'heure du téléphone (date absente : pas de plantage
        // de toute la liste)
        createdAt: (DateTime.tryParse(j['created_at'] ?? '') ?? DateTime.now())
            .toLocal(),
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
  bool _dejaCharge = false;
  String? _erreur;
  Timer? _timer;

  List<NotificationItem> get notifications => _notifications;
  int get nonLues => _nonLues;
  bool get loading => _loading;

  /// Échec du dernier chargement (null si réussi)
  String? get erreur => _erreur;

  /// Démarre le polling toutes les 30 secondes
  void startPolling() {
    charger();
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => charger());
  }

  /// Déconnexion : arrêt du rafraîchissement et oubli des notifications
  /// du compte (téléphone partagé).
  void stopPolling() {
    _timer?.cancel();
    _timer = null;
    _dejaCharge = false;
    _erreur = null;
    _generation++;
    if (_notifications.isNotEmpty || _nonLues != 0 || _loading) {
      _notifications = [];
      _nonLues = 0;
      _loading = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    stopPolling();
    super.dispose();
  }

  int _generation = 0;

  Future<void> charger() async {
    final gen = _generation;
    // Premier chargement : indicateur de chargement plutôt que l'état vide
    // « Vous êtes à jour ! » affiché avant l'arrivée des données.
    if (!_dejaCharge && !_loading) {
      _loading = true;
      notifyListeners();
    }
    try {
      final res = await apiClient.get('/notifications/mes-notifications/');
      // Déconnexion pendant la requête : pas de données de l'ancien compte
      if (gen != _generation) return;
      final data = res.data;
      _nonLues = data['non_lues'] ?? 0;
      final list = (data['notifications'] as List? ?? []);
      _notifications = list
          .map((e) => NotificationItem.fromJson(e as Map<String, dynamic>))
          .toList();
      _dejaCharge = true;
      _erreur = null;
    } catch (e) {
      if (gen != _generation) return;
      _erreur =
          messageErreurApi(e) ?? 'Impossible de charger les notifications';
    }
    _loading = false;
    notifyListeners();
  }

  Future<void> marquerLu(int id) async {
    try {
      await apiClient.patch('/notifications/$id/marquer-lu/');
      final etaitNonLue = _notifications.any((n) => n.id == id && !n.lu);
      _notifications = _notifications
          .map((n) => n.id == id ? n.copyWith(lu: true) : n)
          .toList();
      // Le compteur du serveur couvre plus que les 50 notifications
      // chargées : on le décrémente au lieu de recompter la liste locale.
      if (etaitNonLue && _nonLues > 0) _nonLues--;
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

  /// Suppression optimiste : l'élément disparaît tout de suite de la liste
  /// (exigé par Dismissible) et revient si le serveur refuse.
  Future<bool> supprimer(int id) async {
    final index = _notifications.indexWhere((n) => n.id == id);
    if (index < 0) return true;
    final notif = _notifications[index];
    _notifications = List.of(_notifications)..removeAt(index);
    if (!notif.lu && _nonLues > 0) _nonLues--;
    notifyListeners();
    try {
      await apiClient.delete('/notifications/$id/supprimer/');
      return true;
    } catch (_) {
      if (!_notifications.any((n) => n.id == id)) {
        _notifications = List.of(_notifications)
          ..insert(index.clamp(0, _notifications.length), notif);
        if (!notif.lu) _nonLues++;
        notifyListeners();
      }
      return false;
    }
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

/// Titre sans l'emoji de tête envoyé par le serveur (« ✅ Commande
/// confirmée ») : l'icône de la ligne le représente déjà.
String titreSansEmoji(String titre) => titre
    .replaceFirst(
        RegExp(r'^(?:\p{Extended_Pictographic}|[\u{FE0F}\u{200D}\u{20E3}]|\s)+',
            unicode: true),
        '')
    .trim();

enum _FiltreNotif { toutes, nonLues, commandes, menus }

bool _estCommande(NotificationItem n) =>
    n.type.startsWith('commande_') || n.type.startsWith('retrait_');

bool _estMenu(NotificationItem n) =>
    n.type == 'menu_disponible' ||
    n.type == 'rappel_48h' ||
    (n.menuId != null && !_estCommande(n));

class NotificationScreen extends StatefulWidget {
  const NotificationScreen({super.key});
  @override
  State<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen> {
  _FiltreNotif _filtre = _FiltreNotif.toutes;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback(
        (_) => context.read<NotificationProvider>().charger());
  }

  bool _garde(NotificationItem n) => switch (_filtre) {
        _FiltreNotif.toutes => true,
        _FiltreNotif.nonLues => !n.lu,
        _FiltreNotif.commandes => _estCommande(n),
        _FiltreNotif.menus => _estMenu(n),
      };

  @override
  Widget build(BuildContext context) {
    final prov = context.watch<NotificationProvider>();
    final liste = prov.notifications.where(_garde).toList();

    // Groupes Aujourd'hui / Hier / Plus tôt (heure du téléphone)
    final now = DateTime.now();
    final aujourdhui = DateTime(now.year, now.month, now.day);
    final hier = aujourdhui.subtract(const Duration(days: 1));
    final groupes = <String, List<NotificationItem>>{};
    for (final n in liste) {
      final j = DateTime(n.createdAt.year, n.createdAt.month, n.createdAt.day);
      final cle = j == aujourdhui
          ? "Aujourd'hui"
          : j == hier
              ? 'Hier'
              : 'Plus tôt';
      groupes.putIfAbsent(cle, () => []).add(n);
    }

    final enTete = EnTeteMarine(
      titre: 'Notifications',
      sousTitre: prov.nonLues == 0
          ? 'Tout est lu'
          : '${prov.nonLues} non lue${prov.nonLues > 1 ? 's' : ''}',
      actions: [
        if (prov.nonLues > 0)
          TextButton.icon(
            style: TextButton.styleFrom(
                foregroundColor: AppColors.accent,
                visualDensity: VisualDensity.compact,
                textStyle:
                    const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
            icon: const Icon(Icons.done_all_rounded, size: 16),
            label: const Text('Tout lire'),
            onPressed: () => prov.toutMarquerLu(),
          ),
        PopupMenuButton<String>(
          tooltip: 'Plus d\'actions',
          icon: const Icon(Icons.more_vert_rounded, color: Colors.white),
          onSelected: (v) {
            if (v == 'actualiser') prov.charger();
            if (v == 'supprimer') _confirmerToutSupprimer(context, prov);
          },
          itemBuilder: (_) => const [
            PopupMenuItem(
              value: 'actualiser',
              child: Row(children: [
                Icon(Icons.refresh_rounded, size: 18),
                SizedBox(width: 8),
                Text('Actualiser'),
              ]),
            ),
            PopupMenuItem(
              value: 'supprimer',
              child: Row(children: [
                Icon(Icons.delete_sweep_rounded,
                    size: 18, color: AppColors.error),
                SizedBox(width: 8),
                Text('Tout supprimer',
                    style: TextStyle(color: AppColors.error)),
              ]),
            ),
          ],
        ),
      ],
    );

    Widget corps;
    if (prov.loading && prov.notifications.isEmpty) {
      corps = const Center(child: CircularProgressIndicator());
    } else if (prov.notifications.isEmpty) {
      // Vide ou en erreur : l'actualisation par glissement reste possible
      corps = RefreshIndicator(
        onRefresh: prov.charger,
        color: AppColors.accent,
        child: LayoutBuilder(
          builder: (_, constraints) => SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: prov.erreur != null
                  ? _ErreurNotifications(
                      message: prov.erreur!, onReessayer: prov.charger)
                  : _EmptyNotifications(),
            ),
          ),
        ),
      );
    } else {
      final nbCommandes = prov.notifications.where(_estCommande).length;
      final nbMenus = prov.notifications.where(_estMenu).length;
      corps = Column(children: [
        RangeeFiltres(filtres: [
          for (final (f, label, n) in [
            (_FiltreNotif.toutes, 'Toutes', prov.notifications.length),
            (
              _FiltreNotif.nonLues,
              'Non lues',
              prov.notifications.where((n) => !n.lu).length
            ),
            (_FiltreNotif.commandes, 'Commandes', nbCommandes),
            (_FiltreNotif.menus, 'Menus', nbMenus),
          ])
            FiltrePastille(
              label: label,
              compte: n,
              actif: _filtre == f,
              onTap: () => setState(() => _filtre = f),
            ),
        ]),
        // Actualisation en échec : la liste affichée peut être périmée
        if (prov.erreur != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
            child: BandeauInfo(
              icone: Icons.cloud_off_rounded,
              ton: TonPastille.rouge,
              texte: 'Actualisation impossible : ${prov.erreur}',
              action: TextButton(
                  onPressed: prov.charger, child: const Text('Réessayer')),
            ),
          ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: prov.charger,
            color: AppColors.accent,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 32),
              children: [
                if (liste.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 40),
                    child: EmptyState(
                      icon: Icons.notifications_none_rounded,
                      title: 'Aucune notification',
                      subtitle: 'Rien dans cette catégorie',
                    ),
                  ),
                for (final g in groupes.entries) ...[
                  LibelleSection(g.key),
                  CarteListe(lignes: [
                    for (final notif in g.value)
                      _NotificationTile(
                        notif: notif,
                        heure: _heure(notif.createdAt, aujourdhui, hier),
                        onTap: () {
                          if (!notif.lu) prov.marquerLu(notif.id);
                          // Retour à l'écran principal sur l'onglet utile :
                          // commandes (passée, annulée, retirée → avis) ou
                          // menus (nouveau menu, rappel)
                          final cible = _cible(notif);
                          if (cible != null) {
                            Navigator.of(context).popUntil((r) => r.isFirst);
                            cibleNotification.value = cible;
                          }
                        },
                        onDismiss: () async {
                          final messenger = ScaffoldMessenger.of(context);
                          final ok = await prov.supprimer(notif.id);
                          if (!ok) {
                            messenger.showSnackBar(const SnackBar(
                                content: Text(
                                    'Suppression impossible, réessayez.')));
                          }
                        },
                      ),
                  ]),
                  const SizedBox(height: 8),
                ],
              ],
            ),
          ),
        ),
      ]);
    }

    return Scaffold(
      body: Column(children: [enTete, Expanded(child: corps)]),
    );
  }

  /// « 08:12 » aujourd'hui et hier, « lun. 19 » avant
  String _heure(DateTime d, DateTime aujourdhui, DateTime hier) {
    final j = DateTime(d.year, d.month, d.day);
    if (j == aujourdhui || j == hier) return DateFormat('HH:mm').format(d);
    if (aujourdhui.difference(j).inDays < 300) {
      return DateFormat('EEE d', 'fr_FR').format(d);
    }
    return DateFormat('dd/MM/yy').format(d);
  }

  CibleNotification? _cible(NotificationItem n) {
    if (n.type.startsWith('commande_') ||
        n.type == 'retrait_valide' ||
        n.type == 'retrait_annule') {
      return CibleNotification.commandes;
    }
    if (n.menuId != null) return CibleNotification.menus;
    if (n.commandeId != null) return CibleNotification.commandes;
    return null;
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

// ── Ligne notification ─────────────────────────────────────────

class _NotificationTile extends StatelessWidget {
  final NotificationItem notif;
  final String heure;
  final VoidCallback onTap;
  final VoidCallback onDismiss;

  const _NotificationTile({
    required this.notif,
    required this.heure,
    required this.onTap,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final (icone, ton) = _typeConfig(notif.type);
    final (fondIcone, couleurIcone) = couleursPastille(ton, isDark);
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final nonLue = !notif.lu;

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
      child: Material(
        // Seules les non lues sont surlignées
        color: nonLue
            ? (isDark
                ? AppColors.accent.withOpacity(0.07)
                : const Color(0xFFF3FBF6))
            : Colors.transparent,
        child: InkWell(
          onTap: onTap,
          child: Stack(children: [
            if (nonLue)
              Positioned(
                left: 4,
                top: 0,
                bottom: 0,
                child: Center(
                  child: Container(
                      width: 6,
                      height: 6,
                      decoration: const BoxDecoration(
                          color: AppColors.accentDark, shape: BoxShape.circle)),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
              child:
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                        color: isDark && ton == TonPastille.bleu
                            ? AppColors.accent.withOpacity(0.12)
                            : fondIcone,
                        shape: BoxShape.circle),
                    child: Icon(icone,
                        size: 18,
                        color: isDark && ton == TonPastille.bleu
                            ? AppColors.accent
                            : couleurIcone)),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Text(titreSansEmoji(notif.titre),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                        fontSize: 13,
                                        fontWeight: nonLue
                                            ? FontWeight.w700
                                            : FontWeight.w600,
                                        color: nonLue
                                            ? (isDark
                                                ? AppColors.darkTextPrimary
                                                : AppColors.lightTextPrimary)
                                            : (isDark
                                                ? AppColors.darkTextPrimary
                                                    .withOpacity(0.8)
                                                : const Color(0xFF3B5675)))),
                              ),
                              const SizedBox(width: 8),
                              Text(heure,
                                  style: TextStyle(fontSize: 11, color: gris)),
                            ]),
                        const SizedBox(height: 2),
                        Text(notif.message,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 12, height: 1.4, color: gris)),
                      ]),
                ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  (IconData, TonPastille) _typeConfig(String type) {
    switch (type) {
      case 'commande_passee':
        return (Icons.check_circle_outline_rounded, TonPastille.vert);
      case 'commande_annulee':
        return (Icons.cancel_outlined, TonPastille.rouge);
      case 'retrait_valide':
        return (Icons.restaurant_rounded, TonPastille.vert);
      case 'retrait_annule':
        return (Icons.undo_rounded, TonPastille.or);
      case 'menu_disponible':
        return (Icons.restaurant_menu_rounded, TonPastille.bleu);
      case 'rappel_48h':
        return (Icons.timer_outlined, TonPastille.or);
      default:
        return (Icons.notifications_none_rounded, TonPastille.bleu);
    }
  }
}

// ── Erreur de chargement ───────────────────────────────────────

class _ErreurNotifications extends StatelessWidget {
  final String message;
  final Future<void> Function() onReessayer;
  const _ErreurNotifications(
      {required this.message, required this.onReessayer});

  @override
  Widget build(BuildContext context) {
    return Center(
        child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_rounded, color: AppColors.error, size: 48),
          const SizedBox(height: 16),
          Text('Chargement impossible',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 6),
          Text(message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Réessayer'),
            onPressed: onReessayer,
          ),
        ],
      ),
    ));
  }
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
