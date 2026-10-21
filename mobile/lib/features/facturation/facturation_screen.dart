// lib/features/facturation/facturation_screen.dart
//
// Ma facturation : une carte par mois (sélecteur dans l'en-tête), total,
// répartition, relevé PDF, détail du mois et mois précédents.

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
import '../commandes/commandes_screen.dart'
    show DetailCommandeSheet, EtatCommande, etatCommande, pastilleCommande;
import '../dashboard/accueil_widgets.dart' show formatFcfa;

/// Période chargée par FacturationProvider.charger() (12 mois passés,
/// 3 mois à venir) : hors de cette période, les montants ne sont pas connus.
bool _dansPeriodeFacturation(FacturationProvider fact, Commande c) {
  final d = DateTime.tryParse(c.menuDetail?.dateMenu ?? '');
  if (d == null) return false;
  return !d.isBefore(fact.debutPeriode) && !d.isAfter(fact.finPeriode);
}

String _cap(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

String _libelleMois(DateTime m) =>
    _cap(DateFormat('MMMM yyyy', 'fr_FR').format(m));

class FacturationScreen extends StatefulWidget {
  const FacturationScreen({super.key});
  @override
  State<FacturationScreen> createState() => _FacturationScreenState();
}

class _FacturationScreenState extends State<FacturationScreen> {
  /// Mois affiché (1er du mois) ; null : mois en cours
  DateTime? _mois;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<CommandeProvider>().loadMesCommandes();
      // Montants calculés par le serveur (règle unique de facturation)
      context.read<FacturationProvider>().charger();
    });
  }

  Future<void> _recharger() => Future.wait([
        context.read<CommandeProvider>().loadMesCommandes(),
        context.read<FacturationProvider>().charger(),
      ]);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Consumer2<CommandeProvider, FacturationProvider>(
          builder: (_, cmdProv, fact, __) {
        final now = DateTime.now();
        final moisCourant = DateTime(now.year, now.month);
        final commandes = cmdProv.mesCommandes
            .where((c) => _dansPeriodeFacturation(fact, c))
            .toList();

        // Commandes par mois du menu
        final parMois = <DateTime, List<Commande>>{};
        for (final c in commandes) {
          final j = c.jourMenu;
          if (j == null) continue;
          parMois.putIfAbsent(DateTime(j.year, j.month), () => []).add(c);
        }
        // Mois navigables : du premier mois commandé (ou du mois en cours)
        // au dernier (commandes anticipées comprises)
        final cles = {...parMois.keys, moisCourant}.toList()..sort();
        final premier = cles.first, dernier = cles.last;
        final navigables = <DateTime>[
          for (var m = premier;
              !m.isAfter(dernier);
              m = DateTime(m.year, m.month + 1))
            m
        ];
        final mois = (_mois != null && navigables.contains(_mois))
            ? _mois!
            : moisCourant;
        final idx = navigables.indexOf(mois);

        final enTete = EnTeteMarine(
          titre: 'Ma facturation',
          sousTitre: 'Repas retirés et à retirer, facturés au mois',
          bas: _SelecteurMois(
            libelle: _libelleMois(mois),
            onPrecedent: idx > 0
                ? () => setState(() => _mois = navigables[idx - 1])
                : null,
            onSuivant: idx < navigables.length - 1
                ? () => setState(() => _mois = navigables[idx + 1])
                : null,
          ),
        );

        Widget corps;
        if (cmdProv.listLoading && cmdProv.mesCommandes.isEmpty) {
          corps = ListView(padding: const EdgeInsets.all(14), children: const [
            ShimmerCard(height: 230),
            ShimmerCard(height: 180),
          ]);
        } else if (cmdProv.listError != null && cmdProv.mesCommandes.isEmpty) {
          corps = EmptyState(
            icon: Icons.cloud_off_rounded,
            title: 'Chargement impossible',
            subtitle: cmdProv.listError,
            action: ElevatedButton.icon(
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('Réessayer'),
              onPressed: _recharger,
            ),
          );
        } else {
          final duMois = parMois[mois] ?? const <Commande>[];
          final precedents = parMois.keys
              .where((m) => m.isBefore(moisCourant) && m != mois)
              .toList()
            ..sort((a, b) => b.compareTo(a));
          corps = RefreshIndicator(
            onRefresh: _recharger,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 100),
              children: [
                if (fact.error != null) ...[
                  BandeauInfo(
                    icone: Icons.price_change_outlined,
                    ton: TonPastille.rouge,
                    texte: 'Facturation indisponible : ${fact.error}',
                    action: TextButton(
                        onPressed: fact.loading ? null : fact.charger,
                        child: const Text('Réessayer')),
                  ),
                  const SizedBox(height: 12),
                ],
                _CarteTotal(
                    mois: mois,
                    moisCourant: moisCourant,
                    commandes: duMois,
                    fact: fact),
                const SizedBox(height: 12),
                _CarteDetail(mois: mois, commandes: duMois, fact: fact),
                if (precedents.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _CartePrecedents(
                    mois: precedents.take(6).toList(),
                    parMois: parMois,
                    fact: fact,
                    onChoisir: (m) => setState(() => _mois = m),
                  ),
                ],
              ],
            ),
          );
        }
        return Column(children: [enTete, Expanded(child: corps)]);
      }),
    );
  }
}

