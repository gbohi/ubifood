// lib/features/jeux/autres_jeux_onglets.dart
//
// Onglets de la rubrique Jeux : Défis (progression du mois, paliers,
// badges), Pronostics (matchs jusqu'au coup d'envoi), Tickets à gratter
// (tirage sur le serveur au premier geste) et Mes gains (lot retiré ou non).

import 'package:flutter/material.dart';
import 'package:intl/intl.dart' show DateFormat;

import '../../core/api/api_client.dart' show messageErreurApi;
import '../../core/services/jeux_service.dart';
import '../../core/widgets/common_widgets.dart';
import '../../shared/models/autres_jeux_models.dart';
import '../../shared/theme/app_theme.dart';
import '../prestataire/prestataire_widgets.dart' show CartePresta;
import 'jeux_screen.dart' show quandJeu, violetJeu;

const _vert = Color(0xFF1C8A4B);

String etatGain(Gain g) => switch (g.statutLot) {
      'remis' =>
        'Lot retiré le ${g.lotRemisLe == null ? '' : quandJeu(g.lotRemisLe!)}',
      'credite' => 'Crédité sur le compte repas',
      _ => 'À retirer auprès de votre gestionnaire',
    };

Color _gris(BuildContext c) => Theme.of(c).brightness == Brightness.dark
    ? AppColors.darkTextSecondary
    : AppColors.lightTextSecondary;

/// Chargement générique d'un onglet (indicateur, erreur, tirer pour rafraîchir)
class _Onglet<T> extends StatefulWidget {
  final Future<T> Function() charger;
  final List<Widget> Function(BuildContext, T, VoidCallback recharger) contenu;
  const _Onglet({super.key, required this.charger, required this.contenu});

  @override
  State<_Onglet<T>> createState() => _OngletState<T>();
}

class _OngletState<T> extends State<_Onglet<T>> {
  T? _d;
  String? _erreur;

  @override
  void initState() {
    super.initState();
    _charger();
  }

