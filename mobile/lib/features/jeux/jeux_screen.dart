// lib/features/jeux/jeux_screen.dart
//
// Rubrique « Jeux » : jeu en cours (compte à rebours), jeux à venir, mes
// participations (lot gagné et s'il est retiré, ou « Perdu ») ; présentation
// d'un jeu (lots, conditions, règles) et démarrage de la partie.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart' show messageErreurApi;
import '../../core/services/jeux_service.dart';
import '../../core/widgets/common_widgets.dart';
import '../../shared/models/jeux_models.dart';
import '../../shared/theme/app_theme.dart';
import '../prestataire/prestataire_widgets.dart' show CartePresta;
import 'partie_screen.dart';
import 'resultats_jeu_screen.dart';

const violetJeu = Color(0xFF7B2FF7);
const roseJeu = Color(0xFFF107A3);
const degradeJeu = LinearGradient(
    colors: [violetJeu, roseJeu],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight);

String quandJeu(DateTime d) => DateFormat("dd/MM 'à' HH:mm", 'fr_FR').format(d);

/// Bouton plein dégradé violet → rose
class BoutonJeu extends StatelessWidget {
  final String texte;
  final VoidCallback? onPressed;
  final IconData? icone;
  const BoutonJeu({super.key, required this.texte, this.onPressed, this.icone});

  @override
  Widget build(BuildContext context) {
    final actif = onPressed != null;
    return Opacity(
      opacity: actif ? 1 : 0.45,
      child: Material(
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          decoration: BoxDecoration(
              gradient: degradeJeu, borderRadius: BorderRadius.circular(14)),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: onPressed,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
              child:
                  Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                if (icone != null) ...[
                  Icon(icone, color: Colors.white, size: 19),
                  const SizedBox(width: 8)
                ],
                Flexible(
                    child: Text(texte,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 15))),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

/// Résumé d'une participation : lot (retiré ?), perdu, en attente
({String texte, Color couleur, IconData icone}) resumeParticipation(Jeu j) {
  final p = j.participation;
  const vert = Color(0xFF1C8A4B);
  const gris = Color(0xFF8E9CB0);
  if (p?.resultat == 'gagne') {
    final etat = switch (p!.statutLot) {
      'remis' => 'retiré',
      'credite' => 'crédité',
      _ => 'à retirer',
    };
    return (
      texte: '${p.lotLibelle ?? 'Lot'} · $etat',
      couleur: vert,
      icone: Icons.card_giftcard_rounded
    );
  }
  if (p?.resultat == 'perdu') {
    return (
      texte: 'Perdu',
      couleur: gris,
      icone: Icons.sentiment_dissatisfied_rounded
    );
  }
  if (p?.resultat == 'non_classe') {
    return (texte: 'Non classé', couleur: gris, icone: Icons.block_rounded);
  }
  if (p != null && p.terminee) {
    return (
      texte: 'Résultats bientôt',
      couleur: violetJeu,
      icone: Icons.schedule_rounded
    );
  }
  if (p != null) {
    return (
      texte: 'Partie en cours',
      couleur: violetJeu,
      icone: Icons.play_arrow_rounded
    );
  }
  return (texte: 'Non joué', couleur: gris, icone: Icons.event_busy_rounded);
}

// ══════════════════════════════════════════════════════════════
// LISTE
// ══════════════════════════════════════════════════════════════

class JeuxScreen extends StatefulWidget {
  final JeuxService? service;
  const JeuxScreen({super.key, this.service});

  @override
  State<JeuxScreen> createState() => _JeuxScreenState();
}

class _JeuxScreenState extends State<JeuxScreen> {
  JeuxService get _service => widget.service ?? jeuxService;
  ListeJeux? _liste;
  String? _erreur;
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _charger();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && (_liste?.enCours.isNotEmpty ?? false)) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _charger() async {
    try {
      final l = await _service.liste();
      if (mounted) {
        setState(() {
          _liste = l;
          _erreur = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _erreur =
            messageErreurApi(e) ?? 'Les jeux n\'ont pas pu être chargés.');
      }
    }
  }

  Future<void> _ouvrir(Jeu j) async {
    await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => JeuDetailScreen(jeuId: j.id, service: widget.service)));
    _charger();
  }

  @override
  Widget build(BuildContext context) {
    final l = _liste;
    return Scaffold(
      body: Column(children: [
        const EnTeteMarine(
            titre: 'Jeux',
            sousTitre: 'Jouez, grimpez au classement, gagnez des lots'),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _charger,
            child: ListView(padding: const EdgeInsets.all(14), children: [
              if (_erreur != null)
                BandeauInfo(
                    icone: Icons.cloud_off_rounded,
                    ton: TonPastille.rouge,
                    texte: _erreur!)
              else if (l == null)
                const Padding(
                    padding: EdgeInsets.all(40),
                    child: Center(child: CircularProgressIndicator()))
              else if (l.vide)
                const EmptyState(
                    icon: Icons.sports_esports_outlined,
                    title: 'Aucun jeu pour le moment',
                    subtitle:
                        'Vous serez notifié dès qu\'un jeu sera programmé.')
              else ...[
                for (final (i, j) in l.enCours.indexed)
                  _CarteEnCours(
                      jeu: j, compte: i == 0, onTap: () => _ouvrir(j)),
                if (l.aVenir.isNotEmpty) ...[
                  const _Section('À venir'),
                  for (final j in l.aVenir)
                    _LigneJeu(
                      jeu: j,
                      icone: j.direct
                          ? Icons.live_tv_rounded
                          : Icons.event_rounded,
                      fond: const Color(0xFFFFF2DA),
                      couleur: const Color(0xFFD8901A),
                      sousTitre:
                          '${j.direct ? 'En direct le' : 'Ouvre le'} ${quandJeu(j.debut)} · ${j.nbGagnants} lot${j.nbGagnants > 1 ? 's' : ''}',
                      onTap: () => _ouvrir(j),
                    ),
                ],
                if (l.passes.isNotEmpty) ...[
                  const _Section('Mes participations'),
                  for (final j in l.passes)
                    _LigneParticipation(jeu: j, onTap: () => _ouvrir(j)),
                ],
              ],
            ]),
          ),
        ),
      ]),
    );
  }
}

