// lib/features/menu/menu_screen.dart
//
// Onglet Menus : parcours de commande agence → prestataire → équipe → jour
// (pages dans parcours_pages.dart), fiche détaillée d'un plat, réservation
// avec choix du mode de paiement, annulation.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../shared/models/models.dart';
import '../../shared/models/parcours_models.dart';
import '../../core/api/api_client.dart' show messageErreurApi;
import '../../core/widgets/common_widgets.dart';
import '../../core/widgets/tic_echeance.dart';
import '../../core/services/cantine_service.dart';
import '../../core/services/parcours_service.dart';
import '../avis/avis_widgets.dart';
import '../paiements/choix_paiement_sheet.dart';
import '../../shared/models/compte_repas_models.dart'
    show InfoPaiement, ModePaiementCommande;
import '../dashboard/accueil_widgets.dart' show fermeDans, formatFcfa;

part 'parcours_pages.dart';

/// Menu à afficher à l'ouverture de l'onglet (depuis l'accueil : un jour
/// de « Ma semaine », « Réserver » du prochain repas). L'onglet ouvre
/// l'agence, le prestataire, l'équipe et le jour du menu si possible.
class CibleMenu {
  final int? menuId;
  final DateTime? date;
  const CibleMenu({this.menuId, this.date});
}

/// Demande d'affichage d'un menu, traitée par l'onglet Menu.
final menuDemande = ValueNotifier<CibleMenu?>(null);

/// Bouton retour (Android) sur l'onglet Menus : revient à la page
/// précédente du parcours. true si le retour a été traité (sinon l'onglet
/// est sur sa première page). Branché par l'onglet, appelé par MainShell.
bool Function()? retourDansMenus;

/// Commande active (en attente ou retirée) pour ce menu, sinon pour le même
/// jour dans un autre menu (autre agence / équipe).
(Commande?, Commande?) _commandesDuJour(List<Commande> commandes, Menu menu) {
  bool active(Commande c) =>
      c.statut == StatutCommande.enAttente ||
      c.statut == StatutCommande.retiree;
  final ceMenu = commandes
      .where((c) => c.menuDetail?.id == menu.id && active(c))
      .firstOrNull;
  final ceJour = ceMenu ??
      commandes
          .where((c) => c.menuDetail?.dateMenu == menu.dateMenu && active(c))
          .firstOrNull;
  return (ceMenu, ceJour);
}

/// « Traiteur A (Siège) », « Siège » : où une commande a été passée
String _ouCommande(Commande c) {
  final m = c.menuDetail;
  if (m == null) return 'une autre agence';
  final agence = m.agenceNom.isEmpty ? 'une autre agence' : m.agenceNom;
  return m.prestataireNom == null ? agence : '${m.prestataireNom} ($agence)';
}

String _minuscule(String s) =>
    s.isEmpty ? s : s[0].toLowerCase() + s.substring(1);

