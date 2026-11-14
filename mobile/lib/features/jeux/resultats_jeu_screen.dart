// lib/features/jeux/resultats_jeu_screen.dart
//
// Après la partie : mes points, mes réponses (bonnes réponses visibles à la
// fin du jeu seulement) ; classement de tous les participants (podium, ma
// place, lot de chaque gagnant, noms abrégés).

import 'package:flutter/material.dart';

import '../../core/api/api_client.dart' show messageErreurApi;
import '../../core/services/jeux_service.dart';
import '../../core/widgets/common_widgets.dart';
import '../../shared/models/jeux_models.dart';
import '../../shared/theme/app_theme.dart';
import '../prestataire/prestataire_widgets.dart' show CartePresta;
import 'jeux_screen.dart' show CarteResultat, quandJeu, violetJeu;

const _vert = Color(0xFF1C8A4B);
const _rouge = Color(0xFFB42318);

class ResultatsJeuScreen extends StatefulWidget {
  final int jeuId;
  final JeuxService? service;
  const ResultatsJeuScreen({super.key, required this.jeuId, this.service});

  @override
  State<ResultatsJeuScreen> createState() => _ResultatsJeuScreenState();
}

class _ResultatsJeuScreenState extends State<ResultatsJeuScreen> {
  late Future<ResultatsJeu> _donnees;

  @override
  void initState() {
    super.initState();
    _donnees = (widget.service ?? jeuxService).resultats(widget.jeuId);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    return Scaffold(
      body: Column(children: [
        const EnTeteMarine(titre: 'Mes réponses'),
        Expanded(
          child: FutureBuilder<ResultatsJeu>(
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
                          'Résultats indisponibles.'),
                ]);
              }
              final r = snap.data!;
              final p = r.jeu.participation;
              Widget stat(String v, String l) => Expanded(
                    child: CartePresta(
                      padding: const EdgeInsets.symmetric(
                          vertical: 9, horizontal: 4),
                      child: Column(children: [
                        Text(v,
                            style: const TextStyle(
                                fontSize: 17, fontWeight: FontWeight.w800)),
                        Text(l, style: TextStyle(fontSize: 10.5, color: gris)),
                      ]),
                    ),
                  );
              return ListView(padding: const EdgeInsets.all(14), children: [
                if (p?.resultat != null) ...[
                  CarteResultat(jeu: r.jeu),
                  const SizedBox(height: 10)
                ],
                Row(children: [
                  stat('${p?.nbBonnes ?? 0}/${p?.nbQuestions ?? 0}',
                      'bonnes réponses'),
                  const SizedBox(width: 7),
                  stat('${p?.points ?? 0}', 'points'),
                  const SizedBox(width: 7),
                  stat(formatDureeJeu(p?.tempsTotalMs), 'temps total'),
                ]),
                const SizedBox(height: 12),
                if (!r.corrections)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: BandeauInfo(
                        key: const Key('corrections-plus-tard'),
                        icone: Icons.visibility_off_outlined,
                        ton: TonPastille.bleu,
                        texte:
                            'Les bonnes réponses seront visibles ${r.correctionsLe == null ? 'à la fin du jeu' : 'le ${quandJeu(r.correctionsLe!)}'}.'),
                  ),
                for (final q in r.reponses)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 7),
                    child: CartePresta(
                      padding: const EdgeInsets.all(11),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${q.index + 1}. ${q.question}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 12.5)),
                            const SizedBox(height: 4),
                            Wrap(
                                crossAxisAlignment: WrapCrossAlignment.center,
                                spacing: 4,
                                children: [
                                  if (!q.repondu)
                                    const Text('⏱ Temps écoulé',
                                        style: TextStyle(
                                            color: _rouge,
                                            fontWeight: FontWeight.w600,
                                            fontSize: 12))
                                  else if (q.correcte != null)
                                    Text(
                                        '${q.correcte! ? '✓' : '✗'} ${q.reponse}',
                                        key: Key('reponse-corrigee-${q.index}'),
                                        style: TextStyle(
                                            color: q.correcte! ? _vert : _rouge,
                                            fontWeight: FontWeight.w600,
                                            fontSize: 12))
                                  else
                                    Text(q.reponse ?? '',
                                        style: const TextStyle(fontSize: 12)),
                                  if (q.correcte == false ||
                                      (!q.repondu && q.bonneReponse != null))
                                    Text('· bonne réponse : ${q.bonneReponse}',
                                        style: const TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w600)),
                                  if (q.points != null)
                                    Text(
                                        '· ${q.points! > 0 ? '+${q.points} pts' : '0 pt'}',
                                        style: TextStyle(
                                            fontSize: 12, color: gris)),
                                  Text('· ${formatDureeJeu(q.tempsMs)}',
                                      style:
                                          TextStyle(fontSize: 11, color: gris)),
                                ]),
                          ]),
                    ),
                  ),
              ]);
            },
          ),
        ),
      ]),
    );
  }
}

