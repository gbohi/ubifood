// lib/features/paiements/choix_paiement_sheet.dart
//
// « Comment payer ce repas ? » : choix du mode de paiement à la réservation
// (et pour changer le mode d'une commande en attente, jusqu'à la date limite
// de commande). Deux options : Compte repas (solde affiché ; désactivé si le
// solde ne couvre pas le repas, avec le motif de l'API et un lien vers
// « Mes paiements ») et Retenue sur salaire.
// API : GET compte-repas/paiement/?menu=ID (contrat d'API étape 2, §8).

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart' show messageErreurApi;
import '../../core/services/compte_repas_service.dart';
import '../../shared/models/compte_repas_models.dart';
import '../../shared/models/models.dart';
import '../../shared/providers/app_provider.dart';
import '../../shared/theme/app_theme.dart';
import '../dashboard/accueil_widgets.dart' show formatFcfa;
import 'mes_paiements_screen.dart';

class ChoixPaiementSheet extends StatefulWidget {
  final String platNom;
  final DateTime? jour;

  /// Changement de mode : mode actuel de la commande (null : réservation)
  final ModePaiementCommande? modeActuel;

  /// Date limite de changement (date limite de commande)
  final DateTime? limite;
  final Future<InfoPaiement> Function() chargerInfo;

  const ChoixPaiementSheet({
    super.key,
    required this.platNom,
    this.jour,
    this.modeActuel,
    this.limite,
    required this.chargerInfo,
  });

  /// Ouvre la feuille ; renvoie le mode choisi (null : fermée sans choix).
  static Future<ModePaiementCommande?> show(
    BuildContext context, {
    required int menuId,
    required String platNom,
    DateTime? jour,
    ModePaiementCommande? modeActuel,
    DateTime? limite,
    Future<InfoPaiement> Function()? chargerInfo,
  }) =>
      showModalBottomSheet<ModePaiementCommande>(
        context: context,
        useRootNavigator: true,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (_) => ChoixPaiementSheet(
          platNom: platNom,
          jour: jour,
          modeActuel: modeActuel,
          limite: limite,
          chargerInfo:
              chargerInfo ?? () => compteRepasService.infoPaiement(menuId),
        ),
      );

  @override
  State<ChoixPaiementSheet> createState() => _ChoixPaiementSheetState();
}

class _ChoixPaiementSheetState extends State<ChoixPaiementSheet> {
  late Future<InfoPaiement> _info;
  ModePaiementCommande? _mode;

  @override
  void initState() {
    super.initState();
    _charger();
  }

  void _charger() {
    _info = widget.chargerInfo().then((i) {
      if (mounted && _mode == null) {
        setState(() => _mode = widget.modeActuel ?? i.modeParDefaut);
      }
      return i;
    });
  }

