// lib/features/menu/menu_screen.dart

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../shared/models/models.dart';
import '../../core/widgets/common_widgets.dart';
import '../../core/widgets/tic_echeance.dart';
import '../../core/services/cantine_service.dart';
import '../avis/avis_widgets.dart';
import '../dashboard/accueil_widgets.dart' show fermeDans, jourCourt;

/// Menu à afficher à l'ouverture de l'onglet (depuis l'accueil : un jour
/// de « Ma semaine », « Réserver » du prochain repas).
class CibleMenu {
  final int? menuId;
  final DateTime? date;
  const CibleMenu({this.menuId, this.date});
}

/// Demande d'affichage d'un menu, traitée par l'onglet Menu.
final menuDemande = ValueNotifier<CibleMenu?>(null);

class MenuScreen extends StatefulWidget {
  const MenuScreen({super.key});
  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  Menu? _menuSelectionne;
  _AgenceLocal? _agenceSelectionnee;
  _EquipeLocal? _equipeSelectionnee;

  /// Demande de l'accueil en attente des menus ; rechargés une fois si le
  /// menu demandé n'est pas dans la liste (menu créé depuis).
  CibleMenu? _cible;
  bool _cibleRechargee = false;

  void _onDemande() {
    final c = menuDemande.value;
    if (c == null || !mounted) return;
    menuDemande.value = null;
    setState(() {
      _cible = c;
      _cibleRechargee = false;
    });
  }

  /// Applique la demande en attente (sélection du menu, et de son agence
  /// si le filtre l'excluait). Appelé pendant build : simples affectations.
  void _appliquerCible(MenuProvider menuProv) {
    final cible = _cible;
    if (cible == null || menuProv.loading) return;
    final menus = menuProv.menus;
    String? jour(DateTime? d) =>
        d == null ? null : DateFormat('yyyy-MM-dd').format(d);
    final date = jour(cible.date);
    final agenceId = context.read<AuthProvider>().user?.derniereAgenceId;
    Menu? trouve;
    if (cible.menuId != null) {
      trouve = menus.where((m) => m.id == cible.menuId).firstOrNull;
    }
    if (trouve == null && date != null) {
      final duJour = menus.where((m) => m.dateMenu == date);
      trouve = duJour
              .where((m) =>
                  _agenceSelectionnee == null ||
                  m.agenceId.toString() == _agenceSelectionnee!.id)
              .firstOrNull ??
          duJour.where((m) => m.agenceId == agenceId).firstOrNull ??
          duJour.firstOrNull;
    }
    if (trouve == null && !_cibleRechargee) {
      _cibleRechargee = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.read<MenuProvider>().loadMenus();
      });
      return;
    }
    _cible = null;
    if (trouve == null) return;
    _menuSelectionne = trouve;
    if (_agenceSelectionnee != null &&
        _agenceSelectionnee!.id != trouve.agenceId.toString()) {
      _agenceSelectionnee =
          _AgenceLocal(id: trouve.agenceId.toString(), nom: trouve.agenceNom);
    }
    if (_equipeSelectionnee != null &&
        _equipeSelectionnee!.id != trouve.typeEquipeId.toString()) {
      _equipeSelectionnee = null;
    }
  }

  @override
  void dispose() {
    menuDemande.removeListener(_onDemande);
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    menuDemande.addListener(_onDemande);
    _cible = menuDemande.value;
    menuDemande.value = null;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final auth = context.read<AuthProvider>();
      final agenceId = auth.user?.derniereAgenceId;
      final agenceNom = auth.user?.derniereAgence;

      // Menus de toutes les agences : un agent peut commander là où il se
      // trouve ; son agence est seulement pré-sélectionnée dans le filtre.
      await context.read<MenuProvider>().loadMenus();
      if (!mounted) return;
      context.read<CommandeProvider>().loadMesCommandes();

      // ✅ Pré-sélectionner l'agence du user APRÈS le chargement
      // → les items du dropdown existent déjà → pas d'assertion error
      if (agenceId != null && agenceNom != null) {
        final menus = context.read<MenuProvider>().menus;
        final agenceExiste = menus.any(
          (m) => m.agenceId.toString() == agenceId.toString(),
        );
        if (agenceExiste) {
          setState(() {
            _agenceSelectionnee = _AgenceLocal(
              id: agenceId.toString(),
              nom: agenceNom,
            );
          });
        }
      }
    });
  }

  Future<void> _recharger() => Future.wait([
        context.read<MenuProvider>().loadMenus(),
        context.read<CommandeProvider>().loadMesCommandes(),
      ]);

  /// État vide / erreur rafraîchissable par glissement
  Widget _defilable(Widget child) => RefreshIndicator(
        onRefresh: _recharger,
        child: LayoutBuilder(
          builder: (_, constraints) => SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: child,
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Consumer<MenuProvider>(builder: (_, menuProv, __) {
        final agences = <String, String>{};
        final equipes = <String, String>{};
        for (final m in menuProv.menus) {
          agences[m.agenceId.toString()] = m.agenceNom;
          equipes[m.typeEquipeId.toString()] = m.typeEquipeLibelle;
        }

        // Filtre devenu sans menu après actualisation : ignoré
        final agenceSel = agences.containsKey(_agenceSelectionnee?.id)
            ? _agenceSelectionnee
            : null;
        final equipeSel = equipes.containsKey(_equipeSelectionnee?.id)
            ? _equipeSelectionnee
            : null;

        void ouvrirFiltres() => _FiltresSheet.show(
              context,
              agences: agences,
              equipes: equipes,
              agenceSelectionnee: agenceSel,
              equipeSelectionnee: equipeSel,
              onAgenceChanged: (a) => setState(() {
                _agenceSelectionnee = a;
                _menuSelectionne = null;
              }),
              onEquipeChanged: (e) => setState(() {
                _equipeSelectionnee = e;
                _menuSelectionne = null;
              }),
            );

        final enTete = EnTeteMarine(
          titre: 'Menus',
          sousTitre: 'Choisissez votre repas de la semaine',
          actions: [
            EnTeteBouton(
              icone: Icons.tune_rounded,
              tooltip: 'Filtrer par agence et équipe',
              onPressed: menuProv.menus.isEmpty ? null : ouvrirFiltres,
            ),
          ],
          bas: menuProv.menus.isEmpty
              ? null
              : Wrap(spacing: 6, runSpacing: 6, children: [
                  EnTetePastille(
                    icone: Icons.location_on_outlined,
                    label: agenceSel?.nom ?? 'Toutes les agences',
                    onTap: ouvrirFiltres,
                  ),
                  if (equipes.isNotEmpty)
                    EnTetePastille(
                      icone: Icons.groups_outlined,
                      label: equipeSel?.nom ?? 'Toutes les équipes',
                      onTap: ouvrirFiltres,
                    ),
                ]),
        );

        // Squelettes au premier chargement seulement : une actualisation
        // garde la liste affichée
        if (menuProv.loading && menuProv.menus.isEmpty) {
          return Column(children: [
            enTete,
            Expanded(
              child: ListView(
                  padding: const EdgeInsets.all(14),
                  children:
                      List.generate(4, (_) => const ShimmerCard(height: 98))),
            ),
          ]);
        }

        if (menuProv.error != null && menuProv.menus.isEmpty) {
          return Column(children: [
            enTete,
            Expanded(
              child: _defilable(EmptyState(
                icon: Icons.cloud_off_rounded,
                title: 'Chargement impossible',
                subtitle: menuProv.error,
                action: ElevatedButton.icon(
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  label: const Text('Réessayer'),
                  onPressed: _recharger,
                ),
              )),
            ),
          ]);
        }

        _appliquerCible(menuProv);

        final menusFiltres = menuProv.menus.where((m) {
          final okAgence =
              agenceSel == null || m.agenceId.toString() == agenceSel.id;
          final okEquipe =
              equipeSel == null || m.typeEquipeId.toString() == equipeSel.id;
          return okAgence && okEquipe;
        }).toList();

        // Toujours l'instance de la dernière liste chargée (après une
        // actualisation, l'ancienne garde des plats périmés)
        final selection = _menuSelectionne == null
            ? null
            : menusFiltres
                .where((m) => m.id == _menuSelectionne!.id)
                .firstOrNull;

        if (selection == null && menusFiltres.isNotEmpty) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              setState(() {
                _menuSelectionne = menusFiltres.firstWhere((m) => m.isToday,
                    orElse: () => menusFiltres.first);
              });
            }
          });
        }

        return Column(children: [
          enTete,
          // Actualisation en échec : les menus affichés peuvent être périmés
          if (menuProv.error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
              child: BandeauInfo(
                icone: Icons.cloud_off_rounded,
                ton: TonPastille.rouge,
                texte: 'Actualisation impossible : ${menuProv.error}',
                action: TextButton(
                  onPressed: menuProv.loading ? null : _recharger,
                  child: const Text('Réessayer'),
                ),
              ),
            ),
          if (menusFiltres.isNotEmpty)
            _JoursSelector(
              menus: menusFiltres,
              // Plusieurs agences possibles : on distingue par l'agence,
              // sinon par l'équipe.
              distinguerParAgence: agenceSel == null,
              selected: selection,
              onSelected: (m) => setState(() => _menuSelectionne = m),
            ),
          Expanded(
            child: menusFiltres.isEmpty
                ? _defilable(const EmptyState(
                    icon: Icons.calendar_today_outlined,
                    title: 'Aucun menu disponible',
                    subtitle: 'Aucun menu pour ces filtres',
                  ))
                : selection == null
                    ? const Center(child: CircularProgressIndicator())
                    : RefreshIndicator(
                        onRefresh: _recharger,
                        child: _MenuDetail(menu: selection),
                      ),
          ),
        ]);
      }),
    );
  }
}

