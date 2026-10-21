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

// Date limite de commande calculée par le serveur (délai paramétré)
DateTime? _deadline(Menu menu) => menu.dateLimiteCommande;

bool _depasseDelai(Menu menu) => menu.commandeFermee;

String _delaiMessage(Menu menu) {
  final deadline = _deadline(menu);
  if (deadline == null) return '';
  final now = DateTime.now().toUtc();
  if (now.isAfter(deadline)) return 'Délai de commande dépassé';
  final diff = deadline.difference(now);
  if (diff.inHours < 1) return 'Ferme dans ${diff.inMinutes} min';
  if (diff.inHours < 24) {
    return 'Ferme dans ${diff.inHours}h${diff.inMinutes.remainder(60).toString().padLeft(2, '0')}';
  }
  return 'Commande ouverte encore ${diff.inDays}j ${diff.inHours.remainder(24)}h';
}

String _dateMenuLongue(Menu menu) {
  final date = DateTime.tryParse(menu.dateMenu);
  if (date == null) return menu.dateMenu;
  final s = DateFormat('EEEE d MMMM yyyy', 'fr_FR').format(date);
  return s[0].toUpperCase() + s.substring(1);
}

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

class _ImagePlaceholder extends StatelessWidget {
  final double height;
  const _ImagePlaceholder({required this.height});

  @override
  Widget build(BuildContext context) => Container(
        height: height,
        width: double.infinity,
        color: AppColors.primary.withOpacity(0.06),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(Icons.restaurant_menu_rounded,
              size: 48, color: AppColors.primary.withOpacity(0.3)),
          const SizedBox(height: 8),
          Text('Aucune photo disponible',
              style: TextStyle(
                  color: AppColors.primary.withOpacity(0.4), fontSize: 12)),
        ]),
      );
}

/// Badge « Ferme dans … » : mis à jour en direct (minuteur léger) et
/// basculé sur « Délai de commande dépassé » à l'heure limite.
class _DelaiBadge extends StatelessWidget {
  final Menu menu;
  const _DelaiBadge({required this.menu});

  @override
  Widget build(BuildContext context) => TicEcheance(
        echeances: [menu.dateLimiteCommande],
        builder: _contenu,
      );

  Widget _contenu(BuildContext context) {
    final depasseDelai = _depasseDelai(menu);
    final message = _delaiMessage(menu);
    final color = depasseDelai ? AppColors.error : AppColors.accent;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: depasseDelai ? AppColors.errorLight : AppColors.accentLight,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            depasseDelai ? Icons.lock_clock_rounded : Icons.timer_outlined,
            size: 13,
            color: color,
          ),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              message,
              style: TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w600, color: color),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  const _Tag({required this.icon, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 13, color: color),
        const SizedBox(width: 4),
        Flexible(
          child: Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 12, color: color, fontWeight: FontWeight.w500)),
        ),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// BOUTON COMMANDER
// ══════════════════════════════════════════════════════════════

class _BoutonCommander extends StatelessWidget {
  final Plat plat;
  final Menu menu;

  const _BoutonCommander({required this.plat, required this.menu});

  /// Reconstruit à l'heure limite de commande / d'annulation : « Réserver »
  /// et « Annuler » se ferment sans action de l'utilisateur.
  @override
  Widget build(BuildContext context) => TicEcheance(
        echeances: [menu.dateLimiteCommande, menu.dateLimiteAnnulation],
        builder: _contenu,
      );

