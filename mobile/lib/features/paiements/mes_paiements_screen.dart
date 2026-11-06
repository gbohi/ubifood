// lib/features/paiements/mes_paiements_screen.dart
//
// Mes paiements : solde du compte repas (rechargé à la caisse UbiPharm),
// paiement des repas du mois (débité du compte, payé à la caisse, retenu sur
// salaire, non couvert, à venir), reste à payer prévu à la clôture,
// mouvements du compte et reçus de caisse (PDF).

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import '../../core/services/compte_repas_service.dart';
import '../../core/widgets/common_widgets.dart';
import '../../shared/models/compte_repas_models.dart';
import '../../shared/providers/compte_repas_provider.dart';
import '../../shared/theme/app_theme.dart';
import '../dashboard/accueil_widgets.dart' show formatFcfa;
import '../facturation/facturation_screen.dart' show SelecteurMois;

String _cap(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

String _libelleMois(DateTime m) =>
    _cap(DateFormat('MMMM yyyy', 'fr_FR').format(m));

/// « +5 000 F » / « −1 000 F »
String formatSigne(double m) => m > 0
    ? '+${formatFcfa(m)}'
    : (m < 0 ? '−${formatFcfa(-m)}' : formatFcfa(0));

/// « Aujourd'hui », « Hier », « Jeudi 5 novembre » (année si différente)
String libelleJour(DateTime jour, [DateTime? maintenant]) {
  final n = maintenant ?? DateTime.now();
  final auj = DateTime(n.year, n.month, n.day);
  final j = DateTime(jour.year, jour.month, jour.day);
  if (j == auj) return "Aujourd'hui";
  if (j == auj.subtract(const Duration(days: 1))) return 'Hier';
  final f = j.year == auj.year ? 'EEEE d MMMM' : 'EEEE d MMMM yyyy';
  return _cap(DateFormat(f, 'fr_FR').format(j));
}

enum _Onglet { mouvements, recus }

class MesPaiementsScreen extends StatefulWidget {
  const MesPaiementsScreen({super.key});

  static Future<void> ouvrir(BuildContext context) => Navigator.of(context)
      .push(MaterialPageRoute(builder: (_) => const MesPaiementsScreen()));

  @override
  State<MesPaiementsScreen> createState() => _MesPaiementsScreenState();
}

class _MesPaiementsScreenState extends State<MesPaiementsScreen> {
  _Onglet _onglet = _Onglet.mouvements;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final p = context.read<CompteRepasProvider>();
      final now = DateTime.now();
      // Ouverture : mois en cours (le solde et les mouvements sont à jour)
      Future.wait([
        p.charger(mois: DateTime(now.year, now.month)),
        p.chargerMouvements(),
        p.chargerRecus(),
      ]);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Consumer<CompteRepasProvider>(builder: (_, p, __) {
        final now = DateTime.now();
        // Mois navigables : 12 mois passés, 3 à venir (comme la facturation)
        final premier = DateTime(now.year - 1, now.month);
        final dernier = DateTime(now.year, now.month + 3);
        final mois = p.mois;
        final enTete = EnTeteMarine(
          titre: 'Mes paiements',
          sousTitre: 'Compte repas, caisse et reçus',
          bas: SelecteurMois(
            libelle: _libelleMois(mois),
            onPrecedent: mois.isAfter(premier)
                ? () => p.charger(mois: DateTime(mois.year, mois.month - 1))
                : null,
            onSuivant: mois.isBefore(dernier)
                ? () => p.charger(mois: DateTime(mois.year, mois.month + 1))
                : null,
          ),
        );

        final c = p.compte;
        Widget corps;
        if (c == null && p.error == null) {
          corps = ListView(padding: const EdgeInsets.all(14), children: const [
            ShimmerCard(height: 170),
            ShimmerCard(height: 230),
          ]);
        } else if (c == null) {
          corps = EmptyState(
            icon: Icons.cloud_off_rounded,
            title: 'Chargement impossible',
            subtitle: p.error,
            action: ElevatedButton.icon(
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('Réessayer'),
              onPressed: p.chargerTout,
            ),
          );
        } else {
          final enRetard = c.annee != mois.year || c.mois != mois.month;
          corps = RefreshIndicator(
            onRefresh: p.chargerTout,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 40),
              children: [
                if (p.error != null) ...[
                  BandeauInfo(
                    icone: Icons.cloud_off_rounded,
                    ton: TonPastille.rouge,
                    texte: p.error!,
                    action: TextButton(
                        onPressed: p.loading ? null : () => p.charger(),
                        child: const Text('Réessayer')),
                  ),
                  const SizedBox(height: 12),
                ],
                CarteSolde(solde: c.solde),
                const SizedBox(height: 12),
                AnimatedOpacity(
                  opacity: p.loading && enRetard ? 0.45 : 1,
                  duration: const Duration(milliseconds: 150),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        CarteMoisPaiements(compte: c),
                        const SizedBox(height: 12),
                        LibelleSection('Repas ${_deMois(c)}'),
                        ListeRepasPaiement(repas: c.repas),
                      ]),
                ),
                const SizedBox(height: 16),
                Row(children: [
                  FiltrePastille(
                      label: 'Mouvements',
                      actif: _onglet == _Onglet.mouvements,
                      onTap: () =>
                          setState(() => _onglet = _Onglet.mouvements)),
                  const SizedBox(width: 6),
                  FiltrePastille(
                      label: 'Reçus',
                      compte: p.recusCharges ? p.recus.length : null,
                      actif: _onglet == _Onglet.recus,
                      onTap: () => setState(() => _onglet = _Onglet.recus)),
                ]),
                const SizedBox(height: 8),
                if (_onglet == _Onglet.mouvements)
                  _SectionMouvements(p: p)
                else
                  _SectionRecus(p: p),
              ],
            ),
          );
        }
        return Column(children: [enTete, Expanded(child: corps)]);
      }),
    );
  }

  String _deMois(CompteRepas c) {
    final nom = DateFormat('MMMM', 'fr_FR').format(DateTime(c.annee, c.mois));
    final de = RegExp(r'^[aeiouyéèh]', caseSensitive: false).hasMatch(nom)
        ? "d'"
        : 'de ';
    return '$de$nom';
  }
}

