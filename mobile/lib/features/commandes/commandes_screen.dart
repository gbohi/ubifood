// lib/features/commandes/commandes_screen.dart
//
// Mes commandes : lignes compactes groupées par semaine, pastilles de
// filtre avec compteurs, fiche détaillée (chronologie, annulation, avis).

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../shared/models/models.dart';
import '../../core/widgets/common_widgets.dart';
import '../../core/widgets/tic_echeance.dart';
import '../avis/avis_widgets.dart';
import '../dashboard/accueil_widgets.dart' show jourCourt;

/// État affiché d'une commande (« non retirée » : jour passé sans retrait,
/// comme sur l'accueil)
enum EtatCommande { aVenir, aRetirer, nonRetiree, retiree, annulee }

EtatCommande etatCommande(Commande c, [DateTime? maintenant]) {
  switch (c.statut) {
    case StatutCommande.annulee:
      return EtatCommande.annulee;
    case StatutCommande.retiree:
      return EtatCommande.retiree;
    case StatutCommande.enAttente:
      if (c.estNonRetiree(maintenant)) return EtatCommande.nonRetiree;
      final j = c.jourMenu;
      final n = (maintenant ?? DateTime.now()).toUtc();
      if (j != null && j == DateTime(n.year, n.month, n.day)) {
        return EtatCommande.aRetirer;
      }
      return EtatCommande.aVenir;
  }
}

/// Pastille de statut d'une commande
PastilleStatut pastilleCommande(Commande c) {
  switch (etatCommande(c)) {
    case EtatCommande.aVenir:
      return const PastilleStatut(
          label: 'À venir', icone: Icons.schedule_rounded, ton: TonPastille.or);
    case EtatCommande.aRetirer:
      return const PastilleStatut(
          label: 'À retirer',
          icone: Icons.qr_code_rounded,
          ton: TonPastille.or);
    case EtatCommande.nonRetiree:
      return const PastilleStatut(
          label: 'Non retiré',
          icone: Icons.error_outline_rounded,
          ton: TonPastille.rouge);
    case EtatCommande.retiree:
      return const PastilleStatut(
          label: 'Retirée', icone: Icons.check_rounded, ton: TonPastille.vert);
    case EtatCommande.annulee:
      return const PastilleStatut(
          label: 'Annulée', icone: Icons.close_rounded, ton: TonPastille.gris);
  }
}

/// Lundi de la semaine de [d]
DateTime lundiDe(DateTime d) =>
    DateTime(d.year, d.month, d.day).subtract(Duration(days: d.weekday - 1));

/// « Cette semaine », « Semaine prochaine », « Semaine dernière »,
/// « Semaine du 12 octobre »
String libelleSemaine(DateTime lundi, DateTime maintenant) {
  final ecart = lundi.difference(lundiDe(maintenant)).inDays ~/ 7;
  if (ecart == 0) return 'Cette semaine';
  if (ecart == 1) return 'Semaine prochaine';
  if (ecart == -1) return 'Semaine dernière';
  return 'Semaine du ${DateFormat('d MMMM', 'fr_FR').format(lundi)}';
}

/// Temps restant court : « 2 j », « 5 h », « 12 min »
String _delaiCourt(Duration d) {
  if (d.inDays >= 1) return '${d.inDays} j';
  if (d.inHours >= 1) return '${d.inHours} h';
  return '${d.inMinutes < 1 ? 1 : d.inMinutes} min';
}

bool _annulable(Commande c) =>
    c.peutAnnuler &&
    !c.estNonRetiree() &&
    c.menuDetail != null &&
    !c.menuDetail!.annulationFermee;

enum _Filtre { toutes, aRetirer, nonRetirees, retirees, annulees }

class CommandesScreen extends StatefulWidget {
  const CommandesScreen({super.key});
  @override
  State<CommandesScreen> createState() => _CommandesScreenState();
}

class _CommandesScreenState extends State<CommandesScreen> {
  _Filtre _filtre = _Filtre.toutes;

