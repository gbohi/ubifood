// lib/features/onboarding/onboarding_screen.dart

import 'dart:math';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../shared/theme/app_theme.dart';

// ── Clé de stockage ───────────────────────────────────────────
const _kOnboardingDone = 'onboarding_done';

/// Vérifie si l'onboarding a déjà été vu
Future<bool> onboardingDejaVu() async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getBool(_kOnboardingDone) ?? false;
}

/// Marque l'onboarding comme vu
Future<void> marquerOnboardingVu() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setBool(_kOnboardingDone, true);
}

// ══════════════════════════════════════════════════════════════
// DONNÉES DES SLIDES
// ══════════════════════════════════════════════════════════════

class _OnboardingData {
  final String titre;
  final String sousTitre;
  final String description;
  final Color couleur;
  final Color couleurAccent;
  final _SlideType type;

  const _OnboardingData({
    required this.titre,
    required this.sousTitre,
    required this.description,
    required this.couleur,
    required this.couleurAccent,
    required this.type,
  });
}

enum _SlideType { menu, commande, badge }

const _slides = [
  _OnboardingData(
    titre: 'Vos menus\nen un coup d\'œil',
    sousTitre: 'Découvrez',
    description:
        'Consultez les menus de la semaine, filtrez par agence et équipe. '
        'Commandez en 2 clics avant le délai de 48h.',
    couleur: Color(0xFF092440),
    couleurAccent: Color(0xFF5BD988),
    type: _SlideType.menu,
  ),
  _OnboardingData(
    titre: 'Commandez\nsans effort',
    sousTitre: 'Commander',
    description:
        'Réservez votre repas à l\'avance, suivez vos commandes en temps réel '
        'et annulez si nécessaire avant le délai.',
    couleur: Color(0xFF0d3360),
    couleurAccent: Color(0xFF5BD988),
    type: _SlideType.commande,
  ),
  _OnboardingData(
    titre: 'Retrait\npar badge QR',
    sousTitre: 'Récupérer',
    description: 'Présentez votre badge à la cantine. '
        'Le gestionnaire scanne et valide votre retrait en quelques secondes.',
    couleur: Color(0xFF061728),
    couleurAccent: Color(0xFF5BD988),
    type: _SlideType.badge,
  ),
];

// ══════════════════════════════════════════════════════════════
// ÉCRAN ONBOARDING
// ══════════════════════════════════════════════════════════════