/// Bandeau « Annulation possible · … » (Annuler) sous la carte « Votre
/// repas »
List<Widget> _bandeauAnnulation(
    BuildContext context, CommandeProvider cmdProv, Commande c, Menu menu) {
  if (c.statut != StatutCommande.enAttente || c.estNonRetiree()) return [];
  final Widget bandeau;
  if (!menu.annulationFermee) {
    final delai = fermeDans(menu.dateLimiteAnnulation, DateTime.now());
    bandeau = BandeauInfo(
      icone: Icons.timer_outlined,
      ton: TonPastille.or,
      texte: [
        'Annulation possible',
        if (delai != null) _minuscule(delai),
      ].join(' · '),
      action: TextButton(
        style: TextButton.styleFrom(foregroundColor: AppColors.error),
        onPressed: cmdProv.isLoading
            ? null
            : () => _confirmerAnnulationCommande(context, cmdProv, menu, c.id),
        child: const Text('Annuler',
            style: TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  } else {
    bandeau = BandeauInfo(
      icone: Icons.lock_outline_rounded,
      ton: TonPastille.gris,
      texte: menu.commandeFermee
          ? 'Commandes et annulations fermées pour ce jour'
          : 'Annulation fermée pour ce jour',
    );
  }
  return [const SizedBox(height: 10), bandeau];
}

/// Carte verte « Votre repas » (le jour a déjà une commande)
class _CarteVotreRepas extends StatelessWidget {
  final Commande commande;
  final Menu menu;
  const _CarteVotreRepas({required this.commande, required this.menu});

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(menu.dateMenu);
    final retiree = commande.statut == StatutCommande.retiree;
    final nonRetiree = commande.estNonRetiree();
    final plat = commande.platDetail;
    final platDuMenu = menu.menuPlats
        .where((mp) => mp.plat.id == plat?.id)
        .map((mp) => mp.plat)
        .firstOrNull;
    final etat = retiree
        ? 'Retiré'
        : nonRetiree
            ? 'Non retiré'
            : 'À retirer au comptoir';
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        // Fiche du plat commandé (avis, annulation)
        onTap: platDuMenu == null
            ? null
            : () =>
                _PlatDetailSheet.show(context, menu: menu, plat: platDuMenu),
        child: Ink(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
                colors: [Color(0xFF1F9D55), Color(0xFF3EC970)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.22),
                  borderRadius: BorderRadius.circular(12)),
              child: const Icon(Icons.restaurant_rounded,
                  color: Colors.white, size: 20),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                        'Votre repas'
                        '${date != null ? ' · ${DateFormat('EEEE d MMMM', 'fr_FR').format(date)}' : ''}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: Colors.white.withOpacity(0.85),
                            fontSize: 11.5)),
                    Text(plat?.nom ?? 'Repas commandé',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w700)),
                    Text('$etat · ${menu.agenceNom}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: Colors.white.withOpacity(0.85),
                            fontSize: 11.5)),
                    if (libelleModeCommande(commande) case final mode?) ...[
                      const SizedBox(height: 4),
                      Row(children: [
                        Icon(
                            commande.payeParCompte
                                ? Icons.account_balance_wallet_outlined
                                : Icons.receipt_long_outlined,
                            size: 13,
                            color: Colors.white),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(mode,
                              key: const Key('mode-votre-repas'),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700)),
                        ),
                      ]),
                    ],
                    if (commande.modePaiementModifiable &&
                        commande.statut == StatutCommande.enAttente)
                      TextButton.icon(
                        key: const Key('changer-mode-votre-repas'),
                        style: TextButton.styleFrom(
                            foregroundColor: Colors.white,
                            padding: EdgeInsets.zero,
                            minimumSize: const Size(0, 30),
                            visualDensity: VisualDensity.compact,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                        onPressed: () =>
                            changerModePaiementCommande(context, commande),
                        icon: const Icon(Icons.swap_horiz_rounded, size: 16),
                        label: const Text('Changer le mode de paiement',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                decoration: TextDecoration.underline,
                                decorationColor: Colors.white)),
                      ),
                  ]),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                  color: Colors.white, borderRadius: BorderRadius.circular(20)),
              child: Text(
                  retiree
                      ? 'Retirée'
                      : nonRetiree
                          ? 'Non retirée'
                          : 'En attente',
                  style: const TextStyle(
                      color: Color(0xFF1F9D55),
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700)),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Réserve [plat] (carte compacte et fiche détaillée : mêmes messages),
/// après le choix du mode de paiement (compte repas / retenue sur salaire)
Future<void> _reserverPlat(
    BuildContext context, CommandeProvider cmdProv, Menu menu, Plat plat,
    {Future<InfoPaiement> Function()? chargerInfo}) async {
  if (cmdProv.isLoading) return;
  final facturation = context.read<FacturationProvider>();
  final mode = await ChoixPaiementSheet.show(context,
      menuId: menu.id,
      // « Garba · Traiteur Délices d'Abidjan »
      platNom: menu.prestataireNom == null
          ? plat.nom
          : '${plat.nom} · ${menu.prestataireNom}',
      jour: DateTime.tryParse(menu.dateMenu),
      limite: menu.dateLimiteCommande,
      chargerInfo: chargerInfo);
  if (mode == null || !context.mounted) return;
  final ok = await cmdProv.commander(
      menuId: menu.id, platId: plat.id, modePaiement: mode.code);
  // « Ma facturation » doit refléter la nouvelle commande
  if (ok) facturation.charger();
  if (ok && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Row(children: [
        const Icon(Icons.check_circle_rounded, color: Colors.white),
        const SizedBox(width: 8),
        Expanded(
            child: Text('${plat.nom} — commande confirmée !'
                '${mode == ModePaiementCommande.compte ? ' Payée par votre compte repas.' : ' Retenue sur salaire.'}')),
      ]),
      backgroundColor: AppColors.success,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      margin: const EdgeInsets.all(12),
    ));
  } else if (!ok && context.mounted && cmdProv.error != null) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(cmdProv.error!),
      backgroundColor: AppColors.error,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      margin: const EdgeInsets.all(12),
    ));
    cmdProv.clearMessages();
  }
  // Refus du serveur (commande déjà passée ailleurs, délai…) : la liste
  // locale est peut-être périmée, on la recharge
  if (!ok) cmdProv.loadMesCommandes();
}

