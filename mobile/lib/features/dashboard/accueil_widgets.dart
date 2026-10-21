// lib/features/dashboard/accueil_widgets.dart
//
// Blocs de l'écran d'accueil alimentés par GET /accueil/ :
// employé : « Ma semaine », « Prochain repas à réserver », chiffres du mois ;
// gestionnaire : « Service du jour », alertes, « Commandes de la semaine ».

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/widgets/tic_echeance.dart';
import '../../shared/models/models.dart';
import '../../shared/theme/app_theme.dart';

// ── Couleurs propres à l'accueil (maquette validée) ───────────
const _vertTexte = Color(0xFF1F9D55);
const _vertBord = Color(0xFFBFECCF);
const _orTexte = Color(0xFFD48A00);
const _rougeFond = Color(0xFFFDE8E4);
const _rougeBord = Color(0xFFF6B4A6);
const _rougeTexte = Color(0xFFB33A22);
const _navyClair = Color(0xFF0F3A6E);

const _joursCourts = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

String jourCourt(DateTime d) => _joursCourts[d.weekday - 1];

bool _memeJour(DateTime a, DateTime? b) =>
    b != null && a.year == b.year && a.month == b.month && a.day == b.day;

String _majuscule(String s) =>
    s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

/// « 7 000 F » (espaces insécables : le montant ne se coupe pas)
String formatFcfa(double montant) {
  final entier = montant.round().abs().toString();
  final buf = StringBuffer(montant < 0 ? '-' : '');
  for (var i = 0; i < entier.length; i++) {
    if (i > 0 && (entier.length - i) % 3 == 0) buf.write(' ');
    buf.write(entier[i]);
  }
  return '$buf F';
}

/// Temps restant avant la fermeture des commandes : « Ferme dans 1 j 4 h »,
/// « Ferme dans 3 h 05 », « Ferme dans 12 min » ; null si c'est fermé.
String? fermeDans(DateTime? limite, DateTime maintenant) {
  if (limite == null) return null;
  final d = limite.difference(maintenant);
  if (d <= Duration.zero) return null;
  if (d.inDays >= 1) {
    final h = d.inHours.remainder(24);
    return 'Ferme dans ${d.inDays} j${h > 0 ? ' $h h' : ''}';
  }
  if (d.inHours >= 1) {
    return 'Ferme dans ${d.inHours} h '
        '${d.inMinutes.remainder(60).toString().padLeft(2, '0')}';
  }
  return 'Ferme dans ${d.inMinutes < 1 ? 1 : d.inMinutes} min';
}

// ══════════════════════════════════════════════════════════════
// CARTE BLANCHE + TITRE AVEC LIEN
// ══════════════════════════════════════════════════════════════

class AccueilCarte extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  const AccueilCarte(
      {super.key, required this.child, this.padding = const EdgeInsets.all(14)});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: child,
    );
  }
}

class _TitreCarte extends StatelessWidget {
  final String titre;
  final String? lien;
  final VoidCallback? onLien;
  const _TitreCarte({required this.titre, this.lien, this.onLien});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Row(children: [
      Expanded(
        child: Text(titre,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.w700,
                color: isDark
                    ? AppColors.darkTextPrimary
                    : AppColors.lightTextPrimary)),
      ),
      if (lien != null)
        InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onLien,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
            child: Text(lien!,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: isDark ? AppColors.accent : _navyClair)),
          ),
        ),
    ]);
  }
}

// ══════════════════════════════════════════════════════════════
// ERREUR DE CHARGEMENT
// ══════════════════════════════════════════════════════════════

class AccueilErreur extends StatelessWidget {
  final String message;
  final VoidCallback onReessayer;
  const AccueilErreur(
      {super.key, required this.message, required this.onReessayer});

