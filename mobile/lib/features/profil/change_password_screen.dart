// lib/features/profil/change_password_screen.dart

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../core/api/api_client.dart';

class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});
  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _ancienCtrl = TextEditingController();
  final _nouveauCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();

  bool _showAncien = false;
  bool _showNouveau = false;
  bool _showConfirm = false;
  bool _loading = false;
  String? _erreur;
  bool _succes = false;

  // ── Critères de force du mot de passe ─────────────────────
  bool get _has8Chars => _nouveauCtrl.text.length >= 8;
  bool get _hasMajuscule => _nouveauCtrl.text.contains(RegExp(r'[A-Z]'));
  bool get _hasChiffre => _nouveauCtrl.text.contains(RegExp(r'[0-9]'));
  bool get _hasSpecial => _nouveauCtrl.text
      .contains(RegExp(r'[!@#\$%^&*(),.?":{}|<>_\-+=\[\]\\\/]'));
  bool get _motDePasseValide =>
      _has8Chars && _hasMajuscule && _hasChiffre && _hasSpecial;

  @override
  void dispose() {
    _ancienCtrl.dispose();
    _nouveauCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(title: const Text('Modifier le mot de passe')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // ── Bannière succès ───────────────────────────────
            if (_succes) _SuccesBanner(onDismiss: () => Navigator.pop(context)),

            // ── Illustration + titre ──────────────────────────
            Center(
                child: Container(
              width: 80,
              height: 80,
              margin: const EdgeInsets.only(bottom: 20),
              decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.08),
                borderRadius: BorderRadius.circular(24),
              ),
              child: const Icon(Icons.lock_outline_rounded,
                  color: AppColors.primary, size: 38),
            )),

            Text('Nouveau mot de passe',
                style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 4),
            Text('Choisissez un mot de passe sécurisé',
                style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 28),

            // ── Ancien mot de passe ───────────────────────────
            const _SectionLabel('Mot de passe actuel'),
            const SizedBox(height: 8),
            TextFormField(
              controller: _ancienCtrl,
              obscureText: !_showAncien,
              decoration: InputDecoration(
                hintText: 'Votre mot de passe actuel',
                prefixIcon: const Icon(Icons.lock_rounded,
                    color: AppColors.accent, size: 20),
                suffixIcon: IconButton(
                  icon: Icon(
                      _showAncien
                          ? Icons.visibility_off_rounded
                          : Icons.visibility_rounded,
                      size: 20,
                      color: AppColors.lightTextSecondary),
                  onPressed: () => setState(() => _showAncien = !_showAncien),
                ),
              ),
              validator: (v) {
                if (v == null || v.isEmpty) return 'Requis';
                return null;
              },
            ),

            const SizedBox(height: 20),

            // ── Nouveau mot de passe ──────────────────────────
            const _SectionLabel('Nouveau mot de passe'),
            const SizedBox(height: 8),
            TextFormField(
              controller: _nouveauCtrl,
              obscureText: !_showNouveau,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'Votre nouveau mot de passe',
                prefixIcon: const Icon(Icons.lock_reset_rounded,
                    color: AppColors.accent, size: 20),
                suffixIcon: IconButton(
                  icon: Icon(
                      _showNouveau
                          ? Icons.visibility_off_rounded
                          : Icons.visibility_rounded,
                      size: 20,
                      color: AppColors.lightTextSecondary),
                  onPressed: () => setState(() => _showNouveau = !_showNouveau),
                ),
              ),
              validator: (v) {
                if (v == null || v.isEmpty) return 'Requis';
                if (!_motDePasseValide) {
                  return 'Ne respecte pas les critères de sécurité';
                }
                return null;
              },
            ),

            // ── Indicateur de force ───────────────────────────
            if (_nouveauCtrl.text.isNotEmpty) ...[
              const SizedBox(height: 12),
              _IndicateurForce(
                has8Chars: _has8Chars,
                hasMajuscule: _hasMajuscule,
                hasChiffre: _hasChiffre,
                hasSpecial: _hasSpecial,
              ),
            ],

            const SizedBox(height: 20),

            // ── Confirmation ──────────────────────────────────
            const _SectionLabel('Confirmer le nouveau mot de passe'),
            const SizedBox(height: 8),
            TextFormField(
              controller: _confirmCtrl,
              obscureText: !_showConfirm,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'Répétez le nouveau mot de passe',
                prefixIcon: const Icon(Icons.check_circle_outline_rounded,
                    color: AppColors.accent, size: 20),
                suffixIcon: IconButton(
                  icon: Icon(
                      _showConfirm
                          ? Icons.visibility_off_rounded
                          : Icons.visibility_rounded,
                      size: 20,
                      color: AppColors.lightTextSecondary),
                  onPressed: () => setState(() => _showConfirm = !_showConfirm),
                ),
                // Indicateur de correspondance
                suffixIconColor: _confirmCtrl.text.isNotEmpty
                    ? (_confirmCtrl.text == _nouveauCtrl.text
                        ? AppColors.success
                        : AppColors.error)
                    : AppColors.lightTextSecondary,
              ),
              validator: (v) {
                if (v == null || v.isEmpty) return 'Requis';
                if (v != _nouveauCtrl.text) {
                  return 'Les mots de passe ne correspondent pas';
                }
                return null;
              },
            ),

            // ── Erreur API ────────────────────────────────────
            if (_erreur != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.errorLight,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.error.withOpacity(0.3)),
                ),
                child: Row(children: [
                  const Icon(Icons.error_outline_rounded,
                      color: AppColors.error, size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                      child: Text(_erreur!,
                          style: const TextStyle(
                              color: AppColors.error, fontSize: 13))),
                ]),
              ),
            ],

            const SizedBox(height: 32),

            // ── Bouton sauvegarder ────────────────────────────
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                icon: _loading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.save_rounded, size: 18),
                label: Text(
                    _loading ? 'Modification...' : 'Modifier le mot de passe'),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14)),
                ),
                onPressed: _loading ? null : _soumettre,
              ),
            ),

            const SizedBox(height: 40),
          ]),
        ),
      ),
    );
  }

  Future<void> _soumettre() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _loading = true;
      _erreur = null;
    });

    try {
      // Récupérer l'ID de l'user connecté
      final auth = context.read<AuthProvider>();
      final userId = auth.user?.id;
      if (userId == null) throw Exception('Utilisateur non connecté');

      // Vérifier d'abord l'ancien mot de passe via le token JWT
      // en tentant une connexion
      // ✅ Appel de l'endpoint existant dans Django
      await apiClient.patch(
        '/users/$userId/changer-mot-de-passe/',
        data: {
          'old_password': _ancienCtrl.text,
          'password': _nouveauCtrl.text,
        },
      );

      if (!mounted) return;
      setState(() {
        _loading = false;
        _succes = true;
      });

      // Vider les champs
      _ancienCtrl.clear();
      _nouveauCtrl.clear();
      _confirmCtrl.clear();

      // Snackbar succès
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: const Row(children: [
          Icon(Icons.check_circle_rounded, color: Colors.white),
          SizedBox(width: 8),
          Text('Mot de passe modifié avec succès !'),
        ]),
        backgroundColor: AppColors.success,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        margin: const EdgeInsets.all(12),
      ));

      // Retour après 1.5s
      await Future.delayed(const Duration(milliseconds: 1500));
      if (mounted) Navigator.pop(context);
    } catch (e) {
      final msg = e.toString();
      setState(() {
        _loading = false;
        _erreur = msg.contains('old_password') ||
                msg.contains('incorrect') ||
                msg.contains('400')
            ? 'Mot de passe actuel incorrect'
            : msg.contains('complexit') ||
                    msg.contains('majuscule') ||
                    msg.contains('chiffre')
                ? 'Le nouveau mot de passe ne respecte pas les critères de sécurité'
                : 'Erreur lors de la modification. Réessayez.';
      });
    }
  }
}