  /// Mois affiché (1er du mois) ; null : toutes les périodes
  DateTime? _mois;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<CommandeProvider>().loadMesCommandes();
      // Montants de la fiche détaillée (gestionnaire : écran poussé)
      final fact = context.read<FacturationProvider>();
      if (!fact.loaded && !fact.loading) fact.charger();
    });
  }

  Future<void> _recharger() => Future.wait([
        context.read<CommandeProvider>().loadMesCommandes(),
        context.read<FacturationProvider>().charger(),
      ]);

  bool _dansFiltre(Commande c, _Filtre f) {
    final e = etatCommande(c);
    switch (f) {
      case _Filtre.toutes:
        return true;
      case _Filtre.aRetirer:
        return e == EtatCommande.aVenir || e == EtatCommande.aRetirer;
      case _Filtre.nonRetirees:
        return e == EtatCommande.nonRetiree;
      case _Filtre.retirees:
        return e == EtatCommande.retiree;
      case _Filtre.annulees:
        return e == EtatCommande.annulee;
    }
  }

  void _choisirMois(List<DateTime> mois) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetCtx) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Période',
                style: Theme.of(sheetCtx)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            Wrap(spacing: 6, runSpacing: 6, children: [
              FiltrePastille(
                label: 'Toutes les périodes',
                actif: _mois == null,
                onTap: () {
                  setState(() => _mois = null);
                  Navigator.pop(sheetCtx);
                },
              ),
              for (final m in mois)
                FiltrePastille(
                  label: _libelleMois(m),
                  actif: _mois == m,
                  onTap: () {
                    setState(() => _mois = m);
                    Navigator.pop(sheetCtx);
                  },
                ),
            ]),
          ]),
        ),
      ),
    );
  }

  static String _libelleMois(DateTime m) {
    final s = DateFormat('MMMM yyyy', 'fr_FR').format(m);
    return s[0].toUpperCase() + s.substring(1);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Consumer<CommandeProvider>(builder: (_, cmdProv, __) {
        final toutes = cmdProv.mesCommandes;
        final mois = toutes
            .map((c) => c.jourMenu)
            .whereType<DateTime>()
            .map((d) => DateTime(d.year, d.month))
            .toSet()
            .toList()
          ..sort((a, b) => b.compareTo(a));
        final duMois = _mois == null
            ? toutes
            : toutes.where((c) {
                final j = c.jourMenu;
                return j != null &&
                    j.year == _mois!.year &&
                    j.month == _mois!.month;
              }).toList();
        int compte(_Filtre f) => duMois.where((c) => _dansFiltre(c, f)).length;
        final liste = duMois.where((c) => _dansFiltre(c, _filtre)).toList();
        final n = duMois.length;

        final enTete = EnTeteMarine(
          titre: 'Mes commandes',
          sousTitre:
              '${_mois == null ? 'Toutes les périodes' : _libelleMois(_mois!)}'
              ' · $n ${n > 1 ? 'commandes' : 'commande'}',
          actions: [
            EnTeteBouton(
              icone: Icons.calendar_month_outlined,
              tooltip: 'Choisir la période',
              onPressed: mois.isEmpty ? null : () => _choisirMois(mois),
            ),
          ],
        );

        Widget corps;
        if (cmdProv.listLoading && toutes.isEmpty) {
          // Squelettes uniquement au premier chargement (liste vide)
          corps = ListView(
              padding: const EdgeInsets.all(14),
              children: List.generate(6, (_) => const ShimmerCard(height: 64)));
        } else if (cmdProv.listError != null && toutes.isEmpty) {
          corps = _Defilable(
            onRefresh: _recharger,
            child: EmptyState(
              icon: Icons.cloud_off_rounded,
              title: 'Chargement impossible',
              subtitle: cmdProv.listError,
              action: ElevatedButton.icon(
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: const Text('Réessayer'),
                onPressed: () => cmdProv.loadMesCommandes(),
              ),
            ),
          );
        } else {
          final nonRetirees = compte(_Filtre.nonRetirees);
          corps = Column(children: [
            RangeeFiltres(filtres: [
              for (final (f, label) in [
                (_Filtre.toutes, 'Toutes'),
                (_Filtre.aRetirer, 'À retirer'),
                (_Filtre.nonRetirees, 'Non retirées'),
                (_Filtre.retirees, 'Retirées'),
                (_Filtre.annulees, 'Annulées'),
              ])
                // « Non retirées » seulement s'il y en a (ou si filtré)
                if (f != _Filtre.nonRetirees || nonRetirees > 0 || _filtre == f)
                  FiltrePastille(
                    label: label,
                    compte: compte(f),
                    actif: _filtre == f,
                    onTap: () => setState(() => _filtre = f),
                  ),
            ]),
            // Actualisation en échec : la liste affichée peut être périmée
            if (cmdProv.listError != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
                child: BandeauInfo(
                  icone: Icons.cloud_off_rounded,
                  ton: TonPastille.rouge,
                  texte: 'Actualisation impossible : ${cmdProv.listError}',
                  action: TextButton(
                      onPressed: cmdProv.listLoading ? null : _recharger,
                      child: const Text('Réessayer')),
                ),
              ),
            Expanded(
              child: liste.isEmpty
                  ? _Defilable(
                      onRefresh: _recharger,
                      child: const EmptyState(
                        icon: Icons.receipt_long_outlined,
                        title: 'Aucune commande',
                        subtitle: 'Aucune commande dans cette catégorie',
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _recharger,
                      child: _ListeSemaines(commandes: liste),
                    ),
            ),
          ]);
        }
        return Column(children: [enTete, Expanded(child: corps)]);
      }),
    );
  }
}