  @override
  Widget build(BuildContext context) {
    return AccueilCarte(
      child: Row(children: [
        const Icon(Icons.cloud_off_rounded,
            color: AppColors.lightTextHint, size: 26),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Accueil indisponible',
                style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 2),
            Text(message, style: Theme.of(context).textTheme.bodySmall),
          ]),
        ),
        const SizedBox(width: 8),
        TextButton(onPressed: onReessayer, child: const Text('Réessayer')),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// EMPLOYÉ : MA SEMAINE
// ══════════════════════════════════════════════════════════════

class MaSemaineCard extends StatelessWidget {
  final List<JourSemaine> jours;
  final DateTime? aujourdhui;
  final VoidCallback onVoirMenus;
  final ValueChanged<JourSemaine> onJour;

  const MaSemaineCard({
    super.key,
    required this.jours,
    required this.aujourdhui,
    required this.onVoirMenus,
    required this.onJour,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final vert = isDark ? AppColors.accent : _vertTexte;
    final nonRetire = jours.any((j) => j.statut == StatutJour.nonRetire);

    Widget legende(IconData icone, Color couleur, String texte) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icone, size: 12, color: couleur),
            const SizedBox(width: 3),
            Text(texte, style: TextStyle(fontSize: 10.5, color: gris)),
          ],
        );

    return AccueilCarte(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _TitreCarte(
            titre: 'Ma semaine', lien: 'Voir les menus', onLien: onVoirMenus),
        const SizedBox(height: 10),
        Row(
          children: [
            for (var i = 0; i < jours.length; i++) ...[
              if (i > 0) const SizedBox(width: 6),
              Expanded(
                child: _JourChip(
                  jour: jours[i],
                  aujourdhui: _memeJour(jours[i].date, aujourdhui),
                  onTap: () => onJour(jours[i]),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 8),
        Wrap(spacing: 10, runSpacing: 4, children: [
          legende(Icons.check_circle_rounded, vert, 'réservé'),
          legende(Icons.add_circle_outline_rounded, AppColors.accentDark,
              'à réserver'),
          if (nonRetire)
            legende(Icons.error_outline_rounded, AppColors.warning,
                'non retiré'),
          legende(Icons.lock_outline_rounded, gris, 'fermé / pas de menu'),
        ]),
      ]),
    );
  }
}

class _JourChip extends StatelessWidget {
  final JourSemaine jour;
  final bool aujourdhui;
  final VoidCallback onTap;
  const _JourChip(
      {required this.jour, required this.aujourdhui, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bordNeutre = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final texteNeutre =
        isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final gris = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final hint = isDark ? AppColors.darkTextHint : AppColors.lightTextHint;
    final vert = isDark ? AppColors.accent : _vertTexte;
    final fondVert =
        isDark ? AppColors.accent.withOpacity(0.12) : AppColors.accentLight;
    final bordVert = isDark ? AppColors.accent.withOpacity(0.35) : _vertBord;

    Color fond = Colors.transparent;
    Color bord = bordNeutre;
    Color couleur = texteNeutre;
    Color couleurJour = gris;
    IconData icone;
    var pointille = false;

    switch (jour.statut) {
      case StatutJour.retire:
      case StatutJour.reserve:
        fond = fondVert;
        bord = bordVert;
        couleur = couleurJour = vert;
        icone = Icons.check_circle_rounded;
      case StatutJour.aRetirer:
        fond = fondVert;
        bord = bordVert;
        couleur = couleurJour = vert;
        icone = Icons.watch_later_rounded;
      case StatutJour.aReserver:
        pointille = true;
        icone = Icons.add_circle_outline_rounded;
      case StatutJour.nonRetire:
        fond = isDark
            ? AppColors.warning.withOpacity(0.12)
            : AppColors.warningLight;
        bord = AppColors.warning.withOpacity(0.45);
        couleur = couleurJour = isDark ? AppColors.warning : _orTexte;
        icone = Icons.error_outline_rounded;
      case StatutJour.ferme:
        fond = isDark ? AppColors.darkSurface : const Color(0xFFF5F7FA);
        couleur = couleurJour = hint;
        icone = Icons.lock_outline_rounded;
      case StatutJour.pasDeMenu:
        fond = isDark ? AppColors.darkSurface : const Color(0xFFF5F7FA);
        couleur = couleurJour = hint;
        icone = Icons.remove_rounded;
    }
    final couleurIcone =
        jour.statut == StatutJour.aReserver ? AppColors.accentDark : couleur;

    final contenu = Padding(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 2),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(jourCourt(jour.date),
            maxLines: 1,
            style: TextStyle(fontSize: 11, color: couleurJour)),
        const SizedBox(height: 1),
        Text('${jour.date.day}',
            maxLines: 1,
            style: TextStyle(
                fontSize: 16, fontWeight: FontWeight.w800, color: couleur)),
        const SizedBox(height: 3),
        Icon(icone, size: 18, color: couleurIcone),
      ]),
    );

