// lib/features/auth/login_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:provider/provider.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../core/widgets/common_widgets.dart';
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
    Future.delayed(
        const Duration(milliseconds: 200), () => _slideCtrl.forward());
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
    if (!_formKey.currentState!.validate()) return;
    final auth = context.read<AuthProvider>();
    await auth.login(_usernameCtrl.text.trim(), _passwordCtrl.text);
    // Navigation gérée automatiquement par Consumer<AuthProvider> dans main.dart
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final size = MediaQuery.of(context).size;

    return Scaffold(
      body: Stack(children: [
        // ── Background gradient ───────────────────────────────
        Container(
          decoration: const BoxDecoration(gradient: AppColors.primaryGradient),
          height: size.height * 0.45,
        ),

        SafeArea(
            child: FadeTransition(
          opacity: _fadeAnim,
          child: SlideTransition(
            position: _slideAnim,
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(children: [
                const SizedBox(height: 40),

                // ── Logo / Brand ──────────────────────────────
                Column(children: [
                  // Logo UbiFood
                  SvgPicture.asset(
                    'assets/images/logo_white.svg',
                    height: 56,
                  ),
                  const SizedBox(height: 8),
                  Text('Accédez à votre espace',
                      style: TextStyle(
                          fontSize: 14, color: Colors.white.withOpacity(0.8))),
                ]),

                const SizedBox(height: 40),

                // ── Card formulaire ───────────────────────────
                Container(
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
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: Form(
                    key: _formKey,
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Connexion',
                              style: Theme.of(context).textTheme.headlineSmall),
                          const SizedBox(height: 6),
                          Text('Entrez vos identifiants',
                              style: Theme.of(context).textTheme.bodyMedium),
                          const SizedBox(height: 24),

                          // Username
                          Text('Utilisateur',
                              style: Theme.of(context).textTheme.labelLarge),
                          const SizedBox(height: 8),
                          TextFormField(
                            controller: _usernameCtrl,
                            keyboardType: TextInputType.text,
                            textInputAction: TextInputAction.next,
                            decoration: InputDecoration(
                              hintText: 'Votre utilisateur',
                              prefixIcon: const Icon(
                                  Icons.person_outline_rounded,
                                  color: AppColors.primary),
                            ),
                            validator: (v) =>
                                (v == null || v.isEmpty) ? 'Requis' : null,
                          ),
                          const SizedBox(height: 16),

                          // Password
                          Text('Mot de passe',
                              style: Theme.of(context).textTheme.labelLarge),
                          const SizedBox(height: 8),
                          TextFormField(
                            controller: _passwordCtrl,
                            obscureText: _obscure,
                            textInputAction: TextInputAction.done,
                            onFieldSubmitted: (_) => _login(),
                            decoration: InputDecoration(
                              hintText: 'Votre mot de passe',
                              prefixIcon: const Icon(Icons.lock_outline_rounded,
                                  color: AppColors.primary),
                              suffixIcon: IconButton(
                                icon: Icon(
                                  _obscure
                                      ? Icons.visibility_outlined
                                      : Icons.visibility_off_outlined,
                                  color: AppColors.lightTextSecondary,
                                ),
                                onPressed: () =>
                                    setState(() => _obscure = !_obscure),
                              ),
                            ),
                            validator: (v) =>
                                (v == null || v.isEmpty) ? 'Requis' : null,
                          ),

                          // Erreur
                          Consumer<AuthProvider>(builder: (_, auth, __) {
                            if (auth.error == null) {
                              return const SizedBox(height: 24);
                            }
                            return Container(
                              margin: const EdgeInsets.only(top: 12),
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: AppColors.errorLight,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                    color: AppColors.error.withOpacity(0.3)),
                              ),
                              child: Row(children: [
                                const Icon(Icons.error_outline_rounded,
                                    color: AppColors.error, size: 18),
                                const SizedBox(width: 8),
                                Expanded(
                                    child: Text(auth.error!,
                                        style: const TextStyle(
                                            color: AppColors.error,
                                            fontSize: 13))),
                              ]),
                            );
                          }),

                          const SizedBox(height: 8),

                          // Bouton connexion
                          Consumer<AuthProvider>(
                            builder: (_, auth, __) => AppButton(
                              label: 'Se connecter',
                              icon: Icons.login_rounded,
                              loading: auth.loading,
                              onPressed: _login,
                            ),
                          ),
                        ]),
                  ),
                ),

                const SizedBox(height: 24),

                // ── Mot de passe oublié ───────────────────────
                GestureDetector(
                  onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => const ForgotPasswordScreen())),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 20, vertical: 12),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: Colors.white.withOpacity(0.2)),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.lock_reset_rounded,
                          size: 15, color: AppColors.accent),
                      const SizedBox(width: 6),
                      Text('Mot de passe oublié ?',
                          style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: AppColors.accent)),
                    ]),
                  ),
                ),

                const SizedBox(height: 24),
              ]),
            ),
          ),
        )),
      ]),
    );
  }
}
