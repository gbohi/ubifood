// lib/features/auth/login_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:provider/provider.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import 'forgot_password_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with TickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _usernameCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _obscure = true;
  late AnimationController _fadeCtrl;
  late AnimationController _slideCtrl;
  late Animation<double> _fadeAnim;
  late Animation<Offset> _slideAnim;

  @override
  void initState() {
    super.initState();
    _fadeCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 800));
    _slideCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 600));
    _fadeAnim = CurvedAnimation(parent: _fadeCtrl, curve: Curves.easeOut);
    _slideAnim = Tween<Offset>(begin: const Offset(0, 0.3), end: Offset.zero)
        .animate(
            CurvedAnimation(parent: _slideCtrl, curve: Curves.easeOutCubic));
    _fadeCtrl.forward();
    Future.delayed(const Duration(milliseconds: 200), () {
      if (mounted) _slideCtrl.forward();
    });
  }

  @override
  void dispose() {
    _fadeCtrl.dispose();
    _slideCtrl.dispose();
    _usernameCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final auth = context.read<AuthProvider>();
    // Connexion déjà en cours (touche « Entrée » pendant le chargement)
    if (auth.loading) return;
    if (!_formKey.currentState!.validate()) return;
    await auth.login(_usernameCtrl.text.trim(), _passwordCtrl.text);
    // Navigation gérée automatiquement par Consumer<AuthProvider> dans main.dart
  }

  // L'erreur du serveur est masquée dès que l'utilisateur corrige sa saisie
  bool _erreurMasquee = false;

  void _onSaisie(String _) {
    if (!_erreurMasquee) setState(() => _erreurMasquee = true);
  }

  Future<void> _soumettre() async {
    setState(() => _erreurMasquee = false);
    await _login();
  }

  InputDecoration _decoration(String indice, IconData icone, bool erreur, bool isDark,
      {Widget? suffixe}) {
    final rayon = BorderRadius.circular(14);
    OutlineInputBorder bord(Color c, [double l = 1.5]) =>
        OutlineInputBorder(borderRadius: rayon, borderSide: BorderSide(color: c, width: l));
    final normal = erreur
        ? AppColors.error
        : (isDark ? AppColors.darkBorder : AppColors.lightBorder);
    return InputDecoration(
      hintText: indice,
      prefixIcon: Icon(icone,
          color: isDark ? AppColors.darkTextHint : AppColors.lightTextHint),
      suffixIcon: suffixe,
      contentPadding: const EdgeInsets.symmetric(vertical: 16),
      enabledBorder: bord(normal),
      border: bord(normal),
      focusedBorder: bord(erreur ? AppColors.error : AppColors.accent, 2),
      errorBorder: bord(AppColors.error),
      focusedErrorBorder: bord(AppColors.error, 2),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final auth = context.watch<AuthProvider>();
    final erreur = auth.error != null && !_erreurMasquee ? auth.error : null;
    final etiquette = Theme.of(context).textTheme.labelLarge;

    return Scaffold(
      backgroundColor: isDark ? AppColors.darkSurface : AppColors.lightSurface,
      body: FadeTransition(
        opacity: _fadeAnim,
        child: SingleChildScrollView(
          child: Column(children: [
            // ── En-tête de bienvenue ──────────────────────────
            Container(
              width: double.infinity,
              decoration: const BoxDecoration(gradient: AppColors.heroGradient),
              child: SafeArea(
                bottom: false,
                child: SizedBox(
                  height: 300,
                  child: Stack(children: [
                    // Assiette décorative
                    Positioned(
                      right: -40,
                      top: 50,
                      child: ExcludeSemantics(
                        child: Container(
                          width: 200,
                          height: 200,
                          decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: AppColors.accent.withOpacity(0.16)),
                          alignment: Alignment.center,
                          child: Container(
                            width: 144,
                            height: 144,
                            decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: AppColors.accent.withOpacity(0.22)),
                            child: const Icon(Icons.restaurant_rounded,
                                color: Colors.white, size: 64),
                          ),
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(26, 20, 26, 0),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SvgPicture.asset('assets/images/logo_white.svg',
                                height: 34, semanticsLabel: 'UbiFood'),
                            const SizedBox(height: 44),
                            const Text('Bonjour 👋',
                                style: TextStyle(
                                    color: AppColors.accent,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600)),
                            const SizedBox(height: 6),
                            const Text('Votre repas\nvous attend',
                                style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 30,
                                    height: 1.15,
                                    fontWeight: FontWeight.w800)),
                            const SizedBox(height: 8),
                            SizedBox(
                              width: 210,
                              child: Text(
                                  'Connectez-vous pour réserver ou retirer votre repas.',
                                  style: TextStyle(
                                      color: Colors.white.withOpacity(0.72),
                                      fontSize: 14)),
                            ),
                          ]),
                    ),
                  ]),
                ),
              ),
            ),

            // ── Formulaire (feuille qui remonte sur l'en-tête) ─
            SlideTransition(
              position: _slideAnim,
              child: Transform.translate(
                offset: const Offset(0, -30),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
                    borderRadius:
                        const BorderRadius.vertical(top: Radius.circular(30)),
                  ),
                  child: Form(
                    key: _formKey,
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Connexion',
                              style: Theme.of(context).textTheme.headlineSmall),
                          const SizedBox(height: 4),
                          Text('Avec votre matricule UbiPharm',
                              style: Theme.of(context).textTheme.bodyMedium),
                          const SizedBox(height: 22),

                          // Erreur du serveur (identifiants, réseau…)
                          if (erreur != null)
                            Container(
                              margin: const EdgeInsets.only(bottom: 16),
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: AppColors.errorLight,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Row(children: [
                                const Icon(Icons.error_outline_rounded,
                                    color: AppColors.error, size: 18),
                                const SizedBox(width: 10),
                                Expanded(
                                    child: Text(erreur,
                                        style: const TextStyle(
                                            color: AppColors.error,
                                            fontSize: 13))),
                              ]),
                            ),

                          Text('Matricule', style: etiquette),
                          const SizedBox(height: 8),
                          TextFormField(
                            controller: _usernameCtrl,
                            keyboardType: TextInputType.text,
                            textInputAction: TextInputAction.next,
                            autocorrect: false,
                            onChanged: _onSaisie,
                            decoration: _decoration('Votre matricule',
                                Icons.person_outline_rounded, erreur != null, isDark),
                            validator: (v) => (v == null || v.trim().isEmpty)
                                ? 'Le matricule est requis'
                                : null,
                          ),
                          const SizedBox(height: 16),

                          Text('Mot de passe', style: etiquette),
                          const SizedBox(height: 8),
                          TextFormField(
                            controller: _passwordCtrl,
                            obscureText: _obscure,
                            textInputAction: TextInputAction.done,
                            onChanged: _onSaisie,
                            onFieldSubmitted: (_) => _soumettre(),
                            decoration: _decoration('Votre mot de passe',
                                Icons.lock_outline_rounded, erreur != null, isDark,
                                suffixe: IconButton(
                                  tooltip: _obscure
                                      ? 'Afficher le mot de passe'
                                      : 'Masquer le mot de passe',
                                  icon: Icon(
                                    _obscure
                                        ? Icons.visibility_outlined
                                        : Icons.visibility_off_outlined,
                                    color: AppColors.lightTextSecondary,
                                  ),
                                  onPressed: () =>
                                      setState(() => _obscure = !_obscure),
                                )),
                            validator: (v) => (v == null || v.isEmpty)
                                ? 'Le mot de passe est requis'
                                : null,
                          ),

                          // Mot de passe oublié : juste sous le champ
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton(
                              onPressed: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                      builder: (_) =>
                                          const ForgotPasswordScreen())),
                              child: Text('Mot de passe oublié ?',
                                  style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                      color: isDark
                                          ? AppColors.accent
                                          : AppColors.primaryLight)),
                            ),
                          ),
                          const SizedBox(height: 6),

                          // Bouton connexion (vert, comme « Réserver »)
                          SizedBox(
                            width: double.infinity,
                            height: 54,
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: AppColors.accentGradient,
                                borderRadius: BorderRadius.circular(14),
                                boxShadow: [
                                  BoxShadow(
                                      color: AppColors.accentDark.withOpacity(0.35),
                                      blurRadius: 22,
                                      offset: const Offset(0, 10)),
                                ],
                              ),
                              child: ElevatedButton(
                                onPressed: auth.loading ? null : _soumettre,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.transparent,
                                  disabledBackgroundColor: Colors.transparent,
                                  shadowColor: Colors.transparent,
                                  foregroundColor: AppColors.primary,
                                  disabledForegroundColor: AppColors.primary,
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(14)),
                                ),
                                child: auth.loading
                                    ? const SizedBox(
                                        width: 22,
                                        height: 22,
                                        child: CircularProgressIndicator(
                                            strokeWidth: 2.4,
                                            color: AppColors.primary,
                                            semanticsLabel: 'Connexion en cours'))
                                    : const Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                            Text('Se connecter',
                                                style: TextStyle(
                                                    fontSize: 15.5,
                                                    fontWeight: FontWeight.w700)),
                                            SizedBox(width: 10),
                                            Icon(Icons.arrow_forward_rounded,
                                                size: 20),
                                          ]),
                              ),
                            ),
                          ),

                          const SizedBox(height: 22),
                          Center(
                            child: Text.rich(
                              TextSpan(
                                text: 'Un souci ? ',
                                children: [
                                  TextSpan(
                                      text: 'Contactez votre gestionnaire',
                                      style: TextStyle(
                                          fontWeight: FontWeight.w600,
                                          color: isDark
                                              ? AppColors.darkTextPrimary
                                              : AppColors.primary)),
                                ],
                              ),
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ),
                        ]),
                  ),
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}