class OnboardingScreen extends StatefulWidget {
  final VoidCallback onTermine;
  const OnboardingScreen({super.key, required this.onTermine});
  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen>
    with TickerProviderStateMixin {
  final _pageCtrl = PageController();
  int _page = 0;

  late AnimationController _ctrlAnim;
  late Animation<double> _fadeAnim;
  late Animation<Offset> _slideAnim;

  @override
  void initState() {
    super.initState();
    _ctrlAnim = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 500));
    _fadeAnim = CurvedAnimation(parent: _ctrlAnim, curve: Curves.easeOut);
    _slideAnim = Tween<Offset>(
      begin: const Offset(0, 0.15),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _ctrlAnim, curve: Curves.easeOut));
    _ctrlAnim.forward();
  }

  @override
  void dispose() {
    _pageCtrl.dispose();
    _ctrlAnim.dispose();
    super.dispose();
  }

  void _aller(int index) {
    _pageCtrl.animateToPage(index,
        duration: const Duration(milliseconds: 400), curve: Curves.easeInOut);
  }

  void _suivant() {
    if (_page < _slides.length - 1) {
      _aller(_page + 1);
    } else {
      _terminer();
    }
  }

  Future<void> _terminer() async {
    await marquerOnboardingVu();
    widget.onTermine();
  }

  @override
  Widget build(BuildContext context) {
    final slide = _slides[_page];

    return Scaffold(
      backgroundColor: slide.couleur,
      body: AnimatedContainer(
        duration: const Duration(milliseconds: 400),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              slide.couleur,
              Color.lerp(slide.couleur, const Color(0xFF0d3360), 0.6)!,
            ],
          ),
        ),
        child: SafeArea(
            child: Column(children: [
          // ── Bouton passer ─────────────────────────────────
          Align(
            alignment: Alignment.topRight,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(0, 12, 20, 0),
              child: _page < _slides.length - 1
                  ? TextButton(
                      onPressed: _terminer,
                      child: Text('Passer',
                          style: TextStyle(
                              color: Colors.white.withOpacity(0.5),
                              fontSize: 14)))
                  : const SizedBox(height: 40),
            ),
          ),

          // ── PageView illustrations ─────────────────────────
          Expanded(
            flex: 5,
            child: PageView.builder(
              controller: _pageCtrl,
              itemCount: _slides.length,
              onPageChanged: (i) {
                setState(() => _page = i);
                _ctrlAnim.forward(from: 0);
              },
              itemBuilder: (_, i) => _SlideIllustration(
                slide: _slides[i],
                isActive: i == _page,
              ),
            ),
          ),

          // ── Texte + dots + bouton ──────────────────────────
          Expanded(
            flex: 4,
            child: FadeTransition(
              opacity: _fadeAnim,
              child: SlideTransition(
                position: _slideAnim,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(32, 0, 32, 16),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.end,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Label
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 4),
                        decoration: BoxDecoration(
                          color: slide.couleurAccent.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                              color: slide.couleurAccent.withOpacity(0.3)),
                        ),
                        child: Text(slide.sousTitre,
                            style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: slide.couleurAccent,
                                letterSpacing: 1.5)),
                      ),

                      const SizedBox(height: 10),

                      // Titre
                      Text(slide.titre,
                          style: const TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                              height: 1.15,
                              letterSpacing: -0.5)),

                      const SizedBox(height: 10),

                      // Description
                      Text(slide.description,
                          style: TextStyle(
                              fontSize: 14,
                              height: 1.55,
                              color: Colors.white.withOpacity(0.65),
                              fontWeight: FontWeight.w400)),

                      const Spacer(),

                      // Indicateurs + bouton
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          // Dots
                          Flexible(
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: List.generate(
                                _slides.length,
                                (i) => AnimatedContainer(
                                  duration: const Duration(milliseconds: 300),
                                  margin: const EdgeInsets.only(right: 6),
                                  width: _page == i ? 20 : 6,
                                  height: 6,
                                  decoration: BoxDecoration(
                                      color: _page == i
                                          ? slide.couleurAccent
                                          : Colors.white.withOpacity(0.25),
                                      borderRadius: BorderRadius.circular(3)),
                                ),
                              ),
                            ),
                          ),

                          // Bouton suivant / commencer
                          GestureDetector(
                            onTap: _suivant,
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 300),
                              width: _page == _slides.length - 1 ? 120 : 46,
                              height: 46,
                              decoration: BoxDecoration(
                                color: slide.couleurAccent,
                                borderRadius: BorderRadius.circular(23),
                                boxShadow: [
                                  BoxShadow(
                                      color:
                                          slide.couleurAccent.withOpacity(0.4),
                                      blurRadius: 16,
                                      offset: const Offset(0, 6))
                                ],
                              ),
                              child: Center(
                                child: _page == _slides.length - 1
                                    ? Padding(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 8),
                                        child: FittedBox(
                                          fit: BoxFit.scaleDown,
                                          child: Row(
                                              mainAxisSize: MainAxisSize.min,
                                              children: [
                                                Text('Démarrer',
                                                    style: TextStyle(
                                                        fontSize: 13,
                                                        fontWeight:
                                                            FontWeight.w700,
                                                        color: slide.couleur)),
                                                const SizedBox(width: 4),
                                                Icon(
                                                    Icons.arrow_forward_rounded,
                                                    size: 14,
                                                    color: slide.couleur),
                                              ]),
                                        ),
                                      )
                                    : Icon(Icons.arrow_forward_rounded,
                                        size: 20, color: slide.couleur),
                              ),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 8),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ])),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// ILLUSTRATIONS PAR SLIDE