class _AgenceLocal {
  final String id;
  final String nom;
  const _AgenceLocal({required this.id, required this.nom});
}

class _EquipeLocal {
  final String id;
  final String nom;
  const _EquipeLocal({required this.id, required this.nom});
}

/// Commande active (en attente ou retirée) pour ce menu, sinon pour le même
/// jour dans un autre menu (autre agence / équipe).
(Commande?, Commande?) _commandesDuJour(List<Commande> commandes, Menu menu) {
  bool active(Commande c) =>
      c.statut == StatutCommande.enAttente ||
      c.statut == StatutCommande.retiree;
  final ceMenu = commandes
      .where((c) => c.menuDetail?.id == menu.id && active(c))
      .firstOrNull;
  final ceJour = ceMenu ??
      commandes
          .where((c) => c.menuDetail?.dateMenu == menu.dateMenu && active(c))
          .firstOrNull;
  return (ceMenu, ceJour);
}

String _minuscule(String s) =>
    s.isEmpty ? s : s[0].toLowerCase() + s.substring(1);

// ══════════════════════════════════════════════════════════════
// FILTRES (feuille ouverte depuis l'en-tête)
// ══════════════════════════════════════════════════════════════

class _FiltresSheet extends StatelessWidget {
  final Map<String, String> agences;
  final Map<String, String> equipes;
  final _AgenceLocal? agenceSelectionnee;
  final _EquipeLocal? equipeSelectionnee;
  final ValueChanged<_AgenceLocal?> onAgenceChanged;
  final ValueChanged<_EquipeLocal?> onEquipeChanged;

  const _FiltresSheet({
    required this.agences,
    required this.equipes,
    required this.agenceSelectionnee,
    required this.equipeSelectionnee,
    required this.onAgenceChanged,
    required this.onEquipeChanged,
  });

  static Future<void> show(
    BuildContext context, {
    required Map<String, String> agences,
    required Map<String, String> equipes,
    required _AgenceLocal? agenceSelectionnee,
    required _EquipeLocal? equipeSelectionnee,
    required ValueChanged<_AgenceLocal?> onAgenceChanged,
    required ValueChanged<_EquipeLocal?> onEquipeChanged,
  }) =>
      showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (_) => _FiltresSheet(
          agences: agences,
          equipes: equipes,
          agenceSelectionnee: agenceSelectionnee,
          equipeSelectionnee: equipeSelectionnee,
          onAgenceChanged: onAgenceChanged,
          onEquipeChanged: onEquipeChanged,
        ),
      );

  @override
  Widget build(BuildContext context) {
    void choisir(VoidCallback appliquer) {
      appliquer();
      Navigator.of(context).pop();
    }

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Filtrer les menus',
              style: Theme.of(context)
                  .textTheme
                  .titleLarge
                  ?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          const LibelleSection('Agence'),
          Wrap(spacing: 6, runSpacing: 6, children: [
            FiltrePastille(
              label: 'Toutes les agences',
              actif: agenceSelectionnee == null,
              onTap: () => choisir(() => onAgenceChanged(null)),
            ),
            for (final e in agences.entries)
              FiltrePastille(
                label: e.value,
                actif: agenceSelectionnee?.id == e.key,
                onTap: () => choisir(() =>
                    onAgenceChanged(_AgenceLocal(id: e.key, nom: e.value))),
              ),
          ]),
          if (equipes.isNotEmpty) ...[
            const SizedBox(height: 14),
            const LibelleSection('Équipe'),
            Wrap(spacing: 6, runSpacing: 6, children: [
              FiltrePastille(
                label: 'Toutes les équipes',
                actif: equipeSelectionnee == null,
                onTap: () => choisir(() => onEquipeChanged(null)),
              ),
              for (final e in equipes.entries)
                FiltrePastille(
                  label: e.value,
                  actif: equipeSelectionnee?.id == e.key,
                  onTap: () => choisir(() =>
                      onEquipeChanged(_EquipeLocal(id: e.key, nom: e.value))),
                ),
            ]),
          ],
        ]),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// SÉLECTEUR JOURS (avec l'état de chaque jour)
// ══════════════════════════════════════════════════════════════

class _JoursSelector extends StatelessWidget {
  final List<Menu> menus;
  final bool distinguerParAgence;
  final Menu? selected;
  final ValueChanged<Menu> onSelected;

