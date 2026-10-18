import 'package:cantine_app/core/api/api_client.dart';
import 'package:cantine_app/core/services/cantine_service.dart';
import 'package:cantine_app/shared/models/models.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

DioException _erreur(dynamic data, {int status = 400}) {
  final options = RequestOptions(path: '/commandes/');
  return DioException(
    requestOptions: options,
    response: Response(requestOptions: options, statusCode: status, data: data),
  );
}

void main() {
  group('messageErreurApi', () {
    test('lit les formats d\'erreur de Django REST Framework', () {
      expect(messageErreurApi(_erreur({'detail': 'Non autorisé'})),
          'Non autorisé');
      expect(messageErreurApi(_erreur({'error': 'Code incorrect.'})),
          'Code incorrect.');
      expect(
        messageErreurApi(_erreur({
          'non_field_errors': ['Délai de 48h dépassé']
        })),
        'Délai de 48h dépassé',
      );
      expect(
        messageErreurApi(
            _erreur(['Vous avez déjà une commande pour le 10/10/2026.'])),
        'Vous avez déjà une commande pour le 10/10/2026.',
      );
      expect(
          messageErreurApi(_erreur({
            'plat_id': ['Plat invalide']
          })),
          'Plat invalide');
    });

    test('renvoie null hors erreur HTTP', () {
      expect(messageErreurApi(Exception('x')), isNull);
      expect(messageErreurApi(_erreur(null)), isNull);
    });
  });

  group('AuthUser', () {
    Map<String, dynamic> json(List<String> roles) => {
          'id': 1,
          'username': 'emp1',
          'groups': [7],
          'roles': roles,
          'derniere_agence': {'agence': 3, 'agence_nom': 'Siège'},
        };

    test('les rôles viennent des noms de groupe', () {
      expect(AuthUser.fromJson(json(['employe'])).isGestionnaire, isFalse);
      expect(AuthUser.fromJson(json(['gestionnaire'])).isGestionnaire, isTrue);
      expect(AuthUser.fromJson(json(['admin'])).isGestionnaire, isTrue);
      expect(AuthUser.fromJson(json(['admin'])).isAdmin, isTrue);
    });

    test('agence de l\'agent', () {
      final user = AuthUser.fromJson(json(['employe']));
      expect(user.derniereAgenceId, 3);
      expect(user.derniereAgence, 'Siège');
    });
  });

  group('LigneFacturation', () {
    test('montant figé, provisoire ou sans tarif', () {
      final figee = LigneFacturation.fromJson({
        'commande_id': 1,
        'date_menu': '2026-08-20',
        'montant': 1500,
        'source': 'facture'
      });
      expect(figee.montant, 1500.0);
      expect(figee.cloturee, isTrue);

      final sansTarif = LigneFacturation.fromJson({
        'commande_id': 2,
        'date_menu': '2026-09-02',
        'montant': null,
        'source': 'calcul'
      });
      expect(sansTarif.montant, isNull);
      expect(sansTarif.cloturee, isFalse);
    });
  });

  group('Avis', () {
    test('lit l\'avis d\'une commande et le résumé d\'un plat', () {
      final sans = Commande.fromJson({'id': 1, 'statut': 'retiree', 'avis': null});
      expect(sans.avis, isNull);
      expect(sans.peutNoter, isTrue);

      final avec = Commande.fromJson({
        'id': 2,
        'statut': 'retiree',
        'avis': {'id': 7, 'note': 4, 'commentaire': 'Très bon'}
      });
      expect(avec.avis?.note, 4);
      expect(avec.avis?.commentaire, 'Très bon');
      expect(sans.copyWithAvis(avec.avis).avis?.id, 7);

      final r = ResumeAvisPlat.fromJson({
        'note_moyenne': 4.2,
        'nb_avis': 12,
        'derniers': [
          {'note': 5, 'commentaire': 'Top', 'auteur': 'Fatou K.', 'date': '2026-10-01'}
        ]
      });
      expect(r.noteMoyenne, 4.2);
      expect(r.nbAvis, 12);
      expect(r.derniers.single.auteur, 'Fatou K.');
      expect(ResumeAvisPlat.fromJson({'note_moyenne': null, 'nb_avis': 0})
          .noteMoyenne, isNull);
    });
  });
}
