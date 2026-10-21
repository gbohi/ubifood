// lib/features/profil/qr_code_screen.dart
//
// Badge QR plein écran : fond marine (identique en clair et en sombre),
// grand QR sur carte blanche, luminosité au maximum pendant l'affichage.

import 'dart:math' as math;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:screen_brightness/screen_brightness.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';

class QrCodeScreen extends StatefulWidget {
  const QrCodeScreen({super.key});

  @override
  State<QrCodeScreen> createState() => _QrCodeScreenState();
}

class _QrCodeScreenState extends State<QrCodeScreen> {
  /// Luminosité poussée au maximum (false : web, plateforme sans prise en
  /// charge ou réglage refusé — le badge reste utilisable)
  bool _luminositeMax = false;

  @override
  void initState() {
    super.initState();
    _changerLuminosite(true);
  }

  @override
  void dispose() {
    // Luminosité d'origine rétablie à la fermeture
    if (_luminositeMax) _changerLuminosite(false);
    super.dispose();
  }

  Future<void> _changerLuminosite(bool max) async {
    if (kIsWeb) return;
    try {
      if (max) {
        await ScreenBrightness().setScreenBrightness(1.0);
      } else {
        await ScreenBrightness().resetScreenBrightness();
      }
      if (mounted) setState(() => _luminositeMax = max);
    } catch (_) {
      // Plugin absent (tests, ordinateur) ou refus : sans conséquence
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final username = user?.username ?? '';
    final nom =
        (user?.fullName.isNotEmpty ?? false) ? user!.fullName : username;
    final role = user?.isAdmin == true
        ? 'Administrateur'
        : (user?.isGestionnaire ?? false)
            ? 'Gestionnaire'
            : 'Employé';
    // Carte : marges de l'écran (20) + de la carte (20) + du cadre (12)
    final qrSize = math
        .max(
            140.0,
            math.min(
                270.0, MediaQuery.of(context).size.width - 2 * (20 + 20 + 12)))
        .toDouble();

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: AppColors.primary,
        body: Container(
          decoration: const BoxDecoration(
            gradient: RadialGradient(
              center: Alignment(0, -0.4),
              radius: 1.1,
              colors: [Color(0xFF12497F), Color(0xFF0F3A6E), AppColors.primary],
              stops: [0, 0.3, 0.75],
            ),
          ),
          child: SafeArea(
            child: Column(children: [
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
                  child: Column(children: [
                    // ── Barre : retour, logo, luminosité ─────────
                    Row(children: [
                      _BoutonRond(
                        icone: Icons.arrow_back_ios_new_rounded,
                        tooltip: 'Retour',
                        onTap: () => Navigator.of(context).maybePop(),
                      ),
                      Expanded(
                        child: Center(
                          child: SvgPicture.asset(
                              'assets/images/logo_white.svg',
                              height: 34,
                              semanticsLabel: 'UbiFood'),
                        ),
                      ),
                      if (kIsWeb)
                        const SizedBox(width: 40)
                      else
                        _BoutonRond(
                          icone: _luminositeMax
                              ? Icons.light_mode_rounded
                              : Icons.light_mode_outlined,
                          tooltip: _luminositeMax
                              ? 'Rétablir la luminosité'
                              : 'Luminosité au maximum',
                          onTap: () => _changerLuminosite(!_luminositeMax),
                        ),
                    ]),
                    const SizedBox(height: 36),

                    // ── Carte blanche du badge ────────────────────
                    Container(
                      width: double.infinity,
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(26),
                        boxShadow: [
                          BoxShadow(
                              color: Colors.black.withOpacity(0.35),
                              blurRadius: 50,
                              offset: const Offset(0, 20)),
                        ],
                      ),
                      child: Column(children: [
                        Container(
                            height: 6,
                            decoration: const BoxDecoration(
                                gradient: AppColors.accentGradient)),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(20, 16, 20, 18),
                          child: Column(children: [
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(18),
                                border: Border.all(
                                    color: AppColors.lightBorder, width: 2),
                              ),
                              child: QrImageView(
                                data: username,
                                version: QrVersions.auto,
                                semanticsLabel: 'QR code du badge $username',
                                size: qrSize,
                                padding: EdgeInsets.zero,
                                backgroundColor: Colors.white,
                                eyeStyle: const QrEyeStyle(
                                  eyeShape: QrEyeShape.square,
                                  color: AppColors.primary,
                                ),
                                dataModuleStyle: const QrDataModuleStyle(
                                  dataModuleShape: QrDataModuleShape.square,
                                  color: AppColors.primary,
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            // Couleurs fixes : carte toujours blanche
                            Text(nom.isEmpty ? '—' : nom,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                    fontSize: 21,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.primary)),
                            const SizedBox(height: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 5),
                              decoration: BoxDecoration(
                                color: AppColors.lightBackground,
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(Icons.badge_outlined,
                                        size: 16, color: AppColors.primary),
                                    const SizedBox(width: 6),
                                    Text(username,
                                        style: const TextStyle(
                                            fontFamily: 'monospace',
                                            fontSize: 14,
                                            fontWeight: FontWeight.w700,
                                            color: AppColors.primary)),
                                  ]),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                                alignment: WrapAlignment.center,
                                spacing: 12,
                                children: [
                                  if (user?.derniereAgence != null)
                                    _Info(Icons.location_on_outlined,
                                        user!.derniereAgence!),
                                  _Info(Icons.person_outline_rounded, role),
                                ]),
                          ]),
                        ),
                      ]),
                    ),

                    if (_luminositeMax) ...[
                      const SizedBox(height: 18),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 7),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.08),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          const Icon(Icons.light_mode_rounded,
                              size: 16, color: Color(0xFFFFD54F)),
                          const SizedBox(width: 8),
                          Text("Luminosité au maximum pendant l'affichage",
                              style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.white.withOpacity(0.8))),
                        ]),
                      ),
                    ],
                  ]),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                child: Column(children: [
                  Text(
                    'Présentez ce code au comptoir de la cantine :\n'
                    'le gestionnaire le scanne pour valider votre retrait.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 12.5,
                        height: 1.5,
                        color: Colors.white.withOpacity(0.7)),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.copy_rounded, size: 16),
                      label: const Text('Copier mon identifiant'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: BorderSide(
                            color: Colors.white.withOpacity(0.3), width: 1.5),
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        textStyle: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 14),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: () {
                        Clipboard.setData(ClipboardData(text: username));
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                          content: const Row(children: [
                            Icon(Icons.check_rounded,
                                color: Colors.white, size: 18),
                            SizedBox(width: 8),
                            Text('Identifiant copié !'),
                          ]),
                          backgroundColor: AppColors.success,
                          behavior: SnackBarBehavior.floating,
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10)),
                          margin: const EdgeInsets.all(12),
                        ));
                      },
                    ),
                  ),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class _Info extends StatelessWidget {
  final IconData icone;
  final String texte;
  const _Info(this.icone, this.texte);

  @override
  Widget build(BuildContext context) =>
      Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icone, size: 14, color: AppColors.lightTextSecondary),
        const SizedBox(width: 3),
        Text(texte,
            style: const TextStyle(
                fontSize: 12.5, color: AppColors.lightTextSecondary)),
      ]);
}

class _BoutonRond extends StatelessWidget {
  final IconData icone;
  final String tooltip;
  final VoidCallback onTap;
  const _BoutonRond(
      {required this.icone, required this.tooltip, required this.onTap});

  @override
  Widget build(BuildContext context) => Tooltip(
        message: tooltip,
        child: Material(
          color: Colors.white.withOpacity(0.1),
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: onTap,
            child: SizedBox(
                width: 40,
                height: 40,
                child: Icon(icone, color: Colors.white, size: 20)),
          ),
        ),
      );
}
