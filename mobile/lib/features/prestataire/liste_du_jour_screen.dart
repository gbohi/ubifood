// lib/features/prestataire/liste_du_jour_screen.dart
//
// Liste nominative du jour (agence du comptoir) : recherche par nom,
// matricule ou plat ; filtre « à servir » / « retirés ».

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/widgets/common_widgets.dart';
import '../../shared/models/prestataire_models.dart';
import '../../shared/providers/prestataire_provider.dart';
import '../../shared/theme/app_theme.dart';
import 'prestataire_widgets.dart';

class ListeDuJourScreen extends StatefulWidget {
  const ListeDuJourScreen({super.key});

  @override
  State<ListeDuJourScreen> createState() => _ListeDuJourScreenState();
}

class _ListeDuJourScreenState extends State<ListeDuJourScreen> {
  final _rechercheCtrl = TextEditingController();
  Timer? _delai;
  bool _visible = false;

  ComptoirProvider? _comptoir;
  ServiceComptoir? _serviceVu;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // Retrait validé / annulé au comptoir : liste à jour
      _comptoir = context.read<ComptoirProvider?>()
        ?..addListener(_suivreComptoir);
      _serviceVu = _comptoir?.serviceDuJour;
      _charger();
    });
  }

  void _suivreComptoir() {
    final s = _comptoir?.serviceDuJour;
    if (s == null || identical(s, _serviceVu)) return;
    _serviceVu = s;
    if (_premierChargementFait) _charger();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Onglet affiché de nouveau : liste à jour (retraits faits au comptoir)
    final visible = TickerMode.of(context);
    if (visible && !_visible && _premierChargementFait) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _charger());
    }
    _visible = visible;
  }

  bool _premierChargementFait = false;

  @override
  void dispose() {
    _comptoir?.removeListener(_suivreComptoir);
    _delai?.cancel();
    _rechercheCtrl.dispose();
    super.dispose();
  }

  Future<void> _charger({String? statut}) async {
    if (!mounted) return;
    _premierChargementFait = true;
    final espace = context.read<EspacePrestataireProvider>();
    final liste = context.read<ListeDuJourProvider>();
    if (espace.contexte == null) await espace.chargerContexte();
    if (!mounted || espace.contexte == null) return;
    await liste.charger(espace.agence?.id,
        statut: statut, recherche: _rechercheCtrl.text);
  }

  void _rechercheModifiee(String _) {
    setState(() {}); // bouton « Effacer »
    _delai?.cancel();
    _delai = Timer(const Duration(milliseconds: 350), _charger);
  }

  @override
  Widget build(BuildContext context) {
    final espace = context.watch<EspacePrestataireProvider>();
    final prov = context.watch<ListeDuJourProvider>();
    final liste = prov.liste;
    final agence = espace.agence;

    final enTete = EnTeteMarine(
      titre: 'Liste du jour',
      sousTitre: [
        jourCourtPresta(liste?.date ?? DateTime.now()),
        if (agence != null) agence.nom,
      ].join(' · '),
      actions: [
        EnTeteBouton(
          icone: Icons.refresh_rounded,
          tooltip: 'Actualiser',
          onPressed: prov.enCours ? null : _charger,
        ),
        const BoutonNotificationsEnTete(),
      ],
      bas: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        ChoixAgenceEnTete(onChange: _charger),
        if (espace.agences.length > 1) const SizedBox(height: 10),
        CompteursService(
          servis: liste?.retires ?? 0,
          aServir: liste?.aServir ?? 0,
          commandes: liste?.total ?? 0,
        ),
      ]),
    );

    final corps = Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
        child: TextField(
          controller: _rechercheCtrl,
          textInputAction: TextInputAction.search,
          onChanged: _rechercheModifiee,
          onSubmitted: (_) => _charger(),
          decoration: InputDecoration(
            hintText: 'Nom, matricule ou plat',
            isDense: true,
            prefixIcon: const Icon(Icons.search_rounded, size: 20),
            suffixIcon: _rechercheCtrl.text.isEmpty
                ? null
                : IconButton(
                    tooltip: 'Effacer',
                    icon: const Icon(Icons.close_rounded, size: 18),
                    onPressed: () {
                      _rechercheCtrl.clear();
                      _charger();
                    },
                  ),
          ),
        ),
      ),
      RangeeFiltres(filtres: [
        for (final (valeur, label, n) in [
          ('', 'Tous', liste?.total),
          ('a_servir', 'À servir', liste?.aServir),
          ('retire', 'Retirés', liste?.retires),
        ])
          FiltrePastille(
            label: label,
            compte: n,
            actif: prov.statut == valeur,
            onTap: () => _charger(statut: valeur),
          ),
      ]),
      Expanded(
        child: RefreshIndicator(
          onRefresh: _charger,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(14, 4, 14, 100),
            children: [
              if (espace.contexteErreur != null && espace.contexte == null)
                BandeauInfo(
                    icone: Icons.error_outline_rounded,
                    ton: TonPastille.rouge,
                    texte: espace.contexteErreur!,
                    action: TextButton(
                        onPressed: _charger, child: const Text('Réessayer')))
              else if (prov.erreur != null)
                BandeauInfo(
                    icone: Icons.cloud_off_rounded,
                    ton: TonPastille.rouge,
                    texte: prov.erreur!,
                    action: TextButton(
                        onPressed: _charger, child: const Text('Réessayer')))
              else if (liste == null)
                const ShimmerCard(height: 240)
              else if (liste.lignes.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 30),
                  child: EmptyState(
                    icon: Icons.groups_2_outlined,
                    title: liste.total == 0
                        ? 'Aucune commande aujourd\'hui'
                        : 'Aucun résultat',
                    subtitle: liste.total == 0
                        ? null
                        : 'Modifiez la recherche ou le filtre',
                  ),
                )
              else
                CarteListe(lignes: [
                  for (final l in liste.lignes) LigneListeDuJourTuile(ligne: l),
                ]),
            ],
          ),
        ),
      ),
    ]);

    return Scaffold(body: Column(children: [enTete, Expanded(child: corps)]));
  }
}

class LigneListeDuJourTuile extends StatelessWidget {
  final LigneListeDuJour ligne;
  const LigneListeDuJourTuile({super.key, required this.ligne});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final pastille = switch (ligne.statut) {
      'retire' => PastilleStatut(
          label: ligne.heureRetrait == null
              ? 'Retiré'
              : 'Retiré · ${ligne.heureRetrait}',
          icone: Icons.check_rounded,
          ton: TonPastille.vert),
      'non_retire' =>
        const PastilleStatut(label: 'Non retiré', ton: TonPastille.rouge),
      _ => const PastilleStatut(label: 'À servir', ton: TonPastille.or),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(children: [
        AvatarNom(nom: ligne.nomComplet, taille: 36),
        const SizedBox(width: 10),
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(ligne.nomComplet,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context)
                    .textTheme
                    .bodyLarge
                    ?.copyWith(fontSize: 13, fontWeight: FontWeight.w700)),
            Text(
                [ligne.matricule, ligne.plat]
                    .where((s) => s.isNotEmpty)
                    .join(' · '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11.5, color: gris)),
            if (ligne.estRetire && ligne.valideParNom != null)
              Text('Validé par ${ligne.valideParNom}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11, color: gris)),
          ]),
        ),
        const SizedBox(width: 8),
        ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 120), child: pastille),
      ]),
    );
  }
}