class _SelecteurMois extends StatelessWidget {
  final String libelle;
  final VoidCallback? onPrecedent;
  final VoidCallback? onSuivant;
  const _SelecteurMois(
      {required this.libelle, this.onPrecedent, this.onSuivant});

  @override
  Widget build(BuildContext context) {
    Widget fleche(IconData icone, String tooltip, VoidCallback? onTap) =>
        IconButton(
          icon: Icon(icone,
              color: Colors.white.withOpacity(onTap == null ? 0.3 : 0.9)),
          tooltip: tooltip,
          visualDensity: VisualDensity.compact,
          onPressed: onTap,
        );
    return Container(
      decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12)),
      child: Row(children: [
        fleche(Icons.chevron_left_rounded, 'Mois précédent', onPrecedent),
        Expanded(
          child: Text(libelle,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w700)),
        ),
        fleche(Icons.chevron_right_rounded, 'Mois suivant', onSuivant),
      ]),
    );
  }
}

// ── Carte du mois : total, état, répartition, PDF ────────────────

class _CarteTotal extends StatelessWidget {
  final DateTime mois;
  final DateTime moisCourant;
  final List<Commande> commandes;
  final FacturationProvider fact;
  const _CarteTotal(
      {required this.mois,
      required this.moisCourant,
      required this.commandes,
      required this.fact});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final actives =
        commandes.where((c) => c.statut != StatutCommande.annulee).toList();
    final total = fact.calculerTotal(actives);
    final cloture = fact.estCloture(actives);
    List<Commande> dEtat(EtatCommande e) =>
        actives.where((c) => etatCommande(c) == e).toList();
    final retirees = dEtat(EtatCommande.retiree);
    final aRetirer = [
      ...dEtat(EtatCommande.aVenir),
      ...dEtat(EtatCommande.aRetirer)
    ];
    final nonRetirees = dEtat(EtatCommande.nonRetiree);
    final annulees = commandes.length - actives.length;
    double somme(List<Commande> l) => fact.calculerTotal(l);

    final finMois = DateTime(mois.year, mois.month + 1, 0);
    final (libelleEtat, iconeEtat, tonEtat) = !fact.loaded
        ? ('Calcul en cours', Icons.hourglass_empty_rounded, TonPastille.gris)
        : cloture
            ? (
                'Mois terminé',
                Icons.check_circle_outline_rounded,
                TonPastille.vert
              )
            : mois.isBefore(moisCourant)
                ? (
                    'Provisoire · en attente de clôture',
                    Icons.schedule_rounded,
                    TonPastille.or
                  )
                : (
                    'Provisoire · arrêté le ${DateFormat('d MMMM', 'fr_FR').format(finMois)}',
                    Icons.schedule_rounded,
                    TonPastille.or
                  );

