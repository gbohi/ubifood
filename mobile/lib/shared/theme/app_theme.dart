// lib/shared/theme/app_theme.dart

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  // ── Couleurs Ubipharm ──────────────────────────────────────
  static const primary       = Color(0xFF092440); // Bleu marine
  static const primaryLight  = Color(0xFF0d3360); // Bleu marine clair
  static const primaryDark   = Color(0xFF061728); // Bleu marine foncé
  static const accent        = Color(0xFF5BD988); // Vert Ubipharm
  static const accentDark    = Color(0xFF3EC970); // Vert foncé
  static const accentLight   = Color(0xFFEAFBF1); // Vert très clair

  // ── Status ────────────────────────────────────────────────
  static const success       = Color(0xFF5BD988); // Vert Ubipharm
  static const successLight  = Color(0xFFEAFBF1);
  static const warning       = Color(0xFFFFAB00);
  static const warningLight  = Color(0xFFFFF8E1);
  static const error         = Color(0xFFFF1744);
  static const errorLight    = Color(0xFFFFEBEE);
  static const info          = Color(0xFF092440);
  static const infoLight     = Color(0xFFE8EEF5);

  // ── Light theme ───────────────────────────────────────────
  static const lightBackground    = Color(0xFFF4F7FA);
  static const lightSurface       = Color(0xFFFFFFFF);
  static const lightCard          = Color(0xFFFFFFFF);
  static const lightBorder        = Color(0xFFE2EAF4);
  static const lightTextPrimary   = Color(0xFF092440);
  static const lightTextSecondary = Color(0xFF5A7090);
  static const lightTextHint      = Color(0xFF9BB0C5);

  // ── Dark theme ────────────────────────────────────────────
  static const darkBackground     = Color(0xFF061220);
  static const darkSurface        = Color(0xFF0A1E35);
  static const darkCard           = Color(0xFF0E2540);
  static const darkBorder         = Color(0xFF163352);
  static const darkTextPrimary    = Color(0xFFF0F6FF);
  static const darkTextSecondary  = Color(0xFF7BA0C0);
  static const darkTextHint       = Color(0xFF4A6A88);

  // ── Gradients ─────────────────────────────────────────────
  static const primaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF092440), Color(0xFF0d3360)],
  );

  static const accentGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF5BD988), Color(0xFF3EC970)],
  );

  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF092440), Color(0xFF0F3A6E)],
  );
}

class AppTheme {
  static ThemeData light() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.primary,
        brightness: Brightness.light,
        primary: AppColors.primary,
        secondary: AppColors.accent,
        surface: AppColors.lightSurface,
        background: AppColors.lightBackground,
        error: AppColors.error,
      ),
      scaffoldBackgroundColor: AppColors.lightBackground,
      textTheme: _buildTextTheme(AppColors.lightTextPrimary, AppColors.lightTextSecondary),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.lightSurface,
        foregroundColor: AppColors.lightTextPrimary,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: GoogleFonts.inter(
          fontSize: 18, fontWeight: FontWeight.w600,
          color: AppColors.lightTextPrimary,
        ),
        iconTheme: const IconThemeData(color: AppColors.lightTextPrimary),
      ),
      cardTheme: CardTheme(
        color: AppColors.lightCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.lightBorder, width: 1),
        ),
        margin: EdgeInsets.zero,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          side: const BorderSide(color: AppColors.primary),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.lightBackground,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.lightBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.lightBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.error),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        hintStyle: GoogleFonts.inter(color: AppColors.lightTextHint, fontSize: 14),
        prefixIconColor: AppColors.accent,
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.lightSurface,
        selectedItemColor: AppColors.primary,
        unselectedItemColor: AppColors.lightTextSecondary,
        elevation: 0,
        type: BottomNavigationBarType.fixed,
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.lightBorder, thickness: 1, space: 1,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.accentLight,
        labelStyle: GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w500,
          color: AppColors.primary),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: MaterialStateProperty.resolveWith((s) =>
          s.contains(MaterialState.selected) ? AppColors.accent : null),
        trackColor: MaterialStateProperty.resolveWith((s) =>
          s.contains(MaterialState.selected) ? AppColors.accentLight : null),
      ),
    );
  }

  static ThemeData dark() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.primary,
        brightness: Brightness.dark,
        primary: AppColors.accent,
        secondary: AppColors.accent,
        surface: AppColors.darkSurface,
        background: AppColors.darkBackground,
        error: AppColors.error,
      ),
      scaffoldBackgroundColor: AppColors.darkBackground,
      textTheme: _buildTextTheme(AppColors.darkTextPrimary, AppColors.darkTextSecondary),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.darkSurface,
        foregroundColor: AppColors.darkTextPrimary,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: GoogleFonts.inter(
          fontSize: 18, fontWeight: FontWeight.w600,
          color: AppColors.darkTextPrimary,
        ),
        iconTheme: const IconThemeData(color: AppColors.darkTextPrimary),
      ),
      cardTheme: CardTheme(
        color: AppColors.darkCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.darkBorder, width: 1),
        ),
        margin: EdgeInsets.zero,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.accent,
          foregroundColor: AppColors.primary,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.accent,
          side: const BorderSide(color: AppColors.accent),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.darkCard,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.darkBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.darkBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.accent, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        hintStyle: GoogleFonts.inter(color: AppColors.darkTextHint, fontSize: 14),
        prefixIconColor: AppColors.accent,
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.darkSurface,
        selectedItemColor: AppColors.accent,
        unselectedItemColor: AppColors.darkTextSecondary,
        elevation: 0,
        type: BottomNavigationBarType.fixed,
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.darkBorder, thickness: 1, space: 1,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: MaterialStateProperty.resolveWith((s) =>
          s.contains(MaterialState.selected) ? AppColors.accent : null),
        trackColor: MaterialStateProperty.resolveWith((s) =>
          s.contains(MaterialState.selected)
            ? AppColors.accent.withOpacity(0.3) : null),
      ),
    );
  }

  static TextTheme _buildTextTheme(Color primary, Color secondary) {
    return TextTheme(
      displayLarge:   GoogleFonts.inter(fontSize: 32, fontWeight: FontWeight.w700, color: primary),
      displayMedium:  GoogleFonts.inter(fontSize: 28, fontWeight: FontWeight.w700, color: primary),
      headlineLarge:  GoogleFonts.inter(fontSize: 24, fontWeight: FontWeight.w600, color: primary),
      headlineMedium: GoogleFonts.inter(fontSize: 20, fontWeight: FontWeight.w600, color: primary),
      headlineSmall:  GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600, color: primary),
      titleLarge:     GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w600, color: primary),
      titleMedium:    GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w500, color: primary),
      titleSmall:     GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w500, color: primary),
      bodyLarge:      GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w400, color: primary),
      bodyMedium:     GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w400, color: secondary),
      bodySmall:      GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w400, color: secondary),
      labelLarge:     GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600, color: primary),
      labelMedium:    GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w500, color: secondary),
      labelSmall:     GoogleFonts.inter(fontSize: 10, fontWeight: FontWeight.w500, color: secondary),
    );
  }
}
