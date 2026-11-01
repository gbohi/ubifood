from django.db import migrations

ROLES = ['prestataire', 'agent_comptoir']


def creer_roles(apps, schema_editor):
    """Rôles de l'espace prestataire : responsable (« prestataire ») et agent de comptoir."""
    Group = apps.get_model('auth', 'Group')
    for nom in ROLES:
        Group.objects.get_or_create(name=nom)


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0034_espace_prestataire'),
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.RunPython(creer_roles, migrations.RunPython.noop),
    ]
