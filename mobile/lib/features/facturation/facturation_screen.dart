// lib/features/facturation/facturation_screen.dart

import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../shared/models/models.dart';
import '../../core/widgets/common_widgets.dart';

class FacturationScreen extends StatefulWidget {
  const FacturationScreen({super.key});
  @override
  State<FacturationScreen> createState() => _FacturationScreenState();
}

class _FacturationScreenState extends State<FacturationScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;

  // Filtres historique
  DateTime? _dateDebut;
  DateTime? _dateFin;
  String? _agenceFiltre;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<CommandeProvider>().loadMesCommandes();
      final auth = context.read<AuthProvider>();
      final catId = auth.user?.derniereCategoriesalarieId;
      if (catId != null) {
        context.read<TarifProvider>().loadTarifs(catId);
      }
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
        title: canPop ? const Text('Ma facturation') : null,
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
          labelColor: AppColors.accent,
          unselectedLabelColor: AppColors.lightTextSecondary,
          indicatorColor: AppColors.accent,
          indicatorSize: TabBarIndicatorSize.label,
          tabs: const [
            Tab(
                icon: Icon(Icons.history_rounded, size: 18),
                text: 'Historique'),
            Tab(
                icon: Icon(Icons.calendar_month_rounded, size: 18),
                text: 'Récapitulatif'),
          ],
        ),
      ),
      body: Consumer2<CommandeProvider, TarifProvider>(
          builder: (_, cmdProv, tarifProv, __) {
        if (cmdProv.isLoading) {
          return ListView(
              padding: const EdgeInsets.all(16),
              children: List.generate(4, (_) => const ShimmerCard()));
        }
        return TabBarView(
          controller: _tabs,
          children: [
            _HistoriqueTab(
              commandes: cmdProv.mesCommandes,
              dateDebut: _dateDebut,
              dateFin: _dateFin,
              agenceFiltre: _agenceFiltre,
              onFiltrer: (debut, fin, agence) => setState(() {
                _dateDebut = debut;
                _dateFin = fin;
                _agenceFiltre = agence;
              }),
            ),
            _RecapMensuelTab(
              commandes: cmdProv.mesCommandes,
              tarifProvider: tarifProv,
            ),
          ],
        );
      }),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// ONGLET 1 — HISTORIQUE
// ══════════════════════════════════════════════════════════════

class _HistoriqueTab extends StatelessWidget {
  final List<Commande> commandes;
  final DateTime? dateDebut;
  final DateTime? dateFin;
  final String? agenceFiltre;
  final void Function(DateTime?, DateTime?, String?) onFiltrer;

  const _HistoriqueTab({
    required this.commandes,
    required this.dateDebut,
    required this.dateFin,
    required this.agenceFiltre,
    required this.onFiltrer,
  });

  List<Commande> get _commandesFiltrees {
    return commandes.where((c) {
      // Date menu
      final dateMenu = c.menuDetail?.dateMenu != null
          ? DateTime.tryParse(c.menuDetail!.dateMenu)
          : null;
      if (dateDebut != null &&
          dateMenu != null &&
          dateMenu.isBefore(dateDebut!)) return false;
      if (dateFin != null && dateMenu != null && dateMenu.isAfter(dateFin!))
        return false;
      // Agence
      if (agenceFiltre != null && agenceFiltre!.isNotEmpty) {
        final agence = c.menuDetail?.agenceNom ?? '';
        if (!agence.toLowerCase().contains(agenceFiltre!.toLowerCase()))
          return false;
      }
      return true;
    }).toList();
  }

  // Extraire les agences uniques
  List<String> get _agences => commandes
      .map((c) => c.menuDetail?.agenceNom ?? '')
      .where((a) => a.isNotEmpty)
      .toSet()
      .toList()
    ..sort();

