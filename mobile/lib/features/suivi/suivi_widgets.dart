// lib/features/suivi/suivi_widgets.dart
//
// Suivi des repas :
//   - FriseSuivi : étapes du repas (accueil de l'employé, carte verte) ;
//   - SuiviServicesPresta : comptoir / accueil du prestataire, un bloc par
//     service du jour, bouton de l'étape suivante et signalement d'incident ;
//   - NotificationsSuiviScreen : notifications du suivi que l'employé reçoit.

import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../core/services/suivi_service.dart';
import '../../core/widgets/common_widgets.dart';
import '../../shared/models/suivi_models.dart';
import '../../shared/theme/app_theme.dart';
import '../prestataire/prestataire_widgets.dart';

const _icones = {
  'confirmee': Icons.check_rounded,
  'preparation': Icons.local_fire_department_outlined,
  'en_route': Icons.local_shipping_outlined,
  'arrive': Icons.storefront_outlined,
  'retire': Icons.volunteer_activism_outlined,
};

const _actions = {
  'preparation': 'Préparation',
  'en_route': 'Livraison partie',
  'arrive': 'Arrivé au comptoir',
};

// ══════════════════════════════════════════════════════════════
// FRISE
// ══════════════════════════════════════════════════════════════

class FriseSuivi extends StatelessWidget {
  final List<EtapeSuivi> etapes;

  /// Sur la carte verte (ou orange) de l'accueil : tout en blanc
  final bool surFondColore;
  final Color couleurFond;

  const FriseSuivi(
      {super.key,
      required this.etapes,
      this.surFondColore = false,
      this.couleurFond = const Color(0xFF15803D)});

  @override
  Widget build(BuildContext context) {
    if (etapes.isEmpty) return const SizedBox.shrink();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fait = surFondColore ? Colors.white : AppColors.accentDark;
    final vide = surFondColore
        ? Colors.white.withOpacity(0.28)
        : (isDark ? AppColors.darkBorder : AppColors.lightBorder);
    final texte = surFondColore
        ? Colors.white
        : (isDark ? AppColors.darkTextPrimary : AppColors.primary);
    final gris = surFondColore
        ? Colors.white.withOpacity(0.75)
        : (isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary);
    return Semantics(
      label: 'Suivi du repas : '
          '${etapes.where((e) => e.statut == StatutEtape.fait).map((e) => e.libelle).join(', ')}',
      child: LayoutBuilder(builder: (context, c) {
        final w = c.maxWidth / etapes.length;
        return Stack(children: [
          for (var i = 0; i < etapes.length - 1; i++)
            Positioned(
              top: 11,
              left: w * (i + 0.5) + 13,
              width: w - 26,
              child: Container(
                  height: 2,
                  color: etapes[i].statut == StatutEtape.fait ? fait : vide),
            ),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            for (final e in etapes)
              Expanded(
                child: Column(children: [
                  Container(
                    key: Key('etape-${e.code}-${e.statut.name}'),
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: e.statut == StatutEtape.aVenir
                          ? vide
                          : (surFondColore
                              ? Colors.white
                              : (e.statut == StatutEtape.fait
                                  ? fait
                                  : AppColors.primary)),
                      boxShadow: e.statut == StatutEtape.enCours
                          ? [
                              BoxShadow(
                                  color: (surFondColore
                                          ? Colors.white
                                          : AppColors.primary)
                                      .withOpacity(0.3),
                                  spreadRadius: 4)
                            ]
                          : null,
                    ),
                    child: Icon(
                        e.statut == StatutEtape.fait
                            ? Icons.check_rounded
                            : (_icones[e.code] ?? Icons.circle),
                        size: 13,
                        color: e.statut == StatutEtape.aVenir
                            ? gris
                            : (surFondColore ? couleurFond : Colors.white)),
                  ),
                  const SizedBox(height: 4),
                  Text(e.libelle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 9.5,
                          color: e.statut == StatutEtape.aVenir ? gris : texte,
                          fontWeight: e.statut == StatutEtape.enCours
                              ? FontWeight.w800
                              : FontWeight.w600)),
                  Text(e.heure ?? (e.prevu != null ? 'prévu ${e.prevu}' : ' '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 9, color: gris)),
                ]),
              ),
          ]),
        ]);
      }),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// PRESTATAIRE : SERVICES DU JOUR
