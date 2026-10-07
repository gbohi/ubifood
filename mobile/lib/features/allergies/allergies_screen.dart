// lib/features/allergies/allergies_screen.dart

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/models/models.dart';
import '../../shared/providers/app_provider.dart';
import '../../core/widgets/common_widgets.dart';

class AllergiesScreen extends StatefulWidget {
  const AllergiesScreen({super.key});
  @override
  State<AllergiesScreen> createState() => _AllergiesScreenState();
}

class _AllergiesScreenState extends State<AllergiesScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AllergieProvider>().loadAllergies();
    });
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
        title: const Text('Mes allergies'),
        toolbarHeight: canPop ? kToolbarHeight : 0,
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.accent,
        foregroundColor: AppColors.primary,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Ajouter',
            style: TextStyle(fontWeight: FontWeight.w700)),
        onPressed: () => _showDialog(context),
      ),
      body: Consumer<AllergieProvider>(builder: (_, prov, __) {
        if (prov.loading) {
          return ListView(
              padding: const EdgeInsets.all(16),
              children: List.generate(4, (_) => const ShimmerCard(height: 64)));
        }

        if (prov.allergies.isEmpty) {
          return EmptyState(
            icon: Icons.check_circle_outline_rounded,
            title: 'Aucune allergie enregistrée',
            subtitle:
                'Ajoutez vos allergies alimentaires pour que\nla cantine en tienne compte.',
            action: AppButton(
              label: 'Ajouter une allergie',
              icon: Icons.add_rounded,
              width: 220,
              onPressed: () => _showDialog(context),
            ),
          );
        }

        return Column(children: [
          // ── Bannière info ─────────────────────────────────
          Container(
            margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.warning.withOpacity(0.08),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.warning.withOpacity(0.3)),
            ),
            child: Row(children: [
              const Icon(Icons.info_outline_rounded,
                  color: AppColors.warning, size: 18),
              const SizedBox(width: 10),
              Expanded(
                  child: Text(
                '${prov.allergies.length} allergie(s) enregistrée(s). '
                'Ces informations sont transmises à la cantine.',
                style: const TextStyle(fontSize: 12, color: AppColors.warning),
              )),
            ]),
          ),

          // ── Liste allergies ───────────────────────────────
          Expanded(
              child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: prov.allergies.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, i) {
              final a = prov.allergies[i];
              return _AllergieCard(
                allergie: a,
                onEdit: () => _showDialog(context, allergie: a),
                onDelete: () => _confirmerSuppression(context, prov, a),
              );
            },
          )),
        ]);
      }),
    );
  }

  // ── Dialog ajouter / modifier ──────────────────────────────
  void _showDialog(BuildContext context, {AllergieModel? allergie}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AllergieSheet(allergie: allergie),
    );
  }

  // ── Confirmation suppression ───────────────────────────────
  void _confirmerSuppression(
      BuildContext context, AllergieProvider prov, AllergieModel a) {
    showDialog(
        context: context,
        builder: (_) => AlertDialog(
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16)),
              title: const Row(children: [
                Icon(Icons.warning_amber_rounded, color: AppColors.error),
                SizedBox(width: 8),
                Text('Supprimer ?'),
              ]),
              content: Text(
                'Voulez-vous supprimer l\'allergie\n"${a.libelle}" ?',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Annuler'),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.error,
                    foregroundColor: Colors.white,
                  ),
                  onPressed: () async {
                    Navigator.pop(context);
                    final ok = await prov.supprimer(a.id!);
                    if (ok && context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                        content: Text('"${a.libelle}" supprimée'),
                        backgroundColor: AppColors.success,
                        behavior: SnackBarBehavior.floating,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10)),
                        margin: const EdgeInsets.all(12),
                      ));
                    }
                  },
                  child: const Text('Supprimer'),
                ),
              ],
            ));
  }
}

// ══════════════════════════════════════════════════════════════
// CARTE ALLERGIE
// ══════════════════════════════════════════════════════════════