  Future<void> _charger() async {
    try {
      final d = await widget.charger();
      if (mounted) {
        setState(() {
          _d = d;
          _erreur = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(
            () => _erreur = messageErreurApi(e) ?? 'Chargement impossible.');
      }
    }
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
        onRefresh: _charger,
        child: ListView(padding: const EdgeInsets.all(14), children: [
          if (_erreur != null)
            BandeauInfo(
                icone: Icons.cloud_off_rounded,
                ton: TonPastille.rouge,
                texte: _erreur!)
          else if (_d == null)
            const Padding(
                padding: EdgeInsets.all(40),
                child: Center(child: CircularProgressIndicator()))
          else
            ...widget.contenu(context, _d as T, _charger),
        ]),
      );
}

Widget _section(String t) => Padding(
      padding: const EdgeInsets.fromLTRB(2, 16, 2, 8),
      child: Text(t,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
    );

// ══════════════════════════════════════════════════════════════
// DÉFIS
// ══════════════════════════════════════════════════════════════

IconData iconeDefi(String code) => switch (code) {
      'serie' => Icons.local_fire_department_rounded,
      'plats' => Icons.restaurant_rounded,
      'avis' => Icons.star_rounded,
      'retraits' => Icons.task_alt_rounded,
      _ => Icons.military_tech_rounded,
    };

class OngletDefis extends StatelessWidget {
  final JeuxService service;
  const OngletDefis({super.key, required this.service});

  @override
  Widget build(BuildContext context) => _Onglet<MesDefis>(
        charger: service.defis,
        contenu: (context, d, _) {
          final gris = _gris(context);
          final c = d.courante;
          return [
            if (c != null) ...[
              Container(
                key: const Key('defis-entete'),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    gradient: const LinearGradient(
                        colors: [Color(0xFF0F766E), Color(0xFF22A55A)])),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(c.mois.toUpperCase(),
                          style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 11,
                              fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(c.titre,
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 19,
                              fontWeight: FontWeight.w800)),
                      Text('${c.points} / ${c.pointsMax} points',
                          key: const Key('defis-points'),
                          style: const TextStyle(
                              color: Colors.white, fontSize: 13)),
                      const SizedBox(height: 10),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: LinearProgressIndicator(
                            value:
                                c.pointsMax == 0 ? 0 : c.points / c.pointsMax,
                            minHeight: 9,
                            color: Colors.white,
                            backgroundColor: Colors.white24),
                      ),
                    ]),
              ),
              if (c.palierObtenu != null || c.gain != null) ...[
                const SizedBox(height: 10),
                BandeauInfo(
                    icone: Icons.emoji_events_outlined,
                    ton: TonPastille.vert,
                    texte: 'Bilan : ${c.points} points'
                        '${c.palierObtenu != null ? ' · palier ${c.palierObtenu}' : ''}'
                        '${c.gain != null ? ' : ${c.gain!.libelle} (${etatGain(c.gain!)})' : ''}'),
              ],
              const SizedBox(height: 10),
              for (final x in c.defis) _CarteDefi(defi: x),
              _section('Paliers et récompenses'),
              for (final p in c.paliers)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: CartePresta(
                    bordure: p.atteint ? const Color(0xFFF59E0B) : null,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                    child: Row(children: [
                      Icon(Icons.military_tech_rounded,
                          color: p.atteint
                              ? const Color(0xFFF59E0B)
                              : const Color(0xFFCBD5E1),
                          size: 26),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${p.nom} · dès ${p.pointsMin} pts',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700)),
                              Text(p.recompense,
                                  style: TextStyle(color: gris, fontSize: 12)),
                            ]),
                      ),
                      if (p.atteint)
                        const Icon(Icons.check_circle_rounded,
                            color: _vert, size: 20),
                    ]),
                  ),
                ),
            ] else if (d.prochaine != null)
              BandeauInfo(
                  icone: Icons.event_rounded,
                  ton: TonPastille.bleu,
                  texte:
                      '${d.prochaine!.titre} commence en ${d.prochaine!.mois}.')
            else
              const EmptyState(
                  icon: Icons.military_tech_outlined,
                  title: 'Pas de défis en ce moment',
                  subtitle: 'Vous serez notifié au lancement des prochains.'),
            _section('Mes badges'),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final b in d.badges) _Badge(badge: b),
            ]),
            if (d.historique.isNotEmpty) ...[
              _section('Mois précédents'),
              for (final h in d.historique)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: CartePresta(
                    padding: const EdgeInsets.all(11),
                    child: Row(children: [
                      Expanded(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(h.titre,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700)),
                              Text(
                                  '${h.points} points${h.palierObtenu != null ? ' · palier ${h.palierObtenu}' : ''}',
                                  style: TextStyle(color: gris, fontSize: 12)),
                            ]),
                      ),
                      if (h.gain != null)
                        Flexible(
                          child: Text(
                              '${h.gain!.libelle}\n${etatGain(h.gain!)}',
                              textAlign: TextAlign.right,
                              style: const TextStyle(
                                  color: _vert,
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w600)),
                        ),
                    ]),
                  ),
                ),
            ],
          ];
        },
      );
}

class _CarteDefi extends StatelessWidget {
  final Defi defi;
  const _CarteDefi({required this.defi});