  const _JoursSelector({
    required this.menus,
    required this.distinguerParAgence,
    required this.selected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    final commandes = context.watch<CommandeProvider>().mesCommandes;
    // Plusieurs menus le même jour (équipes / agences) : 2e ligne explicative
    final parDate = <String, int>{};
    for (final m in menus) {
      parDate[m.dateMenu] = (parDate[m.dateMenu] ?? 0) + 1;
    }
    final avecSousTitre = parDate.values.any((n) => n > 1);
    return TicEcheance(
      echeances: [for (final m in menus) m.dateLimiteCommande],
      builder: (context) => LayoutBuilder(builder: (_, contraintes) {
        const marge = 14.0, ecart = 8.0;
        final n = menus.length;
        final dispo = contraintes.maxWidth - 2 * marge;
        final largeur = n <= 5
            ? ((dispo - ecart * (n - 1)) / n).clamp(56.0, 96.0)
            : (avecSousTitre ? 74.0 : 64.0);
        return SizedBox(
          height: avecSousTitre ? 92 : 80,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(marge, 12, marge, 0),
            itemCount: n,
            separatorBuilder: (_, __) => const SizedBox(width: ecart),
            itemBuilder: (_, i) {
              final menu = menus[i];
              final (_, ceJour) = _commandesDuJour(commandes, menu);
              return SizedBox(
                width: largeur,
                child: _JourChip(
                  menu: menu,
                  selectionne: selected?.id == menu.id,
                  reserve: ceJour != null,
                  sousTitre: (parDate[menu.dateMenu] ?? 0) > 1
                      ? (distinguerParAgence
                          ? menu.agenceNom
                          : menu.typeEquipeLibelle)
                      : null,
                  onTap: () => onSelected(menu),
                ),
              );
            },
          ),
        );
      }),
    );
  }
}

class _JourChip extends StatelessWidget {
  final Menu menu;
  final bool selectionne;
  final bool reserve;
  final String? sousTitre;
  final VoidCallback onTap;
  const _JourChip({
    required this.menu,
    required this.selectionne,
    required this.reserve,
    required this.sousTitre,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final date = DateTime.tryParse(menu.dateMenu);
    final ouvert = !menu.commandeFermee;
    // Sélection : marine (vert en mode sombre, le marine y est invisible)
    final fondSel = isDark ? AppColors.accent : AppColors.primary;
    final texteSel = isDark ? AppColors.primary : Colors.white;
    final texte = selectionne
        ? texteSel
        : (isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary);
    final gris = selectionne
        ? texteSel.withOpacity(0.75)
        : (isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary);

    final IconData icone;
    final Color couleurIcone;
    final String etat;
    if (reserve) {
      icone = Icons.check_circle_rounded;
      couleurIcone = selectionne
          ? (isDark ? AppColors.primary : AppColors.accent)
          : (isDark ? AppColors.accent : const Color(0xFF1F9D55));
      etat = 'réservé';
    } else if (ouvert) {
      icone = Icons.add_circle_outline_rounded;
      couleurIcone = selectionne
          ? (isDark ? AppColors.primary : AppColors.accent)
          : AppColors.accentDark;
      etat = 'à réserver';
    } else {
      icone = Icons.lock_outline_rounded;
      couleurIcone = gris;
      etat = 'commandes fermées';
    }

    final jour = date != null ? jourCourt(date) : '—';
    final num = date != null ? '${date.day}' : '—';
    return Semantics(
      button: true,
      selected: selectionne,
      label: [
        if (date != null) DateFormat('EEEE d MMMM', 'fr_FR').format(date),
        if (menu.isToday) "aujourd'hui",
        if (sousTitre != null) sousTitre!,
        etat,
      ].join(', '),
      excludeSemantics: true,
      child: Material(
        color: selectionne
            ? fondSel
            : (isDark ? AppColors.darkCard : AppColors.lightCard),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(
            color: selectionne
                ? fondSel
                : menu.isToday
                    ? AppColors.accentDark
                    : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
            width: !selectionne && menu.isToday ? 1.6 : 1,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
            child:
                Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Text(jour, style: TextStyle(fontSize: 11, color: gris)),
              Text(num,
                  style: TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w800, color: texte)),
              if (sousTitre != null)
                Text(sousTitre!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 9, fontWeight: FontWeight.w500, color: gris)),
              Icon(icone, size: 15, color: couleurIcone),
            ]),
          ),
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// DÉTAIL DU MENU : statut du jour (une seule fois) + plats compacts
// ══════════════════════════════════════════════════════════════

class _MenuDetail extends StatelessWidget {
  final Menu menu;

  const _MenuDetail({required this.menu});

  /// Reconstruit à l'heure limite de commande / d'annulation : bandeau,
  /// « Réserver » et « Annuler » se ferment sans action de l'utilisateur.
  @override
  Widget build(BuildContext context) => TicEcheance(
        echeances: [menu.dateLimiteCommande, menu.dateLimiteAnnulation],
        builder: _contenu,
      );

  Widget _contenu(BuildContext context) {
    final cmdProv = context.watch<CommandeProvider>();
    final (ceMenu, ceJour) = _commandesDuJour(cmdProv.mesCommandes, menu);
    final autreMenuCeJour = ceMenu == null ? ceJour : null;
    final peutReserver =
        ceMenu == null && autreMenuCeJour == null && !menu.commandeFermee;
    final nb = menu.menuPlats.length;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 100),
      children: [
        if (ceMenu != null) ...[
          _CarteVotreRepas(commande: ceMenu, menu: menu),
          ..._bandeauAnnulation(context, cmdProv, ceMenu),
        ] else if (autreMenuCeJour != null)
          _bandeauAutreMenu(autreMenuCeJour)
        else if (!menu.commandeFermee)
          BandeauInfo(
            icone: Icons.alarm_rounded,
            ton: TonPastille.or,
            texte: [
              'Commandes ouvertes',
              if (fermeDans(menu.dateLimiteCommande, DateTime.now()) != null)
                _minuscule(fermeDans(menu.dateLimiteCommande, DateTime.now())!),
            ].join(' · '),
          )
        else
          const BandeauInfo(
            icone: Icons.lock_outline_rounded,
            ton: TonPastille.gris,
            texte: 'Commandes fermées pour ce jour',
          ),
        const SizedBox(height: 6),
        if (nb == 0)
          const EmptyState(
            icon: Icons.no_meals_rounded,
            title: 'Aucun plat',
            subtitle: 'Aucun plat ajouté pour ce menu',
          )
        else ...[
          LibelleSection(peutReserver
              ? 'Choisissez 1 plat sur $nb'
              : '$nb ${nb > 1 ? 'plats proposés' : 'plat proposé'}'),
          for (final mp in menu.menuPlats)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _CartePlat(
                plat: mp.plat,
                menu: menu,
                commandee: ceMenu?.platDetail?.id == mp.plat.id,
                // Un autre repas est déjà choisi ce jour : plats grisés
                grisee:
                    (ceMenu != null && ceMenu.platDetail?.id != mp.plat.id) ||
                        autreMenuCeJour != null,
                peutReserver: peutReserver,
              ),
            ),
        ],
      ],
    );
  }

  List<Widget> _bandeauAnnulation(
      BuildContext context, CommandeProvider cmdProv, Commande c) {
    if (c.statut != StatutCommande.enAttente || c.estNonRetiree()) return [];
    final Widget bandeau;
    if (!menu.annulationFermee) {
      final delai = fermeDans(menu.dateLimiteAnnulation, DateTime.now());
      bandeau = BandeauInfo(
        icone: Icons.timer_outlined,
        ton: TonPastille.or,
        texte: [
          'Annulation possible',
          if (delai != null) _minuscule(delai),
        ].join(' · '),
        action: TextButton(
          style: TextButton.styleFrom(foregroundColor: AppColors.error),
          onPressed: cmdProv.isLoading
              ? null
              : () =>
                  _confirmerAnnulationCommande(context, cmdProv, menu, c.id),
          child: const Text('Annuler',
              style: TextStyle(fontWeight: FontWeight.w700)),
        ),
      );
    } else {
      bandeau = BandeauInfo(
        icone: Icons.lock_outline_rounded,
        ton: TonPastille.gris,
        texte: menu.commandeFermee
            ? 'Commandes et annulations fermées pour ce jour'
            : 'Annulation fermée pour ce jour',
      );
    }
    return [const SizedBox(height: 10), bandeau];
  }

  Widget _bandeauAutreMenu(Commande c) {
    final agence = c.menuDetail?.agenceNom ?? 'une autre agence';
    final plat = c.platDetail?.nom ?? 'un plat';
    final annulable = c.statut == StatutCommande.enAttente &&
        !(c.menuDetail?.annulationFermee ?? true);
    return BandeauInfo(
      icone: Icons.location_off_rounded,
      ton: TonPastille.rouge,
      texte: 'Vous avez déjà commandé « $plat » chez $agence ce jour.'
          '${annulable ? '\nAnnulez cette commande pour en passer une autre.' : ''}',
    );
  }
}