// ══════════════════════════════════════════════════════════════
// INDICATEUR DE FORCE DU MOT DE PASSE
// ══════════════════════════════════════════════════════════════

class _IndicateurForce extends StatelessWidget {
  final bool has8Chars;
  final bool hasMajuscule;
  final bool hasChiffre;
  final bool hasSpecial;

  const _IndicateurForce({
    required this.has8Chars,
    required this.hasMajuscule,
    required this.hasChiffre,
    required this.hasSpecial,
  });

  int get _score =>
      (has8Chars ? 1 : 0) +
      (hasMajuscule ? 1 : 0) +
      (hasChiffre ? 1 : 0) +
      (hasSpecial ? 1 : 0);

  Color get _couleurForce {
    if (_score <= 1) return AppColors.error;
    if (_score == 2) return AppColors.warning;
    if (_score == 3) return const Color(0xFF90EE90);
    return AppColors.success;
  }

  String get _labelForce {
    if (_score <= 1) return 'Faible';
    if (_score == 2) return 'Moyen';
    if (_score == 3) return 'Fort';
    return 'Très fort';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightBackground,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Barre de force
        Row(children: [
          Expanded(
              child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: _score / 4,
              backgroundColor:
                  isDark ? AppColors.darkBorder : AppColors.lightBorder,
              valueColor: AlwaysStoppedAnimation<Color>(_couleurForce),
              minHeight: 6,
            ),
          )),
          const SizedBox(width: 10),
          Text(_labelForce,
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: _couleurForce)),
        ]),

        const SizedBox(height: 12),

        // Critères
        Wrap(spacing: 12, runSpacing: 8, children: [
          _Critere('8 car. min', has8Chars),
          _Critere('1 majuscule', hasMajuscule),
          _Critere('1 chiffre', hasChiffre),
          _Critere('1 caractère spécial', hasSpecial),
        ]),
      ]),
    );
  }
}

class _Critere extends StatelessWidget {
  final String label;
  final bool valide;
  const _Critere(this.label, this.valide);

  @override
  Widget build(BuildContext context) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(
        valide
            ? Icons.check_circle_rounded
            : Icons.radio_button_unchecked_rounded,
        size: 14,
        color: valide ? AppColors.success : AppColors.lightTextSecondary,
      ),
      const SizedBox(width: 4),
      Text(label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: valide ? FontWeight.w600 : FontWeight.w400,
            color: valide ? AppColors.success : AppColors.lightTextSecondary,
          )),
    ]);
  }
}

// ── Bannière succès ────────────────────────────────────────────

class _SuccesBanner extends StatelessWidget {
  final VoidCallback onDismiss;
  const _SuccesBanner({required this.onDismiss});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.successLight,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.success.withOpacity(0.4)),
      ),
      child: Row(children: [
        const Icon(Icons.check_circle_rounded,
            color: AppColors.success, size: 22),
        const SizedBox(width: 10),
        const Expanded(
            child: Text('Mot de passe modifié avec succès !',
                style: TextStyle(
                    color: AppColors.success,
                    fontWeight: FontWeight.w600,
                    fontSize: 13))),
        GestureDetector(
            onTap: onDismiss,
            child: const Icon(Icons.close_rounded,
                color: AppColors.success, size: 18)),
      ]),
    );
  }
}

// ── Label de section ───────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) => Text(text,
      style: Theme.of(context)
          .textTheme
          .labelLarge
          ?.copyWith(color: AppColors.lightTextSecondary));
}
