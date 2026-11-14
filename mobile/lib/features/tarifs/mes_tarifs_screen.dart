// lib/features/tarifs/mes_tarifs_screen.dart
//
// Profil → « Mes tarifs » : prix d'un repas pour l'employé connecté, par type
// de plat (Standard, Complet…), selon sa catégorie de salarié ; tarifs à
// venir ; équipes où le repas est offert. API : GET compte-repas/mes-tarifs/.

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart' show messageErreurApi;
import '../../core/services/compte_repas_service.dart';
import '../../core/widgets/common_widgets.dart';
import '../../shared/models/compte_repas_models.dart';
import '../../shared/theme/app_theme.dart';
import '../dashboard/accueil_widgets.dart' show formatFcfa;
import '../prestataire/prestataire_widgets.dart' show CartePresta;

class MesTarifsScreen extends StatefulWidget {
  final Future<MesTarifs> Function()? charger;
  const MesTarifsScreen({super.key, this.charger});

  @override
  State<MesTarifsScreen> createState() => _MesTarifsScreenState();
}

class _MesTarifsScreenState extends State<MesTarifsScreen> {
  late Future<MesTarifs> _donnees;

  @override
  void initState() {
    super.initState();
    _donnees = (widget.charger ?? compteRepasService.mesTarifs)();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    return Scaffold(
      body: Column(children: [
        const EnTeteMarine(
            titre: 'Mes tarifs',
            sousTitre: "Prix d'un repas pour vous, selon le type de plat"),
        Expanded(
          child: FutureBuilder<MesTarifs>(
            future: _donnees,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snap.hasError || snap.data == null) {
                return ListView(padding: const EdgeInsets.all(14), children: [
                  BandeauInfo(
                      icone: Icons.cloud_off_rounded,
                      ton: TonPastille.rouge,
                      texte: messageErreurApi(snap.error ?? '') ??
                          'Vos tarifs n\'ont pas pu être chargés.'),
                ]);
              }
              final d = snap.data!;
              final types = d.parType;
              return ListView(padding: const EdgeInsets.all(14), children: [
                if (d.categorie != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 2, bottom: 8),
                    child: Text('Catégorie : ${d.categorie}',
                        key: const Key('mes-tarifs-categorie'),
                        style: TextStyle(color: gris, fontSize: 12.5)),
                  ),
                if (types.isEmpty)
                  const BandeauInfo(
                      icone: Icons.info_outline_rounded,
                      ton: TonPastille.or,
                      texte:
                          "Aucun tarif défini pour vous : votre catégorie de salarié ou son tarif n'est pas "
                          'renseigné. Contactez votre gestionnaire.')
                else
                  CartePresta(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                    child: Column(children: [
                      for (final t in types)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Row(children: [
                            const Icon(Icons.restaurant_rounded,
                                size: 20, color: AppColors.accentDark),
                            const SizedBox(width: 10),
                            Expanded(
                                child: Text(t.typePlat!,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 15))),
                            Text(formatFcfa(t.montant),
                                key: Key('tarif-${t.typePlat}'),
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800, fontSize: 16)),
                          ]),
                        ),
                    ]),
                  ),
                if (d.aVenir.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  for (final a in d.aVenir)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: BandeauInfo(
                          icone: Icons.schedule_rounded,
                          ton: TonPastille.bleu,
                          texte:
                              '${a.typePlat ?? 'Tous types'} : ${formatFcfa(a.montant)} à partir du '
                              '${a.dateDebut == null ? '?' : DateFormat('dd/MM/yyyy').format(a.dateDebut!)}'),
                    ),
                ],
                if (d.equipesOffertes.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  BandeauInfo(
                      key: const Key('mes-tarifs-offerts'),
                      icone: Icons.card_giftcard_rounded,
                      ton: TonPastille.vert,
                      texte:
                          'Repas offert (rien à payer) pour l\'équipe ${d.equipesOffertes.join(', ')}.'),
                ],
                const SizedBox(height: 12),
                Text(
                    'Le prix est débité de votre compte repas ou retenu sur votre salaire selon le mode choisi '
                    'à la commande. Il est aussi affiché sur chaque plat.',
                    style: TextStyle(color: gris, fontSize: 11.5)),
              ]);
            },
          ),
        ),
      ]),
    );
  }
}
