"""
Tarifs par type de plat (employé et prestataire) et équipes « repas offert ».

Lancer : python manage.py test api.tests_tarifs_offerts
"""
from datetime import timedelta
from decimal import Decimal as D
from unittest.mock import patch

from django.utils import timezone

from . import comptes_repas as cr
from . import facturation as fact
from .models import (
    Categoriesalarie, Commande, Menu, MenuPlat, Plat, PlatCategoriesalarie, PlatPrestataire, TypeEquipe, TypePlat,
    UserAgence, UserCategoriesalarie,
)
from .tests import API, _EspacePrestataireBase, _synchrone


class _TarifsBase(_EspacePrestataireBase):

    def setUp(self):
        super().setUp()
        self.debut = timezone.now() - timedelta(days=400)
        self.standard = TypePlat.objects.create(libelle='Standard')
        self.complet = TypePlat.objects.create(libelle='Complet')
        self.cat = Categoriesalarie.objects.create(libelle='Agent')
        for u in (self.employe, self.employe2):
            UserCategoriesalarie.objects.create(user=u, categoriesalarie=self.cat, statut=self.statut,
                                                date_debut=self.debut)
        UserAgence.objects.create(user=self.employe2, agence=self.agence, statut=self.statut, date_debut=self.debut)
        self.tarif(D('1000'))                      # tous types (tarif historique)
        self.tarif(D('1500'), self.complet)
        PlatPrestataire.objects.filter(prestataire=self.presta_a).update(type_plat=None)   # 900 F tous types
        PlatPrestataire.objects.create(prestataire=self.presta_a, type_plat=self.complet, montant=D('1300'),
                                       statut=self.statut, date_debut=self.debut)
        self.plat_a.type_plat = self.standard
        self.plat_a.save()
        self.plat_c = Plat.objects.create(nom='Tchêp au poulet', type_plat=self.complet, agence=self.agence,
                                          prestataire=self.presta_a)
        self.plat_c.agences.set([self.agence])
        self.nuit = TypeEquipe.objects.create(libelle='Nuit')

    def tarif(self, montant, type_plat=None):
        return PlatCategoriesalarie.objects.create(categoriesalarie=self.cat, type_plat=type_plat, montant=montant,
                                                   statut=self.statut, date_debut=self.debut)

    def menu(self, jours=5, equipe=None):
        m = Menu.objects.create(date_menu=timezone.localdate() + timedelta(days=jours), agence=self.agence,
                                typeequipe=equipe or self.typeequipe, prestataire=self.presta_a)
        for p in (self.plat_a, self.plat_c):
            MenuPlat.objects.create(menu=m, plat=p)
        return m

    def commander(self, menu, plat, mode=None, user=None):
        donnees = {'menu_id': menu.id, 'plat_id': plat.id}
        if mode:
            donnees['mode_paiement'] = mode
        with patch('api.signals._en_arriere_plan', _synchrone):
            return self.client_pour(user or self.employe).post(f'{API}/commandes/', donnees, format='json')


