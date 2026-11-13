// lib/features/prestataire/comptoir_screen.dart
//
// Comptoir du prestataire (agent de comptoir ou responsable) : avancement
// du service, « Scanner un badge » (mode scan) ou matricule saisi (mode
// saisie), fiche de l'employé, « Valider le retrait », alerte « déjà
// retiré » et derniers retraits (annulables 2 minutes par leur auteur).

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/services/prestataire_service.dart';
import '../../core/widgets/common_widgets.dart';
import '../../shared/models/prestataire_models.dart';
import '../../shared/providers/app_provider.dart';
import '../../shared/providers/prestataire_provider.dart';
import '../../shared/theme/app_theme.dart';
import '../dashboard/dashboard_screen.dart' show MainShellNavigator;
import '../retrait/scanner_badge.dart';
import 'prestataire_widgets.dart';
import '../suivi/suivi_widgets.dart' show SuiviServicesPresta;

class ComptoirScreen extends StatefulWidget {
  /// Onglet de la liste du jour dans MainShell (lien « Voir la liste »)
  final int? ongletListe;
  const ComptoirScreen({super.key, this.ongletListe});

  @override
  State<ComptoirScreen> createState() => _ComptoirScreenState();
}

class _ComptoirScreenState extends State<ComptoirScreen> {
  final _matriculeCtrl = TextEditingController();
  bool _scanMode = false;
  bool _visible = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _charger());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Onglet masqué (IndexedStack) : caméra coupée
    final visible = TickerMode.of(context);
    if (!visible && _visible) _scanMode = false;
    _visible = visible;
  }

  @override
  void dispose() {
    _matriculeCtrl.dispose();
    super.dispose();
  }

  Future<void> _charger() async {
    if (!mounted) return;
    final espace = context.read<EspacePrestataireProvider>();
    final comptoir = context.read<ComptoirProvider>();
    if (espace.contexte == null) await espace.chargerContexte();
    if (!mounted || espace.contexte == null) return;
    await comptoir.chargerService(espace.agence?.id);
  }

  void _changementAgence() {
    final comptoir = context.read<ComptoirProvider>();
    comptoir.reset();
    _matriculeCtrl.clear();
    comptoir
        .chargerService(context.read<EspacePrestataireProvider>().agence?.id);
  }

  int? get _agenceId => context.read<EspacePrestataireProvider>().agence?.id;

  bool _onScan(String valeur) {
    final comptoir = context.read<ComptoirProvider>();
    if (comptoir.occupe) return false;
    setState(() {
      _scanMode = false;
      _matriculeCtrl.clear();
    });
    comptoir.rechercher(valeur, ModeIdentification.scan, agenceId: _agenceId);
    return true;
  }

  void _rechercherSaisie() {
    final m = _matriculeCtrl.text.trim();
    if (m.isEmpty) return;
    FocusScope.of(context).unfocus();
    context
        .read<ComptoirProvider>()
        .rechercher(m, ModeIdentification.saisie, agenceId: _agenceId);
  }

  Future<void> _valider() async {
    final ok =
        await context.read<ComptoirProvider>().valider(agenceId: _agenceId);
    if (ok && mounted) _matriculeCtrl.clear();
  }

  Future<void> _annuler(RetraitComptoir r) async {
    final confirme = await showDialog<bool>(
      context: context,
      builder: (dCtx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Annuler ce retrait ?'),
        content: Text('Le repas de ${r.userNom} redeviendra « à servir » et '
            "l'employé sera prévenu."),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dCtx, false),
              child: const Text('Non')),
          ElevatedButton(
              style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.error,
                  foregroundColor: Colors.white),
              onPressed: () => Navigator.pop(dCtx, true),
              child: const Text('Oui, annuler')),
        ],
      ),
    );
    if (confirme != true || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final erreur =
        await context.read<ComptoirProvider>().annuler(r, agenceId: _agenceId);
    messenger.showSnackBar(SnackBar(
      content:
          Text(erreur ?? 'Retrait annulé : le repas est de nouveau à servir.'),
      backgroundColor: erreur == null ? null : AppColors.error,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final espace = context.watch<EspacePrestataireProvider>();
    final comptoir = context.watch<ComptoirProvider>();
    final user = context.watch<AuthProvider>().user;
    final contexte = espace.contexte;
    final service = comptoir.serviceDuJour;
    final agence = service?.agence ?? espace.agence;

    final enTete = EnTeteMarine(
      titre: agence == null ? 'Comptoir' : 'Comptoir · ${agence.nom}',
      sousTitre: [
        jourCourtPresta(service?.date ?? DateTime.now()),
        if ((agence?.libelleService ?? '').isNotEmpty) agence!.libelleService,
      ].join(' · '),
      actions: [
        EnTeteBouton(
          icone: Icons.refresh_rounded,
          tooltip: 'Actualiser',
          onPressed: comptoir.serviceEnCours ? null : _charger,
        ),
        const BoutonNotificationsEnTete(),
      ],
      bas: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 8, runSpacing: 6, children: [
          if (contexte != null)
            PastillePrestataire([
              contexte.prestataireLibelle,
              if (contexte.nomComplet.isNotEmpty)
                contexte.nomComplet
              else if (user != null)
                user.fullName,
            ].where((s) => s.isNotEmpty).join(' · ')),
          ChoixAgenceEnTete(onChange: _changementAgence),
        ]),
        const SizedBox(height: 10),
        CompteursService(
          servis: service?.servies ?? 0,
          aServir: service?.aServir ?? 0,
          commandes: service?.commandees ?? 0,
        ),
      ]),
    );

    Widget corps;
    if (contexte == null && espace.contexteErreur != null) {
      corps = _erreur(espace.contexteErreur!, _charger);
    } else if (contexte == null) {
      corps = const Padding(
          padding: EdgeInsets.all(14), child: ShimmerCard(height: 220));
    } else if (contexte.agences.isEmpty) {
      corps = const Padding(
        padding: EdgeInsets.all(14),
        child: BandeauInfo(
            icone: Icons.info_outline_rounded,
            ton: TonPastille.or,
            texte: "Votre prestataire ne dessert aucune agence aujourd'hui."),
      );
    } else {
      corps = RefreshIndicator(
        onRefresh: _charger,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 100),
          children: [
            if (comptoir.serviceErreur != null) ...[
              BandeauInfo(
                icone: Icons.cloud_off_rounded,
                ton: TonPastille.rouge,
                texte: comptoir.serviceErreur!,
                action: TextButton(
                    onPressed: _charger, child: const Text('Réessayer')),
              ),
              const SizedBox(height: 12),
            ] else if (service != null && !service.aDesMenus) ...[
              BandeauInfo(
                icone: Icons.event_busy_rounded,
                ton: TonPastille.or,
                texte: 'Aucun menu servi aujourd\'hui'
                    '${agence == null ? '' : ' à ${agence.nom}'}.',
              ),
              const SizedBox(height: 12),
            ],
            // Suivi des livraisons : Préparation, Livraison partie, Arrivé au comptoir
            SuiviServicesPresta(
                key: ValueKey('suivi-${agence?.id}'), agenceId: agence?.id),
            _carteScan(comptoir),
            const SizedBox(height: 12),
            ResultatComptoir(
              comptoir: comptoir,
              agentNom: contexte.nomComplet.isNotEmpty
                  ? contexte.nomComplet
                  : (user?.fullName ?? ''),
              onValider: _valider,
              onAnnuler: _annuler,
              onSuivant: () {
                _matriculeCtrl.clear();
                comptoir.effacer();
              },
            ),
            if (service != null) ...[
              DerniersRetraitsComptoir(
                service: service,
                annulationEnCours: comptoir.annulationEnCours,
                onAnnuler: _annuler,
                onVoirListe: widget.ongletListe == null
                    ? null
                    : () => MainShellNavigator.of(context)
                        ?.navigateTo(widget.ongletListe!),
              ),
              if (service.plats.isNotEmpty) ...[
                const SizedBox(height: 12),
                PlatsDuService(plats: service.plats),
              ],
            ],
          ],
        ),
      );
    }

    return Scaffold(
      body: Column(children: [enTete, Expanded(child: corps)]),
    );
  }

  Widget _erreur(String message, VoidCallback onReessayer) => ListView(
        padding: const EdgeInsets.all(14),
        children: [
          BandeauInfo(
            icone: Icons.error_outline_rounded,
            ton: TonPastille.rouge,
            texte: message,
            action: TextButton(
                onPressed: onReessayer, child: const Text('Réessayer')),
          ),
        ],
      );

  Widget _carteScan(ComptoirProvider comptoir) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return CartePresta(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (_scanMode && _visible) ...[
          ScannerBadge(onScan: _onScan, hauteur: 260),
          TextButton.icon(
            icon: const Icon(Icons.close_rounded, size: 18),
            label: const Text('Fermer la caméra'),
            onPressed: () => setState(() => _scanMode = false),
          ),
        ] else ...[
          Semantics(
            button: true,
            label: 'Scanner un badge',
            excludeSemantics: true,
            child: GestureDetector(
              onTap: () => setState(() => _scanMode = true),
              child: Container(
                height: 104,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                      colors: [Color(0xFF0C2B4D), Color(0xFF12497F)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.qr_code_scanner_rounded,
                          size: 42, color: AppColors.accent),
                      const SizedBox(height: 6),
                      Text("Visez le QR code du badge de l'employé",
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 11.5,
                              color: Colors.white.withOpacity(0.75))),
                    ]),
              ),
            ),
          ),
          const SizedBox(height: 12),
          BoutonVert(
            label: 'Scanner un badge',
            icone: Icons.qr_code_scanner_rounded,
            hauteur: 54,
            onPressed: () => setState(() => _scanMode = true),
          ),
        ],
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: TextField(
              controller: _matriculeCtrl,
              textInputAction: TextInputAction.search,
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(
                hintText: 'Saisir un matricule (ex. UBI-0457)',
                isDense: true,
                prefixIcon: Icon(Icons.dialpad_rounded,
                    size: 20,
                    color: isDark ? AppColors.accent : AppColors.primaryLight),
              ),
              onSubmitted: (_) => _rechercherSaisie(),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 46,
            height: 46,
            child: ElevatedButton(
              onPressed: comptoir.occupe ? null : _rechercherSaisie,
              style: ElevatedButton.styleFrom(
                padding: EdgeInsets.zero,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              child: comptoir.rechercheEnCours
                  ? SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: isDark ? AppColors.primary : Colors.white))
                  : const Icon(Icons.search_rounded,
                      semanticLabel: 'Rechercher'),
            ),
          ),
        ]),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// RÉSULTAT (fiche de l'employé, validation, déjà retiré)
