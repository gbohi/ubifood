"""
Tests du parcours de commande « agence → prestataire → équipe → jour »
(api/parcours_commande.py) : accès aux agences, fermeture aux autres
agences, profil et note des prestataires, endpoints du parcours, commandes
externes, facturation d'un employé d'une autre agence, menus historiques.

Lancer : python manage.py test api.tests_parcours
"""

import shutil
import tempfile
from datetime import timedelta
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone

from . import facturation as fact
from .models import (
    Agence, AgencePrestataire, AvisPlat, Categoriesalarie, Commande, Menu, MenuPlat, Notification,
    ParametresSociete, Plat, PlatCategoriesalarie, PlatImage, PlatPrestataire, Prestataire, TypeEquipe,
    UserAgence, UserCategoriesalarie,
)
from .tests import API, _EspacePrestataireBase, _synchrone

_MEDIA = tempfile.mkdtemp(prefix='ubifood-parcours-')


def _png(nom='image.png', taille=(120, 60)):
    from PIL import Image
    buf = BytesIO()
    Image.new('RGB', taille, (200, 120, 40)).save(buf, 'PNG')
    return SimpleUploadedFile(nom, buf.getvalue(), content_type='image/png')


@override_settings(MEDIA_ROOT=_MEDIA)
class _ParcoursBase(_EspacePrestataireBase):
    """
    Siège : servi par A (et C, second prestataire de la même agence) ; Yopougon : servi par B.
    employe (emp1) : Siège ; emp_yop : Yopougon. Menus créés dans 5 jours (commandes ouvertes).
    """

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(_MEDIA, ignore_errors=True)

    def setUp(self):
        super().setUp()
        debut = timezone.now() - timedelta(days=400)
        self.presta_c = Prestataire.objects.create(libelle='Traiteur C', statut=self.statut, date_debut=debut)
        AgencePrestataire.objects.create(prestataire=self.presta_c, agence=self.agence, statut=self.statut,
                                         date_debut=debut)
        PlatPrestataire.objects.create(prestataire=self.presta_c, montant=Decimal('800'), statut=self.statut,
                                       date_debut=debut)
        self.plat_c = Plat.objects.create(nom='Riz gras', type_plat=self.typeplat, agence=self.agence,
                                          prestataire=self.presta_c)
        self.plat_c.agences.set([self.agence])
        self.soir = TypeEquipe.objects.create(libelle='Soir')
        self.jour = timezone.localdate() + timedelta(days=5)

    def menu(self, prestataire, agence=None, plats=None, jours=5, equipe=None):
        m = Menu.objects.create(date_menu=timezone.localdate() + timedelta(days=jours),
                                agence=agence or self.agence, typeequipe=equipe or self.typeequipe,
                                prestataire=prestataire)
        for p in plats or []:
            MenuPlat.objects.create(menu=m, plat=p)
        return m

    def ouvrir(self, agence, ouverte=True):
        agence.accepter_autres_agences = ouverte
        agence.save()


