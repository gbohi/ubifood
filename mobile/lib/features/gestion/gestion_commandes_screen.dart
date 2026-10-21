// lib/features/gestion/gestion_commandes_screen.dart
//
// Gestion des commandes (gestionnaire / administrateur) : compteurs qui
// servent de filtres, recherche employé / plat, liste groupée par jour,
// actions destructrices dans un menu ⋮ avec confirmation.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../shared/models/models.dart';
import '../../core/widgets/common_widgets.dart';
import '../../core/api/api_client.dart';

enum _Filtre { toutes, aServir, retirees, annulees }

class GestionCommandesScreen extends StatefulWidget {
  const GestionCommandesScreen({super.key});
  @override
  State<GestionCommandesScreen> createState() => GestionCommandesScreenState();
}

class GestionCommandesScreenState extends State<GestionCommandesScreen> {
  List<Commande> _commandes = [];
  bool _loading = true;
  String? _erreur;
  _Filtre _filtre = _Filtre.toutes;
  final _rechercheCtrl = TextEditingController();
  String _recherche = '';

  // Période par défaut : le mois en cours (avant : tout l'historique)
  DateTime? _dateDebut;
  DateTime? _dateFin;
  int _requete = 0;
  bool _visible = true;

  void charger() => _charger();

  @override
  void initState() {
    super.initState();
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
    _rechercheCtrl.dispose();
    super.dispose();
  }

  Future<void> _charger() async {
    final auth = context.read<AuthProvider>();
    final isAdmin = auth.user?.isAdmin ?? false;
    final agenceId = auth.user?.derniereAgenceId;
    final num = ++_requete;

    // Admin : toutes les agences (le serveur ne filtre pas) ;
    // gestionnaire : le serveur limite à SES agences (pas de paramètre agence,
    // sinon un gestionnaire de plusieurs agences n'en voyait qu'une).
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
      final params = <String, dynamic>{};
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

  bool _dansFiltre(Commande c, _Filtre f) => switch (f) {
        _Filtre.toutes => true,
        _Filtre.aServir => c.statut == StatutCommande.enAttente,
        _Filtre.retirees => c.statut == StatutCommande.retiree,
        _Filtre.annulees => c.statut == StatutCommande.annulee,
      };

  bool _correspond(Commande c) {
    final q = _recherche.trim().toLowerCase();
    if (q.isEmpty) return true;
    return c.userNom.toLowerCase().contains(q) ||
        (c.platDetail?.nom.toLowerCase().contains(q) ?? false);
  }

  String get _libellePeriode {
    final d = _dateDebut, f = _dateFin;
    if (_estMoisCourant && d != null && f != null) {
      return 'du 1er au ${f.day} ${DateFormat('MMMM', 'fr_FR').format(f)}';
    }
    String fmt(DateTime x) => DateFormat('dd/MM/yy').format(x);
    if (d != null && f != null) return 'du ${fmt(d)} au ${fmt(f)}';
    if (d != null) return 'depuis le ${fmt(d)}';
    if (f != null) return "jusqu'au ${fmt(f)}";
    return 'toutes les dates';
  }

  void _appliquerPeriode(DateTime? debut, DateTime? fin) {
    if (debut != null && fin != null && debut.isAfter(fin)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('La date de début doit précéder la date de fin.')));
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
  }