class TarifsParTypeTests(_TarifsBase):

    def test_prix_employe_et_prestataire_selon_le_type(self):
        t = fact.Tarificateur({self.employe.id})
        d = timezone.localdate()
        self.assertEqual(t.prix(self.employe.id, d, self.complet.id)[1], D('1500'))
        self.assertEqual(t.prix(self.employe.id, d, self.standard.id)[1], D('1000'))   # tous types
        self.assertEqual(t.prix(self.employe.id, d)[1], D('1000'))
        tp = fact.TarificateurPrestataire()
        self.assertEqual(tp.prix(self.agence.id, d, self.presta_a, self.complet.id)[1], D('1300'))
        self.assertEqual(tp.prix(self.agence.id, d, self.presta_a, self.standard.id)[1], D('900'))

    def test_parcours_prix_par_plat_et_debit_du_compte(self):
        m = self.menu()
        r = self.client_pour(self.employe).get(f'{API}/commander/jours/', {
            'agence': self.agence.id, 'prestataire': self.presta_a.id, 'semaine': m.date_menu.isoformat()})
        jour = next(j for j in r.data['jours'] if j['date'] == m.date_menu.isoformat())
        prix = {p['nom']: p['prix'] for p in jour['plats']}
        self.assertEqual(prix, {'Alloco poulet': 1000.0, 'Tchêp au poulet': 1500.0})
        r = self.client_pour(self.employe).get(f'{API}/compte-repas/paiement/', {'menu': m.id, 'plat': self.plat_c.id})
        self.assertEqual((r.data['prix'], r.data['offert']), (1500.0, False))
        cr.recharger(self.employe, D('5000'), self.admin)
        r = self.commander(m, self.plat_c, 'compte')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(cr.solde(self.employe), D('3500'))
        # Facturation employé et relevé prestataire au tarif du type
        ligne = fact.lignes_facturation(Commande.objects.filter(pk=r.data['id']))[0]
        self.assertEqual(ligne['montant'], D('1500'))
        lp = fact.lignes_prestataires(Commande.objects.filter(pk=r.data['id']))[0]
        self.assertEqual((lp['montant'], lp['type_plat'], lp['offert']), (D('1300'), 'Complet', False))

    def test_un_tarif_en_vigueur_par_type(self):
        url = f'{API}/plat-categoriesalaries/'
        base = {'categoriesalarie': self.cat.id, 'montant': '1800', 'statut': self.statut.id,
                'date_debut': timezone.now().isoformat()}
        # Complet déjà en vigueur : refusé ; Cadre / autre type : accepté
        r = self.client_pour(self.admin).post(url, {**base, 'type_plat': self.complet.id}, format='json')
        self.assertEqual(r.status_code, 400)
        autre = TypePlat.objects.create(libelle='Léger')
        r = self.client_pour(self.admin).post(url, {**base, 'type_plat': autre.id}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['type_plat_libelle'], 'Léger')


class RepasOffertTests(_TarifsBase):

    def setUp(self):
        super().setUp()
        self.nuit.repas_offert = True
        self.nuit.save()

    def test_commande_offerte_sans_paiement(self):
        m = self.menu(equipe=self.nuit)
        r = self.client_pour(self.employe).get(f'{API}/commander/jours/', {
            'agence': self.agence.id, 'prestataire': self.presta_a.id, 'equipe': self.nuit.id,
            'semaine': m.date_menu.isoformat()})
        jour = next(j for j in r.data['jours'] if j['date'] == m.date_menu.isoformat())
        self.assertTrue(all(p['offert'] and p['prix'] is None for p in jour['plats']))
        self.assertTrue(r.data['equipe']['repas_offert'])
        r = self.client_pour(self.employe).get(f'{API}/compte-repas/paiement/', {'menu': m.id, 'plat': self.plat_c.id})
        self.assertEqual((r.data['offert'], r.data['mode_par_defaut'], r.data['prix']), (True, 'offert', 0.0))
        cr.recharger(self.employe, D('5000'), self.admin)
        r = self.commander(m, self.plat_c, 'compte')          # mode demandé ignoré
        self.assertEqual((r.status_code, r.data['mode_paiement']), (201, 'offert'))
        self.assertEqual(cr.solde(self.employe), D('5000'))
        # Mode non modifiable
        r = self.client_pour(self.employe).post(f'{API}/commandes/{r.data["id"]}/mode-paiement/',
                                                {'mode_paiement': 'compte'}, format='json')
        self.assertEqual(r.status_code, 400)
        # Le client ne peut pas demander « offert » dans une équipe payante
        r = self.commander(self.menu(6), self.plat_a, 'offert')
        self.assertEqual(r.status_code, 400)

    def test_facturation_statistiques_et_prestataire(self):
        m = self.menu(equipe=self.nuit)
        self.commander(m, self.plat_c)
        self.commander(m, self.plat_a, user=self.employe2)
        payant = self.menu(5)
        self.commander(payant, self.plat_a, user=self.employe2)   # 2e repas le même jour : refusé
        qs = Commande.objects.filter(menu=m)
        # Employés : hors facturation
        self.assertEqual(fact.lignes_facturation(qs), [])
        # Prestataire : payé au tarif du type, signalé « offert »
        lignes = fact.lignes_prestataires(qs)
        self.assertEqual(sorted((l['montant'], l['offert']) for l in lignes), [(D('900'), True), (D('1300'), True)])
        # Statistiques : nombre, valeur au tarif employé, coût prestataire
        debut = (timezone.localdate()).isoformat()
        fin = (timezone.localdate() + timedelta(days=10)).isoformat()
        r = self.client_pour(self.admin).get(f'{API}/statistiques/', {'debut': debut, 'fin': fin})
        ro = r.data['repas_offerts']
        self.assertEqual((ro['nb'], ro['valeur_employe'], ro['cout_prestataire']), (2, D('2500'), D('2200')))
        self.assertEqual({(g['equipe'], g['type_plat']) for g in ro['par_equipe']},
                         {('Nuit', 'Complet'), ('Nuit', 'Standard')})
        r = self.client_pour(self.admin).get(f'{API}/facturation/', {'date_debut': debut, 'date_fin': fin})
        self.assertEqual(r.data['repas_offerts']['nb'], 2)

    def test_seules_les_nouvelles_commandes_sont_offertes(self):
        self.nuit.repas_offert = False
        self.nuit.save()
        m = self.menu(equipe=self.nuit)
        r = self.commander(m, self.plat_c)
        self.assertEqual(r.data['mode_paiement'], 'retenue')
        self.nuit.repas_offert = True
        self.nuit.save()
        self.assertEqual(Commande.objects.get(pk=r.data['id']).mode_paiement, 'retenue')
        r = self.commander(self.menu(6, self.nuit), self.plat_a)
        self.assertEqual(r.data['mode_paiement'], 'offert')