  @override
  Widget build(BuildContext context) {
    final d = defi;
    final gris = _gris(context);
    final perdu = d.code == 'retraits' && d.oublies > 0;
    final detail = d.reussi
        ? 'Réussi le ${d.reussiLe == null ? '' : quandJeu(d.reussiLe!)}'
        : d.code == 'retraits'
            ? '${d.retires}/${d.commandes} repas retirés${perdu ? ' · ${d.oublies} oublié(s) : défi perdu' : ' · validé à la fin du mois'}'
            : '${d.valeur} / ${d.objectif}${d.code == 'serie' ? ' · série en cours : ${d.serieCourante}' : ''}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: CartePresta(
        key: Key('defi-${d.code}'),
        bordure: d.reussi ? const Color(0xFFBFECCF) : null,
        padding: const EdgeInsets.all(12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
                color: d.reussi
                    ? const Color(0xFF22A55A)
                    : const Color(0xFFF5EFFE),
                borderRadius: BorderRadius.circular(12)),
            child: Icon(d.reussi ? Icons.check_rounded : iconeDefi(d.code),
                color: d.reussi ? Colors.white : violetJeu, size: 22),
          ),
          const SizedBox(width: 11),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(
                    child: Text(d.nom,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 14))),
                Text('+${d.points} pts',
                    style: const TextStyle(
                        color: violetJeu,
                        fontWeight: FontWeight.w700,
                        fontSize: 12)),
              ]),
              Text(d.description, style: TextStyle(color: gris, fontSize: 12)),
              const SizedBox(height: 7),
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(
                    value: d.reussi ? 1 : d.avancement,
                    minHeight: 6,
                    color: d.reussi ? const Color(0xFF22A55A) : violetJeu,
                    backgroundColor: const Color(0xFFEEF2F7)),
              ),
              const SizedBox(height: 4),
              Text(detail,
                  style: TextStyle(
                      color: perdu ? const Color(0xFFB42318) : gris,
                      fontSize: 11.5)),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  final BadgeJeu badge;
  const _Badge({required this.badge});

  @override
  Widget build(BuildContext context) {
    final ok = badge.nombre > 0;
    final icone = badge.code.startsWith('palier:')
        ? Icons.military_tech_rounded
        : iconeDefi(badge.code);
    return SizedBox(
      width: 100,
      child: CartePresta(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        child: Column(children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: ok
                  ? const LinearGradient(colors: [violetJeu, Color(0xFFF107A3)])
                  : null,
              color: ok ? null : const Color(0xFFE2EAF4),
            ),
            child: Icon(icone,
                color: ok ? Colors.white : const Color(0xFF9BB0C5), size: 22),
          ),
          const SizedBox(height: 5),
          Text(badge.nom,
              textAlign: TextAlign.center,
              maxLines: 2,
              style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  color: ok ? null : _gris(context))),
          Text(ok ? '×${badge.nombre}' : 'à débloquer',
              style: TextStyle(fontSize: 10.5, color: _gris(context))),
        ]),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// PRONOSTICS
// ══════════════════════════════════════════════════════════════

class OngletPronostics extends StatelessWidget {
  final JeuxService service;
  const OngletPronostics({super.key, required this.service});

  @override
  Widget build(BuildContext context) => _Onglet<List<Competition>>(
        charger: service.competitions,
        contenu: (context, liste, recharger) {
          if (liste.isEmpty) {
            return const [
              EmptyState(
                  icon: Icons.sports_soccer_outlined,
                  title: 'Aucune compétition pour le moment')
            ];
          }
          return [
            for (final c in liste)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: InkWell(
                  key: Key('competition-${c.id}'),
                  borderRadius: BorderRadius.circular(16),
                  onTap: () async {
                    await Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => CompetitionScreen(
                            id: c.id, titre: c.titre, service: service)));
                    recharger();
                  },
                  child: CartePresta(
                    padding: const EdgeInsets.all(12),
                    child: Row(children: [
                      const Icon(Icons.sports_soccer_rounded,
                          color: Color(0xFFD8901A), size: 30),
                      const SizedBox(width: 11),
                      Expanded(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(c.titre,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700)),
                              Text(
                                  '${c.nbMatchs} matchs${c.rang != null ? ' · ${c.rang == 1 ? '1er' : '${c.rang}e'}${c.provisoire ? ' (provisoire)' : ''} · ${c.points} pts' : ''}',
                                  style: TextStyle(
                                      color: _gris(context), fontSize: 12)),
                            ]),
                      ),
                      if (c.aPronostiquer > 0)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                              color: const Color(0xFFFEF4E4),
                              borderRadius: BorderRadius.circular(99)),
                          child: Text('${c.aPronostiquer} à faire',
                              style: const TextStyle(
                                  color: Color(0xFF9A6510),
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700)),
                        ),
                    ]),
                  ),
                ),
              ),
          ];
        },
      );
}

class CompetitionScreen extends StatefulWidget {
  final int id;
  final String titre;
  final JeuxService service;
  const CompetitionScreen(
      {super.key,
      required this.id,
      required this.titre,
      required this.service});

  @override
  State<CompetitionScreen> createState() => _CompetitionScreenState();
}

class _CompetitionScreenState extends State<CompetitionScreen> {
  Competition? _c;
  String? _erreur;
  final Map<int, (TextEditingController, TextEditingController)> _saisies = {};