  void _choisirPeriode() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetCtx) {
        Future<void> choisir(bool debut) async {
          final d = await showDatePicker(
            context: sheetCtx,
            initialDate: (debut ? _dateDebut : _dateFin) ?? DateTime.now(),
            firstDate: DateTime(2024),
            lastDate: DateTime.now().add(const Duration(days: 365)),
          );
          if (d == null) return;
          if (sheetCtx.mounted) Navigator.pop(sheetCtx);
          debut
              ? _appliquerPeriode(d, _dateFin)
              : _appliquerPeriode(_dateDebut, d);
        }

        String fmt(DateTime? d) =>
            d == null ? '—' : DateFormat('EEE dd/MM/yyyy', 'fr_FR').format(d);
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Période',
                      style: Theme.of(sheetCtx)
                          .textTheme
                          .titleLarge
                          ?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.event_rounded),
                    title: const Text('Date de début'),
                    subtitle: Text(fmt(_dateDebut)),
                    onTap: () => choisir(true),
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.event_available_rounded),
                    title: const Text('Date de fin'),
                    subtitle: Text(fmt(_dateFin)),
                    onTap: () => choisir(false),
                  ),
                  if (!_estMoisCourant)
                    TextButton.icon(
                      icon: const Icon(Icons.restart_alt_rounded, size: 18),
                      label: const Text('Revenir au mois en cours'),
                      onPressed: () {
                        Navigator.pop(sheetCtx);
                        _appliquerPeriode(null, null);
                      },
                    ),
                ]),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final user = context.watch<AuthProvider>().user;
    final isAdmin = user?.isAdmin ?? false;
    final agenceNom = user?.derniereAgence ?? '';

    final enTete = EnTeteMarine(
      titre: 'Gestion commandes',
      sousTitre: [
        isAdmin ? 'Toutes les agences' : agenceNom,
        _libellePeriode,
      ].where((e) => e.isNotEmpty).join(' · '),
      actions: [
        EnTeteBouton(
          icone: Icons.calendar_month_outlined,
          tooltip: 'Choisir la période',
          badge: _estMoisCourant ? 0 : 1,
          onPressed: _choisirPeriode,
        ),
      ],
    );

    Widget corps;
    if (_loading && _commandes.isEmpty) {
      corps = ListView(
          padding: const EdgeInsets.all(14),
          children: List.generate(6, (_) => const ShimmerCard(height: 60)));
    } else if (_erreur != null && _commandes.isEmpty) {
      corps = EmptyState(
          icon: Icons.error_outline_rounded,
          title: 'Erreur',
          subtitle: _erreur!,
          action: ElevatedButton.icon(
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Réessayer'),
            onPressed: _charger,
          ));
    } else {
      final recherchees = _commandes.where(_correspond).toList();
      int compte(_Filtre f) =>
          recherchees.where((c) => _dansFiltre(c, f)).length;
      final liste = recherchees.where((c) => _dansFiltre(c, _filtre)).toList();
      final gris =
          isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
      corps = Column(children: [
        // ── Compteurs = filtres ─────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
          child: Row(children: [
            for (final (f, label, couleur) in [
              (_Filtre.toutes, 'Toutes', null),
              (
                _Filtre.aServir,
                'À servir',
                isDark ? const Color(0xFFFFC94D) : const Color(0xFFB97800)
              ),
              (
                _Filtre.retirees,
                'Retirées',
                isDark ? AppColors.accent : const Color(0xFF1F9D55)
              ),
              (_Filtre.annulees, 'Annulées', gris),
            ]) ...[
              if (f != _Filtre.toutes) const SizedBox(width: 6),
              Expanded(
                child: _CompteurFiltre(
                  valeur: compte(f),
                  label: label,
                  couleur: couleur,
                  actif: _filtre == f,
                  onTap: () => setState(() => _filtre = f),
                ),
              ),
            ],
          ]),
        ),
        // ── Recherche ──────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
          child: TextField(
            controller: _rechercheCtrl,
            onChanged: (v) => setState(() => _recherche = v),
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Rechercher un employé ou un plat',
              isDense: true,
              filled: true,
              fillColor: isDark ? AppColors.darkCard : AppColors.lightCard,
              prefixIcon: Icon(Icons.search_rounded, color: gris, size: 20),
              suffixIcon: _recherche.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Effacer',
                      icon: Icon(Icons.close_rounded, color: gris, size: 18),
                      onPressed: () => setState(() {
                        _rechercheCtrl.clear();
                        _recherche = '';
                      }),
                    ),
            ),
          ),
        ),
        if (_erreur != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
            child: BandeauInfo(
              icone: Icons.cloud_off_rounded,
              ton: TonPastille.rouge,
              texte: 'Actualisation impossible : $_erreur',
              action: TextButton(
                  onPressed: _charger, child: const Text('Réessayer')),
            ),
          ),
        if (_loading)
          const Padding(
            padding: EdgeInsets.fromLTRB(14, 8, 14, 0),
            child: LinearProgressIndicator(minHeight: 2),
          ),
        Expanded(
          child: _ListeParJour(
            commandes: liste,
            vide: _recherche.isNotEmpty
                ? 'Aucun résultat pour « ${_recherche.trim()} »'
                : 'Aucune commande pour cette période',
            afficherAgence: isAdmin,
            onRefresh: _charger,
          ),
        ),
      ]);
    }

    return Scaffold(body: Column(children: [enTete, Expanded(child: corps)]));
  }
}

