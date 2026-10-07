// lib/features/profil/qr_code_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';

class QrCodeScreen extends StatelessWidget {
  const QrCodeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final username = user?.username ?? '';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mon badge QR'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            const SizedBox(height: 16),

            // ── Titre ──────────────────────────────────────
            Text('Présentez ce badge à la cantine',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: isDark
                        ? AppColors.darkTextSecondary
                        : AppColors.lightTextSecondary)),

            const SizedBox(height: 32),

            // ── Carte QR Code ───────────────────────────────
            Container(
              padding: const EdgeInsets.all(28),
              decoration: BoxDecoration(
                color: isDark ? AppColors.darkCard : Colors.white,
                borderRadius: BorderRadius.circular(28),
                border: Border.all(
                    color:
                        isDark ? AppColors.darkBorder : AppColors.lightBorder),
                boxShadow: [
                  BoxShadow(
                      color: Colors.black.withOpacity(isDark ? 0.3 : 0.08),
                      blurRadius: 30,
                      offset: const Offset(0, 10)),
                ],
              ),
              child: Column(children: [
                // ── QR Code ───────────────────────────────
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: QrImageView(
                    data: username,
                    version: QrVersions.auto,
                    size: 220,
                    backgroundColor: Colors.white,
                    eyeStyle: const QrEyeStyle(
                      eyeShape: QrEyeShape.square,
                      color: Color(0xFF092440),
                    ),
                    dataModuleStyle: const QrDataModuleStyle(
                      dataModuleShape: QrDataModuleShape.square,
                      color: Color(0xFF092440),
                    ),
                    embeddedImage: const AssetImage('assets/images/logo.svg'),
                    embeddedImageStyle:
                        const QrEmbeddedImageStyle(size: Size(36, 36)),
                  ),
                ),

                const SizedBox(height: 20),

                // ── Nom complet ───────────────────────────
                Text(user?.fullName ?? '—',
                    style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF092440)),
                    textAlign: TextAlign.center),

                const SizedBox(height: 6),

                // ── Username / Badge ──────────────────────
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.06),
                    borderRadius: BorderRadius.circular(20),
                    border:
                        Border.all(color: AppColors.primary.withOpacity(0.15)),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.badge_rounded,
                        size: 16, color: AppColors.primary),
                    const SizedBox(width: 6),
                    Text(username,
                        style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: AppColors.primary,
                            letterSpacing: 1)),
                  ]),
                ),

                const SizedBox(height: 10),

                // ── Agence ────────────────────────────────
                if (user?.derniereAgence != null)
                  Text(user!.derniereAgence!,
                      style: TextStyle(
                          fontSize: 13,
                          color: isDark
                              ? AppColors.darkTextSecondary
                              : AppColors.lightTextSecondary)),
              ]),
            ),

            const SizedBox(height: 28),

            // ── Bouton copier le badge ──────────────────────
            OutlinedButton.icon(
              icon: const Icon(Icons.copy_rounded, size: 16),
              label: const Text('Copier mon identifiant'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.primary,
                side: const BorderSide(color: AppColors.primary),
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
              ),
              onPressed: () {
                Clipboard.setData(ClipboardData(text: username));
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                  content: const Row(children: [
                    Icon(Icons.check_rounded, color: Colors.white, size: 18),
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

            const SizedBox(height: 16),

            // ── Info ────────────────────────────────────────
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.accent.withOpacity(0.07),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.accent.withOpacity(0.2)),
              ),
              child:
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Icon(Icons.info_outline_rounded,
                    color: AppColors.accent, size: 18),
                const SizedBox(width: 10),
                Expanded(
                    child: Text(
                  'Le gestionnaire scanne ce QR code pour valider '
                  'votre retrait de repas à la cantine.',
                  style: TextStyle(
                      fontSize: 13,
                      height: 1.5,
                      color: isDark
                          ? AppColors.darkTextSecondary
                          : AppColors.lightTextSecondary),
                )),
              ]),
            ),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}
