"""
Jeux (quiz à lots) : temps tenu par le serveur, mode direct, condition de
participation, classement et départage, lots (crédit, retrait unique),
notifications.

Lancer : python manage.py test api.tests_jeux
"""
from datetime import timedelta
from decimal import Decimal as D
from unittest.mock import patch

from django.utils import timezone

from . import jeux as J
from .models import (
    Agence, Commande, CompteRepas, Jeu, MouvementCompte, Notification, ParticipationJeu, ReponseJeu, UserAgence,
)
from .tests import API, BaseAPITestCase, _synchrone


def _q(texte, duree=20, points=100, bonne=0, n=3):
    return {'texte': texte, 'duree': duree, 'points': points,
            'reponses': [{'texte': f'{texte} R{i}', 'correcte': i == bonne} for i in range(n)]}


class _JeuxBase(BaseAPITestCase):

    def setUp(self):
        super().setUp()
        self.t0 = timezone.now().replace(microsecond=0) + timedelta(hours=1)
        self.employe3 = self.creer_user('emp3', 'employe')
        for u in (self.employe2, self.employe3):
            UserAgence.objects.create(user=u, agence=self.agence, statut=self.statut,
                                      date_debut=timezone.now() - timedelta(days=30))
        self.menu = self.creer_menu(jours=0)
        self.menu.date_menu = timezone.localdate(self.t0)
        self.menu.save()

    def creer_jeu(self, mode='libre', nbq=3, durees=(20, 20, 20), lots=None, programmer=True, **extra):
        d = {'titre': 'Quiz de novembre', 'mode': mode, 'debut': self.t0.isoformat(),
             'fin': (self.t0 + timedelta(days=2)).isoformat(), 'nb_questions': nbq,
             'questions': [_q(f'Q{i}', duree=dur) for i, dur in enumerate(durees)],
             'lots': lots if lots is not None else [
                 {'rang_debut': 1, 'rang_fin': 1, 'libelle': 'Smartphone', 'type': 'objet'},
                 {'rang_debut': 2, 'rang_fin': 2, 'libelle': '20 000 F', 'type': 'argent', 'montant': 20000}],
             **extra}
        jeu = J.enregistrer(Jeu(), d, self.admin, maintenant=self.t0 - timedelta(days=1))
        if programmer:
            with patch('api.signals._en_arriere_plan', _synchrone), self.captureOnCommitCallbacks(execute=True):
                J.programmer(jeu, self.admin, maintenant=self.t0 - timedelta(days=1))
        return Jeu.objects.get(pk=jeu.pk)

    def commander(self, user, statut='en_attente', plat=None):
        return Commande.objects.create(user=user, menu=self.menu, plat=plat or self.plat1, statut=statut)

    def bonne(self, p, index):
        r = p.reponses.get(index=index)
        return ReponseJeu.objects.get(question=r.question, correcte=True).id

    def mauvaise(self, p, index):
        r = p.reponses.get(index=index)
        return ReponseJeu.objects.filter(question=r.question, correcte=False).first().id

    def partie(self, jeu, user, t):
        J.commencer(jeu, user, t)
        p = ParticipationJeu.objects.select_related('jeu').get(jeu=jeu, user=user)
        J.avancer(p, t)
        return p

    def a(self, secondes):
        return self.t0 + timedelta(seconds=secondes)


