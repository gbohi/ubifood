"""
Tests du planning des équipes (api/planning_equipes.py) : équipe « Nuit »
réservée aux employés programmés, exclusivité, retrait du planning
(annulation + remboursement ou commande maintenue), notifications, import,
copie de semaine, commande tardive, rappels, droits de saisie.

Lancer : python manage.py test api.tests_planning_equipes
"""
from datetime import timedelta
from decimal import Decimal as D
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.utils import timezone

from . import comptes_repas as cr
from .models import (
    Categoriesalarie, Commande, HistoriqueProgrammation, Menu, MenuPlat, Notification, ParametresSociete,
    PlatCategoriesalarie, ProgrammationEquipe, RappelPlanning, TypeEquipe, UserCategoriesalarie,
)
from .planning_equipes import envoyer_rappels, lire_jours
from .tests import API, _EspacePrestataireBase, _synchrone


class _PlanningBase(_EspacePrestataireBase):

    def setUp(self):
        super().setUp()
        self.nuit = TypeEquipe.objects.create(libelle='Nuit', sur_planning=True, exclusive_planning=True)
        self.groupes['comptabilite'] = Group.objects.get_or_create(name='comptabilite')[0]
        self.compta = self.creer_user('compta1', 'employe')
        self.compta.groups.set([self.groupes['comptabilite']])
        debut = timezone.now() - timedelta(days=800)
        cat = Categoriesalarie.objects.create(libelle='Agent')
        PlatCategoriesalarie.objects.create(categoriesalarie=cat, montant=D('1000'), statut=self.statut,
                                            date_debut=debut)
        UserCategoriesalarie.objects.create(user=self.employe, categoriesalarie=cat, statut=self.statut,
                                            date_debut=debut)
        self.aujourdhui = timezone.localdate()

    def menu(self, jours, equipe=None, plats=None):
        m = Menu.objects.create(date_menu=self.aujourdhui + timedelta(days=jours), agence=self.agence,
                                typeequipe=equipe or self.typeequipe, prestataire=self.presta_a)
        for p in plats or [self.plat_a]:
            MenuPlat.objects.create(menu=m, plat=p)
        return m

    def programmer(self, user=None, debut=0, fin=10, jours=None, par=None, **extra):
        r = self.client_pour(par or self.admin).post(f'{API}/planning-equipes/programmer/', {
            'typeequipe': self.nuit.id, 'user_ids': [(user or self.employe).id],
            'date_debut': (self.aujourdhui + timedelta(days=debut)).isoformat(),
            'date_fin': (self.aujourdhui + timedelta(days=fin)).isoformat() if fin is not None else None,
            'jours': jours, **extra}, format='json')
        return r

    def commander(self, menu, user=None, mode='retenue'):
        return self.client_pour(user or self.employe).post(
            f'{API}/commandes/', {'menu_id': menu.id, 'plat_id': self.plat_a.id, 'mode_paiement': mode},
            format='json')


