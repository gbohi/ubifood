// lib/core/widgets/common_widgets.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:shimmer/shimmer.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/models/models.dart';

// ══════════════════════════════════════════════════════════════
// PHOTO DE PROFIL (ou initiales)
// ══════════════════════════════════════════════════════════════

/// Contenu d'un avatar : la photo de l'utilisateur si elle existe,
/// sinon ses initiales. Le conteneur parent fournit forme et fond
/// (penser à clipBehavior: Clip.antiAlias).
class PhotoProfil extends StatelessWidget {
  final AuthUser? user;
  final double fontSize;
  final Color couleurTexte;

  const PhotoProfil({
    super.key,
    required this.user,
    this.fontSize = 16,
    this.couleurTexte = Colors.white,
  });

  @override
  Widget build(BuildContext context) {
    final initiales = Center(
        child: Text(user?.initiales ?? 'U',
            style: TextStyle(
                color: couleurTexte,
                fontSize: fontSize,
                fontWeight: FontWeight.w700)));
    final url = user?.photoUrl;
    if (url == null) return initiales;
    return Semantics(
      label: 'Photo de profil',
      image: true,
      child: CachedNetworkImage(
        imageUrl: url,
        fit: BoxFit.cover,
        width: double.infinity,
        height: double.infinity,
        placeholder: (_, __) => initiales,
        errorWidget: (_, __, ___) => initiales,
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// APP BUTTON
// ══════════════════════════════════════════════════════════════

class AppButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final bool outlined;
  final IconData? icon;
  final Color? color;
  final double? width;

  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.loading = false,
    this.outlined = false,
    this.icon,
    this.color,
    this.width,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final effectiveColor =
        color ?? (isDark ? AppColors.accent : AppColors.primary);
    final effectiveFg = color != null
        ? Colors.white
        : (isDark ? AppColors.primary : Colors.white);

    final btn = outlined
        ? OutlinedButton(
            onPressed: loading ? null : onPressed,
            style: OutlinedButton.styleFrom(
              foregroundColor: color ?? AppColors.primary,
              side: BorderSide(color: color ?? AppColors.primary),
              minimumSize: Size(width ?? double.infinity, 50),
            ),
            child: _child(context, color ?? AppColors.primary),
          )
        : ElevatedButton(
            onPressed: loading ? null : onPressed,
            style: ElevatedButton.styleFrom(
              backgroundColor: effectiveColor,
              foregroundColor: effectiveFg,
              minimumSize: Size(width ?? double.infinity, 50),
            ),
            child: _child(context, effectiveFg),
          );
    return btn;
  }

  Widget _child(BuildContext context, Color couleurIndicateur) {
    if (loading) {
      // Couleur du texte du bouton : blanc sur un bouton contour (fond
      // clair) rendait l'indicateur invisible
      return Semantics(
        label: '$label en cours',
        child: SizedBox(
          width: 22,
          height: 22,
          child: CircularProgressIndicator(
              strokeWidth: 2, color: couleurIndicateur),
        ),
      );
    }
    if (icon != null) {
      return Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 18),
        const SizedBox(width: 8),
        Text(label),
      ]);
    }
    return Text(label);
  }
}

// ══════════════════════════════════════════════════════════════
// STATUT BADGE
// ══════════════════════════════════════════════════════════════

class StatutBadge extends StatelessWidget {
  final StatutCommande statut;
  const StatutBadge({super.key, required this.statut});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final (TonPastille ton, IconData icon) = switch (statut) {
      StatutCommande.enAttente => (TonPastille.or, Icons.schedule_rounded),
      StatutCommande.retiree => (TonPastille.vert, Icons.check_circle_rounded),
      StatutCommande.annulee => (TonPastille.gris, Icons.cancel_rounded),
    };
    // Couleurs des pastilles, lisibles en mode sombre
    final (bg, fg) = couleursPastille(ton, isDark);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 13, color: fg),
        const SizedBox(width: 4),
        Text(statut.label,
            style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.w600, color: fg)),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// STAT CARD — corrigé pour éviter le bottom overflow