class _Section extends StatelessWidget {
  final String texte;
  const _Section(this.texte);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(2, 16, 2, 8),
        child: Text(texte,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
      );
}

class _CarteEnCours extends StatelessWidget {
  final Jeu jeu;
  final bool compte;
  final VoidCallback onTap;
  const _CarteEnCours(
      {required this.jeu, required this.compte, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final cible = jeu.etat == 'a_venir' ? jeu.debut : jeu.fin;
    final reste = cible.difference(jeu.maintenantServeur);
    final t = reste.isNegative ? Duration.zero : reste;
    final p = jeu.participation;
    final action = p == null ? 'Jouer' : (p.terminee ? 'Voir' : 'Reprendre');
    Widget bloc(String v, String u) => Container(
          margin: const EdgeInsets.only(right: 6),
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
          decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.2),
              borderRadius: BorderRadius.circular(10)),
          child: Column(children: [
            Text(v,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w800)),
            Text(u, style: const TextStyle(color: Colors.white, fontSize: 9.5)),
          ]),
        );
    String deux(int n) => n.toString().padLeft(2, '0');
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        borderRadius: BorderRadius.circular(20),
        clipBehavior: Clip.antiAlias,
        child: Ink(
          decoration: const BoxDecoration(gradient: degradeJeu),
          child: InkWell(
            key: Key('jeu-en-cours-${jeu.id}'),
            onTap: onTap,
            child: Stack(children: [
              Positioned(
                  right: -8,
                  top: -10,
                  child: Icon(Icons.emoji_events_rounded,
                      size: 96, color: Colors.white.withOpacity(0.16))),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 3),
                        decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.22),
                            borderRadius: BorderRadius.circular(99)),
                        child: Text(jeu.direct ? 'EN DIRECT' : 'EN COURS',
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700)),
                      ),
                      const SizedBox(height: 8),
                      Text(jeu.titre,
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 19,
                              fontWeight: FontWeight.w800)),
                      Text(
                          '${jeu.nbQuestions} questions · ${jeu.nbGagnants} lot${jeu.nbGagnants > 1 ? 's' : ''} à gagner',
                          style: TextStyle(
                              color: Colors.white.withOpacity(0.92),
                              fontSize: 12)),
                      const SizedBox(height: 10),
                      Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            if (compte) ...[
                              if (t.inDays > 0) bloc('${t.inDays}', 'jours'),
                              bloc(deux(t.inHours % 24), 'h'),
                              bloc(deux(t.inMinutes % 60), 'min'),
                              if (t.inDays == 0)
                                bloc(deux(t.inSeconds % 60), 's'),
                            ],
                            const Spacer(),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 9),
                              decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(12)),
                              child: Text(action,
                                  style: const TextStyle(
                                      color: violetJeu,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 13)),
                            ),
                          ]),
                    ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class _LigneJeu extends StatelessWidget {
  final Jeu jeu;
  final IconData icone;
  final Color fond;
  final Color couleur;
  final String sousTitre;
  final Widget? droite;
  final VoidCallback onTap;
  const _LigneJeu({
    required this.jeu,
    required this.icone,
    required this.fond,
    required this.couleur,
    required this.sousTitre,
    this.droite,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        key: Key('jeu-${jeu.id}'),
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: CartePresta(
          padding: const EdgeInsets.all(11),
          child: Row(children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                  color: isDark ? couleur.withOpacity(0.18) : fond,
                  borderRadius: BorderRadius.circular(13)),
              child: Icon(icone, color: couleur, size: 22),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(jeu.titre,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 14)),
                    const SizedBox(height: 2),
                    Text(sousTitre,
                        style: TextStyle(
                            fontSize: 11.5,
                            color: isDark
                                ? AppColors.darkTextSecondary
                                : AppColors.lightTextSecondary)),
                  ]),
            ),
            droite ?? const Icon(Icons.chevron_right_rounded),
          ]),
        ),
      ),
    );
  }
}