  @override
  void initState() {
    super.initState();
    _charger();
  }

  @override
  void dispose() {
    for (final (a, b) in _saisies.values) {
      a.dispose();
      b.dispose();
    }
    super.dispose();
  }

  Future<void> _charger() async {
    try {
      final c = await widget.service.competition(widget.id);
      for (final m in c.matchs) {
        final s = _saisies.putIfAbsent(
            m.id, () => (TextEditingController(), TextEditingController()));
        s.$1.text = m.monA?.toString() ?? '';
        s.$2.text = m.monB?.toString() ?? '';
      }
      if (mounted) setState(() => _c = c);
    } catch (e) {
      if (mounted) {
        setState(
            () => _erreur = messageErreurApi(e) ?? 'Compétition introuvable.');
      }
    }
  }

  Future<void> _envoyer(MatchProno m) async {
    final s = _saisies[m.id]!;
    final a = int.tryParse(s.$1.text), b = int.tryParse(s.$2.text);
    if (a == null || b == null) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await widget.service.pronostiquer(m.id, a, b);
      messenger.showSnackBar(SnackBar(
          content:
              Text('Pronostic enregistré : ${m.equipeA} $a-$b ${m.equipeB}')));
      _charger();
    } catch (e) {
      messenger.showSnackBar(
          SnackBar(content: Text(messageErreurApi(e) ?? 'Pronostic refusé.')));
      _charger();
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = _c;
    final gris = _gris(context);
    return Scaffold(
      body: Column(children: [
        EnTeteMarine(
            titre: widget.titre,
            sousTitre: c == null
                ? null
                : 'Score exact : ${c.pointsExact} pts · bon résultat : ${c.pointsResultat} pt',
            actions: [
              IconButton(
                tooltip: 'Classement',
                icon:
                    const Icon(Icons.leaderboard_rounded, color: Colors.white),
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => _ClassementProno(
                        id: widget.id,
                        titre: widget.titre,
                        service: widget.service))),
              ),
            ]),
        Expanded(
          child: _erreur != null
              ? Padding(
                  padding: const EdgeInsets.all(14),
                  child: BandeauInfo(
                      icone: Icons.cloud_off_rounded,
                      ton: TonPastille.rouge,
                      texte: _erreur!))
              : c == null
                  ? const Center(child: CircularProgressIndicator())
                  : RefreshIndicator(
                      onRefresh: _charger,
                      child: ListView(
                          padding: const EdgeInsets.all(14),
                          children: [
                            if (c.rang != null)
                              BandeauInfo(
                                  icone: Icons.emoji_events_outlined,
                                  ton: c.resultat == 'gagne'
                                      ? TonPastille.vert
                                      : TonPastille.bleu,
                                  texte:
                                      'Vous êtes ${c.rang == 1 ? '1er' : '${c.rang}e'}${c.provisoire ? ' (provisoire)' : ''} avec ${c.points} points'
                                      '${c.gain != null ? '. Lot : ${c.gain!.libelle} — ${etatGain(c.gain!)}' : c.resultat == 'perdu' ? '. Perdu cette fois.' : '.'}'),
                            if (c.messageEligibilite != null) ...[
                              const SizedBox(height: 8),
                              BandeauInfo(
                                  icone: Icons.error_outline_rounded,
                                  ton: TonPastille.or,
                                  texte: c.messageEligibilite!),
                            ],
                            const SizedBox(height: 10),
                            for (final m in c.matchs)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: CartePresta(
                                  key: Key('match-${m.id}'),
                                  padding: const EdgeInsets.all(12),
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                            '${m.phase.isEmpty ? 'Match' : m.phase} · ${DateFormat("dd/MM 'à' HH:mm", 'fr_FR').format(m.coupEnvoi)}${m.annule ? ' · annulé' : ''}',
                                            style: TextStyle(
                                                color: gris, fontSize: 11.5)),
                                        const SizedBox(height: 8),
                                        Row(children: [
                                          Expanded(
                                              child: Text(m.equipeA,
                                                  style: const TextStyle(
                                                      fontWeight:
                                                          FontWeight.w700))),
                                          if (m.ouvert) ...[
                                            _ChampScore(
                                                key: Key('score-a-${m.id}'),
                                                ctrl: _saisies[m.id]!.$1,
                                                onFini: () => _envoyer(m)),
                                            const Padding(
                                                padding: EdgeInsets.symmetric(
                                                    horizontal: 6),
                                                child: Text('–')),
                                            _ChampScore(
                                                key: Key('score-b-${m.id}'),
                                                ctrl: _saisies[m.id]!.$2,
                                                onFini: () => _envoyer(m)),
                                          ] else
                                            Text(
                                                m.scoreA != null
                                                    ? '${m.scoreA} – ${m.scoreB}'
                                                    : 'en cours',
                                                style: const TextStyle(
                                                    fontSize: 17,
                                                    fontWeight:
                                                        FontWeight.w800)),
                                          Expanded(
                                              child: Text(m.equipeB,
                                                  textAlign: TextAlign.right,
                                                  style: const TextStyle(
                                                      fontWeight:
                                                          FontWeight.w700))),
                                        ]),
                                        const SizedBox(height: 6),
                                        Text(
                                            [
                                              if (m.monA != null)
                                                'Mon pronostic : ${m.monA}-${m.monB}${m.mesPoints != null ? ' · ${m.mesPoints! > 0 ? '+${m.mesPoints} pts' : '0 pt'}' : ''}'
                                              else if (m.ouvert)
                                                'Pronostiquez avant le coup d\'envoi'
                                              else
                                                'Pas de pronostic',
                                              if (m.tendance != null)
                                                'tendances : ${m.tendance}',
                                            ].join(' · '),
                                            style: TextStyle(
                                                color: (m.mesPoints ?? 0) > 0
                                                    ? _vert
                                                    : gris,
                                                fontSize: 11.5,
                                                fontWeight:
                                                    (m.mesPoints ?? 0) > 0
                                                        ? FontWeight.w600
                                                        : FontWeight.w400)),
                                      ]),
                                ),
                              ),
                          ]),
                    ),
        ),
      ]),
    );
  }
}