// ══════════════════════════════════════════════════════════════

class _SlideIllustration extends StatelessWidget {
  final _OnboardingData slide;
  final bool isActive;

  const _SlideIllustration({
    required this.slide,
    required this.isActive,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedScale(
      scale: isActive ? 1.0 : 0.92,
      duration: const Duration(milliseconds: 400),
      curve: Curves.easeOut,
      child: Center(
          child: SizedBox(
        width: 300,
        height: 300,
        child: switch (slide.type) {
          _SlideType.menu => _IllustrationMenu(),
          _SlideType.commande => _IllustrationCommande(),
          _SlideType.badge => _IllustrationBadge(),
        },
      )),
    );
  }
}

// ── Illustration 1 : Menu ──────────────────────────────────────

class _IllustrationMenu extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _MenuPainter(),
      size: const Size(300, 300),
    );
  }
}

class _MenuPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height / 2;

    // ── Halo ──────────────────────────────────────────────────
    final haloPaint = Paint()
      ..color = AppColors.accent.withOpacity(0.08)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 30);
    canvas.drawCircle(Offset(cx, cy), 130, haloPaint);

    // ── Carte menu principale ─────────────────────────────────
    final cardRect = RRect.fromRectAndRadius(
        Rect.fromLTWH(cx - 100, cy - 110, 200, 240), const Radius.circular(24));
    canvas.drawRRect(cardRect, Paint()..color = Colors.white.withOpacity(0.08));
    canvas.drawRRect(
        cardRect,
        Paint()
          ..color = AppColors.accent.withOpacity(0.3)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 0.8);

    // Image plat (rectangle coloré)
    canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(cx - 88, cy - 98, 176, 100),
            const Radius.circular(16)),
        Paint()..color = AppColors.accent.withOpacity(0.15));

    // Icône assiette
    canvas.drawCircle(Offset(cx, cy - 48), 32,
        Paint()..color = AppColors.accent.withOpacity(0.2));
    canvas.drawCircle(Offset(cx, cy - 48), 20,
        Paint()..color = AppColors.accent.withOpacity(0.35));

    // Fourchette simple
    final fp = Paint()
      ..color = AppColors.accent.withOpacity(0.9)
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    canvas.drawLine(Offset(cx - 8, cy - 62), Offset(cx - 8, cy - 34), fp);
    canvas.drawLine(Offset(cx + 8, cy - 62), Offset(cx + 8, cy - 34), fp);

    // Lignes texte simulées
    final linePaint = Paint()
      ..color = Colors.white.withOpacity(0.5)
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;

    canvas.drawLine(
        Offset(cx - 70, cy + 20), Offset(cx + 40, cy + 20), linePaint);
    final linePaint2 = Paint()
      ..color = Colors.white.withOpacity(0.25)
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(
        Offset(cx - 70, cy + 38), Offset(cx + 20, cy + 38), linePaint2);
    canvas.drawLine(
        Offset(cx - 70, cy + 54), Offset(cx + 50, cy + 54), linePaint2);

    // Badge "Aujourd'hui"
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(cx - 45, cy + 72, 90, 26), const Radius.circular(13)),
        Paint()..color = AppColors.accent.withOpacity(0.9));

    // Chips jours en bas
    final chipPaint = Paint()..color = Colors.white.withOpacity(0.1);
    for (int i = 0; i < 5; i++) {
      canvas.drawRRect(
          RRect.fromRectAndRadius(
              Rect.fromLTWH(cx - 115 + i * 46.0, cy + 115, 36, 36),
              const Radius.circular(10)),
          chipPaint);
    }
    // Chip sélectionné
    canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(cx - 115, cy + 115, 36, 36),
            const Radius.circular(10)),
        Paint()..color = AppColors.accent.withOpacity(0.4));
  }

  @override
  bool shouldRepaint(covariant CustomPainter _) => false;
}

// ── Illustration 2 : Commande ──────────────────────────────────