    final rayon = BorderRadius.circular(12);
    final details = [
      _majuscule(jour.libelle),
      if (aujourdhui) "aujourd'hui",
      jour.statut.label,
      if (jour.plat != null && jour.plat!.isNotEmpty) jour.plat!,
    ].join(', ');

    return Semantics(
      button: true,
      label: details,
      excludeSemantics: true,
      child: Material(
        color: fond,
        shape: pointille
            ? RoundedRectangleBorder(borderRadius: rayon)
            : RoundedRectangleBorder(
                borderRadius: rayon,
                side: aujourdhui
                    ? const BorderSide(color: AppColors.accentDark, width: 2)
                    : BorderSide(color: bord)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: pointille
              ? CustomPaint(
                  painter: _BordPointille(
                      couleur: AppColors.accentDark,
                      epaisseur: aujourdhui ? 2.5 : 2,
                      rayon: 12),
                  child: contenu)
              : contenu,
        ),
      ),
    );
  }
}

/// Bordure en pointillés (jour encore à réserver)
class _BordPointille extends CustomPainter {
  final Color couleur;
  final double epaisseur;
  final double rayon;
  const _BordPointille(
      {required this.couleur, required this.epaisseur, required this.rayon});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = couleur
      ..strokeWidth = epaisseur
      ..style = PaintingStyle.stroke;
    final m = epaisseur / 2;
    final rrect = RRect.fromRectAndRadius(
        Rect.fromLTWH(m, m, size.width - epaisseur, size.height - epaisseur),
        Radius.circular(rayon - m));
    final path = Path()..addRRect(rrect);
    for (final metric in path.computeMetrics()) {
      var d = 0.0;
      while (d < metric.length) {
        canvas.drawPath(metric.extractPath(d, d + 5), paint);
        d += 9;
      }
    }
  }

  @override
  bool shouldRepaint(_BordPointille old) =>
      old.couleur != couleur || old.epaisseur != epaisseur || old.rayon != rayon;
}

// ══════════════════════════════════════════════════════════════
// EMPLOYÉ : PROCHAIN REPAS À RÉSERVER
// ══════════════════════════════════════════════════════════════

class ProchainRepasCard extends StatelessWidget {
  final ProchainAReserver prochain;
  final VoidCallback onReserver;
  const ProchainRepasCard(
      {super.key, required this.prochain, required this.onReserver});

  @override
  Widget build(BuildContext context) => TicEcheance(
        echeances: [prochain.dateLimiteCommande],
        builder: _contenu,
      );