// ── Cartes ─────────────────────────────────────────────────────

class _Carte extends StatelessWidget {
  final Widget child;
  const _Carte({required this.child});

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

/// Solde du compte repas, recharge à la caisse, Mobile Money bientôt
class CarteSolde extends StatelessWidget {
  final double solde;
  const CarteSolde({super.key, required this.solde});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final vert = isDark ? AppColors.accent : const Color(0xFF1F9D55);
    return _Carte(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: isDark
                  ? AppColors.accent.withOpacity(0.14)
                  : AppColors.accentLight,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(Icons.account_balance_wallet_rounded,
                size: 18, color: vert),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text('Solde du compte repas',
                style: TextStyle(
                    fontSize: 12.5, fontWeight: FontWeight.w600, color: gris)),
          ),
        ]),
        const SizedBox(height: 8),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(formatFcfa(solde),
              style: TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  color: solde > 0 ? vert : gris)),
        ),
        Text('Reporté de mois en mois · payez vos repas sans attendre',
            style: TextStyle(fontSize: 11, color: gris)),
        const SizedBox(height: 12),
        const BandeauInfo(
          icone: Icons.storefront_rounded,
          ton: TonPastille.bleu,
          texte: 'Rechargez à la caisse UbiPharm (espèces)',
        ),
        const SizedBox(height: 8),
        Row(children: [
          Icon(Icons.phone_android_rounded, size: 15, color: gris),
          const SizedBox(width: 6),
          Expanded(
            child: Text('Paiement Mobile Money',
                style: TextStyle(fontSize: 12, color: gris)),
          ),
          const PastilleStatut(
              label: 'Bientôt disponible',
              icone: Icons.schedule_rounded,
              ton: TonPastille.gris),
        ]),
      ]),
    );
  }
}

/// Le mois : consommé, débité du compte, payé à la caisse, retenu, non
/// couvert, à venir, reste à payer prévu à la clôture
class CarteMoisPaiements extends StatelessWidget {
  final CompteRepas compte;
  const CarteMoisPaiements({super.key, required this.compte});

