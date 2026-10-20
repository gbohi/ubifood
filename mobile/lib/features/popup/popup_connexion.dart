// lib/features/popup/popup_connexion.dart
//
// Fenêtre affichée à l'arrivée sur l'application (après la connexion ou la
// restauration de la session) : image paramétrée dans l'administration web
// (Paramètres → Fenêtre de connexion).

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/services/cantine_service.dart';
import '../../shared/models/models.dart';

/// Récupère l'image active et l'affiche. Rien n'est affiché s'il n'y en a
/// pas, si le serveur est injoignable ou si l'image ne se charge pas.
/// N'attend rien côté appelant : l'interface reste utilisable pendant ce temps.
Future<void> afficherPopupConnexion(BuildContext context,
    {PopupConnexionService? service}) async {
  final PopupConnexion? popup;
  try {
    popup = await (service ?? popupConnexionService).getActive();
  } catch (_) {
    return; // Hors ligne / erreur serveur : pas de fenêtre
  }
  if (popup == null || !context.mounted) return;

  // Image chargée AVANT d'ouvrir la fenêtre : jamais de fenêtre vide
  var echec = false;
  await precacheImage(
    CachedNetworkImageProvider(popup.imageUrl),
    context,
    onError: (_, __) => echec = true,
  );
  if (echec || !context.mounted) return;

  await showDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Fermer',
    builder: (_) => PopupConnexionDialog(popup: popup!),
  );
}

class PopupConnexionDialog extends StatelessWidget {
  final PopupConnexion popup;
  const PopupConnexionDialog({super.key, required this.popup});

  @override
  Widget build(BuildContext context) {
    final taille = MediaQuery.sizeOf(context);
    return Dialog(
      backgroundColor: Colors.transparent,
      elevation: 0,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: taille.height * 0.8,
          maxWidth: taille.width,
        ),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: CachedNetworkImage(
                imageUrl: popup.imageUrl,
                fit: BoxFit.contain,
                fadeInDuration: Duration.zero,
                imageBuilder: (_, image) => Image(
                  image: image,
                  fit: BoxFit.contain,
                  semanticLabel: popup.titre.isNotEmpty ? popup.titre : null,
                ),
                placeholder: (_, __) => const SizedBox(
                  height: 160,
                  child: Center(child: CircularProgressIndicator()),
                ),
                errorWidget: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
            Positioned(
              top: 6,
              right: 6,
              child: Material(
                color: Colors.black54,
                shape: const CircleBorder(),
                child: IconButton(
                  icon: const Icon(Icons.close_rounded, color: Colors.white),
                  tooltip: 'Fermer',
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
