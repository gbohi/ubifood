// lib/features/jeux/partie_screen.dart
//
// Partie chronométrée. Le serveur tient le temps : l'écran affiche le temps
// restant qu'il donne et, à l'échéance (ou au retour dans l'application),
// lui redemande où en est la partie. Il n'y a pas de pause : si l'employé
// quitte l'application, les questions continuent de passer.
//   - libre  : la question suivante s'affiche dès la réponse ;
//   - direct : salle d'attente, puis chaque question s'ouvre pour tout le
//              monde en même temps (« Réponse enregistrée » en attendant).
// Ni la bonne réponse ni les points ne sont montrés pendant la partie.

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/api/api_client.dart' show messageErreurApi;
import '../../core/services/jeux_service.dart';
import '../../shared/models/jeux_models.dart';
import '../../shared/theme/app_theme.dart';
import 'jeux_screen.dart' show BoutonJeu, quandJeu, roseJeu, violetJeu;

class PartieScreen extends StatefulWidget {
  final Jeu jeu;
  final EtatPartie etatInitial;
  final JeuxService? service;
  const PartieScreen(
      {super.key, required this.jeu, required this.etatInitial, this.service});

  @override
  State<PartieScreen> createState() => _PartieScreenState();
}

class _PartieScreenState extends State<PartieScreen>
    with WidgetsBindingObserver {
  JeuxService get _service => widget.service ?? jeuxService;
  late EtatPartie _etat = widget.etatInitial;
  Timer? _tick;
  Timer? _echeance;
  int? _choix;
  bool _envoi = false;
  bool _rafraichissement = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _tick = Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (mounted) setState(() {});
    });
    _programmer();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _tick?.cancel();
    _echeance?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Retour dans l'application : le temps a continué, le serveur dit où on en est
    if (state == AppLifecycleState.resumed) _rafraichir();
  }

  void _programmer() {
    _echeance?.cancel();
    if (_etat.terminee) return;
    final reste = _etat.echeance.difference(DateTime.now());
    _echeance = Timer(
        (reste.isNegative ? Duration.zero : reste) +
            const Duration(milliseconds: 400),
        _rafraichir);
  }

  void _appliquer(EtatPartie e) {
    if (!mounted) return;
    setState(() {
      _etat = e;
      _choix = null;
    });
    _programmer();
  }

  Future<void> _rafraichir() async {
    if (_rafraichissement || _etat.terminee) return;
    _rafraichissement = true;
    try {
      _appliquer(await _service.partie(widget.jeu.id));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(
                messageErreurApi(e) ?? 'Connexion perdue : nouvel essai…')));
        _echeance?.cancel();
        _echeance = Timer(const Duration(seconds: 3), _rafraichir);
      }
    } finally {
      _rafraichissement = false;
    }
  }

  Future<void> _repondre(ReponseProposee r) async {
    if (_envoi || _etat.statut != 'question') return;
    setState(() {
      _choix = r.id;
      _envoi = true;
    });
    try {
      _appliquer(await _service.repondre(widget.jeu.id, _etat.index, r.id));
    } on ReponseRefusee catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
      _appliquer(e.etat);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(messageErreurApi(e) ?? 'Réponse non envoyée.')));
        setState(() => _choix = null);
      }
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  Duration get _reste {
    final r = _etat.echeance.difference(DateTime.now());
    return r.isNegative ? Duration.zero : r;
  }

  Future<bool> _confirmerSortie() async {
    if (_etat.terminee || _etat.statut == 'attente_debut') return true;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Quitter la partie ?'),
        content: const Text(
            'Le chrono ne s\'arrête pas : les questions continuent de passer pendant votre absence.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Continuer à jouer')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Quitter')),
        ],
      ),
    );
    return ok ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final e = _etat;
    return PopScope(
      canPop: false,
      onPopInvoked: (aQuitte) async {
        if (aQuitte) return;
        final nav = Navigator.of(context);
        if (await _confirmerSortie()) nav.pop();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.jeu.titre, style: const TextStyle(fontSize: 16)),
          leading: IconButton(
            icon: const Icon(Icons.close_rounded),
            tooltip: 'Quitter',
            onPressed: () async {
              final nav = Navigator.of(context);
              if (await _confirmerSortie()) nav.pop();
            },
          ),
        ),
        body: SafeArea(
          child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
              children: [
                if (e.statut == 'question' ||
                    e.statut == 'attente_suivante') ...[
                  Text('Question ${e.index + 1} / ${e.total}',
                      key: const Key('partie-progression'),
                      style: TextStyle(
                          color: gris,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(
                      value: e.total == 0 ? 0 : e.repondues / e.total,
                      minHeight: 6,
                      color: violetJeu,
                      backgroundColor:
                          isDark ? AppColors.darkBorder : AppColors.lightBorder,
                    ),
                  ),
                ],
                ...switch (e.statut) {
                  'question' => _question(e, gris, isDark),
                  'attente_debut' => _attente(
                      Icons.live_tv_rounded,
                      'Salle d\'attente',
                      'Le quiz commence dans',
                      _mmss(_reste),
                      'Restez sur cet écran : la première question s\'affichera toute seule.',
                      gris),
                  'attente_suivante' => _attente(
                      Icons.done_all_rounded,
                      'Réponse enregistrée',
                      'Question suivante pour tout le monde dans',
                      '${(_reste.inMilliseconds / 1000).ceil()} s',
                      null,
                      gris),
                  _ => _fin(e, gris),
                },
              ]),
        ),
      ),
    );
  }

  String _mmss(Duration d) {
    final s = (d.inMilliseconds / 1000).ceil();
    return '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';
  }

  List<Widget> _question(EtatPartie e, Color gris, bool isDark) {
    final reste = _reste;
    final secondes = (reste.inMilliseconds / 1000).ceil();
    final part = e.duree == 0
        ? 0.0
        : math.min(1.0, reste.inMilliseconds / (e.duree * 1000));
    const lettres = ['A', 'B', 'C', 'D'];
    return [
      const SizedBox(height: 18),
      Center(
        child: SizedBox(
          width: 116,
          height: 116,
          child: Stack(alignment: Alignment.center, children: [
            SizedBox.expand(
              child: CircularProgressIndicator(
                value: part,
                strokeWidth: 9,
                color: secondes <= 5 ? const Color(0xFFD92D20) : roseJeu,
                backgroundColor: const Color(0xFFEEE6FB),
              ),
            ),
            Column(mainAxisSize: MainAxisSize.min, children: [
              Text('$secondes',
                  key: const Key('partie-chrono'),
                  style: TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.w800,
                      color: secondes <= 5 ? const Color(0xFFD92D20) : null)),
              Text('secondes', style: TextStyle(fontSize: 10.5, color: gris)),
            ]),
          ]),
        ),
      ),
      const SizedBox(height: 14),
      Text(e.question ?? '',
          key: const Key('partie-question'),
          textAlign: TextAlign.center,
          style: const TextStyle(
              fontSize: 17, fontWeight: FontWeight.w800, height: 1.35)),
      const SizedBox(height: 16),
      for (final (k, r) in e.reponses.indexed)
        Padding(
          padding: const EdgeInsets.only(bottom: 9),
          child: Material(
            color: _choix == r.id
                ? (isDark
                    ? violetJeu.withOpacity(0.25)
                    : const Color(0xFFF5EFFE))
                : (isDark ? AppColors.darkCard : Colors.white),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: BorderSide(
                  color: _choix == r.id
                      ? violetJeu
                      : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
                  width: 1.5),
            ),
            child: InkWell(
              key: Key('reponse-${r.id}'),
              borderRadius: BorderRadius.circular(14),
              onTap: (_envoi || reste == Duration.zero)
                  ? null
                  : () => _repondre(r),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                child: Row(children: [
                  Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                        color: _choix == r.id
                            ? violetJeu
                            : (isDark
                                ? AppColors.darkSurface
                                : const Color(0xFFF3F6FA)),
                        borderRadius: BorderRadius.circular(8)),
                    child: Text(lettres[k],
                        style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 12.5,
                            color: _choix == r.id ? Colors.white : gris)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                      child: Text(r.texte,
                          style: const TextStyle(
                              fontSize: 14.5, fontWeight: FontWeight.w600))),
                ]),
              ),
            ),
          ),
        ),
      const SizedBox(height: 6),
      Text(
          'Le chrono continue même si vous quittez l\'application. Une seule réponse par question.',
          textAlign: TextAlign.center,
          style: TextStyle(color: gris, fontSize: 11.5)),
    ];
  }

  List<Widget> _attente(IconData icone, String titre, String texte,
          String valeur, String? note, Color gris) =>
      [
        const SizedBox(height: 40),
        Icon(icone, size: 44, color: violetJeu),
        const SizedBox(height: 8),
        Text(titre,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        Text(texte, textAlign: TextAlign.center, style: TextStyle(color: gris)),
        const SizedBox(height: 4),
        Text(valeur,
            key: const Key('partie-attente'),
            textAlign: TextAlign.center,
            style: const TextStyle(
                fontSize: 40, fontWeight: FontWeight.w800, color: violetJeu)),
        if (note != null) ...[
          const SizedBox(height: 10),
          Text(note,
              textAlign: TextAlign.center,
              style: TextStyle(color: gris, fontSize: 12)),
        ],
      ];

  List<Widget> _fin(EtatPartie e, Color gris) {
    Widget stat(String v, String l) => Expanded(
          child: Container(
            padding: const EdgeInsets.all(10),
            margin: const EdgeInsets.symmetric(horizontal: 4),
            decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.lightBorder)),
            child: Column(children: [
              Text(v,
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w800)),
              Text(l,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 11, color: gris)),
            ]),
          ),
        );
    return [
      const SizedBox(height: 30),
      const Icon(Icons.flag_rounded, size: 44, color: violetJeu),
      const SizedBox(height: 8),
      const Text('Partie terminée !',
          key: Key('partie-terminee'),
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
      const SizedBox(height: 16),
      Row(children: [
        stat('${e.nbBonnes ?? 0}/${e.total}', 'bonnes réponses'),
        stat('${e.points ?? 0}', 'points'),
        stat(formatDureeJeu(e.tempsTotalMs), 'temps total'),
      ]),
      const SizedBox(height: 14),
      Text(
          'Corrections ${e.correctionsLe == null ? 'à la fin du jeu' : 'le ${quandJeu(e.correctionsLe!)}'} ; '
          'classement et lots à la publication des résultats.',
          textAlign: TextAlign.center,
          style: TextStyle(color: gris, fontSize: 12)),
      const SizedBox(height: 18),
      BoutonJeu(
          texte: 'Terminer', onPressed: () => Navigator.of(context).pop()),
    ];
  }
}