class ChronoServeurTests(_JeuxBase):

    def test_les_questions_s_enchainent_et_le_temps_continue_hors_de_l_application(self):
        self.commander(self.employe)
        jeu = self.creer_jeu()
        p = self.partie(jeu, self.employe, self.a(0))
        e = J.etat_partie(p, self.a(0))
        self.assertEqual((e['statut'], e['index'], e['restant_ms']), ('question', 0, 20000))
        self.assertNotIn('correcte', str(e['question']))           # aucune bonne réponse envoyée
        J.repondre(p, 0, self.bonne(p, 0), self.a(5))
        # la question suivante s'ouvre tout de suite (pas de pause)
        e = J.etat_partie(p, self.a(5))
        self.assertEqual((e['index'], e['restant_ms']), (1, 20000))
        self.assertNotIn('points', e)                              # pas de score pendant la partie
        # il quitte l'application 30 s : Q1 expire à 25 s, Q2 s'ouvre à 25 s, il revient à 35 s
        J.avancer(p, self.a(35))
        e = J.etat_partie(p, self.a(35))
        self.assertEqual((e['index'], e['restant_ms']), (2, 10000))
        self.assertFalse(p.reponses.get(index=1).correcte)
        # absent jusqu'au bout : partie terminée à la limite de la dernière question
        J.avancer(p, self.a(100))
        p.refresh_from_db()
        self.assertEqual(p.termine_le, self.a(45))
        self.assertEqual(p.points, 100 + round(100 * 0.5 * 15 / 20))
        self.assertEqual(p.nb_bonnes, 1)
        self.assertEqual(p.temps_total_ms, 5000 + 20000 + 20000)

    def test_reponse_apres_la_limite_refusee_tolerance_reseau(self):
        self.commander(self.employe)
        jeu = self.creer_jeu()
        p = self.partie(jeu, self.employe, self.a(0))
        J.repondre(p, 0, self.bonne(p, 0), self.a(21))                # 1 s de retard : toléré
        r = p.reponses.get(index=0)
        self.assertEqual((r.correcte, r.points, r.temps_ms), (True, 100, 20000))
        with self.assertRaises(Exception):
            J.repondre(p, 1, self.bonne(p, 1), self.a(20 + 20 + 3))   # 3 s de retard : refusé

    def test_api_partie_reprise_et_reponse_tardive(self):
        self.commander(self.employe)
        jeu = self.creer_jeu()
        c = self.client_pour(self.employe)
        with patch('django.utils.timezone.now', return_value=self.a(0)):
            r = c.post(f'{API}/jeux/{jeu.id}/commencer/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['statut'], 'question')
        choix = r.data['question']['reponses'][0]['id']
        with patch('django.utils.timezone.now', return_value=self.a(10)):
            r2 = c.post(f'{API}/jeux/{jeu.id}/commencer/')            # reprise : même partie, même chrono
            self.assertEqual((r2.data['index'], r2.data['restant_ms']), (0, 10000))
        with patch('django.utils.timezone.now', return_value=self.a(30)):
            r = c.post(f'{API}/jeux/{jeu.id}/repondre/', {'index': 0, 'reponse_id': choix}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['code'], 'temps_ecoule')
        self.assertEqual(r.data['etat']['index'], 1)
        self.assertEqual(ParticipationJeu.objects.filter(jeu=jeu).count(), 1)

    def test_corrections_visibles_seulement_a_la_fin_du_jeu(self):
        self.commander(self.employe)
        jeu = self.creer_jeu()
        p = self.partie(jeu, self.employe, self.a(0))
        for i in range(3):
            J.repondre(p, i, self.bonne(p, i), self.a(i + 1))
        c = self.client_pour(self.employe)
        with patch('django.utils.timezone.now', return_value=self.a(60)):
            r = c.get(f'{API}/jeux/{jeu.id}/resultats/')
        self.assertFalse(r.data['corrections'])
        self.assertNotIn('bonne_reponse', r.data['reponses'][0])
        self.assertEqual(r.data['jeu']['participation']['nb_bonnes'], 3)   # son score, à la fin de sa partie
        with patch('django.utils.timezone.now', return_value=J.fin_parties(jeu) + timedelta(seconds=1)):
            r = c.get(f'{API}/jeux/{jeu.id}/resultats/')
        self.assertTrue(r.data['corrections'])
        self.assertTrue(r.data['reponses'][0]['correcte'])
        self.assertIn('bonne_reponse', r.data['reponses'][0])

    def test_banque_de_questions_et_reponses_melangees(self):
        self.commander(self.employe)
        jeu = self.creer_jeu(nbq=3, durees=(20,) * 8)
        p = self.partie(jeu, self.employe, self.a(0))
        self.assertEqual(len(p.questions), 3)
        self.assertEqual(len(set(p.questions)), 3)
        self.assertTrue(set(p.questions) <= set(jeu.questions.values_list('id', flat=True)))


class ModeDirectTests(_JeuxBase):

    def test_tout_le_monde_a_la_meme_question_au_meme_moment(self):
        for u in (self.employe, self.employe2):
            self.commander(u)
        jeu = self.creer_jeu(mode='direct', durees=(10, 20, 30))
        self.assertEqual(jeu.fin, self.t0 + timedelta(seconds=60))
        # salle d'attente 15 min avant
        p1 = self.partie(jeu, self.employe, self.a(-600))
        self.assertEqual(J.etat_partie(p1, self.a(-600))['statut'], 'attente_debut')
        with self.assertRaises(Exception):
            J.commencer(jeu, self.employe2, self.a(-1000))
        d0, d1 = [jeu.questions.get(id=i).duree for i in jeu.tirage_direct[:2]]
        J.avancer(p1, self.a(2))
        J.repondre(p1, 0, self.bonne(p1, 0), self.a(2))
        e = J.etat_partie(p1, self.a(2))
        self.assertEqual(e['statut'], 'attente_suivante')          # pas d'avance sur les autres
        self.assertEqual(e['suivante_dans_ms'], (d0 - 2) * 1000)
        # le second arrive en retard : Q0 est perdue, il est sur Q1 comme tout le monde
        p2 = self.partie(jeu, self.employe2, self.a(d0 + 2))
        self.assertEqual(p2.questions, p1.questions)
        e2 = J.etat_partie(p2, self.a(d0 + 2))
        self.assertEqual((e2['index'], e2['restant_ms']), (1, (d1 - 2) * 1000))
        J.avancer(p1, self.a(d0 + 2))
        self.assertEqual(J.etat_partie(p1, self.a(d0 + 2))['index'], 1)
        J.avancer(p2, self.a(70))
        p2.refresh_from_db()
        self.assertEqual(p2.termine_le, self.a(60))
        self.assertEqual(p2.temps_total_ms, 60000)


class ConditionEtClassementTests(_JeuxBase):

    def test_il_faut_avoir_commande_dans_le_mois(self):
        jeu = self.creer_jeu()
        c = self.client_pour(self.employe)
        with patch('django.utils.timezone.now', return_value=self.a(0)):
            r = c.get(f'{API}/jeux/{jeu.id}/')
            self.assertFalse(r.data['eligibilite']['ok'])
            self.commander(self.employe, statut='annulee')
            self.assertEqual(c.post(f'{API}/jeux/{jeu.id}/commencer/').status_code, 400)
            self.commander(self.employe, plat=self.plat2)
            self.assertEqual(c.post(f'{API}/jeux/{jeu.id}/commencer/').status_code, 200)

    def jouer(self, jeu, user, bonnes, t, delai=1):
        p = self.partie(jeu, user, t)
        for i in range(len(p.questions)):
            rid = self.bonne(p, i) if i < bonnes else self.mauvaise(p, i)
            J.repondre(p, i, rid, t + timedelta(seconds=delai * (i + 1)))
        p.refresh_from_db()
        return p

    def publier(self, jeu):
        with patch('api.signals._en_arriere_plan', _synchrone), self.captureOnCommitCallbacks(execute=True):
            J.publier_resultats(jeu, self.admin, J.fin_parties(jeu) + timedelta(seconds=1))

    def test_departage_nombre_de_gagnants_lots_et_retrait_unique(self):
        for u in (self.employe, self.employe2, self.employe3):
            self.commander(u)
        jeu = self.creer_jeu()
        p1 = self.jouer(jeu, self.employe, 3, self.a(0), delai=2)      # 3 bonnes, plus lent
        p2 = self.jouer(jeu, self.employe2, 3, self.a(0), delai=1)     # 3 bonnes, plus rapide
        p3 = self.jouer(jeu, self.employe3, 3, self.a(100), delai=2)   # comme p1 mais a fini plus tard
        self.assertEqual(p1.points, p3.points)
        classes = [p.user_id for p, *_ in J.classer(jeu, self.a(200))]
        self.assertEqual(classes, [self.employe2.id, self.employe.id, self.employe3.id])
        self.publier(jeu)
        p1.refresh_from_db(); p2.refresh_from_db(); p3.refresh_from_db()
        self.assertEqual((p2.rang, p2.lot.libelle, p2.statut_lot), (1, 'Smartphone', 'a_remettre'))
        self.assertEqual((p1.rang, p1.statut_lot), (2, 'credite'))
        self.assertEqual((p3.rang, p3.lot_id), (3, None))               # 2 lots = 2 gagnants, pas plus
        self.assertEqual(CompteRepas.objects.get(user=self.employe).solde, D('20000'))
        self.assertTrue(MouvementCompte.objects.filter(type='gain_jeu', compte__user=self.employe).exists())
        self.assertTrue(Notification.objects.filter(user=self.employe3, type='jeu', donnees__resultat='perdu').exists())
        # vue employé : gagné / perdu
        r = self.client_pour(self.employe3).get(f'{API}/jeux/{jeu.id}/')
        self.assertEqual(r.data['participation']['resultat'], 'perdu')
        r = self.client_pour(self.employe2).get(f'{API}/jeux/{jeu.id}/')
        self.assertEqual((r.data['participation']['resultat'], r.data['participation']['statut_lot']),
                         ('gagne', 'a_remettre'))
        # retrait du lot : une seule fois
        url = f'{API}/admin/jeux/{jeu.id}/remettre/{p2.id}/'
        with patch('api.signals._en_arriere_plan', _synchrone), self.captureOnCommitCallbacks(execute=True):
            r = self.client_pour(self.gestionnaire).post(url)
        self.assertEqual(r.status_code, 200, r.data)
        r = self.client_pour(self.admin).post(url)
        self.assertEqual(r.status_code, 400)
        self.assertIn('déjà retiré', str(r.data))
        r = self.client_pour(self.employe2).get(f'{API}/jeux/{jeu.id}/')
        self.assertEqual(r.data['participation']['statut_lot'], 'remis')
        self.assertIsNotNone(r.data['participation']['lot_remis_le'])
        self.assertTrue(Notification.objects.filter(user=self.employe2, donnees__lot_retire=True).exists())
        # un lot crédité ne se « retire » pas
        r = self.client_pour(self.admin).post(f'{API}/admin/jeux/{jeu.id}/remettre/{p1.id}/')
        self.assertEqual(r.status_code, 400)
        # classement employé : noms abrégés, « Vous »
        r = self.client_pour(self.employe).get(f'{API}/jeux/{jeu.id}/classement/')
        noms = [l['nom'] for l in r.data['lignes']]
        self.assertEqual(noms, ['Test E.', 'Vous', 'Test E.'])

    def test_condition_reverifiee_et_score_minimum(self):
        self.commander(self.employe)
        c2 = self.commander(self.employe2)
        self.commander(self.employe3)
        jeu = self.creer_jeu(score_minimum_pct=50,
                             lots=[{'rang_debut': 1, 'rang_fin': 1, 'libelle': 'T-shirt', 'type': 'objet'}])
        self.jouer(jeu, self.employe2, 3, self.a(0))        # meilleur, mais annule sa commande
        self.jouer(jeu, self.employe, 1, self.a(0))         # 1/3 < 50 %
        self.jouer(jeu, self.employe3, 2, self.a(0))
        c2.statut = 'annulee'
        c2.save()
        self.publier(jeu)
        p = {x.user_id: x for x in ParticipationJeu.objects.filter(jeu=jeu)}
        self.assertIsNone(p[self.employe2.id].rang)
        self.assertIn('Condition non remplie', p[self.employe2.id].exclu_motif)
        self.assertEqual((p[self.employe3.id].rang, p[self.employe3.id].lot.libelle), (1, 'T-shirt'))
        self.assertEqual(p[self.employe.id].rang, 2)
        r = self.client_pour(self.employe2).get(f'{API}/jeux/{jeu.id}/')
        self.assertEqual(r.data['participation']['resultat'], 'non_classe')

    def test_publication_impossible_avant_la_fin_des_parties(self):
        jeu = self.creer_jeu()
        with self.assertRaises(Exception):
            J.publier_resultats(jeu, self.admin, jeu.fin + timedelta(seconds=1))


class AdministrationEtNotificationsTests(_JeuxBase):

    def test_programmation_notifie_tous_les_employes(self):
        jeu = self.creer_jeu()
        for u in (self.employe, self.employe2, self.employe3):
            self.assertTrue(Notification.objects.filter(user=u, type='jeu', titre__contains='Nouveau jeu').exists())
        self.assertEqual(Notification.objects.filter(donnees__jeu_id=jeu.id).count(),
                         J.destinataires(jeu).count())

    def test_jeu_reserve_a_une_agence(self):
        autre = Agence.objects.create(nom_agence='Yopougon')
        jeu = self.creer_jeu(agences=[autre.id])
        self.assertFalse(Notification.objects.filter(user=self.employe, donnees__jeu_id=jeu.id).exists())
        r = self.client_pour(self.employe).get(f'{API}/jeux/')
        self.assertEqual(r.data['a_venir'], [])
        self.assertEqual(self.client_pour(self.employe).get(f'{API}/jeux/{jeu.id}/').status_code, 404)

    def test_taches_rappel_ouverture_relance(self):
        with patch('api.signals._en_arriere_plan', _synchrone):
            direct = self.creer_jeu(mode='direct')
            libre = self.creer_jeu()
            n = J.destinataires(libre).count()
            self.assertEqual(J.taches_jeux(self.a(-60))['rappels'], n)          # direct : 15 min avant
            self.assertEqual(J.taches_jeux(self.a(-30))['rappels'], 0)          # une seule fois
            self.assertEqual(J.taches_jeux(self.a(1))['ouvertures'], 2 * n)     # les deux jeux
            self.commander(self.employe)
            self.partie(libre, self.employe, self.a(2))
            t = libre.fin - timedelta(hours=2)
            self.assertEqual(J.taches_jeux(t)['relances'], n - 1)                # sauf celui qui a joué
            self.assertEqual(J.taches_jeux(t)['relances'], 0)
        self.assertTrue(Notification.objects.filter(user=self.employe, donnees__jeu_id=direct.id,
                                                    titre__contains='commence').exists())

    def test_validation_et_droits(self):
        c = self.client_pour(self.admin)
        base = {'titre': 'Quiz', 'mode': 'libre', 'debut': self.t0.isoformat(),
                'fin': (self.t0 + timedelta(days=1)).isoformat(), 'nb_questions': 1,
                'lots': [{'rang_debut': 1, 'rang_fin': 1, 'libelle': 'T-shirt'}]}
        q = _q('Q')
        q['reponses'][1]['correcte'] = True
        r = c.post(f'{API}/admin/jeux/', {**base, 'questions': [q]}, format='json')
        self.assertEqual(r.status_code, 400)
        r = c.post(f'{API}/admin/jeux/', {**base, 'questions': [_q('Q')],
                                          'lots': [{'rang_debut': 2, 'rang_fin': 3, 'libelle': 'X'}]}, format='json')
        self.assertEqual(r.status_code, 400)                                    # rangs sans le 1er
        r = c.post(f'{API}/admin/jeux/', {**base, 'questions': [_q('Q')]}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.client_pour(self.gestionnaire).post(
            f'{API}/admin/jeux/', {**base, 'questions': [_q('Q')]}, format='json').status_code, 403)
        self.assertEqual(self.client_pour(self.gestionnaire).get(f'{API}/admin/jeux/').status_code, 200)
        self.assertEqual(self.client_pour(self.employe).get(f'{API}/admin/jeux/').status_code, 403)

    def test_jeu_non_modifiable_une_fois_commence(self):
        self.commander(self.employe)
        jeu = self.creer_jeu()
        self.partie(jeu, self.employe, self.a(0))
        r = self.client_pour(self.admin).put(f'{API}/admin/jeux/{jeu.id}/', {'titre': 'X'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.client_pour(self.admin).delete(f'{API}/admin/jeux/{jeu.id}/').status_code, 400)

    def test_gestionnaire_remet_seulement_dans_ses_agences(self):
        autre = Agence.objects.create(nom_agence='Yopougon')
        UserAgence.objects.filter(user=self.employe3).update(agence=autre)
        self.commander(self.employe3)
        jeu = self.creer_jeu(lots=[{'rang_debut': 1, 'rang_fin': 1, 'libelle': 'T-shirt'}])
        p = self.partie(jeu, self.employe3, self.a(0))
        J.repondre(p, 0, self.bonne(p, 0), self.a(1))
        J.publier_resultats(jeu, self.admin, J.fin_parties(jeu) + timedelta(seconds=1))
        r = self.client_pour(self.gestionnaire).post(f'{API}/admin/jeux/{jeu.id}/remettre/{p.id}/')
        self.assertEqual(r.status_code, 403)
        r = self.client_pour(self.gestionnaire).get(f'{API}/admin/jeux/{jeu.id}/classement/')
        self.assertFalse(r.data['lignes'][0]['peut_remettre'])
        self.assertTrue(self.client_pour(self.admin).get(
            f'{API}/admin/jeux/{jeu.id}/classement/').data['lignes'][0]['peut_remettre'])