    Widget tuile(int n, String libelle) => Expanded(
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkSurface : AppColors.lightBackground,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(children: [
              Text('$n',
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontSize: 17, fontWeight: FontWeight.w700)),
              Text(libelle, style: TextStyle(fontSize: 10.5, color: gris)),
            ]),
          ),
        );

    final nRepas = actives.length;
    const vert = AppColors.accentDark;
    const or = AppColors.warning;
    const rouge = Color(0xFFD0452C);
    Widget legende(Color c, String t) =>
        Row(mainAxisSize: MainAxisSize.min, children: [
          Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
          const SizedBox(width: 4),
          Text(t, style: TextStyle(fontSize: 10.5, color: gris)),
        ]);

    return _CarteFacture(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Total du mois', style: TextStyle(fontSize: 11.5, color: gris)),
        const SizedBox(height: 2),
        Text(
            fact.loaded
                ? '${NumberFormat('#,##0', 'fr_FR').format(total)} FCFA'
                : '…',
            style: TextStyle(
                fontSize: 30,
                fontWeight: FontWeight.w800,
                color: isDark ? AppColors.accent : const Color(0xFF1F9D55))),
        const SizedBox(height: 2),
        PastilleStatut(label: libelleEtat, icone: iconeEtat, ton: tonEtat),
        const SizedBox(height: 14),
        Row(children: [
          tuile(nRepas, 'repas'),
          const SizedBox(width: 8),
          tuile(retirees.length, retirees.length > 1 ? 'retirés' : 'retiré'),
          const SizedBox(width: 8),
          if (aRetirer.isNotEmpty)
            tuile(aRetirer.length, 'à retirer')
          else if (nonRetirees.isNotEmpty)
            tuile(nonRetirees.length,
                nonRetirees.length > 1 ? 'non retirés' : 'non retiré')
          else
            tuile(annulees, annulees > 1 ? 'annulés' : 'annulé'),
        ]),
        if (nRepas > 0) ...[
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: SizedBox(
              height: 8,
              child: Row(children: [
                if (retirees.isNotEmpty)
                  Expanded(
                      flex: retirees.length, child: Container(color: vert)),
                if (aRetirer.isNotEmpty)
                  Expanded(flex: aRetirer.length, child: Container(color: or)),
                if (nonRetirees.isNotEmpty)
                  Expanded(
                      flex: nonRetirees.length, child: Container(color: rouge)),
              ]),
            ),
          ),
          const SizedBox(height: 6),
          Wrap(spacing: 10, runSpacing: 4, children: [
            if (retirees.isNotEmpty)
              legende(vert,
                  'retirés${fact.loaded ? ' ${formatFcfa(somme(retirees))}' : ''}'),
            if (aRetirer.isNotEmpty)
              legende(or,
                  'à retirer${fact.loaded ? ' ${formatFcfa(somme(aRetirer))}' : ''}'),
            if (nonRetirees.isNotEmpty)
              legende(rouge,
                  'non retirés${fact.loaded ? ' ${formatFcfa(somme(nonRetirees))}' : ''}'),
            if (annulees > 0)
              legende(isDark ? AppColors.darkTextHint : AppColors.lightTextHint,
                  '$annulees ${annulees > 1 ? 'annulés' : 'annulé'}, non facturé${annulees > 1 ? 's' : ''}'),
          ]),
        ],
        const SizedBox(height: 14),
        _BoutonPdf(
          onPressed: actives.isEmpty
              ? null
              : () => _exporterPDF(
                  context, DateFormat('yyyy-MM').format(mois), actives, fact),
        ),
      ]),
    );
  }
}

/// Carte blanche (bordure fine) de la facturation
class _CarteFacture extends StatelessWidget {
  final Widget child;
  const _CarteFacture({required this.child});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: child,
    );
  }
}

/// « Télécharger le relevé PDF » : marine en clair, vert en sombre
class _BoutonPdf extends StatelessWidget {
  final VoidCallback? onPressed;
  const _BoutonPdf({this.onPressed});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    const label = 'Télécharger le relevé PDF';
    if (isDark) {
      return BoutonVert(
          label: label,
          icone: Icons.download_rounded,
          hauteur: 46,
          onPressed: onPressed);
    }
    return SizedBox(
      width: double.infinity,
      height: 46,
      child: ElevatedButton.icon(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          padding: EdgeInsets.zero,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
        ),
        icon: const Icon(Icons.download_rounded, size: 18),
        label: const Text(label),
        onPressed: onPressed,
      ),
    );
  }
}

// ── Détail du mois ─────────────────────────────────────────────

class _CarteDetail extends StatelessWidget {
  final DateTime mois;
  final List<Commande> commandes;
  final FacturationProvider fact;
  const _CarteDetail(
      {required this.mois, required this.commandes, required this.fact});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final hint = isDark ? AppColors.darkTextHint : AppColors.lightTextHint;
    final triees = List.of(commandes)
      ..sort((a, b) =>
          (b.jourMenu ?? DateTime(0)).compareTo(a.jourMenu ?? DateTime(0)));
    final nomMois = DateFormat('MMMM', 'fr_FR').format(mois);
    final de = RegExp(r'^[aeiouyéèh]', caseSensitive: false).hasMatch(nomMois)
        ? "d'"
        : 'de ';
    final n = triees.length;