  Widget _contenu(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final p = prochain;
    final compte = fermeDans(p.dateLimiteCommande, DateTime.now());
    final ferme = p.dateLimiteCommande != null && compte == null;
    final date = _majuscule(
        DateFormat('EEEE d MMMM', 'fr_FR').format(p.date));
    final plats = '${p.nbPlats} plat${p.nbPlats > 1 ? 's' : ''} au choix';

    final icone = Container(
      width: 46,
      height: 46,
      decoration: BoxDecoration(
          color: isDark
              ? AppColors.warning.withOpacity(0.15)
              : AppColors.warningLight,
          borderRadius: BorderRadius.circular(13)),
      child: const Icon(Icons.alarm_rounded, color: AppColors.warning, size: 22),
    );

    final textes = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(date,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: isDark
                    ? AppColors.darkTextPrimary
                    : AppColors.lightTextPrimary)),
        const SizedBox(height: 2),
        Text([plats, if (p.agence.isNotEmpty) p.agence].join(' · '),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall),
        if (compte != null || ferme) ...[
          const SizedBox(height: 2),
          Text(ferme ? 'Commandes fermées' : compte!,
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: ferme
                      ? AppColors.error
                      : (isDark ? AppColors.warning : _orTexte))),
        ],
      ],
    );

    final bouton = _BoutonVert(
      label: 'Réserver',
      onPressed: ferme ? null : onReserver,
      compact: true,
    );

    return Semantics(
      container: true,
      label: 'Prochain repas à réserver',
      child: AccueilCarte(
        child: LayoutBuilder(builder: (_, c) {
          // Écran étroit : bouton sous le texte (pas de débordement)
          if (c.maxWidth < 280) {
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                icone,
                const SizedBox(width: 12),
                Expanded(child: textes),
              ]),
              const SizedBox(height: 10),
              bouton,
            ]);
          }
          return Row(children: [
            icone,
            const SizedBox(width: 12),
            Expanded(child: textes),
            const SizedBox(width: 8),
            bouton,
          ]);
        }),
      ),
    );
  }
}