/// Carte verte « Votre repas » (le jour a déjà une commande)
class _CarteVotreRepas extends StatelessWidget {
  final Commande commande;
  final Menu menu;
  const _CarteVotreRepas({required this.commande, required this.menu});

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(menu.dateMenu);
    final retiree = commande.statut == StatutCommande.retiree;
    final nonRetiree = commande.estNonRetiree();
    final plat = commande.platDetail;
    final platDuMenu = menu.menuPlats
        .where((mp) => mp.plat.id == plat?.id)
        .map((mp) => mp.plat)
        .firstOrNull;
    final etat = retiree
        ? 'Retiré'
        : nonRetiree
            ? 'Non retiré'
            : 'À retirer au comptoir';
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        // Fiche du plat commandé (avis, annulation)
        onTap: platDuMenu == null
            ? null
            : () =>
                _PlatDetailSheet.show(context, menu: menu, plat: platDuMenu),
        child: Ink(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
                colors: [Color(0xFF1F9D55), Color(0xFF3EC970)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.22),
                  borderRadius: BorderRadius.circular(12)),
              child: const Icon(Icons.restaurant_rounded,
                  color: Colors.white, size: 20),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                        'Votre repas'
                        '${date != null ? ' · ${DateFormat('EEEE d MMMM', 'fr_FR').format(date)}' : ''}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: Colors.white.withOpacity(0.85),
                            fontSize: 11.5)),
                    Text(plat?.nom ?? 'Repas commandé',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w700)),
                    Text('$etat · ${menu.agenceNom}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: Colors.white.withOpacity(0.85),
                            fontSize: 11.5)),
                  ]),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                  color: Colors.white, borderRadius: BorderRadius.circular(20)),
              child: Text(
                  retiree
                      ? 'Retirée'
                      : nonRetiree
                          ? 'Non retirée'
                          : 'En attente',
                  style: const TextStyle(
                      color: Color(0xFF1F9D55),
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700)),
            ),
          ]),
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// CARTE PLAT COMPACTE (la grande photo reste dans la fiche détaillée)
// ══════════════════════════════════════════════════════════════

class _CartePlat extends StatefulWidget {
  final Plat plat;
  final Menu menu;
  final bool commandee;
  final bool grisee;
  final bool peutReserver;

  const _CartePlat({
    required this.plat,
    required this.menu,
    required this.commandee,
    required this.grisee,
    required this.peutReserver,
  });

  @override
  State<_CartePlat> createState() => _CartePlatState();
}

class _CartePlatState extends State<_CartePlat> {
  bool _envoi = false;

  Future<void> _reserver(CommandeProvider cmdProv) async {
    setState(() => _envoi = true);
    await _reserverPlat(context, cmdProv, widget.menu, widget.plat);
    if (mounted) setState(() => _envoi = false);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cmdProv = context.watch<CommandeProvider>();
    final plat = widget.plat;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final description = plat.descriptionUtile;
    final type = plat.typePlatLibelle;

    Widget? note;
    if (plat.noteMoyenne != null && (plat.nbAvis ?? 1) > 0) {
      note = Row(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.star_rounded, size: 14, color: kCouleurEtoile),
        const SizedBox(width: 2),
        Text(
            formatNoteMoyenne(plat.noteMoyenne!) +
                (plat.nbAvis != null ? ' · ${plat.nbAvis} avis' : ''),
            style: TextStyle(fontSize: 11, color: gris)),
      ]);
    } else if (plat.nbAvis == 0) {
      note =
          Text('Pas encore noté', style: TextStyle(fontSize: 11, color: gris));
    }

    final Widget? droite = widget.commandee
        ? const Icon(Icons.check_circle_rounded,
            color: AppColors.accentDark, size: 26, semanticLabel: 'Commandé')
        : widget.peutReserver
            ? BoutonVert(
                label: 'Réserver',
                compact: true,
                chargement: _envoi,
                onPressed: cmdProv.isLoading ? null : () => _reserver(cmdProv),
              )
            : null;

    final carte = Material(
      color: isDark ? AppColors.darkCard : AppColors.lightCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: widget.commandee
              ? AppColors.accentDark
              : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
          width: widget.commandee ? 2 : 1,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        // Toute la carte ouvre la fiche détaillée du plat
        onTap: () =>
            _PlatDetailSheet.show(context, menu: widget.menu, plat: plat),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(children: [
            VignettePlat(url: plat.imageUrl, taille: 78, rayon: 12),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(plat.nom,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700)),
                    if (description != null) ...[
                      const SizedBox(height: 2),
                      Text(description,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 11.5, color: gris)),
                    ],
                    if (type != null || note != null) ...[
                      const SizedBox(height: 6),
                      Wrap(
                          spacing: 8,
                          runSpacing: 4,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            if (type != null)
                              PastilleStatut(
                                  label: type,
                                  ton: type.toLowerCase().contains('principal')
                                      ? TonPastille.vert
                                      : TonPastille.bleu),
                            if (note != null) note,
                          ]),
                    ],
                  ]),
            ),
            if (droite != null) ...[const SizedBox(width: 8), droite],
          ]),
        ),
      ),
    );
    return widget.grisee ? Opacity(opacity: 0.55, child: carte) : carte;
  }
}