    return _CarteFacture(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text('Détail $de$nomMois',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700)),
          ),
          Text('$n ${n > 1 ? 'lignes' : 'ligne'}',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isDark ? AppColors.accent : AppColors.primaryLight)),
        ]),
        const SizedBox(height: 4),
        if (triees.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: Text('Aucune commande ce mois-ci',
                style: TextStyle(fontSize: 12.5, color: gris)),
          ),
        for (var i = 0; i < triees.length; i++) ...[
          if (i > 0)
            Divider(
                height: 1,
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
          InkWell(
            onTap: () => DetailCommandeSheet.show(context, triees[i]),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 9),
              child: Row(children: [
                SizedBox(
                  width: 44,
                  child: Text(
                      triees[i].jourMenu == null
                          ? '—'
                          : DateFormat('dd/MM').format(triees[i].jourMenu!),
                      style: TextStyle(fontSize: 11.5, color: gris)),
                ),
                Expanded(
                  child: Text(triees[i].platDetail?.nom ?? '—',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context)
                          .textTheme
                          .bodyLarge
                          ?.copyWith(fontSize: 12.5)),
                ),
                const SizedBox(width: 6),
                pastilleCommande(triees[i]),
                const SizedBox(width: 8),
                SizedBox(
                  width: 74,
                  child: _montant(context, triees[i], gris, hint),
                ),
              ]),
            ),
          ),
        ],
      ]),
    );
  }

  Widget _montant(BuildContext context, Commande c, Color gris, Color hint) {
    if (c.statut == StatutCommande.annulee) {
      return Text('non facturé',
          textAlign: TextAlign.right,
          style: TextStyle(fontSize: 11, color: hint));
    }
    final m = fact.montant(c);
    if (m == null) {
      return Text(fact.loaded ? 'Tarif non défini' : '…',
          textAlign: TextAlign.right,
          style: TextStyle(
              fontSize: 10.5, color: fact.loaded ? AppColors.warning : gris));
    }
    return Text(formatFcfa(m),
        textAlign: TextAlign.right,
        style: Theme.of(context)
            .textTheme
            .bodyLarge
            ?.copyWith(fontSize: 12.5, fontWeight: FontWeight.w700));
  }
}

// ── Mois précédents ────────────────────────────────────────────

class _CartePrecedents extends StatelessWidget {
  final List<DateTime> mois;
  final Map<DateTime, List<Commande>> parMois;
  final FacturationProvider fact;
  final ValueChanged<DateTime> onChoisir;
  const _CartePrecedents(
      {required this.mois,
      required this.parMois,
      required this.fact,
      required this.onChoisir});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    return _CarteFacture(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Mois précédents',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        for (var i = 0; i < mois.length; i++) ...[
          if (i > 0)
            Divider(
                height: 1,
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
          Builder(builder: (context) {
            final actives = parMois[mois[i]]!
                .where((c) => c.statut != StatutCommande.annulee)
                .toList();
            final n = actives.length;
            return InkWell(
              onTap: () => onChoisir(mois[i]),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 9),
                child: Row(children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: isDark
                          ? AppColors.darkSurface
                          : AppColors.lightBackground,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(Icons.calendar_month_outlined,
                        size: 17,
                        color:
                            isDark ? AppColors.accent : AppColors.primaryLight),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(_libelleMois(mois[i]),
                              style: Theme.of(context)
                                  .textTheme
                                  .bodyLarge
                                  ?.copyWith(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700)),
                          Text('$n repas',
                              style: TextStyle(fontSize: 11.5, color: gris)),
                        ]),
                  ),
                  Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text(
                        fact.loaded
                            ? formatFcfa(fact.calculerTotal(actives))
                            : '…',
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                            fontSize: 13, fontWeight: FontWeight.w700)),
                    Text(fact.estCloture(actives) ? 'terminé' : 'provisoire',
                        style: TextStyle(fontSize: 10.5, color: gris)),
                  ]),
                ]),
              ),
            );
          }),
        ],
      ]),
    );
  }
}