class _LigneParticipation extends StatelessWidget {
  final Jeu jeu;
  final VoidCallback onTap;
  const _LigneParticipation({required this.jeu, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final r = resumeParticipation(jeu);
    final p = jeu.participation;
    final details = [
      if (p?.rang != null) '${p!.rang}e sur ${jeu.nbParticipants ?? '?'}',
      if (p?.points != null) '${p!.points} pts',
    ];
    return _LigneJeu(
      jeu: jeu,
      icone: r.icone,
      fond: r.couleur.withOpacity(0.12),
      couleur: r.couleur,
      sousTitre: details.isEmpty
          ? 'Terminé le ${quandJeu(jeu.fin)}'
          : details.join(' · '),
      droite: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 130),
        child: Text(r.texte,
            key: Key('resultat-${jeu.id}'),
            textAlign: TextAlign.right,
            style: TextStyle(
                color: r.couleur, fontWeight: FontWeight.w700, fontSize: 11.5)),
      ),
      onTap: onTap,
    );
  }
}

// ══════════════════════════════════════════════════════════════
// PRÉSENTATION D'UN JEU
// ══════════════════════════════════════════════════════════════

class JeuDetailScreen extends StatefulWidget {
  final int jeuId;
  final JeuxService? service;
  const JeuDetailScreen({super.key, required this.jeuId, this.service});

  @override
  State<JeuDetailScreen> createState() => _JeuDetailScreenState();
}

class _JeuDetailScreenState extends State<JeuDetailScreen> {
  JeuxService get _service => widget.service ?? jeuxService;
  Jeu? _jeu;
  String? _erreur;
  bool _envoi = false;

  @override
  void initState() {
    super.initState();
    _charger();
  }

