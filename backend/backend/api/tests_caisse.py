"""
Tests du compte repas prépayé et de la caisse (api/comptes_repas.py, api/caisse.py).

Tous les montants sont vérifiés au franc près : un repas est payé une seule
fois (compte, caisse ou retenue) et consommé = compte + caisse + retenue.

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
    Recu, ReglementRepas, Retrait, Statut, TypeEquipe, TypePlat, User, UserAgence, UserCategoriesalarie,
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

    def regulariser(self, user, ids=None, attendu=201, par=None, **extra):
        donnees = {'user_id': user.id, **extra}
        if ids is not None:
            donnees['commande_ids'] = ids
        r = self.client_pour(par or self.caissier).post(f'{API}/caisse/regulariser/', donnees, format='json')
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
        # Régularisation (avec détail des repas) et reçu annulé : PDF aussi
        c = self.commander(self.employe2, self.jour_prec(3))
        reg = self.regulariser(self.employe2, [c.id], montant_recu=2000)
        cr.annuler_recu(Recu.objects.get(pk=reg['id']), self.compta, 'Erreur de saisie')
        rep = self.client_pour(self.compta).get(f"{API}/caisse/recus/{reg['id']}/pdf/")
        self.assertTrue(b''.join(rep.streaming_content).startswith(b'%PDF'))


class DebitAuRetraitTests(_CaisseBase):

    def test_debit_si_solde_suffisant(self):
        self.recharger(self.employe, 1500)
        c = self.commander(self.employe, self.aujourdhui)
        self.retirer(c)
        self.assertEqual(c.statut, 'retiree')
        self.assertEqual(self.mode(c), 'compte')
        self.assertEqual(self.solde(self.employe), D('500'))
        m = MouvementCompte.objects.get(type='debit_repas')
        self.assertEqual((m.montant, m.solde_apres, m.commande_id), (D('-1000'), D('500'), c.id))
        ligne = fact.lignes_facturation(Commande.objects.filter(pk=c.pk))[0]
        self.assertEqual((ligne['reglement'], ligne['montant']), ('compte', D('1000')))
        self.verifier_grand_livre()

    def test_non_couvert_si_solde_insuffisant_sans_debit_partiel(self):
        self.recharger(self.employe, 900)
        c = self.commander(self.employe, self.aujourdhui)
        self.retirer(c)
        self.assertIsNone(self.mode(c))
        self.assertEqual(self.solde(self.employe), D('900'))
        self.assertFalse(MouvementCompte.objects.filter(type='debit_repas').exists())
        # Sans compte du tout : non couvert, aucun compte créé
        c2 = self.commander(self.employe2, self.aujourdhui)
        self.retirer(c2)
        self.assertIsNone(self.mode(c2))
        self.assertFalse(CompteRepas.objects.filter(user=self.employe2).exists())

    def test_sans_tarif_non_debite(self):
        emp3 = self.creer_user('emp3', 'employe')
        self.recharger(emp3, 5000)
        c = self.commander(emp3, self.aujourdhui)
        self.retirer(c)
        self.assertIsNone(self.mode(c))
        self.assertEqual(self.solde(emp3), D('5000'))

    def test_debit_au_comptoir_prestataire_et_recredit_agent_2_minutes(self):
        self.recharger(self.employe, 3000)
        menu = self.menu_du_jour()
        c = Commande.objects.create(user=self.employe, menu=menu, plat=self.plat_a)
        agent = self.client_pour(self.agent_a)
        r = agent.post(f'{API}/prestataire/comptoir/valider/',
                       {'menu_id': menu.id, 'user_id': self.employe.id, 'mode': 'scan'})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.mode(c), 'compte')
        self.assertEqual(self.solde(self.employe), D('2000'))
        r = agent.post(f"{API}/prestataire/comptoir/retraits/{r.data['id']}/annuler/")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIsNone(self.mode(c))
        self.assertEqual(self.solde(self.employe), D('3000'))
        self.assertEqual(MouvementCompte.objects.filter(type='recredit').get().montant, D('1000'))
        # Nouveau retrait : débité de nouveau, une seule fois
        r = agent.post(f'{API}/prestataire/comptoir/valider/',
                       {'menu_id': menu.id, 'user_id': self.employe.id, 'mode': 'saisie'})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.solde(self.employe), D('2000'))
        self.assertEqual(ReglementRepas.objects.filter(commande=c).count(), 1)
        self.verifier_grand_livre()

    def test_recredit_annulation_par_le_gestionnaire(self):
        self.recharger(self.employe, 1000)
        c = self.commander(self.employe, self.aujourdhui)
        self.retirer(c)
        self.assertEqual(self.solde(self.employe), D('0'))
        r = self.client_pour(self.gestionnaire).post(f'{API}/commandes/{c.id}/annuler-retrait/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self.solde(self.employe), D('1000'))
        self.assertIsNone(self.mode(c))
        # Par DELETE /retraits/<id>/ aussi
        self.retirer(c)
        self.assertEqual(self.solde(self.employe), D('0'))
        retrait = Retrait.objects.get(user=self.employe, menu=c.menu)
        self.assertEqual(self.client_pour(self.gestionnaire).delete(f'{API}/retraits/{retrait.id}/').status_code, 204)
        self.assertEqual(self.solde(self.employe), D('1000'))
        self.verifier_grand_livre()

    def test_retrait_annule_repas_paye_caisse_reste_paye(self):
        c = self.commander(self.employe, self.aujourdhui)
        self.retirer(c)
        self.regulariser(self.employe, [c.id])
        self.client_pour(self.gestionnaire).post(f'{API}/commandes/{c.id}/annuler-retrait/')
        # Le repas reste commandé (dû) et payé à la caisse : pas de crédit
        self.assertEqual(self.mode(c), 'caisse')
        self.assertEqual(self.solde(self.employe), D('0'))

    def test_contestation_erreur_comptoir_recredit_et_jamais_facture(self):
        self.recharger(self.employe, 1500)
        c = self.commander(self.employe, self.aujourdhui)
        self.retirer(c)
        self.assertEqual(self.solde(self.employe), D('500'))
        r = self.client_pour(self.employe).post(f'{API}/contestations-retrait/',
                                                {'commande_id': c.id, 'motif': 'absent'})
        self.assertEqual(r.status_code, 201, r.data)
        r = self.client_pour(self.gestionnaire).post(f"{API}/contestations-retrait/{r.data['id']}/accepter/",
                                                     {'cause': 'erreur_comptoir'})
        self.assertEqual(r.status_code, 200, r.data)
        c.refresh_from_db()
        self.assertEqual((c.statut, c.motif_annulation), ('annulee', 'contestation'))
        self.assertEqual(self.solde(self.employe), D('1500'))
        self.assertIsNone(self.mode(c))
        self.assertEqual(fact.lignes_facturation(Commande.objects.filter(pk=c.pk)), [])
        self.verifier_grand_livre()

    def test_contestation_erreur_comptoir_repas_paye_caisse_credite(self):
        c = self.commander(self.employe, self.aujourdhui)
        self.retirer(c)
        self.regulariser(self.employe, [c.id], montant_recu=1000)
        r = self.client_pour(self.employe).post(f'{API}/contestations-retrait/',
                                                {'commande_id': c.id, 'motif': 'absent'})
        self.client_pour(self.gestionnaire).post(f"{API}/contestations-retrait/{r.data['id']}/accepter/",
                                                 {'cause': 'erreur_comptoir'})
        # Repas jamais facturé : les 1 000 F payés sont crédités sur le compte
        self.assertIsNone(self.mode(c))
        self.assertEqual(self.solde(self.employe), D('1000'))
        self.verifier_grand_livre()

    def test_contestation_badge_tiers_reste_debite(self):
        self.recharger(self.employe, 1000)
        c = self.commander(self.employe, self.aujourdhui)
        self.retirer(c)
        r = self.client_pour(self.employe).post(f'{API}/contestations-retrait/',
                                                {'commande_id': c.id, 'motif': 'badge_utilise'})
        self.client_pour(self.gestionnaire).post(f"{API}/contestations-retrait/{r.data['id']}/accepter/",
                                                 {'cause': 'badge_tiers'})
        self.assertEqual(self.mode(c), 'compte')
        self.assertEqual(self.solde(self.employe), D('0'))

    def test_commande_annulee_payee_caisse_creditee(self):
        c = self.commander(self.employe, self.jour_prec(2))      # non retirée, jour passé
        self.regulariser(self.employe, [c.id])
        r = self.client_pour(self.gestionnaire).patch(f'{API}/commandes/{c.id}/annuler/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIsNone(self.mode(c))
        self.assertEqual(self.solde(self.employe), D('1000'))
        self.verifier_grand_livre()

    def test_contrainte_solde_jamais_negatif_en_base(self):
        compte = CompteRepas.objects.create(user=self.employe)
        with self.assertRaises(IntegrityError), transaction.atomic():
            CompteRepas.objects.filter(pk=compte.pk).update(solde=D('-1'))
        # Un repas n'est réglé qu'une fois (unicité en base)
        c = self.commander(self.employe, self.aujourdhui)
        ReglementRepas.objects.create(commande=c, mode='retenue', montant=D('1000'))
        with self.assertRaises(IntegrityError), transaction.atomic():
            ReglementRepas.objects.create(commande=c, mode='caisse', montant=D('1000'))


class RegularisationTests(_CaisseBase):

    def setUp(self):
        super().setUp()
        self.c1 = self.commander(self.employe, self.jour_prec(2))                # non retiré, passé
        self.c2 = self.commander(self.employe, self.aujourdhui)
        self.retirer(self.c2)                                                   # retiré, non couvert
        self.c3 = self.commander(self.employe, self.aujourdhui + timedelta(days=3))   # à venir

    def test_fiche_caisse(self):
        r = self.client_pour(self.caissier).get(f'{API}/caisse/employes/{self.employe.id}/')
        self.assertEqual(r.status_code, 200, r.data)
        statuts = {x['commande_id']: x['statut'] for x in r.data['repas']}
        self.assertEqual(statuts, {self.c1.id: 'non_couvert', self.c2.id: 'non_couvert', self.c3.id: 'a_venir'})
        self.assertEqual(r.data['totaux']['non_couvert']['montant'], 2000.0)
        self.assertEqual(r.data['totaux']['consomme']['montant'], 3000.0)
        self.assertTrue(all(x['regularisable'] for x in r.data['repas'] if x['statut'] == 'non_couvert'))
        self.assertEqual(r.data['reste_a_payer_prevu'], 3000.0)
        self.assertEqual(set(r.data['employe']), {'id', 'nom', 'prenoms', 'nom_prenom', 'matricule', 'agence',
                                                  'actif'})

    def test_partielle_monnaie_rendue_puis_creditee(self):
        reg = self.regulariser(self.employe, [self.c1.id], montant_recu=5000, monnaie='rendre')
        self.assertEqual((reg['montant'], reg['montant_recu'], reg['monnaie'], reg['monnaie_creditee'],
                          reg['encaissement'], reg['solde_apres']), (1000.0, 5000.0, 4000.0, False, 1000.0, 0.0))
        self.assertEqual([l['commande_id'] for l in reg['lignes']], [self.c1.id])
        self.assertEqual(self.mode(self.c1), 'caisse')
        self.assertIsNone(self.mode(self.c2))
        self.assertFalse(CompteRepas.objects.filter(user=self.employe, solde__gt=0).exists())
        # Le reste (c2 seulement : c3 est à venir) avec monnaie créditée
        reg = self.regulariser(self.employe, montant_recu='5000', monnaie='crediter')
        self.assertEqual([l['commande_id'] for l in reg['lignes']], [self.c2.id])
        self.assertEqual((reg['montant'], reg['monnaie'], reg['monnaie_creditee'], reg['encaissement'],
                          reg['solde_apres']), (1000.0, 4000.0, True, 5000.0, 4000.0))
        self.assertEqual(self.solde(self.employe), D('4000'))
        self.assertEqual(MouvementCompte.objects.get(type='regularisation').montant, D('4000'))
        # Plus rien à régulariser
        r = self.regulariser(self.employe, attendu=400)
        self.assertIn('Aucun repas', str(r))
        self.verifier_grand_livre()

    def test_montant_exact_par_defaut(self):
        reg = self.regulariser(self.employe, [self.c2.id, self.c1.id])
        self.assertEqual((reg['montant'], reg['montant_recu'], reg['monnaie'], reg['encaissement']),
                         (2000.0, 2000.0, 0.0, 2000.0))
        self.assertEqual([l['commande_id'] for l in reg['lignes']], [self.c1.id, self.c2.id])   # chronologique

    def test_refus(self):
        # Montant insuffisant (pas de paiement partiel d'un repas)
        r = self.regulariser(self.employe, [self.c1.id, self.c2.id], montant_recu=1500, attendu=400)
        self.assertIn('insuffisant', str(r['montant_recu']))
        # Repas à venir, d'un autre employé, en double, annulé
        self.assertIn('pas encore consommé', str(self.regulariser(self.employe, [self.c3.id], attendu=400)))
        autre = self.commander(self.employe2, self.aujourdhui)
        self.assertIn("pas une commande", str(self.regulariser(self.employe, [autre.id], attendu=400)))
        self.regulariser(self.employe, [self.c1.id, self.c1.id], attendu=400)
        annulee = self.commander(self.employe, self.jour_prec(5), statut='annulee')
        self.assertIn('annulé', str(self.regulariser(self.employe, [annulee.id], attendu=400)))
        # Déjà payé
        self.regulariser(self.employe, [self.c1.id])
        self.assertIn('déjà réglé', str(self.regulariser(self.employe, [self.c1.id], attendu=400)))
        self.regulariser(self.employe, [self.c2.id], monnaie='garder', attendu=400)
        self.regulariser(self.employe, [self.c2.id], mode='mobile_money', attendu=400)
        self.assertEqual(Recu.objects.count(), 1)

    def test_rien_sur_un_mois_cloture(self):
        self.cloturer_prec()
        # c1 (mois précédent, clôturé) : retenu sur salaire, plus régularisable
        self.assertEqual(self.mode(self.c1), 'retenue')
        r = self.regulariser(self.employe, [self.c1.id], attendu=400)
        self.assertIn('clôturé', str(r))
        statuts = {x['commande_id']: x['statut'] for x in self.client_pour(self.caissier).get(
            f'{API}/caisse/employes/{self.employe.id}/').data['repas']}
        self.assertNotIn(self.c1.id, statuts)          # fiche : mois ouverts seulement
        self.regulariser(self.employe)                  # c2 (mois en cours) reste payable
        self.assertEqual(self.mode(self.c2), 'caisse')


class ClotureMensuelleCompteTests(_CaisseBase):
    """
    Clôture : le solde restant paie d'abord tous les repas impayés du mois (retirés non
    couverts et non retirés), par date, repas entiers ; le reste est retenu ; montants figés.
    """

    def test_cloture_compte_caisse_retenue(self):
        j = self.jour_prec
        # emp1 : A retiré débité ; B retiré non couvert puis payé à la caisse ;
        # C retiré non couvert et D non retiré : débités à la clôture (recharge
        # de 2 500 F entre-temps) ; E non retiré, solde restant 500 F (→ retenue)
        self.recharger(self.employe, 1000)
        a = self.commander(self.employe, j(1)); self.retirer(a)
        b = self.commander(self.employe, j(2)); self.retirer(b)
        c = self.commander(self.employe, j(3)); self.retirer(c)
        d = self.commander(self.employe, j(4))
        e = self.commander(self.employe, j(5))
        self.assertEqual([self.mode(x) for x in (a, b, c)], ['compte', None, None])
        self.regulariser(self.employe, [b.id])
        self.recharger(self.employe, 2500)
        # emp2 : deux repas non retirés, pas de compte → retenue
        f1 = self.commander(self.employe2, j(1))
        f2 = self.commander(self.employe2, j(6), statut='retiree')
        # Repas annulés : jamais facturés
        self.commander(self.employe, j(7), statut='annulee')

        data = self.cloturer_prec()
        self.assertEqual([self.mode(x) for x in (a, b, c, d, e)], ['compte', 'caisse', 'compte', 'compte', 'retenue'])
        self.assertEqual([self.mode(x) for x in (f1, f2)], ['retenue', 'retenue'])
        self.assertEqual(self.solde(self.employe), D('500'))
        self.assertIn('(non retiré) — débité à la clôture', MouvementCompte.objects.filter(commande=d).get().libelle)
        self.assertIn('(retiré) — débité à la clôture', MouvementCompte.objects.filter(commande=c).get().libelle)

        f = FactureMensuelle.objects.get(user=self.employe)
        self.assertEqual((f.nb_repas, f.montant_total), (5, D('5000')))
        self.assertEqual((f.nb_repas_compte, f.montant_compte), (3, D('3000')))
        self.assertEqual((f.nb_repas_caisse, f.montant_caisse), (1, D('1000')))
        self.assertEqual((f.nb_repas_retenue, f.montant_retenue), (1, D('1000')))
        f_2 = FactureMensuelle.objects.get(user=self.employe2)
        self.assertEqual((f_2.montant_total, f_2.montant_compte, f_2.montant_caisse, f_2.montant_retenue),
                         (D('2000'), D('0'), D('0'), D('2000')))
        for fm in FactureMensuelle.objects.all():
            self.assertEqual(fm.montant_total, fm.montant_compte + fm.montant_caisse + fm.montant_retenue)
            self.assertEqual(fm.nb_repas, fm.nb_repas_compte + fm.nb_repas_caisse + fm.nb_repas_retenue)
            self.assertEqual(fm.montant_total, sum(l.montant for l in fm.lignes.all()))
        self.assertEqual(
            {l.commande_id: l.reglement for l in LigneFacture.objects.filter(facture=f)},
            {a.id: 'compte', b.id: 'caisse', c.id: 'compte', d.id: 'compte', e.id: 'retenue'})
        # Totaux de la clôture
        self.assertEqual((float(data['montant_total']), float(data['montant_compte']), float(data['montant_caisse']),
                          float(data['montant_retenue'])), (7000.0, 3000.0, 1000.0, 3000.0))
        self.assertEqual((data['nb_repas'], data['nb_repas_compte'], data['nb_repas_caisse'],
                          data['nb_repas_retenue']), (7, 3, 1, 3))
        # Prestataire payé pour tous les repas, quel que soit le règlement de l'employé
        self.assertEqual(float(data['montant_total_prestataires']), 7 * 900.0)
        self.verifier_grand_livre()

        # Écran de facturation : mêmes montants, figés
        debut, fin = fact.bornes_mois(self.prec.year, self.prec.month)
        params = {'date_debut': debut.isoformat(), 'date_fin': fin.isoformat()}
        v = self.client_pour(self.admin).get(f'{API}/facturation/', params).data
        self.assertEqual((v['total_montant'], v['total_compte'], v['total_caisse'], v['total_retenue']),
                         (7000.0, 3000.0, 1000.0, 3000.0))
        emp = [x for x in v['employes'] if x['username'] == 'emp1'][0]
        self.assertEqual((emp['montant_compte'], emp['montant_caisse'], emp['montant_retenue']),
                         (3000.0, 1000.0, 1000.0))

        # Figé : tarif modifié, recharge, tentatives de modification
        PlatCategoriesalarie.objects.update(montant=D('9999'))
        self.recharger(self.employe, 10000)
        self.assertEqual(self.client_pour(self.gestionnaire).post(
            f'{API}/commandes/{c.id}/annuler-retrait/').status_code, 400)
        self.regulariser(self.employe, [e.id], attendu=400)
        recu_b = Recu.objects.get(type='regularisation')
        r = self.client_pour(self.compta).post(f'{API}/caisse/recus/{recu_b.id}/annuler/', {'motif': 'Test'})
        self.assertEqual(r.status_code, 400)
        self.assertIn('clôturé', str(r.data))
        v2 = self.client_pour(self.admin).get(f'{API}/facturation/', params).data
        self.assertEqual((v2['total_montant'], v2['total_compte'], v2['total_caisse'], v2['total_retenue']),
                         (7000.0, 3000.0, 1000.0, 3000.0))
        self.assertEqual(self.mode(e), 'retenue')
        lignes = fact.lignes_facturation(Commande.objects.filter(user=self.employe, menu__date_menu__lte=fin))
        self.assertEqual(sum(l['montant'] for l in lignes), D('5000'))

        # Relevé des agents (PDF) : généré avec les colonnes compte / caisse / retenue
        from . import releves
        rel = releves.releve_agents(fact.lignes_facturation(releves.commandes_visibles(debut, fin)))
        self.assertEqual((rel['montant'], rel['montant_compte'], rel['montant_caisse'], rel['montant_retenue']),
                         (D('7000'), D('3000'), D('1000'), D('3000')))
        self.assertEqual(rel['agences'][0]['montant_retenue'], D('3000'))
        r = self.client_pour(self.gestionnaire).get(f'{API}/facturation/agents-pdf/', params)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(b''.join(r.streaming_content).startswith(b'%PDF'))

    def test_solde_utilise_avant_la_retenue(self):
        """Solde de 4 000 F et un repas retiré non couvert de 1 000 F : retenue 0 à la clôture."""
        c = self.commander(self.employe, self.jour_prec(3))
        self.retirer(c)
        self.assertIsNone(self.mode(c))                 # non couvert au retrait (pas de compte)
        self.recharger(self.employe, 4000)
        fiche = self.client_pour(self.caissier).get(f'{API}/caisse/employes/{self.employe.id}/').data
        self.assertEqual((fiche['totaux']['non_couvert']['montant'], fiche['reste_a_payer_prevu']), (1000.0, 0.0))
        data = self.cloturer_prec()
        self.assertEqual(self.mode(c), 'compte')
        self.assertEqual(self.solde(self.employe), D('3000'))
        f = FactureMensuelle.objects.get(user=self.employe)
        self.assertEqual((f.montant_total, f.montant_compte, f.montant_caisse, f.montant_retenue),
                         (D('1000'), D('1000'), D('0'), D('0')))
        self.assertEqual((float(data['montant_retenue']), data['nb_repas_retenue']), (0.0, 0))
        self.verifier_grand_livre()

    def test_repas_entiers_seulement_par_date(self):
        """Solde 1 500 F, trois repas impayés de 1 000 F : le premier débité, les deux autres retenus."""
        c1 = self.commander(self.employe, self.jour_prec(1)); self.retirer(c1)
        c2 = self.commander(self.employe, self.jour_prec(2))
        c3 = self.commander(self.employe, self.jour_prec(3)); self.retirer(c3)
        self.recharger(self.employe, 1500)
        r = self.client_pour(self.employe).get(f'{API}/compte-repas/',
                                               {'annee': self.prec.year, 'mois': self.prec.month}).data
        self.assertEqual(r['reste_a_payer_prevu'], 2000.0)
        self.cloturer_prec()
        self.assertEqual([self.mode(x) for x in (c1, c2, c3)], ['compte', 'retenue', 'retenue'])
        self.assertEqual(self.solde(self.employe), D('500'))
        f = FactureMensuelle.objects.get(user=self.employe)
        self.assertEqual((f.montant_compte, f.montant_retenue), (D('1000'), D('2000')))

    def test_mois_ouvert_totaux_provisoires(self):
        self.recharger(self.employe, 1000)
        a = self.commander(self.employe, self.jour_prec(1)); self.retirer(a)
        b = self.commander(self.employe, self.jour_prec(2)); self.retirer(b)
        self.regulariser(self.employe, [b.id])
        self.commander(self.employe, self.jour_prec(3))
        emp = fact.synthese_par_employe(fact.lignes_facturation(Commande.objects.filter(user=self.employe)))[0]
        self.assertEqual((emp['total'], emp['montant_compte'], emp['montant_caisse'], emp['montant_retenue']),
                         (D('3000'), D('1000'), D('1000'), D('1000')))


class ClotureCaisseTests(_CaisseBase):

    def test_theorique_ecart_motif_validation(self):
        r1 = self.recharger(self.employe, 1000)
        self.recharger(self.employe2, 2000)
        c = self.commander(self.employe, self.jour_prec(2))
        self.regulariser(self.employe, [c.id], montant_recu=5000, monnaie='rendre')   # 1 000 encaissés
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
        c = self.commander(self.employe, self.aujourdhui)
        self.retirer(c)                                          # 1 000 dépensés
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
        reg = self.regulariser(self.employe, [c1.id, c2.id], montant_recu=3000, monnaie='crediter')
        self.assertEqual(self.solde(self.employe), D('1000'))
        # Repas c2 annulé depuis : ses 1 000 F sont passés sur le compte
        self.client_pour(self.gestionnaire).patch(f'{API}/commandes/{c2.id}/annuler/')
        self.assertEqual(self.solde(self.employe), D('2000'))
        rep = self.client_pour(self.compta).post(f"{API}/caisse/recus/{reg['id']}/annuler/", {'motif': 'Erreur'})
        self.assertEqual(rep.status_code, 200, rep.data)
        # Monnaie créditée et repas annulé retirés du compte ; c1 redevient non couvert
        self.assertEqual(self.solde(self.employe), D('0'))
        self.assertIsNone(self.mode(c1))
        self.assertEqual(self.client_pour(self.caissier).get(
            f'{API}/caisse/employes/{self.employe.id}/').data['totaux']['non_couvert']['nb'], 1)
        self.verifier_grand_livre()

    def test_annulation_regularisation_refusee_si_monnaie_utilisee(self):
        c1 = self.commander(self.employe, self.jour_prec(2))
        reg = self.regulariser(self.employe, [c1.id], montant_recu=2000, monnaie='crediter')
        c2 = self.commander(self.employe, self.aujourdhui)
        self.retirer(c2)                                     # monnaie dépensée
        rep = self.client_pour(self.compta).post(f"{API}/caisse/recus/{reg['id']}/annuler/", {'motif': 'x'})
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
        a = self.commander(self.employe, self.aujourdhui)
        self.retirer(a)                                                          # débité
        b = self.commander(self.employe, self.aujourdhui + timedelta(days=2))    # à venir : 500 < 1000
        r = self.client_pour(self.employe).get(f'{API}/compte-repas/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['solde'], 500.0)
        statuts = {x['commande_id']: (x['statut'], x['statut_libelle']) for x in r.data['repas']}
        self.assertEqual(statuts[a.id], ('debite_compte', 'Débité du compte repas'))
        if b.menu.date_menu.month == self.aujourdhui.month:
            self.assertEqual(statuts[b.id][0], 'a_venir')
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
    """Deux débits simultanés sur un solde qui n'en couvre qu'un : un seul passe (select_for_update)."""

    def test_debits_simultanes(self):
        statut = Statut.objects.create(libelle_statut='Actif')
        user = User.objects.create_user(username='conc', password='x', nom='C', prenom='C', statut=statut)
        agence = Agence.objects.create(nom_agence='Siège')
        equipe = TypeEquipe.objects.create(libelle='Jour')
        plat = Plat.objects.create(nom='Garba', type_plat=TypePlat.objects.create(libelle='P'), agence=agence)
        debut = timezone.now() - timedelta(days=10)
        cat = Categoriesalarie.objects.create(libelle='Agent')
        PlatCategoriesalarie.objects.create(categoriesalarie=cat, montant=D('1000'), statut=statut, date_debut=debut)
        UserCategoriesalarie.objects.create(user=user, categoriesalarie=cat, statut=statut, date_debut=debut)
        p = Prestataire.objects.create(libelle='P', statut=statut, date_debut=debut)
        AgencePrestataire.objects.create(prestataire=p, agence=agence, statut=statut, date_debut=debut)
        PlatPrestataire.objects.create(prestataire=p, montant=D('900'), statut=statut, date_debut=debut)
        commandes = []
        for i in range(2):
            menu = Menu.objects.create(date_menu=timezone.localdate(), agence=agence, typeequipe=equipe)
            commandes.append(Commande.objects.create(user=user, menu=menu, plat=plat, statut='retiree'))
        CompteRepas.objects.create(user=user, solde=D('1500'))

        barriere = threading.Barrier(2)
        resultats = []

        def debiter(commande):
            try:
                c = Commande.objects.select_related('menu', 'plat').get(pk=commande.pk)
                barriere.wait()
                with transaction.atomic():
                    resultats.append(cr.debiter_si_possible(c, None) is not None)
            finally:
                connection.close()

        fils = [threading.Thread(target=debiter, args=(c,)) for c in commandes]
        for f in fils:
            f.start()
        for f in fils:
            f.join()
        self.assertEqual(sorted(resultats), [False, True])
        compte = CompteRepas.objects.get(user=user)
        self.assertEqual(compte.solde, D('500'))
        self.assertEqual(ReglementRepas.objects.count(), 1)
        self.assertEqual(cr.total_mouvements(compte), D('-1000'))   # solde initial posé hors grand livre