/// Relevé PDF du mois (impression / partage), montants du serveur
Future<void> _exporterPDF(BuildContext context, String moisKey,
    List<Commande> commandes, FacturationProvider tarifProvider) async {
  final d = DateTime.tryParse('$moisKey-01');
  final moisLibelle =
      d == null ? moisKey : DateFormat('MMMM yyyy', 'fr_FR').format(d);
  final messenger = ScaffoldMessenger.of(context);
  // Sans les montants du serveur, le PDF n'afficherait que « N/D »
  if (!tarifProvider.loaded) {
    messenger.showSnackBar(const SnackBar(
        content: Text('Montants en cours de chargement, réessayez.')));
    return;
  }
  final cloture = tarifProvider.estCloture(commandes);
  final moisLabel = moisLibelle[0].toUpperCase() + moisLibelle.substring(1);
  final now = DateFormat('dd/MM/yyyy à HH:mm').format(DateTime.now());
  final auth = context.read<AuthProvider>();
  final user = auth.user;
  final totalMois = tarifProvider.calculerTotal(commandes);

  // Helvetica (police PDF par défaut) n'a ni « — », ni « • », ni les
  // espaces insécables qu'insère le format fr_FR des montants.
  String pdfSafe(String t) => t
      .replaceAll('\u2014', '-')
      .replaceAll('\u2022', '-')
      .replaceAll('\u202F', ' ')
      .replaceAll('\u00A0', ' ');

  String fmtM(double m) => pdfSafe(
      m > 0 ? '${NumberFormat('#,##0', 'fr_FR').format(m)} FCFA' : 'N/D');

  final pdf = pw.Document();
  // MultiPage : le tableau se poursuit sur plusieurs pages si besoin
  pdf.addPage(pw.MultiPage(
    pageFormat: PdfPageFormat.a4,
    margin: const pw.EdgeInsets.all(32),
    crossAxisAlignment: pw.CrossAxisAlignment.start,
    footer: (_) => pw.Column(children: [
      pw.Divider(color: PdfColors.grey300),
      pw.Center(
          child: pw.Text('Document généré par UbiFood - ${DateTime.now().year}',
              style:
                  const pw.TextStyle(fontSize: 8, color: PdfColors.grey500))),
    ]),
    build: (_) => [
      // En-tête
      pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Text('UbiFood - Cantine',
                style: pw.TextStyle(
                    fontSize: 20,
                    fontWeight: pw.FontWeight.bold,
                    color: const PdfColor.fromInt(0xFF092440))),
            pw.SizedBox(height: 4),
            pw.Text('Récapitulatif mensuel',
                style:
                    const pw.TextStyle(fontSize: 13, color: PdfColors.grey700)),
          ]),
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
            pw.Text(pdfSafe(moisLabel),
                style: pw.TextStyle(
                    fontSize: 16,
                    fontWeight: pw.FontWeight.bold,
                    color: const PdfColor.fromInt(0xFF5BD988))),
            pw.SizedBox(height: 4),
            pw.Text(
                cloture
                    ? 'Mois clôturé : montants définitifs'
                    : 'Mois non clôturé : montants provisoires',
                style:
                    const pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
            pw.SizedBox(height: 2),
            pw.Text('Généré le $now',
                style:
                    const pw.TextStyle(fontSize: 9, color: PdfColors.grey600)),
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
        child: pw
            .Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.Text(pdfSafe('Employé : ${user?.fullName ?? '-'}'),
              style:
                  pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 12)),
          pw.SizedBox(height: 3),
          pw.Text(pdfSafe('Badge : ${user?.username ?? '-'}'),
              style:
                  const pw.TextStyle(fontSize: 11, color: PdfColors.grey700)),
          pw.SizedBox(height: 3),
          pw.Text(
              pdfSafe(
                  'Catégorie : ${user?.derniereCategoriesalarieLibelle ?? '-'}'),
              style:
                  const pw.TextStyle(fontSize: 11, color: PdfColors.grey700)),
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
          ...commandes.asMap().entries.map((e) {
            final c = e.value;
            final dm = c.menuDetail?.dateMenu ?? '';
            final d = dm.isNotEmpty ? DateTime.tryParse(dm) : null;
            final montant = tarifProvider.montant(c) ?? 0;
            final bg = e.key.isEven
                ? PdfColors.white
                : const PdfColor.fromInt(0xFFF4F7FA);
            return pw.TableRow(
              decoration: pw.BoxDecoration(color: bg),
              children: [
                c.platDetail?.nom ?? '-',
                c.menuDetail?.agenceNom ?? '-',
                d != null ? DateFormat('dd/MM/yyyy').format(d) : '-',
                c.statut.label,
                fmtM(montant),
              ]
                  .map((cell) => pw.Padding(
                        padding: const pw.EdgeInsets.symmetric(
                            horizontal: 6, vertical: 4),
                        child: pw.Text(pdfSafe(cell),
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
    ],
  ));

  try {
    await Printing.layoutPdf(
      onLayout: (_) async => pdf.save(),
      name: 'facture_$moisKey.pdf',
    );
  } catch (_) {
    messenger.showSnackBar(const SnackBar(
        content: Text("Impossible de générer ou d'imprimer le PDF.")));
  }
}
