"""
Retrait par badge d'accès : les employés posent au comptoir le badge qu'ils
utilisent pour les portes (lecteur USB « clavier », sur ordinateur ou
branché au téléphone Android). Seul le numéro du badge est enregistré ; il
est masqué à l'écran (4 derniers caractères).

  - Numéro lu en décimal ou en hexadécimal selon le lecteur ou la liste de
    la sécurité : les deux écritures du même badge sont reconnues (val_dec,
    val_hex).
  - Un seul badge actif par employé ; un badge actif n'appartient qu'à un
    seul employé. Remplacer, déclarer perdu, dissocier, réactiver (badge
    perdu retrouvé) ; historique conservé.
  - Association : gestionnaires (employés de leurs agences) et
    administrateurs ; badge par badge, ou import de la liste de la sécurité
    (aperçu avant import).
  - Employé : voit son badge, le déclare perdu (bloqué aussitôt).
  - Comptoir : voir espace_prestataire (recherche ?carte=…, mode « badge »).
    Réglages Société : validation automatique, alerte badge perdu, badge
    obligatoire (désactivé : QR code et matricule restent possibles).

API
  GET  badge/                         mon badge (employé)
  POST badge/perdu/                   je déclare mon badge perdu
  GET  admin/badges/?user=            badges d'un employé (historique)
  POST admin/badges/                  {user, numero} associer (remplace le badge actif)
  POST admin/badges/<id>/perdu|dissocier|reactiver/
  GET  admin/badges/sans-badge/?agence=   employés sans badge actif
  POST admin/badges/import/           {lignes: [{ligne, matricule, numero}], apercu}
"""
import re
from collections import defaultdict

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import BadgeAcces, User
from .permissions import (
    PRESTATAIRE_ROLES, IsAuthenticated, agences_gerees, is_admin, is_gestionnaire,
)

HEXA = re.compile(r'^[0-9A-F]+$')


def _iso(dt):
    return timezone.localtime(dt).isoformat() if dt else None


def normaliser(numero):
    """Numéro sans séparateurs, en majuscules (« 04:a1 b2 » → « 04A1B2 »)."""
    return re.sub(r'[\s:\-\.]', '', str(numero or '')).upper()


def valeurs(numero):
    """(valeur décimale, valeur hexadécimale) du numéro, en texte ('' si impossible)."""
    n = normaliser(numero)
    dec = str(int(n)) if n.isdigit() else ''
    hexa = str(int(n, 16)) if n and HEXA.match(n) else ''
    return dec, hexa


def masque(numero):
    n = normaliser(numero)
    return f"•••• {n[-4:]}" if len(n) > 4 else '••••'


def trouver(numero, statuts=('actif',)):
    """Badge correspondant au numéro lu (décimal ou hexadécimal), le plus probable d'abord."""
    n = normaliser(numero)
    if not n or len(n) > 40:
        return None
    dec, hexa = valeurs(n)
    candidats = {v for v in (dec, hexa) if v}
    if not candidats:
        return None
    qs = list(BadgeAcces.objects.filter(statut__in=statuts)
              .filter(Q(val_dec__in=candidats) | Q(val_hex__in=candidats)).select_related('user'))
    if not qs:
        return None

    def rang(b):  # même écriture d'abord
        if b.numero == n:
            return 0
        if dec and b.val_dec == dec:
            return 1
        if hexa and b.val_hex == hexa:
            return 2
        return 3
    return sorted(qs, key=lambda b: (rang(b), -b.associe_le.timestamp()))[0]


def badge_json(b, detail=False):
    from .jeux import nom_complet
    d = {'id': b.id, 'masque': masque(b.numero), 'statut': b.statut, 'statut_libelle': b.get_statut_display(),
         'associe_le': _iso(b.associe_le), 'fin_le': _iso(b.fin_le), 'motif': b.motif}
    if detail:
        d.update({'associe_par': nom_complet(b.associe_par) if b.associe_par_id else None,
                  'fin_par': nom_complet(b.fin_par) if b.fin_par_id else None,
                  'user_id': b.user_id})
    return d


def _verifier_droits(par, employe):
    if is_admin(par):
        return
    if not is_gestionnaire(par):
        raise PermissionDenied("Réservé aux gestionnaires et administrateurs.")
    from .jeux import agences_actuelles
    if not agences_actuelles([employe.id]).get(employe.id, set()) & (agences_gerees(par) or set()):
        raise PermissionDenied("Cet employé ne dépend pas de vos agences.")


def _employe(user_id):
    u = User.objects.filter(pk=user_id).exclude(groups__name__in=PRESTATAIRE_ROLES).first()
    if u is None:
        raise NotFound("Employé introuvable.")
    return u


