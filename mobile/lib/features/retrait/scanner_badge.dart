// lib/features/retrait/scanner_badge.dart
//
// Caméra de lecture du QR code d'un badge (retrait gestionnaire, comptoir
// du prestataire).

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../shared/theme/app_theme.dart';

// ── Scanner QR/Badge ───────────────────────────────────────────

class ScannerBadge extends StatefulWidget {
  /// Renvoie false si la lecture n'est pas prise en compte.
  final bool Function(String) onScan;
  const ScannerBadge({super.key, required this.onScan, this.hauteur = 240});
  final double hauteur;
  @override
  State<ScannerBadge> createState() => _ScannerBadgeState();
}

class _ScannerBadgeState extends State<ScannerBadge> {
  bool _scanned = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: widget.hauteur,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.accentDark, width: 2),
      ),
      clipBehavior: Clip.antiAlias,
      child: MobileScanner(
        onDetect: (capture) {
          if (_scanned) return;
          // QR code vide ou illisible : on continue de scanner
          final valeur = capture.barcodes.firstOrNull?.rawValue?.trim() ?? '';
          if (valeur.isEmpty) return;
          _scanned = widget.onScan(valeur);
        },
        // Caméra refusée ou indisponible : message explicite (avant : icône seule)
        errorBuilder: (context, erreur, _) => ColoredBox(
          color: Colors.black,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.no_photography_outlined,
                    color: Colors.white, size: 36),
                const SizedBox(height: 10),
                Text(
                  erreur.errorCode == MobileScannerErrorCode.permissionDenied
                      ? "Accès à la caméra refusé. Autorisez-le dans les "
                          "réglages du téléphone ou saisissez le badge."
                      : 'Caméra indisponible. Saisissez le badge manuellement.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                ),
              ]),
            ),
          ),
        ),
        // Cadre de visée : non affiché si la caméra est en erreur
        overlay: Stack(children: [
          Container(
            decoration: BoxDecoration(
              border: Border.all(
                  color: AppColors.primary.withOpacity(0.3), width: 40),
            ),
          ),
          Center(
              child: Container(
            width: 160,
            height: 160,
            decoration: BoxDecoration(
              border: Border.all(color: AppColors.primary, width: 3),
              borderRadius: BorderRadius.circular(12),
            ),
          )),
          Positioned(
            bottom: 12,
            left: 0,
            right: 0,
            child: Center(
                child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text('Pointez le badge vers la caméra',
                  style: TextStyle(color: Colors.white, fontSize: 12)),
            )),
          ),
        ]),
      ),
    );
  }
}
