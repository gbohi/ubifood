// lib/features/contestation/retrait_detail_screen.dart
//
// « Retrait du 17/11 » : détail du retrait d'un repas (heure, comptoir,
// validé par, mode) et « Je n'ai pas retiré ce repas » (contestation,
// envoyée au gestionnaire UbiPharm), avec le suivi de la contestation.
// Ouvert depuis la notification « Retrait validé » ou la fiche d'une
// commande retirée.

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../core/services/prestataire_service.dart';
import '../../core/widgets/common_widgets.dart';
import '../../shared/models/prestataire_models.dart';
import '../../shared/providers/app_provider.dart';
import '../../shared/providers/prestataire_provider.dart';
import '../../shared/theme/app_theme.dart';

String _jj(DateTime? d) => d == null ? '' : DateFormat('dd/MM').format(d);

class RetraitDetailScreen extends StatefulWidget {
  final int commandeId;

  /// Ouvre directement le formulaire (action « Je n'ai pas retiré ce repas »
  /// de la notification) si le retrait peut être contesté
  final bool ouvrirFormulaire;
  final ContestationService? service;

  const RetraitDetailScreen({
    super.key,
    required this.commandeId,
    this.ouvrirFormulaire = false,
    this.service,
  });

  @override
  State<RetraitDetailScreen> createState() => _RetraitDetailScreenState();
}

class _RetraitDetailScreenState extends State<RetraitDetailScreen> {
  DetailRetraitCommande? _detail;
  String? _erreur;
  bool _enCours = true;
  bool _formulaireOuvert = false;

  ContestationService get _service => widget.service ?? contestationService;

  @override
  void initState() {
    super.initState();
    _charger();
  }

  Future<void> _charger() async {
    setState(() {
      _enCours = true;
      _erreur = null;
    });
    try {
      final d = await _service.detailRetrait(widget.commandeId);
      if (!mounted) return;
      setState(() {
        _detail = d;
        _enCours = false;
      });
      if (d.contestation != null) {
        context
            .read<ContestationProvider?>()
            ?.enregistrer(widget.commandeId, d.contestation!);
      }
      if (widget.ouvrirFormulaire && !_formulaireOuvert && d.contestable) {
        _formulaireOuvert = true;
        WidgetsBinding.instance.addPostFrameCallback((_) => _contester());
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _erreur = messageErreurApi(e) ?? 'Impossible de charger ce retrait';
        _enCours = false;
      });
    }
  }

  Future<void> _contester() async {
    final d = _detail;
    if (d == null || !mounted) return;
    final c = await FormulaireContestation.afficher(
      context,
      detail: d,
      envoyer: (motif, commentaire) => _service.contester(
          commandeId: widget.commandeId,
          motif: motif,
          commentaire: commentaire),
    );
    if (c == null || !mounted) return;
    context.read<ContestationProvider?>()?.enregistrer(widget.commandeId, c);
    await showDialog<void>(
      context: context,
      builder: (dCtx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        icon: const Icon(Icons.mark_email_read_outlined,
            color: AppColors.accentDark, size: 40),
        title: const Text('Contestation envoyée'),
        content: const Text(
            'Le gestionnaire cantine UbiPharm est alerté. Vous recevrez une '
            'notification avec sa décision. Si elle est acceptée, le repas '
            'ne vous est pas facturé.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dCtx), child: const Text('OK')),
        ],
      ),
    );
    if (mounted) _charger();
  }

  @override
  Widget build(BuildContext context) {
    final d = _detail;
    final user = context.watch<AuthProvider?>()?.user;
    final enTete = EnTeteMarine(
      titre: d?.dateMenu == null ? 'Retrait' : 'Retrait du ${_jj(d!.dateMenu)}',
      sousTitre: [
        if ((user?.fullName ?? '').isNotEmpty) user!.fullName,
        if ((d?.agence ?? '').isNotEmpty) d!.agence,
      ].join(' · '),
    );

    Widget corps;
    if (d == null && _enCours) {
      corps = ListView(padding: const EdgeInsets.all(14), children: const [
        ShimmerCard(height: 220),
      ]);
    } else if (d == null) {
      corps = ListView(padding: const EdgeInsets.all(14), children: [
        BandeauInfo(
          icone: Icons.error_outline_rounded,
          ton: TonPastille.rouge,
          texte: _erreur ?? 'Retrait introuvable',
          action:
              TextButton(onPressed: _charger, child: const Text('Réessayer')),
        ),
      ]);
    } else {
      corps = RefreshIndicator(
        onRefresh: _charger,
        child: DetailRetraitCorps(detail: d, onContester: _contester),
      );
    }
    return Scaffold(body: Column(children: [enTete, Expanded(child: corps)]));
  }
}

/// Corps de l'écran (séparé pour les tests)
class DetailRetraitCorps extends StatelessWidget {
  final DetailRetraitCommande detail;
  final VoidCallback? onContester;
  const DetailRetraitCorps({super.key, required this.detail, this.onContester});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final r = detail.retrait;
    final c = detail.contestation;
    final pastille = detail.statut == 'retiree'
        ? const PastilleStatut(
            label: 'Retrait validé',
            icone: Icons.check_rounded,
            ton: TonPastille.vert)
        : c?.statut == StatutContestation.acceptee
            ? const PastilleStatut(
                label: 'Retrait annulé',
                icone: Icons.undo_rounded,
                ton: TonPastille.gris)
            : const PastilleStatut(label: 'Non retiré', ton: TonPastille.gris);