/// Commande payée par le compte repas : le montant sera recrédité si annulée
String _mentionRecredit(CommandeProvider cmdProv, int commandeId) {
  final c = cmdProv.mesCommandes.where((c) => c.id == commandeId).firstOrNull;
  final m = c != null && c.paiementMode != null && c.paiementMode != 'retenue'
      ? c.paiementMontant
      : null;
  return m == null
      ? ''
      : '\n\n${formatFcfa(m)} seront recrédités sur votre compte repas.';
}

/// Confirmation puis annulation de sa commande (carte « Votre repas »,
/// fiche détaillée)
void _confirmerAnnulationCommande(
    BuildContext context, CommandeProvider cmdProv, Menu menu, int commandeId) {
  showDialog(
      context: context,
      builder: (dialogCtx) => AlertDialog(
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            title: const Row(children: [
              Icon(Icons.warning_amber_rounded, color: AppColors.warning),
              SizedBox(width: 8),
              Text('Annuler ?'),
            ]),
            content: Text(
              'Voulez-vous annuler cette commande ?'
              '${_mentionRecredit(cmdProv, commandeId)}'
              '${menu.dateLimiteAnnulation != null ? '\n\nAnnulation possible jusqu\'au ${libelleDateLimite(menu.dateLimiteAnnulation!)}.' : ''}',
            ),
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
                  // Capturés avant l'await : la carte peut disparaître
                  final messenger = ScaffoldMessenger.of(context);
                  final facturation = context.read<FacturationProvider>();
                  Navigator.pop(dialogCtx);
                  if (cmdProv.isLoading) return;
                  final ok = await cmdProv.annuler(commandeId);
                  if (ok) {
                    facturation.charger();
                  } else {
                    // Commande retirée / annulée entre-temps : on resynchronise
                    cmdProv.loadMesCommandes();
                  }
                  messenger.showSnackBar(SnackBar(
                    content: Text(ok
                        ? 'Commande annulée'
                        : (cmdProv.error ??
                            'Impossible d\'annuler la commande')),
                    backgroundColor: ok ? AppColors.warning : AppColors.error,
                    behavior: SnackBarBehavior.floating,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    margin: const EdgeInsets.all(12),
                  ));
                },
                child: const Text('Oui, annuler'),
              ),
            ],
          ));
}

// ══════════════════════════════════════════════════════════════
// FICHE DÉTAILLÉE D'UN PLAT (feuille modale)
// ══════════════════════════════════════════════════════════════

/// État de la commande du jour vu depuis la fiche d'un plat (ordre des
/// règles : retrait, ce plat réservé, autre plat de ce menu, autre agence
/// le même jour, délai dépassé, réservation possible).
enum _EtatFiche {
  platRetire,
  autrePlatRetire,
  platReserve,
  autrePlatCeMenu,
  autreAgence,
  commandesFermees,
  ouvert,
}

/// « 2 j 13 h » : temps restant avant [limite] (null si passée)
String? _tempsRestant(DateTime? limite) =>
    fermeDans(limite, DateTime.now())?.replaceFirst('Ferme dans ', '');

/// « ven. 23 oct., 18 h » / « ven. 23 oct., minuit » (heure locale)
String _dateLimiteCourte(DateTime limite) {
  var d = limite.toLocal();
  final minuit = d.hour == 0 && d.minute == 0;
  if (minuit) d = d.subtract(const Duration(days: 1));
  final jour = DateFormat('EEE d MMM', 'fr_FR').format(d);
  if (minuit) return '$jour, minuit';
  return '$jour, ${d.hour} h${d.minute == 0 ? '' : ' ${d.minute.toString().padLeft(2, '0')}'}';
}

String _majusculeInitiale(String s) =>
    s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

/// Fiche d'un plat pour les tests (résumé des avis fourni sans réseau)
@visibleForTesting
Widget ficheDetailPlat({
  required Menu menu,
  required Plat plat,
  required Future<ResumeAvisPlat> Function(int platId) chargerAvis,
}) =>
    _PlatDetailSheet(menu: menu, plat: plat, chargerAvis: chargerAvis);

class _PlatDetailSheet extends StatefulWidget {
  final Menu menu;
  final Plat plat;

  /// Résumé des avis du plat (par défaut GET /plats/{id}/avis/)
  final Future<ResumeAvisPlat> Function(int platId)? chargerAvis;

  const _PlatDetailSheet(
      {required this.menu, required this.plat, this.chargerAvis});