// ══════════════════════════════════════════════════════════════

class SuiviServicesPresta extends StatefulWidget {
  /// Agence du comptoir (null : toutes)
  final int? agenceId;
  final SuiviService? service;
  const SuiviServicesPresta({super.key, this.agenceId, this.service});

  @override
  State<SuiviServicesPresta> createState() => _SuiviServicesPrestaState();
}

class _SuiviServicesPrestaState extends State<SuiviServicesPresta> {
  late final SuiviService _service = widget.service ?? SuiviService();
  List<SuiviRepas> _tous = const [];
  bool _incidentsActif = true;
  int? _envoi;

  @override
  void initState() {
    super.initState();
    _charger();
  }

  Future<void> _charger() async {
    try {
      final r = await _service.services();
      if (!mounted) return;
      setState(() {
        _tous = r.services;
        _incidentsActif = r.incidentsActif;
      });
    } catch (_) {
      // Bloc masqué si le suivi n'est pas disponible
    }
  }

  List<SuiviRepas> get _services => widget.agenceId == null
      ? _tous
      : _tous.where((s) => s.agenceId == widget.agenceId).toList();

  void _remplacer(SuiviRepas s) => setState(
      () => _tous = [for (final x in _tous) x.menuId == s.menuId ? s : x]);

  Future<void> _declarer(SuiviRepas s, String etape) async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _envoi = s.menuId);
    try {
      final (maj, nb) = await _service.declarer(s.menuId, etape);
      if (!mounted) return;
      _remplacer(maj);
      messenger.showSnackBar(SnackBar(
          content: Text('${_actions[etape]} : enregistré · '
              '${nb > 0 ? '$nb employé${nb > 1 ? 's' : ''} prévenu${nb > 1 ? 's' : ''}' : "visible dans l'application"}')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(
          content: Text(
              messageErreurApi(e) ?? "L'étape n'a pas pu être enregistrée.")));
      _charger();
    } finally {
      if (mounted) setState(() => _envoi = null);
    }
  }

  Future<void> _incident(SuiviRepas s) async {
    final messenger = ScaffoldMessenger.of(context);
    final res = await showModalBottomSheet<(String, String?, String)>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _FeuilleIncident(service: s),
    );
    if (res == null || !mounted) return;
    setState(() => _envoi = s.menuId);
    try {
      final (maj, nb) = await _service.incident(s.menuId,
          type: res.$1, heure: res.$2, message: res.$3);
      if (!mounted) return;
      _remplacer(maj);
      messenger.showSnackBar(SnackBar(
          content: Text(
              'Incident signalé · $nb employé${nb > 1 ? 's' : ''} et les gestionnaires prévenus')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(
          content: Text(
              messageErreurApi(e) ?? "L'incident n'a pas pu être signalé.")));
    } finally {
      if (mounted) setState(() => _envoi = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final services = _services;
    if (services.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Padding(
          padding: EdgeInsets.only(left: 2, bottom: 8),
          child: TitreCarte('Suivi des livraisons'),
        ),
        for (final s in services) ...[
          _BlocService(
            service: s,
            envoi: _envoi == s.menuId,
            incidentsActif: _incidentsActif,
            onEtape: (e) => _declarer(s, e),
            onIncident: () => _incident(s),
          ),
          const SizedBox(height: 10),
        ],
      ]),
    );
  }
}