/// État vide rafraîchissable par glissement
class _Defilable extends StatelessWidget {
  final Future<void> Function() onRefresh;
  final Widget child;
  const _Defilable({required this.onRefresh, required this.child});

  @override
  Widget build(BuildContext context) => RefreshIndicator(
        onRefresh: onRefresh,
        child: LayoutBuilder(
          builder: (_, constraints) => SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: child,
            ),
          ),
        ),
      );
}

// ══════════════════════════════════════════════════════════════
// LISTE GROUPÉE PAR SEMAINE
// ══════════════════════════════════════════════════════════════

class _ListeSemaines extends StatelessWidget {
  final List<Commande> commandes;
  const _ListeSemaines({required this.commandes});

  @override
  Widget build(BuildContext context) {
    final maintenant = DateTime.now();
    // Plus récentes (et à venir) en premier
    final triees = List.of(commandes)
      ..sort((a, b) {
        final da = a.jourMenu, db = b.jourMenu;
        if (da == null || db == null) return da == null ? 1 : -1;
        return db.compareTo(da);
      });
    final groupes = <DateTime?, List<Commande>>{};
    for (final c in triees) {
      final j = c.jourMenu;
      groupes.putIfAbsent(j == null ? null : lundiDe(j), () => []).add(c);
    }
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 100),
      children: [
        for (final g in groupes.entries) ...[
          LibelleSection(g.key == null
              ? 'Date inconnue'
              : libelleSemaine(g.key!, maintenant)),
          CarteListe(lignes: [
            for (final c in g.value) LigneCommande(commande: c),
          ]),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

/// Ligne compacte : date, vignette, plat, statut ; appui → fiche détaillée
class LigneCommande extends StatelessWidget {
  final Commande commande;
  const LigneCommande({super.key, required this.commande});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final c = commande;
    final j = c.jourMenu;
    final annulee = c.statut == StatutCommande.annulee;
    final sousTitre = annulee
        ? (c.libelleAnnulationGestionnaire ?? 'Annulée par vous')
        : [c.menuDetail?.agenceNom, c.menuDetail?.typeEquipeLibelle]
            .where((e) => e != null && e.isNotEmpty)
            .join(' · ');

    return InkWell(
      onTap: () => DetailCommandeSheet.show(context, c),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(children: [
          SizedBox(
            width: 38,
            child: Column(children: [
              Text(j == null ? '—' : jourCourt(j).toUpperCase(),
                  style: TextStyle(
                      fontSize: 10, fontWeight: FontWeight.w600, color: gris)),
              Text(j == null ? '' : '${j.day}',
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontSize: 17, fontWeight: FontWeight.w700)),
            ]),
          ),
          const SizedBox(width: 8),
          VignettePlat(url: c.platDetail?.imageUrl, taille: 42),
          const SizedBox(width: 11),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(c.platDetail?.nom ?? 'Plat',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                      color: annulee ? gris : null,
                      decoration: annulee ? TextDecoration.lineThrough : null,
                      decorationColor: gris)),
              if (sousTitre.isNotEmpty)
                Text(sousTitre,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 11, color: gris)),
            ]),
          ),
          const SizedBox(width: 8),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 108),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              pastilleCommande(c),
              _Secondaire(commande: c),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Sous la pastille : « Annuler · 2 j », « Annulation fermée », « Noter »
