// lib/features/profil/profil_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../core/widgets/common_widgets.dart';
import '../allergies/allergies_screen.dart';
import '../commandes/commandes_screen.dart' show EtatCommande, etatCommande;
import 'change_password_screen.dart';
import 'qr_code_screen.dart';

class ProfilScreen extends StatefulWidget {
  const ProfilScreen({super.key});
  @override
  State<ProfilScreen> createState() => _ProfilScreenState();
}

class _ProfilScreenState extends State<ProfilScreen> {
  /// Version affichée en bas de l'écran (sans version : « UbiFood »)
  final Future<PackageInfo> _version = PackageInfo.fromPlatform().catchError(
      (Object _) => PackageInfo(
          appName: 'UbiFood', packageName: '', version: '', buildNumber: ''));

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
    final role = user?.isAdmin == true
        ? 'Administrateur'
        : auth.isGestionnaire
            ? 'Gestionnaire'
            : 'Employé';
    final detailIdentite = [
      if ((user?.username ?? '').isNotEmpty) 'Matricule ${user!.username}',
      if (user?.derniereAgence != null) user!.derniereAgence!,
    ].join(' · ');
    final identite = Row(children: [
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
                  color: Colors.white.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(
                      color: Colors.white.withOpacity(0.25), width: 2)),
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
              right: -6,
              bottom: -6,
              child: Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                    color: AppColors.accentDark,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.primary, width: 2)),
                child: const Icon(Icons.photo_camera_rounded,
                    size: 13, color: AppColors.primary),
              ),
            ),
          ]),
        ),
      ),
      const SizedBox(width: 14),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(
              (user?.fullName.isNotEmpty ?? false)
                  ? user!.fullName
                  : (user?.username ?? '—'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w700)),
          if (detailIdentite.isNotEmpty)
            Text(detailIdentite,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    color: Colors.white.withOpacity(0.7), fontSize: 12)),
          const SizedBox(height: 5),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 2),
            decoration: BoxDecoration(
                color: AppColors.accent.withOpacity(0.18),
                borderRadius: BorderRadius.circular(20)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(
                  user?.isAdmin == true
                      ? Icons.shield_outlined
                      : auth.isGestionnaire
                          ? Icons.admin_panel_settings_outlined
                          : Icons.person_outline_rounded,
                  size: 12,
                  color: AppColors.accent),
              const SizedBox(width: 4),
              Text(role,
                  style: const TextStyle(
                      color: AppColors.accent,
                      fontSize: 11,
                      fontWeight: FontWeight.w700)),
            ]),
          ),
        ]),
      ),
    ]);

    return Scaffold(
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          // ── En-tête marine + chiffres en une ligne ─────────────
          Stack(clipBehavior: Clip.none, children: [
            Column(children: [
              EnTeteMarine(titre: 'Mon profil', bas: identite, margeBas: 46),
              const SizedBox(height: 34),
            ]),
            Positioned(
              left: 14,
              right: 14,
              bottom: 0,
              child: Consumer<CommandeProvider>(builder: (_, cmdProv, __) {
                final cmds = cmdProv.mesCommandes;
                final retirees = cmds
                    .where((c) => etatCommande(c) == EtatCommande.retiree)
                    .length;
                final aRetirer = cmds.where((c) {
                  final e = etatCommande(c);
                  return e == EtatCommande.aVenir || e == EtatCommande.aRetirer;
                }).length;
                return _Chiffres(chiffres: [
                  (
                    cmds.length,
                    cmds.length > 1 ? 'commandes' : 'commande',
                    null
                  ),
                  (
                    retirees,
                    retirees > 1 ? 'retirées' : 'retirée',
                    isDark ? AppColors.accent : const Color(0xFF1F9D55)
                  ),
                  (
                    aRetirer,
                    'à retirer',
                    isDark ? const Color(0xFFFFC94D) : const Color(0xFFB97800)
                  ),
                ]);
              }),
            ),
          ]),

          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 40),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // ── Cantine ──────────────────────────────────
                  const LibelleSection('Cantine'),
                  CarteListe(lignes: [
                    _Ligne(
                      icone: Icons.qr_code_2_rounded,
                      titre: 'Mon badge QR',
                      sousTitre: 'À présenter au comptoir',
                      onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) => const QrCodeScreen())),
                    ),
                    Consumer<AllergieProvider>(builder: (_, allergieProv, __) {
                      final count = allergieProv.allergies.length;
                      return _Ligne(
                        icone: Icons.warning_amber_rounded,
                        rouge: true,
                        titre: 'Mes allergies',
                        sousTitre: count == 0
                            ? 'Aucune allergie déclarée'
                            : '$count allergie${count > 1 ? 's' : ''} '
                                'déclarée${count > 1 ? 's' : ''}',
                        onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (_) => const AllergiesScreen())),
                      );
                    }),
                  ]),
                  const SizedBox(height: 10),

                  // ── Compte ───────────────────────────────────
                  const LibelleSection('Compte'),
                  CarteListe(lignes: [
                    _Ligne(
                      icone: Icons.mail_outline_rounded,
                      titre: 'Email',
                      valeur: (user?.email.isNotEmpty ?? false)
                          ? user!.email
                          : 'Non renseigné',
                    ),
                    if (user?.dernierService != null)
                      _Ligne(
                          icone: Icons.business_center_outlined,
                          titre: 'Service',
                          valeur: user!.dernierService!),
                    if (user?.dernierPoste != null)
                      _Ligne(
                          icone: Icons.work_outline_rounded,
                          titre: 'Poste',
                          valeur: user!.dernierPoste!),
                    _Ligne(
                      icone: Icons.lock_outline_rounded,
                      titre: 'Modifier le mot de passe',
                      onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) => const ChangePasswordScreen())),
                    ),
                    _Ligne(
                      icone: Icons.dark_mode_outlined,
                      titre: 'Mode sombre',
                      fin: Switch.adaptive(
                          value: isDark,
                          activeColor: AppColors.accent,
                          onChanged: (_) => theme.toggle()),
                      onTap: theme.toggle,
                    ),
                  ]),
                  const SizedBox(height: 12),

                  // ── Déconnexion ──────────────────────────────
                  CarteListe(lignes: [
                    _Ligne(
                      icone: Icons.logout_rounded,
                      rouge: true,
                      titre: 'Se déconnecter',
                      titreRouge: true,
                      // Déconnexion en cours (jusqu'à quelques secondes
                      // hors ligne)
                      fin: auth.loading
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: AppColors.error))
                          : const SizedBox.shrink(),
                      onTap: auth.loading
                          ? null
                          : () => _showLogoutDialog(context),
                    ),
                  ]),
                  const SizedBox(height: 14),
                  FutureBuilder<PackageInfo>(
                    future: _version,
                    builder: (_, snap) => Text(
                      snap.data == null
                          ? 'UbiFood'
                          : 'UbiFood · version ${snap.data!.version}',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          fontSize: 11,
                          color: isDark
                              ? AppColors.darkTextHint
                              : AppColors.lightTextHint),
                    ),
                  ),
                ]),
          ),
        ],
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
            content:
                Text("Impossible d'ouvrir l'appareil photo ou la galerie.")));
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

