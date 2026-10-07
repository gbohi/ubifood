// lib/features/splash/splash_screen.dart

import 'dart:math';
import 'package:flutter/material.dart';
import '../../shared/theme/app_theme.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});
  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {

  late AnimationController _ctrlMain;
  late AnimationController _ctrlPulse;
  late AnimationController _ctrlProgress;
  late AnimationController _ctrlParticles;

  late Animation<double> _fadeIn;
  late Animation<double> _scaleIcon;
  late Animation<Offset>  _slideTagline;
  late Animation<double> _fadeTagline;
  late Animation<double> _pulse;
  late Animation<double> _progress;
  late Animation<double> _fadeParticles;

  @override
  void initState() {
    super.initState();

    _ctrlMain = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1200));
    _fadeIn = CurvedAnimation(parent: _ctrlMain, curve: Curves.easeOut);
    _scaleIcon = Tween<double>(begin: 0.5, end: 1.0).animate(
      CurvedAnimation(parent: _ctrlMain,
        curve: const Interval(0.0, 0.7, curve: Curves.elasticOut)));
    _slideTagline = Tween<Offset>(
      begin: const Offset(0, 0.5), end: Offset.zero,
    ).animate(CurvedAnimation(parent: _ctrlMain,
      curve: const Interval(0.4, 1.0, curve: Curves.easeOut)));
    _fadeTagline = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _ctrlMain,
        curve: const Interval(0.4, 1.0, curve: Curves.easeOut)));
    _fadeParticles = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _ctrlMain,
        curve: const Interval(0.6, 1.0, curve: Curves.easeOut)));

    _ctrlPulse = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 2000))
      ..repeat(reverse: true);
    _pulse = Tween<double>(begin: 0.96, end: 1.04).animate(
      CurvedAnimation(parent: _ctrlPulse, curve: Curves.easeInOut));

    _ctrlProgress = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 2500));
    _progress = CurvedAnimation(
      parent: _ctrlProgress, curve: Curves.easeInOut);

    _ctrlParticles = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 3000))
      ..repeat();

    _ctrlMain.forward();
    Future.delayed(const Duration(milliseconds: 300), () {
      if (mounted) _ctrlProgress.forward();
    });
  }

  @override
  void dispose() {
    _ctrlMain.dispose();
    _ctrlPulse.dispose();
    _ctrlProgress.dispose();
    _ctrlParticles.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;

    return Scaffold(
      backgroundColor: const Color(0xFF061728),
      body: Stack(children: [

        // ── Fond gradient ──────────────────────────────────────
        Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF061728), Color(0xFF092440), Color(0xFF0d3360)],
              stops: [0.0, 0.45, 1.0],
            ),
          ),
        ),

        // ── Halos lumineux ─────────────────────────────────────
        Positioned(top: -80, right: -80,
          child: Container(width: 360, height: 360,
            decoration: BoxDecoration(shape: BoxShape.circle,
              color: const Color(0xFF1a5a8a).withOpacity(0.15)))),
        Positioned(bottom: -60, left: -60,
          child: AnimatedBuilder(
            animation: _ctrlPulse,
            builder: (_, __) => Transform.scale(
              scale: _pulse.value,
              child: Container(width: 280, height: 280,
                decoration: BoxDecoration(shape: BoxShape.circle,
                  color: AppColors.accent.withOpacity(0.08)))))),

        // ── Grille de points ───────────────────────────────────
        FadeTransition(opacity: _fadeIn,
          child: CustomPaint(size: size, painter: _DotGridPainter())),

        // ── Anneaux ────────────────────────────────────────────
        Center(child: AnimatedBuilder(
          animation: _ctrlPulse,
          builder: (_, __) => CustomPaint(
            size: const Size(400, 400),
            painter: _RingsPainter(_pulse.value)))),

        // ── Particules ─────────────────────────────────────────
        FadeTransition(opacity: _fadeParticles,
          child: AnimatedBuilder(
            animation: _ctrlParticles,
            builder: (_, __) => CustomPaint(
              size: size,
              painter: _ParticlesPainter(_ctrlParticles.value)))),

        // ── Contenu central ────────────────────────────────────
        Center(child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [

            const SizedBox(height: 40),

            // Icône
            AnimatedBuilder(
              animation: _ctrlMain,
              builder: (_, child) => FadeTransition(
                opacity: _fadeIn,
                child: ScaleTransition(scale: _scaleIcon, child: child)),
              child: AnimatedBuilder(
                animation: _ctrlPulse,
                builder: (_, child) =>
                  Transform.scale(scale: _pulse.value, child: child),
                child: _AppIcon())),

            const SizedBox(height: 36),

            // Logo + tagline
            FadeTransition(
              opacity: _fadeTagline,
              child: SlideTransition(
                position: _slideTagline,
                child: Column(children: [

                  // "UbiFood" avec shader
                  ShaderMask(
                    shaderCallback: (bounds) => const LinearGradient(
                      colors: [Colors.white, Color(0xFFc8f5e0)],
                    ).createShader(bounds),
                    child: const Text('UbiFood',
                      style: TextStyle(fontSize: 52,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        letterSpacing: -2, height: 1))),

                  const SizedBox(height: 8),

                  // Trait vert dégradé
                  Container(
                    width: 160, height: 2.5,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(colors: [
                        AppColors.accent.withOpacity(0),
                        AppColors.accent,
                        AppColors.accent.withOpacity(0),
                      ]),
                      borderRadius: BorderRadius.circular(2))),

                  const SizedBox(height: 14),

                  // Tagline
                  Text('CANTINE INTELLIGENTE',
                    style: TextStyle(
                      fontSize: 11, fontWeight: FontWeight.w400,
                      color: Colors.white.withOpacity(0.4),
                      letterSpacing: 4)),
                ]),
              ),
            ),
          ],
        )),

        // ── Barre de progression ────────────────────────────────
        Positioned(
          bottom: 100, left: 60, right: 60,
          child: FadeTransition(
            opacity: _fadeTagline,
            child: Column(children: [
              AnimatedBuilder(
                animation: _progress,
                builder: (_, __) => ClipRRect(
                  borderRadius: BorderRadius.circular(2),
                  child: LinearProgressIndicator(
                    value: _progress.value,
                    backgroundColor: Colors.white.withOpacity(0.08),
                    valueColor: AlwaysStoppedAnimation<Color>(
                      AppColors.accent.withOpacity(0.7)),
                    minHeight: 2.5))),
              const SizedBox(height: 16),
              // Points
              AnimatedBuilder(
                animation: _ctrlParticles,
                builder: (_, __) {
                  final t = _ctrlParticles.value;
                  return Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(4, (i) {
                      final phase = (t - i * 0.22) % 1.0;
                      final op = (sin(phase * pi * 2) * 0.5 + 0.5);
                      return Container(
                        width: 5, height: 5,
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.accent.withOpacity(
                            0.15 + op * 0.7)));
                    }));
                }),
            ])),
        ),

        // ── Signature bas ──────────────────────────────────────
        Positioned(bottom: 36, left: 0, right: 0,
          child: FadeTransition(
            opacity: _fadeTagline,
            child: Column(children: [
              Text('UBIPHARM',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 10, letterSpacing: 3,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withOpacity(0.25))),
              const SizedBox(height: 3),
              Text('Grossiste pharmaceutique',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 9, letterSpacing: 1,
                  color: Colors.white.withOpacity(0.15))),
            ]))),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// ICÔNE APP