  Future<void> _charger() async {
    try {
      final j = await _service.jeu(widget.jeuId);
      if (mounted) {
        setState(() {
          _jeu = j;
          _erreur = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _erreur = messageErreurApi(e) ?? 'Jeu introuvable.');
      }
    }
  }

  Future<void> _jouer({bool reprendre = false}) async {
    final j = _jeu!;
    setState(() => _envoi = true);
    try {
      final etat = reprendre
          ? await _service.partie(j.id)
          : await _service.commencer(j.id);
      if (!mounted) return;
      setState(() => _envoi = false);
      await Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => PartieScreen(
              jeu: j, etatInitial: etat, service: widget.service)));
      _charger();
    } catch (e) {
      if (!mounted) return;
      setState(() => _envoi = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              messageErreurApi(e) ?? 'Impossible de commencer la partie.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final j = _jeu;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    return Scaffold(
      body: Column(children: [
        EnTeteMarine(
            titre: j?.titre ?? 'Jeu',
            sousTitre: j == null
                ? null
                : (j.direct
                    ? 'En direct le ${quandJeu(j.debut)}'
                    : 'Du ${quandJeu(j.debut)} au ${quandJeu(j.fin)}')),
        Expanded(
          child: _erreur != null
              ? ListView(padding: const EdgeInsets.all(14), children: [
                  BandeauInfo(
                      icone: Icons.cloud_off_rounded,
                      ton: TonPastille.rouge,
                      texte: _erreur!)
                ])
              : j == null
                  ? const Center(child: CircularProgressIndicator())
                  : RefreshIndicator(
                      onRefresh: _charger,
                      child: ListView(
                          padding: const EdgeInsets.all(14),
                          children: [
                            if (j.participation?.resultat != null) ...[
                              CarteResultat(jeu: j),
                              const SizedBox(height: 12),
                            ],
                            ..._actions(j, gris),
                            const SizedBox(height: 14),
                            Row(children: [
                              const Expanded(
                                child: Text('Lots à gagner',
                                    style: TextStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.w700)),
                              ),
                              Text(
                                  '${j.nbGagnants} gagnant${j.nbGagnants > 1 ? 's' : ''}',
                                  style: TextStyle(
                                      color: gris,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600)),
                            ]),
                            const SizedBox(height: 8),
                            for (final (i, lot) in j.lots.indexed)
                              _LigneLot(lot: lot, rang: i),
                            if (j.description.isNotEmpty) ...[
                              const SizedBox(height: 10),
                              Text(j.description,
                                  style:
                                      TextStyle(color: gris, fontSize: 12.5)),
                            ],
                          ]),
                    ),
        ),
      ]),
    );
  }

  List<Widget> _actions(Jeu j, Color gris) {
    final p = j.participation;
    final e = j.eligibilite;
    final res = <Widget>[];
    if (p != null && p.terminee) {
      res.add(Row(children: [
        Expanded(
          child: OutlinedButton.icon(
            key: const Key('btn-mes-reponses'),
            icon: const Icon(Icons.fact_check_outlined, size: 18),
            label: const Text('Mes réponses'),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) =>
                    ResultatsJeuScreen(jeuId: j.id, service: widget.service))),
          ),
        ),
        if (j.etat == 'resultats') ...[
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton.icon(
              key: const Key('btn-classement'),
              icon: const Icon(Icons.leaderboard_outlined, size: 18),
              label: const Text('Classement'),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) =>
                      ClassementJeuScreen(jeu: j, service: widget.service))),
            ),
          ),
        ],
      ]));
      if (j.etat != 'resultats') {
        res.add(Padding(
          padding: const EdgeInsets.only(top: 10),
          child: BandeauInfo(
              icone: Icons.schedule_rounded,
              ton: TonPastille.bleu,
              texte:
                  'Partie terminée : ${p.nbBonnes ?? 0}/${p.nbQuestions} bonnes réponses, ${p.points ?? 0} points. '
                  'Classement et lots à la publication des résultats.'),
        ));
      }
      return res;
    }
    if (j.etat == 'resultats') {
      res.add(OutlinedButton.icon(
        icon: const Icon(Icons.leaderboard_outlined, size: 18),
        label: const Text('Classement'),
        onPressed: () => Navigator.of(context).push(MaterialPageRoute(
            builder: (_) =>
                ClassementJeuScreen(jeu: j, service: widget.service))),
      ));
      return res;
    }
    if (p != null) {
      res.add(BoutonJeu(
          key: const Key('btn-reprendre'),
          icone: Icons.play_arrow_rounded,
          texte: 'Reprendre ma partie (le temps a continué)',
          onPressed: _envoi ? null : () => _jouer(reprendre: true)));
      return res;
    }
    if (j.etat != 'en_cours' && j.etat != 'a_venir') {
      res.add(const BandeauInfo(
          icone: Icons.event_busy_rounded,
          ton: TonPastille.gris,
          texte: 'Ce jeu est terminé.'));
      return res;
    }
    if (e != null) {
      res.add(BandeauInfo(
          key: const Key('eligibilite'),
          icone:
              e.ok ? Icons.check_circle_rounded : Icons.error_outline_rounded,
          ton: e.ok ? TonPastille.vert : TonPastille.or,
          texte:
              '${e.ok ? 'Vous pouvez jouer' : 'Pas encore'} : ${e.message}'));
      res.add(const SizedBox(height: 10));
    }
    final duree = j.dureeMin == j.dureeMax
        ? '${j.dureeMin} s'
        : '${j.dureeMin} à ${j.dureeMax} s';
    res.add(CartePresta(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Column(children: [
        _Regle(Icons.timer_outlined,
            'Une seule partie : ${j.nbQuestions} questions de $duree.'),
        const _Regle(Icons.pause_circle_outline_rounded,
            'Le chrono ne s\'arrête jamais : si vous quittez l\'application, le temps continue et les questions passent.'),
        if (j.direct)
          _Regle(Icons.live_tv_rounded,
              'En direct : chaque question s\'ouvre pour tout le monde en même temps. Salle d\'attente dès le ${quandJeu(j.ouverture ?? j.debut)}.'),
        _Regle(Icons.flash_on_rounded,
            'Plus vous répondez vite, plus vous gagnez de points (bonus jusqu\'à ${j.bonusRapiditePct} %).'),
        const _Regle(Icons.visibility_off_outlined,
            'Corrections et classement à la fin du jeu.'),
      ]),
    ));
    res.add(const SizedBox(height: 12));
    final ouvert = j.ouvert;
    res.add(BoutonJeu(
      key: const Key('btn-commencer'),
      icone: Icons.sports_esports_rounded,
      texte: !ouvert
          ? (j.direct
              ? 'Salle d\'attente le ${quandJeu(j.ouverture ?? j.debut)}'
              : 'Ouvre le ${quandJeu(j.debut)}')
          : (j.direct && j.etat == 'a_venir'
              ? 'Rejoindre la salle d\'attente'
              : 'Commencer la partie'),
      onPressed:
          (ouvert && (e?.ok ?? false) && !_envoi) ? () => _jouer() : null,
    ));
    return res;
  }
}