  static Future<void> show(BuildContext context,
      {required Menu menu, required Plat plat}) {
    return showModalBottomSheet<void>(
      context: context,
      // Même navigateur que la boîte de confirmation d'annulation
      useRootNavigator: true,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _PlatDetailSheet(menu: menu, plat: plat),
    );
  }

  @override
  State<_PlatDetailSheet> createState() => _PlatDetailSheetState();
}

class _PlatDetailSheetState extends State<_PlatDetailSheet> {
  late Future<ResumeAvisPlat> _resume;
  bool _envoi = false;

  Future<ResumeAvisPlat> _charger() =>
      (widget.chargerAvis ?? avisService.resumePlat)(widget.plat.id);

  @override
  void initState() {
    super.initState();
    _resume = _charger();
  }

  void _rechargerAvis() => setState(() => _resume = _charger());

  /// [ctx] : contexte sous le messager de la feuille (SnackBar visible)
  Future<void> _reserver(BuildContext ctx, CommandeProvider cmdProv) async {
    setState(() => _envoi = true);
    await _reserverPlat(ctx, cmdProv, widget.menu, widget.plat);
    if (mounted) setState(() => _envoi = false);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fond = isDark ? AppColors.darkSurface : AppColors.lightSurface;

    // Messager propre à la feuille : les SnackBars (commande, annulation,
    // avis) s'affichent au-dessus d'elle et non derrière. La feuille prend
    // la hauteur de son contenu ; la zone transparente au-dessus la ferme.
    return ScaffoldMessenger(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: LayoutBuilder(
          builder: (context, contraintes) => Column(children: [
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => Navigator.of(context).pop(),
              ),
            ),
            ConstrainedBox(
              constraints:
                  BoxConstraints(maxHeight: contraintes.maxHeight * 0.94),
              child: Material(
                color: fond,
                clipBehavior: Clip.antiAlias,
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(22)),
                // Reconstruit à l'heure limite de commande / d'annulation :
                // « Réserver » et « Annuler » se ferment d'eux-mêmes.
                child: TicEcheance(
                  echeances: [
                    widget.menu.dateLimiteCommande,
                    widget.menu.dateLimiteAnnulation
                  ],
                  builder: _feuille,
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _feuille(BuildContext context) {
    final menu = widget.menu;
    final plat = widget.plat;
    final cmdProv = context.watch<CommandeProvider>();
    final (ceMenu, ceJour) = _commandesDuJour(cmdProv.mesCommandes, menu);
    final estCePlat = ceMenu != null && ceMenu.platDetail?.id == plat.id;

    final _EtatFiche etat;
    if (ceMenu?.statut == StatutCommande.retiree) {
      etat = estCePlat ? _EtatFiche.platRetire : _EtatFiche.autrePlatRetire;
    } else if (estCePlat) {
      etat = _EtatFiche.platReserve;
    } else if (ceMenu != null) {
      etat = _EtatFiche.autrePlatCeMenu;
    } else if (ceJour != null) {
      etat = _EtatFiche.autreAgence;
    } else if (menu.commandeFermee) {
      etat = _EtatFiche.commandesFermees;
    } else {
      etat = _EtatFiche.ouvert;
    }

    final bandeau = switch (etat) {
      _EtatFiche.ouvert => _BandeauOuvert(menu: menu),
      _EtatFiche.platReserve => _CarteReserve(commande: ceMenu!, menu: menu),
      _ => null,
    };

    return Column(mainAxisSize: MainAxisSize.min, children: [
      Flexible(
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _PhotosCarousel(
                  plat: plat, onFermer: () => Navigator.of(context).pop()),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 18),
                child: FutureBuilder<ResumeAvisPlat>(
                  future: _resume,
                  builder: (context, snap) => _corps(
                    context,
                    resume: snap.data,
                    bandeau: bandeau,
                    // Repas retiré : notation (le résumé est rechargé après)
                    retiree: etat == _EtatFiche.platRetire ? ceMenu : null,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      _pied(context, cmdProv, etat, ceMenu, ceJour),
    ]);
  }

  Widget _corps(BuildContext context,
      {required ResumeAvisPlat? resume,
      required Widget? bandeau,
      required Commande? retiree}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final texte =
        isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final plat = widget.plat;
    final menu = widget.menu;
    final type = plat.typePlatLibelle;
    final description = plat.descriptionUtile;

    // Note : résumé chargé, sinon celle fournie avec le plat
    final moyenne = resume?.noteMoyenne ?? plat.noteMoyenne;
    final nbAvis = resume?.nbAvis ?? plat.nbAvis;
    Widget? note;
    if (moyenne != null && (nbAvis ?? 1) > 0) {
      note = Wrap(
        spacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          EtoilesNote(note: moyenne.round(), size: 16),
          Text.rich(TextSpan(children: [
            TextSpan(
                text: formatNoteMoyenne(moyenne),
                style: TextStyle(
                    fontSize: 13.5, fontWeight: FontWeight.w700, color: texte)),
            if (nbAvis != null)
              TextSpan(
                  text: ' · $nbAvis avis',
                  style: TextStyle(fontSize: 12.5, color: gris)),
          ])),
        ],
      );
    } else if (nbAvis == 0) {
      note = Text('Pas encore noté',
          style: TextStyle(fontSize: 12.5, color: gris));
    }

    final date = DateTime.tryParse(menu.dateMenu);
    final avis = resume?.derniers ?? const <AvisRecent>[];

    final blocs = <Widget>[
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Text(plat.nom,
              style: TextStyle(
                  fontSize: 21,
                  height: 1.2,
                  fontWeight: FontWeight.w800,
                  color: texte)),
        ),
        if (type != null) ...[
          const SizedBox(width: 10),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 130),
              child: PastilleStatut(
                  label: type,
                  icone: Icons.eco_outlined,
                  ton: TonPastille.vert),
            ),
          ),
        ],
      ]),
      if (note != null) note,
      if (description != null)
        Text(description,
            style: TextStyle(
                fontSize: 13,
                height: 1.5,
                color: texte.withOpacity(isDark ? 0.85 : 0.8))),
      Wrap(spacing: 6, runSpacing: 6, children: [
        if (date != null)
          _PastilleInfo(
              icone: Icons.calendar_today_rounded,
              texte: _majusculeInitiale(
                  DateFormat('EEE d MMM', 'fr_FR').format(date))),
        if (menu.agenceNom.isNotEmpty)
          _PastilleInfo(
              icone: Icons.location_on_outlined, texte: menu.agenceNom),
        if (menu.typeEquipeLibelle.isNotEmpty)
          _PastilleInfo(
              icone: Icons.groups_outlined, texte: menu.typeEquipeLibelle),
      ]),
      if (bandeau != null) bandeau,
      if (retiree != null)
        AvisCommandeBloc(commande: retiree, onSaved: _rechargerAvis),
      if (avis.isNotEmpty)
        Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          SizedBox(
            height: 30,
            child: Row(children: [
              const Expanded(
                child: LibelleSection('Avis des collègues',
                    padding: EdgeInsets.symmetric(horizontal: 2)),
              ),
              if (avis.length > 2)
                TextButton(
                  style: TextButton.styleFrom(
                    foregroundColor:
                        isDark ? AppColors.accent : AppColors.primaryLight,
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    minimumSize: const Size(48, 30),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    textStyle: const TextStyle(
                        fontSize: 12.5, fontWeight: FontWeight.w700),
                  ),
                  onPressed: () => _ListeAvisSheet.show(context,
                      plat: plat, resume: resume!),
                  child: Text('Voir les ${avis.length}'),
                ),
            ]),
          ),
          for (final a in avis.take(2)) _CarteAvis(avis: a),
        ]),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < blocs.length; i++) ...[
          // Note collée au nom, sections espacées
          if (i > 0) SizedBox(height: identical(blocs[i], note) ? 6 : 12),
          blocs[i],
        ],
      ],
    );
  }

  /// Barre d'action fixée en bas de la feuille : mêmes règles que l'ancien
  /// bouton « Commander » (retrait, annulation, autre plat, autre agence,
  /// délai dépassé, réservation).
  Widget _pied(BuildContext context, CommandeProvider cmdProv, _EtatFiche etat,
      Commande? ceMenu, Commande? ceJour) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final texte =
        isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final menu = widget.menu;
    final styleAide = TextStyle(fontSize: 11.5, height: 1.4, color: gris);

    Widget aide(String s) =>
        Text(s, textAlign: TextAlign.center, style: styleAide);

    /// « Votre repas ce jour : Attiéké poisson · en attente »
    Widget votreRepas(Commande c) {
      final statut = c.statut == StatutCommande.retiree
          ? 'retiré'
          : c.estNonRetiree()
              ? 'non retiré'
              : 'en attente';
      return Text.rich(
        TextSpan(style: styleAide, children: [
          const TextSpan(text: 'Votre repas ce jour : '),
          TextSpan(
              text: c.platDetail?.nom ?? 'repas commandé',
              style: TextStyle(fontWeight: FontWeight.w700, color: texte)),
          TextSpan(text: ' · $statut'),
        ]),
        textAlign: TextAlign.center,
      );
    }

    final List<Widget> contenu;
    switch (etat) {
      case _EtatFiche.platRetire:
        contenu = [
          const _PiedStatut(
              icone: Icons.check_circle_rounded,
              texte: 'Repas retiré',
              ton: TonPastille.vert),
        ];
      case _EtatFiche.autrePlatRetire:
        contenu = [
          const _PiedStatut(
              icone: Icons.check_circle_rounded,
              texte: 'Un autre plat a été retiré',
              ton: TonPastille.vert),
          votreRepas(ceMenu!),
        ];
      case _EtatFiche.platReserve:
        if (!menu.annulationFermee) {
          final (_, rouge) = couleursPastille(TonPastille.rouge, isDark);
          final restant = _tempsRestant(menu.dateLimiteAnnulation);
          final limite = menu.dateLimiteAnnulation;
          contenu = [
            SizedBox(
              width: double.infinity,
              height: 50,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.cancel_outlined, size: 18),
                label: const Text('Annuler ma réservation'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: rouge,
                  side: BorderSide(color: rouge.withOpacity(0.5), width: 1.5),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14)),
                  textStyle: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w700),
                ),
                // Pas de second envoi pendant une action en cours
                onPressed: cmdProv.isLoading
                    ? null
                    : () => _confirmerAnnulationCommande(
                        context, cmdProv, menu, ceMenu!.id),
              ),
            ),
            if (restant != null || limite != null)
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(Icons.schedule_rounded, size: 13, color: gris),
                const SizedBox(width: 4),
                Flexible(
                  child: aide([
                    'Annulation possible',
                    if (restant != null) 'encore $restant',
                    if (limite != null) '(${_dateLimiteCourte(limite)})',
                  ].join(' ')),
                ),
              ]),
          ];
        } else {
          contenu = [
            const _PiedStatut(
                icone: Icons.lock_outline_rounded,
                texte: 'Commande en attente',
                ton: TonPastille.or),
            aide('Annulation impossible — date limite dépassée'),
          ];
        }
      case _EtatFiche.autrePlatCeMenu:
        contenu = [
          _PiedStatut(
              icone: menu.commandeFermee
                  ? Icons.lock_outline_rounded
                  : Icons.block_rounded,
              texte: menu.commandeFermee
                  ? 'Commandes fermées pour ce jour'
                  : 'Autre plat déjà commandé',
              ton: TonPastille.gris),
          votreRepas(ceMenu!),
          // Conseil d'annulation seulement si elle est encore possible
          if (ceMenu.statut == StatutCommande.enAttente &&
              !menu.annulationFermee)
            aide('Annulez « ${ceMenu.platDetail?.nom ?? 'votre commande'} » '
                'pour choisir ce plat'),
        ];
      case _EtatFiche.autreAgence:
        final c = ceJour!;
        contenu = [
          const _PiedStatut(
              icone: Icons.location_off_rounded,
              texte: 'Déjà commandé ce jour',
              ton: TonPastille.rouge),
          aide('Vous avez déjà commandé « ${c.platDetail?.nom ?? 'un plat'} » '
              'chez ${_ouCommande(c)} ce jour.'
              // Conseil d'annulation seulement si elle est encore possible
              '${c.statut == StatutCommande.enAttente && !menu.annulationFermee ? '\nAnnulez cette commande pour en passer une autre.' : ''}'),
        ];
      case _EtatFiche.commandesFermees:
        contenu = [
          const _PiedStatut(
              icone: Icons.lock_outline_rounded,
              texte: 'Commandes fermées pour ce jour',
              ton: TonPastille.gris),
        ];
      case _EtatFiche.ouvert:
        contenu = [
          BoutonVert(
            label: 'Réserver ce plat',
            icone: Icons.shopping_basket_outlined,
            hauteur: 52,
            chargement: _envoi,
            onPressed:
                cmdProv.isLoading ? null : () => _reserver(context, cmdProv),
          ),
          if (menu.dateLimiteAnnulation != null)
            aide('Annulable jusqu\'au '
                '${libelleDateLimite(menu.dateLimiteAnnulation!)}'),
        ];
    }

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        border: Border(
            top: BorderSide(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder)),
      ),
      padding: EdgeInsets.fromLTRB(
          18, 12, 18, 14 + MediaQuery.paddingOf(context).bottom),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        for (var i = 0; i < contenu.length; i++) ...[
          if (i > 0) const SizedBox(height: 7),
          contenu[i],
        ],
      ]),
    );
  }
}

