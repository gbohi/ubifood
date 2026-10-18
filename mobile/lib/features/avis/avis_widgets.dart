// lib/features/avis/avis_widgets.dart
//
// Avis sur les repas retirés : étoiles d'affichage et feuille « Votre avis ».

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../shared/models/models.dart';

const kCouleurEtoile = Color(0xFFFFB300);

/// « 4,2 » (virgule décimale à la française)
String formatNoteMoyenne(double note) =>
    note.toStringAsFixed(1).replaceAll('.', ',');

// ══════════════════════════════════════════════════════════════
// ÉTOILES (affichage seul)
// ══════════════════════════════════════════════════════════════

class EtoilesNote extends StatelessWidget {
  final int note;
  final double size;
  final Color? color;
  final Color? emptyColor;

  const EtoilesNote({
    super.key,
    required this.note,
    this.size = 16,
    this.color,
    this.emptyColor,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final plein = color ?? kCouleurEtoile;
    final vide = emptyColor ??
        (isDark ? AppColors.darkTextHint : AppColors.lightTextHint);
    return Semantics(
      label: 'Note : $note sur 5',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: List.generate(
          5,
          (i) => Icon(
            i < note ? Icons.star_rounded : Icons.star_outline_rounded,
            size: size,
            color: i < note ? plein : vide,
          ),
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// FEUILLE « VOTRE AVIS »
// ══════════════════════════════════════════════════════════════

/// Ouvre la feuille de notation d'une commande retirée.
/// Retourne true si l'avis a été enregistré.
Future<bool> showAvisSheet(BuildContext context, Commande commande) async {
  // Capturé avant l'await : l'appelant peut disparaître entre-temps
  final messenger = ScaffoldMessenger.of(context);
  final ok = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _AvisSheet(commande: commande),
  );
  if (ok == true) {
    messenger.showSnackBar(SnackBar(
      content: const Row(children: [
        Icon(Icons.check_circle_rounded, color: Colors.white),
        SizedBox(width: 8),
        Expanded(child: Text('Merci pour votre avis !')),
      ]),
      backgroundColor: AppColors.success,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      margin: const EdgeInsets.all(12),
    ));
  }
  return ok == true;
}

class _AvisSheet extends StatefulWidget {
  final Commande commande;
  const _AvisSheet({required this.commande});

  @override
  State<_AvisSheet> createState() => _AvisSheetState();
}

class _AvisSheetState extends State<_AvisSheet> {
  static const _libelles = [
    'Touchez une étoile pour noter',
    'Décevant',
    'Moyen',
    'Correct',
    'Bon',
    'Excellent !',
  ];

  late int _note = widget.commande.avis?.note ?? 0;
  late final _commentaire =
      TextEditingController(text: widget.commande.avis?.commentaire ?? '');
  bool _envoi = false;
  String? _erreur;

  bool get _modification => widget.commande.avis != null;

  @override
  void dispose() {
    _commentaire.dispose();
    super.dispose();
  }

  Future<void> _envoyer() async {
    if (_note == 0 || _envoi) return;
    setState(() {
      _envoi = true;
      _erreur = null;
    });
    final cmdProv = context.read<CommandeProvider>();
    final navigator = Navigator.of(context);
    final ok = await cmdProv.noter(
        widget.commande, _note, _commentaire.text.trim());
    if (!mounted) return;
    if (ok) {
      navigator.pop(true);
    } else {
      setState(() {
        _envoi = false;
        _erreur = cmdProv.error ?? 'Impossible d\'enregistrer votre avis';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final secColor =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final plat = widget.commande.platDetail;

    return Padding(
      // Le clavier ne doit pas masquer le champ ni le bouton
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: BoxDecoration(
          color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
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
                const SizedBox(height: 16),
                Text('Votre avis',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w800)),
                if (plat != null) ...[
                  const SizedBox(height: 4),
                  Text(plat.nom,
                      style: Theme.of(context)
                          .textTheme
                          .bodyMedium
                          ?.copyWith(color: secColor),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis),
                ],
                const SizedBox(height: 18),

                // ── Étoiles (obligatoire) ──────────────────────
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(5, (i) {
                    final active = i < _note;
                    return IconButton(
                      tooltip: '${i + 1} étoile${i == 0 ? '' : 's'}',
                      iconSize: 40,
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      constraints: const BoxConstraints(),
                      onPressed:
                          _envoi ? null : () => setState(() => _note = i + 1),
                      icon: Icon(
                        active
                            ? Icons.star_rounded
                            : Icons.star_outline_rounded,
                        color: active
                            ? kCouleurEtoile
                            : (isDark
                                ? AppColors.darkTextHint
                                : AppColors.lightTextHint),
                      ),
                    );
                  }),
                ),
                const SizedBox(height: 6),
                Text(_libelles[_note],
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: _note == 0 ? secColor : kCouleurEtoile)),
                const SizedBox(height: 18),

                // ── Commentaire (facultatif) ──────────────────
                TextField(
                  controller: _commentaire,
                  enabled: !_envoi,
                  maxLength: 500,
                  minLines: 3,
                  maxLines: 5,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    labelText: 'Commentaire (facultatif)',
                    hintText: 'Qu\'avez-vous pensé de ce repas ?',
                    alignLabelWithHint: true,
                  ),
                ),

                if (_erreur != null) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.errorLight,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(children: [
                      const Icon(Icons.error_outline_rounded,
                          color: AppColors.error, size: 16),
                      const SizedBox(width: 6),
                      Expanded(
                          child: Text(_erreur!,
                              style: const TextStyle(
                                  fontSize: 12, color: AppColors.error))),
                    ]),
                  ),
                ],
                const SizedBox(height: 14),

                SizedBox(
                  height: 50,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.accent,
                      foregroundColor: AppColors.primary,
                      disabledBackgroundColor:
                          AppColors.accent.withOpacity(0.35),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                      textStyle: const TextStyle(
                          fontSize: 15, fontWeight: FontWeight.w700),
                      elevation: 0,
                    ),
                    onPressed: _note == 0 || _envoi ? null : _envoyer,
                    icon: _envoi
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: AppColors.primary),
                          )
                        : const Icon(Icons.send_rounded, size: 18),
                    label: Text(_modification ? 'Mettre à jour' : 'Envoyer'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// BLOC « NOTER CE REPAS » / « MON AVIS » (cartes claires)
// ══════════════════════════════════════════════════════════════

/// Sur un repas retiré : bouton « Noter ce repas », ou la note donnée
/// avec « Modifier mon avis ».
class AvisCommandeBloc extends StatelessWidget {
  final Commande commande;

  /// Appelé après l'enregistrement de l'avis
  final VoidCallback? onSaved;
  const AvisCommandeBloc({super.key, required this.commande, this.onSaved});

  Future<void> _noter(BuildContext context) async {
    final ok = await showAvisSheet(context, commande);
    if (ok) onSaved?.call();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final avis = commande.avis;
    if (avis == null) {
      return SizedBox(
        width: double.infinity,
        child: OutlinedButton.icon(
          icon: const Icon(Icons.star_outline_rounded, size: 18),
          label: const Text('Noter ce repas'),
          style: OutlinedButton.styleFrom(
            foregroundColor: isDark ? AppColors.accent : AppColors.primary,
            side: BorderSide(
                color: isDark ? AppColors.accent : AppColors.primary),
            padding: const EdgeInsets.symmetric(vertical: 12),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          onPressed: () => _noter(context),
        ),
      );
    }
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
      decoration: BoxDecoration(
        color: kCouleurEtoile.withOpacity(isDark ? 0.12 : 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: kCouleurEtoile.withOpacity(0.3)),
      ),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Mon avis', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 2),
            EtoilesNote(note: avis.note, size: 18),
            if (avis.commentaire.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text('« ${avis.commentaire} »',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(fontStyle: FontStyle.italic)),
            ],
          ]),
        ),
        TextButton(
          onPressed: () => _noter(context),
          child: const Text('Modifier mon avis'),
        ),
      ]),
    );
  }
}