    Widget ligne(String libelle, String valeur) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(libelle, style: TextStyle(fontSize: 12.5, color: gris)),
            const SizedBox(width: 12),
            Expanded(
              child: Text(valeur,
                  textAlign: TextAlign.right,
                  style: Theme.of(context)
                      .textTheme
                      .bodyLarge
                      ?.copyWith(fontSize: 13, fontWeight: FontWeight.w700)),
            ),
          ]),
        );

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 40),
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkCard : AppColors.lightCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
          ),
          child: Column(children: [
            Row(children: [
              const VignettePlat(url: null, taille: 52, rayon: 12),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(detail.plat,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(
                                  fontSize: 16, fontWeight: FontWeight.w800)),
                      Text('Commande n° ${detail.commandeId}',
                          style: TextStyle(fontSize: 11.5, color: gris)),
                      const SizedBox(height: 4),
                      pastille,
                    ]),
              ),
            ]),
            const SizedBox(height: 8),
            Divider(
                height: 1,
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
            if (r != null) ...[
              ligne('Heure', r.heure),
              ligne('Comptoir', r.comptoir),
              ligne(
                  'Validé par',
                  r.valideParNom == null
                      ? 'Non renseigné'
                      : [
                          r.valideParNom!,
                          if (r.valideParPrestataire != null)
                            '(${r.valideParPrestataire})',
                        ].join(' ')),
              if (r.modeLibelle != null) ligne('Mode', r.modeLibelle!),
            ] else
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Text(
                    c?.statut == StatutContestation.acceptee
                        ? 'Le retrait a été annulé suite à votre contestation.'
                        : 'Aucun retrait enregistré pour ce repas.',
                    style: TextStyle(fontSize: 12.5, color: gris)),
              ),
          ]),
        ),
        if (c != null) ...[
          const SizedBox(height: 12),
          CarteContestation(contestation: c),
        ],
        if (detail.contestable && c == null) ...[
          const SizedBox(height: 16),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor:
                  isDark ? const Color(0xFFFF8A73) : const Color(0xFFD0452C),
              side: BorderSide(
                  color: isDark
                      ? const Color(0xFFFF8A73)
                      : const Color(0xFFD0452C)),
              padding: const EdgeInsets.symmetric(vertical: 13),
              textStyle:
                  const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
            ),
            onPressed: onContester,
            icon: const Icon(Icons.error_outline_rounded, size: 20),
            label: const Text("Je n'ai pas retiré ce repas"),
          ),
          const SizedBox(height: 8),
          Text(
              'Ce n\'est pas vous ? Signalez-le'
              '${detail.contestableJusquAu == null ? '' : ' jusqu\'au ${_jj(detail.contestableJusquAu)}'}'
              ' : le gestionnaire cantine est alerté immédiatement.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11.5, color: gris)),
        ] else if (c == null && detail.raisonNonContestable != null) ...[
          const SizedBox(height: 12),
          BandeauInfo(
              icone: Icons.info_outline_rounded,
              ton: TonPastille.gris,
              texte: detail.raisonNonContestable!),
        ],
      ],
    );
  }
}

/// Suivi d'une contestation (ouverte / acceptée / rejetée + commentaires)
class CarteContestation extends StatelessWidget {
  final ContestationRetrait contestation;
  const CarteContestation({super.key, required this.contestation});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final c = contestation;
    final (ton, icone) = switch (c.statut) {
      StatutContestation.ouverte => (
          TonPastille.or,
          Icons.hourglass_top_rounded
        ),
      StatutContestation.acceptee => (TonPastille.vert, Icons.check_rounded),
      StatutContestation.rejetee => (TonPastille.rouge, Icons.close_rounded),
    };
    final envoyeeLe = c.createdAt == null
        ? null
        : DateFormat("dd/MM 'à' HH:mm").format(c.createdAt!.toLocal());
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text('Votre contestation',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700)),
          ),
          PastilleStatut(label: c.statut.label, icone: icone, ton: ton),
        ]),
        const SizedBox(height: 6),
        if (c.motifLibelle.isNotEmpty)
          Text(c.motifLibelle,
              style: Theme.of(context)
                  .textTheme
                  .bodyLarge
                  ?.copyWith(fontSize: 13, fontWeight: FontWeight.w600)),
        if (c.commentaire.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text('« ${c.commentaire} »',
                style: TextStyle(fontSize: 12.5, height: 1.35, color: gris)),
          ),
        if (envoyeeLe != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text('Envoyée le $envoyeeLe',
                style: TextStyle(fontSize: 11, color: gris)),
          ),
        if (c.statut == StatutContestation.ouverte) ...[
          const SizedBox(height: 10),
          const BandeauInfo(
              icone: Icons.hourglass_top_rounded,
              ton: TonPastille.or,
              texte: 'Le gestionnaire cantine examine votre contestation.'),
        ] else ...[
          const SizedBox(height: 10),
          BandeauInfo(
            icone: c.statut == StatutContestation.acceptee
                ? Icons.check_circle_outline_rounded
                : Icons.cancel_outlined,
            ton: ton,
            texte: [
              c.statut == StatutContestation.acceptee
                  ? 'Acceptée : le retrait est annulé, le repas ne vous est pas facturé.'
                  : 'Rejetée : le repas reste retiré.',
              if (c.commentaireTraitement.isNotEmpty)
                'Réponse : ${c.commentaireTraitement}',
            ].join('\n'),
          ),
        ],
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// FORMULAIRE « JE N'AI PAS RETIRÉ CE REPAS »
// ══════════════════════════════════════════════════════════════