/// Trois chiffres sur une ligne, à cheval sur l'en-tête
class _Chiffres extends StatelessWidget {
  final List<(int, String, Color?)> chiffres;
  const _Chiffres({required this.chiffres});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final filet = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    return Container(
      height: 64,
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: filet),
        boxShadow: [
          BoxShadow(
              color: AppColors.primary.withOpacity(isDark ? 0.3 : 0.08),
              blurRadius: 20,
              offset: const Offset(0, 6)),
        ],
      ),
      child: Row(children: [
        for (var i = 0; i < chiffres.length; i++) ...[
          if (i > 0) VerticalDivider(width: 1, thickness: 1, color: filet),
          Expanded(
            child:
                Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Text('${chiffres[i].$1}',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: chiffres[i].$3)),
              Text(chiffres[i].$2,
                  style: TextStyle(
                      fontSize: 11,
                      color: isDark
                          ? AppColors.darkTextSecondary
                          : AppColors.lightTextSecondary)),
            ]),
          ),
        ],
      ]),
    );
  }
}

/// Ligne de réglage : icône, titre (+ sous-titre), valeur ou chevron
class _Ligne extends StatelessWidget {
  final IconData icone;
  final String titre;
  final String? sousTitre;
  final String? valeur;
  final Widget? fin;
  final bool rouge;
  final bool titreRouge;
  final VoidCallback? onTap;

  const _Ligne({
    required this.icone,
    required this.titre,
    this.sousTitre,
    this.valeur,
    this.fin,
    this.rouge = false,
    this.titreRouge = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final (fond, couleur) =
        couleursPastille(rouge ? TonPastille.rouge : TonPastille.bleu, isDark);
    // Icônes lisibles en mode sombre (le marine y était invisible)
    final couleurIcone =
        rouge ? couleur : (isDark ? AppColors.accent : couleur);
    final fondIcone =
        rouge ? fond : (isDark ? AppColors.accent.withOpacity(0.12) : fond);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        child: Row(children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
                color: fondIcone, borderRadius: BorderRadius.circular(10)),
            child: Icon(icone, size: 18, color: couleurIcone),
          ),
          const SizedBox(width: 12),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(titre,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                      color: titreRouge ? couleur : null)),
              if (sousTitre != null)
                Text(sousTitre!, style: TextStyle(fontSize: 11.5, color: gris)),
            ]),
          ),
          if (valeur != null)
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 190),
              child: Text(valeur!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.right,
                  style: TextStyle(fontSize: 12.5, color: gris)),
            )
          else if (fin != null)
            fin!
          else if (onTap != null)
            Icon(Icons.chevron_right_rounded,
                size: 22,
                color:
                    isDark ? AppColors.darkTextHint : AppColors.lightTextHint),
        ]),
      ),
    );
  }
}