def associer(employe, numero, par, maintenant=None):
    """Associe le badge (le badge actif précédent de l'employé passe « remplacé »)."""
    maintenant = maintenant or timezone.now()
    n = normaliser(numero)
    if not n or len(n) < 4 or len(n) > 40:
        raise ValidationError({'numero': "Numéro de badge invalide."})
    dec, hexa = valeurs(n)
    if not dec and not hexa:
        raise ValidationError({'numero': "Numéro de badge invalide (chiffres ou hexadécimal attendus)."})
    with transaction.atomic():
        autre = trouver(n)
        if autre is not None and autre.user_id != employe.id:
            from .jeux import nom_complet
            raise ValidationError({'numero': f"Ce badge est déjà associé à {nom_complet(autre.user)} ({autre.user.username})."})
        if autre is not None:
            return autre    # déjà le sien
        for ancien in BadgeAcces.objects.select_for_update().filter(user=employe, statut='actif'):
            ancien.statut, ancien.fin_le, ancien.fin_par, ancien.motif = 'remplace', maintenant, par, 'Nouveau badge'
            ancien.save(update_fields=['statut', 'fin_le', 'fin_par', 'motif'])
        return BadgeAcces.objects.create(user=employe, numero=n, val_dec=dec, val_hex=hexa, associe_le=maintenant,
                                         associe_par=par)


def changer_statut(badge, action, par, motif='', maintenant=None):
    maintenant = maintenant or timezone.now()
    with transaction.atomic():
        b = BadgeAcces.objects.select_for_update().get(pk=badge.pk)
        if action in ('perdu', 'dissocier'):
            if b.statut != 'actif':
                raise ValidationError("Ce badge n'est pas actif.")
            b.statut = 'perdu' if action == 'perdu' else 'dissocie'
            b.fin_le, b.fin_par = maintenant, par
            b.motif = (motif or ("Déclaré perdu" if action == 'perdu' else "Dissocié"))[:255]
        elif action == 'reactiver':
            if b.statut != 'perdu':
                raise ValidationError("Seul un badge perdu peut être réactivé (badge retrouvé).")
            if BadgeAcces.objects.filter(user=b.user, statut='actif').exists():
                raise ValidationError("L'employé a déjà un autre badge actif : dissociez-le d'abord.")
            autre = trouver(b.numero)
            if autre is not None and autre.pk != b.pk:
                raise ValidationError("Ce numéro est désormais associé à un autre employé.")
            b.statut, b.fin_le, b.fin_par, b.motif = 'actif', None, None, 'Badge retrouvé'
        else:
            raise ValidationError("Action invalide.")
        b.save(update_fields=['statut', 'fin_le', 'fin_par', 'motif'])
    return b


def notifier_badge_perdu(badge, agence_id, agent):
    """Badge déclaré perdu présenté au comptoir : alerte aux gestionnaires de l'agence."""
    from . import gains
    from .jeux import nom_complet
    from .signals import _gestionnaires_agence
    ids = [u.id for u in _gestionnaires_agence(agence_id)]
    gains.notifier(ids, '🚨 Badge perdu présenté au comptoir',
                   f"Le badge déclaré perdu de {nom_complet(badge.user)} ({badge.user.username}) a été présenté "
                   f"à {timezone.localtime():%H:%M} (agent : {nom_complet(agent)}). Retrait refusé.",
                   {'ecran': 'badges'})


# ══════════════════════════════════════════════════════════════
# VUES
# ══════════════════════════════════════════════════════════════

class MonBadgeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        b = BadgeAcces.objects.filter(user=request.user, statut='actif').first()
        perdu = BadgeAcces.objects.filter(user=request.user, statut='perdu').first() if b is None else None
        return Response({'badge': badge_json(b) if b else None, 'perdu': badge_json(perdu) if perdu else None})


class MonBadgePerduView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        b = BadgeAcces.objects.filter(user=request.user, statut='actif').first()
        if b is None:
            raise ValidationError("Vous n'avez pas de badge actif.")
        b = changer_statut(b, 'perdu', request.user, "Déclaré perdu par l'employé")
        return Response({'badge': None, 'perdu': badge_json(b)})


class AdminBadgesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        employe = _employe(request.query_params.get('user'))
        _verifier_droits(request.user, employe)
        return Response([badge_json(b, True) for b in
                         BadgeAcces.objects.filter(user=employe).select_related('associe_par', 'fin_par')])

    def post(self, request):
        employe = _employe(request.data.get('user'))
        _verifier_droits(request.user, employe)
        b = associer(employe, request.data.get('numero'), request.user)
        return Response(badge_json(b, True), status=201)


class AdminBadgeActionView(APIView):
    permission_classes = [IsAuthenticated]
    action = ''

    def post(self, request, pk):
        b = BadgeAcces.objects.select_related('user').filter(pk=pk).first()
        if b is None:
            raise NotFound("Badge introuvable.")
        _verifier_droits(request.user, b.user)
        b = changer_statut(b, self.action, request.user, request.data.get('motif') or '')
        return Response(badge_json(b, True))