// ══════════════════════════════════════════════════════════════

class StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;

  const StatCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // En dark mode, primary (bleu marine) invisible → accent
    final effectiveColor =
        (isDark && color == AppColors.primary) ? AppColors.accent : color;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isDark ? AppColors.darkCard : AppColors.lightCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
              color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
        ),
        child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // ── Icône (droite) + Valeur (gauche) sur même ligne ──
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Text(value,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800, color: effectiveColor)),
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                        color: effectiveColor.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(10)),
                    child: Icon(icon, color: effectiveColor, size: 18),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(label,
                  style: Theme.of(context).textTheme.bodySmall,
                  overflow: TextOverflow.ellipsis),
            ]),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// SHIMMER LOADER
// ══════════════════════════════════════════════════════════════

class ShimmerCard extends StatelessWidget {
  final double height;
  const ShimmerCard({super.key, this.height = 100});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Shimmer.fromColors(
      baseColor: isDark ? const Color(0xFF1E2D4A) : const Color(0xFFEEEEEE),
      highlightColor:
          isDark ? const Color(0xFF2A3F60) : const Color(0xFFF5F5F5),
      child: Container(
        height: height,
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
            color: Colors.white, borderRadius: BorderRadius.circular(16)),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// GRADIENT HEADER CARD
// ══════════════════════════════════════════════════════════════

class GradientHeaderCard extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final List<Color>? colors;

  const GradientHeaderCard({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
    this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: colors ?? [AppColors.primary, AppColors.primaryDark]),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
              color: AppColors.primary.withOpacity(0.3),
              blurRadius: 20,
              offset: const Offset(0, 8))
        ],
      ),
      child: Row(children: [
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w700)),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(subtitle!,
                style: TextStyle(
                    color: Colors.white.withOpacity(0.8), fontSize: 13)),
          ],
        ])),
        if (trailing != null) trailing!,
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// EMPTY STATE
// ══════════════════════════════════════════════════════════════

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;

  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // Marine invisible sur fond sombre : vert en mode sombre
    final couleur = isDark ? AppColors.accent : AppColors.primary;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
                color: couleur.withOpacity(isDark ? 0.12 : 0.08),
                shape: BoxShape.circle),
            child: Icon(icon, size: 36, color: couleur.withOpacity(0.6)),
          ),
          const SizedBox(height: 16),
          Text(title,
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center),
          if (subtitle != null) ...[
            const SizedBox(height: 8),
            Text(subtitle!,
                style: Theme.of(context).textTheme.bodyMedium,
                textAlign: TextAlign.center),
          ],
          if (action != null) ...[
            const SizedBox(height: 20),
            action!,
          ],
        ]),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION HEADER
// ══════════════════════════════════════════════════════════════

class SectionHeader extends StatelessWidget {
  final String title;
  final String? action;
  final VoidCallback? onAction;

  const SectionHeader(
      {super.key, required this.title, this.action, this.onAction});

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Expanded(
          child: Text(title, style: Theme.of(context).textTheme.titleLarge)),
      if (action != null)
        GestureDetector(
          onTap: onAction,
          child: Text(action!,
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: Theme.of(context).brightness == Brightness.dark
                      ? AppColors.accent
                      : AppColors.primary)),
        ),
    ]);
  }
}

// ══════════════════════════════════════════════════════════════
// PLAT CARD
// ══════════════════════════════════════════════════════════════

class PlatCard extends StatelessWidget {
  final Plat plat;
  final bool selected;
  final VoidCallback? onTap;