// ══════════════════════════════════════════════════════════════

class _AppIcon extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 114, height: 114,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [Color(0xFF5BD988), Color(0xFF3ec970)]),
        borderRadius: BorderRadius.circular(32),
        boxShadow: [
          BoxShadow(color: AppColors.accent.withOpacity(0.45),
            blurRadius: 32, offset: const Offset(0, 12)),
          BoxShadow(color: AppColors.accent.withOpacity(0.15),
            blurRadius: 64, spreadRadius: 8),
        ]),
      child: Stack(children: [
        // Reflet
        Positioned(top: 0, left: 0, right: 0,
          child: Container(height: 48,
            decoration: BoxDecoration(
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(32)),
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.white.withOpacity(0.22),
                  Colors.white.withOpacity(0)])))),
        // Couverts
        Center(child: CustomPaint(
          size: const Size(54, 62),
          painter: _CouvertsPainter())),
      ]),
    );
  }
}

class _CouvertsPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;
    final cx = size.width * 0.3;
    final cy = size.height / 2;

    // Dents fourchette
    for (int i = 0; i < 3; i++) {
      final x = cx - 9 + i * 5.0;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(x, cy - 24, 3, 15),
          const Radius.circular(1.5)), p);
    }
    // Corps fourchette
    final fork = Path()
      ..moveTo(cx - 9, cy - 9)
      ..quadraticBezierTo(cx, cy - 3, cx + 1, cy - 9)
      ..lineTo(cx + 1, cy + 24)
      ..quadraticBezierTo(cx, cy + 27, cx - 9, cy + 24)
      ..close();
    p.color = Colors.white.withOpacity(0.95);
    canvas.drawPath(fork, p);

    // Couteau
    final kx = size.width * 0.68;
    p.color = Colors.white.withOpacity(0.9);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(kx - 1.75, cy - 24, 3.5, 48),
        const Radius.circular(1.75)), p);
    // Garde
    final guard = Path()
      ..moveTo(kx - 1.75, cy - 24)
      ..quadraticBezierTo(kx + 9, cy - 14, kx + 1.75, cy - 5)
      ..lineTo(kx - 1.75, cy - 5)
      ..close();
    p.color = Colors.white.withOpacity(0.8);
    canvas.drawPath(guard, p);
  }

  @override
  bool shouldRepaint(covariant CustomPainter _) => false;
}