  @override
  Widget build(BuildContext context) {
    final c = compte;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final texte = Theme.of(context).textTheme.bodyLarge;

    Widget ligne(String libelle, TotalPaiement t,
        {StatutPaiementRepas? statut, bool fort = false}) {
      final (_, couleur) = statut == null
          ? (null, isDark ? AppColors.accent : AppColors.primaryLight)
          : couleursPastille(statut.ton, isDark);
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(children: [
          if (statut != null) ...[
            Icon(statut.icone, size: 15, color: couleur),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Text.rich(
              TextSpan(children: [
                TextSpan(
                    text: libelle,
                    style: texte?.copyWith(
                        fontSize: fort ? 13.5 : 12.5,
                        fontWeight: fort ? FontWeight.w700 : FontWeight.w500)),
                TextSpan(
                    text: '  ${t.nb} repas',
                    style: TextStyle(fontSize: 11, color: gris)),
              ]),
              maxLines: 2,
            ),
          ),
          const SizedBox(width: 8),
          Text(formatFcfa(t.montant),
              style: texte?.copyWith(
                  fontSize: fort ? 14 : 12.5, fontWeight: FontWeight.w700)),
        ]),
      );
    }

    final reste = resteAPayer(c, formatFcfa);
    final (fond, couleurReste) = couleursPastille(reste.ton, isDark);
    final filet = isDark ? AppColors.darkBorder : AppColors.lightBorder;

    return _Carte(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text(_libelleMois(DateTime(c.annee, c.mois)),
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700)),
          ),
          c.moisCloture
              ? const PastilleStatut(
                  label: 'Mois clôturé',
                  icone: Icons.lock_outline_rounded,
                  ton: TonPastille.gris)
              : const PastilleStatut(
                  label: 'En cours',
                  icone: Icons.schedule_rounded,
                  ton: TonPastille.or),
        ]),
        const SizedBox(height: 6),
        ligne('Consommé', c.consomme, fort: true),
        Divider(height: 12, color: filet),
        ligne('Débité du compte', c.debiteCompte,
            statut: StatutPaiementRepas.debiteCompte),
        ligne('Payé à la caisse', c.payeCaisse,
            statut: StatutPaiementRepas.payeCaisse),
        if (c.moisCloture || c.retenue.nb > 0)
          ligne('Retenu sur salaire', c.retenue,
              statut: StatutPaiementRepas.retenue),
        if (!c.moisCloture || c.nonCouvert.nb > 0)
          ligne('Non couvert', c.nonCouvert,
              statut: StatutPaiementRepas.nonCouvert),
        if (c.aVenir.nb > 0)
          ligne('À venir', c.aVenir, statut: StatutPaiementRepas.aVenir),
        const SizedBox(height: 10),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
              color: reste.ton == TonPastille.or && !isDark
                  ? AppColors.warningLight
                  : fond,
              borderRadius: BorderRadius.circular(12)),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(reste.texte,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: couleurReste)),
            const SizedBox(height: 3),
            Text(reste.detail,
                style: TextStyle(fontSize: 11.5, color: couleurReste)),
          ]),
        ),
      ]),
    );
  }
}

/// Repas du mois et leur paiement
class ListeRepasPaiement extends StatelessWidget {
  final List<RepasCompte> repas;
  const ListeRepasPaiement({super.key, required this.repas});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    if (repas.isEmpty) {
      return _Carte(
        child: Text('Aucun repas ce mois-ci',
            style: TextStyle(fontSize: 12.5, color: gris)),
      );
    }
    final tries = List.of(repas)
      ..sort((a, b) =>
          (b.dateMenu ?? DateTime(0)).compareTo(a.dateMenu ?? DateTime(0)));
    final nonCouverts =
        repas.any((r) => r.statut == StatutPaiementRepas.nonCouvert);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      CarteListe(lignes: [for (final r in tries) LigneRepasPaiement(repas: r)]),
      if (nonCouverts)
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 8, 4, 0),
          child: Text(
              'Non couvert : solde insuffisant au retrait. À payer à la '
              'caisse ; sinon débité de votre compte à la clôture si le solde '
              'suffit, ou retenu sur salaire.',
              style: TextStyle(fontSize: 11, color: gris)),
        ),
    ]);
  }
}