class _Secondaire extends StatelessWidget {
  final Commande commande;
  const _Secondaire({required this.commande});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final c = commande;
    final etat = etatCommande(c);
    Widget lien(String texte, Color couleur, VoidCallback onTap,
            {IconData? icone}) =>
        InkWell(
          borderRadius: BorderRadius.circular(6),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(4, 5, 0, 1),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (icone != null) ...[
                Icon(icone, size: 13, color: couleur),
                const SizedBox(width: 2),
              ],
              Flexible(
                child: Text(texte,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: couleur)),
              ),
            ]),
          ),
        );

    if (etat == EtatCommande.retiree) {
      if (c.avis != null) {
        return Padding(
          padding: const EdgeInsets.only(top: 5),
          child: EtoilesNote(note: c.avis!.note, size: 12),
        );
      }
      return lien('Noter', isDark ? AppColors.accent : AppColors.primaryLight,
          () => showAvisSheet(context, c),
          icone: Icons.star_outline_rounded);
    }
    if (etat != EtatCommande.aVenir && etat != EtatCommande.aRetirer) {
      return const SizedBox.shrink();
    }
    // Mis à jour en direct : le lien se ferme à l'heure limite
    return TicEcheance(
      echeances: [c.menuDetail?.dateLimiteAnnulation],
      builder: (context) {
        final limite = c.menuDetail?.dateLimiteAnnulation;
        if (!_annulable(c)) {
          return Padding(
            padding: const EdgeInsets.only(top: 5),
            child: Text('Annulation fermée',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 10.5,
                    color: isDark
                        ? AppColors.darkTextSecondary
                        : AppColors.lightTextSecondary)),
          );
        }
        final reste = limite?.difference(DateTime.now());
        return lien(
            reste == null ? 'Annuler' : 'Annuler · ${_delaiCourt(reste)}',
            isDark ? const Color(0xFFFF8A73) : const Color(0xFFD0452C),
            () => confirmerAnnulation(context, c));
      },
    );
  }
}

// ══════════════════════════════════════════════════════════════
// ANNULATION (confirmation)
// ══════════════════════════════════════════════════════════════