class FormulaireContestation extends StatefulWidget {
  final DetailRetraitCommande detail;
  final Future<ContestationRetrait> Function(String motif, String commentaire)
      envoyer;

  const FormulaireContestation(
      {super.key, required this.detail, required this.envoyer});

  /// Feuille du formulaire ; renvoie la contestation envoyée (null : fermée)
  static Future<ContestationRetrait?> afficher(
    BuildContext context, {
    required DetailRetraitCommande detail,
    required Future<ContestationRetrait> Function(String, String) envoyer,
  }) =>
      showModalBottomSheet<ContestationRetrait>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (_) => Padding(
          padding:
              EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
          child: FormulaireContestation(detail: detail, envoyer: envoyer),
        ),
      );

  @override
  State<FormulaireContestation> createState() => _FormulaireContestationState();
}

class _FormulaireContestationState extends State<FormulaireContestation> {
  String? _motif;
  final _commentaire = TextEditingController();
  String? _erreur;
  bool _envoi = false;

  @override
  void dispose() {
    _commentaire.dispose();
    super.dispose();
  }

  Future<void> _envoyer() async {
    final erreur = verifierContestation(_motif, _commentaire.text);
    if (erreur != null) {
      setState(() => _erreur = erreur);
      return;
    }
    setState(() {
      _envoi = true;
      _erreur = null;
    });
    try {
      final c = await widget.envoyer(_motif!, _commentaire.text.trim());
      if (!mounted) return;
      Navigator.of(context).pop(c);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _envoi = false;
        _erreur = messageErreurApi(e) ?? "L'envoi a échoué. Réessayez.";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final rouge = isDark ? const Color(0xFFFF8A73) : const Color(0xFFD0452C);
    final limite = widget.detail.contestableJusquAu;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text("Je n'ai pas retiré ce repas",
            style: Theme.of(context)
                .textTheme
                .titleLarge
                ?.copyWith(fontSize: 18, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        Text(
            'Le gestionnaire cantine UbiPharm est alerté immédiatement. Si la '
            "contestation est acceptée, le repas ne vous est pas facturé.",
            style: TextStyle(fontSize: 12, height: 1.35, color: gris)),
        const SizedBox(height: 14),
        for (final m in widget.detail.motifs)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Material(
              color: _motif == m.valeur
                  ? rouge.withOpacity(isDark ? 0.12 : 0.06)
                  : Colors.transparent,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(
                    color: _motif == m.valeur
                        ? rouge
                        : (isDark
                            ? AppColors.darkBorder
                            : AppColors.lightBorder),
                    width: _motif == m.valeur ? 1.5 : 1),
              ),
              child: RadioListTile<String>(
                value: m.valeur,
                groupValue: _motif,
                activeColor: rouge,
                dense: true,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                title: Text(m.libelle,
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w600)),
                onChanged: _envoi
                    ? null
                    : (v) => setState(() {
                          _motif = v;
                          _erreur = null;
                        }),
              ),
            ),
          ),
        const SizedBox(height: 4),
        TextField(
          controller: _commentaire,
          minLines: 3,
          maxLines: 5,
          maxLength: 1000,
          enabled: !_envoi,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(
            hintText: _motif == 'autre'
                ? 'Expliquez la situation (obligatoire)'
                : 'Commentaire (facultatif) : où étiez-vous, que s\'est-il passé ?',
            counterText: '',
          ),
          onChanged: (_) {
            if (_erreur != null) setState(() => _erreur = null);
          },
        ),
        if (_erreur != null) ...[
          const SizedBox(height: 8),
          BandeauInfo(
              icone: Icons.error_outline_rounded,
              ton: TonPastille.rouge,
              texte: _erreur!),
        ],
        const SizedBox(height: 12),
        SizedBox(
          height: 48,
          child: ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFD0452C),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)),
            ),
            onPressed: _envoi ? null : _envoyer,
            icon: _envoi
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.send_rounded, size: 18),
            label: const Text('Envoyer la contestation',
                style: TextStyle(fontWeight: FontWeight.w700)),
          ),
        ),
        const SizedBox(height: 8),
        Text(
            limite == null
                ? 'Possible jusqu\'à la clôture du mois'
                : 'Possible jusqu\'au ${_jj(limite)}, avant la clôture du mois',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11.5, color: gris)),
      ]),
    );
  }
}