/// Réserve [plat] (carte compacte et fiche détaillée : mêmes messages)
Future<void> _reserverPlat(BuildContext context, CommandeProvider cmdProv,
    Menu menu, Plat plat) async {
  if (cmdProv.isLoading) return;
  final facturation = context.read<FacturationProvider>();
  final ok = await cmdProv.commander(menuId: menu.id, platId: plat.id);
  // « Ma facturation » doit refléter la nouvelle commande
  if (ok) facturation.charger();
  if (ok && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Row(children: [
        const Icon(Icons.check_circle_rounded, color: Colors.white),
        const SizedBox(width: 8),
        Expanded(child: Text('${plat.nom} — commande confirmée !')),
      ]),
      backgroundColor: AppColors.success,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      margin: const EdgeInsets.all(12),
    ));
  } else if (!ok && context.mounted && cmdProv.error != null) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(cmdProv.error!),
      backgroundColor: AppColors.error,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      margin: const EdgeInsets.all(12),
    ));
    cmdProv.clearMessages();
  }
  // Refus du serveur (commande déjà passée ailleurs, délai…) : la liste
  // locale est peut-être périmée, on la recharge
  if (!ok) cmdProv.loadMesCommandes();
}

/// Confirmation puis annulation de sa commande (carte « Votre repas »,
/// fiche détaillée)
void _confirmerAnnulationCommande(
    BuildContext context, CommandeProvider cmdProv, Menu menu, int commandeId) {
  showDialog(
      context: context,
      builder: (dialogCtx) => AlertDialog(
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            title: const Row(children: [
              Icon(Icons.warning_amber_rounded, color: AppColors.warning),
              SizedBox(width: 8),
              Text('Annuler ?'),
            ]),
            content: Text(
              'Voulez-vous annuler cette commande ?'
              '${menu.dateLimiteAnnulation != null ? '\n\nAnnulation possible jusqu\'au ${libelleDateLimite(menu.dateLimiteAnnulation!)}.' : ''}',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogCtx),
                child: const Text('Non, garder'),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.error,
                  foregroundColor: Colors.white,
                ),
                onPressed: () async {
                  // Capturés avant l'await : la carte peut disparaître
                  final messenger = ScaffoldMessenger.of(context);
                  final facturation = context.read<FacturationProvider>();
                  Navigator.pop(dialogCtx);
                  if (cmdProv.isLoading) return;
                  final ok = await cmdProv.annuler(commandeId);
                  if (ok) {
                    facturation.charger();
                  } else {
                    // Commande retirée / annulée entre-temps : on resynchronise
                    cmdProv.loadMesCommandes();
                  }
                  messenger.showSnackBar(SnackBar(
                    content: Text(ok
                        ? 'Commande annulée'
                        : (cmdProv.error ??
                            'Impossible d\'annuler la commande')),
                    backgroundColor: ok ? AppColors.warning : AppColors.error,
                    behavior: SnackBarBehavior.floating,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    margin: const EdgeInsets.all(12),
                  ));
                },
                child: const Text('Oui, annuler'),
              ),
            ],
          ));
}

// ══════════════════════════════════════════════════════════════
// FICHE DÉTAILLÉE D'UN PLAT (feuille modale)
// ══════════════════════════════════════════════════════════════

/// État de la commande du jour vu depuis la fiche d'un plat (ordre des
/// règles : retrait, ce plat réservé, autre plat de ce menu, autre agence
/// le même jour, délai dépassé, réservation possible).
enum _EtatFiche {
  platRetire,
  autrePlatRetire,
  platReserve,
  autrePlatCeMenu,
  autreAgence,
  commandesFermees,
  ouvert,
}

/// « 2 j 13 h » : temps restant avant [limite] (null si passée)
String? _tempsRestant(DateTime? limite) =>
    fermeDans(limite, DateTime.now())?.replaceFirst('Ferme dans ', '');

/// « ven. 23 oct., 18 h » / « ven. 23 oct., minuit » (heure locale)
String _dateLimiteCourte(DateTime limite) {
  var d = limite.toLocal();
  final minuit = d.hour == 0 && d.minute == 0;
  if (minuit) d = d.subtract(const Duration(days: 1));
  final jour = DateFormat('EEE d MMM', 'fr_FR').format(d);
  if (minuit) return '$jour, minuit';
  return '$jour, ${d.hour} h${d.minute == 0 ? '' : ' ${d.minute.toString().padLeft(2, '0')}'}';
}

String _majusculeInitiale(String s) =>
    s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

/// Fiche d'un plat pour les tests (résumé des avis fourni sans réseau)
@visibleForTesting
Widget ficheDetailPlat({
  required Menu menu,
  required Plat plat,
  required Future<ResumeAvisPlat> Function(int platId) chargerAvis,
}) =>
    _PlatDetailSheet(menu: menu, plat: plat, chargerAvis: chargerAvis);

class _PlatDetailSheet extends StatefulWidget {
  final Menu menu;
  final Plat plat;

  /// Résumé des avis du plat (par défaut GET /plats/{id}/avis/)
  final Future<ResumeAvisPlat> Function(int platId)? chargerAvis;

  const _PlatDetailSheet(
      {required this.menu, required this.plat, this.chargerAvis});

  static Future<void> show(BuildContext context,
      {required Menu menu, required Plat plat}) {
    return showModalBottomSheet<void>(
      context: context,
      // Même navigateur que la boîte de confirmation d'annulation
      useRootNavigator: true,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _PlatDetailSheet(menu: menu, plat: plat),
    );
  }

  @override
  State<_PlatDetailSheet> createState() => _PlatDetailSheetState();
}

class _PlatDetailSheetState extends State<_PlatDetailSheet> {
  late Future<ResumeAvisPlat> _resume;
  bool _envoi = false;

  Future<ResumeAvisPlat> _charger() =>
      (widget.chargerAvis ?? avisService.resumePlat)(widget.plat.id);

  @override
  void initState() {
    super.initState();
    _resume = _charger();
  }

  void _rechargerAvis() => setState(() => _resume = _charger());