  bool _comptePossible(InfoPaiement i) =>
      widget.modeActuel == ModePaiementCommande.compte || i.comptePossible;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final changement = widget.modeActuel != null;
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
          16, 0, 16, 16 + MediaQuery.of(context).viewPadding.bottom),
      child: FutureBuilder<InfoPaiement>(
        future: _info,
        builder: (context, snap) {
          final info = snap.data;
          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                  changement
                      ? 'Changer le mode de paiement'
                      : 'Comment payer ce repas ?',
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text(
                [
                  widget.platNom,
                  if (widget.jour != null)
                    DateFormat('EEEE d MMMM', 'fr_FR').format(widget.jour!),
                  if (info?.prix != null) formatFcfa(info!.prix!),
                ].join(' · '),
                style: TextStyle(color: gris, fontSize: 13),
              ),
              const SizedBox(height: 14),
              if (snap.connectionState != ConnectionState.done)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(
                      child: CircularProgressIndicator(
                          semanticsLabel: 'Chargement du solde')),
                )
              else if (snap.hasError || info == null)
                _Erreur(
                  message: messageErreurApi(snap.error ?? '') ??
                      "Votre solde n'a pas pu être chargé.",
                  onReessayer: () => setState(_charger),
                )
              else ...[
                _OptionPaiement(
                  mode: ModePaiementCommande.compte,
                  titre: 'Compte repas',
                  suffixe: '(solde ${formatFcfa(info.solde)})',
                  detail: _comptePossible(info)
                      ? (widget.modeActuel == ModePaiementCommande.compte
                          ? 'Repas déjà débité de votre compte.'
                          : 'Le repas est débité de votre compte maintenant.')
                      : (info.raisonCompteImpossible ??
                          'Solde insuffisant — rechargez à la caisse'),
                  actif: _comptePossible(info),
                  choisi: _mode == ModePaiementCommande.compte,
                  onTap: () =>
                      setState(() => _mode = ModePaiementCommande.compte),
                  lien: !_comptePossible(info) && !info.sansTarif
                      ? TextButton.icon(
                          style: TextButton.styleFrom(
                              padding: EdgeInsets.zero,
                              visualDensity: VisualDensity.compact),
                          onPressed: () {
                            final nav = Navigator.of(context);
                            nav.pop();
                            MesPaiementsScreen.ouvrir(nav.context);
                          },
                          icon: const Icon(Icons.open_in_new_rounded, size: 15),
                          label: const Text('Mes paiements'),
                        )
                      : null,
                ),
                const SizedBox(height: 10),
                _OptionPaiement(
                  mode: ModePaiementCommande.retenue,
                  titre: 'Retenue sur salaire',
                  detail: widget.modeActuel == ModePaiementCommande.compte
                      ? 'Le montant débité est recrédité sur votre compte.'
                      : 'Retenu sur votre salaire à la clôture du mois.',
                  actif: true,
                  choisi: _mode == ModePaiementCommande.retenue,
                  onTap: () =>
                      setState(() => _mode = ModePaiementCommande.retenue),
                ),
                const SizedBox(height: 12),
                Text(
                  [
                    if (widget.limite != null)
                      'Mode modifiable jusqu\'au ${DateFormat('dd/MM à HH:mm', 'fr_FR').format(widget.limite!.toLocal())}.',
                    'Un repas commandé est dû, même s\'il n\'est pas retiré.',
                  ].join(' '),
                  style: TextStyle(color: gris, fontSize: 11.5),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  height: 50,
                  child: ElevatedButton(
                    key: const Key('confirmer-paiement'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.accent,
                      foregroundColor: AppColors.primary,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                    ),
                    onPressed: _mode == null ||
                            (_mode == ModePaiementCommande.compte &&
                                !_comptePossible(info)) ||
                            (changement && _mode == widget.modeActuel)
                        ? null
                        : () => Navigator.of(context).pop(_mode),
                    child: Text(
                        changement
                            ? 'Changer'
                            : (_mode == ModePaiementCommande.compte
                                ? 'Réserver et payer par le compte'
                                : 'Réserver'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _OptionPaiement extends StatelessWidget {
  final ModePaiementCommande mode;
  final String titre;
  final String? suffixe;
  final String detail;
  final bool actif;
  final bool choisi;
  final VoidCallback onTap;
  final Widget? lien;

  const _OptionPaiement({
    required this.mode,
    required this.titre,
    this.suffixe,
    required this.detail,
    required this.actif,
    required this.choisi,
    required this.onTap,
    this.lien,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final bord = choisi
        ? AppColors.accentDark
        : (isDark ? AppColors.darkBorder : AppColors.lightBorder);
    final fond = !actif
        ? (isDark ? AppColors.darkBackground : AppColors.lightBackground)
        : choisi
            ? (isDark ? const Color(0xFF0F3324) : AppColors.accentLight)
            : (isDark ? AppColors.darkCard : AppColors.lightCard);
    final couleurIcone = !actif
        ? gris
        : mode == ModePaiementCommande.compte
            ? AppColors.accentDark
            : AppColors.warning;
    return Semantics(
      button: true,
      enabled: actif,
      selected: choisi,
      label: '$titre${suffixe != null ? ' $suffixe' : ''}',
      child: Material(
        color: fond,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(color: bord, width: choisi ? 2 : 1)),
        child: InkWell(
          key: Key('option-${mode.code}'),
          borderRadius: BorderRadius.circular(14),
          onTap: actif ? onTap : null,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(
                  choisi
                      ? Icons.radio_button_checked_rounded
                      : Icons.radio_button_unchecked_rounded,
                  color: !actif
                      ? gris.withOpacity(0.5)
                      : (choisi ? AppColors.accentDark : gris),
                  size: 22),
              const SizedBox(width: 10),
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                    color: couleurIcone.withOpacity(0.14),
                    borderRadius: BorderRadius.circular(10)),
                child: Icon(mode.icone, color: couleurIcone, size: 19),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text.rich(
                        TextSpan(children: [
                          TextSpan(
                              text: titre,
                              style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: actif
                                      ? (isDark
                                          ? AppColors.darkTextPrimary
                                          : AppColors.lightTextPrimary)
                                      : gris)),
                          if (suffixe != null)
                            TextSpan(
                                text: ' $suffixe',
                                style: TextStyle(
                                    color: gris, fontWeight: FontWeight.w500)),
                        ]),
                        style: const TextStyle(fontSize: 14),
                      ),
                      const SizedBox(height: 2),
                      Text(detail,
                          style: TextStyle(
                              fontSize: 12,
                              color: actif
                                  ? gris
                                  : (isDark
                                      ? const Color(0xFFF7C46C)
                                      : const Color(0xFF9A6510)))),
                      if (lien != null) lien!,
                    ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class _Erreur extends StatelessWidget {
  final String message;
  final VoidCallback onReessayer;
  const _Erreur({required this.message, required this.onReessayer});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Column(children: [
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          TextButton(onPressed: onReessayer, child: const Text('Réessayer')),
        ]),
      );
}

/// « Changer le mode de paiement » d'une commande en attente (carte « Votre
/// repas », Mes commandes, détail d'une commande) : feuille de choix, appel
/// au serveur, message. true si le mode a changé.
Future<bool> changerModePaiementCommande(
    BuildContext context, Commande commande) async {
  final cmdProv = context.read<CommandeProvider>();
  final facturation = context.read<FacturationProvider>();
  final messenger = ScaffoldMessenger.of(context);
  final menu = commande.menuDetail;
  if (menu == null || cmdProv.isLoading) return false;
  final mode = await ChoixPaiementSheet.show(
    context,
    menuId: menu.id,
    platNom: commande.platDetail?.nom ?? 'Repas',
    jour: DateTime.tryParse(menu.dateMenu),
    modeActuel: ModePaiementCommande.depuis(commande.modePaiement) ??
        ModePaiementCommande.retenue,
    limite: commande.modePaiementLimite ?? menu.dateLimiteCommande,
  );
  if (mode == null) return false;
  final ok = await cmdProv.changerModePaiement(commande.id, mode.code);
  if (ok) {
    facturation.charger();
  } else {
    cmdProv.loadMesCommandes();
  }
  messenger.showSnackBar(SnackBar(
    content: Text(ok
        ? (mode == ModePaiementCommande.compte
            ? 'Repas payé par votre compte repas'
            : 'Repas en retenue sur salaire'
                '${commande.payeParCompte ? ' — montant recrédité sur votre compte' : ''}')
        : (cmdProv.error ?? 'Le mode de paiement n\'a pas pu être changé')),
    backgroundColor: ok ? AppColors.success : AppColors.error,
    behavior: SnackBarBehavior.floating,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    margin: const EdgeInsets.all(12),
  ));
  if (!ok) cmdProv.clearMessages();
  return ok;
}

/// Mention du mode de paiement d'une commande : « Compte repas · 1 000 F »,
/// « Retenue sur salaire » (null : inconnu)
String? libelleModeCommande(Commande c) {
  final mode = ModePaiementCommande.depuis(c.modePaiement);
  if (mode == null) return null;
  if (c.paiementMode == 'caisse') return 'Payé à la caisse';
  if (mode == ModePaiementCommande.compte && c.paiementMontant != null) {
    return 'Compte repas · ${formatFcfa(c.paiementMontant!)}';
  }
  return mode.libelle;
}

/// Profil : mode de paiement proposé par défaut à la commande.
class PreferencePaiementSheet extends StatefulWidget {
  final ModePaiementCommande actuel;
  const PreferencePaiementSheet({super.key, required this.actuel});

  static Future<ModePaiementCommande?> show(
          BuildContext context, ModePaiementCommande actuel) =>
      showModalBottomSheet<ModePaiementCommande>(
        context: context,
        useRootNavigator: true,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (_) => PreferencePaiementSheet(actuel: actuel),
      );

  @override
  State<PreferencePaiementSheet> createState() =>
      _PreferencePaiementSheetState();
}

class _PreferencePaiementSheetState extends State<PreferencePaiementSheet> {
  late ModePaiementCommande _mode = widget.actuel;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
          16, 0, 16, 16 + MediaQuery.of(context).viewPadding.bottom),
      child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Paiement de mes repas',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(
                'Mode proposé par défaut quand vous commandez. Vous pouvez '
                'toujours choisir l\'autre à chaque commande.',
                style: TextStyle(color: gris, fontSize: 12.5)),
            const SizedBox(height: 14),
            _OptionPaiement(
              mode: ModePaiementCommande.compte,
              titre: 'Compte repas',
              detail: 'Débité à la commande si votre solde suffit, sinon '
                  'retenue sur salaire.',
              actif: true,
              choisi: _mode == ModePaiementCommande.compte,
              onTap: () => setState(() => _mode = ModePaiementCommande.compte),
            ),
            const SizedBox(height: 10),
            _OptionPaiement(
              mode: ModePaiementCommande.retenue,
              titre: 'Retenue sur salaire',
              detail: 'Retenu à la clôture du mois.',
              actif: true,
              choisi: _mode == ModePaiementCommande.retenue,
              onTap: () => setState(() => _mode = ModePaiementCommande.retenue),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 50,
              child: ElevatedButton(
                key: const Key('enregistrer-preference'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.accent,
                  foregroundColor: AppColors.primary,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14)),
                ),
                onPressed: () => Navigator.of(context).pop(_mode),
                child: const Text('Enregistrer',
                    style: TextStyle(fontWeight: FontWeight.w800)),
              ),
            ),
          ]),
    );
  }
}