/// Pastille compacte « Lun. 26 oct. », « Siège », « Journée »
class _PastilleInfo extends StatelessWidget {
  final IconData icone;
  final String texte;
  const _PastilleInfo({required this.icone, required this.texte});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightBackground,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icone,
            size: 13,
            color: isDark ? AppColors.accent : AppColors.primaryLight),
        const SizedBox(width: 4),
        Flexible(
          child: Text(texte,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.lightTextSecondary)),
        ),
      ]),
    );
  }
}

/// Bandeau ambré « Commandes ouvertes · ferme dans … » (jour ouvert)
class _BandeauOuvert extends StatelessWidget {
  final Menu menu;
  const _BandeauOuvert({required this.menu});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final (_, couleur) = couleursPastille(TonPastille.or, isDark);
    final fond =
        isDark ? AppColors.warning.withOpacity(0.15) : AppColors.warningLight;
    final restant = fermeDans(menu.dateLimiteCommande, DateTime.now());
    final limite = menu.dateLimiteCommande;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration:
          BoxDecoration(color: fond, borderRadius: BorderRadius.circular(12)),
      child: Row(children: [
        Icon(Icons.alarm_rounded, size: 18, color: couleur),
        const SizedBox(width: 9),
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
                [
                  'Commandes ouvertes',
                  if (restant != null) _minuscule(restant),
                ].join(' · '),
                style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: couleur)),
            if (limite != null)
              Text('Jusqu\'au ${libelleDateLimite(limite)}',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: couleur.withOpacity(0.85))),
          ]),
        ),
      ]),
    );
  }
}

