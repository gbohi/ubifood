"""
Tests du suivi des repas (api/suivi_repas.py) : étapes déclarées par le
prestataire, notifications selon les réglages et les préférences, étapes
automatiques, rappel, incidents, frise de l'employé (accueil), vue du
gestionnaire, ponctualité.

Lancer : python manage.py test api.tests_suivi_repas
"""
from datetime import datetime, time as dtime, timedelta
from unittest.mock import patch

from django.utils import timezone

from .models import Commande, IncidentRepas, Notification, ParametresSociete, SuiviRepas
from .suivi_repas import taches_suivi
from .tests import API, _EspacePrestataireBase, _synchrone


class _SuiviBase(_EspacePrestataireBase):

    def setUp(self):
        super().setUp()
        self.typeequipe.heure_debut_retrait, self.typeequipe.heure_fin_retrait = dtime(11, 30), dtime(14, 0)
        self.typeequipe.save()
        self.menu = self.menu_du_jour()
        self.menu.prestataire = self.presta_a
        self.menu.save()
        self.c1 = Commande.objects.create(user=self.employe, menu=self.menu, plat=self.plat_a)
        self.c2 = Commande.objects.create(user=self.employe2, menu=self.menu, plat=self.plat_a)

    def a(self, h, m=0, jours=0):
        return datetime.combine(timezone.localdate() + timedelta(days=jours), dtime(h, m),
                                tzinfo=timezone.get_current_timezone())

    def etape(self, etape, user=None):
        with patch('api.signals._en_arriere_plan', _synchrone):
            return self.client_pour(user or self.agent_a).post(f'{API}/prestataire/suivi/{self.menu.id}/',
                                                               {'etape': etape}, format='json')

    def notifs(self, user, **filtre):
        return list(Notification.objects.filter(user=user, type='suivi_repas', **filtre)
                    .values_list('titre', flat=True))


class PrestataireSuiviTests(_SuiviBase):

    def test_etapes_et_notifications_selon_reglages(self):
        with patch('django.utils.timezone.now', return_value=self.a(9, 0)):
            r = self.client_pour(self.agent_a).get(f'{API}/prestataire/suivi/')
            self.assertEqual(r.status_code, 200, r.data)
            s = r.data['services'][0]
            self.assertEqual((s['nb_repas'], s['prochaine_action']), (2, 'preparation'))
            # Préparation, livraison : visibles dans l'appli, sans push (par défaut)
            self.assertEqual(self.etape('preparation').status_code, 200)
            r = self.etape('en_route')
            self.assertEqual((r.status_code, r.data['notifies']), (200, 0))
            self.assertEqual(r.data['service']['prochaine_action'], 'arrive')
            self.assertEqual(self.notifs(self.employe), [])
            # Déjà fait : refusé
            self.assertEqual(self.etape('en_route').status_code, 400)
            # Arrivé : push à tous les employés du service
            r = self.etape('arrive')
            self.assertEqual(r.data['notifies'], 2)
        self.assertEqual(self.notifs(self.employe), ['🍽️ Votre repas est arrivé'])
        self.assertTrue(Notification.objects.filter(user=self.employe2, type='suivi_repas').exists())
        s = SuiviRepas.objects.get(menu=self.menu)
        self.assertEqual((s.arrive_par, s.arrive_auto), (self.agent_a, False))

    def test_push_en_route_et_preference_employe(self):
        p = ParametresSociete.charger()
        p.suivi_etapes = {**p.suivi_etapes, 'en_route': {'actif': True, 'push': True}}
        p.save()
        self.employe2.preferences_suivi = {'en_route': False}
        self.employe2.save()
        with patch('django.utils.timezone.now', return_value=self.a(10, 0)):
            r = self.etape('en_route')
        self.assertEqual(r.data['notifies'], 1)
        self.assertEqual(self.notifs(self.employe), ['🚚 Repas en route'])
        self.assertEqual(self.notifs(self.employe2), [])

    def test_etape_desactivee_et_menu_d_un_autre_prestataire(self):
        p = ParametresSociete.charger()
        p.suivi_etapes = {**p.suivi_etapes, 'en_route': {'actif': False, 'push': False}}
        p.save()
        with patch('django.utils.timezone.now', return_value=self.a(10, 0)):
            self.assertEqual(self.etape('en_route').status_code, 400)
            r = self.client_pour(self.agent_a).get(f'{API}/prestataire/suivi/')
            codes = [e['code'] for e in r.data['services'][0]['etapes']]
            self.assertEqual(codes, ['preparation', 'arrive'])
            autre = self.creer_compte('respx', 'prestataire', self.presta_b)
            self.assertEqual(self.etape('arrive', autre).status_code, 404)
            self.assertEqual(self.client_pour(self.employe).get(f'{API}/prestataire/suivi/').status_code, 403)

    def test_incident_retard(self):
        with patch('django.utils.timezone.now', return_value=self.a(11, 0)), \
                patch('api.signals._en_arriere_plan', _synchrone):
            url = f'{API}/prestataire/suivi/{self.menu.id}/incident/'
            agent = self.client_pour(self.agent_a)
            self.assertEqual(agent.post(url, {'type': 'retard'}, format='json').status_code, 400)
            self.assertEqual(agent.post(url, {'type': 'autre'}, format='json').status_code, 400)
            r = agent.post(url, {'type': 'retard', 'heure': '12:45', 'message': 'Embouteillage.'}, format='json')
            self.assertEqual((r.status_code, r.data['notifies']), (201, 2))
            self.assertEqual(r.data['service']['statut'], 'retard')
            arrive = next(e for e in r.data['service']['etapes'] if e['code'] == 'arrive')
            self.assertEqual(arrive['prevu'], '12:45')
        self.assertEqual(self.notifs(self.employe), ['⏱️ Retard de livraison'])
        self.assertTrue(Notification.objects.filter(user=self.gestionnaire, type='suivi_repas').exists())
        self.assertEqual(IncidentRepas.objects.count(), 1)