  @override
  Widget build(BuildContext context) {
    final filtrees = _commandesFiltrees;
    final hasFiltre = dateDebut != null ||
        dateFin != null ||
        (agenceFiltre != null && agenceFiltre!.isNotEmpty);

    return Column(children: [
      // ── Barre de filtres ─────────────────────────────────
      _FiltreBarre(
        dateDebut: dateDebut,
        dateFin: dateFin,
        agenceFiltre: agenceFiltre,
        agences: _agences,
        onFiltrer: onFiltrer,
      ),

      // ── Compteur ─────────────────────────────────────────
      if (hasFiltre)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Row(children: [
            Text('${filtrees.length} résultat(s)',
                style: const TextStyle(
                    fontSize: 12, color: AppColors.lightTextSecondary)),
            const Spacer(),
            TextButton.icon(
              icon: const Icon(Icons.clear_rounded, size: 14),
              label:
                  const Text('Effacer filtres', style: TextStyle(fontSize: 12)),
              onPressed: () => onFiltrer(null, null, null),
            ),
          ]),
        ),

      // ── Liste ─────────────────────────────────────────────
      Expanded(
        child: filtrees.isEmpty
            ? EmptyState(
                icon: Icons.receipt_long_outlined,
                title: 'Aucune commande',
                subtitle: hasFiltre
                    ? 'Aucun résultat pour ces filtres'
                    : 'Vous n\'avez pas encore commandé',
              )
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: filtrees.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (_, i) =>
                    _CommandeHistoriqueCard(commande: filtrees[i]),
              ),
      ),
    ]);
  }
}

// ── Barre de filtres ───────────────────────────────────────────

class _FiltreBarre extends StatelessWidget {
  final DateTime? dateDebut;
  final DateTime? dateFin;
  final String? agenceFiltre;
  final List<String> agences;
  final void Function(DateTime?, DateTime?, String?) onFiltrer;

  const _FiltreBarre({
    required this.dateDebut,
    required this.dateFin,
    required this.agenceFiltre,
    required this.agences,
    required this.onFiltrer,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        border: Border(
            bottom: BorderSide(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder)),
      ),
      child: Column(children: [
        // Ligne 1 — dates
        Row(children: [
          Expanded(
              child: _DateChip(
            label: dateDebut != null
                ? 'Du ${DateFormat('dd/MM/yy').format(dateDebut!)}'
                : 'Date début',
            active: dateDebut != null,
            onTap: () async {
              final d = await showDatePicker(
                context: context,
                initialDate: dateDebut ?? DateTime.now(),
                firstDate: DateTime(2020),
                lastDate: DateTime.now().add(const Duration(days: 365)),
              );
              if (d != null) onFiltrer(d, dateFin, agenceFiltre);
            },
          )),
          const SizedBox(width: 8),
          Expanded(
              child: _DateChip(
            label: dateFin != null
                ? 'Au ${DateFormat('dd/MM/yy').format(dateFin!)}'
                : 'Date fin',
            active: dateFin != null,
            onTap: () async {
              final d = await showDatePicker(
                context: context,
                initialDate: dateFin ?? DateTime.now(),
                firstDate: DateTime(2020),
                lastDate: DateTime.now().add(const Duration(days: 365)),
              );
              if (d != null) onFiltrer(dateDebut, d, agenceFiltre);
            },
          )),
        ]),
        const SizedBox(height: 8),
        // Ligne 2 — agence
        if (agences.isNotEmpty)
          SizedBox(
            height: 32,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: agences.length + 1,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                if (i == 0) {
                  return _AgenceChip(
                    label: 'Toutes',
                    active: agenceFiltre == null || agenceFiltre!.isEmpty,
                    onTap: () => onFiltrer(dateDebut, dateFin, null),
                  );
                }
                final ag = agences[i - 1];
                return _AgenceChip(
                  label: ag,
                  active: agenceFiltre == ag,
                  onTap: () => onFiltrer(dateDebut, dateFin, ag),
                );
              },
            ),
          ),
      ]),
    );
  }
}

