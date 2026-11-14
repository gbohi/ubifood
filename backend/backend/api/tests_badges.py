"""
Retrait par badge d'accès : numéros décimal / hexadécimal, association,
import, badge perdu, comptoir (validation automatique réglable, badge
obligatoire), employé.

Lancer : python manage.py test api.tests_badges
"""
from unittest.mock import patch

from . import badges as B
from .models import BadgeAcces, Commande, Notification, ParametresSociete, Retrait
from .tests import API, _EspacePrestataireBase, _synchrone


class BadgesTests(_EspacePrestataireBase):

    def test_numero_decimal_ou_hexadecimal(self):
        B.associer(self.employe, '0012345678', self.admin)           # décimal (liste de la sécurité)
        self.assertEqual(B.trouver('00BC614E').user, self.employe)    # même badge lu en hexadécimal
        self.assertEqual(B.trouver('00 bc 61 4e').user, self.employe)
        self.assertIsNone(B.trouver('999'))
        self.assertEqual(B.masque('0012345678'), '•••• 5678')

    def test_un_badge_un_employe_et_remplacement(self):
        b1 = B.associer(self.employe, 'A1B2C3D4', self.admin)
        with self.assertRaises(Exception):
            B.associer(self.employe2, 'a1:b2:c3:d4', self.admin)        # déjà à un autre
        b2 = B.associer(self.employe, 'FFEE0011', self.admin)
        b1.refresh_from_db()
        self.assertEqual((b1.statut, b2.statut), ('remplace', 'actif'))

    def test_droits_gestionnaire_et_actions(self):
        c = self.client_pour(self.gestionnaire)
        r = c.post(f'{API}/admin/badges/', {'user': self.employe.id, 'numero': '0012345678'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['masque'], '•••• 5678')
        self.assertNotIn('0012345678', str(r.data))                    # numéro jamais renvoyé en clair
        bid = r.data['id']
        self.assertEqual(c.post(f'{API}/admin/badges/{bid}/perdu/').data['statut'], 'perdu')
        self.assertEqual(c.post(f'{API}/admin/badges/{bid}/reactiver/').data['statut'], 'actif')
        self.assertEqual(self.client_pour(self.employe2).post(f'{API}/admin/badges/',
                         {'user': self.employe.id, 'numero': '11112222'}, format='json').status_code, 403)
        sans = c.get(f'{API}/admin/badges/sans-badge/', {'tous': 1}).data
        self.assertNotIn(self.employe.id, [u['id'] for u in sans['sans_badge']])
        self.assertEqual(next(u for u in sans['employes'] if u['id'] == self.employe.id)['badge'], '•••• 5678')

    def test_import_apercu_puis_import(self):
        lignes = [{'ligne': 2, 'matricule': self.employe.username, 'numero': '0012345678'},
                  {'ligne': 3, 'matricule': 'inconnu', 'numero': '0099'},
                  {'ligne': 4, 'matricule': self.employe2.username, 'numero': '00BC614E'}]   # même badge
        c = self.client_pour(self.admin)
        r = c.post(f'{API}/admin/badges/import/', {'lignes': lignes, 'apercu': True}, format='json')
        self.assertEqual((r.data['a_associer'], r.data['erreurs']), (1, 2))
        self.assertIn('double', r.data['lignes'][2]['resultat'])
        self.assertFalse(BadgeAcces.objects.exists())
        c.post(f'{API}/admin/badges/import/', {'lignes': lignes}, format='json')
        self.assertEqual(BadgeAcces.objects.get().user, self.employe)

    def test_comptoir_badge_validation_auto_et_perdu(self):
        menu = self.menu_du_jour()
        Commande.objects.create(user=self.employe, menu=menu, plat=self.plat_a)
        b = B.associer(self.employe, '0012345678', self.admin)
        agent = self.client_pour(self.agent_a)
        r = agent.get(f'{API}/prestataire/comptoir/recherche/', {'carte': '00BC614E'})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data['validation_auto'])
        self.assertEqual(r.data['mode'], 'badge')
        ParametresSociete.objects.update(badge_validation_auto=False)
        self.assertFalse(agent.get(f'{API}/prestataire/comptoir/recherche/', {'carte': '0012345678'}).data['validation_auto'])
        with patch('api.signals._en_arriere_plan', _synchrone):
            v = agent.post(f'{API}/prestataire/comptoir/valider/', {'menu_id': menu.id, 'user_id': self.employe.id,
                                                                     'mode': 'badge'}, format='json')
        self.assertIn(v.status_code, (200, 201), v.data)
        self.assertEqual(Retrait.objects.get().mode, 'badge')
        self.assertEqual(agent.get(f'{API}/prestataire/comptoir/recherche/', {'carte': '777777'}).data['code'],
                         'badge_inconnu')
        B.changer_statut(b, 'perdu', self.employe)
        with patch('api.signals._en_arriere_plan', _synchrone):
            r = agent.get(f'{API}/prestataire/comptoir/recherche/', {'carte': '0012345678'})
        self.assertEqual((r.status_code, r.data['code']), (409, 'badge_perdu'))
        self.assertTrue(Notification.objects.filter(user=self.gestionnaire, titre__contains='Badge perdu').exists())

    def test_lecture_rapide_badge_sinon_qr(self):
        menu = self.menu_du_jour()
        Commande.objects.create(user=self.employe, menu=menu, plat=self.plat_a)
        B.associer(self.employe2, '0012345678', self.admin)
        agent = self.client_pour(self.agent_a)
        url = f'{API}/prestataire/comptoir/recherche/'
        r = agent.get(url, {'carte': self.employe.username, 'repli': 1})        # QR code (matricule)
        self.assertEqual((r.status_code, r.data['employe']['id'], r.data['mode']), (200, self.employe.id, None))
        r = agent.get(url, {'carte': '00BC614E', 'repli': 1})                   # badge
        self.assertEqual((r.data['employe']['id'], r.data['mode']), (self.employe2.id, 'badge'))
        self.assertEqual(agent.get(url, {'carte': '424242', 'repli': 1}).data['code'], 'badge_inconnu')

    def test_badge_obligatoire_refuse_qr_et_saisie(self):
        menu = self.menu_du_jour()
        Commande.objects.create(user=self.employe, menu=menu, plat=self.plat_a)
        ParametresSociete.charger()
        ParametresSociete.objects.update(badge_obligatoire=True)
        agent = self.client_pour(self.agent_a)
        self.assertEqual(agent.get(f'{API}/prestataire/comptoir/recherche/?badge=EMP1').data['code'], 'badge_obligatoire')
        r = agent.post(f'{API}/prestataire/comptoir/valider/', {'menu_id': menu.id, 'user_id': self.employe.id,
                                                                 'mode': 'scan'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_employe_declare_son_badge_perdu(self):
        B.associer(self.employe, '0012345678', self.admin)
        c = self.client_pour(self.employe)
        self.assertEqual(c.get(f'{API}/badge/').data['badge']['masque'], '•••• 5678')
        r = c.post(f'{API}/badge/perdu/')
        self.assertIsNone(r.data['badge'])
        self.assertEqual(r.data['perdu']['statut'], 'perdu')
        self.assertIsNone(B.trouver('0012345678'))