/// Carte verte « Plat réservé » (ce plat est la commande du jour)
class _CarteReserve extends StatelessWidget {
  final Commande commande;
  final Menu menu;
  const _CarteReserve({required this.commande, required this.menu});

  @override
  Widget build(BuildContext context) {
    final nonRetiree = commande.estNonRetiree();
    final date = DateTime.tryParse(menu.dateMenu);
    final detail = nonRetiree
        ? 'Repas non retiré au comptoir'
        : [
            'À retirer au comptoir'
                '${date != null ? ' ${DateFormat('EEEE d MMMM', 'fr_FR').format(date)}' : ''}',
            if (menu.agenceNom.isNotEmpty) menu.agenceNom,
          ].join(' · ');
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
            colors: [Color(0xFF1F9D55), Color(0xFF3EC970)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.22),
              borderRadius: BorderRadius.circular(11)),
          child: const Icon(Icons.check_rounded, color: Colors.white, size: 21),
        ),
        const SizedBox(width: 10),
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Plat réservé',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700)),
            Text(detail,
                style: TextStyle(
                    color: Colors.white.withOpacity(0.88), fontSize: 11)),
          ]),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
              color: Colors.white, borderRadius: BorderRadius.circular(20)),
          child: Text(nonRetiree ? 'Non retirée' : 'En attente',
              style: const TextStyle(
                  color: Color(0xFF1F9D55),
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700)),
        ),
      ]),
    );
  }
}