class _CompteurFiltre extends StatelessWidget {
  final int valeur;
  final String label;
  final Color? couleur;
  final bool actif;
  final VoidCallback onTap;
  const _CompteurFiltre({
    required this.valeur,
    required this.label,
    required this.couleur,
    required this.actif,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fondActif = isDark ? AppColors.accent : AppColors.primary;
    final texteActif = isDark ? AppColors.primary : Colors.white;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    return Semantics(
      button: true,
      selected: actif,
      label: '$label : $valeur',
      excludeSemantics: true,
      child: Material(
        color: actif
            ? fondActif
            : (isDark ? AppColors.darkCard : AppColors.lightCard),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(
                color: actif
                    ? fondActif
                    : (isDark ? AppColors.darkBorder : AppColors.lightBorder))),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 7),
            child: Column(children: [
              Text('$valeur',
                  style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                      color: actif
                          ? texteActif
                          : (couleur ??
                              (isDark
                                  ? AppColors.darkTextPrimary
                                  : AppColors.lightTextPrimary)))),
              Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 10.5,
                      color: actif ? texteActif.withOpacity(0.75) : gris)),
            ]),
          ),
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// LISTE GROUPÉE PAR JOUR
// ══════════════════════════════════════════════════════════════

class _ListeParJour extends StatelessWidget {
  final List<Commande> commandes;
  final String vide;
  final bool afficherAgence;
  final Future<void> Function() onRefresh;
  const _ListeParJour({
    required this.commandes,
    required this.vide,
    required this.afficherAgence,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    // Tirer pour actualiser (y compris liste vide)
    if (commandes.isEmpty) {
      return RefreshIndicator(
        onRefresh: onRefresh,
        child: LayoutBuilder(
          builder: (_, constraints) => SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: EmptyState(
                icon: Icons.receipt_long_outlined,
                title: 'Aucune commande',
                subtitle: vide,
              ),
            ),
          ),
        ),
      );
    }
    final triees = List.of(commandes)
      ..sort((a, b) =>
          (b.jourMenu ?? DateTime(0)).compareTo(a.jourMenu ?? DateTime(0)));
    final groupes = <DateTime?, List<Commande>>{};
    for (final c in triees) {
      groupes.putIfAbsent(c.jourMenu, () => []).add(c);
    }
    String cap(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(14, 8, 14, 100),
        children: [
          for (final g in groupes.entries) ...[
            LibelleSection(
                '${g.key == null ? 'Date inconnue' : cap(DateFormat('EEEE d MMMM', 'fr_FR').format(g.key!))}'
                ' · ${g.value.length}'),
            CarteListe(lignes: [
              for (final c in g.value)
                _LigneGestion(
                    commande: c,
                    afficherAgence: afficherAgence,
                    onModifiee: onRefresh),
            ]),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}

PastilleStatut _pastille(Commande c) {
  if (c.estNonRetiree()) {
    return const PastilleStatut(label: 'Non retiré', ton: TonPastille.rouge);
  }
  return switch (c.statut) {
    StatutCommande.enAttente =>
      const PastilleStatut(label: 'À servir', ton: TonPastille.or),
    StatutCommande.retiree =>
      const PastilleStatut(label: 'Retirée', ton: TonPastille.vert),
    StatutCommande.annulee =>
      const PastilleStatut(label: 'Annulée', ton: TonPastille.gris),
  };
}

class _LigneGestion extends StatelessWidget {
  final Commande commande;
  final bool afficherAgence;

  /// Après une annulation (commande ou retrait) : rechargement de la liste
  final Future<void> Function() onModifiee;
  const _LigneGestion(
      {required this.commande,
      required this.afficherAgence,
      required this.onModifiee});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final c = commande;
    final cmdProv = context.watch<CommandeProvider>();
    final enCours = cmdProv.actionGestionEnCours == c.id;
    final sousTitre = [
      c.platDetail?.nom ?? '—',
      if (afficherAgence && (c.menuDetail?.agenceNom ?? '').isNotEmpty)
        c.menuDetail!.agenceNom,
    ].join(' · ');
    return InkWell(
      onTap: () => _detail(context),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 9, 4, 9),
        child: Row(children: [
          AvatarNom(nom: c.userNom.isEmpty ? '?' : c.userNom),
          const SizedBox(width: 10),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(c.userNom.isNotEmpty ? c.userNom : '—',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontSize: 13, fontWeight: FontWeight.w700)),
              Text(sousTitre,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11.5, color: gris)),
              // Annulation décidée par un gestionnaire / administrateur
              if (c.libelleAnnulationGestionnaire != null)
                Text(c.libelleAnnulationGestionnaire!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 11,
                        color: gris,
                        fontStyle: FontStyle.italic)),
            ]),
          ),
          const SizedBox(width: 6),
          _pastille(c),
          SizedBox(
            width: 40,
            child: enCours
                ? const Center(
                    child: SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2)))
                : _MenuActions(
                    commande: c,
                    occupe: cmdProv.actionGestionEnCours != null,
                    onDetail: () => _detail(context),
                    onModifiee: onModifiee),
          ),
        ]),
      ),
    );
  }

  void _detail(BuildContext context) {
    final c = commande;
    final dateMenu = c.jourMenu;
    final dateCmde = DateTime.tryParse(c.dateCommande)?.toLocal();
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetCtx) {
        final gris = Theme.of(sheetCtx).brightness == Brightness.dark
            ? AppColors.darkTextSecondary
            : AppColors.lightTextSecondary;
        Widget ligne(IconData i, String t) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(children: [
                Icon(i, size: 16, color: gris),
                const SizedBox(width: 8),
                Expanded(child: Text(t)),
              ]),
            );
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(children: [
                    VignettePlat(
                        url: c.platDetail?.imageUrl, taille: 52, rayon: 12),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(c.platDetail?.nom ?? '—',
                                style: Theme.of(sheetCtx)
                                    .textTheme
                                    .titleLarge
                                    ?.copyWith(fontWeight: FontWeight.w700)),
                            Text(c.userNom,
                                style: TextStyle(fontSize: 12.5, color: gris)),
                          ]),
                    ),
                    _pastille(c),
                  ]),
                  const SizedBox(height: 16),
                  if (dateMenu != null)
                    ligne(Icons.calendar_today_rounded,
                        'Menu du ${DateFormat('EEEE d MMMM yyyy', 'fr_FR').format(dateMenu)}'),
                  if (dateCmde != null)
                    ligne(Icons.access_time_rounded,
                        'Commandé le ${DateFormat("dd/MM/yyyy 'à' HH:mm").format(dateCmde)}'),
                  if ((c.menuDetail?.agenceNom ?? '').isNotEmpty)
                    ligne(
                        Icons.location_on_outlined,
                        [
                          c.menuDetail!.agenceNom,
                          c.menuDetail!.typeEquipeLibelle
                        ].where((e) => e.isNotEmpty).join(' · ')),
                  if (c.libelleAnnulationGestionnaire != null)
                    ligne(Icons.admin_panel_settings_outlined,
                        c.libelleAnnulationGestionnaire!),
                ]),
          ),
        );
      },
    );
  }
}