class AccesAgencesTests(_ParcoursBase):

    def test_agence_fermee_masquee_et_commande_refusee(self):
        m_yop = self.menu(self.presta_b, self.yop, [self.plat_b])
        m_siege = self.menu(self.presta_a, plats=[self.plat_a], jours=6)
        client = self.client_pour(self.employe)
        # Liste du parcours : sa propre agence seulement
        r = client.get(f'{API}/commander/agences/')
        self.assertEqual([a['id'] for a in r.data['agences']], [self.agence.id])
        self.assertTrue(r.data['agences'][0]['mon_agence'])
        # Menus (écran historique) : Yopougon masqué
        ids = {m['id'] for m in client.get(f'{API}/menus/', {'page_size': 100}).data['results']}
        self.assertEqual(ids, {m_siege.id})
        self.assertEqual(client.get(f'{API}/menus/{m_yop.id}/').status_code, 404)
        # Parcours : agence fermée refusée
        r = client.get(f'{API}/commander/prestataires/', {'agence': self.yop.id})
        self.assertEqual(r.status_code, 403)
        # Commande refusée, message clair
        r = client.post(f'{API}/commandes/', {'menu_id': m_yop.id, 'plat_id': self.plat_b.id})
        self.assertEqual(r.status_code, 403)
        self.assertIn("n'accepte pas les commandes", str(r.data['detail']))
        # Gestionnaire : vue de gestion inchangée (tous les menus)
        ids = {m['id'] for m in self.client_pour(self.gestionnaire).get(f'{API}/menus/', {'page_size': 100})
               .data['results']}
        self.assertEqual(ids, {m_siege.id, m_yop.id})

    def test_agence_ouverte_visible_et_commandable(self):
        m_yop = self.menu(self.presta_b, self.yop, [self.plat_b])
        self.ouvrir(self.yop)
        client = self.client_pour(self.employe)
        r = client.get(f'{API}/commander/agences/')
        self.assertEqual([(a['id'], a['mon_agence']) for a in r.data['agences']],
                         [(self.agence.id, True), (self.yop.id, False)])
        yop = r.data['agences'][1]
        self.assertEqual((yop['code'], yop['nb_prestataires_semaine'] >= 0), ('YOP', True))
        self.assertEqual(client.get(f'{API}/menus/{m_yop.id}/').status_code, 200)
        r = client.post(f'{API}/commandes/', {'menu_id': m_yop.id, 'plat_id': self.plat_b.id})
        self.assertEqual(r.status_code, 201, r.data)

    def test_ouverture_par_le_gestionnaire_de_l_agence(self):
        url = f'{API}/agences/{self.agence.id}/ouverture/'
        self.assertEqual(self.client_pour(self.employe).patch(url, {'accepter_autres_agences': True},
                                                              format='json').status_code, 403)
        r = self.client_pour(self.gestionnaire).patch(url, {'accepter_autres_agences': True}, format='json')
        self.assertEqual((r.status_code, r.data['accepter_autres_agences']), (200, True))
        # Agence d'un autre gestionnaire : refusée ; administrateur : toutes
        url_yop = f'{API}/agences/{self.yop.id}/ouverture/'
        self.assertEqual(self.client_pour(self.gestionnaire).patch(
            url_yop, {'accepter_autres_agences': True}, format='json').status_code, 403)
        r = self.client_pour(self.admin).patch(url_yop, {'accepter_autres_agences': 'true'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.client_pour(self.admin).patch(url_yop, {'accepter_autres_agences': 'peut-être'},
                                                            format='json').status_code, 400)
        self.yop.refresh_from_db()
        self.assertTrue(self.yop.accepter_autres_agences)

    def test_fermeture_notifie_les_seuls_employes_concernes(self):
        self.ouvrir(self.yop)
        futur = self.menu(self.presta_b, self.yop, [self.plat_b])
        passe = self.menu(self.presta_b, self.yop, [self.plat_b], jours=-3)
        c_ext = Commande.objects.create(user=self.employe, menu=futur, plat=self.plat_b)
        Commande.objects.create(user=self.emp_yop, menu=futur, plat=self.plat_b)       # employé de Yopougon
        Commande.objects.create(user=self.employe2, menu=passe, plat=self.plat_b)      # repas passé
        annulee = self.creer_user('emp9', 'employe')
        UserAgence.objects.create(user=annulee, agence=self.agence, statut=self.statut,
                                  date_debut=timezone.now() - timedelta(days=5))
        Commande.objects.create(user=annulee, menu=futur, plat=self.plat_b, statut='annulee')
        with patch('api.signals._en_arriere_plan', _synchrone), self.captureOnCommitCallbacks(execute=True):
            r = self.client_pour(self.admin).patch(f'{API}/agences/{self.yop.id}/ouverture/',
                                                   {'accepter_autres_agences': False}, format='json')
        self.assertEqual(r.status_code, 200)
        notifs = Notification.objects.filter(type='agence_fermee')
        self.assertEqual([n.user_id for n in notifs], [self.employe.id])
        self.assertEqual(notifs[0].message,
                         "L'agence Yopougon n'accepte plus les commandes des autres agences. "
                         "Vos commandes déjà passées sont maintenues.")
        # Commandes maintenues
        c_ext.refresh_from_db()
        self.assertEqual(c_ext.statut, 'en_attente')
        # Réouverture puis nouvelle modification sans fermeture : aucune notification de plus
        with patch('api.signals._en_arriere_plan', _synchrone), self.captureOnCommitCallbacks(execute=True):
            self.ouvrir(self.yop)
            self.yop.nom_agence = 'Yopougon'
            self.yop.save()
        self.assertEqual(Notification.objects.filter(type='agence_fermee').count(), 1)
        # Fermée : il ne peut plus commander, sa commande existante reste
        nouveau = self.menu(self.presta_b, self.yop, [self.plat_b], jours=7)
        self.ouvrir(self.yop, False)
        r = self.client_pour(self.employe).post(f'{API}/commandes/', {'menu_id': nouveau.id,
                                                                    'plat_id': self.plat_b.id})
        self.assertEqual(r.status_code, 403)

    def test_employe_sans_agence(self):
        m = self.menu(self.presta_a, plats=[self.plat_a])
        r = self.client_pour(self.employe2).post(f'{API}/commandes/', {'menu_id': m.id, 'plat_id': self.plat_a.id})
        self.assertEqual(r.status_code, 403)
        self.assertIn("aucune agence", str(r.data['detail']))
        self.assertEqual(self.client_pour(self.employe2).get(f'{API}/commander/agences/').data['agences'], [])


class ProfilPrestataireTests(_ParcoursBase):

    def test_responsable_modifie_son_profil(self):
        url = f'{API}/prestataire/profil/'
        client = self.client_pour(self.resp_a)
        r = client.get(url)
        self.assertEqual((r.status_code, r.data['nom_public'], r.data['logo_url']), (200, 'Traiteur A', None))
        r = client.patch(url, {'nom_affiche': 'Chez A', 'description_courte': 'Cuisine ivoirienne maison',
                               'tags': '["Ivoirien", "Grillades"]', 'logo': _png('logo.png'),
                               'photo_couverture': _png('couv.png', (1200, 600))}, format='multipart')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual((r.data['nom_public'], r.data['tags']), ('Chez A', ['Ivoirien', 'Grillades']))
        self.assertTrue(r.data['logo_url'] and r.data['photo_couverture_url'])
        self.presta_a.refresh_from_db()
        self.assertEqual(self.presta_a.nom_affiche, 'Chez A')
        self.presta_b.refresh_from_db()
        self.assertEqual(self.presta_b.nom_affiche, '')        # son prestataire seulement
        # Suppression de la couverture
        r = client.patch(url, {'supprimer_photo_couverture': True}, format='json')
        self.assertIsNone(r.data['photo_couverture_url'])
        # Agent de comptoir et employé : refusés
        self.assertEqual(self.client_pour(self.agent_a).patch(url, {'nom_affiche': 'X'}).status_code, 403)
        self.assertEqual(self.client_pour(self.employe).get(url).status_code, 403)

    def test_validation_des_images_et_textes(self):
        url = f'{API}/prestataire/profil/'
        client = self.client_pour(self.resp_a)
        faux = SimpleUploadedFile('logo.png', b'pas une image', content_type='image/png')
        self.assertEqual(client.patch(url, {'logo': faux}, format='multipart').status_code, 400)
        pdf = SimpleUploadedFile('couv.pdf', b'%PDF-1.4', content_type='application/pdf')
        self.assertEqual(client.patch(url, {'photo_couverture': pdf}, format='multipart').status_code, 400)
        png = _png('gros.png').read()
        gros = SimpleUploadedFile('gros.png', png + b'\0' * (5 * 1024 * 1024), content_type='image/png')
        r = client.patch(url, {'photo_couverture': gros}, format='multipart')
        self.assertEqual(r.status_code, 400)
        self.assertIn('5 Mo', str(r.data))
        r = client.patch(url, {'description_courte': 'x' * 121}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_admin_modifie_tous_les_profils(self):
        url = f'{API}/prestataires/{self.presta_b.id}/'
        r = self.client_pour(self.admin).patch(url, {'nom_affiche': 'Maquis B', 'logo': _png()},
                                               format='multipart')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['nom_public'], 'Maquis B')
        self.assertTrue(r.data['logo_url'])
        self.assertEqual(self.client_pour(self.gestionnaire).patch(url, {'nom_affiche': 'X'},
                                                                   format='json').status_code, 403)

    def test_seuil_d_avis_pour_la_note(self):
        menu = self.menu(self.presta_a, plats=[self.plat_a], jours=-1)
        for i, u in enumerate((self.employe, self.employe2)):
            c = Commande.objects.create(user=u, menu=menu, plat=self.plat_a, statut='retiree')
            AvisPlat.objects.create(commande=c, user=u, plat=self.plat_a, note=4 + i)
        url = f'{API}/commander/prestataires/'
        a = next(p for p in self.client_pour(self.employe).get(url, {'agence': self.agence.id}).data['prestataires']
                 if p['id'] == self.presta_a.id)
        self.assertEqual((a['note'], a['nb_avis'], a['nouveau']), (None, 2, True))
        # Le gestionnaire abaisse le seuil (employé : refusé)
        self.assertEqual(self.client_pour(self.employe).patch(f'{API}/parametres-cantine/',
                                                              {'seuil_avis_note': 2}).status_code, 403)
        r = self.client_pour(self.gestionnaire).patch(f'{API}/parametres-cantine/', {'seuil_avis_note': 2},
                                                      format='json')
        self.assertEqual((r.status_code, r.data['seuil_avis_note']), (200, 2))
        # Les délais ne sont pas modifiables par cette route
        self.client_pour(self.gestionnaire).patch(f'{API}/parametres-cantine/', {'delai_commande_heures': 1},
                                                  format='json')
        self.assertEqual(ParametresSociete.charger().delai_commande_heures, 48)
        a = next(p for p in self.client_pour(self.employe).get(url, {'agence': self.agence.id}).data['prestataires']
                 if p['id'] == self.presta_a.id)
        self.assertEqual((a['note'], a['nb_avis'], a['nouveau']), (4.5, 2, False))
        # Administrateur : aussi par Paramètres → Société
        r = self.client_pour(self.admin).patch(f'{API}/parametres-societe/', {'seuil_avis_note': 3}, format='json')
        self.assertEqual((r.status_code, r.data['seuil_avis_note']), (200, 3))


class ParcoursEndpointsTests(_ParcoursBase):

    def test_prestataires_de_l_agence(self):
        m_a = self.menu(self.presta_a, plats=[self.plat_a], jours=0)
        self.menu(self.presta_c, plats=[self.plat_c], jours=5, equipe=self.soir)
        PlatImage.objects.create(plat=self.plat_c, image=_png('riz.png'), is_principale=True)
        Commande.objects.create(user=self.employe, menu=m_a, plat=self.plat_a)
        r = self.client_pour(self.employe).get(f'{API}/commander/prestataires/', {'agence': self.agence.id})
        self.assertEqual(r.status_code, 200, r.data)
        par_id = {p['id']: p for p in r.data['prestataires']}
        self.assertEqual(set(par_id), {self.presta_a.id, self.presta_c.id})
        # Celui qui sert aujourd'hui d'abord
        self.assertEqual(r.data['prestataires'][0]['id'], self.presta_a.id)
        a, c = par_id[self.presta_a.id], par_id[self.presta_c.id]
        self.assertEqual((a['nb_plats_jour'], a['commande_aujourdhui'], a['prochain_jour_a_reserver']), (1, True, None))
        self.assertEqual((c['nb_plats_jour'], c['commande_aujourdhui']), (0, False))
        self.assertEqual(c['prochain_jour_a_reserver']['date'], self.jour.isoformat())
        # Pas de couverture : photos des plats en secours
        self.assertIsNone(c['photo_couverture_url'])
        self.assertEqual(len(c['photos_plats']), 1)
        self.assertEqual([e['libelle'] for e in c['equipes']], ['Soir'])
        self.assertIn('heure_debut_service', c['equipes'][0])
        # Date passée en paramètre
        r = self.client_pour(self.employe).get(f'{API}/commander/prestataires/',
                                               {'agence': self.agence.id, 'date': self.jour.isoformat()})
        self.assertEqual(r.data['prestataires'][0]['id'], self.presta_c.id)
        self.assertEqual(self.client_pour(self.employe).get(f'{API}/commander/prestataires/').status_code, 400)
        self.assertEqual(self.client_pour(self.resp_a).get(f'{API}/commander/agences/').status_code, 403)

    def test_equipes(self):
        self.menu(self.presta_a, plats=[self.plat_a], jours=5)
        self.menu(self.presta_a, plats=[self.plat_a], jours=6, equipe=self.soir)
        self.menu(self.presta_c, plats=[self.plat_c], jours=5)
        url = f'{API}/commander/prestataires/{self.presta_a.id}/equipes/'
        r = self.client_pour(self.employe).get(url, {'agence': self.agence.id})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual([(e['libelle'], e['nb_jours'], e['mon_equipe']) for e in r.data['equipes']],
                         [('Jour', 1, None), ('Soir', 1, None)])
        # Prestataire qui ne dessert pas l'agence
        url_b = f'{API}/commander/prestataires/{self.presta_b.id}/equipes/'
        self.assertEqual(self.client_pour(self.employe).get(url_b, {'agence': self.agence.id}).status_code, 404)

    def test_jours_etats_et_jour_par_defaut(self):
        a1 = self.menu(self.presta_a, plats=[self.plat_a], jours=5)
        a2 = self.menu(self.presta_a, plats=[self.plat_a], jours=6)
        self.menu(self.presta_a, plats=[self.plat_a], jours=0)
        c1 = self.menu(self.presta_c, plats=[self.plat_c], jours=5)
        # Tarif de l'employé (catégorie)
        cat = Categoriesalarie.objects.create(libelle='Agent')
        debut = timezone.now() - timedelta(days=100)
        PlatCategoriesalarie.objects.create(categoriesalarie=cat, montant=Decimal('1000'), statut=self.statut,
                                            date_debut=debut)
        UserCategoriesalarie.objects.create(user=self.employe, categoriesalarie=cat, statut=self.statut,
                                            date_debut=debut)
        client = self.client_pour(self.employe)
        params = {'agence': self.agence.id, 'prestataire': self.presta_a.id, 'equipe': self.typeequipe.id,
                  'semaine': a1.date_menu.isoformat()}
        r = client.get(f'{API}/commander/jours/', params)
        self.assertEqual(r.status_code, 200, r.data)
        jours = {j['date']: j for j in r.data['jours']}
        self.assertEqual(len(r.data['jours']), 7)
        j1 = jours[a1.date_menu.isoformat()]
        self.assertEqual(j1['etat'], 'a_reserver')
        self.assertEqual(r.data['jour_par_defaut'], min(a1.date_menu, a2.date_menu).isoformat())
        plat = j1['plats'][0]
        self.assertEqual((plat['id'], plat['menu_id'], plat['statut'], plat['prix'], plat['nouveau']),
                         (self.plat_a.id, a1.id, 'disponible', 1000.0, True))

        # Commande chez C le même jour : un seul repas par jour, tous prestataires confondus
        r = client.post(f'{API}/commandes/', {'menu_id': c1.id, 'plat_id': self.plat_c.id})
        self.assertEqual(r.status_code, 201, r.data)
        r = client.post(f'{API}/commandes/', {'menu_id': a1.id, 'plat_id': self.plat_a.id})
        self.assertEqual(r.status_code, 400)
        self.assertIn('Une seule commande', str(r.data))
        r = client.get(f'{API}/commander/jours/', params)
        j1 = next(j for j in r.data['jours'] if j['date'] == a1.date_menu.isoformat())
        self.assertEqual((j1['etat'], j1['commande']['ici'], j1['commande']['prestataire_id']),
                         ('reserve', False, self.presta_c.id))
        self.assertEqual(j1['plats'][0]['statut'], 'autre_plat_commande')
        self.assertEqual(r.data['jour_par_defaut'], a2.date_menu.isoformat()
                         if a2.date_menu.isocalendar()[1] == a1.date_menu.isocalendar()[1]
                         else r.data['jour_par_defaut'])
        # Chez C : le plat commandé
        params_c = {**params, 'prestataire': self.presta_c.id}
        j1 = next(j for j in client.get(f'{API}/commander/jours/', params_c).data['jours']
                  if j['date'] == a1.date_menu.isoformat())
        self.assertEqual((j1['commande']['ici'], j1['plats'][0]['statut']), (True, 'commande'))
        # Aujourd'hui : fermé (date limite passée) ; jour sans menu
        r = client.get(f'{API}/commander/jours/', {**params, 'semaine': timezone.localdate().isoformat()})
        etats = {j['date']: j['etat'] for j in r.data['jours']}
        self.assertEqual(etats[timezone.localdate().isoformat()], 'ferme')
        self.assertIn('pas_de_menu', etats.values())

    def test_cantine_ubipharm_pour_les_menus_historiques(self):
        historique = self.menu(None, plats=[self.plat1])
        r = self.client_pour(self.employe).get(f'{API}/commander/prestataires/', {'agence': self.agence.id})
        ubi = next(p for p in r.data['prestataires'] if p['id'] == 0)
        self.assertEqual((ubi['nom_affiche'], ubi['cantine_ubipharm']), ('Cantine UbiPharm', True))
        self.assertEqual(r.data['prestataires'][-1]['id'], 0)
        r = self.client_pour(self.employe).get(f'{API}/commander/jours/', {
            'agence': self.agence.id, 'prestataire': 0, 'semaine': historique.date_menu.isoformat()})
        self.assertEqual(r.status_code, 200, r.data)
        j = next(j for j in r.data['jours'] if j['date'] == historique.date_menu.isoformat())
        self.assertEqual(j['plats'][0]['menu_id'], historique.id)
        # Yopougon n'a pas de menu historique
        self.ouvrir(self.yop)
        self.assertEqual(self.client_pour(self.employe).get(f'{API}/commander/prestataires/0/equipes/',
                                                            {'agence': self.yop.id}).status_code, 404)

    def test_reprise_des_menus_existants(self):
        """Migration 0040 : prestataire déduit des plats, sinon du créateur ; ambigu : laissé vide."""
        import importlib
        from django.apps import apps
        migration = importlib.import_module('api.migrations.0040_parcours_commande')
        par_plats = self.menu(None, plats=[self.plat_a, self.plat1])
        par_createur = Menu.objects.create(date_menu=self.jour, agence=self.agence, typeequipe=self.soir,
                                           user_created=self.resp_b)
        MenuPlat.objects.create(menu=par_createur, plat=self.plat1)
        ambigu = self.menu(None, plats=[self.plat_a, self.plat_c], jours=8)
        ubipharm = self.menu(None, plats=[self.plat1], jours=9)
        migration.attribuer_prestataire_aux_menus(apps, None)
        for m in (par_plats, par_createur, ambigu, ubipharm):
            m.refresh_from_db()
        self.assertEqual((par_plats.prestataire_id, par_createur.prestataire_id), (self.presta_a.id, self.presta_b.id))
        self.assertEqual((ambigu.prestataire_id, ubipharm.prestataire_id), (None, None))


class PlusieursPrestatairesTests(_ParcoursBase):

    def test_deux_prestataires_dans_la_meme_agence(self):
        # Rattachement d'un autre prestataire à une agence déjà servie : accepté
        r = self.client_pour(self.admin).post(f'{API}/agence-prestataires/', {
            'prestataire': self.presta_b.id, 'agence': self.agence.id, 'statut': self.statut.id,
            'date_debut': (timezone.now() - timedelta(days=1)).isoformat()}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        # Même couple qui se chevauche : refusé
        r = self.client_pour(self.admin).post(f'{API}/agence-prestataires/', {
            'prestataire': self.presta_b.id, 'agence': self.agence.id, 'statut': self.statut.id,
            'date_debut': timezone.now().isoformat()}, format='json')
        self.assertEqual(r.status_code, 400)
        # Le prestataire C compose son menu au Siège, même équipe et même jour que A
        self.menu(self.presta_a, plats=[self.plat_a])
        from .models import User
        resp_c = self.creer_compte('respc', 'prestataire', self.presta_c)
        r = self.client_pour(resp_c).post(f'{API}/prestataire/menus/', {
            'date_menu': self.jour.isoformat(), 'agence': self.agence.id, 'typeequipe': self.typeequipe.id,
            'plat_ids': [self.plat_c.id]}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        menu_c = Menu.objects.get(pk=r.data['id'])
        self.assertEqual(menu_c.prestataire_id, self.presta_c.id)
        # Chacun ne voit que ses menus
        ids_a = {m['id'] for m in self.client_pour(self.resp_a).get(
            f'{API}/prestataire/menus/', {'date_debut': self.jour.isoformat(), 'date_fin': self.jour.isoformat()}).data}
        self.assertNotIn(menu_c.id, ids_a)
        # Gestionnaire : prestataire déduit des plats
        r = self.client_pour(self.gestionnaire).post(f'{API}/menus/', {
            'date_menu': self.jour.isoformat(), 'agence': self.agence.id, 'typeequipe': self.soir.id,
            'plat_ids': [self.plat_c.id]}, format='json')
        self.assertEqual((r.status_code, r.data['prestataire']), (201, self.presta_c.id))
        self.assertTrue(User.objects.filter(pk=resp_c.pk).exists())

    def test_facturation_d_un_employe_d_une_autre_agence(self):
        """Repas d'un employé de Yopougon au Siège : payé par l'employé, payé au prestataire qui a servi."""
        self.ouvrir(self.agence)
        cat = Categoriesalarie.objects.create(libelle='Agent')
        debut = timezone.now() - timedelta(days=100)
        PlatCategoriesalarie.objects.create(categoriesalarie=cat, montant=Decimal('1000'), statut=self.statut,
                                            date_debut=debut)
        UserCategoriesalarie.objects.create(user=self.emp_yop, categoriesalarie=cat, statut=self.statut,
                                            date_debut=debut)
        menu_c = self.menu(self.presta_c, plats=[self.plat_c])
        r = self.client_pour(self.emp_yop).post(f'{API}/commandes/', {'menu_id': menu_c.id,
                                                                    'plat_id': self.plat_c.id,
                                                                    'mode_paiement': 'retenue'})
        self.assertEqual(r.status_code, 201, r.data)
        qs = Commande.objects.filter(pk=r.data['id'])
        # Relevé du prestataire qui a servi (C, 800 F), pas de A (aussi rattaché au Siège)
        prest = fact.lignes_prestataires(qs)
        self.assertEqual((prest[0]['prestataire'].id, prest[0]['montant']), (self.presta_c.id, Decimal('800')))
        from . import releves as rel
        synth, lignes = rel.releve_prestataire(self.presta_c, menu_c.date_menu, menu_c.date_menu)
        self.assertEqual(synth['nb_repas'], 1)
        synth_a, _ = rel.releve_prestataire(self.presta_a, menu_c.date_menu, menu_c.date_menu)
        self.assertEqual(synth_a['nb_repas'], 0)
        # Facturation de l'employé : tarif de sa catégorie, comme chez lui
        emp = fact.lignes_facturation(qs)
        self.assertEqual((emp[0]['user_id'], emp[0]['montant'], emp[0]['agence_menu']),
                         (self.emp_yop.id, Decimal('1000'), 'Siège'))
        r = self.client_pour(self.emp_yop).get(f'{API}/facturation/', {
            'date_debut': menu_c.date_menu.isoformat(), 'date_fin': menu_c.date_menu.isoformat()})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('1000', str(r.data))


class CommandesExternesTests(_ParcoursBase):

    def setUp(self):
        super().setUp()
        self.ouvrir(self.agence)
        self.m = self.menu(self.presta_a, plats=[self.plat_a], jours=0)
        self.interne = Commande.objects.create(user=self.employe, menu=self.m, plat=self.plat_a)
        self.externe = Commande.objects.create(user=self.emp_yop, menu=self.m, plat=self.plat_a)

    def test_a_preparer_et_liste_du_jour(self):
        client = self.client_pour(self.resp_a)
        d = timezone.localdate().isoformat()
        r = client.get(f'{API}/prestataire/a-preparer/', {'date_debut': d, 'date_fin': d})
        jour = r.data['jours'][0]
        self.assertEqual((jour['total'], jour['externes'], jour['plats'][0]['externes']), (2, 1, 1))
        r = client.get(f'{API}/prestataire/a-preparer/', {'date_debut': d, 'date_fin': d, 'origine': 'autres'})
        self.assertEqual((r.data['jours'][0]['total'], r.data['origine']), (1, 'autres'))
        r = client.get(f'{API}/prestataire/a-preparer/', {'date_debut': d, 'date_fin': d, 'origine': 'mon_agence'})
        self.assertEqual(r.data['jours'][0]['externes'], 0)
        self.assertEqual(client.get(f'{API}/prestataire/a-preparer/', {'origine': 'x'}).status_code, 400)

        r = self.client_pour(self.agent_a).get(f'{API}/prestataire/liste-du-jour/')
        par_user = {l['user_id']: l for l in r.data['lignes']}
        self.assertEqual(r.data['externes'], 1)
        self.assertEqual((par_user[self.emp_yop.id]['externe'], par_user[self.emp_yop.id]['agence_origine']),
                         (True, 'Yopougon'))
        self.assertFalse(par_user[self.employe.id]['externe'])
        r = self.client_pour(self.agent_a).get(f'{API}/prestataire/liste-du-jour/', {'origine': 'autres'})
        self.assertEqual([l['user_id'] for l in r.data['lignes']], [self.emp_yop.id])

    def test_comptoir_controle_et_gestionnaire(self):
        r = self.client_pour(self.agent_a).get(f'{API}/prestataire/comptoir/recherche/',
                                               {'badge': self.emp_yop.username, 'agence': self.agence.id})
        self.assertEqual((r.data['externe'], r.data['agence_origine'], r.data['employe']['externe']),
                         (True, 'Yopougon', True))
        r = self.client_pour(self.agent_a).post(f'{API}/prestataire/comptoir/valider/', {
            'menu_id': self.m.id, 'user_id': self.emp_yop.id, 'mode': 'scan'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        r = self.client_pour(self.agent_a).get(f'{API}/prestataire/comptoir/service/', {'agence': self.agence.id})
        self.assertEqual((r.data['externes'], r.data['derniers'][0]['externe']), (1, True))
        r = self.client_pour(self.gestionnaire).get(f'{API}/controle-retraits/')
        self.assertEqual(r.data['chiffres']['retraits_externes'], 1)
        self.assertTrue(r.data['agents'][0]['retraits'][0]['externe'])
        # Service du jour (comptoir de secours) et accueil du gestionnaire
        r = self.client_pour(self.gestionnaire).get(f'{API}/retraits/service/', {'menu': self.m.id})
        self.assertEqual((r.data['externes'], r.data['derniers'][0]['agence_origine']), (1, 'Yopougon'))
        r = self.client_pour(self.gestionnaire).get(f'{API}/accueil/')
        self.assertEqual(r.data['gestion']['service_du_jour'][0]['externes'], 1)
        # Planning (lundi → vendredi) : quantités et filtre d'origine
        n = 1
        while (timezone.localdate() + timedelta(days=n)).weekday() >= 5:
            n += 1
        m2 = self.menu(self.presta_a, plats=[self.plat_a], jours=n, equipe=self.soir)
        Commande.objects.create(user=self.employe, menu=m2, plat=self.plat_a)
        Commande.objects.create(user=self.emp_yop, menu=m2, plat=self.plat_a)
        debut = m2.date_menu.isoformat()

        def menu_planning(**params):
            r = self.client_pour(self.gestionnaire).get(f'{API}/planning/', {'debut': debut, **params})
            return next(m for ag in r.data['agences'] for j in ag['jours'] for m in j['menus'] if m['id'] == m2.id)
        m = menu_planning()
        self.assertEqual((m['commandes'], m['externes'], m['plats'][0]['externes']), (2, 1, 1))
        m = menu_planning(origine='mon_agence')
        self.assertEqual((m['commandes'], m['externes']), (1, 0))
        m = menu_planning(origine='autres')
        self.assertEqual((m['commandes'], m['externes']), (1, 1))
        # Liste nominative des statistiques
        aujourdhui = timezone.localdate().isoformat()
        r = self.client_pour(self.gestionnaire).get(f'{API}/statistiques/detail/',
                                                    {'debut': aujourdhui, 'fin': aujourdhui})
        self.assertEqual(sorted(l['externe'] for l in r.data['results']), [False, True])