/// État verrouillé de la barre d'action (« Commandes fermées pour ce jour »)
class _PiedStatut extends StatelessWidget {
  final IconData icone;
  final String texte;
  final TonPastille ton;
  const _PiedStatut(
      {required this.icone, required this.texte, required this.ton});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    var (fond, couleur) = couleursPastille(ton, isDark);
    if (ton == TonPastille.gris && isDark) fond = AppColors.darkCard;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration:
          BoxDecoration(color: fond, borderRadius: BorderRadius.circular(14)),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(icone, size: 17, color: couleur),
        const SizedBox(width: 8),
        Flexible(
          child: Text(texte,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 13.5, fontWeight: FontWeight.w600, color: couleur)),
        ),
      ]),
    );
  }
}

// ── Avis des collègues ─────────────────────────────────────────

class _CarteAvis extends StatelessWidget {
  final AvisRecent avis;
  const _CarteAvis({required this.avis});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final texte =
        isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final date = DateTime.tryParse(avis.date);
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightBackground,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Flexible(
            child: Text(avis.auteur.isEmpty ? 'Un collègue' : avis.auteur,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w700, color: texte)),
          ),
          const SizedBox(width: 6),
          EtoilesNote(note: avis.note, size: 12),
          const Spacer(),
          if (date != null)
            Text(DateFormat('d MMM', 'fr_FR').format(date),
                style: TextStyle(fontSize: 11, color: gris)),
        ]),
        const SizedBox(height: 3),
        Text(avis.commentaire,
            style: TextStyle(fontSize: 12.5, height: 1.45, color: texte)),
      ]),
    );
  }
}

/// Tous les commentaires renvoyés par le serveur (les plus récents)
class _ListeAvisSheet extends StatelessWidget {
  final Plat plat;
  final ResumeAvisPlat resume;
  const _ListeAvisSheet({required this.plat, required this.resume});