class _BlocService extends StatelessWidget {
  final SuiviRepas service;
  final bool envoi;
  final bool incidentsActif;
  final ValueChanged<String> onEtape;
  final VoidCallback onIncident;
  const _BlocService(
      {required this.service,
      required this.envoi,
      required this.incidentsActif,
      required this.onEtape,
      required this.onIncident});

  @override
  Widget build(BuildContext context) {
    final s = service;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gris =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final etapes = s.etapes.where((e) => _actions.containsKey(e.code)).toList();
    final ton = switch (s.statut) {
      'arrive' || 'retire' => TonPastille.vert,
      'retard' => TonPastille.or,
      'en_route' => TonPastille.bleu,
      _ => TonPastille.gris,
    };
    return CartePresta(
      key: Key('service-suivi-${s.menuId}'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(
                  '${s.agence}${s.equipe != null ? ' · équipe ${s.equipe}' : ''}',
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 14)),
              Text(
                  '${s.nbRepas} repas · retrait ${s.heureDebut} – ${s.heureFin}'
                  '${s.retraitLendemain ? ' (lendemain)' : ''} · ${s.nbRetires} retirés',
                  style: TextStyle(fontSize: 11.5, color: gris)),
            ]),
          ),
          PastilleStatut(label: s.statutLibelle, ton: ton),
        ]),
        const SizedBox(height: 10),
        for (final e in etapes) ...[
          if (e.statut == StatutEtape.fait)
            _TuileFaite(etape: e, libelle: _actions[e.code]!)
          else if (s.prochaineAction == e.code)
            SizedBox(
              height: 52,
              child: FilledButton.icon(
                key: Key('suivi-${e.code}-${s.menuId}'),
                style: FilledButton.styleFrom(
                    backgroundColor: AppColors.accentDark,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12))),
                onPressed: envoi ? null : () => onEtape(e.code),
                icon: Icon(_icones[e.code], size: 20),
                label: Text(
                    '${_actions[e.code]} · prévient ${s.aServir} employé${s.aServir > 1 ? 's' : ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ),
            )
          else
            OutlinedButton.icon(
              key: Key('suivi-${e.code}-${s.menuId}'),
              onPressed: envoi ? null : () => onEtape(e.code),
              icon: Icon(_icones[e.code], size: 18),
              label: Text(
                  '${_actions[e.code]}${e.prevu != null ? ' · prévu ${e.prevu}' : ''}'),
            ),
          const SizedBox(height: 6),
        ],
        if (incidentsActif && s.statut != 'arrive' && s.statut != 'retire')
          OutlinedButton.icon(
            key: Key('suivi-incident-${s.menuId}'),
            style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFF9A6510)),
            onPressed: envoi ? null : onIncident,
            icon: const Icon(Icons.report_problem_outlined, size: 18),
            label: const Text('Signaler un incident'),
          ),
        if (s.incident case final i?) ...[
          const SizedBox(height: 6),
          BandeauInfo(
            icone: Icons.report_problem_outlined,
            ton: TonPastille.or,
            texte: '${i.typeLibelle} signalé à ${i.heure ?? ''}'
                '${i.heurePrevue != null ? ' · arrivée prévue vers ${i.heurePrevue}' : ''}'
                '${i.message.isNotEmpty ? ' · ${i.message}' : ''}',
          ),
        ],
      ]),
    );
  }
}

class _TuileFaite extends StatelessWidget {
  final EtapeSuivi etape;
  final String libelle;
  const _TuileFaite({required this.etape, required this.libelle});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: isDark
            ? AppColors.accent.withOpacity(0.12)
            : const Color(0xFFF0FBF4),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFBFECCF)),
      ),
      child: Row(children: [
        const Icon(Icons.check_circle_rounded,
            color: AppColors.accentDark, size: 20),
        const SizedBox(width: 8),
        Expanded(
          child: Text(libelle,
              style:
                  const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
        ),
        Text(
            [
              if (etape.heure != null) etape.heure!,
              if (etape.auto) 'auto' else if (etape.par != null) etape.par!,
            ].join(' · '),
            style: const TextStyle(fontSize: 11.5)),
      ]),
    );
  }
}

