// lib/features/auth/forgot_password_screen.dart

import 'package:flutter/material.dart';
import '../../shared/theme/app_theme.dart';
import '../../core/api/api_client.dart';
import '../../core/widgets/common_widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});
  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen>
    with SingleTickerProviderStateMixin {
  // ── Étapes ────────────────────────────────────────────────
  int _etape = 1; // 1=username | 2=code SMS | 3=nouveau mdp

  // ── Controllers ───────────────────────────────────────────
  final _usernameCtrl = TextEditingController();
  final _codeCtrl = TextEditingController();
  final _nouveauCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();

  // ── State ─────────────────────────────────────────────────
  bool _loading = false;
  String? _erreur;
  String? _contactMasque;
  String? _resetToken;
  String? _username;

  bool _showNouveau = false;
  bool _showConfirm = false;

  // ── Animation ─────────────────────────────────────────────
  late AnimationController _animCtrl;
  late Animation<Offset> _slideAnim;
  late Animation<double> _fadeAnim;

  @override
  void initState() {
    super.initState();
    _animCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 350));
    _slideAnim = Tween<Offset>(
      begin: const Offset(0.3, 0),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _animCtrl, curve: Curves.easeOut));
    _fadeAnim = CurvedAnimation(parent: _animCtrl, curve: Curves.easeOut);
    _animCtrl.forward();
  }

  @override
  void dispose() {
    _animCtrl.dispose();
    _usernameCtrl.dispose();
    _codeCtrl.dispose();
    _nouveauCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  void _allerEtape(int etape) {
    setState(() {
      _etape = etape;
      _erreur = null;
    });
    _animCtrl.forward(from: 0);
  }

  // ── Critères mot de passe ─────────────────────────────────
  bool get _has8Chars => _nouveauCtrl.text.length >= 8;
  bool get _hasMaj => _nouveauCtrl.text.contains(RegExp(r'[A-Z]'));
  bool get _hasChiffre => _nouveauCtrl.text.contains(RegExp(r'[0-9]'));
  bool get _hasSpecial => _nouveauCtrl.text
      .contains(RegExp(r'[!@#\$%^&*(),.?":{}|<>_\-+=\[\]\\\/]'));
  bool get _mdpValide => _has8Chars && _hasMaj && _hasChiffre && _hasSpecial;

  // ── Étape 1 : Vérifier username ───────────────────────────
  Future<void> _verifierUsername() async {
    final username = _usernameCtrl.text.trim();
    if (username.isEmpty) {
      setState(() => _erreur = 'Veuillez saisir votre identifiant');
      return;
    }
    setState(() {
      _loading = true;
      _erreur = null;
    });
    try {
      final res = await apiClient.postPublic(
        '/users/forgot-password/',
        data: {'username': username},
      );
      _contactMasque = res.data['contact_masque'];
      _username = username;
      setState(() => _loading = false);
      _allerEtape(2);
    } catch (e) {
      setState(() {
        _loading = false;
        _erreur = _parseError(e, {
          '404': 'Aucun compte trouvé avec cet identifiant.',
          'contact':
              'Aucun numéro de contact associé. Contactez l\'administrateur.',
          'default': 'Erreur lors de l\'envoi. Réessayez.',
        });
      });
    }
  }

  // ── Étape 2 : Vérifier code SMS ───────────────────────────
  Future<void> _verifierCode() async {
    final code = _codeCtrl.text.trim();
    if (code.length != 6) {
      setState(() => _erreur = 'Le code doit contenir 6 chiffres');
      return;
    }
    setState(() {
      _loading = true;
      _erreur = null;
    });
    try {
      final res = await apiClient.postPublic(
        '/users/verify-code/',
        data: {'username': _username, 'code': code},
      );
      _resetToken = res.data['reset_token'];
      setState(() => _loading = false);
      _allerEtape(3);
    } catch (e) {
      setState(() {
        _loading = false;
        _erreur = _parseError(e, {
          'expiré': 'Code expiré. Recommencez depuis le début.',
          'incorrect': 'Code incorrect. Vérifiez votre SMS.',
          'default': 'Erreur de vérification. Réessayez.',
        });
      });
    }
  }

  // ── Étape 3 : Nouveau mot de passe ────────────────────────
  Future<void> _reinitialiser() async {
    if (!_mdpValide) {
      setState(() => _erreur = 'Le mot de passe ne respecte pas les critères');
      return;
    }
    if (_nouveauCtrl.text != _confirmCtrl.text) {
      setState(() => _erreur = 'Les mots de passe ne correspondent pas');
      return;
    }
    setState(() {
      _loading = true;
      _erreur = null;
    });
    try {
      await apiClient.postPublic(
        '/users/reset-password/',
        data: {
          'username': _username,
          'reset_token': _resetToken,
          'password': _nouveauCtrl.text,
        },
      );
      if (!mounted) return;
      setState(() => _loading = false);

      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: const Row(children: [
          Icon(Icons.check_circle_rounded, color: Colors.white),
          SizedBox(width: 8),
          Text('Mot de passe réinitialisé avec succès !'),
        ]),
        backgroundColor: AppColors.success,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        margin: const EdgeInsets.all(12),
      ));

      Navigator.pop(context); // Retour au login
    } catch (e) {
      setState(() {
        _loading = false;
        _erreur = _parseError(e, {
          'expiré': 'Session expirée. Recommencez depuis le début.',
          'complexit': 'Le mot de passe ne respecte pas les critères.',
          'default': 'Erreur. Réessayez.',
        });
      });
    }
  }

  String _parseError(dynamic e, Map<String, String> messages) {
    final msg = e.toString().toLowerCase();
    for (final entry in messages.entries) {
      if (entry.key != 'default' && msg.contains(entry.key)) return entry.value;
    }
    return messages['default'] ?? 'Erreur inattendue.';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final size = MediaQuery.of(context).size;

    return Scaffold(
      body: Stack(children: [
        // ── Fond gradient ──────────────────────────────────
        Container(
          decoration: const BoxDecoration(gradient: AppColors.primaryGradient),
          height: size.height * 0.4,
        ),

        SafeArea(
            child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(children: [
            const SizedBox(height: 24),

            // ── Header ───────────────────────────────────
            Row(children: [
              IconButton(
                icon: const Icon(Icons.arrow_back_ios_new_rounded,
                    color: Colors.white, size: 20),
                onPressed: () => _etape > 1
                    ? _allerEtape(_etape - 1)
                    : Navigator.pop(context),
              ),
              Expanded(
                  child: Center(
                child: SvgPicture.asset('assets/images/logo_white.svg',
                    height: 36),
              )),
              const SizedBox(width: 40),
            ]),

            const SizedBox(height: 24),

            // ── Indicateur étapes ─────────────────────────
            _StepIndicator(etape: _etape),

            const SizedBox(height: 28),

            // ── Carte principale ──────────────────────────
            FadeTransition(
              opacity: _fadeAnim,
              child: SlideTransition(
                position: _slideAnim,
                child: Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.darkCard : AppColors.lightSurface,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(
                        color: isDark
                            ? AppColors.darkBorder
                            : AppColors.lightBorder),
                    boxShadow: [
                      BoxShadow(
                          color: Colors.black.withOpacity(isDark ? 0.3 : 0.08),
                          blurRadius: 30,
                          offset: const Offset(0, 10))
                    ],
                  ),
                  child: _buildEtape(isDark),
                ),
              ),
            ),

            const SizedBox(height: 40),
          ]),
        )),
      ]),
    );
  }

  Widget _buildEtape(bool isDark) {
    switch (_etape) {
      case 1:
        return _EtapeUsername(
          ctrl: _usernameCtrl,
          loading: _loading,
          erreur: _erreur,
          onSubmit: _verifierUsername,
        );
      case 2:
        return _EtapeCode(
          ctrl: _codeCtrl,
          contactMasque: _contactMasque ?? '****',
          username: _username ?? '',
          loading: _loading,
          erreur: _erreur,
          onSubmit: _verifierCode,
          onRenvoyer: _verifierUsername,
        );
      case 3:
        return _EtapeNouveauMdp(
          nouveauCtrl: _nouveauCtrl,
          confirmCtrl: _confirmCtrl,
          showNouveau: _showNouveau,
          showConfirm: _showConfirm,
          loading: _loading,
          erreur: _erreur,
          has8Chars: _has8Chars,
          hasMaj: _hasMaj,
          hasChiffre: _hasChiffre,
          hasSpecial: _hasSpecial,
          onToggleNouveau: () => setState(() => _showNouveau = !_showNouveau),
          onToggleConfirm: () => setState(() => _showConfirm = !_showConfirm),
          onChanged: () => setState(() {}),
          onSubmit: _reinitialiser,
        );
      default:
        return const SizedBox();
    }
  }
}