  static Future<void> show(BuildContext context,
          {required Plat plat, required ResumeAvisPlat resume}) =>
      showModalBottomSheet<void>(
        context: context,
        useRootNavigator: true,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (_) => _ListeAvisSheet(plat: plat, resume: resume),
      );

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final n = resume.derniers.length;
    final moyenne = resume.noteMoyenne;
    return ConstrainedBox(
      constraints:
          BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
            child: Text('Avis des collègues',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 6),
            child: Text(
                [
                  plat.nom,
                  if (moyenne != null)
                    '★ ${formatNoteMoyenne(moyenne)} · ${resume.nbAvis} avis',
                  if (resume.nbAvis > n)
                    '$n dernier${n > 1 ? 's' : ''} commentaire${n > 1 ? 's' : ''}',
                ].join(' · '),
                style: TextStyle(fontSize: 12.5, color: gris)),
          ),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              padding: EdgeInsets.fromLTRB(
                  16, 0, 16, 16 + MediaQuery.paddingOf(context).bottom),
              children: [
                for (final a in resume.derniers) _CarteAvis(avis: a),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Carrousel des photos ───────────────────────────────────────

class _PhotosCarousel extends StatefulWidget {
  final Plat plat;
  final VoidCallback onFermer;
  const _PhotosCarousel({required this.plat, required this.onFermer});

  @override
  State<_PhotosCarousel> createState() => _PhotosCarouselState();
}

class _PhotosCarouselState extends State<_PhotosCarousel> {
  static const _hauteur = 222.0;
  final _controller = PageController();
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Photo principale en premier
    final urls = [
      ...widget.plat.images.where((i) => i.isPrincipale),
      ...widget.plat.images.where((i) => !i.isPrincipale),
    ].map((i) => i.url).whereType<String>().toList();
    const voile = Color(0x73061220);

    return SizedBox(
      height: _hauteur,
      child: Stack(children: [
        if (urls.isEmpty)
          const _SansPhoto()
        else
          PageView.builder(
            controller: _controller,
            itemCount: urls.length,
            onPageChanged: (i) => setState(() => _page = i),
            itemBuilder: (_, i) => Image.network(
              urls[i],
              width: double.infinity,
              height: _hauteur,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const _SansPhoto(),
            ),
          ),
        // Poignée de la feuille, au-dessus de la photo
        Positioned(
          top: 8,
          left: 0,
          right: 0,
          child: Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.9),
                borderRadius: BorderRadius.circular(2),
                boxShadow: [
                  BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 4)
                ],
              ),
            ),
          ),
        ),
        if (urls.length > 1)
          Positioned(
            top: 14,
            left: 12,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(
                  color: voile, borderRadius: BorderRadius.circular(20)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.photo_outlined, size: 13, color: Colors.white),
                const SizedBox(width: 4),
                Text('${_page + 1} / ${urls.length}',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w600)),
              ]),
            ),
          ),
        Positioned(
          top: 10,
          right: 10,
          child: IconButton.filled(
            tooltip: 'Fermer',
            style: IconButton.styleFrom(
                backgroundColor: voile,
                foregroundColor: Colors.white,
                minimumSize: const Size(36, 36),
                fixedSize: const Size(36, 36),
                padding: EdgeInsets.zero),
            icon: const Icon(Icons.close_rounded, size: 20),
            onPressed: widget.onFermer,
          ),
        ),
        if (urls.length > 1)
          Positioned(
            bottom: 12,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(urls.length, (i) {
                final actif = i == _page;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 2.5),
                  width: actif ? 18 : 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: actif
                        ? AppColors.accent
                        : Colors.white.withOpacity(0.75),
                    borderRadius: BorderRadius.circular(4),
                    boxShadow: [
                      BoxShadow(
                          color: Colors.black.withOpacity(0.25), blurRadius: 3)
                    ],
                  ),
                );
              }),
            ),
          ),
      ]),
    );
  }
}

/// Pas de photo : couverts sur dégradé marine (lisible dans les deux thèmes)
class _SansPhoto extends StatelessWidget {
  const _SansPhoto();

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        decoration: const BoxDecoration(gradient: AppColors.heroGradient),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: AppColors.accent.withOpacity(0.14),
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.restaurant_rounded,
                size: 30, color: AppColors.accent.withOpacity(0.9)),
          ),
          const SizedBox(height: 10),
          Text('Pas encore de photo',
              style: TextStyle(
                  color: Colors.white.withOpacity(0.7),
                  fontSize: 12,
                  fontWeight: FontWeight.w500)),
        ]),
      );
}
