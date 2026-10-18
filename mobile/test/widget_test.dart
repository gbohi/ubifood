// Tests unitaires des modèles (remplace le test « compteur » du gabarit
// Flutter, qui référençait un package et une classe inexistants).

import 'package:flutter_test/flutter_test.dart';

import 'package:cantine_app/shared/models/models.dart';

void main() {
  test('StatutCommande : conversion depuis la valeur serveur', () {
    expect(
        StatutCommandeExt.fromString('en_attente'), StatutCommande.enAttente);
    expect(StatutCommandeExt.fromString('annulee'), StatutCommande.annulee);
    expect(StatutCommandeExt.fromString('retiree'), StatutCommande.retiree);
    expect(StatutCommande.enAttente.value, 'en_attente');
  });

  test('Commande : seule une commande en attente peut être annulée', () {
    final c = Commande.fromJson({'id': 1, 'statut': 'en_attente'});
    final a = Commande.fromJson({'id': 2, 'statut': 'annulee'});
    expect(c.peutAnnuler, isTrue);
    expect(a.peutAnnuler, isFalse);
  });
}
