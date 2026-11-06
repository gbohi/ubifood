"""
Tests du compte repas prépayé et de la caisse (api/comptes_repas.py, api/caisse.py).

Tous les montants sont vérifiés au franc près : un repas est payé une seule
fois (compte à la commande, retenue à la clôture ; caisse : historique) et
consommé = compte + retenue (+ caisse des anciennes régularisations).

Lancer : python manage.py test api
"""

import threading
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.db import IntegrityError, connection, transaction
from django.test import TransactionTestCase, override_settings
from django.utils import timezone

from . import comptes_repas as cr
from . import facturation as fact
from .models import (
    Agence, AgencePrestataire, Categoriesalarie, ClotureCaisse, Commande, CompteRepas, FactureMensuelle,
    LigneFacture, Menu, MenuPlat, MouvementCompte, Plat, PlatCategoriesalarie, PlatPrestataire, Prestataire,
    Recu, RecuLigne, ReglementRepas, Retrait, Statut, TypeEquipe, TypePlat, User, UserAgence, UserCategoriesalarie,
)
from .tests import API, _EspacePrestataireBase

D = Decimal


class _CaisseBase(_EspacePrestataireBase):
    """
    Tarif employé : 1 000 F le repas (catégorie Agent) pour emp1 et emp2.
    Comptes : caissier (aussi employé), comptabilité (×2, dont une aussi caissière).
    Menus au Siège (prestataire A, 900 F) : aujourd'hui et le mois précédent (ouvert).
    """

    def setUp(self):
        super().setUp()
        for nom in ('caissier', 'comptabilite'):
            self.groupes[nom] = Group.objects.get(name=nom)   # créés par la migration
        self.caissier = self.creer_user('caisse1', 'employe')
        self.caissier.groups.add(self.groupes['caissier'])
        self.caissier2 = self.creer_user('caisse2', 'employe')
        self.caissier2.groups.add(self.groupes['caissier'])
        self.compta = self.creer_user('compta1', 'employe')
        self.compta.groups.set([self.groupes['comptabilite']])
        self.compta_caisse = self.creer_user('compta2', 'employe')
        self.compta_caisse.groups.set([self.groupes['comptabilite'], self.groupes['caissier']])
        debut = timezone.now() - timedelta(days=800)
        self.cat = Categoriesalarie.objects.create(libelle='Agent')
        self.tarif = PlatCategoriesalarie.objects.create(categoriesalarie=self.cat, montant=D('1000'),
                                                         statut=self.statut, date_debut=debut)
        for u in (self.employe, self.employe2):
            UserCategoriesalarie.objects.create(user=u, categoriesalarie=self.cat, statut=self.statut,
                                                date_debut=debut)
        UserAgence.objects.create(user=self.employe2, agence=self.agence, statut=self.statut,
                                  date_debut=timezone.now() - timedelta(days=30))
        self.aujourdhui = timezone.localdate()
        self.prec = (self.aujourdhui.replace(day=1) - timedelta(days=1)).replace(day=1)

    # ── Outils ────────────────────────────────────────────────
    def jour_prec(self, n):
        return self.prec.replace(day=n)

    def commander(self, user, jour, statut='en_attente', plat=None):
        menu, _ = Menu.objects.get_or_create(date_menu=jour, agence=self.agence, typeequipe=self.typeequipe)
        MenuPlat.objects.get_or_create(menu=menu, plat=plat or self.plat_a)
        return Commande.objects.create(user=user, menu=menu, plat=plat or self.plat_a, statut=statut)

    def retirer(self, commande):
        """Retrait de secours par le gestionnaire (tous les jours passés du mois ouvert)."""
        r = self.client_pour(self.gestionnaire).post(f'{API}/retraits/', {
            'user_id': commande.user_id, 'menu_id': commande.menu_id, 'badge_matricule': commande.user.username})
        self.assertEqual(r.status_code, 201, r.data)
        commande.refresh_from_db()
        return r.data

    def recharger(self, user, montant, par=None, **extra):
        r = self.client_pour(par or self.caissier).post(
            f'{API}/caisse/recharger/', {'user_id': user.id, 'montant': montant, **extra}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        return r.data

    def ancienne_regularisation(self, user, commandes, montant_recu=None, crediter=False):
        """Reçu de régularisation tel que l'ancienne caisse l'émettait (historique)."""
        total = D('1000') * len(commandes)
        recu_especes = D(montant_recu) if montant_recu is not None else total
        rendu = recu_especes - total
        with transaction.atomic():
            compte = cr.compte_verrouille(user.id)
            avant = compte.solde
            recu = cr._creer_recu(type='regularisation', user=user, caissier=self.caissier, mode='especes',
                                  montant=total, montant_repas=total, montant_recu=recu_especes, monnaie=rendu,
                                  monnaie_creditee=crediter and rendu > 0,
                                  encaissement=total + (rendu if crediter else D('0')),
                                  solde_avant=avant, solde_apres=avant + (rendu if crediter else D('0')))
            for c in commandes:
                RecuLigne.objects.create(recu=recu, commande=c, date_menu=c.menu.date_menu,
                                         plat_nom=c.plat.nom, montant=D('1000'))
                ReglementRepas.objects.create(commande=c, mode='caisse', montant=D('1000'), recu=recu)
            if crediter and rendu > 0:
                cr._mouvement(compte, 'regularisation', rendu, self.caissier, recu=recu, libelle='Monnaie')
        return recu

    def menu_futur(self, jours=5, plats=None):
        return self.menu_du_jour(plats=plats, jours=jours)

    def commander_api(self, user, menu, mode=None, attendu=201, plat=None):
        """Commande comme le web / le mobile : POST /commandes/ (mode_paiement facultatif)."""
        donnees = {'menu_id': menu.id, 'plat_id': (plat or self.plat_a).id}
        if mode is not None:
            donnees['mode_paiement'] = mode
        r = self.client_pour(user).post(f'{API}/commandes/', donnees, format='json')
        self.assertEqual(r.status_code, attendu, r.data)
        return r.data

    def payer_compte(self, commande):
        """Repas payé par le compte à la commande (commandes créées directement en base)."""
        cr.debiter_commande(Commande.objects.select_related('menu', 'plat').get(pk=commande.pk), commande.user)
        Commande.objects.filter(pk=commande.pk).update(mode_paiement='compte')
        commande.refresh_from_db()
        return commande

    def changer_mode(self, user, commande_id, mode, attendu=200):
        r = self.client_pour(user).post(f'{API}/commandes/{commande_id}/mode-paiement/',
                                        {'mode_paiement': mode}, format='json')
        self.assertEqual(r.status_code, attendu, r.data)
        return r.data

    def solde(self, user):
        return cr.solde(user)

    def mode(self, commande):
        r = ReglementRepas.objects.filter(commande=commande).first()
        return r.mode if r else None

    def verifier_grand_livre(self):
        """Pour chaque compte : solde = somme des mouvements, jamais négatif."""
        for c in CompteRepas.objects.all():
            self.assertEqual(c.solde, cr.total_mouvements(c), c.user.username)
            self.assertGreaterEqual(c.solde, 0)
            for m in c.mouvements.all():
                self.assertGreaterEqual(m.solde_apres, 0)

    def cloturer_prec(self):
        r = self.client_pour(self.admin).post(f'{API}/facturation/clotures/cloturer/',
                                              {'annee': self.prec.year, 'mois': self.prec.month})
        self.assertEqual(r.status_code, 201, r.data)
        return r.data


class RechargeEtRecusTests(_CaisseBase):

    def test_roles_crees_par_migration(self):
        self.assertTrue(Group.objects.filter(name='caissier').exists())
        self.assertTrue(Group.objects.filter(name='comptabilite').exists())

    def test_recharge_et_numerotation_par_annee(self):
        annee = timezone.localtime().year
        r1 = self.recharger(self.employe, '1500')
        self.assertEqual(r1['numero'], f'REÇ-{annee}-000001')
        self.assertEqual((r1['type'], r1['montant'], r1['solde_avant'], r1['solde_apres'], r1['encaissement']),
                         ('recharge', 1500.0, 0.0, 1500.0, 1500.0))
        self.assertEqual(r1['mode'], 'especes')
        r2 = self.recharger(self.employe2, 2000, par=self.caissier2)
        self.assertEqual(r2['numero'], f'REÇ-{annee}-000002')
        r3 = self.recharger(self.employe, '250.50')
        self.assertEqual(r3['solde_apres'], 1750.5)
        self.assertEqual(self.solde(self.employe), D('1750.50'))
        # Nouvelle année : le compteur repart à 1
        nouvel_an = timezone.make_aware(datetime(annee + 1, 1, 2, 9, 0))
        with patch('api.comptes_repas.timezone.now', return_value=nouvel_an):
            r4 = self.recharger(self.employe, 100)
        self.assertEqual(r4['numero'], f'REÇ-{annee + 1}-000001')
        self.assertEqual(Recu.objects.get(pk=r4['id']).annee, annee + 1)
        with patch('api.comptes_repas.timezone.now', return_value=nouvel_an):
            self.assertEqual(self.recharger(self.employe, 100)['numero'], f'REÇ-{annee + 1}-000002')
        self.assertEqual(self.recharger(self.employe, 100)['numero'], f'REÇ-{annee}-000004')
        self.verifier_grand_livre()

    def test_montants_invalides(self):
        client = self.client_pour(self.caissier)
        for montant in (0, -500, 'abc', '10.555', '', None, '2000000'):
            r = client.post(f'{API}/caisse/recharger/', {'user_id': self.employe.id, 'montant': montant},
                            format='json')
            self.assertEqual(r.status_code, 400, montant)
        r = client.post(f'{API}/caisse/recharger/', {'montant': 100}, format='json')
        self.assertEqual(r.status_code, 400)
        # Compte prestataire : pas de compte repas
        r = client.post(f'{API}/caisse/recharger/', {'user_id': self.agent_a.id, 'montant': 100}, format='json')
        self.assertEqual(r.status_code, 404)
        self.assertFalse(Recu.objects.exists())

    def test_mobile_money_refuse_tant_que_desactive(self):
        client = self.client_pour(self.caissier)
        r = client.post(f'{API}/caisse/recharger/', {'user_id': self.employe.id, 'montant': 1000,
                                                     'mode': 'mobile_money', 'reference': 'MM-1'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn("Mobile Money n'est pas encore disponible", str(r.data['mode']))
        r = client.post(f'{API}/caisse/recharger/', {'user_id': self.employe.id, 'montant': 1000,
                                                     'mode': 'cheque'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Recu.objects.exists())
        ctx = client.get(f'{API}/caisse/contexte/').data
        self.assertFalse(ctx['mobile_money_actif'])
        self.assertEqual([m['actif'] for m in ctx['modes_paiement']], [True, False])
        with override_settings(CAISSE_MOBILE_MONEY_ACTIF=True):
            r = self.recharger(self.employe, 1000, mode='mobile_money', reference='MM-1')
        self.assertEqual((r['mode'], r['reference']), ('mobile_money', 'MM-1'))

    def test_recu_pdf_ticket_et_a5(self):
        r = self.recharger(self.employe, 1500)
        for fmt in ('ticket', 'a5'):
            rep = self.client_pour(self.caissier).get(f"{API}/caisse/recus/{r['id']}/pdf/", {'papier': fmt})
            self.assertEqual(rep.status_code, 200)
            contenu = b''.join(rep.streaming_content)
            self.assertTrue(contenu.startswith(b'%PDF'))
        self.assertEqual(self.client_pour(self.caissier).get(
            f"{API}/caisse/recus/{r['id']}/pdf/", {'papier': 'a4'}).status_code, 400)
        # Ancienne régularisation (historique, avec détail des repas) et reçu annulé : PDF aussi
        c = self.commander(self.employe2, self.jour_prec(3))
        reg = self.ancienne_regularisation(self.employe2, [c], montant_recu='2000')
        rep = self.client_pour(self.compta).get(f"{API}/caisse/recus/{reg.id}/pdf/")
        self.assertTrue(b''.join(rep.streaming_content).startswith(b'%PDF'))
        cr.annuler_recu(reg, self.compta, 'Erreur de saisie')
        rep = self.client_pour(self.compta).get(f"{API}/caisse/recus/{reg.id}/pdf/")
        self.assertTrue(b''.join(rep.streaming_content).startswith(b'%PDF'))
        self.assertEqual(self.client_pour(self.caissier).get(f"{API}/caisse/recus/{reg.id}/").data['type_libelle'],
                         'Régularisation du mois')

    def test_regularisation_supprimee(self):
        c = self.commander(self.employe, self.jour_prec(3))
        client = self.client_pour(self.caissier)
        r = client.post(f'{API}/caisse/regulariser/', {'user_id': self.employe.id, 'commande_ids': [c.id]},
                        format='json')
        self.assertEqual(r.status_code, 404)
        self.assertFalse(hasattr(cr, 'regulariser'))
        self.assertFalse(Recu.objects.exists())
        self.recharger(self.employe, 500)
        self.assertNotIn('regularisation', [t['type'] for t in self.client_pour(self.compta).get(
            f'{API}/caisse/journal/').data['par_type']])


class PaiementCommandeTests(_CaisseBase):
    """Mode de paiement choisi à la commande : compte repas (débit immédiat) ou retenue sur salaire."""

    def test_info_paiement_pour_l_ecran_de_commande(self):
        menu = self.menu_futur()
        url = f'{API}/compte-repas/paiement/'
        r = self.client_pour(self.employe).get(url, {'menu': menu.id})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual((r.data['solde'], r.data['prix'], r.data['compte_possible'], r.data['mode_par_defaut'],
                          r.data['mode_paiement_prefere']), (0.0, 1000.0, False, 'retenue', 'compte'))
        self.assertEqual(r.data['raison_compte_impossible'],
                         'Solde insuffisant : 0 F disponibles, 1 000 F nécessaires — rechargez à la caisse')
        self.recharger(self.employe, 1500)
        r = self.client_pour(self.employe).get(url, {'date': menu.date_menu.isoformat()})
        self.assertEqual((r.data['compte_possible'], r.data['mode_par_defaut'], r.data['raison_compte_impossible']),
                         (True, 'compte', None))
        self.assertEqual([m['code'] for m in r.data['modes']], ['compte', 'retenue'])
        # Sans tarif (pas de catégorie) : compte impossible, expliqué
        emp3 = self.creer_user('emp3', 'employe')
        self.recharger(emp3, 5000)
        r = self.client_pour(emp3).get(url, {'menu': menu.id})
        self.assertEqual((r.data['sans_tarif'], r.data['compte_possible'], r.data['mode_par_defaut']),
                         (True, False, 'retenue'))
        self.assertIn('aucun tarif', r.data['raison_compte_impossible'])
        self.assertEqual(self.client_pour(self.employe).get(url, {'menu': 'x'}).status_code, 400)
        self.assertEqual(self.client_pour(self.agent_a).get(url, {'menu': menu.id}).status_code, 403)

    def test_commande_compte_debitee_a_la_commande(self):
        self.recharger(self.employe, 1500)
        menu = self.menu_futur()
        data = self.commander_api(self.employe, menu, 'compte')
        self.assertEqual((data['mode_paiement'], data['mode_paiement_libelle'], data['mode_paiement_modifiable']),
                         ('compte', 'Compte repas', True))
        self.assertEqual(data['paiement'], {'mode': 'compte', 'libelle': 'Débité du compte repas', 'montant': 1000.0})
        self.assertTrue(data['mode_paiement_limite'])
        c = Commande.objects.get(pk=data['id'])
        self.assertEqual((c.mode_paiement, self.mode(c)), ('compte', 'compte'))
        self.assertEqual(self.solde(self.employe), D('500'))
        m = MouvementCompte.objects.get(type='debit_repas')
        self.assertEqual((m.montant, m.solde_apres, m.commande_id), (D('-1000'), D('500'), c.id))
        ligne = fact.lignes_facturation(Commande.objects.filter(pk=c.pk))[0]
        self.assertEqual((ligne['reglement'], ligne['mode_paiement'], ligne['montant']), ('compte', 'compte', D('1000')))
        # Mes commandes : mode exposé
        mes = self.client_pour(self.employe).get(f'{API}/commandes/mes-commandes/').data
        self.assertEqual((mes[0]['mode_paiement'], mes[0]['paiement']['montant']), ('compte', 1000.0))
        self.verifier_grand_livre()

    def test_solde_insuffisant_refuse(self):
        self.recharger(self.employe, 900)
        menu = self.menu_futur()
        r = self.commander_api(self.employe, menu, 'compte', attendu=400)
        self.assertEqual(str(r['detail']),
                         'Solde insuffisant : 900 F disponibles, 1 000 F nécessaires — rechargez à la caisse')
        self.assertEqual(str(r['code']), 'solde_insuffisant')
        self.assertFalse(Commande.objects.exists())          # commande non créée
        self.assertEqual(self.solde(self.employe), D('900'))
        # Sans compte du tout
        r = self.commander_api(self.employe2, menu, 'compte', attendu=400)
        self.assertIn('0 F disponibles', str(r['detail']))
        self.assertFalse(CompteRepas.objects.filter(user=self.employe2).exists())
        # Sans tarif
        emp3 = self.creer_user('emp3', 'employe')
        self.recharger(emp3, 5000)
        r = self.commander_api(emp3, menu, 'compte', attendu=400)
        self.assertIn('aucun tarif', str(r['detail']))
        # Mode invalide
        self.commander_api(self.employe, menu, 'caisse', attendu=400)
        self.assertFalse(Commande.objects.exists())
        # Retenue : acceptée
        self.assertEqual(self.commander_api(self.employe, menu, 'retenue')['mode_paiement'], 'retenue')

    def test_commande_retenue_sans_debit(self):
        self.recharger(self.employe, 5000)
        data = self.commander_api(self.employe, self.menu_futur(), 'retenue')
        self.assertEqual((data['mode_paiement'], data['paiement'], data['mode_paiement_modifiable']),
                         ('retenue', None, True))
        self.assertEqual(self.solde(self.employe), D('5000'))
        self.assertFalse(ReglementRepas.objects.exists())

    def test_mode_par_defaut_selon_preference(self):
        moi = self.client_pour(self.employe).get(f'{API}/users/me/').data
        self.assertEqual(moi['mode_paiement_prefere'], 'compte')
        # Préférence « compte » et solde suffisant → compte ; solde insuffisant → retenue (pas d'erreur)
        self.recharger(self.employe, 1500)
        self.assertEqual(self.commander_api(self.employe, self.menu_futur(5))['mode_paiement'], 'compte')
        self.assertEqual(self.commander_api(self.employe, self.menu_futur(6))['mode_paiement'], 'retenue')
        self.assertEqual(self.solde(self.employe), D('500'))
        # Préférence « retenue » : retenue même avec un solde suffisant
        r = self.client_pour(self.employe2).patch(f'{API}/users/me/', {'mode_paiement_prefere': 'retenue'},
                                                  format='json')
        self.assertEqual((r.status_code, r.data['mode_paiement_prefere']), (200, 'retenue'))
        self.recharger(self.employe2, 3000)
        self.assertEqual(self.commander_api(self.employe2, self.menu_futur(5))['mode_paiement'], 'retenue')
        self.assertEqual(self.solde(self.employe2), D('3000'))
        # Valeur invalide, autre champ : refusés ; un admin ne la change pas par /users/<id>/
        client = self.client_pour(self.employe2)
        self.assertEqual(client.patch(f'{API}/users/me/', {'mode_paiement_prefere': 'caisse'},
                                      format='json').status_code, 400)
        self.assertEqual(client.patch(f'{API}/users/me/', {'nom': 'X'}, format='json').status_code, 400)
        self.client_pour(self.admin).patch(f'{API}/users/{self.employe2.id}/', {'mode_paiement_prefere': 'compte'},
                                           format='json')
        self.employe2.refresh_from_db()
        self.assertEqual((self.employe2.mode_paiement_prefere, self.employe2.nom), ('retenue', 'EMP2'))

    def test_annulation_dans_le_delai_recredite(self):
        self.recharger(self.employe, 1500)
        menu = self.menu_futur()
        data = self.commander_api(self.employe, menu, 'compte')
        r = self.client_pour(self.employe).patch(f"{API}/commandes/{data['id']}/annuler/")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self.solde(self.employe), D('1500'))
        self.assertFalse(ReglementRepas.objects.exists())
        self.assertEqual(MouvementCompte.objects.get(type='recredit').montant, D('1000'))
        # Commande reprise (même plat) : débitée de nouveau, une seule fois
        data = self.commander_api(self.employe, menu, 'compte', attendu=200)
        self.assertEqual((data['mode_paiement'], data['paiement']['montant']), ('compte', 1000.0))
        self.assertEqual(self.solde(self.employe), D('500'))
        self.assertEqual(ReglementRepas.objects.count(), 1)
        self.verifier_grand_livre()

    def test_annulation_hors_delai_refusee_repas_reste_paye(self):
        self.recharger(self.employe, 1000)
        c = self.payer_compte(self.commander(self.employe, self.aujourdhui + timedelta(days=1)))
        r = self.client_pour(self.employe).patch(f'{API}/commandes/{c.id}/annuler/')
        self.assertEqual(r.status_code, 400)
        self.assertEqual((self.mode(c), self.solde(self.employe)), ('compte', D('0')))

    def test_annulation_par_le_gestionnaire_recredite(self):
        self.recharger(self.employe, 1000)
        c = self.payer_compte(self.commander(self.employe, self.aujourdhui))
        self.assertEqual(self.solde(self.employe), D('0'))
        r = self.client_pour(self.gestionnaire).patch(f'{API}/commandes/{c.id}/annuler/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIsNone(self.mode(c))
        self.assertEqual(self.solde(self.employe), D('1000'))
        self.verifier_grand_livre()

    def test_retrait_ne_debite_pas_et_son_annulation_ne_recredite_pas(self):
        self.recharger(self.employe, 3000)
        menu = self.menu_du_jour()
        c = self.payer_compte(Commande.objects.create(user=self.employe, menu=menu, plat=self.plat_a))
        self.assertEqual(self.solde(self.employe), D('2000'))
        agent = self.client_pour(self.agent_a)
        r = agent.post(f'{API}/prestataire/comptoir/valider/',
                       {'menu_id': menu.id, 'user_id': self.employe.id, 'mode': 'scan'})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.solde(self.employe), D('2000'))           # pas de second débit au retrait
        # Agent du comptoir, dans les 2 minutes : retrait annulé, repas toujours dû et payé
        r = agent.post(f"{API}/prestataire/comptoir/retraits/{r.data['id']}/annuler/")
        self.assertEqual(r.status_code, 200, r.data)
        c.refresh_from_db()
        self.assertEqual((c.statut, self.mode(c), self.solde(self.employe)), ('en_attente', 'compte', D('2000')))
        # Gestionnaire : annuler-retrait, puis DELETE /retraits/<id>/
        self.retirer(c)
        r = self.client_pour(self.gestionnaire).post(f'{API}/commandes/{c.id}/annuler-retrait/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual((r.data['statut'], r.data['mode_paiement'], self.mode(c)), ('en_attente', 'compte', 'compte'))
        self.retirer(c)
        retrait = Retrait.objects.get(user=self.employe, menu=c.menu)
        self.assertEqual(self.client_pour(self.gestionnaire).delete(f'{API}/retraits/{retrait.id}/').status_code, 204)
        self.assertEqual((self.mode(c), self.solde(self.employe)), ('compte', D('2000')))
        self.assertFalse(MouvementCompte.objects.filter(type='recredit').exists())
        # Repas en retenue retiré : rien sur le compte
        c2 = self.commander(self.employe2, self.aujourdhui)
        self.recharger(self.employe2, 5000)
        self.retirer(c2)
        self.assertEqual((self.mode(c2), self.solde(self.employe2)), (None, D('5000')))
        self.verifier_grand_livre()

    def test_ancien_repas_paye_caisse_retrait_annule_reste_paye(self):
        c = self.commander(self.employe, self.aujourdhui)
        self.retirer(c)
        self.ancienne_regularisation(self.employe, [c])
        self.client_pour(self.gestionnaire).post(f'{API}/commandes/{c.id}/annuler-retrait/')
        self.assertEqual((self.mode(c), self.solde(self.employe)), ('caisse', D('0')))

    def _contester(self, c, cause):
        r = self.client_pour(self.employe).post(f'{API}/contestations-retrait/',
                                                {'commande_id': c.id, 'motif': 'absent'})
        self.assertEqual(r.status_code, 201, r.data)
        r = self.client_pour(self.gestionnaire).post(f"{API}/contestations-retrait/{r.data['id']}/accepter/",
                                                     {'cause': cause})
        self.assertEqual(r.status_code, 200, r.data)

    def test_contestation_erreur_comptoir_recredite_et_jamais_facture(self):
        self.recharger(self.employe, 1500)
        c = self.payer_compte(self.commander(self.employe, self.aujourdhui))
        self.retirer(c)
        self.assertEqual(self.solde(self.employe), D('500'))
        self._contester(c, 'erreur_comptoir')
        c.refresh_from_db()
        self.assertEqual((c.statut, c.motif_annulation), ('annulee', 'contestation'))
        self.assertEqual(self.solde(self.employe), D('1500'))
        self.assertIsNone(self.mode(c))
        self.assertEqual(MouvementCompte.objects.filter(type='recredit').count(), 1)   # une seule fois
        self.assertEqual(fact.lignes_facturation(Commande.objects.filter(pk=c.pk)), [])
        self.verifier_grand_livre()

    def test_contestation_erreur_comptoir_ancien_repas_paye_caisse_credite(self):
        c = self.commander(self.employe, self.aujourdhui)
        self.retirer(c)
        self.ancienne_regularisation(self.employe, [c])
        self._contester(c, 'erreur_comptoir')
        self.assertIsNone(self.mode(c))
        self.assertEqual(self.solde(self.employe), D('1000'))
        self.verifier_grand_livre()

    def test_contestation_badge_tiers_reste_paye(self):
        self.recharger(self.employe, 1000)
        c = self.payer_compte(self.commander(self.employe, self.aujourdhui))
        self.retirer(c)
        self._contester(c, 'badge_tiers')
        self.assertEqual((self.mode(c), self.solde(self.employe)), ('compte', D('0')))

    def test_ancien_repas_paye_caisse_annule_credite(self):
        c = self.commander(self.employe, self.jour_prec(2))      # non retirée, jour passé
        self.ancienne_regularisation(self.employe, [c])
        r = self.client_pour(self.gestionnaire).patch(f'{API}/commandes/{c.id}/annuler/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIsNone(self.mode(c))
        self.assertEqual(self.solde(self.employe), D('1000'))
        self.verifier_grand_livre()

    def test_changer_de_mode_avant_la_date_limite(self):
        self.recharger(self.employe, 1500)
        data = self.commander_api(self.employe, self.menu_futur(), 'retenue')
        cid = data['id']
        # retenue → compte : débité
        d = self.changer_mode(self.employe, cid, 'compte')
        self.assertEqual((d['mode_paiement'], d['paiement']['montant'], d['mode_paiement_modifiable']),
                         ('compte', 1000.0, True))
        self.assertEqual(self.solde(self.employe), D('500'))
        self.assertIn('passage au compte repas', MouvementCompte.objects.get(type='debit_repas').libelle)
        # même mode : sans effet
        self.changer_mode(self.employe, cid, 'compte')
        self.assertEqual((self.solde(self.employe), ReglementRepas.objects.count()), (D('500'), 1))
        # compte → retenue : recrédité
        d = self.changer_mode(self.employe, cid, 'retenue')
        self.assertEqual((d['mode_paiement'], d['paiement']), ('retenue', None))
        self.assertEqual(self.solde(self.employe), D('1500'))
        self.assertIn('Passage en retenue', MouvementCompte.objects.get(type='recredit').libelle)
        # retenue → compte avec un solde insuffisant : refusé
        cr.rembourser(self.employe, self.compta, 'Test')
        r = self.changer_mode(self.employe, cid, 'compte', attendu=400)
        self.assertIn('Solde insuffisant : 0 F disponibles', str(r['detail']))
        self.assertEqual(Commande.objects.get(pk=cid).mode_paiement, 'retenue')
        # Mode invalide ; commande d'un autre employé ; gestionnaire : refusés
        self.changer_mode(self.employe, cid, 'caisse', attendu=400)
        self.changer_mode(self.employe, cid, '', attendu=400)
        self.changer_mode(self.employe2, cid, 'retenue', attendu=404)
        self.changer_mode(self.gestionnaire, cid, 'retenue', attendu=403)
        self.verifier_grand_livre()

    def test_mode_verrouille_apres_la_date_limite(self):
        self.recharger(self.employe, 3000)
        c = self.commander(self.employe, self.aujourdhui + timedelta(days=1))   # limite (48 h) dépassée
        r = self.changer_mode(self.employe, c.id, 'compte', attendu=400)
        self.assertIn('ne peut plus être changé', str(r['detail']))
        self.assertEqual(str(r['code']), 'mode_verrouille')
        d = self.client_pour(self.employe).get(f'{API}/commandes/{c.id}/').data
        self.assertFalse(d['mode_paiement_modifiable'])
        # Juste avant la date limite : modifiable
        from .serializers import date_limite_commande
        avant = date_limite_commande(c.menu.date_menu) - timedelta(minutes=1)
        with patch('api.comptes_repas.timezone.now', return_value=avant):
            self.changer_mode(self.employe, c.id, 'compte')
        self.assertEqual(self.solde(self.employe), D('2000'))
        # Repas retiré : figé
        c2 = self.commander(self.employe2, self.aujourdhui)
        self.retirer(c2)
        self.changer_mode(self.employe2, c2.id, 'compte', attendu=400)
        self.assertEqual(self.solde(self.employe), D('2000'))

    def test_contrainte_solde_jamais_negatif_en_base(self):
        compte = CompteRepas.objects.create(user=self.employe)
        with self.assertRaises(IntegrityError), transaction.atomic():
            CompteRepas.objects.filter(pk=compte.pk).update(solde=D('-1'))
        # Un repas n'est réglé qu'une fois (unicité en base)
        c = self.commander(self.employe, self.aujourdhui)
        ReglementRepas.objects.create(commande=c, mode='retenue', montant=D('1000'))
        with self.assertRaises(IntegrityError), transaction.atomic():
            ReglementRepas.objects.create(commande=c, mode='caisse', montant=D('1000'))


class ClotureMensuelleCompteTests(_CaisseBase):
    """
    Clôture : les repas « compte » sont déjà payés (commandé = dû, retirés ou non) ; tous les
    autres sont retenus sur salaire ; le solde n'est jamais utilisé automatiquement.
    """

    def test_cloture_compte_retenue_et_historique(self):
        j = self.jour_prec
        self.recharger(self.employe, 2000)
        a = self.payer_compte(self.commander(self.employe, j(1))); self.retirer(a)   # compte, retiré
        b = self.payer_compte(self.commander(self.employe, j(2)))                    # compte, non retiré : dû
        c = self.commander(self.employe, j(3)); self.retirer(c)                      # retenue, retiré
        d = self.commander(self.employe, j(4))                                       # retenue, non retiré
        e = self.commander(self.employe, j(5)); self.retirer(e)
        self.ancienne_regularisation(self.employe, [e])                              # historique : caisse
        self.recharger(self.employe, 10000)                                          # solde non utilisé
        f1 = self.commander(self.employe2, j(1))
        f2 = self.commander(self.employe2, j(6), statut='retiree')
        self.commander(self.employe, j(7), statut='annulee')                         # jamais facturé

        data = self.cloturer_prec()
        self.assertEqual([self.mode(x) for x in (a, b, c, d, e)], ['compte', 'compte', 'retenue', 'retenue', 'caisse'])
        self.assertEqual([self.mode(x) for x in (f1, f2)], ['retenue', 'retenue'])
        self.assertEqual(self.solde(self.employe), D('10000'))
        self.assertEqual(MouvementCompte.objects.filter(type='debit_repas').count(), 2)

        f = FactureMensuelle.objects.get(user=self.employe)
        self.assertEqual((f.nb_repas, f.montant_total), (5, D('5000')))
        self.assertEqual((f.nb_repas_compte, f.montant_compte), (2, D('2000')))
        self.assertEqual((f.nb_repas_caisse, f.montant_caisse), (1, D('1000')))
        self.assertEqual((f.nb_repas_retenue, f.montant_retenue), (2, D('2000')))
        f_2 = FactureMensuelle.objects.get(user=self.employe2)
        self.assertEqual((f_2.montant_total, f_2.montant_compte, f_2.montant_caisse, f_2.montant_retenue),
                         (D('2000'), D('0'), D('0'), D('2000')))
        for fm in FactureMensuelle.objects.all():
            self.assertEqual(fm.montant_total, fm.montant_compte + fm.montant_caisse + fm.montant_retenue)
            self.assertEqual(fm.nb_repas, fm.nb_repas_compte + fm.nb_repas_caisse + fm.nb_repas_retenue)
            self.assertEqual(fm.montant_total, sum(l.montant for l in fm.lignes.all()))
        self.assertEqual(
            {l.commande_id: l.reglement for l in LigneFacture.objects.filter(facture=f)},
            {a.id: 'compte', b.id: 'compte', c.id: 'retenue', d.id: 'retenue', e.id: 'caisse'})
        self.assertEqual((float(data['montant_total']), float(data['montant_compte']), float(data['montant_caisse']),
                          float(data['montant_retenue'])), (7000.0, 2000.0, 1000.0, 4000.0))
        self.assertEqual((data['nb_repas'], data['nb_repas_compte'], data['nb_repas_caisse'],
                          data['nb_repas_retenue']), (7, 2, 1, 4))
        self.assertEqual(float(data['montant_total_prestataires']), 7 * 900.0)
        self.verifier_grand_livre()

        # Écran de facturation : mêmes montants, figés ; mode de paiement de chaque repas
        debut, fin = fact.bornes_mois(self.prec.year, self.prec.month)
        params = {'date_debut': debut.isoformat(), 'date_fin': fin.isoformat()}
        v = self.client_pour(self.admin).get(f'{API}/facturation/', params).data
        self.assertEqual((v['total_montant'], v['total_compte'], v['total_caisse'], v['total_retenue']),
                         (7000.0, 2000.0, 1000.0, 4000.0))
        emp = [x for x in v['employes'] if x['username'] == 'emp1'][0]
        self.assertEqual((emp['montant_compte'], emp['montant_caisse'], emp['montant_retenue']),
                         (2000.0, 1000.0, 2000.0))
        self.assertEqual({l['commande_id']: (l['mode_paiement'], l['reglement']) for l in emp['lignes']}[b.id],
                         ('compte', 'compte'))

        # Figé : tarif modifié, recharge, tentatives de modification
        PlatCategoriesalarie.objects.update(montant=D('9999'))
        self.assertEqual(self.client_pour(self.gestionnaire).post(
            f'{API}/commandes/{c.id}/annuler-retrait/').status_code, 400)
        r = self.client_pour(self.compta).post(f"{API}/caisse/recus/{Recu.objects.get(type='regularisation').id}"
                                               "/annuler/", {'motif': 'Test'})
        self.assertEqual(r.status_code, 400)
        self.assertIn('clôturé', str(r.data))
        v2 = self.client_pour(self.admin).get(f'{API}/facturation/', params).data
        self.assertEqual((v2['total_montant'], v2['total_compte'], v2['total_caisse'], v2['total_retenue']),
                         (7000.0, 2000.0, 1000.0, 4000.0))

        # Relevé des agents (PDF) : colonnes compte / caisse / retenue
        from . import releves
        rel = releves.releve_agents(fact.lignes_facturation(releves.commandes_visibles(debut, fin)))
        self.assertEqual((rel['montant'], rel['montant_compte'], rel['montant_caisse'], rel['montant_retenue']),
                         (D('7000'), D('2000'), D('1000'), D('4000')))
        r = self.client_pour(self.gestionnaire).get(f'{API}/facturation/agents-pdf/', params)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(b''.join(r.streaming_content).startswith(b'%PDF'))

    def test_pas_de_debit_automatique_du_solde(self):
        """Solde de 4 000 F et un repas en retenue : retenu (1 000 F), le solde reste à 4 000 F."""
        c = self.commander(self.employe, self.jour_prec(3))
        self.retirer(c)
        self.recharger(self.employe, 4000)
        fiche = self.client_pour(self.caissier).get(f'{API}/caisse/employes/{self.employe.id}/').data
        self.assertEqual((fiche['totaux']['retenue_prevue']['montant'], fiche['reste_a_payer_prevu']),
                         (1000.0, 1000.0))
        data = self.cloturer_prec()
        self.assertEqual((self.mode(c), self.solde(self.employe)), ('retenue', D('4000')))
        self.assertEqual((float(data['montant_retenue']), data['nb_repas_retenue'], float(data['montant_compte'])),
                         (1000.0, 1, 0.0))
        self.verifier_grand_livre()

    def test_situation_et_reste_a_payer(self):
        self.recharger(self.employe, 1500)
        a = self.payer_compte(self.commander(self.employe, self.jour_prec(1)))
        b = self.commander(self.employe, self.jour_prec(2)); self.retirer(b)
        c = self.commander(self.employe, self.jour_prec(3))
        r = self.client_pour(self.employe).get(f'{API}/compte-repas/',
                                               {'annee': self.prec.year, 'mois': self.prec.month}).data
        repas = {x['commande_id']: x for x in r['repas']}
        self.assertEqual((repas[a.id]['statut'], repas[a.id]['mode_paiement']), ('debite_compte', 'compte'))
        self.assertEqual((repas[b.id]['statut'], repas[b.id]['mode_paiement'], repas[b.id]['statut_libelle']),
                         ('retenue_prevue', 'retenue', 'Retenue sur salaire — à la clôture du mois'))
        self.assertFalse(any(x['mode_modifiable'] for x in r['repas']))      # jours passés
        self.assertEqual(r['reste_a_payer_prevu'], 2000.0)
        t = r['totaux']
        self.assertEqual(t['consomme']['montant'], t['debite_compte']['montant'] + t['retenue_prevue']['montant'])
        self.assertEqual((t['consomme']['montant'], t['debite_compte']['montant']), (3000.0, 1000.0))
        self.assertNotIn('non_couvert', t)
        self.assertNotIn('regularisable', r['repas'][0])
        self.assertEqual(r['mode_paiement_prefere'], 'compte')
        self.cloturer_prec()
        r = self.client_pour(self.employe).get(f'{API}/compte-repas/',
                                               {'annee': self.prec.year, 'mois': self.prec.month}).data
        self.assertEqual((r['reste_a_payer_prevu'], r['totaux']['retenue']['montant'], r['mois_cloture']),
                         (0.0, 2000.0, True))
        self.assertEqual(self.mode(c), 'retenue')

    def test_mois_ouvert_totaux_provisoires(self):
        self.recharger(self.employe, 1000)
        self.payer_compte(self.commander(self.employe, self.jour_prec(1)))
        b = self.commander(self.employe, self.jour_prec(2)); self.retirer(b)
        self.ancienne_regularisation(self.employe, [b])
        self.commander(self.employe, self.jour_prec(3))
        emp = fact.synthese_par_employe(fact.lignes_facturation(Commande.objects.filter(user=self.employe)))[0]
        self.assertEqual((emp['total'], emp['montant_compte'], emp['montant_caisse'], emp['montant_retenue']),
                         (D('3000'), D('1000'), D('1000'), D('1000')))


class MigrationModePaiementTests(_CaisseBase):
    """Migration 0039 : commandes antérieures au choix du mode."""

    def test_reprise_des_commandes_existantes(self):
        import importlib
        from django.apps import apps
        migration = importlib.import_module('api.migrations.0039_mode_paiement_commande')
        self.recharger(self.employe, 1000)
        debitee = self.commander(self.employe, self.jour_prec(1))
        cr.debiter_commande(Commande.objects.get(pk=debitee.pk), None)       # ancien débit au retrait
        non_couverte = self.commander(self.employe, self.jour_prec(2), statut='retiree')
        payee_caisse = self.commander(self.employe, self.jour_prec(3), statut='retiree')
        self.ancienne_regularisation(self.employe, [payee_caisse])
        a_venir = self.commander(self.employe2, self.aujourdhui + timedelta(days=5))
        Commande.objects.update(mode_paiement='compte')                      # état quelconque avant reprise
        solde_avant = self.solde(self.employe)
        migration.renseigner_mode_paiement(apps, None)
        modes = dict(Commande.objects.values_list('id', 'mode_paiement'))
        self.assertEqual([modes[x.id] for x in (debitee, non_couverte, payee_caisse, a_venir)],
                         ['compte', 'retenue', 'retenue', 'retenue'])
        self.assertEqual(self.solde(self.employe), solde_avant)             # aucun mouvement
        # Clôture cohérente : débitée → compte, payée caisse → caisse, non couverte → retenue
        self.cloturer_prec()
        self.assertEqual([self.mode(x) for x in (debitee, non_couverte, payee_caisse)], ['compte', 'retenue', 'caisse'])
        self.assertEqual(self.solde(self.employe), solde_avant)


class ClotureCaisseTests(_CaisseBase):

    def test_theorique_ecart_motif_validation(self):
        r1 = self.recharger(self.employe, 1000)
        self.recharger(self.employe2, 2000)
        self.recharger(self.employe2, 1000)
        annule = self.recharger(self.employe2, 700)
        cr.annuler_recu(Recu.objects.get(pk=annule['id']), self.compta, 'Erreur')
        # Opérations d'un autre caissier : hors de cette caisse
        self.recharger(self.employe, 300, par=self.caissier2)

        client = self.client_pour(self.caissier)
        ap = client.get(f'{API}/caisse/clotures/apercu/').data
        self.assertEqual((ap['nb_recus'], ap['montant_theorique']), (4, 4000.0))
        r = client.post(f'{API}/caisse/clotures/', {'montant_compte': 3900}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('motif est obligatoire', str(r.data['motif_ecart']))
        r = client.post(f'{API}/caisse/clotures/', {'montant_compte': 3900, 'motif_ecart': 'Billet manquant'},
                        format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['montant_theorique'], r.data['montant_compte'], r.data['ecart'], r.data['statut'],
                          r.data['nb_recus']), (4000.0, 3900.0, -100.0, 'soumise', 4))
        cid = r.data['id']
        # Reçus verrouillés : plus d'annulation
        r = self.client_pour(self.compta).post(f"{API}/caisse/recus/{r1['id']}/annuler/", {'motif': 'x'})
        self.assertEqual(r.status_code, 400)
        self.assertIn('clôture de caisse', str(r.data))
        # Rien de nouveau à clôturer ; une nouvelle opération part dans la clôture suivante
        self.assertEqual(client.post(f'{API}/caisse/clotures/', {'montant_compte': 0}, format='json').status_code, 400)
        self.recharger(self.employe, 500)
        self.assertEqual(client.get(f'{API}/caisse/clotures/apercu/').data['montant_theorique'], 500.0)
        # Validation : comptabilité seulement
        self.assertEqual(client.post(f'{API}/caisse/clotures/{cid}/valider/').status_code, 403)
        r = self.client_pour(self.compta).post(f'{API}/caisse/clotures/{cid}/valider/', {'commentaire': 'OK'})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual((r.data['statut'], r.data['traitee_par_nom']), ('validee', 'COMPTA1 Test'))
        self.assertEqual(self.client_pour(self.compta).post(f'{API}/caisse/clotures/{cid}/rejeter/',
                                                            {'commentaire': 'x'}).status_code, 400)
        r = self.client_pour(self.compta).post(f"{API}/caisse/recus/{r1['id']}/annuler/", {'motif': 'x'})
        self.assertEqual(r.status_code, 400)
        # Le caissier ne voit que ses clôtures
        self.assertEqual(self.client_pour(self.caissier2).get(f'{API}/caisse/clotures/').data['count'], 0)
        self.assertEqual(self.client_pour(self.compta).get(f'{API}/caisse/clotures/').data['count'], 1)

    def test_ecart_nul_sans_motif_et_rejet(self):
        self.recharger(self.employe, 1000, par=self.compta_caisse)
        client = self.client_pour(self.compta_caisse)
        r = client.post(f'{API}/caisse/clotures/', {'montant_compte': '1000'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['ecart'], 0.0)
        # Personne ne valide sa propre clôture
        self.assertEqual(client.post(f"{API}/caisse/clotures/{r.data['id']}/valider/").status_code, 403)
        compta = self.client_pour(self.compta)
        self.assertEqual(compta.post(f"{API}/caisse/clotures/{r.data['id']}/rejeter/").status_code, 400)
        r = compta.post(f"{API}/caisse/clotures/{r.data['id']}/rejeter/", {'commentaire': 'Recompter'})
        self.assertEqual(r.data['statut'], 'rejetee')
        # Reçus libérés : nouvelle clôture possible
        self.assertEqual(client.get(f'{API}/caisse/clotures/apercu/').data['nb_recus'], 1)
        self.assertEqual(client.post(f'{API}/caisse/clotures/', {'montant_compte': 1000},
                                     format='json').status_code, 201)
        self.assertEqual(ClotureCaisse.objects.count(), 2)

    def test_journal(self):
        self.recharger(self.employe, 1000)
        self.recharger(self.employe2, 2500, par=self.caissier2)
        annule = self.recharger(self.employe2, 400)
        cr.annuler_recu(Recu.objects.get(pk=annule['id']), self.compta, 'Erreur')
        self.recharger(self.employe, 500)
        cr.rembourser(self.employe, self.compta, 'Départ')
        j = self.client_pour(self.compta).get(f'{API}/caisse/journal/').data
        self.assertEqual((j['nb_recus'], j['nb_valides'], j['nb_annules']), (5, 4, 1))
        par_type = {t['type']: t for t in j['par_type']}
        self.assertEqual((par_type['recharge']['nb'], par_type['recharge']['montant']), (3, 4000.0))
        self.assertEqual(par_type['remboursement']['encaissement'], -1500.0)
        self.assertEqual(j['especes_net'], 2500.0)
        # Caissier : son journal seulement
        jc = self.client_pour(self.caissier).get(f'{API}/caisse/journal/').data
        self.assertEqual(jc['nb_recus'], 3)
        self.assertEqual(self.client_pour(self.caissier).get(
            f'{API}/caisse/journal/', {'caissier': self.caissier2.id}).status_code, 403)
        r = self.client_pour(self.compta).get(f'{API}/caisse/journal/pdf/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(b''.join(r.streaming_content).startswith(b'%PDF'))


class AnnulationEtRemboursementTests(_CaisseBase):

    def test_annulation_recharge(self):
        r = self.recharger(self.employe, 2000)
        url = f"{API}/caisse/recus/{r['id']}/annuler/"
        # Le caissier ne peut pas annuler (rôle), la comptabilité doit motiver
        self.assertEqual(self.client_pour(self.caissier).post(url, {'motif': 'x'}).status_code, 403)
        self.assertEqual(self.client_pour(self.compta).post(url).status_code, 400)
        rep = self.client_pour(self.compta).post(url, {'motif': 'Doublon'})
        self.assertEqual(rep.status_code, 200, rep.data)
        self.assertEqual((rep.data['statut'], rep.data['motif_annulation']), ('annule', 'Doublon'))
        self.assertEqual(self.solde(self.employe), D('0'))
        self.assertEqual(MouvementCompte.objects.get(type='annulation').montant, D('-2000'))
        self.assertEqual(self.client_pour(self.compta).post(url, {'motif': 'x'}).status_code, 400)   # déjà annulé
        self.verifier_grand_livre()

    def test_annulation_refusee_si_credit_utilise(self):
        r = self.recharger(self.employe, 1500)
        self.commander_api(self.employe, self.menu_futur(), 'compte')     # 1 000 dépensés
        rep = self.client_pour(self.compta).post(f"{API}/caisse/recus/{r['id']}/annuler/", {'motif': 'Erreur'})
        self.assertEqual(rep.status_code, 400)
        self.assertIn("n'a plus que 500 F", str(rep.data))
        self.assertEqual(Recu.objects.get(pk=r['id']).statut, 'valide')
        self.assertEqual(self.solde(self.employe), D('500'))

    def test_personne_n_annule_ses_propres_operations(self):
        r = self.recharger(self.employe, 1000, par=self.compta_caisse)
        rep = self.client_pour(self.compta_caisse).post(f"{API}/caisse/recus/{r['id']}/annuler/", {'motif': 'x'})
        self.assertEqual(rep.status_code, 403)
        self.assertEqual(self.client_pour(self.compta).post(f"{API}/caisse/recus/{r['id']}/annuler/",
                                                            {'motif': 'x'}).status_code, 200)

    def test_annulation_regularisation(self):
        c1 = self.commander(self.employe, self.jour_prec(2))
        c2 = self.commander(self.employe, self.jour_prec(3))
        reg = self.ancienne_regularisation(self.employe, [c1, c2], montant_recu='3000', crediter=True)
        self.assertEqual(self.solde(self.employe), D('1000'))
        # Repas c2 annulé depuis : ses 1 000 F sont passés sur le compte
        self.client_pour(self.gestionnaire).patch(f'{API}/commandes/{c2.id}/annuler/')
        self.assertEqual(self.solde(self.employe), D('2000'))
        rep = self.client_pour(self.compta).post(f"{API}/caisse/recus/{reg.id}/annuler/", {'motif': 'Erreur'})
        self.assertEqual(rep.status_code, 200, rep.data)
        # Monnaie créditée et repas annulé retirés du compte ; c1 redevient en retenue (à la clôture)
        self.assertEqual(self.solde(self.employe), D('0'))
        self.assertIsNone(self.mode(c1))
        self.assertEqual(self.client_pour(self.caissier).get(
            f'{API}/caisse/employes/{self.employe.id}/').data['totaux']['retenue_prevue']['nb'], 1)
        self.verifier_grand_livre()

    def test_annulation_regularisation_refusee_si_monnaie_utilisee(self):
        c1 = self.commander(self.employe, self.jour_prec(2))
        reg = self.ancienne_regularisation(self.employe, [c1], montant_recu='2000', crediter=True)
        self.commander_api(self.employe, self.menu_futur(), 'compte')    # monnaie dépensée
        rep = self.client_pour(self.compta).post(f"{API}/caisse/recus/{reg.id}/annuler/", {'motif': 'x'})
        self.assertEqual(rep.status_code, 400)
        self.assertEqual(self.mode(c1), 'caisse')

    def test_remboursement(self):
        self.recharger(self.employe, 1500)
        url = f'{API}/caisse/rembourser/'
        self.assertEqual(self.client_pour(self.caissier).post(url, {'user_id': self.employe.id, 'motif': 'x'}
                                                              ).status_code, 403)
        self.assertEqual(self.client_pour(self.compta).post(url, {'user_id': self.employe.id}).status_code, 400)
        # Employé parti (désactivé) : remboursable
        self.employe.is_active = False
        self.employe.save()
        rep = self.client_pour(self.compta).post(url, {'user_id': self.employe.id, 'motif': 'Départ'})
        self.assertEqual(rep.status_code, 201, rep.data)
        self.assertEqual((rep.data['type'], rep.data['montant'], rep.data['encaissement'], rep.data['solde_apres']),
                         ('remboursement', 1500.0, -1500.0, 0.0))
        self.assertEqual(self.solde(self.employe), D('0'))
        rep = self.client_pour(self.compta).post(url, {'user_id': self.employe.id, 'motif': 'Départ'})
        self.assertEqual(rep.status_code, 400)
        self.assertIn('rien à rembourser', str(rep.data))
        # Hors clôture de caisse
        self.assertEqual(cr.recus_a_cloturer(self.compta).count(), 0)
        self.verifier_grand_livre()


class PermissionsCaisseTests(_CaisseBase):

    ROUTES_CAISSE = ['caisse/contexte/', 'caisse/employes/?q=emp', 'caisse/recus/', 'caisse/clotures/',
                     'caisse/journal/']

    def test_matrice(self):
        recu = self.recharger(self.employe, 1000)
        # Employé, gestionnaire, prestataire : pas de caisse
        for qui in (self.employe, self.gestionnaire, self.agent_a, self.resp_a):
            client = self.client_pour(qui)
            for route in self.ROUTES_CAISSE:
                self.assertEqual(client.get(f'{API}/{route}').status_code, 403, (qui.username, route))
            self.assertEqual(client.post(f'{API}/caisse/recharger/', {'user_id': self.employe.id, 'montant': 10}
                                         ).status_code, 403)
        # Caissier : la caisse, rien d'autre du back-office
        caisse = self.client_pour(self.caissier)
        for route in self.ROUTES_CAISSE:
            self.assertEqual(caisse.get(f'{API}/{route}').status_code, 200, route)
        for route in ('users/', 'facturation/clotures/', 'facturation/prestataires/', 'retraits/',
                      'dashboard-cantine/', 'caisse/comptes/', 'controle-retraits/'):
            self.assertEqual(caisse.get(f'{API}/{route}').status_code, 403, route)
        self.assertEqual(caisse.post(f'{API}/caisse/rembourser/', {'user_id': self.employe.id, 'motif': 'x'}
                                     ).status_code, 403)
        # Mais il reste un employé : son compte repas
        self.assertEqual(caisse.get(f'{API}/compte-repas/').status_code, 200)
        # Comptabilité : contrôle, pas d'encaissement
        compta = self.client_pour(self.compta)
        for route in self.ROUTES_CAISSE + ['caisse/comptes/']:
            self.assertEqual(compta.get(f'{API}/{route}').status_code, 200, route)
        self.assertEqual(compta.post(f'{API}/caisse/recharger/', {'user_id': self.employe.id, 'montant': 10}
                                     ).status_code, 403)
        self.assertEqual(compta.get(f'{API}/users/').status_code, 403)
        # Administrateur : tout
        admin = self.client_pour(self.admin)
        for route in self.ROUTES_CAISSE + ['caisse/comptes/']:
            self.assertEqual(admin.get(f'{API}/{route}').status_code, 200, route)
        self.assertEqual(admin.post(f"{API}/caisse/recus/{recu['id']}/annuler/", {'motif': 'x'}).status_code, 200)
        # Gestionnaire : soldes de ses agences en lecture seule
        r = self.client_pour(self.gestionnaire).get(f'{API}/caisse/comptes/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual([x['matricule'] for x in r.data['results']], ['emp1'])
        # Prestataire : pas de compte repas
        self.assertEqual(self.client_pour(self.agent_a).get(f'{API}/compte-repas/').status_code, 403)

    def test_recherche_champs_minimaux(self):
        self.recharger(self.employe, 1200)
        r = self.client_pour(self.caissier).get(f'{API}/caisse/employes/', {'q': 'emp1'})
        self.assertEqual(r.status_code, 200)
        res = r.data['resultats'][0]
        self.assertEqual(set(res), {'id', 'nom', 'prenoms', 'nom_prenom', 'matricule', 'agence', 'actif', 'solde'})
        self.assertEqual((res['matricule'], res['solde'], res['agence']), ('emp1', 1200.0, 'Siège'))
        # Nom + prénoms, badge exact en tête ; comptes prestataires exclus
        noms = [x['matricule'] for x in self.client_pour(self.caissier).get(
            f'{API}/caisse/employes/', {'q': 'EMP1 test'}).data['resultats']]
        self.assertEqual(noms, ['emp1'])
        noms = [x['matricule'] for x in self.client_pour(self.caissier).get(
            f'{API}/caisse/employes/', {'q': 'agent'}).data['resultats']]
        self.assertEqual(noms, [])
        self.assertEqual(self.client_pour(self.caissier).get(f'{API}/caisse/employes/', {'q': 'e'}).status_code, 400)

    def test_recus_visibles(self):
        r = self.recharger(self.employe, 1000)
        self.recharger(self.employe2, 1000, par=self.caissier2)
        self.assertEqual(self.client_pour(self.caissier).get(f'{API}/caisse/recus/').data['count'], 1)
        self.assertEqual(self.client_pour(self.caissier2).get(f"{API}/caisse/recus/{r['id']}/").status_code, 404)
        self.assertEqual(self.client_pour(self.compta).get(f'{API}/caisse/recus/').data['count'], 2)

    def test_roles_cumul(self):
        admin = self.client_pour(self.admin)
        r = admin.patch(f'{API}/users/{self.employe2.id}/',
                        {'groups': [self.groupes['employe'].id, self.groupes['caissier'].id]}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        r = admin.patch(f'{API}/users/{self.agent_a.id}/',
                        {'groups': [self.groupes['agent_comptoir'].id, self.groupes['caissier'].id]}, format='json')
        self.assertEqual(r.status_code, 400)
        r = admin.patch(f'{API}/users/{self.agent_a.id}/',
                        {'groups': [self.groupes['agent_comptoir'].id, self.groupes['comptabilite'].id]},
                        format='json')
        self.assertEqual(r.status_code, 400)


class MonCompteTests(_CaisseBase):

    def test_mon_compte_et_mes_recus(self):
        self.recharger(self.employe, 1500)
        menu_a, menu_b = self.menu_futur(5), self.menu_futur(6)
        a = self.commander_api(self.employe, menu_a, 'compte')                   # débité à la commande
        b = self.commander_api(self.employe, menu_b)                             # 500 < 1000 : retenue
        self.assertEqual(b['mode_paiement'], 'retenue')
        d = menu_a.date_menu
        r = self.client_pour(self.employe).get(f'{API}/compte-repas/', {'annee': d.year, 'mois': d.month})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['solde'], 500.0)
        statuts = {x['commande_id']: (x['statut'], x['statut_libelle'], x['mode_modifiable']) for x in r.data['repas']}
        self.assertEqual(statuts[a['id']], ('debite_compte', 'Payé par le compte repas', True))
        if menu_b.date_menu.month == d.month:
            self.assertEqual(statuts[b['id']][0], 'retenue_prevue')
            self.assertEqual(r.data['reste_a_payer_prevu'], 1000.0)
        self.assertEqual([m['type'] for m in r.data['derniers_mouvements']], ['debit_repas', 'recharge'])
        recus = self.client_pour(self.employe).get(f'{API}/compte-repas/recus/').data
        self.assertEqual(recus['count'], 1)
        rid = recus['results'][0]['id']
        rep = self.client_pour(self.employe).get(f'{API}/compte-repas/recus/{rid}/pdf/')
        self.assertEqual(rep.status_code, 200)
        self.assertTrue(b''.join(rep.streaming_content).startswith(b'%PDF'))
        self.assertEqual(self.client_pour(self.employe2).get(f'{API}/compte-repas/recus/{rid}/pdf/').status_code, 404)
        self.assertEqual(self.client_pour(self.employe2).get(f'{API}/compte-repas/recus/').data['count'], 0)
        self.assertEqual(self.client_pour(self.employe).get(f'{API}/compte-repas/mouvements/').data['count'], 2)
        self.assertEqual(self.client_pour(self.employe2).get(f'{API}/compte-repas/').data['solde'], 0.0)


class ConcurrenceDebitTests(TransactionTestCase):
    """
    Deux paiements par le compte simultanés (passage au compte de deux commandes) sur un
    solde qui n'en couvre qu'un : un seul passe (select_for_update), le solde ne devient
    jamais négatif.
    """

    def test_debits_simultanes(self):
        from rest_framework.exceptions import ValidationError as ErreurApi
        statut = Statut.objects.create(libelle_statut='Actif')
        user = User.objects.create_user(username='conc', password='x', nom='C', prenom='C', statut=statut)
        agence = Agence.objects.create(nom_agence='Siège')
        equipe = TypeEquipe.objects.create(libelle='Jour')
        plat = Plat.objects.create(nom='Garba', type_plat=TypePlat.objects.create(libelle='P'), agence=agence)
        debut = timezone.now() - timedelta(days=10)
        cat = Categoriesalarie.objects.create(libelle='Agent')
        PlatCategoriesalarie.objects.create(categoriesalarie=cat, montant=D('1000'), statut=statut, date_debut=debut)
        UserCategoriesalarie.objects.create(user=user, categoriesalarie=cat, statut=statut, date_debut=debut)
        commandes = []
        for i in range(2):
            menu = Menu.objects.create(date_menu=timezone.localdate() + timedelta(days=5 + i), agence=agence,
                                       typeequipe=equipe)
            commandes.append(Commande.objects.create(user=user, menu=menu, plat=plat))
        CompteRepas.objects.create(user=user, solde=D('1500'))

        barriere = threading.Barrier(2)
        resultats = []

        def payer(commande):
            try:
                barriere.wait()
                try:
                    cr.changer_mode(commande, 'compte', user)
                    resultats.append(True)
                except ErreurApi as e:
                    self.assertIn('Solde insuffisant : 500 F disponibles', str(e.detail))
                    resultats.append(False)
            finally:
                connection.close()

        fils = [threading.Thread(target=payer, args=(c,)) for c in commandes]
        for f in fils:
            f.start()
        for f in fils:
            f.join()
        self.assertEqual(sorted(resultats), [False, True])
        compte = CompteRepas.objects.get(user=user)
        self.assertEqual(compte.solde, D('500'))
        self.assertEqual(ReglementRepas.objects.count(), 1)
        self.assertEqual(sorted(Commande.objects.values_list('mode_paiement', flat=True)), ['compte', 'retenue'])
        self.assertEqual(cr.total_mouvements(compte), D('-1000'))   # solde initial posé hors grand livre