  /// [ctx] : contexte sous le messager de la feuille (SnackBar visible)
  Future<void> _reserver(BuildContext ctx, CommandeProvider cmdProv) async {
    setState(() => _envoi = true);
    await _reserverPlat(ctx, cmdProv, widget.menu, widget.plat);
    if (mounted) setState(() => _envoi = false);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fond = isDark ? AppColors.darkSurface : AppColors.lightSurface;

    // Messager propre à la feuille : les SnackBars (commande, annulation,
    // avis) s'affichent au-dessus d'elle et non derrière. La feuille prend
    // la hauteur de son contenu ; la zone transparente au-dessus la ferme.
    return ScaffoldMessenger(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: LayoutBuilder(
          builder: (context, contraintes) => Column(children: [
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => Navigator.of(context).pop(),
              ),
            ),
            ConstrainedBox(
              constraints:
                  BoxConstraints(maxHeight: contraintes.maxHeight * 0.94),
              child: Material(
                color: fond,
                clipBehavior: Clip.antiAlias,
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(22)),
                // Reconstruit à l'heure limite de commande / d'annulation :
                // « Réserver » et « Annuler » se ferment d'eux-mêmes.
                child: TicEcheance(
                  echeances: [
                    widget.menu.dateLimiteCommande,
                    widget.menu.dateLimiteAnnulation
                  ],
                  builder: _feuille,
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _feuille(BuildContext context) {
    final menu = widget.menu;
    final plat = widget.plat;
    final cmdProv = context.watch<CommandeProvider>();
    final (ceMenu, ceJour) = _commandesDuJour(cmdProv.mesCommandes, menu);
    final estCePlat = ceMenu != null && ceMenu.platDetail?.id == plat.id;

    final _EtatFiche etat;
    if (ceMenu?.statut == StatutCommande.retiree) {
      etat = estCePlat ? _EtatFiche.platRetire : _EtatFiche.autrePlatRetire;
    } else if (estCePlat) {
      etat = _EtatFiche.platReserve;
    } else if (ceMenu != null) {
      etat = _EtatFiche.autrePlatCeMenu;
    } else if (ceJour != null) {
      etat = _EtatFiche.autreAgence;
    } else if (menu.commandeFermee) {
      etat = _EtatFiche.commandesFermees;
    } else {
      etat = _EtatFiche.ouvert;
    }

    final bandeau = switch (etat) {
      _EtatFiche.ouvert => _BandeauOuvert(menu: menu),
      _EtatFiche.platReserve => _CarteReserve(commande: ceMenu!, menu: menu),
      _ => null,
    };

    return Column(mainAxisSize: MainAxisSize.min, children: [
      Flexible(
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _PhotosCarousel(
                  plat: plat, onFermer: () => Navigator.of(context).pop()),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 18),
                child: FutureBuilder<ResumeAvisPlat>(
                  future: _resume,
                  builder: (context, snap) => _corps(
                    context,
                    resume: snap.data,
                    bandeau: bandeau,
                    // Repas retiré : notation (le résumé est rechargé après)
                    retiree: etat == _EtatFiche.platRetire ? ceMenu : null,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      _pied(context, cmdProv, etat, ceMenu, ceJour),
    ]);
  }

  Widget _corps(BuildContext context,
      {required ResumeAvisPlat? resume,
      required Widget? bandeau,
      required Commande? retiree}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final texte =
        isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final plat = widget.plat;
    final menu = widget.menu;
    final type = plat.typePlatLibelle;
    final description = plat.descriptionUtile;

    // Note : résumé chargé, sinon celle fournie avec le plat
    final moyenne = resume?.noteMoyenne ?? plat.noteMoyenne;
    final nbAvis = resume?.nbAvis ?? plat.nbAvis;
    Widget? note;
    if (moyenne != null && (nbAvis ?? 1) > 0) {
      note = Wrap(
        spacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          EtoilesNote(note: moyenne.round(), size: 16),
          Text.rich(TextSpan(children: [
            TextSpan(
                text: formatNoteMoyenne(moyenne),
                style: TextStyle(
                    fontSize: 13.5, fontWeight: FontWeight.w700, color: texte)),
            if (nbAvis != null)
              TextSpan(
                  text: ' · $nbAvis avis',
                  style: TextStyle(fontSize: 12.5, color: gris)),
          ])),
        ],
      );
    } else if (nbAvis == 0) {
      note = Text('Pas encore noté',
          style: TextStyle(fontSize: 12.5, color: gris));
    }

    final date = DateTime.tryParse(menu.dateMenu);
    final avis = resume?.derniers ?? const <AvisRecent>[];

    final blocs = <Widget>[
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Text(plat.nom,
              style: TextStyle(
                  fontSize: 21,
                  height: 1.2,
                  fontWeight: FontWeight.w800,
                  color: texte)),
        ),
        if (type != null) ...[
          const SizedBox(width: 10),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 130),
              child: PastilleStatut(
                  label: type,
                  icone: Icons.eco_outlined,
                  ton: TonPastille.vert),
            ),
          ),
        ],
      ]),
      if (note != null) note,
      if (description != null)
        Text(description,
            style: TextStyle(
                fontSize: 13,
                height: 1.5,
                color: texte.withOpacity(isDark ? 0.85 : 0.8))),
      Wrap(spacing: 6, runSpacing: 6, children: [
        if (date != null)
          _PastilleInfo(
              icone: Icons.calendar_today_rounded,
              texte: _majusculeInitiale(
                  DateFormat('EEE d MMM', 'fr_FR').format(date))),
        if (menu.agenceNom.isNotEmpty)
          _PastilleInfo(
              icone: Icons.location_on_outlined, texte: menu.agenceNom),
        if (menu.typeEquipeLibelle.isNotEmpty)
          _PastilleInfo(
              icone: Icons.groups_outlined, texte: menu.typeEquipeLibelle),
      ]),
      if (bandeau != null) bandeau,
      if (retiree != null)
        AvisCommandeBloc(commande: retiree, onSaved: _rechargerAvis),
      if (avis.isNotEmpty)
        Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          SizedBox(
            height: 30,
            child: Row(children: [
              const Expanded(
                child: LibelleSection('Avis des collègues',
                    padding: EdgeInsets.symmetric(horizontal: 2)),
              ),
              if (avis.length > 2)
                TextButton(
                  style: TextButton.styleFrom(
                    foregroundColor:
                        isDark ? AppColors.accent : AppColors.primaryLight,
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    minimumSize: const Size(48, 30),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    textStyle: const TextStyle(
                        fontSize: 12.5, fontWeight: FontWeight.w700),
                  ),
                  onPressed: () => _ListeAvisSheet.show(context,
                      plat: plat, resume: resume!),
                  child: Text('Voir les ${avis.length}'),
                ),
            ]),
          ),
          for (final a in avis.take(2)) _CarteAvis(avis: a),
        ]),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < blocs.length; i++) ...[
          // Note collée au nom, sections espacées
          if (i > 0) SizedBox(height: identical(blocs[i], note) ? 6 : 12),
          blocs[i],
        ],
      ],
    );
  }

  /// Barre d'action fixée en bas de la feuille : mêmes règles que l'ancien
  /// bouton « Commander » (retrait, annulation, autre plat, autre agence,
  /// délai dépassé, réservation).
  Widget _pied(BuildContext context, CommandeProvider cmdProv, _EtatFiche etat,
      Commande? ceMenu, Commande? ceJour) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final texte =
        isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final menu = widget.menu;
    final styleAide = TextStyle(fontSize: 11.5, height: 1.4, color: gris);

    Widget aide(String s) =>
        Text(s, textAlign: TextAlign.center, style: styleAide);

    /// « Votre repas ce jour : Attiéké poisson · en attente »
    Widget votreRepas(Commande c) {
      final statut = c.statut == StatutCommande.retiree
          ? 'retiré'
          : c.estNonRetiree()
              ? 'non retiré'
              : 'en attente';
      return Text.rich(
        TextSpan(style: styleAide, children: [
          const TextSpan(text: 'Votre repas ce jour : '),
          TextSpan(
              text: c.platDetail?.nom ?? 'repas commandé',
              style: TextStyle(fontWeight: FontWeight.w700, color: texte)),
          TextSpan(text: ' · $statut'),
        ]),
        textAlign: TextAlign.center,
      );
    }

    final List<Widget> contenu;
    switch (etat) {
      case _EtatFiche.platRetire:
        contenu = [
          const _PiedStatut(
              icone: Icons.check_circle_rounded,
              texte: 'Repas retiré',
              ton: TonPastille.vert),
        ];
      case _EtatFiche.autrePlatRetire:
        contenu = [
          const _PiedStatut(
              icone: Icons.check_circle_rounded,
              texte: 'Un autre plat a été retiré',
              ton: TonPastille.vert),
          votreRepas(ceMenu!),
        ];
      case _EtatFiche.platReserve:
        if (!menu.annulationFermee) {
          final (_, rouge) = couleursPastille(TonPastille.rouge, isDark);
          final restant = _tempsRestant(menu.dateLimiteAnnulation);
          final limite = menu.dateLimiteAnnulation;
          contenu = [
            SizedBox(
              width: double.infinity,
              height: 50,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.cancel_outlined, size: 18),
                label: const Text('Annuler ma réservation'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: rouge,
                  side: BorderSide(color: rouge.withOpacity(0.5), width: 1.5),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14)),
                  textStyle: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w700),
                ),
                // Pas de second envoi pendant une action en cours
                onPressed: cmdProv.isLoading
                    ? null
                    : () => _confirmerAnnulationCommande(
                        context, cmdProv, menu, ceMenu!.id),
              ),
            ),
            if (restant != null || limite != null)
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(Icons.schedule_rounded, size: 13, color: gris),
                const SizedBox(width: 4),
                Flexible(
                  child: aide([
                    'Annulation possible',
                    if (restant != null) 'encore $restant',
                    if (limite != null) '(${_dateLimiteCourte(limite)})',
                  ].join(' ')),
                ),
              ]),
          ];
        } else {
          contenu = [
            const _PiedStatut(
                icone: Icons.lock_outline_rounded,
                texte: 'Commande en attente',
                ton: TonPastille.or),
            aide('Annulation impossible — date limite dépassée'),
          ];
        }
      case _EtatFiche.autrePlatCeMenu:
        contenu = [
          _PiedStatut(
              icone: menu.commandeFermee
                  ? Icons.lock_outline_rounded
                  : Icons.block_rounded,
              texte: menu.commandeFermee
                  ? 'Commandes fermées pour ce jour'
                  : 'Autre plat déjà commandé',
              ton: TonPastille.gris),
          votreRepas(ceMenu!),
          // Conseil d'annulation seulement si elle est encore possible
          if (ceMenu.statut == StatutCommande.enAttente &&
              !menu.annulationFermee)
            aide('Annulez « ${ceMenu.platDetail?.nom ?? 'votre commande'} » '
                'pour choisir ce plat'),
        ];
      case _EtatFiche.autreAgence:
        final c = ceJour!;
        contenu = [
          const _PiedStatut(
              icone: Icons.location_off_rounded,
              texte: 'Déjà commandé ce jour',
              ton: TonPastille.rouge),
          aide('Vous avez déjà commandé « ${c.platDetail?.nom ?? 'un plat'} » '
              'chez ${c.menuDetail?.agenceNom ?? 'une autre agence'} ce jour.'
              // Conseil d'annulation seulement si elle est encore possible
              '${c.statut == StatutCommande.enAttente && !menu.annulationFermee ? '\nAnnulez cette commande pour en passer une autre.' : ''}'),
        ];
      case _EtatFiche.commandesFermees:
        contenu = [
          const _PiedStatut(
              icone: Icons.lock_outline_rounded,
              texte: 'Commandes fermées pour ce jour',
              ton: TonPastille.gris),
        ];
      case _EtatFiche.ouvert:
        contenu = [
          BoutonVert(
            label: 'Réserver ce plat',
            icone: Icons.shopping_basket_outlined,
            hauteur: 52,
            chargement: _envoi,
            onPressed:
                cmdProv.isLoading ? null : () => _reserver(context, cmdProv),
          ),
          if (menu.dateLimiteAnnulation != null)
            aide('Annulable jusqu\'au '
                '${libelleDateLimite(menu.dateLimiteAnnulation!)}'),
        ];
    }

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        border: Border(
            top: BorderSide(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder)),
      ),
      padding: EdgeInsets.fromLTRB(
          18, 12, 18, 14 + MediaQuery.paddingOf(context).bottom),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        for (var i = 0; i < contenu.length; i++) ...[
          if (i > 0) const SizedBox(height: 7),
          contenu[i],
        ],
      ]),
    );
  }
}