class AccesEquipeNuitTests(_PlanningBase):

    def test_non_programme_ne_voit_pas_la_nuit_et_ne_peut_pas_commander(self):
        m_nuit = self.menu(5, self.nuit)
        m_jour = self.menu(5)
        client = self.client_pour(self.employe)
        r = client.get(f'{API}/commander/prestataires/{self.presta_a.id}/equipes/', {'agence': self.agence.id})
        self.assertEqual([e['libelle'] for e in r.data['equipes']], ['Jour'])
        ids = {m['id'] for m in client.get(f'{API}/menus/', {'page_size': 100}).data['results']}
        self.assertEqual(ids, {m_jour.id})
        r = self.commander(m_nuit)
        self.assertEqual(r.status_code, 403)
        self.assertIn("pas programmé(e) dans l'équipe Nuit", str(r.data['detail']))
        # Jours : la nuit choisie explicitement → jour « non_programme »
        r = client.get(f'{API}/commander/jours/', {'agence': self.agence.id, 'prestataire': self.presta_a.id,
                                                   'equipe': self.nuit.id,
                                                   'semaine': m_nuit.date_menu.isoformat()})
        jour = next(j for j in r.data['jours'] if j['date'] == m_nuit.date_menu.isoformat())
        self.assertEqual((jour['etat'], jour['plats']), ('non_programme', []))
        self.assertTrue(jour['motif_indisponible'])

    def test_programme_voit_la_nuit_en_premier_et_commande(self):
        m_nuit = self.menu(5, self.nuit)
        self.menu(5)
        self.menu(12)          # jour hors période (programmé jusqu'à J+10) : équipe Jour visible
        self.assertEqual(self.programmer(fin=10).status_code, 200)
        r = self.client_pour(self.employe).get(f'{API}/commander/prestataires/{self.presta_a.id}/equipes/',
                                               {'agence': self.agence.id})
        noms = [e['libelle'] for e in r.data['equipes']]
        self.assertEqual(noms, ['Nuit', 'Jour'])
        nuit = r.data['equipes'][0]
        self.assertTrue(nuit['sur_planning'])
        self.assertIn('Programmé(e) du', nuit['programmation']['libelle'])
        # Équipe Jour : seulement le jour hors période (exclusive pendant la période)
        jour = r.data['equipes'][1]
        self.assertEqual(jour['jours'], [(self.aujourdhui + timedelta(days=12)).isoformat()])
        self.assertEqual(self.commander(m_nuit).status_code, 201)

    def test_exclusive_bloque_l_equipe_jour_et_non_exclusive_la_laisse(self):
        m_jour = self.menu(5)
        self.programmer(fin=10)
        r = self.commander(m_jour)
        self.assertEqual(r.status_code, 403)
        self.assertIn("programmé(e) dans l'équipe Nuit", str(r.data['detail']))
        self.nuit.exclusive_planning = False
        self.nuit.save()
        self.assertEqual(self.commander(m_jour).status_code, 201)

    def test_jours_de_la_semaine_respectes(self):
        # Programmé seulement le jour de la semaine de J+5
        cible = self.aujourdhui + timedelta(days=5)
        self.programmer(fin=13, jours=[cible.weekday()])
        m_ok = self.menu(5, self.nuit)
        m_ko = self.menu(6, self.nuit)
        self.assertEqual(self.commander(m_ok).status_code, 201)
        self.assertEqual(self.commander(m_ko).status_code, 403)

    def test_lecture_des_jours(self):
        self.assertEqual(lire_jours('Lu-Ve'), [0, 1, 2, 3, 4])
        self.assertEqual(lire_jours('lu, me ,ve'), [0, 2, 4])
        self.assertEqual(lire_jours('Sa-Lu'), [0, 5, 6])
        self.assertEqual(lire_jours(''), [0, 1, 2, 3, 4, 5, 6])