void confirmerAnnulation(BuildContext context, Commande commande) {
  final cmdProv = context.read<CommandeProvider>();
  if (cmdProv.isLoading) return;
  showDialog(
      context: context,
      builder: (dialogCtx) => AlertDialog(
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: const Row(children: [
              Icon(Icons.warning_amber_rounded, color: AppColors.warning),
              SizedBox(width: 8),
              Text('Annuler ?'),
            ]),
            content: Column(mainAxisSize: MainAxisSize.min, children: [
              Text('Voulez-vous annuler votre commande'
                  '${commande.platDetail != null ? ' « ${commande.platDetail!.nom} »' : ''} ?'),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.warning.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(children: [
                  const Icon(Icons.info_outline_rounded,
                      color: AppColors.warning, size: 16),
                  const SizedBox(width: 6),
                  Expanded(
                      child: Text(
                          commande.menuDetail?.dateLimiteAnnulation != null
                              ? 'Annulation possible jusqu\'au ${libelleDateLimite(commande.menuDetail!.dateLimiteAnnulation!)}.'
                              : 'Une fois la date limite passée, l\'annulation n\'est plus possible.',
                          style: const TextStyle(
                              fontSize: 12, color: Color(0xFFB97800)))),
                ]),
              ),
            ]),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogCtx),
                child: const Text('Non, garder'),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.error,
                  foregroundColor: Colors.white,
                ),
                onPressed: () async {
                  // Capturés avant l'await : la ligne peut disparaître
                  // (changement de filtre/statut) pendant l'annulation.
                  final messenger = ScaffoldMessenger.of(context);
                  final facturation = context.read<FacturationProvider>();
                  Navigator.pop(dialogCtx);
                  if (cmdProv.isLoading) return;
                  final ok = await cmdProv.annuler(commande.id);
                  if (ok) {
                    facturation.charger();
                    messenger.showSnackBar(SnackBar(
                      content: const Row(children: [
                        Icon(Icons.check_rounded, color: Colors.white),
                        SizedBox(width: 8),
                        Text('Commande annulée'),
                      ]),
                      backgroundColor: AppColors.warning,
                      behavior: SnackBarBehavior.floating,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                      margin: const EdgeInsets.all(12),
                    ));
                  } else {
                    // Commande retirée / annulée entre-temps : on resynchronise
                    cmdProv.loadMesCommandes();
                    messenger.showSnackBar(SnackBar(
                      content: Text(
                          cmdProv.error ?? 'Impossible d\'annuler la commande'),
                      backgroundColor: AppColors.error,
                      behavior: SnackBarBehavior.floating,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                      margin: const EdgeInsets.all(12),
                    ));
                  }
                },
                child: const Text('Oui, annuler'),
              ),
            ],
          ));
}

// ══════════════════════════════════════════════════════════════
// FICHE DÉTAILLÉE (chronologie, annulation, avis)
// ══════════════════════════════════════════════════════════════

class DetailCommandeSheet extends StatelessWidget {
  final int commandeId;
  final Commande initiale;
  const DetailCommandeSheet(
      {super.key, required this.commandeId, required this.initiale});