// ══════════════════════════════════════════════════════════════
// INDICATEUR D'ÉTAPES
// ══════════════════════════════════════════════════════════════

class _StepIndicator extends StatelessWidget {
  final int etape;
  const _StepIndicator({required this.etape});

  @override
  Widget build(BuildContext context) {
    final labels = ['Identifiant', 'Code SMS', 'Nouveau mdp'];
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(3, (i) {
        final active = i + 1 == etape;
        final done = i + 1 < etape;
        return Row(mainAxisSize: MainAxisSize.min, children: [
          Column(children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              width: active ? 32 : 28,
              height: active ? 32 : 28,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: done
                    ? AppColors.accent
                    : active
                        ? Colors.white
                        : Colors.white.withOpacity(0.3),
              ),
              child: Center(
                  child: done
                      ? const Icon(Icons.check_rounded,
                          color: AppColors.primary, size: 16)
                      : Text('${i + 1}',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: active
                                ? AppColors.primary
                                : Colors.white.withOpacity(0.7),
                          ))),
            ),
            const SizedBox(height: 4),
            Text(labels[i],
                style: TextStyle(
                  fontSize: 10,
                  color: active ? Colors.white : Colors.white.withOpacity(0.5),
                  fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                )),
          ]),
          if (i < 2)
            Container(
              width: 40,
              height: 1,
              margin: const EdgeInsets.only(bottom: 16),
              color: Colors.white.withOpacity(i + 1 < etape ? 0.7 : 0.25),
            ),
        ]);
      }),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// ÉTAPE 1 — USERNAME