class AutomatiqueTests(_SuiviBase):

    def test_preparation_et_arrivee_automatiques_puis_rappel(self):
        with patch('api.signals._en_arriere_plan', _synchrone):
            self.assertEqual(taches_suivi(self.a(9, 0)), {'preparation': 0, 'arrive': 0, 'rappels': 0})
            self.assertEqual(taches_suivi(self.a(9, 35))['preparation'], 1)     # 2 h avant 11:30
            self.assertEqual(self.notifs(self.employe), [])                    # sans push par défaut
            self.assertEqual(taches_suivi(self.a(11, 31))['arrive'], 1)
            self.assertEqual(self.notifs(self.employe), ['🍽️ Votre repas est arrivé'])
            self.assertEqual(taches_suivi(self.a(11, 40))['arrive'], 0)         # une seule fois
            # Rappel 30 min avant la fin (14:00) : seulement ceux qui n'ont pas retiré
            self.c2.statut = 'retiree'
            self.c2.save()
            self.assertEqual(taches_suivi(self.a(13, 35))['rappels'], 1)
            self.assertEqual(taches_suivi(self.a(13, 40))['rappels'], 0)
        s = SuiviRepas.objects.get(menu=self.menu)
        self.assertTrue(s.arrive_auto and s.preparation_auto)
        self.assertIn('⏰ Votre repas vous attend', self.notifs(self.employe))

    def test_arrivee_declaree_avant_l_heure_pas_d_automatique(self):
        with patch('django.utils.timezone.now', return_value=self.a(11, 20)):
            self.etape('arrive')
        with patch('api.signals._en_arriere_plan', _synchrone):
            self.assertEqual(taches_suivi(self.a(11, 35))['arrive'], 0)
        self.assertEqual(len(self.notifs(self.employe)), 1)


class EmployeEtGestionnaireTests(_SuiviBase):

    def test_frise_de_l_employe_sur_l_accueil(self):
        with patch('django.utils.timezone.now', return_value=self.a(10, 0)):
            self.etape('en_route')
            r = self.client_pour(self.employe).get(f'{API}/accueil/')
        s = r.data['suivi']
        self.assertEqual((s['commande_id'], s['statut'], s['statut_libelle']), (self.c1.id, 'en_route', 'En route'))
        self.assertEqual([(e['code'], e['statut']) for e in s['etapes']],
                         [('confirmee', 'fait'), ('preparation', 'fait'), ('en_route', 'fait'),
                          ('arrive', 'en_cours'), ('retire', 'a_venir')])
        self.assertIn('en route', s['message'])

    def test_preferences(self):
        client = self.client_pour(self.employe)
        r = client.get(f'{API}/suivi/preferences/')
        self.assertTrue(r.data['modifiable'])
        dispo = {x['code']: x['disponible'] for x in r.data['preferences']}
        self.assertEqual(dispo, {'preparation': False, 'en_route': False, 'rappel': True, 'incidents': True})
        r = client.patch(f'{API}/suivi/preferences/', {'rappel': False}, format='json')
        self.assertFalse(next(x for x in r.data['preferences'] if x['code'] == 'rappel')['actif'])
        self.employe.refresh_from_db()
        self.assertEqual(self.employe.preferences_suivi, {'rappel': False})
        p = ParametresSociete.charger()
        p.suivi_preferences_employe = False
        p.save()
        self.assertEqual(client.patch(f'{API}/suivi/preferences/', {'rappel': True}, format='json').status_code, 403)

    def test_gestionnaire_service_du_jour_et_ponctualite(self):
        with patch('django.utils.timezone.now', return_value=self.a(11, 42)):
            self.etape('arrive')
            r = self.client_pour(self.gestionnaire).get(f'{API}/suivi-livraisons/')
            self.assertEqual(r.status_code, 200, r.data)
            s = r.data['services'][0]
            self.assertEqual((s['ponctualite']['statut'], s['ponctualite']['retard_minutes']), ('retard', 12))
            r = self.client_pour(self.gestionnaire).get(f'{API}/suivi-livraisons/ponctualite/')
        ligne = r.data['prestataires'][0]
        self.assertEqual((ligne['services'], ligne['retards'], ligne['retard_moyen_minutes'], ligne['taux_a_l_heure']),
                         (1, 1, 12, 0))
        self.assertEqual(self.client_pour(self.employe).get(f'{API}/suivi-livraisons/').status_code, 403)

    def test_reglages_societe_et_commande_confirmee(self):
        r = self.client_pour(self.admin).patch(f'{API}/parametres-societe/', {
            'suivi_etapes': {'confirmee': {'actif': True, 'push': False},
                             'preparation': {'actif': True, 'push': False, 'auto_heures': 99}}}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.client_pour(self.admin).patch(f'{API}/parametres-societe/', {
            'suivi_etapes': {'confirmee': {'actif': True, 'push': False}, 'retire': {'actif': True, 'push': False}}},
            format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertFalse(r.data['suivi_etapes']['confirmee']['push'])
        self.assertTrue(r.data['suivi_etapes']['retire']['push'])          # toujours (contestation)
        menu = self.menu_du_jour(jours=5)
        with patch('api.signals._en_arriere_plan', _synchrone), self.captureOnCommitCallbacks(execute=True):
            r = self.client_pour(self.employe).post(f'{API}/commandes/', {'menu_id': menu.id,
                                                                          'plat_id': self.plat_a.id})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertFalse(Notification.objects.filter(user=self.employe, type='commande_passee').exists())
