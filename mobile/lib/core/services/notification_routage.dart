// lib/core/services/notification_routage.dart
//
// Appui sur une notification push : écran à ouvrir d'après ses données FCM
// (chaînes : type, commande_id, menu_id, retrait_id, contestation_id,
// notif_id ; « action » ajoutée pour un bouton de notification locale).
//
// « Retrait validé » arrive en message « data seulement » (titre et texte
// dans les données : titre, message) : sur Android, l'application affiche
// elle-même la notification, avec le bouton « Je n'ai pas retiré ce repas »,
// même en arrière-plan ou fermée. Sur iOS, le serveur envoie une alerte
// APNs de catégorie RETRAIT_VALIDE (bouton déclaré par l'application).
//
// « Contestation traitée » : statut (acceptee / rejetee) et cause
// (erreur_comptoir / badge_tiers) dans les données ; à défaut (anciennes
// notifications), déduits du titre.

/// Identifiant du bouton « Je n'ai pas retiré ce repas »
const actionContester = 'contester';

/// Catégorie iOS (alerte APNs envoyée par le serveur) portant ce bouton
const categorieRetraitValide = 'RETRAIT_VALIDE';

/// Commande dont il faut ouvrir le détail du retrait (« Retrait validé »
/// → contestation possible ; décision sur une contestation → suivi),
/// null : écran des notifications.
int? commandeRetraitAOuvrir(Map<String, dynamic> data) {
  final type = data['type']?.toString() ?? '';
  if (type != 'retrait_valide' && type != 'contestation_decidee') return null;
  final id = int.tryParse(data['commande_id']?.toString() ?? '');
  return id != null && id > 0 ? id : null;
}

/// Le bouton « Je n'ai pas retiré ce repas » a été touché : le formulaire
/// s'ouvre directement.
bool ouvrirFormulaireContestation(Map<String, dynamic> data) =>
    data['action']?.toString() == actionContester &&
    data['type']?.toString() == 'retrait_valide';

/// La notification « Retrait validé » propose le bouton de contestation
bool proposerActionContester(Map<String, dynamic> data) =>
    data['type']?.toString() == 'retrait_valide' &&
    commandeRetraitAOuvrir(data) != null;

/// Titre et texte à afficher : ceux du bloc notification FCM, sinon ceux
/// des données (message « data seulement »). null : rien à afficher.
({String titre, String message})? contenuNotification(Map<String, dynamic> data,
    {String? titre, String? message}) {
  final t = (titre ?? '').isNotEmpty ? titre! : data['titre']?.toString() ?? '';
  final m =
      (message ?? '').isNotEmpty ? message! : data['message']?.toString() ?? '';
  if (t.isEmpty && m.isEmpty) return null;
  return (titre: t, message: m);
}

/// Message « data seulement » que l'application doit afficher elle-même
/// (gestionnaire d'arrière-plan Android) : il n'a pas de bloc notification.
bool aAfficherParLApplication(Map<String, dynamic> data,
        {required bool aUnBlocNotification}) =>
    !aUnBlocNotification &&
    data['type']?.toString() == 'retrait_valide' &&
    contenuNotification(data) != null;

/// Décision sur une contestation : statut (acceptee / rejetee) et cause
/// (erreur_comptoir / badge_tiers, null si inconnue). Données envoyées par
/// le serveur, sinon déduites du titre (anciennes notifications).
({String? statut, String? cause}) decisionContestation(
    Map<String, dynamic> donnees,
    [String titre = '']) {
  String? valeur(String cle) {
    final v = donnees[cle]?.toString() ?? '';
    return v.isEmpty ? null : v;
  }

  var statut = valeur('statut');
  var cause = valeur('cause');
  final t = titre.toLowerCase();
  if (statut != 'acceptee' && statut != 'rejetee') {
    statut = t.contains('accept')
        ? 'acceptee'
        : t.contains('rejet')
            ? 'rejetee'
            : null;
  }
  if (cause == null && statut == 'acceptee') {
    if (t.contains('repas dû') || t.contains('tiers')) {
      cause = 'badge_tiers';
    } else if (t.contains('non facturé')) {
      cause = 'erreur_comptoir';
    }
  }
  return (statut: statut, cause: statut == 'acceptee' ? cause : null);
}

/// Libellé court de la décision (« Acceptée — repas non facturé »…)
String libelleDecisionContestation(String? statut, String? cause) {
  switch (statut) {
    case 'acceptee':
      return switch (cause) {
        'erreur_comptoir' => 'Acceptée — repas non facturé',
        'badge_tiers' => 'Acceptée — badge utilisé par un tiers, repas dû',
        _ => 'Acceptée',
      };
    case 'rejetee':
      return 'Rejetée';
    default:
      return "En cours d'examen";
  }
}