// ══════════════════════════════════════════════════════════════

class _EtapeUsername extends StatelessWidget {
  final TextEditingController ctrl;
  final bool loading;
  final String? erreur;
  final VoidCallback onSubmit;

  const _EtapeUsername({
    required this.ctrl,
    required this.loading,
    required this.erreur,
    required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Mot de passe oublié',
          style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 6),
      Text('Saisissez votre identifiant pour recevoir un code SMS.',
          style: Theme.of(context).textTheme.bodyMedium),
      const SizedBox(height: 24),
      Text('Badge / Username', style: Theme.of(context).textTheme.labelLarge),
      const SizedBox(height: 8),
      TextField(
        controller: ctrl,
        textInputAction: TextInputAction.done,
        onSubmitted: (_) => onSubmit(),
        decoration: const InputDecoration(
          hintText: 'Votre identifiant',
          prefixIcon:
              Icon(Icons.person_outline_rounded, color: AppColors.accent),
        ),
      ),
      if (erreur != null) _ErreurBanner(erreur!),
      const SizedBox(height: 20),
      AppButton(
        label: 'Envoyer le code SMS',
        icon: Icons.send_rounded,
        loading: loading,
        onPressed: onSubmit,
      ),
    ]);
  }
}

// ══════════════════════════════════════════════════════════════
// ÉTAPE 2 — CODE SMS
// ══════════════════════════════════════════════════════════════