/// Pastille compacte « Lun. 26 oct. », « Siège », « Journée »
class _PastilleInfo extends StatelessWidget {
  final IconData icone;
  final String texte;
  const _PastilleInfo({required this.icone, required this.texte});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightBackground,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icone,
            size: 13,
            color: isDark ? AppColors.accent : AppColors.primaryLight),
        const SizedBox(width: 4),
        Flexible(
          child: Text(texte,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.lightTextSecondary)),
        ),
      ]),
    );
  }
}

/// Bandeau ambré « Commandes ouvertes · ferme dans … » (jour ouvert)
class _BandeauOuvert extends StatelessWidget {
  final Menu menu;
  const _BandeauOuvert({required this.menu});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final (_, couleur) = couleursPastille(TonPastille.or, isDark);
    final fond =
        isDark ? AppColors.warning.withOpacity(0.15) : AppColors.warningLight;
    final restant = fermeDans(menu.dateLimiteCommande, DateTime.now());
    final limite = menu.dateLimiteCommande;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration:
          BoxDecoration(color: fond, borderRadius: BorderRadius.circular(12)),
      child: Row(children: [
        Icon(Icons.alarm_rounded, size: 18, color: couleur),
        const SizedBox(width: 9),
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
                [
                  'Commandes ouvertes',
                  if (restant != null) _minuscule(restant),
                ].join(' · '),
                style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: couleur)),
            if (limite != null)
              Text('Jusqu\'au ${libelleDateLimite(limite)}',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: couleur.withOpacity(0.85))),
          ]),
        ),
      ]),
    );
  }
}

/// Carte verte « Plat réservé » (ce plat est la commande du jour)
class _CarteReserve extends StatelessWidget {
  final Commande commande;
  final Menu menu;
  const _CarteReserve({required this.commande, required this.menu});