  const PlatCard({
    super.key,
    required this.plat,
    this.selected = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          color: isDark ? AppColors.darkCard : AppColors.lightCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
              color: selected
                  ? AppColors.primary
                  : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
              width: selected ? 2 : 1),
          boxShadow: selected
              ? [
                  BoxShadow(
                      color: AppColors.primary.withOpacity(0.15),
                      blurRadius: 12,
                      offset: const Offset(0, 4))
                ]
              : [],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // Image
          ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
            child: Stack(children: [
              plat.imageUrl != null
                  ? Image.network(plat.imageUrl!,
                      height: 140,
                      width: double.infinity,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => _placeholder())
                  : _placeholder(),
              if (selected)
                Positioned(
                    top: 8,
                    right: 8,
                    child: Container(
                      width: 28,
                      height: 28,
                      decoration: const BoxDecoration(
                          color: AppColors.primary, shape: BoxShape.circle),
                      child: const Icon(Icons.check_rounded,
                          color: Colors.white, size: 16),
                    )),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(plat.nom,
                  style: Theme.of(context).textTheme.titleMedium,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
              if (plat.description.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(plat.description,
                    style: Theme.of(context).textTheme.bodySmall,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis),
              ],
              if (plat.typePlatLibelle != null) ...[
                const SizedBox(height: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                      color: AppColors.primary.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(6)),
                  child: Text(plat.typePlatLibelle!,
                      style: TextStyle(
                          fontSize: 11,
                          color: AppColors.primary,
                          fontWeight: FontWeight.w500)),
                ),
              ],
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _placeholder() => Container(
        height: 140,
        width: double.infinity,
        color: AppColors.primary.withOpacity(0.08),
        child: const Icon(Icons.restaurant_menu_rounded,
            size: 40, color: AppColors.primary),
      );
}

// ══════════════════════════════════════════════════════════════
// EN-TÊTE MARINE DES ÉCRANS (comme l'accueil)
// ══════════════════════════════════════════════════════════════

/// En-tête marine commun aux onglets et aux écrans poussés : titre à gauche,
/// sous-titre, actions à droite et contenu optionnel dessous (pastilles,
/// sélecteur de mois…). Flèche de retour seulement sur un écran poussé
/// (jamais sur un onglet de la barre du bas).
class EnTeteMarine extends StatelessWidget {
  final String titre;
  final String? sousTitre;
  final List<Widget> actions;
  final Widget? bas;

  /// null : flèche affichée si l'écran peut être fermé (écran poussé)
  final bool? retour;
  final VoidCallback? onRetour;
  final double margeBas;

  const EnTeteMarine({
    super.key,
    required this.titre,
    this.sousTitre,
    this.actions = const [],
    this.bas,
    this.retour,
    this.onRetour,
    this.margeBas = 14,
  });

  @override
  Widget build(BuildContext context) {
    final avecRetour = retour ?? (ModalRoute.of(context)?.canPop ?? false);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Container(
        width: double.infinity,
        decoration: const BoxDecoration(gradient: AppColors.heroGradient),
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: EdgeInsets.fromLTRB(avecRetour ? 4 : 16, 14, 16, margeBas),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                if (avecRetour)
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded,
                        color: Colors.white, size: 20),
                    tooltip: 'Retour',
                    onPressed:
                        onRetour ?? () => Navigator.of(context).maybePop(),
                  ),
                Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Semantics(
                          header: true,
                          child: Text(titre,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 19,
                                  fontWeight: FontWeight.w700)),
                        ),
                        if (sousTitre != null && sousTitre!.isNotEmpty) ...[
                          const SizedBox(height: 1),
                          Text(sousTitre!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  color: Colors.white.withOpacity(0.65),
                                  fontSize: 11.5)),
                        ],
                      ]),
                ),
                for (var i = 0; i < actions.length; i++) ...[
                  if (i > 0) const SizedBox(width: 8),
                  actions[i],
                ],
              ]),
              if (bas != null)
                Padding(
                  padding: EdgeInsets.only(top: 12, left: avecRetour ? 12 : 0),
                  child: bas!,
                ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Bouton carré translucide de l'en-tête marine (filtres, calendrier…)
class EnTeteBouton extends StatelessWidget {
  final IconData icone;
  final String tooltip;
  final VoidCallback? onPressed;

  /// Pastille rouge (nombre) en haut à droite ; 0 : masquée
  final int badge;

  const EnTeteBouton({
    super.key,
    required this.icone,
    required this.tooltip,
    this.onPressed,
    this.badge = 0,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Stack(clipBehavior: Clip.none, children: [
        Material(
          color: Colors.white.withOpacity(0.1),
          borderRadius: BorderRadius.circular(11),
          child: InkWell(
            borderRadius: BorderRadius.circular(11),
            onTap: onPressed,
            child: SizedBox(
              width: 38,
              height: 38,
              child: Icon(icone, color: Colors.white, size: 20),
            ),
          ),
        ),
        if (badge > 0)
          Positioned(
            top: -4,
            right: -4,
            child: IgnorePointer(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                decoration: BoxDecoration(
                  color: AppColors.error,
                  borderRadius: BorderRadius.circular(9),
                  border: Border.all(color: AppColors.primary, width: 2),
                ),
                child: Text(badge > 99 ? '99+' : '$badge',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9.5,
                        fontWeight: FontWeight.w700)),
              ),
            ),
          ),
      ]),
    );
  }
}