  static Future<void> show(BuildContext context, Commande c) =>
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        backgroundColor: Colors.transparent,
        builder: (_) => DetailCommandeSheet(commandeId: c.id, initiale: c),
      );

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    // Toujours la version à jour (annulation, avis enregistrés)
    final c = context
            .watch<CommandeProvider>()
            .mesCommandes
            .where((e) => e.id == commandeId)
            .firstOrNull ??
        initiale;
    final fact = context.watch<FacturationProvider>();
    final menu = c.menuDetail;
    final j = c.jourMenu;
    String cap(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
    final ligneMenu = [
      if (j != null) cap(DateFormat('EEEE d MMMM', 'fr_FR').format(j)),
      if ((menu?.agenceNom ?? '').isNotEmpty) menu!.agenceNom,
      if ((menu?.typeEquipeLibelle ?? '').isNotEmpty) menu!.typeEquipeLibelle,
    ].join(' · ');
    final etat = etatCommande(c);
    final commandeLe = DateTime.tryParse(c.dateCommande)?.toLocal();
    final annuleeLe = DateTime.tryParse(c.dateAnnulation ?? '')?.toLocal();
    String horodatage(DateTime d) =>
        DateFormat("EEEE dd/MM 'à' HH:mm", 'fr_FR').format(d);
    final montant = fact.montant(c);
    final moisFacture =
        j == null ? null : DateFormat('MMMM yyyy', 'fr_FR').format(j);

    final etapes = <_Etape>[
      _Etape(
          titre: 'Commandée',
          detail: commandeLe == null ? null : horodatage(commandeLe),
          fait: true),
      if (menu?.dateLimiteAnnulation != null &&
          c.statut != StatutCommande.annulee)
        _Etape(
            titre: 'Annulation possible jusqu\'au',
            detail: libelleDateLimite(menu!.dateLimiteAnnulation!),
            fait: menu.annulationFermee),
      if (etat == EtatCommande.annulee)
        _Etape(
            titre: c.libelleAnnulationGestionnaire ?? 'Annulée par vous',
            detail: annuleeLe == null ? null : horodatage(annuleeLe),
            fait: true,
            erreur: true)
      else if (etat == EtatCommande.retiree)
        _Etape(
            titre: 'Retirée au comptoir',
            detail: [
              if (j != null) DateFormat('EEEE dd/MM', 'fr_FR').format(j),
              if ((menu?.agenceNom ?? '').isNotEmpty) menu!.agenceNom,
            ].join(' · '),
            fait: true)
      else if (etat == EtatCommande.nonRetiree)
        const _Etape(
            titre: 'Non retirée',
            detail: 'Repas non retiré au comptoir',
            fait: true,
            erreur: true)
      else
        _Etape(
            titre: 'À retirer au comptoir',
            detail: [
              if (j != null) DateFormat('EEEE dd/MM', 'fr_FR').format(j),
              if ((menu?.agenceNom ?? '').isNotEmpty) menu!.agenceNom,
            ].join(' · '),
            fait: false),
      if (etat == EtatCommande.annulee)
        const _Etape(titre: 'Non facturée', fait: false)
      else
        _Etape(
            titre:
                moisFacture == null ? 'Facturée' : 'Facturée sur $moisFacture',
            detail: montant == null
                ? (fact.loaded ? 'Tarif non défini' : null)
                : '${NumberFormat('#,##0', 'fr_FR').format(montant)} FCFA'
                    '${fact.estCloture([c]) ? '' : ' · provisoire'}',
            fait: fact.estCloture([c])),
    ];

    // Hauteur du contenu (au plus 90 % de l'écran)
    return ConstrainedBox(
      constraints:
          BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.9),
      child: Material(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
        clipBehavior: Clip.antiAlias,
        child: Builder(
          builder: (context) => SafeArea(
            top: false,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 22),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: isDark
                            ? AppColors.darkBorder
                            : AppColors.lightBorder,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(children: [
                    VignettePlat(
                        url: c.platDetail?.imageUrl, taille: 58, rayon: 12),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(c.platDetail?.nom ?? 'Plat',
                                style: Theme.of(context)
                                    .textTheme
                                    .titleLarge
                                    ?.copyWith(
                                        fontSize: 17,
                                        fontWeight: FontWeight.w700)),
                            if (ligneMenu.isNotEmpty)
                              Text(ligneMenu,
                                  style:
                                      TextStyle(fontSize: 11.5, color: gris)),
                          ]),
                    ),
                    const SizedBox(width: 8),
                    pastilleCommande(c),
                  ]),
                  const SizedBox(height: 16),
                  _Chronologie(etapes: etapes),

                  // ── Avis (repas retiré) ───────────────────
                  if (c.peutNoter) ...[
                    const SizedBox(height: 14),
                    _BlocAvis(commande: c),
                  ],

                  // ── Annulation ───────────────────────────
                  if (etat == EtatCommande.aVenir ||
                      etat == EtatCommande.aRetirer)
                    TicEcheance(
                      echeances: [menu?.dateLimiteAnnulation],
                      builder: (context) => _annulable(c)
                          ? Padding(
                              padding: const EdgeInsets.only(top: 16),
                              child: Consumer<CommandeProvider>(
                                builder: (_, cmdProv, __) => AppButton(
                                  label: 'Annuler la commande',
                                  outlined: true,
                                  color: AppColors.error,
                                  icon: Icons.cancel_outlined,
                                  loading: cmdProv.commandeEnCours == c.id,
                                  onPressed: cmdProv.isLoading
                                      ? null
                                      : () => confirmerAnnulation(context, c),
                                ),
                              ),
                            )
                          : Padding(
                              padding: const EdgeInsets.only(top: 14),
                              child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.lock_outline_rounded,
                                        size: 14, color: gris),
                                    const SizedBox(width: 6),
                                    Text('Annulation fermée',
                                        style: TextStyle(
                                            fontSize: 12, color: gris)),
                                  ]),
                            ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Etape {
  final String titre;
  final String? detail;
  final bool fait;
  final bool erreur;
  const _Etape(
      {required this.titre,
      this.detail,
      required this.fait,
      this.erreur = false});
}

