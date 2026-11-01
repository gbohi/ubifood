// lib/core/services/notification_routage.dart
//
// Appui sur une notification push : écran à ouvrir d'après ses données FCM
// (chaînes : type, commande_id, menu_id, retrait_id, contestation_id,
// notif_id ; « action » ajoutée pour un bouton de notification locale).

/// Identifiant du bouton « Je n'ai pas retiré ce repas » (Android)
const actionContester = 'contester';

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