/// Bouton vert dégradé de la maquette (texte bleu marine)
class _BoutonVert extends StatelessWidget {
  final String label;
  final IconData? icone;
  final VoidCallback? onPressed;
  final bool compact;
  const _BoutonVert(
      {required this.label, this.icone, this.onPressed, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final actif = onPressed != null;
    final rayon = BorderRadius.circular(12);
    return Opacity(
      opacity: actif ? 1 : 0.45,
      child: DecoratedBox(
        decoration: BoxDecoration(
            gradient: AppColors.accentGradient, borderRadius: rayon),
        child: Material(
          color: Colors.transparent,
          borderRadius: rayon,
          child: InkWell(
            borderRadius: rayon,
            onTap: onPressed,
            child: Padding(
              padding: EdgeInsets.symmetric(
                  horizontal: compact ? 14 : 16, vertical: compact ? 11 : 13),
              child: Row(
                mainAxisSize: compact ? MainAxisSize.min : MainAxisSize.max,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (icone != null) ...[
                    Icon(icone, size: 20, color: AppColors.primary),
                    const SizedBox(width: 8),
                  ],
                  Flexible(
                    child: Text(label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: AppColors.primary,
                            fontWeight: FontWeight.w700,
                            fontSize: compact ? 13.5 : 14.5)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// CHIFFRES DU MOIS (tuiles compactes)
// ══════════════════════════════════════════════════════════════

class ChiffreTuile {
  final String valeur;
  final String libelle;
  final bool montant;
  final VoidCallback? onTap;
  const ChiffreTuile(this.valeur, this.libelle,
      {this.montant = false, this.onTap});
}

class ChiffresMoisRow extends StatelessWidget {
  final List<ChiffreTuile> tuiles;
  const ChiffresMoisRow({super.key, required this.tuiles});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final texte =
        isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final gris = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    return Row(children: [
      for (var i = 0; i < tuiles.length; i++) ...[
        if (i > 0) const SizedBox(width: 8),
        Expanded(
          child: Semantics(
            button: tuiles[i].onTap != null,
            label: '${tuiles[i].valeur} ${tuiles[i].libelle}',
            excludeSemantics: true,
            child: Material(
              color: isDark ? AppColors.darkCard : AppColors.lightCard,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: BorderSide(
                      color: isDark
                          ? AppColors.darkBorder
                          : AppColors.lightBorder)),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: tuiles[i].onTap,
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
                  child: Column(children: [
                    SizedBox(
                      height: 24,
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(tuiles[i].valeur,
                            style: TextStyle(
                                fontSize: tuiles[i].montant ? 15 : 18,
                                fontWeight: FontWeight.w800,
                                color: tuiles[i].montant
                                    ? (isDark ? AppColors.accent : _vertTexte)
                                    : texte)),
                      ),
                    ),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(tuiles[i].libelle,
                          maxLines: 1,
                          style: TextStyle(fontSize: 11, color: gris)),
                    ),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ],
    ]);
  }
}

// ══════════════════════════════════════════════════════════════
// GESTIONNAIRE : SERVICE DU JOUR (carte bleu marine)
// ══════════════════════════════════════════════════════════════

class ServiceDuJourCard extends StatelessWidget {
  final List<ServiceAgence> services;
  final DateTime? actualiseLe;
  final bool chargement;
  final VoidCallback onScanner;
  final VoidCallback onActualiser;

  const ServiceDuJourCard({
    super.key,
    required this.services,
    required this.actualiseLe,
    required this.chargement,
    required this.onScanner,
    required this.onActualiser,
  });

  @override
  Widget build(BuildContext context) {
    final titre = services.length == 1
        ? 'Service du jour — ${services.first.agence}'
        : 'Service du jour';
    final blanc70 = Colors.white.withOpacity(0.7);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 8, 8, 14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
            colors: [AppColors.primary, _navyClair],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(16),
        // Thème sombre : la carte se détache du fond bleu nuit
        border: Theme.of(context).brightness == Brightness.dark
            ? Border.all(color: Colors.white.withOpacity(0.12))
            : null,
        boxShadow: [
          BoxShadow(
              color: AppColors.primary.withOpacity(0.25),
              blurRadius: 16,
              offset: const Offset(0, 6))
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text(titre,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14.5,
                    fontWeight: FontWeight.w700)),
          ),
          if (actualiseLe != null)
            Text('maj ${DateFormat('HH:mm').format(actualiseLe!)}',
                semanticsLabel:
                    'Actualisé à ${DateFormat('HH:mm').format(actualiseLe!)}',
                style: TextStyle(
                    color: Colors.white.withOpacity(0.6), fontSize: 11)),
          SizedBox(
            width: 36,
            height: 36,
            child: chargement
                ? const Padding(
                    padding: EdgeInsets.all(11),
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white70))
                : IconButton(
                    padding: EdgeInsets.zero,
                    tooltip: 'Actualiser',
                    icon: const Icon(Icons.refresh_rounded,
                        color: Colors.white70, size: 18),
                    onPressed: onActualiser,
                  ),
          ),
        ]),
        Padding(
          padding: const EdgeInsets.only(right: 6),
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (services.isEmpty) ...[
                  const SizedBox(height: 2),
                  Text("Pas de service aujourd'hui : aucun menu du jour "
                      'dans votre agence.',
                      style: TextStyle(color: blanc70, fontSize: 12.5)),
                ],
                for (final s in services) ...[
                  if (services.length > 1) ...[
                    const SizedBox(height: 6),
                    Text(
                        [s.agence, if (s.equipes.isNotEmpty) s.equipes.join(', ')]
                            .join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600)),
                  ],
                  _LigneService(service: s),
                ],
                const SizedBox(height: 12),
                _BoutonVert(
                  label: 'Scanner un badge',
                  icone: Icons.qr_code_scanner_rounded,
                  onPressed: onScanner,
                ),
              ]),
        ),
      ]),
    );
  }
}

class _LigneService extends StatelessWidget {
  final ServiceAgence service;
  const _LigneService({required this.service});

