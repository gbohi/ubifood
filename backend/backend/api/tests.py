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
        # Le gestionnaire gère l'agence du Siège
        UserAgence.objects.create(user=cls.gestionnaire, agence=cls.agence, statut=cls.statut,
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

    def rattacher_prestataire(self):
        """Prestataire et tarif pour l'agence : nécessaires pour créer un menu."""
        debut = timezone.now() - timedelta(days=400)
        self.traiteur = Prestataire.objects.create(libelle='Traiteur', statut=self.statut, date_debut=debut)
        AgencePrestataire.objects.create(prestataire=self.traiteur, agence=self.agence,
                                         statut=self.statut, date_debut=debut)
        PlatPrestataire.objects.create(prestataire=self.traiteur, montant=Decimal('900'),
                                       statut=self.statut, date_debut=debut)

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
        self.rattacher_prestataire()
        data = {'date_menu': str(timezone.localdate()), 'agence': self.agence.id,
                'typeequipe': self.typeequipe.id, 'plat_ids': [self.plat1.id]}
        self.assertEqual(self.client_pour(self.employe).post(f'{API}/menus/', data).status_code, 403)
        r = self.client_pour(self.gestionnaire).post(f'{API}/menus/', data)
        self.assertEqual(r.status_code, 201, r.data)

    def test_endpoints_sensibles_fermes_aux_anonymes(self):
        anonyme = self.client_pour()
        for url in ('/besoins/', '/allnopagin/groups/', '/allnopagin/agences/'):
            self.assertEqual(anonyme.get(f'{API}{url}').status_code, 401, url)

    def test_besoins_reserves_aux_admins(self):
        for u in (self.employe, self.gestionnaire):
            client = self.client_pour(u)
            self.assertEqual(client.get(f'{API}/besoins/').status_code, 403)
            self.assertEqual(client.get(f'{API}/besoin-documents/').status_code, 403)
            self.assertEqual(client.post('/api/besoins/creer/').status_code, 403)
        self.assertEqual(self.client_pour(self.admin).get(f'{API}/besoins/').status_code, 200)

    def test_modules_retires(self):
        """Comptabilité, moyens généraux, plan comptable et RH n'existent plus."""
        admin = self.client_pour(self.admin)
        for url in ('/simulation/', '/vehicules/', '/typevehicules/', '/entretienvehicules/',
                    '/comptecomptables/', '/categoriecomptables/', '/classecomptables/',
                    '/postereportings/', '/etat-entretien-groupes/'):
            self.assertEqual(admin.get(f'{API}{url}').status_code, 404, url)
        self.assertEqual(admin.post(f'{API}/apb128/generer/').status_code, 404)

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

    def test_delais_parametrables_et_distincts(self):
        """Délai de commande et délai d'annulation se règlent séparément."""
        client = self.client_pour(self.employe)
        menu = self.creer_menu(jours=3)
        # Commande ouverte jusqu'à 1 h avant le jour, annulation close 10 jours avant
        r = self.client_pour(self.admin).patch(
            f'{API}/parametres-societe/',
            {'delai_commande_heures': 1, 'delai_annulation_heures': 240}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        r = client.post(f'{API}/commandes/', {'menu_id': menu.id, 'plat_id': self.plat1.id})
        self.assertEqual(r.status_code, 201, r.data)
        r = client.patch(f'{API}/commandes/{r.data["id"]}/annuler/')
        self.assertEqual(r.status_code, 400)
        self.assertIn('annulations pour ce menu', str(r.data))
        # Les dates limites calculées par le serveur accompagnent le menu
        r = client.get(f'{API}/menus/{menu.id}/')
        self.assertIn('date_limite_commande', r.data)
        self.assertIn('date_limite_annulation', r.data)
        self.assertEqual(client.get(f'{API}/parametres-cantine/').data,
                         {'delai_commande_heures': 1, 'delai_annulation_heures': 240})

    def test_delai_modifiable_uniquement_par_admin(self):
        r = self.client_pour(self.employe).patch(
            f'{API}/parametres-societe/', {'delai_commande_heures': 0}, format='json')
        self.assertEqual(r.status_code, 403)
        r = self.client_pour(self.admin).patch(
            f'{API}/parametres-societe/', {'delai_commande_heures': 10000}, format='json')
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
        menu = self.creer_menu(jours=0)
        cmd = Commande.objects.create(user=self.employe, menu=menu, plat=self.plat1)
        data = {'user_id': self.employe.id, 'menu_id': menu.id, 'badge_matricule': 'emp1'}

        self.assertEqual(self.client_pour(self.employe).post(f'{API}/retraits/', data).status_code, 403)
        r = self.client_pour(self.gestionnaire).post(f'{API}/retraits/', data)
        self.assertEqual(r.status_code, 201, r.data)
        cmd.refresh_from_db()
        self.assertEqual(cmd.statut, 'retiree')
        self.assertEqual(self.client_pour(self.gestionnaire).post(f'{API}/retraits/', data).status_code, 400)


class CantineReglesTests(BaseAPITestCase):
    """Intégrité des menus, plats, commandes et retraits."""

    def setUp(self):
        self.rattacher_prestataire()
        self.gest = self.client_pour(self.gestionnaire)

    def data_menu(self, jours=5, **extra):
        data = {'date_menu': str(timezone.localdate() + timedelta(days=jours)), 'agence': self.agence.id,
                'typeequipe': self.typeequipe.id, 'plat_ids': [self.plat1.id, self.plat2.id]}
        data.update(extra)
        return data

    def test_creation_menu_avec_ses_plats(self):
        r = self.gest.post(f'{API}/menus/', self.data_menu(), format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(MenuPlat.objects.filter(menu_id=r.data['id']).count(), 2)

    def test_menu_sans_plat_ou_en_double_refuse(self):
        self.assertEqual(self.gest.post(f'{API}/menus/', self.data_menu(plat_ids=[]), format='json').status_code, 400)
        self.assertEqual(self.gest.post(f'{API}/menus/', self.data_menu(), format='json').status_code, 201)
        r = self.gest.post(f'{API}/menus/', self.data_menu(), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('existe déjà', str(r.data))

    def test_menu_sans_prestataire_refuse(self):
        AgencePrestataire.objects.all().delete()
        r = self.gest.post(f'{API}/menus/', self.data_menu(), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('prestataire', str(r.data))

    def test_menu_commande_protege(self):
        menu = self.creer_menu()
        Commande.objects.create(user=self.employe, menu=menu, plat=self.plat1)
        self.assertEqual(self.gest.delete(f'{API}/menus/{menu.id}/').status_code, 400)
        self.assertEqual(self.gest.delete(f'{API}/menus/bulk_delete/', {'ids': [menu.id]},
                                          format='json').status_code, 400)
        r = self.gest.patch(f'{API}/menus/{menu.id}/', {'plat_ids': [self.plat2.id]}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Garba', str(r.data))
        nouvelle_date = str(menu.date_menu + timedelta(days=1))
        self.assertEqual(self.gest.patch(f'{API}/menus/{menu.id}/', {'date_menu': nouvelle_date},
                                         format='json').status_code, 400)
        self.assertEqual(self.gest.delete(f'{API}/plats/{self.plat1.id}/').status_code, 400)
        self.assertTrue(Commande.objects.filter(menu=menu).exists())

    def test_suppression_multiple_par_le_gestionnaire(self):
        menu = self.creer_menu()
        r = self.gest.delete(f'{API}/menus/bulk_delete/', {'ids': [menu.id]}, format='json')
        self.assertEqual(r.status_code, 200, r.data)

    def test_mois_cloture_fige_les_menus(self):
        from .models import ClotureMensuelle
        menu = self.creer_menu(jours=-40)
        ClotureMensuelle.objects.create(annee=menu.date_menu.year, mois=menu.date_menu.month)
        self.assertEqual(self.gest.delete(f'{API}/menus/{menu.id}/').status_code, 400)

    def menu_yopougon(self, jours=5):
        autre = Agence.objects.create(nom_agence='Yopougon')
        menu = Menu.objects.create(date_menu=timezone.localdate() + timedelta(days=jours),
                                   agence=autre, typeequipe=self.typeequipe)
        MenuPlat.objects.create(menu=menu, plat=self.plat1)
        return menu

    def test_commande_dans_une_autre_agence_autorisee(self):
        # Un agent en déplacement commande dans l'agence où il se trouve
        menu = self.menu_yopougon()
        r = self.client_pour(self.employe).post(f'{API}/commandes/', {'menu_id': menu.id, 'plat_id': self.plat1.id})
        self.assertEqual(r.status_code, 201, r.data)

    def test_gestionnaire_limite_a_son_agence(self):
        yop = self.menu_yopougon(jours=0)
        siege = self.creer_menu(jours=0)
        cmd_yop = Commande.objects.create(user=self.employe, menu=yop, plat=self.plat1)
        Commande.objects.create(user=self.employe2, menu=siege, plat=self.plat1)

        # Voir
        ids = {c['id'] for c in self.gest.get(f'{API}/commandes/', {'page_size': 100}).data['results']}
        self.assertNotIn(cmd_yop.id, ids)
        self.assertEqual(len(ids), 1)
        r = self.gest.get(f'{API}/commandes/par-agence-periode/')
        self.assertEqual({c['id'] for c in r.data}, ids)
        self.assertEqual(self.gest.get(f'{API}/commandes/par-menu/', {'menu': yop.id}).status_code, 403)
        self.assertEqual(self.gest.get(f'{API}/commandes/recherche-par-badge/',
                                       {'badge': 'emp1', 'menu': yop.id}).status_code, 403)
        # Valider (retrait)
        r = self.gest.post(f'{API}/retraits/', {'user_id': self.employe.id, 'menu_id': yop.id, 'badge_matricule': 'emp1'})
        self.assertEqual(r.status_code, 403)
        # Supprimer / annuler
        self.assertEqual(self.gest.patch(f'{API}/commandes/{cmd_yop.id}/annuler/').status_code, 404)
        # Tableau de bord : seulement le Siège
        jour = str(timezone.localdate())
        r = self.gest.get(f'{API}/dashboard-cantine/', {'date_debut': jour, 'date_fin': jour})
        self.assertEqual(r.data['kpis']['total_commandes'], 1)

        # L'administrateur voit toutes les agences
        admin = self.client_pour(self.admin)
        self.assertEqual(admin.get(f'{API}/commandes/', {'page_size': 100}).data['count'], 2)
        r = admin.post(f'{API}/retraits/', {'user_id': self.employe.id, 'menu_id': yop.id, 'badge_matricule': 'emp1'})
        self.assertEqual(r.status_code, 201, r.data)

    def test_gestionnaire_menus_et_plats_de_son_agence(self):
        yop = self.menu_yopougon()
        r = self.gest.post(f'{API}/menus/', {**self.data_menu(), 'agence': yop.agence_id}, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.gest.delete(f'{API}/menus/{yop.id}/').status_code, 403)
        plat = {'nom': 'Placali', 'type_plat': self.typeplat.id, 'agence': yop.agence_id}
        self.assertEqual(self.gest.post(f'{API}/plats/', plat).status_code, 403)
        self.assertEqual(self.client_pour(self.admin).post(f'{API}/plats/', plat).status_code, 201)
        plat_yop = Plat.objects.get(nom='Placali')
        self.assertEqual(self.gest.patch(f'{API}/plats/{plat_yop.id}/', {'nom': 'X'}).status_code, 403)
        self.assertEqual(self.gest.delete(f'{API}/plats/{plat_yop.id}/').status_code, 403)

        # Écrans de gestion (?gerees=1) : ses agences ; lecture libre sinon (commande)
        self.creer_menu()
        agences = {m['agence'] for m in self.gest.get(f'{API}/menus/', {'gerees': 1}).data['results']}
        self.assertEqual(agences, {self.agence.id})
        agences = {m['agence'] for m in self.gest.get(f'{API}/menus/').data['results']}
        self.assertIn(yop.agence_id, agences)
        noms = {p['nom'] for p in self.gest.get(f'{API}/allnopagin/plats/', {'gerees': 1}).data}
        self.assertNotIn('Placali', noms)
        agences = {m['agence'] for m in self.client_pour(self.admin).get(f'{API}/menus/', {'gerees': 1}).data['results']}
        self.assertIn(yop.agence_id, agences)

    def test_facturation_gestionnaire_de_son_agence(self):
        from .facturation import cloturer_mois
        from .models import ClotureMensuelle
        # Tarifs agent et prestataire de Yopougon
        debut = timezone.now() - timedelta(days=400)
        cat = Categoriesalarie.objects.create(libelle='Agent')
        UserCategoriesalarie.objects.create(user=self.employe, categoriesalarie=cat, statut=self.statut, date_debut=debut)
        UserCategoriesalarie.objects.create(user=self.gestionnaire, categoriesalarie=cat, statut=self.statut, date_debut=debut)
        PlatCategoriesalarie.objects.create(categoriesalarie=cat, montant=Decimal('500'), statut=self.statut, date_debut=debut)
        yop = self.menu_yopougon(jours=-40)
        autre = Prestataire.objects.create(libelle='Traiteur Yop', statut=self.statut, date_debut=debut)
        AgencePrestataire.objects.create(prestataire=autre, agence=yop.agence, statut=self.statut, date_debut=debut)
        PlatPrestataire.objects.create(prestataire=autre, montant=Decimal('700'), statut=self.statut, date_debut=debut)
        siege = self.creer_menu(jours=-40)
        Commande.objects.create(user=self.employe, menu=siege, plat=self.plat1)
        Commande.objects.create(user=self.employe, menu=yop, plat=self.plat1, statut='retiree')
        jour = str(siege.date_menu)
        periode = {'date_debut': jour, 'date_fin': jour}

        r = self.gest.get(f'{API}/facturation/', periode)
        self.assertEqual((r.data['total_repas'], r.data['total_montant']), (1, 500.0))
        # « Ma facturation » (moi=1) : ses propres repas, toutes agences
        Commande.objects.create(user=self.gestionnaire, menu=yop, plat=self.plat1)
        r = self.gest.get(f'{API}/facturation/', {**periode, 'moi': 1})
        self.assertEqual([e['user_id'] for e in r.data['employes']], [self.gestionnaire.id])
        self.assertEqual(r.data['total_repas'], 1)
        r = self.gest.get(f'{API}/facturation/prestataires/', periode)
        self.assertEqual([p['prestataire'] for p in r.data['prestataires']], ['Traiteur'])
        admin = self.client_pour(self.admin)
        self.assertEqual(admin.get(f'{API}/facturation/', periode).data['total_repas'], 3)
        self.assertEqual(len(admin.get(f'{API}/facturation/prestataires/', periode).data['prestataires']), 2)

        # Factures officielles figées : seulement celles de ses agences
        d = siege.date_menu
        cloturer_mois(d.year, d.month, self.admin)
        libelles = {f['prestataire_libelle'] for f in self.gest.get(f'{API}/factures-prestataires/').data['results']}
        self.assertEqual(libelles, {'Traiteur'})
        self.assertEqual(len(admin.get(f'{API}/factures-prestataires/').data['results']), 2)
        # La facture de l'agent couvre deux agences : réservée à l'administrateur ;
        # le gestionnaire voit la sienne
        ids = [f['user'] for f in self.gest.get(f'{API}/factures/').data['results']]
        self.assertEqual(ids, [self.gestionnaire.id])
        self.assertEqual(admin.get(f'{API}/factures/').data['count'], 2)

    def test_gestionnaire_voit_ses_propres_commandes_ailleurs(self):
        yop = self.menu_yopougon()
        cmd = Commande.objects.create(user=self.gestionnaire, menu=yop, plat=self.plat1)
        ids = {c['id'] for c in self.gest.get(f'{API}/commandes/mes-commandes/').data}
        self.assertIn(cmd.id, ids)
        self.assertEqual(self.gest.patch(f'{API}/commandes/{cmd.id}/annuler/').status_code, 200)

    def test_retrait_menu_futur_refuse_et_annulation_retrait(self):
        futur = self.creer_menu()
        Commande.objects.create(user=self.employe, menu=futur, plat=self.plat1)
        data = {'user_id': self.employe.id, 'menu_id': futur.id, 'badge_matricule': 'emp1'}
        self.assertEqual(self.gest.post(f'{API}/retraits/', data).status_code, 400)

        menu = self.creer_menu(jours=0)
        cmd = Commande.objects.create(user=self.employe, menu=menu, plat=self.plat1)
        data['menu_id'] = menu.id
        retrait_id = self.gest.post(f'{API}/retraits/', data).data['id']
        self.assertEqual(self.client_pour(self.admin).delete(f'{API}/retraits/{retrait_id}/').status_code, 204)
        cmd.refresh_from_db()
        self.assertEqual(cmd.statut, 'en_attente')

    def test_tarifs_valides(self):
        admin = self.client_pour(self.admin)
        base = {'prestataire': self.traiteur.id, 'statut': self.statut.id}
        r = admin.post(f'{API}/plat-prestataires/', {**base, 'montant': '-5', 'date_debut': '2030-01-01T00:00:00Z'})
        self.assertEqual(r.status_code, 400)
        # Le tarif en cours (sans date de fin) chevauche toute nouvelle période
        r = admin.post(f'{API}/plat-prestataires/', {**base, 'montant': '1000', 'date_debut': '2030-01-01T00:00:00Z'})
        self.assertEqual(r.status_code, 400)
        self.assertIn('chevauche', str(r.data))
        self.assertEqual(self.client_pour(self.employe).get(f'{API}/plat-categoriesalaries/').status_code, 403)


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
        # Période explicite : sans dates, le tableau de bord prend le mois en cours
        hier = str(menu.date_menu)
        r = self.client_pour(self.gestionnaire).get(f'{API}/dashboard-cantine/',
                                                    {'date_debut': hier, 'date_fin': hier})
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
        # L'administrateur voit toutes les agences (le gestionnaire seulement la sienne)
        data = self.facturation_prestataires(self.admin).data
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
        # Refus clair (400) : le prestataire a des factures et des tarifs
        self.assertEqual(self.client_pour(self.admin).delete(
            f'{API}/prestataires/{self.traiteur.id}/').status_code, 400)

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


class GestionUtilisateursTests(BaseAPITestCase):
    """Création / modification d'un agent et de son historique."""

    def donnees(self, **extra):
        d = {'username': 'nouveau', 'email': '', 'nom': 'Nouveau', 'prenom': 'Agent',
             'contact': '', 'poste_telephone': '', 'statut': self.statut.id,
             'is_active': True, 'groups': [self.groupes['employe'].id]}
        d.update(extra)
        return d

    def test_creation_avec_champs_facultatifs_vides(self):
        r = self.client_pour(self.admin).post(
            f'{API}/users/', self.donnees(password=MDP, password2=MDP), format='json')
        self.assertEqual(r.status_code, 201, r.data)
        user = User.objects.get(username='nouveau')
        self.assertTrue(user.check_password(MDP))
        self.assertEqual(user.user_created, self.admin)
        self.assertEqual(r.data['roles'], ['employe'])

    def test_creation_sans_mot_de_passe_refusee(self):
        r = self.client_pour(self.admin).post(f'{API}/users/', self.donnees(), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('password', r.data)

    def test_identifiant_en_double(self):
        r = self.client_pour(self.admin).post(
            f'{API}/users/', self.donnees(username='emp1', password=MDP, password2=MDP), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('username', r.data)

    def test_modification_sans_toucher_au_mot_de_passe(self):
        r = self.client_pour(self.admin).put(
            f'{API}/users/{self.employe.id}/',
            self.donnees(username='emp1', nom='EMP1-modifié'), format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.employe.refresh_from_db()
        self.assertEqual(self.employe.nom, 'EMP1-modifié')
        self.assertTrue(self.employe.check_password(MDP))

    def test_admin_ne_peut_pas_se_bloquer_lui_meme(self):
        client = self.client_pour(self.admin)
        url = f'{API}/users/{self.admin.id}/'
        r = client.put(url, self.donnees(username='admin1', is_active=False,
                                         groups=[self.groupes['admin'].id]), format='json')
        self.assertEqual(r.status_code, 403)
        r = client.put(url, self.donnees(username='admin1', groups=[self.groupes['employe'].id]),
                       format='json')
        self.assertEqual(r.status_code, 403)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_periodes_agence_et_categorie(self):
        client = self.client_pour(self.admin)
        ligne = {'user': self.employe2.id, 'agence': self.agence.id, 'statut': self.statut.id}
        # date de fin avant la date de début
        r = client.post(f'{API}/user-agences/', {**ligne, 'date_debut': '2026-05-01',
                                                 'date_fin': '2026-03-01'}, format='json')
        self.assertEqual(r.status_code, 400)
        # première agence, en cours
        r = client.post(f'{API}/user-agences/', {**ligne, 'date_debut': '2026-01-01',
                                                 'date_fin': None}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        premiere = r.data['id']
        # seconde agence qui chevauche → refusée
        r = client.post(f'{API}/user-agences/', {**ligne, 'date_debut': '2026-06-01',
                                                 'date_fin': None}, format='json')
        self.assertEqual(r.status_code, 400)
        # on clôture la première, la seconde passe
        r = client.patch(f'{API}/user-agences/{premiere}/', {'date_fin': '2026-05-31'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        r = client.post(f'{API}/user-agences/', {**ligne, 'date_debut': '2026-06-01',
                                                 'date_fin': None}, format='json')
        self.assertEqual(r.status_code, 201, r.data)


class DashboardCantineTests(_FacturationBase):
    """Tableau de bord cantine : filtres, période par défaut, taux de retrait."""

    def dashboard(self, **params):
        return self.client_pour(self.gestionnaire).get(f'{API}/dashboard-cantine/', params)

    def test_filtre_statut_sans_effet_sur_la_facturation(self):
        self.commander(self.employe, self.date(2026, 8, 20))                     # 1500 / 900
        self.commander(self.employe, self.date(2026, 8, 21), statut='retiree')   # 1500 / 900
        self.commander(self.employe2, self.date(2026, 8, 22), statut='annulee')
        periode = {'date_debut': '2026-08-01', 'date_fin': '2026-08-31'}
        for statuts, nb in (('annulee', 1), ('retiree', 1), ('en_attente,retiree', 2)):
            r = self.dashboard(statuts=statuts, **periode)
            self.assertEqual(r.status_code, 200, r.data)
            self.assertEqual(r.data['kpis']['total_commandes'], nb)
            self.assertEqual(r.data['fact_employe']['total_montant'], 3000.0)
            self.assertEqual(r.data['fact_fournisseur']['total_montant'], 1800.0)

    def test_repas_sans_tarif_signales(self):
        self.commander(self.employe, self.date(2026, 8, 20))
        self.commander(self.employe2, self.date(2026, 8, 20))   # emp2 sans catégorie
        r = self.dashboard(date_debut='2026-08-01', date_fin='2026-08-31')
        self.assertEqual(r.data['fact_employe']['repas_sans_tarif'], 1)
        self.assertEqual(r.data['fact_employe']['total_montant'], 1500.0)
        self.assertEqual(r.data['fact_fournisseur']['repas_sans_tarif'], 0)

    def test_periode_par_defaut_et_dates_invalides(self):
        today = timezone.localdate()
        r = self.dashboard()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['date_debut'], today.replace(day=1).isoformat())
        self.assertEqual([(m['annee'], m['mois']) for m in r.data['par_mois']],
                         [(today.year, today.month)])

        r = self.dashboard(date_debut='2026-13-45')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Date invalide', str(r.data))
        r = self.dashboard(date_fin='pas-une-date')
        self.assertEqual(r.status_code, 400)
        r = self.dashboard(date_debut='2026-09-01', date_fin='2026-08-01')
        self.assertEqual(r.status_code, 400)

    def test_mois_de_deux_annees_non_fusionnes(self):
        self.commander(self.employe, self.date(2025, 8, 5))
        self.commander(self.employe, self.date(2026, 8, 5))
        r = self.dashboard(date_debut='2025-08-01', date_fin='2026-08-31')
        par_mois = {(m['annee'], m['mois']): m['total'] for m in r.data['par_mois']}
        self.assertEqual(len(par_mois), 13)
        self.assertEqual((par_mois[(2025, 8)], par_mois[(2026, 8)]), (1, 1))
        fact_mois = {(m['annee'], m['mois']): m['montant'] for m in r.data['fact_employe']['par_mois']}
        self.assertEqual(fact_mois[(2026, 8)], 500.0)   # emp1 « Agent » au 05/08

    def test_taux_de_retrait_hors_annulees_et_repas_a_venir(self):
        today = timezone.localdate()
        self.commander(self.employe, today - timedelta(days=2), statut='retiree')
        self.commander(self.employe2, today - timedelta(days=2))                    # non retirée
        self.commander(self.employe, today - timedelta(days=1), statut='annulee')   # exclue
        self.commander(self.employe, today + timedelta(days=3))                     # à venir : exclue
        r = self.dashboard(date_debut=(today - timedelta(days=10)).isoformat(),
                           date_fin=(today + timedelta(days=10)).isoformat())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['kpis']['total_commandes'], 4)
        self.assertEqual(r.data['kpis']['taux_retrait'], 50.0)

        # Semaines glissantes : aujourd'hui inclus, annulées exclues
        self.commander(self.employe2, today, statut='retiree')
        r = self.dashboard()
        hebdo = r.data['evolution_hebdo']
        self.assertEqual([s['label'] for s in hebdo], ['S-3', 'S-2', 'S-1', 'Cette semaine'])
        self.assertEqual(hebdo[-1]['total'], 3)


class BanniereTests(BaseAPITestCase):
    """Bannières de l'accueil mobile, paramétrées par les administrateurs."""

    @staticmethod
    def image(nom='b.png'):
        import struct, zlib
        from django.core.files.uploadedfile import SimpleUploadedFile
        def bloc(t, d):
            return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
        png = (b'\x89PNG\r\n\x1a\n' + bloc(b'IHDR', struct.pack('>IIBBBBB', 2, 1, 8, 2, 0, 0, 0))
               + bloc(b'IDAT', zlib.compress(b'\x00' + b'\x10\x20\x30' * 2)) + bloc(b'IEND', b''))
        return SimpleUploadedFile(nom, png, content_type='image/png')

    def setUp(self):
        from .models import Banniere
        jour = timezone.localdate()
        self.admin_c = self.client_pour(self.admin)
        r = self.admin_c.post(f'{API}/bannieres/', {'titre': 'Bienvenue', 'image': self.image(), 'ordre': 2})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(r.data['image_url'])
        Banniere.objects.create(titre='Fête passée', image='bannieres/x.png',
                                date_debut=jour - timedelta(days=10), date_fin=jour - timedelta(days=1))
        Banniere.objects.create(titre='Désactivée', image='bannieres/y.png', actif=False)
        Banniere.objects.create(titre='Promo', image='bannieres/z.png', ordre=1,
                                date_debut=jour, date_fin=jour + timedelta(days=3))

    def tearDown(self):
        from .models import Banniere
        for b in Banniere.objects.all():
            b.delete()   # supprime aussi les fichiers créés

    def test_employe_voit_les_bannieres_du_jour(self):
        r = self.client_pour(self.employe).get(f'{API}/bannieres/')
        self.assertEqual([b['titre'] for b in r.data], ['Promo', 'Bienvenue'])
        self.assertEqual(self.client_pour(self.employe).get(f'{API}/bannieres/', {'toutes': 1}).status_code, 200)
        self.assertEqual(len(self.client_pour(self.employe).get(f'{API}/bannieres/', {'toutes': 1}).data), 2)

    def test_administrateur_gere_les_bannieres(self):
        self.assertEqual(len(self.admin_c.get(f'{API}/bannieres/', {'toutes': 1}).data), 4)
        r = self.client_pour(self.gestionnaire).post(f'{API}/bannieres/', {'titre': 'X', 'image': self.image()})
        self.assertEqual(r.status_code, 403)
        r = self.admin_c.post(f'{API}/bannieres/', {'titre': 'X', 'image': self.image(),
                                                   'date_debut': '2026-05-02', 'date_fin': '2026-05-01'})
        self.assertEqual(r.status_code, 400)
        r = self.admin_c.post(f'{API}/bannieres/', {'titre': 'Sans image'})
        self.assertEqual(r.status_code, 400)


class AvisEtPhotosTests(BaseAPITestCase):
    """Avis sur les repas retirés et photo principale d'un plat."""

    def setUp(self):
        self.menu = self.creer_menu(jours=-1)
        self.cmd = Commande.objects.create(user=self.employe, menu=self.menu, plat=self.plat1, statut='retiree')
        self.attente = Commande.objects.create(user=self.employe, menu=self.creer_menu(jours=3), plat=self.plat2)
        self.emp = self.client_pour(self.employe)

    def test_noter_un_repas_retire(self):
        r = self.emp.post(f'{API}/avis-plats/', {'commande_id': self.cmd.id, 'note': 4, 'commentaire': ' Très bon '})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['commentaire'], 'Très bon')
        # Une seule fois par repas, modifiable ensuite
        self.assertEqual(self.emp.post(f'{API}/avis-plats/', {'commande_id': self.cmd.id, 'note': 5}).status_code, 400)
        self.assertEqual(self.emp.patch(f'{API}/avis-plats/{r.data["id"]}/', {'note': 5}).data['note'], 5)
        # L'avis apparaît sur la commande
        cmd = [c for c in self.emp.get(f'{API}/commandes/mes-commandes/').data if c['id'] == self.cmd.id][0]
        self.assertEqual(cmd['avis']['note'], 5)
        # Résumé du plat
        r = self.emp.get(f'{API}/plats/{self.plat1.id}/avis/')
        self.assertEqual((r.data['note_moyenne'], r.data['nb_avis']), (5.0, 1))

    def test_regles_des_avis(self):
        self.assertEqual(self.emp.post(f'{API}/avis-plats/', {'commande_id': self.attente.id, 'note': 3}).status_code, 400)
        self.assertEqual(self.emp.post(f'{API}/avis-plats/', {'commande_id': self.cmd.id, 'note': 6}).status_code, 400)
        r = self.client_pour(self.employe2).post(f'{API}/avis-plats/', {'commande_id': self.cmd.id, 'note': 2})
        self.assertEqual(r.status_code, 400)
        avis_id = self.emp.post(f'{API}/avis-plats/', {'commande_id': self.cmd.id, 'note': 3}).data['id']
        # Un autre agent ne le voit pas, ne peut ni le modifier ni le supprimer
        autre = self.client_pour(self.employe2)
        self.assertEqual(autre.get(f'{API}/avis-plats/').data['count'], 0)
        self.assertEqual(autre.patch(f'{API}/avis-plats/{avis_id}/', {'note': 1}).status_code, 404)

    def test_administrateur_voit_tous_les_avis(self):
        from .models import AvisPlat
        AvisPlat.objects.create(commande=self.cmd, user=self.employe, plat=self.plat1, note=4)
        autre = Agence.objects.create(nom_agence='Yopougon')
        m = Menu.objects.create(date_menu=timezone.localdate() - timedelta(days=1), agence=autre,
                                typeequipe=self.typeequipe)
        c2 = Commande.objects.create(user=self.employe2, menu=m, plat=self.plat1, statut='retiree')
        AvisPlat.objects.create(commande=c2, user=self.employe2, plat=self.plat1, note=2, commentaire='Froid')
        admin = self.client_pour(self.admin)
        self.assertEqual(admin.get(f'{API}/avis-plats/').data['count'], 2)
        self.assertEqual(admin.get(f'{API}/avis-plats/', {'note': 2}).data['count'], 1)
        stats = admin.get(f'{API}/avis-plats/statistiques/').data
        self.assertEqual((stats[0]['note_moyenne'], stats[0]['nb_avis']), (3.0, 2))
        # Le gestionnaire du Siège ne voit que son agence
        self.assertEqual(self.client_pour(self.gestionnaire).get(f'{API}/avis-plats/').data['count'], 1)
        self.assertEqual(self.client_pour(self.employe).get(f'{API}/avis-plats/statistiques/').status_code, 403)
        # Modération par l'administrateur
        avis_id = admin.get(f'{API}/avis-plats/', {'note': 2}).data['results'][0]['id']
        self.assertEqual(admin.delete(f'{API}/avis-plats/{avis_id}/').status_code, 204)

    def test_photo_principale(self):
        from .models import PlatImage
        a = PlatImage.objects.create(plat=self.plat1, image='images_plats/a.png', is_principale=True)
        b = PlatImage.objects.create(plat=self.plat1, image='images_plats/b.png')
        gest = self.client_pour(self.gestionnaire)
        r = gest.post(f'{API}/plats/{self.plat1.id}/image-principale/', {'image_id': b.id})
        self.assertEqual(r.status_code, 200, r.data)
        a.refresh_from_db(); b.refresh_from_db()
        self.assertEqual((a.is_principale, b.is_principale), (False, True))
        self.assertEqual(self.emp.post(f'{API}/plats/{self.plat1.id}/image-principale/', {'image_id': a.id}).status_code, 403)
        autre = PlatImage.objects.create(plat=self.plat2, image='images_plats/c.png')
        self.assertEqual(gest.post(f'{API}/plats/{self.plat1.id}/image-principale/', {'image_id': autre.id}).status_code, 400)


class ReferentielsTests(BaseAPITestCase):
    """Suppression protégée et libellés uniques des référentiels."""

    def test_statut_utilise_non_supprimable(self):
        r = self.client_pour(self.admin).delete(f'{API}/statuts/{self.statut.id}/')
        self.assertEqual(r.status_code, 400)
        self.assertIn('utilisateurs', str(r.data))
        self.assertTrue(User.objects.filter(pk=self.employe.pk).exists())

    def test_agence_et_type_equipe_utilises(self):
        menu = self.creer_menu()
        admin = self.client_pour(self.admin)
        self.assertEqual(admin.delete(f'{API}/agences/{self.agence.id}/').status_code, 400)
        r = self.client_pour(self.gestionnaire).delete(f'{API}/typeequipes/bulk_delete/',
                                                      {'ids': [self.typeequipe.id]}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertTrue(Menu.objects.filter(pk=menu.pk).exists())

    def test_ligne_libre_supprimable_et_libelle_unique(self):
        admin = self.client_pour(self.admin)
        r = admin.post(f'{API}/agences/', {'nom_agence': '  Plateau '})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['nom_agence'], 'Plateau')
        self.assertEqual(admin.post(f'{API}/agences/', {'nom_agence': 'plateau'}).status_code, 400)
        self.assertEqual(admin.post(f'{API}/agences/', {'nom_agence': '   '}).status_code, 400)
        self.assertEqual(admin.delete(f'{API}/agences/{r.data["id"]}/').status_code, 204)


class ConnexionTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_mauvais_mot_de_passe_message_clair(self):
        User.objects.create_user(username='m001', password='Bon#2026',
                                 statut=Statut.objects.create(libelle_statut='Actif'))
        r = APIClient().post('/api/api/token/', {'username': 'm001', 'password': 'faux'}, format='json')
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.data['detail'], 'Matricule ou mot de passe incorrect, ou compte désactivé.')


class BesoinsTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        from .models import Etat, Priorite, Service, TypeBesoin
        self.admin_client = self.client_pour(self.admin)
        self.type = TypeBesoin.objects.create(libelle='Matériel')
        self.etat = Etat.objects.create(libelle_etat='En attente')
        self.prio = Priorite.objects.create(libelle='Haute')
        self.service = Service.objects.create(libelle_service='Informatique')

    def donnees(self, **kw):
        d = {'titre': 'Écran', 'description': 'Écran cassé', 'typebesoin': self.type.id,
             'etat': self.etat.id, 'priorite': self.prio.id,
             'date_debut': '2026-10-20T08:00:00Z', 'date_fin': '2026-10-25T08:00:00Z'}
        d.update(kw)
        return d

    def test_date_fin_avant_debut_refusee(self):
        r = self.admin_client.post(f'{API}/besoins/', self.donnees(date_fin='2026-10-19T08:00:00Z'))
        self.assertEqual(r.status_code, 400)
        self.assertIn('date de fin', str(r.data))

    def test_departement_affecte_une_seule_fois(self):
        besoin = self.admin_client.post(f'{API}/besoins/', self.donnees()).data
        url = f'{API}/besoin-services/'
        self.assertEqual(self.admin_client.post(url, {'besoin': besoin['id'], 'service': self.service.id}).status_code, 201)
        r = self.admin_client.post(url, {'besoin': besoin['id'], 'service': self.service.id})
        self.assertEqual(r.status_code, 400)
        self.assertIn('déjà affecté', str(r.data))

    def test_document_type_interdit_refuse_sans_creer_le_besoin(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .models import Besoin
        fichier = SimpleUploadedFile('virus.exe', b'MZ', content_type='application/octet-stream')
        r = self.admin_client.post('/api/besoins/creer/', {**self.donnees(), 'documents[]': [fichier]},
                                   format='multipart')
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Besoin.objects.exists())


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class PhotoProfilTests(BaseAPITestCase):
    def image(self, fmt='PNG', nom='photo.png', taille=(1200, 900)):
        from PIL import Image
        from django.core.files.uploadedfile import SimpleUploadedFile
        buf = _BytesIO()
        Image.new('RGB', taille, (20, 120, 60)).save(buf, format=fmt)
        return SimpleUploadedFile(nom, buf.getvalue(), content_type=f'image/{fmt.lower()}')

    def test_ajout_reduction_et_retrait(self):
        from PIL import Image
        client = self.client_pour(self.employe)
        r = client.post(f'{API}/users/me/photo/', {'photo': self.image()}, format='multipart')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('photos_profil/', r.data['photo_url'])
        self.employe.refresh_from_db()
        with Image.open(self.employe.photo.path) as im:
            self.assertLessEqual(max(im.size), 512)
        self.assertEqual(client.get(f'{API}/users/me/').data['photo_url'], r.data['photo_url'])
        r = client.delete(f'{API}/users/me/photo/')
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.data['photo_url'])

    def test_fichier_invalide_refuse(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        client = self.client_pour(self.employe)
        faux = SimpleUploadedFile('photo.png', b'pas une image', content_type='image/png')
        r = client.post(f'{API}/users/me/photo/', {'photo': faux}, format='multipart')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.client_pour().post(f'{API}/users/me/photo/', {}).status_code, 401)


class AnnulationsGestionnaireTests(BaseAPITestCase):
    """Annulation pour un agent (après la date limite) et annulation d'un retrait."""

    def test_gestionnaire_annule_apres_la_date_limite(self):
        from .models import Notification
        menu = self.creer_menu(jours=1)            # date limite (48 h) dépassée
        cmd = Commande.objects.create(user=self.employe, menu=menu, plat=self.plat1)
        url = f'{API}/commandes/{cmd.id}/annuler/'
        self.assertEqual(self.client_pour(self.employe).patch(url).status_code, 400)
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client_pour(self.gestionnaire).patch(url)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['statut'], 'annulee')
        self.assertTrue(r.data['annulee_par_gestionnaire'])
        self.assertEqual(r.data['annulee_par_nom'], 'GEST1 Test')

    def test_gestionnaire_autre_agence_ne_peut_pas_annuler(self):
        autre = Agence.objects.create(nom_agence='Plateau')
        menu = Menu.objects.create(date_menu=timezone.localdate() + timedelta(days=1),
                                   agence=autre, typeequipe=self.typeequipe)
        MenuPlat.objects.create(menu=menu, plat=self.plat1)
        cmd = Commande.objects.create(user=self.employe2, menu=menu, plat=self.plat1)
        r = self.client_pour(self.gestionnaire).patch(f'{API}/commandes/{cmd.id}/annuler/')
        self.assertEqual(r.status_code, 404)

    def test_annuler_un_retrait(self):
        from .models import AvisPlat, Retrait
        menu = self.creer_menu(jours=0)
        cmd = Commande.objects.create(user=self.employe, menu=menu, plat=self.plat1, statut='retiree')
        Retrait.objects.create(user=self.employe, menu=menu, badge_matricule='emp1')
        AvisPlat.objects.create(commande=cmd, user=self.employe, plat=self.plat1, note=4)
        url = f'{API}/commandes/{cmd.id}/annuler-retrait/'
        self.assertEqual(self.client_pour(self.employe).post(url).status_code, 403)
        r = self.client_pour(self.gestionnaire).post(url)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['statut'], 'en_attente')
        self.assertFalse(Retrait.objects.exists())
        self.assertFalse(AvisPlat.objects.exists())
        # Plus rien à annuler
        self.assertEqual(self.client_pour(self.gestionnaire).post(url).status_code, 400)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class PopupConnexionTests(BaseAPITestCase):
    def image(self):
        from PIL import Image
        from django.core.files.uploadedfile import SimpleUploadedFile
        buf = _BytesIO()
        Image.new('RGB', (40, 40), (200, 0, 0)).save(buf, format='PNG')
        return SimpleUploadedFile('p.png', buf.getvalue(), content_type='image/png')

    def test_une_seule_image_active(self):
        admin = self.client_pour(self.admin)
        url = f'{API}/popups-connexion/'
        self.assertEqual(self.client_pour(self.employe).get(f'{url}active/').data, {})
        a = admin.post(url, {'titre': 'A', 'image': self.image(), 'actif': 'true'}, format='multipart').data
        rb = admin.post(url, {'titre': 'B', 'image': self.image(), 'actif': 'true'}, format='multipart')
        self.assertEqual(rb.status_code, 201, rb.data)
        b = rb.data
        liste = {p['titre']: p['actif'] for p in admin.get(url).data}
        self.assertEqual(liste, {'A': False, 'B': True})
        self.assertEqual(self.client_pour(self.employe).get(f'{url}active/').data['id'], b['id'])
        admin.patch(f"{url}{b['id']}/", {'actif': False}, format='json')
        self.assertEqual(self.client_pour(self.employe).get(f'{url}active/').data, {})
        self.assertEqual(self.client_pour(self.employe).post(url, {'titre': 'X'}).status_code, 403)
        self.assertTrue(a['id'])

    def test_recherche_des_roles_en_francais(self):
        r = self.client_pour(self.admin).get(f'{API}/groups/', {'search': 'employé'})
        noms = [g['name'] for g in (r.data['results'] if isinstance(r.data, dict) else r.data)]
        self.assertEqual(noms, ['employe'])