class _DateChip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _DateChip(
      {required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color:
              active ? AppColors.primary.withOpacity(0.08) : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
              color: active ? AppColors.primary : AppColors.lightBorder),
        ),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(Icons.calendar_today_rounded,
              size: 13,
              color: active ? AppColors.primary : AppColors.lightTextSecondary),
          const SizedBox(width: 6),
          Text(label,
              style: TextStyle(
                  fontSize: 12,
                  color:
                      active ? AppColors.primary : AppColors.lightTextSecondary,
                  fontWeight: active ? FontWeight.w600 : FontWeight.w400)),
        ]),
      ),
    );
  }
}

class _AgenceChip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _AgenceChip(
      {required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: active ? AppColors.accent : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: active ? AppColors.accent : AppColors.lightBorder),
        ),
        child: Text(label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: active ? AppColors.primary : AppColors.lightTextSecondary,
            )),
      ),
    );
  }
}

// ── Carte commande historique ──────────────────────────────────

class _CommandeHistoriqueCard extends StatelessWidget {
  final Commande commande;
  const _CommandeHistoriqueCard({required this.commande});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final dateMenu = commande.menuDetail?.dateMenu != null
        ? DateTime.tryParse(commande.menuDetail!.dateMenu)
        : null;
    final dateCmde = DateTime.tryParse(commande.dateCommande);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Row(children: [
        // Icône plat
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: AppColors.primary.withOpacity(0.08),
            borderRadius: BorderRadius.circular(12),
          ),
          child: commande.platDetail?.imageUrl != null
              ? ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.network(commande.platDetail!.imageUrl!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const Icon(
                          Icons.restaurant_rounded,
                          color: AppColors.primary,
                          size: 22)),
                )
              : const Icon(Icons.restaurant_rounded,
                  color: AppColors.primary, size: 22),
        ),
        const SizedBox(width: 12),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(commande.platDetail?.nom ?? '—',
              style: Theme.of(context).textTheme.titleSmall,
              overflow: TextOverflow.ellipsis),
          const SizedBox(height: 2),
          Text(commande.menuDetail?.agenceNom ?? '—',
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 2),
          Row(children: [
            Icon(Icons.calendar_today_rounded,
                size: 11, color: AppColors.lightTextSecondary),
            const SizedBox(width: 3),
            Text(
                dateMenu != null
                    ? DateFormat('dd/MM/yyyy').format(dateMenu)
                    : '—',
                style: const TextStyle(
                    fontSize: 11, color: AppColors.lightTextSecondary)),
            const SizedBox(width: 10),
            if (dateCmde != null) ...[
              Icon(Icons.access_time_rounded,
                  size: 11, color: AppColors.lightTextSecondary),
              const SizedBox(width: 3),
              Text(DateFormat('HH:mm').format(dateCmde),
                  style: const TextStyle(
                      fontSize: 11, color: AppColors.lightTextSecondary)),
            ],
          ]),
        ])),
        const SizedBox(width: 8),
        StatutBadge(statut: commande.statut),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// ONGLET 2 — RÉCAPITULATIF MENSUEL
// ══════════════════════════════════════════════════════════════

class _RecapMensuelTab extends StatelessWidget {
  final List<Commande> commandes;
  final TarifProvider tarifProvider;

  const _RecapMensuelTab({
    required this.commandes,
    required this.tarifProvider,
  });

  Map<String, List<Commande>> get _parMois {
    final actives =
        commandes.where((c) => c.statut != StatutCommande.annulee).toList();
    final Map<String, List<Commande>> grouped = {};
    for (final c in actives) {
      final dateMenu = c.menuDetail?.dateMenu != null
          ? DateTime.tryParse(c.menuDetail!.dateMenu)
          : null;
      if (dateMenu == null) continue;
      final key = DateFormat('yyyy-MM').format(dateMenu);
      grouped.putIfAbsent(key, () => []).add(c);
    }
    return Map.fromEntries(
        grouped.entries.toList()..sort((a, b) => b.key.compareTo(a.key)));
  }