class GrilleTarifsTests(_TarifsBase):

    def test_grille_employes_et_nouveau_tarif(self):
        r = self.client_pour(self.gestionnaire).get(f'{API}/tarifs/grille/', {'cible': 'employes'})
        self.assertEqual(r.status_code, 200, r.data)
        agent = next(l for l in r.data['lignes'] if l['libelle'] == 'Agent')
        self.assertEqual((agent['cases']['tous']['montant'], agent['cases'][str(self.complet.id)]['montant']),
                         (1000.0, 1500.0))
        self.assertIsNone(agent['cases'][str(self.standard.id)])
        # Gestionnaire : lecture seule
        demain = (timezone.localdate() + timedelta(days=1)).isoformat()
        donnees = {'cible': 'employes', 'proprietaire': self.cat.id, 'type_plat': self.complet.id,
                   'montant': '1600', 'date_debut': demain}
        self.assertEqual(self.client_pour(self.gestionnaire).post(f'{API}/tarifs/grille/', donnees,
                                                                  format='json').status_code, 403)
        r = self.client_pour(self.admin).post(f'{API}/tarifs/grille/', donnees, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['ancien_cloture_le'], timezone.localdate().isoformat())
        t = fact.Tarificateur({self.employe.id})
        self.assertEqual(t.prix(self.employe.id, timezone.localdate(), self.complet.id)[1], D('1500'))
        self.assertEqual(t.prix(self.employe.id, timezone.localdate() + timedelta(days=1), self.complet.id)[1],
                         D('1600'))
        # Même date : refusé
        self.assertEqual(self.client_pour(self.admin).post(f'{API}/tarifs/grille/', donnees,
                                                           format='json').status_code, 400)

    def test_grille_prestataires_case_tous_types(self):
        r = self.client_pour(self.admin).post(f'{API}/tarifs/grille/', {
            'cible': 'prestataires', 'proprietaire': self.presta_a.id, 'type_plat': None, 'montant': '950',
            'date_debut': (timezone.localdate() + timedelta(days=2)).isoformat()}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        r = self.client_pour(self.admin).get(f'{API}/tarifs/grille/', {
            'cible': 'prestataires', 'date': (timezone.localdate() + timedelta(days=3)).isoformat()})
        a = next(l for l in r.data['lignes'] if l['id'] == self.presta_a.id)
        self.assertEqual((a['cases']['tous']['montant'], a['cases'][str(self.complet.id)]['montant']), (950.0, 1300.0))