class _Regle extends StatelessWidget {
  final IconData icone;
  final String texte;
  const _Regle(this.icone, this.texte);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icone, size: 17, color: violetJeu),
          const SizedBox(width: 9),
          Expanded(child: Text(texte, style: const TextStyle(fontSize: 12.5))),
        ]),
      );
}

class _LigneLot extends StatelessWidget {
  final LotJeu lot;
  final int rang;
  const _LigneLot({required this.lot, required this.rang});
  @override
  Widget build(BuildContext context) {
    const couleurs = [
      (Color(0xFFFDE68A), Color(0xFF92400E)),
      (Color(0xFFE5E7EB), Color(0xFF374151)),
      (Color(0xFFFED7AA), Color(0xFF9A3412)),
      (Color(0xFFE8F0FD), Color(0xFF0F3A6E)),
    ];
    final (fond, texte) = couleurs[rang < 3 ? rang : 3];
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.only(bottom: 7),
      child: CartePresta(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
        child: Row(children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: fond, shape: BoxShape.circle),
            child: Text(
                lot.rangDebut == 1 && lot.rangFin == 1 ? '1er' : lot.rangs,
                style: TextStyle(
                    color: texte, fontWeight: FontWeight.w800, fontSize: 12)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(lot.libelleAffiche,
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 13.5)),
              Text('${lot.quantite} gagnant${lot.quantite > 1 ? 's' : ''}',
                  style: TextStyle(
                      fontSize: 11.5,
                      color: isDark
                          ? AppColors.darkTextSecondary
                          : AppColors.lightTextSecondary)),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Carte « Bravo, vous avez gagné ! » / « Perdu » avec l'état du lot
class CarteResultat extends StatelessWidget {
  final Jeu jeu;
  const CarteResultat({super.key, required this.jeu});

  @override
  Widget build(BuildContext context) {
    final p = jeu.participation!;
    final gagne = p.resultat == 'gagne';
    final titre = switch (p.resultat) {
      'gagne' => 'Bravo, vous avez gagné !',
      'perdu' => 'Perdu cette fois',
      _ => 'Non classé',
    };
    final sous = p.rang != null
        ? '${p.rang}e sur ${jeu.nbParticipants ?? '?'} participants · ${p.points ?? 0} pts'
        : p.motif;
    String? retrait;
    IconData iconeRetrait = Icons.volunteer_activism_outlined;
    if (gagne) {
      switch (p.statutLot) {
        case 'remis':
          retrait =
              'Lot retiré le ${p.lotRemisLe == null ? '' : quandJeu(p.lotRemisLe!)}';
          iconeRetrait = Icons.done_all_rounded;
        case 'credite':
          retrait = 'Crédité sur votre compte repas';
          iconeRetrait = Icons.account_balance_wallet_outlined;
        default:
          retrait = 'À retirer auprès de votre gestionnaire';
      }
    }
    return Container(
      key: const Key('carte-resultat'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: LinearGradient(
            colors: gagne
                ? const [Color(0xFF15803D), Color(0xFF22A55A)]
                : const [Color(0xFF475569), Color(0xFF64748B)]),
      ),
      child: Column(children: [
        Text(gagne ? '🏆' : (p.resultat == 'perdu' ? '🙂' : '⛔'),
            style: const TextStyle(fontSize: 38)),
        const SizedBox(height: 4),
        Text(titre,
            style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w800)),
        const SizedBox(height: 2),
        Text(sous,
            textAlign: TextAlign.center,
            style:
                TextStyle(color: Colors.white.withOpacity(0.92), fontSize: 12)),
        if (gagne) ...[
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
                color: Colors.white, borderRadius: BorderRadius.circular(99)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.card_giftcard_rounded,
                  size: 16, color: Color(0xFF15803D)),
              const SizedBox(width: 6),
              Flexible(
                child: Text(p.lotLibelle ?? 'Lot',
                    style: const TextStyle(
                        color: Color(0xFF15803D),
                        fontWeight: FontWeight.w800,
                        fontSize: 13)),
              ),
            ]),
          ),
          const SizedBox(height: 8),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(iconeRetrait, color: Colors.white, size: 16),
            const SizedBox(width: 6),
            Flexible(
              child: Text(retrait!,
                  key: const Key('etat-lot'),
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600)),
            ),
          ]),
        ],
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// ACCUEIL : bandeau du jeu en cours (rien s'il n'y en a pas)
// ══════════════════════════════════════════════════════════════

