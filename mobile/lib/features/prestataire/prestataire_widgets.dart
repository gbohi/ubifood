// lib/features/prestataire/prestataire_widgets.dart
//
// Éléments communs de l'espace prestataire (comptoir, liste du jour,
// accueil du responsable).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../core/widgets/common_widgets.dart';
import '../../shared/models/prestataire_models.dart';
import '../../shared/providers/prestataire_provider.dart';
import '../../shared/theme/app_theme.dart';
import '../notifications/notification_screen.dart';

/// Carte blanche (sombre : bleu nuit) à bord fin
class CartePresta extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? bordure;
  const CartePresta(
      {super.key,
      required this.child,
      this.padding = const EdgeInsets.all(14),
      this.bordure});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: bordure ??
                (isDark ? AppColors.darkBorder : AppColors.lightBorder),
            width: bordure == null ? 1 : 2),
      ),
      child: child,
    );
  }
}

/// Titre de carte (+ action à droite)
class TitreCarte extends StatelessWidget {
  final String texte;
  final Widget? action;
  const TitreCarte(this.texte, {super.key, this.action});

  @override
  Widget build(BuildContext context) => Row(children: [
        Expanded(
          child: Text(texte,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700)),
        ),
        if (action != null) action!,
      ]);
}

/// Trois compteurs translucides de l'en-tête (servis / à servir / commandés)
class CompteursService extends StatelessWidget {
  final int servis;
  final int aServir;
  final int commandes;
  const CompteursService(
      {super.key,
      required this.servis,
      required this.aServir,
      required this.commandes});

  @override
  Widget build(BuildContext context) {
    Widget tuile(int n, String libelle) => Expanded(
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.08),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(children: [
              Text('$n',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w800)),
              Text(libelle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: Colors.white.withOpacity(0.7), fontSize: 11)),
            ]),
          ),
        );
    return Semantics(
      label: '$servis servis, $aServir à servir, $commandes commandés',
      excludeSemantics: true,
      child: Row(children: [
        tuile(servis, servis > 1 ? 'servis' : 'servi'),
        const SizedBox(width: 8),
        tuile(aServir, 'à servir'),
        const SizedBox(width: 8),
        tuile(commandes, commandes > 1 ? 'commandés' : 'commandé'),
      ]),
    );
  }
}

/// Pastille dorée « Traiteur … · N'GUESSAN Aya » de l'en-tête
class PastillePrestataire extends StatelessWidget {
  final String texte;
  const PastillePrestataire(this.texte, {super.key});

  @override
  Widget build(BuildContext context) {
    const or = Color(0xFFFFC94D);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: or.withOpacity(0.14),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.storefront_rounded, size: 13, color: or),
        const SizedBox(width: 5),
        Flexible(
          child: Text(texte,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  color: or, fontSize: 11.5, fontWeight: FontWeight.w700)),
        ),
      ]),
    );
  }
}

/// Cloche des notifications dans l'en-tête marine
class BoutonNotificationsEnTete extends StatelessWidget {
  const BoutonNotificationsEnTete({super.key});

  @override
  Widget build(BuildContext context) {
    final nonLues = context.watch<NotificationProvider>().nonLues;
    return EnTeteBouton(
      icone: Icons.notifications_rounded,
      tooltip: 'Notifications',
      badge: nonLues,
      onPressed: () => Navigator.push(context,
          MaterialPageRoute(builder: (_) => const NotificationScreen())),
    );
  }
}

/// Pastille d'agence de l'en-tête : choix de l'agence si plusieurs
class ChoixAgenceEnTete extends StatelessWidget {
  final VoidCallback? onChange;
  const ChoixAgenceEnTete({super.key, this.onChange});

  @override
  Widget build(BuildContext context) {
    final espace = context.watch<EspacePrestataireProvider>();
    final agence = espace.agence;
    if (agence == null || espace.agences.length < 2) {
      return const SizedBox.shrink();
    }
    return EnTetePastille(
      icone: Icons.place_outlined,
      label: '${agence.nom} · changer',
      onTap: () => showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (sheetCtx) => SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text('Agence du comptoir',
                  style: Theme.of(sheetCtx)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w800)),
            ),
            for (final a in espace.agences)
              ListTile(
                leading: Icon(
                    a.id == agence.id
                        ? Icons.radio_button_checked_rounded
                        : Icons.radio_button_off_rounded,
                    color: a.id == agence.id ? AppColors.accentDark : null),
                title: Text(a.nom),
                subtitle:
                    a.libelleService.isEmpty ? null : Text(a.libelleService),
                onTap: () {
                  Navigator.pop(sheetCtx);
                  if (a.id != agence.id) {
                    espace.choisirAgence(a.id);
                    onChange?.call();
                  }
                },
              ),
            const SizedBox(height: 8),
          ]),
        ),
      ),
    );
  }
}

