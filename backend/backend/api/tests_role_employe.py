"""
Rôle « Employé » obligatoire pour commander, payer, donner un avis, contester,
jouer et être programmé ; consultation de l'historique conservée ; migration
des comptes qui commandaient sans ce rôle.

Lancer : python manage.py test api.tests_role_employe
"""
from datetime import timedelta
from importlib import import_module

from django.apps import apps as django_apps
from django.utils import timezone

from .models import Commande, Menu, MenuPlat, Notification
from .tests import API, BaseAPITestCase


class RoleEmployeTests(BaseAPITestCase):

    def setUp(self):
        super().setUp()
        self.menu = self.creer_menu(jours=5)

    def test_admin_sans_role_employe_ne_commande_pas(self):
        r = self.client_pour(self.admin).post(f'{API}/commandes/', {'menu_id': self.menu.id, 'plat_id': self.plat1.id},
                                              format='json')
        self.assertEqual(r.status_code, 403)
        self.assertIn('Employé', str(r.data))
        self.assertEqual(self.client_pour(self.admin).get(f'{API}/commander/agences/').status_code, 403)
        self.assertEqual(self.client_pour(self.admin).get(f'{API}/compte-repas/mes-tarifs/').status_code, 403)

    def test_admin_avec_role_employe_commande(self):
        self.admin.groups.add(self.groupes['employe'])
        self.assertNotEqual(self.client_pour(self.admin).get(f'{API}/commander/agences/').status_code, 403)

    def test_consultation_de_l_historique_conservee(self):
        Commande.objects.create(user=self.gestionnaire, menu=self.menu, plat=self.plat1)
        r = self.client_pour(self.gestionnaire).get(f'{API}/compte-repas/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.client_pour(self.gestionnaire).get(f'{API}/commandes/').status_code, 200)

    def test_notification_de_menu_aux_seuls_employes(self):
        from .signals import _notifier_menu
        _notifier_menu(self.menu.id)
        self.assertTrue(Notification.objects.filter(user=self.employe, type='menu_disponible').exists())
        self.assertFalse(Notification.objects.filter(user=self.gestionnaire, type='menu_disponible').exists())

    def test_jeux_reserves_aux_employes(self):
        from . import jeux as J
        from .models import Jeu
        jeu = Jeu(titre='Q', debut=timezone.now(), fin=timezone.now() + timedelta(days=1))
        jeu.save()
        ids = set(J.destinataires(jeu).values_list('id', flat=True))
        self.assertIn(self.employe.id, ids)
        self.assertNotIn(self.gestionnaire.id, ids)
        self.assertNotIn(self.admin.id, ids)

    def test_migration_ajoute_le_role_a_qui_commandait(self):
        Commande.objects.create(user=self.gestionnaire, menu=self.menu, plat=self.plat1)
        m = import_module('api.migrations.0051_role_employe_commandes_recentes')
        m.ajouter_role(django_apps, None)
        self.assertTrue(self.gestionnaire.groups.filter(name='employe').exists())
        self.assertFalse(self.admin.groups.filter(name='employe').exists())    # n'a jamais commandé