/// Pastille translucide de l'en-tête (agence, équipe…), touchable
class EnTetePastille extends StatelessWidget {
  final IconData icone;
  final String label;
  final VoidCallback? onTap;
  const EnTetePastille(
      {super.key, required this.icone, required this.label, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withOpacity(0.1),
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: Colors.white.withOpacity(0.15))),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icone, size: 13, color: Colors.white),
            const SizedBox(width: 4),
            Flexible(
              child: Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontSize: 11.5)),
            ),
          ]),
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// PASTILLES DE STATUT ET DE FILTRE
// ══════════════════════════════════════════════════════════════

enum TonPastille { or, vert, gris, rouge, bleu }

/// Couleurs (fond, texte) d'une pastille selon le thème
(Color, Color) couleursPastille(TonPastille ton, bool isDark) {
  switch (ton) {
    case TonPastille.or:
      return isDark
          ? (AppColors.warning.withOpacity(0.15), const Color(0xFFFFC94D))
          : (const Color(0xFFFFF3D6), const Color(0xFFB97800));
    case TonPastille.vert:
      return isDark
          ? (AppColors.accent.withOpacity(0.14), AppColors.accent)
          : (AppColors.accentLight, const Color(0xFF1F9D55));
    case TonPastille.gris:
      return isDark
          ? (Colors.white.withOpacity(0.07), AppColors.darkTextSecondary)
          : (const Color(0xFFF1F4F8), AppColors.lightTextSecondary);
    case TonPastille.rouge:
      return isDark
          ? (const Color(0xFFFF5A3C).withOpacity(0.15), const Color(0xFFFF8A73))
          : (const Color(0xFFFDE8E4), const Color(0xFFD0452C));
    case TonPastille.bleu:
      return isDark
          ? (Colors.white.withOpacity(0.08), AppColors.darkTextSecondary)
          : (AppColors.infoLight, AppColors.primaryLight);
  }
}

class PastilleStatut extends StatelessWidget {
  final String label;
  final IconData? icone;
  final TonPastille ton;
  const PastilleStatut(
      {super.key, required this.label, this.icone, required this.ton});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final (fond, texte) = couleursPastille(ton, isDark);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration:
          BoxDecoration(color: fond, borderRadius: BorderRadius.circular(20)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icone != null) ...[
          Icon(icone, size: 11, color: texte),
          const SizedBox(width: 3),
        ],
        Flexible(
          child: Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 10.5, fontWeight: FontWeight.w700, color: texte)),
        ),
      ]),
    );
  }
}