  @override
  Widget build(BuildContext context) {
    final s = service;
    final blanc70 = Colors.white.withOpacity(0.7);
    Widget chiffre(int n, String libelle, CrossAxisAlignment align) =>
        Expanded(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: switch (align) {
              CrossAxisAlignment.start => Alignment.centerLeft,
              CrossAxisAlignment.end => Alignment.centerRight,
              _ => Alignment.center,
            },
            child: Column(
              crossAxisAlignment: align,
              children: [
                Text('$n',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w800)),
                Text(libelle, style: TextStyle(color: blanc70, fontSize: 11)),
              ],
            ),
          ),
        );
    return Semantics(
      label: '${s.agence} : ${s.servies} servis, ${s.aServir} à servir, '
          '${s.commandees} commandés',
      excludeSemantics: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Stack(children: [
            Container(height: 12, color: Colors.white.withOpacity(0.15)),
            FractionallySizedBox(
              widthFactor: s.progression,
              child: Container(
                height: 12,
                decoration:
                    const BoxDecoration(gradient: AppColors.accentGradient),
              ),
            ),
          ]),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            chiffre(s.servies, 'servis', CrossAxisAlignment.start),
            chiffre(s.aServir, 'à servir', CrossAxisAlignment.center),
            chiffre(s.commandees, 'commandés', CrossAxisAlignment.end),
          ],
        ),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// GESTIONNAIRE : ALERTE (menu manquant)
// ══════════════════════════════════════════════════════════════

class AlerteMenuManquant extends StatelessWidget {
  final AFaire alerte;
  const AlerteMenuManquant({super.key, required this.alerte});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final couleur = isDark ? const Color(0xFFFF8A75) : _rougeTexte;
    final agences = alerte.agences;
    final texte = '${alerte.titre}'
        '${agences.isNotEmpty ? ' ($agences)' : ''} — à créer sur le web';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: isDark ? AppColors.error.withOpacity(0.14) : _rougeFond,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        Icon(Icons.event_busy_rounded, size: 18, color: couleur),
        const SizedBox(width: 10),
        Expanded(
          child: Text(texte,
              style: TextStyle(
                  color: couleur, fontSize: 12, fontWeight: FontWeight.w600)),
        ),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// GESTIONNAIRE : COMMANDES DE LA SEMAINE
// ══════════════════════════════════════════════════════════════

class CommandesSemaineCard extends StatelessWidget {
  final List<JourGestion> jours;
  final DateTime? aujourdhui;
  final VoidCallback onGestion;

  const CommandesSemaineCard({
    super.key,
    required this.jours,
    required this.aujourdhui,
    required this.onGestion,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final texte =
        isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final gris = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final bord = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final rouge = isDark ? const Color(0xFFFF8A75) : const Color(0xFFD0452C);

    Widget tuile(JourGestion j) {
      final sansMenu = j.etat == EtatJourGestion.sansMenu;
      final duJour = _memeJour(j.date, aujourdhui);
      final rayon = BorderRadius.circular(10);
      return Semantics(
        button: true,
        excludeSemantics: true,
        label: sansMenu
            ? '${j.libelle} : pas de menu'
            : '${j.libelle} : ${j.commandees} commande${j.commandees > 1 ? 's' : ''}',
        child: Material(
          color: sansMenu
              ? (isDark ? AppColors.error.withOpacity(0.14) : _rougeFond)
              : Colors.transparent,
          shape: RoundedRectangleBorder(
              borderRadius: rayon,
              side: duJour
                  ? const BorderSide(color: AppColors.accentDark, width: 2)
                  : BorderSide(
                      color: sansMenu
                          ? (isDark ? rouge.withOpacity(0.4) : _rougeBord)
                          : bord)),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onGestion,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 2),
              child: Column(children: [
                Text(jourCourt(j.date),
                    style: TextStyle(
                        fontSize: 10, color: sansMenu ? rouge : gris)),
                const SizedBox(height: 1),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(sansMenu ? '—' : '${j.commandees}',
                      style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: sansMenu ? rouge : texte)),
                ),
              ]),
            ),
          ),
        ),
      );
    }

    return AccueilCarte(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _TitreCarte(
            titre: 'Commandes de la semaine', lien: 'Gestion', onLien: onGestion),
        const SizedBox(height: 10),
        Row(children: [
          for (var i = 0; i < jours.length; i++) ...[
            if (i > 0) const SizedBox(width: 6),
            Expanded(child: tuile(jours[i])),
          ],
        ]),
      ]),
    );
  }
}