class _EtapeCode extends StatelessWidget {
  final TextEditingController ctrl;
  final String contactMasque;
  final String username;
  final bool loading;
  final String? erreur;
  final VoidCallback onSubmit;
  final VoidCallback onRenvoyer;

  const _EtapeCode({
    required this.ctrl,
    required this.contactMasque,
    required this.username,
    required this.loading,
    required this.erreur,
    required this.onSubmit,
    required this.onRenvoyer,
  });

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Code de vérification',
          style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 6),
      RichText(
          text: TextSpan(
        style: Theme.of(context).textTheme.bodyMedium,
        children: [
          const TextSpan(text: 'Un code a été envoyé au numéro '),
          TextSpan(
              text: contactMasque,
              style: const TextStyle(
                  fontWeight: FontWeight.w700, color: AppColors.accent)),
        ],
      )),
      const SizedBox(height: 24),
      Text('Code à 6 chiffres', style: Theme.of(context).textTheme.labelLarge),
      const SizedBox(height: 8),
      TextField(
        controller: ctrl,
        keyboardType: TextInputType.number,
        textAlign: TextAlign.center,
        maxLength: 6,
        textInputAction: TextInputAction.done,
        onSubmitted: (_) => onSubmit(),
        style: const TextStyle(
            fontSize: 28, fontWeight: FontWeight.w700, letterSpacing: 12),
        decoration: const InputDecoration(
          counterText: '',
          hintText: '• • • • • •',
          hintStyle: TextStyle(letterSpacing: 12, fontSize: 20),
          prefixIcon: Icon(Icons.lock_outline_rounded, color: AppColors.accent),
        ),
      ),
      if (erreur != null) _ErreurBanner(erreur!),
      const SizedBox(height: 12),
      Center(
          child: TextButton.icon(
        icon: const Icon(Icons.refresh_rounded, size: 16),
        label: const Text('Renvoyer le code'),
        onPressed: loading ? null : onRenvoyer,
      )),
      const SizedBox(height: 8),
      AppButton(
        label: 'Vérifier le code',
        icon: Icons.verified_rounded,
        loading: loading,
        onPressed: onSubmit,
      ),
    ]);
  }
}

// ══════════════════════════════════════════════════════════════
// ÉTAPE 3 — NOUVEAU MOT DE PASSE
// ══════════════════════════════════════════════════════════════

class _EtapeNouveauMdp extends StatelessWidget {
  final TextEditingController nouveauCtrl;
  final TextEditingController confirmCtrl;
  final bool showNouveau;
  final bool showConfirm;
  final bool loading;
  final String? erreur;
  final bool has8Chars;
  final bool hasMaj;
  final bool hasChiffre;
  final bool hasSpecial;
  final VoidCallback onToggleNouveau;
  final VoidCallback onToggleConfirm;
  final VoidCallback onChanged;
  final VoidCallback onSubmit;

  const _EtapeNouveauMdp({
    required this.nouveauCtrl,
    required this.confirmCtrl,
    required this.showNouveau,
    required this.showConfirm,
    required this.loading,
    required this.erreur,
    required this.has8Chars,
    required this.hasMaj,
    required this.hasChiffre,
    required this.hasSpecial,
    required this.onToggleNouveau,
    required this.onToggleConfirm,
    required this.onChanged,
    required this.onSubmit,
  });

