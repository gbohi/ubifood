from django.db import migrations
from django.db.models import F

ROLES = ['caissier', 'comptabilite']


def creer_roles(apps, schema_editor):
    """Rôles de la caisse : caissier (encaissements) et comptabilité (contrôle)."""
    Group = apps.get_model('auth', 'Group')
    for nom in ROLES:
        Group.objects.get_or_create(name=nom)


def reprendre_clotures(apps, schema_editor):
    """
    Mois clôturés avant le compte repas : tous les repas étaient retenus sur
    salaire (retenue = montant facturé).
    """
    ClotureMensuelle = apps.get_model('api', 'ClotureMensuelle')
    FactureMensuelle = apps.get_model('api', 'FactureMensuelle')
    ClotureMensuelle.objects.update(nb_repas_retenue=F('nb_repas'), montant_retenue=F('montant_total'))
    FactureMensuelle.objects.update(nb_repas_retenue=F('nb_repas'), montant_retenue=F('montant_total'))


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0037_compte_repas_caisse'),
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.RunPython(creer_roles, migrations.RunPython.noop),
        migrations.RunPython(reprendre_clotures, migrations.RunPython.noop),
    ]
