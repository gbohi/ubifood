// lib/features/menu/menu_screen.dart

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/providers/app_provider.dart';
import '../../shared/models/models.dart';
import '../../core/widgets/common_widgets.dart';
import '../../core/services/cantine_service.dart';
import '../avis/avis_widgets.dart';

// Même règle que le serveur (Africa/Abidjan = UTC+0) : J-2 à minuit UTC
DateTime? _deadline(Menu menu) {
  final dateMenu = DateTime.tryParse(menu.dateMenu);
  if (dateMenu == null) return null;
  return DateTime.utc(dateMenu.year, dateMenu.month, dateMenu.day)
      .subtract(const Duration(hours: 48));
}

bool _depasseDelai(Menu menu) {
  final deadline = _deadline(menu);
  if (deadline == null) return true;
  return DateTime.now().toUtc().isAfter(deadline);
}

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

class MenuScreen extends StatefulWidget {
  const MenuScreen({super.key});
  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  Menu? _menuSelectionne;
  _AgenceLocal? _agenceSelectionnee;
  _EquipeLocal? _equipeSelectionnee;

  @override
  void initState() {
    super.initState();
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
        // Squelettes au premier chargement seulement : une actualisation
        // garde la liste affichée
        if (menuProv.loading && menuProv.menus.isEmpty) {
          return ListView(
              padding: const EdgeInsets.all(16),
              children: List.generate(3, (_) => const ShimmerCard(height: 60)));
        }

        if (menuProv.error != null && menuProv.menus.isEmpty) {
          return _defilable(EmptyState(
            icon: Icons.cloud_off_rounded,
            title: 'Chargement impossible',
            subtitle: menuProv.error,
            action: ElevatedButton.icon(
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('Réessayer'),
              onPressed: _recharger,
            ),
          ));
        }

        final agences = <String, String>{};
        final equipes = <String, String>{};
        for (final m in menuProv.menus) {
          agences[m.agenceId.toString()] = m.agenceNom;
          equipes[m.typeEquipeId.toString()] = m.typeEquipeLibelle;
        }

        // Filtre devenu sans menu après actualisation : ignoré (sinon le
        // DropdownButton reçoit une valeur absente de ses items → assertion)
        final agenceSel = agences.containsKey(_agenceSelectionnee?.id)
            ? _agenceSelectionnee
            : null;
        final equipeSel = equipes.containsKey(_equipeSelectionnee?.id)
            ? _equipeSelectionnee
            : null;

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
          _FiltresBar(
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
                        child: _MenuDetail(
                          menu: selection,
                          depasseDelai: _depasseDelai(selection),
                          delaiMessage: _delaiMessage(selection),
                        ),
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // Plusieurs menus le même jour (équipes / agences) : 2e ligne explicative
    final parDate = <String, int>{};
    for (final m in menus) {
      parDate[m.dateMenu] = (parDate[m.dateMenu] ?? 0) + 1;
    }
    final avecSousTitre = parDate.values.any((n) => n > 1);
    return SizedBox(
      height: avecSousTitre ? 80 : 68,
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
          final sousTitre = (parDate[menu.dateMenu] ?? 0) > 1
              ? (distinguerParAgence ? menu.agenceNom : menu.typeEquipeLibelle)
              : null;

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
              width: avecSousTitre ? 72 : 56,
              padding: const EdgeInsets.symmetric(horizontal: 4),
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
                  if (sousTitre != null)
                    Text(sousTitre,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w500,
                            color: jourColor)),
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
    final iconColor =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;

    if (menu.menuPlats.isEmpty) {
      // ListView : l'actualisation par glissement reste possible
      return ListView(children: const [
        EmptyState(
          icon: Icons.no_meals_rounded,
          title: 'Aucun plat',
          subtitle: 'Aucun plat ajouté pour ce menu',
        ),
      ]);
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
                menu.isToday ? 'Menu du jour' : 'Menu',
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: AppColors.accent, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 2),

              // ── Ligne 2 : Date complète ────────────────────
              // maxLines: 2 + ellipsis → plus jamais de overflow
              Text(
                _dateMenuLongue(menu),
                style: Theme.of(context).textTheme.titleLarge,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 6),

              // ── Ligne 3 : Statut commande ──────────────────
              _DelaiBadge(
                  depasseDelai: depasseDelai, message: delaiMessage),
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
    return GestureDetector(
      // Toute la carte ouvre la fiche détaillée du plat
      onTap: () => _PlatDetailSheet.show(context, menu: menu, plat: plat),
      child: Container(
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
      ),
    );
  }

  Widget _imagePlaceholder() => const _ImagePlaceholder(height: 200);
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

class _DelaiBadge extends StatelessWidget {
  final bool depasseDelai;
  final String message;
  const _DelaiBadge({required this.depasseDelai, required this.message});

  @override
  Widget build(BuildContext context) {
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
              // Pas de second envoi pendant une action en cours
              onPressed: cmdProv.isLoading
                  ? null
                  : () => _confirmerAnnulation(
                      context, cmdProv, commandeCeMenu.id),
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
        // Conseil d'annulation seulement si elle est encore possible
        if (commandeCeMenu.statut == StatutCommande.enAttente && !depasseDelai) ...[
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
          '${commandeCeJour.statut == StatutCommande.enAttente && !depasseDelai ? '\nAnnulez cette commande pour en passer une autre.' : ''}',
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

  void _confirmerAnnulation(
      BuildContext context, CommandeProvider cmdProv, int commandeId) {
    showDialog(
        context: context,
        builder: (dialogCtx) => AlertDialog(
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20)),
              title: const Row(children: [
                Icon(Icons.warning_amber_rounded, color: AppColors.warning),
                SizedBox(width: 8),
                Text('Annuler ?'),
              ]),
              content: const Text(
                'Voulez-vous annuler cette commande ?\n\n'
                '⚠️ Aucune annulation n\'est possible moins de 48 h avant la date du menu.',
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
                      backgroundColor:
                          ok ? AppColors.warning : AppColors.error,
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
    final depasse = _depasseDelai(menu);
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
                      _DelaiBadge(
                          depasseDelai: depasse,
                          message: _delaiMessage(menu)),
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
                            _BoutonCommander(
                                plat: plat, menu: menu, depasseDelai: depasse),
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
                          color: Colors.black.withOpacity(0.25),
                          blurRadius: 3)
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