/// Pastille de filtre avec compteur (« Toutes 6 »)
class FiltrePastille extends StatelessWidget {
  final String label;
  final int? compte;
  final bool actif;
  final VoidCallback onTap;
  const FiltrePastille({
    super.key,
    required this.label,
    this.compte,
    required this.actif,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // Mode sombre : marine invisible sur le fond, la pastille active est verte
    final fondActif = isDark ? AppColors.accent : AppColors.primary;
    final texteActif = isDark ? AppColors.primary : Colors.white;
    final texte = actif
        ? texteActif
        : (isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary);
    return Semantics(
      button: true,
      selected: actif,
      child: Material(
        color: actif
            ? fondActif
            : (isDark ? AppColors.darkCard : AppColors.lightCard),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: BorderSide(
                color: actif
                    ? fondActif
                    : (isDark ? AppColors.darkBorder : AppColors.lightBorder))),
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(label,
                  style: TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w600, color: texte)),
              if (compte != null) ...[
                const SizedBox(width: 4),
                Text('$compte',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: texte.withOpacity(0.7))),
              ],
            ]),
          ),
        ),
      ),
    );
  }
}

/// Rangée de pastilles de filtre défilante horizontalement
class RangeeFiltres extends StatelessWidget {
  final List<Widget> filtres;
  final EdgeInsetsGeometry padding;
  const RangeeFiltres(
      {super.key,
      required this.filtres,
      this.padding = const EdgeInsets.fromLTRB(14, 12, 14, 0)});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: padding,
      child: Row(children: [
        for (var i = 0; i < filtres.length; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          filtres[i],
        ],
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// LIBELLÉ DE SECTION, CARTE-LISTE, BANDEAU
// ══════════════════════════════════════════════════════════════

/// « CETTE SEMAINE », « CANTINE »… (petites capitales grises)
class LibelleSection extends StatelessWidget {
  final String texte;
  final EdgeInsetsGeometry padding;
  const LibelleSection(this.texte,
      {super.key, this.padding = const EdgeInsets.fromLTRB(2, 6, 2, 8)});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: padding,
      child: Semantics(
        header: true,
        child: Text(texte.toUpperCase(),
            style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.6,
                color: isDark
                    ? AppColors.darkTextSecondary
                    : AppColors.lightTextSecondary)),
      ),
    );
  }
}

/// Carte blanche dont les lignes sont séparées par un filet
class CarteListe extends StatelessWidget {
  final List<Widget> lignes;
  final Color? bordure;
  final double epaisseurBordure;
  const CarteListe(
      {super.key,
      required this.lignes,
      this.bordure,
      this.epaisseurBordure = 1});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final filet = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: bordure ?? filet, width: epaisseurBordure),
      ),
      child: Column(children: [
        for (var i = 0; i < lignes.length; i++) ...[
          if (i > 0) Divider(height: 1, thickness: 1, color: filet),
          lignes[i],
        ],
      ]),
    );
  }
}