  @override
  Widget build(BuildContext context) {
    final grouped = _parMois;

    if (grouped.isEmpty) {
      return EmptyState(
        icon: Icons.account_balance_wallet_outlined,
        title: 'Aucune commande',
        subtitle: 'Votre récapitulatif apparaîtra ici',
      );
    }

    if (!tarifProvider.loaded && !tarifProvider.loading) {
      return EmptyState(
        icon: Icons.price_change_outlined,
        title: 'Tarifs non disponibles',
        subtitle: 'Votre catégorie salariale n\'a pas de tarif défini.\n'
            'Contactez votre administrateur.',
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: grouped.length,
      separatorBuilder: (_, __) => const SizedBox(height: 16),
      itemBuilder: (_, i) {
        final entry = grouped.entries.elementAt(i);
        return _MoisCard(
          moisKey: entry.key,
          commandes: entry.value,
          tarifProvider: tarifProvider,
        );
      },
    );
  }
}

// ── Carte mois ─────────────────────────────────────────────────

class _MoisCard extends StatefulWidget {
  final String moisKey;
  final List<Commande> commandes;
  final TarifProvider tarifProvider;

  const _MoisCard({
    required this.moisKey,
    required this.commandes,
    required this.tarifProvider,
  });

  @override
  State<_MoisCard> createState() => _MoisCardState();
}

class _MoisCardState extends State<_MoisCard> {
  bool _expanded = false;

  String get _moisLibelle {
    final d = DateTime.tryParse('${widget.moisKey}-01');
    if (d == null) return widget.moisKey;
    return DateFormat('MMMM yyyy', 'fr_FR').format(d);
  }

