"""
Tests de l'étape 3 :
  - suivi des factures prestataires (api/suivi_factures.py) : chaque
    transition, transitions refusées, permissions, comparaison des montants,
    contrôle des fichiers, notifications et historique ;
  - améliorations de la caisse (api/caisse.py) : mouvements d'un compte
    (paginés, filtres, exports PDF / Excel), photo des employés, liste des
    caissiers, date du dernier mouvement.

Lancer : python manage.py test api
"""

import io
import shutil
import tempfile
import zipfile
from datetime import timedelta
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone

from .models import (
    CompteRepas, FactureDeposee, FacturePrestataire, HistoriqueFacturePrestataire, MouvementCompte,
    Notification, User,
)
from .tests import API
from .tests_caisse import _CaisseBase

D = Decimal


def pdf(nom='facture.pdf', taille=None):
    contenu = b'%PDF-1.4\n%test\n' + (b'0' * (taille or 100)) + b'\n%%EOF'
    return SimpleUploadedFile(nom, contenu, content_type='application/pdf')


class _SuiviBase(_CaisseBase):
    """
    Mois précédent clôturé avec 3 repas du prestataire A (900 F) : relevé
    RP-… de 2 700 F. Le prestataire B n'a pas de relevé ce mois-là.
    """

    @classmethod
    def setUpClass(cls):
        # Fichiers déposés : dossier temporaire (jamais le dossier media du projet)
        cls._media = tempfile.mkdtemp(prefix='ubifood-tests-')
        cls._media_reglage = override_settings(MEDIA_ROOT=cls._media)
        cls._media_reglage.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls._media_reglage.disable()
        shutil.rmtree(cls._media, ignore_errors=True)

    def setUp(self):
        super().setUp()
        for n in (1, 2, 3):
            self.commander(self.employe, self.jour_prec(n), statut='retiree')
        with self.captureOnCommitCallbacks(execute=True):
            self.cloturer_prec()
        self.releve = FacturePrestataire.objects.get(prestataire=self.presta_a)
        self.presta = self.client_pour(self.resp_a)
        self.cpta = self.client_pour(self.compta)

    # ── Outils ────────────────────────────────────────────────
    def url_p(self, action='', pk=None):
        return f"{API}/prestataire/factures/{pk or self.releve.id}/{action}"

    def url_c(self, action='', pk=None):
        return f"{API}/paiements-prestataires/{pk or self.releve.id}/{action}"

    def poster(self, client, url, donnees=None, attendu=200, multipart=False):
        with self.captureOnCommitCallbacks(execute=True):
            r = client.post(url, donnees or {}, format='multipart' if multipart else 'json')
        self.assertEqual(r.status_code, attendu, getattr(r, 'data', r))
        return r.data

    def deposer(self, montant='2700', numero='F-001', fichier=None, attendu=200):
        return self.poster(self.presta, self.url_p('deposer/'), {
            'fichier': fichier or pdf(), 'numero_facture': numero,
            'date_facture': timezone.localdate().isoformat(), 'montant_ttc': montant,
        }, attendu=attendu, multipart=True)

    def statut_releve(self):
        self.releve.refresh_from_db()
        return self.releve.statut

    def notifs(self, user):
        return list(Notification.objects.filter(user=user, type='facture_prestataire').order_by('id'))

    def actions(self):
        return list(HistoriqueFacturePrestataire.objects.filter(releve=self.releve).values_list('action', flat=True))