class _FeuilleIncident extends StatefulWidget {
  final SuiviRepas service;
  const _FeuilleIncident({required this.service});

  @override
  State<_FeuilleIncident> createState() => _FeuilleIncidentState();
}

class _FeuilleIncidentState extends State<_FeuilleIncident> {
  String _type = 'retard';
  late TimeOfDay _heure;
  final _message = TextEditingController();

  @override
  void initState() {
    super.initState();
    final p = widget.service.heureDebut.split(':');
    final minutes = (int.tryParse(p.first) ?? 12) * 60 +
        (p.length > 1 ? int.tryParse(p[1]) ?? 0 : 0) +
        30;
    _heure = TimeOfDay(hour: (minutes ~/ 60) % 24, minute: minutes % 60);
  }

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  String get _heureTxt =>
      '${_heure.hour.toString().padLeft(2, '0')}:${_heure.minute.toString().padLeft(2, '0')}';

  bool get _valide => _type == 'retard' || _message.text.trim().isNotEmpty;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
          18, 16, 18, MediaQuery.of(context).viewInsets.bottom + 18),
      child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Signaler un incident · ${widget.service.agence}',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            RadioListTile<String>(
              key: const Key('incident-retard'),
              value: 'retard',
              groupValue: _type,
              onChanged: (v) => setState(() => _type = v!),
              title: const Text('Retard'),
              subtitle: Text("Nouvelle heure d'arrivée : $_heureTxt"),
              secondary: TextButton(
                onPressed: () async {
                  final h = await showTimePicker(
                      context: context, initialTime: _heure);
                  if (h != null) {
                    setState(() {
                      _heure = h;
                      _type = 'retard';
                    });
                  }
                },
                child: const Text('Changer'),
              ),
            ),
            RadioListTile<String>(
              key: const Key('incident-autre'),
              value: 'autre',
              groupValue: _type,
              onChanged: (v) => setState(() => _type = v!),
              title: const Text('Autre'),
              subtitle: const Text(
                  'Message libre (repas renversé, portions manquantes…)'),
            ),
            const SizedBox(height: 8),
            TextField(
              key: const Key('incident-message'),
              controller: _message,
              maxLength: 300,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                  labelText: _type == 'retard'
                      ? 'Message aux employés (facultatif)'
                      : 'Message aux employés',
                  hintText: 'Embouteillage sur le pont.'),
            ),
            Text(
                '${widget.service.aServir} employés et les gestionnaires de ${widget.service.agence} seront prévenus.',
                style: const TextStyle(fontSize: 12)),
            const SizedBox(height: 12),
            FilledButton(
              key: const Key('incident-envoyer'),
              onPressed: _valide
                  ? () => Navigator.pop(context, (
                        _type,
                        _type == 'retard' ? _heureTxt : null,
                        _message.text.trim()
                      ))
                  : null,
              child: const Text('Envoyer'),
            ),
          ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// EMPLOYÉ : NOTIFICATIONS DU SUIVI
// ══════════════════════════════════════════════════════════════

class NotificationsSuiviScreen extends StatefulWidget {
  final SuiviService? service;
  const NotificationsSuiviScreen({super.key, this.service});

  @override
  State<NotificationsSuiviScreen> createState() =>
      _NotificationsSuiviScreenState();
}

class _NotificationsSuiviScreenState extends State<NotificationsSuiviScreen> {
  late final SuiviService _service = widget.service ?? SuiviService();
  PreferencesSuivi? _prefs;
  String? _erreur;

  @override
  void initState() {
    super.initState();
    _charger();
  }

