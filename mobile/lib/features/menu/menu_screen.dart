// lib/features/menu/menu_screen.dart

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../shared/models/models.dart';
import '../../core/widgets/common_widgets.dart';

class MenuScreen extends StatefulWidget {
  const MenuScreen({super.key});
  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  Menu? _menuSelectionne;
  _AgenceLocal? _agenceSelectionnee;
  _EquipeLocal? _equipeSelectionnee;

  bool _depasseDelai(Menu menu) {
    final dateMenu = DateTime.tryParse(menu.dateMenu);
    if (dateMenu == null) return true;
    final deadline = DateTime(dateMenu.year, dateMenu.month, dateMenu.day)
        .subtract(const Duration(hours: 48));
    return DateTime.now().isAfter(deadline);
  }

  String _delaiMessage(Menu menu) {
    final dateMenu = DateTime.tryParse(menu.dateMenu);
    if (dateMenu == null) return '';
    final deadline = DateTime(dateMenu.year, dateMenu.month, dateMenu.day)
        .subtract(const Duration(hours: 48));
    final now = DateTime.now();
    if (now.isAfter(deadline)) return 'Délai de commande dépassé';
    final diff = deadline.difference(now);
    if (diff.inHours < 1) return 'Ferme dans ${diff.inMinutes} min';
    if (diff.inHours < 24)
      return 'Ferme dans ${diff.inHours}h${diff.inMinutes.remainder(60).toString().padLeft(2, '0')}';
    return 'Commande ouverte encore ${diff.inDays}j ${diff.inHours.remainder(24)}h';
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final auth = context.read<AuthProvider>();
      final agenceId = auth.user?.derniereAgenceId;
      final agenceNom = auth.user?.derniereAgence;

      // Charger les menus d'abord
      await context.read<MenuProvider>().loadMenus();
      context.read<CommandeProvider>().loadMesCommandes();

      // ✅ Pré-sélectionner l'agence du user APRÈS le chargement
      // → les items du dropdown existent déjà → pas d'assertion error
      if (mounted && agenceId != null && agenceNom != null) {
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Consumer<MenuProvider>(builder: (_, menuProv, __) {
        if (menuProv.loading) {
          return ListView(
              padding: const EdgeInsets.all(16),
              children: List.generate(3, (_) => const ShimmerCard(height: 60)));
        }

        final agences = <String, String>{};
        final equipes = <String, String>{};
        for (final m in menuProv.menus) {
          agences[m.agenceId.toString()] = m.agenceNom;
          equipes[m.typeEquipeId.toString()] = m.typeEquipeLibelle;
        }

        final menusFiltres = menuProv.menus.where((m) {
          final okAgence = _agenceSelectionnee == null ||
              m.agenceId.toString() == _agenceSelectionnee!.id;
          final okEquipe = _equipeSelectionnee == null ||
              m.typeEquipeId.toString() == _equipeSelectionnee!.id;
          return okAgence && okEquipe;
        }).toList();

        if (_menuSelectionne == null && menusFiltres.isNotEmpty) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted)
              setState(() {
                _menuSelectionne = menusFiltres.firstWhere((m) => m.isToday,
                    orElse: () => menusFiltres.first);
              });
          });
        }
        if (_menuSelectionne != null &&
            !menusFiltres.any((m) => m.id == _menuSelectionne!.id)) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted)
              setState(() {
                _menuSelectionne =
                    menusFiltres.isNotEmpty ? menusFiltres.first : null;
              });
          });
        }

        return Column(children: [
          _FiltresBar(
            agences: agences,
            equipes: equipes,
            agenceSelectionnee: _agenceSelectionnee,
            equipeSelectionnee: _equipeSelectionnee,
            onAgenceChanged: (a) => setState(() {
              _agenceSelectionnee = a;
              _menuSelectionne = null;
            }),
            onEquipeChanged: (e) => setState(() {
              _equipeSelectionnee = e;
              _menuSelectionne = null;
            }),
          ),
          if (menusFiltres.isNotEmpty)
            _JoursSelector(
              menus: menusFiltres,
              selected: _menuSelectionne,
              onSelected: (m) => setState(() => _menuSelectionne = m),
            ),
          Expanded(
            child: menusFiltres.isEmpty
                ? EmptyState(
                    icon: Icons.calendar_today_outlined,
                    title: 'Aucun menu disponible',
                    subtitle: 'Aucun menu pour ces filtres',
                  )
                : _menuSelectionne == null
                    ? const Center(child: CircularProgressIndicator())
                    : _MenuDetail(
                        menu: _menuSelectionne!,
                        depasseDelai: _depasseDelai(_menuSelectionne!),
                        delaiMessage: _delaiMessage(_menuSelectionne!),
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

// ══════════════════════════════════════════════════════════════
// BARRE DE FILTRES
// ══════════════════════════════════════════════════════════════

class _FiltresBar extends StatelessWidget {
  final Map<String, String> agences;
  final Map<String, String> equipes;
  final _AgenceLocal? agenceSelectionnee;
  final _EquipeLocal? equipeSelectionnee;
  final ValueChanged<_AgenceLocal?> onAgenceChanged;
  final ValueChanged<_EquipeLocal?> onEquipeChanged;

  const _FiltresBar({
    required this.agences,
    required this.equipes,
    required this.agenceSelectionnee,
    required this.equipeSelectionnee,
    required this.onAgenceChanged,
    required this.onEquipeChanged,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          )
        ],
      ),
      child: Column(children: [
        Row(children: [
          Icon(Icons.location_on_rounded, color: AppColors.accent, size: 18),
          const SizedBox(width: 8),
          Expanded(
              child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: agenceSelectionnee?.id,
              hint: const Text('Toutes les agences',
                  style: TextStyle(fontSize: 13)),
              isExpanded: true,
              isDense: true,
              icon: const Icon(Icons.keyboard_arrow_down_rounded, size: 18),
              items: [
                const DropdownMenuItem(
                    value: null,
                    child: Text('Toutes les agences',
                        style: TextStyle(fontSize: 13))),
                ...agences.entries.map((e) => DropdownMenuItem(
                      value: e.key,
                      child: Text(e.value,
                          style: const TextStyle(fontSize: 13),
                          overflow: TextOverflow.ellipsis),
                    )),
              ],
              onChanged: (id) => onAgenceChanged(
                  id == null ? null : _AgenceLocal(id: id, nom: agences[id]!)),
            ),
          )),
        ]),
        if (equipes.isNotEmpty) ...[
          Divider(
              height: 8,
              color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
          Row(children: [
            Icon(Icons.groups_rounded,
                color: isDark ? AppColors.accent : AppColors.primary, size: 18),
            const SizedBox(width: 8),
            Expanded(
                child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: equipeSelectionnee?.id,
                hint: const Text('Toutes les équipes',
                    style: TextStyle(fontSize: 13)),
                isExpanded: true,
                isDense: true,
                icon: const Icon(Icons.keyboard_arrow_down_rounded, size: 18),
                items: [
                  const DropdownMenuItem(
                      value: null,
                      child: Text('Toutes les équipes',
                          style: TextStyle(fontSize: 13))),
                  ...equipes.entries.map((e) => DropdownMenuItem(
                        value: e.key,
                        child: Text(e.value,
                            style: const TextStyle(fontSize: 13),
                            overflow: TextOverflow.ellipsis),
                      )),
                ],
                onChanged: (id) => onEquipeChanged(id == null
                    ? null
                    : _EquipeLocal(id: id, nom: equipes[id]!)),
              ),
            )),
          ]),
        ],
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// SÉLECTEUR JOURS
// ══════════════════════════════════════════════════════════════

class _JoursSelector extends StatelessWidget {
  final List<Menu> menus;
  final Menu? selected;
  final ValueChanged<Menu> onSelected;

  const _JoursSelector({
    required this.menus,
    required this.selected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return SizedBox(
      height: 68,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        itemCount: menus.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final menu = menus[i];
          final date = DateTime.tryParse(menu.dateMenu);
          final isSelected = selected?.id == menu.id;
          final isToday = menu.isToday;

          final jourStr = date != null
              ? DateFormat('EEE', 'fr_FR').format(date).toUpperCase()
              : '—';
          final numStr =
              date != null ? DateFormat('d', 'fr_FR').format(date) : '—';

          final borderColor = isSelected
              ? AppColors.primary
              : isToday
                  ? AppColors.accent
                  : (isDark ? AppColors.darkBorder : AppColors.lightBorder);

          final bgColor = isSelected
              ? AppColors.primary
              : isToday
                  ? AppColors.accent.withOpacity(0.15)
                  : Colors.transparent;

          final jourColor = isSelected
              ? Colors.white
              : isToday
                  ? AppColors.accent
                  : (isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.lightTextSecondary);

          final numColor = isSelected
              ? Colors.white
              : isToday
                  ? (isDark ? AppColors.accent : AppColors.primary)
                  : (isDark
                      ? AppColors.darkTextPrimary
                      : AppColors.lightTextPrimary);

          return GestureDetector(
            onTap: () => onSelected(menu),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 56,
              decoration: BoxDecoration(
                color: bgColor,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: borderColor,
                  width: isSelected || isToday ? 2 : 1,
                ),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(jourStr,
                      style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: jourColor)),
                  const SizedBox(height: 2),
                  Text(numStr,
                      style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: numColor)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// DÉTAIL DU MENU — ✅ CORRIGÉ : chaque info sur sa propre ligne
// ══════════════════════════════════════════════════════════════

class _MenuDetail extends StatelessWidget {
  final Menu menu;
  final bool depasseDelai;
  final String delaiMessage;

  const _MenuDetail({
    required this.menu,
    required this.depasseDelai,
    required this.delaiMessage,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final date = DateTime.tryParse(menu.dateMenu);
    final dateStr = date != null
        ? DateFormat('EEEE d MMMM yyyy', 'fr_FR').format(date)
        : menu.dateMenu;
    final iconColor =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;

    if (menu.menuPlats.isEmpty) {
      return EmptyState(
        icon: Icons.no_meals_rounded,
        title: 'Aucun plat',
        subtitle: 'Aucun plat ajouté pour ce menu',
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 12, top: 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Ligne 1 : Label ────────────────────────────
              Text(
                'Menu du Jour',
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: AppColors.accent, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 2),

              // ── Ligne 2 : Date complète ────────────────────
              // maxLines: 2 + ellipsis → plus jamais de overflow
              Text(
                dateStr[0].toUpperCase() + dateStr.substring(1),
                style: Theme.of(context).textTheme.titleLarge,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 6),

              // ── Ligne 3 : Statut commande ──────────────────
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: depasseDelai
                      ? AppColors.errorLight
                      : AppColors.accentLight,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      depasseDelai
                          ? Icons.lock_clock_rounded
                          : Icons.timer_outlined,
                      size: 13,
                      color: depasseDelai ? AppColors.error : AppColors.accent,
                    ),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        delaiMessage,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color:
                              depasseDelai ? AppColors.error : AppColors.accent,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 6),

              // ── Ligne 4 : Agence + Équipe ──────────────────
              Row(
                children: [
                  Icon(Icons.location_on_rounded, size: 12, color: iconColor),
                  const SizedBox(width: 3),
                  Flexible(
                    child: Text(
                      menu.agenceNom,
                      style: Theme.of(context).textTheme.bodySmall,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Icon(Icons.groups_rounded, size: 12, color: iconColor),
                  const SizedBox(width: 3),
                  Flexible(
                    child: Text(
                      menu.typeEquipeLibelle,
                      style: Theme.of(context).textTheme.bodySmall,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        // ── Plats ──────────────────────────────────────────
        ...menu.menuPlats.map((mp) => _PlatCommandeCard(
              plat: mp.plat,
              menu: menu,
              depasseDelai: depasseDelai,
            )),
      ],
    );
  }
}

// ══════════════════════════════════════════════════════════════
// CARTE PLAT
// ══════════════════════════════════════════════════════════════

class _PlatCommandeCard extends StatelessWidget {
  final Plat plat;
  final Menu menu;
  final bool depasseDelai;

  const _PlatCommandeCard({
    required this.plat,
    required this.menu,
    required this.depasseDelai,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(isDark ? 0.2 : 0.06),
            blurRadius: 12,
            offset: const Offset(0, 4),
          )
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        ClipRRect(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          child: plat.imageUrl != null
              ? Image.network(plat.imageUrl!,
                  height: 200,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => _imagePlaceholder())
              : _imagePlaceholder(),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (plat.typePlatLibelle != null)
              Text(plat.typePlatLibelle!,
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: isDark
                          ? AppColors.darkTextSecondary
                          : AppColors.lightTextSecondary)),
            const SizedBox(height: 4),
            Text(plat.nom,
                style: Theme.of(context)
                    .textTheme
                    .headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w800)),
            if (plat.description.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(plat.description,
                  style: Theme.of(context).textTheme.bodyMedium,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis),
            ],
            if (plat.typePlatLibelle != null) ...[
              const SizedBox(height: 10),
              _Tag(
                  icon: Icons.eco_outlined,
                  label: plat.typePlatLibelle!,
                  color: AppColors.accent),
            ],
            const SizedBox(height: 16),
            _BoutonCommander(
                plat: plat, menu: menu, depasseDelai: depasseDelai),
          ]),
        ),
      ]),
    );
  }

  Widget _imagePlaceholder() => Container(
        height: 200,
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
        Text(label,
            style: TextStyle(
                fontSize: 12, color: color, fontWeight: FontWeight.w500)),
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
  final bool depasseDelai;

  const _BoutonCommander({
    required this.plat,
    required this.menu,
    required this.depasseDelai,
  });

  @override
  Widget build(BuildContext context) {
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
        if (!depasseDelai) ...[
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
              onPressed: () =>
                  _confirmerAnnulation(context, cmdProv, commandeCeMenu!.id),
            ),
          ),
        ],
        if (depasseDelai)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('Annulation impossible — délai de 48h dépassé',
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
        const SizedBox(height: 6),
        Text(
          'Annulez "${commandeCeMenu!.platDetail?.nom ?? 'votre commande'}" '
          'pour choisir ce plat',
          style: TextStyle(fontSize: 11, color: secColor),
          textAlign: TextAlign.center,
        ),
      ]);
    }

    if (autreAgenceCeJour) {
      final agenceCmde =
          commandeCeJour!.menuDetail?.agenceNom ?? 'une autre agence';
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
          'chez $agenceCmde ce jour.\n'
          'Annulez cette commande pour en passer une autre.',
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
        onPressed:
            cmdProv.isLoading ? null : () => _commander(context, cmdProv),
      ),
    );
  }

  void _commander(BuildContext context, CommandeProvider cmdProv) async {
    final ok = await cmdProv.commander(menuId: menu.id, platId: plat.id);
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
  }

  void _confirmerAnnulation(
      BuildContext context, CommandeProvider cmdProv, int commandeId) {
    showDialog(
        context: context,
        builder: (_) => AlertDialog(
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20)),
              title: const Row(children: [
                Icon(Icons.warning_amber_rounded, color: AppColors.warning),
                SizedBox(width: 8),
                Text('Annuler ?'),
              ]),
              content: const Text(
                'Voulez-vous annuler cette commande ?\n\n'
                '⚠️ Toute annulation après 48h avant le menu est définitive.',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Non, garder'),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.error,
                    foregroundColor: Colors.white,
                  ),
                  onPressed: () async {
                    Navigator.pop(context);
                    final ok = await cmdProv.annuler(commandeId);
                    if (ok && context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                        content: const Text('Commande annulée'),
                        backgroundColor: AppColors.warning,
                        behavior: SnackBarBehavior.floating,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                        margin: const EdgeInsets.all(12),
                      ));
                    }
                  },
                  child: const Text('Oui, annuler'),
                ),
              ],
            ));
  }
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
        Text(label,
            style: TextStyle(
                color: color, fontWeight: FontWeight.w600, fontSize: 14)),
      ]),
    );
  }
}