/// « Mardi 17/11 »
String jourCourtPresta(DateTime? d) {
  if (d == null) return '';
  final s = DateFormat('EEEE dd/MM', 'fr_FR').format(d);
  return s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
}

/// « 1:42 » (minutes:secondes)
String minutesSecondes(Duration d) {
  final s = d.inSeconds < 0 ? 0 : d.inSeconds;
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}

/// Reconstruit [builder] chaque seconde jusqu'à [fin] (compte à rebours
/// d'annulation) ; aucun minuteur une fois l'échéance passée.
class CompteARebours extends StatefulWidget {
  final DateTime? fin;
  final Widget Function(BuildContext context, DateTime maintenant) builder;
  const CompteARebours({super.key, required this.fin, required this.builder});

  @override
  State<CompteARebours> createState() => _CompteAReboursState();
}

class _CompteAReboursState extends State<CompteARebours> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _armer();
  }

  @override
  void didUpdateWidget(CompteARebours old) {
    super.didUpdateWidget(old);
    if (old.fin != widget.fin) _armer();
  }

  void _armer() {
    _timer?.cancel();
    _timer = null;
    final fin = widget.fin;
    if (fin == null || !fin.isAfter(DateTime.now())) return;
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() {});
      if (!fin.isAfter(DateTime.now())) {
        t.cancel();
        _timer = null;
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(context, DateTime.now());
}

/// Ligne « dernier retrait » du comptoir : heure, employé, plat, agent ;
/// « Annuler (1:42) » pour SES retraits pendant 2 minutes.
class LigneRetraitComptoir extends StatelessWidget {
  final RetraitComptoir retrait;
  final bool annulationEnCours;
  final VoidCallback? onAnnuler;
  const LigneRetraitComptoir(
      {super.key,
      required this.retrait,
      this.annulationEnCours = false,
      this.onAnnuler});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final sousTitre = [
      if (retrait.plats.isNotEmpty) retrait.plats.join(', '),
      if (retrait.valideParNom != null) 'par ${retrait.valideParNom}',
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(children: [
        SizedBox(
          width: 42,
          child: Text(retrait.heure,
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: isDark ? AppColors.accent : AppColors.primaryLight)),
        ),
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
                [
                  retrait.userNom,
                  if (retrait.matricule.isNotEmpty) retrait.matricule
                ].join(' · '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context)
                    .textTheme
                    .bodyLarge
                    ?.copyWith(fontSize: 12.5, fontWeight: FontWeight.w600)),
            if (sousTitre.isNotEmpty)
              Text(sousTitre,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11, color: gris)),
          ]),
        ),
        const SizedBox(width: 6),
        CompteARebours(
          fin: retrait.annulableParMoi ? retrait.annulableJusquA : null,
          builder: (context, maintenant) {
            final reste = retrait.resteAnnulation(maintenant);
            if (reste == null || onAnnuler == null) {
              return const Icon(Icons.check_circle_rounded,
                  size: 18, color: AppColors.accentDark);
            }
            return SizedBox(
              height: 32,
              child: OutlinedButton(
                onPressed: annulationEnCours ? null : onAnnuler,
                style: OutlinedButton.styleFrom(
                  foregroundColor: isDark
                      ? const Color(0xFFFF8A73)
                      : const Color(0xFFD0452C),
                  side: BorderSide(
                      color: (isDark
                              ? const Color(0xFFFF8A73)
                              : const Color(0xFFD0452C))
                          .withOpacity(0.5)),
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  visualDensity: VisualDensity.compact,
                  textStyle: const TextStyle(
                      fontSize: 11.5, fontWeight: FontWeight.w700),
                ),
                child: annulationEnCours
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : Text('Annuler · ${minutesSecondes(reste)}'),
              ),
            );
          },
        ),
      ]),
    );
  }
}

/// Barre de progression du service (servis / commandés)
class BarreService extends StatelessWidget {
  final int servis;
  final int commandes;
  const BarreService(
      {super.key, required this.servis, required this.commandes});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return ClipRRect(
      borderRadius: BorderRadius.circular(6),
      child: LinearProgressIndicator(
        value: commandes <= 0 ? 0 : (servis / commandes).clamp(0, 1),
        minHeight: 7,
        backgroundColor: isDark
            ? Colors.white.withOpacity(0.08)
            : AppColors.primary.withOpacity(0.07),
        valueColor: const AlwaysStoppedAnimation(AppColors.accentDark),
      ),
    );
  }
}