  Future<void> _charger() async {
    try {
      final p = await _service.preferences();
      if (mounted) setState(() => _prefs = p);
    } catch (e) {
      if (mounted) {
        setState(
            () => _erreur = messageErreurApi(e) ?? 'Chargement impossible.');
      }
    }
  }

  Future<void> _changer(String code, bool actif) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final p = await _service.modifierPreference(code, actif);
      if (mounted) setState(() => _prefs = p);
    } catch (e) {
      messenger.showSnackBar(SnackBar(
          content: Text(messageErreurApi(e) ??
              "La préférence n'a pas pu être enregistrée.")));
    }
  }

  static const _textes = {
    'preparation': (
      'En préparation',
      'Votre repas est en préparation',
      Icons.local_fire_department_outlined
    ),
    'en_route': (
      "En route vers l'agence",
      'Le repas est parti vers votre agence',
      Icons.local_shipping_outlined
    ),
    'rappel': ('Rappel avant la fin du retrait', '', Icons.alarm_rounded),
    'incidents': (
      'Retards et incidents',
      'Signalés par le prestataire',
      Icons.report_problem_outlined
    ),
  };

  @override
  Widget build(BuildContext context) {
    final p = _prefs;
    return Scaffold(
      body: Column(children: [
        const EnTeteMarine(
            titre: 'Notifications du suivi',
            sousTitre: 'Choisissez ce que vous recevez sur votre téléphone'),
        Expanded(
          child: ListView(padding: const EdgeInsets.all(14), children: [
            if (_erreur != null)
              BandeauInfo(
                  icone: Icons.cloud_off_rounded,
                  ton: TonPastille.rouge,
                  texte: _erreur!)
            else if (p == null)
              const Center(
                  child: Padding(
                      padding: EdgeInsets.all(30),
                      child: CircularProgressIndicator()))
            else ...[
              if (!p.modifiable) ...[
                const BandeauInfo(
                    icone: Icons.lock_outline_rounded,
                    ton: TonPastille.gris,
                    texte:
                        'Les notifications du suivi sont réglées par UbiPharm.'),
                const SizedBox(height: 10),
              ],
              CartePresta(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                child: Column(children: [
                  for (final pr in p.preferences.where(
                      (x) => x.code != 'rappel' && x.code != 'incidents'))
                    _ligne(
                        pr.code,
                        pr.disponible
                            ? 'Notification sur le téléphone'
                            : "Visible dans l'application",
                        pr.disponible && pr.actif,
                        pr.disponible && p.modifiable),
                  if (p.arriveActif)
                    const SwitchListTile.adaptive(
                      key: Key('pref-arrive'),
                      value: true,
                      onChanged: null,
                      secondary: Icon(Icons.storefront_outlined,
                          color: AppColors.accentDark),
                      title: Text('Repas arrivé',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text('Toujours envoyée'),
                    ),
                  for (final pr in p.preferences.where((x) =>
                      (x.code == 'rappel' || x.code == 'incidents') &&
                      x.disponible))
                    _ligne(
                        pr.code,
                        pr.code == 'rappel'
                            ? '${p.rappelMinutes} min avant'
                            : _textes[pr.code]!.$2,
                        pr.actif,
                        p.modifiable),
                ]),
              ),
              const SizedBox(height: 10),
              const Text(
                  "Interrupteur coupé : l'étape reste visible sur la carte « Mon repas du jour », sans notification.",
                  style: TextStyle(fontSize: 11.5)),
            ],
          ]),
        ),
      ]),
    );
  }

  Widget _ligne(String code, String sousTitre, bool valeur, bool actif) {
    final t = _textes[code]!;
    return SwitchListTile.adaptive(
      key: Key('pref-$code'),
      value: valeur,
      activeColor: AppColors.accent,
      onChanged: actif ? (v) => _changer(code, v) : null,
      secondary: Icon(t.$3, color: AppColors.primaryLight),
      title: Text(t.$1, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(sousTitre),
    );
  }
}