class LigneRepasPaiement extends StatelessWidget {
  final RepasCompte repas;
  const LigneRepasPaiement({super.key, required this.repas});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final r = repas;
    final sousTitre = [
      if (r.agenceMenu.isNotEmpty) r.agenceMenu,
      r.retire
          ? 'retiré'
          : (r.statut == StatutPaiementRepas.aVenir
              ? 'commandé'
              : 'non retiré'),
    ].join(' · ');
    return Tooltip(
      message: r.statutLibelle,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(children: [
          SizedBox(
            width: 40,
            child: Text(
                r.dateMenu == null
                    ? '—'
                    : DateFormat('dd/MM').format(r.dateMenu!),
                style: TextStyle(fontSize: 11.5, color: gris)),
          ),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(r.plat.isEmpty ? '—' : r.plat,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context)
                      .textTheme
                      .bodyLarge
                      ?.copyWith(fontSize: 12.5, fontWeight: FontWeight.w600)),
              Text(sousTitre,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 10.5, color: gris)),
            ]),
          ),
          const SizedBox(width: 6),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(
                r.montant == null ? 'Tarif non défini' : formatFcfa(r.montant!),
                style: r.montant == null
                    ? const TextStyle(fontSize: 10.5, color: AppColors.warning)
                    : Theme.of(context).textTheme.bodyLarge?.copyWith(
                        fontSize: 12.5, fontWeight: FontWeight.w700)),
            const SizedBox(height: 3),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 130),
              child: PastilleStatut(
                  label: r.statut.libelle,
                  icone: r.statut.icone,
                  ton: r.statut.ton),
            ),
          ]),
        ]),
      ),
    );
  }
}

// ── Mouvements ─────────────────────────────────────────────────

class _SectionMouvements extends StatelessWidget {
  final CompteRepasProvider p;
  const _SectionMouvements({required this.p});

  @override
  Widget build(BuildContext context) {
    if (!p.mouvementsCharges) {
      return p.mouvementsError != null
          ? _Erreur(
              message: p.mouvementsError!, onReessayer: p.chargerMouvements)
          : const ShimmerCard(height: 140);
    }
    if (p.mouvements.isEmpty) {
      return const _Vide(
          icone: Icons.swap_vert_rounded,
          texte: 'Aucun mouvement sur votre compte repas pour le moment.');
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      ListeMouvements(mouvements: p.mouvements),
      if (p.mouvementsError != null)
        _Erreur(
            message: p.mouvementsError!,
            onReessayer: () => p.chargerMouvements(suite: true)),
      if (p.mouvementsSuivants)
        _VoirPlus(
            chargement: p.mouvementsLoading,
            onPressed: () => p.chargerMouvements(suite: true)),
    ]);
  }
}

/// Mouvements groupés par jour
class ListeMouvements extends StatelessWidget {
  final List<MouvementCompte> mouvements;
  const ListeMouvements({super.key, required this.mouvements});

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final (jour, liste) in mouvementsParJour(mouvements)) ...[
        LibelleSection(jour.year == 0 ? 'Date inconnue' : libelleJour(jour)),
        CarteListe(lignes: [
          for (final m in liste) LigneMouvement(mouvement: m),
        ]),
        const SizedBox(height: 6),
      ],
    ]);
  }
}

class LigneMouvement extends StatelessWidget {
  final MouvementCompte mouvement;
  const LigneMouvement({super.key, required this.mouvement});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final m = mouvement;
    final ton = m.type == TypeMouvement.annulation
        ? TonPastille.rouge
        : (m.credit ? TonPastille.vert : TonPastille.bleu);
    final (fond, couleur) = couleursPastille(ton, isDark);
    final heure = m.date == null ? '' : DateFormat('HH:mm').format(m.date!);
    final detail = [
      if (heure.isNotEmpty) heure,
      if (m.libelle.isNotEmpty) m.libelle,
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
              color: fond, borderRadius: BorderRadius.circular(10)),
          child: Icon(m.type.icone, size: 16, color: couleur),
        ),
        const SizedBox(width: 10),
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(m.typeLibelle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context)
                    .textTheme
                    .bodyLarge
                    ?.copyWith(fontSize: 12.5, fontWeight: FontWeight.w700)),
            if (detail.isNotEmpty)
              Text(detail,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11, color: gris)),
          ]),
        ),
        const SizedBox(width: 8),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(formatSigne(m.montant),
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: m.credit
                      ? (isDark ? AppColors.accent : const Color(0xFF1F9D55))
                      : Theme.of(context).textTheme.bodyLarge?.color)),
          Text('Solde ${formatFcfa(m.soldeApres)}',
              style: TextStyle(fontSize: 10.5, color: gris)),
        ]),
      ]),
    );
  }
}

