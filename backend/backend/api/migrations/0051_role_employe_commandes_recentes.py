"""
Rôle « Employé » désormais obligatoire pour commander : les comptes qui ont
commandé ces 3 derniers mois sans avoir ce rôle (gestionnaires,
administrateurs, caissiers…) le reçoivent, pour ne pas perdre l'accès.
Les autres sont listés par : python manage.py rapport_role_employe
"""
from datetime import timedelta

from django.db import migrations
from django.utils import timezone

PRESTATAIRES = ('prestataire', 'agent_comptoir')


def ajouter_role(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    User = apps.get_model('api', 'User')
    Commande = apps.get_model('api', 'Commande')
    employe, _ = Group.objects.get_or_create(name='employe')
    depuis = timezone.now() - timedelta(days=90)
    ids = set(Commande.objects.filter(date_commande__gte=depuis).values_list('user_id', flat=True))
    for u in (User.objects.filter(id__in=ids).exclude(groups__name='employe')
              .exclude(groups__name__in=PRESTATAIRES)):
        u.groups.add(employe)


class Migration(migrations.Migration):
    dependencies = [('api', '0050_anomalies_verifiees'), ('auth', '0012_alter_user_first_name_max_length')]
    operations = [migrations.RunPython(ajouter_role, migrations.RunPython.noop)]