class _ChampScore extends StatelessWidget {
  final TextEditingController ctrl;
  final VoidCallback onFini;
  const _ChampScore({super.key, required this.ctrl, required this.onFini});

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 46,
        child: TextField(
          controller: ctrl,
          keyboardType: TextInputType.number,
          textAlign: TextAlign.center,
          maxLength: 2,
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
          decoration: const InputDecoration(
              counterText: '',
              isDense: true,
              contentPadding: EdgeInsets.symmetric(vertical: 8)),
          onSubmitted: (_) => onFini(),
          onEditingComplete: onFini,
        ),
      );
}

class _ClassementProno extends StatelessWidget {
  final int id;
  final String titre;
  final JeuxService service;
  const _ClassementProno(
      {required this.id, required this.titre, required this.service});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(children: [
          EnTeteMarine(titre: 'Classement', sousTitre: titre),
          Expanded(
            child: _Onglet<List<Map<String, dynamic>>>(
              charger: () => service.classementPronostics(id),
              contenu: (context, lignes, _) => [
                for (final l in lignes)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: CartePresta(
                      bordure: l['moi'] == true ? violetJeu : null,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 9),
                      child: Row(children: [
                        SizedBox(
                            width: 30,
                            child: Text('${l['rang']}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800))),
                        Expanded(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('${l['nom']}',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700)),
                                Text(
                                    l['lot'] != null
                                        ? '🏆 ${l['lot']}'
                                        : '${l['nb_exacts']} score(s) exact(s)',
                                    style: TextStyle(
                                        color: l['lot'] != null
                                            ? _vert
                                            : _gris(context),
                                        fontSize: 11.5)),
                              ]),
                        ),
                        Text('${l['points']} pts',
                            style:
                                const TextStyle(fontWeight: FontWeight.w800)),
                      ]),
                    ),
                  ),
              ],
            ),
          ),
        ]),
      );
}

// ══════════════════════════════════════════════════════════════
// TICKETS À GRATTER
// ══════════════════════════════════════════════════════════════

class OngletTickets extends StatelessWidget {
  final JeuxService service;
  const OngletTickets({super.key, required this.service});