  int get _score =>
      (has8Chars ? 1 : 0) +
      (hasMaj ? 1 : 0) +
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

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Nouveau mot de passe',
          style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 6),
      Text('Choisissez un mot de passe sécurisé.',
          style: Theme.of(context).textTheme.bodyMedium),
      const SizedBox(height: 24),

      // Nouveau mdp
      Text('Nouveau mot de passe',
          style: Theme.of(context).textTheme.labelLarge),
      const SizedBox(height: 8),
      TextField(
        controller: nouveauCtrl,
        obscureText: !showNouveau,
        onChanged: (_) => onChanged(),
        decoration: InputDecoration(
          hintText: 'Votre nouveau mot de passe',
          prefixIcon:
              const Icon(Icons.lock_reset_rounded, color: AppColors.accent),
          suffixIcon: IconButton(
            icon: Icon(
                showNouveau
                    ? Icons.visibility_off_rounded
                    : Icons.visibility_rounded,
                size: 20,
                color: isDark
                    ? AppColors.darkTextSecondary
                    : AppColors.lightTextSecondary),
            onPressed: onToggleNouveau,
          ),
        ),
      ),

      // Indicateur force
      if (nouveauCtrl.text.isNotEmpty) ...[
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
              color: isDark ? AppColors.darkCard : AppColors.lightBackground,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                  color:
                      isDark ? AppColors.darkBorder : AppColors.lightBorder)),
          child: Column(children: [
            Row(children: [
              Expanded(
                  child: ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                    value: _score / 4,
                    backgroundColor:
                        isDark ? AppColors.darkBorder : AppColors.lightBorder,
                    valueColor: AlwaysStoppedAnimation<Color>(_couleurForce),
                    minHeight: 5),
              )),
              const SizedBox(width: 8),
              Text(_labelForce,
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: _couleurForce)),
            ]),
            const SizedBox(height: 10),
            Wrap(spacing: 10, runSpacing: 6, children: [
              _Critere('8 car. min', has8Chars),
              _Critere('1 majuscule', hasMaj),
              _Critere('1 chiffre', hasChiffre),
              _Critere('1 spécial', hasSpecial),
            ]),
          ]),
        ),
      ],

      const SizedBox(height: 16),

      // Confirmation
      Text('Confirmer', style: Theme.of(context).textTheme.labelLarge),
      const SizedBox(height: 8),
      TextField(
        controller: confirmCtrl,
        obscureText: !showConfirm,
        onChanged: (_) => onChanged(),
        textInputAction: TextInputAction.done,
        onSubmitted: (_) => onSubmit(),
        decoration: InputDecoration(
          hintText: 'Répétez le mot de passe',
          prefixIcon: const Icon(Icons.check_circle_outline_rounded,
              color: AppColors.accent),
          suffixIcon: IconButton(
            icon: Icon(
                showConfirm
                    ? Icons.visibility_off_rounded
                    : Icons.visibility_rounded,
                size: 20,
                color: isDark
                    ? AppColors.darkTextSecondary
                    : AppColors.lightTextSecondary),
            onPressed: onToggleConfirm,
          ),
          suffixIconColor: confirmCtrl.text.isNotEmpty
              ? (confirmCtrl.text == nouveauCtrl.text
                  ? AppColors.success
                  : AppColors.error)
              : null,
        ),
      ),

      if (erreur != null) _ErreurBanner(erreur!),

      const SizedBox(height: 20),
      AppButton(
        label: 'Réinitialiser le mot de passe',
        icon: Icons.lock_reset_rounded,
        loading: loading,
        onPressed: onSubmit,
      ),
    ]);
  }
}

// ── Critère de force ───────────────────────────────────────────

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
          size: 13,
          color: valide ? AppColors.success : AppColors.lightTextSecondary),
      const SizedBox(width: 3),
      Text(label,
          style: TextStyle(
              fontSize: 11,
              fontWeight: valide ? FontWeight.w600 : FontWeight.w400,
              color:
                  valide ? AppColors.success : AppColors.lightTextSecondary)),
    ]);
  }
}

// ── Bannière erreur ────────────────────────────────────────────

class _ErreurBanner extends StatelessWidget {
  final String message;
  const _ErreurBanner(this.message);

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.errorLight,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.error.withOpacity(0.3)),
      ),
      child: Row(children: [
        const Icon(Icons.error_outline_rounded,
            color: AppColors.error, size: 16),
        const SizedBox(width: 8),
        Expanded(
            child: Text(message,
                style: const TextStyle(color: AppColors.error, fontSize: 13))),
      ]),
    );
  }
}
