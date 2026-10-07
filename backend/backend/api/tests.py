"""
Tests de l'API Ubifood : droits par rôle, commandes, retraits, mot de passe oublié.

Lancer : python manage.py test api
"""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import (
    Agence, Categoriesalarie, Commande, Menu, MenuPlat, Plat,
    PlatCategoriesalarie, Statut, TypeEquipe, TypePlat, User, UserAgence,
    UserAllergie, UserCategoriesalarie,
)

API = '/api/api'
MDP = 'MotDePasse#2026'


class BaseAPITestCase(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.statut = Statut.objects.create(libelle_statut='Actif')
        cls.groupes = {
            nom: Group.objects.create(name=nom)
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