// ── Reçus ──────────────────────────────────────────────────────

class _SectionRecus extends StatelessWidget {
  final CompteRepasProvider p;
  const _SectionRecus({required this.p});

  @override
  Widget build(BuildContext context) {
    if (!p.recusCharges) {
      return p.recusError != null
          ? _Erreur(message: p.recusError!, onReessayer: p.chargerRecus)
          : const ShimmerCard(height: 140);
    }
    if (p.recus.isEmpty) {
      return const _Vide(
          icone: Icons.receipt_long_outlined,
          texte: 'Aucun reçu : vos recharges et paiements à la caisse '
              'apparaîtront ici.');
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      CarteListe(lignes: [
        for (final r in p.recus)
          LigneRecuCaisse(recu: r, onPdf: () => ouvrirPdfRecu(context, r)),
      ]),
      if (p.recusError != null)
        _Erreur(
            message: p.recusError!,
            onReessayer: () => p.chargerRecus(suite: true)),
      if (p.recusSuivants)
        _VoirPlus(
            chargement: p.recusLoading,
            onPressed: () => p.chargerRecus(suite: true)),
    ]);
  }
}

class LigneRecuCaisse extends StatelessWidget {
  final RecuCaisse recu;
  final VoidCallback onPdf;
  const LigneRecuCaisse({super.key, required this.recu, required this.onPdf});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final r = recu;
    final date =
        r.date == null ? '' : DateFormat('dd/MM/yyyy HH:mm').format(r.date!);
    final (fond, couleur) = couleursPastille(
        r.annule ? TonPastille.rouge : TonPastille.bleu, isDark);
    final details = <String>[
      if (r.type == 'regularisation' && r.lignes.isNotEmpty)
        '${r.lignes.length} repas',
      if (r.type == 'regularisation' && r.monnaieCreditee && r.monnaie > 0)
        'monnaie ${formatFcfa(r.monnaie)} créditée',
      r.modeLibelle,
      if (r.caissierNom.isNotEmpty) 'caisse : ${r.caissierNom}',
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
                color: fond, borderRadius: BorderRadius.circular(10)),
            child: Icon(Icons.receipt_long_rounded, size: 16, color: couleur),
          ),
          const SizedBox(width: 10),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(r.typeLibelle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context)
                      .textTheme
                      .bodyLarge
                      ?.copyWith(fontSize: 12.5, fontWeight: FontWeight.w700)),
              Text('${r.numero}${date.isEmpty ? '' : ' · $date'}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11, color: gris)),
              Text(details.join(' · '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 10.5, color: gris)),
            ]),
          ),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(formatFcfa(r.montant),
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    decoration: r.annule ? TextDecoration.lineThrough : null)),
            const SizedBox(height: 3),
            if (r.annule)
              const PastilleStatut(label: 'Annulé', ton: TonPastille.rouge),
          ]),
        ]),
        if (r.annule && r.motifAnnulation.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(left: 42, top: 4),
            child: Text('Annulé : ${r.motifAnnulation}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 10.5, color: couleur)),
          ),
        Padding(
          padding: const EdgeInsets.only(left: 30),
          child: TextButton.icon(
            onPressed: onPdf,
            icon: const Icon(Icons.picture_as_pdf_outlined, size: 17),
            label: const Text('Voir le reçu (PDF)'),
            style: TextButton.styleFrom(
                foregroundColor:
                    isDark ? AppColors.accent : AppColors.primaryLight,
                textStyle:
                    const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                visualDensity: VisualDensity.compact),
          ),
        ),
      ]),
    );
  }
}

