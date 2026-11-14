"""
Grille des tarifs en vigueur : catégories de salarié × types de plat
(employés) et prestataires × types de plat. Lecture : gestionnaires et
administrateurs ; modification : administrateurs (mêmes droits que les tarifs).

GET  tarifs/grille/?cible=employes|prestataires&date=AAAA-MM-JJ
POST tarifs/grille/ {cible, proprietaire, type_plat (null = tous types), montant, date_debut}
     → clôture le tarif en vigueur de la même case la veille de date_debut et
       crée le nouveau (historique conservé).
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import facturation as fact
from .models import Categoriesalarie, PlatCategoriesalarie, PlatPrestataire, Prestataire, Statut, TypePlat
from .permissions import ReadGestionnaireWriteAdmin

CIBLES = {
    'employes': (PlatCategoriesalarie, 'categoriesalarie', Categoriesalarie, 'libelle'),
    'prestataires': (PlatPrestataire, 'prestataire', Prestataire, 'libelle'),
}


def _cible(valeur):
    if valeur not in CIBLES:
        raise ValidationError({'cible': "Cible invalide (employes, prestataires)."})
    return CIBLES[valeur]


def _date(valeur, defaut=None):
    if not valeur:
        return defaut or timezone.localdate()
    try:
        return date.fromisoformat(str(valeur)[:10])
    except ValueError:
        raise ValidationError({'date': "Date invalide (AAAA-MM-JJ)."})


def _case(t):
    return {'tarif_id': t.id, 'montant': float(t.montant),
            'date_debut': fact._jour(t.date_debut).isoformat(),
            'date_fin': fact._jour(t.date_fin).isoformat() if t.date_fin else None} if t else None


class GrilleTarifsView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def get(self, request):
        modele, champ, proprio_modele, libelle = _cible(request.query_params.get('cible') or 'employes')
        d = _date(request.query_params.get('date'))
        types = list(TypePlat.objects.order_by('libelle'))
        tarifs = {}
        for t in modele.objects.all():
            tarifs.setdefault(getattr(t, f'{champ}_id'), []).append(t)
        lignes = []
        for p in proprio_modele.objects.order_by(libelle):
            liste = tarifs.get(p.id, [])
            tous = fact.ligne_active([t for t in liste if t.type_plat_id is None], d)
            cases = {'tous': _case(tous)}
            for ty in types:
                cases[str(ty.id)] = _case(fact.ligne_active([t for t in liste if t.type_plat_id == ty.id], d))
            # Prochains changements déjà programmés (date de début future)
            futurs = sorted((t for t in liste if fact._jour(t.date_debut) > d), key=lambda t: t.date_debut)
            lignes.append({'id': p.id, 'libelle': getattr(p, libelle), 'cases': cases,
                           'a_venir': [{'type_plat': t.type_plat_id, 'montant': float(t.montant),
                                        'date_debut': fact._jour(t.date_debut).isoformat()} for t in futurs]})
        return Response({'date': d.isoformat(), 'types': [{'id': t.id, 'libelle': t.libelle} for t in types],
                         'lignes': lignes})

    def post(self, request):
        d = request.data
        modele, champ, proprio_modele, _ = _cible(d.get('cible'))
        try:
            proprio = proprio_modele.objects.get(pk=int(d.get('proprietaire')))
        except (TypeError, ValueError, proprio_modele.DoesNotExist):
            raise ValidationError({'proprietaire': "Introuvable."})
        type_plat = None
        if d.get('type_plat') not in (None, '', 'tous'):
            try:
                type_plat = TypePlat.objects.get(pk=int(d.get('type_plat')))
            except (TypeError, ValueError, TypePlat.DoesNotExist):
                raise ValidationError({'type_plat': "Type de plat introuvable."})
        try:
            montant = Decimal(str(d.get('montant')).replace(' ', '').replace(',', '.'))
        except (InvalidOperation, TypeError):
            raise ValidationError({'montant': "Montant invalide."})
        if montant < 0:
            raise ValidationError({'montant': "Le montant ne peut pas être négatif."})
        debut = _date(d.get('date_debut'))
        tz = timezone.get_current_timezone()
        debut_dt = timezone.make_aware(datetime.combine(debut, time.min), tz)
        with transaction.atomic():
            meme_case = modele.objects.select_for_update().filter(**{champ: proprio}, type_plat=type_plat)
            if meme_case.filter(date_debut__date=debut).exists():
                raise ValidationError({'date_debut': "Un tarif commence déjà à cette date pour cette case."})
            en_vigueur = fact.ligne_active(list(meme_case), debut)
            if en_vigueur is not None:
                if fact._jour(en_vigueur.date_debut) >= debut:
                    raise ValidationError({'date_debut': "La date de début doit être après le début du tarif en vigueur "
                                                         f"({fact._jour(en_vigueur.date_debut):%d/%m/%Y})."})
                en_vigueur.date_fin = timezone.make_aware(datetime.combine(debut - timedelta(days=1), time.min), tz)
                en_vigueur.user_updated = request.user
                en_vigueur.save(update_fields=['date_fin', 'user_updated', 'updated_at'])
            suivant = (meme_case.filter(date_debut__gt=debut_dt).order_by('date_debut').first())
            fin = None
            if suivant is not None:
                fin = timezone.make_aware(datetime.combine(fact._jour(suivant.date_debut) - timedelta(days=1), time.min), tz)
            statut = Statut.objects.filter(libelle_statut__iexact='Actif').first() or Statut.objects.first()
            nouveau = modele.objects.create(**{champ: proprio}, type_plat=type_plat, montant=montant,
                                            date_debut=debut_dt, date_fin=fin, statut=statut,
                                            user_created=request.user, user_updated=request.user)
        return Response({'tarif_id': nouveau.id, 'case': _case(nouveau),
                         'ancien_cloture_le': (debut - timedelta(days=1)).isoformat() if en_vigueur else None},
                        status=201)