// ══════════════════════════════════════════════════════════════
// PAINTERS
// ══════════════════════════════════════════════════════════════

class _RingsPainter extends CustomPainter {
  final double pulse;
  _RingsPainter(this.pulse);

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final p = Paint()..style = PaintingStyle.stroke;
    final config = [
      [130.0, 0.18, 0.9],
      [158.0, 0.10, 0.5],
      [188.0, 0.05, 0.4],
    ];
    for (final c in config) {
      p.strokeWidth = c[2];
      p.color = AppColors.accent.withOpacity(c[1]);
      canvas.drawCircle(center, c[0] * pulse, p);
    }
  }

  @override
  bool shouldRepaint(covariant _RingsPainter old) => old.pulse != pulse;
}

class _DotGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = AppColors.accent.withOpacity(0.07);
    const sp = 32.0;
    const r  = 2.0;
    for (double x = sp; x < 160; x += sp)
      for (double y = sp; y < 220; y += sp)
        canvas.drawCircle(Offset(x, y), r, p);
    for (double x = size.width - 160; x < size.width - sp; x += sp)
      for (double y = size.height - 220; y < size.height - sp; y += sp)
        canvas.drawCircle(Offset(x, y), r, p);
  }

  @override
  bool shouldRepaint(covariant CustomPainter _) => false;
}

class _ParticlesPainter extends CustomPainter {
  final double t;
  _ParticlesPainter(this.t);

  static final _rnd = Random(42);
  static final _pts = List.generate(14, (_) => [
    _rnd.nextDouble(),
    _rnd.nextDouble(),
    _rnd.nextDouble(),
    _rnd.nextDouble() * 3.5 + 1.5,
  ]);

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..style = PaintingStyle.fill;
    for (final pt in _pts) {
      final phase = (t + pt[2]) % 1.0;
      final op    = sin(phase * pi * 2) * 0.5 + 0.5;
      final dy    = sin(phase * pi * 2) * 18;
      p.color = AppColors.accent.withOpacity(op * 0.3);
      canvas.drawCircle(
        Offset(pt[0] * size.width, pt[1] * size.height + dy),
        pt[3], p);
    }
  }

  @override
  bool shouldRepaint(covariant _ParticlesPainter old) => old.t != t;
}
