// lib/features/profil/profil_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../core/widgets/common_widgets.dart';
import '../allergies/allergies_screen.dart';
import 'change_password_screen.dart';
import 'qr_code_screen.dart';

class ProfilScreen extends StatefulWidget {
  const ProfilScreen({super.key});
  @override
  State<ProfilScreen> createState() => _ProfilScreenState();
}

class _ProfilScreenState extends State<ProfilScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AllergieProvider>().loadAllergies();
      context.read<CommandeProvider>().loadMesCommandes();
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final theme = context.watch<ThemeProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final user = auth.user;

    return Scaffold(
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // ── Carte profil ──────────────────────────────────
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                  colors: [AppColors.primary, AppColors.primaryDark]),
              borderRadius: BorderRadius.circular(20),
              boxShadow: [
                BoxShadow(
                    color: AppColors.primary.withOpacity(0.3),
                    blurRadius: 20,
                    offset: const Offset(0, 8))
              ],
            ),
            child: Row(children: [
              // Photo de profil : toucher pour la changer
              Semantics(
                button: true,
                label: 'Changer ma photo de profil',
                child: GestureDetector(
                  onTap: auth.photoEnCours ? null : () => _choisirPhoto(context),
                  child: Stack(clipBehavior: Clip.none, children: [
                    Container(
                      width: 64,
                      height: 64,
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(18)),
                      child: auth.photoEnCours
                          ? const Center(
                              child: SizedBox(
                                  width: 22,
                                  height: 22,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2, color: Colors.white)))
                          : PhotoProfil(user: user, fontSize: 24),
                    ),
                    Positioned(
                      right: -4,
                      bottom: -4,
                      child: Container(
                        padding: const EdgeInsets.all(5),
                        decoration: BoxDecoration(
                            color: AppColors.accent,
                            shape: BoxShape.circle,
                            border: Border.all(color: AppColors.primary, width: 2)),
                        child: const Icon(Icons.photo_camera_rounded,
                            size: 13, color: AppColors.primary),
                      ),
                    ),
                  ]),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(
                        (user?.fullName.isNotEmpty ?? false)
                            ? user!.fullName
                            : (user?.username ?? '—'),
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text('@${user?.username ?? ''}',
                        style: TextStyle(
                            color: Colors.white.withOpacity(0.8),
                            fontSize: 13)),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(20)),
                      child: Text(
                          user?.isAdmin == true
                              ? '🛡 Administrateur'
                              : auth.isGestionnaire
                                  ? '⚡ Gestionnaire'
                                  : '👤 Employé',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w600)),
                    ),
                  ])),
            ]),
          ),

          const SizedBox(height: 24),

          // ── Informations ──────────────────────────────────
          _SectionTitle('Informations'),
          const SizedBox(height: 10),
          _InfoCard(children: [
            _InfoRow(
                icon: Icons.email_outlined,
                label: 'Email',
                // Email vide renvoyé par l'API : tiret plutôt qu'une ligne vide
                value: (user?.email.isNotEmpty ?? false) ? user!.email : '—'),
            if (user?.dernierService != null)
              _InfoRow(
                  icon: Icons.business_center_outlined,
                  label: 'Service',
                  value: user!.dernierService!),
            if (user?.derniereAgence != null)
              _InfoRow(
                  icon: Icons.location_city_outlined,
                  label: 'Agence',
                  value: user!.derniereAgence!),
            if (user?.dernierPoste != null)
              _InfoRow(
                  icon: Icons.work_outline_rounded,
                  label: 'Poste',
                  value: user!.dernierPoste!),
          ]),

          const SizedBox(height: 20),

          // ── Paramètres ────────────────────────────────────
          _SectionTitle('Paramètres'),
          const SizedBox(height: 10),
          _InfoCard(children: [
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                      color: isDark
                          ? Colors.amber.withOpacity(0.15)
                          : AppColors.primary.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(10)),
                  child: Icon(
                      isDark
                          ? Icons.light_mode_rounded
                          : Icons.dark_mode_rounded,
                      color: isDark ? Colors.amber : AppColors.primary,
                      size: 18),
                ),
                const SizedBox(width: 14),
                Expanded(
                    child: Text(isDark ? 'Mode clair' : 'Mode sombre',
                        style: Theme.of(context).textTheme.titleSmall)),
                Switch.adaptive(
                    value: isDark,
                    activeColor: AppColors.accent,
                    onChanged: (_) => theme.toggle()),
              ]),
            ),
          ]),

          const SizedBox(height: 20),

          // ── Sécurité ──────────────────────────────────────
          _SectionTitle('Sécurité'),
          const SizedBox(height: 10),
          _InfoCard(children: [
            // Modifier mot de passe
            ListTile(
              dense: true,
              leading: Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.lock_outline_rounded,
                    color: AppColors.primary, size: 18),
              ),
              title: const Text('Modifier le mot de passe',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
              subtitle: const Text('8 car. | majuscule | chiffre | spécial',
                  style: TextStyle(fontSize: 11)),
              trailing: Icon(Icons.arrow_forward_ios_rounded,
                  size: 14,
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.lightTextSecondary),
              onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => const ChangePasswordScreen())),
            ),

            Divider(
                height: 1,
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder),

            // Mon badge QR
            ListTile(
              dense: true,
              leading: Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                    color: AppColors.accent.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.qr_code_rounded,
                    color: AppColors.accent, size: 18),
              ),
              title: const Text('Mon badge QR',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
              subtitle: const Text('Scanner à la cantine pour le retrait',
                  style: TextStyle(fontSize: 11)),
              trailing: Icon(Icons.arrow_forward_ios_rounded,
                  size: 14,
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.lightTextSecondary),
              onTap: () => Navigator.push(context,
                  MaterialPageRoute(builder: (_) => const QrCodeScreen())),
            ),
          ]),

          const SizedBox(height: 20),

          // ── Allergies ─────────────────────────────────────
          _SectionTitle('Allergies alimentaires'),
          const SizedBox(height: 10),
          _InfoCard(children: [
            Consumer<AllergieProvider>(builder: (_, allergieProv, __) {
              final count = allergieProv.allergies.length;
              return ListTile(
                dense: true,
                leading: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                      color: AppColors.error.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(10)),
                  child: const Icon(Icons.warning_amber_rounded,
                      color: AppColors.error, size: 18),
                ),
                title: const Text('Mes allergies',
                    style:
                        TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                subtitle: Text(
                    count == 0
                        ? 'Aucune allergie enregistrée'
                        : '$count allergie(s) enregistrée(s)',
                    style: const TextStyle(fontSize: 12)),
                trailing: Icon(Icons.arrow_forward_ios_rounded,
                    size: 14,
                    color: isDark
                        ? AppColors.darkTextSecondary
                        : AppColors.lightTextSecondary),
                onTap: () => Navigator.push(context,
                    MaterialPageRoute(builder: (_) => const AllergiesScreen())),
              );
            }),
          ]),

          const SizedBox(height: 20),

          // ── Statistiques perso ────────────────────────────
          _SectionTitle('Mes statistiques'),
          const SizedBox(height: 10),
          Consumer<CommandeProvider>(builder: (_, cmdProv, __) {
            return GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 1.4,
              children: [
                StatCard(
                    label: 'Commandes',
                    value: cmdProv.totalCommandes.toString(),
                    icon: Icons.receipt_long_rounded,
                    color: AppColors.primary),
                StatCard(
                    label: 'Retirées',
                    value: cmdProv.retirees.toString(),
                    icon: Icons.check_circle_rounded,
                    color: AppColors.success),
                StatCard(
                    label: 'En attente',
                    value: cmdProv.enAttente.toString(),
                    icon: Icons.schedule_rounded,
                    color: AppColors.warning),
                StatCard(
                    label: 'Annulées',
                    value: cmdProv.annulees.toString(),
                    icon: Icons.cancel_rounded,
                    color: isDark
                        ? AppColors.darkTextSecondary
                        : AppColors.lightTextSecondary),
              ],
            );
          }),

          const SizedBox(height: 24),

          // ── Déconnexion ───────────────────────────────────
          AppButton(
            label: 'Se déconnecter',
            icon: Icons.logout_rounded,
            outlined: true,
            color: AppColors.error,
            // Déconnexion en cours (jusqu'à quelques secondes hors ligne)
            loading: auth.loading,
            onPressed: () => _showLogoutDialog(context),
          ),

          const SizedBox(height: 40),
        ]),
      ),
    );
  }

  void _showLogoutDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Se déconnecter ?'),
        content: const Text(
            'Vous devrez vous reconnecter pour accéder à l\'application.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogCtx),
              child: const Text('Annuler')),
          ElevatedButton(
              style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.error,
                  foregroundColor: Colors.white),
              onPressed: () {
                Navigator.pop(dialogCtx);
                dialogCtx.read<AuthProvider>().logout();
              },
              child: const Text('Déconnecter')),
        ],
      ),
    );
  }

  // ── Photo de profil ─────────────────────────────────────────
  Future<void> _choisirPhoto(BuildContext context) async {
    final auth = context.read<AuthProvider>();
    final source = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetCtx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            leading: const Icon(Icons.photo_library_rounded),
            title: const Text('Choisir dans la galerie'),
            onTap: () => Navigator.pop(sheetCtx, 'galerie'),
          ),
          ListTile(
            leading: const Icon(Icons.photo_camera_rounded),
            title: const Text('Prendre une photo'),
            onTap: () => Navigator.pop(sheetCtx, 'camera'),
          ),
          if (auth.user?.photoUrl != null)
            ListTile(
              leading: const Icon(Icons.delete_outline_rounded,
                  color: AppColors.error),
              title: const Text('Retirer la photo',
                  style: TextStyle(color: AppColors.error)),
              onTap: () => Navigator.pop(sheetCtx, 'retirer'),
            ),
        ]),
      ),
    );
    if (source == null || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);

    String? erreur;
    if (source == 'retirer') {
      erreur = await auth.retirerPhoto();
    } else {
      final XFile? image;
      try {
        image = await ImagePicker().pickImage(
          source: source == 'camera' ? ImageSource.camera : ImageSource.gallery,
          // Réduite sur le téléphone : envoi plus rapide (le serveur la redimensionne aussi)
          maxWidth: 1024,
          maxHeight: 1024,
          imageQuality: 85,
        );
      } on PlatformException catch (e) {
        final refus = e.code.contains('access_denied');
        messenger.showSnackBar(SnackBar(
            content: Text(refus
                ? "Accès refusé. Autorisez l'appareil photo ou la galerie dans les réglages du téléphone."
                : "Impossible d'ouvrir l'appareil photo ou la galerie.")));
        return;
      } catch (_) {
        messenger.showSnackBar(const SnackBar(
            content: Text("Impossible d'ouvrir l'appareil photo ou la galerie.")));
        return;
      }
      if (image == null) return; // annulé
      final octets = await image.readAsBytes();
      if (octets.length > 5 * 1024 * 1024) {
        messenger.showSnackBar(const SnackBar(
            content: Text('La photo ne doit pas dépasser 5 Mo.')));
        return;
      }
      erreur = await auth.changerPhoto(octets, image.name);
    }
    messenger.showSnackBar(SnackBar(
      content: Text(erreur ??
          (source == 'retirer'
              ? 'Photo de profil retirée.'
              : 'Photo de profil mise à jour.')),
      backgroundColor: erreur == null ? AppColors.success : AppColors.error,
    ));
  }
}

// ══════════════════════════════════════════════════════════════
// WIDGETS HELPERS
// ══════════════════════════════════════════════════════════════

class _SectionTitle extends StatelessWidget {
  final String title;
  const _SectionTitle(this.title);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Text(title,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
            color: isDark
                ? AppColors.darkTextSecondary
                : AppColors.lightTextSecondary,
            fontWeight: FontWeight.w600));
  }
}

class _InfoCard extends StatelessWidget {
  final List<Widget> children;
  const _InfoCard({required this.children});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
          color: isDark ? AppColors.darkCard : AppColors.lightCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
              color: isDark ? AppColors.darkBorder : AppColors.lightBorder)),
      child: Column(children: children),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow(
      {required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(0.08),
              borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, color: AppColors.primary, size: 18),
        ),
        const SizedBox(width: 14),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          Text(value, style: Theme.of(context).textTheme.titleSmall),
        ])),
      ]),
    );
  }
}