class RetraitPlanningTests(_PlanningBase):

    def test_retrait_annule_rembourse_ou_maintient_selon_le_delai(self):
        self.programmer(debut=0, fin=10)
        m_ouvert = self.menu(5, self.nuit)
        m_ferme = self.menu(1, self.nuit)          # délai d'annulation (48 h) dépassé
        cr.recharger(self.employe, D('5000'), self.admin)
        r = self.commander(m_ouvert, mode='compte')
        self.assertEqual(r.status_code, 201, r.data)
        c_ouvert = Commande.objects.get(pk=r.data['id'])
        self.assertEqual(c_ouvert.mode_paiement, 'compte')
        self.assertEqual(cr.solde(self.employe), D('4000'))
        c_ferme = Commande.objects.create(user=self.employe, menu=m_ferme, plat=self.plat_a)
        url = f'{API}/planning-equipes/retirer/'
        donnees = {'user': self.employe.id, 'typeequipe': self.nuit.id, 'motif': 'Changement de rotation'}
        # Aperçu : rien n'est modifié
        r = self.client_pour(self.admin).post(url, {**donnees, 'apercu': True}, format='json')
        self.assertEqual((r.data['nb_annulees'], r.data['nb_maintenues']), (1, 1))
        self.assertTrue(ProgrammationEquipe.objects.filter(user=self.employe).exists())
        c_ouvert.refresh_from_db()
        self.assertEqual(c_ouvert.statut, 'en_attente')
        # Exécution
        with patch('api.signals._en_arriere_plan', _synchrone), self.captureOnCommitCallbacks(execute=True):
            r = self.client_pour(self.admin).post(url, donnees, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        c_ouvert.refresh_from_db()
        c_ferme.refresh_from_db()
        self.assertEqual((c_ouvert.statut, c_ouvert.motif_annulation), ('annulee', 'planning'))
        self.assertEqual(c_ferme.statut, 'en_attente')
        self.assertEqual(cr.solde(self.employe), D('5000'))
        self.assertFalse(ProgrammationEquipe.objects.filter(user=self.employe).exists())
        # Notifications : employé (annulation + maintien), admin exclu (auteur), gestionnaire,
        # comptabilité, prestataire ; pas de notification générique « commande annulée »
        types = list(Notification.objects.filter(user=self.employe).values_list('type', 'titre'))
        self.assertIn(('planning_equipe', 'Commande annulée et remboursée'), types)
        self.assertIn(('planning_equipe', 'Commande maintenue'), types)
        self.assertFalse(Notification.objects.filter(user=self.employe, type='commande_annulee').exists())
        self.assertTrue(Notification.objects.filter(user=self.gestionnaire, type='planning_equipe').exists())
        self.assertTrue(Notification.objects.filter(user=self.compta, type='planning_equipe').exists())
        self.assertTrue(Notification.objects.filter(user=self.resp_a, type='commande_annulee').exists())
        self.assertFalse(Notification.objects.filter(user=self.admin).exists())
        self.assertTrue(HistoriqueProgrammation.objects.filter(user=self.employe, action='retrait',
                                                               motif='Changement de rotation').exists())

    def test_retrait_a_partir_d_une_date_et_reglages(self):
        self.programmer(debut=0, fin=10)
        m1 = self.menu(3, self.nuit)
        m2 = self.menu(6, self.nuit)
        c1 = Commande.objects.create(user=self.employe, menu=m1, plat=self.plat_a)
        c2 = Commande.objects.create(user=self.employe, menu=m2, plat=self.plat_a)
        p = ParametresSociete.charger()
        p.planning_notif_comptable = False
        p.save()
        with patch('api.signals._en_arriere_plan', _synchrone), self.captureOnCommitCallbacks(execute=True):
            r = self.client_pour(self.gestionnaire).post(f'{API}/planning-equipes/retirer/', {
                'user': self.employe.id, 'typeequipe': self.nuit.id,
                'a_partir_de': (self.aujourdhui + timedelta(days=5)).isoformat()}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        c1.refresh_from_db()
        c2.refresh_from_db()
        self.assertEqual((c1.statut, c2.statut), ('en_attente', 'annulee'))
        prog = ProgrammationEquipe.objects.get(user=self.employe)
        self.assertEqual(prog.date_fin, self.aujourdhui + timedelta(days=4))
        self.assertFalse(Notification.objects.filter(user=self.compta).exists())

    def test_annulation_auto_desactivee(self):
        self.programmer(debut=0, fin=10)
        c = Commande.objects.create(user=self.employe, menu=self.menu(5, self.nuit), plat=self.plat_a)
        p = ParametresSociete.charger()
        p.planning_annulation_auto = False
        p.save()
        r = self.client_pour(self.admin).post(f'{API}/planning-equipes/retirer/',
                                              {'user': self.employe.id, 'typeequipe': self.nuit.id}, format='json')
        self.assertEqual(r.data['nb_maintenues'], 1)
        c.refresh_from_db()
        self.assertEqual(c.statut, 'en_attente')

    def test_modification_de_periode_et_suppression(self):
        self.programmer(debut=0, fin=10)
        prog = ProgrammationEquipe.objects.get(user=self.employe)
        c = Commande.objects.create(user=self.employe, menu=self.menu(8, self.nuit), plat=self.plat_a)
        r = self.client_pour(self.admin).patch(f'{API}/planning-equipes/{prog.id}/', {
            'date_fin': (self.aujourdhui + timedelta(days=6)).isoformat(), 'apercu': True}, format='json')
        self.assertEqual(r.data['nb_annulees'], 1)
        r = self.client_pour(self.admin).patch(f'{API}/planning-equipes/{prog.id}/', {
            'date_fin': (self.aujourdhui + timedelta(days=6)).isoformat()}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        c.refresh_from_db()
        self.assertEqual(c.statut, 'annulee')
        r = self.client_pour(self.admin).delete(f'{API}/planning-equipes/{prog.id}/')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(ProgrammationEquipe.objects.exists())


class ProgrammationTests(_PlanningBase):

    def test_notification_conflit_et_jours_clos(self):
        m_jour = self.menu(1)                      # commandes déjà closes pour J+1
        c = Commande.objects.create(user=self.employe, menu=m_jour, plat=self.plat_a)
        with patch('api.signals._en_arriere_plan', _synchrone), self.captureOnCommitCallbacks(execute=True):
            r = self.programmer(debut=1, fin=7)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['nb_conflits'], 1)
        self.assertFalse(r.data['conflits'][0]['annulable'])
        self.assertTrue(any(x['date'] == m_jour.date_menu.isoformat() for x in r.data['closes']))
        titres = list(Notification.objects.filter(user=self.employe).values_list('titre', 'message'))
        self.assertTrue(any(t.startswith('Vous êtes programmé(e)') and 'closes' in m for t, m in titres))
        self.assertTrue(any(t.startswith('Repas à vérifier') and 'maintenu' in m for t, m in titres))
        c.refresh_from_db()
        self.assertEqual(c.statut, 'en_attente')     # jamais annulé à sa place

    def test_commande_tardive(self):
        m = self.menu(1, self.nuit)                # délai normal (48 h) dépassé
        self.nuit.heure_debut_retrait = timezone.datetime(2000, 1, 1, 22, 0).time()
        self.nuit.heure_fin_retrait = timezone.datetime(2000, 1, 1, 23, 0).time()
        self.nuit.save()
        self.programmer(debut=0, fin=5)
        self.assertEqual(self.commander(m).status_code, 400)
        p = ParametresSociete.charger()
        p.planning_commande_tardive = True
        p.planning_commande_tardive_heures = 12
        p.save()
        self.assertEqual(self.commander(m).status_code, 201)

    def test_droits_de_saisie(self):
        # Employé : refusé ; gestionnaire : ses agences seulement ; réglage désactivable
        self.assertEqual(self.programmer(par=self.employe2).status_code, 403)
        self.assertEqual(self.programmer(user=self.emp_yop, par=self.gestionnaire).status_code, 403)
        self.assertEqual(self.programmer(par=self.gestionnaire).status_code, 200)
        p = ParametresSociete.charger()
        p.planning_saisie_gestionnaire = False
        p.save()
        self.assertEqual(self.programmer(par=self.gestionnaire).status_code, 403)
        self.assertEqual(self.programmer(user=self.emp_yop, par=self.admin).status_code, 200)

    def test_equipe_non_reservee_refusee(self):
        r = self.client_pour(self.admin).post(f'{API}/planning-equipes/programmer/', {
            'typeequipe': self.typeequipe.id, 'user_ids': [self.employe.id],
            'date_debut': self.aujourdhui.isoformat()}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_grille_de_la_semaine(self):
        self.programmer(debut=0, fin=None)
        Commande.objects.create(user=self.employe, menu=self.menu(0, self.nuit), plat=self.plat_a)
        r = self.client_pour(self.gestionnaire).get(f'{API}/planning-equipes/',
                                                    {'semaine': self.aujourdhui.isoformat()})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['typeequipe'], self.nuit.id)
        ligne = r.data['lignes'][0]
        self.assertEqual(ligne['employe']['matricule'], 'emp1')
        case = next(c for c in ligne['jours'] if c['date'] == self.aujourdhui.isoformat())
        self.assertTrue(case['programme'])
        self.assertEqual(case['commande']['plat'], 'Alloco poulet')
        self.assertEqual(r.data['kpi']['employes'], 1)
        r = self.client_pour(self.gestionnaire).get(f'{API}/planning-equipes/employes/', {'q': 'emp'})
        self.assertIn('emp1', [e['matricule'] for e in r.data])
        self.assertNotIn('empyop', [e['matricule'] for e in r.data])

    def test_import_ajouter_et_remplacer(self):
        lignes = [
            {'ligne': 2, 'matricule': 'emp1', 'equipe': 'Nuit',
             'date_debut': (self.aujourdhui + timedelta(days=1)).isoformat(),
             'date_fin': (self.aujourdhui + timedelta(days=7)).isoformat(), 'jours': 'Lu-Ve'},
            {'ligne': 3, 'matricule': 'inconnu', 'equipe': 'Nuit', 'date_debut': self.aujourdhui.isoformat()},
            {'ligne': 4, 'matricule': 'emp2', 'equipe': 'Jour', 'date_debut': self.aujourdhui.isoformat()},
        ]
        url = f'{API}/planning-equipes/importer/'
        r = self.client_pour(self.admin).post(url, {'lignes': lignes, 'apercu': True}, format='json')
        self.assertEqual((r.data['nb_valides'], r.data['nb_erreurs']), (1, 2))
        self.assertEqual([l['statut'] for l in r.data['lignes']], ['ok', 'erreur', 'erreur'])
        self.assertFalse(ProgrammationEquipe.objects.exists())
        r = self.client_pour(self.admin).post(url, {'lignes': lignes}, format='json')
        prog = ProgrammationEquipe.objects.get()
        self.assertEqual((prog.user, prog.jours, prog.importee), (self.employe, [0, 1, 2, 3, 4], True))
        # Remplacer : employé2 programmé à l'écran sur la période, absent du fichier → retiré
        self.programmer(user=self.employe2, debut=2, fin=4)
        self.assertEqual(ProgrammationEquipe.objects.filter(user=self.employe2).count(), 1)
        r = self.client_pour(self.admin).post(url, {'lignes': lignes[:1], 'mode': 'remplacer'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertFalse(ProgrammationEquipe.objects.filter(user=self.employe2).exists())
        self.assertEqual(ProgrammationEquipe.objects.filter(user=self.employe).count(), 1)

    def test_import_matricule_sans_zero_de_tete(self):
        self.employe.username = '01427'
        self.employe.save()
        r = self.client_pour(self.admin).post(f'{API}/planning-equipes/importer/', {'lignes': [
            {'matricule': '1427', 'equipe': 'nuit', 'date_debut': self.aujourdhui.isoformat()}]}, format='json')
        self.assertEqual((r.data['nb_valides'], r.data['lignes'][0]['matricule']), (1, '01427'))
        self.assertTrue(ProgrammationEquipe.objects.filter(user=self.employe).exists())

    def test_copier_semaine_precedente(self):
        lundi = self.aujourdhui - timedelta(days=self.aujourdhui.weekday())
        ProgrammationEquipe.objects.create(user=self.employe, typeequipe=self.nuit,
                                           date_debut=lundi - timedelta(days=7),
                                           date_fin=lundi - timedelta(days=1), jours=[0, 2])
        r = self.client_pour(self.admin).post(f'{API}/planning-equipes/copier-semaine/', {
            'typeequipe': self.nuit.id, 'semaine': lundi.isoformat()}, format='json')
        self.assertEqual((r.status_code, r.data['programmes']), (200, 1))
        nouvelle = ProgrammationEquipe.objects.get(date_debut=lundi)
        self.assertEqual((nouvelle.date_fin, nouvelle.jours), (lundi + timedelta(days=6), [0, 2]))
        # Deuxième copie : déjà programmé, rien de plus
        r = self.client_pour(self.admin).post(f'{API}/planning-equipes/copier-semaine/', {
            'typeequipe': self.nuit.id, 'semaine': lundi.isoformat()}, format='json')
        self.assertEqual(r.data['programmes'], 0)

    def test_rappels(self):
        m = self.menu(3, self.nuit)
        self.programmer(debut=0, fin=10)
        p = ParametresSociete.charger()
        p.planning_rappel_jours = 2          # limite à J+1 minuit : fenêtre ouverte
        p.save()
        with patch('api.signals._en_arriere_plan', _synchrone):
            self.assertEqual(envoyer_rappels(), 1)
            self.assertEqual(envoyer_rappels(), 0)          # une seule fois
        self.assertTrue(RappelPlanning.objects.filter(user=self.employe, date_menu=m.date_menu).exists())
        self.assertTrue(Notification.objects.filter(user=self.employe, titre__startswith='Pensez à réserver')
                        .exists())
