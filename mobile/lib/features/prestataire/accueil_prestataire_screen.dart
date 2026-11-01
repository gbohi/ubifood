// lib/features/prestataire/accueil_prestataire_screen.dart
//
// Accueil léger du responsable du prestataire : service du jour par agence
// et par plat, quantités à préparer pour le prochain jour de service,
// alertes. Plats, menus, relevés et statistiques restent sur le web.

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../core/widgets/common_widgets.dart';
import '../../shared/models/prestataire_models.dart';
import '../../shared/providers/app_provider.dart';
import '../../shared/providers/prestataire_provider.dart';
import '../../shared/theme/app_theme.dart';
import '../dashboard/dashboard_screen.dart' show MainShellNavigator;
import 'prestataire_widgets.dart';

class AccueilPrestataireScreen extends StatefulWidget {
  /// Onglet du comptoir dans MainShell
  final int ongletComptoir;
  const AccueilPrestataireScreen({super.key, this.ongletComptoir = 1});

  @override
  State<AccueilPrestataireScreen> createState() =>
      _AccueilPrestataireScreenState();
}

class _AccueilPrestataireScreenState extends State<AccueilPrestataireScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _charger());
  }

  Future<void> _charger() async {
    if (!mounted) return;
    final espace = context.read<EspacePrestataireProvider>();
    await Future.wait([
      if (espace.contexte == null) espace.chargerContexte(),
      espace.chargerAccueil(),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final espace = context.watch<EspacePrestataireProvider>();
    final user = context.watch<AuthProvider>().user;
    final a = espace.accueil;
    final prenom = (user?.prenom ?? '').trim();

    final enTete = EnTeteMarine(
      titre: prenom.isEmpty ? 'Bonjour' : 'Bonjour $prenom',
      sousTitre: [
        jourCourtPresta(a?.date ?? DateTime.now()),
        if ((a?.heure ?? '').isNotEmpty) a!.heure,
      ].join(' · '),
      actions: [
        EnTeteBouton(
          icone: Icons.refresh_rounded,
          tooltip: 'Actualiser',
          onPressed: espace.accueilEnCours ? null : _charger,
        ),
        const BoutonNotificationsEnTete(),
      ],
      bas: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        PastillePrestataire(a?.prestataireLibelle.isNotEmpty == true
            ? a!.prestataireLibelle
            : (espace.contexte?.prestataireLibelle ??
                user?.prestataireLibelle ??
                'Prestataire')),
        const SizedBox(height: 10),
        CompteursService(
          servis: a?.totalServies ?? 0,
          aServir: a?.totalAServir ?? 0,
          commandes: a?.totalCommandees ?? 0,
        ),
      ]),
    );

    Widget corps;
    if (a == null && espace.accueilErreur != null) {
      corps = ListView(padding: const EdgeInsets.all(14), children: [
        BandeauInfo(
          icone: Icons.error_outline_rounded,
          ton: TonPastille.rouge,
          texte: espace.accueilErreur!,
          action:
              TextButton(onPressed: _charger, child: const Text('Réessayer')),
        ),
      ]);
    } else if (a == null) {
      corps = ListView(padding: const EdgeInsets.all(14), children: const [
        ShimmerCard(height: 160),
        SizedBox(height: 12),
        ShimmerCard(height: 200),
      ]);
    } else {
      corps = RefreshIndicator(
        onRefresh: _charger,
        child: AccueilPrestataireCorps(
          accueil: a,
          erreur: espace.accueilErreur,
          onComptoir: () =>
              MainShellNavigator.of(context)?.navigateTo(widget.ongletComptoir),
        ),
      );
    }

    return Scaffold(body: Column(children: [enTete, Expanded(child: corps)]));
  }
}

/// Contenu de l'accueil (séparé pour les tests)
class AccueilPrestataireCorps extends StatelessWidget {
  final AccueilPrestataire accueil;
  final String? erreur;
  final VoidCallback? onComptoir;

  const AccueilPrestataireCorps(
      {super.key, required this.accueil, this.erreur, this.onComptoir});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 100),
      children: [
        if (erreur != null) ...[
          BandeauInfo(
              icone: Icons.cloud_off_rounded,
              ton: TonPastille.rouge,
              texte: 'Actualisation impossible : $erreur'),
          const SizedBox(height: 12),
        ],
        BoutonVert(
          label: 'Ouvrir le comptoir',
          icone: Icons.qr_code_scanner_rounded,
          onPressed: onComptoir,
        ),
        if (accueil.alertes.isNotEmpty) ...[
          const LibelleSection('À noter'),
          CarteListe(lignes: [
            for (final al in accueil.alertes)
              LigneAlertePrestataire(alerte: al),
          ]),
        ],
        const LibelleSection("Service d'aujourd'hui"),
        if (accueil.serviceDuJour.isEmpty)
          const BandeauInfo(
            icone: Icons.event_busy_rounded,
            ton: TonPastille.gris,
            texte: "Aucun repas à servir aujourd'hui.",
          ),
        for (final s in accueil.serviceDuJour) ...[
          CarteServiceAgence(service: s),
          const SizedBox(height: 10),
        ],
        if (accueil.aPreparer != null) ...[
          const LibelleSection('À préparer'),
          CarteAPreparer(jour: accueil.aPreparer!, agences: accueil.agences),
        ],
        if (accueil.noteMoyenne != null) ...[
          const SizedBox(height: 12),
          CartePresta(
            child: Row(children: [
              const Icon(Icons.star_rounded,
                  color: Color(0xFFFFB300), size: 26),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                    'Note moyenne ${NumberFormat('0.0', 'fr_FR').format(accueil.noteMoyenne)}/5'
                    ' · ${accueil.nbAvis} avis',
                    style: Theme.of(context)
                        .textTheme
                        .bodyLarge
                        ?.copyWith(fontSize: 13, fontWeight: FontWeight.w600)),
              ),
            ]),
          ),
        ],
        const SizedBox(height: 16),
        Text(
            'Plats, menus, relevés et statistiques : espace prestataire sur le web.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11.5, color: gris)),
      ],
    );
  }
}