class BandeauJeuAccueil extends StatefulWidget {
  final JeuxService? service;
  const BandeauJeuAccueil({super.key, this.service});

  @override
  State<BandeauJeuAccueil> createState() => BandeauJeuAccueilState();
}

class BandeauJeuAccueilState extends State<BandeauJeuAccueil> {
  Jeu? _jeu;

  @override
  void initState() {
    super.initState();
    charger();
  }

  Future<void> charger() async {
    try {
      final l = await (widget.service ?? jeuxService).liste();
      // Jeu en cours où l'employé n'a pas fini sa partie, sinon jeu à venir
      final enCours =
          l.enCours.where((j) => !(j.participation?.terminee ?? false));
      final jeu = enCours.isNotEmpty
          ? enCours.first
          : (l.aVenir.isNotEmpty ? l.aVenir.first : null);
      if (mounted) setState(() => _jeu = jeu);
    } catch (_) {
      // Pas de bandeau si les jeux sont indisponibles
    }
  }

  @override
  Widget build(BuildContext context) {
    final j = _jeu;
    if (j == null) return const SizedBox.shrink();
    final enCours = j.etat == 'en_cours' || j.ouvert;
    final texte = enCours
        ? (j.participation == null
            ? 'Jouez et gagnez des lots !'
            : 'Votre partie est en cours')
        : '${j.direct ? 'En direct le' : 'Ouvre le'} ${quandJeu(j.debut)}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: Ink(
          decoration: const BoxDecoration(gradient: degradeJeu),
          child: InkWell(
            key: const Key('bandeau-jeu'),
            onTap: () async {
              await Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) =>
                      JeuDetailScreen(jeuId: j.id, service: widget.service)));
              charger();
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Row(children: [
                const Icon(Icons.emoji_events_rounded,
                    color: Colors.white, size: 30),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(j.titre,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                                fontSize: 14.5)),
                        Text(
                            '$texte · ${j.nbGagnants} lot${j.nbGagnants > 1 ? 's' : ''}',
                            style: TextStyle(
                                color: Colors.white.withOpacity(0.9),
                                fontSize: 11.5)),
                      ]),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(10)),
                  child: Text(enCours ? 'Jouer' : 'Voir',
                      style: const TextStyle(
                          color: violetJeu,
                          fontWeight: FontWeight.w800,
                          fontSize: 12.5)),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