  Widget _contenu(BuildContext context) {
    final depasseDelai = _depasseDelai(menu);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cmdProv = context.watch<CommandeProvider>();
    final secColor =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final secBg = isDark ? AppColors.darkCard : const Color(0xFFF1F5F9);

    final commandeCeMenu = cmdProv.mesCommandes
        .where((c) =>
            c.menuDetail?.id == menu.id &&
            (c.statut == StatutCommande.enAttente ||
                c.statut == StatutCommande.retiree))
        .firstOrNull;

    final commandeCeJour = commandeCeMenu ??
        cmdProv.mesCommandes.where((c) {
          final dm = c.menuDetail?.dateMenu;
          if (dm == null) return false;
          return dm == menu.dateMenu &&
              (c.statut == StatutCommande.enAttente ||
                  c.statut == StatutCommande.retiree);
        }).firstOrNull;

    // Délai d'annulation : distinct du délai de commande
    final annulationFermee = menu.annulationFermee;

    final estCePlatCeMenu =
        commandeCeMenu != null && commandeCeMenu.platDetail?.id == plat.id;
    final autrePlatCeMenu = commandeCeMenu != null && !estCePlatCeMenu;
    final autreAgenceCeJour = commandeCeMenu == null && commandeCeJour != null;

    if (commandeCeMenu?.statut == StatutCommande.retiree) {
      return _StatutBouton(
        icon: Icons.check_circle_rounded,
        label: estCePlatCeMenu ? 'Repas retiré' : 'Un autre plat a été retiré',
        color: AppColors.success,
        bg: AppColors.successLight,
      );
    }

    if (estCePlatCeMenu) {
      return Column(children: [
        _StatutBouton(
          icon: Icons.check_circle_outline_rounded,
          label: 'Commande en attente',
          color: AppColors.warning,
          bg: AppColors.warningLight,
        ),
        if (!annulationFermee) ...[
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              icon: const Icon(Icons.cancel_outlined, size: 16),
              label: const Text('Annuler ma commande'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.error,
                side: const BorderSide(color: AppColors.error),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
              ),
              // Pas de second envoi pendant une action en cours
              onPressed: cmdProv.isLoading
                  ? null
                  : () => _confirmerAnnulationCommande(
                      context, cmdProv, menu, commandeCeMenu.id),
            ),
          ),
        ],
        if (annulationFermee)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('Annulation impossible — date limite dépassée',
                style: const TextStyle(fontSize: 11, color: AppColors.error),
                textAlign: TextAlign.center),
          ),
      ]);
    }

    if (autrePlatCeMenu) {
      return Column(children: [
        _StatutBouton(
          icon: Icons.block_rounded,
          label: 'Autre plat déjà commandé',
          color: secColor,
          bg: secBg,
        ),
        // Conseil d'annulation seulement si elle est encore possible
        if (commandeCeMenu.statut == StatutCommande.enAttente &&
            !annulationFermee) ...[
          const SizedBox(height: 6),
          Text(
            'Annulez "${commandeCeMenu.platDetail?.nom ?? 'votre commande'}" '
            'pour choisir ce plat',
            style: TextStyle(fontSize: 11, color: secColor),
            textAlign: TextAlign.center,
          ),
        ],
      ]);
    }

    if (autreAgenceCeJour) {
      final agenceCmde =
          commandeCeJour.menuDetail?.agenceNom ?? 'une autre agence';
      final platCmde = commandeCeJour.platDetail?.nom ?? 'un plat';
      return Column(children: [
        _StatutBouton(
          icon: Icons.location_off_rounded,
          label: 'Déjà commandé ce jour',
          color: AppColors.error,
          bg: AppColors.errorLight,
        ),
        const SizedBox(height: 6),
        Text(
          'Vous avez déjà commandé "$platCmde" '
          'chez $agenceCmde ce jour.'
          // Conseil d'annulation seulement si elle est encore possible
          '${commandeCeJour.statut == StatutCommande.enAttente && !annulationFermee ? '\nAnnulez cette commande pour en passer une autre.' : ''}',
          style: TextStyle(fontSize: 11, color: secColor),
          textAlign: TextAlign.center,
        ),
      ]);
    }

    if (depasseDelai) {
      return _StatutBouton(
        icon: Icons.lock_clock_rounded,
        label: 'Commandes fermées',
        color: secColor,
        bg: secBg,
      );
    }

    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        icon: const Icon(Icons.add_shopping_cart_rounded, size: 18),
        label: const Text('Réserver ce repas'),
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.accent,
          foregroundColor: AppColors.primary,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
          elevation: 0,
        ),
        onPressed: cmdProv.isLoading
            ? null
            : () => _reserverPlat(context, cmdProv, menu, plat),
      ),
    );
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

class _StatutBouton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final Color bg;

  const _StatutBouton({
    required this.icon,
    required this.label,
    required this.color,
    required this.bg,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(icon, color: color, size: 18),
        const SizedBox(width: 8),
        Flexible(
          child: Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  color: color, fontWeight: FontWeight.w600, fontSize: 14)),
        ),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// FICHE DÉTAILLÉE D'UN PLAT (feuille modale)
// ══════════════════════════════════════════════════════════════

class _PlatDetailSheet extends StatefulWidget {
  final Menu menu;
  final Plat plat;
  const _PlatDetailSheet({required this.menu, required this.plat});

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

  @override
  void initState() {
    super.initState();
    _resume = avisService.resumePlat(widget.plat.id);
  }