class _AllergieCard extends StatelessWidget {
  final AllergieModel allergie;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _AllergieCard({
    required this.allergie,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(isDark ? 0.15 : 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          )
        ],
      ),
      child: Row(children: [
        // Icône
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: AppColors.error.withOpacity(0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Icon(Icons.warning_amber_rounded,
              color: AppColors.error, size: 22),
        ),
        const SizedBox(width: 14),
        // Libellé
        Expanded(
            child: Text(
          allergie.libelle,
          style: Theme.of(context).textTheme.titleMedium,
        )),
        // Bouton modifier
        IconButton(
          icon: const Icon(Icons.edit_outlined, size: 20),
          color: AppColors.primary,
          tooltip: 'Modifier',
          onPressed: onEdit,
        ),
        // Bouton supprimer
        IconButton(
          icon: const Icon(Icons.delete_outline_rounded, size: 20),
          color: AppColors.error,
          tooltip: 'Supprimer',
          onPressed: onDelete,
        ),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// BOTTOM SHEET — Ajouter / Modifier
// ══════════════════════════════════════════════════════════════

class _AllergieSheet extends StatefulWidget {
  final AllergieModel? allergie; // null = ajout, non null = modification
  const _AllergieSheet({this.allergie});
  @override
  State<_AllergieSheet> createState() => _AllergieSheetState();
}

class _AllergieSheetState extends State<_AllergieSheet> {
  late TextEditingController _ctrl;
  final _formKey = GlobalKey<FormState>();

  bool get _isEdit => widget.allergie != null;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.allergie?.libelle ?? '');
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final padding = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      padding: EdgeInsets.fromLTRB(24, 20, 24, 24 + padding),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightSurface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        // Handle
        Center(
            child: Container(
          width: 36,
          height: 4,
          decoration: BoxDecoration(
              color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
              borderRadius: BorderRadius.circular(2)),
        )),
        const SizedBox(height: 20),

        // Titre
        Row(children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.error.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.warning_amber_rounded,
                color: AppColors.error, size: 20),
          ),
          const SizedBox(width: 12),
          Text(
            _isEdit ? 'Modifier l\'allergie' : 'Ajouter une allergie',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
        ]),
        const SizedBox(height: 20),

        // Champ libellé
        Form(
          key: _formKey,
          child: TextFormField(
            controller: _ctrl,
            autofocus: true,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: 'Nom de l\'allergie',
              hintText: 'Ex: Arachides, Lactose, Gluten...',
              prefixIcon: const Icon(Icons.label_outline_rounded,
                  color: AppColors.accent),
            ),
            validator: (v) {
              if (v == null || v.trim().isEmpty) return 'Requis';
              if (v.trim().length < 2) return 'Au moins 2 caractères';
              return null;
            },
          ),
        ),
        const SizedBox(height: 24),

        // Boutons
        Consumer<AllergieProvider>(
          builder: (_, prov, __) => Row(children: [
            Expanded(
                child: OutlinedButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Annuler'),
            )),
            const SizedBox(width: 12),
            Expanded(
                child: ElevatedButton.icon(
              icon: Icon(_isEdit ? Icons.check_rounded : Icons.add_rounded,
                  size: 18),
              label: Text(_isEdit ? 'Enregistrer' : 'Ajouter'),
              onPressed: prov.submitting ? null : () => _sauvegarder(prov),
            )),
          ]),
        ),
      ]),
    );
  }

  Future<void> _sauvegarder(AllergieProvider prov) async {
    if (!_formKey.currentState!.validate()) return;
    final libelle = _ctrl.text.trim();
    bool ok;
    if (_isEdit) {
      ok = await prov.modifier(widget.allergie!.id!, libelle);
    } else {
      ok = await prov.ajouter(libelle);
    }
    if (ok && mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(_isEdit
            ? '"$libelle" modifiée avec succès'
            : '"$libelle" ajoutée avec succès'),
        backgroundColor: AppColors.success,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        margin: const EdgeInsets.all(12),
      ));
    } else if (!ok && mounted && prov.error != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(prov.error!),
        backgroundColor: AppColors.error,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        margin: const EdgeInsets.all(12),
      ));
    }
  }
}
