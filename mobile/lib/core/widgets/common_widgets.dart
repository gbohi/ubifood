// lib/core/widgets/common_widgets.dart

import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/models/models.dart';

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
            child: _child(context),
          )
        : ElevatedButton(
            onPressed: loading ? null : onPressed,
            style: ElevatedButton.styleFrom(
              backgroundColor: effectiveColor,
              foregroundColor: effectiveFg,
              minimumSize: Size(width ?? double.infinity, 50),
            ),
            child: _child(context),
          );
    return btn;
  }

  Widget _child(BuildContext context) {
    if (loading) {
      return const SizedBox(
        width: 22,
        height: 22,
        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
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
    Color bg, fg;
    IconData icon;
    switch (statut) {
      case StatutCommande.enAttente:
        bg = AppColors.warningLight;
        fg = AppColors.warning;
        icon = Icons.schedule_rounded;
        break;
      case StatutCommande.retiree:
        bg = AppColors.successLight;
        fg = AppColors.success;
        icon = Icons.check_circle_rounded;
        break;
      case StatutCommande.annulee:
        bg = const Color(0xFFF1F5F9);
        fg = AppColors.lightTextSecondary;
        icon = Icons.cancel_rounded;
        break;
    }
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
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.08),
                shape: BoxShape.circle),
            child:
                Icon(icon, size: 36, color: AppColors.primary.withOpacity(0.5)),
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
                  color: AppColors.primary)),
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