// ══════════════════════════════════════════════════════════════
// MENU ⋮ : détail, annuler la commande / annuler le retrait
// ══════════════════════════════════════════════════════════════

class _MenuActions extends StatelessWidget {
  final Commande commande;
  final bool occupe;
  final VoidCallback onDetail;
  final Future<void> Function() onModifiee;
  const _MenuActions({
    required this.commande,
    required this.occupe,
    required this.onDetail,
    required this.onModifiee,
  });

  bool get _estRetrait => commande.statut == StatutCommande.retiree;

  @override
  Widget build(BuildContext context) {
    final gestionnaire = context.read<AuthProvider>().isGestionnaire;
    final actionPossible = gestionnaire &&
        (commande.statut == StatutCommande.enAttente ||
            commande.statut == StatutCommande.retiree);
    return PopupMenuButton<String>(
      tooltip: 'Actions',
      icon: const Icon(Icons.more_vert_rounded, size: 20),
      onSelected: (v) {
        if (v == 'detail') onDetail();
        if (v == 'annuler') _confirmer(context);
      },
      itemBuilder: (_) => [
        const PopupMenuItem(
          value: 'detail',
          child: Row(children: [
            Icon(Icons.visibility_outlined, size: 18),
            SizedBox(width: 8),
            Text('Voir le détail'),
          ]),
        ),
        if (actionPossible)
          PopupMenuItem(
            value: 'annuler',
            // Une seule action à la fois, toutes lignes confondues
            enabled: !occupe,
            child: Row(children: [
              Icon(_estRetrait ? Icons.undo_rounded : Icons.cancel_outlined,
                  size: 18,
                  color: _estRetrait ? AppColors.warning : AppColors.error),
              const SizedBox(width: 8),
              Text(_estRetrait ? 'Annuler le retrait…' : 'Annuler la commande…',
                  style: TextStyle(
                      color: _estRetrait ? AppColors.warning : AppColors.error,
                      fontWeight: FontWeight.w600)),
            ]),
          ),
      ],
    );
  }