class _IllustrationCommande extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _CommandePainter(),
      size: const Size(300, 300),
    );
  }
}

class _CommandePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height / 2;

    // Halo
    canvas.drawCircle(
        Offset(cx, cy),
        130,
        Paint()
          ..color = AppColors.accent.withOpacity(0.07)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 25));

    // 3 cartes commandes empilées
    final offsets = [18.0, 9.0, 0.0];
    final opacities = [0.04, 0.07, 0.1];

    for (int i = 0; i < 3; i++) {
      canvas.drawRRect(
          RRect.fromRectAndRadius(
              Rect.fromLTWH(
                  cx - 105 + offsets[i], cy - 130 + offsets[i], 210, 80),
              const Radius.circular(16)),
          Paint()..color = Colors.white.withOpacity(opacities[i]));
    }

    // Carte principale (commande en attente)
    final cardPaint = Paint()..color = Colors.white.withOpacity(0.1);
    final cardBorder = Paint()
      ..color = AppColors.accent.withOpacity(0.4)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;

    final mainCard = RRect.fromRectAndRadius(
        Rect.fromLTWH(cx - 105, cy - 60, 210, 120), const Radius.circular(20));
    canvas.drawRRect(mainCard, cardPaint);
    canvas.drawRRect(mainCard, cardBorder);

    // Photo plat
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(cx - 93, cy - 46, 52, 52), const Radius.circular(12)),
        Paint()..color = AppColors.accent.withOpacity(0.2));
    canvas.drawCircle(Offset(cx - 67, cy - 20), 16,
        Paint()..color = AppColors.accent.withOpacity(0.3));

    // Lignes nom + date
    final lp = Paint()
      ..color = Colors.white.withOpacity(0.55)
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(cx - 30, cy - 38), Offset(cx + 80, cy - 38), lp);
    final lp2 = Paint()
      ..color = Colors.white.withOpacity(0.25)
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(cx - 30, cy - 22), Offset(cx + 50, cy - 22), lp2);

    // Badge statut "En attente"
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(cx - 30, cy - 5, 80, 20), const Radius.circular(10)),
        Paint()..color = const Color(0xFFFFAB00).withOpacity(0.25));

    // Bouton Annuler
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(cx - 93, cy + 22, 94, 30), const Radius.circular(10)),
        Paint()..color = const Color(0xFFFF1744).withOpacity(0.15));
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(cx - 93, cy + 22, 94, 30), const Radius.circular(10)),
        Paint()
          ..color = const Color(0xFFFF1744).withOpacity(0.4)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 0.8);

    // Grande icône check en bas
    canvas.drawCircle(Offset(cx, cy + 115), 42,
        Paint()..color = AppColors.accent.withOpacity(0.15));
    canvas.drawCircle(Offset(cx, cy + 115), 30,
        Paint()..color = AppColors.accent.withOpacity(0.25));

    // Check mark
    final checkPaint = Paint()
      ..color = AppColors.accent
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.5
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final checkPath = Path()
      ..moveTo(cx - 12, cy + 115)
      ..lineTo(cx - 3, cy + 124)
      ..lineTo(cx + 14, cy + 104);
    canvas.drawPath(checkPath, checkPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter _) => false;
}

// ── Illustration 3 : Badge QR ──────────────────────────────────

class _IllustrationBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _BadgePainter(),
      size: const Size(300, 300),
    );
  }
}