  @override
  Widget build(BuildContext context) => _Onglet<MesTickets>(
        charger: service.tickets,
        contenu: (context, d, recharger) => [
          for (final c in d.campagnes)
            Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: BandeauInfo(
                    icone: Icons.confirmation_number_outlined,
                    ton: TonPastille.bleu,
                    texte: c)),
          _section('À gratter (${d.aGratter.length})'),
          if (d.aGratter.isEmpty)
            Text(
                'Aucun ticket à gratter. Retirez votre prochain repas pour en recevoir un !',
                style: TextStyle(color: _gris(context), fontSize: 12.5)),
          for (final t in d.aGratter)
            TicketAGratter(
                key: Key('ticket-${t.id}'), ticket: t, service: service),
          if (d.grattes.isNotEmpty) ...[
            _section('Déjà grattés'),
            for (final t in d.grattes)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: CartePresta(
                  padding: const EdgeInsets.all(11),
                  child: Row(children: [
                    Icon(
                        t.gagne == true
                            ? Icons.card_giftcard_rounded
                            : Icons.confirmation_number_outlined,
                        color:
                            t.gagne == true ? _vert : const Color(0xFF8E9CB0)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                                t.gagne == true
                                    ? t.gain?.libelle ?? 'Gagné'
                                    : 'Perdu',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700)),
                            Text(
                                '${t.campagne}${t.gratteLe != null ? ' · ${quandJeu(t.gratteLe!)}' : ''}',
                                style: TextStyle(
                                    color: _gris(context), fontSize: 11.5)),
                          ]),
                    ),
                    if (t.gain != null)
                      Flexible(
                          child: Text(etatGain(t.gain!),
                              textAlign: TextAlign.right,
                              style: const TextStyle(
                                  color: _vert,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600))),
                  ]),
                ),
              ),
          ],
        ],
      );
}

/// Ticket à gratter au doigt : le tirage est demandé au serveur au premier
/// geste ; le résultat se dévoile quand la moitié de la surface est grattée.
class TicketAGratter extends StatefulWidget {
  final TicketJeu ticket;
  final JeuxService service;
  const TicketAGratter(
      {super.key, required this.ticket, required this.service});

  @override
  State<TicketAGratter> createState() => _TicketAGratterState();
}

class _TicketAGratterState extends State<TicketAGratter> {
  final List<Offset> _traces = [];
  TicketJeu? _resultat;
  bool _demande = false;
  bool _devoile = false;
  static const _taille = Size(280, 140);
  static const _rayon = 20.0;

  Future<void> _tirer() async {
    if (_demande) return;
    _demande = true;
    try {
      final r = await widget.service.gratter(widget.ticket.id);
      if (mounted) setState(() => _resultat = r);
    } catch (e) {
      _demande = false;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(messageErreurApi(e) ?? 'Ticket indisponible.')));
      }
    }
  }

  void _gratter(Offset p) {
    setState(() => _traces.add(p));
    // Surface grattée estimée sur une grille
    if (!_devoile && _resultat != null) {
      const pas = 14.0;
      var total = 0, vides = 0;
      for (var x = pas / 2; x < _taille.width; x += pas) {
        for (var y = pas / 2; y < _taille.height; y += pas) {
          total++;
          if (_traces.any((t) => (t - Offset(x, y)).distance <= _rayon)) {
            vides++;
          }
        }
      }
      if (vides / total > 0.5) setState(() => _devoile = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = _resultat;
    final gagne = r?.gagne == true;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Center(
          child: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0xFFD8B4FE), width: 2)),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: SizedBox.fromSize(
                size: _taille,
                child: Stack(children: [
                  Positioned.fill(
                    child: Container(
                      key: const Key('ticket-dessous'),
                      decoration: BoxDecoration(
                          gradient: gagne
                              ? const LinearGradient(colors: [
                                  Color(0xFFFEF3C7),
                                  Color(0xFFFCE7F3)
                                ])
                              : null,
                          color: gagne ? null : const Color(0xFFF1F5F9)),
                      alignment: Alignment.center,
                      child: r == null
                          ? const Text('…')
                          : Column(mainAxisSize: MainAxisSize.min, children: [
                              Text(gagne ? '🎉' : '🙂',
                                  style: const TextStyle(fontSize: 30)),
                              Text(gagne ? 'Gagné !' : 'Perdu',
                                  style: TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w800,
                                      color: gagne ? _vert : null)),
                              if (gagne && r.gain != null)
                                Text(r.gain!.libelle,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(fontSize: 13)),
                            ]),
                    ),
                  ),
                  if (!_devoile)
                    Positioned.fill(
                      child: GestureDetector(
                        key: const Key('grattoir'),
                        onPanStart: (d) {
                          _tirer();
                          _gratter(d.localPosition);
                        },
                        onPanUpdate: (d) => _gratter(d.localPosition),
                        child: CustomPaint(painter: _Grattoir(_traces, _rayon)),
                      ),
                    ),
                ]),
              ),
            ),
          ),
        ),
        const SizedBox(height: 4),
        Center(
          child: Text(
              _devoile && gagne
                  ? etatGain(r!.gain!)
                  : '${widget.ticket.sourceLibelle} · à gratter avant le ${widget.ticket.expireLe == null ? '' : quandJeu(widget.ticket.expireLe!)}',
              style: TextStyle(color: _gris(context), fontSize: 11)),
        ),
      ]),
    );
  }
}