  @override
  Widget build(BuildContext context) {
    final nonRetiree = commande.estNonRetiree();
    final date = DateTime.tryParse(menu.dateMenu);
    final detail = nonRetiree
        ? 'Repas non retiré au comptoir'
        : [
            'À retirer au comptoir'
                '${date != null ? ' ${DateFormat('EEEE d MMMM', 'fr_FR').format(date)}' : ''}',
            if (menu.agenceNom.isNotEmpty) menu.agenceNom,
          ].join(' · ');
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
            colors: [Color(0xFF1F9D55), Color(0xFF3EC970)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.22),
              borderRadius: BorderRadius.circular(11)),
          child: const Icon(Icons.check_rounded, color: Colors.white, size: 21),
        ),
        const SizedBox(width: 10),
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Plat réservé',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700)),
            Text(detail,
                style: TextStyle(
                    color: Colors.white.withOpacity(0.88), fontSize: 11)),
          ]),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
              color: Colors.white, borderRadius: BorderRadius.circular(20)),
          child: Text(nonRetiree ? 'Non retirée' : 'En attente',
              style: const TextStyle(
                  color: Color(0xFF1F9D55),
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700)),
        ),
      ]),
    );
  }
}

/// État verrouillé de la barre d'action (« Commandes fermées pour ce jour »)
class _PiedStatut extends StatelessWidget {
  final IconData icone;
  final String texte;
  final TonPastille ton;
  const _PiedStatut(
      {required this.icone, required this.texte, required this.ton});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    var (fond, couleur) = couleursPastille(ton, isDark);
    if (ton == TonPastille.gris && isDark) fond = AppColors.darkCard;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration:
          BoxDecoration(color: fond, borderRadius: BorderRadius.circular(14)),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(icone, size: 17, color: couleur),
        const SizedBox(width: 8),
        Flexible(
          child: Text(texte,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 13.5, fontWeight: FontWeight.w600, color: couleur)),
        ),
      ]),
    );
  }
}

// ── Avis des collègues ─────────────────────────────────────────

class _CarteAvis extends StatelessWidget {
  final AvisRecent avis;
  const _CarteAvis({required this.avis});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final texte =
        isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final date = DateTime.tryParse(avis.date);
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightBackground,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Flexible(
            child: Text(avis.auteur.isEmpty ? 'Un collègue' : avis.auteur,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w700, color: texte)),
          ),
          const SizedBox(width: 6),
          EtoilesNote(note: avis.note, size: 12),
          const Spacer(),
          if (date != null)
            Text(DateFormat('d MMM', 'fr_FR').format(date),
                style: TextStyle(fontSize: 11, color: gris)),
        ]),
        const SizedBox(height: 3),
        Text(avis.commentaire,
            style: TextStyle(fontSize: 12.5, height: 1.45, color: texte)),
      ]),
    );
  }
}

/// Tous les commentaires renvoyés par le serveur (les plus récents)
class _ListeAvisSheet extends StatelessWidget {
  final Plat plat;
  final ResumeAvisPlat resume;
  const _ListeAvisSheet({required this.plat, required this.resume});

  static Future<void> show(BuildContext context,
          {required Plat plat, required ResumeAvisPlat resume}) =>
      showModalBottomSheet<void>(
        context: context,
        useRootNavigator: true,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (_) => _ListeAvisSheet(plat: plat, resume: resume),
      );

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final n = resume.derniers.length;
    final moyenne = resume.noteMoyenne;
    return ConstrainedBox(
      constraints:
          BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
            child: Text('Avis des collègues',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 6),
            child: Text(
                [
                  plat.nom,
                  if (moyenne != null)
                    '★ ${formatNoteMoyenne(moyenne)} · ${resume.nbAvis} avis',
                  if (resume.nbAvis > n)
                    '$n dernier${n > 1 ? 's' : ''} commentaire${n > 1 ? 's' : ''}',
                ].join(' · '),
                style: TextStyle(fontSize: 12.5, color: gris)),
          ),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              padding: EdgeInsets.fromLTRB(
                  16, 0, 16, 16 + MediaQuery.paddingOf(context).bottom),
              children: [
                for (final a in resume.derniers) _CarteAvis(avis: a),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Carrousel des photos ───────────────────────────────────────

class _PhotosCarousel extends StatefulWidget {
  final Plat plat;
  final VoidCallback onFermer;
  const _PhotosCarousel({required this.plat, required this.onFermer});

  @override
  State<_PhotosCarousel> createState() => _PhotosCarouselState();
}

class _PhotosCarouselState extends State<_PhotosCarousel> {
  static const _hauteur = 222.0;
  final _controller = PageController();
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Photo principale en premier
    final urls = [
      ...widget.plat.images.where((i) => i.isPrincipale),
      ...widget.plat.images.where((i) => !i.isPrincipale),
    ].map((i) => i.url).whereType<String>().toList();
    const voile = Color(0x73061220);

    return SizedBox(
      height: _hauteur,
      child: Stack(children: [
        if (urls.isEmpty)
          const _SansPhoto()
        else
          PageView.builder(
            controller: _controller,
            itemCount: urls.length,
            onPageChanged: (i) => setState(() => _page = i),
            itemBuilder: (_, i) => Image.network(
              urls[i],
              width: double.infinity,
              height: _hauteur,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const _SansPhoto(),
            ),
          ),
        // Poignée de la feuille, au-dessus de la photo
        Positioned(
          top: 8,
          left: 0,
          right: 0,
          child: Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.9),
                borderRadius: BorderRadius.circular(2),
                boxShadow: [
                  BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 4)
                ],
              ),
            ),
          ),
        ),
        if (urls.length > 1)
          Positioned(
            top: 14,
            left: 12,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(
                  color: voile, borderRadius: BorderRadius.circular(20)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.photo_outlined, size: 13, color: Colors.white),
                const SizedBox(width: 4),
                Text('${_page + 1} / ${urls.length}',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w600)),
              ]),
            ),
          ),
        Positioned(
          top: 10,
          right: 10,
          child: IconButton.filled(
            tooltip: 'Fermer',
            style: IconButton.styleFrom(
                backgroundColor: voile,
                foregroundColor: Colors.white,
                minimumSize: const Size(36, 36),
                fixedSize: const Size(36, 36),
                padding: EdgeInsets.zero),
            icon: const Icon(Icons.close_rounded, size: 20),
            onPressed: widget.onFermer,
          ),
        ),
        if (urls.length > 1)
          Positioned(
            bottom: 12,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(urls.length, (i) {
                final actif = i == _page;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 2.5),
                  width: actif ? 18 : 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: actif
                        ? AppColors.accent
                        : Colors.white.withOpacity(0.75),
                    borderRadius: BorderRadius.circular(4),
                    boxShadow: [
                      BoxShadow(
                          color: Colors.black.withOpacity(0.25), blurRadius: 3)
                    ],
                  ),
                );
              }),
            ),
          ),
      ]),
    );
  }
}

/// Pas de photo : couverts sur dégradé marine (lisible dans les deux thèmes)
class _SansPhoto extends StatelessWidget {
  const _SansPhoto();

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        decoration: const BoxDecoration(gradient: AppColors.heroGradient),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: AppColors.accent.withOpacity(0.14),
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.restaurant_rounded,
                size: 30, color: AppColors.accent.withOpacity(0.9)),
          ),
          const SizedBox(height: 10),
          Text('Pas encore de photo',
              style: TextStyle(
                  color: Colors.white.withOpacity(0.7),
                  fontSize: 12,
                  fontWeight: FontWeight.w500)),
        ]),
      );
}