// ══════════════════════════════════════════════════════════════

class ResultatComptoir extends StatelessWidget {
  final ComptoirProvider comptoir;
  final String agentNom;
  final VoidCallback onValider;
  final void Function(RetraitComptoir) onAnnuler;
  final VoidCallback onSuivant;

  const ResultatComptoir({
    super.key,
    required this.comptoir,
    required this.agentNom,
    required this.onValider,
    required this.onAnnuler,
    required this.onSuivant,
  });

  @override
  Widget build(BuildContext context) {
    if (comptoir.rechercheEnCours) {
      return const Padding(
          padding: EdgeInsets.only(bottom: 12),
          child: ShimmerCard(height: 150));
    }
    if (comptoir.rechercheErreur != null) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: BandeauInfo(
            icone: Icons.person_off_outlined,
            ton: TonPastille.rouge,
            texte: comptoir.rechercheErreur!),
      );
    }
    final valide = comptoir.valide;
    if (valide != null) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: CarteRetraitValide(
          retrait: valide,
          annulationEnCours: comptoir.annulationEnCours == valide.id,
          onAnnuler: () => onAnnuler(valide),
          onSuivant: onSuivant,
        ),
      );
    }
    final r = comptoir.recherche;
    if (r == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: CarteEmployeComptoir(
        recherche: r,
        dejaRetire: comptoir.dejaRetire,
        erreur: comptoir.validationErreur,
        agentNom: agentNom,
        validationEnCours: comptoir.validationEnCours,
        onValider: onValider,
        onSuivant: onSuivant,
      ),
    );
  }
}

