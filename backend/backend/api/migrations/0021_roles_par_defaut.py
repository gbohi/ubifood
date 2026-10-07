from django.db import migrations

ROLES = ['super_admin', 'admin', 'gestionnaire', 'employe']


def creer_roles(apps, schema_editor):
    """Crée les 4 rôles de l'application s'ils n'existent pas (sans toucher aux existants)."""
    Group = apps.get_model('auth', 'Group')
    for nom in ROLES:
        Group.objects.get_or_create(name=nom)


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0020_platimage_formats_image'),
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.RunPython(creer_roles, migrations.RunPython.noop),
    ]