/// Bandeau d'information d'une ligne (« Commandes ouvertes · ferme dans … »)
class BandeauInfo extends StatelessWidget {
  final IconData icone;
  final String texte;
  final TonPastille ton;
  final Widget? action;
  const BandeauInfo({
    super.key,
    required this.icone,
    required this.texte,
    required this.ton,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    var (fond, couleur) = couleursPastille(ton, isDark);
    if (ton == TonPastille.or && !isDark) fond = AppColors.warningLight;
    if (ton == TonPastille.gris && isDark) fond = AppColors.darkCard;
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(
          12, action == null ? 10 : 4, 6, action == null ? 10 : 4),
      decoration:
          BoxDecoration(color: fond, borderRadius: BorderRadius.circular(12)),
      child: Row(children: [
        Icon(icone, size: 17, color: couleur),
        const SizedBox(width: 8),
        Expanded(
          child: Text(texte,
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w600, color: couleur)),
        ),
        if (action != null) action!,
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// VIGNETTE DE PLAT, AVATAR
// ══════════════════════════════════════════════════════════════

/// Photo d'un plat, ou couverts sur fond doux (lisibles en mode sombre)
class VignettePlat extends StatelessWidget {
  final String? url;
  final double taille;
  final double rayon;
  const VignettePlat(
      {super.key, required this.url, this.taille = 42, this.rayon = 10});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final substitut = Container(
      width: taille,
      height: taille,
      color: isDark
          ? AppColors.accent.withOpacity(0.12)
          : AppColors.primary.withOpacity(0.06),
      child: Icon(Icons.restaurant_rounded,
          size: taille * 0.45,
          color: isDark
              ? AppColors.accent.withOpacity(0.8)
              : AppColors.primary.withOpacity(0.45)),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(rayon),
      child: url == null
          ? substitut
          : Image.network(url!,
              width: taille,
              height: taille,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => substitut),
    );
  }
}

/// Initiales d'un nom affiché (« KONE Fatou » → « KF »)
String initialesDe(String nom) {
  final mots = nom.trim().split(RegExp(r'\s+')).where((m) => m.isNotEmpty);
  final lettres = mots.take(2).map((m) => m[0].toUpperCase()).join();
  return lettres.isEmpty ? '?' : lettres;
}

/// Avatar carré : photo si disponible, sinon initiales du nom
class AvatarNom extends StatelessWidget {
  final String nom;
  final String? photoUrl;
  final double taille;
  const AvatarNom(
      {super.key, required this.nom, this.photoUrl, this.taille = 36});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final couleur = isDark ? AppColors.accent : AppColors.primaryLight;
    final initiales = Center(
      child: Text(initialesDe(nom),
          style: TextStyle(
              color: couleur,
              fontWeight: FontWeight.w700,
              fontSize: taille * 0.33)),
    );
    return Container(
      width: taille,
      height: taille,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color:
            isDark ? AppColors.accent.withOpacity(0.14) : AppColors.infoLight,
        borderRadius: BorderRadius.circular(taille * 0.3),
      ),
      child: photoUrl == null
          ? initiales
          : CachedNetworkImage(
              imageUrl: photoUrl!,
              fit: BoxFit.cover,
              placeholder: (_, __) => initiales,
              errorWidget: (_, __, ___) => initiales),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// BOUTON VERT (dégradé, comme « Se connecter »)
// ══════════════════════════════════════════════════════════════

class BoutonVert extends StatelessWidget {
  final String label;
  final IconData? icone;
  final VoidCallback? onPressed;
  final bool chargement;
  final double hauteur;

  /// Bouton compact (« Réserver » dans une carte) : largeur du contenu
  final bool compact;

  const BoutonVert({
    super.key,
    required this.label,
    this.icone,
    this.onPressed,
    this.chargement = false,
    this.hauteur = 50,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final actif = onPressed != null && !chargement;
    final rayon = BorderRadius.circular(compact ? 10 : 14);
    final contenu = chargement
        ? SizedBox(
            width: compact ? 16 : 20,
            height: compact ? 16 : 20,
            child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppColors.primary,
                semanticsLabel: '$label en cours'))
        : Row(mainAxisSize: MainAxisSize.min, children: [
            if (icone != null) ...[
              Icon(icone, size: compact ? 16 : 18, color: AppColors.primary),
              const SizedBox(width: 6),
            ],
            Flexible(
              child: Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: AppColors.primary,
                      fontSize: compact ? 12.5 : 15,
                      fontWeight: FontWeight.w700)),
            ),
          ]);
    return Semantics(
      button: true,
      enabled: actif,
      label: chargement ? null : label,
      excludeSemantics: !chargement,
      child: Opacity(
        opacity: onPressed == null ? 0.5 : 1,
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: AppColors.accentGradient,
            borderRadius: rayon,
            boxShadow: compact || !actif
                ? null
                : [
                    BoxShadow(
                        color: AppColors.accentDark.withOpacity(0.3),
                        blurRadius: 16,
                        offset: const Offset(0, 6)),
                  ],
          ),
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              borderRadius: rayon,
              onTap: actif ? onPressed : null,
              child: SizedBox(
                height: compact ? 36 : hauteur,
                width: compact ? null : double.infinity,
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: compact ? 12 : 16),
                  child: Center(child: contenu),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
