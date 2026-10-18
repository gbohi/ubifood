// lib/features/gestion/gestion_commandes_screen.dart

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../shared/models/models.dart';
import '../../core/widgets/common_widgets.dart';
import '../../core/api/api_client.dart';

class GestionCommandesScreen extends StatefulWidget {
  const GestionCommandesScreen({super.key});
  @override
  State<GestionCommandesScreen> createState() => GestionCommandesScreenState();
}

class GestionCommandesScreenState extends State<GestionCommandesScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<Commande> _commandes = [];
  bool _loading = true;
  String? _erreur;

  // Période par défaut : le mois en cours (avant : tout l'historique)
  DateTime? _dateDebut;
  DateTime? _dateFin;
  int _requete = 0;
  bool _visible = true;

  void charger() => _charger();

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 4, vsync: this);
    _moisCourant();
    WidgetsBinding.instance.addPostFrameCallback((_) => _charger());
  }

  void _moisCourant() {
    final now = DateTime.now();
    _dateDebut = DateTime(now.year, now.month, 1);
    _dateFin = DateTime(now.year, now.month + 1, 0);
  }

  bool get _estMoisCourant {
    final now = DateTime.now();
    return _dateDebut == DateTime(now.year, now.month, 1) &&
        _dateFin == DateTime(now.year, now.month + 1, 0);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // L'IndexedStack de MainShell désactive les tickers des onglets masqués :
    // au retour sur l'onglet (ex. après un retrait validé), on recharge.
    final visible = TickerMode.of(context);
    if (visible && !_visible) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _charger();
      });
    }
    _visible = visible;
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _charger() async {
    final auth = context.read<AuthProvider>();
    final isAdmin = auth.user?.isAdmin ?? false;
    final agenceId = auth.user?.derniereAgenceId;
    final num = ++_requete;

    // Admin : toutes les agences (le serveur ne filtre pas) ;
    // gestionnaire : le serveur limite à son agence.
    if (!isAdmin && agenceId == null) {
      setState(() {
        _loading = false;
        _erreur = 'Aucune agence assignée à votre compte.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _erreur = null;
    });
    try {
      final params = <String, dynamic>{
        if (!isAdmin) 'agence': agenceId,
      };
      if (_dateDebut != null) {
        params['date_debut'] = DateFormat('yyyy-MM-dd').format(_dateDebut!);
      }
      if (_dateFin != null) {
        params['date_fin'] = DateFormat('yyyy-MM-dd').format(_dateFin!);
      }

      final res =
          await apiClient.get('/commandes/par-agence-periode/', params: params);

      final dynamic raw = res.data;
      List<dynamic> list;
      if (raw is List) {
        list = raw;
      } else if (raw is Map && raw.containsKey('results')) {
        list = raw['results'] as List;
      } else {
        list = [];
      }

      if (!mounted || num != _requete) return;
      setState(() {
        _commandes = list
            .map((e) => Commande.fromJson(e as Map<String, dynamic>))
            .toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted || num != _requete) return;
      setState(() {
        _erreur = messageErreurApi(e) ?? 'Erreur de chargement des commandes';
        _loading = false;
      });
    }
  }

  List<Commande> _filtrerParStatut(String? statut) {
    if (statut == null) return _commandes;
    return _commandes.where((c) => c.statut.value == statut).toList();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final secondaire =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final user = context.watch<AuthProvider>().user;
    final isAdmin = user?.isAdmin ?? false;
    final agenceNom = user?.derniereAgence ?? '';
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        toolbarHeight: 0,
        bottom: TabBar(
          controller: _tabs,
          labelColor: AppColors.accent,
          unselectedLabelColor: secondaire,
          indicatorColor: AppColors.accent,
          indicatorSize: TabBarIndicatorSize.label,
          // ✅ isScrollable = true → chaque tab prend la place qu'il lui faut
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: [
            _TabAvecBadge('Toutes', _commandes.length),
            _TabAvecBadge('En attente', _filtrerParStatut('en_attente').length,
                color: AppColors.warning),
            _TabAvecBadge('Retirées', _filtrerParStatut('retiree').length,
                color: AppColors.success),
            _TabAvecBadge('Annulées', _filtrerParStatut('annulee').length,
                color: secondaire),
          ],
        ),
      ),
      body: Column(children: [
        _FiltreDateBar(
          dateDebut: _dateDebut,
          dateFin: _dateFin,
          moisCourant: _estMoisCourant,
          onFiltrer: (debut, fin) {
            if (debut != null && fin != null && debut.isAfter(fin)) {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                  content: Text(
                      'La date de début doit précéder la date de fin.')));
              return;
            }
            setState(() {
              if (debut == null && fin == null) {
                _moisCourant();
              } else {
                _dateDebut = debut;
                _dateFin = fin;
              }
            });
            _charger();
          },
        ),
        if (isAdmin || agenceNom.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Row(children: [
              Icon(Icons.store_mall_directory_outlined,
                  size: 14, color: secondaire),
              const SizedBox(width: 6),
              Expanded(
                child: Text(isAdmin ? 'Toutes les agences' : agenceNom,
                    style: TextStyle(fontSize: 12, color: secondaire),
                    overflow: TextOverflow.ellipsis),
              ),
            ]),
          ),
        if (!_loading && _erreur == null) _StatsBar(commandes: _commandes),
        Expanded(
          child: _loading
              ? ListView(
                  padding: const EdgeInsets.all(16),
                  children:
                      List.generate(5, (_) => const ShimmerCard(height: 72)))
              : _erreur != null
                  ? EmptyState(
                      icon: Icons.error_outline_rounded,
                      title: 'Erreur',
                      subtitle: _erreur!)
                  : TabBarView(
                      controller: _tabs,
                      children: [
                        _ListeCommandes(commandes: _commandes),
                        _ListeCommandes(
                            commandes: _filtrerParStatut('en_attente')),
                        _ListeCommandes(
                            commandes: _filtrerParStatut('retiree')),
                        _ListeCommandes(
                            commandes: _filtrerParStatut('annulee')),
                      ],
                    ),
        ),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// ✅ TAB AVEC BADGE — texte + badge dans un Row propre
// ══════════════════════════════════════════════════════════════

class _TabAvecBadge extends StatelessWidget {
  final String label;
  final int count;
  final Color color;
  const _TabAvecBadge(this.label, this.count, {this.color = AppColors.accent});

  @override
  Widget build(BuildContext context) {
    return Tab(
      child: Row(
        mainAxisSize:
            MainAxisSize.min, // ✅ prend uniquement la place nécessaire
        children: [
          Text(label, style: const TextStyle(fontSize: 13)),
          const SizedBox(width: 5),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
            decoration: BoxDecoration(
              color: color.withOpacity(0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              '$count',
              style: TextStyle(
                  fontSize: 10, fontWeight: FontWeight.w700, color: color),
            ),
          ),
        ],
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// FILTRE DATE
// ══════════════════════════════════════════════════════════════

class _FiltreDateBar extends StatelessWidget {
  final DateTime? dateDebut;
  final DateTime? dateFin;
  final bool moisCourant;
  final void Function(DateTime?, DateTime?) onFiltrer;

  const _FiltreDateBar({
    required this.dateDebut,
    required this.dateFin,
    required this.moisCourant,
    required this.onFiltrer,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // Bouton de retour au mois en cours (période par défaut)
    final hasFiltre = !moisCourant;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        border: Border(
            bottom: BorderSide(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder)),
      ),
      child: Row(children: [
        Expanded(
            child: _DateBtn(
          label: dateDebut != null
              ? DateFormat('dd/MM/yy').format(dateDebut!)
              : 'Date début',
          active: dateDebut != null,
          onTap: () async {
            final d = await showDatePicker(
              context: context,
              initialDate: dateDebut ?? DateTime.now(),
              firstDate: DateTime(2024),
              lastDate: DateTime.now().add(const Duration(days: 365)),
            );
            if (d != null) onFiltrer(d, dateFin);
          },
        )),
        const SizedBox(width: 8),
        Expanded(
            child: _DateBtn(
          label: dateFin != null
              ? DateFormat('dd/MM/yy').format(dateFin!)
              : 'Date fin',
          active: dateFin != null,
          onTap: () async {
            final d = await showDatePicker(
              context: context,
              initialDate: dateFin ?? DateTime.now(),
              firstDate: DateTime(2024),
              lastDate: DateTime.now().add(const Duration(days: 365)),
            );
            if (d != null) onFiltrer(dateDebut, d);
          },
        )),
        if (hasFiltre) ...[
          const SizedBox(width: 8),
          IconButton(
            icon: const Icon(Icons.close_rounded, size: 18),
            color: AppColors.error,
            onPressed: () => onFiltrer(null, null),
            tooltip: 'Revenir au mois en cours',
          ),
        ],
      ]),
    );
  }
}

class _DateBtn extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _DateBtn(
      {required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final secondaire =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final couleurActive = isDark ? AppColors.accent : AppColors.primary;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: active ? couleurActive.withOpacity(0.08) : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
              color: active
                  ? couleurActive
                  : (isDark ? AppColors.darkBorder : AppColors.lightBorder)),
        ),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(Icons.calendar_today_rounded,
              size: 12, color: active ? couleurActive : secondaire),
          const SizedBox(width: 6),
          Flexible(
              child: Text(label,
                  style: TextStyle(
                      fontSize: 12,
                      color: active ? couleurActive : secondaire,
                      fontWeight: active ? FontWeight.w600 : FontWeight.w400),
                  overflow: TextOverflow.ellipsis)),
        ]),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// ✅ BARRE DE STATS — labels courts pour éviter l'overflow
// ══════════════════════════════════════════════════════════════

class _StatsBar extends StatelessWidget {
  final List<Commande> commandes;
  const _StatsBar({required this.commandes});

  @override
  Widget build(BuildContext context) {
    final enAttente =
        commandes.where((c) => c.statut == StatutCommande.enAttente).length;
    final retirees =
        commandes.where((c) => c.statut == StatutCommande.retiree).length;
    final annulees =
        commandes.where((c) => c.statut == StatutCommande.annulee).length;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(children: [
        _StatChip('${commandes.length}', 'Total', AppColors.primary),
        const SizedBox(width: 6),
        _StatChip('$enAttente', 'Attente', AppColors.warning),
        const SizedBox(width: 6),
        _StatChip('$retirees', 'Retirées', AppColors.success),
        const SizedBox(width: 6),
        _StatChip(
            '$annulees',
            'Annulées',
            Theme.of(context).brightness == Brightness.dark
                ? AppColors.darkTextSecondary
                : AppColors.lightTextSecondary),
      ]),
    );
  }
}

class _StatChip extends StatelessWidget {
  final String value;
  final String label;
  final Color color;
  const _StatChip(this.value, this.label, this.color);

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 7),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(value,
                style: TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w800, color: color)),
            const SizedBox(height: 1),
            Text(label,
                style: TextStyle(
                    fontSize: 9, color: color, fontWeight: FontWeight.w500),
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
                textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// LISTE DES COMMANDES
// ══════════════════════════════════════════════════════════════

class _ListeCommandes extends StatelessWidget {
  final List<Commande> commandes;
  const _ListeCommandes({required this.commandes});

  @override
  Widget build(BuildContext context) {
    if (commandes.isEmpty) {
      return EmptyState(
        icon: Icons.receipt_long_outlined,
        title: 'Aucune commande',
        subtitle: 'Aucune commande pour cette période',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: commandes.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, i) => _CommandeGestionCard(commande: commandes[i]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// CARTE COMMANDE — vue gestionnaire
// ══════════════════════════════════════════════════════════════

class _CommandeGestionCard extends StatelessWidget {
  final Commande commande;
  const _CommandeGestionCard({required this.commande});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final dateMenu = commande.menuDetail?.dateMenu != null
        ? DateTime.tryParse(commande.menuDetail!.dateMenu)
        : null;
    final dateCmde = DateTime.tryParse(commande.dateCommande)?.toLocal();
    final secondaire =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(isDark ? 0.15 : 0.04),
            blurRadius: 6,
            offset: const Offset(0, 2),
          )
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Photo plat
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: commande.platDetail?.imageUrl != null
                ? Image.network(commande.platDetail!.imageUrl!,
                    width: 52,
                    height: 52,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => _iconPlat())
                : _iconPlat(),
          ),
          const SizedBox(width: 12),

          // Infos — Expanded pour ne jamais déborder
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Nom plat
                Text(
                  commande.platDetail?.nom ?? '—',
                  style: Theme.of(context).textTheme.titleSmall,
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                ),
                const SizedBox(height: 4),

                // Employé
                Row(children: [
                  Icon(Icons.person_outline_rounded,
                      size: 12, color: secondaire),
                  const SizedBox(width: 3),
                  Expanded(
                    child: Text(
                      commande.userNom.isNotEmpty ? commande.userNom : '—',
                      style: TextStyle(fontSize: 12, color: secondaire),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ]),
                const SizedBox(height: 3),

                // Date menu + heure
                Row(children: [
                  Icon(Icons.calendar_today_rounded,
                      size: 12, color: secondaire),
                  const SizedBox(width: 3),
                  Flexible(
                    child: Text(
                      dateMenu != null
                          ? DateFormat('EEE dd/MM/yyyy', 'fr_FR')
                              .format(dateMenu)
                          : '—',
                      style: TextStyle(fontSize: 11, color: secondaire),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (dateCmde != null) ...[
                    const SizedBox(width: 6),
                    Icon(Icons.access_time_rounded,
                        size: 12, color: secondaire),
                    const SizedBox(width: 3),
                    Text(
                      DateFormat('HH:mm').format(dateCmde),
                      style: TextStyle(fontSize: 11, color: secondaire),
                    ),
                  ],
                ]),
              ],
            ),
          ),

          // Badge statut
          const SizedBox(width: 8),
          StatutBadge(statut: commande.statut),
        ],
      ),
    );
  }

  Widget _iconPlat() => Container(
        width: 52,
        height: 52,
        decoration: BoxDecoration(
          color: AppColors.primary.withOpacity(0.07),
          borderRadius: BorderRadius.circular(10),
        ),
        child: const Icon(Icons.restaurant_rounded,
            color: AppColors.primary, size: 24),
      );
}