  String _fmt(double m) =>
      m > 0 ? NumberFormat('#,##0', 'fr_FR').format(m) + ' FCFA' : 'N/D';

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final nbCmdes = widget.commandes.length;
    final nbEn = widget.commandes
        .where((c) => c.statut == StatutCommande.enAttente)
        .length;
    final nbRet = widget.commandes
        .where((c) => c.statut == StatutCommande.retiree)
        .length;
    final totalMois = widget.tarifProvider.calculerTotal(widget.commandes);

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Column(children: [
        // ── Header mois ──────────────────────────────────────
        InkWell(
          onTap: () => setState(() => _expanded = !_expanded),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                      colors: [AppColors.accent, AppColors.accentDark]),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.calendar_month_rounded,
                    color: Colors.white, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(
                        _moisLibelle[0].toUpperCase() +
                            _moisLibelle.substring(1),
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 2),
                    Text('$nbCmdes repas • $nbEn en attente • $nbRet retirés',
                        style: Theme.of(context).textTheme.bodySmall),
                  ])),
              // ✅ Total à payer
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(_fmt(totalMois),
                    style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: AppColors.accent)),
                const SizedBox(height: 2),
                const Text('Total à payer',
                    style: TextStyle(
                        fontSize: 10, color: AppColors.lightTextSecondary)),
              ]),
            ]),
          ),
        ),

        // ── Bouton PDF + toggle ───────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
          child: Row(children: [
            Expanded(
                child: Divider(
                    height: 1,
                    color:
                        isDark ? AppColors.darkBorder : AppColors.lightBorder)),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: () => _exporterPDF(context),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                decoration: BoxDecoration(
                  color: AppColors.error.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.error.withOpacity(0.3)),
                ),
                child: const Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.picture_as_pdf_rounded,
                      color: AppColors.error, size: 13),
                  SizedBox(width: 4),
                  Text('PDF',
                      style: TextStyle(
                          fontSize: 11,
                          color: AppColors.error,
                          fontWeight: FontWeight.w600)),
                ]),
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: () => setState(() => _expanded = !_expanded),
              child: Icon(
                  _expanded
                      ? Icons.keyboard_arrow_up_rounded
                      : Icons.keyboard_arrow_down_rounded,
                  color: AppColors.lightTextSecondary),
            ),
          ]),
        ),

        // ── Détail dépliable ──────────────────────────────────
        if (_expanded) ...[
          Divider(
              height: 1,
              color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            itemCount: widget.commandes.length,
            separatorBuilder: (_, __) => Divider(
                height: 1,
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
            itemBuilder: (_, i) {
              final c = widget.commandes[i];
              final dateMenu = c.menuDetail?.dateMenu ?? '';
              final d =
                  dateMenu.isNotEmpty ? DateTime.tryParse(dateMenu) : null;
              final montant = widget.tarifProvider.getMontant(dateMenu);

              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Row(children: [
                  Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Text(c.platDetail?.nom ?? '—',
                            style: Theme.of(context).textTheme.titleSmall),
                        const SizedBox(height: 2),
                        Row(children: [
                          Text(
                              d != null
                                  ? DateFormat('EEE dd/MM/yyyy', 'fr_FR')
                                      .format(d)
                                  : '—',
                              style: Theme.of(context).textTheme.bodySmall),
                          const SizedBox(width: 4),
                          Text('• ${c.menuDetail?.agenceNom ?? ''}',
                              style: Theme.of(context).textTheme.bodySmall),
                        ]),
                      ])),
                  const SizedBox(width: 8),
                  Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text(_fmt(montant),
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: montant > 0
                                ? AppColors.primary
                                : AppColors.lightTextSecondary)),
                    const SizedBox(height: 3),
                    StatutBadge(statut: c.statut),
                  ]),
                ]),
              );
            },
          ),
          // Total du mois en bas
          Container(
            margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.accent.withOpacity(0.08),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.accent.withOpacity(0.3)),
            ),
            child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('TOTAL À PAYER CE MOIS',
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AppColors.primary)),
                  Text(_fmt(totalMois),
                      style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: AppColors.accent)),
                ]),
          ),
        ],
      ]),
    );
  }

  Future<void> _exporterPDF(BuildContext context) async {
    final moisLabel = _moisLibelle[0].toUpperCase() + _moisLibelle.substring(1);
    final now = DateFormat('dd/MM/yyyy à HH:mm').format(DateTime.now());
    final auth = context.read<AuthProvider>();
    final user = auth.user;
    final totalMois = widget.tarifProvider.calculerTotal(widget.commandes);

    String fmtM(double m) =>
        m > 0 ? '${NumberFormat('#,##0', 'fr_FR').format(m)} FCFA' : 'N/D';

    final pdf = pw.Document();
    pdf.addPage(pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(32),
      build: (_) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          // En-tête
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text('UbiFood — Cantine',
                        style: pw.TextStyle(
                            fontSize: 20,
                            fontWeight: pw.FontWeight.bold,
                            color: const PdfColor.fromInt(0xFF092440))),
                    pw.SizedBox(height: 4),
                    pw.Text('Récapitulatif mensuel',
                        style: const pw.TextStyle(
                            fontSize: 13, color: PdfColors.grey700)),
                  ]),
              pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.end,
                  children: [
                    pw.Text(moisLabel,
                        style: pw.TextStyle(
                            fontSize: 16,
                            fontWeight: pw.FontWeight.bold,
                            color: const PdfColor.fromInt(0xFF5BD988))),
                    pw.SizedBox(height: 4),
                    pw.Text('Généré le $now',
                        style: const pw.TextStyle(
                            fontSize: 9, color: PdfColors.grey600)),
                  ]),
            ],
          ),
          pw.Divider(color: const PdfColor.fromInt(0xFF092440), thickness: 2),
          pw.SizedBox(height: 12),
          // Infos employé
          pw.Container(
            padding: const pw.EdgeInsets.all(12),
            decoration: pw.BoxDecoration(
                color: const PdfColor.fromInt(0xFFF4F7FA),
                borderRadius: pw.BorderRadius.circular(8)),
            child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text('Employé : ${user?.fullName ?? '—'}',
                      style: pw.TextStyle(
                          fontWeight: pw.FontWeight.bold, fontSize: 12)),
                  pw.SizedBox(height: 3),
                  pw.Text('Badge : ${user?.username ?? '—'}',
                      style: const pw.TextStyle(
                          fontSize: 11, color: PdfColors.grey700)),
                  pw.SizedBox(height: 3),
                  pw.Text(
                      'Catégorie : ${user?.derniereCategoriesalarieLibelle ?? '—'}',
                      style: const pw.TextStyle(
                          fontSize: 11, color: PdfColors.grey700)),
                ]),
          ),
          pw.SizedBox(height: 16),
          pw.Text('Détail des commandes',
              style: pw.TextStyle(
                  fontSize: 12,
                  fontWeight: pw.FontWeight.bold,
                  color: const PdfColor.fromInt(0xFF092440))),
          pw.SizedBox(height: 8),
          // Tableau
          pw.Table(
            border: pw.TableBorder.all(
                color: const PdfColor.fromInt(0xFFE2EAF4), width: 0.5),
            columnWidths: {
              0: const pw.FlexColumnWidth(3),
              1: const pw.FlexColumnWidth(2),
              2: const pw.FlexColumnWidth(2),
              3: const pw.FlexColumnWidth(1.5),
              4: const pw.FlexColumnWidth(2),
            },
            children: [
              pw.TableRow(
                decoration:
                    const pw.BoxDecoration(color: PdfColor.fromInt(0xFF092440)),
                children: ['Plat', 'Agence', 'Date', 'Statut', 'Montant']
                    .map((h) => pw.Padding(
                          padding: const pw.EdgeInsets.symmetric(
                              horizontal: 6, vertical: 5),
                          child: pw.Text(h,
                              style: pw.TextStyle(
                                  color: PdfColors.white,
                                  fontSize: 9,
                                  fontWeight: pw.FontWeight.bold)),
                        ))
                    .toList(),
              ),
              ...widget.commandes.asMap().entries.map((e) {
                final c = e.value;
                final dm = c.menuDetail?.dateMenu ?? '';
                final d = dm.isNotEmpty ? DateTime.tryParse(dm) : null;
                final montant = widget.tarifProvider.getMontant(dm);
                final bg = e.key.isEven
                    ? PdfColors.white
                    : const PdfColor.fromInt(0xFFF4F7FA);
                return pw.TableRow(
                  decoration: pw.BoxDecoration(color: bg),
                  children: [
                    c.platDetail?.nom ?? '—',
                    c.menuDetail?.agenceNom ?? '—',
                    d != null ? DateFormat('dd/MM/yyyy').format(d) : '—',
                    c.statut.label,
                    fmtM(montant),
                  ]
                      .map((cell) => pw.Padding(
                            padding: const pw.EdgeInsets.symmetric(
                                horizontal: 6, vertical: 4),
                            child: pw.Text(cell,
                                style: const pw.TextStyle(fontSize: 8)),
                          ))
                      .toList(),
                );
              }),
            ],
          ),
          pw.SizedBox(height: 16),
          // Total
          pw.Container(
            padding: const pw.EdgeInsets.all(14),
            decoration: pw.BoxDecoration(
                color: const PdfColor.fromInt(0xFFEAFBF1),
                borderRadius: pw.BorderRadius.circular(8),
                border: pw.Border.all(
                    color: const PdfColor.fromInt(0xFF5BD988), width: 0.8)),
            child: pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  pw.Text('TOTAL À PAYER CE MOIS',
                      style: pw.TextStyle(
                          fontSize: 12,
                          fontWeight: pw.FontWeight.bold,
                          color: const PdfColor.fromInt(0xFF092440))),
                  pw.Text(fmtM(totalMois),
                      style: pw.TextStyle(
                          fontSize: 15,
                          fontWeight: pw.FontWeight.bold,
                          color: const PdfColor.fromInt(0xFF5BD988))),
                ]),
          ),
          pw.Spacer(),
          pw.Divider(color: PdfColors.grey300),
          pw.Center(
              child: pw.Text(
                  'Document généré par UbiFood • ${DateTime.now().year}',
                  style: const pw.TextStyle(
                      fontSize: 8, color: PdfColors.grey500))),
        ],
      ),
    ));

    await Printing.layoutPdf(
      onLayout: (_) async => pdf.save(),
      name: 'facture_${widget.moisKey}.pdf',
    );
  }
}