/// Fiche de l'employé trouvé (sans catégorie : le prestataire ne la voit pas)
class CarteEmployeComptoir extends StatelessWidget {
  final RechercheComptoir recherche;
  final DejaRetire? dejaRetire;
  final String? erreur;
  final String agentNom;
  final bool validationEnCours;
  final VoidCallback onValider;
  final VoidCallback onSuivant;

  const CarteEmployeComptoir({
    super.key,
    required this.recherche,
    this.dejaRetire,
    this.erreur,
    required this.agentNom,
    this.validationEnCours = false,
    required this.onValider,
    required this.onSuivant,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final e = recherche.employe;
    final nb = recherche.nbARemettre;
    // 409 à la validation : prioritaire sur la recherche
    final deja = dejaRetire != null || recherche.dejaRetire;
    final messageDeja = dejaRetire?.message ?? recherche.message;
    final peutValider = recherche.aRetirer && !deja;

    final PastilleStatut pastille = deja
        ? const PastilleStatut(
            label: 'Déjà retiré',
            icone: Icons.warning_amber_rounded,
            ton: TonPastille.or)
        : nb > 0
            ? PastilleStatut(
                label: '$nb plat${nb > 1 ? 's' : ''} à remettre',
                ton: TonPastille.or)
            : const PastilleStatut(
                label: 'Rien à remettre', ton: TonPastille.gris);

    return CartePresta(
      bordure: peutValider
          ? AppColors.accentDark
          : deja
              ? const Color(0xFFFFAB00)
              : null,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          AvatarNom(nom: e.nomComplet, taille: 46),
          const SizedBox(width: 12),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(e.nomComplet,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontSize: 15.5, fontWeight: FontWeight.w800)),
              Text(
                  [e.matricule, e.agence]
                      .where((s) => s.isNotEmpty)
                      .join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11.5, color: gris)),
            ]),
          ),
          const SizedBox(width: 6),
          ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 130),
              child: pastille),
        ]),
        const SizedBox(height: 12),
        for (final c in recherche.commandes)
          Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkSurface : AppColors.lightBackground,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(children: [
              VignettePlat(url: c.platImageUrl, taille: 52, rayon: 10),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(c.plat,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(
                                  fontSize: 15, fontWeight: FontWeight.w700)),
                      Text('Commande n° ${c.commandeId}',
                          style: TextStyle(fontSize: 11.5, color: gris)),
                    ]),
              ),
              if (c.statut == 'retiree')
                const PastilleStatut(
                    label: 'Retiré',
                    icone: Icons.check_rounded,
                    ton: TonPastille.vert),
            ]),
          ),
        if (deja) ...[
          AlerteDejaRetire(message: messageDeja),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: onSuivant,
            icon: const Icon(Icons.qr_code_scanner_rounded, size: 18),
            label: const Text('Employé suivant'),
          ),
        ] else if (recherche.commandes.isEmpty || !recherche.aRetirer)
          BandeauInfo(
            icone: Icons.info_outline_rounded,
            ton: TonPastille.or,
            texte: recherche.message.isNotEmpty
                ? recherche.message
                : "Aucune commande à remettre aujourd'hui.",
          ),
        if (erreur != null) ...[
          BandeauInfo(
              icone: Icons.error_outline_rounded,
              ton: TonPastille.rouge,
              texte: erreur!),
          const SizedBox(height: 10),
        ],
        if (peutValider) ...[
          BoutonVert(
            label: 'Valider le retrait',
            icone: Icons.done_all_rounded,
            hauteur: 54,
            chargement: validationEnCours,
            onPressed: onValider,
          ),
          const SizedBox(height: 8),
          Text(
              agentNom.isEmpty
                  ? "Enregistré à votre nom, avec l'heure"
                  : "Enregistré au nom de $agentNom, avec l'heure",
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11.5, color: gris)),
        ],
      ]),
    );
  }
}