class _Grattoir extends CustomPainter {
  final List<Offset> traces;
  final double rayon;
  _Grattoir(this.traces, this.rayon);

  @override
  void paint(Canvas canvas, Size size) {
    canvas.saveLayer(Offset.zero & size, Paint());
    canvas.drawRect(
        Offset.zero & size,
        Paint()
          ..shader = const LinearGradient(colors: [
            Color(0xFFB8C2D1),
            Color(0xFFE4E9F0),
            Color(0xFFAEB8C8)
          ]).createShader(Offset.zero & size));
    final tp = TextPainter(
        text: const TextSpan(
            text: 'Grattez ici',
            style: TextStyle(
                color: Color(0xFF5A7090),
                fontWeight: FontWeight.w600,
                fontSize: 15)),
        textDirection: TextDirection.ltr)
      ..layout();
    tp.paint(canvas,
        Offset((size.width - tp.width) / 2, (size.height - tp.height) / 2));
    final gomme = Paint()..blendMode = BlendMode.clear;
    for (final t in traces) {
      canvas.drawCircle(t, rayon, gomme);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_Grattoir old) => true;
}

// ══════════════════════════════════════════════════════════════
// MES GAINS
// ══════════════════════════════════════════════════════════════

class OngletGains extends StatelessWidget {
  final JeuxService service;
  const OngletGains({super.key, required this.service});

  @override
  Widget build(BuildContext context) => _Onglet<List<Gain>>(
        charger: service.gains,
        contenu: (context, gains, _) => gains.isEmpty
            ? const [
                EmptyState(
                    icon: Icons.card_giftcard_outlined,
                    title: 'Pas encore de lot gagné',
                    subtitle: 'Participez aux jeux pour tenter votre chance !')
              ]
            : [
                for (final g in gains)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 7),
                    child: CartePresta(
                      padding: const EdgeInsets.all(12),
                      child: Row(children: [
                        Icon(
                            g.type == 'argent'
                                ? Icons.account_balance_wallet_outlined
                                : Icons.card_giftcard_rounded,
                            color: _vert,
                            size: 26),
                        const SizedBox(width: 11),
                        Expanded(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(g.libelle,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700)),
                                Text('${g.sourceLibelle} · ${g.jeu}',
                                    style: TextStyle(
                                        color: _gris(context), fontSize: 11.5)),
                                const SizedBox(height: 3),
                                Text(etatGain(g),
                                    key: Key('etat-gain-${g.jeu}'),
                                    style: TextStyle(
                                        color: g.statutLot == 'a_remettre'
                                            ? violetJeu
                                            : _vert,
                                        fontWeight: FontWeight.w600,
                                        fontSize: 12)),
                              ]),
                        ),
                        Icon(
                            g.retire
                                ? Icons.done_all_rounded
                                : g.statutLot == 'credite'
                                    ? Icons.check_rounded
                                    : Icons.volunteer_activism_outlined,
                            color: g.statutLot == 'a_remettre'
                                ? violetJeu
                                : _vert),
                      ]),
                    ),
                  ),
              ],
      );
}