/// Télécharge le PDF du reçu (format ticket) et l'ouvre dans l'aperçu
/// d'impression du système (enregistrer, partager, imprimer).
Future<void> ouvrirPdfRecu(BuildContext context, RecuCaisse recu) async {
  final messenger = ScaffoldMessenger.of(context);
  final p = context.read<CompteRepasProvider>();
  messenger.showSnackBar(SnackBar(
      duration: const Duration(seconds: 2),
      content: Text('Téléchargement du reçu ${recu.numero}…')));
  try {
    final octets = await p.pdfRecu(recu.id, papier: PapierRecu.ticket);
    messenger.hideCurrentSnackBar();
    final nom = 'recu-${recu.numero.replaceAll(RegExp(r'^[^0-9]*'), '')}.pdf';
    await Printing.layoutPdf(onLayout: (_) async => octets, name: nom);
  } on ErreurPdfRecu catch (e) {
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(SnackBar(content: Text(e.message)));
  } catch (_) {
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
        const SnackBar(content: Text("Impossible d'ouvrir le reçu.")));
  }
}

// ── Petits éléments ────────────────────────────────────────────

class _Vide extends StatelessWidget {
  final IconData icone;
  final String texte;
  const _Vide({required this.icone, required this.texte});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    return _Carte(
      child: Row(children: [
        Icon(icone, size: 20, color: gris),
        const SizedBox(width: 10),
        Expanded(
            child: Text(texte, style: TextStyle(fontSize: 12, color: gris))),
      ]),
    );
  }
}

class _Erreur extends StatelessWidget {
  final String message;
  final VoidCallback onReessayer;
  const _Erreur({required this.message, required this.onReessayer});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 6),
        child: BandeauInfo(
          icone: Icons.cloud_off_rounded,
          ton: TonPastille.rouge,
          texte: message,
          action: TextButton(
              onPressed: onReessayer, child: const Text('Réessayer')),
        ),
      );
}

class _VoirPlus extends StatelessWidget {
  final bool chargement;
  final VoidCallback onPressed;
  const _VoirPlus({required this.chargement, required this.onPressed});

  @override
  Widget build(BuildContext context) => Center(
        child: TextButton(
          onPressed: chargement ? null : onPressed,
          child: chargement
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Voir plus'),
        ),
      );
}

// ── Résumé dans « Ma facturation » ─────────────────────────────

/// Carte « Mon compte repas » en tête de la facturation : solde, reste à
/// payer prévu ; ouvre « Mes paiements ».
class CarteCompteRepasResume extends StatelessWidget {
  const CarteCompteRepasResume({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final vert = isDark ? AppColors.accent : const Color(0xFF1F9D55);
    final p = context.watch<CompteRepasProvider>();
    final now = DateTime.now();
    final c = p.compte;
    // Reste prévu : seulement pour le mois en cours
    final alerte = c != null &&
        c.annee == now.year &&
        c.mois == now.month &&
        c.restePrevu > 0;
    final String detail;
    if (c == null) {
      detail =
          p.error != null ? 'Solde indisponible pour le moment' : 'Chargement…';
    } else if (alerte) {
      detail = 'Reste prévu à la clôture : ${formatFcfa(c.restePrevu)}';
    } else {
      detail = 'Paiements, mouvements et reçus de caisse';
    }
    return Material(
      color: isDark ? AppColors.darkCard : AppColors.lightCard,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(
              color: isDark ? AppColors.darkBorder : AppColors.lightBorder)),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => MesPaiementsScreen.ouvrir(context),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
          child: Row(children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: isDark
                    ? AppColors.accent.withOpacity(0.14)
                    : AppColors.accentLight,
                borderRadius: BorderRadius.circular(11),
              ),
              child: Icon(Icons.account_balance_wallet_rounded,
                  size: 19, color: vert),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Mon compte repas · Mes paiements',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                            color: gris)),
                    Text(c == null ? '…' : formatFcfa(c.solde),
                        style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: c != null && c.solde > 0
                                ? vert
                                : Theme.of(context)
                                    .textTheme
                                    .bodyLarge
                                    ?.color)),
                    Text(detail,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 11,
                            color: alerte
                                ? (isDark
                                    ? const Color(0xFFFFC94D)
                                    : const Color(0xFFB97800))
                                : gris)),
                  ]),
            ),
            const SizedBox(width: 4),
            Icon(Icons.chevron_right_rounded,
                color: isDark ? AppColors.accent : AppColors.primaryLight),
          ]),
        ),
      ),
    );
  }
}