/// Alerte orange « déjà retiré à 12:41 (validé par …) »
class AlerteDejaRetire extends StatelessWidget {
  final String message;
  const AlerteDejaRetire({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final (_, couleur) = couleursPastille(TonPastille.or, isDark);
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isDark
              ? AppColors.warning.withOpacity(0.15)
              : AppColors.warningLight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.warning.withOpacity(0.6)),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.warning_amber_rounded, size: 22, color: couleur),
          const SizedBox(width: 10),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Repas déjà retiré',
                  style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w800,
                      color: couleur)),
              const SizedBox(height: 2),
              Text(message.isEmpty ? 'Ce repas a déjà été remis.' : message,
                  style: TextStyle(
                      fontSize: 12.5,
                      height: 1.35,
                      fontWeight: FontWeight.w600,
                      color: couleur)),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Retrait que l'agent vient de valider : « Annuler » pendant 2 minutes
class CarteRetraitValide extends StatelessWidget {
  final RetraitComptoir retrait;
  final bool annulationEnCours;
  final VoidCallback onAnnuler;
  final VoidCallback onSuivant;

  const CarteRetraitValide({
    super.key,
    required this.retrait,
    this.annulationEnCours = false,
    required this.onAnnuler,
    required this.onSuivant,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF1F9D55), Color(0xFF3EC970)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Icon(Icons.check_circle_rounded, color: Colors.white, size: 40),
          const SizedBox(width: 12),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Retrait validé à ${retrait.heure}',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16.5,
                      fontWeight: FontWeight.w800)),
              Text(
                  [
                    retrait.userNom,
                    if (retrait.plats.isNotEmpty) retrait.plats.join(', '),
                  ].join(' · '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: Colors.white.withOpacity(0.9), fontSize: 12.5)),
            ]),
          ),
        ]),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(
            child: CompteARebours(
              fin: retrait.annulableParMoi ? retrait.annulableJusquA : null,
              builder: (context, maintenant) {
                final reste = retrait.resteAnnulation(maintenant);
                return OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: BorderSide(
                        color:
                            Colors.white.withOpacity(reste == null ? 0.3 : 1)),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                  onPressed:
                      reste == null || annulationEnCours ? null : onAnnuler,
                  icon: const Icon(Icons.undo_rounded, size: 18),
                  label: Text(
                      reste == null
                          ? 'Annulation fermée'
                          : 'Annuler · ${minutesSecondes(reste)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                );
              },
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: const Color(0xFF1F9D55),
                padding: const EdgeInsets.symmetric(vertical: 10),
              ),
              onPressed: onSuivant,
              icon: const Icon(Icons.qr_code_scanner_rounded, size: 18),
              label: const Text('Suivant',
                  maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
          ),
        ]),
      ]),
    );
  }
}