  Future<void> _confirmer(BuildContext context) async {
    final cmdProv = context.read<CommandeProvider>();
    final agent = commande.userNom.isNotEmpty ? commande.userNom : "l'agent";
    final plat = commande.platDetail?.nom;
    final dateMenu = DateTime.tryParse(commande.menuDetail?.dateMenu ?? '');
    final repas = [
      if (plat != null) '« $plat »',
      if (dateMenu != null)
        'du ${DateFormat('EEEE d MMMM', 'fr_FR').format(dateMenu)}',
    ].join(' ');
    final explication = _estRetrait
        ? 'Le retrait du repas ${repas.isEmpty ? '' : '$repas '}de $agent '
            'sera annulé : la commande repassera « en attente » et l\'avis '
            'éventuellement laissé par l\'agent sera supprimé.\n\n'
            'L\'agent sera notifié.'
        : 'La commande ${repas.isEmpty ? '' : '$repas '}de $agent sera '
            'annulée, même si la date limite d\'annulation est dépassée.\n\n'
            'L\'agent sera notifié.';

    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(children: [
          Icon(Icons.warning_amber_rounded,
              color: _estRetrait ? AppColors.warning : AppColors.error),
          const SizedBox(width: 8),
          Expanded(
              child: Text(_estRetrait
                  ? 'Annuler le retrait ?'
                  : 'Annuler la commande ?')),
        ]),
        content: Text(explication),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogCtx, false),
            child: const Text('Non'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor:
                  _estRetrait ? AppColors.warning : AppColors.error,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(dialogCtx, true),
            child:
                Text(_estRetrait ? 'Oui, annuler le retrait' : 'Oui, annuler'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;

    // Capturé avant l'await : la ligne peut changer de filtre (statut modifié)
    final messenger = ScaffoldMessenger.of(context);
    final erreur = _estRetrait
        ? await cmdProv.annulerRetrait(commande.id)
        : await cmdProv.annulerCommandeAgent(commande.id);
    messenger.showSnackBar(SnackBar(
      content: Text(erreur ??
          (_estRetrait
              ? 'Retrait annulé : la commande est de nouveau en attente'
              : 'Commande annulée — l\'agent a été notifié')),
      backgroundColor: erreur == null ? AppColors.success : AppColors.error,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      margin: const EdgeInsets.all(12),
    ));
    // Succès ou refus (commande modifiée entre-temps) : liste à jour
    await onModifiee();
  }
}
