"""
Tests de l'API Ubifood : droits par rôle, commandes, retraits, mot de passe oublié.

Lancer : python manage.py test api
"""

import os
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import (
    Agence, AgencePrestataire, Categoriesalarie, Commande, Menu, MenuPlat, Plat,
    PlatCategoriesalarie, PlatPrestataire, Prestataire, Statut, TypeEquipe, TypePlat,
    User, UserAgence, UserAllergie, UserCategoriesalarie,
)

API = '/api/api'
MDP = 'MotDePasse#2026'


class BaseAPITestCase(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.statut = Statut.objects.create(libelle_statut='Actif')
        cls.groupes = {
            nom: Group.objects.get_or_create(name=nom)[0]
            for nom in ('super_admin', 'admin', 'gestionnaire', 'employe')
        }
        cls.super_admin  = cls.creer_user('sadmin', 'super_admin')
        cls.admin        = cls.creer_user('admin1', 'admin')
        cls.gestionnaire = cls.creer_user('gest1', 'gestionnaire')
        cls.employe      = cls.creer_user('emp1', 'employe', contact='+2250700000001')
        cls.employe2     = cls.creer_user('emp2', 'employe')

        cls.agence     = Agence.objects.create(nom_agence='Siège')
        cls.typeequipe = TypeEquipe.objects.create(libelle='Jour')
        cls.typeplat   = TypePlat.objects.create(libelle='Plat principal')
        cls.plat1 = Plat.objects.create(nom='Garba', type_plat=cls.typeplat, agence=cls.agence)
        cls.plat2 = Plat.objects.create(nom='Attiéké poulet', type_plat=cls.typeplat, agence=cls.agence)

        UserAgence.objects.create(user=cls.employe, agence=cls.agence, statut=cls.statut,
                                  date_debut=timezone.now() - timedelta(days=30))

    @classmethod
    def creer_user(cls, username, role, contact=''):
        user = User.objects.create_user(
            username=username, password=MDP, nom=username.upper(), prenom='Test',
            contact=contact, poste_telephone='', statut=cls.statut,
        )
        user.groups.add(cls.groupes[role])
        return user

    def creer_menu(self, jours=5, plats=None):
        menu = Menu.objects.create(
            date_menu=(timezone.localdate() + timedelta(days=jours)),
            agence=self.agence, typeequipe=self.typeequipe,
        )
        for plat in plats or [self.plat1, self.plat2]:
            MenuPlat.objects.create(menu=menu, plat=plat)
        return menu

    def client_pour(self, user=None):
        client = APIClient()
        if user:
            client.force_authenticate(user)
        return client


class DroitsParRoleTests(BaseAPITestCase):

    def test_inscription_publique_interdite(self):
        r = self.client_pour().post(f'{API}/users/register/', {
            'username': 'pirate', 'password': MDP, 'password2': MDP,
            'nom': 'X', 'prenom': 'Y', 'contact': '', 'poste_telephone': '',
            'statut': self.statut.id, 'groups': [self.groupes['admin'].id],
        }, format='json')
        self.assertEqual(r.status_code, 401)
        self.assertFalse(User.objects.filter(username='pirate').exists())

    def test_employe_ne_peut_pas_gerer_les_comptes(self):
        client = self.client_pour(self.employe)
        self.assertEqual(client.get(f'{API}/users/').status_code, 403)
        r = client.patch(f'{API}/users/desactiver-multiple/', {'ids': [self.admin.id]}, format='json')
        self.assertEqual(r.status_code, 403)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_me_renvoie_les_roles(self):
        r = self.client_pour(self.gestionnaire).get(f'{API}/users/me/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['roles'], ['gestionnaire'])

    def test_admin_ne_peut_pas_attribuer_super_admin(self):
        r = self.client_pour(self.admin).patch(
            f'{API}/users/{self.employe.id}/',
            {'groups': [self.groupes['super_admin'].id]}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.client_pour(self.super_admin).patch(
            f'{API}/users/{self.employe.id}/',
            {'groups': [self.groupes['super_admin'].id]}, format='json')
        self.assertEqual(r.status_code, 200)

    def test_admin_ne_peut_pas_desactiver_un_super_admin(self):
        r = self.client_pour(self.admin).patch(f'{API}/users/{self.super_admin.id}/desactiver/')
        self.assertEqual(r.status_code, 403)

    def test_roles_systeme_non_supprimables(self):
        r = self.client_pour(self.admin).delete(f'{API}/groups/{self.groupes["admin"].id}/')
        self.assertEqual(r.status_code, 403)

    def test_referentiels_lecture_tous_ecriture_admin(self):
        employe = self.client_pour(self.employe)
        self.assertEqual(employe.get(f'{API}/agences/').status_code, 200)
        self.assertEqual(employe.post(f'{API}/agences/', {'nom_agence': 'X'}).status_code, 403)
        self.assertEqual(
            self.client_pour(self.admin).post(f'{API}/agences/', {'nom_agence': 'X'}).status_code, 201)

    def test_menus_ecriture_gestionnaire(self):
        data = {'date_menu': str(timezone.localdate()), 'agence': self.agence.id,
                'typeequipe': self.typeequipe.id}
        self.assertEqual(self.client_pour(self.employe).post(f'{API}/menus/', data).status_code, 403)
        self.assertEqual(self.client_pour(self.gestionnaire).post(f'{API}/menus/', data).status_code, 201)

    def test_endpoints_sensibles_fermes_aux_anonymes(self):
        anonyme = self.client_pour()
        for url in ('/simulation/', '/allnopagin/groups/', '/allnopagin/agences/',
                    '/etat-entretien-groupes/', '/allnopagin/vehicules/'):
            self.assertEqual(anonyme.get(f'{API}{url}').status_code, 401, url)

    def test_simulation_reservee_aux_admins(self):
        self.assertEqual(self.client_pour(self.employe).get(f'{API}/simulation/').status_code, 403)
        self.assertEqual(self.client_pour(self.admin).get(f'{API}/simulation/').status_code, 200)

    def test_changer_son_mot_de_passe(self):
        client = self.client_pour(self.employe)
        url = f'{API}/users/{self.employe.id}/changer-mot-de-passe/'
        self.assertEqual(client.patch(url, {'old_password': 'faux', 'password': 'Nouveau#2026'}).status_code, 400)
        self.assertEqual(client.patch(url, {'old_password': MDP, 'password': 'Nouveau#2026'}).status_code, 200)
        url_autre = f'{API}/users/{self.employe2.id}/changer-mot-de-passe/'
        self.assertEqual(client.patch(url_autre, {'password': 'Nouveau#2026'}).status_code, 403)

    def test_liste_complete_des_agents_pour_gestionnaire(self):
        self.assertEqual(self.client_pour(self.employe).get(f'{API}/allnopagin/users/').status_code, 403)
        r = self.client_pour(self.gestionnaire).get(f'{API}/allnopagin/users/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), User.objects.count())

    def test_pagination_page_size(self):
        for i in range(15):
            Agence.objects.create(nom_agence=f'A{i}')
        r = self.client_pour(self.employe).get(f'{API}/agences/', {'page_size': 50})
        self.assertEqual(len(r.data['results']), 16)


class AllergiesTests(BaseAPITestCase):

    def test_employe_ne_voit_et_ne_cree_que_ses_allergies(self):
        UserAllergie.objects.create(user=self.employe2, libelle='Arachide')
        client = self.client_pour(self.employe)
        r = client.post(f'{API}/user-allergies/', {'user': self.employe2.id, 'libelle': 'Lait'})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['user'], self.employe.id)
        r = client.get(f'{API}/user-allergies/')
        self.assertEqual([a['libelle'] for a in r.data['results']], ['Lait'])


class CommandeTests(BaseAPITestCase):

    def test_commande_puis_doublon_meme_jour_refuse(self):
        menu = self.creer_menu()
        client = self.client_pour(self.employe)
        r = client.post(f'{API}/commandes/', {'menu_id': menu.id, 'plat_id': self.plat1.id})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['user_agence'], 'Siège')
        self.assertEqual(r.data['user_id'], self.employe.id)
        self.assertEqual(r.data['user_nom'], 'EMP1 Test')
        r = client.post(f'{API}/commandes/', {'menu_id': menu.id, 'plat_id': self.plat2.id})
        self.assertEqual(r.status_code, 400)

    def test_delai_48h(self):
        menu = self.creer_menu(jours=1)
        r = self.client_pour(self.employe).post(
            f'{API}/commandes/', {'menu_id': menu.id, 'plat_id': self.plat1.id})
        self.assertEqual(r.status_code, 400)

    def test_plat_hors_menu_refuse(self):
        menu = self.creer_menu(plats=[self.plat1])
        r = self.client_pour(self.employe).post(
            f'{API}/commandes/', {'menu_id': menu.id, 'plat_id': self.plat2.id})
        self.assertEqual(r.status_code, 400)

    def test_annulation_puis_recommande(self):
        menu = self.creer_menu()
        client = self.client_pour(self.employe)
        cmd_id = client.post(f'{API}/commandes/', {'menu_id': menu.id, 'plat_id': self.plat1.id}).data['id']
        self.assertEqual(client.patch(f'{API}/commandes/{cmd_id}/annuler/').status_code, 200)
        r = client.post(f'{API}/commandes/', {'menu_id': menu.id, 'plat_id': self.plat1.id})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['statut'], 'en_attente')

    def test_isolation_entre_employes(self):
        menu = self.creer_menu()
        cmd = Commande.objects.create(user=self.employe2, menu=menu, plat=self.plat1)
        client = self.client_pour(self.employe)
        self.assertEqual(client.get(f'{API}/commandes/').data['count'], 0)
        self.assertEqual(client.patch(f'{API}/commandes/{cmd.id}/annuler/').status_code, 404)
        self.assertEqual(client.get(f'{API}/commandes/recherche-par-badge/',
                                    {'badge': 'emp2', 'menu': menu.id}).status_code, 403)

    def test_employe_ne_peut_pas_modifier_une_commande_directement(self):
        menu = self.creer_menu()
        cmd = Commande.objects.create(user=self.employe, menu=menu, plat=self.plat1)
        r = self.client_pour(self.employe).patch(f'{API}/commandes/{cmd.id}/', {'plat_id': self.plat2.id})
        self.assertEqual(r.status_code, 403)


class RetraitTests(BaseAPITestCase):

    def test_retrait_reserve_au_gestionnaire(self):
        menu = self.creer_menu()
        cmd = Commande.objects.create(user=self.employe, menu=menu, plat=self.plat1)
        data = {'user_id': self.employe.id, 'menu_id': menu.id, 'badge_matricule': 'emp1'}

        self.assertEqual(self.client_pour(self.employe).post(f'{API}/retraits/', data).status_code, 403)
        r = self.client_pour(self.gestionnaire).post(f'{API}/retraits/', data)
        self.assertEqual(r.status_code, 201, r.data)
        cmd.refresh_from_db()
        self.assertEqual(cmd.statut, 'retiree')
        self.assertEqual(self.client_pour(self.gestionnaire).post(f'{API}/retraits/', data).status_code, 400)


class DashboardTests(BaseAPITestCase):

    def test_facturation_employe(self):
        cat = Categoriesalarie.objects.create(libelle='Cadre')
        debut = timezone.now() - timedelta(days=60)
        UserCategoriesalarie.objects.create(user=self.employe, categoriesalarie=cat,
                                            statut=self.statut, date_debut=debut)
        PlatCategoriesalarie.objects.create(categoriesalarie=cat, montant=Decimal('1500'),
                                            statut=self.statut, date_debut=debut)
        menu = self.creer_menu(jours=-1)
        Commande.objects.create(user=self.employe, menu=menu, plat=self.plat1, statut='retiree')

        self.assertEqual(self.client_pour(self.employe).get(f'{API}/dashboard-cantine/').status_code, 403)
        r = self.client_pour(self.gestionnaire).get(f'{API}/dashboard-cantine/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['fact_employe']['total_montant'], 1500.0)
        self.assertEqual(r.data['kpis']['total_retirees'], 1)


@override_settings(ALLMYSMS_LOGIN='test', ALLMYSMS_API_KEY='test')
class MotDePasseOublieTests(BaseAPITestCase):

    def setUp(self):
        cache.clear()

    def test_compte_inconnu_meme_reponse(self):
        r = self.client_pour().post(f'{API}/users/forgot-password/', {'username': 'inconnu'})
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('contact_masque', r.data)

    @patch('api.views.requests.post')
    def test_parcours_complet(self, mock_post):
        mock_post.return_value.status_code = 200
        client = self.client_pour()
        r = client.post(f'{API}/users/forgot-password/', {'username': 'emp1'})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['contact_masque'].endswith('0001'))

        code = cache.get('reset_code_emp1')['code']
        r = client.post(f'{API}/users/verify-code/', {'username': 'emp1', 'code': code})
        self.assertEqual(r.status_code, 200)
        r = client.post(f'{API}/users/reset-password/', {
            'username': 'emp1', 'reset_token': r.data['reset_token'], 'password': 'Nouveau#2026'})
        self.assertEqual(r.status_code, 200)
        self.employe.refresh_from_db()
        self.assertTrue(self.employe.check_password('Nouveau#2026'))

    @patch('api.views.requests.post')
    def test_essais_limites(self, mock_post):
        mock_post.return_value.status_code = 200
        client = self.client_pour()
        client.post(f'{API}/users/forgot-password/', {'username': 'emp1'})
        code = cache.get('reset_code_emp1')['code']
        faux = '000000' if code != '000000' else '111111'
        for _ in range(5):
            client.post(f'{API}/users/verify-code/', {'username': 'emp1', 'code': faux})
        r = client.post(f'{API}/users/verify-code/', {'username': 'emp1', 'code': code})
        self.assertEqual(r.status_code, 400)


class _FacturationBase(BaseAPITestCase):
    """Catégories, tarifs et prestataire communs aux tests de facturation."""

    def setUp(self):
        from datetime import date, datetime
        tz = timezone.get_current_timezone()
        self.d = lambda s: datetime.fromisoformat(s).replace(tzinfo=tz)
        self.cadre  = Categoriesalarie.objects.create(libelle='Cadre')
        self.agent  = Categoriesalarie.objects.create(libelle='Agent')
        # Tarif Cadre : 1000 en août, 1500 à partir du 16/08
        PlatCategoriesalarie.objects.create(categoriesalarie=self.cadre, montant=Decimal('1000'),
                                            statut=self.statut, date_debut=self.d('2026-01-01'),
                                            date_fin=self.d('2026-08-15'))
        PlatCategoriesalarie.objects.create(categoriesalarie=self.cadre, montant=Decimal('1500'),
                                            statut=self.statut, date_debut=self.d('2026-08-16'))
        PlatCategoriesalarie.objects.create(categoriesalarie=self.agent, montant=Decimal('500'),
                                            statut=self.statut, date_debut=self.d('2026-01-01'))
        # emp1 : Agent jusqu'au 10/08, Cadre ensuite
        UserCategoriesalarie.objects.create(user=self.employe, categoriesalarie=self.agent,
                                            statut=self.statut, date_debut=self.d('2026-01-01'),
                                            date_fin=self.d('2026-08-10'))
        UserCategoriesalarie.objects.create(user=self.employe, categoriesalarie=self.cadre,
                                            statut=self.statut, date_debut=self.d('2026-08-11'))
        # Prestataire du Siège : 800 par repas, 900 à partir du 16/08
        self.traiteur = Prestataire.objects.create(libelle='Traiteur A', statut=self.statut,
                                                   date_debut=self.d('2026-01-01'))
        AgencePrestataire.objects.create(prestataire=self.traiteur, agence=self.agence,
                                         statut=self.statut, date_debut=self.d('2026-01-01'))
        PlatPrestataire.objects.create(prestataire=self.traiteur, montant=Decimal('800'),
                                       statut=self.statut, date_debut=self.d('2026-01-01'),
                                       date_fin=self.d('2026-08-15'))
        PlatPrestataire.objects.create(prestataire=self.traiteur, montant=Decimal('900'),
                                       statut=self.statut, date_debut=self.d('2026-08-16'))
        self.date = date

    def commander(self, user, jour, statut='en_attente', plat=None):
        menu, _ = Menu.objects.get_or_create(date_menu=jour, agence=self.agence,
                                             typeequipe=self.typeequipe)
        MenuPlat.objects.get_or_create(menu=menu, plat=plat or self.plat1)
        return Commande.objects.create(user=user, menu=menu, plat=plat or self.plat1, statut=statut)



class FacturationTests(_FacturationBase):
    """Règle : repas commandés et non annulés, tarif / catégorie à la date du menu."""

    def facturation(self, qui, **params):
        params.setdefault('date_debut', '2026-08-01')
        params.setdefault('date_fin', '2026-08-31')
        r = self.client_pour(qui).get(f"{API}/facturation/", params)
        self.assertEqual(r.status_code, 200, r.data)
        return r.data

    def test_regle_et_tarif_a_la_date_du_menu(self):
        d = self.date
        self.commander(self.employe, d(2026, 8, 5))                      # Agent : 500
        self.commander(self.employe, d(2026, 8, 12), statut='retiree')   # Cadre, avant hausse : 1000
        self.commander(self.employe, d(2026, 8, 20))                     # Cadre, après hausse : 1500
        self.commander(self.employe, d(2026, 8, 25), statut='annulee')   # annulée : non facturée

        data = self.facturation(self.employe)
        emp = data['employes'][0]
        self.assertEqual(emp['nb_repas'], 3)
        self.assertEqual(emp['total'], 3000.0)
        self.assertEqual([l['montant'] for l in emp['lignes']], [500.0, 1000.0, 1500.0])
        self.assertEqual(emp['etat'], 'provisoire')

    def test_employe_ne_voit_que_sa_facturation(self):
        self.commander(self.employe, self.date(2026, 8, 5))
        self.commander(self.employe2, self.date(2026, 8, 5))
        data = self.facturation(self.employe, user=self.employe2.id)
        self.assertEqual([e['username'] for e in data['employes']], ['emp1'])
        data = self.facturation(self.gestionnaire)
        self.assertEqual({e['username'] for e in data['employes']}, {'emp1', 'emp2'})
        self.assertEqual(data['repas_sans_tarif'], 1)   # emp2 n'a pas de catégorie

    def test_cloture_fige_les_montants(self):
        self.commander(self.employe, self.date(2026, 8, 20))
        admin = self.client_pour(self.admin)

        # Gestionnaire : pas le droit de clôturer
        r = self.client_pour(self.gestionnaire).post(f'{API}/facturation/clotures/cloturer/',
                                                     {'annee': 2026, 'mois': 8})
        self.assertEqual(r.status_code, 403)

        r = admin.post(f'{API}/facturation/clotures/cloturer/', {'annee': 2026, 'mois': 8})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(float(r.data['montant_total']), 1500.0)

        # Hausse de tarif après clôture : sans effet sur le mois clôturé
        PlatCategoriesalarie.objects.filter(categoriesalarie=self.cadre).update(montant=Decimal('9999'))
        emp = self.facturation(self.employe)['employes'][0]
        self.assertEqual(emp['total'], 1500.0)
        self.assertEqual(emp['etat'], 'cloturee')

        # Double clôture refusée
        r = admin.post(f'{API}/facturation/clotures/cloturer/', {'annee': 2026, 'mois': 8})
        self.assertEqual(r.status_code, 400)

        # Facture visible par l'employé, pas par un autre
        r = self.client_pour(self.employe).get(f'{API}/factures/')
        self.assertEqual(r.data['count'], 1)
        self.assertEqual(len(r.data['results'][0]['lignes']), 1)
        self.assertEqual(self.client_pour(self.employe2).get(f'{API}/factures/').data['count'], 0)

        # Commande d'un mois clôturé non modifiable, agent non supprimable
        cmd = Commande.objects.get(user=self.employe)
        self.assertEqual(admin.delete(f'{API}/commandes/{cmd.id}/').status_code, 403)
        self.assertEqual(admin.delete(f'{API}/users/{self.employe.id}/').status_code, 403)

    def test_cloture_refusee(self):
        admin = self.client_pour(self.admin)
        today = timezone.localdate()
        r = admin.post(f'{API}/facturation/clotures/cloturer/', {'annee': today.year, 'mois': today.month})
        self.assertEqual(r.status_code, 400)          # mois en cours

        self.commander(self.employe2, self.date(2026, 8, 5))   # emp2 sans catégorie
        r = admin.post(f'{API}/facturation/clotures/cloturer/', {'annee': 2026, 'mois': 8})
        self.assertEqual(r.status_code, 400)
        self.assertIn('emp2', r.data['details'][0])

    def test_tableau_de_bord_meme_regle(self):
        self.commander(self.employe, self.date(2026, 8, 20))                     # 1500
        self.commander(self.employe, self.date(2026, 8, 21), statut='retiree')   # 1500
        self.commander(self.employe, self.date(2026, 8, 22), statut='annulee')
        r = self.client_pour(self.gestionnaire).get(
            f'{API}/dashboard-cantine/', {'date_debut': '2026-08-01', 'date_fin': '2026-08-31'})
        self.assertEqual(r.data['fact_employe']['total_montant'], 3000.0)

    # ── Côté prestataires ─────────────────────────────────────
    def facturation_prestataires(self, qui, **params):
        params.setdefault('date_debut', '2026-08-01')
        params.setdefault('date_fin', '2026-08-31')
        return self.client_pour(qui).get(f"{API}/facturation/prestataires/", params)

    def test_prestataire_regle_et_tarif_a_la_date(self):
        d = self.date
        self.commander(self.employe, d(2026, 8, 5))                      # 800
        self.commander(self.employe2, d(2026, 8, 20), statut='retiree')  # 900
        self.commander(self.employe, d(2026, 8, 25), statut='annulee')   # non facturé

        self.assertEqual(self.facturation_prestataires(self.employe).status_code, 403)
        data = self.facturation_prestataires(self.gestionnaire).data
        p = data['prestataires'][0]
        self.assertEqual((p['prestataire'], p['nb_repas'], p['total']), ('Traiteur A', 2, 1700.0))
        self.assertEqual({a['username'] for a in p['agents']}, {'emp1', 'emp2'})
        self.assertEqual(data['anomalies'], [])

    def test_agence_sans_prestataire_signalee(self):
        autre = Agence.objects.create(nom_agence='Annexe')
        menu = Menu.objects.create(date_menu=self.date(2026, 8, 6), agence=autre,
                                   typeequipe=self.typeequipe)
        MenuPlat.objects.create(menu=menu, plat=self.plat1)
        Commande.objects.create(user=self.employe, menu=menu, plat=self.plat1)
        data = self.facturation_prestataires(self.gestionnaire).data
        self.assertEqual(data['total_repas'], 0)
        self.assertIn('Annexe', data['anomalies'][0])

    def test_cloture_fige_aussi_les_prestataires(self):
        self.commander(self.employe, self.date(2026, 8, 20))
        r = self.client_pour(self.admin).post(f'{API}/facturation/clotures/cloturer/',
                                              {'annee': 2026, 'mois': 8})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(float(r.data['montant_total_prestataires']), 900.0)

        PlatPrestataire.objects.update(montant=Decimal('5000'))
        p = self.facturation_prestataires(self.gestionnaire).data['prestataires'][0]
        self.assertEqual((p['total'], p['etat']), (900.0, 'cloturee'))

        r = self.client_pour(self.gestionnaire).get(f'{API}/factures-prestataires/')
        self.assertEqual(r.data['count'], 1)
        self.assertEqual(self.client_pour(self.admin).delete(
            f'{API}/prestataires/{self.traiteur.id}/').status_code, 403)

    def test_tableau_de_bord_prestataire_meme_regle(self):
        self.commander(self.employe, self.date(2026, 8, 20))                     # 900
        self.commander(self.employe2, self.date(2026, 8, 21), statut='retiree')  # 900
        r = self.client_pour(self.gestionnaire).get(
            f'{API}/dashboard-cantine/', {'date_debut': '2026-08-01', 'date_fin': '2026-08-31'})
        self.assertEqual(r.data['fact_fournisseur']['total_montant'], 1800.0)


import shutil
import tempfile
from io import BytesIO as _BytesIO

_MEDIA_TEST = tempfile.mkdtemp(prefix='ubifood-media-')


@override_settings(MEDIA_ROOT=_MEDIA_TEST)
class FacturePdfTests(_FacturationBase):
    """Paramètres société (en-tête) et facture prestataire PDF."""

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(_MEDIA_TEST, ignore_errors=True)

    def _logo(self):
        from PIL import Image as PilImage
        from django.core.files.uploadedfile import SimpleUploadedFile
        buf = _BytesIO()
        PilImage.new('RGB', (120, 60), (9, 36, 64)).save(buf, 'PNG')
        return SimpleUploadedFile('logo.png', buf.getvalue(), content_type='image/png')

    def test_parametres_societe_droits_et_logo(self):
        url = f'{API}/parametres-societe/'
        self.assertEqual(self.client_pour(self.employe).get(url).status_code, 403)
        self.assertEqual(self.client_pour(self.gestionnaire).get(url).status_code, 200)
        self.assertEqual(self.client_pour(self.gestionnaire).patch(
            url, {'nom': 'X'}, format='json').status_code, 403)

        r = self.client_pour(self.admin).patch(url, {
            'nom': 'UBIPHARM CI', 'ville': 'Abidjan', 'identifiant_fiscal': 'CC-123',
            'logo': self._logo()}, format='multipart')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data['logo_url'].startswith('/media/societe/'))

        r = self.client_pour(self.admin).patch(url, {'supprimer_logo': True}, format='json')
        self.assertIsNone(r.data['logo_url'])
        self.assertEqual(r.data['nom'], 'UBIPHARM CI')

    def test_facture_prestataire_pdf(self):
        self.commander(self.employe, self.date(2026, 8, 12))
        self.commander(self.employe2, self.date(2026, 8, 20), statut='retiree')
        UserCategoriesalarie.objects.create(user=self.employe2, categoriesalarie=self.agent,
                                            statut=self.statut, date_debut=self.d('2026-01-01'))
        self.client_pour(self.admin).patch(f'{API}/parametres-societe/', {
            'nom': 'UBIPHARM CI', 'adresse': 'Zone 4\nAbidjan', 'ville': 'Abidjan',
            'pied_de_page': 'Banque X — IBAN CI00 0000', 'logo': self._logo()}, format='multipart')
        r = self.client_pour(self.admin).patch(f'{API}/prestataires/{self.traiteur.id}/', {
            'contact_nom': 'M. Kouassi', 'adresse': 'Cocody, Rue 12', 'ville': 'Abidjan',
            'telephone': '+225 07 00 00 00', 'email': 'contact@traiteur-a.ci',
            'identifiant_fiscal': 'CC-987', 'registre_commerce': 'CI-ABJ-2020-B-1'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['contact_nom'], 'M. Kouassi')
        self.assertEqual(self.client_pour(self.gestionnaire).patch(
            f'{API}/prestataires/{self.traiteur.id}/', {'ville': 'X'}, format='json').status_code, 403)

        r = self.client_pour(self.admin).post(f'{API}/facturation/clotures/cloturer/',
                                              {'annee': 2026, 'mois': 8})
        self.assertEqual(r.status_code, 201, r.data)

        facture = self.client_pour(self.gestionnaire).get(f'{API}/factures-prestataires/').data['results'][0]
        self.assertEqual(facture['numero'], 'FP-2026-08-001')

        self.assertEqual(self.client_pour(self.employe).get(
            f"{API}/factures-prestataires/{facture['id']}/pdf/").status_code, 403)
        r = self.client_pour(self.gestionnaire).get(f"{API}/factures-prestataires/{facture['id']}/pdf/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r['Content-Type'], 'application/pdf')
        contenu = b''.join(r.streaming_content)
        self.assertTrue(contenu.startswith(b'%PDF'))
        self.assertIn(b'FP-2026-08-001', contenu)   # titre du document
        with open(os.path.join(_MEDIA_TEST, 'facture-test.pdf'), 'wb') as f:
            f.write(contenu)

    def test_montant_en_lettres(self):
        from .pdf_factures import montant_en_lettres
        self.assertEqual(montant_en_lettres(Decimal('1700')), 'mille-sept-cents')
        self.assertEqual(montant_en_lettres(Decimal('80000')), 'quatre-vingt-mille')
        self.assertEqual(montant_en_lettres(Decimal('1250300')),
                         'un-million-deux-cent-cinquante-mille-trois-cents')