/// Derniers retraits du comptoir (toute l'équipe, agence choisie)
class DerniersRetraitsComptoir extends StatelessWidget {
  final ServiceComptoir service;
  final int? annulationEnCours;
  final void Function(RetraitComptoir) onAnnuler;
  final VoidCallback? onVoirListe;

  const DerniersRetraitsComptoir({
    super.key,
    required this.service,
    this.annulationEnCours,
    required this.onAnnuler,
    this.onVoirListe,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    return CartePresta(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        TitreCarte(
          'Derniers retraits',
          action: onVoirListe == null
              ? null
              : InkWell(
                  borderRadius: BorderRadius.circular(8),
                  onTap: onVoirListe,
                  child: Padding(
                    padding: const EdgeInsets.all(4),
                    child: Text('Liste du jour',
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: isDark
                                ? AppColors.accent
                                : AppColors.primaryLight)),
                  ),
                ),
        ),
        Text(
            'Vous avez validé ${service.mesRetraitsAujourdhui} retrait'
            '${service.mesRetraitsAujourdhui > 1 ? 's' : ''} aujourd\'hui',
            style: TextStyle(fontSize: 11.5, color: gris)),
        const SizedBox(height: 4),
        if (service.derniers.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text('Aucun repas servi pour le moment',
                style: TextStyle(fontSize: 12.5, color: gris)),
          ),
        for (final r in service.derniers)
          LigneRetraitComptoir(
            retrait: r,
            annulationEnCours: annulationEnCours == r.id,
            onAnnuler: () => onAnnuler(r),
          ),
      ]),
    );
  }
}

/// Avancement par plat
class PlatsDuService extends StatelessWidget {
  final List<PlatService> plats;
  const PlatsDuService({super.key, required this.plats});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    return CartePresta(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const TitreCarte('Par plat'),
        const SizedBox(height: 6),
        for (final p in plats)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(children: [
              VignettePlat(url: p.imageUrl, taille: 34, rayon: 8),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p.nom,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context)
                              .textTheme
                              .bodyLarge
                              ?.copyWith(
                                  fontSize: 12.5, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 4),
                      BarreService(servis: p.servies, commandes: p.commandees),
                    ]),
              ),
              const SizedBox(width: 10),
              Text('${p.servies}/${p.commandees}',
                  style: TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w700, color: gris)),
            ]),
          ),
      ]),
    );
  }
}