class CarteServiceAgence extends StatelessWidget {
  final ServiceAgencePrestataire service;
  const CarteServiceAgence({super.key, required this.service});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final horaires =
        service.heureDebutService == null || service.heureFinService == null
            ? ''
            : '${service.heureDebutService} – ${service.heureFinService}';
    return CartePresta(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text(service.agenceNom,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700)),
          ),
          if (horaires.isNotEmpty)
            Text(horaires, style: TextStyle(fontSize: 11.5, color: gris)),
        ]),
        const SizedBox(height: 8),
        BarreService(servis: service.servies, commandes: service.commandees),
        const SizedBox(height: 6),
        Text(
            '${service.servies} servi${service.servies > 1 ? 's' : ''} · '
            '${service.aServir} à servir · ${service.commandees} commandé'
            '${service.commandees > 1 ? 's' : ''}',
            style: TextStyle(fontSize: 12, color: gris)),
        if (service.plats.isNotEmpty) const SizedBox(height: 6),
        for (final p in service.plats)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(children: [
              VignettePlat(url: p.imageUrl, taille: 30, rayon: 8),
              const SizedBox(width: 10),
              Expanded(
                child: Text(p.nom,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context)
                        .textTheme
                        .bodyLarge
                        ?.copyWith(fontSize: 12.5)),
              ),
              const SizedBox(width: 8),
              Text('${p.servies}/${p.commandees}',
                  style: TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w700, color: gris)),
            ]),
          ),
      ]),
    );
  }
}

class CarteAPreparer extends StatelessWidget {
  final JourAPreparer jour;
  final List<AgencePrestataire> agences;
  const CarteAPreparer(
      {super.key, required this.jour, this.agences = const []});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final liste = jour.agences.isNotEmpty ? jour.agences : agences;
    final noms = {for (final a in liste) a.id: a.nom};
    String parAgence(Map<int, int> m) => [
          for (final e in m.entries)
            if (e.value > 0) '${noms[e.key] ?? 'Agence ${e.key}'} : ${e.value}',
        ].join(' · ');
    final libelle = jour.libelle.isNotEmpty
        ? jour.libelle[0].toUpperCase() + jour.libelle.substring(1)
        : jourCourtPresta(jour.date);
    final etat = jour.libelleEtat;
    return CartePresta(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text(libelle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700)),
          ),
          Text('${jour.total} repas',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w800)),
        ]),
        if (etat.isNotEmpty) ...[
          const SizedBox(height: 6),
          PastilleStatut(
            label: etat,
            icone: jour.etat == 'fige'
                ? Icons.lock_outline_rounded
                : Icons.schedule_rounded,
            ton: jour.etat == 'fige' ? TonPastille.vert : TonPastille.or,
          ),
        ],
        if (jour.totauxParAgence.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(parAgence(jour.totauxParAgence),
              style: TextStyle(fontSize: 12, color: gris)),
        ],
        const SizedBox(height: 6),
        if (jour.plats.isEmpty)
          Text('Aucune commande pour le moment',
              style: TextStyle(fontSize: 12.5, color: gris)),
        for (final p in jour.plats)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(children: [
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p.plat,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context)
                              .textTheme
                              .bodyLarge
                              ?.copyWith(
                                  fontSize: 12.5, fontWeight: FontWeight.w600)),
                      if (p.parAgence.length > 1)
                        Text(parAgence(p.parAgence),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 11, color: gris)),
                    ]),
              ),
              const SizedBox(width: 8),
              Text('${p.total}',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontSize: 15, fontWeight: FontWeight.w800)),
            ]),
          ),
      ]),
    );
  }
}

class LigneAlertePrestataire extends StatelessWidget {
  final AlertePrestataire alerte;
  const LigneAlertePrestataire({super.key, required this.alerte});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final (icone, ton) = switch (alerte.type) {
      'menus_a_composer' => (Icons.edit_calendar_rounded, TonPastille.or),
      'contestation' => (Icons.report_gmailerrorred_rounded, TonPastille.rouge),
      'releve' => (Icons.description_outlined, TonPastille.bleu),
      'plat_masque' => (Icons.visibility_off_outlined, TonPastille.rouge),
      _ => (Icons.info_outline_rounded, TonPastille.bleu),
    };
    final (fond, couleur) = couleursPastille(ton, isDark);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
              color: isDark && ton == TonPastille.bleu
                  ? AppColors.accent.withOpacity(0.12)
                  : fond,
              shape: BoxShape.circle),
          child: Icon(icone,
              size: 18,
              color: isDark && ton == TonPastille.bleu
                  ? AppColors.accent
                  : couleur),
        ),
        const SizedBox(width: 10),
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(alerte.titre,
                style: Theme.of(context)
                    .textTheme
                    .bodyLarge
                    ?.copyWith(fontSize: 13, fontWeight: FontWeight.w700)),
            if (alerte.detail.isNotEmpty)
              Text(alerte.detail,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11.5, height: 1.35, color: gris)),
          ]),
        ),
      ]),
    );
  }
}
