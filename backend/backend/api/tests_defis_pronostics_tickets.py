"""
Défis et badges, pronostics, tickets à gratter, gains (remise unique).

Lancer : python manage.py test api.tests_defis_pronostics_tickets
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal as D
from unittest.mock import patch

from django.utils import timezone

from . import defis as DF
from . import gains as G
from . import pronostics as PR
from . import tickets as TK
from .models import (
    AvisPlat, CampagneDefis, Commande, CompetitionPronostics, CompteRepas, DefiReussi, GainJeu, LotTicket, Menu,
    MenuPlat, Notification, PalierDefis, Plat, Retrait, ResultatDefis, Ticket, UserAgence,
)
from .tests import API, BaseAPITestCase, _synchrone


def _a(d, h=12):
    return timezone.make_aware(datetime.combine(d, time(h, 0)))


class _Base(BaseAPITestCase):

    def setUp(self):
        super().setUp()
        self.e3 = self.creer_user('emp3', 'employe')
        loin = timezone.make_aware(datetime(2020, 1, 1))
        UserAgence.objects.filter(user__in=[self.employe, self.gestionnaire]).update(date_debut=loin)
        for u in (self.employe2, self.e3):
            UserAgence.objects.create(user=u, agence=self.agence, statut=self.statut, date_debut=loin)
        self.plat3 = Plat.objects.create(nom='Alloco poisson', type_plat=self.typeplat, agence=self.agence)
        self.menus = {}

    def menu(self, d):
        if d not in self.menus:
            m = Menu.objects.create(date_menu=d, agence=self.agence, typeequipe=self.typeequipe)
            for p in (self.plat1, self.plat2, self.plat3):
                MenuPlat.objects.create(menu=m, plat=p)
            self.menus[d] = m
        return self.menus[d]

    def commander(self, user, d, plat=None, statut='en_attente'):
        return Commande.objects.create(user=user, menu=self.menu(d), plat=plat or self.plat1, statut=statut)


# ══════════════════════════════════════════════════════════════
# DÉFIS
# ══════════════════════════════════════════════════════════════

# Mars 2025 : lundi 3 → vendredi 7, lundi 10 → vendredi 14
J = [date(2025, 3, d) for d in (3, 4, 5, 6, 7, 10, 11, 12, 13, 14)]
PENDANT = _a(date(2025, 3, 20))
APRES = _a(date(2025, 4, 3))


class DefisTests(_Base):

    def setUp(self):
        super().setUp()
        for d in J:
            self.menu(d)
        self.c = CampagneDefis.objects.create(titre='Défis de mars', annee=2025, mois=3, serie_jours=5, serie_points=20,
                                              plats_nombre=2, plats_points=15, avis_nombre=2, avis_points=10,
                                              retraits_minimum=3, retraits_points=25, publie_le=_a(date(2025, 2, 25)))

    def test_serie_jours_de_service_le_week_end_ne_casse_pas(self):
        for d in J[:6]:                                   # du lundi 3 au lundi 10 (week-end sans menu)
            self.commander(self.employe, d)
        for d in (J[0], J[1], J[3], J[4], J[5]):          # trou le mercredi 5
            self.commander(self.employe2, d)
        p = DF.progression(self.c, [self.employe.id, self.employe2.id], date(2025, 3, 20))
        self.assertEqual(p[self.employe.id]['serie'], 6)
        self.assertEqual(p[self.employe2.id]['serie'], 3)
        self.assertIn('serie', DF.reussis(self.c, p[self.employe.id]))
        self.assertNotIn('serie', DF.reussis(self.c, p[self.employe2.id]))

    def test_plats_nouveaux_et_avis(self):
        self.menu(date(2025, 2, 10))
        self.commander(self.employe, date(2025, 2, 10), self.plat1)       # déjà goûté avant mars
        c1 = self.commander(self.employe, J[0], self.plat1, 'retiree')
        c2 = self.commander(self.employe, J[1], self.plat2, 'retiree')
        self.commander(self.employe, J[2], self.plat3)
        for c in (c1, c2):
            AvisPlat.objects.create(commande=c, user=self.employe, plat=c.plat, note=4)
        p = DF.progression(self.c, [self.employe.id], date(2025, 3, 20))[self.employe.id]
        self.assertEqual((p['plats'], p['avis']), (2, 2))
        self.c.plats_nouveaux = False
        self.assertEqual(DF.progression(self.c, [self.employe.id], date(2025, 3, 20))[self.employe.id]['plats'], 3)

    def test_defi_reussi_notifie_une_fois(self):
        for d in J[:5]:
            self.commander(self.employe, d)
        with patch('api.signals._en_arriere_plan', _synchrone):
            self.assertEqual(DF.verifier(self.c, [self.employe.id, self.employe2.id], PENDANT), 1)
            self.assertEqual(DF.verifier(self.c, [self.employe.id], PENDANT), 0)
        self.assertTrue(Notification.objects.filter(user=self.employe, titre__contains='Fidèle').exists())

    def test_api_mes_defis(self):
        for d in J[:5]:
            self.commander(self.employe, d, statut='retiree')
        with patch('django.utils.timezone.now', return_value=PENDANT), patch('api.signals._en_arriere_plan', _synchrone):
            r = self.client_pour(self.employe).get(f'{API}/defis/')
        self.assertEqual(r.status_code, 200, r.data)
        d = {x['code']: x for x in r.data['courante']['defis']}
        self.assertTrue(d['serie']['reussi'])
        self.assertEqual(d['plats']['valeur'], 1)
        self.assertEqual(d['retraits']['retires'], 5)
        self.assertTrue(d['retraits']['constate_a_la_cloture'])
        self.assertEqual(r.data['courante']['points'], 20)
        self.assertEqual({b['code']: b['nombre'] for b in r.data['badges']}['serie'], 1)

    def test_cloture_paliers_stock_retraits_et_defi_perdu(self):
        PalierDefis.objects.create(campagne=self.c, nom='Bronze', points_min=20, libelle='T-shirt', type='objet', quantite=1)
        PalierDefis.objects.create(campagne=self.c, nom='Argent', points_min=40, type='argent', montant=D('1000'))
        # emp1 : série + retraits complets = 45 pts → Argent
        for d in J[:5]:
            self.commander(self.employe, d, statut='retiree')
        # emp2 : série (20 pts) réussie en premier → Bronze ; emp3 : série plus tard → plus de T-shirt
        for d in J[:5]:
            self.commander(self.employe2, d)
            self.commander(self.e3, d)
        with patch('api.signals._en_arriere_plan', _synchrone):
            DF.verifier(self.c, [self.employe.id, self.employe2.id], PENDANT)
            DF.verifier(self.c, [self.e3.id], PENDANT + timedelta(hours=1))
        # le gestionnaire commande aussi, réussit la série puis annule un repas : défi perdu
        for d in J[:5]:
            self.commander(self.gestionnaire, d)
        DF.verifier(self.c, [self.gestionnaire.id], PENDANT)
        Commande.objects.filter(user=self.gestionnaire, menu__date_menu=J[2]).update(statut='annulee')
        with self.assertRaises(Exception):
            DF.cloturer(self.c, self.admin, _a(date(2025, 4, 1)))          # trop tôt (retraits du dernier jour)
        with patch('api.signals._en_arriere_plan', _synchrone), self.captureOnCommitCallbacks(execute=True):
            DF.cloturer(self.c, self.admin, APRES)
        r = {x.user_id: x for x in ResultatDefis.objects.filter(campagne=self.c)}
        self.assertEqual((r[self.employe.id].points, r[self.employe.id].palier.nom), (45, 'Argent'))
        self.assertEqual(r[self.employe2.id].palier.nom, 'Bronze')
        self.assertIsNone(r[self.e3.id].palier)                           # stock du T-shirt épuisé
        self.assertNotIn(self.gestionnaire.id, r)
        self.assertFalse(DefiReussi.objects.filter(user=self.gestionnaire).exists())
        self.assertEqual(CompteRepas.objects.get(user=self.employe).solde, D('1000'))
        self.assertEqual(GainJeu.objects.get(user=self.employe2).statut_lot, 'a_remettre')
        self.assertTrue(Notification.objects.filter(user=self.employe, titre__contains='Palier Argent').exists())
        with self.assertRaises(Exception):
            DF.cloturer(self.c, self.admin, APRES)

    def test_admin_parametrage_et_droits(self):
        auj = timezone.localdate()
        donnees = {'annee': auj.year, 'mois': auj.month, 'serie_jours': 7, 'serie_points': 30, 'plats_nombre': 0,
                   'avis_nombre': 4, 'avis_points': 12, 'retraits_minimum': 10, 'retraits_points': 40,
                   'paliers': [{'nom': 'Or', 'points_min': 50, 'type': 'argent', 'montant': 5000}]}
        self.assertEqual(self.client_pour(self.gestionnaire).post(f'{API}/admin/defis/', donnees, format='json').status_code, 403)
        r = self.client_pour(self.admin).post(f'{API}/admin/defis/', donnees, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual([d['code'] for d in r.data['defis']], ['serie', 'avis', 'retraits'])   # plats désactivé
        self.assertEqual(r.data['points_max'], 82)
        r2 = self.client_pour(self.admin).post(f'{API}/admin/defis/', {**donnees, 'serie_points': 0, 'avis_points': 0,
                                                                        'retraits_points': 0}, format='json')
        self.assertEqual(r2.status_code, 400)
        with patch('api.signals._en_arriere_plan', _synchrone):
            ok = self.client_pour(self.admin).post(f'{API}/admin/defis/{r.data["id"]}/programmer/')
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertTrue(Notification.objects.filter(user=self.employe, donnees__ecran='defis').exists())
        r3 = self.client_pour(self.admin).post(f'{API}/admin/defis/', donnees, format='json')
        self.assertEqual(r3.status_code, 400)                              # un seul programme par mois


# ══════════════════════════════════════════════════════════════
# PRONOSTICS
# ══════════════════════════════════════════════════════════════

class PronosticsTests(_Base):

    def setUp(self):
        super().setUp()
        self.t = timezone.now().replace(microsecond=0) + timedelta(days=2)
        d = timezone.localdate(self.t)
        for u in (self.employe, self.employe2, self.e3):
            self.commander(u, d)
        self.c = PR.enregistrer(CompetitionPronostics(), {
            'titre': 'CAN 2027', 'points_exact': 3, 'points_resultat': 1,
            'lots': [{'rang_debut': 1, 'rang_fin': 1, 'libelle': 'Maillot', 'type': 'objet'},
                     {'rang_debut': 2, 'rang_fin': 2, 'libelle': '5 000 F', 'type': 'argent', 'montant': 5000}],
            'matchs': [{'equipe_a': "Côte d'Ivoire", 'equipe_b': 'Mali', 'coup_envoi': self.t.isoformat()},
                       {'equipe_a': 'Sénégal', 'equipe_b': 'Ghana', 'coup_envoi': (self.t + timedelta(hours=3)).isoformat()}],
        }, self.admin)
        with patch('api.signals._en_arriere_plan', _synchrone):
            self.client_pour(self.admin).post(f'{API}/admin/pronostics/{self.c.id}/programmer/')
        self.c.refresh_from_db()
        self.m1, self.m2 = list(self.c.matchs.all())

    def test_pronostic_jusqu_au_coup_d_envoi_et_condition(self):
        c = self.client_pour(self.employe)
        r = c.post(f'{API}/pronostics/matchs/{self.m1.id}/', {'score_a': 2, 'score_b': 1}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        r = c.post(f'{API}/pronostics/matchs/{self.m1.id}/', {'score_a': 3, 'score_b': 1}, format='json')   # modifiable
        self.assertEqual(self.m1.pronostics.get(user=self.employe).score_a, 3)
        with patch('django.utils.timezone.now', return_value=self.t + timedelta(seconds=1)):
            r = c.post(f'{API}/pronostics/matchs/{self.m1.id}/', {'score_a': 0, 'score_b': 0}, format='json')
        self.assertEqual(r.status_code, 400)
        Commande.objects.filter(user=self.employe2).update(statut='annulee')
        r = self.client_pour(self.employe2).post(f'{API}/pronostics/matchs/{self.m1.id}/', {'score_a': 1, 'score_b': 0},
                                                 format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Commandez', str(r.data))

    def test_points_classement_lots_et_remise(self):
        for u, s1, s2 in ((self.employe, (2, 1), (1, 1)), (self.employe2, (1, 0), (0, 0)), (self.e3, (0, 2), (2, 2))):
            PR.pronostiquer(self.m1, u, *s1)
            PR.pronostiquer(self.m2, u, *s2)
        with self.assertRaises(Exception):
            PR.saisir_score(self.m1, 2, 1, False, self.admin)                       # pas encore commencé
        apres = self.t + timedelta(hours=6)
        with patch('api.signals._en_arriere_plan', _synchrone), self.captureOnCommitCallbacks(execute=True):
            PR.saisir_score(self.m1, 2, 1, False, self.admin, apres)
        self.assertEqual({p.user_id: p.points for p in self.m1.pronostics.all()},
                         {self.employe.id: 3, self.employe2.id: 1, self.e3.id: 0})
        self.assertTrue(Notification.objects.filter(user=self.employe, titre__contains='2-1').exists())
        with self.assertRaises(Exception):
            PR.publier_resultats(self.c, self.admin, apres)                         # match 2 sans score
        PR.saisir_score(self.m2, 1, 1, False, self.admin, apres)
        # emp1 6 pts ; emp2 1+1=2 ; emp3 0+1=1
        with patch('api.signals._en_arriere_plan', _synchrone), self.captureOnCommitCallbacks(execute=True):
            PR.publier_resultats(self.c, self.admin, apres)
        r = {x.user_id: x for x in self.c.resultats.all()}
        self.assertEqual((r[self.employe.id].rang, r[self.employe.id].points, r[self.employe.id].nb_exacts), (1, 6, 2))
        self.assertEqual(r[self.employe2.id].lot.libelle, '5 000 F')
        self.assertIsNone(r[self.e3.id].lot)
        self.assertEqual(CompteRepas.objects.get(user=self.employe2).solde, D('5000'))
        g = GainJeu.objects.get(user=self.employe)
        url = f'{API}/admin/jeux/gains/{g.id}/remettre/'
        with self.captureOnCommitCallbacks(execute=True), patch('api.signals._en_arriere_plan', _synchrone):
            self.assertEqual(self.client_pour(self.gestionnaire).post(url).status_code, 200)
        r2 = self.client_pour(self.admin).post(url)
        self.assertEqual(r2.status_code, 400)
        self.assertIn('déjà retiré', str(r2.data))
        gains = self.client_pour(self.employe).get(f'{API}/mes-gains/').data
        self.assertEqual((gains[0]['libelle'], gains[0]['statut_lot']), ('Maillot', 'remis'))
        cl = self.client_pour(self.employe).get(f'{API}/pronostics/{self.c.id}/classement/').data
        self.assertEqual(cl['lignes'][0]['nom'], 'Vous')

    def test_tendances_apres_le_coup_d_envoi_et_rappel(self):
        PR.pronostiquer(self.m1, self.employe, 2, 0)
        PR.pronostiquer(self.m1, self.employe2, 1, 1)
        r = self.client_pour(self.employe).get(f'{API}/pronostics/{self.c.id}/')
        self.assertIsNone(r.data['matchs'][0]['tendance'])
        with patch('django.utils.timezone.now', return_value=self.t + timedelta(minutes=5)):
            r = self.client_pour(self.employe).get(f'{API}/pronostics/{self.c.id}/')
        self.assertEqual(r.data['matchs'][0]['tendance'], {'a': 50, 'nul': 50, 'b': 0, 'nb': 2})
        matin = timezone.make_aware(datetime.combine(timezone.localdate(self.t), time(8, 30)))
        if matin < self.t:
            with patch('api.signals._en_arriere_plan', _synchrone):
                n = PR.taches_pronostics(matin)['rappels_pronostics']
                self.assertEqual(PR.taches_pronostics(matin)['rappels_pronostics'], 0)       # une fois par jour
            self.assertGreater(n, 0)
            self.assertTrue(Notification.objects.filter(user=self.e3, titre__contains="aujourd'hui").exists())


# ══════════════════════════════════════════════════════════════
# TICKETS À GRATTER
# ══════════════════════════════════════════════════════════════

class TicketsTests(_Base):

    def setUp(self):
        super().setUp()
        maintenant = timezone.now()
        self.c = TK.enregistrer(TK.CampagneTickets(), {
            'titre': 'Tickets de novembre', 'debut': (maintenant - timedelta(days=1)).isoformat(),
            'fin': (maintenant + timedelta(days=10)).isoformat(), 'ticket_par_retrait': True,
            'lots': [{'libelle': 'Dessert', 'type': 'objet', 'stock': 1, 'probabilite': 100}],
        }, self.admin)
        self.c.publie_le = maintenant
        self.c.save()

    def retrait(self, user):
        m = self.menu(timezone.localdate())
        Commande.objects.get_or_create(user=user, menu=m, plat=self.plat1)
        with patch('api.signals._en_arriere_plan', _synchrone), self.captureOnCommitCallbacks(execute=True):
            return Retrait.objects.create(user=user, menu=m, badge_matricule=user.username)

    def test_ticket_par_repas_retire_et_retrait_annule(self):
        r = self.retrait(self.employe)
        t = Ticket.objects.get(user=self.employe)
        self.assertEqual((t.source, t.retrait_id), ('retrait', r.id))
        self.assertTrue(Notification.objects.filter(user=self.employe, donnees__ecran='tickets').exists())
        r.delete()
        self.assertFalse(Ticket.objects.filter(pk=t.pk).exists())

    def test_tirage_serveur_stock_et_perdu(self):
        self.retrait(self.employe)
        self.retrait(self.employe2)
        t1 = Ticket.objects.get(user=self.employe)
        r = self.client_pour(self.employe).post(f'{API}/tickets/{t1.id}/gratter/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data['gagne'])
        self.assertEqual(r.data['gain']['libelle'], 'Dessert')
        again = self.client_pour(self.employe).post(f'{API}/tickets/{t1.id}/gratter/')
        self.assertEqual(again.data['gain']['id'], r.data['gain']['id'])              # pas de second tirage
        t2 = Ticket.objects.get(user=self.employe2)
        self.assertFalse(self.client_pour(self.employe2).post(f'{API}/tickets/{t2.id}/gratter/').data['gagne'])  # stock épuisé
        self.assertEqual(self.client_pour(self.employe2).post(f'{API}/tickets/{t1.id}/gratter/').status_code, 404)
        self.assertEqual(LotTicket.objects.get().distribues, 1)

    def test_budget_argent_et_expiration(self):
        LotTicket.objects.all().delete()
        LotTicket.objects.create(campagne=self.c, libelle='1 000 F', type='argent', montant=D('1000'), stock=10,
                                 probabilite=D('100'))
        self.c.budget_max = D('1000')
        self.c.save()
        for u in (self.employe, self.employe2):
            self.retrait(u)
        g1 = TK.gratter(Ticket.objects.get(user=self.employe).id, self.employe)
        g2 = TK.gratter(Ticket.objects.get(user=self.employe2).id, self.employe2)
        self.assertIsNotNone(g1.lot_id)
        self.assertIsNone(g2.lot_id)                                                   # budget atteint
        self.assertEqual(CompteRepas.objects.get(user=self.employe).solde, D('1000'))
        self.retrait(self.e3)
        t3 = Ticket.objects.get(user=self.e3)
        with self.assertRaises(Exception):
            TK.gratter(t3.id, self.e3, TK.limite_grattage(self.c) + timedelta(seconds=1))

    def test_ticket_quotidien_jour_ouvre(self):
        self.c.ticket_quotidien = True
        self.c.save()
        lundi = timezone.now() + timedelta(days=(7 - timezone.localdate().weekday()) % 7 or 7)
        samedi = lundi + timedelta(days=5)
        if lundi < self.c.fin:
            with patch('django.utils.timezone.now', return_value=lundi):
                r = self.client_pour(self.employe).get(f'{API}/tickets/')
                self.client_pour(self.employe).get(f'{API}/tickets/')
            self.assertEqual(len(r.data['a_gratter']), 1)
            self.assertEqual(Ticket.objects.filter(user=self.employe, source='quotidien').count(), 1)
        if samedi < self.c.fin:
            TK.tickets_du_jour(self.employe2, samedi)
            self.assertFalse(Ticket.objects.filter(user=self.employe2).exists())

    def test_admin_probabilites_et_lots_a_remettre(self):
        r = self.client_pour(self.admin).post(f'{API}/admin/tickets/', {
            'titre': 'X', 'debut': timezone.now().isoformat(), 'fin': (timezone.now() + timedelta(days=1)).isoformat(),
            'lots': [{'libelle': 'A', 'stock': 1, 'probabilite': 60}, {'libelle': 'B', 'stock': 1, 'probabilite': 50}]},
            format='json')
        self.assertEqual(r.status_code, 400)
        self.retrait(self.employe)
        TK.gratter(Ticket.objects.get(user=self.employe).id, self.employe)
        lots = self.client_pour(self.gestionnaire).get(f'{API}/admin/jeux/lots-a-remettre/').data
        self.assertEqual([(l['source'], l['lot']) for l in lots], [('Ticket à gratter', 'Dessert')])
        self.assertEqual(self.client_pour(self.employe).get(f'{API}/admin/jeux/lots-a-remettre/').status_code, 403)


# ══════════════════════════════════════════════════════════════
# COÛT DES JEUX (comptabilité)
# ══════════════════════════════════════════════════════════════

class CoutsJeuxTests(_Base):

    def test_argent_et_valeur_des_objets_par_jeu(self):
        maintenant = timezone.now()
        c = TK.enregistrer(TK.CampagneTickets(), {
            'titre': 'Tickets', 'debut': (maintenant - timedelta(days=1)).isoformat(),
            'fin': (maintenant + timedelta(days=5)).isoformat(),
            'lots': [{'libelle': 'T-shirt', 'type': 'objet', 'valeur': 3500, 'stock': 1, 'probabilite': 100}]}, self.admin)
        c.publie_le = maintenant
        c.save()
        m = self.menu(timezone.localdate())
        Commande.objects.create(user=self.employe, menu=m, plat=self.plat1)
        with self.captureOnCommitCallbacks(execute=True):
            Retrait.objects.create(user=self.employe, menu=m, badge_matricule='x')
        TK.gratter(Ticket.objects.get(user=self.employe).id, self.employe)
        G.attribuer(self.employe2.id, 'defis', 1, 'Défis de mars', '', 'argent', D('1000'), self.admin)
        G.attribuer(self.e3.id, 'pronostics', 1, 'CAN', 'Maillot', 'objet', None, self.admin)   # sans valeur
        r = self.client_pour(self.admin).get(f'{API}/comptabilite/couts-jeux/')
        self.assertEqual(r.status_code, 200, r.data)
        t = r.data['totaux']
        self.assertEqual((t['nb_gains'], t['argent'], t['objets_valeur'], t['total'], t['objets_sans_valeur']),
                         (3, 1000.0, 3500.0, 4500.0, 1))
        self.assertEqual({j['jeu']: j['total'] for j in r.data['par_jeu']}, {'Tickets': 3500.0, 'Défis de mars': 1000.0, 'CAN': 0.0})
        self.assertEqual(len(r.data['lignes']), 3)
        self.assertEqual(self.client_pour(self.gestionnaire).get(f'{API}/comptabilite/couts-jeux/').status_code, 403)
        hier = (timezone.localdate() - timedelta(days=2)).isoformat()
        r = self.client_pour(self.admin).get(f'{API}/comptabilite/couts-jeux/', {'debut': hier, 'fin': hier})
        self.assertEqual(r.data['totaux']['nb_gains'], 0)