class ClassementJeuScreen extends StatefulWidget {
  final Jeu jeu;
  final JeuxService? service;
  const ClassementJeuScreen({super.key, required this.jeu, this.service});

  @override
  State<ClassementJeuScreen> createState() => _ClassementJeuScreenState();
}

class _ClassementJeuScreenState extends State<ClassementJeuScreen> {
  late Future<ClassementJeu> _donnees;

  @override
  void initState() {
    super.initState();
    _donnees = (widget.service ?? jeuxService).classement(widget.jeu.id);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    return Scaffold(
      body: Column(children: [
        EnTeteMarine(titre: 'Classement', sousTitre: widget.jeu.titre),
        Expanded(
          child: FutureBuilder<ClassementJeu>(
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
                          'Classement indisponible.'),
                ]);
              }
              final c = snap.data!;
              final l = c.lignes;
              Widget marche(LigneClassement x, Color couleur, double hauteur) =>
                  Expanded(
                    child: Container(
                      height: hauteur,
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                          color: couleur,
                          borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(14))),
                      child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text('${x.rang}',
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 17,
                                    fontWeight: FontWeight.w800)),
                            Text(x.nom,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700)),
                            Text('${x.points}',
                                style: const TextStyle(
                                    color: Colors.white, fontSize: 11)),
                          ]),
                    ),
                  );
              return ListView(padding: const EdgeInsets.all(14), children: [
                Text('${c.nbParticipants} participants',
                    style: TextStyle(color: gris, fontSize: 12)),
                if (l.length >= 3) ...[
                  const SizedBox(height: 10),
                  Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    marche(l[1], const Color(0xFF94A3B8), 88),
                    marche(l[0], const Color(0xFFF59E0B), 106),
                    marche(l[2], const Color(0xFFF97316), 78),
                  ]),
                ],
                const SizedBox(height: 12),
                for (final x in l)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: CartePresta(
                      key: Key('classement-${x.rang}'),
                      bordure: x.moi ? violetJeu : null,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 11, vertical: 8),
                      child: Row(children: [
                        SizedBox(
                            width: 28,
                            child: Text('${x.rang}',
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800))),
                        const SizedBox(width: 6),
                        CircleAvatar(
                          radius: 15,
                          backgroundColor: const Color(0xFFDCE8FA),
                          child: Text(x.initiales,
                              style: const TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF0F3A6E))),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(x.nom,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 13)),
                                Text(x.lot == null ? 'Perdu' : '🏆 ${x.lot}',
                                    style: TextStyle(
                                        fontSize: 11,
                                        color: x.lot == null ? gris : _vert,
                                        fontWeight: x.lot == null
                                            ? FontWeight.w400
                                            : FontWeight.w600)),
                              ]),
                        ),
                        Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text('${x.points}',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w800)),
                              Text(
                                  '${x.nbBonnes}/${x.nbQuestions} · ${formatDureeJeu(x.tempsTotalMs)}',
                                  style: TextStyle(fontSize: 10, color: gris)),
                            ]),
                      ]),
                    ),
                  ),
                const SizedBox(height: 6),
                Text(
                    'Égalité de points : départage par le temps total de réponse, puis l\'heure de fin de partie, puis tirage au sort.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: gris, fontSize: 11)),
              ]);
            },
          ),
        ),
      ]),
    );
  }
}