  void _rechargerAvis() =>
      setState(() => _resume = avisService.resumePlat(widget.plat.id));

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final menu = widget.menu;
    final plat = widget.plat;
    final iconColor =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final bg = isDark ? AppColors.darkSurface : AppColors.lightSurface;

    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scroll) => ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        // Messager propre à la feuille : les SnackBars (commande, annulation,
        // avis) s'affichent au-dessus d'elle et non derrière.
        child: ScaffoldMessenger(
          child: Scaffold(
            backgroundColor: bg,
            body: ListView(
              controller: scroll,
              padding: EdgeInsets.zero,
              children: [
                Stack(children: [
                  _PhotosCarousel(plat: plat),
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
                          color: Colors.white.withOpacity(0.85),
                          borderRadius: BorderRadius.circular(2),
                          boxShadow: [
                            BoxShadow(
                                color: Colors.black.withOpacity(0.25),
                                blurRadius: 4)
                          ],
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    top: 8,
                    right: 8,
                    child: IconButton.filled(
                      tooltip: 'Fermer',
                      style: IconButton.styleFrom(
                          backgroundColor: Colors.black.withOpacity(0.35),
                          foregroundColor: Colors.white),
                      icon: const Icon(Icons.close_rounded, size: 20),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ),
                ]),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 18, 20, 32),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(plat.nom,
                          style: Theme.of(context)
                              .textTheme
                              .headlineSmall
                              ?.copyWith(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 8),
                      _NoteMoyenne(resume: _resume),
                      if (plat.typePlatLibelle != null) ...[
                        const SizedBox(height: 10),
                        _Tag(
                            icon: Icons.eco_outlined,
                            label: plat.typePlatLibelle!,
                            color: AppColors.accent),
                      ],
                      if (plat.description.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        Text(plat.description,
                            style: Theme.of(context).textTheme.bodyMedium),
                      ],
                      const SizedBox(height: 18),

                      // ── Menu : date, agence, équipe, délai ─────
                      _InfoLigne(
                          icon: Icons.calendar_today_rounded,
                          color: iconColor,
                          text: _dateMenuLongue(menu)),
                      _InfoLigne(
                          icon: Icons.location_on_rounded,
                          color: iconColor,
                          text: menu.agenceNom),
                      _InfoLigne(
                          icon: Icons.groups_rounded,
                          color: iconColor,
                          text: menu.typeEquipeLibelle),
                      const SizedBox(height: 4),
                      _DelaiBadge(menu: menu),
                      const SizedBox(height: 20),

                      // ── Actions : mêmes règles que la carte ─────
                      Consumer<CommandeProvider>(
                        builder: (_, cmdProv, __) {
                          final retiree = cmdProv.mesCommandes
                              .where((c) =>
                                  c.menuDetail?.id == menu.id &&
                                  c.platDetail?.id == plat.id &&
                                  c.statut == StatutCommande.retiree)
                              .firstOrNull;
                          return Column(children: [
                            _BoutonCommander(plat: plat, menu: menu),
                            if (retiree != null) ...[
                              const SizedBox(height: 10),
                              // Le résumé des avis est rechargé après notation
                              AvisCommandeBloc(
                                  commande: retiree, onSaved: _rechargerAvis),
                            ],
                          ]);
                        },
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _InfoLigne extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String text;
  const _InfoLigne(
      {required this.icon, required this.color, required this.text});

  @override
  Widget build(BuildContext context) {
    if (text.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(children: [
        Icon(icon, size: 15, color: color),
        const SizedBox(width: 8),
        Expanded(
            child: Text(text, style: Theme.of(context).textTheme.bodyMedium)),
      ]),
    );
  }
}

// ── Carrousel des photos ───────────────────────────────────────

class _PhotosCarousel extends StatefulWidget {
  final Plat plat;
  const _PhotosCarousel({required this.plat});

  @override
  State<_PhotosCarousel> createState() => _PhotosCarouselState();
}

class _PhotosCarouselState extends State<_PhotosCarousel> {
  static const _hauteur = 280.0;
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

    if (urls.isEmpty) return const _ImagePlaceholder(height: _hauteur);

    return SizedBox(
      height: _hauteur,
      child: Stack(children: [
        PageView.builder(
          controller: _controller,
          itemCount: urls.length,
          onPageChanged: (i) => setState(() => _page = i),
          itemBuilder: (_, i) => Image.network(
            urls[i],
            width: double.infinity,
            height: _hauteur,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) =>
                const _ImagePlaceholder(height: _hauteur),
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
                  margin: const EdgeInsets.symmetric(horizontal: 3),
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

// ── Note moyenne ──────────────────────────────

class _NoteMoyenne extends StatelessWidget {
  final Future<ResumeAvisPlat> resume;
  const _NoteMoyenne({required this.resume});

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<ResumeAvisPlat>(
      future: resume,
      builder: (_, snap) {
        final r = snap.data;
        // Aucun avis (ou erreur de chargement) : rien à afficher
        if (r == null || r.noteMoyenne == null || r.nbAvis == 0) {
          return const SizedBox.shrink();
        }
        return Row(children: [
          const Icon(Icons.star_rounded, color: kCouleurEtoile, size: 20),
          const SizedBox(width: 4),
          Text('${formatNoteMoyenne(r.noteMoyenne!)} · ${r.nbAvis} avis',
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w600)),
        ]);
      },
    );
  }
}
