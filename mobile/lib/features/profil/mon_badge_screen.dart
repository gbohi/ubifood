// lib/features/profil/mon_badge_screen.dart
//
// Profil › Mon badge d'accès : badge des portes enregistré pour le comptoir
// (numéro masqué, 4 derniers chiffres) et « Déclarer mon badge perdu », qui le
// bloque aussitôt pour les repas. API : GET badge/, POST badge/perdu/.

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/widgets/common_widgets.dart';
import '../../shared/theme/app_theme.dart';
import '../prestataire/prestataire_widgets.dart' show CartePresta;

class BadgeAcces {
  final int id;
  final String masque;
  final String statut;
  final DateTime? associeLe;
  final DateTime? finLe;

  const BadgeAcces(
      {required this.id,
      required this.masque,
      required this.statut,
      this.associeLe,
      this.finLe});

  factory BadgeAcces.fromJson(Map<String, dynamic> j) => BadgeAcces(
        id: (j['id'] as num?)?.toInt() ?? 0,
        masque: '${j['masque'] ?? ''}',
        statut: '${j['statut'] ?? ''}',
        associeLe: DateTime.tryParse('${j['associe_le'] ?? ''}')?.toLocal(),
        finLe: DateTime.tryParse('${j['fin_le'] ?? ''}')?.toLocal(),
      );
}

/// Badge actif et dernier badge déclaré perdu
class MonBadge {
  final BadgeAcces? badge;
  final BadgeAcces? perdu;
  const MonBadge({this.badge, this.perdu});

  factory MonBadge.fromJson(dynamic data) {
    final j = data is Map ? Map<String, dynamic>.from(data) : const {};
    BadgeAcces? lire(dynamic v) =>
        v is Map ? BadgeAcces.fromJson(Map<String, dynamic>.from(v)) : null;
    return MonBadge(badge: lire(j['badge']), perdu: lire(j['perdu']));
  }
}

class BadgeService {
  Future<MonBadge> monBadge() async =>
      MonBadge.fromJson((await apiClient.get('/badge/')).data);

  Future<MonBadge> declarerPerdu() async =>
      MonBadge.fromJson((await apiClient.post('/badge/perdu/')).data);
}

class MonBadgeScreen extends StatefulWidget {
  final BadgeService? service;
  const MonBadgeScreen({super.key, this.service});

  @override
  State<MonBadgeScreen> createState() => _MonBadgeScreenState();
}

class _MonBadgeScreenState extends State<MonBadgeScreen> {
  late final BadgeService _service = widget.service ?? BadgeService();
  MonBadge? _donnees;
  String? _erreur;
  bool _envoi = false;

  @override
  void initState() {
    super.initState();
    _charger();
  }

  Future<void> _charger() async {
    setState(() => _erreur = null);
    try {
      final d = await _service.monBadge();
      if (mounted) setState(() => _donnees = d);
    } catch (e) {
      if (mounted) {
        setState(() => _erreur =
            messageErreurApi(e) ?? "Votre badge n'a pas pu être chargé.");
      }
    }
  }

  Future<void> _declarerPerdu() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dCtx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Déclarer votre badge perdu ?'),
        content: const Text(
            'Il sera aussitôt refusé au comptoir de la cantine. En attendant le '
            'nouveau badge, présentez votre QR code (Profil › Mon badge QR).'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dCtx, false),
              child: const Text('Annuler')),
          ElevatedButton(
              key: const Key('confirmer-badge-perdu'),
              style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.error,
                  foregroundColor: Colors.white),
              onPressed: () => Navigator.pop(dCtx, true),
              child: const Text('Déclarer perdu')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _envoi = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final d = await _service.declarerPerdu();
      if (!mounted) return;
      setState(() {
        _donnees = d;
        _envoi = false;
      });
      messenger.showSnackBar(const SnackBar(
          content: Text('Badge déclaré perdu : bloqué pour les repas.')));
    } catch (e) {
      if (!mounted) return;
      setState(() => _envoi = false);
      messenger.showSnackBar(SnackBar(
          backgroundColor: AppColors.error,
          content: Text(messageErreurApi(e) ?? 'Déclaration impossible.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final date = DateFormat('dd/MM/yyyy', 'fr_FR');
    final d = _donnees;
    Widget corps;
    if (_erreur != null) {
      corps = ListView(padding: const EdgeInsets.all(14), children: [
        BandeauInfo(
            icone: Icons.cloud_off_rounded,
            ton: TonPastille.rouge,
            texte: _erreur!,
            action: TextButton(
                onPressed: _charger, child: const Text('Réessayer'))),
      ]);
    } else if (d == null) {
      corps = const Center(child: CircularProgressIndicator());
    } else {
      final b = d.badge;
      corps = ListView(padding: const EdgeInsets.all(14), children: [
        CartePresta(
          child: Row(children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: b != null
                    ? AppColors.accent.withOpacity(0.18)
                    : (d.perdu != null
                        ? AppColors.error.withOpacity(0.12)
                        : gris.withOpacity(0.12)),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                  b != null
                      ? Icons.badge_outlined
                      : (d.perdu != null
                          ? Icons.block_rounded
                          : Icons.credit_card_off_outlined),
                  color: b != null
                      ? AppColors.success
                      : (d.perdu != null ? AppColors.error : gris)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                        b != null
                            ? 'Badge actif'
                            : (d.perdu != null
                                ? 'Badge déclaré perdu'
                                : 'Aucun badge enregistré'),
                        key: const Key('mon-badge-etat'),
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 15)),
                    const SizedBox(height: 2),
                    Text(
                        b != null
                            ? 'N° ${b.masque}${b.associeLe != null ? ' · depuis le ${date.format(b.associeLe!)}' : ''}'
                            : (d.perdu != null
                                ? 'N° ${d.perdu!.masque}${d.perdu!.finLe != null ? ' · le ${date.format(d.perdu!.finLe!)}' : ''} · refusé au comptoir'
                                : 'Votre gestionnaire peut associer votre badge des portes'),
                        style: TextStyle(color: gris, fontSize: 12.5)),
                  ]),
            ),
          ]),
        ),
        const SizedBox(height: 12),
        Text(
            b != null
                ? "Au comptoir, posez votre badge d'accès sur le lecteur : votre repas s'affiche tout seul."
                : 'Au comptoir, présentez votre QR code (Profil › Mon badge QR) ou donnez votre matricule.',
            style: TextStyle(color: gris, fontSize: 12.5)),
        if (b != null) ...[
          const SizedBox(height: 18),
          OutlinedButton.icon(
            key: const Key('declarer-badge-perdu'),
            style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.error,
                side: const BorderSide(color: AppColors.error),
                minimumSize: const Size.fromHeight(48)),
            onPressed: _envoi ? null : _declarerPerdu,
            icon: const Icon(Icons.block_rounded),
            label: const Text('Déclarer mon badge perdu'),
          ),
          const SizedBox(height: 8),
          Text(
              'Le badge est bloqué tout de suite pour les repas. En attendant le nouveau : QR code du profil.',
              textAlign: TextAlign.center,
              style: TextStyle(color: gris, fontSize: 11.5)),
        ],
        if (b == null && d.perdu != null) ...[
          const SizedBox(height: 12),
          Text('Badge retrouvé ? Votre gestionnaire peut le réactiver.',
              style: TextStyle(color: gris, fontSize: 12.5)),
        ],
      ]);
    }
    return Scaffold(
      body: Column(children: [
        const EnTeteMarine(
            titre: "Mon badge d'accès",
            sousTitre: 'Le badge des portes, utilisé au comptoir'),
        Expanded(child: corps),
      ]),
    );
  }
}
