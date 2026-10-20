// lib/core/widgets/tic_echeance.dart

import 'dart:async';

import 'package:flutter/widgets.dart';

/// Délai avant le prochain rafraîchissement d'un compte à rebours affiché
/// à la minute (« Ferme dans 12 min », « 3h05 »…), ou null s'il n'y a plus
/// rien à rafraîchir (aucune échéance à venir).
///
/// On se cale sur le prochain changement de minute du temps restant (au
/// plus une fois par minute, au plus près de la seconde quand l'échéance
/// arrive) : l'affichage reste exact et le bouton se ferme pile à l'heure,
/// sans réveiller l'application toutes les secondes.
Duration? prochainTicEcheance(Iterable<DateTime?> echeances, DateTime now) {
  Duration? restant;
  for (final e in echeances) {
    if (e == null || !e.isAfter(now)) continue;
    final d = e.difference(now);
    if (restant == null || d < restant) restant = d;
  }
  if (restant == null) return null;
  const minute = Duration(minutes: 1);
  final versMinute =
      Duration(microseconds: restant.inMicroseconds % minute.inMicroseconds);
  // Marge : le tic tombe juste APRÈS le changement (pas une milliseconde avant)
  return (versMinute == Duration.zero ? minute : versMinute) +
      const Duration(milliseconds: 50);
}

/// Reconstruit [builder] quand l'affichage d'une des [echeances] change
/// (compte à rebours, passage de la date limite) sans action de l'utilisateur.
///
/// Économie de batterie : aucun minuteur quand l'onglet est masqué
/// (IndexedStack de MainShell → TickerMode à false), quand l'application est
/// en arrière-plan, ou quand toutes les échéances sont passées.
class TicEcheance extends StatefulWidget {
  final List<DateTime?> echeances;
  final WidgetBuilder builder;

  const TicEcheance(
      {super.key, required this.echeances, required this.builder});

  @override
  State<TicEcheance> createState() => _TicEcheanceState();
}

class _TicEcheanceState extends State<TicEcheance> with WidgetsBindingObserver {
  Timer? _timer;
  bool _visible = true;
  bool _auPremierPlan = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final etat = WidgetsBinding.instance.lifecycleState;
    _auPremierPlan = etat == null || etat == AppLifecycleState.resumed;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Retour sur l'onglet : la dépendance change, le build qui suit
    // affiche déjà l'état à l'heure exacte
    _visible = TickerMode.of(context);
    _planifier();
  }

  @override
  void didUpdateWidget(TicEcheance old) {
    super.didUpdateWidget(old);
    _planifier();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final avant = _auPremierPlan;
    _auPremierPlan = state == AppLifecycleState.resumed;
    if (_auPremierPlan && !avant && mounted) {
      // Retour au premier plan : l'échéance a pu passer entre-temps
      setState(() {});
    }
    _planifier();
  }

  void _planifier() {
    _timer?.cancel();
    _timer = null;
    if (!_visible || !_auPremierPlan) return;
    final delai = prochainTicEcheance(widget.echeances, DateTime.now());
    if (delai == null) return;
    _timer = Timer(delai, () {
      if (!mounted) return;
      setState(() {});
      _planifier();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(context);
}