class SuiviFacturesTests(_SuiviBase):

    def test_cloture_emet_le_releve_et_notifie(self):
        self.assertEqual((self.releve.statut, self.releve.montant_total), ('emis', D('2700')))
        self.assertEqual(self.actions(), ['emis'])
        self.assertEqual(HistoriqueFacturePrestataire.objects.get(releve=self.releve).user, self.admin)
        n = self.notifs(self.resp_a)
        self.assertEqual(len(n), 1)
        self.assertIn('Relevé de prestations émis', n[0].titre)
        self.assertIn('2 700 F', n[0].message)
        self.assertEqual(n[0].donnees['releve_id'], self.releve.id)
        self.assertEqual(self.notifs(self.agent_a), [])           # agents de comptoir : non
        self.assertEqual(self.notifs(self.resp_b), [])
        # Espace prestataire : liste des relevés avec le suivi
        rel = self.presta.get(f'{API}/prestataire/releves/').data
        ligne = next(x for x in rel if x['releve_id'] == self.releve.id)
        self.assertEqual((ligne['statut'], ligne['etape']), ('emis', 2))
        d = self.presta.get(self.url_p()).data
        self.assertEqual([e['etat'] for e in d['etapes']], ['fait', 'en_cours', 'a_venir', 'a_venir', 'a_venir'])
        self.assertEqual(d['actions'], ['accord', 'contester'])
        self.assertEqual(len(self.presta.get(f'{API}/prestataire/factures/').data), 1)

    def test_parcours_complet_ecart_refus_puis_paiement(self):
        # 2. Bon pour accord → comptabilité et administrateurs notifiés
        d = self.poster(self.presta, self.url_p('accord/'))
        self.assertEqual((d['statut'], d['accord_par_nom']), ('accorde', 'RESPA Test'))
        self.assertEqual(d['actions'], ['deposer'])
        for u in (self.compta, self.compta_caisse, self.admin, self.super_admin):
            self.assertIn('Bon pour accord', self.notifs(u)[-1].titre, u.username)
        self.assertEqual(self.notifs(self.caissier), [])
        self.assertEqual(self.notifs(self.gestionnaire), [])
        # 3. Facture avec écart : acceptée mais signalée
        d = self.deposer(montant='2900')
        self.assertEqual(d['statut'], 'facture_deposee')
        self.assertEqual((d['facture']['ecart'], d['facture']['conforme']), (200.0, False))
        self.assertIn('Écart de +200 F', d['etapes'][2]['detail'])
        n = self.notifs(self.compta)[-1]
        self.assertIn('écart', n.titre.lower())
        self.assertIn('+200 F', n.message)
        # 4. Refus : motif obligatoire
        self.poster(self.cpta, self.url_c('refuser/'), {'motif': ' '}, attendu=400)
        d = self.poster(self.cpta, self.url_c('refuser/'), {'motif': 'Montant différent du relevé.'})
        self.assertEqual(d['statut'], 'facture_refusee')
        self.assertEqual(d['etapes'][2]['etat'], 'alerte')
        self.assertIn('Montant différent', self.notifs(self.resp_a)[-1].message)
        self.assertIn('refusée', self.notifs(self.resp_a)[-1].titre)
        self.poster(self.cpta, self.url_c('valider/'), attendu=400)       # plus rien à valider
        # Nouveau dépôt, conforme
        d = self.deposer(montant='2700', numero='F-002')
        self.assertEqual((d['statut'], d['facture']['conforme'], d['facture']['numero_facture']),
                         ('facture_deposee', True, 'F-002'))
        self.assertIn('Facture déposée', self.notifs(self.compta)[-1].titre)
        self.assertIn('montant conforme', self.notifs(self.compta)[-1].message)
        self.assertEqual(list(FactureDeposee.objects.filter(releve=self.releve).order_by('id')
                              .values_list('statut', flat=True)), ['refusee', 'en_attente'])
        # Validation
        d = self.poster(self.cpta, self.url_c('valider/'), {'commentaire': 'OK'})
        self.assertEqual((d['statut'], d['actions']), ('facture_validee', ['payer']))
        self.assertIn('validée', self.notifs(self.resp_a)[-1].titre)
        self.deposer(numero='F-003', attendu=400)                        # plus de dépôt après validation
        # 5. Paiement : référence obligatoire pour un virement
        self.poster(self.cpta, self.url_c('payer/'), {'date_paiement': timezone.localdate().isoformat(),
                                                      'mode': 'virement'}, attendu=400, multipart=True)
        self.poster(self.cpta, self.url_c('payer/'), {'date_paiement': timezone.localdate().isoformat(),
                                                      'mode': 'carte', 'reference': 'x'}, attendu=400,
                    multipart=True)
        demain = (timezone.localdate() + timedelta(days=1)).isoformat()
        self.poster(self.cpta, self.url_c('payer/'), {'date_paiement': demain, 'mode': 'virement',
                                                      'reference': 'VIR-1'}, attendu=400, multipart=True)
        d = self.poster(self.cpta, self.url_c('payer/'), {
            'date_paiement': timezone.localdate().isoformat(), 'mode': 'virement', 'reference': 'VIR-2026-77',
            'justificatif': pdf('avis.pdf')}, multipart=True)
        self.assertEqual(d['statut'], 'payee')
        self.assertEqual((d['paiement']['mode_libelle'], d['paiement']['reference'], d['paiement']['justificatif']),
                         ('Virement', 'VIR-2026-77', True))
        self.assertEqual([e['etat'] for e in d['etapes']], ['fait'] * 5)
        self.assertEqual((d['etape'], d['actions']), (6, []))
        n = self.notifs(self.resp_a)[-1]
        self.assertIn('Paiement', n.titre)
        self.assertIn('VIR-2026-77', n.message)
        self.poster(self.cpta, self.url_c('payer/'), {'date_paiement': timezone.localdate().isoformat(),
                                                      'mode': 'especes'}, attendu=400, multipart=True)
        # Historique complet (qui, quand, quoi)
        self.assertEqual(self.actions(), ['emis', 'accord', 'depot', 'refus', 'depot', 'validation', 'paiement'])
        h = self.presta.get(self.url_p()).data['historique']
        self.assertEqual(h[3]['commentaire'], 'Montant différent du relevé.')
        self.assertEqual(h[3]['user_nom'], 'COMPTA1 Test')
        self.assertFalse(h[2]['donnees']['conforme'])
        self.assertEqual(len(self.presta.get(self.url_p()).data['depots']), 2)
        # Fichiers : facture déposée et justificatif, des deux côtés
        depot = FactureDeposee.objects.filter(releve=self.releve, statut='validee').get()
        for client, url in ((self.presta, self.url_p), (self.cpta, self.url_c)):
            r = client.get(url(f'depots/{depot.id}/fichier/'))
            self.assertEqual(r.status_code, 200)
            self.assertTrue(b''.join(r.streaming_content).startswith(b'%PDF-'))
            self.assertIn('facture.pdf', r['Content-Disposition'])
            self.assertEqual(client.get(url('justificatif/')).status_code, 200)
            r = client.get(url('releve-pdf/'))
            self.assertEqual(r.status_code, 200)
            self.assertIn(self.releve.numero, r['Content-Disposition'])

    def test_contestation_puis_reponse(self):
        self.poster(self.presta, self.url_p('contester/'), {'commentaire': ''}, attendu=400)
        d = self.poster(self.presta, self.url_p('contester/'), {'commentaire': 'Il manque 2 repas le 3.'})
        self.assertEqual((d['statut'], d['etapes'][1]['etat']), ('conteste', 'alerte'))
        self.assertEqual(d['contestation']['commentaire'], 'Il manque 2 repas le 3.')
        n = self.notifs(self.compta)[-1]
        self.assertIn('contesté', n.titre)
        self.assertIn('Il manque 2 repas', n.message)
        # Bloqué tant que la comptabilité n'a pas répondu
        self.poster(self.presta, self.url_p('accord/'), attendu=400)
        self.deposer(attendu=400)
        self.poster(self.presta, self.url_p('contester/'), {'commentaire': 'encore'}, attendu=400)
        self.assertEqual(self.cpta.get(self.url_c()).data['actions'], ['repondre'])
        self.poster(self.cpta, self.url_c('repondre/'), {'commentaire': ''}, attendu=400)
        d = self.poster(self.cpta, self.url_c('repondre/'),
                        {'commentaire': 'Les 2 repas ont été annulés par les employés.'})
        self.assertEqual(d['statut'], 'emis')
        self.assertEqual(d['contestation']['reponse'], 'Les 2 repas ont été annulés par les employés.')
        self.assertEqual(d['montant'], 2700.0)                         # mois figé : montant inchangé
        n = self.notifs(self.resp_a)[-1]
        self.assertIn('Réponse à votre contestation', n.titre)
        self.assertIn('annulés', n.message)
        self.poster(self.cpta, self.url_c('repondre/'), {'commentaire': 'x'}, attendu=400)
        self.poster(self.presta, self.url_p('accord/'))
        self.assertEqual(self.actions(), ['emis', 'contestation', 'reponse', 'accord'])

    def test_transitions_refusees(self):
        # Dépôt avant le bon pour accord, validation / paiement / réponse hors étape
        self.deposer(attendu=400)
        for action in ('valider/', 'payer/', 'repondre/'):
            self.poster(self.cpta, self.url_c(action), {'commentaire': 'x', 'motif': 'x', 'mode': 'especes',
                                                        'date_paiement': timezone.localdate().isoformat()},
                        attendu=400)
        self.poster(self.cpta, self.url_c('refuser/'), {'motif': 'x'}, attendu=400)
        self.poster(self.presta, self.url_p('accord/'))
        self.poster(self.presta, self.url_p('accord/'), attendu=400)                # deux fois
        self.poster(self.presta, self.url_p('contester/'), {'commentaire': 'x'}, attendu=400)  # après l'accord
        self.deposer()
        self.poster(self.cpta, self.url_c('relancer/'), attendu=400)                 # facture en attente
        self.poster(self.cpta, self.url_c('payer/'), {'mode': 'especes',
                                                      'date_paiement': timezone.localdate().isoformat()},
                    attendu=400, multipart=True)
        self.assertEqual(self.statut_releve(), 'facture_deposee')
        # Date de facture antérieure au mois facturé
        self.poster(self.presta, self.url_p('deposer/'), {
            'fichier': pdf(), 'numero_facture': 'F-9', 'date_facture': '2000-01-01', 'montant_ttc': '2700'},
            attendu=400, multipart=True)

    def test_nouveau_depot_tant_que_non_validee(self):
        self.poster(self.presta, self.url_p('accord/'))
        self.deposer(numero='F-1')
        d = self.deposer(numero='F-2', montant='2700.50')
        self.assertEqual((d['facture']['numero_facture'], d['facture']['ecart']), ('F-2', 0.5))
        self.assertEqual(list(FactureDeposee.objects.filter(releve=self.releve).order_by('id')
                              .values_list('statut', flat=True)), ['remplacee', 'en_attente'])
        self.poster(self.cpta, self.url_c('valider/'))
        self.assertEqual(FactureDeposee.objects.get(numero_facture='F-2').statut, 'validee')
        self.assertTrue(self.releve.depots.get(numero_facture='F-2').traitee_par == self.compta)

    def test_controle_des_fichiers_et_montants(self):
        self.poster(self.presta, self.url_p('accord/'))
        image = SimpleUploadedFile('facture.png', b'\x89PNG\r\n\x1a\n000', content_type='image/png')
        r = self.deposer(fichier=image, attendu=400)
        self.assertIn('PDF', str(r))
        faux = SimpleUploadedFile('facture.pdf', b'MZ pas un pdf', content_type='application/pdf')
        self.assertIn("n'est pas un PDF valide", str(self.deposer(fichier=faux, attendu=400)))
        gros = pdf(taille=10 * 1024 * 1024 + 1)
        self.assertIn('10 Mo', str(self.deposer(fichier=gros, attendu=400)))
        for montant in ('0', '-5', 'abc', '12.345'):
            self.deposer(montant=montant, attendu=400)
        self.deposer(numero='', attendu=400)
        r = self.poster(self.presta, self.url_p('deposer/'), {'numero_facture': 'F', 'montant_ttc': '1',
                                                              'date_facture': timezone.localdate().isoformat()},
                        attendu=400, multipart=True)
        self.assertIn('fichier', r)
        self.assertEqual(self.statut_releve(), 'accorde')
        self.assertFalse(FactureDeposee.objects.exists())
        # Nom de fichier stocké non devinable, nom d'origine conservé
        self.deposer(fichier=pdf('Ma facture octobre.pdf'))
        depot = FactureDeposee.objects.get()
        self.assertEqual(depot.nom_fichier, 'Ma facture octobre.pdf')
        self.assertNotIn('octobre', depot.fichier.name)
        self.assertTrue(depot.fichier.name.endswith('.pdf'))
        # Justificatif de paiement : PDF ou image
        self.poster(self.cpta, self.url_c('valider/'))
        exe = SimpleUploadedFile('avis.exe', b'MZ', content_type='application/octet-stream')
        self.poster(self.cpta, self.url_c('payer/'), {'date_paiement': timezone.localdate().isoformat(),
                                                      'mode': 'especes', 'justificatif': exe},
                    attendu=400, multipart=True)
        png = SimpleUploadedFile('recu.png', b'\x89PNG\r\n\x1a\n0000', content_type='image/png')
        d = self.poster(self.cpta, self.url_c('payer/'), {'date_paiement': timezone.localdate().isoformat(),
                                                          'mode': 'especes', 'justificatif': png}, multipart=True)
        self.assertEqual((d['statut'], d['paiement']['reference']), ('payee', ''))
        self.assertEqual(self.cpta.get(self.url_c('justificatif/'))['Content-Type'], 'image/png')

    def test_relance(self):
        d = self.poster(self.cpta, self.url_c('relancer/'), {'commentaire': 'Merci de répondre avant le 15.'})
        self.assertIsNotNone(d['derniere_relance_le'])
        n = self.notifs(self.resp_a)[-1]
        self.assertIn('Relance', n.titre)
        self.assertIn('bon pour accord', n.message)
        self.assertIn('avant le 15', n.message)
        self.poster(self.presta, self.url_p('accord/'))
        self.poster(self.cpta, self.url_c('relancer/'))
        self.assertIn('votre facture', self.notifs(self.resp_a)[-1].message)
        self.assertEqual(self.actions(), ['emis', 'relance', 'accord', 'relance'])
        self.assertEqual(self.client_pour(self.resp_a).post(self.url_c('relancer/')).status_code, 403)

    def test_permissions(self):
        autre = self.client_pour(self.resp_b)
        # Autre prestataire : ni voir, ni agir, ni télécharger
        self.assertEqual(autre.get(self.url_p()).status_code, 404)
        self.assertEqual(autre.post(self.url_p('accord/')).status_code, 404)
        self.assertEqual(autre.get(self.url_p('releve-pdf/')).status_code, 404)
        self.assertEqual(autre.get(f'{API}/prestataire/factures/').data, [])
        # Agent de comptoir : pas de relevés
        agent = self.client_pour(self.agent_a)
        self.assertEqual(agent.get(self.url_p()).status_code, 403)
        self.assertEqual(agent.post(self.url_p('accord/')).status_code, 403)
        # Les routes de la comptabilité sont fermées aux prestataires, aux caissiers, aux employés
        for qui in (self.resp_a, self.agent_a, self.caissier, self.employe):
            c = self.client_pour(qui)
            self.assertEqual(c.get(f'{API}/paiements-prestataires/').status_code, 403, qui.username)
            self.assertEqual(c.get(self.url_c()).status_code, 403, qui.username)
            self.assertEqual(c.post(self.url_c('relancer/')).status_code, 403, qui.username)
        # La comptabilité n'agit pas à la place du prestataire
        self.assertEqual(self.cpta.post(self.url_p('accord/')).status_code, 403)
        # Gestionnaire : lecture des prestataires de ses agences, aucune action
        gest = self.client_pour(self.gestionnaire)
        r = gest.get(f'{API}/paiements-prestataires/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual([x['id'] for x in r.data['resultats']], [self.releve.id])
        self.assertFalse(r.data['peut_agir'])
        self.assertEqual(r.data['resultats'][0]['actions'], [])
        self.assertEqual(gest.post(self.url_c('relancer/')).status_code, 403)
        self.assertEqual(gest.get(self.url_c('releve-pdf/')).status_code, 200)
        # Administrateur : tout
        self.assertEqual(self.client_pour(self.admin).get(self.url_c()).data['actions'], ['relancer'])
        self.poster(self.client_pour(self.admin), self.url_c('relancer/'))

    def test_liste_comptabilite_totaux_et_filtres(self):
        # Second relevé (prestataire B, même mois) payé
        b = FacturePrestataire.objects.create(
            cloture=self.releve.cloture, prestataire=self.presta_b, prestataire_libelle='Traiteur B',
            numero='RP-TEST-999', annee=self.releve.annee, mois=self.releve.mois, nb_repas=1,
            montant_total=D('900'), statut='payee')
        r = self.cpta.get(f'{API}/paiements-prestataires/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['annee'], self.releve.annee)
        t = r.data['totaux']
        self.assertEqual((t['en_cours'], t['payes'], t['dus']),
                         ({'nb': 1, 'montant': 2700.0}, {'nb': 1, 'montant': 900.0}, {'nb': 0, 'montant': 0.0}))
        self.assertEqual(len(r.data['resultats']), 2)
        self.assertEqual({p['libelle'] for p in r.data['prestataires']}, {'Traiteur A', 'Traiteur B'})
        f = self.cpta.get(f'{API}/paiements-prestataires/', {'statut': 'payee'}).data['resultats']
        self.assertEqual([x['id'] for x in f], [b.id])
        f = self.cpta.get(f'{API}/paiements-prestataires/', {'prestataire': self.presta_a.id}).data
        self.assertEqual(([x['id'] for x in f['resultats']], f['totaux']['total']['nb']), ([self.releve.id], 1))
        f = self.cpta.get(f'{API}/paiements-prestataires/', {'mois': self.releve.mois % 12 + 1}).data
        self.assertEqual(f['resultats'], [])
        self.assertEqual(self.cpta.get(f'{API}/paiements-prestataires/', {'annee': 1990}).data['resultats'], [])
        self.assertEqual(len(self.cpta.get(f'{API}/paiements-prestataires/',
                                           {'annee': 'toutes'}).data['resultats']), 2)
        for mauvais in ({'statut': 'nimporte'}, {'mois': '13'}, {'annee': 'x'}):
            self.assertEqual(self.cpta.get(f'{API}/paiements-prestataires/', mauvais).status_code, 400)
        # À traiter : contestations, factures à valider, factures validées à payer
        self.poster(self.presta, self.url_p('accord/'))
        self.deposer()
        f = self.cpta.get(f'{API}/paiements-prestataires/', {'statut': 'a_traiter'}).data
        self.assertEqual(([x['id'] for x in f['resultats']], f['totaux']['a_traiter']), ([self.releve.id], 1))
        self.poster(self.cpta, self.url_c('valider/'))
        t = self.cpta.get(f'{API}/paiements-prestataires/').data['totaux']
        self.assertEqual((t['dus'], t['en_cours']), ({'nb': 1, 'montant': 2700.0}, {'nb': 0, 'montant': 0.0}))


class CaisseAmeliorationsTests(_CaisseBase):

    def test_mouvements_d_un_compte(self):
        self.recharger(self.employe, 5000)
        self.recharger(self.employe, 2000)
        ancien = MouvementCompte.objects.order_by('id').first()
        MouvementCompte.objects.filter(pk=ancien.pk).update(created_at=timezone.now() - timedelta(days=40))
        url = f'{API}/caisse/comptes/{self.employe.id}/mouvements/'
        r = self.client_pour(self.compta).get(url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['count'], 2)
        self.assertEqual([m['montant'] for m in r.data['results']], [2000.0, 5000.0])     # du plus récent
        self.assertEqual([m['solde_apres'] for m in r.data['results']], [7000.0, 5000.0])
        self.assertTrue(r.data['results'][0]['recu_numero'].startswith('REÇ-'))
        self.assertEqual((r.data['solde'], r.data['total_credits'], r.data['total_debits']), (7000.0, 7000.0, 0.0))
        self.assertEqual(r.data['employe']['matricule'], 'emp1')
        # Filtres de dates, type, pagination
        il_y_a_10j = (timezone.localdate() - timedelta(days=10)).isoformat()
        r = self.client_pour(self.compta).get(url, {'date_debut': il_y_a_10j})
        self.assertEqual((r.data['count'], r.data['total_credits']), (1, 2000.0))
        r = self.client_pour(self.compta).get(url, {'date_fin': il_y_a_10j})
        self.assertEqual(r.data['count'], 1)
        self.assertEqual(self.client_pour(self.compta).get(url, {'type': 'debit_repas'}).data['count'], 0)
        self.assertEqual(self.client_pour(self.compta).get(url, {'page_size': 1}).data['next'] is not None, True)
        self.assertEqual(self.client_pour(self.compta).get(url, {'date_debut': '2026-13-01'}).status_code, 400)
        self.assertEqual(self.client_pour(self.compta).get(url, {'date_debut': '2026-05-02',
                                                                  'date_fin': '2026-05-01'}).status_code, 400)
        self.assertEqual(self.client_pour(self.compta).get(url, {'type': 'x'}).status_code, 400)
        # Employé sans compte : liste vide
        r = self.client_pour(self.admin).get(f'{API}/caisse/comptes/{self.employe2.id}/mouvements/')
        self.assertEqual((r.status_code, r.data['count'], r.data['solde']), (200, 0, 0.0))
        # Droits : comptabilité et administrateurs seulement
        for qui in (self.caissier, self.gestionnaire, self.employe, self.resp_a):
            self.assertEqual(self.client_pour(qui).get(url).status_code, 403, qui.username)
        self.assertEqual(self.client_pour(self.compta).get(f'{API}/caisse/comptes/{self.resp_a.id}/mouvements/')
                         .status_code, 404)

    def test_exports_pdf_et_excel(self):
        self.recharger(self.employe, 5000)
        url = f'{API}/caisse/comptes/{self.employe.id}/mouvements/'
        r = self.client_pour(self.compta).get(url + 'pdf/')
        self.assertEqual((r.status_code, r['Content-Type']), (200, 'application/pdf'))
        self.assertTrue(b''.join(r.streaming_content).startswith(b'%PDF'))
        self.assertIn('mouvements-emp1.pdf', r['Content-Disposition'])
        r = self.client_pour(self.compta).get(url + 'xlsx/', {'date_debut': '2026-01-01'})
        self.assertEqual(r.status_code, 200)
        self.assertIn('spreadsheetml', r['Content-Type'])
        self.assertIn('mouvements-emp1-2026-01-01.xlsx', r['Content-Disposition'])
        classeur = zipfile.ZipFile(io.BytesIO(b''.join(r.streaming_content)))
        feuille = classeur.read('xl/worksheets/sheet1.xml').decode()
        self.assertIn('Recharge', feuille)
        self.assertIn('<v>5000.0</v>', feuille)
        self.assertIn('xl/workbook.xml', classeur.namelist())
        self.assertEqual(self.client_pour(self.caissier).get(url + 'pdf/').status_code, 403)
        self.assertEqual(self.client_pour(self.caissier).get(url + 'xlsx/').status_code, 403)

    def test_photo_des_employes(self):
        User.objects.filter(pk=self.employe.pk).update(photo='photos_profil/emp1.png')
        r = self.client_pour(self.caissier).get(f'{API}/caisse/employes/', {'q': 'emp'})
        par = {x['matricule']: x for x in r.data['resultats']}
        self.assertTrue(par['emp1']['photo_url'].startswith('http://testserver/media/photos_profil/emp1.png?v='))
        self.assertIsNone(par['emp2']['photo_url'])
        r = self.client_pour(self.caissier).get(f'{API}/caisse/employes/{self.employe.id}/')
        self.assertTrue(r.data['employe']['photo_url'].startswith('http://testserver/media/'))

    def test_liste_des_caissiers(self):
        self.recharger(self.employe, 1000, par=self.admin)      # un administrateur a encaissé
        r = self.client_pour(self.compta).get(f'{API}/caisse/caissiers/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual({c['matricule'] for c in r.data}, {'caisse1', 'caisse2', 'compta2', 'admin1'})
        self.assertEqual(set(r.data[0]), {'id', 'nom_prenom', 'matricule', 'actif'})
        for qui in (self.caissier, self.gestionnaire, self.employe):
            self.assertEqual(self.client_pour(qui).get(f'{API}/caisse/caissiers/').status_code, 403)

    def test_date_du_dernier_mouvement(self):
        self.recharger(self.employe, 1000)
        il_y_a = timezone.now() - timedelta(days=12)
        MouvementCompte.objects.update(created_at=il_y_a)
        CompteRepas.objects.update(updated_at=timezone.now())
        c = self.client_pour(self.compta).get(f'{API}/caisse/comptes/').data['results'][0]
        self.assertEqual(c['dernier_mouvement'][:10], timezone.localtime(il_y_a).date().isoformat())
        self.assertEqual(c['mis_a_jour'], c['dernier_mouvement'])
        self.assertIn('photo_url', c)