class _Chronologie extends StatelessWidget {
  final List<_Etape> etapes;
  const _Chronologie({required this.etapes});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final filet = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final hint = isDark ? AppColors.darkTextHint : AppColors.lightTextHint;
    return Column(children: [
      for (var i = 0; i < etapes.length; i++)
        IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            SizedBox(
              width: 22,
              child: Column(children: [
                const SizedBox(height: 2),
                Container(
                  width: 14,
                  height: 14,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: etapes[i].fait
                        ? (etapes[i].erreur
                            ? AppColors.error
                            : AppColors.accentDark)
                        : Colors.transparent,
                    border: Border.all(
                        color: etapes[i].fait
                            ? (etapes[i].erreur
                                ? AppColors.error
                                : AppColors.accentDark)
                            : hint,
                        width: 2),
                  ),
                ),
                if (i < etapes.length - 1)
                  Expanded(child: Container(width: 2, color: filet)),
              ]),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Padding(
                padding:
                    EdgeInsets.only(bottom: i < etapes.length - 1 ? 14 : 0),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(etapes[i].titre,
                          style: Theme.of(context)
                              .textTheme
                              .bodyLarge
                              ?.copyWith(fontSize: 13)),
                      if (etapes[i].detail != null &&
                          etapes[i].detail!.isNotEmpty)
                        Text(etapes[i].detail!,
                            style: TextStyle(fontSize: 11.5, color: gris)),
                    ]),
              ),
            ),
          ]),
        ),
    ]);
  }
}

/// « Comment était votre repas ? » : étoiles touchables (feuille d'avis)
class _BlocAvis extends StatelessWidget {
  final Commande commande;
  const _BlocAvis({required this.commande});

  static const _libelles = [
    '',
    'Décevant',
    'Moyen',
    'Correct',
    'Bon',
    'Excellent'
  ];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final avis = commande.avis;
    final note = avis?.note ?? 0;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isDark ? AppColors.darkCard : AppColors.lightBackground,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(children: [
          Text(avis == null ? 'Comment était votre repas ?' : 'Votre avis',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (i) {
              final plein = i < note;
              return IconButton(
                tooltip: '${i + 1} étoile${i == 0 ? '' : 's'}',
                iconSize: 32,
                padding: const EdgeInsets.symmetric(horizontal: 2),
                constraints: const BoxConstraints(),
                onPressed: () => showAvisSheet(context, commande, note: i + 1),
                icon: Icon(
                    plein ? Icons.star_rounded : Icons.star_outline_rounded,
                    color: plein
                        ? kCouleurEtoile
                        : (isDark
                            ? AppColors.darkTextHint
                            : AppColors.lightTextHint)),
              );
            }),
          ),
          Text(
              avis == null
                  ? 'Touchez une étoile pour noter'
                  : avis.commentaire.isNotEmpty
                      ? '${_libelles[note.clamp(0, 5)]} · « ${avis.commentaire} »'
                      : '${_libelles[note.clamp(0, 5)]} · ajoutez un commentaire (facultatif)',
              textAlign: TextAlign.center,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 11.5, color: gris)),
        ]),
      ),
      const SizedBox(height: 12),
      BoutonVert(
        label: avis == null ? 'Donner mon avis' : 'Modifier mon avis',
        icone: Icons.star_rounded,
        onPressed: () => showAvisSheet(context, commande),
      ),
    ]);
  }
}