def _employes_geres(par):
    from .jeux import agences_actuelles
    qs = User.objects.filter(is_active=True, groups__name='employe').exclude(groups__name__in=PRESTATAIRE_ROLES).distinct()
    if is_admin(par):
        return list(qs)
    geres = agences_gerees(par) or set()
    users = list(qs)
    ags = agences_actuelles([u.id for u in users])
    return [u for u in users if ags.get(u.id, set()) & geres]


class SansBadgeView(APIView):
    """Employés (de mes agences) sans badge actif ; ?agence= pour filtrer."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_gestionnaire(request.user):
            raise PermissionDenied("Réservé aux gestionnaires et administrateurs.")
        from .jeux import agences_actuelles, nom_complet
        users = _employes_geres(request.user)
        agence = request.query_params.get('agence')
        ags = agences_actuelles([u.id for u in users])
        if agence and str(agence).isdigit():
            users = [u for u in users if int(agence) in ags.get(u.id, set())]
        avec = set(BadgeAcces.objects.filter(statut='actif', user__in=users).values_list('user_id', flat=True))
        sans = sorted((u for u in users if u.id not in avec), key=lambda u: (u.nom, u.prenom))
        return Response({'total': len(users), 'avec_badge': len(avec),
                         'sans_badge': [{'id': u.id, 'nom': nom_complet(u), 'matricule': u.username} for u in sans]})


class ImportBadgesView(APIView):
    """
    Import de la liste matricule / numéro (fichier lu par le navigateur).
    Chaque ligne est contrôlée ; apercu=true : rien n'est enregistré.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_gestionnaire(request.user):
            raise PermissionDenied("Réservé aux gestionnaires et administrateurs.")
        from .jeux import nom_complet
        lignes = request.data.get('lignes') or []
        if not isinstance(lignes, list) or not lignes:
            raise ValidationError({'lignes': "Le fichier ne contient aucune ligne."})
        if len(lignes) > 5000:
            raise ValidationError({'lignes': "5 000 lignes au plus par import."})
        apercu = request.data.get('apercu') in (True, 'true', 1, '1')
        geres = {u.id for u in _employes_geres(request.user)}
        matricules = {str(l.get('matricule') or '').strip() for l in lignes if isinstance(l, dict)}
        users = {u.username: u for u in User.objects.filter(username__in=matricules)}
        sans_zeros = defaultdict(list)
        for u in User.objects.filter(username__regex=r'^0+[0-9]+$'):
            sans_zeros[u.username.lstrip('0')].append(u)
        vus = {}
        res, nb = [], {'a_associer': 0, 'a_jour': 0, 'erreurs': 0}
        for i, l in enumerate(lignes, start=1):
            l = l if isinstance(l, dict) else {}
            num_ligne = l.get('ligne') or i + 1
            mat = str(l.get('matricule') or '').strip()
            numero = normaliser(l.get('numero'))
            r = {'ligne': num_ligne, 'matricule': mat, 'employe': None, 'badge': masque(numero) if numero else '',
                 'resultat': '', 'statut': 'erreur'}
            u = users.get(mat)
            if u is None and mat.isdigit() and len(sans_zeros.get(mat.lstrip('0'), [])) == 1:
                u = sans_zeros[mat.lstrip('0')][0]
            if u is None:
                r['resultat'] = "Matricule inconnu"
            elif u.id not in geres:
                r['employe'] = nom_complet(u)
                r['resultat'] = "Employé hors de vos agences (ou sans rôle Employé)"
            elif not numero or not any(valeurs(numero)):
                r['employe'] = nom_complet(u)
                r['resultat'] = "Numéro de badge invalide"
            else:
                r['employe'] = nom_complet(u)
                cles = {v for v in valeurs(numero) if v}
                double = next((vus[v] for v in cles if v in vus), None)
                if double is not None:
                    r['resultat'] = f"Badge en double (ligne {double})"
                else:
                    for v in cles:
                        vus[v] = num_ligne
                    existant = trouver(numero)
                    if existant is not None and existant.user_id != u.id:
                        r['resultat'] = f"Badge déjà associé à {nom_complet(existant.user)}"
                    elif existant is not None:
                        r['statut'], r['resultat'] = 'a_jour', "Déjà associé"
                    else:
                        r['statut'] = 'a_associer'
                        r['resultat'] = "Sera associé" + (f" (matricule {u.username})" if u.username != mat else '')
                        if not apercu:
                            try:
                                associer(u, numero, request.user)
                                r['resultat'] = "Associé"
                            except ValidationError as e:
                                r['statut'] = 'erreur'
                                r['resultat'] = str(e.detail.get('numero', e.detail) if isinstance(e.detail, dict) else e.detail)
            nb[{'a_associer': 'a_associer', 'a_jour': 'a_jour'}.get(r['statut'], 'erreurs')] += 1
            res.append(r)
        return Response({'apercu': apercu, 'lignes': res, **nb, 'total': len(res)})
