// lib/features/jeux/lots_a_remettre_screen.dart
//
// Gestionnaires et administrateurs : lots objets gagnés aux jeux (quiz,
// défis, pronostics, tickets) à remettre aux employés de leurs agences.
// « Lot retiré » une seule fois : l'employé le voit dans son application,
// un second retrait est refusé par le serveur.

import 'package:flutter/material.dart';

import '../../core/api/api_client.dart' show messageErreurApi;
import '../../core/services/jeux_service.dart';
import '../../core/widgets/common_widgets.dart';
import '../../shared/models/autres_jeux_models.dart';
import '../../shared/theme/app_theme.dart';
import '../prestataire/prestataire_widgets.dart' show CartePresta;
import 'jeux_screen.dart' show quandJeu;

class LotsARemettreScreen extends StatefulWidget {
  final JeuxService? service;
  const LotsARemettreScreen({super.key, this.service});

  @override
  State<LotsARemettreScreen> createState() => _LotsARemettreScreenState();
}

class _LotsARemettreScreenState extends State<LotsARemettreScreen> {
  JeuxService get _service => widget.service ?? jeuxService;
  String _statut = 'a_remettre';
  List<LotARemettre>? _lignes;
  String? _erreur;
  String _filtre = '';

  @override
  void initState() {
    super.initState();
    _charger();
  }

  Future<void> _charger() async {
    try {
      final l = await _service.lotsARemettre(_statut);
      if (mounted) {
        setState(() {
          _lignes = l;
          _erreur = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _erreur = messageErreurApi(e) ?? 'Liste indisponible.');
      }
    }
  }

  Future<void> _remettre(LotARemettre l) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Lot retiré ?'),
        content: Text(
            'Confirmez que ${l.employe} (${l.matricule}) a retiré « ${l.lot} ». '
            'Vérifiez son badge : il ne pourra pas le retirer une seconde fois.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Annuler')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Confirmer')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await _service.remettreLot(l);
      messenger
          .showSnackBar(SnackBar(content: Text('Lot remis à ${l.employe}.')));
    } catch (e) {
      messenger.showSnackBar(
          SnackBar(content: Text(messageErreurApi(e) ?? 'Remise impossible.')));
    }
    _charger();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final f = _filtre.trim().toLowerCase();
    final lignes = (_lignes ?? [])
        .where((l) =>
            f.isEmpty ||
            '${l.employe} ${l.matricule} ${l.lot} ${l.jeu}'
                .toLowerCase()
                .contains(f))
        .toList();
    return Scaffold(
      body: Column(children: [
        EnTeteMarine(
          titre: 'Lots à remettre',
          sousTitre: 'Quiz, défis, pronostics et tickets à gratter',
          bas: SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'a_remettre', label: Text('À remettre')),
              ButtonSegment(value: 'remis', label: Text('Déjà retirés')),
            ],
            selected: {_statut},
            style: ButtonStyle(
              foregroundColor: WidgetStateProperty.resolveWith((s) =>
                  s.contains(WidgetState.selected)
                      ? AppColors.primary
                      : Colors.white),
              backgroundColor: WidgetStateProperty.resolveWith((s) =>
                  s.contains(WidgetState.selected)
                      ? Colors.white
                      : Colors.transparent),
            ),
            onSelectionChanged: (s) {
              setState(() {
                _statut = s.first;
                _lignes = null;
              });
              _charger();
            },
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _charger,
            child: ListView(padding: const EdgeInsets.all(14), children: [
              TextField(
                key: const Key('lots-recherche'),
                decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search_rounded),
                    hintText: 'Employé, matricule, lot…',
                    isDense: true),
                onChanged: (v) => setState(() => _filtre = v),
              ),
              const SizedBox(height: 10),
              if (_erreur != null)
                BandeauInfo(
                    icone: Icons.cloud_off_rounded,
                    ton: TonPastille.rouge,
                    texte: _erreur!)
              else if (_lignes == null)
                const Padding(
                    padding: EdgeInsets.all(40),
                    child: Center(child: CircularProgressIndicator()))
              else if (lignes.isEmpty)
                EmptyState(
                    icon: Icons.card_giftcard_outlined,
                    title: _statut == 'remis'
                        ? 'Aucun lot retiré'
                        : 'Aucun lot à remettre')
              else
                for (final l in lignes)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: CartePresta(
                      key: Key('lot-${l.genre}-${l.id}'),
                      padding: const EdgeInsets.all(12),
                      child: Row(children: [
                        const Icon(Icons.card_giftcard_rounded,
                            color: Color(0xFF1C8A4B), size: 28),
                        const SizedBox(width: 11),
                        Expanded(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(l.lot,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 14)),
                                Text(
                                    '${l.employe} · ${l.matricule}${l.agence.isEmpty ? '' : ' · ${l.agence}'}',
                                    style: const TextStyle(fontSize: 12.5)),
                                Text(
                                    '${l.source} · ${l.jeu}'
                                    '${_statut == 'remis' && l.remisLe != null ? '\nRetiré le ${quandJeu(l.remisLe!)}${l.remisPar != null ? ' par ${l.remisPar}' : ''}' : ''}',
                                    style:
                                        TextStyle(color: gris, fontSize: 11.5)),
                              ]),
                        ),
                        if (_statut == 'a_remettre')
                          FilledButton.tonal(
                            key: Key('remettre-${l.genre}-${l.id}'),
                            onPressed: () => _remettre(l),
                            child: const Text('Lot retiré'),
                          )
                        else
                          const Icon(Icons.done_all_rounded,
                              color: Color(0xFF1C8A4B)),
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