class _BadgePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height / 2;

    // Halo
    canvas.drawCircle(
        Offset(cx, cy),
        130,
        Paint()
          ..color = AppColors.accent.withOpacity(0.08)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 28));

    // ── Badge employé ─────────────────────────────────────────
    final badgeRect = RRect.fromRectAndRadius(
        Rect.fromLTWH(cx - 70, cy - 145, 140, 180), const Radius.circular(20));
    canvas.drawRRect(badgeRect, Paint()..color = Colors.white.withOpacity(0.1));
    canvas.drawRRect(
        badgeRect,
        Paint()
          ..color = AppColors.accent.withOpacity(0.35)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1);

    // Encoche haut
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(cx - 20, cy - 152, 40, 12), const Radius.circular(6)),
        Paint()..color = Colors.white.withOpacity(0.06));

    // Avatar
    canvas.drawCircle(Offset(cx, cy - 98), 28,
        Paint()..color = AppColors.accent.withOpacity(0.2));
    canvas.drawCircle(Offset(cx, cy - 98), 18,
        Paint()..color = AppColors.accent.withOpacity(0.35));

    // Nom + poste simulés
    final lp = Paint()
      ..color = Colors.white.withOpacity(0.5)
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(cx - 40, cy - 55), Offset(cx + 40, cy - 55), lp);
    final lp2 = Paint()
      ..color = Colors.white.withOpacity(0.2)
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(cx - 25, cy - 40), Offset(cx + 25, cy - 40), lp2);

    // ── QR Code simplifié ─────────────────────────────────────
    final qrBg = Paint()..color = Colors.white.withOpacity(0.08);
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(cx - 38, cy - 20, 76, 76), const Radius.circular(8)),
        qrBg);

    // Coins QR
    final qrPaint = Paint()
      ..color = AppColors.accent.withOpacity(0.8)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;

    // Coin haut gauche
    final paths = [
      [cx - 30, cy - 12, 16.0, true, true],
      [cx + 14, cy - 12, 16.0, false, true],
      [cx - 30, cy + 32, 16.0, true, false],
      [cx + 14, cy + 32, 16.0, false, false],
    ];
    for (final c in paths) {
      final x = c[0] as double;
      final y = c[1] as double;
      final s = c[2] as double;
      final fL = c[3] as bool;
      final fT = c[4] as bool;
      final cornerPath = Path();
      if (fL && fT) {
        cornerPath
          ..moveTo(x + s, y)
          ..lineTo(x, y)
          ..lineTo(x, y + s);
      } else if (!fL && fT) {
        cornerPath
          ..moveTo(x, y)
          ..lineTo(x + s, y)
          ..lineTo(x + s, y + s);
      } else if (fL && !fT) {
        cornerPath
          ..moveTo(x, y)
          ..lineTo(x, y + s)
          ..lineTo(x + s, y + s);
      } else {
        cornerPath
          ..moveTo(x + s, y)
          ..lineTo(x + s, y + s)
          ..lineTo(x, y + s);
      }
      canvas.drawPath(cornerPath, qrPaint);
    }

    // Pixels QR intérieurs
    final pxPaint = Paint()..color = AppColors.accent.withOpacity(0.4);
    final rnd = Random(7);
    for (int r = 0; r < 4; r++) {
      for (int c2 = 0; c2 < 4; c2++) {
        if (rnd.nextBool()) {
          canvas.drawRect(
              Rect.fromLTWH(cx - 22 + c2 * 11.0, cy - 4 + r * 11.0, 8, 8),
              pxPaint);
        }
      }
    }

    // ── Scanner en bas ────────────────────────────────────────
    canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(cx - 90, cy + 75, 180, 60),
            const Radius.circular(16)),
        Paint()..color = Colors.white.withOpacity(0.07));
    canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(cx - 90, cy + 75, 180, 60),
            const Radius.circular(16)),
        Paint()
          ..color = AppColors.accent.withOpacity(0.2)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 0.8);

    // Ligne de scan
    canvas.drawLine(
        Offset(cx - 78, cy + 107),
        Offset(cx + 78, cy + 107),
        Paint()
          ..color = AppColors.accent.withOpacity(0.7)
          ..strokeWidth = 2
          ..strokeCap = StrokeCap.round);

    // Icône scanner
    canvas.drawCircle(Offset(cx, cy + 105), 14,
        Paint()..color = AppColors.accent.withOpacity(0.15));
    canvas.drawCircle(Offset(cx, cy + 105), 8,
        Paint()..color = AppColors.accent.withOpacity(0.4));
  }

  @override
  bool shouldRepaint(covariant CustomPainter _) => false;
}
